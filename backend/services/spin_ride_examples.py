"""
Spin Ride Examples — Fetch highly-rated, admin-approved ride plans from
Firestore so they can be injected as few-shot examples into the AI
generation prompt.

The query is gated on `adminReviewed == True AND goodExample == True` so
only curated rides influence future generations. Without admin curation,
fetch_top_examples returns [] and the prompt is unchanged.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Tuple

from .firebase_service import firebase_service

logger = logging.getLogger(__name__)

FEEWSHOT_ENV_FLAG = "SPIN_RIDE_FEWSHOT_ENABLED"
COLLECTION_NAME = "spin_ride_feedback"
CACHE_TTL_SECONDS = 15 * 60
DURATION_TOLERANCE_MINUTES = 10
MIN_RATING_FOR_EXAMPLE = 4

# Cache: (duration_bucket, difficulty) -> (timestamp, examples)
_cache: Dict[Tuple[int, str], Tuple[float, List[Dict[str, Any]]]] = {}


def _is_enabled() -> bool:
    return os.getenv(FEEWSHOT_ENV_FLAG, "true").lower() not in ("0", "false", "no")


def _bucket(duration_minutes: int) -> int:
    """Round duration to the nearest 5 minutes for cache key stability."""
    return int(round(duration_minutes / 5.0) * 5)


def fetch_top_examples(
    duration_minutes: int,
    difficulty: str,
    limit: int = 2,
) -> List[Dict[str, Any]]:
    """
    Return up to `limit` admin-approved highly-rated ride plans matching the
    requested duration (+/- DURATION_TOLERANCE_MINUTES) and difficulty.

    Each returned item is the raw `ridePlanSnapshot` field from the
    spin_ride_feedback document — the same shape as a SpinRidePlan.
    """
    if not _is_enabled():
        return []
    if not firebase_service.is_available():
        return []

    cache_key = (_bucket(duration_minutes), difficulty)
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1][:limit]

    try:
        db = firebase_service.get_firestore()
        # Compound filter via repeated .where() calls — this is the
        # firebase-admin SDK pattern. We pull a small page and filter the
        # duration in Python to avoid composite-index requirements.
        query = (
            db.collection(COLLECTION_NAME)
            .where("difficulty", "==", difficulty)
            .where("adminReviewed", "==", True)
            .where("goodExample", "==", True)
            .where("rating", ">=", MIN_RATING_FOR_EXAMPLE)
            .limit(20)
        )
        docs = list(query.stream())
    except Exception as e:
        logger.warning(f"spin_ride_examples: Firestore fetch failed: {e}")
        # Cache the empty result briefly so we don't hammer Firestore on
        # repeated errors.
        _cache[cache_key] = (now, [])
        return []

    candidates: List[Dict[str, Any]] = []
    for doc in docs:
        data = doc.to_dict() or {}
        snapshot = data.get("ridePlanSnapshot")
        if not isinstance(snapshot, dict):
            continue
        snap_minutes = snapshot.get("duration_minutes")
        if not isinstance(snap_minutes, int):
            continue
        if abs(snap_minutes - duration_minutes) > DURATION_TOLERANCE_MINUTES:
            continue
        candidates.append(snapshot)

    # Closest duration first.
    candidates.sort(key=lambda s: abs(int(s.get("duration_minutes", 0)) - duration_minutes))
    _cache[cache_key] = (now, candidates)

    if candidates:
        logger.info(
            f"spin_ride_examples: injecting {min(limit, len(candidates))} "
            f"example(s) for {duration_minutes}min {difficulty} ride"
        )
    return candidates[:limit]


def clear_cache() -> None:
    """Test helper — drop the in-memory cache."""
    _cache.clear()
