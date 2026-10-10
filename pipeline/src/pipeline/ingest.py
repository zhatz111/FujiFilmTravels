"""`ingest`: photos/inbox -> photos/out/p/*.webp + data/*.json. Steps follow docs/04-photo-pipeline.md."""

import contextlib
import hashlib
import io
import json
import math
import re
import tomllib
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageOps
from pillow_heif import register_heif_opener
from rich.console import Console

from .schemas import Camera, Config, Country, Person, Photo, Spot, SpotVisit, Visit, Zone

register_heif_opener()
console = Console()

EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff"}
DEFAULT_PERSON = "zach"  # loose files in photos/inbox belong to Zach
EARTH_KM = 6371.0088
WORLD_M = 40075016.686
STAGE_W, STAGE_H = 900, 640  # ponytail: fixed desktop stage size for zoom fitting; site can refine per viewport
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"


# ---------- small pure helpers ----------


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def dms_to_deg(dms, ref: str) -> float:
    d, m, s = (float(x) for x in dms)
    v = d + m / 60 + s / 3600
    return -v if ref in ("S", "W") else v


def private_zone(lat: float, lon: float, zones: list[Zone]) -> str | None:
    """Name of the first private zone containing the point, else None."""
    return next((z.name for z in zones if haversine_km(lat, lon, z.lat, z.lon) < z.radius_km), None)


def fit_zoom(lat: float, width_km: float, height_km: float, lo: float, hi: float) -> float:
    """MapLibre zoom (512px tiles) that fits width x height km (+25% margin) in the stage."""
    w, h = max(width_km, 0.1) * 1250, max(height_km, 0.1) * 1250  # km -> m, x1.25 margin
    scale = WORLD_M * math.cos(math.radians(lat)) / 512
    z = math.log2(min(STAGE_W / w, STAGE_H / h) * scale)
    return round(min(max(z, lo), hi), 1)


def shutter(t: float) -> str:
    return f"1/{round(1 / t)}" if t < 1 else f"{t:g}s"


# ---------- step 3: metadata ----------


def _clean(v) -> str | None:
    if v is None:
        return None
    s = (v.decode(errors="ignore") if isinstance(v, bytes) else str(v)).replace("\x00", "").strip()
    return s or None


def read_meta(path: Path) -> dict:
    """EXIF -> plain dict (JSON-safe, cached in the manifest)."""
    with Image.open(path) as im:
        exif = im.getexif()
        w, h = im.size
    ex, gps = exif.get_ifd(0x8769), exif.get_ifd(0x8825)
    if exif.get(274) in (5, 6, 7, 8):
        w, h = h, w
    raw = _clean(ex.get(36867) or exif.get(306))
    local = datetime.strptime(raw, "%Y:%m:%d %H:%M:%S").isoformat() if raw else None
    offset = _clean(ex.get(36881))
    meta: dict = {"local": local, "offset": offset, "src_w": w, "src_h": h, "lat": None, "lon": None}
    if gps.get(2) and gps.get(4):
        meta["lat"] = dms_to_deg(gps[2], _clean(gps.get(1)) or "N")
        meta["lon"] = dms_to_deg(gps[4], _clean(gps.get(3)) or "E")
        if gps.get(6) is not None:
            meta["alt_m"] = round(float(gps[6]) * (-1 if gps.get(5) in (b"\x01", 1) else 1))
    iso = ex.get(34855)
    cam = {
        "make": _clean(exif.get(271)),
        "model": _clean(exif.get(272)),
        "lens": _clean(ex.get(42036)),
        "focal_mm": round(float(ex[37386])) if ex.get(37386) else None,
        "f": round(float(ex[33437]), 1) if ex.get(33437) else None,
        "shutter": shutter(float(ex[33434])) if ex.get(33434) else None,
        "iso": int(iso[0] if isinstance(iso, tuple) else iso) if iso else None,
    }
    meta["camera"] = {k: v for k, v in cam.items() if v is not None} or None
    # GPSProcessingMethod "MANUAL": a hand-entered location written back by `pipeline geotag`
    method = gps.get(27)
    meta["gps_manual"] = b"MANUAL" in (method if isinstance(method, bytes) else str(method or "").encode())
    return meta


