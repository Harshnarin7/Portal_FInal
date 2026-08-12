"""Access-controlled endpoints for participant personally identifiable information."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user
from models import ParticipantPII, Screening, User
from pii_service import (
    can_view_pii_for_site,
    get_pii_for_participant,
    pii_to_dict,
    upsert_participant_pii,
)
from schemas import ParticipantPIICreate, ParticipantPIIOut, ParticipantPIIBatchRequest

router = APIRouter(prefix="/pii", tags=["Participant PII"])


def _resolve_site(
    db: Session,
    enrollment_id: str | None,
    screening_id: str | None,
) -> str | None:
    if enrollment_id:
        s = db.query(Screening).filter(Screening.enrollment_id == enrollment_id).first()
        if s:
            return s.site_name
    if screening_id:
        s = db.query(Screening).filter(Screening.screening_id == screening_id).first()
        if s:
            return s.site_name
    return None


def _require_pii_read(user: User, site_name: str | None):
    if not can_view_pii_for_site(user, site_name):
        raise HTTPException(
            status_code=403,
            detail="Not authorized to view participant PII",
        )


@router.get("/enrollment/{enrollment_id}", response_model=ParticipantPIIOut)
def get_pii_by_enrollment(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = _resolve_site(db, enrollment_id, None)
    _require_pii_read(current_user, site)
    record = get_pii_for_participant(db, enrollment_id=enrollment_id)
    if not record:
        raise HTTPException(status_code=404, detail="PII record not found")
    return record


@router.get("/screening/{screening_id}", response_model=ParticipantPIIOut)
def get_pii_by_screening(
    screening_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = _resolve_site(db, None, screening_id)
    _require_pii_read(current_user, site)
    record = get_pii_for_participant(db, screening_id=screening_id)
    if not record:
        raise HTTPException(status_code=404, detail="PII record not found")
    return record


@router.post("/batch")
def get_pii_batch(
    body: ParticipantPIIBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return PII for many screenings in one round-trip.

    Used by the mobile Patients tab (and webforms lists) so they do not
    fire N × GET /pii/screening/{id} after GET /screenings/.
    Only rows the caller may view for their site are included; unknown /
    unauthorized ids are omitted (not 403) so one bad id cannot fail the batch.
    """
    ids = [s.strip() for s in (body.screening_ids or []) if s and str(s).strip()]
    # Deduplicate while preserving order
    seen = set()
    unique_ids = []
    for sid in ids:
        if sid not in seen:
            seen.add(sid)
            unique_ids.append(sid)
    if len(unique_ids) > 500:
        raise HTTPException(status_code=400, detail="At most 500 screening_ids per batch")
    if not unique_ids:
        return {"items": {}}

    screenings = (
        db.query(Screening.screening_id, Screening.site_name)
        .filter(Screening.screening_id.in_(unique_ids))
        .all()
    )
    allowed_ids = [
        sid for sid, site in screenings
        if can_view_pii_for_site(current_user, site)
    ]
    if not allowed_ids:
        return {"items": {}}

    rows = (
        db.query(ParticipantPII)
        .filter(ParticipantPII.screening_id.in_(allowed_ids))
        .all()
    )
    items = {}
    for row in rows:
        if not row.screening_id:
            continue
        items[row.screening_id] = pii_to_dict(row)
    return {"items": items}


@router.put("/", response_model=ParticipantPIIOut)
def upsert_pii(
    data: ParticipantPIICreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = data.site_name or _resolve_site(db, data.enrollment_id, data.screening_id)
    _require_pii_read(current_user, site)
    if not data.enrollment_id and not data.screening_id:
        raise HTTPException(
            status_code=400,
            detail="enrollment_id or screening_id is required",
        )
    record = upsert_participant_pii(
        db,
        enrollment_id=data.enrollment_id,
        screening_id=data.screening_id,
        site_name=site or data.site_name,
        mother_first_name=data.mother_first_name,
        mother_surname=data.mother_surname,
        husband_first_name=data.husband_first_name,
        husband_surname=data.husband_surname,
        maternal_uid=data.maternal_uid,
        hospital_admission_number=data.hospital_admission_number,
        mother_contact=data.mother_contact,
        husband_contact=data.husband_contact,
        address=data.address,
        baby_name=data.baby_name,
        contact_mother=data.contact_mother,
        contact_husband=data.contact_husband,
    )
    db.commit()
    db.refresh(record)
    return record
