"""
Spin Ride Generator - Uses Google Gemini to create structured spin bike interval workouts.
Generates ride plans with resistance levels, RPM targets, and coaching cues.
"""

import json
import logging
import os
from dataclasses import dataclass
from typing import Dict, Any

logger = logging.getLogger(__name__)

# ── System prompt ─────────────────────────────────────────────────────────

_BASE_PROMPT = """You are an elite indoor cycling instructor — think Peloton, Apple Fitness+, or SoulCycle caliber.
Generate a structured spin ride plan that feels like a REAL studio class with dramatic energy arcs, clear contrast between work and rest, and proper periodization.

═══════════════════════════════════════════════════════════════════
RIDE STRUCTURE RULES
═══════════════════════════════════════════════════════════════════
1. Always start with a WARM-UP (2-4 min for short rides, 4-5 min for 30+ min rides).
2. Do NOT include a cool-down — the rider cools down on their own. End on the final working effort.
3. The sum of ALL segment durations MUST equal exactly (duration_minutes × 60) seconds.
4. Segment durations: 30-240 seconds (except all-outs: 15-45s).

═══════════════════════════════════════════════════════════════════
ENERGY CURVE — THIS IS THE MOST IMPORTANT CONCEPT
═══════════════════════════════════════════════════════════════════
Every great spin class follows a ROLLER-COASTER energy curve, NOT a flat line.
The ride should have DRAMATIC peaks and valleys — not stay in the middle zone.

Pattern for rides by length:
• 10-15 min: Warm-up → ONE build/peak cycle → final push
• 20-25 min: Warm-up → Build → Peak → Recovery valley → Higher peak → Final push
• 30-45 min: Warm-up → Build 1 → Peak 1 → Recovery → Build 2 → Peak 2 (higher) → Recovery → Final peak (highest) → Final push
• 45-60 min: 3-4 build/peak cycles, each one peaking higher or differently than the last
• 60+ min: 4-5 cycles with variety (one climb-focused, one sprint-focused, one mixed)

KEY RULE — CONTRAST IS EVERYTHING:
- Recovery segments MUST truly be easy: resistance 2-3, RPM 70-85. Let the rider fully catch their breath.
- Peak efforts MUST truly be hard: climbs at resistance 7-9 (RPM 60-75), sprints at resistance 5-7 (RPM 100-120).
- The GAP between recovery and peak resistance should be at least 4-5 points.
- Never let the ride sit at resistance 5-6 for more than 2 consecutive segments — that creates the "too average" feel.

═══════════════════════════════════════════════════════════════════
SEGMENT TYPES AND RANGES
═══════════════════════════════════════════════════════════════════
- warmup: Resistance 2-4, RPM 80-90. Progressive warm-up — start at 2, build to 4 by end.
- flat: Resistance 4-6, RPM 85-100. Steady moderate effort, like a flat road. Use for building INTO a peak.
- climb: Resistance 6-9, RPM 55-80. Heavy resistance, slow grind. The bread and butter of peaks.
    • Seated climb: R6-7, RPM 65-80 (moderate climb)
    • Standing climb: R7-9, RPM 55-70 (heavy — use "standing, heavy legs" cues)
- sprint: Resistance 4-7, RPM 100-120. Fast cadence bursts, legs spinning fast.
    • Light sprint: R4-5, RPM 100-110 (speed work)
    • Power sprint: R6-7, RPM 95-110 (heavy and fast — very demanding)
- recovery: Resistance 2-3, RPM 70-85. TRUE rest — easy spin, catch your breath, heart rate drops.
    • Recovery MUST be genuinely easy. Don't set recovery at R4-5 — that's still working.
    • Recovery duration: 30-90s after moderate efforts, 60-120s after peak efforts.
- (do NOT use the "cooldown" segment type)
{all_out_segment_type}

═══════════════════════════════════════════════════════════════════
RESISTANCE SCALE (1-10) — PERCEIVED EFFORT
═══════════════════════════════════════════════════════════════════
1-2: Almost no resistance, legs spinning freely (warm-up/recovery only)
3:   Light, easy conversational pace (recovery)
4:   Moderate-light, can hold a conversation (easy flat road)
5:   Moderate, talking in short sentences (working flat)
6:   Moderate-hard, a few words at a time (tempo / light climb)
7:   Hard, breathing heavy, focused effort (seated climb / power sprint)
8:   Very hard, can only say one or two words (standing climb)
9:   Near-max, legs burning, cannot speak (peak effort climb)
10:  Absolute maximum, unsustainable (all-out only)

{all_out_rules}
═══════════════════════════════════════════════════════════════════
INTERVAL PATTERNS — USE THESE IN YOUR RIDES
═══════════════════════════════════════════════════════════════════
Mix these patterns within a ride for variety. Don't use the same pattern twice in a row.

• ROLLING HILLS: Flat → Climb (moderate) → Recovery → Climb (harder) → Recovery
    Good for: moderate/hard rides, middle sections
• LADDER BUILD: 30s sprint → recovery → 45s sprint → recovery → 60s sprint → recovery
    Good for: sprint-focused sections, building intensity
• HEAVY CLIMB BLOCK: Seated climb R7 → Standing climb R8 → Standing climb R9 → Recovery
    Good for: hard/intense rides, peak effort blocks
• SURGE INTERVALS: Flat at R5 → 30s surge to R7 → back to R5 → 30s surge to R8 → recovery
    Good for: moderate rides, creating short bursts within a steady effort
• ATTACK SERIES: Sprint 30s → Recovery 30s → Sprint 30s → Recovery 30s (repeat 3-4x)
    Good for: HIIT-style segments in hard/intense rides

{difficulty_instructions}
═══════════════════════════════════════════════════════════════════
COACHING CUE GUIDELINES
═══════════════════════════════════════════════════════════════════
- Keep cues brief (under 120 chars), motivational, and instructional
- Reference body position: "seated", "standing", "out of the saddle", "hands wide on the bars"
- Reference breathing: "steady breaths", "breathe through it", "exhale on each push"
- Reference effort feel: "find your rhythm", "push through", "legs are heavy but strong"
- On climbs: "sit heavy in the saddle", "drive through your heels", "imagine the hill steepening"
- On sprints: "light on the saddle", "spin those legs", "quick feet, stay in control"
- On recovery: "shake it out", "easy spin, let your heart rate come down", "you earned this rest"
- Vary the cues — never repeat the same one within a ride

═══════════════════════════════════════════════════════════════════
CALORIE ESTIMATE
═══════════════════════════════════════════════════════════════════
Roughly 8-12 calories per minute depending on difficulty (easy=8, moderate=9, hard=11, intense=12).

═══════════════════════════════════════════════════════════════════
RESPONSE FORMAT (strict JSON)
═══════════════════════════════════════════════════════════════════
{{
  "title": "Ride name — be creative (e.g., 'Rolling Thunder', 'Summit Push', 'Cadence Burner')",
  "duration_minutes": <requested duration>,
  "total_seconds": <must equal duration_minutes × 60>,
  "segments": [
    {{
      "name": "Warm Up",
      "segment_type": "warmup",
      "duration_seconds": 180,
      "resistance": 3,
      "rpm_low": 80,
      "rpm_high": 90,
      "cue": "Easy spin, find your rhythm"
    }}
  ],
  "estimated_calories": <number>,
  "difficulty": "{difficulty_value}"
}}

CRITICAL: The total_seconds and sum of all segment duration_seconds MUST equal exactly (duration_minutes × 60). Count carefully.
CRITICAL: Do NOT include any cool-down segment. The last segment should be a working effort.
CRITICAL: Ensure HIGH CONTRAST — recovery must be truly easy (R2-3), peaks must be truly hard (R7-9). Avoid everything clustering around R5-6.
"""


