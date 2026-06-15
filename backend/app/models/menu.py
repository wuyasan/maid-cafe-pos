from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.common import TimestampMixin
from app.models.enums import MenuItemType


class MenuCategory(Base, TimestampMixin):
    __tablename__ = "menu_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    items: Mapped[List["MenuItem"]] = relationship(
        "MenuItem",
        back_populates="category",
    )


class MenuItem(Base, TimestampMixin):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("menu_categories.id"),
        nullable=True,
    )

    item_type: Mapped[MenuItemType] = mapped_column(
        Enum(MenuItemType, name="menu_item_type"),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category: Mapped[Optional["MenuCategory"]] = relationship(
        "MenuCategory",
        back_populates="items",
    )

    maid_service_pricing: Mapped[Optional["MaidServicePricing"]] = relationship(
        "MaidServicePricing",
        back_populates="menu_item",
        uselist=False,
        cascade="all, delete-orphan",
    )

    order_items: Mapped[List["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="menu_item",
    )


class MaidServicePricing(Base, TimestampMixin):
    __tablename__ = "maid_service_pricing"

    id: Mapped[int] = mapped_column(primary_key=True)

    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id"),
        nullable=False,
        unique=True,
    )

    additional_maid_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    all_maids_price: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )

    menu_item: Mapped["MenuItem"] = relationship(
        "MenuItem",
        back_populates="maid_service_pricing",
    )