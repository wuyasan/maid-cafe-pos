"""CAFE_TIMEZONE startup validation (fail-fast on a misconfigured zone)."""

import os
import sys
import subprocess

import pytest

from app.core.time import validate_cafe_timezone


def test_defaults_to_utc_when_unset(monkeypatch):
    monkeypatch.delenv("CAFE_TIMEZONE", raising=False)
    assert validate_cafe_timezone() == "UTC"


def test_empty_falls_back_to_utc(monkeypatch):
    monkeypatch.setenv("CAFE_TIMEZONE", "")
    assert validate_cafe_timezone() == "UTC"


def test_accepts_valid_zone(monkeypatch):
    monkeypatch.setenv("CAFE_TIMEZONE", "America/Chicago")
    assert validate_cafe_timezone() == "America/Chicago"


def test_invalid_zone_raises_runtimeerror(monkeypatch):
    monkeypatch.setenv("CAFE_TIMEZONE", "Not/A_Real_Zone")
    with pytest.raises(RuntimeError, match="CAFE_TIMEZONE"):
        validate_cafe_timezone()


def test_main_import_reports_timezone_error_before_db_error():
    """Importing app.main with an invalid CAFE_TIMEZONE must fail with a
    CAFE_TIMEZONE RuntimeError even when DATABASE_URL is absent.

    Uses subprocess so that the import side-effects (database.py fail-fast,
    module-level validate_cafe_timezone()) run in a fresh interpreter — monkeypatch
    cannot intercept module-level code that has already been executed by the test
    process's own import machinery.
    """
    env = {
        # Propagate PATH / PYTHONPATH so the subprocess can find the venv.
        **{k: v for k, v in os.environ.items() if k in ("PATH", "PYTHONPATH", "HOME", "LANG")},
        "CAFE_TIMEZONE": "Not/A_Real_Zone",
        # Intentionally omit DATABASE_URL to ensure the timezone check fires first.
    }
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode != 0, (
        "Expected non-zero exit when CAFE_TIMEZONE is invalid, got returncode=0"
    )
    assert "CAFE_TIMEZONE" in result.stderr, (
        f"Expected 'CAFE_TIMEZONE' in stderr (timezone error should surface before DB error).\n"
        f"stderr was:\n{result.stderr}"
    )
