"""
AI Parser - Uses Google Gemini to extract workout data from any content.
Handles text, images, and PDFs via multimodal Gemini API.
"""

import json
import logging
import os
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

from .base_parser import ParseResult

logger = logging.getLogger(__name__)

# ── System prompt for workout extraction ─────────────────────────────────
WORKOUT_EXTRACTION_PROMPT = """You are a fitness workout data extractor. Your job is to analyze the provided content and extract a structured workout template from it.

TASK:
Extract all exercise information from the content and return it as a JSON object matching the schema below. The content may be:
- Text copied from a fitness app, website, social media post, or screenshot
- A workout plan from a blog, PDF, or image of a whiteboard
- Content in any language (translate exercise names to English)
- Messy, partial, or informally written

IMPORTANT — ALTERNATES vs. EXERCISE BLOCKS:
This schema supports two different grouping concepts. Do NOT confuse them:

ALTERNATES (exercises dict with multiple keys "a", "b", "c"):
  Use this ONLY when the workout says to pick ONE exercise from a list.
  Example: "Bench Press OR Incline Press" → {"a": "Bench Press", "b": "Incline Press"}
  The user chooses which one to do on a given day. They do NOT do both.

EXERCISE BLOCKS (shared block_id across separate exercise_groups):
  Use this when exercises are meant to be performed TOGETHER back-to-back (supersets, circuits, tri-sets, giant sets).
  Example: "Superset: Bench Press + Barbell Row" → TWO separate exercise_groups, each with their own sets/reps/rest/weight, both sharing the same block_id and group_name.
  The user does ALL exercises in the block each session.

RULES:
1. Extract exercise names exactly as written, but clean up obvious formatting artifacts (emoji, bullet characters, numbering prefixes).
2. The exercises dict {"a", "b", "c"} within an exercise_group is ONLY for alternates (choose one). Do NOT put supersets or circuits into the same exercises dict. Maximum 6 alternates per group.
3. When exercises are meant to be performed together (supersets, circuits, giant sets), create SEPARATE exercise_groups for each exercise, all sharing the same block_id (e.g., "block-1", "block-2") and group_name (e.g., "Superset 1", "Chest Circuit"). Each exercise in a block keeps its own sets, reps, rest, and weight.
4. The group_name should be descriptive: "Superset 1", "Superset 2", "Tri-set", "Giant Set", "Circuit A", etc. If the source gives an explicit name (e.g., "Arm Finisher Circuit"), use that.
5. Standalone exercises that are NOT part of a superset or circuit must have block_id: null and group_name: null.
6. If the content says "Superset: Bench + Row", that is an exercise BLOCK (two separate exercise_groups with shared block_id), NOT alternates.
7. If the content says "Bench Press OR Dumbbell Press", those ARE alternates (same exercise_group, exercises: {"a": "Bench Press", "b": "Dumbbell Press"}).
8. If sets, reps, or rest are not specified for an exercise, use these defaults: sets="3", reps="8-12", rest="60s".
9. For rest periods, normalize to the format: number + unit. Examples: "60s", "90s", "2min". If just a number is given, assume seconds.
10. If the content mentions a workout name or title, use it. Otherwise, infer a reasonable name from the exercises (e.g., "Upper Body Workout", "Leg Day").
12. For weight values, extract the number and unit. If unit is ambiguous, default to "lbs".
13. Tags should be inferred from the workout content. Common tags: push, pull, legs, upper, lower, full-body, chest, back, shoulders, arms, core, hiit, strength, hypertrophy, cardio.
14. Description should summarize the workout purpose if evident, otherwise leave empty.
15. If the content contains no recognizable exercises, return an empty exercise_groups array and set name to "Imported Workout".
16. Maximum 20 exercise groups. Maximum 10 tags.
17. Exercise names should be concise and recognizable (e.g., "Barbell Bench Press" not "Flat Barbell Bench Press on a Flat Bench").
18. For reps, preserve the original format: "8-12", "10", "AMRAP", "30s" (for timed exercises), "to failure", etc.

19. DATE & TIME EXTRACTION: If the content (especially images or screenshots) contains a date and/or time when the workout was performed (e.g., a timestamp, date header, "Monday Jan 15", "3:30 PM", app screenshot with date), extract it. Return as ISO 8601 format if possible. If only a date is found, return it without time. If only time is found, return just the time. If no date/time is visible, return null for both fields.

OUTPUT SCHEMA (respond with ONLY this JSON, no other text):
{
  "name": "string (1-100 chars, the workout name/title)",
  "description": "string (0-500 chars, optional summary)",
  "session_date": "string or null (ISO 8601 date, e.g. '2026-01-15' or '2026-01-15T15:30:00', null if not found)",
  "session_time": "string or null (time in HH:MM format, e.g. '15:30', null if not found)",
  "exercise_groups": [
    {
      "exercises": {"a": "Exercise Name"},
      "sets": "string (e.g. '3', '4', '5')",
      "reps": "string (e.g. '8-12', '10', 'AMRAP')",
      "rest": "string (e.g. '60s', '90s', '2min')",
      "default_weight": "string or null (e.g. '135', '60', null if not specified)",
      "default_weight_unit": "lbs|kg|other (only if default_weight is set)",
      "block_id": "string or null (e.g. 'block-1', null for standalone exercises)",
      "group_name": "string or null (e.g. 'Superset 1', null for standalone exercises)"
    }
  ],
  "tags": ["string array, max 10 items"]
}"""


