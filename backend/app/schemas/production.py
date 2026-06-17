from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import OrderSource, ProductionStation, ProductionStatus


class ProductionQueueItemRead(BaseModel):
    production_task_id: int
    order_item_id: int
    order_id: int
    bill_id: int
    table_code: str
    parent_menu_item_id: int
    parent_menu_item_name: str
    source_menu_item_id: Optional[int] = None
    display_name: str
    quantity: int
    notes: Optional[str] = None
    source: OrderSource
    station: ProductionStation
    production_status: ProductionStatus
    ordered_at: datetime
    picked_up_at: Optional[datetime] = None


class ProductionQueueResponse(BaseModel):
    session_id: int
    session_name: str
    station: ProductionStation
    items: list[ProductionQueueItemRead]


class ProductionStatusUpdate(BaseModel):
    production_status: ProductionStatus


class PickupTaskRead(BaseModel):
    production_task_id: int
    display_name: str
    quantity: int
    station: ProductionStation
    production_status: ProductionStatus
    notes: Optional[str] = None


class PickupOrderRead(BaseModel):
    order_id: int
    bill_id: int
    table_code: str
    ordered_at: datetime
    all_completed: bool
    waiting_count: int
    tasks: list[PickupTaskRead]


class PickupOrderListResponse(BaseModel):
    session_id: int
    session_name: str
    orders: list[PickupOrderRead]


class PickupOrderResult(BaseModel):
    order_id: int
    picked_up_at: datetime
