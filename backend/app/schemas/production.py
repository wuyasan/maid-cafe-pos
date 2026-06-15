from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import OrderSource, ProductionStation, ProductionStatus


class ProductionQueueItemRead(BaseModel):
    order_item_id: int
    order_id: int
    bill_id: int
    table_code: str
    menu_item_id: int
    menu_item_name: str
    quantity: int
    notes: Optional[str] = None
    source: OrderSource
    station: ProductionStation
    production_status: ProductionStatus
    ordered_at: datetime


class ProductionQueueResponse(BaseModel):
    session_id: int
    session_name: str
    station: ProductionStation
    items: list[ProductionQueueItemRead]


class ProductionStatusUpdate(BaseModel):
    production_status: ProductionStatus
