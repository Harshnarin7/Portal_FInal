"""BPD suggestion for Form H H2.1 (#35-37) — Jensen 2019 at 36+0 weeks PMA.

Pure decision logic (no DB), so it can be tested on its own. The endpoint in
main.py gathers the data and passes a `get_day(nicu_day)` callable that
returns Helper 2's (DMS-overlaid) respiratory answers for a NICU day.

Design agreed with the PI 2026-09-27:
- Assessment day = DOB + (252 - GA-at-birth days) = 36+0 weeks PMA.
- Jensen grade by support that day: room air -> No BPD; NC <= 2 L/min ->
  Grade 1; NC > 2 L/min / HFNC / CPAP / NIPPV -> Grade 2; intubated or
  SIMV / A-C / PSV / HFOV -> Grade 3.
- Died before 36+0 -> no suggestion (death is the composite outcome).
- Still in the NICU at 36+0 -> Helper 2 for that day, +/-1 day if missing.
- Left before 36+0 (Discharged / Discharged home on request / Left Against
  Medical Advice) -> Form J 36-week visit if recorded, else status at leaving
  (Helper 2 on the discharge day or the last logged day before it): room air
  -> No BPD, on support -> graded by that support.
- Back referred before 36+0 -> Form J 36-week visit only (status at transfer
  is not final).
- Supplemental O2 with no support mode -> flag for the clinician, no grade.
- Nasal cannula with no flow recorded -> BPD Yes, grade left to the clinician.
Always a suggestion: the clinician applies it in Form H.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Callable, Optional

SUPPORT_OPTION = {  # Form H bpd_support_36w option strings
    "1": "NC ≤ 2L",
    "2": "NC > 2L / CPAP / NIPPV",
    "3": "Invasive mechanical ventilation",
}
INVASIVE_MODES = {"SIMV", "AC", "A/C", "PSV", "HFOV"}
NON_INVASIVE_GR2 = {"CPAP", "NIPPV", "HFNC"}
LEFT_HOME = {"Discharged", "Discharged home on request", "Left Against Medical Advice"}
BACK_REFERRED = "Back referred"


def _result(status, *, bpd=None, grade=None, source="", note="", assess_date=None, assess_day=None):
    return {
        "status": status,              # suggested | flag | pending | not_applicable
        "bpd": bpd,                    # "Yes" | "No" | None
        "bpd_support_36w": SUPPORT_OPTION.get(grade) if bpd == "Yes" and grade else None,
        "bpd_grade": grade if bpd == "Yes" else None,
        "source": source,
        "note": note,
        "assessment_date": assess_date.isoformat() if assess_date else None,
        "assessment_day": assess_day,
    }


def grade_from_helper_day(day: dict) -> dict:
    """Jensen grading from one Helper 2 day. Returns
    {kind: room_air|graded|nc_no_flow|o2_no_mode|support_no_mode|unknown, grade, detail}."""
    modes = {m.strip() for m in (day.get("support_modes") or "").split(",") if m.strip()}
    if day.get("endotracheal_intubation") is True or modes & INVASIVE_MODES:
        shown = ", ".join(sorted(modes & INVASIVE_MODES)) or "intubated"
        return {"kind": "graded", "grade": "3", "detail": f"invasive ventilation ({shown})"}
    if modes & NON_INVASIVE_GR2:
        return {"kind": "graded", "grade": "2", "detail": ", ".join(sorted(modes & NON_INVASIVE_GR2))}
    if "NC" in modes:
        flow = day.get("max_flow")
        try:
            flow = float(flow) if flow not in (None, "") else None
        except (TypeError, ValueError):
            flow = None
        if flow is None:
            return {"kind": "nc_no_flow", "grade": None, "detail": "NC, flow not recorded"}
        return {"kind": "graded", "grade": "1" if flow <= 2 else "2", "detail": f"NC {flow:g} L/min"}
    if day.get("respiratory_support") is True:
        return {"kind": "support_no_mode", "grade": None, "detail": "respiratory support Yes but no mode selected"}
    if day.get("supp_o2") is True:
        return {"kind": "o2_no_mode", "grade": None, "detail": "supplemental O₂ with no support mode"}
    if day.get("respiratory_support") is False:
        return {"kind": "room_air", "grade": None, "detail": "room air"}
    return {"kind": "unknown", "grade": None, "detail": "respiratory status not recorded"}


def grade_from_form_j(j: dict) -> dict:
    """Jensen grading from Form J's 36-week visit (resp_support / resp_mode / flow_rate)."""
    if j.get("resp_support") is False:
        return {"kind": "room_air", "grade": None, "detail": "no respiratory support"}
    mode, flow = j.get("resp_mode"), j.get("flow_rate")
    if mode == "imv":
        return {"kind": "graded", "grade": "3", "detail": "IMV (invasive)"}
    if mode == "cpap_nippv":
        return {"kind": "graded", "grade": "2", "detail": "CPAP/NIPPV"}
    if mode == "nasal_cannula":
        if flow is None:
            return {"kind": "nc_no_flow", "grade": None, "detail": "nasal cannula, flow not recorded"}
        return {"kind": "graded", "grade": "1" if float(flow) <= 2 else "2", "detail": f"nasal cannula {float(flow):g} L/min"}
    return {"kind": "support_no_mode", "grade": None, "detail": "respiratory support Yes but no mode recorded"}