_ALL_OUT_SEGMENT_DESC = (
    '- all_out: Resistance 5-8, RPM 110-130. Unsustainable maximum-effort burst '
    '(15-45 seconds). Always follow an all_out with a recovery or flat segment '
    'so the rider can catch their breath.'
)

# ── Difficulty-specific instructions ─────────────────────────────────────
# These are detailed "ride profiles" based on how real studio classes are
# programmed (Peloton, Apple Fitness+, SoulCycle). They serve as working
# reference data so the AI uses explicit structure rather than vague training
# data. Each profile specifies resistance ranges, recovery ratios, segment
# mix, and an example energy curve.

_DIFFICULTY_PROFILES = {
    "easy": """
DIFFICULTY: EASY (Beginner / Low Impact)
Target rider: New to spin, returning from injury, or active recovery day.
Resistance range: 2-6 (never exceed 6). Average resistance ~3.5-4.
RPM range: 70-100 (no high-cadence sprints above 100).

RIDE FEEL: Gentle rolling hills. Comfortable the whole time. Rider should be able to
hold a conversation throughout. Think "scenic Sunday ride" — pleasant, never punishing.

SEGMENT MIX:
- 60-70% flat road and easy pedaling (R3-5, RPM 80-95)
- 15-20% gentle climbs (R5-6, RPM 65-80 — seated only, no standing)
- 15-20% recovery (R2-3, RPM 70-85)
- NO sprints above RPM 100, NO standing climbs
- Recovery segments should be generous (60-120s)

ENERGY CURVE: Mostly flat with gentle rolling undulations. No dramatic peaks.
Example 20-min easy ride:
  Warm Up (R2-3, 3min) → Easy Flat (R4, 3min) → Gentle Climb (R5, 2min) →
  Recovery (R2, 1.5min) → Flat Road (R4, 2.5min) → Moderate Hill (R5-6, 2min) →
  Recovery (R2, 1.5min) → Steady Ride (R4, 2.5min) → Easy Push (R5, 2min)
""",

    "moderate": """
DIFFICULTY: MODERATE (Intermediate)
Target rider: Regular exerciser, comfortable on the bike, wants a solid workout.
Resistance range: 2-8 (peaks at 7-8 on hardest climbs). Average resistance ~5.
RPM range: 65-115.

RIDE FEEL: A proper workout with clear highs and lows. Rider is working hard during
peaks but gets genuine recovery between efforts. Think "Peloton 30-min Pop Ride" —
fun, engaging, challenging but not crushing.

SEGMENT MIX:
- 30-40% flat/steady effort (R4-6, RPM 85-100)
- 25-30% climbs (R6-8, RPM 60-80 — mix of seated and a few standing moments)
- 15-20% sprints (R4-6, RPM 100-115)
- 15-20% recovery (R2-3, RPM 70-85)
- Work-to-recovery ratio: ~3:1 (3 min work → 1 min recovery)

ENERGY CURVE: Clear roller-coaster. Two peaks for 20-min rides, 2-3 for 30-min.
Example 20-min moderate ride:
  Warm Up (R3, 3min) → Flat Build (R5, 2min) → Seated Climb (R7, 1.5min) →
  Recovery (R2, 1min) → Sprint (R5/105rpm, 1min) → Flat (R5, 1.5min) →
  Standing Climb (R8, 1.5min) → Recovery (R2, 1min) → Sprint (R5/110rpm, 1min) →
  Heavy Climb (R7, 1.5min) → Power Push (R6, 1min) → Final Sprint (R5/115rpm, 1.5min)
""",

    "hard": """
DIFFICULTY: HARD (Advanced)
Target rider: Experienced cyclist, looking for a serious challenge.
Resistance range: 2-9 (peaks at 8-9, recoveries drop to 2-3). Average resistance ~6.
RPM range: 55-120.

RIDE FEEL: Demanding. Long climbs that burn, sprint intervals that spike your heart rate,
and short recovery windows that don't quite let you fully catch your breath before the
next push. Think "Peloton 45-min HIIT & Hills" — you earn every recovery.

SEGMENT MIX:
- 20-25% flat/tempo (R5-7, RPM 85-100 — these are not easy, they're working flats)
- 35-40% climbs (R7-9, RPM 55-80 — heavy, lots of standing)
- 15-20% sprints (R5-7, RPM 100-120 — including power sprints at higher resistance)
- 10-15% recovery (R2-3, RPM 70-85 — shorter than moderate, 30-60s typical)
- Work-to-recovery ratio: ~5:1 (5 min work → 1 min recovery)

ENERGY CURVE: Aggressive peaks with short valleys. Each cycle peaks harder.
Example 20-min hard ride:
  Warm Up (R3, 2.5min) → Seated Climb (R7, 1.5min) → Standing Climb (R8, 1min) →
  Recovery (R2, 45s) → Power Sprint (R6/110rpm, 1min) → Sprint (R5/115rpm, 45s) →
  Recovery (R2, 30s) → Heavy Climb (R8, 1.5min) → Standing Push (R9, 1min) →
  Recovery (R2, 45s) → Attack Sprint (R6/115rpm, 1min) → Seated Climb (R8, 1.5min) →
  Standing Climb (R9, 1.5min) → Final Sprint (R7/105rpm, 1min) → Peak Push (R8, 1.5min)
""",

    "intense": """
DIFFICULTY: INTENSE (Elite / Competition)
Target rider: Very fit cyclist, wants maximum output, race-day simulation.
Resistance range: 2-10 (peaks at 9-10, recoveries must still drop to 2-3). Average resistance ~7.
RPM range: 55-130.

RIDE FEEL: Brutal in the best way. Near-max climbs, tabata-style sprint intervals,
minimal recovery that's just enough to not completely break down. Every segment is
purposeful suffering. Think "Peloton Power Zone Max" or "SoulCycle double-tap" —
the kind of ride you talk about for days.

SEGMENT MIX:
- 10-15% flat/tempo (R6-8, RPM 85-100 — these are hard efforts, not "easy flat")
- 40-45% climbs (R8-10, RPM 55-75 — standing heavy, grinding, maximal)
- 20-25% sprints (R5-8, RPM 105-130 — fast AND heavy, power output sprints)
- 10-15% recovery (R2-3, RPM 70-85 — very short, 30-60s, just enough to survive)
- Work-to-recovery ratio: ~6:1 or higher

ENERGY CURVE: Relentless ascent with brief valleys. Think staircase pattern where
each step is higher. The final 3-4 minutes should be the hardest section of the ride.
Example 20-min intense ride:
  Warm Up (R3-4, 2min) → Tempo (R6, 1.5min) → Seated Climb (R8, 1min) →
  Standing Climb (R9, 1min) → Recovery (R2, 30s) → Power Sprint (R7/110rpm, 45s) →
  Sprint (R6/120rpm, 45s) → Recovery (R2, 30s) → Heavy Climb (R9, 1.5min) →
  Standing Grind (R10, 1min) → Recovery (R2, 30s) → Attack Series: Sprint (R7/115rpm, 30s) →
  Recovery (R2, 30s) → Sprint (R8/110rpm, 30s) → Recovery (R2, 30s) →
  Final Climb (R9, 1.5min) → Standing Max (R10, 1min) → Power Push (R8/105rpm, 1.5min) →
  Peak Sprint (R7/120rpm, 1min)
""",
}


