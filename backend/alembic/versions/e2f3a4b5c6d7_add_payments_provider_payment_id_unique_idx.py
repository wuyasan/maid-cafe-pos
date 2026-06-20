"""add unique index on payments.provider_payment_id (non-NULL)

Revision ID: e2f3a4b5c6d7
Revises: d1a2b3c4d5e6
Create Date: 2026-06-19

Adds a partial unique index on ``payments.provider_payment_id`` so that
the DB prevents two Payment rows from referencing the same Square
transaction ID.  Manual payments (provider_payment_id IS NULL) are
excluded from the uniqueness constraint so multiple manual / cash
payments with no provider ID can coexist.

On Postgres this is a partial unique index with
``WHERE provider_payment_id IS NOT NULL``; on SQLite a plain UNIQUE
index also permits multiple NULLs, so both engines behave consistently.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # Partial unique index: only non-NULL values are constrained.
        op.execute(
            """
            CREATE UNIQUE INDEX ix_payments_provider_payment_id_unique
            ON payments (provider_payment_id)
            WHERE provider_payment_id IS NOT NULL
            """
        )
    else:
        # SQLite / other: plain UNIQUE index; SQLite already allows multiple NULLs.
        op.create_index(
            "ix_payments_provider_payment_id_unique",
            "payments",
            ["provider_payment_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index(
        "ix_payments_provider_payment_id_unique",
        table_name="payments",
    )
