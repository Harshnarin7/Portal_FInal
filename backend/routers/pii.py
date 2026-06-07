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
from schemas import ParticipantPIICreate, ParticipantPIIOut

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
