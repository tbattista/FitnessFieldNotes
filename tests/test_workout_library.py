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

    def post(self, path, json):
        async def go():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.post(path, json=json)
        return asyncio.run(go())


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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"✓ {t.__name__}")
    app.dependency_overrides.clear()
    print(f"\n{len(tests)} passed")
