"""CORS origin policy.

Prod: strict explicit allowlist from FRONTEND_ORIGINS.
Dev (FRONTEND_ORIGINS unset): allow localhost + RFC1918 private LAN ranges, so the
old staff-web and the iPad on the cafe LAN keep working during Phase 1. This is
deliberately NOT the original "any host" catch-all (that was the security finding).
"""

# localhost + 192.168/16, 10/8, 172.16-31 private ranges, any port.
PRIVATE_LAN_ORIGIN_REGEX = (
    r"^https?://("
    r"localhost|127\.0\.0\.1"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?$"
)


def cors_config(frontend_origins: str | None) -> dict:
    """Return CORSMiddleware kwargs for the allowed origins.

    - FRONTEND_ORIGINS set (comma-separated) → strict allowlist (production).
    - unset/empty → dev fallback regex (localhost + private LAN).
    """
    if frontend_origins and frontend_origins.strip():
        origins = [o.strip() for o in frontend_origins.split(",") if o.strip()]
        return {"allow_origins": origins}
    return {"allow_origin_regex": PRIVATE_LAN_ORIGIN_REGEX}
