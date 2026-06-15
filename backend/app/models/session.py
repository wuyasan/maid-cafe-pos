from __future__ import annotations

from datetime import date, datetime, time
from typing import List, Optional

from sqlalchemy import Date, DateTime, Enum, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.common import TimestampMixin
from app.models.enums import SessionStatus


class Session(Base, TimestampMixin):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    service_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    kitchen_last_order_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    bar_last_order_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status"),
        default=SessionStatus.scheduled,
        nullable=False,
    )

    session_tables: Mapped[List["SessionTable"]] = relationship(
        "SessionTable",
        back_populates="session",
        cascade="all, delete-orphan",
    )
    session_maids: Mapped[List["SessionMaid"]] = relationship(
        "SessionMaid",
        back_populates="session",
        cascade="all, delete-orphan",
    )
