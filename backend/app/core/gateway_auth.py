"""
Gateway authentication dependency.

Behaviour is governed by two environment variables:

  APP_ENV                  – "production" or anything else (default "development").
  INTERNAL_GATEWAY_TOKEN   – shared secret that callers must supply in the
                             X-Internal-Token request header.

Rules:
  ┌─────────────────┬──────────────────────────────┬────────────────────────────────┐
  │ APP_ENV         │ INTERNAL_GATEWAY_TOKEN        │ Result                         │
  ├─────────────────┼──────────────────────────────┼────────────────────────────────┤
  │ development     │ not set / empty / whitespace  │ Allow (dev fast-path)          │
  │ development     │ set (non-blank)               │ Require correct token          │
  │ production      │ not set / empty / whitespace  │ REJECT all requests (503)      │
  │ production      │ set (non-blank)               │ Require correct token          │
  └─────────────────┴──────────────────────────────┴────────────────────────────────┘

  Blank / whitespace-only values for INTERNAL_GATEWAY_TOKEN are treated identically
  to "not set".  This prevents a misconfigured production deploy (e.g. the env var
  exists but holds an empty string) from silently rejecting every request with 401
  (header can never match "") instead of the explicit 503 fail-closed response.

The health endpoint (GET /api/v1/health) is registered WITHOUT this dependency
and therefore remains open at all times.
"""

import os

from fastapi import Header, HTTPException, status


def require_gateway(
    x_internal_token: str | None = Header(default=None),
) -> None:
    """FastAPI dependency – enforces the gateway token policy.

    In production (APP_ENV=production):
    - If INTERNAL_GATEWAY_TOKEN is not configured, every request is rejected with
      503 to prevent a misconfigured production deployment from serving unguarded
      traffic (fail-closed).
    - If the token is configured, the caller must supply the correct value in the
      X-Internal-Token header or receive 401.

    In development (APP_ENV != "production"):
    - If INTERNAL_GATEWAY_TOKEN is not set, all requests pass freely (dev fast-path).
    - If it IS set, it is still enforced (allows opt-in token checking locally).
    """
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    _raw_token = os.getenv("INTERNAL_GATEWAY_TOKEN")
    # Treat blank/whitespace-only values the same as "not set".
    expected = _raw_token.strip() if _raw_token is not None else None
    if expected == "":
        expected = None

    if app_env == "production":
        if expected is None:
            # Fail-closed: production must always have a gateway token configured.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gateway token not configured. Service unavailable.",
            )
        # Token is set in production — enforce it.
        if x_internal_token != expected:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid gateway token.",
            )
    else:
        # Development / staging mode.
        if expected is None:
            # No token configured in dev — allow everything (local fast-path).
            return
        # Token is configured even in dev — still enforce it.
        if x_internal_token != expected:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid gateway token.",
            )