def _all_out_count_for_duration(duration_minutes: int) -> tuple[int, int]:
    """Return the (min, max) all-out count for a ride of the given duration."""
    if duration_minutes <= 15:
        return (1, 2)
    if duration_minutes <= 25:
        return (2, 4)
    if duration_minutes <= 40:
        return (3, 6)
    if duration_minutes <= 60:
        return (4, 8)
    return (5, 10)


def _build_prompt(
    include_all_outs: bool,
    duration_minutes: int,
    difficulty: str | None = None,
) -> str:
    """Build the system prompt, injecting difficulty profile and optional all-out rules."""
    if include_all_outs:
        lo, hi = _all_out_count_for_duration(duration_minutes)
        all_out_rules = (
            "ALL-OUT SPRINT RULES (ENABLED FOR THIS RIDE):\n"
            f"- Include {lo} to {hi} \"all_out\" segments in this {duration_minutes}-minute ride.\n"
            "- Each all-out is a short (15-45 second) maximum-effort burst.\n"
            "- Place all-outs AFTER a climb or hard effort, as a finishing kick.\n"
            "- ALWAYS follow an all-out with a recovery or flat segment.\n"
            "- Space all-outs out across the ride — do not bunch them together.\n"
            "- Never start or end the ride with an all-out.\n\n"
        )
        all_out_segment_type = _ALL_OUT_SEGMENT_DESC
    else:
        all_out_rules = ""
        all_out_segment_type = '- (the "all_out" segment type is NOT enabled for this ride — do not use it)'

    # Select difficulty profile
    resolved_difficulty = difficulty or "moderate"
    difficulty_instructions = _DIFFICULTY_PROFILES.get(
        resolved_difficulty, _DIFFICULTY_PROFILES["moderate"]
    )

    return _BASE_PROMPT.format(
        all_out_segment_type=all_out_segment_type,
        all_out_rules=all_out_rules,
        difficulty_instructions=difficulty_instructions,
        difficulty_value=resolved_difficulty,
    )


