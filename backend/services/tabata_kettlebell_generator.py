"""
Tabata Kettlebell Generator - Uses Google Gemini to create structured
tabata-style kettlebell workouts.

Terminology (Tabata standard):
  - Work Interval  = 20s (or 40s) all-out effort
  - Rest Interval  = 10s (or 20s) recovery between rounds
  - Round          = one Work Interval + one Rest Interval
  - Set            = a group of rounds (classic Tabata = 8 rounds per set)
  - Set Rest       = recovery between Tabata sets

The controller/UI decides the timing structure (sets, rounds_per_set, set rests) from
user inputs. This service asks the AI ONLY for the creative content — exercise selection
and coaching cues — then expands that into a flat list of segments with precise durations.
"""

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


# ── System prompt ──────────────────────────────────────────────────────────

_BASE_PROMPT = """You are an elite kettlebell conditioning coach in the style of Onnit Academy,
Rogue Fitness, and the top kettlebell-focused YouTube channels (StrongFirst, Kettlebell Kings,
Mark Wildman, Heavy Metal Strength Training, Joe Daniels). Your job is to program a TABATA-style
kettlebell workout using the STANDARD TABATA STRUCTURE:

  - 20s Work Interval  (or 40s for the 40/20 protocol)
  - 10s Rest Interval  (or 20s for the 40/20 protocol)
  - 8 Rounds           = one Tabata SET  (4 minutes for 20/10)
  - Multiple Sets make up the full workout, separated by a Set Rest.

So one "Round" = one Work Interval + one Rest Interval.
One "Set" = {rounds_per_set} rounds back-to-back.

═══════════════════════════════════════════════════════════════════
YOUR JOB
═══════════════════════════════════════════════════════════════════
The controller has already decided the timing. You will be told the protocol (either 20s work /
10s rest, or 40s work / 20s rest), the number of Sets, and the Rounds-per-Set count. Your only
job is to fill in the EXERCISES and CUES for each Work Interval. Do NOT return timing — just the
exercises and cues.

═══════════════════════════════════════════════════════════════════
SET STRUCTURE
═══════════════════════════════════════════════════════════════════
Every Set has a theme (e.g., "Lower Push", "Ballistic Swings", "Upper Pull + Core").
Group complementary exercises within a Set so the athlete can settle into a groove.
Across Sets, rotate themes so the whole body gets worked (unless the focus is narrow).

For 8-round Sets, a classic kettlebell tabata pattern is:
- 8 × SAME exercise (pure tabata — hardest, simplest)
- 4 × A, 4 × B  (couplet)
- 2 × (A + B + C + D)  (4-exercise round robin)
- 8 × alternating L/R on a unilateral lift (one side per round)

For 4- or 6-round Sets, prefer SAME exercise or a couplet.
For 10- or 12-round Sets, use round-robins or ladder patterns.

SIDE HANDLING (unilateral exercises — KB snatch, clean, press, row, single-arm swing, TGU,
windmill, halo, suitcase carry): alternate L / R across consecutive rounds. Mark `side`
as "left" or "right". For bilateral exercises (two-handed swing, goblet squat, thruster,
sumo deadlift, plank pulls), set `side` to null.

═══════════════════════════════════════════════════════════════════
KETTLEBELL EXERCISE LIBRARY BY FOCUS AREA
═══════════════════════════════════════════════════════════════════

LOWER_BODY (legs, hips, glutes):
  Goblet Squat · Two-Hand Swing · Sumo Deadlift High Pull · KB Front Squat (2 KB) ·
  KB Lunge (forward/reverse/cossack) · KB Step-Up · KB Box Squat · KB Deadlift ·
  KB Swing (heavy, two-hand) · KB Single-Leg Deadlift · KB Goblet Lunge ·
  KB Bulgarian Split Squat · KB Kickstand Deadlift

UPPER_BODY (shoulders, arms, overall push/pull):
  KB Strict Press · KB Push Press · KB Clean · KB Clean and Press · KB Snatch ·
  KB Row (single-arm or two-hand) · KB High Pull · KB Renegade Row ·
  KB Floor Press · KB Z-Press · KB Halo · KB Around-the-Body Pass · KB Upright Row

CHEST (pressing focus):
  KB Floor Press · KB Single-Arm Floor Press · KB Push-Up on KB · KB Bent Press ·
  KB Z-Press · KB Svend Press · KB Crush Grip Press · KB Chest-Supported Row

BACK (pulling focus):
  KB Bent-Over Row · KB Single-Arm Row · KB Renegade Row · KB High Pull ·
  KB Dead Stop Row · KB Good Morning · KB Romanian Deadlift · KB Pendlay Row ·
  KB Gorilla Row · KB Bat Wing · KB Suitcase Carry

CORE (rotational + anti-rotation + flexion):
  KB Russian Twist · KB Windmill · KB Turkish Get-Up · KB Halo ·
  KB Dead Bug with KB · KB Plank Pull-Through · KB Side Bend · KB Suitcase Carry ·
  KB Seated Press Out · KB Half-Kneeling Chop · KB V-Up Pass

FULL_BODY (compound/total-body):
  KB Clean and Press · KB Snatch · KB Thruster · KB Clean to Squat · KB Swing to Squat ·
  KB Turkish Get-Up · KB Man Maker · KB Snatch to Overhead Reverse Lunge ·
  KB Burpee with Clean · KB Swing + Squat combo

CONDITIONING (metabolic, high heart-rate):
  Two-Hand Swing · KB Snatch · KB High Pull · KB Thruster · KB Clean and Jerk ·
  KB Burpee · KB Swing to Squat · KB Figure 8 · KB Mountain Climber with KB ·
  KB Russian Swing + Jumping Jack

═══════════════════════════════════════════════════════════════════
NO WARMUP
═══════════════════════════════════════════════════════════════════
Do NOT include a warmup. The athlete is already warmed up before starting. Jump straight
into Set 1 — pick exercises for Set 1 that start at a manageable intensity if the workout
will be long, but there is no warmup block.

═══════════════════════════════════════════════════════════════════
COACHING CUES
═══════════════════════════════════════════════════════════════════
Keep cues under 120 characters. Make them:
- Instructional ("Snap your hips, not your arms" / "Pack the lat before you row")
- Motivational ("Own the rest, crush the next rep")
- Form-focused ("Neutral spine", "Fist over elbow", "Stand tall at the top")
Never repeat the same cue across a workout.

═══════════════════════════════════════════════════════════════════
RESPONSE FORMAT (strict JSON)
═══════════════════════════════════════════════════════════════════
{{
  "title": "Creative workout name (e.g., 'Iron Cardio Tabata', 'Swing City', 'Heavy Metal 20:10')",
  "sets": [
    {{
      "set_name": "Set 1 — Ballistic Hips",
      "rounds": [
        {{ "exercise": "Two-Hand KB Swing", "cue": "Snap the hips at the top", "side": null }},
        {{ "exercise": "Two-Hand KB Swing", "cue": "Pack your lats, breathe behind the shield", "side": null }}
      ]
    }}
  ],
  "estimated_calories": <number>
}}

CRITICAL:
- You MUST return exactly {sets_count} Sets.
- Each Set MUST contain exactly {rounds_per_set} Rounds.
- Do NOT include rest or set_rest entries — only Work Intervals. The controller inserts rests.
- Every Round MUST include an "exercise" string; "cue" and "side" are optional but preferred.
- Focus on the user's requested focus areas: {focus_summary}
- Protocol is {protocol} ({work_label} work / {rest_label} rest).
- Total Sets: {sets_count}. Rounds per Set: {rounds_per_set}.
{exercise_constraints}"""


