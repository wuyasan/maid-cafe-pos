from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import PaymentStatus


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)

    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"), nullable=False)

    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    provider: Mapped[str] = mapped_column(String(50), default="square", nullable=False)
    provider_payment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        # Unique on idempotency_key when non-NULL.
        # Postgres: partial unique index (WHERE idempotency_key IS NOT NULL) so
        # historical / manual NULL rows never collide.
        # SQLite: also allows multiple NULLs in a UNIQUE index, so both engines
        # behave consistently — only duplicate non-NULL keys are rejected.
        Index(
            "ix_payments_idempotency_key_unique",
            "idempotency_key",
            unique=True,
            postgresql_where=sa.text("idempotency_key IS NOT NULL"),
        ),
        # Unique on provider_payment_id when non-NULL.
        # Manual payments (no provider) leave this NULL, so multiple NULL rows
        # are allowed.  A non-NULL Square transaction ID must be globally unique
        # to prevent accidental double-settlement with the same charge.
        Index(
            "ix_payments_provider_payment_id_unique",
            "provider_payment_id",
            unique=True,
            postgresql_where=sa.text("provider_payment_id IS NOT NULL"),
        ),
    )

    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.pending,
        nullable=False,
    )

    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    bill: Mapped["Bill"] = relationship(
        "Bill",
        back_populates="payments",
    )