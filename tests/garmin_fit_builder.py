"""
Minimal FIT file writer for tests: builds synthetic Garmin activity files with
file_id, session and set messages, so tests need no real watch data.

Field numbers, types and scales are looked up from fitdecode's profile, so the
output is decoded exactly as a real file would be.
"""

import struct
from datetime import datetime, timezone

from fitdecode.profile import FIELD_TYPES, MESSAGE_TYPES

FIT_EPOCH = datetime(1989, 12, 31, tzinfo=timezone.utc)

# base type id -> (struct format, size, invalid value)
_BASE = {
    0x00: ("B", 1, 0xFF),        # enum
    0x02: ("B", 1, 0xFF),        # uint8
    0x84: ("H", 2, 0xFFFF),      # uint16
    0x86: ("I", 4, 0xFFFFFFFF),  # uint32
    0x8C: ("I", 4, 0),           # uint32z
}
_TYPE_BASE = {"enum": 0x00, "uint8": 0x02, "uint16": 0x84, "uint32": 0x86, "uint32z": 0x8C, "date_time": 0x86}

_CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
              0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400]


def crc16(data: bytes, crc: int = 0) -> int:
    for byte in data:
        tmp = _CRC_TABLE[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TABLE[byte & 0xF]
        tmp = _CRC_TABLE[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TABLE[(byte >> 4) & 0xF]
    return crc


def _base_type(field) -> int:
    t = field.type
    name = getattr(t, "name", t)
    if name in _TYPE_BASE:
        return _TYPE_BASE[name]
    # enum-like profile types (sport, file, set_type, exercise_category, ...)
    return getattr(getattr(t, "base_type", None), "identifier", 0x00)


def _enum_value(field, value):
    if not isinstance(value, str):
        return value
    enum = getattr(field.type, "enum", None) or {}
    for k, v in enum.items():
        if v == value:
            return k
    raise ValueError(f"{field.name}: unknown enum value {value!r}")


def _encode(field, base, value, count):
    fmt, size, invalid = _BASE[base]
    values = value if isinstance(value, (list, tuple)) else [value]
    out = b""
    for i in range(count):
        v = values[i] if i < len(values) else None
        if v is None:
            raw = invalid
        else:
            if isinstance(v, datetime):
                v = int((v - FIT_EPOCH).total_seconds())
            v = _enum_value(field, v)
            scale = field.scale or 1
            raw = int(round(float(v) * scale)) if scale != 1 else int(v)
        out += struct.pack("<" + fmt, raw)
    return out


class FitBuilder:
    def __init__(self):
        self.records = b""
        self.local = {}

    def add(self, message: str, **fields):
        num, mtype = next((n, m) for n, m in MESSAGE_TYPES.items() if m.name == message)
        by_name = {f.name: (k, f) for k, f in mtype.fields.items()}
        layout = []
        for name, value in fields.items():
            fnum, f = by_name[name]
            base = _base_type(f)
            count = len(value) if isinstance(value, (list, tuple)) else 1
            layout.append((fnum, f, base, value, count))

        signature = (num, tuple((fnum, base, count) for fnum, _, base, _, count in layout))
        if signature not in self.local:
            local_id = len(self.local) % 16
            self.local[signature] = local_id
            header = struct.pack("<BBBHB", 0x40 | local_id, 0, 0, num, len(layout))
            defs = b"".join(struct.pack("<BBB", fnum, _BASE[base][1] * count, base)
                            for fnum, _, base, _, count in layout)
            self.records += header + defs
        local_id = self.local[signature]
        self.records += struct.pack("<B", local_id) + b"".join(
            _encode(f, base, value, count) for _, f, base, value, count in layout
        )
        return self

    def build(self) -> bytes:
        header = struct.pack("<BBHI4s", 14, 0x20, 2132, len(self.records), b".FIT")
        header += struct.pack("<H", crc16(header))
        body = header + self.records
        return body + struct.pack("<H", crc16(body))


def strength_file(start: datetime, sets, serial=123456789, calories=216, avg_hr=127, max_hr=149,
                  heart_rate=None, sport="training", sub_sport="strength_training") -> bytes:
    """sets: list of dicts with keys category, subtype, reps, weight_kg, duration_s, set_type.

    heart_rate: optional function(seconds_since_start) -> bpm, written as one
    record per second for the whole activity.
    """
    b = FitBuilder()
    b.add("file_id", type="activity", manufacturer="garmin", product=4260, serial_number=serial, time_created=start)
    from datetime import timedelta
    if heart_rate:
        total_s = int(sum(st.get("duration_s", 40) for st in sets))
        for sec in range(total_s + 1):
            b.add("record", timestamp=start + timedelta(seconds=sec), heart_rate=int(heart_rate(sec)))
    t = start
    for i, s in enumerate(sets):
        b.add("set",
              timestamp=start,
              start_time=t,
              duration=s.get("duration_s", 40),
              repetitions=s.get("reps"),
              weight=s.get("weight_kg"),
              set_type=s.get("set_type", "active"),
              category=[s.get("category"), s.get("alt_category")],
              category_subtype=[s.get("subtype"), None],
              message_index=i)
        t = t + timedelta(seconds=s.get("duration_s", 40))
    total = (t - start).total_seconds()
    b.add("session", timestamp=t, start_time=start, sport=sport, sub_sport=sub_sport,
          total_elapsed_time=total, total_timer_time=total, total_calories=calories,
          avg_heart_rate=avg_hr, max_heart_rate=max_hr, num_laps=1)
    return b.build()


def cardio_file(start: datetime, seconds: float, distance_m: float, sport="running", sub_sport="treadmill",
                serial=123456789, calories=378, avg_hr=135, max_hr=166) -> bytes:
    b = FitBuilder()
    b.add("file_id", type="activity", manufacturer="garmin", product=4260, serial_number=serial, time_created=start)
    from datetime import timedelta
    b.add("session", timestamp=start + timedelta(seconds=seconds), start_time=start, sport=sport,
          sub_sport=sub_sport, total_elapsed_time=seconds, total_timer_time=seconds,
          total_distance=distance_m, total_calories=calories, avg_heart_rate=avg_hr,
          max_heart_rate=max_hr, total_ascent=12, num_laps=5)
    return b.build()
