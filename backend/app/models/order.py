from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.common import TimestampMixin
from app.models.enums import OrderSource


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)

    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"), nullable=False)

    source: Mapped[OrderSource] = mapped_column(
        Enum(OrderSource, name="order_source"),
        default=OrderSource.qr,
        nullable=False,
    )

    bill: Mapped["Bill"] = relationship(
        "Bill",
        back_populates="orders",
    )

    items: Mapped[List["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
    )


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)

    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id"), nullable=False)

    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    order: Mapped["Order"] = relationship(
        "Order",
        back_populates="items",
    )

    menu_item: Mapped["MenuItem"] = relationship(
        "MenuItem",
        back_populates="order_items",
    )

    selected_maids: Mapped[List["OrderItemMaid"]] = relationship(
        "OrderItemMaid",
        back_populates="order_item",
        cascade="all, delete-orphan",
    )


class OrderItemMaid(Base):
    __tablename__ = "order_item_maids"

    id: Mapped[int] = mapped_column(primary_key=True)

    order_item_id: Mapped[int] = mapped_column(
        ForeignKey("order_items.id"),
        nullable=False,
    )
    maid_id: Mapped[int] = mapped_column(
        ForeignKey("maids.id"),
        nullable=False,
    )

    order_item: Mapped["OrderItem"] = relationship(
        "OrderItem",
        back_populates="selected_maids",
    )

    maid: Mapped["Maid"] = relationship(
        "Maid",
        back_populates="order_item_maids",
    )