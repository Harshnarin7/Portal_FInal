"""Server-side "complete" rules for the sidebar green tick of Forms F-L,
AE, SAE list and Helpers 2-5 (PI decisions 2026-09-26/29).

Same rules as frontend-app/src/utils/formCompletion.js, applied to the saved
records so a tick survives a page reload or switching babies (before this,
only Forms A-E came from the server and every other tick was session-only).
Keep the two files in step.

Pure (no DB): /enrollment-status loads the rows and passes them in.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable, Optional

NICU_DAY_GRACE_HOUR = 8  # same as frontend utils/datetime.js


def answered(v) -> bool:
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    if isinstance(v, (list, tuple, dict)):
        return len(v) > 0
    return True  # booleans (incl. False) and numbers count as answered


def signed_off(completed_by, completion_date) -> bool:
    return answered(completed_by) and answered(completion_date)


# ---------------------------------------------------------------- Forms F-L

def form_f_complete(r) -> bool:
    """Cranial USG: >=1 dated scan; PHVD + VP shunt answered (with dates when
    Yes); signed off. (The Helper 2 IVH/cPVL gate only blocks when there is
    no scan, which the first rule already covers.)"""
    if r is None:
        return False
    if not any(answered((s or {}).get("scanDate")) for s in (r.scan_entries or [])):
        return False
    if not answered(r.phvd) or not answered(r.vp_shunt):
        return False
    if r.phvd is True and not answered(r.phvd_diagnosis_date):
        return False
    if r.vp_shunt is True and not answered(r.vp_shunt_insertion_date):
        return False
    return signed_off(r.completed_by, r.completion_date)


ROP_VISIT_DETAIL_FIELDS = ("method", "re_stage", "re_zone", "le_stage", "le_zone", "plus_status")


def form_g_complete(r, review_alerts) -> bool:
    """ROP: >=1 real visit; no auto-suggested visit awaiting review; outcome
    (+ text when Other); item 18 composite; final screening date; signed off."""
    if r is None:
        return False
    real = any(
        answered((s or {}).get("date"))
        and (answered((s or {}).get("signature")) or any(answered((s or {}).get(f)) for f in ROP_VISIT_DETAIL_FIELDS))
        for s in (r.screenings or [])
    )
    if not real or review_alerts:
        return False
    if not answered(r.outcome):
        return False
    if r.outcome == "Other" and not answered(r.outcome_other_text):
        return False
    if not answered(r.rop_treatment_composite) or not answered(r.final_screening_date):
        return False
    return signed_off(r.completed_by, r.completion_date)


def form_h_complete(r, infection_signatures: Iterable[str]) -> bool:
    """Morbidities: outcome + discharge date; every detected infection window
    reviewed; signed off; and the page's own check (no validation error
    showing), which the page saves as is_complete - an explicit False blocks."""
    if r is None:
        return False
    if getattr(r, "is_complete", None) is False:
        return False
    reviewed = set(r.infection_flags_reviewed or [])
    if any(sig not in reviewed for sig in infection_signatures):
        return False
    if not answered(r.outcome) or not answered(r.discharge_date):
        return False
    return signed_off(r.completed_by, r.completion_date)


FORM_I_REQUIRED = ("ventilation_required", "switched_100_o2", "resus_chest_compressions",
                   "intubation_during_resus", "resp_support_72h", "sepsis_eos", "sepsis_los")


def form_i_complete(r) -> bool:
    if r is None:
        return False
    if not all(answered(getattr(r, k, None)) for k in FORM_I_REQUIRED):
        return False
    return signed_off(r.completed_by, r.completion_date)


def form_j_complete(rows) -> bool:
    return any(signed_off(r.completed_by, r.completion_date) for r in (rows or []))


def form_k_complete(r) -> bool:
    if r is None or r.selected_for_mri is None:
        return False
    if r.selected_for_mri is True and (not answered(r.mri_date) or not answered(r.overall_mri)):
        return False
    return signed_off(r.completed_by, r.completion_date)


FORM_L_REQUIRED = ("initial_fio2", "exit_fio2", "max_fio2_first_hour",
                   "composite_outcome_1", "composite_outcome_2", "mri_abnormality")


def form_l_complete(r) -> bool:
    if r is None:
        return False
    if not all(answered(getattr(r, k, None)) for k in FORM_L_REQUIRED):
        return False
    return signed_off(r.completed_by, r.completion_date)


def adverse_events_complete(r) -> bool:
    if r is None or not answered(r.has_adverse_event):
        return False
    if r.has_adverse_event is True or r.has_adverse_event == "Yes":
        events = [e for e in (r.events or []) if any(answered(v) for v in (e or {}).values())]
        if not events:
            return False
        if not all(answered(e.get("description")) and answered(e.get("start_date"))
                   and answered(e.get("grade")) and answered(e.get("converted_to_sae")) for e in events):
            return False
    return signed_off(r.completed_by, r.completion_date)


def sae_list_complete(r) -> bool:
    if r is None:
        return False
    rows = [x for x in (r.rows or []) if any(answered(v) for v in (x or {}).values())]
    if not all(answered(x.get("sae")) and answered(x.get("start_date")) and answered(x.get("notification_24h"))
               for x in rows):
        return False
    return signed_off(r.completed_by, r.completion_date)


# ------------------------------------------------------------------ Helpers

def nicu_day_today(dob: Optional[date], now: datetime) -> Optional[int]:
    """NICU working day (Day 1 = date of birth; before 08:00 counts as the
    previous day), same as frontend nicuDayNumberFromDay1."""
    if not dob:
        return None
    ref = now.date() - timedelta(days=1) if now.hour < NICU_DAY_GRACE_HOUR else now.date()
    return max(1, (ref - dob).days + 1)


def helper_last_required_day(today_nicu_day: Optional[int], discharge_day: Optional[int] = None,
                             max_day: Optional[int] = None) -> Optional[int]:
    """Every day up to yesterday (Day 1 required even on Day 1), stopping at
    the discharge day; max_day caps fixed-length logs (FiO2 AUC = 7)."""
    last = None
    if today_nicu_day is not None:
        last = max(1, today_nicu_day - 1)
    if discharge_day is not None:
        last = discharge_day if last is None else min(last, discharge_day)
    if last is not None and max_day is not None:
        last = min(last, max_day)
    return last


def helper_log_complete(pct_for_day, last_day: Optional[int]) -> bool:
    """pct_for_day(day) -> completion % (or None when the day has no log).
    Stops at the first day under 100% so long stays stay cheap."""
    if not last_day or last_day < 1:
        return False
    for d in range(1, last_day + 1):
        if (pct_for_day(d) or 0) < 100:
            return False
    return True


def _window_hours(entries) -> float:
    """Hours with a real FiO2 value (a blank row's pre-filled 12 h doesn't count)."""
    total = 0.0
    for e in entries or []:
        if not answered(str(e.get("fio2") if e.get("fio2") is not None else "")):
            continue
        try:
            total += float(e.get("dur") or 0)
        except (TypeError, ValueError):
            pass
    return total


def fio2_day_hours(fio2_logs, day: int) -> tuple[float, float]:
    logs = [l for l in (fio2_logs or []) if isinstance(l, dict) and l.get("day") == day]
    w1 = next((l for l in logs if str(l.get("block") or "").startswith("0")), None)
    w2 = next((l for l in logs if str(l.get("block") or "").startswith("12")), None)
    return (_window_hours((w1 or {}).get("entries")), _window_hours((w2 or {}).get("entries")))


def fio2_auc_complete(fio2_logs, helper2_supp_o2: dict, last_day: Optional[int]) -> bool:
    """PI 2026-09-29: days 1..min(7, yesterday) that Helper 2 marks
    Supplemental O2 = Yes (or that already have FiO2 values) must each have
    both 12 h windows filled with real FiO2 values; room-air days are not
    required. A day with no Helper 2 log and no FiO2 data is unknown -> not
    complete. A baby on room air throughout (every day logged) ticks."""
    if not last_day or last_day < 1:
        return False
    for d in range(1, last_day + 1):
        h1, h2 = fio2_day_hours(fio2_logs, d)
        has_fio2 = (h1 + h2) > 0
        # Supplemental O2 unanswered (or no Helper 2 log) = unknown, not room air.
        if helper2_supp_o2.get(d) not in (True, False) and not has_fio2:
            return False
        if helper2_supp_o2.get(d) is True or has_fio2:
            if h1 < 11.99 or h2 < 11.99:
                return False
    return True
