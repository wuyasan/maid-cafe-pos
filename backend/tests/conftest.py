"""
Shared pytest fixtures for backend tests.

DATABASE NOTES (SQLite vs Postgres):
- Tests run on SQLite (in-memory) using SQLAlchemy's StaticPool so that all
  connections within a test share the same in-memory database.  Without
  StaticPool, each new SQLAlchemy connection would open a fresh empty
  in-memory SQLite DB, making data seeded in a test fixture invisible to
  the HTTP client sessions.

- Known SQLite vs Postgres incompatibilities:
  1. Native Postgres ENUM types (columns declared with native_enum=True) are
     not supported by SQLite.  Most enums in this codebase use
     native_enum=False, which renders as VARCHAR.  The remaining few
     (SessionStatus, BillStatus, MenuItemType) are declared without
     native_enum=False but SQLAlchemy automatically falls back to VARCHAR on
     SQLite, so create_all succeeds.
  2. PostgreSQL-specific constraint behaviour (e.g. CHECK constraints that
     call PG functions, ON CONFLICT DO UPDATE, etc.) is untested.
  3. Alembic migrations are NOT run here; Base.metadata.create_all builds the
     schema directly from the ORM models.  Alembic baseline is deferred until
     a Postgres environment is available.
"""

import os

# Must run BEFORE importing anything under app.* — app.core.database raises a
# RuntimeError at import time when DATABASE_URL is unset, which would break test
# collection. Tests still run on the explicit SQLite engine created below; this
# only satisfies that import-time check.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Import every model module so their tables register with Base.metadata
# before create_all() is called.  app.models.__init__ now exports all models.
import app.models  # noqa: F401
from app.models.base import Base
from app.core.database import get_db


@pytest.fixture(scope="function")
def db_engine():
    """
    Fresh in-memory SQLite engine per test.

    StaticPool ensures every session/connection created from this engine
    reuses the same underlying sqlite3 connection (and therefore the same
    in-memory database). Without it each new connection gets an empty DB.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Enable FK enforcement (SQLite has it off by default).
    @event.listens_for(engine, "connect")
    def _enable_fk(dbapi_con, _):
        dbapi_con.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine):
    """SQLAlchemy Session bound to the test engine."""
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=db_engine,
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(db_engine):
    """
    FastAPI TestClient with get_db dependency overridden to use the
    SQLite test engine.
    """
    from app.main import app

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=db_engine,
    )

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
