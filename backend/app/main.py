import os
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Step 1 — validate pure-config values that depend on NO external resources.
# This must happen BEFORE importing api_router (or anything that pulls in
# app.core.database) so that a misconfigured CAFE_TIMEZONE surfaces as a
# clear RuntimeError instead of being masked by the DATABASE_URL error that
# database.py raises at import time.
# ---------------------------------------------------------------------------
from app.core.time import validate_cafe_timezone

validate_cafe_timezone()

# ---------------------------------------------------------------------------
# Step 2 — import modules that touch the database / heavier dependencies.
# database.py does a fail-fast check for DATABASE_URL at import time; by
# reaching here we have already validated all config that is cheaper to check.
# ---------------------------------------------------------------------------
from app.api.v1.api import api_router
from app.core.cors import cors_config
from app.core.gateway_auth import require_gateway

app = FastAPI(title="Maid Cafe Order API")

# ---------------------------------------------------------------------------
# CORS – prod: strict allowlist from FRONTEND_ORIGINS (comma-separated).
# dev (var unset): localhost + RFC1918 private LAN ranges, so the old staff-web
# and iPad on the cafe LAN keep working during Phase 1 (the "any host" catch-all
# is intentionally gone). See app/core/cors.py.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    **cors_config(os.getenv("FRONTEND_ORIGINS")),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.getenv("IMAGE_STORAGE_BACKEND", "local").strip().lower() == "local":
    upload_root = Path(
        os.getenv("LOCAL_UPLOAD_ROOT", "uploads")
    ).resolve()
    # Ensure sub-folders exist so StaticFiles doesn't fail on an empty root.
    (upload_root / "menu-items").mkdir(parents=True, exist_ok=True)
    (upload_root / "maids").mkdir(parents=True, exist_ok=True)
    app.mount(
        "/uploads",
        StaticFiles(directory=str(upload_root)),
        name="uploads",
    )

# ---------------------------------------------------------------------------
# Health check – exempt from gateway auth so load-balancers / monitors can
# always reach it without credentials.
# ---------------------------------------------------------------------------
@app.get("/api/v1/health", tags=["health"])
def health_check():
    return {"status": "ok"}


# All other /api/v1/* routes require the gateway token (when configured).
app.include_router(api_router, prefix="/api/v1", dependencies=[Depends(require_gateway)])


# ---------------------------------------------------------------------------
# Startup — idempotently bootstrap the default staff accounts from env PINs.
# Controlled by ENABLE_STARTUP_BOOTSTRAP (default "true"); the test suite turns
# it off so the TestClient lifespan never touches the real DB session.
# Wrapped in try/except so a bootstrap failure can never crash startup.
# ---------------------------------------------------------------------------
import logging

logger = logging.getLogger(__name__)


def _bootstrap_enabled() -> bool:
    return os.getenv("ENABLE_STARTUP_BOOTSTRAP", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


@app.on_event("startup")
def _startup_bootstrap_staff_users() -> None:
    if not _bootstrap_enabled():
        return
    try:
        from app.core.database import SessionLocal
        from app.services.staff_user_service import bootstrap_staff_users

        db = SessionLocal()
        try:
            bootstrap_staff_users(db)
        finally:
            db.close()
    except Exception:  # noqa: BLE001 — never let bootstrap crash startup.
        logger.exception("Staff-user bootstrap failed; continuing startup.")
