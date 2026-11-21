#!/usr/bin/env python3
"""
Garmin Personal API spike (Phase 0 of plans/garmin-integration-plan.md).

Answers one question before any real build work: do activities pulled through
the official Garmin Personal API contain usable strength sets (exercise, reps,
weight) and cardio summaries?

What it does, read-only:
  1. Exchanges your Personal API key for a 24h access token.
  2. Lists your most recent activities.
  3. Downloads the original file (ZIP containing a .FIT) for the newest
     strength activity and the newest cardio activity.
  4. Parses each FIT file and writes a report.

Your key is read from the GARMIN_PERSONAL_API_KEY environment variable. It is
never printed or written to disk, and neither is the access token.

Usage (on your own computer):
    pip install requests fitdecode==0.11.0
    export GARMIN_PERSONAL_API_KEY='...'        # PowerShell: $env:GARMIN_PERSONAL_API_KEY='...'
    python backend/scripts/garmin_spike.py

Options:
    --limit N         how many recent activities to list (default 30)
    --out DIR         output folder (default ./garmin-spike-output, gitignored)
    --activity-id ID  also download/parse this specific activity
    --base-url URL    API host override (default https://personal.connectapi.garmin.com)

Output folder:
    report.md                human-readable summary (share this)
    report.json              same data, machine-readable (share this)
    activities.json          the activity list as returned by Garmin
    <id>.zip / <id>.fit      the raw files. Cardio files contain GPS tracks;
                             only share them if you are fine with that.
"""

import argparse
import io
import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("Missing dependency: pip install requests")

DEFAULT_BASE_URL = "https://personal.connectapi.garmin.com"
TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token"
ACTIVITY_SEARCH_PATH = "/activitylist-service/activities/search/activities"
ACTIVITY_PATH = "/activity-service/activity/{id}"
ACTIVITY_WORKOUTS_PATH = "/activity-service/activity/{id}/workouts"
ACTIVITY_SETS_PATH = "/activity-service/activity/{id}/exerciseSets"
DOWNLOAD_PATH = "/download-service/files/activity/{id}"

STRENGTH_TYPE_KEYS = {"strength_training", "indoor_strength_training"}
TIMEOUT = 60


class SpikeError(Exception):
    pass


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class GarminPersonalClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        # Accept anything: Garmin answers 406 to a strict JSON-only Accept header.
        self.session.headers["Accept"] = "*/*"
        self.token = self._exchange_key(api_key)
        self.session.headers["Authorization"] = f"Bearer {self.token}"

    def _exchange_key(self, api_key: str) -> str:
        resp = requests.post(
            self.base_url + TOKEN_PATH,
            headers={"Authorization": f"ApiKey {api_key}", "Accept": "*/*"},
            timeout=TIMEOUT,
        )
        if resp.status_code in (401, 403):
            raise SpikeError(
                f"Token exchange rejected ({resp.status_code}). Check the key is "
                "copied fully, not expired, and not deleted."
            )
        if not resp.ok:
            raise SpikeError(f"Token exchange failed: HTTP {resp.status_code} {resp.text[:300]}")
        try:
            body = resp.json()
        except ValueError:
            body = None
        token = None
        if isinstance(body, dict):
            for k in ("access_token", "accessToken", "token"):
                if body.get(k):
                    token = body[k]
                    break
            # Record the response shape (keys only, never values) for the plan.
            self.token_response_keys = sorted(body.keys())
            self.token_expires = body.get("expires_in") or body.get("expiresIn")
        elif resp.text.strip():
            token = resp.text.strip().strip('"')
            self.token_response_keys = ["<plain text>"]
            self.token_expires = None
        if not token:
            raise SpikeError("Token exchange succeeded but no token found in the response.")
        return token

    def get(self, path: str, **params):
        return self.session.get(self.base_url + path, params=params or None, timeout=TIMEOUT)


# --------------------------------------------------------------------------
# FIT parsing
# --------------------------------------------------------------------------

