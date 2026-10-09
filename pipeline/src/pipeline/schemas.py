"""Pydantic models: pipeline config + the /data JSON contract (mirrors site/src/lib/types.ts)."""

import tomllib
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- config/pipeline.toml ----


class Zone(BaseModel):
    name: str
    lat: float
    lon: float
    radius_km: float


class SpotCfg(BaseModel):
    eps_km: float = 8.0
    min_samples: int = 1


class VisitOverride(BaseModel):
    country: str
    start: date
    end: date
    label: str | None = None
    companions: list[str] = []


class SpotPeople(BaseModel):
    country: str
    spot: str
    visit: str
    people: list[str]


class R2Cfg(BaseModel):
    bucket: str
    public_base_url: str


class Config(BaseModel):
    inbox: Path = Path("photos/inbox")
    out: Path = Path("photos/out")
    data: Path = Path("data")
    sizes: list[int] = [480, 1600, 2560]
    webp_quality: int = 82
    coord_decimals: int = 4
    include_unmapped: bool = False
    gps_fill_hours: float = 3.0
    private_zones: list[Zone] = []
    spots: SpotCfg = SpotCfg()
    visit_gap_days: int = 4
    visit_overrides: list[VisitOverride] = []
    spot_people: list[SpotPeople] = []
    overrides: dict[str, dict[str, str]] = {}
    r2: R2Cfg | None = None


def load_config(path: Path) -> Config:
    if not path.exists():
        raise SystemExit(f"{path} not found. Copy config/pipeline.example.toml to {path} and fill it in.")
    return Config.model_validate(tomllib.loads(path.read_text(encoding="utf-8")))


# ---- data/*.json ----


class Camera(_Out):
    make: str | None = None
    model: str | None = None
    lens: str | None = None
    focal_mm: float | None = None
    f: float | None = None
    shutter: str | None = None
    iso: int | None = None


class Photo(_Out):
    id: str
    hash: str
    source: str  # original filename in photos/inbox
    gps: bool  # True = location from the camera's GPS; False = filled in (locations.toml / nearest photo)
    country: str
    spot: str
    lat: float
    lon: float
    alt_m: float | None = None
    taken: str
    w: int
    h: int
    color: str
    camera: Camera | None = None
    caption: str | None = None
    favorite: bool | None = None
    photographer: str
    people: list[str] | None = None  # people tagged in the photo (captions.toml)
    visit: str


class SpotVisit(_Out):
    visit: str
    start: str
    end: str
    photos: int
    people: list[str]


class Spot(_Out):
    id: str
    country: str
    name: str
    lat: float
    lon: float
    radius_km: float
    zoom: float
    count: int
    photos: list[str]
    visits: list[SpotVisit]


class Visit(_Out):
    id: str
    start: str
    end: str
    photos: int
    label: str | None = None
    companions: list[str]
    photographers: list[str]


class Country(_Out):
    id: str
    iso2: str
    name: str
    lat: float
    lon: float
    zoom: float
    count: int
    spots: list[str]
    cover: list[str]
    last_visit: str
    visits: list[Visit]


class Person(BaseModel):
    id: str
    name: str
    color: str
    initials: str | None = None
    avatar: str | None = None
    relation: str | None = None
    show_photos: bool = True
    hidden: bool = False


class Trip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    lat: float
    lon: float
    start: date
    end: date
    tz: str
    precision: Literal["region", "city"] = "region"
    live_delay_days: int = 1
    hide_end_date: bool = False
    show_upcoming: bool = True