# ---------- step 4a: fill missing GPS ----------


def fill_locations(recs: list[dict], manual: dict, hours: float) -> None:
    """Give GPS-less records a location, in priority order:
    EXIF > locations.toml by filename > nearest GPS photo (same photographer, within `hours`)
    > locations.toml by date. Sets rec["loc"] to where the location came from."""
    manual = {str(k).lower(): v for k, v in manual.items()}
    donors = defaultdict(list)
    for r in recs:
        if r["lat"] is not None:
            r["loc"] = "exif-manual" if r.get("gps_manual") else "exif"
            if r["local"]:
                donors[r["photographer"]].append((datetime.fromisoformat(r["local"]), r["lat"], r["lon"]))
    window = timedelta(hours=hours)
    for r in recs:
        if r["lat"] is not None:
            continue
        hit, how = manual.get(r["name"].lower()), "manual-file"
        if not hit and r["local"] and hours > 0:
            t = datetime.fromisoformat(r["local"])
            near = min(donors[r["photographer"]], key=lambda d: abs(d[0] - t), default=None)
            if near and abs(near[0] - t) <= window:
                hit, how = {"lat": near[1], "lon": near[2]}, "nearest"
        if not hit and r["local"]:
            hit, how = manual.get(r["local"][:10]), "manual-date"
        if hit:
            r["lat"], r["lon"], r["loc"] = float(hit["lat"]), float(hit["lon"]), how


# ---------- step 5: reverse geocode ----------


def geocode(points: list[tuple[float, float]]) -> list[dict]:
    if not points:
        return []
    import pycountry
    import reverse_geocoder as rg

    with contextlib.redirect_stdout(io.StringIO()):  # rg prints a loading banner
        hits = rg.search(points, mode=1)  # mode=1: no multiprocessing (Windows-safe)
    out = []
    for h in hits:
        c = pycountry.countries.get(alpha_2=h["cc"])
        cname = getattr(c, "common_name", None) or (c.name if c else h["cc"])
        out.append({"place": h["name"], "iso2": h["cc"], "country_name": cname, "country": slug(cname)})
    return out


# ---------- step 6: spots ----------


def cluster(lats: list[float], lons: list[float], eps_km: float, min_samples: int) -> list[int]:
    from sklearn.cluster import DBSCAN

    X = np.radians(np.column_stack([lats, lons]))
    labels = DBSCAN(eps=eps_km / EARTH_KM, min_samples=min_samples, metric="haversine").fit(X).labels_
    # noise (-1, only possible with min_samples > 1) becomes its own singleton spot
    nxt = max(labels, default=-1) + 1
    out = []
    for lab in labels:
        if lab == -1:
            lab, nxt = nxt, nxt + 1
        out.append(int(lab))
    return out


def assign_spots(photos: list[dict], cfg: Config) -> None:
    """Sets p["spot"] and p["spot_name"] per photo (per-country DBSCAN + config overrides)."""
    by_country = defaultdict(list)
    for p in photos:
        by_country[p["country"]].append(p)
    for ps in by_country.values():
        labels = cluster([p["lat"] for p in ps], [p["lon"] for p in ps], cfg.spots.eps_km, cfg.spots.min_samples)
        groups = defaultdict(list)
        for p, lab in zip(ps, labels):
            groups[lab].append(p)
        used: set[str] = set()
        named = []
        for g in sorted(groups.values(), key=lambda g: (-len(g), g[0]["local"] or "")):
            name = Counter(p["place"] for p in g).most_common(1)[0][0]
            sid, n = slug(name) or "spot", 2
            while sid in used:
                sid, n = f"{slug(name)}-{n}", n + 1
            used.add(sid)
            named.append((sid, name, g))
        names = {sid: name for sid, name, _ in named}
        for sid, name, g in named:
            o = cfg.overrides.get(sid, {})
            target = o.get("merge_into", sid)
            for p in g:
                p["spot"] = target
                p["spot_name"] = cfg.overrides.get(target, {}).get("name") or names.get(target, name)


