from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import SessionTableStatus


class TableBase(BaseModel):
    code: str
    seats: int = 2
    is_active: bool = True


class TableCreate(TableBase):
    pass


class TableUpdate(BaseModel):
    code: Optional[str] = None
    seats: Optional[int] = None
    is_active: Optional[bool] = None


class TableRead(TableBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class SessionTableBase(BaseModel):
    session_id: int
    table_id: int
    status: SessionTableStatus = SessionTableStatus.available
    current_party_size: int = 0


class SessionTableCreate(SessionTableBase):
    pass


class SessionTableUpdate(BaseModel):
    status: Optional[SessionTableStatus] = None
    current_party_size: Optional[int] = None


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
    status: SessionTableStatus
    current_party_size: int = 0

    
class SessionTableListResponse(BaseModel):
    session_id: int
    session_name: str
    tables: list[SessionTableSummary]