"""
Library Seeder — bulk-generate Tabata workouts and Spin rides into the public
library (used to fill the library at launch).

Requests are spread across every hub category (each Tabata focus area, each
Spin difficulty) and a range of lengths, so the pages fill evenly instead of
clustering. Each workout gets AI-written SEO copy like any admin generation.

Runs in a background thread when started from /library-admin (the server has
the Gemini + Firebase keys), or synchronously from
backend/scripts/seed_library.py.
"""

from __future__ import annotations

import logging
import random
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from .workout_library_service import workout_library_service

logger = logging.getLogger(__name__)

MIN_COUNT, MAX_COUNT = 10, 30
WORKERS = 3

TABATA_FOCUS = ["full_body", "lower_body", "upper_body", "core", "conditioning", "chest", "back"]
TABATA_VARIETY = ["mixed", "alternating", "all_different", "same"]
SPIN_DIFFICULTY = ["easy", "moderate", "hard", "intense"]
SPIN_DURATIONS = [20, 30, 45, 60]


def random_count(rng: random.Random) -> int:
    return rng.randint(MIN_COUNT, MAX_COUNT)


def tabata_requests(n: int, rng: random.Random) -> List[Dict[str, Any]]:
    out = []
    for i in range(n):
        protocol = "20/10" if rng.random() < 0.7 else "40/20"
        out.append({
            "protocol": protocol,
            "focus_areas": [TABATA_FOCUS[i % len(TABATA_FOCUS)]],
            # 40/20 rounds are twice as long, so keep those workouts shorter
            "sets": rng.choice([2, 3, 4, 5, 6] if protocol == "20/10" else [2, 3, 4]),
            "rounds_per_set": 8 if protocol == "20/10" else rng.choice([6, 8]),
            "exercise_variety": rng.choice(TABATA_VARIETY),
        })
    rng.shuffle(out)
    return out


def spin_requests(n: int, rng: random.Random) -> List[Dict[str, Any]]:
    out = []
    for i in range(n):
        out.append({
            "duration_minutes": SPIN_DURATIONS[(i // len(SPIN_DIFFICULTY)) % len(SPIN_DURATIONS)],
            "difficulty": SPIN_DIFFICULTY[i % len(SPIN_DIFFICULTY)],
            "include_all_outs": rng.random() < 0.3,
        })
    rng.shuffle(out)
    return out


def _default_generators() -> Dict[str, Any]:
    from .spin_ride_generator import get_spin_ride_generator
    from .tabata_kettlebell_generator import get_tabata_kettlebell_generator
    return {"tabata": get_tabata_kettlebell_generator(), "spin": get_spin_ride_generator()}


def _default_seo_writer(workout_type: str, plan: Dict[str, Any]) -> Dict[str, Any]:
    from .library_seo_writer import write_seo
    return write_seo(workout_type, plan)


class SeedJob:
    """Progress of one seeding run (read by the admin page)."""

    def __init__(self, tabata: int, spin: int):
        self.tabata = tabata
        self.spin = spin
        self.total = tabata + spin
        self.done = 0
        self.failed = 0
        self.published: List[Dict[str, str]] = []
        self.errors: List[str] = []
        self.running = True
        self.started_at = datetime.now(timezone.utc)
        self.finished_at: Optional[datetime] = None
        self._lock = threading.Lock()

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "running": self.running,
                "tabata": self.tabata,
                "spin": self.spin,
                "total": self.total,
                "done": self.done,
                "failed": self.failed,
                "published": list(self.published[-10:]),
                "errors": list(self.errors[-5:]),
                "started_at": self.started_at.isoformat(),
                "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            }


def run_seed(
    job: SeedJob,
    email: Optional[str],
    rng: Optional[random.Random] = None,
    generators: Optional[Dict[str, Any]] = None,
    seo_writer: Callable[[str, Dict[str, Any]], Dict[str, Any]] = _default_seo_writer,
    workers: int = WORKERS,
) -> SeedJob:
    """Generate + publish everything in `job`. Blocks until finished."""
    rng = rng or random.Random()
    generators = generators or _default_generators()
    tasks = [("tabata", r) for r in tabata_requests(job.tabata, rng)] + \
            [("spin", r) for r in spin_requests(job.spin, rng)]

    def one(task):
        wtype, req = task
        try:
            if wtype == "tabata":
                plan = generators["tabata"].generate(
                    protocol=req["protocol"], focus_areas=req["focus_areas"], sets=req["sets"],
                    rounds_per_set=req["rounds_per_set"], include_exercises=[], exclude_exercises=[],
                    exercise_variety=req["exercise_variety"], notes="")
                criteria = {**req, "focus_areas": sorted(req["focus_areas"])}
            else:
                plan = generators["spin"].generate(
                    req["duration_minutes"], include_all_outs=req["include_all_outs"],
                    difficulty=req["difficulty"], notes="")
                criteria = dict(req)
            entry = workout_library_service.publish(
                wtype, plan, criteria, "seed", seo=seo_writer(wtype, plan), created_by=email)
            with job._lock:
                job.done += 1
                if entry:
                    job.published.append({"type": wtype, "title": entry["seo"]["title"],
                                          "slug": entry["slug"]})
        except Exception as e:
            logger.warning(f"library seed: {wtype} {req} failed: {type(e).__name__}: {e}")
            with job._lock:
                job.done += 1
                job.failed += 1
                job.errors.append(f"{wtype}: {type(e).__name__}: {str(e)[:120]}")

    try:
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            list(pool.map(one, tasks))
    finally:
        with job._lock:
            job.running = False
            job.finished_at = datetime.now(timezone.utc)
        logger.info(f"library seed finished: {job.done - job.failed} published, {job.failed} failed")
    return job


# ── Background job (one at a time) ───────────────────────────────────────

_current: Optional[SeedJob] = None
_current_lock = threading.Lock()


def current_job() -> Optional[SeedJob]:
    return _current


def start_background_seed(tabata: Optional[int], spin: Optional[int], email: Optional[str]) -> SeedJob:
    """Start a seeding run in a daemon thread. Raises RuntimeError if one is running."""
    global _current
    with _current_lock:
        if _current and _current.running:
            raise RuntimeError("A library fill is already running")
        rng = random.Random()
        job = SeedJob(tabata if tabata is not None else random_count(rng),
                      spin if spin is not None else random_count(rng))
        _current = job
    threading.Thread(target=run_seed, args=(job, email, rng), daemon=True,
                     name="library-seed").start()
    return job
