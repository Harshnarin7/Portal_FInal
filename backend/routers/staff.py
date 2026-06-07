"""Site staff (screeners) — database-backed roster (C6)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user, ensure_same_site, require_superadmin
from models import SiteStaff, User
from schemas import SiteStaffCreate, SiteStaffOut

router = APIRouter(tags=["Site Staff"])


@router.get("/sites/{site_name}/screeners", response_model=list[str])
def get_site_screeners(
    site_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_same_site(site_name, current_user)
    rows = (
        db.query(SiteStaff)
        .filter(
            SiteStaff.site_name == site_name,
            SiteStaff.is_active.is_(True),
        )
        .order_by(SiteStaff.name)
        .all()
    )
    return [r.name for r in rows]


@router.get("/admin/site-staff", response_model=list[SiteStaffOut])
def list_all_staff(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_superadmin(current_user)
    return db.query(SiteStaff).order_by(SiteStaff.site_name, SiteStaff.name).all()


@router.post("/admin/site-staff", response_model=SiteStaffOut)
def add_staff(
    data: SiteStaffCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_superadmin(current_user)
    existing = (
        db.query(SiteStaff)
        .filter(
            SiteStaff.site_name == data.site_name,
            SiteStaff.name == data.name,
        )
        .first()
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(status_code=400, detail="Staff member already exists")

    row = SiteStaff(
        site_name=data.site_name,
        name=data.name,
        role=data.role or "screener",
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/site-staff/{staff_id}")
def deactivate_staff(
    staff_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_superadmin(current_user)
    row = db.query(SiteStaff).filter(SiteStaff.id == staff_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Staff not found")
    row.is_active = False
    db.commit()
    return {"message": "Staff deactivated"}
