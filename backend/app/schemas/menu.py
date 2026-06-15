from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import MenuItemType


class MenuCategoryBase(BaseModel):
    name: str
    display_order: int = 0


class MenuCategoryCreate(MenuCategoryBase):
    pass


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


class MenuItemBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: Decimal
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    item_type: MenuItemType
    is_active: bool = True


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    item_type: Optional[MenuItemType] = None
    is_active: Optional[bool] = None


class MenuItemRead(MenuItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    maid_service_pricing: Optional[MaidServicePricingRead] = None


class MenuItemWithPricingCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: Decimal
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    item_type: MenuItemType
    is_active: bool = True

    additional_maid_price: Optional[Decimal] = None
    all_maids_price: Optional[Decimal] = None


class MenuItemWithPricingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    image_url: Optional[str] = None
    category_id: Optional[int] = None
    item_type: Optional[MenuItemType] = None
    is_active: Optional[bool] = None

    additional_maid_price: Optional[Decimal] = None
    all_maids_price: Optional[Decimal] = None


class MenuItemWithPricingRead(MenuItemRead):
    maid_service_pricing: Optional[MaidServicePricingRead] = None