@dataclass
class AIParserConfig:
    """Configuration for AI parser."""
    model: str = "gemini-2.5-flash-lite"
    max_output_tokens: int = 4096
    temperature: float = 0.1  # Low temperature for structured extraction


class AIParser:
    """Wraps Google Gemini API for workout extraction from any content type."""

    def __init__(self, api_key: str = None):
        self.config = AIParserConfig()
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
        """Check if the AI parser is configured and available."""
        return bool(self._api_key or os.getenv("GEMINI_API_KEY"))

    def parse_text(self, text: str) -> ParseResult:
        """Parse text content using Gemini AI."""
        return self._call_gemini(
            contents=[text],
            source_format="ai (text)"
        )

    def parse_image(self, image_bytes: bytes, mime_type: str) -> ParseResult:
        """Parse image content using Gemini AI multimodal."""
        from google.genai import types
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        return self._call_gemini(
            contents=[
                "Extract the workout information from this image:",
                image_part
            ],
            source_format="ai (image)"
        )

    def parse_pdf(self, pdf_bytes: bytes) -> ParseResult:
        """Parse PDF content using Gemini AI multimodal."""
        from google.genai import types
        pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
        return self._call_gemini(
            contents=[
                "Extract the workout information from this PDF document:",
                pdf_part
            ],
            source_format="ai (pdf)"
        )

    def parse_url_content(self, extracted_text: str, source_url: str) -> ParseResult:
        """Parse text extracted from a URL using Gemini AI."""
        return self._call_gemini(
            contents=[
                f"The following text was extracted from {source_url}. "
                f"Extract the workout information:\n\n{extracted_text}"
            ],
            source_format="ai (url)"
        )

    def _call_gemini(self, contents: list, source_format: str) -> ParseResult:
        """Make the actual Gemini API call and parse the response."""
        try:
            from google.genai import types

            client = self._get_client()

            response = client.models.generate_content(
                model=self.config.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=WORKOUT_EXTRACTION_PROMPT,
                    response_mime_type="application/json",
                    temperature=self.config.temperature,
                    max_output_tokens=self.config.max_output_tokens,
                ),
            )

            # Parse the JSON response
            response_text = response.text.strip()
            workout_data = json.loads(response_text)

            # Validate minimum structure
            if not workout_data.get("exercise_groups"):
                return ParseResult(
                    success=False,
                    errors=["AI could not identify any exercises in the content"],
                    source_format=source_format,
                    confidence=0.0,
                )

            # Determine confidence based on data completeness
            confidence = self._calculate_confidence(workout_data)

            return ParseResult(
                success=True,
                workout_data=workout_data,
                warnings=self._generate_warnings(workout_data),
                confidence=confidence,
                source_format=source_format,
            )

        except json.JSONDecodeError as e:
            logger.error(f"AI returned invalid JSON: {e}")
            return ParseResult(
                errors=["AI returned invalid response format"],
                source_format=source_format,
            )
        except Exception as e:
            logger.error(f"AI parser error: {e}")
            return ParseResult(
                errors=[f"AI processing failed: {str(e)}"],
                source_format=source_format,
            )

    def _calculate_confidence(self, data: dict) -> float:
        """Calculate confidence score based on data completeness."""
        score = 0.5  # Base score for successful AI parse
        groups = data.get("exercise_groups", [])

        if groups:
            score += 0.1
            # Check if exercises have non-default sets/reps
            has_specific_data = any(
                g.get("sets") != "3" or g.get("reps") != "8-12"
                for g in groups
            )
            if has_specific_data:
                score += 0.15

            if len(groups) >= 3:
                score += 0.1
            if len(groups) >= 5:
                score += 0.05

        if data.get("name") and data["name"] != "Imported Workout":
            score += 0.05

        if data.get("tags"):
            score += 0.05

        return min(score, 0.95)

    def _generate_warnings(self, data: dict) -> list:
        """Generate warnings about the AI-parsed data."""
        warnings = ["Parsed using AI - please review exercises for accuracy"]
        groups = data.get("exercise_groups", [])

        defaults_count = sum(
            1 for g in groups
            if g.get("sets") == "3" and g.get("reps") == "8-12"
        )
        if defaults_count > 0 and defaults_count == len(groups):
            warnings.append("All exercises using default sets/reps - source may not have specified these")

        return warnings


# Lazy singleton
_ai_parser = None


def get_ai_parser() -> AIParser:
    global _ai_parser
    if _ai_parser is None:
        _ai_parser = AIParser()
    return _ai_parser
