"""
Workout Library Service — public, SEO-indexable Tabata + Spin workouts.

Library entries live in the top-level Firestore collection `library_workouts`:

    type        "tabata" | "spin"
    slug        URL slug, unique per type (permanent once indexed)
    status      "published" | "hidden"
    plan        TabataKettlebellPlan / SpinRidePlan dict (unchanged shape)
    criteria    what the workout was generated for — used to reuse it instead
                of calling the AI for a matching request
    seo         title, summary, intro, category, tags
    source      "admin_generated" | "backfill" | "seed"
    created_at, updated_at, times_served, times_completed

Per-user history (which library workouts a user was served / finished) lives in
`users/{uid}/library_history/{libraryId}` so reuse never repeats a workout.

When Firestore is unavailable outside production (local dev, Playwright), an
in-memory store seeded with a few fixture workouts is used instead, so the
pages and players can be exercised without credentials.
"""

from __future__ import annotations

import logging
import os
import random
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from .firebase_service import firebase_service

logger = logging.getLogger(__name__)

COLLECTION = "library_workouts"
HISTORY_SUBCOLLECTION = "library_history"
LIST_CACHE_TTL_SECONDS = 300
WORKOUT_TYPES = ("tabata", "spin")

DEFAULT_ADMIN_EMAILS = "tbattista@gmail.com"

# Reuse kicks in only once at least this many unseen matches exist, so early
# on users still get fresh generations instead of the same few workouts.
DEFAULT_REUSE_MIN_POOL = 3
SPIN_DURATION_TOLERANCE_MINUTES = 2


# ── Helpers ───────────────────────────────────────────────────────────────


def admin_emails() -> List[str]:
    raw = os.getenv("LIBRARY_ADMIN_EMAILS", DEFAULT_ADMIN_EMAILS)
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def is_admin_email(email: Optional[str]) -> bool:
    return bool(email) and email.lower() in admin_emails()


def reuse_min_pool() -> int:
    try:
        return max(1, int(os.getenv("LIBRARY_REUSE_MIN_POOL", DEFAULT_REUSE_MIN_POOL)))
    except ValueError:
        return DEFAULT_REUSE_MIN_POOL


def _is_production() -> bool:
    return (os.getenv("RAILWAY_ENVIRONMENT") == "production"
            or os.getenv("ENVIRONMENT") == "production")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def slugify(text: str, max_len: int = 70) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    if len(slug) > max_len:
        slug = slug[:max_len].rsplit("-", 1)[0]
    return slug or "workout"


def plan_minutes(plan: Dict[str, Any]) -> int:
    return max(1, round((plan.get("total_seconds") or 0) / 60))


FOCUS_LABELS = {
    "full_body": "Full Body",
    "upper_body": "Upper Body",
    "lower_body": "Lower Body",
    "chest": "Chest",
    "back": "Back",
    "core": "Core",
    "conditioning": "Conditioning",
}

DIFFICULTY_LABELS = {
    "easy": "Easy",
    "moderate": "Moderate",
    "hard": "Hard",
    "intense": "Intense",
}


def default_category(workout_type: str, plan: Dict[str, Any]) -> str:
    """Primary category shown on the hubs (Tabata: focus; Spin: difficulty)."""
    if workout_type == "tabata":
        focus = plan.get("focus_areas") or ["full_body"]
        return FOCUS_LABELS.get(focus[0], "Full Body") if len(focus) == 1 else "Mixed Focus"
    return DIFFICULTY_LABELS.get(plan.get("difficulty") or "moderate", "Moderate")


def length_bucket(minutes: int) -> str:
    if minutes <= 12:
        return "Under 15 min"
    if minutes <= 25:
        return "15–25 min"
    if minutes <= 40:
        return "25–40 min"
    return "40+ min"


