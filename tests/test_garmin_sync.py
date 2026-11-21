"""
Backend tests for Garmin Personal API sync: key encryption, the HTTP client
(against httpx.MockTransport), the Garmin list (sync lists everything; files
download on review), auto-import, dismiss, disconnect, against an in-memory
Firestore, and the owner-only gate on the API.

    python tests/test_garmin_sync.py      (also collectable by pytest)
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ["GARMIN_KEY_ENCRYPTION_SECRET"] = "test-secret-not-for-production"
os.environ.pop("GARMIN_SYNC_ALLOWED_EMAILS", None)

import httpx  # noqa: E402

from garmin_fakes import FakeFDS  # noqa: E402
from garmin_fit_builder import cardio_file, strength_file  # noqa: E402

from backend.models.garmin import GarminConnectRequest, GarminImportConfirmRequest  # noqa: E402
from backend.services.garmin import import_service, secret_box, sync_service  # noqa: E402
from backend.services.garmin import personal_api_client as pac  # noqa: E402

UID = "owner-1"
OWNER = "tbattista@gmail.com"
KEY = "test-personal-api-key-1234"
CONNECTED = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)
STRENGTH_START = datetime(2026, 11, 18, 22, 27, 26, tzinfo=timezone.utc)
RUN_START = datetime(2026, 11, 18, 21, 52, 44, tzinfo=timezone.utc)
SETS = [dict(category=28, reps=8, weight_kg=74.8125), dict(category=28, reps=9, weight_kg=74.8125),
        dict(category=8, subtype=0, reps=9, weight_kg=97.5)]


def run(coro):
    return asyncio.run(coro)


def listing(gid, start, type_key, manual=False, name=None, sets=None):
    return {"activityId": gid, "activityName": name or type_key, "manualActivity": manual,
            "activityType": {"typeKey": type_key}, "startTimeGMT": start.strftime("%Y-%m-%d %H:%M:%S"),
            "duration": 1800.0, "calories": 300.0, "averageHR": 130.0, "summarizedExerciseSets": sets or []}


class FakeClient:
    """Stands in for PersonalApiClient; records downloads."""
    activities = []
    files = {}
    downloads = []
    reject = False

    def __init__(self, key):
        self.key = key

    async def token(self, force=False):
        if FakeClient.reject:
            raise pac.GarminAuthError("Garmin rejected the API key.")
        return "tok"

    async def list_activities(self, limit=50, start=0):
        if FakeClient.reject:
            raise pac.GarminAuthError("Garmin rejected the API key.")
        FakeClient.list_calls.append(start)
        newest_first = sorted(FakeClient.activities, key=lambda a: a["startTimeGMT"], reverse=True)
        return newest_first[start:start + limit]

    async def download_original(self, gid):
        FakeClient.downloads.append(gid)
        return FakeClient.files[gid]


def setup():
    fake = FakeFDS()
    import_service.fds = fake
    sync_service.client_factory = FakeClient
    FakeClient.activities = [
        listing(1, CONNECTED - timedelta(days=2), "running"),              # older run
        listing(2, CONNECTED + timedelta(hours=1), "strength_training", manual=True),
        listing(3, RUN_START, "treadmill_running", name="Treadmill Running"),
        listing(4, STRENGTH_START, "strength_training", name="Strength",
                sets=[{"category": "SQUAT", "sets": 2, "reps": 17},
                      {"category": "DEADLIFT", "subCategory": "BARBELL_DEADLIFT", "sets": 1, "reps": 9}]),
    ]
    FakeClient.files = {3: cardio_file(RUN_START, 1831.41, 3169.22, serial=99),
                        4: strength_file(STRENGTH_START, SETS, serial=99)}
    FakeClient.downloads = []
    FakeClient.list_calls = []
    FakeClient.reject = False
    run(sync_service.connect(UID, OWNER, GarminConnectRequest(api_key=KEY, expires_in_days=90)))
    return fake


def conn_doc(fake):
    return fake._col(UID, "integrations").document("garmin").get().to_dict()


# ── secret box and client ────────────────────────────────────────────────────

def test_secret_box_round_trip():
    token = secret_box.encrypt(KEY)
    assert KEY not in token and secret_box.decrypt(token) == KEY
    os.environ["GARMIN_KEY_ENCRYPTION_SECRET"] = "a-different-secret"
    try:
        secret_box.decrypt(token)
        raise AssertionError("expected SecretBoxError")
    except secret_box.SecretBoxError:
        pass
    finally:
        os.environ["GARMIN_KEY_ENCRYPTION_SECRET"] = "test-secret-not-for-production"


def test_client_token_list_download():
    calls = []

    def handler(request: httpx.Request):
        calls.append((request.method, request.url.path, request.headers.get("authorization"),
                      request.headers.get("accept")))
        if request.headers.get("accept") == "application/json":
            return httpx.Response(406)
        if request.url.path == pac.TOKEN_PATH:
            ok = request.headers.get("authorization") == f"ApiKey {KEY}"
            return httpx.Response(200 if ok else 401, text="eyJplain.text.token")
        if request.headers.get("authorization") != "Bearer eyJplain.text.token":
            return httpx.Response(401)
        if request.url.path == pac.ACTIVITY_SEARCH_PATH:
            return httpx.Response(200, json=[{"activityId": 7}])
        if request.url.path == pac.DOWNLOAD_PATH.format(id=7):
            return httpx.Response(200, content=b"PKzip")
        return httpx.Response(404)

    pac._token_cache.clear()
    client = pac.PersonalApiClient(KEY, transport=httpx.MockTransport(handler))
    assert run(client.list_activities()) == [{"activityId": 7}]
    assert run(client.download_original(7)) == b"PKzip"
    token_calls = [c for c in calls if c[1] == pac.TOKEN_PATH]
    assert len(token_calls) == 1, "token should be cached between calls"
    assert all(c[3] == "*/*" for c in calls)

    bad = pac.PersonalApiClient("wrong-key-000000", transport=httpx.MockTransport(handler))
    try:
        run(bad.list_activities())
        raise AssertionError("expected GarminAuthError")
    except pac.GarminAuthError:
        pass


def test_activity_start_parsing():
    assert pac.activity_start({"startTimeGMT": "2026-11-18 22:27:26"}) == STRENGTH_START
    assert pac.activity_start({"beginTimestamp": int(STRENGTH_START.timestamp() * 1000)}) == STRENGTH_START


# ── connect / sync / review ──────────────────────────────────────────────────

def test_connect_stores_key_encrypted():
    fake = setup()
    doc = conn_doc(fake)
    assert doc["key_hint"] == "1234" and KEY not in str(doc)
    assert secret_box.decrypt(doc["key_encrypted"]) == KEY
    status = run(sync_service.status(UID, OWNER))
    assert status.connected and status.allowed and status.days_until_expiry in (89, 90)

    FakeClient.reject = True
    try:
        run(sync_service.connect(UID, OWNER, GarminConnectRequest(api_key="bad-key-000000")))
        raise AssertionError("expected rejection")
    except import_service.GarminImportError as e:
        assert "didn't accept" in str(e)


def pending_ids():
    return [p.id for p in run(sync_service.list_activities(UID, "review"))]


def status_of(gid):
    return next(i for i in run(sync_service.list_activities(UID)) if i.id == gid)


def test_sync_lists_everything_without_downloading():
    setup()
    result = run(sync_service.sync(UID))
    # No start date: everything Garmin has is listed, newest first. Nothing is
    # downloaded until the user opens an activity. Hand-entered ones are skipped.
    assert pending_ids() == ["4", "3", "1"]
    assert FakeClient.downloads == [] and result.imported == []
    assert (result.pending, result.pending_total, result.skipped) == (3, 3, 1)
    strength = status_of("4")
    assert strength.kind == "strength" and strength.summary == "Squat 2 sets, Barbell Deadlift 1 set"
    assert (strength.duration_minutes, strength.calories, strength.avg_heart_rate) == (30.0, 300, 130)
    log = {d.garmin_activity_id: d for d in result.details}
    assert log["2"].outcome == "skipped" and log["4"].outcome == "review"
    # The hand-entered one stays visible on the Garmin page, with why it was skipped.
    manual = status_of("2")
    assert manual.status == "skipped" and "by hand" in manual.detail

    again = run(sync_service.sync(UID))
    assert (again.pending, again.skipped) == (0, 0) and pending_ids() == ["4", "3", "1"]


def test_review_downloads_once_then_import_removes_it():
    fake = setup()
    run(sync_service.sync(UID))
    preview = run(sync_service.activity_preview(UID, "4"))
    assert preview.activity.exercises[0].garmin_key == "squat" and FakeClient.downloads == [4]
    run(sync_service.activity_preview(UID, "4"))
    assert FakeClient.downloads == [4]              # cached on the record

    saved = run(import_service.confirm(UID, GarminImportConfirmRequest(
        activity=preview.activity, action="new", exercise_mappings={"squat": "Back Squat"}, pending_id="4")))
    run(sync_service.mark_imported(UID, "4", saved))   # the API does this after a successful confirm
    assert pending_ids() == ["3", "1"]
    item = status_of("4")
    assert (item.status, item.session_id, item.session_type) == ("imported", saved.session_id, "workout")
    run(sync_service.sync(UID))
    assert pending_ids() == ["3", "1"]              # imported one doesn't come back
    assert len(fake._col(UID, "workout_sessions").stream()) == 1

    # Undo puts it back on the review list.
    run(import_service.undo(UID, saved.session_id, "workout"))
    run(sync_service.after_undo(UID, saved.session_id))
    assert status_of("4").status == "review" and status_of("4").session_id is None


def test_dismissed_activities_stay_dismissed():
    setup()
    run(sync_service.sync(UID))
    run(sync_service.set_status(UID, "1", "dismissed"))
    assert run(sync_service.dismiss_all(UID)) == 2
    assert pending_ids() == [] and status_of("1").status == "dismissed"
    FakeClient.activities.append(listing(9, STRENGTH_START + timedelta(days=1), "hiit", name="HIIT"))
    result = run(sync_service.sync(UID))
    assert pending_ids() == ["9"] and result.pending == 1   # only the genuinely new one
    run(sync_service.set_status(UID, "1", "review"))        # restore a dismissed one
    assert pending_ids() == ["9", "1"]


def test_already_imported_sessions_are_left_out():
    setup()
    # The strength session was uploaded as a file before sync was connected.
    preview = run(import_service.build_preview(UID, FakeClient.files[4]))
    run(import_service.confirm(UID, GarminImportConfirmRequest(activity=preview.activity, action="new")))
    result = run(sync_service.sync(UID))
    assert "4" not in pending_ids()
    assert {d.garmin_activity_id: d.detail for d in result.details}["4"] == "Already in your history"
    item = status_of("4")
    assert item.status == "imported" and item.session_type == "workout" and item.source == "sync"
    # The upload isn't listed twice (as an upload and as a synced record).
    assert len([i for i in run(sync_service.list_activities(UID)) if i.status == "imported"]) == 1


def test_auto_import_saves_clear_matches():
    fake = setup()
    run(import_service.save_exercise_map(UID, {"squat": "Back Squat", "deadlift/barbell_deadlift": "Deadlift"}))
    FakeClient.files[1] = cardio_file(CONNECTED - timedelta(days=2), 1500, 4000, serial=1)
    status = run(sync_service.update(UID, OWNER, auto_import=True))
    assert status.auto_import
    result = run(sync_service.sync(UID))
    assert sorted(i.garmin_activity_id for i in result.imported) == ["1", "3", "4"] and pending_ids() == []
    assert FakeClient.downloads == [1, 3, 4]        # oldest first
    sessions = [s.to_dict() for s in fake._col(UID, "workout_sessions").stream()]
    assert [e["exercise_name"] for e in sessions[0]["exercises_performed"]] == ["Back Squat", "Deadlift"]


def test_auto_import_lists_what_needs_a_decision():
    setup()
    FakeClient.files[1] = cardio_file(CONNECTED - timedelta(days=2), 1500, 4000, serial=1)
    run(sync_service.update(UID, OWNER, auto_import=True))
    result = run(sync_service.sync(UID))
    assert sorted(i.garmin_activity_id for i in result.imported) == ["1", "3"]
    items = run(sync_service.list_activities(UID, "review"))
    assert [i.id for i in items] == ["4"] and items[0].detail == "New exercise names to confirm"
    assert status_of("3").status == "imported" and status_of("3").session_type == "cardio"
    FakeClient.downloads = []
    run(sync_service.activity_preview(UID, "4"))
    assert FakeClient.downloads == []               # file already fetched during auto-import


def test_auto_import_works_in_batches_and_lists_page_back():
    fake = setup()
    early = CONNECTED - timedelta(days=40)
    for i in range(110):
        gid = 100 + i
        start = early + timedelta(hours=8 * i)
        FakeClient.activities.append(listing(gid, start, "hiit", name="HIIT"))
        FakeClient.files[gid] = cardio_file(start, 900, 0, sport="training", sub_sport="hiit", serial=gid)
    FakeClient.files[1] = cardio_file(CONNECTED - timedelta(days=2), 1500, 4000, serial=1)
    run(sync_service.update(UID, OWNER, auto_import=True))
    first = run(sync_service.sync(UID))
    assert FakeClient.list_calls == [0, 50, 100]    # paged back through all 114 activities
    assert first.more and len(FakeClient.downloads) == sync_service.MAX_DOWNLOADS_PER_RUN
    rounds = 1
    while first.more and rounds < 30:
        first = run(sync_service.sync(UID))
        rounds += 1
    hiit = [s for s in fake._col(UID, "cardio_sessions").stream() if s.to_dict()["activity_type"] == "hiit"]
    assert len(hiit) == 110 and rounds == 12        # 113 downloads, 10 per round


def test_replacing_key_keeps_dismissals():
    fake = setup()
    run(sync_service.sync(UID))
    run(sync_service.dismiss_all(UID))
    run(sync_service.connect(UID, OWNER, GarminConnectRequest(api_key="replacement-key-9876")))
    assert conn_doc(fake)["key_hint"] == "9876"
    run(sync_service.sync(UID))
    assert pending_ids() == []


def test_old_review_list_is_migrated():
    fake = setup()
    fake._col(UID, "garmin_pending").document("4").set({"name": "Strength", "kind": "strength",
                                                         "started_at": STRENGTH_START, "reason": "x"})
    run(sync_service.sync(UID))
    assert fake._col(UID, "garmin_pending").stream() == []
    assert status_of("4").status == "review"


def test_uploads_listed_without_sync():
    fake = FakeFDS()
    import_service.fds = fake
    preview = run(import_service.build_preview(UID, FakeClient.files.get(4) or strength_file(STRENGTH_START, SETS)))
    run(import_service.confirm(UID, GarminImportConfirmRequest(activity=preview.activity, action="new")))
    items = run(sync_service.list_activities(UID))
    assert len(items) == 1 and items[0].source == "upload" and items[0].status == "imported"
    assert items[0].session_type == "workout" and items[0].id.startswith("session:workout:")


def test_rejected_key_flags_connection():
    fake = setup()
    FakeClient.reject = True
    try:
        run(sync_service.sync(UID))
        raise AssertionError("expected error")
    except import_service.GarminImportError as e:
        assert e.status_code == 401 and "replace key" in str(e).lower()
    assert conn_doc(fake)["status"] == "needs_attention"
    assert run(sync_service.status(UID, OWNER)).status == "needs_attention"


def test_bad_file_does_not_block_others():
    fake = setup()
    FakeClient.files[3] = b"not a fit file at all"
    run(sync_service.update(UID, OWNER, auto_import=True))
    FakeClient.files[1] = cardio_file(CONNECTED - timedelta(days=2), 1500, 4000, serial=1)
    result = run(sync_service.sync(UID))
    assert len(result.errors) == 1 and "Treadmill Running" in result.errors[0]
    assert [i.garmin_activity_id for i in result.imported] == ["1"] and pending_ids() == ["4"]
    bad = status_of("3")                           # bad file isn't retried forever
    assert bad.status == "skipped" and "couldn't read" in bad.detail.lower()

    # Opening a listed activity whose file is bad gives a clear message.
    run(sync_service.update(UID, OWNER, auto_import=False))
    FakeClient.activities.append(listing(8, STRENGTH_START + timedelta(days=1), "hiit", name="HIIT"))
    FakeClient.files[8] = b"garbage"
    run(sync_service.sync(UID))
    try:
        run(sync_service.activity_preview(UID, "8"))
        raise AssertionError("expected error")
    except import_service.GarminImportError as e:
        assert "couldn't be read" in str(e)


def test_disconnect_removes_key_and_queue():
    fake = setup()
    run(sync_service.sync(UID))
    run(sync_service.disconnect(UID))
    assert not fake._col(UID, "integrations").document("garmin").get().exists
    assert pending_ids() == []
    assert not run(sync_service.status(UID, OWNER)).connected


# ── API gate ─────────────────────────────────────────────────────────────────

def test_api_owner_only():
    from backend.main import app
    from backend.middleware.auth import get_current_user
    from backend.services.firebase_service import firebase_service

    setup()
    original = firebase_service.is_available
    firebase_service.is_available = lambda: True

    async def call(email, method, path, **kw):
        app.dependency_overrides[get_current_user] = lambda: {"uid": UID, "email": email}
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            return await c.request(method, path, **kw)

    try:
        other_status = run(call("someone@example.com", "GET", "/api/v3/garmin/connection"))
        other_sync = run(call("someone@example.com", "POST", "/api/v3/garmin/sync"))
        owner_status = run(call(OWNER, "GET", "/api/v3/garmin/connection"))
        owner_sync = run(call(OWNER, "POST", "/api/v3/garmin/sync"))
        owner_pending = run(call(OWNER, "GET", "/api/v3/garmin/activities?status=review"))
        owner_clear = run(call(OWNER, "POST", "/api/v3/garmin/activities/dismiss-all"))
        other_list = run(call("someone@example.com", "GET", "/api/v3/garmin/activities"))
    finally:
        app.dependency_overrides.clear()
        firebase_service.is_available = original

    assert other_status.status_code == 200 and other_status.json()["allowed"] is False
    assert other_sync.status_code == 403
    body = owner_status.json()
    assert body["allowed"] and body["connected"] and "key_encrypted" not in body and KEY not in str(body)
    assert owner_sync.status_code == 200, owner_sync.text
    assert [p["id"] for p in owner_pending.json()] == ["4", "3", "1"]
    assert owner_clear.json()["dismissed"] == 3
    assert other_list.status_code == 200      # anyone can see their own uploads on the Garmin page


if __name__ == "__main__":
    tests = [(n, f) for n, f in list(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            import traceback
            traceback.print_exc()
            print(f"FAIL {name}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
