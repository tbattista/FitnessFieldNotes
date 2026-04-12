"""
Tabata Kettlebell Generator - Uses Google Gemini to create structured
tabata-style kettlebell workouts.

The controller/UI decides the timing structure (warmup, rounds, intervals,
inter-round rests) from user inputs. This service asks the AI ONLY for
the creative content — exercise selection and coaching cues — then expands
that into a flat list of segments with precise durations.
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
kettlebell workout: short, sharp, all-effort intervals with a clear focus and good exercise flow.

═══════════════════════════════════════════════════════════════════
PROTOCOL
═══════════════════════════════════════════════════════════════════
The controller has already decided the timing. You will be told the protocol (either 20s work /
10s rest, or 40s work / 20s rest), the number of rounds, and the intervals-per-round count. Your
only job is to fill in the EXERCISES and CUES for each work interval. Do NOT return timing —
just the exercises and cues.

═══════════════════════════════════════════════════════════════════
ROUND STRUCTURE
═══════════════════════════════════════════════════════════════════
Every round has a theme (e.g., "Lower Push", "Ballistic Swings", "Upper Pull + Core").
Group complementary exercises within a round so the athlete can settle into a groove.
Across rounds, rotate themes so the whole body gets worked (unless the focus is narrow).

For 8-interval rounds, a classic kettlebell tabata pattern is:
- 8 × SAME exercise (pure tabata — hardest, simplest)
- 4 × A, 4 × B  (couplet)
- 2 × (A + B + C + D)  (4-exercise round robin)
- 8 × alternating L/R on a unilateral lift (one side per interval)

For 4- or 6-interval rounds, prefer SAME exercise or a couplet.
For 10- or 12-interval rounds, use round-robins or ladder patterns.

SIDE HANDLING (unilateral exercises — KB snatch, clean, press, row, single-arm swing, TGU,
windmill, halo, suitcase carry): alternate L / R across consecutive intervals. Mark `side`
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
into Round 1 — pick exercises for Round 1 that start at a manageable intensity if the
workout will be long, but there is no warmup block.

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
  "rounds": [
    {{
      "round_name": "Round 1 — Ballistic Hips",
      "intervals": [
        {{ "exercise": "Two-Hand KB Swing", "cue": "Snap the hips at the top", "side": null }},
        {{ "exercise": "Two-Hand KB Swing", "cue": "Pack your lats, breathe behind the shield", "side": null }}
      ]
    }}
  ],
  "estimated_calories": <number>
}}

CRITICAL:
- You MUST return exactly {rounds_count} rounds.
- Each round MUST contain exactly {intervals_per_round} intervals.
- Do NOT include rest or round_rest entries — only work intervals. The controller inserts rests.
- Every interval MUST include an "exercise" string; "cue" and "side" are optional but preferred.
- Focus on the user's requested focus areas: {focus_summary}
- Protocol is {protocol} ({work_label} work / {rest_label} rest).
- Total rounds: {rounds_count}. Intervals per round: {intervals_per_round}.
"""


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
    rounds: int,
    intervals_per_round: int,
) -> str:
    """Build the system prompt injecting the user's chosen workout parameters."""
    work, rest = _protocol_seconds(protocol)
    focus_summary = ", ".join(focus_areas).replace("_", " ")

    return _BASE_PROMPT.format(
        rounds_count=rounds,
        intervals_per_round=intervals_per_round,
        protocol=protocol,
        work_label=f"{work}s",
        rest_label=f"{rest}s",
        focus_summary=focus_summary,
    )


class TabataKettlebellGenerator:
    """Generates structured tabata kettlebell workouts using Gemini AI."""

    ROUND_REST_SECONDS = 60  # 60s rest between rounds

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
        rounds: int,
        intervals_per_round: int = 8,
    ) -> Dict[str, Any]:
        """
        Generate a tabata kettlebell workout plan.

        Args:
            protocol: "20/10" or "40/20"
            focus_areas: list of focus area keys (upper_body, lower_body, etc.)
            rounds: number of tabata rounds (1-12)
            intervals_per_round: intervals per round (default 8)

        Returns:
            Dict matching TabataKettlebellPlan schema.
        """
        try:
            from google.genai import types

            client = self._get_client()
            system_instruction = _build_prompt(
                protocol, focus_areas, rounds, intervals_per_round
            )
            focus_human = ", ".join(a.replace("_", " ") for a in focus_areas)
            user_prompt = (
                f"Program a {protocol} tabata kettlebell workout with exactly {rounds} "
                f"rounds of {intervals_per_round} intervals each. Focus areas: {focus_human}. "
                f"Return JSON only."
            )

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
                parsed, protocol, focus_areas, rounds, intervals_per_round
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
        rounds: int,
        intervals_per_round: int,
    ) -> Dict[str, Any]:
        """
        Convert AI response into a flat segment list with controller-computed timings.
        Auto-pads/trims the AI's rounds and intervals so the shape is always valid.
        """
        work_sec, rest_sec = _protocol_seconds(protocol)

        title = str(raw.get("title") or "Tabata Kettlebell Workout")[:80]

        # Get rounds, pad/trim to exact shape
        ai_rounds: List[Dict[str, Any]] = list(raw.get("rounds") or [])
        while len(ai_rounds) < rounds:
            ai_rounds.append({"round_name": f"Round {len(ai_rounds) + 1}", "intervals": []})
        ai_rounds = ai_rounds[:rounds]

        segments: List[Dict[str, Any]] = []

        # No warmup — athlete is assumed already warmed up. Jump straight into Round 1.

        for r_idx, rnd in enumerate(ai_rounds):
            round_name = str(rnd.get("round_name") or f"Round {r_idx + 1}")[:60]
            intervals = list(rnd.get("intervals") or [])
            # Pad if AI returned too few
            while len(intervals) < intervals_per_round:
                intervals.append({
                    "exercise": intervals[-1].get("exercise") if intervals else "Two-Hand KB Swing",
                    "cue": "Stay strong.",
                    "side": None,
                })
            intervals = intervals[:intervals_per_round]

            for i_idx, iv in enumerate(intervals):
                exercise = str(iv.get("exercise") or "KB Work")[:60]
                cue = str(iv.get("cue") or "")[:140]
                side = iv.get("side")
                if side not in (None, "left", "right", "both"):
                    side = None

                label = exercise
                if side in ("left", "right"):
                    label = f"{exercise} ({side[0].upper()})"

                # Work interval
                segments.append({
                    "name": label,
                    "segment_type": "work",
                    "duration_seconds": work_sec,
                    "exercise": exercise,
                    "cue": cue,
                    "side": side,
                    "round_index": r_idx + 1,
                    "interval_index": i_idx,
                })

                # Rest interval
                segments.append({
                    "name": "Rest",
                    "segment_type": "rest",
                    "duration_seconds": rest_sec,
                    "exercise": "",
                    "cue": "Breathe. Reset your grip.",
                    "side": None,
                    "round_index": r_idx + 1,
                    "interval_index": i_idx,
                })

            # Round rest (not after last round)
            if r_idx < rounds - 1:
                segments.append({
                    "name": f"{round_name} — Round Rest",
                    "segment_type": "round_rest",
                    "duration_seconds": self.ROUND_REST_SECONDS,
                    "exercise": "",
                    "cue": "Shake it out. Chalk up for the next round.",
                    "side": None,
                    "round_index": r_idx + 1,
                    "interval_index": intervals_per_round,
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
            "rounds": rounds,
            "intervals_per_round": intervals_per_round,
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