def criteria_from_tabata_request(req: Any) -> Dict[str, Any]:
    return {
        "protocol": req.protocol,
        "focus_areas": sorted(set(req.focus_areas)),
        "sets": req.sets,
        "rounds_per_set": req.rounds_per_set,
        "exercise_variety": req.exercise_variety,
    }


def criteria_from_spin_request(req: Any) -> Dict[str, Any]:
    return {
        "duration_minutes": req.duration_minutes,
        "difficulty": req.difficulty or "moderate",
        "include_all_outs": bool(req.include_all_outs),
    }


def criteria_from_plan(workout_type: str, plan: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort criteria for workouts whose original request is unknown (backfill)."""
    if workout_type == "tabata":
        return {
            "protocol": plan.get("protocol"),
            "focus_areas": sorted(set(plan.get("focus_areas") or [])),
            "sets": plan.get("sets"),
            "rounds_per_set": plan.get("rounds_per_set"),
            "exercise_variety": plan.get("exercise_variety") or "mixed",
        }
    return {
        "duration_minutes": plan.get("duration_minutes"),
        "difficulty": plan.get("difficulty") or "moderate",
        "include_all_outs": None,  # unknown → matches either
    }


def criteria_match(workout_type: str, wanted: Dict[str, Any], have: Dict[str, Any]) -> bool:
    """Does a library workout generated for `have` satisfy a request for `wanted`?"""
    if not have:
        return False
    if workout_type == "tabata":
        return (
            have.get("protocol") == wanted.get("protocol")
            and sorted(have.get("focus_areas") or []) == sorted(wanted.get("focus_areas") or [])
            and have.get("sets") == wanted.get("sets")
            and have.get("rounds_per_set") == wanted.get("rounds_per_set")
            and (have.get("exercise_variety") or "mixed") == (wanted.get("exercise_variety") or "mixed")
        )
    try:
        duration_ok = abs(int(have.get("duration_minutes")) - int(wanted.get("duration_minutes"))) \
            <= SPIN_DURATION_TOLERANCE_MINUTES
    except (TypeError, ValueError):
        return False
    all_outs = have.get("include_all_outs")
    return (
        duration_ok
        and (have.get("difficulty") or "moderate") == (wanted.get("difficulty") or "moderate")
        and (all_outs is None or bool(all_outs) == bool(wanted.get("include_all_outs")))
    )


def pick_reuse_candidate(
    workout_type: str,
    wanted: Dict[str, Any],
    entries: Iterable[Dict[str, Any]],
    exclude_ids: Iterable[str],
    min_pool: int,
    rng: Optional[random.Random] = None,
) -> Optional[Dict[str, Any]]:
    """Random published, unseen, matching entry — or None if the pool is too small."""
    excluded = set(exclude_ids)
    pool = [
        e for e in entries
        if e.get("type") == workout_type
        and e.get("status") == "published"
        and e.get("id") not in excluded
        and criteria_match(workout_type, wanted, e.get("criteria") or {})
    ]
    if len(pool) < min_pool:
        return None
    return (rng or random).choice(pool)


# ── SEO text (fallback when the AI writer is unavailable) ────────────────


def tabata_exercises(plan: Dict[str, Any]) -> List[str]:
    seen: List[str] = []
    for seg in plan.get("segments") or []:
        if seg.get("segment_type") == "work":
            name = seg.get("exercise") or seg.get("name")
            if name and name not in seen:
                seen.append(name)
    return seen


def fallback_seo(workout_type: str, plan: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic, workout-specific SEO copy built from the plan itself."""
    minutes = plan_minutes(plan)
    title = (plan.get("title") or "Workout").strip()
    category = default_category(workout_type, plan)
    if workout_type == "tabata":
        moves = tabata_exercises(plan)
        protocol = plan.get("protocol") or "20/10"
        work, rest = protocol.split("/")
        focus = ", ".join(FOCUS_LABELS.get(f, f) for f in plan.get("focus_areas") or []).lower() or "full body"
        move_text = ", ".join(moves[:4]) + (" and more" if len(moves) > 4 else "")
        summary = (f"{title}: a {minutes}-minute {protocol} kettlebell Tabata for {focus}. "
                   f"{plan.get('sets')} sets × {plan.get('rounds_per_set')} rounds with {move_text}. "
                   "Free timer and printable sheet.")
        intro = [
            f"{title} is a {minutes}-minute kettlebell Tabata built around {focus}. "
            f"Each round is {work} seconds of work followed by {rest} seconds of rest, "
            f"repeated for {plan.get('rounds_per_set')} rounds per set across {plan.get('sets')} sets.",
            f"The movements are {move_text}. Pick a bell you can move with clean form for the full "
            f"{work} seconds. If your reps slow down a lot by the last round, go lighter next time.",
            "Run it with the built-in interval timer, or print the sheet and take it to the gym.",
        ]
        tags = ["kettlebell", "tabata", "hiit", protocol] + list(plan.get("focus_areas") or [])
    else:
        difficulty = DIFFICULTY_LABELS.get(plan.get("difficulty") or "moderate", "Moderate").lower()
        segments = plan.get("segments") or []
        peak = max((s.get("resistance") or 0 for s in segments), default=0)
        summary = (f"{title}: a {minutes}-minute {difficulty} indoor cycling workout with "
                   f"{len(segments)} intervals, target resistance and RPM for every block. "
                   "Free ride timer and printable sheet.")
        intro = [
            f"{title} is a {minutes}-minute {difficulty} spin workout made up of {len(segments)} intervals. "
            f"Every block gives you a resistance level (1–10) and a cadence range, peaking at resistance {peak}.",
            "Use the resistance numbers as a guide: 1 is an easy spin with no load and 10 is the heaviest "
            "climb you can still turn over. Adjust to your bike.",
            "Ride it with the built-in interval timer, or print the sheet and clip it to the handlebars.",
        ]
        tags = ["spin", "indoor cycling", difficulty]
    return {
        "title": title,
        "summary": summary[:300],
        "intro": intro,
        "category": category,
        "tags": tags,
    }


# ── Stores ────────────────────────────────────────────────────────────────


class _FirestoreStore:
    def __init__(self, db):
        self.db = db

    def all(self) -> List[Dict[str, Any]]:
        out = []
        for doc in self.db.collection(COLLECTION).stream():
            data = doc.to_dict() or {}
            data["id"] = doc.id
            out.append(data)
        return out

    def get(self, entry_id: str) -> Optional[Dict[str, Any]]:
        doc = self.db.collection(COLLECTION).document(entry_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = doc.id
        return data

    def put(self, entry: Dict[str, Any]) -> None:
        data = {k: v for k, v in entry.items() if k != "id"}
        self.db.collection(COLLECTION).document(entry["id"]).set(data)

    def update(self, entry_id: str, fields: Dict[str, Any]) -> None:
        self.db.collection(COLLECTION).document(entry_id).update(fields)

    def increment(self, entry_id: str, field: str) -> None:
        try:
            from firebase_admin import firestore
            self.db.collection(COLLECTION).document(entry_id).update(
                {field: firestore.Increment(1)})
        except Exception as e:
            logger.warning(f"library: increment {field} failed for {entry_id}: {e}")

    def history_ids(self, user_id: str) -> List[str]:
        col = self.db.collection("users").document(user_id).collection(HISTORY_SUBCOLLECTION)
        return [d.id for d in col.stream()]

    def record_history(self, user_id: str, entry_id: str, event: str) -> None:
        ref = (self.db.collection("users").document(user_id)
               .collection(HISTORY_SUBCOLLECTION).document(entry_id))
        ref.set({f"{event}_at": _now(), "library_id": entry_id}, merge=True)


class _MemoryStore:
    """Local dev / test store. Seeded with fixtures so pages have content."""

    def __init__(self):
        self.entries: Dict[str, Dict[str, Any]] = {}
        self.history: Dict[str, Dict[str, Dict[str, Any]]] = {}
        try:
            from .workout_library_fixtures import build_fixture_entries
            for entry in build_fixture_entries():
                self.entries[entry["id"]] = entry
        except Exception as e:
            logger.warning(f"library: could not load dev fixtures: {e}")

    def all(self) -> List[Dict[str, Any]]:
        return [dict(e) for e in self.entries.values()]

    def get(self, entry_id: str) -> Optional[Dict[str, Any]]:
        e = self.entries.get(entry_id)
        return dict(e) if e else None

    def put(self, entry: Dict[str, Any]) -> None:
        self.entries[entry["id"]] = dict(entry)

    def update(self, entry_id: str, fields: Dict[str, Any]) -> None:
        if entry_id in self.entries:
            for key, value in fields.items():
                if "." in key:  # Firestore-style dotted path, e.g. "seo.title"
                    head, tail = key.split(".", 1)
                    self.entries[entry_id].setdefault(head, {})[tail] = value
                else:
                    self.entries[entry_id][key] = value

    def increment(self, entry_id: str, field: str) -> None:
        if entry_id in self.entries:
            self.entries[entry_id][field] = (self.entries[entry_id].get(field) or 0) + 1

    def history_ids(self, user_id: str) -> List[str]:
        return list(self.history.get(user_id, {}).keys())

    def record_history(self, user_id: str, entry_id: str, event: str) -> None:
        self.history.setdefault(user_id, {}).setdefault(entry_id, {})[f"{event}_at"] = _now()


# ── Service ───────────────────────────────────────────────────────────────


class WorkoutLibraryService:
    def __init__(self):
        self._store = None
        self._list_cache: Optional[List[Dict[str, Any]]] = None
        self._list_cache_at = 0.0
        # Serializes slug allocation when several publishes run at once (bulk fill).
        self._publish_lock = threading.Lock()

    def _get_store(self):
        if self._store is None:
            if firebase_service.is_available():
                self._store = _FirestoreStore(firebase_service.get_firestore())
            elif not _is_production():
                logger.info("library: Firestore unavailable — using in-memory dev store")
                self._store = _MemoryStore()
        return self._store

    def is_available(self) -> bool:
        return self._get_store() is not None

    def _invalidate(self) -> None:
        self._list_cache = None

    def all_entries(self) -> List[Dict[str, Any]]:
        """Every entry (any status), cached briefly — the library is small and read-heavy."""
        store = self._get_store()
        if store is None:
            return []
        now = time.time()
        if self._list_cache is not None and now - self._list_cache_at < LIST_CACHE_TTL_SECONDS:
            return self._list_cache
        try:
            entries = store.all()
        except Exception as e:
            logger.error(f"library: list failed: {e}")
            return self._list_cache or []
        entries.sort(key=lambda e: e.get("created_at") or _now(), reverse=True)
        self._list_cache = entries
        self._list_cache_at = now
        return entries

    def list_published(self, workout_type: Optional[str] = None) -> List[Dict[str, Any]]:
        return [
            e for e in self.all_entries()
            if e.get("status") == "published" and (workout_type is None or e.get("type") == workout_type)
        ]

    def get(self, entry_id: str) -> Optional[Dict[str, Any]]:
        store = self._get_store()
        if store is None:
            return None
        try:
            return store.get(entry_id)
        except Exception as e:
            logger.error(f"library: get {entry_id} failed: {e}")
            return None

    def get_by_slug(self, workout_type: str, slug: str) -> Optional[Dict[str, Any]]:
        for e in self.all_entries():
            if e.get("type") == workout_type and e.get("slug") == slug:
                return e
        return None

    def _unique_slug(self, workout_type: str, base: str) -> str:
        taken = {e.get("slug") for e in self.all_entries() if e.get("type") == workout_type}
        slug, n = base, 2
        while slug in taken:
            slug = f"{base}-{n}"
            n += 1
        return slug

    def publish(
        self,
        workout_type: str,
        plan: Dict[str, Any],
        criteria: Dict[str, Any],
        source: str,
        seo: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Add a workout to the public library. Returns the stored entry."""
        if workout_type not in WORKOUT_TYPES:
            raise ValueError(f"Unknown workout type: {workout_type}")
        store = self._get_store()
        if store is None:
            logger.warning("library: store unavailable — not publishing")
            return None
        seo = {**fallback_seo(workout_type, plan), **(seo or {})}
        with self._publish_lock:
            self._invalidate()
            slug = self._unique_slug(workout_type, slugify(seo.get("slug") or seo["title"]))
            seo.pop("slug", None)
            now = _now()
            entry = {
                "id": f"{workout_type}-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}",
                "type": workout_type,
                "slug": slug,
                "status": "published",
                "plan": plan,
                "criteria": criteria,
                "seo": seo,
                "source": source,
                "created_by": created_by,
                "created_at": now,
                "updated_at": now,
                "times_served": 0,
                "times_completed": 0,
            }
            store.put(entry)
            self._invalidate()
        logger.info(f"library: published {workout_type} '{seo['title']}' as /{slug} ({source})")
        return entry

    def update(self, entry_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Admin edits: status and SEO text (slug stays fixed — it may be indexed)."""
        store = self._get_store()
        if store is None or store.get(entry_id) is None:
            return None
        allowed: Dict[str, Any] = {"updated_at": _now()}
        if fields.get("status") in ("published", "hidden"):
            allowed["status"] = fields["status"]
        for key in ("title", "summary", "intro", "category"):
            if fields.get(key) is not None:
                allowed[f"seo.{key}"] = fields[key]
        store.update(entry_id, allowed)
        self._invalidate()
        return store.get(entry_id)

    # ── Reuse + history ──

    def history_ids(self, user_id: str) -> List[str]:
        store = self._get_store()
        if store is None or not user_id:
            return []
        try:
            return store.history_ids(user_id)
        except Exception as e:
            logger.warning(f"library: history read failed for {user_id}: {e}")
            return []

    def record_event(self, entry_id: str, event: str, user_id: Optional[str] = None) -> None:
        """event: 'served' (handed out instead of generating) or 'completed'."""
        store = self._get_store()
        if store is None:
            return
        store.increment(entry_id, f"times_{event}")
        if user_id:
            try:
                store.record_history(user_id, entry_id, event)
            except Exception as e:
                logger.warning(f"library: history write failed for {user_id}: {e}")

    def find_reuse(self, workout_type: str, criteria: Dict[str, Any], user_id: str) -> Optional[Dict[str, Any]]:
        return pick_reuse_candidate(
            workout_type,
            criteria,
            self.list_published(workout_type),
            self.history_ids(user_id),
            reuse_min_pool(),
        )


workout_library_service = WorkoutLibraryService()


# ── URLs ──────────────────────────────────────────────────────────────────


def site_base_url() -> str:
    """Canonical origin for library pages + sitemap (SITE_URL > Railway domain > default)."""
    base = os.getenv("SITE_URL") or os.getenv("RAILWAY_PUBLIC_DOMAIN") or "fitnessfieldnotes.com"
    base = base.rstrip("/")
    return base if base.startswith("http") else f"https://{base}"


def type_hub_path(workout_type: str) -> str:
    return f"/{workout_type}-workouts"


def entry_path(entry: Dict[str, Any]) -> str:
    return f"{type_hub_path(entry['type'])}/{entry['slug']}"


def player_path(entry: Dict[str, Any]) -> str:
    page = "tabata-kettlebell" if entry["type"] == "tabata" else "spin-ride"
    return f"/{page}?library={entry['id']}"
