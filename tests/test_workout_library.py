"""
Backend tests for the public workout library: criteria matching and
reuse-before-generate in the Tabata / Spin generate endpoints.

Runs against the in-memory library store (fixtures) with a stubbed user, and
with GEMINI_API_KEY unset — so any request that falls through to generation
returns 503, which is how these tests tell "reused" from "generated".

    python tests/test_workout_library.py      (also collectable by pytest)
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("LIBRARY_REUSE_MIN_POOL", None)

import asyncio  # noqa: E402

import httpx  # noqa: E402

from backend.main import app  # noqa: E402
from backend.middleware.auth import get_current_user  # noqa: E402
from backend.services import workout_library_service as wls  # noqa: E402

TABATA_REQ = {"protocol": "20/10", "focus_areas": ["full_body"], "sets": 3,
              "rounds_per_set": 8, "exercise_variety": "mixed"}
SPIN_REQ = {"duration_minutes": 30, "difficulty": "moderate"}


class _Client:
    """Minimal sync wrapper around httpx's ASGI transport (no network)."""

    def _send(self, method, path, json=None):
        async def go():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.request(method, path, json=json)
        return asyncio.run(go())

    def post(self, path, json):
        return self._send("POST", path, json)

    def get(self, path):
        return self._send("GET", path)


def _client(email="rider@example.com", uid="user-1"):
    wls.workout_library_service._store = wls._MemoryStore()  # fresh fixtures + history
    wls.workout_library_service._invalidate()
    app.dependency_overrides[get_current_user] = lambda: {"uid": uid, "email": email}
    return _Client()


def test_criteria_match():
    have = {"protocol": "20/10", "focus_areas": ["full_body"], "sets": 3, "rounds_per_set": 8,
            "exercise_variety": "mixed"}
    assert wls.criteria_match("tabata", dict(have), have)
    assert not wls.criteria_match("tabata", {**have, "sets": 4}, have)
    assert not wls.criteria_match("tabata", {**have, "focus_areas": ["full_body", "core"]}, have)
    spin = {"duration_minutes": 30, "difficulty": "moderate", "include_all_outs": None}
    assert wls.criteria_match("spin", {"duration_minutes": 32, "difficulty": "moderate",
                                       "include_all_outs": True}, spin)
    assert not wls.criteria_match("spin", {"duration_minutes": 35, "difficulty": "moderate"}, spin)
    assert not wls.criteria_match("spin", {"duration_minutes": 30, "difficulty": "hard"}, spin)


def test_tabata_reuses_unseen_match_then_generates_when_pool_too_small():
    client = _client()
    first = client.post("/api/v3/tabata-kettlebell/generate", json=TABATA_REQ)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["library"]["url"].startswith("/tabata-workouts/")
    assert body["focus_areas"] == ["full_body"] and body["segments"]
    served = wls.workout_library_service.get(body["library"]["id"])
    assert served["times_served"] == 1

    # That one is now in the user's history → only 2 unseen matches < pool of 3 → generate.
    second = client.post("/api/v3/tabata-kettlebell/generate", json=TABATA_REQ)
    assert second.status_code == 503


def test_tabata_never_reuses_for_fresh_notes_custom_lists_or_admin():
    for extra in ({"fresh": True}, {"notes": "bad knee"}, {"include_exercises": ["KB Swing"]}):
        client = _client()
        res = client.post("/api/v3/tabata-kettlebell/generate", json={**TABATA_REQ, **extra})
        assert res.status_code == 503, extra
    admin = _client(email="tbattista@gmail.com", uid="admin")
    assert admin.post("/api/v3/tabata-kettlebell/generate", json=TABATA_REQ).status_code == 503


def test_tabata_no_match_generates():
    client = _client()
    res = client.post("/api/v3/tabata-kettlebell/generate", json={**TABATA_REQ, "focus_areas": ["chest"]})
    assert res.status_code == 503


def test_spin_reuse_respects_pool_size():
    client = _client()
    assert client.post("/api/v3/spin-ride/generate", json=SPIN_REQ).status_code == 503  # 1 match < 3
    os.environ["LIBRARY_REUSE_MIN_POOL"] = "1"
    try:
        res = client.post("/api/v3/spin-ride/generate", json=SPIN_REQ)
        assert res.status_code == 200, res.text
        assert res.json()["library"]["url"] == "/spin-workouts/30-minute-rolling-hills-ride"
    finally:
        os.environ.pop("LIBRARY_REUSE_MIN_POOL", None)


