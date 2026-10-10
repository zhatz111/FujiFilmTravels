"""`geotag`: write hand-entered locations (photos/inbox/locations.toml) into the original JPEGs'
EXIF, so the photos carry their location even if the toml is lost.

Lossless and defensive: only the EXIF block is replaced (the image data is never re-encoded), the
result is verified (image bytes identical, GPS reads back) before the original is atomically
replaced, and the file's timestamps are kept. The GPS is marked GPSProcessingMethod=MANUAL so
ingest still reports these photos as hand-placed (`gps: false`), not camera GPS.
"""

import io
import os
from pathlib import Path

import piexif
from PIL import Image
from rich.console import Console

from .ingest import _toml, dms_to_deg, fill_locations, load_people, read_meta, scan
from .schemas import Config

console = Console()

JPEG = {".jpg", ".jpeg"}
MANUAL = b"ASCII\x00\x00\x00MANUAL"  # GPSProcessingMethod: 8-byte character code + text
G = piexif.GPSIFD


def _dms(v: float) -> tuple:
    """Decimal degrees -> EXIF rationals ((d,1), (m,1), (s*10000, 10000)), ~3 mm precision."""
    v = abs(v)
    d = int(v)
    m = int((v - d) * 60)
    s = (v - d - m / 60) * 3600
    return ((d, 1), (m, 1), (round(s * 10000), 10000))


def gps_ifd(lat: float, lon: float) -> dict:
    return {
        G.GPSVersionID: (2, 3, 0, 0),
        G.GPSLatitudeRef: b"N" if lat >= 0 else b"S",
        G.GPSLatitude: _dms(lat),
        G.GPSLongitudeRef: b"E" if lon >= 0 else b"W",
        G.GPSLongitude: _dms(lon),
        G.GPSMapDatum: b"WGS-84",
        G.GPSProcessingMethod: MANUAL,
    }


def _segments(data: bytes) -> list[bytes]:
    """Split a JPEG into [SOI, marker segments..., rest-from-SOS]; raw bytes, nothing re-encoded."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    out, i = [data[:2]], 2
    while i < len(data):
        if data[i] != 0xFF:
            raise ValueError("unexpected JPEG structure")
        if data[i + 1] == 0xDA:  # start of scan: everything after is image data
            out.append(data[i:])
            return out
        end = i + 2 + int.from_bytes(data[i + 2 : i + 4], "big")
        out.append(data[i:end])
        i = end
    return out


def _is_exif(seg: bytes) -> bool:
    return seg[:2] == b"\xff\xe1" and seg[4:10] == b"Exif\x00\x00"


def _image_only(data: bytes) -> bytes:
    """The JPEG minus its EXIF segment: everything that must stay byte-identical."""
    return b"".join(seg for seg in _segments(data) if not _is_exif(seg))


def _splice_exif(data: bytes, exif: bytes) -> bytes:
    """Replace the EXIF (APP1) segment, or add one after SOI/JFIF; every other byte is copied."""
    if len(exif) + 2 > 0xFFFF:
        raise ValueError("EXIF too large for one segment")
    new_seg = b"\xff\xe1" + (len(exif) + 2).to_bytes(2, "big") + exif
    segs = _segments(data)
    for k, seg in enumerate(segs):
        if _is_exif(seg):
            segs[k] = new_seg
            break
    else:
        at = 2 if segs[1][:2] == b"\xff\xe0" else 1  # after a JFIF header if there is one
        segs.insert(at, new_seg)
    return b"".join(segs)


# offsets *to* other parts of the EXIF block; they legitimately move when GPS is added
_POINTERS = {34665, 34853, 40965, 513}  # Exif IFD, GPS IFD, Interop IFD, thumbnail offset


def _exif_minus_gps(e: dict) -> dict:
    """Every EXIF tag and the thumbnail, minus GPS and internal pointers: must not change."""
    return {
        **{ifd: {k: v for k, v in e[ifd].items() if k not in _POINTERS} for ifd in ("0th", "Exif", "Interop", "1st")},
        "thumbnail": e["thumbnail"],
    }


def write_gps(path: Path, lat: float, lon: float) -> None:
    """Put lat/lon into the file's EXIF in place. Raises (leaving the file untouched) if the
    result can't be verified."""
    data = path.read_bytes()
    exif_before = piexif.load(data)
    exif = piexif.load(data)
    exif["GPS"] = gps_ifd(lat, lon)
    new = _splice_exif(data, piexif.dump(exif))

    if _image_only(new) != _image_only(data):
        raise ValueError("image data would change")
    if _exif_minus_gps(piexif.load(new)) != _exif_minus_gps(exif_before):
        raise ValueError("other EXIF tags would change")
    gps = Image.open(io.BytesIO(new)).getexif().get_ifd(0x8825)
    back = (dms_to_deg(gps[2], gps[1]), dms_to_deg(gps[4], gps[3]))
    if abs(back[0] - lat) > 1e-6 or abs(back[1] - lon) > 1e-6:
        raise ValueError(f"GPS read back as {back}")

    st = path.stat()
    tmp = path.with_name(path.name + ".geotag-tmp")
    tmp.write_bytes(new)
    os.replace(tmp, path)  # atomic: the original is never half-written
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns))


def run(cfg: Config, dry_run: bool) -> None:
    files = scan(cfg.inbox, {p.id for p in load_people(cfg.data)})
    recs = [
        {**read_meta(f), "name": f.name, "path": f, "photographer": who} for f, who, _trip in files
    ]
    fill_locations(recs, _toml(cfg.inbox / "locations.toml"), cfg.gps_fill_hours)
    manual = [r for r in recs if r.get("loc") in ("manual-file", "manual-date")]
    todo = [r for r in manual if r["path"].suffix.lower() in JPEG]
    for r in manual:
        if r not in todo:
            console.print(f"[yellow]skip[/] {r['name']}: only JPEGs can be geotagged")
    if not todo:
        console.print("Nothing to geotag: no hand-entered locations without EXIF GPS.")
        return
    done = 0
    for r in todo:
        label = f"{r['name']}  {r['lat']:.5f}, {r['lon']:.5f}  ({r['loc']})"
        if dry_run:
            console.print(f"  would tag {label}")
            continue
        try:
            write_gps(r["path"], r["lat"], r["lon"])
            done += 1
            console.print(f"  [green]tagged[/] {label}")
        except Exception as e:  # noqa: BLE001 - report and leave that original untouched
            console.print(f"  [red]skipped[/] {r['name']}: {e}")
    if dry_run:
        console.print(f"[yellow]Dry run: {len(todo)} photo(s) would be tagged. Nothing changed.[/]")
    else:
        console.print(f"Tagged {done} of {len(todo)}. Run `uv run pipeline ingest` to refresh the site.")
