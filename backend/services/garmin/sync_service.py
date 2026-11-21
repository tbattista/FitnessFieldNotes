"""
Garmin Personal API sync: connect a key, then Sync records every activity
Garmin has on the user's Garmin page. Each one keeps a status: waiting for
review, imported (linked to its session), dismissed, or skipped (with why).
Optionally, clear matches import automatically.

Sync only reads Garmin's activity list, so it is fast even for a year of
history. An activity's original file is downloaded when the user opens it for
review (or when auto-import is on), then cached on its record.

Firestore layout (backend-only; see firestore.rules):
  users/{uid}/integrations/garmin
      key_encrypted, key_hint, connected_at, key_expires_at, auto_import,
      status, last_sync_at, last_error, last_summary
  users/{uid}/garmin_activities/{garmin activity id}
      status (review | imported | dismissed | skipped), detail, name, kind,
      activity_type, started_at, duration_minutes, calories, avg_heart_rate,
      distance_m, summary, action, session_id, session_type, decided_at,
      created_at, activity (ParsedGarminActivity JSON once downloaded)

Garmin's Personal API terms allow a key to be used only by its owner, so sync
is limited to GARMIN_SYNC_ALLOWED_EMAILS (default: the site owner).
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ...models.garmin import (
    GarminActivityItem,
    GarminConnectionStatus,
    GarminConnectRequest,
    GarminImportConfirmRequest,
    GarminImportResult,
    GarminSyncImported,
    GarminSyncLogEntry,
    GarminSyncResult,
    ParsedGarminActivity,
)
from . import import_service, secret_box
from .fit_parser import FitParseError, humanize, parse_activity
from .import_service import GarminImportError
from .matching import to_utc
from .personal_api_client import (
    GarminApiError,
    GarminAuthError,
    GarminRateLimited,
    PersonalApiClient,
    activity_start,
    forget_token,
)

logger = logging.getLogger(__name__)

DEFAULT_ALLOWED_EMAILS = "tbattista@gmail.com"
LIST_PAGE = 50              # activities per list request
LIST_MAX = 500              # most recent activities one sync looks at
MAX_DOWNLOADS_PER_RUN = 10  # auto-import downloads per sync call; the UI repeats until caught up
SAME_START = timedelta(seconds=90)
STRENGTH_TYPES = {"strength_training", "indoor_strength_training"}

# Swappable in tests.
client_factory = PersonalApiClient


def allowed_emails() -> List[str]:
    raw = os.getenv("GARMIN_SYNC_ALLOWED_EMAILS", DEFAULT_ALLOWED_EMAILS)
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def is_allowed(email: Optional[str]) -> bool:
    return bool(email) and email.lower() in allowed_emails()


def _user(user_id: str):
    return import_service.fds.db.collection("users").document(user_id)


def _conn_ref(user_id: str):
    return _user(user_id).collection("integrations").document("garmin")


def _acts(user_id: str):
    return _user(user_id).collection("garmin_activities")


def _review_count(user_id: str) -> int:
    return len(list(_acts(user_id).where("status", "==", "review").stream()))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _load(user_id: str) -> Optional[Dict[str, Any]]:
    snap = _conn_ref(user_id).get()
    return snap.to_dict() if snap.exists else None


def _client_for(user_id: str, conn: Dict[str, Any]):
    try:
        return client_factory(secret_box.decrypt(conn["key_encrypted"]))
    except secret_box.SecretBoxError as e:
        _conn_ref(user_id).update({"status": "needs_attention", "last_error": str(e)})
        raise GarminImportError(str(e), 409)


def _auth_failed(user_id: str, e: Exception) -> GarminImportError:
    _conn_ref(user_id).update({"status": "needs_attention", "last_error": str(e), "last_sync_at": _now()})
    return GarminImportError(f"{e} Create a new key and choose Replace key in Settings.", 401)


# ── connection ───────────────────────────────────────────────────────────────

async def status(user_id: str, email: Optional[str]) -> GarminConnectionStatus:
    if not is_allowed(email):
        return GarminConnectionStatus(allowed=False)
    conn = _load(user_id)
    if not conn:
        return GarminConnectionStatus(allowed=True, connected=False)
    expires = to_utc(conn.get("key_expires_at"))
    return GarminConnectionStatus(
        allowed=True,
        connected=True,
        status=conn.get("status") or "connected",
        key_hint=conn.get("key_hint"),
        connected_at=to_utc(conn.get("connected_at")),
        key_expires_at=expires,
        days_until_expiry=(expires - _now()).days if expires else None,
        auto_import=bool(conn.get("auto_import")),
        last_sync_at=to_utc(conn.get("last_sync_at")),
        last_error=conn.get("last_error"),
        last_summary=conn.get("last_summary"),
        pending_count=_review_count(user_id),
    )


async def connect(user_id: str, email: Optional[str], req: GarminConnectRequest) -> GarminConnectionStatus:
    key = req.api_key.strip()
    try:
        await client_factory(key).token(force=True)   # proves the key works before saving it
    except GarminAuthError:
        raise GarminImportError("Garmin didn't accept that key. Check it was copied in full and hasn't been deleted.")
    except GarminApiError as e:
        raise GarminImportError(str(e), 502)

    now = _now()
    existing = _load(user_id) or {}
    # Replacing a key (e.g. after it expired) keeps everything else; the
    # Garmin activity records are untouched, so nothing is listed twice.
    _conn_ref(user_id).set({
        "provider": "garmin",
        "key_encrypted": secret_box.encrypt(key),
        "key_hint": key[-4:],
        "connected_at": existing.get("connected_at") or now,
        "key_expires_at": now + timedelta(days=req.expires_in_days) if req.expires_in_days else None,
        "auto_import": bool(existing.get("auto_import", False)),
        "status": "connected",
        "last_sync_at": existing.get("last_sync_at"),
        "last_error": None,
        "last_summary": existing.get("last_summary"),
    })
    logger.info(f"Garmin connected for {user_id}")
    return await status(user_id, email)


async def update(user_id: str, email: Optional[str], auto_import: Optional[bool]) -> GarminConnectionStatus:
    if not _load(user_id):
        raise GarminImportError("Garmin isn't connected.", 404)
    if auto_import is not None:
        _conn_ref(user_id).update({"auto_import": bool(auto_import)})
    return await status(user_id, email)


async def disconnect(user_id: str) -> None:
    conn = _load(user_id)
    if conn and conn.get("key_encrypted"):
        try:
            forget_token(secret_box.decrypt(conn["key_encrypted"]))
        except secret_box.SecretBoxError:
            pass
    _conn_ref(user_id).delete()
    # Records of activities still waiting for review go; records of imported
    # ones stay so the Garmin page keeps showing what came from Garmin.
    for doc in _acts(user_id).stream():
        if (doc.to_dict() or {}).get("status") in ("review", "dismissed", "skipped"):
            _acts(user_id).document(doc.id).delete()
    logger.info(f"Garmin disconnected for {user_id}")


# ── Garmin activity records ──────────────────────────────────────────────────

def _summary_from_listing(a: Dict[str, Any]) -> str:
    """'Squat 4 sets, Straight Leg Deadlift 1 set' from the activity list entry."""
    parts = []
    for s in a.get("summarizedExerciseSets") or []:
        if not s.get("sets"):
            continue
        label = humanize(s.get("subCategory") or s.get("category"))
        n = s["sets"]
        parts.append(f"{label} {n} set{'s' if n != 1 else ''}")
    return ", ".join(parts)


def _record(a: Dict[str, Any], start: datetime, status: str, detail: str = "", **extra) -> Dict[str, Any]:
    type_key = (a.get("activityType") or {}).get("typeKey")
    distance = a.get("distance")
    rec = {
        "status": status,
        "detail": detail,
        "name": a.get("activityName") or humanize(type_key or "activity"),
        "kind": "strength" if type_key in STRENGTH_TYPES else "cardio",
        "activity_type": type_key,
        "started_at": start,
        "duration_minutes": round(a["duration"] / 60, 1) if isinstance(a.get("duration"), (int, float)) else None,
        "calories": int(a["calories"]) if isinstance(a.get("calories"), (int, float)) else None,
        "avg_heart_rate": int(a["averageHR"]) if isinstance(a.get("averageHR"), (int, float)) else None,
        "distance_m": distance if isinstance(distance, (int, float)) and distance > 0 else None,
        "summary": _summary_from_listing(a),
        "created_at": _now(),
    }
    rec.update(extra)
    return rec


async def _imported_sessions(user_id: str) -> List[Dict[str, Any]]:
    """Sessions that came from Garmin (sync or file upload), with the Garmin start time."""
    out = []
    sessions = await import_service.fds.get_user_sessions(user_id, limit=300)
    cardio = await import_service.fds.get_user_cardio_sessions(user_id, limit=300)
    for kind, items in (("workout", sessions), ("cardio", cardio)):
        for s in items:
            if not str(getattr(s, "external_id", "") or "").startswith("garmin:"):
                continue
            meta = getattr(s, "import_meta", None) or {}
            out.append({
                "session": s, "session_type": kind,
                "garmin_start": to_utc(meta.get("garmin_started_at")) or to_utc(s.started_at),
                "action": "merge" if meta.get("type") == "merge" else "new",
            })
    return out


def _match_session(start: Optional[datetime], imported: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not start:
        return None
    return next((i for i in imported if i["garmin_start"] and abs(i["garmin_start"] - start) <= SAME_START), None)


def _item(doc_id: str, d: Dict[str, Any]) -> GarminActivityItem:
    return GarminActivityItem(
        id=doc_id, source="sync", status=d.get("status") or "review", name=d.get("name") or "Activity",
        kind=d.get("kind", "cardio"), activity_type=d.get("activity_type"), started_at=to_utc(d.get("started_at")),
        duration_minutes=d.get("duration_minutes"), calories=d.get("calories"),
        avg_heart_rate=d.get("avg_heart_rate"), distance_m=d.get("distance_m"), summary=d.get("summary") or "",
        detail=d.get("detail") or "", action=d.get("action"), session_id=d.get("session_id"),
        session_type=d.get("session_type"), decided_at=to_utc(d.get("decided_at")))


def _upload_item(i: Dict[str, Any]) -> GarminActivityItem:
    s = i["session"]
    distance = None
    if i["session_type"] == "workout":
        name, kind = s.workout_name, "strength"
        summary = ", ".join(e.exercise_name for e in s.exercises_performed[:4])
        if len(s.exercises_performed) > 4:
            summary += f" +{len(s.exercises_performed) - 4} more"
    else:
        name, kind, summary = s.activity_name or s.activity_type, "cardio", ""
        distance = getattr(s, "distance", None)
        if distance:
            distance = distance * (1609.344 if s.distance_unit == "mi" else 1000.0)
    return GarminActivityItem(
        id=f"session:{i['session_type']}:{s.id}", source="upload", status="imported", name=name or "Activity",
        kind=kind, started_at=i["garmin_start"], duration_minutes=s.duration_minutes, calories=s.calories,
        avg_heart_rate=s.avg_heart_rate, distance_m=distance, summary=summary,
        detail="Merged into a session you logged" if i["action"] == "merge" else "Imported from a file",
        action=i["action"], session_id=s.id, session_type=i["session_type"])


async def list_activities(user_id: str, status: Optional[str] = None) -> List[GarminActivityItem]:
    """Everything from Garmin, newest first: synced records plus file uploads that have no record."""
    items = [_item(d.id, d.to_dict() or {}) for d in _acts(user_id).stream()]
    recorded_sessions = {i.session_id for i in items if i.session_id}
    for imp in await _imported_sessions(user_id):
        if imp["session"].id not in recorded_sessions:
            items.append(_upload_item(imp))
    if status:
        items = [i for i in items if i.status == status]
    items.sort(key=lambda i: i.started_at or _now(), reverse=True)
    return items


async def activity_preview(user_id: str, activity_id: str):
    ref = _acts(user_id).document(activity_id)
    snap = ref.get()
    if not snap.exists:
        raise GarminImportError("That Garmin activity isn't on your list.", 404)
    d = snap.to_dict()
    if d.get("activity"):
        activity = ParsedGarminActivity(**d["activity"])
    else:
        conn = _load(user_id)
        if not conn:
            raise GarminImportError("Connect Garmin in Settings first.", 404)
        client = _client_for(user_id, conn)
        try:
            activity = parse_activity(await client.download_original(int(activity_id)))
        except GarminAuthError as e:
            raise _auth_failed(user_id, e)
        except GarminRateLimited as e:
            raise GarminImportError(str(e), 429)
        except GarminApiError as e:
            raise GarminImportError(str(e), 502)
        except FitParseError as e:
            raise GarminImportError(f"Garmin's file for this activity couldn't be read: {e}")
        ref.update({"activity": activity.model_dump(mode="json")})
    return await import_service.build_preview_for_activity(user_id, activity)


async def set_status(user_id: str, activity_id: str, status: str) -> GarminActivityItem:
    ref = _acts(user_id).document(activity_id)
    snap = ref.get()
    if not snap.exists:
        raise GarminImportError("That Garmin activity isn't on your list.", 404)
    current = snap.to_dict().get("status")
    if current == "imported":
        raise GarminImportError("This activity is imported. Undo the import first.", 409)
    detail = "Dismissed" if status == "dismissed" else ""
    ref.update({"status": status, "detail": detail, "decided_at": _now() if status == "dismissed" else None})
    return _item(activity_id, {**snap.to_dict(), "status": status, "detail": detail})


async def dismiss_all(user_id: str) -> int:
    docs = list(_acts(user_id).where("status", "==", "review").stream())
    for doc in docs:
        _acts(user_id).document(doc.id).update({"status": "dismissed", "detail": "Dismissed", "decided_at": _now()})
    return len(docs)


def _imported_detail(result: GarminImportResult, target_name: Optional[str] = None) -> str:
    if result.action == "merge":
        return f"Merged into \u201c{target_name}\u201d" if target_name else "Merged into a session you logged"
    if result.action == "attach":
        return f"Logged as \u201c{target_name}\u201d" if target_name else "Logged against one of your workouts"
    return "Saved as a new session"


async def mark_imported(user_id: str, activity_id: str, result: GarminImportResult,
                        target_name: Optional[str] = None) -> None:
    ref = _acts(user_id).document(activity_id)
    if ref.get().exists:
        ref.update({"status": "imported", "detail": _imported_detail(result, target_name), "action": result.action,
                    "session_id": result.session_id, "session_type": result.session_type, "decided_at": _now()})


async def after_undo(user_id: str, session_id: str) -> None:
    """An import was undone: its Garmin activity goes back to waiting for review."""
    for doc in list(_acts(user_id).where("session_id", "==", session_id).stream()):
        _acts(user_id).document(doc.id).update({"status": "review", "detail": "Import undone", "action": None,
                                                "session_id": None, "session_type": None, "decided_at": None})


def _review_reason(preview) -> str:
    a = preview.activity
    if a.kind == "strength" and not a.exercises:
        return "No sets recorded"
    if a.kind == "strength" and any(ex.needs_review for ex in a.exercises):
        return "New exercise names to confirm"
    if preview.proposed.confidence != "high":
        return f"Check the match: {preview.proposed.reason.lower()}"
    return ""


def _migrate_old_list(user_id: str) -> None:
    """One-off: move entries from the earlier garmin_pending collection."""
    old = _user(user_id).collection("garmin_pending")
    for doc in old.stream():
        d = doc.to_dict() or {}
        if not _acts(user_id).document(doc.id).get().exists:
            d.pop("reason", None)
            _acts(user_id).document(doc.id).set({**d, "status": "review", "detail": ""})
        old.document(doc.id).delete()


# ── sync ─────────────────────────────────────────────────────────────────────

async def _list_all(client) -> List[Dict[str, Any]]:
    """Page back through the activity list (newest first), up to LIST_MAX."""
    out: List[Dict[str, Any]] = []
    while len(out) < LIST_MAX:
        page = await client.list_activities(limit=LIST_PAGE, start=len(out))
        out.extend(page)
        if len(page) < LIST_PAGE:
            break
    return out


async def sync(user_id: str) -> GarminSyncResult:
    conn = _load(user_id)
    if not conn:
        raise GarminImportError("Connect Garmin in Settings first.", 404)
    client = _client_for(user_id, conn)
    _migrate_old_list(user_id)
    known = {d.id: (d.to_dict() or {}) for d in _acts(user_id).stream()}
    auto = bool(conn.get("auto_import"))
    result = GarminSyncResult()
    now = _now()

    def log(gid, a, outcome, detail, start=None):
        result.details.append(GarminSyncLogEntry(
            garmin_activity_id=gid, name=a.get("activityName") or "Activity",
            activity_type=(a.get("activityType") or {}).get("typeKey"), started_at=start or activity_start(a),
            outcome=outcome, detail=detail, synced_at=now))

    try:
        listed = await _list_all(client)
    except GarminAuthError as e:
        raise _auth_failed(user_id, e)
    except GarminRateLimited as e:
        raise GarminImportError(str(e), 429)
    except GarminApiError as e:
        _conn_ref(user_id).update({"last_error": str(e), "last_sync_at": now})
        raise GarminImportError(str(e), 502)

    imported = await _imported_sessions(user_id)
    to_download = []
    for a in listed:
        gid = str(a.get("activityId") or "")
        start = activity_start(a)
        if not gid or not start:
            continue
        existing = known.get(gid)
        if existing and not (auto and existing.get("status") == "review" and not existing.get("tried_auto")):
            continue
        if a.get("manualActivity") or a.get("isManualActivity"):
            detail = "Entered by hand in Garmin Connect, so there are no sets or heart rate to import"
            _acts(user_id).document(gid).set(_record(a, start, "skipped", detail))
            result.skipped += 1
            log(gid, a, "skipped", detail, start)
            continue
        match = _match_session(start, imported)
        if match:
            detail = ("Merged into a session you logged" if match["action"] == "merge"
                      else "Already in your history")
            _acts(user_id).document(gid).set(_record(
                a, start, "imported", detail, action=match["action"], session_id=match["session"].id,
                session_type=match["session_type"], decided_at=now))
            result.skipped += 1
            log(gid, a, "skipped", "Already in your history", start)
            continue
        if auto:
            to_download.append((start, gid, a))
            continue
        _acts(user_id).document(gid).set(_record(a, start, "review"))
        result.pending += 1
        log(gid, a, "review", "Added to your Garmin page", start)

    # Auto-import: download and import clear matches, oldest first, a batch per call.
    to_download.sort(key=lambda t: t[0])
    result.more = len(to_download) > MAX_DOWNLOADS_PER_RUN
    for start, gid, a in to_download[:MAX_DOWNLOADS_PER_RUN]:
        name = a.get("activityName") or "Activity"
        try:
            activity = parse_activity(await client.download_original(int(gid)))
            preview = await import_service.build_preview_for_activity(user_id, activity)
            cached = {"activity": preview.activity.model_dump(mode="json"), "tried_auto": True}
            if preview.duplicate_of:
                _acts(user_id).document(gid).set(_record(a, start, "imported", "Already in your history",
                                                         session_id=preview.duplicate_of, decided_at=now, **cached))
                result.skipped += 1
                log(gid, a, "skipped", "Already in your history", start)
            elif preview.auto_importable:
                p = preview.proposed
                saved = await import_service.confirm(user_id, GarminImportConfirmRequest(
                    activity=preview.activity, action=p.action, target_id=p.target_id,
                    save_mappings=False, weight_unit=preview.weight_unit))
                _acts(user_id).document(gid).set(_record(
                    a, start, "imported", _imported_detail(saved, p.target_name), action=saved.action,
                    session_id=saved.session_id, session_type=saved.session_type, decided_at=now, **cached))
                result.imported.append(GarminSyncImported(
                    garmin_activity_id=gid, name=activity.name, started_at=activity.started_at,
                    action=saved.action, session_id=saved.session_id, session_type=saved.session_type))
                log(gid, a, "imported", _imported_detail(saved, p.target_name), start)
            else:
                reason = _review_reason(preview)
                _acts(user_id).document(gid).set(_record(a, start, "review", reason, **cached))
                result.pending += 1
                log(gid, a, "review", reason or "Added to your Garmin page", start)
        except FitParseError as e:
            result.errors.append(f"{name} ({start:%b %d}): {e}")
            _acts(user_id).document(gid).set(_record(a, start, "skipped", f"Couldn't read Garmin's file: {e}"))
            log(gid, a, "error", f"Couldn't read the file: {e}", start)
        except GarminRateLimited as e:
            result.errors.append(str(e))
            result.more = True
            log(gid, a, "error", f"{e} It will be tried again next sync.", start)
            break
        except GarminAuthError as e:
            raise _auth_failed(user_id, e)
        except (GarminApiError, GarminImportError) as e:
            result.errors.append(f"{name} ({start:%b %d}): {e}")   # retried next sync
            log(gid, a, "error", f"{e} It will be tried again next sync.", start)
        except Exception as e:  # noqa: BLE001 - one bad activity must not stop the rest
            logger.exception(f"Garmin sync failed for activity {gid}")
            result.errors.append(f"{name} ({start:%b %d}): unexpected error ({type(e).__name__})")
            log(gid, a, "error", f"Unexpected error ({type(e).__name__}). It will be tried again next sync.", start)

    result.last_sync_at = now
    result.pending_total = _review_count(user_id)
    _conn_ref(user_id).update({
        "last_sync_at": now,
        "status": "connected",
        "last_error": "; ".join(result.errors)[:500] or None,
        "last_summary": {"imported": len(result.imported), "pending": result.pending, "skipped": result.skipped,
                         "errors": len(result.errors)},
    })
    logger.info(f"Garmin sync for {user_id}: {result.pending} to review, {len(result.imported)} imported, "
                f"{result.skipped} skipped, {len(result.errors)} errors")
    return result
