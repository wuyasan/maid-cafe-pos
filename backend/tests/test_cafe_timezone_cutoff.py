"""
Tests for CAFE_TIMEZONE-aware last-order cutoff logic.

Scenario: server runs in UTC, cafe is in America/Chicago (UTC-5 in standard
time, UTC-6 in daylight saving — these tests pin a CST offset to remain
deterministic without depending on DST tables).

We monkey-patch ``app.core.time.now_in_cafe_tz`` (the single call site used
by ``_station_is_closed``) so we can inject an arbitrary "current" time
without touching the system clock.
"""

from __future__ import annotations

import importlib
import os
from datetime import date, time, timezone
from zoneinfo import ZoneInfo

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_session(service_date: date, kitchen_cutoff: time | None = None,
                  bar_cutoff: time | None = None):
    """Return a minimal mock that quacks like SessionModel for _station_is_closed."""

    class FakeSession:
        pass

    s = FakeSession()
    s.service_date = service_date
    s.kitchen_last_order_time = kitchen_cutoff
    s.bar_last_order_time = bar_cutoff
    return s


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_cafe_tz_env(monkeypatch):
    """Ensure CAFE_TIMEZONE is clean before and after each test."""
    monkeypatch.delenv("CAFE_TIMEZONE", raising=False)
    yield
    monkeypatch.delenv("CAFE_TIMEZONE", raising=False)


# ---------------------------------------------------------------------------
# Unit tests for _station_is_closed via now_in_cafe_tz
# ---------------------------------------------------------------------------

