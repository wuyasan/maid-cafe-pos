"""Tests for the staff-user system (auth + admin management + bootstrap)."""

import os

import pytest

from app.core.security import hash_pin, verify_pin
from app.models.enums import StaffRole
from app.models.staff_user import StaffUser
from app.services import staff_user_service as svc
from app.services.staff_user_service import (
    LastActiveAdminError,
    UsernameAlreadyExists,
)


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------
def test_hash_pin_roundtrip():
    h = hash_pin("1234")
    assert h != "1234"
    assert verify_pin("1234", h) is True
    assert verify_pin("0000", h) is False


def test_verify_pin_handles_bad_input():
    assert verify_pin("1234", "not-a-bcrypt-hash") is False
    assert verify_pin("1234", "") is False


def test_hash_pin_is_salted():
    assert hash_pin("1234") != hash_pin("1234")


# ---------------------------------------------------------------------------
# Service CRUD
# ---------------------------------------------------------------------------
def _make(db, username="alice", role=StaffRole.staff, pin="1111", display="Alice"):
    return svc.create(
        db, username=username, display_name=display, role=role, pin=pin
    )


def test_create_and_get(db_session):
    user = _make(db_session)
    assert user.id is not None
    assert user.is_active is True
    fetched = svc.get(db_session, user.id)
    assert fetched.username == "alice"


def test_create_duplicate_username_raises(db_session):
    _make(db_session)
    with pytest.raises(UsernameAlreadyExists):
        _make(db_session)


def test_list_users(db_session):
    _make(db_session, username="a")
    _make(db_session, username="b")
    users = svc.list_users(db_session)
    assert {u.username for u in users} == {"a", "b"}


def test_update_fields(db_session):
    user = _make(db_session)
    svc.update(db_session, user.id, display_name="Alicia", role=StaffRole.manager)
    fetched = svc.get(db_session, user.id)
    assert fetched.display_name == "Alicia"
    assert fetched.role == StaffRole.manager


def test_set_active(db_session):
    user = _make(db_session)
    svc.set_active(db_session, user.id, False)
    assert svc.get(db_session, user.id).is_active is False


# ---------------------------------------------------------------------------
# Login verification
# ---------------------------------------------------------------------------
def test_verify_login_success_updates_last_login(db_session):
    user = _make(db_session, pin="4242")
    assert user.last_login_at is None
    result = svc.verify_login(db_session, "alice", "4242")
    assert result is not None
    assert result.last_login_at is not None


def test_verify_login_wrong_pin(db_session):
    _make(db_session, pin="4242")
    assert svc.verify_login(db_session, "alice", "0000") is None


def test_verify_login_unknown_user(db_session):
    assert svc.verify_login(db_session, "ghost", "1234") is None


def test_verify_login_inactive(db_session):
    user = _make(db_session, pin="4242")
    svc.set_active(db_session, user.id, False)
    assert svc.verify_login(db_session, "alice", "4242") is None


# ---------------------------------------------------------------------------
# Reset PIN
# ---------------------------------------------------------------------------
def test_reset_pin_invalidates_old(db_session):
    user = _make(db_session, pin="1111")
    svc.reset_pin(db_session, user.id, "2222")
    assert svc.verify_login(db_session, "alice", "1111") is None
    assert svc.verify_login(db_session, "alice", "2222") is not None


# ---------------------------------------------------------------------------
# Last-active-admin guard
# ---------------------------------------------------------------------------
def test_cannot_deactivate_last_active_admin(db_session):
    admin = _make(db_session, username="root", role=StaffRole.admin, pin="9999")
    with pytest.raises(LastActiveAdminError):
        svc.set_active(db_session, admin.id, False)


def test_cannot_demote_last_active_admin(db_session):
    admin = _make(db_session, username="root", role=StaffRole.admin, pin="9999")
    with pytest.raises(LastActiveAdminError):
        svc.update(db_session, admin.id, role=StaffRole.manager)


def test_can_deactivate_admin_when_another_active_admin_exists(db_session):
    a1 = _make(db_session, username="root", role=StaffRole.admin, pin="9999")
    _make(db_session, username="root2", role=StaffRole.admin, pin="8888")
    svc.set_active(db_session, a1.id, False)  # should not raise
    assert svc.get(db_session, a1.id).is_active is False


# ---------------------------------------------------------------------------
# Bootstrap idempotency
# ---------------------------------------------------------------------------
def test_bootstrap_creates_from_env_and_is_idempotent(db_session, monkeypatch):
    monkeypatch.setenv("ADMIN_PIN", "1111")
    monkeypatch.setenv("MANAGER_PIN", "2222")
    monkeypatch.setenv("STAFF_PIN", "3333")

    created = svc.bootstrap_staff_users(db_session)
    assert set(created) == {"admin", "manager", "staff"}

    # Second run creates nothing.
    created_again = svc.bootstrap_staff_users(db_session)
    assert created_again == []

    users = svc.list_users(db_session)
    assert len([u for u in users if u.username == "admin"]) == 1
    assert len(users) == 3
    assert svc.verify_login(db_session, "admin", "1111") is not None


