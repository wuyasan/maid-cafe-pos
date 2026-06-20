import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.cors import PRIVATE_LAN_ORIGIN_REGEX, cors_config  # noqa: F401


class TestCorsConfig:
    def test_strict_allowlist_when_env_set(self):
        cfg = cors_config("https://app.example.com, https://admin.example.com")
        assert cfg == {
            "allow_origins": ["https://app.example.com", "https://admin.example.com"]
        }

    def test_dev_fallback_regex_when_unset(self):
        cfg = cors_config(None)
        assert "allow_origin_regex" in cfg
        rx = re.compile(cfg["allow_origin_regex"])
        assert rx.match("http://localhost:3000")
        assert rx.match("http://127.0.0.1:3001")
        assert rx.match("http://192.168.1.10:3000")
        assert rx.match("http://10.0.0.5:3001")
        assert rx.match("http://172.16.0.9:3000")
        assert not rx.match("http://evil.example.com")
        assert not rx.match("http://8.8.8.8:3000")

    def test_empty_string_falls_back_to_regex(self):
        assert "allow_origin_regex" in cors_config("")


def _dev_cors_client() -> TestClient:
    # Isolated app with the DEV fallback CORS, independent of ambient
    # FRONTEND_ORIGINS and of the real app's import-time config — so a CI/host
    # that exports FRONTEND_ORIGINS can't poison these assertions.
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        **cors_config(None),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return TestClient(app)


class TestCorsPreflight:
    def test_lan_origin_preflight_allowed_in_dev(self):
        client = _dev_cors_client()
        resp = client.options(
            "/ping",
            headers={
                "Origin": "http://192.168.1.10:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "http://192.168.1.10:3000"

    def test_public_origin_preflight_not_allowed_in_dev(self):
        client = _dev_cors_client()
        resp = client.options(
            "/ping",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.headers.get("access-control-allow-origin") != "http://evil.example.com"
