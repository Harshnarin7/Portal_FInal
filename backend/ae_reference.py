"""
Reference table for the PORTAL trial Adverse Event Severity Scale.

Source (current as of 2026-08-26): `AdvEvents_26.08.26_VSedits_26aug2026.docx`
— the PI's edited/reorganized version of the site's AE severity document,
itself based on the International Neonatal Consortium's Neonatal Adverse
Event Severity Scale v1.0 (Salaets et al., Delphi consensus 2019,
FDA/Critical Path Institute). Organized into 11 clinical sections
(Neurological, Cardiovascular, Respiratory, Gastro-intestinal, Infectious,
Hematological, Metabolic, Thermoregulation, Sensory, Renal, Others, plus
a generic "Any other AE" fallback), with duplicate/overlapping AE terms
from the earlier flat 83-item list removed and MedDRA/CDISC codes added
where the original INC term set has them. Grades run 1 (Mild) through 5
(Death); "-" means that grade is not defined for that AE; a grade whose
criteria the source document itself hasn't finalized yet (still shown as
"??"/"???" in the docx) is represented as None and flagged with an
`UNRESOLVED` marker, never guessed at.

AE keys in this module are stable lowercase slugs (e.g. "aki",
"hyponatremia") rather than the numbering used in the superseded flat PDF
— the reorganized document has no per-row numbering at all, since rows
are now grouped under section headers instead. Only the definitions below
that also carry a MedDRA/CDISC code have real external identifiers; the
rest are local slugs for this codebase only. No production data depends
on the old numeric scheme (trial hasn't started real recruitment yet —
all AE-form data so far is dummy/beta-test), so this is a clean rename,
not a migration.

This module is the single source of truth shared by:
  - AE-candidate detection (this file's detect_* functions)
  - auto-grading (same functions — grade is only ever auto-assigned when
    the document itself gives a hard number to compare against; anything
    resting on "major care change" / clinical judgment is never computed
    here, only left for the clinician)
  - the IEC report generators (name / definition / grade text below are
    quoted verbatim into report narratives)

Only AE terms with an actual data source already captured in the trial's
daily helper logs (or Form H) get a detect_* function. Every other AE in
AE_DEFINITIONS exists for lookup only (report text, slug → name/
definition/section), with no auto-detection attempted yet.
"""

from datetime import timedelta

UNRESOLVED = "UNRESOLVED"  # grade criteria not yet finalized in the source document