class TestCafeTzCutoff:
    """
    Verify that _station_is_closed uses the CAFE_TIMEZONE env var, not the
    server's local timezone.

    Key scenario (UTC server, America/Chicago cafe, UTC-6 CST offset):

        Wall-clock UTC  |  Chicago time
        ----------------+--------------
        23:00 UTC       |  17:00 CST   <- before an 18:00 cutoff -> OPEN
        00:30 UTC+1day  |  18:30 CST   <- after an 18:00 cutoff  -> CLOSED

    A naïve datetime.now() (UTC or server-local) would give the wrong date
    in the second scenario (next UTC day vs same Chicago day).
    """

    def _get_station_is_closed(self):
        """Import (or re-import) _station_is_closed fresh so env changes take effect."""
        import app.services.order_service as mod
        return mod._station_is_closed

    def _patch_now(self, monkeypatch, aware_dt):
        """Patch now_in_cafe_tz to return a fixed aware datetime."""
        import app.core.time as time_mod
        import app.services.order_service as svc_mod
        monkeypatch.setattr(time_mod, "now_in_cafe_tz", lambda: aware_dt)
        # order_service imported now_in_cafe_tz at module level; patch that reference too.
        monkeypatch.setattr(svc_mod, "now_in_cafe_tz", lambda: aware_dt)

    # ------------------------------------------------------------------
    # 1. Server=UTC, cafe=Chicago — time before cutoff in Chicago → OPEN
    # ------------------------------------------------------------------
    def test_chicago_before_cutoff_is_open(self, monkeypatch):
        """
        23:00 UTC on service day == 17:00 CST.
        Kitchen cutoff is 18:00.  Should be OPEN.

        A naïve datetime.now() returning 23:00 would INCORRECTLY mark closed.
        """
        chicago = ZoneInfo("America/Chicago")
        # 2025-01-15 23:00 UTC = 2025-01-15 17:00 CST (UTC-6 in January)
        from datetime import datetime as dt
        chicago_now = dt(2025, 1, 15, 17, 0, 0, tzinfo=chicago)

        self._patch_now(monkeypatch, chicago_now)

        from app.models.enums import ProductionStation
        _station_is_closed = self._get_station_is_closed()

        session = _make_session(
            service_date=date(2025, 1, 15),
            kitchen_cutoff=time(18, 0),
        )

        # 17:00 CST < 18:00 cutoff → station is NOT closed
        result = _station_is_closed(session, ProductionStation.kitchen, chicago_now)
        assert result is False, (
            "Kitchen should be OPEN at 17:00 cafe-local time with 18:00 cutoff"
        )

    # ------------------------------------------------------------------
    # 2. Server=UTC, cafe=Chicago — time after cutoff in Chicago → CLOSED
    # ------------------------------------------------------------------
    def test_chicago_after_cutoff_is_closed(self, monkeypatch):
        """
        00:30 UTC (next calendar day) == 18:30 CST on the service date.
        Kitchen cutoff is 18:00.  Should be CLOSED.

        A naïve datetime.now() returning 00:30 on a new UTC date would
        INCORRECTLY compare against the wrong calendar date.
        """
        chicago = ZoneInfo("America/Chicago")
        # 2025-01-16 00:30 UTC = 2025-01-15 18:30 CST (UTC-6 in January)
        from datetime import datetime as dt
        chicago_now = dt(2025, 1, 15, 18, 30, 0, tzinfo=chicago)

        self._patch_now(monkeypatch, chicago_now)

        from app.models.enums import ProductionStation
        _station_is_closed = self._get_station_is_closed()

        session = _make_session(
            service_date=date(2025, 1, 15),
            kitchen_cutoff=time(18, 0),
        )

        # 18:30 CST >= 18:00 cutoff → station IS closed
        result = _station_is_closed(session, ProductionStation.kitchen, chicago_now)
        assert result is True, (
            "Kitchen should be CLOSED at 18:30 cafe-local time with 18:00 cutoff"
        )

    # ------------------------------------------------------------------
    # 3. No cutoff set → always open regardless of timezone
    # ------------------------------------------------------------------
    def test_no_cutoff_always_open(self, monkeypatch):
        chicago = ZoneInfo("America/Chicago")
        from datetime import datetime as dt
        chicago_now = dt(2025, 1, 15, 23, 59, 0, tzinfo=chicago)

        self._patch_now(monkeypatch, chicago_now)

        from app.models.enums import ProductionStation
        _station_is_closed = self._get_station_is_closed()

        session = _make_session(
            service_date=date(2025, 1, 15),
            kitchen_cutoff=None,
        )

        result = _station_is_closed(session, ProductionStation.kitchen, chicago_now)
        assert result is False, "Should be OPEN when no cutoff is configured"

    # ------------------------------------------------------------------
    # 4. ProductionStation.none is never closed
    # ------------------------------------------------------------------
    def test_station_none_never_closed(self, monkeypatch):
        chicago = ZoneInfo("America/Chicago")
        from datetime import datetime as dt
        chicago_now = dt(2025, 1, 15, 23, 59, 0, tzinfo=chicago)

        self._patch_now(monkeypatch, chicago_now)

        from app.models.enums import ProductionStation
        _station_is_closed = self._get_station_is_closed()

        session = _make_session(
            service_date=date(2025, 1, 15),
            kitchen_cutoff=time(0, 1),   # 1 minute after midnight — well past
        )

        result = _station_is_closed(session, ProductionStation.none, chicago_now)
        assert result is False, "ProductionStation.none should never be closed"


# ---------------------------------------------------------------------------
# Integration: now_in_cafe_tz reads CAFE_TIMEZONE env var
# ---------------------------------------------------------------------------

class TestNowInCafeTz:
    def test_default_is_utc(self, monkeypatch):
        monkeypatch.delenv("CAFE_TIMEZONE", raising=False)
        from app.core.time import now_in_cafe_tz
        result = now_in_cafe_tz()
        assert result.tzinfo is not None
        assert result.utcoffset().total_seconds() == 0.0

    def test_cafe_timezone_chicago(self, monkeypatch):
        monkeypatch.setenv("CAFE_TIMEZONE", "America/Chicago")
        # Reload to pick up env change (module-level cache of ZoneInfo is fine;
        # the function reads os.getenv each call so no reload needed)
        from app.core.time import now_in_cafe_tz
        result = now_in_cafe_tz()
        assert result.tzinfo is not None
        # Chicago is UTC-5 or UTC-6; offset != 0
        utc_offset = result.utcoffset().total_seconds()
        assert utc_offset in (-5 * 3600, -6 * 3600), (
            f"Expected Chicago UTC offset (-5h or -6h), got {utc_offset}s"
        )

    def test_empty_env_falls_back_to_utc(self, monkeypatch):
        monkeypatch.setenv("CAFE_TIMEZONE", "")
        from app.core.time import now_in_cafe_tz
        result = now_in_cafe_tz()
        assert result.utcoffset().total_seconds() == 0.0
