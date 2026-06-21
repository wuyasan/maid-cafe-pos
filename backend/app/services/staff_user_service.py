"""Staff-user business logic: CRUD, login verification, and bootstrap.

Errors are raised as plain exceptions defined here; the API layer maps them to
HTTP status codes. The service never deals with HTTP concerns directly.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_pin, verify_pin
from app.models.enums import StaffRole
from app.models.staff_user import StaffUser

logger = logging.getLogger(__name__)


def _normalize_username(username: str) -> str:
    """Service-level normalization (defense in depth).

    Pydantic is the gateway, but normalize here too so usernames are always
    stored lowercased/trimmed and uniqueness checks operate on the canonical
    value regardless of caller.
    """
    return username.strip().lower()


class StaffUserError(Exception):
    """Base class for staff-user service errors."""


class UsernameAlreadyExists(StaffUserError):
    """Raised when creating a user whose username is already taken."""


class StaffUserNotFound(StaffUserError):
    """Raised when a user id cannot be found."""


class LastActiveAdminError(StaffUserError):
    """Raised when an action would remove the final active admin."""


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------
def get(db: Session, user_id: int) -> StaffUser:
    user = db.get(StaffUser, user_id)
    if user is None:
        raise StaffUserNotFound(f"Staff user {user_id} not found.")
    return user


def get_by_username(db: Session, username: str) -> Optional[StaffUser]:
    stmt = select(StaffUser).where(StaffUser.username == _normalize_username(username))
    return db.execute(stmt).scalar_one_or_none()


def list_users(db: Session) -> list[StaffUser]:
    stmt = select(StaffUser).order_by(StaffUser.id.asc())
    return list(db.execute(stmt).scalars().all())


def _count_active_admins(db: Session, exclude_id: Optional[int] = None) -> int:
    stmt = select(func.count()).select_from(StaffUser).where(
        StaffUser.role == StaffRole.admin,
        StaffUser.is_active.is_(True),
    )
    if exclude_id is not None:
        stmt = stmt.where(StaffUser.id != exclude_id)
    return int(db.execute(stmt).scalar_one())


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------
def create(
    db: Session,
    *,
    username: str,
    display_name: str,
    role: StaffRole,
    pin: str,
) -> StaffUser:
    username = _normalize_username(username)
    display_name = display_name.strip()
    if get_by_username(db, username) is not None:
        raise UsernameAlreadyExists(f"Username '{username}' is already taken.")

    user = StaffUser(
        username=username,
        display_name=display_name,
        role=role,
        pin_hash=hash_pin(pin),
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        # Concurrency safety net: two requests can both pass the get_by_username
        # pre-check above, then race to the DB. The unique index on
        # staff_users.username rejects the loser with IntegrityError. Roll back
        # and surface the same UsernameAlreadyExists the pre-check would raise
        # (the endpoint maps it to 409, not a 500).
        db.rollback()
        raise UsernameAlreadyExists(
            f"Username '{username}' is already taken."
        ) from exc
    db.refresh(user)
    return user


def update(
    db: Session,
    user_id: int,
    *,
    display_name: Optional[str] = None,
    role: Optional[StaffRole] = None,
    is_active: Optional[bool] = None,
) -> StaffUser:
    user = get(db, user_id)

    # Guard: never demote or deactivate the last active admin.
    is_last_active_admin = (
        user.role == StaffRole.admin
        and user.is_active
        and _count_active_admins(db, exclude_id=user.id) == 0
    )
    if is_last_active_admin:
        demoting = role is not None and role != StaffRole.admin
        deactivating = is_active is False
        if demoting or deactivating:
            raise LastActiveAdminError(
                "Cannot demote or deactivate the last active admin."
            )

    if display_name is not None:
        user.display_name = display_name
    if role is not None:
        user.role = role
    if is_active is not None:
        user.is_active = is_active

    db.commit()
    db.refresh(user)
    return user


def set_active(db: Session, user_id: int, is_active: bool) -> StaffUser:
    return update(db, user_id, is_active=is_active)


def reset_pin(db: Session, user_id: int, pin: str) -> StaffUser:
    user = get(db, user_id)
    user.pin_hash = hash_pin(pin)
    db.commit()
    db.refresh(user)
    return user


def verify_login(db: Session, username: str, pin: str) -> Optional[StaffUser]:
    """Return the user on success, else None.

    None covers: unknown username, inactive account, and wrong PIN — the caller
    must NOT distinguish between them in its response.
    """
    user = get_by_username(db, username)
    if user is None:
        return None
    if not user.is_active:
        return None
    if not verify_pin(pin, user.pin_hash):
        return None

    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Bootstrap (startup) — idempotent
# ---------------------------------------------------------------------------
_BOOTSTRAP_SPEC = [
    # (username, role, env var holding the PIN, display name)
    ("admin", StaffRole.admin, "ADMIN_PIN", "Administrator"),
    ("manager", StaffRole.manager, "MANAGER_PIN", "Manager"),
    ("staff", StaffRole.staff, "STAFF_PIN", "Staff"),
]


def bootstrap_staff_users(db: Session) -> list[str]:
    """Create the default accounts from env-supplied PINs, idempotently.

    For each (username, env) pair: if the env var is set AND no user with that
    username exists yet, create the account. Existing users are never modified
    and never duplicated. Returns the list of usernames that were created.
    """
    created: list[str] = []
    for username, role, env_var, display_name in _BOOTSTRAP_SPEC:
        pin = os.getenv(env_var)
        if not pin:
            continue
        if get_by_username(db, username) is not None:
            continue
        user = StaffUser(
            username=username,
            display_name=display_name,
            role=role,
            pin_hash=hash_pin(pin),
            is_active=True,
        )
        db.add(user)
        db.commit()
        created.append(username)

    if created:
        logger.info("Bootstrapped staff users: %s", ", ".join(created))
    return created