def test_admin_generation_publishes_to_library():
    _client()
    plan = wls.workout_library_service.get("fixture-spin-4")["plan"]
    from backend.api.workout_library import publish_admin_generation
    publish_admin_generation("spin", {**plan, "title": "Brand New Ride"},
                             {"duration_minutes": 30, "difficulty": "moderate", "include_all_outs": False},
                             "tbattista@gmail.com")
    entry = wls.workout_library_service.get_by_slug("spin", "brand-new-ride")
    assert entry and entry["status"] == "published" and entry["source"] == "admin_generated"
    # Same title again gets a unique slug
    publish_admin_generation("spin", {**plan, "title": "Brand New Ride"}, {}, "tbattista@gmail.com")
    assert wls.workout_library_service.get_by_slug("spin", "brand-new-ride-2")


# ── Bulk fill ──


class _FakeTabata:
    def __init__(self):
        self.calls = 0

    def generate(self, protocol, focus_areas, sets, rounds_per_set, **_):
        from backend.services.workout_library_fixtures import _tabata_plan
        self.calls += 1
        if self.calls == 2:
            raise ValueError("model returned junk")  # one failure is counted, not fatal
        return _tabata_plan(f"Seeded {focus_areas[0]} Tabata {self.calls}",
                            ["KB Swing", "Goblet Squat"], focus_areas, sets=sets,
                            rounds=rounds_per_set, protocol=protocol)


class _FakeSpin:
    def __init__(self):
        self.calls = 0

    def generate(self, duration_minutes, include_all_outs=False, difficulty=None, notes=None):
        from backend.services.workout_library_fixtures import _spin_plan
        self.calls += 1
        return _spin_plan(f"Seeded {difficulty} Ride", duration_minutes, difficulty, [
            ("Warm Up", "warmup", 300, 3, 80, 90, "Easy"),
            ("Climb", "climb", duration_minutes * 60 - 300, 6, 65, 75, "Grind"),
        ])


def test_seed_requests_cover_every_category():
    import random
    from backend.services import library_seeder as ls
    rng = random.Random(7)
    for _ in range(50):
        assert 10 <= ls.random_count(rng) <= 30
    focus = {r["focus_areas"][0] for r in ls.tabata_requests(14, rng)}
    assert focus == set(ls.TABATA_FOCUS)
    spin = ls.spin_requests(16, rng)
    assert {r["difficulty"] for r in spin} == set(ls.SPIN_DIFFICULTY)
    assert {r["duration_minutes"] for r in spin} == set(ls.SPIN_DURATIONS)


def test_run_seed_publishes_batch_with_unique_slugs():
    import random
    from backend.services import library_seeder as ls
    _client()
    before = len(wls.workout_library_service.list_published())
    job = ls.run_seed(ls.SeedJob(6, 5), "tbattista@gmail.com", random.Random(1),
                      generators={"tabata": _FakeTabata(), "spin": _FakeSpin()},
                      seo_writer=wls.fallback_seo)
    snap = job.snapshot()
    assert not snap["running"] and snap["done"] == 11 and snap["failed"] == 1
    published = wls.workout_library_service.list_published()
    assert len(published) == before + 10
    seeded = [e for e in published if e["created_by"] == "tbattista@gmail.com"]
    assert len({(e["type"], e["slug"]) for e in seeded}) == 10  # same titles → -2, -3 … slugs
    assert any(e["slug"].endswith("-2") for e in seeded if e["type"] == "spin")


def test_seed_endpoint_is_admin_only_and_needs_ai():
    client = _client()
    assert client.post("/api/v3/library/admin/seed", json={}).status_code == 403
    admin = _client(email="tbattista@gmail.com", uid="admin")
    res = admin.post("/api/v3/library/admin/seed", json={})
    assert res.status_code == 503 and "GEMINI_API_KEY" in res.json()["detail"]
    assert admin.get("/api/v3/library/admin/seed").json()["running"] is False


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"✓ {t.__name__}")
    app.dependency_overrides.clear()
    print(f"\n{len(tests)} passed")
