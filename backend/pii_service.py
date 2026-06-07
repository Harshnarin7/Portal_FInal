"""
Participant PII — separate store for identifiers (DPDP / ICMR pseudonymisation).

Clinical tables keep only enrollment_id / screening_id; names and contacts live here.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from models import ParticipantPII, Screening

PII_VIEW_ROLES = frozenset({"superadmin", "pii_officer"})

SCREENING_PII_FIELDS = (
    "mother_first_name",
    "mother_surname",
    "husband_first_name",
    "husband_surname",
    "maternal_uid",
    "hospital_admission_number",
    "mother_contact",
    "husband_contact",
)

BIRTH_PII_FIELDS = (
    "mother_name_first",
    "mother_name_surname",
    "maternal_uid",
    "contact_mother",
    "contact_husband",
)

MATERNAL_PII_FIELDS = (
    "mother_name",
    "maternal_uid",
    "contact_mother",
    "contact_husband",
    "address",
)

POSTNATAL_PII_FIELDS = ("baby_name",)
NICU_PII_FIELDS = ("baby_name",)
LOG_PII_FIELDS = ("mother_name", "maternal_uid")
AE_PII_FIELDS = ("mother_name", "maternal_uid")


def utc_now():
    return datetime.now(timezone.utc)


def can_view_pii(user) -> bool:
    role = (user.role or "").lower()
    return role in PII_VIEW_ROLES or role == "site_user"


def can_view_pii_for_site(user, site_name: str | None) -> bool:
    if not can_view_pii(user):
        return False
    role = (user.role or "").lower()
    if role in PII_VIEW_ROLES:
        return True
    return bool(user.site_name and site_name and user.site_name == site_name)


def _merge(existing: ParticipantPII | None, **fields: Any) -> dict[str, Any]:
    out = {}
    for key, value in fields.items():
        if value is not None and value != "":
            out[key] = value
        elif existing is not None:
            current = getattr(existing, key, None)
            if current is not None:
                out[key] = current
    return out


def upsert_participant_pii(
    db: Session,
    *,
    enrollment_id: str | None = None,
    screening_id: str | None = None,
    site_name: str | None = None,
    **fields: Any,
) -> ParticipantPII:
    record = None
    if enrollment_id:
        record = (
            db.query(ParticipantPII)
            .filter(ParticipantPII.enrollment_id == enrollment_id)
            .first()
        )
    if record is None and screening_id:
        record = (
            db.query(ParticipantPII)
            .filter(ParticipantPII.screening_id == screening_id)
            .first()
        )

    merged = _merge(record, **fields)

    if record is None:
        record = ParticipantPII(
            enrollment_id=enrollment_id,
            screening_id=screening_id,
            site_name=site_name,
            created_at=utc_now(),
        )
        db.add(record)
    else:
        if enrollment_id and not record.enrollment_id:
            record.enrollment_id = enrollment_id
        if screening_id and not record.screening_id:
            record.screening_id = screening_id
        if site_name:
            record.site_name = site_name

    for key, value in merged.items():
        setattr(record, key, value)
    record.updated_at = utc_now()
    return record


def extract_screening_pii(data: dict) -> dict:
    return {k: data.get(k) for k in SCREENING_PII_FIELDS if data.get(k) is not None}


def clear_screening_pii_columns(screening: Screening) -> None:
    for field in SCREENING_PII_FIELDS:
        setattr(screening, field, None)


def strip_keys(data: dict, keys: tuple) -> dict:
    return {k: v for k, v in data.items() if k not in keys}


def pii_to_dict(record: ParticipantPII | None) -> dict | None:
    if record is None:
        return None
    return {
        "enrollment_id": record.enrollment_id,
        "screening_id": record.screening_id,
        "site_name": record.site_name,
        "mother_first_name": record.mother_first_name,
        "mother_surname": record.mother_surname,
        "husband_first_name": record.husband_first_name,
        "husband_surname": record.husband_surname,
        "maternal_uid": record.maternal_uid,
        "hospital_admission_number": record.hospital_admission_number,
        "mother_contact": record.mother_contact,
        "husband_contact": record.husband_contact,
        "address": record.address,
        "baby_name": record.baby_name,
        "contact_mother": record.contact_mother,
        "contact_husband": record.contact_husband,
        "updated_at": record.updated_at,
    }


def get_pii_for_participant(
    db: Session,
    *,
    enrollment_id: str | None = None,
    screening_id: str | None = None,
) -> ParticipantPII | None:
    if enrollment_id:
        row = (
            db.query(ParticipantPII)
            .filter(ParticipantPII.enrollment_id == enrollment_id)
            .first()
        )
        if row:
            return row
    if screening_id:
        return (
            db.query(ParticipantPII)
            .filter(ParticipantPII.screening_id == screening_id)
            .first()
        )
    return None


def migrate_legacy_pii(db: Session) -> int:
    """Copy PII from clinical tables into participant_pii; clear screening columns."""
    count = 0
    screenings = db.query(Screening).all()
    for s in screenings:
        has_pii = any(getattr(s, f) for f in SCREENING_PII_FIELDS)
        if not has_pii:
            continue
        upsert_participant_pii(
            db,
            enrollment_id=s.enrollment_id,
            screening_id=s.screening_id,
            site_name=s.site_name,
            mother_first_name=s.mother_first_name,
            mother_surname=s.mother_surname,
            husband_first_name=s.husband_first_name,
            husband_surname=s.husband_surname,
            maternal_uid=s.maternal_uid,
            hospital_admission_number=s.hospital_admission_number,
            mother_contact=s.mother_contact,
            husband_contact=s.husband_contact,
        )
        clear_screening_pii_columns(s)
        count += 1
    if count:
        db.commit()
    return count


def split_and_store_pii(
    db: Session,
    payload: dict,
    pii_keys: tuple,
    *,
    enrollment_id: str | None = None,
    screening_id: str | None = None,
    site_name: str | None = None,
) -> dict:
    """Move PII fields into participant_pii; null them in the clinical payload."""
    pii_values = {}
    for key in pii_keys:
        if key in payload and payload[key] not in (None, ""):
            pii_values[key] = payload[key]
        payload[key] = None

    if pii_values:
        mapped = dict(pii_values)
        if "mother_name_first" in mapped:
            mapped.setdefault("mother_first_name", mapped.pop("mother_name_first", None))
        if "mother_name_surname" in mapped:
            mapped.setdefault("mother_surname", mapped.pop("mother_name_surname", None))
        if "mother_name" in mapped and "mother_first_name" not in mapped:
            parts = (mapped.pop("mother_name") or "").split(None, 1)
            mapped["mother_first_name"] = parts[0] if parts else None
            mapped["mother_surname"] = parts[1] if len(parts) > 1 else None
        if "contact_mother" in mapped:
            mapped.setdefault("mother_contact", mapped.get("contact_mother"))
        if "contact_husband" in mapped:
            mapped.setdefault("husband_contact", mapped.get("contact_husband"))
        valid_cols = {c.name for c in ParticipantPII.__table__.columns}
        upsert_participant_pii(
            db,
            enrollment_id=enrollment_id,
            screening_id=screening_id,
            site_name=site_name,
            **{k: v for k, v in mapped.items() if k in valid_cols},
        )
    return payload


def screening_to_clinical_dict(screening: Screening) -> dict:
    """Build API dict for screening without PII fields."""
    data = {
        c.name: getattr(screening, c.name)
        for c in screening.__table__.columns
    }
    for field in SCREENING_PII_FIELDS:
        data.pop(field, None)
    return data
