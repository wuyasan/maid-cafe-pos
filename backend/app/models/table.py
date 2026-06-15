from __future__ import annotations

from typing import List

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.common import TimestampMixin
from app.models.enums import SessionTableStatus


class Table(Base, TimestampMixin):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(
        String(10),
        unique=True,
        nullable=False,
        index=True,
    )
    seats: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_shareable: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    session_tables: Mapped[List["SessionTable"]] = relationship(
        "SessionTable",
        back_populates="table",
        cascade="all, delete-orphan",
    )


class SessionTable(Base, TimestampMixin):
    __tablename__ = "session_tables"
    __table_args__ = (
        UniqueConstraint("session_id", "table_id", name="uq_session_table"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id"),
        nullable=False,
    )
    table_id: Mapped[int] = mapped_column(
        ForeignKey("tables.id"),
        nullable=False,
    )

    status: Mapped[SessionTableStatus] = mapped_column(
        Enum(SessionTableStatus, name="session_table_status"),
        default=SessionTableStatus.available,
        nullable=False,
    )
    current_party_size: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    session: Mapped["Session"] = relationship(
        "Session",
        back_populates="session_tables",
    )
    table: Mapped["Table"] = relationship(
        "Table",
        back_populates="session_tables",
    )
    bills: Mapped[List["Bill"]] = relationship(
        "Bill",
        back_populates="session_table",
        cascade="all, delete-orphan",
    )
