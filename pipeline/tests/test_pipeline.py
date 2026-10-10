import json
from datetime import date

from PIL import Image

from pipeline import ingest
from pipeline.ingest import (
    build_spot_visits,
    build_visits,
    dms_to_deg,
    fill_locations,
    make_derivatives,
    private_zone,
)
from pipeline.schemas import Config, Photo, SpotPeople, VisitOverride, Zone
from pipeline.trips import validate_trips

ORDER = {"zach": 0, "alex": 1, "sam": 2}


def test_dms_to_decimal_with_refs():
    assert round(dms_to_deg((49, 16, 17.04), "S"), 4) == -49.2714
    assert round(dms_to_deg((73, 2, 35.16), "W"), 4) == -73.0431
    assert round(dms_to_deg((34, 41, 3.257), "N"), 4) == 34.6842


def test_private_zone_1km_dropped_3km_kept():
    zones = [Zone(name="home", lat=45.0, lon=-93.0, radius_km=2.0)]
    one_km_north = 45.0 + 1 / 111.2
    three_km_north = 45.0 + 3 / 111.2
    assert private_zone(one_km_north, -93.0, zones) == "home"
    assert private_zone(three_km_north, -93.0, zones) is None


def test_coordinate_rounding():
    assert round(-49.271449, 4) == -49.2714
    assert round(-34.60374, 3) == -34.604


def _photo(name, lat, lon, local, who="zach", **kw):
    return {"name": name, "lat": lat, "lon": lon, "local": local, "photographer": who, **kw}


def test_fill_locations_priority_and_window():
    recs = [
        _photo("gps.jpg", 34.0, 135.0, "2025-04-16T10:00:00"),
        _photo("near.jpg", None, None, "2025-04-16T11:30:00"),  # 1.5h from gps.jpg
        _photo("far.jpg", None, None, "2025-04-16T20:00:00"),  # 10h away -> date entry
        _photo("named.jpg", None, None, "2025-04-16T10:05:00"),  # filename entry beats nearest
        _photo("other.jpg", None, None, "2025-04-16T10:01:00", who="alex"),  # no donor from other cameras
        _photo("lost.jpg", None, None, "2025-04-17T09:00:00"),
    ]
    manual = {"2025-04-16": {"lat": 35.0, "lon": 136.0}, "NAMED.JPG": {"lat": 1.0, "lon": 2.0}}
    fill_locations(recs, manual, hours=3)
    got = {r["name"]: (r["lat"], r.get("loc")) for r in recs}
    assert got["gps.jpg"] == (34.0, "exif")
    assert got["near.jpg"] == (34.0, "nearest")
    assert got["far.jpg"] == (35.0, "manual-date")
    assert got["named.jpg"] == (1.0, "manual-file")
    assert got["other.jpg"] == (35.0, "manual-date")
    assert got["lost.jpg"] == (None, None)


def test_dbscan_two_spots_one_country():
    cfg = Config()
    ps = [
        {"country": "argentina", "lat": -34.6037, "lon": -58.3816, "place": "Buenos Aires", "local": "1"},
        {"country": "argentina", "lat": -34.6100, "lon": -58.3900, "place": "Buenos Aires", "local": "2"},
        {"country": "argentina", "lat": -49.3301, "lon": -72.8861, "place": "El Chalten", "local": "3"},
    ]
    ingest.assign_spots(ps, cfg)
    assert [p["spot"] for p in ps] == ["buenos-aires", "buenos-aires", "el-chalten"]


def _dated(day, who="zach"):
    return {"day": date.fromisoformat(day), "photographer": who}


def test_visits_split_on_gap_and_override_replaces():
    ps = [_dated("2025-03-09"), _dated("2025-03-12"), _dated("2025-03-22"), _dated("2025-03-23")]
    v = build_visits("argentina", ps, 4, [], ORDER)
    assert [(x["start"], x["end"], x["photos"]) for x in v] == [
        ("2025-03-22", "2025-03-23", 2),
        ("2025-03-09", "2025-03-12", 2),
    ]
    assert v[1]["id"] == "argentina-2025-03" and v[0]["id"] == "argentina-2025-03-2"

    ov = VisitOverride(country="argentina", start=date(2025, 3, 7), end=date(2025, 3, 20), label="Patagonia trip")
    v = build_visits("argentina", ps, 4, [ov], ORDER)
    old = next(x for x in v if x["label"])
    assert (old["start"], old["end"], old["photos"]) == ("2025-03-07", "2025-03-20", 2)
    assert len(v) == 2


def test_two_photographers_are_companions_and_spot_override_narrows():
    ps = [_dated("2025-03-12", "alex"), _dated("2025-03-13", "zach")]
    ov = VisitOverride(country="argentina", start=date(2025, 3, 7), end=date(2025, 3, 22), companions=["sam"])
    (v,) = build_visits("argentina", ps, 4, [ov], ORDER)
    assert v["photographers"] == ["zach", "alex"]
    assert v["companions"] == ["zach", "alex", "sam"]

    narrow = [SpotPeople(country="argentina", spot="el-chalten", visit=v["id"], people=["zach", "alex"])]
    (sv,) = build_spot_visits(ps, {v["id"]: v}, narrow, "argentina", "el-chalten", ORDER)
    assert sv["people"] == ["zach", "alex"]


def test_hidden_companion_is_dropped():
    ov = VisitOverride(country="japan", start=date(2025, 4, 1), end=date(2025, 4, 30), companions=["ghost"])
    (v,) = build_visits("japan", [_dated("2025-04-16")], 4, [ov], ORDER)  # "ghost" not in visible order
    assert v["companions"] == ["zach"]


