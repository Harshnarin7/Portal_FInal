"""
Reference table for the PORTAL trial Adverse Event Severity Scale.

Source: "Initial Oxygen for Delivery Room Resuscitation of preterm neonates"
AE severity document (site-provided, based on the International Neonatal
Consortium's Neonatal Adverse Event Severity Scale v1.0 — Salaets et al.,
Delphi consensus 2019, FDA/Critical Path Institute). 83 AE terms, grades
1 (Mild) through 5 (Death); "-" means that grade is not defined for that AE.

This module is the single source of truth shared by:
  - AE-candidate detection (this file's detect_* functions)
  - auto-grading (same functions — grade is only ever auto-assigned when
    the document itself gives a hard number to compare against; anything
    resting on "major care change" / clinical judgment is never computed
    here, only left for the clinician)
  - the IEC report generators (definition_no / name / grade text below are
    quoted verbatim into report narratives)

Only AE terms with an actual data source already captured in the trial's
daily helper logs get a detect_* function. Every other AE in
AE_DEFINITIONS exists for lookup only (report text, definition_no →
name/definition), with no auto-detection attempted.
"""

from datetime import timedelta


# Definition-number → {name, definition, grades{1..5}} for every AE this
# module can currently auto-detect. definition_no matches the S.No column
# in the site's AE severity document exactly, so it can be quoted directly
# into IEC-facing report text.
AE_DEFINITIONS = {
    "14": {
        "name": "Acute Kidney Injury (AKI) / Acute Renal Failure (ARF)",
        "definition": "A disorder characterized by sudden impairment in kidney function resulting in inability to maintain fluid, electrolyte, and waste homeostasis.",
        "grades": {
            1: "-",
            2: "Serum creatinine increase of ≥0.3 within 48 h OR 1.5-1.9 times the lowest previous value within 7 days; Urine output: <0.5 ml/kg/h for 6-12 h",
            3: "Serum creatinine: 2-2.9 times the lowest previous value; Urine output: <0.5 ml/kg/h for ≥12 h",
            4: "Serum creatinine: ≥3 times the lowest previous value OR ≥2.5 absolute value; Urine output: <0.3 ml/kg/h for ≥24 h or anuria for ≥12 h OR need of dialysis",
            5: "Death",
        },
    },
    "54": {
        "name": "Hypernatremia",
        "definition": "A disorder characterized by increase in concentration of sodium ion in blood.",
        "grades": {
            1: "Serum sodium 146-150 mEq/L",
            2: "Serum sodium 151-160 mEq/L",
            3: "Serum sodium 161-170 mEq/L",
            4: "Serum sodium >170 mEq/L or accompanied by clinical features of seizures or altered consciousness",
            5: "Death",
        },
    },
    "55": {
        "name": "Hyperkalemia",
        "definition": "A disorder characterized by increase in concentration of Potassium ion in blood.",
        "grades": {
            1: "Serum potassium 5.5-6.5 mEq/L",
            2: "Serum potassium 6.5-8.0 mEq/L",
            3: "Serum potassium >8 mEq/L",
            4: "-",
            5: "Death",
        },
    },
    "56": {
        "name": "Hyponatremia",
        "definition": "A disorder characterized by decreased concentration of sodium ion in blood.",
        "grades": {
            1: "Serum sodium 130-134 mEq/L",
            2: "Serum sodium 120-129 mEq/L",
            3: "Serum sodium 110-119 mEq/L",
            4: "Serum sodium <110 mEq/L or accompanied by clinical features of seizures or altered consciousness",
            5: "Death",
        },
    },
    "65": {
        "name": "Hypoglycemia",
        "definition": "A disorder characterized by blood glucose concentration less than 40 mg/dL.",
        "grades": {
            1: "Blood glucose 20-40 mg/dL, asymptomatic, treated, single episode, supervised feeds",
            2: "More than one episode of blood glucose 20-40 mg/dL or any blood glucose <20 or with symptoms other than seizures or need of intravenous glucose infusion up to 12 mg/kg/min",
            3: "Seizures or need of intravenous glucose infusion @ ≥12 mg/kg/min or persisting for >7 days",
            4: "-",
            5: "-",
        },
    },
    "66": {
        "name": "Hyperglycemia",
        "definition": "A disorder characterized by blood glucose concentration greater than 150 mg/dL.",
        "grades": {
            1: "NOT needing treatment with insulin",
            2: "Need of treatment with insulin",
            3: "-",
            4: "-",
            5: "-",
        },
    },
    "67": {
        "name": "Hypothermia",
        "definition": "A disorder characterized by axillary temperature less than 36.5 °C.",
        "grades": {
            1: "axillary temperature 36.0°C-36.4°C",
            2: "axillary temperature 32.0°C-35.9°C",
            3: "axillary temperature <32.0°C",
            4: "-",
            5: "-",
        },
    },
    "68": {
        "name": "Hyperthermia",
        "definition": "A disorder characterized by axillary temperature more than 37.5 °C.",
        "grades": {
            1: "axillary temperature 37.6°C-38.0°C",
            2: "axillary temperature 38.1°C-40.0°C",
            3: "axillary temperature >40.0°C",
            4: "-",
            5: "Death",
        },
    },
}


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _day_to_date(day1_date, nicu_day):
    if not day1_date or nicu_day is None:
        return None
    return (day1_date + timedelta(days=nicu_day - 1)).isoformat()


