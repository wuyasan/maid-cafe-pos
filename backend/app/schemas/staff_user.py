from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import StaffRole

# Allowed character set for a *normalized* (trimmed + lowercased) username.
_USERNAME_RE = re.compile(r"^[a-z0-9_.-]+$")
# A PIN is 4–12 digits.
_PIN_RE = re.compile(r"^\d{4,12}$")


def _normalize_username(value: str) -> str:
    """Trim + lowercase, then validate length and charset.

    Raises ValueError (→ 422 via Pydantic) on empty/blank, out-of-range
    length, or disallowed characters.
    """
    if not isinstance(value, str):
        raise ValueError("username must be a string")
    normalized = value.strip().lower()
    if not normalized:
        raise ValueError("username must not be empty or blank")
    if len(normalized) < 3 or len(normalized) > 50:
        raise ValueError("username must be between 3 and 50 characters")
    if not _USERNAME_RE.match(normalized):
        raise ValueError(
            "username may only contain lowercase letters, digits, '_', '.', '-'"
        )
    return normalized


def _normalize_display_name(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("display_name must be a string")
    normalized = value.strip()
    if not normalized:
        raise ValueError("display_name must not be empty or blank")
    if len(normalized) > 100:
        raise ValueError("display_name must be at most 100 characters")
    return normalized


def _validate_pin(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("pin must be a string")
    if not _PIN_RE.match(value):
        raise ValueError("pin must be 4 to 12 digits")
    return value


# --- Auth (login) -----------------------------------------------------------
class StaffLoginRequest(BaseModel):
    username: str
    pin: str


class StaffLoginResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: StaffRole


# --- Admin management -------------------------------------------------------
class StaffUserRead(BaseModel):
    """Admin-facing view. Never exposes pin_hash."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: StaffRole
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime


class StaffUserCreate(BaseModel):
    username: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    role: StaffRole
    pin: str = Field(min_length=1)

    @field_validator("username")
    @classmethod
    def _v_username(cls, v: str) -> str:
        return _normalize_username(v)

    @field_validator("display_name")
    @classmethod
    def _v_display_name(cls, v: str) -> str:
        return _normalize_display_name(v)

    @field_validator("pin")
    @classmethod
    def _v_pin(cls, v: str) -> str:
        return _validate_pin(v)


class StaffUserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[StaffRole] = None
    is_active: Optional[bool] = None

    @field_validator("display_name")
    @classmethod
    def _v_display_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _normalize_display_name(v)


class StaffUserResetPin(BaseModel):
    pin: str = Field(min_length=1)

    @field_validator("pin")
    @classmethod
    def _v_pin(cls, v: str) -> str:
        return _validate_pin(v)
