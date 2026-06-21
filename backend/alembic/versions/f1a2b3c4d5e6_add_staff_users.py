"""add staff_users table + staff_role enum

Revision ID: f1a2b3c4d5e6
Revises: e2f3a4b5c6d7
Create Date: 2026-06-19 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _staff_role():
    """Inline column type that does NOT auto-CREATE the enum.

    On PostgreSQL the native staff_role enum is created via the DO block below,
    so create_type=False prevents SQLAlchemy's before_create from issuing a
    duplicate CREATE TYPE. On SQLite this renders transparently as VARCHAR.
    """
    return ENUM(
        "staff", "manager", "admin", name="staff_role", create_type=False
    )


def upgrade() -> None:
    bind = op.get_bind()

    # Native PG enum — guarded so re-runs are safe. Skipped on SQLite (tests).
    if bind.dialect.name == "postgresql":
        op.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') "
            "THEN CREATE TYPE staff_role AS ENUM ('staff', 'manager', 'admin'); "
            "END IF; END $$"
        )

    op.create_table(
        "staff_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("role", _staff_role(), nullable=False),
        sa.Column("pin_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        op.f("ix_staff_users_username"),
        "staff_users",
        ["username"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_staff_users_username"), table_name="staff_users")
    op.drop_table("staff_users")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS staff_role")
