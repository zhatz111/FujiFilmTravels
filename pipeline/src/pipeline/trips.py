"""`trips`: validate data/trips.json (docs/06-trips-and-live-status.md)."""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import ValidationError

from .ingest import private_zone
from .schemas import Trip, Zone


def validate_trips(raw: list[dict], zones: list[Zone]) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings)."""
    errors, warnings, ids = [], [], set()
    for i, item in enumerate(raw):
        label = item.get("id", f"#{i}") if isinstance(item, dict) else f"#{i}"
        try:
            t = Trip.model_validate(item)
        except ValidationError as e:
            errors += [f"{label}: {'.'.join(map(str, err['loc']))} {err['msg']}" for err in e.errors()]
            continue
        if t.id in ids:
            errors.append(f"{t.id}: duplicate id")
        ids.add(t.id)
        if t.end < t.start:
            errors.append(f"{t.id}: end {t.end} is before start {t.start}")
        try:
            ZoneInfo(t.tz)
        except (ZoneInfoNotFoundError, ValueError):
            errors.append(f"{t.id}: unknown time zone {t.tz!r}")
        if not (-90 <= t.lat <= 90 and -180 <= t.lon <= 180):
            errors.append(f"{t.id}: coordinates out of range")
        elif z := private_zone(t.lat, t.lon, zones):
            errors.append(f"{t.id}: location is inside private zone {z!r}")
        for v in (item["lat"], item["lon"]):
            if len(repr(float(v)).split(".")[1]) > 2:
                warnings.append(f"{t.id}: {v} has more than 2 decimals (~1 km); use a region-level point")
                break
    return errors, warnings
