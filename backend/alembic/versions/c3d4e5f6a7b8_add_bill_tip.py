"""add bill tip columns + tip_type enum, payment tip_amount

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tip_type():
    """Inline column type that does NOT auto-CREATE the enum.

    On PostgreSQL the native tip_type enum is created via the DO block below,
    so create_type=False prevents SQLAlchemy's before_create from issuing a
    duplicate CREATE TYPE. On SQLite this renders as VARCHAR.
    """
    return ENUM(
        "none", "percent", "fixed", name="tip_type", create_type=False
    )


def upgrade() -> None:
    bind = op.get_bind()

    # Native PG enum — guarded so re-runs are safe. Skipped on SQLite (tests).
    if bind.dialect.name == "postgresql":
        op.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tip_type') "
            "THEN CREATE TYPE tip_type AS ENUM "
            "('none', 'percent', 'fixed'); "
            "END IF; END $$"
        )

    op.add_column(
        "bills",
        sa.Column(
            "tip_type",
            _tip_type(),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "bills",
        sa.Column(
            "tip_value",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "bills",
        sa.Column(
            "tip_amount",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "bills",
        sa.Column("tipped_by", sa.Integer(), nullable=True),
    )
    op.add_column(
        "bills",
        sa.Column("tipped_at", sa.DateTime(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bills_tipped_by_staff_users",
        "bills",
        "staff_users",
        ["tipped_by"],
        ["id"],
    )

    op.add_column(
        "payments",
        sa.Column(
            "tip_amount",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("payments", "tip_amount")

    op.drop_constraint(
        "fk_bills_tipped_by_staff_users",
        "bills",
        type_="foreignkey",
    )
    op.drop_column("bills", "tipped_at")
    op.drop_column("bills", "tipped_by")
    op.drop_column("bills", "tip_amount")
    op.drop_column("bills", "tip_value")
    op.drop_column("bills", "tip_type")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS tip_type")
