"""add bill discount columns + discount_type enum

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-06-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _discount_type():
    """Inline column type that does NOT auto-CREATE the enum.

    On PostgreSQL the native discount_type enum is created via the DO block
    below, so create_type=False prevents SQLAlchemy's before_create from
    issuing a duplicate CREATE TYPE. On SQLite this renders as VARCHAR.
    """
    return ENUM(
        "none", "percent", "fixed", name="discount_type", create_type=False
    )


def upgrade() -> None:
    bind = op.get_bind()

    # Native PG enum — guarded so re-runs are safe. Skipped on SQLite (tests).
    if bind.dialect.name == "postgresql":
        op.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discount_type') "
            "THEN CREATE TYPE discount_type AS ENUM "
            "('none', 'percent', 'fixed'); "
            "END IF; END $$"
        )

    op.add_column(
        "bills",
        sa.Column(
            "discount_type",
            _discount_type(),
            nullable=False,
            server_default="none",
        ),
    )
    op.add_column(
        "bills",
        sa.Column(
            "discount_value",
            sa.Numeric(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "bills",
        sa.Column(
            "discount_amount",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "bills",
        sa.Column("discount_note", sa.String(500), nullable=True),
    )
    op.add_column(
        "bills",
        sa.Column("discounted_by", sa.Integer(), nullable=True),
    )
    op.add_column(
        "bills",
        sa.Column("discounted_at", sa.DateTime(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bills_discounted_by_staff_users",
        "bills",
        "staff_users",
        ["discounted_by"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_bills_discounted_by_staff_users",
        "bills",
        type_="foreignkey",
    )
    op.drop_column("bills", "discounted_at")
    op.drop_column("bills", "discounted_by")
    op.drop_column("bills", "discount_note")
    op.drop_column("bills", "discount_amount")
    op.drop_column("bills", "discount_value")
    op.drop_column("bills", "discount_type")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS discount_type")
