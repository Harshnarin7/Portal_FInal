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


_FORM_LABELS = {
    "screenings": "Form A — Screening",
    "birth_resuscitation": "Form B — Birth & Resuscitation",
    "maternal_details": "Form C — Maternal Details",
    "postnatal_day1": "Form D — Postnatal Day 1",
    "nicu_admission": "Form E — NICU Admission",
}


def _is_explicit_save(log: AuditLog) -> bool:
    if (log.action or "").upper() == "SAVE":
        return True
    new_values = log.new_values or {}
    old_values = log.old_values or {}
    return new_values.get("explicitly_saved") is True and old_values.get("explicitly_saved") is not True


@router.get("/patient")
def patient_save_history(
    screening_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Saves for one participant. Any user who can open that screening may read it.
    Only explicit Save clicks are returned — not background autosave."""
    screening = (
        db.query(Screening)
        .filter(Screening.screening_id == screening_id, Screening.is_deleted.isnot(True))
        .first()
    )
    if not screening:
        raise HTTPException(status_code=404, detail="Screening not found")
    if not is_global(current_user) and (screening.site_name or "") != (current_user.site_name or ""):
        raise HTTPException(status_code=403, detail="Not authorized for this site")

    filters = [AuditLog.screening_id == screening_id]
    if screening.enrollment_id:
        filters.append(AuditLog.enrollment_id == screening.enrollment_id)
    logs = (
        db.query(AuditLog)
        .filter(or_(*filters))
        .order_by(AuditLog.created_at.desc())
        .limit(200)
        .all()
    )
    saves = [log for log in logs if _is_explicit_save(log)]
    # A new Save click also writes UPDATE. Keep the SAVE row and drop the twin UPDATE.
    save_marks = {
        (log.user_id, log.screening_id, log.created_at.replace(microsecond=0) if log.created_at else None)
        for log in saves
        if (log.action or "").upper() == "SAVE"
    }
    deduped = []
    for log in saves:
        stamp = log.created_at.replace(microsecond=0) if log.created_at else None
        if (log.action or "").upper() != "SAVE" and (log.user_id, log.screening_id, stamp) in save_marks:
            continue
        deduped.append(log)

    user_ids = {log.user_id for log in deduped if log.user_id}
    handles = {log.username for log in deduped if log.username}
    handles.update(
        h for h in (screening.updated_by, screening.created_by) if h
    )
    by_id = {}
    by_username = {}
    if user_ids or handles:
        clauses = []
        if user_ids:
            clauses.append(User.id.in_(user_ids))
        if handles:
            clauses.append(User.username.in_(handles))
        found = db.query(User).filter(or_(*clauses)).all() if clauses else []
        for user in found:
            name = (user.full_name or "").strip()
            if not name:
                continue
            by_id[user.id] = name
            if user.username:
                by_username[user.username] = name

    def person_name(log) -> str:
        return (
            by_id.get(log.user_id)
            or by_username.get(log.username or "")
            or "—"
        )

    rows = []
    for log in deduped:
        form = (log.new_values or {}).get("form") or _FORM_LABELS.get(log.table_name) or log.table_name
        rows.append({
            "id": log.id,
            "form": form,
            "saved_by": person_name(log),
            "saved_at": log.created_at.isoformat() if log.created_at else None,
        })
    if not rows and screening.explicitly_saved and screening.updated_at:
        who = by_username.get(screening.updated_by or "") or by_username.get(screening.created_by or "") or "—"
        rows.append({
            "id": 0,
            "form": "Form A — Screening",
            "saved_by": who,
            "saved_at": screening.updated_at.isoformat(),
        })
    return rows
