"""Audit log read API — superadmin (all sites) and site_pi (own site only)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import get_db
from deps import ROLE_SITE_PI, ROLE_SUPERADMIN, get_current_user, is_global
from models import AuditLog, User
from schemas import AuditLogOut

router = APIRouter(prefix="/audit", tags=["Audit"])


def _can_view_audit(user: User) -> bool:
    return (user.role or "").lower() in (ROLE_SUPERADMIN, ROLE_SITE_PI)


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
        raise HTTPException(status_code=403, detail="Not authorized to view audit logs")

    # site_pi is site-scoped everywhere else in the app (dashboards, View
    # Entries, etc.) — the audit trail follows the same rule via
    # require_enrollment_access, so a PI can only pull history for an
    # enrollment_id that belongs to their own site. Only superadmin gets
    # the unscoped, all-sites view.
    if not is_global(current_user):
        if not enrollment_id:
            raise HTTPException(
                status_code=403,
                detail="An enrollment_id is required to view audit history for your site",
            )
        from main import require_enrollment_access  # local import avoids a circular import at module load

        require_enrollment_access(enrollment_id, db, current_user)

    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if table_name:
        query = query.filter(AuditLog.table_name == table_name)
    if enrollment_id:
        query = query.filter(AuditLog.enrollment_id == enrollment_id)
    return query.offset(skip).limit(limit).all()