def _from_grading(g, source, assess_date, assess_day):
    kind = g["kind"]
    if kind == "room_air":
        return _result("suggested", bpd="No", source=source, note=f"{g['detail']} → No BPD",
                       assess_date=assess_date, assess_day=assess_day)
    if kind == "graded":
        return _result("suggested", bpd="Yes", grade=g["grade"], source=source,
                       note=f"{g['detail']} → Jensen Grade {g['grade']}",
                       assess_date=assess_date, assess_day=assess_day)
    if kind == "nc_no_flow":
        return _result("suggested", bpd="Yes", source=source,
                       note=f"{g['detail']} → BPD, but Grade 1 vs 2 depends on flow: please choose the grade",
                       assess_date=assess_date, assess_day=assess_day)
    if kind in ("o2_no_mode", "support_no_mode"):
        return _result("flag", source=source, note=f"{g['detail']}: please decide BPD and grade",
                       assess_date=assess_date, assess_day=assess_day)
    return _result("pending", source=source, note=g["detail"], assess_date=assess_date, assess_day=assess_day)


def suggest_bpd(
    *,
    dob: Optional[date],
    ga_weeks: Optional[int],
    ga_days: Optional[int],
    today: date,
    death_date: Optional[date],
    outcome: Optional[str],
    discharge_date: Optional[date],
    form_j36: Optional[dict],
    get_day: Callable[[int], Optional[dict]],
) -> dict:
    if not dob or ga_weeks is None:
        return _result("pending", note="Date of birth or gestation at birth (Form B) not recorded")
    ga_total = int(ga_weeks) * 7 + int(ga_days or 0)
    if ga_total >= 252:
        return _result("not_applicable", note="Born at or after 36 weeks — BPD not assessed")
    d36 = dob + timedelta(days=252 - ga_total)
    day36 = (d36 - dob).days + 1

    def day_no(d):
        return (d - dob).days + 1

    if death_date and death_date < d36:
        return _result("not_applicable", note=f"Died before 36 weeks PMA (Day {day_no(death_date)}) — counts as death in the composite; no BPD grading",
                       assess_date=d36, assess_day=day36)

    left_early = bool(discharge_date and discharge_date < d36 and outcome in (LEFT_HOME | {BACK_REFERRED}))
    if left_early:
        j_ok = form_j36 and form_j36.get("resp_support") is not None
        if j_ok:
            return _from_grading(grade_from_form_j(form_j36), "Form J 36-week visit", d36, day36)
        if outcome == BACK_REFERRED:
            return _result("pending", note=f"Back referred on {discharge_date.isoformat()} (Day {day_no(discharge_date)}): waiting for Form J's 36-week visit",
                           assess_date=d36, assess_day=day36)
        leave_day = day_no(discharge_date)
        for n in range(leave_day, 0, -1):
            day = get_day(n)
            if day is not None:
                g = grade_from_helper_day(day)
                if g["kind"] == "unknown":
                    continue
                return _from_grading(g, f"status at leaving ({outcome}, Helper 2 Day {n})", d36, day36)
        return _result("pending", note=f"{outcome} on Day {leave_day}: no Helper 2 respiratory status recorded before leaving, and no Form J 36-week visit",
                       assess_date=d36, assess_day=day36)

    if today < d36:
        return _result("pending", note=f"36+0 weeks PMA is {d36.isoformat()} (NICU Day {day36})",
                       assess_date=d36, assess_day=day36)

    for n, label in ((day36, ""), (day36 - 1, " (36+0 day not logged; used the day before)"), (day36 + 1, " (36+0 day not logged; used the day after)")):
        day = get_day(n)
        if day is None:
            continue
        g = grade_from_helper_day(day)
        if g["kind"] == "unknown":
            continue
        return _from_grading(g, f"Helper 2 Day {n}{label}", d36, day36)
    return _result("pending", note=f"Helper 2 Day {day36} (36+0 weeks PMA) not logged yet",
                   assess_date=d36, assess_day=day36)
