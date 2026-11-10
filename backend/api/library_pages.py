"""
Workout Library Pages — server-rendered, SEO-indexable HTML.

    /free-workouts                  combined hub
    /tabata-workouts                Tabata hub (grouped by focus)
    /tabata-workouts/{slug}         one Tabata workout
    /spin-workouts                  Spin hub (grouped by difficulty)
    /spin-workouts/{slug}           one Spin ride

Rendered with Jinja (not filled in by JS) so search engines get the title,
description, full breakdown and structured data in the initial HTML.
"""

import json
import logging
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..services.workout_library_service import (
    FOCUS_LABELS,
    entry_path,
    length_bucket,
    plan_minutes,
    player_path,
    site_base_url,
    tabata_exercises,
    type_hub_path,
    workout_library_service,
)
from .workout_library import card

router = APIRouter(tags=["Workout Library Pages"])
logger = logging.getLogger(__name__)

_env = Environment(
    loader=FileSystemLoader(str(Path(__file__).resolve().parent.parent / "templates" / "library")),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)

TYPE_INFO = {
    "tabata": {
        "name": "Kettlebell Tabata Workouts",
        "short": "Tabata",
        "noun": "Tabata",
        "icon": "bx-dumbbell",
        "description": ("Free kettlebell Tabata workouts with a built-in interval timer. "
                        "20/10 and 40/20 protocols for full body, lower body, upper body, core and "
                        "conditioning. Print any workout for the gym."),
        "intro": ("Tabata is short, hard interval training: work all-out for a set time, rest briefly, "
                  "and repeat. Every workout here uses a single kettlebell, lists every round, and "
                  "runs on our free timer or prints on one page."),
        "category_order": ["Full Body", "Lower Body", "Upper Body", "Chest", "Back", "Core",
                           "Conditioning", "Mixed Focus"],
    },
    "spin": {
        "name": "Spin Bike Workouts",
        "short": "Spin",
        "noun": "Ride",
        "icon": "bx-cycling",
        "description": ("Free indoor cycling and spin bike workouts with resistance and RPM targets for "
                        "every interval. Easy to intense rides from 20 to 60 minutes, with a ride timer "
                        "and printable sheets."),
        "intro": ("Structured spin rides for any indoor bike. Each ride lists every block with a "
                  "resistance level (1–10) and a cadence range, so you always know what to do next. "
                  "Ride it with our timer or print it for the gym."),
        "category_order": ["Easy", "Moderate", "Hard", "Intense"],
    },
}


def _fmt_time(seconds: int) -> str:
    seconds = int(seconds or 0)
    return f"{seconds // 60}:{seconds % 60:02d}"


_env.filters["mmss"] = _fmt_time

_SIDE_RE = re.compile(r"\((left|right|l|r|both)\)", re.IGNORECASE)


def _exercise_href(name: str) -> str:
    """Exercise database deep link (same as ExerciseLink.href in exercise-link.js)."""
    clean = re.sub(r"\s+", " ", _SIDE_RE.sub("", name or "")).strip()
    return f"/exercise-database.html?find={quote(clean)}"


_env.filters["exercise_href"] = _exercise_href


def _group(cards: List[Dict[str, Any]], order: List[str]) -> "OrderedDict[str, List[Dict[str, Any]]]":
    groups: "OrderedDict[str, List[Dict[str, Any]]]" = OrderedDict()
    for name in order:
        groups[name] = []
    for c in cards:
        groups.setdefault(c["category"] or "Other", []).append(c)
    return OrderedDict((k, v) for k, v in groups.items() if v)


def _render(template: str, status_code: int = 200, **ctx: Any) -> HTMLResponse:
    ctx.setdefault("base_url", site_base_url())
    html = _env.get_template(template).render(**ctx)
    return HTMLResponse(content=html, status_code=status_code)


def _breadcrumbs(base: str, items: List[tuple]) -> Dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": f"{base}{path}"}
            for i, (name, path) in enumerate(items)
        ],
    }


def _item_list(base: str, cards: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{base}{c['url']}", "name": c["title"]}
            for i, c in enumerate(cards)
        ],
    }


def _json_ld(*blocks: Dict[str, Any]) -> List[str]:
    # Escape "</" so a title can never close the <script> tag early.
    return [json.dumps(b, ensure_ascii=False).replace("</", "<\\/") for b in blocks]


