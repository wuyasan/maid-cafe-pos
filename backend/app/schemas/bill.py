from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import BillStatus, DiscountType


class BillBase(BaseModel):
    session_table_id: int
    status: BillStatus = BillStatus.open
    subtotal: Decimal = Decimal("0.00")
    tax: Decimal = Decimal("0.00")
    service_charge: Decimal = Decimal("0.00")
    discount_type: DiscountType = DiscountType.none
    discount_value: Decimal = Decimal("0.00")
    discount_amount: Decimal = Decimal("0.00")
    discount_note: Optional[str] = None
    total: Decimal = Decimal("0.00")


class BillCreate(BaseModel):
    session_table_id: int


class BillUpdate(BaseModel):
    status: Optional[BillStatus] = None
    subtotal: Optional[Decimal] = None
    tax: Optional[Decimal] = None
    service_charge: Optional[Decimal] = None
    total: Optional[Decimal] = None
    closed_at: Optional[datetime] = None


class BillRead(BillBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    opened_at: datetime
    closed_at: Optional[datetime] = None


class BillItemMaidRead(BaseModel):
    id: int
    maid_id: int
    maid_name: str
    maid_photo_url: Optional[str] = None


class BillItemRead(BaseModel):
    order_item_id: int
    menu_item_id: int
    menu_item_name: str
    item_type: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    notes: Optional[str] = None
    selected_maids: List[BillItemMaidRead] = []
    # Aggregated production status across all ProductionTasks for this item.
    # Values: "pending" | "preparing" | "completed"
    # None means no production tasks exist for this item (e.g. maid-service
    # items whose station is 'none'); production tracking does not apply.
    production_status: Optional[str] = None


class BillDetailRead(BillRead):
    items: List[BillItemRead] = []
