"""`upload`: sync published derivatives in photos/out/p to R2 (S3 API)."""

import json
import os
from pathlib import Path

from rich.console import Console

from .schemas import Config

console = Console()


def load_env(path: Path = Path(".env")) -> None:
    for line in path.read_text(encoding="utf-8").splitlines() if path.exists() else []:
        k, sep, v = line.partition("=")
        if sep and not k.strip().startswith("#"):
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def run(cfg: Config, dry_run: bool, prune: bool) -> None:
    import boto3

    if not cfg.r2:
        raise SystemExit("Add an [r2] section to config/pipeline.toml.")
    load_env()
    missing = [k for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY") if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"Missing in .env: {', '.join(missing)}")

    # Only what photos.json references goes up, never anything else lying around in photos/out.
    photos = json.loads((cfg.data / "photos.json").read_text(encoding="utf-8"))
    local = {f"p/{p['hash']}-{s}.webp" for p in photos for s in cfg.sizes}
    absent = sorted(k for k in local if not (cfg.out / k).exists())
    if absent:
        raise SystemExit(f"{len(absent)} derivatives missing locally (run ingest first), e.g. {absent[0]}")

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    remote = set()
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=cfg.r2.bucket, Prefix="p/"):
        remote |= {o["Key"] for o in page.get("Contents", [])}

    todo, extra = sorted(local - remote), sorted(remote - local)
    console.print(f"{len(todo)} to upload, {len(local & remote)} already there, {len(extra)} remote-only")
    for key in todo:
        console.print(f"  [green]+[/] {key}")
        if not dry_run:
            s3.upload_file(
                str(cfg.out / key), cfg.r2.bucket, key,
                ExtraArgs={"ContentType": "image/webp", "CacheControl": "public, max-age=31536000, immutable"},
            )
    if prune:
        for key in extra:
            console.print(f"  [red]-[/] {key}")
            if not dry_run:
                s3.delete_object(Bucket=cfg.r2.bucket, Key=key)
    if dry_run:
        console.print("[yellow]Dry run: nothing changed.[/]")
