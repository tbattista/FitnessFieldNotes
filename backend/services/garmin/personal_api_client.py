"""
Client for Garmin's Personal API (personal.connectapi.garmin.com).

The Personal API key is exchanged for an access token (valid 24h, no refresh
token). Tokens are cached in memory per key. Endpoint paths match Garmin's own
connect-personal-api client and were confirmed by the Phase 0 spike.
"""

import hashlib
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

BASE_URL = "https://personal.connectapi.garmin.com"
TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token"
ACTIVITY_SEARCH_PATH = "/activitylist-service/activities/search/activities"
DOWNLOAD_PATH = "/download-service/files/activity/{id}"

TOKEN_TTL_SECONDS = 23 * 3600   # Garmin says 24h; refresh an hour early
TIMEOUT = httpx.Timeout(60.0, connect=15.0)

_token_cache: Dict[str, Tuple[str, float]] = {}


class GarminApiError(Exception):
    """Garmin answered with an error we can't recover from in this run."""


class GarminAuthError(GarminApiError):
    """The key was rejected: expired, deleted, or mistyped."""


class GarminRateLimited(GarminApiError):
    """Garmin is throttling requests; try later."""


def _cache_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def forget_token(api_key: str) -> None:
    _token_cache.pop(_cache_key(api_key), None)


def activity_start(activity: Dict[str, Any]) -> Optional[datetime]:
    """UTC start time from an activity-list entry."""
    gmt = activity.get("startTimeGMT")
    if gmt:
        try:
            return datetime.strptime(gmt, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    begin = activity.get("beginTimestamp")
    if isinstance(begin, (int, float)):
        return datetime.fromtimestamp(begin / 1000, tz=timezone.utc)
    return None


def _raise_for(resp: httpx.Response, what: str) -> None:
    if resp.status_code in (401, 403):
        raise GarminAuthError("Garmin rejected the API key. It may have expired or been deleted.")
    if resp.status_code == 429:
        raise GarminRateLimited("Garmin is limiting requests right now. Try again in a few minutes.")
    if resp.status_code >= 400:
        raise GarminApiError(f"Garmin {what} failed (HTTP {resp.status_code}).")


class PersonalApiClient:
    def __init__(self, api_key: str, base_url: str = BASE_URL, transport: Optional[httpx.BaseTransport] = None):
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        # Accept anything: Garmin answers 406 to a strict JSON-only Accept header.
        return httpx.AsyncClient(base_url=self.base_url, timeout=TIMEOUT, transport=self._transport,
                                 headers={"Accept": "*/*"})

    async def token(self, force: bool = False) -> str:
        ck = _cache_key(self.api_key)
        cached = _token_cache.get(ck)
        if cached and not force and cached[1] > time.time():
            return cached[0]
        async with self._client() as c:
            resp = await c.post(TOKEN_PATH, headers={"Authorization": f"ApiKey {self.api_key}"})
        _raise_for(resp, "sign-in")
        token = None
        try:
            body = resp.json()
            if isinstance(body, dict):
                token = body.get("access_token") or body.get("accessToken") or body.get("token")
            elif isinstance(body, str):
                token = body
        except ValueError:
            token = resp.text.strip().strip('"')
        if not token:
            raise GarminApiError("Garmin sign-in returned no token.")
        _token_cache[ck] = (token, time.time() + TOKEN_TTL_SECONDS)
        return token

    async def _get(self, path: str, what: str, **params) -> httpx.Response:
        for attempt in (1, 2):
            token = await self.token(force=attempt == 2)
            async with self._client() as c:
                resp = await c.get(path, params=params or None, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code == 401 and attempt == 1:
                continue  # cached token may have been revoked; get a fresh one once
            _raise_for(resp, what)
            return resp
        raise GarminAuthError("Garmin rejected the API key.")

    async def list_activities(self, limit: int = 50, start: int = 0) -> List[Dict[str, Any]]:
        """Newest first. `start` skips that many activities (paging)."""
        resp = await self._get(ACTIVITY_SEARCH_PATH, "activity list", start=start, limit=limit)
        body = resp.json()
        if isinstance(body, dict):
            body = body.get("activityList") or body.get("activities") or []
        return body if isinstance(body, list) else []

    async def download_original(self, activity_id: int) -> bytes:
        resp = await self._get(DOWNLOAD_PATH.format(id=int(activity_id)), "file download")
        return resp.content
