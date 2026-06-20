"""
Square server-side payment verification seam.

When SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID are set, every non-manual
Square mark-paid call is verified against the Square Payments API before the
bill is closed.  When those env vars are absent the function returns
``{"configured": False}`` and the caller falls back to the original trust-the-
frontend behaviour (traceable but unverified) — preserving MVP ergonomics for
unconfigured deployments.

Configuration (environment variables):
  SQUARE_ACCESS_TOKEN  – Square OAuth / personal access token.
  SQUARE_LOCATION_ID   – The Square location that must own the charge.
  SQUARE_API_BASE      – (optional) Override the Square API base URL.
                         Defaults to https://connect.squareup.com.
                         Set to a sandbox/mock URL in tests.

Return value (dict):
  {"configured": False}
      Square credentials not present; caller should allow and record.

  {"configured": True, "valid": True, "reason": "ok"}
      Charge verified: COMPLETED, correct amount, correct location.

  {"configured": True, "valid": False, "reason": "<human-readable>"}
      Charge failed verification; caller should reject with 400/402.
"""

from __future__ import annotations

import os
from typing import TypedDict

import httpx


class _Unconfigured(TypedDict):
    configured: bool  # always False


class _Verified(TypedDict):
    configured: bool  # always True
    valid: bool
    reason: str


VerificationResult = _Unconfigured | _Verified


def verify_square_payment(
    provider_payment_id: str,
    expected_amount_cents: int,
) -> VerificationResult:
    """Verify a Square payment server-side.

    Parameters
    ----------
    provider_payment_id:
        The Square payment ID returned by the Square POS deep-link callback.
    expected_amount_cents:
        The expected charge amount **in cents** (integer).  E.g. $50.00 → 5000.

    Returns
    -------
    VerificationResult dict.  See module docstring for shape/semantics.
    """
    access_token = os.getenv("SQUARE_ACCESS_TOKEN", "").strip()
    location_id = os.getenv("SQUARE_LOCATION_ID", "").strip()

    if not access_token or not location_id:
        return {"configured": False}

    api_base = os.getenv(
        "SQUARE_API_BASE", "https://connect.squareup.com"
    ).rstrip("/")
    url = f"{api_base}/v2/payments/{provider_payment_id}"

    try:
        with httpx.Client(timeout=10.0) as http:
            resp = http.get(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": "2024-01-18",
                    "Content-Type": "application/json",
                },
            )
    except Exception as exc:  # noqa: BLE001  (network / httpx error)
        return {
            "configured": True,
            "valid": False,
            "reason": f"Network error contacting Square: {exc}",
        }

    if resp.status_code != 200:
        return {
            "configured": True,
            "valid": False,
            "reason": (
                f"Square API returned HTTP {resp.status_code} for payment "
                f"{provider_payment_id!r}."
            ),
        }

    try:
        data = resp.json()
    except Exception:
        return {
            "configured": True,
            "valid": False,
            "reason": "Square API returned non-JSON response.",
        }

    payment = data.get("payment", {})

    # 1. Payment status must be COMPLETED.
    status = payment.get("status", "")
    if status != "COMPLETED":
        return {
            "configured": True,
            "valid": False,
            "reason": (
                f"Square payment status is {status!r}; expected 'COMPLETED'."
            ),
        }

    # 2. Amount must match (Square uses integer cents).
    amount_money = payment.get("amount_money", {})
    actual_cents = amount_money.get("amount")
    if actual_cents != expected_amount_cents:
        return {
            "configured": True,
            "valid": False,
            "reason": (
                f"Square payment amount {actual_cents} cents does not match "
                f"expected {expected_amount_cents} cents."
            ),
        }

    # 3. Currency must match the configured/expected currency.
    expected_currency = os.getenv("SQUARE_CURRENCY", "USD").strip().upper()
    actual_currency = amount_money.get("currency", "")
    if actual_currency != expected_currency:
        return {
            "configured": True,
            "valid": False,
            "reason": (
                f"Square payment currency {actual_currency!r} does not match "
                f"expected currency {expected_currency!r}."
            ),
        }

    # 4. Location must match our configured location.  (was check #3 before currency added)
    actual_location = payment.get("location_id", "")
    if actual_location != location_id:
        return {
            "configured": True,
            "valid": False,
            "reason": (
                f"Square payment location {actual_location!r} does not match "
                f"configured location {location_id!r}."
            ),
        }

    return {"configured": True, "valid": True, "reason": "ok"}
