"""
Spin Ride Validator — Check AI-generated spin ride plans against the rules
enforced in the prompt and _normalize_plan in spin_ride_generator.py.

Usage from code:
    from backend.services.spin_ride_validator import validate_spin_ride_plan
    result = validate_spin_ride_plan(plan_dict)
    if not result.ok:
        for v in result.errors:
            print(v)

Rules checked:
- total_seconds == duration_minutes * 60
- sum(segment.duration_seconds) == total_seconds
- segment_type is one of the allowed values
- no "cooldown" segments (prompt forbids cool-downs)
- resistance in 1..10, rpm in 50..130, rpm_low <= rpm_high
- duration_seconds in 15..600
- all_out duration <= 60s HARD CAP, 15..45s SOFT CAP
- first segment is a warmup
- ride does not start OR end with an all_out
- all_out count is within [lo, hi] for the requested duration
- difficulty is one of the four valid values
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


VALID_SEGMENT_TYPES = {
    "warmup", "flat", "climb", "sprint", "all_out", "recovery", "cooldown",
}
VALID_DIFFICULTIES = {"easy", "moderate", "hard", "intense"}

# Hard rule from the user: all-outs must never exceed 1 minute.
ALL_OUT_HARD_MAX_SECONDS = 60
# Soft rule from the prompt: all-outs should be 15-45s.
ALL_OUT_SOFT_MIN_SECONDS = 15
ALL_OUT_SOFT_MAX_SECONDS = 45


def _all_out_count_for_duration(duration_minutes: int) -> tuple[int, int]:
    """Mirror of spin_ride_generator._all_out_count_for_duration."""
    if duration_minutes <= 15:
        return (1, 2)
    if duration_minutes <= 25:
        return (2, 4)
    if duration_minutes <= 40:
        return (3, 6)
    if duration_minutes <= 60:
        return (4, 8)
    return (5, 10)


@dataclass
class ValidationResult:
    """Result of validating a spin ride plan."""
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """True when there are no errors (warnings are allowed)."""
        return not self.errors

    def add_error(self, message: str) -> None:
        self.errors.append(message)

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)

    def summary(self) -> str:
        lines: List[str] = []
        if self.errors:
            lines.append(f"{len(self.errors)} error(s):")
            lines.extend(f"  ERROR: {e}" for e in self.errors)
        if self.warnings:
            lines.append(f"{len(self.warnings)} warning(s):")
            lines.extend(f"  WARN:  {w}" for w in self.warnings)
        if not lines:
            lines.append("OK — no rule violations found.")
        return "\n".join(lines)


def validate_spin_ride_plan(
    plan: Dict[str, Any],
    *,
    include_all_outs: bool | None = None,
) -> ValidationResult:
    """
    Validate a spin ride plan dict against the rules.

    Args:
        plan: Parsed JSON dict matching SpinRidePlan shape.
        include_all_outs: If provided, also validate the count of all_out
            segments. If None, count checks are skipped (we don't know what
            the user asked for).

    Returns:
        ValidationResult with errors and warnings.
    """
    result = ValidationResult()

    # --- Top-level fields --------------------------------------------------
    duration_minutes = plan.get("duration_minutes")
    if not isinstance(duration_minutes, int) or duration_minutes <= 0:
        result.add_error(f"duration_minutes must be a positive integer, got {duration_minutes!r}")
        return result  # Further checks depend on this.

    target_seconds = duration_minutes * 60
    total_seconds = plan.get("total_seconds")
    if total_seconds != target_seconds:
        result.add_error(
            f"total_seconds ({total_seconds}) does not equal duration_minutes * 60 ({target_seconds})"
        )

    difficulty = plan.get("difficulty")
    if difficulty not in VALID_DIFFICULTIES:
        result.add_error(f"difficulty must be one of {sorted(VALID_DIFFICULTIES)}, got {difficulty!r}")

    segments = plan.get("segments")
    if not isinstance(segments, list) or not segments:
        result.add_error("segments must be a non-empty list")
        return result

    # --- Per-segment checks ------------------------------------------------
    running_total = 0
    all_out_indices: List[int] = []

    for idx, seg in enumerate(segments):
        label = f"segments[{idx}] ({seg.get('name', '?')!r})"

        seg_type = seg.get("segment_type")
        if seg_type not in VALID_SEGMENT_TYPES:
            result.add_error(f"{label}: invalid segment_type {seg_type!r}")
        if seg_type == "cooldown":
            result.add_error(f"{label}: cooldown segments are forbidden — the rider cools down on their own")

        duration = seg.get("duration_seconds")
        if not isinstance(duration, int) or duration < 15 or duration > 600:
            result.add_error(f"{label}: duration_seconds must be int in 15..600, got {duration!r}")
            duration = 0  # Don't crash the sum.
        running_total += duration

        resistance = seg.get("resistance")
        if not isinstance(resistance, int) or not (1 <= resistance <= 10):
            result.add_error(f"{label}: resistance must be int in 1..10, got {resistance!r}")

        rpm_low = seg.get("rpm_low")
        rpm_high = seg.get("rpm_high")
        if not isinstance(rpm_low, int) or not (50 <= rpm_low <= 130):
            result.add_error(f"{label}: rpm_low must be int in 50..130, got {rpm_low!r}")
        if not isinstance(rpm_high, int) or not (50 <= rpm_high <= 130):
            result.add_error(f"{label}: rpm_high must be int in 50..130, got {rpm_high!r}")
        if (
            isinstance(rpm_low, int)
            and isinstance(rpm_high, int)
            and rpm_low > rpm_high
        ):
            result.add_error(f"{label}: rpm_low ({rpm_low}) > rpm_high ({rpm_high})")

        # All-out specific rules
        if seg_type == "all_out":
            all_out_indices.append(idx)
            if isinstance(duration, int):
                if duration > ALL_OUT_HARD_MAX_SECONDS:
                    result.add_error(
                        f"{label}: all_out duration {duration}s exceeds the "
                        f"{ALL_OUT_HARD_MAX_SECONDS}s hard cap"
                    )
                elif duration > ALL_OUT_SOFT_MAX_SECONDS:
                    result.add_warning(
                        f"{label}: all_out duration {duration}s exceeds the soft "
                        f"{ALL_OUT_SOFT_MAX_SECONDS}s target (hard cap is {ALL_OUT_HARD_MAX_SECONDS}s)"
                    )
                elif duration < ALL_OUT_SOFT_MIN_SECONDS:
                    result.add_warning(
                        f"{label}: all_out duration {duration}s is below the "
                        f"{ALL_OUT_SOFT_MIN_SECONDS}s soft minimum"
                    )

            # Must be followed by recovery or flat
            if idx + 1 < len(segments):
                next_type = segments[idx + 1].get("segment_type")
                if next_type not in {"recovery", "flat"}:
                    result.add_warning(
                        f"{label}: all_out should be followed by a recovery or flat "
                        f"segment, found {next_type!r}"
                    )

    # --- Sum check ---------------------------------------------------------
    if running_total != target_seconds:
        result.add_error(
            f"sum of segment durations ({running_total}s) does not equal "
            f"target ({target_seconds}s)"
        )

    # --- Structural checks -------------------------------------------------
    first_type = segments[0].get("segment_type")
    last_type = segments[-1].get("segment_type")

    if first_type != "warmup":
        result.add_warning(f"first segment should be a warmup, found {first_type!r}")

    if first_type == "all_out":
        result.add_error("ride must not start with an all_out")
    if last_type == "all_out":
        result.add_error("ride must not end with an all_out")
    if last_type == "cooldown":
        result.add_error("ride must not end with a cooldown — end on a working effort")

    # --- All-out count check (only if caller told us what was requested) ---
    if include_all_outs is True:
        lo, hi = _all_out_count_for_duration(duration_minutes)
        count = len(all_out_indices)
        if count < lo:
            result.add_warning(
                f"expected {lo}..{hi} all_out segments for a {duration_minutes}-min ride, found {count}"
            )
        elif count > hi:
            result.add_error(
                f"expected {lo}..{hi} all_out segments for a {duration_minutes}-min ride, found {count}"
            )
    elif include_all_outs is False and all_out_indices:
        result.add_error(
            f"all-outs were not requested but {len(all_out_indices)} all_out segment(s) were generated"
        )

    return result