def test_derivatives_have_no_exif(tmp_path):
    src = tmp_path / "in.jpg"
    exif = Image.Exif()
    exif[271] = "FUJIFILM"
    exif.get_ifd(0x8825)[2] = (34.0, 41.0, 3.0)
    Image.new("RGB", (800, 600), "#7a8c95").save(src, exif=exif, xmp=b"<x:xmpmeta/>")
    w, h, color = make_derivatives(src, "abc", tmp_path / "p", [480, 1600], 82)
    assert (w, h) == (800, 600)  # never upscaled
    for size in (480, 1600):
        with Image.open(tmp_path / "p" / f"abc-{size}.webp") as im:
            assert len(im.getexif()) == 0
            assert not {"exif", "xmp", "icc_profile"} & set(im.info)
    assert color.startswith("#")


def test_output_validates_against_schema():
    for p in json.load(open("data/photos.example.json", encoding="utf-8")):
        Photo.model_validate(p)


def test_trips_validation():
    zones = [Zone(name="home", lat=45.0, lon=-93.0, radius_km=2.0)]
    ok = {"id": "a", "name": "A", "lat": 68.2, "lon": 14.0, "start": "2026-10-05", "end": "2026-10-16", "tz": "Europe/Oslo"}
    assert validate_trips([ok], zones) == ([], [])
    errs, warns = validate_trips(
        [
            {**ok, "id": "b", "end": "2026-10-01"},
            {**ok, "id": "c", "tz": "Mars/Base"},
            {**ok, "id": "d", "lat": 45.001, "lon": -93.0},
        ],
        zones,
    )
    assert any("before start" in e for e in errs)
    assert any("time zone" in e for e in errs)
    assert any("private zone" in e for e in errs)
    assert any("more than 2 decimals" in w for w in warns)


def test_trip_folder_uses_exact_dates_and_merges_photographers():
    ps = [
        {**_dated("2025-04-16"), "trip": "japan-2025"},
        {**_dated("2025-04-25", "alex"), "trip": "japan-2025"},  # 9-day gap, same folder -> one visit
        _dated("2025-06-01"),  # loose photo -> date-gap visit
    ]
    trips = {"japan-2025": {"start": date(2025, 4, 14), "end": date(2025, 4, 26), "label": "Japan", "companions": ["sam"]}}
    v = build_visits("japan", ps, 4, [], ORDER, trips)
    assert [(x["start"], x["end"], x["photos"], x["label"]) for x in v] == [
        ("2025-06-01", "2025-06-01", 1, None),
        ("2025-04-14", "2025-04-26", 2, "Japan"),
    ]
    assert v[1]["companions"] == ["zach", "alex", "sam"]
    # multi-country trip: each country gets its own photo date range
    v = build_visits("japan", ps[:2], 4, [], ORDER, trips, multi_country={"japan-2025"})
    assert (v[0]["start"], v[0]["end"]) == ("2025-04-16", "2025-04-25")


def test_stub_writers_are_valid_toml_and_idempotent(tmp_path):
    import tomllib

    from pipeline.ingest import add_location_stubs, add_trip_stubs

    recs = [{"name": "A.JPG", "local": "2025-04-17T09:30:00", "trip": "japan-2025"}]
    loc, trips = tmp_path / "locations.toml", tmp_path / "trip-dates.toml"
    for _ in range(2):
        add_location_stubs(loc, recs)
        add_trip_stubs(trips, recs, tomllib.loads(trips.read_text()) if trips.exists() else {})
    assert tomllib.loads(loc.read_text()) == {}  # stubs are commented out
    assert loc.read_text().count('"A.JPG"') == 1  # stub written once, not duplicated on re-run
    assert tomllib.loads(trips.read_text())["japan-2025"]["start"] == date(2025, 4, 17)


def test_photo_tags_drop_hidden_and_reject_unknown():
    import pytest

    from pipeline.ingest import photo_tags

    known = {"zach", "alex", "ghost"}
    assert photo_tags(["alex", "zach", "ghost"], "a.jpg", known, ORDER) == ["zach", "alex"]
    with pytest.raises(SystemExit, match="unknown people"):
        photo_tags(["bob"], "a.jpg", known, ORDER)


def test_geotag_writes_gps_losslessly_and_marks_it_manual(tmp_path):
    import piexif

    from pipeline.geotag import _image_only, write_gps
    from pipeline.ingest import read_meta

    src = tmp_path / "DSCF0001.JPG"
    exif = piexif.dump({"0th": {271: b"FUJIFILM"}, "Exif": {36867: b"2025:04:17 10:30:00"}})
    Image.new("RGB", (64, 48), "#7a8c95").save(src, quality=90, exif=exif)
    before = src.read_bytes()

    write_gps(src, -50.4354, -73.0029)

    after = src.read_bytes()
    assert _image_only(after) == _image_only(before)  # not re-encoded
    meta = read_meta(src)
    assert abs(meta["lat"] - -50.4354) < 1e-6 and abs(meta["lon"] - -73.0029) < 1e-6
    assert meta["gps_manual"] is True
    assert meta["local"] == "2025-04-17T10:30:00"  # other EXIF kept

    recs = [{**meta, "name": src.name, "photographer": "zach"}]
    fill_locations(recs, {}, hours=3)
    assert recs[0]["loc"] == "exif-manual"  # still reported as hand-placed, not camera GPS