def spot_geometry(ps: list[dict]) -> tuple[float, float, float]:
    lat = sum(p["lat"] for p in ps) / len(ps)
    lon = sum(p["lon"] for p in ps) / len(ps)
    d = [haversine_km(lat, lon, p["lat"], p["lon"]) for p in ps]
    return lat, lon, max(0.5, float(np.percentile(d, 90)))


# ---------- visits (Phase 4.5 / 4.6) ----------


def build_visits(
    country: str, photos: list[dict], gap_days: int, overrides, order: dict[str, int],
    trip_dates: dict | None = None, multi_country: set[str] = frozenset(),
) -> list[dict]:
    """Group a country's photos into visits. Photos in a trip folder with an entry in trip-dates.toml
    form one visit with those exact dates (photo dates instead, if the trip spans several countries).
    Other photos group by date gap; overrides replace overlapping derived visits.
    Sets p["visit"]. Returns visits newest first: {id,start,end,photos,label,companions,photographers}."""
    trip_dates = trip_dates or {}
    foldered = defaultdict(list)
    for p in photos:
        if p.get("trip") in trip_dates:
            foldered[p["trip"]].append(p)
    ps = sorted((p for p in photos if p.get("trip") not in trip_dates), key=lambda p: p["day"])
    groups: list[list[dict]] = []
    for p in ps:
        if groups and (p["day"] - groups[-1][-1]["day"]).days <= gap_days:
            groups[-1].append(p)
        else:
            groups.append([p])
    ovs = [o for o in overrides if o.country == country]
    merged = [{"start": o.start, "end": o.end, "label": o.label, "extra": o.companions, "members": []} for o in ovs]
    visits = []
    for g in groups:
        s, e = g[0]["day"], g[-1]["day"]
        hit = next((i for i, o in enumerate(ovs) if s <= o.end and e >= o.start), None)
        if hit is None:
            visits.append({"start": s, "end": e, "label": None, "extra": [], "members": g})
        else:
            merged[hit]["members"] += g
    for m in merged:
        if m["members"]:
            m["start"] = min(m["start"], *(p["day"] for p in m["members"]))
            m["end"] = max(m["end"], *(p["day"] for p in m["members"]))
            visits.append(m)
    for name, members in foldered.items():
        t, days = trip_dates[name], [p["day"] for p in members]
        exact = name not in multi_country  # ponytail: multi-country trips use photo dates per country
        visits.append({
            "start": t["start"] if exact else min(days), "end": t["end"] if exact else max(days),
            "label": t.get("label"), "extra": t.get("companions", []), "members": members,
        })
    visits.sort(key=lambda v: v["start"])
    seen: Counter = Counter()
    rank = lambda pid: (order.get(pid, len(order)), pid)  # noqa: E731
    out = []
    for v in visits:
        base = f"{country}-{v['start']:%Y-%m}"
        seen[base] += 1
        vid = base if seen[base] == 1 else f"{base}-{seen[base]}"
        shooters = {p["photographer"] for p in v["members"]}
        for p in v["members"]:
            p["visit"] = vid
        out.append({
            "id": vid,
            "start": v["start"].isoformat(),
            "end": v["end"].isoformat(),
            "photos": len(v["members"]),
            "label": v["label"],
            "companions": sorted(shooters | {c for c in v["extra"] if c in order}, key=rank),
            "photographers": sorted(shooters, key=rank),
        })
    return out[::-1]