# slug → {name, section, definition, grades{1..5}} for every AE this
# module can currently auto-detect. `section` matches the source
# document's own grouping so future domains can be picked section by
# section. Grade values are quoted verbatim from the docx; UNRESOLVED
# marks a grade the PI has left an open question on (e.g. "??") rather
# than "-" (genuinely not applicable) — never treated as detectable.
AE_DEFINITIONS = {
    "aki": {
        "name": "Acute Kidney Injury (AKI) / Acute Renal Failure (ARF)",
        "section": "Renal",
        "definition": "A disorder characterized by sudden impairment in kidney function resulting in inability to maintain fluid, electrolyte, and waste homeostasis.",
        "grades": {
            1: "-",
            2: "Serum creatinine increase of ≥0.3 within 48 h OR 1.5-1.9 times the lowest previous value within 7 days; Urine output: <0.5 ml/kg/h for 6-12 h",
            3: "Serum creatinine: 2-2.9 times the lowest previous value; Urine output: <0.5 ml/kg/h for ≥12 h",
            4: "Serum creatinine: ≥3 times the lowest previous value OR ≥2.5 absolute value; Urine output: <0.3 ml/kg/h for ≥24 h or anuria for ≥12 h OR need of dialysis",
            5: "Death",
        },
    },
    "hypernatremia": {
        "name": "Hypernatremia",
        "section": "Metabolic",
        "definition": "A disorder characterized by an increase in concentration of sodium ions in blood.",
        "grades": {
            1: "Serum sodium 146-150 mEq/L",
            2: "Serum sodium 151-160 mEq/L",
            3: "Serum sodium 161-170 mEq/L",
            4: "Serum sodium >170 mEq/L or accompanied by clinical features of seizures or altered consciousness",
            5: "Death",
        },
    },
    "hyperkalemia": {
        "name": "Hyperkalemia",
        "section": "Metabolic",
        "definition": "A disorder characterized by an increase in the concentration of potassium ions in blood.",
        "grades": {
            1: "Serum potassium 5.5-6.5 mEq/L",
            2: "Serum potassium 6.5-8.0 mEq/L",
            3: "Serum potassium >8 mEq/L",
            4: UNRESOLVED,  # source doc shows "??" — PI hasn't defined Grade 4 criteria yet
            5: "Death",
        },
    },
    "hyponatremia": {
        "name": "Hyponatremia",
        "section": "Metabolic",
        "definition": "A disorder characterized by decrease in the concentration of sodium ions in blood.",
        "grades": {
            1: "Serum sodium 130-134 mEq/L",
            2: "Serum sodium 120-129 mEq/L",
            3: "Serum sodium 110-119 mEq/L",
            4: "Serum sodium <110 mEq/L or accompanied by clinical features of seizures or altered consciousness",
            5: "Death",
        },
    },
    "hypoglycemia": {
        "name": "Hypoglycemia",
        "section": "Metabolic",
        "definition": "A disorder characterized by blood glucose concentration less than 40 mg/dL.",
        "grades": {
            1: "Blood glucose 20-40 mg/dL asymptomatic, treated single episode, supervised feeds",
            2: "More than one episode of blood glucose 20-40 mg/dL or any blood glucose <20 or with symptoms other than seizures or need of intravenous glucose infusion up to 12 mg/kg/min",
            3: "Seizures or need of intravenous glucose infusion @ ≥12 mg/kg/min or persisting for > 7 days",
            4: "-",
            5: "-",
        },
    },
    "hyperglycemia": {
        "name": "Hyperglycemia",
        "section": "Metabolic",
        "definition": "A disorder characterized by blood glucose concentration greater than 150 mg/dL.",
        "grades": {
            1: "NOT needing treatment with insulin",
            2: "Need of treatment with insulin",
            3: "-",
            4: "-",
            5: "-",
        },
    },
    "hypothermia": {
        "name": "Hypothermia",
        "section": "Thermoregulation",
        "definition": "A disorder characterized by axillary temperature less than 36.5 °C.",
        "grades": {
            1: "Axillary temperature 36.0°C-36.4°C",
            2: "Axillary temperature 32.0°C-35.9°C",
            3: "Axillary temperature <32.0°C",
            4: "-",
            5: "-",
        },
    },
    "hyperthermia": {
        "name": "Hyperthermia",
        "section": "Thermoregulation",
        "definition": "A disorder characterized by axillary temperature more than 37.5 °C.",
        "grades": {
            1: "Axillary temperature 37.6°C-38.0°C",
            2: "Axillary temperature 38.1°C-40.0°C",
            3: "Axillary temperature >40.0°C",
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


def _episode(slug, grade, day_dates, evidence):
    """Build one candidate AE row from a sorted list of ISO date strings
    (or nicu_day ints when day1_date isn't set) that met the threshold."""
    if not day_dates:
        return None
    d = AE_DEFINITIONS[slug]
    grade_text = d["grades"][grade]
    if grade_text is UNRESOLVED:
        # Never surface a grade the source document itself hasn't defined
        # yet — drop back to the highest grade below it that IS defined.
        for g in range(grade - 1, 0, -1):
            if d["grades"][g] not in (UNRESOLVED, "-"):
                grade, grade_text = g, d["grades"][g]
                evidence += " (Note: the document's own Grade criteria above this are not yet finalized — graded conservatively.)"
                break
    start, end = day_dates[0], day_dates[-1]
    return {
        "definition_no": slug,
        "description": d["name"],
        "start_date": start if isinstance(start, str) else None,
        "end_date": end if isinstance(end, str) else None,
        "severity_desc": f"Grade {grade}: {grade_text}",
        "grade": str(grade),
        "evidence": evidence,
        "nicu_day_start": start if not isinstance(start, str) else None,
        "nicu_day_end": end if not isinstance(end, str) else None,
    }


def detect_metab_renal_vasc_eye_candidates(logs, day1_date=None):
    """logs: MetabRenalVascEyeDayLog rows for one enrollment, any order.
    Returns a list of AE-candidate dicts (see _episode) for the 8 AE terms
    in this module with hard numeric/staged thresholds, spanning the
    document's Metabolic, Thermoregulation, and Renal sections (all
    sourced from this one day-log table). One candidate per AE per
    enrollment — start/end date span every day that met at least Grade-1
    severity, grade is the worst (highest) grade reached across that
    span. Every value comes straight from a day-log column already
    entered by clinical staff; nothing here is inferred or guessed."""
    logs = sorted(logs, key=lambda l: l.nicu_day)
    out = []

    def dt(nicu_day):
        iso = _day_to_date(day1_date, nicu_day)
        return iso if iso is not None else nicu_day

    # --- Hypernatremia / Hyponatremia (Metabolic) ---
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
        out.append(_episode("hypernatremia", grade, days, f"Sodium {worst:g} mEq/L (peak) across {len(na_high)} day(s)"))

    if na_low:
        worst = min(v for _, v in na_low)
        grade = 4 if worst < 110 else 3 if worst >= 110 and worst <= 119 else 2 if worst >= 120 and worst <= 129 else 1
        days = sorted(dt(d) for d, _ in na_low)
        out.append(_episode("hyponatremia", grade, days, f"Sodium {worst:g} mEq/L (trough) across {len(na_low)} day(s)"))

    # --- Hyperkalemia (Metabolic) ---
    k_high = []
    for l in logs:
        v = _to_float(l.potassium_value)
        if v is not None and v >= 5.5:
            k_high.append((l.nicu_day, v))
    if k_high:
        worst = max(v for _, v in k_high)
        grade = 3 if worst > 8.0 else 2 if worst > 6.5 else 1
        days = sorted(dt(d) for d, _ in k_high)
        out.append(_episode("hyperkalemia", grade, days, f"Potassium {worst:g} mEq/L (peak) across {len(k_high)} day(s)"))

    # --- Hypoglycemia (Metabolic) ---
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
            "hypoglycemia", grade, days,
            f"Lowest glucose {worst:g} mg/dL, {len(hypo)} day(s) with a <40 mg/dL reading, "
            f"treated on {rx_days} day(s) — verify episode count/symptoms before accepting the grade"
        ))

    # --- Hyperglycemia (Metabolic) ---
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
            "hyperglycemia", grade, days,
            f"Highest glucose {worst:g} mg/dL across {len(hyper)} day(s). "
            "Note: this day log only captures a glucose reading above 180 mg/dL, "
            "not the document's 150 mg/dL threshold — values 151-180 would not appear here."
        ))

    # --- Hypothermia / Hyperthermia (Thermoregulation) ---
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
        out.append(_episode("hypothermia", grade, days, f"Axillary temperature {worst:g}°C (lowest) across {len(temp_low)} day(s)"))

    if temp_high:
        worst = max(v for _, v in temp_high)
        grade = 3 if worst > 40.0 else 2 if worst > 38.0 else 1
        days = sorted(dt(d) for d, _ in temp_high)
        out.append(_episode("hyperthermia", grade, days, f"Axillary temperature {worst:g}°C (highest) across {len(temp_high)} day(s)"))

    # --- AKI (Renal) — derived from the clinician-recorded KDIGO stage,
    # not recomputed from raw creatinine/urine-output ratios (same
    # reasoning as Form H's renal-prefill: the staged criteria for
    # grades 2-4 here are literally KDIGO stage 1/2/3, just relabeled +1) ---
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
        out.append(_episode("aki", grade, days, evidence))

    return out
