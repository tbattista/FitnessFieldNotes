"""
Garmin Personal API sync: connect a key, pull new activities, auto-import the
confident ones, and queue the rest for review.

Firestore layout (backend-only; see firestore.rules):
  users/{uid}/integrations/garmin
      key_encrypted, key_hint, connected_at, sync_from, key_expires_at,
      review_all, status, last_sync_at, last_error, last_summary, processed_ids
  users/{uid}/garmin_pending/{garmin activity id}
      activity (ParsedGarminActivity as JSON), name, kind, started_at, reason, created_at

Garmin's Personal API terms allow a key to be used only by its owner, so sync
is limited to GARMIN_SYNC_ALLOWED_EMAILS (default: the site owner).
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ...models.garmin import (
    GarminConnectionStatus,
    GarminConnectRequest,
    GarminImportConfirmRequest,
    GarminPendingItem,
    GarminSyncImported,
    GarminSyncLogEntry,
    GarminSyncResult,
    ParsedGarminActivity,
)
from . import import_service, secret_box
from .fit_parser import FitParseError, parse_activity
from .import_service import GarminImportError
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
LIST_LIMIT = 50            # newest activities checked per sync
MAX_DOWNLOADS_PER_RUN = 10  # keep each sync short and gentle on Garmin
PROCESSED_KEEP = 300        # remembered activity IDs (newest)
EXPIRY_WARNING_DAYS = 7
LOG_KEEP = 30               # per-activity sync outcomes shown in Settings

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


def _pending_col(user_id: str):
    return _user(user_id).collection("garmin_pending")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _utc(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _load(user_id: str) -> Optional[Dict[str, Any]]:
    snap = _conn_ref(user_id).get()
    return snap.to_dict() if snap.exists else None


# ── connection ───────────────────────────────────────────────────────────────

async def status(user_id: str, email: Optional[str]) -> GarminConnectionStatus:
    if not is_allowed(email):
        return GarminConnectionStatus(allowed=False)
    conn = _load(user_id)
    if not conn:
        return GarminConnectionStatus(allowed=True, connected=False)
    expires = _utc(conn.get("key_expires_at"))
    days = (expires - _now()).days if expires else None
    pending = len(list(_pending_col(user_id).stream()))
    return GarminConnectionStatus(
        allowed=True,
        connected=True,
        status=conn.get("status") or "connected",
        key_hint=conn.get("key_hint"),
        connected_at=_utc(conn.get("connected_at")),
        sync_from=_utc(conn.get("sync_from")),
        key_expires_at=expires,
        days_until_expiry=days,
        review_all=bool(conn.get("review_all")),
        last_sync_at=_utc(conn.get("last_sync_at")),
        last_error=conn.get("last_error"),
        last_summary=conn.get("last_summary"),
        pending_count=pending,
        recent_activity=[GarminSyncLogEntry(**e) for e in conn.get("recent_activity") or []],
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
    # Replacing a key (e.g. after it expired) keeps the sync position, so
    # nothing is skipped or imported twice. An explicit sync_from starts over.
    keep_position = bool(existing) and req.sync_from is None
    _conn_ref(user_id).set({
        "provider": "garmin",
        "key_encrypted": secret_box.encrypt(key),
        "key_hint": key[-4:],
        "connected_at": existing.get("connected_at") if keep_position else now,
        "sync_from": existing.get("sync_from") if keep_position else (_utc(req.sync_from) or now),
        "key_expires_at": now + timedelta(days=req.expires_in_days) if req.expires_in_days else None,
        "review_all": bool(existing.get("review_all", False)),
        "status": "connected",
        "last_sync_at": existing.get("last_sync_at") if keep_position else None,
        "last_error": None,
        "last_summary": existing.get("last_summary") if keep_position else None,
        "processed_ids": list(existing.get("processed_ids") or []) if keep_position else [],
    })
    logger.info(f"Garmin connected for {user_id}")
    return await status(user_id, email)


async def update(user_id: str, email: Optional[str], review_all: Optional[bool],
                 recheck: Optional[bool] = None) -> GarminConnectionStatus:
    if not _load(user_id):
        raise GarminImportError("Garmin isn't connected.", 404)
    changes: Dict[str, Any] = {}
    if review_all is not None:
        changes["review_all"] = bool(review_all)
    if recheck:
        # Safe: already-imported files are detected by external_id and
        # queued ones by their pending entry, so nothing is imported twice.
        changes["processed_ids"] = []
    if changes:
        _conn_ref(user_id).update(changes)
    return await status(user_id, email)


async def disconnect(user_id: str) -> None:
    conn = _load(user_id)
    if conn and conn.get("key_encrypted"):
        try:
            forget_token(secret_box.decrypt(conn["key_encrypted"]))
        except secret_box.SecretBoxError:
            pass
    _conn_ref(user_id).delete()
    for doc in _pending_col(user_id).stream():
        _pending_col(user_id).document(doc.id).delete()
    logger.info(f"Garmin disconnected for {user_id}")


# ── pending review queue ─────────────────────────────────────────────────────

async def list_pending(user_id: str) -> List[GarminPendingItem]:
    items = []
    for doc in _pending_col(user_id).stream():
        d = doc.to_dict() or {}
        items.append(GarminPendingItem(id=doc.id, name=d.get("name") or "Activity", kind=d.get("kind", "strength"),
                                       started_at=_utc(d.get("started_at")), reason=d.get("reason", "")))
    items.sort(key=lambda i: i.started_at or _now())
    return items


async def pending_preview(user_id: str, pending_id: str):
    snap = _pending_col(user_id).document(pending_id).get()
    if not snap.exists:
        raise GarminImportError("That activity is no longer waiting for review.", 404)
    activity = ParsedGarminActivity(**snap.to_dict()["activity"])
    return await import_service.build_preview_for_activity(user_id, activity)


async def dismiss_pending(user_id: str, pending_id: str) -> None:
    _pending_col(user_id).document(pending_id).delete()


def _queue(user_id: str, garmin_id: str, activity: ParsedGarminActivity, reason: str) -> None:
    _pending_col(user_id).document(garmin_id).set({
        "activity": activity.model_dump(mode="json"),
        "name": activity.name,
        "kind": activity.kind,
        "started_at": activity.started_at,
        "reason": reason,
        "created_at": _now(),
    })


def _imported_detail(proposed) -> str:
    if proposed.action == "merge":
        return f"Merged into your session \u201c{proposed.target_name}\u201d"
    if proposed.action == "attach":
        return f"Logged as \u201c{proposed.target_name}\u201d"
    return "Saved as a new session"


def _review_reason(preview, review_all: bool) -> str:
    if review_all:
        return "You review every import"
    a = preview.activity
    if a.kind == "strength" and not a.exercises:
        return "No sets recorded"
    if a.kind == "strength" and any(ex.needs_review for ex in a.exercises):
        return "New exercise names to confirm"
    if preview.proposed.confidence != "high":
        return f"Check the match: {preview.proposed.reason.lower()}"
    return "Needs review"


# ── sync ─────────────────────────────────────────────────────────────────────

async def sync(user_id: str) -> GarminSyncResult:
    conn = _load(user_id)
    if not conn:
        raise GarminImportError("Connect Garmin in Settings first.", 404)
    try:
        key = secret_box.decrypt(conn["key_encrypted"])
    except secret_box.SecretBoxError as e:
        _conn_ref(user_id).update({"status": "needs_attention", "last_error": str(e)})
        raise GarminImportError(str(e), 409)

    client = client_factory(key)
    since = _utc(conn.get("sync_from")) or _utc(conn.get("connected_at")) or _now()
    processed = list(conn.get("processed_ids") or [])
    seen = set(processed)
    pending_ids = {d.id for d in _pending_col(user_id).stream()}
    result = GarminSyncResult()
    now = _now()

    def log(gid, a, outcome, detail, start=None):
        result.details.append(GarminSyncLogEntry(
            garmin_activity_id=gid, name=a.get("activityName") or "Activity",
            activity_type=(a.get("activityType") or {}).get("typeKey"), started_at=start or activity_start(a),
            outcome=outcome, detail=detail, synced_at=now))

    try:
        listed = await client.list_activities(limit=LIST_LIMIT)
    except GarminAuthError as e:
        _conn_ref(user_id).update({"status": "needs_attention", "last_error": str(e), "last_sync_at": _now()})
        raise GarminImportError(f"{e} Create a new key and reconnect in Settings.", 401)
    except GarminRateLimited as e:
        raise GarminImportError(str(e), 429)
    except GarminApiError as e:
        _conn_ref(user_id).update({"last_error": str(e), "last_sync_at": _now()})
        raise GarminImportError(str(e), 502)

    new = []
    for a in listed:
        gid = str(a.get("activityId") or "")
        start = activity_start(a)
        if not gid or gid in seen or gid in pending_ids or not start or start < since:
            continue
        if a.get("manualActivity") or a.get("isManualActivity"):
            # Typed into Garmin Connect by hand: the file has no sets or heart rate.
            result.skipped += 1
            processed.append(gid)
            log(gid, a, "skipped", "Entered by hand in Garmin Connect, so there are no sets or heart rate to import")
            continue
        new.append((start, gid, a))
    new.sort(key=lambda t: t[0])                  # oldest first, so history stays in order
    result.more = len(new) > MAX_DOWNLOADS_PER_RUN

    review_all = bool(conn.get("review_all"))
    for start, gid, a in new[:MAX_DOWNLOADS_PER_RUN]:
        name = a.get("activityName") or "Activity"
        try:
            activity = parse_activity(await client.download_original(int(gid)))
            preview = await import_service.build_preview_for_activity(user_id, activity)
            if preview.duplicate_of:
                result.skipped += 1
                log(gid, a, "skipped", "Already in your history", start)
            elif preview.auto_importable and not review_all:
                p = preview.proposed
                saved = await import_service.confirm(user_id, GarminImportConfirmRequest(
                    activity=preview.activity, action=p.action, target_id=p.target_id,
                    save_mappings=False, weight_unit=preview.weight_unit))
                result.imported.append(GarminSyncImported(
                    garmin_activity_id=gid, name=activity.name, started_at=activity.started_at,
                    action=saved.action, session_id=saved.session_id, session_type=saved.session_type))
                log(gid, a, "imported", _imported_detail(p), start)
            else:
                reason = _review_reason(preview, review_all)
                _queue(user_id, gid, preview.activity, reason)
                result.pending += 1
                log(gid, a, "review", f"Waiting for review: {reason[0].lower()}{reason[1:]}", start)
            processed.append(gid)
        except FitParseError as e:
            result.errors.append(f"{name} ({start:%b %d}): {e}")
            processed.append(gid)                 # a bad file won't get better on retry
            log(gid, a, "error", f"Couldn't read the file: {e}", start)
        except GarminRateLimited as e:
            result.errors.append(str(e))
            result.more = True
            log(gid, a, "error", f"{e} It will be tried again next sync.", start)
            break
        except (GarminApiError, GarminImportError) as e:
            result.errors.append(f"{name} ({start:%b %d}): {e}")   # retried next sync
            log(gid, a, "error", f"{e} It will be tried again next sync.", start)
        except Exception as e:  # noqa: BLE001 - one bad activity must not stop the rest
            logger.exception(f"Garmin sync failed for activity {gid}")
            result.errors.append(f"{name} ({start:%b %d}): unexpected error ({type(e).__name__})")
            log(gid, a, "error", f"Unexpected error ({type(e).__name__}). It will be tried again next sync.", start)

    result.last_sync_at = now
    # Activity log: this sync's outcomes first, then older ones not seen again.
    fresh_ids = {d.garmin_activity_id for d in result.details}
    recent = [d.model_dump() for d in result.details]
    recent += [e for e in (conn.get("recent_activity") or []) if e.get("garmin_activity_id") not in fresh_ids]
    recent.sort(key=lambda e: _utc(e.get("started_at")) or now, reverse=True)
    result.pending_total = len(list(_pending_col(user_id).stream()))
    _conn_ref(user_id).update({
        "processed_ids": processed[-PROCESSED_KEEP:],
        "last_sync_at": now,
        "status": "connected",
        "last_error": "; ".join(result.errors)[:500] or None,
        "last_summary": {"imported": len(result.imported), "pending": result.pending, "skipped": result.skipped,
                         "errors": len(result.errors)},
        "recent_activity": recent[:LOG_KEEP],
    })
    logger.info(f"Garmin sync for {user_id}: {len(result.imported)} imported, {result.pending} to review, "
                f"{result.skipped} skipped, {len(result.errors)} errors")
    return result
