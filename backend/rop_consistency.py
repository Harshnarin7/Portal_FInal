"""Cross-check Form H (neonatal_morbidities) vs Form G (rop_screening) ROP fields."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from models import BirthResuscitation, NeonatalMorbidities, ROPScreening, Screening
from rop_form_g_linkage import parse_screening_date, screening_entry_has_clinical_data

# (review key, Form H column, label). The Form G side is the per-eye WORST
# disease from derive_form_h_rop_from_form_g() -- Form H's own field is
# "Max Stage", so comparing it against the latest visit (as this check
# first did) flagged a false mismatch whenever disease regressed after its
# peak. Review keys are unchanged so existing rop_flags_reviewed stay valid.
COMPARE_FIELDS = (
    ("stage_right", "rop_stage_right", "Right eye stage"),
    ("zone_right", "rop_zone_right", "Right eye zone"),
    ("plus_right", "rop_plus_right", "Right eye plus disease"),
    ("stage_left", "rop_stage_left", "Left eye stage"),
    ("zone_left", "rop_zone_left", "Left eye zone"),
    ("plus_left", "rop_plus_left", "Left eye plus disease"),
)

# Form G stage vocabulary (FormG.jsx STAGES, minus "None") in severity order.
FORM_G_STAGE_RANK = {"1": 1, "2": 2, "3": 3, "4A": 4, "4B": 5, "5": 6}
_EYES = (
    # (Form H suffix, Form G summary suffix, visit stage key, visit zone key)
    ("right", "", "re_stage", "re_zone"),
    ("left", "_le", "le_stage", "le_zone"),
)
_TREATMENT_TYPE_TO_FORM_H = {
    "Laser": "rop_laser",
    "Anti-VEGF": "rop_anti_vegf",
    "Vitrectomy": "rop_vitrectomy",
}


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


def _form_g_stage(val: Any) -> Optional[str]:
    """Form G stage -> canonical Form G key ("1".."5", "4A", "4B"), or None
    for "None"/blank/unrecognised."""
    if _empty(val):
        return None
    s = str(val).strip().upper()
    return s if s in FORM_G_STAGE_RANK else None


def _form_h_stage(form_g_stage: str) -> str:
    # Form H only has 1-5; 4A/4B are both stage 4.
    return "4" if form_g_stage in ("4A", "4B") else form_g_stage


def _yes_no(val: Any) -> Optional[str]:
    if val is True:
        return "Yes"
    if val is False:
        return "No"
    return None


def _dated_visits(rop: Optional[ROPScreening]) -> list:
    out = []
    for entry in _screenings_list(rop):
        d = parse_screening_date(entry.get("date"))
        if d is not None:
            out.append((d, int(entry.get("screening_no") or 0), entry))
    out.sort(key=lambda t: (t[0], t[1]))
    return out


def derive_form_h_rop_from_form_g(rop: Optional[ROPScreening]) -> dict:
    """Form G (ROP Screening) -> Form H ROP fields (H8, CRF #179-196).

    Only keys with a real value are returned; an absent key means Form G
    has nothing to say about that field.

    Per eye, the worst-disease summary (Form G items 1-16) is the source
    for stage/zone/plus/A-ROP/treatment. When an eye's summary stage is
    blank, stage + zone fall back to the most severe stage recorded across
    the dated screening visits (zone taken from that same visit); plus
    disease is never derived from visits because a visit's plus_status is
    one value for both eyes. A summary stage of "None" means that eye had
    no ROP, and is trusted over visit rows.

    rop_diagnosis_date = date of the first screening visit showing any
    stage in either eye (PI decision 2026-09-25). rop_screened /
    rop_first_screen_date / rop_method come from visits that carry real
    clinical data -- not the empty rows auto-suggested from Helper 5.
    """
    if rop is None:
        return {}
    out: dict = {}
    visits = _dated_visits(rop)
    real_visits = [(d, e) for d, _, e in visits if screening_entry_has_clinical_data(e)]

    if real_visits:
        out["rop_screened"] = "Yes"
        out["rop_first_screen_date"] = real_visits[0][0].isoformat()
        methods = []
        for _, e in real_visits:
            m = str(e.get("method") or "").strip()
            if m and m not in methods:
                methods.append(m)
        if methods:
            out["rop_method"] = ", ".join(methods)

    for d, _, e in visits:
        if _form_g_stage(e.get("re_stage")) or _form_g_stage(e.get("le_stage")):
            out["rop_diagnosis_date"] = d.isoformat()
            break

    affected = []
    explicit_none = []
    for eye, sfx, visit_stage_key, visit_zone_key in _EYES:
        summary_raw = getattr(rop, f"worst_stage{sfx}", None)
        stage = _form_g_stage(summary_raw)
        zone = None
        from_summary = stage is not None
        if from_summary:
            zone = getattr(rop, f"worst_zone{sfx}", None)
        elif not _empty(summary_raw) and str(summary_raw).strip().lower() == "none":
            explicit_none.append(eye)
            continue
        else:
            best_rank = 0
            for _, _, e in visits:
                vs = _form_g_stage(e.get(visit_stage_key))
                if vs and FORM_G_STAGE_RANK[vs] > best_rank:
                    best_rank = FORM_G_STAGE_RANK[vs]
                    stage, zone = vs, e.get(visit_zone_key)
        if stage is None:
            continue

        affected.append(eye)
        out[f"rop_stage_{eye}"] = _form_h_stage(stage)
        if not _empty(zone):
            out[f"rop_zone_{eye}"] = _normalize_zone(zone)
        if not from_summary:
            continue
        for g_attr, h_prefix in (("plus_disease", "rop_plus"), ("a_rop", "rop_arop"),
                                 ("treatment_required", "rop_treatment")):
            yn = _yes_no(getattr(rop, f"{g_attr}{sfx}", None))
            if yn:
                out[f"{h_prefix}_{eye}"] = yn
        if out.get(f"rop_treatment_{eye}") == "Yes":
            types = getattr(rop, f"treatment_type{sfx}", None) or []
            if not isinstance(types, list):
                types = []
            mapped = [_TREATMENT_TYPE_TO_FORM_H[t] for t in types if t in _TREATMENT_TYPE_TO_FORM_H]
            for h_prefix in mapped:
                out[f"{h_prefix}_{eye}"] = True
            if "Combination" in types and not mapped:
                out[f"rop_other_{eye}"] = True
                out[f"rop_other_text_{eye}"] = "Combination"

    if affected:
        out["rop"] = "Yes"
        out["rop_side"] = "Bilateral" if len(affected) == 2 else affected[0].capitalize()
    elif len(explicit_none) == 2:
        out["rop"] = "No"
    return out


def _form_h_values_differ(field_key: str, h_val: Any, derived_val: Any) -> bool:
    """Both sides are already in Form H's vocabulary here."""
    if field_key.startswith("plus_"):
        return _normalize_plus_form_h(h_val) != _normalize_plus_form_h(derived_val)
    return _values_differ(field_key, h_val, derived_val)


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
    derived = derive_form_h_rop_from_form_g(rop)
    if not nm or not derived:
        return []

    visit = latest_screening_visit(_screenings_list(rop))
    form_g_date = visit.get("date") if visit else None
    if isinstance(form_g_date, date):
        form_g_date = form_g_date.isoformat()

    out: list[dict] = []
    for field_key, h_attr, label in COMPARE_FIELDS:
        eye = "right" if "right" in field_key else "left"
        if not _side_active(nm, eye):
            continue
        h_val = getattr(nm, h_attr, None)
        g_val = derived.get(h_attr)
        if _empty(h_val) or _empty(g_val):
            continue
        if not _form_h_values_differ(field_key, h_val, g_val):
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