@dataclass
class TabataKettlebellGeneratorConfig:
    """Configuration for tabata kettlebell generator."""
    model: str = "gemini-2.5-flash-lite"
    max_output_tokens: int = 4096
    temperature: float = 0.8


def _protocol_seconds(protocol: str) -> tuple[int, int]:
    """Return (work_seconds, rest_seconds) for the protocol."""
    if protocol == "40/20":
        return (40, 20)
    return (20, 10)


def _build_prompt(
    protocol: str,
    focus_areas: List[str],
    sets: int,
    rounds_per_set: int,
    include_exercises: List[str] | None = None,
    exclude_exercises: List[str] | None = None,
) -> str:
    """Build the system prompt injecting the user's chosen workout parameters."""
    work, rest = _protocol_seconds(protocol)
    focus_summary = ", ".join(focus_areas).replace("_", " ")

    # Build exercise-constraint block. Each line is optional — only included
    # when the user has picked something. Kept short so the AI treats them as
    # hard constraints rather than suggestions.
    constraint_lines: List[str] = []
    if include_exercises:
        inc = ", ".join(include_exercises)
        constraint_lines.append(
            f"- MUST include each of these exercises at least once across the "
            f"workout: {inc}. Spread them across different sets if possible."
        )
    if exclude_exercises:
        exc = ", ".join(exclude_exercises)
        constraint_lines.append(
            f"- Do NOT use any of these exercises under any circumstances: "
            f"{exc}. Pick alternatives from the focus-area library."
        )
    exercise_constraints = ("\n".join(constraint_lines) + "\n") if constraint_lines else ""

    return _BASE_PROMPT.format(
        sets_count=sets,
        rounds_per_set=rounds_per_set,
        protocol=protocol,
        work_label=f"{work}s",
        rest_label=f"{rest}s",
        focus_summary=focus_summary,
        exercise_constraints=exercise_constraints,
    )


