"""add payment idempotency_key

Adds the nullable ``payments.idempotency_key`` column introduced when mark-paid
idempotency was rescoped to the current bill (matches Payment model:
``Mapped[Optional[str]] = mapped_column(String(255), nullable=True)``).

Revision ID: c0ffee1d2e3f
Revises: b6bb66591f45
Create Date: 2026-06-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c0ffee1d2e3f"
down_revision: Union[str, Sequence[str], None] = "b6bb66591f45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("payments", "idempotency_key")
