from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SessionTableStatus


class TableBase(BaseModel):
    code: str = Field(min_length=1, max_length=10)
    seats: int = Field(default=2, ge=1)
    is_active: bool = True
    is_shareable: bool = False


class TableCreate(TableBase):
    pass


class TableUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=10)
    seats: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None
    is_shareable: Optional[bool] = None


class TableRead(TableBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class SessionTableBase(BaseModel):
    session_id: int
    table_id: int
    status: SessionTableStatus = SessionTableStatus.available
    current_party_size: int = Field(default=0, ge=0)


class SessionTableCreate(SessionTableBase):
    pass


class SessionTableUpdate(BaseModel):
    status: Optional[SessionTableStatus] = None
    current_party_size: Optional[int] = Field(default=None, ge=0)


class SessionTableAddParty(BaseModel):
    party_size: int = Field(ge=1)


class SessionTableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    table_id: int
    status: SessionTableStatus
    current_party_size: int
    created_at: datetime


class SessionTableSummary(BaseModel):
    id: int
    session_id: int
    table_id: int
    table_code: str
    seats: int
    is_shareable: bool = False
    status: SessionTableStatus
    current_party_size: int = 0
    open_bill_id: Optional[int] = None
    open_bill_total: Decimal = Decimal("0.00")


class SessionTableAdminSummary(BaseModel):
    id: int
    session_id: int
    table_id: int
    table_code: str
    seats: int
    is_shareable: bool = False
    status: SessionTableStatus
    current_party_size: int = 0


class SessionTableListResponse(BaseModel):
    session_id: int
    session_name: str
    tables: list[SessionTableSummary]
