from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MaidBase(BaseModel):
    name: str
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    is_active: bool = True
    display_order: int = 0


class MaidCreate(MaidBase):
    pass


class MaidUpdate(BaseModel):
    name: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class MaidRead(MaidBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class SessionMaidBase(BaseModel):
    session_id: int
    maid_id: int
    is_available: bool = True


class SessionMaidCreate(SessionMaidBase):
    pass

class SessionMaidAdminRead(BaseModel):
    id: int
    session_id: int
    maid_id: int
    is_available: bool
    maid_name: str
    maid_photo_url: Optional[str] = None

class MaidOptionRead(BaseModel):
    id: int
    name: str
    photo_url: Optional[str] = None