# ── Hubs ─────────────────────────────────────────────────────────────────


@router.get("/free-workouts", response_class=HTMLResponse)
async def free_workouts_hub():
    base = site_base_url()
    sections = []
    all_cards = []
    for wtype in ("tabata", "spin"):
        cards = [card(e) for e in workout_library_service.list_published(wtype)]
        all_cards.extend(cards)
        sections.append({
            "type": wtype,
            "info": TYPE_INFO[wtype],
            "hub_url": type_hub_path(wtype),
            "groups": _group(cards, TYPE_INFO[wtype]["category_order"]),
            "count": len(cards),
        })
    return _render(
        "hub.html",
        title="Free Tabata & Spin Workouts with Timer",
        description=("Free kettlebell Tabata and spin bike workouts. Every workout has a built-in "
                     "interval timer and a printable one-page sheet for the gym."),
        canonical=f"{base}/free-workouts",
        sections=sections,
        json_ld=_json_ld(
            _breadcrumbs(base, [("Home", "/"), ("Free Workouts", "/free-workouts")]),
            _item_list(base, all_cards),
        ),
    )


async def _type_hub(wtype: str) -> HTMLResponse:
    base = site_base_url()
    info = TYPE_INFO[wtype]
    cards = [card(e) for e in workout_library_service.list_published(wtype)]
    lengths = OrderedDict()
    for bucket in ("Under 15 min", "15–25 min", "25–40 min", "40+ min"):
        n = sum(1 for c in cards if c["length"] == bucket)
        if n:
            lengths[bucket] = n
    return _render(
        "type_hub.html",
        title=f"Free {info['name']}",
        description=info["description"],
        canonical=f"{base}{type_hub_path(wtype)}",
        wtype=wtype,
        info=info,
        groups=_group(cards, info["category_order"]),
        lengths=lengths,
        count=len(cards),
        json_ld=_json_ld(
            _breadcrumbs(base, [("Home", "/"), ("Free Workouts", "/free-workouts"),
                                (info["name"], type_hub_path(wtype))]),
            _item_list(base, cards),
        ),
    )


@router.get("/tabata-workouts", response_class=HTMLResponse)
async def tabata_hub():
    return await _type_hub("tabata")


@router.get("/spin-workouts", response_class=HTMLResponse)
async def spin_hub():
    return await _type_hub("spin")


# ── Workout pages ────────────────────────────────────────────────────────


