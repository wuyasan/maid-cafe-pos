"""add unique index on payments.idempotency_key (non-NULL)

Revision ID: d1a2b3c4d5e6
Revises: c0ffee1d2e3f
Create Date: 2026-06-19

Adds a partial unique index on ``payments.idempotency_key`` so that the DB
enforces idempotency at the storage layer, not only in application code.
Multiple NULLs are still allowed (historical / manual payments that have no
idempotency key).  On Postgres this is a partial unique index with
``WHERE idempotency_key IS NOT NULL``; on SQLite a plain UNIQUE index also
permits multiple NULLs, so migration SQL is DB-specific.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "c0ffee1d2e3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # Partial unique index: only non-NULL values are constrained.
        op.execute(
            """
            CREATE UNIQUE INDEX ix_payments_idempotency_key_unique
            ON payments (idempotency_key)
            WHERE idempotency_key IS NOT NULL
            """
        )
    else:
        # SQLite / other: plain UNIQUE index; SQLite already allows multiple NULLs.
        op.create_index(
            "ix_payments_idempotency_key_unique",
            "payments",
            ["idempotency_key"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index(
        "ix_payments_idempotency_key_unique",
        table_name="payments",
    )
