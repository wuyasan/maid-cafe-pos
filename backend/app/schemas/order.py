from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrderSource


class OrderItemMaidSelection(BaseModel):
    maid_id: int


class OrderLineCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(default=1, ge=1)
    notes: Optional[str] = None
    selected_maid_ids: List[int] = []


class CustomerOrderCreate(BaseModel):
    source: OrderSource = OrderSource.qr
    items: List[OrderLineCreate]


class StaffOrderCreate(BaseModel):
    source: OrderSource = OrderSource.staff
    items: List[OrderLineCreate]


class OrderCreate(BaseModel):
    bill_id: int
    source: OrderSource = OrderSource.qr


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bill_id: int
    source: OrderSource
    created_at: datetime


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    menu_item_id: int
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    notes: Optional[str] = None


class CreatedOrderItemRead(BaseModel):
    menu_item_id: int
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    notes: Optional[str] = None
    selected_maid_ids: List[int] = []


class OrderCreateResponse(BaseModel):
    order: OrderRead
    items: List[CreatedOrderItemRead]
    bill_id: int
    bill_total: Decimal