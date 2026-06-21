from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sqlalchemy import String

from app.core.time import utcnow
from app.models.base import Base
from app.models.common import TimestampMixin
from app.models.enums import BillStatus, DiscountType, TipType


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(primary_key=True)

    session_table_id: Mapped[int] = mapped_column(
        ForeignKey("session_tables.id"),
        nullable=False,
    )

    status: Mapped[BillStatus] = mapped_column(
        Enum(BillStatus, name="bill_status"),
        default=BillStatus.open,
        nullable=False,
    )

    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    tax: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    service_charge: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    total: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, name="discount_type"),
        default=DiscountType.none,
        nullable=False,
    )
    discount_value: Mapped[Decimal] = mapped_column(
        Numeric(),
        default=Decimal("0.00"),
        nullable=False,
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    discount_note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    discounted_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("staff_users.id"),
        nullable=True,
    )
    discounted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    tip_type: Mapped[TipType] = mapped_column(
        Enum(TipType, name="tip_type"),
        default=TipType.none,
        nullable=False,
    )
    tip_value: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    tip_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    tipped_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("staff_users.id"),
        nullable=True,
    )
    tipped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    opened_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utcnow,
        nullable=False,
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    checkout_total: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        default=None,
    )

    session_table = relationship("SessionTable", back_populates="bills")
    orders = relationship("Order", back_populates="bill", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="bill", cascade="all, delete-orphan")
