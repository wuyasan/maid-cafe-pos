from decimal import Decimal

from pydantic import BaseModel, Field


class SessionSummaryMaidCount(BaseModel):
    maid_id: int
    maid_name: str
    total_ordered: int


class SessionSummarySetSource(BaseModel):
    set_menu_item_id: int
    set_menu_item_name: str
    set_quantity_ordered: int
    component_quantity_per_set: int
    quantity_from_set: int


class SessionSummarySetComponent(BaseModel):
    menu_item_id: int
    menu_item_name: str
    item_type: str
    quantity_per_set: int
    total_quantity_from_set: int


class SessionSummaryItem(BaseModel):
    menu_item_id: int
    menu_item_name: str
    item_type: str
    is_bundle: bool = False
    total_ordered: int
    direct_ordered: int = 0
    from_sets: int = 0
    total_sales: Decimal
    maid_breakdown: list[SessionSummaryMaidCount] = Field(default_factory=list)
    set_components: list[SessionSummarySetComponent] = Field(default_factory=list)
    from_set_breakdown: list[SessionSummarySetSource] = Field(default_factory=list)


class SessionSummaryResponse(BaseModel):
    session_id: int
    session_name: str
    items: list[SessionSummaryItem]
