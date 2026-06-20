"""
Datetime helpers for the Maid Cafe POS backend.

utcnow()
    Thin wrapper around datetime.now(UTC) that returns a naive UTC datetime.
    Using datetime.now(timezone.utc) avoids the DeprecationWarning emitted by
    datetime.utcnow() in Python 3.12+.  The .replace(tzinfo=None) strip keeps
    the value naive so it stays compatible with all existing SQLAlchemy columns
    (declared without timezone=True) and any code that compares against naive
    datetimes.

now_in_cafe_tz()
    Return the current wall-clock time at the cafe's physical location.
    Reads the CAFE_TIMEZONE environment variable (default "UTC").  This is
    used for business-logic comparisons such as last-order cutoffs so that
    the result is always in store-local time regardless of where the server
    is running.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    """Return the current UTC time as a naive datetime (tzinfo=None)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def now_in_cafe_tz() -> datetime:
    """Return the current time in the cafe's configured local timezone.

    The timezone is read from the ``CAFE_TIMEZONE`` environment variable
    (e.g. ``"America/Chicago"``).  When the variable is absent or empty the
    function falls back to ``"UTC"`` so existing deployments are unaffected.

    The returned datetime is *aware* (has tzinfo set to the cafe timezone) so
    callers can extract ``.date()`` and ``.time()`` in store-local terms.
    """
    tz_name = os.getenv("CAFE_TIMEZONE") or "UTC"
    return datetime.now(ZoneInfo(tz_name))


def validate_cafe_timezone() -> str:
    """Validate CAFE_TIMEZONE at startup and fail-fast on a bad value.

    Returns the resolved timezone name. Raises ``RuntimeError`` with a clear
    message when CAFE_TIMEZONE names a zone ``ZoneInfo`` cannot load, so the app
    refuses to boot rather than silently operating in the wrong timezone — or
    raising ``ZoneInfoNotFoundError`` (HTTP 500) on the ordering path per request.
    """
    tz_name = os.getenv("CAFE_TIMEZONE") or "UTC"
    try:
        ZoneInfo(tz_name)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(
            f"Invalid CAFE_TIMEZONE={tz_name!r}: not a known IANA timezone. "
            "Set CAFE_TIMEZONE to a valid zone (e.g. 'America/Chicago') or leave "
            "it unset to default to UTC."
        ) from exc
    return tz_name
