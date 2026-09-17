"""Audit log read API — global roles (all sites) and site_pi (own site only)."""

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased

from db import get_db
from deps import ROLE_SITE_PI, get_current_user, is_global
from models import AuditLog, Screening, User
from schemas import AuditLogOut

# Keep in sync with dashboard.py ALL_SITES (site filter validation).
_VALID_SITES = frozenset({"PGIMER", "GMCH", "IOG", "AFMC", "GMCH-A", "AMC"})

router = APIRouter(prefix="/audit", tags=["Audit"])


def _can_view_audit(user: User) -> bool:
    return is_global(user) or (user.role or "").lower() == ROLE_SITE_PI


def _parse_date_param(value: str | None, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        d = date.fromisoformat(value[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}")
    if end_of_day:
        return datetime.combine(d, time(23, 59, 59, 999999), tzinfo=timezone.utc)
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def _audit_site_column():
    """Resolve site at query time: prefer screening_id join, else enrollment_id → screenings."""
    scr_by_sid = aliased(Screening)
    scr_by_enr = aliased(Screening)
    return func.coalesce(scr_by_sid.site_name, scr_by_enr.site_name), scr_by_sid, scr_by_enr


@router.get("/", response_model=list[AuditLogOut])
def list_audit_logs(
    table_name: str | None = None,
    enrollment_id: str | None = None,
    screening_id: str | None = None,
    action: str | None = None,
    site: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    skip: int = 0,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_view_audit(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view audit logs")

    site_col, scr_by_sid, scr_by_enr = _audit_site_column()

    query = (
        db.query(AuditLog, site_col.label("resolved_site"))
        .outerjoin(scr_by_sid, scr_by_sid.screening_id == AuditLog.screening_id)
        .outerjoin(
            scr_by_enr,
            and_(
                AuditLog.enrollment_id.isnot(None),
                AuditLog.enrollment_id != "",
                scr_by_enr.enrollment_id == AuditLog.enrollment_id,
            ),
        )
        .order_by(AuditLog.created_at.desc())
    )

    if is_global(current_user):
        if site and site in _VALID_SITES:
            query = query.filter(site_col == site)
    else:
        pi_site = (current_user.site_name or "").strip()
        if not pi_site:
            return []
        query = query.filter(site_col == pi_site)

    if table_name:
        query = query.filter(AuditLog.table_name == table_name)
    if enrollment_id:
        query = query.filter(AuditLog.enrollment_id == enrollment_id)
    if screening_id:
        query = query.filter(AuditLog.screening_id == screening_id)
    if action:
        query = query.filter(AuditLog.action == action.upper())

    dt_from = _parse_date_param(date_from)
    dt_to = _parse_date_param(date_to, end_of_day=True)
    if dt_from:
        query = query.filter(AuditLog.created_at >= dt_from)
    if dt_to:
        query = query.filter(AuditLog.created_at <= dt_to)

    rows = query.offset(skip).limit(limit).all()
    out: list[AuditLogOut] = []
    for log, resolved_site in rows:
        out.append(
            AuditLogOut(
                id=log.id,
                user_id=log.user_id,
                username=log.username,
                action=log.action,
                table_name=log.table_name,
                record_id=log.record_id,
                enrollment_id=log.enrollment_id,
                screening_id=log.screening_id,
                old_values=log.old_values,
                new_values=log.new_values,
                created_at=log.created_at,
                site=resolved_site,
            )
        )
    return out
