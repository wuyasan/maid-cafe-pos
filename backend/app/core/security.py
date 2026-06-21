"""Password / PIN hashing helpers (bcrypt)."""

from __future__ import annotations

import bcrypt


def hash_pin(pin: str) -> str:
    """Hash a plaintext PIN with bcrypt and return the UTF-8 hash string."""
    if not isinstance(pin, str):
        raise TypeError("pin must be a string")
    hashed = bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_pin(pin: str, pin_hash: str) -> bool:
    """Return True iff the plaintext PIN matches the stored bcrypt hash.

    Never raises on malformed input — returns False instead, so callers can
    treat any failure as an authentication failure without leaking details.
    """
    if not isinstance(pin, str) or not pin_hash:
        return False
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), pin_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False