def _plain(value):
    """Make fitdecode values JSON-safe."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, bytes):
        return value.hex()
    return value


def parse_fit(fit_bytes: bytes) -> dict:
    try:
        import fitdecode
    except ImportError:
        raise SpikeError("Missing dependency: pip install fitdecode==0.11.0")

    message_counts = {}
    sessions, sets, exercise_titles, workout_steps, laps = [], [], [], [], []
    file_id = {}

    with fitdecode.FitReader(io.BytesIO(fit_bytes)) as reader:
        for frame in reader:
            if not isinstance(frame, fitdecode.FitDataMessage):
                continue
            name = frame.name
            message_counts[name] = message_counts.get(name, 0) + 1
            fields = {f.name: _plain(f.value) for f in frame.fields}
            if name == "set":
                sets.append(fields)
            elif name == "session":
                sessions.append(fields)
            elif name == "exercise_title":
                exercise_titles.append(fields)
            elif name == "workout_step":
                workout_steps.append(fields)
            elif name == "lap":
                laps.append(fields)
            elif name == "file_id" and not file_id:
                file_id = fields

    active_sets = [s for s in sets if str(s.get("set_type", "")).lower() not in ("rest", "1")]
    return {
        "file_id": file_id,
        "message_counts": dict(sorted(message_counts.items())),
        "sessions": sessions,
        "sets_total": len(sets),
        "sets_active": len(active_sets),
        "sets": sets,
        "exercise_titles": exercise_titles,
        "workout_steps": workout_steps,
        "lap_count": len(laps),
    }


def extract_fit(blob: bytes) -> bytes:
    """Garmin returns a ZIP for the original file; fall back to raw FIT."""
    if blob[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            fits = [n for n in zf.namelist() if n.lower().endswith(".fit")]
            if not fits:
                raise SpikeError(f"ZIP has no .fit file (contains: {zf.namelist()})")
            return zf.read(fits[0])
    if blob[8:12] == b".FIT":
        return blob
    raise SpikeError("Downloaded file is neither a ZIP nor a FIT file.")


# --------------------------------------------------------------------------
# Spike
# --------------------------------------------------------------------------

def type_key(activity: dict) -> str:
    t = activity.get("activityType") or {}
    return (t.get("typeKey") or "").lower()


def probe(client, path: str) -> dict:
    """Try an endpoint and record status and top-level shape, not contents."""
    try:
        r = client.get(path)
    except requests.RequestException as e:
        return {"path": path, "error": str(e)}
    info = {"path": path, "status": r.status_code}
    if r.ok:
        try:
            body = r.json()
            info["shape"] = sorted(body.keys()) if isinstance(body, dict) else f"list[{len(body)}]"
        except ValueError:
            info["shape"] = "non-json"
    return info


def analyse_activity(client, activity: dict, out_dir: Path) -> dict:
    act_id = activity.get("activityId")
    result = {
        "activity_id": act_id,
        "name": activity.get("activityName"),
        "type_key": type_key(activity),
        "start_local": activity.get("startTimeLocal"),
        "duration_s": activity.get("duration"),
        "summary_fields": sorted(k for k, v in activity.items() if v is not None),
        "probes": [
            probe(client, ACTIVITY_PATH.format(id=act_id)),
            probe(client, ACTIVITY_WORKOUTS_PATH.format(id=act_id)),
            probe(client, ACTIVITY_SETS_PATH.format(id=act_id)),
        ],
    }
    r = client.get(DOWNLOAD_PATH.format(id=act_id))
    result["download_status"] = r.status_code
    result["download_content_type"] = r.headers.get("Content-Type")
    if not r.ok:
        result["error"] = f"download failed: HTTP {r.status_code}"
        return result
    (out_dir / f"{act_id}.zip").write_bytes(r.content)
    try:
        fit = extract_fit(r.content)
        (out_dir / f"{act_id}.fit").write_bytes(fit)
        result["fit"] = parse_fit(fit)
    except (SpikeError, zipfile.BadZipFile) as e:
        result["error"] = str(e)
    except Exception as e:  # parser errors on unexpected files
        result["error"] = f"FIT parse failed: {type(e).__name__}: {e}"
    return result


def kg_to_lbs(v):
    return round(v * 2.20462, 1) if isinstance(v, (int, float)) else v


def render_markdown(report: dict) -> str:
    lines = ["# Garmin spike report", "", f"Generated {report['generated_at']}", ""]
    lines += ["## Auth", "",
              f"- Token response keys: `{report['token_response_keys']}`",
              f"- Token expiry field: `{report['token_expires']}`", ""]
    lines += ["## Recent activities", "",
              f"- Listed: {report['activity_count']}",
              f"- Types: {report['type_counts']}", ""]
    for label in ("strength", "cardio", "requested"):
        a = report.get(label)
        if not a:
            continue
        lines += [f"## {label.title()}: {a.get('name')} ({a.get('type_key')}, {a.get('start_local')})", ""]
        lines += [f"- Endpoint probes: " + ", ".join(f"`{p['path'].split('/')[-1]}`={p.get('status', p.get('error'))}" for p in a["probes"])]
        lines += [f"- Download: HTTP {a.get('download_status')} ({a.get('download_content_type')})"]
        if a.get("error"):
            lines += [f"- **Error:** {a['error']}", ""]
            continue
        fit = a["fit"]
        lines += [f"- FIT messages: {fit['message_counts']}",
                  f"- Sets: {fit['sets_active']} active / {fit['sets_total']} total",
                  f"- Exercise titles: {len(fit['exercise_titles'])}", ""]
        if fit["sessions"]:
            s = fit["sessions"][0]
            keep = ["sport", "sub_sport", "start_time", "total_elapsed_time", "total_timer_time",
                    "total_distance", "total_calories", "avg_heart_rate", "max_heart_rate",
                    "total_ascent", "enhanced_avg_speed", "avg_cadence"]
            lines += ["Session: " + ", ".join(f"{k}={s.get(k)}" for k in keep if k in s), ""]
        if fit["sets"]:
            lines += ["| # | type | category | subtype | reps | weight kg | weight lb | duration s |",
                      "|---|---|---|---|---|---|---|---|"]
            for i, st in enumerate(fit["sets"], 1):
                lines.append(
                    f"| {i} | {st.get('set_type')} | {st.get('category')} | {st.get('category_subtype')} | "
                    f"{st.get('repetitions')} | {st.get('weight')} | {kg_to_lbs(st.get('weight'))} | {st.get('duration')} |"
                )
            lines.append("")
    lines += ["## Verdict checklist", "",
              "- [ ] Strength FIT has `set` messages with reps",
              "- [ ] Weights match what was entered on the watch",
              "- [ ] Exercise category/subtype is present and recognisable",
              "- [ ] Cardio session has duration, distance, HR, calories", ""]
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--out", default="garmin-spike-output")
    ap.add_argument("--activity-id", type=int)
    ap.add_argument("--base-url", default=os.environ.get("GARMIN_API_BASE", DEFAULT_BASE_URL))
    args = ap.parse_args(argv)

    api_key = os.environ.get("GARMIN_PERSONAL_API_KEY", "").strip()
    if not api_key:
        print("Set GARMIN_PERSONAL_API_KEY first (see the top of this file).", file=sys.stderr)
        return 2

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        print("1/4 Exchanging key for access token...")
        client = GarminPersonalClient(args.base_url, api_key)

        print(f"2/4 Listing last {args.limit} activities...")
        r = client.get(ACTIVITY_SEARCH_PATH, start=0, limit=args.limit)
        if not r.ok:
            raise SpikeError(f"Activity search failed: HTTP {r.status_code} {r.text[:300]}")
        activities = r.json()
        if isinstance(activities, dict):  # tolerate a wrapped list
            activities = activities.get("activityList") or activities.get("activities") or []
        (out_dir / "activities.json").write_text(json.dumps(activities, indent=2, default=str))

        type_counts = {}
        for a in activities:
            type_counts[type_key(a)] = type_counts.get(type_key(a), 0) + 1

        strength = next((a for a in activities if type_key(a) in STRENGTH_TYPE_KEYS), None)
        cardio = next((a for a in activities if type_key(a) and type_key(a) not in STRENGTH_TYPE_KEYS), None)

        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "base_url": args.base_url,
            "token_response_keys": client.token_response_keys,
            "token_expires": client.token_expires,
            "activity_count": len(activities),
            "type_counts": type_counts,
        }

        print("3/4 Downloading and parsing activity files...")
        if strength:
            report["strength"] = analyse_activity(client, strength, out_dir)
        else:
            print("    No strength activity in the recent list; try a larger --limit.")
        if cardio:
            report["cardio"] = analyse_activity(client, cardio, out_dir)
        if args.activity_id:
            report["requested"] = analyse_activity(client, {"activityId": args.activity_id}, out_dir)

        print("4/4 Writing report...")
        (out_dir / "report.json").write_text(json.dumps(report, indent=2, default=str))
        (out_dir / "report.md").write_text(render_markdown(report))
    except SpikeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except requests.RequestException as e:
        print(f"ERROR: network problem: {e}", file=sys.stderr)
        return 1

    print(f"\nDone. Share {out_dir / 'report.md'} and {out_dir / 'report.json'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
