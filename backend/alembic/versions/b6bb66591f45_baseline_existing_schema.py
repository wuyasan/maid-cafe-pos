"""baseline existing schema

Revision ID: b6bb66591f45
Revises:
Create Date: 2026-06-17 00:35:55.607856

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM

# revision identifiers, used by Alembic.
revision: str = "b6bb66591f45"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Native PG enum types
# We use op.execute("CREATE TYPE ... AS ENUM (...) IF NOT EXISTS") so that:
#   1. The types are created before tables reference them.
#   2. Inline column references use postgresql.ENUM(..., create_type=False) so
#      SQLAlchemy's before_create hook does NOT try to CREATE TYPE again.
# VARCHAR-backed "enums" (native_enum=False in models) are plain VARCHAR
# columns and need no CREATE TYPE here.
# ---------------------------------------------------------------------------

# Re-usable helpers: inline column type without triggering auto-CREATE
def _bill_status() -> ENUM:
    return ENUM("open", "paying", "paid", "cancelled",
                name="bill_status", create_type=False)


def _session_status() -> ENUM:
    return ENUM("scheduled", "active", "winding_down", "closed",
                name="session_status", create_type=False)


def _menu_item_type() -> ENUM:
    return ENUM("regular", "maid_service",
                name="menu_item_type", create_type=False)


def _order_source() -> ENUM:
    return ENUM("qr", "staff",
                name="order_source", create_type=False)


def _session_table_status() -> ENUM:
    return ENUM("available", "occupied", "ready", "paying", "paid",
                name="session_table_status", create_type=False)


def _payment_status() -> ENUM:
    return ENUM("pending", "completed", "failed",
                name="payment_status", create_type=False)


def upgrade() -> None:
    """Create the complete schema from scratch."""

    # ---- Native PG enum types -----------------------------------------------
    # PostgreSQL < 18 has no "CREATE TYPE IF NOT EXISTS", so we use DO blocks.
    for type_name, values in [
        ("bill_status", "'open', 'paying', 'paid', 'cancelled'"),
        ("session_status", "'scheduled', 'active', 'winding_down', 'closed'"),
        ("session_table_status", "'available', 'occupied', 'ready', 'paying', 'paid'"),
        ("menu_item_type", "'regular', 'maid_service'"),
        ("order_source", "'qr', 'staff'"),
        ("payment_status", "'pending', 'completed', 'failed'"),
    ]:
        op.execute(
            f"DO $$ BEGIN "
            f"IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{type_name}') "
            f"THEN CREATE TYPE {type_name} AS ENUM ({values}); "
            f"END IF; END $$"
        )

    # --- sessions -----------------------------------------------------------
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.DateTime(), nullable=True),
        sa.Column("end_time", sa.DateTime(), nullable=True),
        sa.Column("kitchen_last_order_time", sa.Time(), nullable=True),
        sa.Column("bar_last_order_time", sa.Time(), nullable=True),
        sa.Column("status", _session_status(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # --- tables -------------------------------------------------------------
    op.create_table(
        "tables",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("seats", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_shareable", sa.Boolean(), nullable=False),
        sa.Column("layout_x", sa.Float(), nullable=False),
        sa.Column("layout_y", sa.Float(), nullable=False),
        sa.Column("layout_width", sa.Float(), nullable=False),
        sa.Column("layout_height", sa.Float(), nullable=False),
        sa.Column("layout_shape", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_tables_code"), "tables", ["code"], unique=True)

    # --- maids --------------------------------------------------------------
    op.create_table(
        "maids",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # --- menu_categories ----------------------------------------------------
    op.create_table(
        "menu_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        # VARCHAR-backed enum (native_enum=False in model)
        sa.Column("production_station", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # --- menu_items ---------------------------------------------------------
    op.create_table(
        "menu_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("menu_categories.id"),
            nullable=True,
        ),
        sa.Column("item_type", _menu_item_type(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_bundle", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # --- maid_service_pricing -----------------------------------------------
    op.create_table(
        "maid_service_pricing",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "menu_item_id",
            sa.Integer(),
            sa.ForeignKey("menu_items.id"),
            nullable=False,
        ),
        sa.Column("additional_maid_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("all_maids_price", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "menu_item_id", name="uq_maid_service_pricing_menu_item_id"
        ),
    )

    # --- menu_item_components -----------------------------------------------
    op.create_table(
        "menu_item_components",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "parent_menu_item_id",
            sa.Integer(),
            sa.ForeignKey("menu_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "component_menu_item_id",
            sa.Integer(),
            sa.ForeignKey("menu_items.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "parent_menu_item_id",
            "component_menu_item_id",
            name="uq_menu_item_component",
        ),
    )
    op.create_index(
        op.f("ix_menu_item_components_parent_menu_item_id"),
        "menu_item_components",
        ["parent_menu_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_menu_item_components_component_menu_item_id"),
        "menu_item_components",
        ["component_menu_item_id"],
        unique=False,
    )

    # --- session_tables -----------------------------------------------------
    op.create_table(
        "session_tables",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "table_id",
            sa.Integer(),
            sa.ForeignKey("tables.id"),
            nullable=False,
        ),
        # Native PG enum (no native_enum=False in model)
        sa.Column("status", _session_table_status(), nullable=False),
        sa.Column("current_party_size", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("session_id", "table_id", name="uq_session_table"),
    )

    # --- session_maids ------------------------------------------------------
    op.create_table(
        "session_maids",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "maid_id",
            sa.Integer(),
            sa.ForeignKey("maids.id"),
            nullable=False,
        ),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("session_id", "maid_id", name="uq_session_maid"),
    )

    # --- bills --------------------------------------------------------------
    op.create_table(
        "bills",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_table_id",
            sa.Integer(),
            sa.ForeignKey("session_tables.id"),
            nullable=False,
        ),
        sa.Column("status", _bill_status(), nullable=False),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.Column("tax", sa.Numeric(10, 2), nullable=False),
        sa.Column("service_charge", sa.Numeric(10, 2), nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column("opened_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("checkout_total", sa.Numeric(10, 2), nullable=True),
    )

    # --- orders -------------------------------------------------------------
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "bill_id",
            sa.Integer(),
            sa.ForeignKey("bills.id"),
            nullable=False,
        ),
        sa.Column("source", _order_source(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # --- order_items --------------------------------------------------------
    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "order_id",
            sa.Integer(),
            sa.ForeignKey("orders.id"),
            nullable=False,
        ),
        sa.Column(
            "menu_item_id",
            sa.Integer(),
            sa.ForeignKey("menu_items.id"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        # VARCHAR-backed enum (native_enum=False in model)
        sa.Column("production_status", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # --- order_item_maids ---------------------------------------------------
    op.create_table(
        "order_item_maids",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "order_item_id",
            sa.Integer(),
            sa.ForeignKey("order_items.id"),
            nullable=False,
        ),
        sa.Column(
            "maid_id",
            sa.Integer(),
            sa.ForeignKey("maids.id"),
            nullable=False,
        ),
    )

    # --- production_tasks ---------------------------------------------------
    op.create_table(
        "production_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "order_item_id",
            sa.Integer(),
            sa.ForeignKey("order_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_menu_item_id",
            sa.Integer(),
            sa.ForeignKey("menu_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # VARCHAR-backed enums (native_enum=False in model)
        sa.Column("station", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("picked_up_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_production_tasks_order_item_id"),
        "production_tasks",
        ["order_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_tasks_station"),
        "production_tasks",
        ["station"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_tasks_status"),
        "production_tasks",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_production_tasks_picked_up_at"),
        "production_tasks",
        ["picked_up_at"],
        unique=False,
    )

    # --- payments -----------------------------------------------------------
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "bill_id",
            sa.Integer(),
            sa.ForeignKey("bills.id"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("provider_payment_id", sa.String(255), nullable=True),
        sa.Column("status", _payment_status(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Drop all tables and enum types created by upgrade."""

    # Drop in reverse FK dependency order
    op.drop_table("payments")

    op.drop_index(
        op.f("ix_production_tasks_picked_up_at"), table_name="production_tasks"
    )
    op.drop_index(op.f("ix_production_tasks_status"), table_name="production_tasks")
    op.drop_index(op.f("ix_production_tasks_station"), table_name="production_tasks")
    op.drop_index(
        op.f("ix_production_tasks_order_item_id"), table_name="production_tasks"
    )
    op.drop_table("production_tasks")

    op.drop_table("order_item_maids")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("bills")
    op.drop_table("session_maids")
    op.drop_table("session_tables")
    op.drop_table("maid_service_pricing")

    op.drop_index(
        op.f("ix_menu_item_components_component_menu_item_id"),
        table_name="menu_item_components",
    )
    op.drop_index(
        op.f("ix_menu_item_components_parent_menu_item_id"),
        table_name="menu_item_components",
    )
    op.drop_table("menu_item_components")

    op.drop_table("menu_items")
    op.drop_table("menu_categories")
    op.drop_table("maids")

    op.drop_index(op.f("ix_tables_code"), table_name="tables")
    op.drop_table("tables")

    op.drop_table("sessions")

    # Drop native PG enum types (reverse creation order)
    op.execute("DROP TYPE IF EXISTS payment_status")
    op.execute("DROP TYPE IF EXISTS order_source")
    op.execute("DROP TYPE IF EXISTS menu_item_type")
    op.execute("DROP TYPE IF EXISTS session_table_status")
    op.execute("DROP TYPE IF EXISTS session_status")
    op.execute("DROP TYPE IF EXISTS bill_status")