class TabataKettlebellGenerator:
    """Generates structured tabata kettlebell workouts using Gemini AI."""

    SET_REST_SECONDS = 60  # 60s rest between Tabata sets

    def __init__(self, api_key: str = None):
        self.config = TabataKettlebellGeneratorConfig()
        self.client = None
        self._api_key = api_key

    def _get_client(self):
        """Lazy-initialize the Gemini client."""
        if self.client is None:
            from google import genai
            key = self._api_key or os.getenv("GEMINI_API_KEY")
            if not key:
                raise ValueError("GEMINI_API_KEY not configured")
            self.client = genai.Client(api_key=key)
        return self.client

    def is_available(self) -> bool:
        """Check if the generator is configured and available."""
        return bool(self._api_key or os.getenv("GEMINI_API_KEY"))

    def generate(
        self,
        protocol: str,
        focus_areas: List[str],
        sets: int,
        rounds_per_set: int = 8,
        include_exercises: List[str] | None = None,
        exclude_exercises: List[str] | None = None,
    ) -> Dict[str, Any]:
        """
        Generate a tabata kettlebell workout plan.

        Args:
            protocol: "20/10" or "40/20"
            focus_areas: list of focus area keys (upper_body, lower_body, etc.)
            sets: number of Tabata sets (1-12)
            rounds_per_set: rounds per set (default 8 — classic Tabata)
            include_exercises: optional list of exercises the AI must use
            exclude_exercises: optional list of exercises the AI must skip

        Returns:
            Dict matching TabataKettlebellPlan schema.
        """
        try:
            from google.genai import types

            client = self._get_client()
            include_exercises = include_exercises or []
            exclude_exercises = exclude_exercises or []
            system_instruction = _build_prompt(
                protocol, focus_areas, sets, rounds_per_set,
                include_exercises=include_exercises,
                exclude_exercises=exclude_exercises,
            )
            focus_human = ", ".join(a.replace("_", " ") for a in focus_areas)
            user_prompt_parts = [
                f"Program a {protocol} tabata kettlebell workout with exactly {sets} "
                f"Sets of {rounds_per_set} Rounds each. Focus areas: {focus_human}."
            ]
            if include_exercises:
                user_prompt_parts.append(
                    f"MUST include: {', '.join(include_exercises)}."
                )
            if exclude_exercises:
                user_prompt_parts.append(
                    f"NEVER use: {', '.join(exclude_exercises)}."
                )
            user_prompt_parts.append("Return JSON only.")
            user_prompt = " ".join(user_prompt_parts)

            response = client.models.generate_content(
                model=self.config.model,
                contents=[user_prompt],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=self.config.temperature,
                    max_output_tokens=self.config.max_output_tokens,
                ),
            )

            response_text = response.text.strip()
            logger.info(
                f"Gemini tabata-kettlebell response length: {len(response_text)} chars"
            )
            parsed = json.loads(response_text)

            return self._normalize_plan(
                parsed, protocol, focus_areas, sets, rounds_per_set
            )

        except json.JSONDecodeError as e:
            logger.error(f"Tabata KB generator: AI returned invalid JSON: {e}")
            raise ValueError("AI returned an unexpected format — please try again")
        except Exception as e:
            logger.error(
                f"Tabata KB generator error: {type(e).__name__}: {e}", exc_info=True
            )
            raise

    def _normalize_plan(
        self,
        raw: Dict[str, Any],
        protocol: str,
        focus_areas: List[str],
        sets: int,
        rounds_per_set: int,
    ) -> Dict[str, Any]:
        """
        Convert AI response into a flat segment list with controller-computed timings.
        Auto-pads/trims the AI's sets and rounds so the shape is always valid.
        """
        work_sec, rest_sec = _protocol_seconds(protocol)

        title = str(raw.get("title") or "Tabata Kettlebell Workout")[:80]

        # Support both the new shape ({sets:[{set_name, rounds:[...]}]}) and the
        # legacy shape ({rounds:[{round_name, intervals:[...]}]}) in case the AI
        # returns either. Pad/trim to exact counts.
        ai_sets: List[Dict[str, Any]] = list(raw.get("sets") or raw.get("rounds") or [])
        while len(ai_sets) < sets:
            ai_sets.append({"set_name": f"Set {len(ai_sets) + 1}", "rounds": []})
        ai_sets = ai_sets[:sets]

        segments: List[Dict[str, Any]] = []

        # No warmup — athlete is assumed already warmed up. Jump straight into Set 1.

        for s_idx, st in enumerate(ai_sets):
            set_name = str(st.get("set_name") or st.get("round_name") or f"Set {s_idx + 1}")[:60]
            rounds_in_set = list(st.get("rounds") or st.get("intervals") or [])
            # Pad if AI returned too few
            while len(rounds_in_set) < rounds_per_set:
                rounds_in_set.append({
                    "exercise": rounds_in_set[-1].get("exercise") if rounds_in_set else "Two-Hand KB Swing",
                    "cue": "Stay strong.",
                    "side": None,
                })
            rounds_in_set = rounds_in_set[:rounds_per_set]

            for r_idx, rnd in enumerate(rounds_in_set):
                exercise = str(rnd.get("exercise") or "KB Work")[:60]
                cue = str(rnd.get("cue") or "")[:140]
                side = rnd.get("side")
                if side not in (None, "left", "right", "both"):
                    side = None

                label = exercise
                if side in ("left", "right"):
                    label = f"{exercise} ({side[0].upper()})"

                # Work Interval
                segments.append({
                    "name": label,
                    "segment_type": "work",
                    "duration_seconds": work_sec,
                    "exercise": exercise,
                    "cue": cue,
                    "side": side,
                    "set_index": s_idx + 1,
                    "round_index": r_idx,
                })

                # Rest Interval
                segments.append({
                    "name": "Rest",
                    "segment_type": "rest",
                    "duration_seconds": rest_sec,
                    "exercise": "",
                    "cue": "Breathe. Reset your grip.",
                    "side": None,
                    "set_index": s_idx + 1,
                    "round_index": r_idx,
                })

            # Set rest (not after last set)
            if s_idx < sets - 1:
                segments.append({
                    "name": f"{set_name} — Set Rest",
                    "segment_type": "set_rest",
                    "duration_seconds": self.SET_REST_SECONDS,
                    "exercise": "",
                    "cue": "Shake it out. Chalk up for the next set.",
                    "side": None,
                    "set_index": s_idx + 1,
                    "round_index": rounds_per_set,
                })

        total_seconds = sum(s["duration_seconds"] for s in segments)
        estimated_calories = raw.get("estimated_calories")
        try:
            estimated_calories = int(estimated_calories) if estimated_calories else None
        except (TypeError, ValueError):
            estimated_calories = None
        if estimated_calories is None:
            # rough estimate: ~10 kcal/min for kettlebell tabata
            estimated_calories = max(1, round(total_seconds / 60 * 10))

        return {
            "title": title,
            "protocol": protocol,
            "focus_areas": focus_areas,
            "sets": sets,
            "rounds_per_set": rounds_per_set,
            "total_seconds": total_seconds,
            "segments": segments,
            "estimated_calories": estimated_calories,
        }


# ── Singleton ─────────────────────────────────────────────────────────────

_generator_instance = None


def get_tabata_kettlebell_generator() -> TabataKettlebellGenerator:
    """Get or create the singleton TabataKettlebellGenerator instance."""
    global _generator_instance
    if _generator_instance is None:
        _generator_instance = TabataKettlebellGenerator()
    return _generator_instance