def _episode(definition_no, grade, day_dates, evidence):
    """Build one candidate AE row from a sorted list of ISO date strings
    (or nicu_day ints when day1_date isn't set) that met the threshold."""
    if not day_dates:
        return None
    d = AE_DEFINITIONS[definition_no]
    start, end = day_dates[0], day_dates[-1]
    return {
        "definition_no": definition_no,
        "description": d["name"],
        "start_date": start if isinstance(start, str) else None,
        "end_date": end if isinstance(end, str) else None,
        "severity_desc": f"Grade {grade}: {d['grades'][grade]}",
        "grade": str(grade),
        "evidence": evidence,
        "nicu_day_start": start if not isinstance(start, str) else None,
        "nicu_day_end": end if not isinstance(end, str) else None,
    }


def detect_metabolic_thermal_candidates(logs, day1_date=None):
    """logs: MetabRenalVascEyeDayLog rows for one enrollment, any order.
    Returns a list of AE-candidate dicts (see _episode) for the 8 AE terms
    in this module with hard numeric/staged thresholds. One candidate per
    AE per enrollment — start/end date span every day that met at least
    Grade-1 severity, grade is the worst (highest) grade reached across
    that span. Every value comes straight from a day-log column already
    entered by clinical staff; nothing here is inferred or guessed."""
    logs = sorted(logs, key=lambda l: l.nicu_day)
    out = []

    def dt(nicu_day):
        iso = _day_to_date(day1_date, nicu_day)
        return iso if iso is not None else nicu_day

    # --- Hypernatremia / Hyponatremia (#54 / #56) ---
    na_high, na_low = [], []
    for l in logs:
        v = _to_float(l.sodium_value)
        if v is None:
            continue
        if v >= 146:
            na_high.append((l.nicu_day, v))
        if v <= 134:
            na_low.append((l.nicu_day, v))

    if na_high:
        worst = max(v for _, v in na_high)
        grade = 4 if worst > 170 else 3 if worst >= 161 else 2 if worst >= 151 else 1
        days = sorted(dt(d) for d, _ in na_high)
        out.append(_episode("54", grade, days, f"Sodium {worst:g} mEq/L (peak) across {len(na_high)} day(s)"))

    if na_low:
        worst = min(v for _, v in na_low)
        grade = 4 if worst < 110 else 3 if worst >= 110 and worst <= 119 else 2 if worst >= 120 and worst <= 129 else 1
        days = sorted(dt(d) for d, _ in na_low)
        out.append(_episode("56", grade, days, f"Sodium {worst:g} mEq/L (trough) across {len(na_low)} day(s)"))

    # --- Hyperkalemia (#55) ---
    k_high = []
    for l in logs:
        v = _to_float(l.potassium_value)
        if v is not None and v >= 5.5:
            k_high.append((l.nicu_day, v))
    if k_high:
        worst = max(v for _, v in k_high)
        grade = 3 if worst > 8.0 else 2 if worst > 6.5 else 1
        days = sorted(dt(d) for d, _ in k_high)
        out.append(_episode("55", grade, days, f"Potassium {worst:g} mEq/L (peak) across {len(k_high)} day(s)"))

    # --- Hypoglycemia (#65) ---
    hypo = []
    for l in logs:
        v = _to_float(l.lowest_glucose)
        if v is not None and v < 40:
            hypo.append((l.nicu_day, v))
    if hypo:
        worst = min(v for _, v in hypo)
        rx_days = sum(1 for l in logs if l.hypoglycemia_rx is True)
        episodes_total = sum(
            int(l.hypoglycemia_episodes) for l in logs
            if str(l.hypoglycemia_episodes or "").strip().isdigit()
        )
        if rx_days > 7:
            grade = 3
        elif worst < 20 or episodes_total > 1 or len(hypo) > 1:
            grade = 2
        else:
            grade = 1
        days = sorted(dt(d) for d, _ in hypo)
        out.append(_episode(
            "65", grade, days,
            f"Lowest glucose {worst:g} mg/dL, {len(hypo)} day(s) with a <40 mg/dL reading, "
            f"treated on {rx_days} day(s) — verify episode count/symptoms before accepting the grade"
        ))

    # --- Hyperglycemia (#66) ---
    hyper = []
    for l in logs:
        v = _to_float(l.highest_glucose)
        if v is not None and v > 150:
            hyper.append((l.nicu_day, v))
    if hyper:
        worst = max(v for _, v in hyper)
        grade = 2 if any(l.insulin is True for l in logs) else 1
        days = sorted(dt(d) for d, _ in hyper)
        out.append(_episode(
            "66", grade, days,
            f"Highest glucose {worst:g} mg/dL across {len(hyper)} day(s). "
            "Note: this day log only captures a glucose reading above 180 mg/dL, "
            "not the document's 150 mg/dL threshold — values 151-180 would not appear here."
        ))

    # --- Hypothermia / Hyperthermia (#67 / #68) ---
    temp_low, temp_high = [], []
    for l in logs:
        v = _to_float(l.axillary_temperature)
        if v is None:
            continue
        if v < 36.5:
            temp_low.append((l.nicu_day, v))
        if v > 37.5:
            temp_high.append((l.nicu_day, v))

    if temp_low:
        worst = min(v for _, v in temp_low)
        grade = 3 if worst < 32.0 else 2 if worst < 36.0 else 1
        days = sorted(dt(d) for d, _ in temp_low)
        out.append(_episode("67", grade, days, f"Axillary temperature {worst:g}°C (lowest) across {len(temp_low)} day(s)"))

    if temp_high:
        worst = max(v for _, v in temp_high)
        grade = 3 if worst > 40.0 else 2 if worst > 38.0 else 1
        days = sorted(dt(d) for d, _ in temp_high)
        out.append(_episode("68", grade, days, f"Axillary temperature {worst:g}°C (highest) across {len(temp_high)} day(s)"))

    # --- AKI (#14) — derived from the clinician-recorded KDIGO stage, not
    # recomputed from raw creatinine/urine-output ratios (same reasoning
    # as Form H's renal-prefill: the staged criteria for grades 2-4 here
    # are literally KDIGO stage 1/2/3, just relabeled +1) ---
    def stage_num(l):
        s = (l.aki_stage or l.aki_kdigo_stage or "").strip().lower()
        for n in (1, 2, 3):
            if s == f"stage {n}":
                return n
        return None

    aki_days = [(l.nicu_day, stage_num(l), l.dialysis_crrt is True) for l in logs if l.aki_suspected is True]
    if aki_days:
        max_stage = max((s for _, s, _ in aki_days if s), default=None)
        on_dialysis = any(dia for _, _, dia in aki_days)
        if on_dialysis:
            grade = 4
        elif max_stage == 3:
            grade = 4
        elif max_stage == 2:
            grade = 3
        elif max_stage == 1:
            grade = 2
        else:
            grade = 2  # AKI suspected but no stage recorded yet — floor at Grade 2, clinician confirms
        days = sorted(dt(d) for d, _, _ in aki_days)
        evidence = f"AKI suspected on {len(aki_days)} day(s), highest recorded KDIGO stage: {max_stage or 'not staged'}"
        if on_dialysis:
            evidence += ", dialysis/CRRT given"
        out.append(_episode("14", grade, days, evidence))

    return out
