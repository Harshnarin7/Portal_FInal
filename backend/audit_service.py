"""GCP-aligned audit trail: change log + soft delete helpers."""

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from models import AuditLog


def utc_now():
    return datetime.now(timezone.utc)


def _serialize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    try:
        return json.loads(json.dumps(value, default=str))
    except (TypeError, ValueError):
        return str(value)


def row_snapshot(instance) -> dict:
    if instance is None:
        return {}
    return {
        c.name: _serialize(getattr(instance, c.name, None))
        for c in instance.__table__.columns
    }


def record_audit(
    db: Session,
    *,
    user_id: int | None,
    username: str | None,
    action: str,
    table_name: str,
    record_id: str | int | None = None,
    enrollment_id: str | None = None,
    screening_id: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        table_name=table_name,
        record_id=str(record_id) if record_id is not None else None,
        enrollment_id=enrollment_id,
        screening_id=screening_id,
        old_values=old_values,
        new_values=new_values,
        created_at=utc_now(),
    )
    db.add(entry)
    return entry


def stamp_created(instance, user) -> None:
    if hasattr(instance, "created_by") and user:
        instance.created_by = user.username
    if hasattr(instance, "created_at") and not getattr(instance, "created_at", None):
        instance.created_at = utc_now()


def stamp_updated(instance, user) -> None:
    if hasattr(instance, "updated_by") and user:
        instance.updated_by = user.username
    if hasattr(instance, "updated_at"):
        instance.updated_at = utc_now()


def soft_delete_record(instance, user) -> None:
    instance.is_deleted = True
    instance.deleted_at = utc_now()
    if hasattr(instance, "deleted_by") and user:
        instance.deleted_by = user.username
    stamp_updated(instance, user)
