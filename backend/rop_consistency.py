"""Cross-check Form H (neonatal_morbidities) vs Form G (rop_screening) ROP fields."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from models import BirthResuscitation, NeonatalMorbidities, ROPScreening, Screening
from rop_form_g_linkage import parse_screening_date

COMPARE_FIELDS = (
    ("stage_right", "rop_stage_right", "re_stage", "Right eye stage"),
    ("zone_right", "rop_zone_right", "re_zone", "Right eye zone"),
    ("plus_right", "rop_plus_right", "plus_status", "Right eye plus disease"),
    ("stage_left", "rop_stage_left", "le_stage", "Left eye stage"),
    ("zone_left", "rop_zone_left", "le_zone", "Left eye zone"),
    ("plus_left", "rop_plus_left", "plus_status", "Left eye plus disease"),
)


def _latest_nm(db: Session, enrollment_id: str) -> Optional[NeonatalMorbidities]:
    return (
        db.query(NeonatalMorbidities)
        .filter(NeonatalMorbidities.enrollment_id == enrollment_id)
        .order_by(NeonatalMorbidities.id.desc())
        .first()
    )


def _latest_rop(db: Session, enrollment_id: str) -> Optional[ROPScreening]:
    return (
        db.query(ROPScreening)
        .filter(ROPScreening.enrollment_id == enrollment_id)
        .order_by(ROPScreening.id.desc())
        .first()
    )


def _screenings_list(rop: Optional[ROPScreening]) -> list:
    if not rop or not rop.screenings:
        return []
    if isinstance(rop.screenings, list):
        return [s for s in rop.screenings if isinstance(s, dict)]
    return []


def latest_screening_visit(screenings: list) -> Optional[dict]:
    dated = []
    for entry in screenings:
        d = parse_screening_date(entry.get("date"))
        if d is not None:
            dated.append((d, entry))
    if not dated:
        return None
    dated.sort(key=lambda t: (t[0], int(t[1].get("screening_no") or 0)))
    return dated[-1][1]


def _empty(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str):
        return val.strip() == ""
    return False


def _normalize_stage(val: str) -> str:
    s = str(val).strip().upper()
    if s in ("4A", "4B"):
        return "4"
    if s == "0":
        return "0"
    return s.lstrip("STAGE").strip()


def _normalize_zone(val: str) -> str:
    return str(val).strip().upper().replace("ZONE", "").strip()


def _normalize_plus_form_h(val: str) -> Optional[str]:
    v = str(val).strip().lower()
    if v in ("yes", "y", "true", "1"):
        return "plus"
    if v in ("no", "n", "false", "0"):
        return "none"
    return None


def _normalize_plus_form_g(val: str) -> Optional[str]:
    v = str(val).strip()
    if v == "Plus":
        return "plus"
    if v == "None":
        return "none"
    if v in ("A-ROP", "AROP", "A ROP"):
        return "arop"
    return None


def _values_differ(field_key: str, h_val: Any, g_val: Any) -> bool:
    if field_key.startswith("stage_"):
        return _normalize_stage(h_val) != _normalize_stage(g_val)
    if field_key.startswith("zone_"):
        return _normalize_zone(h_val) != _normalize_zone(g_val)
    if field_key.startswith("plus_"):
        nh = _normalize_plus_form_h(h_val)
        ng = _normalize_plus_form_g(g_val)
        if nh is None or ng is None:
            return nh != ng
        return nh != ng
    return str(h_val).strip() != str(g_val).strip()


def _side_active(nm: NeonatalMorbidities, eye: str) -> bool:
    side = (nm.rop_side or "").strip()
    if not side:
        return True
    if eye == "right":
        return side in ("Right", "Bilateral")
    return side in ("Left", "Bilateral")


def check_rop_consistency(enrollment_id: str, db: Session) -> list[dict]:
    """Return discrepancies where both Form H and latest Form G visit have values."""
    nm = _latest_nm(db, enrollment_id)
    rop = _latest_rop(db, enrollment_id)
    visit = latest_screening_visit(_screenings_list(rop))
    if not nm or not visit:
        return []

    form_g_date = visit.get("date")
    if isinstance(form_g_date, date):
        form_g_date = form_g_date.isoformat()

    out: list[dict] = []
    for field_key, h_attr, g_attr, label in COMPARE_FIELDS:
        eye = "right" if "right" in field_key else "left"
        if not _side_active(nm, eye):
            continue
        h_val = getattr(nm, h_attr, None)
        g_val = visit.get(g_attr)
        if _empty(h_val) or _empty(g_val):
            continue
        if not _values_differ(field_key, h_val, g_val):
            continue
        out.append(
            {
                "field": field_key,
                "label": label,
                "form_h_value": str(h_val),
                "form_g_value": str(g_val),
                "form_g_date": form_g_date,
            }
        )
    return out


def _reviewed_set(nm: Optional[NeonatalMorbidities]) -> set:
    if not nm or not nm.rop_flags_reviewed:
        return set()
    if isinstance(nm.rop_flags_reviewed, list):
        return {str(x) for x in nm.rop_flags_reviewed}
    return set()


def build_rop_consistency_report(enrollment_id: str, db: Session) -> dict:
    nm = _latest_nm(db, enrollment_id)
    rop = _latest_rop(db, enrollment_id)
    discrepancies = check_rop_consistency(enrollment_id, db)
    reviewed = _reviewed_set(nm)
    enriched = []
    for d in discrepancies:
        item = dict(d)
        item["reviewed"] = d["field"] in reviewed
        enriched.append(item)
    unreviewed = [d for d in enriched if not d["reviewed"]]
    visit = latest_screening_visit(_screenings_list(rop))
    return {
        "has_data": bool(nm or rop),
        "form_h_present": nm is not None,
        "form_g_present": rop is not None,
        "latest_form_g_date": visit.get("date") if visit else None,
        "discrepancies": enriched,
        "unreviewed_discrepancies": unreviewed,
        "all_discrepancies": enriched,
    }


def has_unreviewed_rop_mismatch(enrollment_id: str, db: Session) -> bool:
    report = build_rop_consistency_report(enrollment_id, db)
    return len(report["unreviewed_discrepancies"]) > 0


def iter_rop_mismatch_enrollments(db: Session, site_set: Optional[set] = None):
    """Yield (site_name, enrollment_id) for dashboard action items."""
    q = (
        db.query(Screening.site_name, BirthResuscitation.enrollment_id)
        .join(BirthResuscitation, BirthResuscitation.screening_id == Screening.screening_id)
        .filter(
            BirthResuscitation.randomised.is_(True),
            Screening.is_deleted.is_(False),
            BirthResuscitation.enrollment_id.isnot(None),
            Screening.site_name.isnot(None),
            Screening.site_name != "",
        )
    )
    seen = set()
    for site_name, enrollment_id in q.all():
        if not enrollment_id or enrollment_id in seen:
            continue
        if site_set is not None and site_name not in site_set:
            continue
        seen.add(enrollment_id)
        if has_unreviewed_rop_mismatch(enrollment_id, db):
            yield site_name, enrollment_id
