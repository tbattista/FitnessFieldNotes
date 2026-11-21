"""
Backend tests for Garmin Personal API sync: key encryption, the HTTP client
(against httpx.MockTransport), connect/sync/review/disconnect against an
in-memory Firestore, and the owner-only gate on the API.

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


def listing(gid, start, type_key, manual=False, name=None):
    return {"activityId": gid, "activityName": name or type_key, "manualActivity": manual,
            "activityType": {"typeKey": type_key}, "startTimeGMT": start.strftime("%Y-%m-%d %H:%M:%S")}


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
        listing(1, CONNECTED - timedelta(days=2), "running"),              # before sync_from: ignored
        listing(2, CONNECTED + timedelta(hours=1), "strength_training", manual=True),
        listing(3, RUN_START, "treadmill_running", name="Treadmill Running"),
        listing(4, STRENGTH_START, "strength_training", name="Strength"),
    ]
    FakeClient.files = {3: cardio_file(RUN_START, 1831.41, 3169.22, serial=99),
                        4: strength_file(STRENGTH_START, SETS, serial=99)}
    FakeClient.downloads = []
    FakeClient.list_calls = []
    FakeClient.reject = False
    run(sync_service.connect(UID, OWNER, GarminConnectRequest(api_key=KEY, expires_in_days=90,
                                                               sync_from=CONNECTED)))
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


def test_sync_imports_confident_and_queues_the_rest():
    fake = setup()
    result = run(sync_service.sync(UID))
    # Run (cardio, nothing else that day) imports straight away; strength has
    # unconfirmed exercise names, so it waits for review.
    assert [i.garmin_activity_id for i in result.imported] == ["3"]
    assert result.pending == 1 and result.pending_total == 1
    assert result.skipped == 1               # the manual activity
    assert FakeClient.downloads == [3, 4]     # oldest first; the old run was never downloaded
    cardio = fake._col(UID, "cardio_sessions").stream()
    assert len(cardio) == 1 and cardio[0].to_dict()["source"] == "garmin"

    pending = run(sync_service.list_pending(UID))
    assert [p.id for p in pending] == ["4"] and pending[0].reason == "New exercise names to confirm"

    # Every activity in the window is logged with its outcome and reason.
    log = {d.garmin_activity_id: d for d in result.details}
    assert (log["2"].outcome, log["3"].outcome, log["4"].outcome) == ("skipped", "imported", "review")
    assert "by hand" in log["2"].detail and "new exercise names" in log["4"].detail
    assert "1" not in log                       # before the start date: not considered
    recent = run(sync_service.status(UID, OWNER)).recent_activity
    assert [e.garmin_activity_id for e in recent] == ["4", "3", "2"]   # newest first

    # Nothing new on the second sync, and nothing re-downloaded.
    again = run(sync_service.sync(UID))
    assert (len(again.imported), again.pending, again.skipped) == (0, 0, 0)
    assert FakeClient.downloads == [3, 4]

    # Review the queued strength session: preview, confirm, queue empties.
    preview = run(sync_service.pending_preview(UID, "4"))
    assert preview.activity.exercises[0].garmin_key == "squat"
    run(import_service.confirm(UID, GarminImportConfirmRequest(
        activity=preview.activity, action="new", exercise_mappings={"squat": "Back Squat"}, pending_id="4")))
    run(sync_service.dismiss_pending(UID, "4"))   # the API does this after a successful confirm
    assert run(sync_service.list_pending(UID)) == []
    assert run(sync_service.status(UID, OWNER)).last_summary == {"imported": 0, "pending": 0, "skipped": 0,
                                                                  "errors": 0}


def test_saved_names_let_strength_auto_import():
    fake = setup()
    run(import_service.save_exercise_map(UID, {"squat": "Back Squat", "deadlift/barbell_deadlift": "Deadlift"}))
    result = run(sync_service.sync(UID))
    assert sorted(i.garmin_activity_id for i in result.imported) == ["3", "4"] and result.pending == 0
    sessions = [s.to_dict() for s in fake._col(UID, "workout_sessions").stream()]
    assert [e["exercise_name"] for e in sessions[0]["exercises_performed"]] == ["Back Squat", "Deadlift"]


def test_review_all_queues_everything():
    fake = setup()
    run(sync_service.update(UID, OWNER, review_all=True))
    result = run(sync_service.sync(UID))
    assert result.imported == [] and result.pending == 2
    assert {p.reason for p in run(sync_service.list_pending(UID))} == {"You review every import"}
    assert fake._col(UID, "cardio_sessions").stream() == []


def test_replacing_key_keeps_sync_position():
    fake = setup()
    run(sync_service.sync(UID))
    processed = conn_doc(fake)["processed_ids"]
    run(sync_service.connect(UID, OWNER, GarminConnectRequest(api_key="replacement-key-9876")))
    doc = conn_doc(fake)
    assert doc["key_hint"] == "9876" and doc["processed_ids"] == processed
    assert doc["sync_from"] == CONNECTED
    FakeClient.downloads = []
    run(sync_service.sync(UID))
    assert FakeClient.downloads == []          # nothing downloaded twice


def test_check_again_relooks_without_duplicating():
    fake = setup()
    run(sync_service.sync(UID))
    run(sync_service.update(UID, OWNER, review_all=None, recheck=True))
    FakeClient.downloads = []
    again = run(sync_service.sync(UID))
    # The run was imported and the strength session is still queued: the run is
    # downloaded and recognised as a duplicate; the queued one isn't touched.
    assert FakeClient.downloads == [3] and again.imported == [] and again.pending == 0
    assert {d.garmin_activity_id: d.outcome for d in again.details} == {"2": "skipped", "3": "skipped"}
    assert len(fake._col(UID, "cardio_sessions").stream()) == 1


def test_moving_start_date_back_pulls_older_activities():
    fake = setup()
    # 60 HIIT sessions on earlier days, newest first: more than one list page.
    early = CONNECTED - timedelta(days=20)
    for i in range(60):
        gid = 100 + i
        start = early + timedelta(hours=8 * i)
        FakeClient.activities.append(listing(gid, start, "hiit", name="HIIT"))
        FakeClient.files[gid] = cardio_file(start, 900, 0, sport="training", sub_sport="hiit", serial=gid)
    FakeClient.files[1] = cardio_file(CONNECTED - timedelta(days=2), 1500, 4000, serial=1)
    run(sync_service.sync(UID))
    assert not [d for d in FakeClient.downloads if d >= 100]     # before the start date: untouched

    run(sync_service.update(UID, OWNER, review_all=None, sync_from=early))
    assert conn_doc(fake)["sync_from"] == early and conn_doc(fake)["processed_ids"] == []
    FakeClient.list_calls, FakeClient.downloads = [], []
    first = run(sync_service.sync(UID))
    assert FakeClient.list_calls == [0, 50]       # paged back past the newest 50
    assert first.more and len(FakeClient.downloads) == sync_service.MAX_DOWNLOADS_PER_RUN
    assert FakeClient.downloads[0] == 100         # oldest first
    rounds = 1
    while first.more and rounds < 20:
        first = run(sync_service.sync(UID))
        rounds += 1
    hiit = [s.to_dict() for s in fake._col(UID, "cardio_sessions").stream() if s.to_dict()["activity_type"] == "hiit"]
    assert len(hiit) == 60 and rounds == 7
    try:
        run(sync_service.update(UID, OWNER, review_all=None, sync_from=datetime.now(timezone.utc) + timedelta(days=2)))
        raise AssertionError("expected future date to be refused")
    except import_service.GarminImportError:
        pass


def test_rejected_key_flags_connection():
    fake = setup()
    FakeClient.reject = True
    try:
        run(sync_service.sync(UID))
        raise AssertionError("expected error")
    except import_service.GarminImportError as e:
        assert e.status_code == 401 and "reconnect" in str(e).lower()
    assert conn_doc(fake)["status"] == "needs_attention"
    assert run(sync_service.status(UID, OWNER)).status == "needs_attention"


def test_bad_file_does_not_block_others():
    fake = setup()
    FakeClient.files[3] = b"not a fit file at all"
    result = run(sync_service.sync(UID))
    assert len(result.errors) == 1 and "Treadmill Running" in result.errors[0]
    assert result.pending == 1                     # strength still processed
    assert "3" in conn_doc(fake)["processed_ids"]  # bad file isn't retried forever


def test_disconnect_removes_key_and_queue():
    fake = setup()
    run(sync_service.sync(UID))
    run(sync_service.disconnect(UID))
    assert not fake._col(UID, "integrations").document("garmin").get().exists
    assert fake._col(UID, "garmin_pending").stream() == []
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
        owner_pending = run(call(OWNER, "GET", "/api/v3/garmin/pending"))
    finally:
        app.dependency_overrides.clear()
        firebase_service.is_available = original

    assert other_status.status_code == 200 and other_status.json()["allowed"] is False
    assert other_sync.status_code == 403
    body = owner_status.json()
    assert body["allowed"] and body["connected"] and "key_encrypted" not in body and KEY not in str(body)
    assert owner_sync.status_code == 200, owner_sync.text
    assert [p["id"] for p in owner_pending.json()] == ["4"]


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