def test_bootstrap_skips_missing_env(db_session, monkeypatch):
    monkeypatch.delenv("ADMIN_PIN", raising=False)
    monkeypatch.delenv("MANAGER_PIN", raising=False)
    monkeypatch.delenv("STAFF_PIN", raising=False)
    monkeypatch.setenv("ADMIN_PIN", "1111")

    created = svc.bootstrap_staff_users(db_session)
    assert created == ["admin"]


# ---------------------------------------------------------------------------
# API — auth
# ---------------------------------------------------------------------------
def _seed_user(db_session, **kw):
    return _make(db_session, **kw)


def test_login_endpoint_success(client, db_session):
    _make(db_session, username="bob", role=StaffRole.manager, pin="5555", display="Bob")
    resp = client.post(
        "/api/v1/staff/auth/login", json={"username": "bob", "pin": "5555"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "id": body["id"],
        "username": "bob",
        "display_name": "Bob",
        "role": "manager",
    }
    assert "pin_hash" not in body


def test_login_endpoint_wrong_pin_401(client, db_session):
    _make(db_session, username="bob", pin="5555")
    resp = client.post(
        "/api/v1/staff/auth/login", json={"username": "bob", "pin": "0000"}
    )
    assert resp.status_code == 401


def test_login_endpoint_unknown_401(client):
    resp = client.post(
        "/api/v1/staff/auth/login", json={"username": "ghost", "pin": "0000"}
    )
    assert resp.status_code == 401


def test_login_endpoint_inactive_401(client, db_session):
    u = _make(db_session, username="bob", pin="5555")
    svc.set_active(db_session, u.id, False)
    resp = client.post(
        "/api/v1/staff/auth/login", json={"username": "bob", "pin": "5555"}
    )
    assert resp.status_code == 401
    # Generic message — must not reveal the account is disabled.
    assert "disabled" not in resp.json()["detail"].lower()
    assert "inactive" not in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# API — admin management
# ---------------------------------------------------------------------------
def test_admin_list_excludes_pin_hash(client, db_session):
    _make(db_session, username="bob", pin="5555")
    resp = client.get("/api/v1/admin/staff-users")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert "pin_hash" not in rows[0]
    assert set(rows[0].keys()) >= {
        "id",
        "username",
        "display_name",
        "role",
        "is_active",
        "last_login_at",
        "created_at",
    }


def test_admin_create_user_201(client):
    resp = client.post(
        "/api/v1/admin/staff-users",
        json={
            "username": "carol",
            "display_name": "Carol",
            "role": "staff",
            "pin": "7777",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "carol"
    assert "pin_hash" not in body


def test_admin_create_duplicate_409(client, db_session):
    _make(db_session, username="carol", pin="7777")
    resp = client.post(
        "/api/v1/admin/staff-users",
        json={
            "username": "carol",
            "display_name": "Carol2",
            "role": "staff",
            "pin": "0000",
        },
    )
    assert resp.status_code == 409


def test_admin_patch_user(client, db_session):
    u = _make(db_session, username="carol", pin="7777")
    resp = client.patch(
        f"/api/v1/admin/staff-users/{u.id}",
        json={"display_name": "Caroline", "role": "manager"},
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Caroline"
    assert resp.json()["role"] == "manager"


def test_admin_reset_pin_endpoint(client, db_session):
    u = _make(db_session, username="carol", pin="7777")
    resp = client.post(
        f"/api/v1/admin/staff-users/{u.id}/reset-pin", json={"pin": "8888"}
    )
    assert resp.status_code == 200
    # The HTTP endpoint committed via a separate session; drop our identity-map
    # cache so we read the freshly-written pin_hash, not the stale one.
    db_session.expire_all()
    assert svc.verify_login(db_session, "carol", "7777") is None
    assert svc.verify_login(db_session, "carol", "8888") is not None


def test_admin_cannot_deactivate_last_admin_409(client, db_session):
    admin = _make(db_session, username="root", role=StaffRole.admin, pin="9999")
    resp = client.patch(
        f"/api/v1/admin/staff-users/{admin.id}", json={"is_active": False}
    )
    assert resp.status_code == 409


def test_admin_patch_unknown_404(client):
    resp = client.patch(
        "/api/v1/admin/staff-users/99999", json={"display_name": "x"}
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# API — input validation (F1 follow-up)
# ---------------------------------------------------------------------------
def _create_payload(**overrides):
    payload = {
        "username": "dave",
        "display_name": "Dave",
        "role": "staff",
        "pin": "1234",
    }
    payload.update(overrides)
    return payload


def test_create_valid_201(client):
    resp = client.post("/api/v1/admin/staff-users", json=_create_payload())
    assert resp.status_code == 201
    assert resp.json()["username"] == "dave"


def test_create_empty_pin_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(pin="")
    )
    assert resp.status_code == 422


def test_create_short_pin_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(pin="1")
    )
    assert resp.status_code == 422


def test_create_non_numeric_pin_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(pin="abcd")
    )
    assert resp.status_code == 422


def test_create_too_long_pin_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(pin="1234567890123")
    )
    assert resp.status_code == 422


def test_create_empty_username_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(username="")
    )
    assert resp.status_code == 422


