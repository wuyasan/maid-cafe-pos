from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SessionTableStatus

TableShape = Literal["rectangle", "round"]


class TableBase(BaseModel):
    code: str = Field(min_length=1, max_length=10)
    seats: int = Field(default=2, ge=1)
    is_active: bool = True
    is_shareable: bool = False
    layout_x: float = Field(default=5, ge=0, le=95)
    layout_y: float = Field(default=5, ge=0, le=95)
    layout_width: float = Field(default=16, ge=6, le=50)
    layout_height: float = Field(default=18, ge=6, le=50)
    layout_shape: TableShape = "rectangle"


class TableCreate(TableBase):
    pass


class TableUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=10)
    seats: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None
    is_shareable: Optional[bool] = None
    layout_x: Optional[float] = Field(default=None, ge=0, le=95)
    layout_y: Optional[float] = Field(default=None, ge=0, le=95)
    layout_width: Optional[float] = Field(default=None, ge=6, le=50)
    layout_height: Optional[float] = Field(default=None, ge=6, le=50)
    layout_shape: Optional[TableShape] = None


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
    layout_x: float
    layout_y: float
    layout_width: float
    layout_height: float
    layout_shape: TableShape
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
    layout_x: float
    layout_y: float
    layout_width: float
    layout_height: float
    layout_shape: TableShape


class SessionTableListResponse(BaseModel):
    session_id: int
    session_name: str
    tables: list[SessionTableSummary]
