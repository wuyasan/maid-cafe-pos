"""
Tests for gateway lock (Task A + P2b fail-closed hardening).

Scenarios:
1. When INTERNAL_GATEWAY_TOKEN is set:
   - Requests without the header → 401
   - Requests with correct header → passes through (≠401)
   - GET /api/v1/health always returns 200 regardless of header presence
2. When INTERNAL_GATEWAY_TOKEN is NOT set (dev mode):
   - All requests pass through without any header
3. Production fail-closed (APP_ENV=production):
   - Token not configured → 503 on all /api/v1/* routes (fail-closed)
   - Token configured + correct header → passes through
   - Token configured + wrong/missing header → 401
"""

import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def clear_gateway_env():
    """Ensure env vars are clean before and after each test."""
    old_token = os.environ.pop("INTERNAL_GATEWAY_TOKEN", None)
    old_env = os.environ.pop("APP_ENV", None)
    yield
    # Restore INTERNAL_GATEWAY_TOKEN
    if old_token is None:
        os.environ.pop("INTERNAL_GATEWAY_TOKEN", None)
    else:
        os.environ["INTERNAL_GATEWAY_TOKEN"] = old_token
    # Restore APP_ENV
    if old_env is None:
        os.environ.pop("APP_ENV", None)
    else:
        os.environ["APP_ENV"] = old_env


@pytest.fixture()
def fresh_client(db_engine):
    """
    Build a TestClient from a freshly-imported app so that the gateway
    dependency picks up the current env state at dependency-resolution time.
    (The gateway_auth module reads os.getenv at call time, so we don't need
    to reimport the module itself – the existing TestClient is fine.)
    """
    from app.main import app
    from app.core.database import get_db
    from sqlalchemy.orm import sessionmaker

    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=db_engine
    )

    def override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# [P2b] Production fail-closed: APP_ENV=production
# ---------------------------------------------------------------------------

