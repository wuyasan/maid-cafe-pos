from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MenuItemType, ProductionStation


class MenuCategoryBase(BaseModel):
    name: str
    display_order: int = 0
    production_station: ProductionStation = ProductionStation.none


class MenuCategoryCreate(MenuCategoryBase):
    pass


class MenuCategoryUpdate(BaseModel):
    name: Optional[str] = None
    display_order: Optional[int] = None
    production_station: Optional[ProductionStation] = None


class MenuCategoryRead(MenuCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    item_count: int = 0


class MaidServicePricingBase(BaseModel):
    additional_maid_price: Decimal = Decimal("0.00")
    all_maids_price: Optional[Decimal] = None


class MaidServicePricingCreate(MaidServicePricingBase):
    menu_item_id: int


class MaidServicePricingRead(MaidServicePricingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    menu_item_id: int
    created_at: datetime


class MaidServicePricingUpdate(BaseModel):
    menu_item_id: Optional[int] = None
    additional_maid_price: Optional[Decimal] = None
    all_maids_price: Optional[Decimal] = None


class BundleComponentWrite(BaseModel):
    menu_item_id: int
    quantity: int = Field(default=1, ge=1)


class BundleComponentRead(BaseModel):
    id: int
    menu_item_id: int
    menu_item_name: str
    quantity: int
    production_station: ProductionStation
    item_type: MenuItemType


class MenuItemBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: Decimal
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    item_type: MenuItemType
    is_active: bool = True
    is_bundle: bool = False


class MenuItemCreate(MenuItemBase):
    components: list[BundleComponentWrite] = Field(default_factory=list)


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    item_type: Optional[MenuItemType] = None
    is_active: Optional[bool] = None
    is_bundle: Optional[bool] = None
    components: Optional[list[BundleComponentWrite]] = None


class MenuItemRead(MenuItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    maid_service_pricing: Optional[MaidServicePricingRead] = None
    components: list[BundleComponentRead] = Field(default_factory=list)
    requires_maid_selection: bool = False


class MenuItemWithPricingCreate(MenuItemBase):
    additional_maid_price: Optional[Decimal] = None
    all_maids_price: Optional[Decimal] = None
    components: list[BundleComponentWrite] = Field(default_factory=list)


class MenuItemWithPricingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    item_type: Optional[MenuItemType] = None
    is_active: Optional[bool] = None
    is_bundle: Optional[bool] = None
    additional_maid_price: Optional[Decimal] = None
    all_maids_price: Optional[Decimal] = None
    components: Optional[list[BundleComponentWrite]] = None


class MenuItemWithPricingRead(MenuItemRead):
    pass
