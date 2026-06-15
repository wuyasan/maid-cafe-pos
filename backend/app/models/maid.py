from __future__ import annotations

from typing import List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.common import TimestampMixin


class Maid(Base, TimestampMixin):
    __tablename__ = "maids"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session_maids: Mapped[List["SessionMaid"]] = relationship(
        "SessionMaid",
        back_populates="maid",
        cascade="all, delete-orphan",
    )

    order_item_maids: Mapped[List["OrderItemMaid"]] = relationship(
        "OrderItemMaid",
        back_populates="maid",
        cascade="all, delete-orphan",
    )


class SessionMaid(Base):
    __tablename__ = "session_maids"
    __table_args__ = (
        UniqueConstraint("session_id", "maid_id", name="uq_session_maid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    maid_id: Mapped[int] = mapped_column(ForeignKey("maids.id"), nullable=False)

    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    session: Mapped["Session"] = relationship(
        "Session",
        back_populates="session_maids",
    )
    maid: Mapped["Maid"] = relationship(
        "Maid",
        back_populates="session_maids",
    )