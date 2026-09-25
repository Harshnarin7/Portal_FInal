"""Cross-checks a Log of All Births entry (backend/models.py::BirthLogEntry)
against existing Form A screenings, so a GA-eligible (25w0d-31w6d) delivery
with no matching screening can be surfaced as a completeness alert on the
dashboard -- the digital equivalent of the paper "Log of All Births" CRF's
own "Screening form filled (Y/N), If Y, screening ID" column, computed
automatically instead of hand-typed so it can't go stale.

Matching runs against ParticipantPII (the single canonical identity store
across Form A/B/C, per the 2026-08-18 PII-dedup fix) rather than Screening
itself, since Screening's own mother_name/maternal_uid columns are stripped
blank by pii_service.split_and_store_pii on every save. maternal_uid is
encrypted at rest, so this can't be a SQL WHERE -- candidates are narrowed
by site_name (plain, indexed) and matched in Python after decrypting.

A second cross-check (2026-09-24) also matches against GACheckEntry (the
Gestation (Inclusion Criteria) Screening Log -- ga_check.py/GACheckLog.jsx).

**Restructured 2026-09-24 (PI-directed) from one combined `match_status`
enum into two INDEPENDENT facts, each surfaced as its own badge on
LogOfAllBirths.jsx, both shown together whenever both apply:**
- `match_status` -- purely about Form A: "matched" | "in_range_no_match"
  | "out_of_range" | "ga_unknown". ("never_checked" no longer exists as
  a match_status value -- see below.)
- `ga_log_missing` -- purely about the Gestation Log: True if no
  Gestation Log entry exists for this woman at all, regardless of
  whether Form A was also found. A woman CAN have `match_status=
  "matched"` (Form A exists) AND `ga_log_missing=True` at the same time
  -- a direct/orphan Form A entry that bypassed the log entirely. The PI
  explicitly wants this shown even when Form A is fine, since it's real
  data-quality information (is staff actually using the intended triage
  workflow?) independent of whether Form A itself is missing.

Only computed (True/False, never left at the SQL-NULL default) when
`match_status` is "matched" or "in_range_no_match" -- left NULL for
out_of_range/ga_unknown, since this log is preterm-triage-only and
asking "was her GA ever checked" makes no sense for a term birth.
"""
from __future__ import annotations

import re
from typing import Optional

from sqlalchemy.orm import Session

from models import ParticipantPII, GACheckEntry

# Same inclusion window used by the CONSORT dashboard's _GA_IN_WINDOW_SQL
# (backend/routers/dashboard.py) -- kept in sync manually, not imported,
# since routers/dashboard.py builds this as a raw SQL fragment rather than
# a reusable Python constant.
GA_MIN_DAYS = 25 * 7
GA_MAX_DAYS = 31 * 7 + 6


def _normalize(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", str(value).strip().lower())


def _normalize_uid(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"[\s\-]+", "", str(value).strip().upper())


def classify_ga_range(gestation_weeks: Optional[int], gestation_days: Optional[int]) -> str:
    """Returns 'ga_unknown' | 'in_range' | 'out_of_range'."""
    if gestation_weeks is None:
        return "ga_unknown"
    total_days = int(gestation_weeks) * 7 + int(gestation_days or 0)
    if GA_MIN_DAYS <= total_days <= GA_MAX_DAYS:
        return "in_range"
    return "out_of_range"


def _has_ga_check_entry(
    db: Session, site_name: Optional[str], target_uid: str, target_name: str
) -> bool:
    """True if ANY Gestation (Inclusion Criteria) Screening Log entry
    exists for this woman at this site, by the same UID-first/name-fallback
    rule match_birth_log_entry uses against ParticipantPII. Presence alone
    is what matters here -- an Unknown/Unreliable-source or out-of-range
    entry still proves a nurse actually checked her, which is the whole
    distinction this function exists to draw."""
    if not target_uid and not target_name:
        return False
    query = db.query(GACheckEntry)
    if site_name:
        query = query.filter(GACheckEntry.site_name == site_name)
    candidates = query.all()
    if target_uid:
        for row in candidates:
            if _normalize_uid(row.mother_uid) == target_uid:
                return True
    if target_name:
        for row in candidates:
            if _normalize(row.mother_name) == target_name:
                return True
    return False


def match_birth_log_entry(
    db: Session,
    site_name: Optional[str],
    mother_uid: Optional[str],
    mother_name: Optional[str],
    gestation_weeks: Optional[int],
    gestation_days: Optional[int],
) -> dict:
    """Returns {"matched_screening_id", "matched_enrollment_id", "match_status"}."""
    ga_range = classify_ga_range(gestation_weeks, gestation_days)

    target_uid = _normalize_uid(mother_uid)
    target_name = _normalize(mother_name)

    matched_screening_id: Optional[str] = None
    matched_enrollment_id: Optional[str] = None

    if target_uid or target_name:
        query = db.query(ParticipantPII)
        if site_name:
            query = query.filter(ParticipantPII.site_name == site_name)
        candidates = query.all()

        # Pass 1: exact UID match (most reliable -- a hospital-assigned
        # identifier, not prone to spelling variants).
        if target_uid:
            for row in candidates:
                if _normalize_uid(row.maternal_uid) == target_uid:
                    matched_screening_id = row.screening_id
                    matched_enrollment_id = row.enrollment_id
                    break

        # Pass 2: fall back to a full-name match only if UID didn't
        # resolve it -- names collide far more often than hospital UIDs.
        if not matched_screening_id and target_name:
            for row in candidates:
                full_name = _normalize(
                    " ".join(filter(None, [row.mother_first_name, row.mother_surname]))
                )
                if full_name and full_name == target_name:
                    matched_screening_id = row.screening_id
                    matched_enrollment_id = row.enrollment_id
                    break

    if matched_screening_id or matched_enrollment_id:
        match_status = "matched"
    elif ga_range == "ga_unknown":
        match_status = "ga_unknown"
    elif ga_range == "in_range":
        match_status = "in_range_no_match"
    else:
        match_status = "out_of_range"

    # Independent of match_status -- see module docstring. Only
    # meaningful (non-NULL) for the two match_status values where "was
    # her GA ever checked" is a sensible question at all.
    ga_log_missing: Optional[bool] = None
    if match_status in ("matched", "in_range_no_match"):
        ga_log_missing = not _has_ga_check_entry(db, site_name, target_uid, target_name)

    return {
        "matched_screening_id": matched_screening_id,
        "matched_enrollment_id": matched_enrollment_id,
        "match_status": match_status,
        "ga_log_missing": ga_log_missing,
    }
