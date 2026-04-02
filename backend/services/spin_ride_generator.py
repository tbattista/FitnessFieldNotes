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

SPIN_RIDE_PROMPT = """You are a certified indoor cycling instructor creating structured spin bike interval workouts.

Generate a complete spin ride plan for the requested duration. The ride must feel like a real spin class with natural flow and energy progression.

RIDE STRUCTURE RULES:
1. Always start with a WARM-UP (2-4 min for short rides, 4-5 min for 30+ min rides)
2. Always end with a COOL-DOWN (2-3 min for short rides, 3-5 min for 30+ min rides)
3. Working portion uses a mix of segment types with recovery between hard efforts
4. Longer rides (30+ min) should have 2-3 build/peak cycles, not just one long grind
5. Segment durations should be between 30 seconds and 4 minutes
6. The sum of ALL segment durations MUST equal exactly (duration_minutes * 60) seconds

SEGMENT TYPES AND TYPICAL RANGES:
- warmup: Resistance 3-4, RPM 80-90. Easy spin to get legs moving.
- flat: Resistance 4-6, RPM 85-100. Steady-state moderate effort, like riding on flat road.
- climb: Resistance 6-9, RPM 60-80. Heavy resistance, slower cadence, seated or standing climbs.
- sprint: Resistance 4-6, RPM 100-120. Fast cadence bursts, moderate resistance.
- recovery: Resistance 3-4, RPM 70-85. Active recovery, easy spinning, catch your breath.
- cooldown: Resistance 2-3, RPM 70-80. Gradually decreasing effort.

RESISTANCE SCALE (1-10):
- 1-2: Almost no resistance, very easy
- 3-4: Light, comfortable conversational pace
- 5-6: Moderate, can talk in short sentences
- 7-8: Hard, breathing heavy, few words at a time
- 9-10: Maximum effort, cannot speak

COACHING CUE GUIDELINES:
- Keep cues brief (under 120 chars), motivational, and instructional
- Reference body position: "seated", "standing", "hands on top of handlebars"
- Reference breathing: "steady breaths", "breathe through it"
- Reference effort feel: "find your rhythm", "push through", "legs are heavy but strong"
- Vary the cues — don't repeat the same one

DIFFICULTY LEVELS:
- easy: Average resistance ~4, mostly flat/recovery, gentle climbs (good for beginners)
- moderate: Average resistance ~5-6, mix of flat/climb/sprint with adequate recovery
- hard: Average resistance ~6-7, longer climbs, shorter recovery, more sprints
- intense: Average resistance ~7+, heavy climbs, sprint intervals, minimal recovery

Choose difficulty based on the ride title/theme — vary it across generations.

CALORIE ESTIMATE: Roughly 8-12 calories per minute depending on difficulty (easy=8, moderate=9, hard=11, intense=12).

RESPONSE FORMAT (strict JSON):
{
  "title": "Ride name — be creative (e.g., 'Rolling Thunder', 'Summit Push', 'Cadence Burner')",
  "duration_minutes": <requested duration>,
  "total_seconds": <must equal duration_minutes * 60>,
  "segments": [
    {
      "name": "Warm Up",
      "segment_type": "warmup",
      "duration_seconds": 180,
      "resistance": 3,
      "rpm_low": 80,
      "rpm_high": 90,
      "cue": "Easy spin, find your rhythm"
    }
  ],
  "estimated_calories": <number>,
  "difficulty": "moderate"
}

CRITICAL: The total_seconds field and the sum of all segment duration_seconds MUST equal exactly (duration_minutes * 60). Count carefully.
"""


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

    def generate(self, duration_minutes: int) -> Dict[str, Any]:
        """
        Generate a spin ride plan for the given duration.

        Args:
            duration_minutes: Ride duration (10, 20, 30, 45, or 60)

        Returns:
            Dict matching SpinRidePlan schema
        """
        try:
            from google.genai import types

            client = self._get_client()
            target_seconds = duration_minutes * 60

            prompt = f"Generate a {duration_minutes}-minute spin bike ride. Total seconds must be exactly {target_seconds}."

            response = client.models.generate_content(
                model=self.config.model,
                contents=[prompt],
                config=types.GenerateContentConfig(
                    system_instruction=SPIN_RIDE_PROMPT,
                    response_mime_type="application/json",
                    temperature=self.config.temperature,
                    max_output_tokens=self.config.max_output_tokens,
                ),
            )

            response_text = response.text.strip()
            logger.info(f"Gemini spin ride response length: {len(response_text)} chars")
            parsed = json.loads(response_text)

            # Validate and fix segment timing
            parsed = self._normalize_plan(parsed, duration_minutes)
            return parsed

        except json.JSONDecodeError as e:
            logger.error(f"Spin ride generator: AI returned invalid JSON: {e}")
            logger.error(f"Raw response: {response_text[:500] if 'response_text' in dir() else 'N/A'}")
            raise ValueError("AI returned an unexpected format — please try again")
        except Exception as e:
            logger.error(f"Spin ride generator error: {type(e).__name__}: {e}", exc_info=True)
            raise

    def _normalize_plan(self, plan: Dict[str, Any], duration_minutes: int) -> Dict[str, Any]:
        """Validate and fix the generated plan to ensure correct timing and field types."""
        target_seconds = duration_minutes * 60
        segments = plan.get("segments", [])

        if not segments:
            raise ValueError("AI generated an empty ride plan")

        valid_types = {"warmup", "flat", "climb", "sprint", "recovery", "cooldown"}
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

        # Fix timing mismatch by adjusting the last segment
        actual_total = sum(s["duration_seconds"] for s in segments)
        if actual_total != target_seconds:
            diff = target_seconds - actual_total
            last = segments[-1]
            adjusted = last["duration_seconds"] + diff
            if adjusted >= 15:
                last["duration_seconds"] = adjusted
                logger.info(f"Adjusted last segment by {diff}s to match target duration")
            else:
                logger.warning(f"Spin ride timing off by {diff}s, couldn't fix cleanly")

        # Ensure top-level fields
        plan["title"] = str(plan.get("title", f"{duration_minutes}-Minute Spin Ride"))[:80]
        plan["duration_minutes"] = duration_minutes
        plan["total_seconds"] = target_seconds
        plan["segments"] = segments
        plan["estimated_calories"] = int(plan["estimated_calories"]) if plan.get("estimated_calories") else None
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
