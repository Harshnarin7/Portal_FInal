"""Audit log read API (superadmin / pii_officer)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user
from models import AuditLog, User
from schemas import AuditLogOut

router = APIRouter(prefix="/audit", tags=["Audit"])


def _can_view_audit(user: User) -> bool:
    return (user.role or "").lower() in ("superadmin", "pii_officer")


@router.get("/", response_model=list[AuditLogOut])
def list_audit_logs(
    table_name: str | None = None,
    enrollment_id: str | None = None,
    skip: int = 0,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_view_audit(current_user):
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Not authorized to view audit logs")

    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if table_name:
        query = query.filter(AuditLog.table_name == table_name)
    if enrollment_id:
        query = query.filter(AuditLog.enrollment_id == enrollment_id)
    return query.offset(skip).limit(limit).all()
