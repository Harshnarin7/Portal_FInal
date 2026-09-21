"""Link Helper 5 (metab_renal_vasc_eye_day_logs) ROP detection to Form G
screening entries.

NOTE ON NAMING: this module was originally written when
MetabRenalVascEyeLog.jsx was "Helper Form 4" -- it's Helper 5 now (see
mml_helper5_autofill.py's own naming-drift note for the 2026-09-19
sidebar renumbering this refers to). Comments below have been updated;
if this file is ever touched again and still says "Helper 4" anywhere,
that's stale, not current.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from models import BirthResuscitation, ROPScreening


def calculate_dol_and_pma(
    dob: Optional[date],
    screening_date: Optional[date],
    ga_weeks: Optional[int],
    ga_days: Optional[int],
) -> tuple[Any, str]:
    """Mirrors FormG.jsx's own calculateDOLandPMA exactly, so an
    auto-created screening row (from the Helper 5 linkage below) shows
    the same DOL/PMA a nurse would get by typing the date in by hand --
    previously left blank, the one thing this auto-created row couldn't
    do for itself despite Form G already knowing how."""
    if not dob or not screening_date:
        return "", ""
    dol = (screening_date - dob).days
    weeks = ga_weeks or 0
    days = ga_days or 0
    ga_birth_days = weeks * 7 + days
    pma_days = ga_birth_days + dol
    pma_weeks = pma_days // 7
    pma_remaining_days = pma_days % 7
    return (dol if dol >= 0 else "", f"{pma_weeks}w {pma_remaining_days}d")

SCREENING_DETAIL_FIELDS = (
    "method",
    "re_stage",
    "re_zone",
    "le_stage",
    "le_zone",
    "plus_status",
    "next_review",
)


def parse_screening_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def nicu_day_to_calendar_date(dob: date, nicu_day: int) -> date:
    return dob + timedelta(days=int(nicu_day) - 1)


def is_auto_suggested_screening(entry: dict) -> bool:
    return entry.get("from_metab_day_log") is True


def screening_entry_has_clinical_data(entry: dict) -> bool:
    if entry.get("signature"):
        return True
    return any(entry.get(f) for f in SCREENING_DETAIL_FIELDS)


def screening_entry_needs_review(entry: dict) -> bool:
    if not is_auto_suggested_screening(entry):
        return False
    return not screening_entry_has_clinical_data(entry)


def compute_rop_review_alerts(screenings: Any) -> list[dict]:
    alerts: list[dict] = []
    if not screenings:
        return alerts
    for entry in screenings:
        if not isinstance(entry, dict):
            continue
        if not screening_entry_needs_review(entry):
            continue
        nicu_day = entry.get("source_nicu_day")
        detected = parse_screening_date(entry.get("date"))
        day_label = f"Day {nicu_day}" if nicu_day is not None else "day log"
        alerts.append(
            {
                "nicu_day": nicu_day,
                "detected_date": detected.isoformat() if detected else None,
                "screening_no": entry.get("screening_no"),
                "message": f"New ROP detection from {day_label} log — please review",
            }
        )
    return alerts


def _screenings_list(rop: Optional[ROPScreening]) -> list:
    if not rop or not rop.screenings:
        return []
    if isinstance(rop.screenings, list):
        return list(rop.screenings)
    return []


def _has_screening_on_date(screenings: list, target: date) -> bool:
    for entry in screenings:
        if not isinstance(entry, dict):
            continue
        d = parse_screening_date(entry.get("date"))
        if d == target:
            return True
    return False


def _next_screening_no(screenings: list) -> Optional[int]:
    used = set()
    for entry in screenings:
        if not isinstance(entry, dict):
            continue
        no = entry.get("screening_no")
        if no is not None:
            try:
                used.add(int(no))
            except (TypeError, ValueError):
                pass
    for n in range(1, 13):
        if n not in used:
            return n
    return None


def _empty_screening_entry(
    screening_no: int, date_str: str, nicu_day: int, dol: Any = "", pma: str = "",
) -> dict:
    return {
        "screening_no": screening_no,
        "date": date_str,
        "dol": dol,
        "pma": pma,
        "method": "",
        "re_stage": "",
        "re_zone": "",
        "le_stage": "",
        "le_zone": "",
        "plus_status": "",
        "next_review": "",
        "signature": "",
        "from_metab_day_log": True,
        "source_nicu_day": nicu_day,
    }


def maybe_remove_rop_screening_from_metab_log(
    db: Session,
    enrollment_id: str,
    nicu_day: int,
) -> None:
    """Remove auto-suggested Form G row when Helper 5's ROP-detected flag is cleared (mirror of append)."""
    rop = (
        db.query(ROPScreening)
        .filter(ROPScreening.enrollment_id == enrollment_id)
        .order_by(ROPScreening.id.desc())
        .first()
    )
    screenings = _screenings_list(rop)
    if not screenings or not rop:
        return

    kept: list = []
    removed = False
    for entry in screenings:
        if not isinstance(entry, dict):
            kept.append(entry)
            continue
        if (
            is_auto_suggested_screening(entry)
            and entry.get("source_nicu_day") == nicu_day
            and not screening_entry_has_clinical_data(entry)
        ):
            removed = True
            continue
        kept.append(entry)

    if not removed:
        return
    rop.screenings = kept
    flag_modified(rop, "screenings")


