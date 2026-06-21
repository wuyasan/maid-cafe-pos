"""widen bill discount value precision

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-20 00:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "bills",
        "discount_value",
        existing_type=sa.Numeric(10, 2),
        type_=sa.Numeric(),
        existing_nullable=False,
        existing_server_default="0",
    )


def downgrade() -> None:
    op.alter_column(
        "bills",
        "discount_value",
        existing_type=sa.Numeric(),
        type_=sa.Numeric(10, 2),
        existing_nullable=False,
        existing_server_default="0",
    )
