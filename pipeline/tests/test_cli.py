from typer.testing import CliRunner

from pipeline.cli import app


def test_help_lists_commands():
    out = CliRunner().invoke(app, ["--help"]).output
    for cmd in ("ingest", "upload", "trips", "report"):
        assert cmd in out