class TestGatewayProductionFailClosed:
    def test_production_no_token_configured_returns_503(self, fresh_client):
        """In production without INTERNAL_GATEWAY_TOKEN set, all /api/v1/* requests
        must be rejected with 503 (fail-closed) to prevent unguarded traffic."""
        os.environ["APP_ENV"] = "production"
        assert "INTERNAL_GATEWAY_TOKEN" not in os.environ
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code == 503
        assert "gateway token not configured" in resp.json()["detail"].lower()

    def test_production_no_token_health_still_open(self, fresh_client):
        """Even in production without a token, the health endpoint remains open
        (it is exempt from the gateway dependency)."""
        os.environ["APP_ENV"] = "production"
        resp = fresh_client.get("/api/v1/health")
        assert resp.status_code == 200

    def test_production_with_token_correct_header_passes(self, fresh_client):
        """In production with token set and correct header, requests pass through."""
        os.environ["APP_ENV"] = "production"
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "prod-secret"
        resp = fresh_client.get(
            "/api/v1/sessions",
            headers={"X-Internal-Token": "prod-secret"},
        )
        assert resp.status_code != 401
        assert resp.status_code != 503

    def test_production_with_token_missing_header_returns_401(self, fresh_client):
        """In production with token set but no header, request is rejected 401."""
        os.environ["APP_ENV"] = "production"
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "prod-secret"
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code == 401

    def test_production_with_token_wrong_header_returns_401(self, fresh_client):
        """In production with token set, wrong header value is rejected 401."""
        os.environ["APP_ENV"] = "production"
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "prod-secret"
        resp = fresh_client.get(
            "/api/v1/sessions",
            headers={"X-Internal-Token": "wrong"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Health check is always open
# ---------------------------------------------------------------------------

class TestHealthAlwaysOpen:
    def test_health_no_token_no_header(self, fresh_client):
        """No env var, no header → health still 200."""
        resp = fresh_client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_health_with_token_set_no_header(self, fresh_client):
        """Env var set but no header → health is still 200 (exempt)."""
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "secret123"
        resp = fresh_client.get("/api/v1/health")
        assert resp.status_code == 200

    def test_health_with_token_set_wrong_header(self, fresh_client):
        """Wrong header on health → still 200 (health is unconditionally exempt)."""
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "secret123"
        resp = fresh_client.get("/api/v1/health", headers={"X-Internal-Token": "wrong"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Gateway enforcement when INTERNAL_GATEWAY_TOKEN is set
# ---------------------------------------------------------------------------

class TestGatewayEnforcedWhenTokenSet:
    def test_missing_header_returns_401(self, fresh_client):
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "supersecret"
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code == 401

    def test_wrong_header_returns_401(self, fresh_client):
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "supersecret"
        resp = fresh_client.get(
            "/api/v1/sessions",
            headers={"X-Internal-Token": "wrong-value"},
        )
        assert resp.status_code == 401

    def test_correct_header_passes_gateway(self, fresh_client):
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "supersecret"
        resp = fresh_client.get(
            "/api/v1/sessions",
            headers={"X-Internal-Token": "supersecret"},
        )
        # Passes the gateway (may be 200 or any non-401 status).
        assert resp.status_code != 401


# ---------------------------------------------------------------------------
# Dev mode: no INTERNAL_GATEWAY_TOKEN → all requests pass
# ---------------------------------------------------------------------------

class TestGatewayDevMode:
    def test_no_token_configured_no_header_passes(self, fresh_client):
        # INTERNAL_GATEWAY_TOKEN is absent (cleared by autouse fixture).
        assert "INTERNAL_GATEWAY_TOKEN" not in os.environ
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code != 401


# ---------------------------------------------------------------------------
# [P3] Blank / whitespace INTERNAL_GATEWAY_TOKEN treated as "not set"
# ---------------------------------------------------------------------------

class TestGatewayBlankToken:
    """Empty or whitespace INTERNAL_GATEWAY_TOKEN must behave identically to
    'not set' — not as a configured-but-unmatchable token that causes 401."""

    def test_dev_blank_token_no_header_passes(self, fresh_client):
        """Dev + INTERNAL_GATEWAY_TOKEN="" → dev fast-path (allow), not 401."""
        os.environ["INTERNAL_GATEWAY_TOKEN"] = ""
        assert "APP_ENV" not in os.environ  # default = development
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code != 401, (
            "Blank token in dev must not trigger 401; it should be treated as 'not set'."
        )

    def test_dev_whitespace_token_no_header_passes(self, fresh_client):
        """Dev + INTERNAL_GATEWAY_TOKEN='   ' (whitespace) → dev fast-path (allow), not 401."""
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "   "
        assert "APP_ENV" not in os.environ
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code != 401, (
            "Whitespace-only token in dev must not trigger 401."
        )

    def test_production_blank_token_returns_503_not_401(self, fresh_client):
        """Production + INTERNAL_GATEWAY_TOKEN="" → 503 fail-closed, NOT 401.
        Before the fix this returned 401 (header never matches ''), masking the
        misconfiguration as an auth failure instead of a service-level error."""
        os.environ["APP_ENV"] = "production"
        os.environ["INTERNAL_GATEWAY_TOKEN"] = ""
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code == 503, (
            f"Expected 503 fail-closed, got {resp.status_code}. "
            "Blank prod token must be treated as unconfigured."
        )
        assert "gateway token not configured" in resp.json()["detail"].lower()

    def test_production_whitespace_token_returns_503_not_401(self, fresh_client):
        """Production + INTERNAL_GATEWAY_TOKEN='  ' → 503 fail-closed, NOT 401."""
        os.environ["APP_ENV"] = "production"
        os.environ["INTERNAL_GATEWAY_TOKEN"] = "  "
        resp = fresh_client.get("/api/v1/sessions")
        assert resp.status_code == 503
        assert "gateway token not configured" in resp.json()["detail"].lower()
