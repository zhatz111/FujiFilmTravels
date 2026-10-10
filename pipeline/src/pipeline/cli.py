"""Where's Zach photo pipeline CLI. Run from the repo root: `uv run pipeline <command>`."""

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from .schemas import load_config

app = typer.Typer(no_args_is_help=True, help=__doc__)
console = Console()

CONFIG = typer.Option(Path("config/pipeline.toml"), "--config", help="Pipeline config file.")


def _print_report(r: dict) -> None:
    console.print(f"[bold]{r['published']}[/] of {r['scanned']} photos published")
    if r["locations"]:
        console.print("Location source: " + ", ".join(f"{k} {v}" for k, v in sorted(r["locations"].items())))
    for reason, names in sorted(r["skipped"].items()):
        console.print(f"[yellow]Skipped ({reason}): {len(names)}[/] " + ", ".join(names[:12]) + (" ..." if len(names) > 12 else ""))
    t = Table("Country", "Spot", "Photos")
    for country, spots in r["countries"].items():
        for i, (spot, n) in enumerate(spots.items()):
            t.add_row(country if i == 0 else "", spot, str(n))
    console.print(t)


@app.command()
def ingest(
    config: Path = CONFIG,
    force: bool = typer.Option(False, "--force", help="Reprocess files even if unchanged."),
) -> None:
    """Process photos/inbox into photos/out derivatives and data/*.json."""
    from .ingest import run

    _print_report(run(load_config(config), force))


@app.command()
def geotag(
    config: Path = CONFIG,
    dry_run: bool = typer.Option(False, "--dry-run", help="List what would be tagged; change nothing."),
) -> None:
    """Write hand-entered locations (locations.toml) into the original JPEGs' EXIF, losslessly."""
    from .geotag import run

    run(load_config(config), dry_run)


@app.command()
def upload(
    config: Path = CONFIG,
    dry_run: bool = typer.Option(False, "--dry-run", help="Show what would upload."),
    prune: bool = typer.Option(False, "--prune", help="Delete remote objects not in photos.json."),
) -> None:
    """Sync photos/out/p to R2 (missing objects only)."""
    from .upload import run

    run(load_config(config), dry_run, prune)


@app.command()
def trips(config: Path = CONFIG) -> None:
    """Validate data/trips.json."""
    from .trips import validate_trips

    cfg = load_config(config)
    errors, warnings = validate_trips(json.loads((cfg.data / "trips.json").read_text(encoding="utf-8")), cfg.private_zones)
    for w in warnings:
        console.print(f"[yellow]warning[/] {w}")
    for e in errors:
        console.print(f"[red]error[/] {e}")
    if errors:
        raise typer.Exit(1)
    console.print("[green]trips.json OK[/]")


@app.command()
def report(config: Path = CONFIG) -> None:
    """Summarize photos, skips, countries and spots from the last ingest."""
    f = load_config(config).out / "report.json"
    if not f.exists():
        raise SystemExit("No report yet; run `uv run pipeline ingest` first.")
    _print_report(json.loads(f.read_text(encoding="utf-8")))
