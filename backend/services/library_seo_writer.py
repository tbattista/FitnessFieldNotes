"""
Library SEO Writer — one small AI call per published workout that writes the
search-facing copy (page title, slug, meta description, intro paragraphs).

Called once at publish time and stored, never per page view. Falls back to the
deterministic copy in workout_library_service.fallback_seo when Gemini is not
configured or the call fails.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

from .workout_library_service import fallback_seo, plan_minutes, tabata_exercises

logger = logging.getLogger(__name__)

MODEL = "gemini-2.5-flash-lite"

_SYSTEM = """You write SEO copy for a free workout website (Fitness Field Notes).
Given one workout, return JSON with exactly these keys:
  "title":   page title, 40-65 chars, includes the length in minutes and the workout type
             (e.g. "20-Minute Full Body Kettlebell Tabata"). No site name.
  "slug":    lowercase-hyphenated URL slug, 3-8 words, keyword-first, no dates.
  "summary": meta description, 130-155 chars, concrete (length, format, key moves), no hype.
  "intro":   array of 2-3 short paragraphs (each 1-3 sentences): who it's for and what it trains,
             how the structure works, one practical tip (weight choice / resistance / pacing).
Write plainly and specifically. Never invent equipment or moves that are not in the workout.
Do not use the words "ultimate", "crush", or "killer"."""


def _describe(workout_type: str, plan: Dict[str, Any]) -> str:
    minutes = plan_minutes(plan)
    if workout_type == "tabata":
        return (f"Kettlebell Tabata, {minutes} minutes, protocol {plan.get('protocol')} "
                f"(work/rest seconds), {plan.get('sets')} sets x {plan.get('rounds_per_set')} rounds, "
                f"focus: {', '.join(plan.get('focus_areas') or [])}. "
                f"Moves: {', '.join(tabata_exercises(plan))}. Original title: {plan.get('title')}")
    blocks = "; ".join(
        f"{s.get('name')} {s.get('duration_seconds')}s R{s.get('resistance')} "
        f"{s.get('rpm_low')}-{s.get('rpm_high')}rpm"
        for s in plan.get("segments") or []
    )
    return (f"Indoor cycling / spin ride, {minutes} minutes, difficulty {plan.get('difficulty')}. "
            f"Blocks: {blocks}. Original title: {plan.get('title')}")


def write_seo(workout_type: str, plan: Dict[str, Any]) -> Dict[str, Any]:
    """Return SEO fields for a workout (AI-written when possible)."""
    base = fallback_seo(workout_type, plan)
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return base
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=key)
        response = client.models.generate_content(
            model=MODEL,
            contents=[_describe(workout_type, plan)],
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM,
                response_mime_type="application/json",
                temperature=0.6,
                max_output_tokens=800,
            ),
        )
        data = json.loads(response.text.strip())
        return _merge(base, data)
    except Exception as e:
        logger.warning(f"library SEO writer failed, using fallback copy: {type(e).__name__}: {e}")
        return base


def _merge(base: Dict[str, Any], data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return base
    out = dict(base)
    title = data.get("title")
    if isinstance(title, str) and 10 <= len(title.strip()) <= 80:
        out["title"] = title.strip()
    slug = data.get("slug")
    if isinstance(slug, str) and slug.strip():
        out["slug"] = slug.strip()
    summary = data.get("summary")
    if isinstance(summary, str) and 50 <= len(summary.strip()) <= 300:
        out["summary"] = summary.strip()
    intro = data.get("intro")
    if isinstance(intro, list):
        paras = [p.strip() for p in intro if isinstance(p, str) and p.strip()][:3]
        if paras:
            out["intro"] = paras
    return out