def maybe_append_rop_screening_from_metab_log(
    db: Session,
    enrollment_id: str,
    nicu_day: int,
    rop_detected: Optional[bool],
) -> None:
    """Append a Form G screening row when the Helper 5 day log reports ROP detected."""
    if rop_detected is not True:
        return

    br = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.enrollment_id == enrollment_id)
        .first()
    )
    if not br or not br.date_of_birth:
        return

    detected_date = nicu_day_to_calendar_date(br.date_of_birth, nicu_day)
    date_str = detected_date.isoformat()

    rop = (
        db.query(ROPScreening)
        .filter(ROPScreening.enrollment_id == enrollment_id)
        .order_by(ROPScreening.id.desc())
        .first()
    )
    screenings = _screenings_list(rop)

    if _has_screening_on_date(screenings, detected_date):
        return

    next_no = _next_screening_no(screenings)
    if next_no is None:
        return

    dol, pma = calculate_dol_and_pma(
        br.date_of_birth, detected_date, br.gestation_weeks, br.gestation_days,
    )
    screenings.append(_empty_screening_entry(next_no, date_str, nicu_day, dol, pma))

    if rop:
        rop.screenings = screenings
        flag_modified(rop, "screenings")
        if rop.dob is None:
            rop.dob = br.date_of_birth
    else:
        db.add(
            ROPScreening(
                enrollment_id=enrollment_id,
                dob=br.date_of_birth,
                gestation_weeks=br.gestation_weeks,
                birth_weight=br.birth_weight,
                screenings=screenings,
            )
        )


def sync_rop_screening_from_metab_log(
    db: Session,
    enrollment_id: str,
    nicu_day: int,
    rop_detected: Optional[bool],
) -> None:
    """Helper 5 (day-log ROP-detected flag) ↔ Form G: append on Yes, drop empty auto-row on No/clear."""
    if rop_detected is True:
        maybe_append_rop_screening_from_metab_log(
            db, enrollment_id, nicu_day, True
        )
    else:
        maybe_remove_rop_screening_from_metab_log(db, enrollment_id, nicu_day)


def enrich_rop_screening_payload(record: ROPScreening, db: Session | None = None) -> dict:
    from schemas import ROPScreeningOut

    data = ROPScreeningOut.model_validate(record).model_dump()
    alerts = compute_rop_review_alerts(record.screenings)
    data["rop_needs_review"] = len(alerts) > 0
    data["rop_review_alerts"] = alerts
    if db is not None and record.enrollment_id:
        from rop_consistency import build_rop_consistency_report

        data["rop_consistency"] = build_rop_consistency_report(record.enrollment_id, db)
    return data
