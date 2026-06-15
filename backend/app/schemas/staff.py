from pydantic import BaseModel
from decimal import Decimal


class SessionSummaryMaidCount(BaseModel):
    maid_id: int
    maid_name: str
    total_ordered: int


class SessionSummaryItem(BaseModel):
    menu_item_id: int
    menu_item_name: str
    item_type: str
    total_ordered: int
    total_sales: Decimal
    maid_breakdown: list[SessionSummaryMaidCount] = []


class SessionSummaryResponse(BaseModel):
    session_id: int
    session_name: str
    items: list[SessionSummaryItem]