def build_spot_visits(spot_photos: list[dict], visits: dict[str, dict], spot_people, country: str, spot: str, order) -> list[dict]:
    by_visit = defaultdict(list)
    for p in spot_photos:
        by_visit[p["visit"]].append(p)
    out = []
    for vid, ps in by_visit.items():
        days = [p["day"] for p in ps]
        o = next((s for s in spot_people if (s.country, s.spot, s.visit) == (country, spot, vid)), None)
        people = [x for x in o.people if x in order] if o else visits[vid]["companions"]
        out.append({"visit": vid, "start": min(days).isoformat(), "end": max(days).isoformat(), "photos": len(ps), "people": people})
    return sorted(out, key=lambda v: v["start"], reverse=True)


# ---------- step 7: derivatives ----------


def make_derivatives(src: Path, hash10: str, out_p: Path, sizes: list[int], quality: int) -> tuple[int, int, str]:
    """Oriented, sRGB, metadata-free WebPs at each width (capped at source width, never upscaled)."""
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        icc = im.info.get("icc_profile")
        if icc:
            im = ImageCms.profileToProfile(
                im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB"
            )
        im = im.convert("RGB")
    im.info = {}  # drop exif/xmp/icc so nothing rides along into the WebP
    out_p.mkdir(parents=True, exist_ok=True)
    w = h = 0
    for width in sorted(sizes):
        tw = min(width, im.width)
        th = round(im.height * tw / im.width)
        im.resize((tw, th), Image.Resampling.LANCZOS).save(out_p / f"{hash10}-{width}.webp", "WEBP", quality=quality, method=6)
        w, h = tw, th
    r, g, b = im.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return w, h, f"#{r:02x}{g:02x}{b:02x}"


# ---------- step 9: visited polygons ----------


def write_visited_geojson(iso2_to_slug: dict[str, str], dest: Path, cache: Path) -> None:
    fc: dict = {"type": "FeatureCollection", "features": []}
    if iso2_to_slug:
        import shapely
        from shapely.geometry import mapping, shape

        src = cache / "ne_50m_admin_0_countries.geojson"
        if not src.exists():
            cache.mkdir(parents=True, exist_ok=True)
            console.print("Downloading Natural Earth countries (one time)...")
            urllib.request.urlretrieve(NE_URL, src)
        for f in json.loads(src.read_text(encoding="utf-8"))["features"]:
            iso = f["properties"].get("ISO_A2_EH")
            if iso in iso2_to_slug:
                g = shapely.set_precision(shape(f["geometry"]).simplify(0.03, preserve_topology=True), 0.001)
                fc["features"].append({"type": "Feature", "properties": {"id": iso2_to_slug[iso]}, "geometry": mapping(g)})
        fc["features"].sort(key=lambda f: f["properties"]["id"])
    dest.write_text(json.dumps(fc, separators=(",", ":")) + "\n", encoding="utf-8")


# ---------- orchestration ----------


