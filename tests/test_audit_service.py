"""Unit tests for backend/audit_service.py.

Covers the JSON serialization helper, row snapshotting, audit-record creation,
and the created/updated/soft-delete stamping helpers. The DB-backed test uses
an in-memory SQLite database.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from db import Base
import audit_service as audit


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[models.AuditLog.__table__])
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


# ---------------------------------------------------------------------------
# _serialize
# ---------------------------------------------------------------------------


def test_serialize_none():
    assert audit._serialize(None) is None


@pytest.mark.parametrize("value", ["s", 1, 1.5, True])
def test_serialize_primitives_passthrough(value):
    assert audit._serialize(value) == value


def test_serialize_datetime_to_isoformat():
    dt = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert audit._serialize(dt) == dt.isoformat()


def test_serialize_dict_roundtrips_through_json():
    assert audit._serialize({"a": [1, 2], "b": "x"}) == {"a": [1, 2], "b": "x"}


def test_serialize_non_json_falls_back_to_str():
    class Weird:
        def __repr__(self):
            return "weird-object"

    result = audit._serialize(Weird())
    assert result == "weird-object"


# ---------------------------------------------------------------------------
# row_snapshot
# ---------------------------------------------------------------------------


def test_row_snapshot_none_returns_empty():
    assert audit.row_snapshot(None) == {}


def test_row_snapshot_serializes_columns():
    entry = models.AuditLog(
        user_id=1,
        username="alice",
        action="CREATE",
        table_name="screening",
        record_id="SCR-1",
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    snap = audit.row_snapshot(entry)
    assert snap["username"] == "alice"
    assert snap["action"] == "CREATE"
    assert snap["created_at"] == datetime(2026, 1, 2, tzinfo=timezone.utc).isoformat()
    # every column present
    assert set(snap.keys()) == {c.name for c in models.AuditLog.__table__.columns}


# ---------------------------------------------------------------------------
# record_audit
# ---------------------------------------------------------------------------


def test_record_audit_persists_entry(db):
    entry = audit.record_audit(
        db,
        user_id=7,
        username="bob",
        action="UPDATE",
        table_name="screening",
        record_id=123,
        enrollment_id="ENR-1",
        screening_id="SCR-1",
        old_values={"x": 1},
        new_values={"x": 2},
    )
    db.commit()

    assert entry.id is not None
    assert entry.record_id == "123"  # coerced to str
    assert entry.created_at is not None
    stored = db.query(models.AuditLog).one()
    assert stored.username == "bob"
    assert stored.action == "UPDATE"
    assert stored.old_values == {"x": 1}
    assert stored.new_values == {"x": 2}


def test_record_audit_none_record_id_stays_none(db):
    entry = audit.record_audit(
        db,
        user_id=None,
        username=None,
        action="DELETE",
        table_name="screening",
    )
    db.commit()
    assert entry.record_id is None


# ---------------------------------------------------------------------------
# stamp_created / stamp_updated / soft_delete_record
# ---------------------------------------------------------------------------


def test_stamp_created_sets_user_and_timestamp():
    instance = SimpleNamespace(created_by=None, created_at=None)
    user = SimpleNamespace(username="alice")
    audit.stamp_created(instance, user)
    assert instance.created_by == "alice"
    assert instance.created_at is not None


def test_stamp_created_preserves_existing_created_at():
    existing = datetime(2020, 1, 1, tzinfo=timezone.utc)
    instance = SimpleNamespace(created_by=None, created_at=existing)
    audit.stamp_created(instance, SimpleNamespace(username="alice"))
    assert instance.created_at == existing


def test_stamp_created_without_user_leaves_created_by():
    instance = SimpleNamespace(created_by=None, created_at=None)
    audit.stamp_created(instance, None)
    assert instance.created_by is None
    # created_at still stamped
    assert instance.created_at is not None


def test_stamp_updated_sets_user_and_timestamp():
    instance = SimpleNamespace(updated_by=None, updated_at=None)
    audit.stamp_updated(instance, SimpleNamespace(username="bob"))
    assert instance.updated_by == "bob"
    assert instance.updated_at is not None


def test_soft_delete_record_marks_deleted():
    instance = SimpleNamespace(
        is_deleted=False,
        deleted_at=None,
        deleted_by=None,
        updated_by=None,
        updated_at=None,
    )
    audit.soft_delete_record(instance, SimpleNamespace(username="carol"))
    assert instance.is_deleted is True
    assert instance.deleted_at is not None
    assert instance.deleted_by == "carol"
    # stamp_updated also invoked
    assert instance.updated_by == "carol"
    assert instance.updated_at is not None