def _tabata_view(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Group a tabata plan into sets of rounds for the breakdown table."""
    sets: "OrderedDict[int, Dict[str, Any]]" = OrderedDict()
    for seg in plan.get("segments") or []:
        s = sets.setdefault(seg.get("set_index") or 1, {"rounds": [], "rest_after": 0})
        if seg.get("segment_type") == "work":
            s["rounds"].append({
                "exercise": seg.get("exercise") or seg.get("name"),
                "cue": seg.get("cue") or "",
                "side": seg.get("side"),
                "work": seg.get("duration_seconds"),
            })
        elif seg.get("segment_type") == "rest" and s["rounds"]:
            s["rounds"][-1]["rest"] = seg.get("duration_seconds")
        elif seg.get("segment_type") == "set_rest":
            s["rest_after"] = seg.get("duration_seconds") or 0
    work, rest = (plan.get("protocol") or "20/10").split("/")
    sets_list = list(sets.values())
    return {
        "sets": sets_list,
        "set_rest": max((s["rest_after"] for s in sets_list), default=0),
        # rounds + one heading per set — the print sheet packs tighter past ~30
        "sheet_rows": sum(len(s["rounds"]) for s in sets_list) + len(sets_list),
        "work": work,
        "rest": rest,
        "exercises": tabata_exercises(plan),
        "focus": [FOCUS_LABELS.get(f, f) for f in plan.get("focus_areas") or []],
    }


def _spin_view(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Segments with start times + an SVG-ready intensity profile."""
    rows, t = [], 0
    total = max(1, plan.get("total_seconds") or sum(s.get("duration_seconds") or 0
                                                     for s in plan.get("segments") or []))
    bars, x = [], 0.0
    for seg in plan.get("segments") or []:
        dur = seg.get("duration_seconds") or 0
        rows.append({**seg, "start": t})
        width = dur / total * 100
        bars.append({"x": round(x, 3), "w": round(max(width - 0.3, 0.2), 3),
                     "h": (seg.get("resistance") or 1) * 10,
                     "kind": seg.get("segment_type") or "flat", "label": seg.get("name")})
        x += width
        t += dur
    return {"rows": rows, "bars": bars, "sheet_rows": len(rows) + 1,
            "peak": max((s.get("resistance") or 0 for s in plan.get("segments") or []), default=0)}


def _related(entry: Dict[str, Any], limit: int = 4) -> List[Dict[str, Any]]:
    others = [e for e in workout_library_service.list_published(entry["type"]) if e["id"] != entry["id"]]
    category = (entry.get("seo") or {}).get("category")
    others.sort(key=lambda e: ((e.get("seo") or {}).get("category") != category,
                               abs(plan_minutes(e["plan"]) - plan_minutes(entry["plan"]))))
    return [card(e) for e in others[:limit]]


async def _workout_page(wtype: str, slug: str) -> HTMLResponse:
    base = site_base_url()
    info = TYPE_INFO[wtype]
    entry = workout_library_service.get_by_slug(wtype, slug)
    if not entry or entry.get("status") != "published":
        return _render(
            "not_found.html", status_code=404,
            title="Workout not found", description=info["description"],
            canonical=f"{base}{type_hub_path(wtype)}", info=info, hub_url=type_hub_path(wtype),
            robots="noindex", json_ld=[],
        )

    plan = entry["plan"]
    seo = entry.get("seo") or {}
    minutes = plan_minutes(plan)
    url = f"{base}{entry_path(entry)}"
    view = _tabata_view(plan) if wtype == "tabata" else _spin_view(plan)

    exercise_plan = {
        "@context": "https://schema.org",
        "@type": "ExercisePlan",
        "name": seo.get("title") or plan.get("title"),
        "description": seo.get("summary", ""),
        "url": url,
        "activityDuration": f"PT{minutes}M",
        "exerciseType": "Tabata interval training" if wtype == "tabata" else "Indoor cycling",
        "intensity": plan.get("difficulty") or "High",
    }
    if wtype == "tabata":
        exercise_plan["repetitions"] = f"{plan.get('sets')} sets x {plan.get('rounds_per_set')} rounds"
        exercise_plan["additionalVariable"] = f"{plan.get('protocol')} seconds work/rest"

    return _render(
        "workout.html",
        title=seo.get("title") or plan.get("title"),
        description=seo.get("summary", ""),
        canonical=url,
        og_type="article",
        wtype=wtype,
        info=info,
        entry=entry,
        seo=seo,
        plan=plan,
        view=view,
        minutes=minutes,
        length=length_bucket(minutes),
        hub_url=type_hub_path(wtype),
        play_url=player_path(entry),
        page_url=url,
        related=_related(entry),
        json_ld=_json_ld(
            exercise_plan,
            _breadcrumbs(base, [("Home", "/"), ("Free Workouts", "/free-workouts"),
                                (info["name"], type_hub_path(wtype)),
                                (seo.get("title") or plan.get("title"), entry_path(entry))]),
        ),
    )


@router.get("/tabata-workouts/{slug}", response_class=HTMLResponse)
async def tabata_workout_page(slug: str):
    return await _workout_page("tabata", slug)


@router.get("/spin-workouts/{slug}", response_class=HTMLResponse)
async def spin_workout_page(slug: str):
    return await _workout_page("spin", slug)


def library_sitemap_urls() -> List[tuple]:
    """(path, lastmod_date_or_None, priority, changefreq) for /sitemap.xml."""
    urls = [("/free-workouts", None, "0.9", "weekly"),
            ("/tabata-workouts", None, "0.9", "weekly"),
            ("/spin-workouts", None, "0.9", "weekly")]
    for entry in workout_library_service.list_published():
        updated = entry.get("updated_at") or entry.get("created_at")
        lastmod: Optional[str] = updated.date().isoformat() if hasattr(updated, "date") else None
        urls.append((entry_path(entry), lastmod, "0.7", "monthly"))
    return urls