def _write(path: Path, items: list) -> None:
    path.write_text(json.dumps([i.model_dump(exclude_none=True) for i in items], indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _toml(path: Path) -> dict:
    return tomllib.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def photo_tags(ids: list[str], photo: str, known: set[str], visible: dict[str, int]) -> list[str]:
    """People tagged in a photo (captions.toml `people = [...]`): unknown ids are an error,
    hidden people are dropped. Returned in people.json order."""
    unknown = sorted(set(ids) - known)
    if unknown:
        raise SystemExit(f"captions.toml: {photo} tags unknown people {unknown}. Valid ids: {sorted(known)}")
    return sorted({i for i in ids if i in visible}, key=visible.__getitem__)


def load_people(data: Path) -> list[Person]:
    f = data / "people.json"
    people = [Person.model_validate(p) for p in json.loads(f.read_text(encoding="utf-8"))] if f.exists() else []
    return people or [Person(id=DEFAULT_PERSON, name="Zach", color="#2D5A43")]


LOCATIONS_HEADER = """# Hand-entered locations for photos without GPS. Tip: right-click a spot in Google Maps
# to copy its "lat, lon".
#
# Key by the photo's local date (covers every GPS-less photo that day) or by filename
# (one photo). Priority: camera GPS > filename here > nearest GPS photo within
# gps_fill_hours (config) > date here.
#
# `ingest` appends commented-out lines below for photos that still need a location.
# Uncomment one and fill in lat/lon, e.g.:
# 2025-04-17 = { lat = 34.9671, lon = 135.7727 }
# "DSCF2100.JPG" = { lat = 34.6873, lon = 135.5262 }
"""

TRIP_DATES_HEADER = """# Exact travel dates for each trip folder (photos/inbox/<person>/<trip-folder>/).
# `ingest` adds a section for every new folder, pre-filled with the first/last photo date;
# edit start/end to your real travel dates. The same folder name under different people
# is the same trip. companions = people on the trip who sent no photos (ids from data/people.json).
"""


def add_location_stubs(path: Path, missing: list[dict]) -> None:
    """Append commented-out entries for GPS-less photos not yet mentioned in locations.toml."""
    text = path.read_text(encoding="utf-8") if path.exists() else LOCATIONS_HEADER
    by_day = defaultdict(list)
    for r in sorted(missing, key=lambda r: r["local"]):
        if f'"{r["name"]}"'.lower() not in text.lower():
            by_day[r["local"][:10]].append(r)
    if not by_day:
        return
    lines = [f"\n# ---- needs a location (added by ingest {date.today()}) ----"]
    for day, rs in by_day.items():
        trip = f"  trip: {rs[0]['trip']}" if rs[0].get("trip") else ""
        lines.append(f"\n# {day} = {{ lat = , lon = }}   # {len(rs)} photo(s) need a location this day{trip}")
        lines += [f'# "{r["name"]}" = {{ lat = , lon = }}   # {r["local"][11:16]}' for r in rs]
    path.write_text(text.rstrip("\n") + "\n" + "\n".join(lines) + "\n", encoding="utf-8")


def add_trip_stubs(path: Path, recs: list[dict], known: dict) -> None:
    """Append a section to trip-dates.toml for each trip folder that doesn't have one."""
    days = defaultdict(list)
    for r in recs:
        if r.get("trip") and r["local"] and r["trip"] not in known:
            days[r["trip"]].append(r["local"][:10])
    if not days:
        return
    text = path.read_text(encoding="utf-8") if path.exists() else TRIP_DATES_HEADER
    for trip, ds in sorted(days.items()):
        label = trip.replace("-", " ").replace("_", " ").title()
        text += (
            f'\n["{trip}"]\n'
            f"start = {min(ds)}   # first photo date: change to your travel dates\n"
            f"end = {max(ds)}     # last photo date\n"
            f'label = "{label}"\n'
            f"# companions = []\n"
        )
    path.write_text(text, encoding="utf-8")


def scan(inbox: Path, valid: set[str]) -> list[tuple[Path, str, str | None]]:
    """(file, photographer id, trip folder). inbox/<person>/<trip>/...; loose files in inbox are Zach's."""
    files, unknown = [], set()
    for f in sorted(inbox.rglob("*")):
        if f.suffix.lower() not in EXTS or not f.is_file():
            continue
        rel = f.relative_to(inbox).parts
        who = rel[0] if len(rel) > 1 else DEFAULT_PERSON
        if who not in valid:
            unknown.add(who)
        files.append((f, who, rel[1] if len(rel) > 2 else None))
    if unknown:
        raise SystemExit(f"Unknown person folder(s) in {inbox}: {sorted(unknown)}. Valid ids: {sorted(valid)}")
    return files


def run(cfg: Config, force: bool = False) -> dict:
    people = load_people(cfg.data)
    by_id = {p.id: p for p in people}
    visible = [p for p in people if not p.hidden]
    order = {p.id: i for i, p in enumerate(visible)}
    out_p = cfg.out / "p"
    manifest_f = cfg.out / "manifest.json"
    manifest = {} if force or not manifest_f.exists() else json.loads(manifest_f.read_text(encoding="utf-8"))
    captions = {k.lower(): v for k, v in _toml(cfg.inbox / "captions.toml").items()}
    skipped: dict[str, list[str]] = defaultdict(list)

    # 1-3: scan, hash, metadata (cached by hash)
    recs, seen = [], set()
    files = scan(cfg.inbox, set(by_id))
    with console.status("Reading photos...") as status:
        for i, (f, who, trip) in enumerate(files, 1):
            status.update(f"Reading photos... {i}/{len(files)}")
            h = hashlib.sha256(f.read_bytes()).hexdigest()[:10]
            if h in seen:
                skipped["duplicate"].append(f.name)
                continue
            seen.add(h)
            if not by_id[who].show_photos or by_id[who].hidden:
                skipped["photographer not published"].append(f.name)
                continue
            meta = manifest.get(h) or read_meta(f)
            manifest[h] = meta
            recs.append({**meta, "hash": h, "name": f.name, "path": f, "photographer": who, "trip": trip})

    # 4: fill + filter + round
    trip_dates = _toml(cfg.inbox / "trip-dates.toml")
    add_trip_stubs(cfg.inbox / "trip-dates.toml", recs, trip_dates)
    trip_dates = {
        name: {**t, "start": date.fromisoformat(str(t["start"])), "end": date.fromisoformat(str(t["end"]))}
        for name, t in _toml(cfg.inbox / "trip-dates.toml").items()
    }
    fill_locations(recs, _toml(cfg.inbox / "locations.toml"), cfg.gps_fill_hours)
    add_location_stubs(cfg.inbox / "locations.toml", [r for r in recs if r["lat"] is None and r["local"]])
    kept = []
    for r in recs:
        if not r["local"]:
            skipped["no date"].append(r["name"])
        elif r["lat"] is None:
            skipped["no GPS"].append(r["name"])
        elif z := private_zone(r["lat"], r["lon"], cfg.private_zones):
            skipped[f"private zone: {z}"].append(r["name"])
        else:
            r["lat"], r["lon"] = round(r["lat"], cfg.coord_decimals), round(r["lon"], cfg.coord_decimals)
            r["day"] = date.fromisoformat(r["local"][:10])
            kept.append(r)
    if cfg.include_unmapped:
        console.print("[yellow]include_unmapped is not supported yet; GPS-less photos are skipped.[/]")

    # 5-6: geocode, spots
    for r, g in zip(kept, geocode([(r["lat"], r["lon"]) for r in kept])):
        r.update(g)
    assign_spots(kept, cfg)

    # visits
    by_country = defaultdict(list)
    for r in kept:
        by_country[r["country"]].append(r)
    trip_countries = defaultdict(set)
    for r in kept:
        trip_countries[r["trip"]].add(r["country"])
    multi = {t for t, cs in trip_countries.items() if len(cs) > 1}
    country_visits = {
        c: build_visits(c, ps, cfg.visit_gap_days, cfg.visit_overrides, order, trip_dates, multi) for c, ps in by_country.items()
    }

    # 7: derivatives (published photos only, so private/skipped images never land in photos/out)
    with console.status("Making derivatives...") as status:
        for i, r in enumerate(kept, 1):
            status.update(f"Making derivatives... {i}/{len(kept)}")
            m = manifest[r["hash"]]
            have = all((out_p / f"{r['hash']}-{s}.webp").exists() for s in cfg.sizes)
            if force or not have or "w" not in m:
                m["w"], m["h"], m["color"] = make_derivatives(r["path"], r["hash"], out_p, cfg.sizes, cfg.webp_quality)
            r.update(w=m["w"], h=m["h"], color=m["color"])

    # build output models
    photos = []
    for r in sorted(kept, key=lambda r: (r["local"], r["hash"])):
        cap = captions.get(r["name"].lower(), {})
        photos.append(Photo(
            id=f"{r['day']}-{r['hash']}", hash=r["hash"], source=r["name"], gps=r["loc"] == "exif",
            country=r["country"], spot=r["spot"],
            lat=r["lat"], lon=r["lon"], alt_m=r.get("alt_m"),
            taken=r["local"] + (r["offset"] or ""), w=r["w"], h=r["h"], color=r["color"],
            camera=Camera(**r["camera"]) if r["camera"] else None,
            caption=cap.get("caption"), favorite=cap.get("favorite"),
            people=photo_tags(cap.get("people", []), r["name"], set(by_id), order) or None,
            photographer=r["photographer"], visit=r["visit"],
        ))
    pid = {r["hash"]: f"{r['day']}-{r['hash']}" for r in kept}

    spots, countries = [], []
    for c, ps in sorted(by_country.items()):
        vmap = {v["id"]: v for v in country_visits[c]}
        by_spot = defaultdict(list)
        for p in ps:
            by_spot[p["spot"]].append(p)
        c_spots = []
        for sid, sps in sorted(by_spot.items()):
            lat, lon, rad = spot_geometry(sps)
            sps.sort(key=lambda p: (p["local"], p["hash"]))
            c_spots.append(Spot(
                id=sid, country=c, name=sps[0]["spot_name"], lat=round(lat, 4), lon=round(lon, 4),
                radius_km=round(rad, 2), zoom=fit_zoom(lat, 2 * rad, 2 * rad, 11, 16), count=len(sps),
                photos=[pid[p["hash"]] for p in sps],
                visits=[SpotVisit(**v) for v in build_spot_visits(sps, vmap, cfg.spot_people, c, sid, order)],
            ))
        spots += c_spots
        # country box: bbox of spots, padded by each spot's radius
        lat0 = min(s.lat - s.radius_km / 111 for s in c_spots)
        lat1 = max(s.lat + s.radius_km / 111 for s in c_spots)
        lon0 = min(s.lon - s.radius_km / (111 * math.cos(math.radians(s.lat))) for s in c_spots)
        lon1 = max(s.lon + s.radius_km / (111 * math.cos(math.radians(s.lat))) for s in c_spots)
        clat, clon = (lat0 + lat1) / 2, (lon0 + lon1) / 2
        w_km = (lon1 - lon0) * 111.32 * math.cos(math.radians(clat))
        cover = sorted(ps, key=lambda p: p["local"], reverse=True)
        cover.sort(key=lambda p: not captions.get(p["name"].lower(), {}).get("favorite", False))
        visits = country_visits[c]
        countries.append(Country(
            id=c, iso2=ps[0]["iso2"], name=ps[0]["country_name"], lat=round(clat, 4), lon=round(clon, 4),
            zoom=fit_zoom(clat, w_km, (lat1 - lat0) * 110.57, 3, 9), count=len(ps),
            spots=[s.id for s in sorted(c_spots, key=lambda s: -s.count)], cover=[pid[p["hash"]] for p in cover[:3]],
            last_visit=visits[0]["end"], visits=[Visit(**x) for x in visits],
        ))

    # 8-10: write
    cfg.data.mkdir(parents=True, exist_ok=True)
    _write(cfg.data / "photos.json", photos)
    _write(cfg.data / "spots.json", spots)
    _write(cfg.data / "countries.json", countries)
    write_visited_geojson({c.iso2: c.id for c in countries}, cfg.data / "visited-countries.geojson", Path("pipeline/.cache"))

    # prune derivatives no longer published (e.g. a photo now inside a private zone)
    published = {r["hash"] for r in kept}
    for f in out_p.glob("*.webp") if out_p.exists() else []:
        if f.name.split("-")[0] not in published:
            f.unlink()

    cfg.out.mkdir(parents=True, exist_ok=True)
    manifest = {h: m for h, m in manifest.items() if h in seen}
    manifest_f.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    report = {
        "scanned": len(files),
        "published": len(photos),
        "locations": dict(Counter(r.get("loc", "none") for r in kept)),
        "skipped": dict(skipped),
        "countries": {c.name: {s.name: s.count for s in spots if s.country == c.id} for c in countries},
    }
    (cfg.out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report
