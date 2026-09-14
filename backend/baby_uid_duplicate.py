"""Baby UID and Enrollment ID duplicate detection (Form B)."""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from models import BirthResuscitation

ENROLLMENT_ID_PATTERN = re.compile(r"^\d{2}-[A-D]-\d{3}$", re.IGNORECASE)


def site_prefix_from_screening_id(screening_id: str | None) -> str | None:
    if not screening_id:
        return None
    s = screening_id.strip()
    if "-" not in s:
        return None
    return s.split("-", 1)[0]


def find_baby_uid_conflict(
    db: Session,
    baby_uid: str | None,
    screening_id: str | None,
    enrollment_id: str | None = None,
) -> BirthResuscitation | None:
    """Another birth_resuscitation row at this site with the same baby_uid."""
    uid = (baby_uid or "").strip()
    if not uid:
        return None
    prefix = site_prefix_from_screening_id(screening_id)
    if not prefix:
        return None

    current_sid = (screening_id or "").strip()
    current_eid = (enrollment_id or "").strip()

    rows = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.baby_uid == uid)
        .filter(BirthResuscitation.screening_id.like(f"{prefix}-%"))
        .all()
    )
    for row in rows:
        if current_eid and row.enrollment_id and row.enrollment_id == current_eid:
            continue
        if current_sid and row.screening_id == current_sid:
            continue
        return row
    return None


def find_enrollment_id_conflict(
    db: Session,
    enrollment_id: str | None,
    screening_id: str | None,
) -> BirthResuscitation | None:
    """Another patient's birth row already owns this enrollment_id."""
    eid = (enrollment_id or "").strip()
    if not eid or eid.upper().startswith("NR-") or not ENROLLMENT_ID_PATTERN.match(eid):
        return None
    existing = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.enrollment_id.ilike(eid))
        .first()
    )
    if not existing:
        return None
    current_sid = (screening_id or "").strip()
    if current_sid and existing.screening_id == current_sid:
        return None
    return existing


def enrollment_id_conflict_message(
    enrollment_id: str,
    conflict: BirthResuscitation,
) -> str:
    sid = conflict.screening_id or "another patient"
    return (
        f"Enrollment ID '{enrollment_id}' is already used by screening {sid}. "
        "Please double-check — this may be a duplicate entry."
    )


def baby_uid_conflict_message(
    baby_uid: str,
    conflict: BirthResuscitation,
) -> str:
    sid = conflict.screening_id or "another patient"
    eid = conflict.enrollment_id
    if eid:
        return (
            f"Baby UID '{baby_uid}' is already used at this site for screening "
            f"{sid} (enrollment {eid}). Please verify this is not a duplicate entry."
        )
    return (
        f"Baby UID '{baby_uid}' is already used at this site for screening "
        f"{sid}. Please verify this is not a duplicate entry."
    )