def test_create_blank_username_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(username="   ")
    )
    assert resp.status_code == 422


def test_create_short_username_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(username="ab")
    )
    assert resp.status_code == 422


def test_create_bad_charset_username_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(username="bad name!")
    )
    assert resp.status_code == 422


def test_create_empty_display_name_422(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(display_name="   ")
    )
    assert resp.status_code == 422


def test_create_username_uppercase_stored_lowercase(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(username="DaveSmith")
    )
    assert resp.status_code == 201
    assert resp.json()["username"] == "davesmith"


def test_create_username_trimmed_and_lowercased(client):
    resp = client.post(
        "/api/v1/admin/staff-users", json=_create_payload(username="  Eve_01  ")
    )
    assert resp.status_code == 201
    assert resp.json()["username"] == "eve_01"


def test_reset_pin_invalid_422(client, db_session):
    u = _make(db_session, username="carol", pin="7777")
    resp = client.post(
        f"/api/v1/admin/staff-users/{u.id}/reset-pin", json={"pin": "12"}
    )
    assert resp.status_code == 422


def test_reset_pin_empty_422(client, db_session):
    u = _make(db_session, username="carol", pin="7777")
    resp = client.post(
        f"/api/v1/admin/staff-users/{u.id}/reset-pin", json={"pin": ""}
    )
    assert resp.status_code == 422


def test_update_blank_display_name_422(client, db_session):
    u = _make(db_session, username="carol", pin="7777")
    resp = client.patch(
        f"/api/v1/admin/staff-users/{u.id}", json={"display_name": "   "}
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Service-level normalization (defense in depth)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Concurrency: IntegrityError on commit → UsernameAlreadyExists (not 500)
# ---------------------------------------------------------------------------
def test_create_commit_integrity_error_raises_username_exists(
    db_session, monkeypatch
):
    """If two requests both pass the get_by_username pre-check and race to the
    DB, the loser's commit raises IntegrityError. create() must roll back and
    raise UsernameAlreadyExists (so the endpoint returns 409, not 500)."""
    from sqlalchemy.exc import IntegrityError

    original_commit = db_session.commit
    state = {"n": 0}

    def _commit_raises_once(*args, **kwargs):
        state["n"] += 1
        if state["n"] == 1:
            raise IntegrityError(
                "duplicate key value violates unique constraint "
                '"ix_staff_users_username"',
                None,
                None,
            )
        return original_commit(*args, **kwargs)

    monkeypatch.setattr(db_session, "commit", _commit_raises_once)

    with pytest.raises(UsernameAlreadyExists):
        svc.create(
            db_session,
            username="racer",
            display_name="Racer",
            role=StaffRole.staff,
            pin="1234",
        )

    assert state["n"] == 1  # the IntegrityError branch actually fired


def test_create_concurrent_duplicate_endpoint_returns_409_not_500(client):
    """End-to-end: when the DB rejects the duplicate insert with IntegrityError
    (simulated by patching the request session's commit to raise once), the
    POST endpoint must return 409, never 500."""
    from sqlalchemy.exc import IntegrityError

    from app.core.database import get_db

    # The TestClient's get_db override yields a fresh session per request. Wrap
    # it so the FIRST commit of the FIRST yielded session raises IntegrityError,
    # mimicking the losing side of a username race after the pre-check passed.
    app = client.app
    original_override = app.dependency_overrides[get_db]
    state = {"patched": False}

    def patched_get_db():
        gen = original_override()
        session = next(gen)
        if not state["patched"]:
            state["patched"] = True
            real_commit = session.commit
            calls = {"n": 0}

            def _commit(*args, **kwargs):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise IntegrityError(
                        "duplicate key value violates unique constraint",
                        None,
                        None,
                    )
                return real_commit(*args, **kwargs)

            session.commit = _commit
        try:
            yield session
        finally:
            try:
                next(gen)
            except StopIteration:
                pass

    app.dependency_overrides[get_db] = patched_get_db
    try:
        resp = client.post(
            "/api/v1/admin/staff-users",
            json={
                "username": "racer2",
                "display_name": "Racer2",
                "role": "staff",
                "pin": "1234",
            },
        )
    finally:
        app.dependency_overrides[get_db] = original_override

    assert resp.status_code == 409, resp.text


def test_service_normalizes_username_on_create(db_session):
    user = svc.create(
        db_session,
        username="  MixedCase  ",
        display_name="  Mixed  ",
        role=StaffRole.staff,
        pin="1234",
    )
    assert user.username == "mixedcase"
    assert user.display_name == "Mixed"
    # Uniqueness lookup works on the normalized value regardless of casing.
    assert svc.get_by_username(db_session, "MIXEDCASE") is not None