@dataclass
class SpinRideGeneratorConfig:
    """Configuration for spin ride generator."""
    model: str = "gemini-2.5-flash-lite"
    max_output_tokens: int = 4096
    temperature: float = 0.7


class SpinRideGenerator:
    """Generates structured spin bike interval workouts using Gemini AI."""

    def __init__(self, api_key: str = None):
        self.config = SpinRideGeneratorConfig()
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
        duration_minutes: int,
        include_all_outs: bool = False,
        difficulty: str | None = None,
    ) -> Dict[str, Any]:
        """
        Generate a spin ride plan for the given duration.

        Args:
            duration_minutes: Ride duration in minutes (5-120)
            include_all_outs: If True, the generator may include short max-effort
                              "all-out" sprint segments, bounded by duration.
            difficulty: Requested difficulty level (easy/moderate/hard/intense).
                        If None, defaults to moderate.

        Returns:
            Dict matching SpinRidePlan schema
        """
        try:
            from google.genai import types

            client = self._get_client()
            target_seconds = duration_minutes * 60

            system_instruction = _build_prompt(include_all_outs, duration_minutes, difficulty)

            resolved_difficulty = difficulty or "moderate"
            user_prompt_parts = [
                f"Generate a {duration_minutes}-minute spin bike ride at {resolved_difficulty} difficulty.",
                f"Total seconds must be exactly {target_seconds}.",
                f"Follow the {resolved_difficulty.upper()} difficulty profile exactly — use the resistance ranges, recovery ratios, and energy curve specified.",
                "Ensure dramatic contrast between work segments and recovery segments.",
            ]
            if include_all_outs:
                lo, hi = _all_out_count_for_duration(duration_minutes)
                user_prompt_parts.append(
                    f"Include {lo} to {hi} all_out segments following hard efforts."
                )
            prompt = " ".join(user_prompt_parts)

            response = client.models.generate_content(
                model=self.config.model,
                contents=[prompt],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=self.config.temperature,
                    max_output_tokens=self.config.max_output_tokens,
                ),
            )

            response_text = response.text.strip()
            logger.info(f"Gemini spin ride response length: {len(response_text)} chars")
            parsed = json.loads(response_text)

            # Validate and fix segment timing
            parsed = self._normalize_plan(parsed, duration_minutes, include_all_outs, difficulty)
            return parsed

        except json.JSONDecodeError as e:
            logger.error(f"Spin ride generator: AI returned invalid JSON: {e}")
            logger.error(f"Raw response: {response_text[:500] if 'response_text' in dir() else 'N/A'}")
            raise ValueError("AI returned an unexpected format — please try again")
        except Exception as e:
            logger.error(f"Spin ride generator error: {type(e).__name__}: {e}", exc_info=True)
            raise

    def _normalize_plan(
        self,
        plan: Dict[str, Any],
        duration_minutes: int,
        include_all_outs: bool = False,
        requested_difficulty: str | None = None,
    ) -> Dict[str, Any]:
        """Validate and fix the generated plan to ensure correct timing and field types."""
        target_seconds = duration_minutes * 60
        segments = plan.get("segments", [])

        if not segments:
            raise ValueError("AI generated an empty ride plan")

        valid_types = {"warmup", "flat", "climb", "sprint", "all_out", "recovery", "cooldown"}
        valid_difficulties = {"easy", "moderate", "hard", "intense"}

        # Normalize each segment — ensure all required fields exist with correct types
        for seg in segments:
            seg["name"] = str(seg.get("name", "Interval"))[:50]
            seg["segment_type"] = seg.get("segment_type", "flat")
            if seg["segment_type"] not in valid_types:
                seg["segment_type"] = "flat"
            seg["duration_seconds"] = max(15, int(seg.get("duration_seconds", 60)))
            seg["resistance"] = max(1, min(10, int(seg.get("resistance", 5))))
            seg["rpm_low"] = max(50, min(130, int(seg.get("rpm_low", 80))))
            seg["rpm_high"] = max(50, min(130, int(seg.get("rpm_high", 100))))
            seg["cue"] = str(seg.get("cue", ""))[:120]
            if seg["rpm_low"] > seg["rpm_high"]:
                seg["rpm_low"], seg["rpm_high"] = seg["rpm_high"], seg["rpm_low"]

        # Defensive: the prompt says "no cooldown", but if the model still
        # emits a trailing cooldown segment, convert it to a recovery so the
        # ride still ends on a working effort (and total duration is preserved).
        while segments and segments[-1]["segment_type"] == "cooldown":
            last = segments[-1]
            last["segment_type"] = "recovery"
            if last["name"].lower() in {"cool down", "cooldown", "cool-down"}:
                last["name"] = "Final Recovery"

        # Defensive all-out handling
        if include_all_outs:
            # Cap the number of all-outs at the upper bound for this duration.
            _, max_all_outs = _all_out_count_for_duration(duration_minutes)
            all_out_count = 0
            for seg in segments:
                if seg["segment_type"] == "all_out":
                    all_out_count += 1
                    if all_out_count > max_all_outs:
                        seg["segment_type"] = "sprint"
                    else:
                        # Clamp duration to 15-45s range
                        seg["duration_seconds"] = max(15, min(45, seg["duration_seconds"]))
        else:
            # Opt-out: convert any stray all_out segments to sprint so the
            # schema stays clean even if the model ignored the instruction.
            for seg in segments:
                if seg["segment_type"] == "all_out":
                    seg["segment_type"] = "sprint"

        # The prompt says a ride should never END on an all_out. If the model
        # violated this, convert the trailing all_out to a sprint so the
        # timing-mismatch fix below is free to resize it without blowing past
        # the 45s all-out cap.
        if segments and segments[-1]["segment_type"] == "all_out":
            last = segments[-1]
            last["segment_type"] = "sprint"
            if last["name"].lower().startswith("all out") or last["name"].lower().startswith("all-out"):
                last["name"] = "Final Sprint"
            logger.info("Converted trailing all_out segment to sprint (rides must not end on an all-out)")

        # Fix timing mismatch by adjusting a non-all-out segment so we never
        # inflate an all_out past the 45s hard cap. Walk backwards from the
        # end to find the last segment we can safely resize.
        actual_total = sum(s["duration_seconds"] for s in segments)
        if actual_total != target_seconds:
            diff = target_seconds - actual_total
            adjust_idx = len(segments) - 1
            while adjust_idx >= 0 and segments[adjust_idx]["segment_type"] == "all_out":
                adjust_idx -= 1
            if adjust_idx >= 0:
                target_seg = segments[adjust_idx]
                adjusted = target_seg["duration_seconds"] + diff
                if adjusted >= 15:
                    target_seg["duration_seconds"] = adjusted
                    logger.info(
                        f"Adjusted segment '{target_seg['name']}' (idx {adjust_idx}) "
                        f"by {diff}s to match target duration"
                    )
                else:
                    logger.warning(f"Spin ride timing off by {diff}s, couldn't fix cleanly")
            else:
                logger.warning(
                    f"Spin ride timing off by {diff}s but all segments are all_outs; "
                    "refusing to adjust and violate the all-out duration cap"
                )

        # Ensure top-level fields
        plan["title"] = str(plan.get("title", f"{duration_minutes}-Minute Spin Ride"))[:80]
        plan["duration_minutes"] = duration_minutes
        plan["total_seconds"] = target_seconds
        plan["segments"] = segments
        plan["estimated_calories"] = int(plan["estimated_calories"]) if plan.get("estimated_calories") else None
        # Honor the user's requested difficulty; fall back to what the AI chose.
        if requested_difficulty and requested_difficulty in valid_difficulties:
            plan["difficulty"] = requested_difficulty
        else:
            difficulty = plan.get("difficulty", "moderate")
            plan["difficulty"] = difficulty if difficulty in valid_difficulties else "moderate"

        return plan


# ── Singleton ─────────────────────────────────────────────────────────────

_generator_instance = None


def get_spin_ride_generator() -> SpinRideGenerator:
    """Get or create the singleton SpinRideGenerator instance."""
    global _generator_instance
    if _generator_instance is None:
        _generator_instance = SpinRideGenerator()
    return _generator_instance
