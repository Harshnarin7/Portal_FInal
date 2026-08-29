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

import json
from datetime import datetime, timedelta

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
    # --- Domain 2: major morbidities already adjudicated in Form H
    # (NeonatalMorbidities). Grade text quoted verbatim from the
    # reorganized document's Neurological / Gastro-intestinal /
    # Respiratory / Sensory / Cardiovascular sections. ---
    "ivh": {
        "name": "Neonatal Intraventricular Hemorrhage (IVH)",
        "section": "Neurological",
        "definition": "Bleeding into the lateral cerebral ventricles in a newborn infant. (MedDRA 10022844; CDISC C154937)",
        "grades": {
            1: "Asymptomatic hemorrhage confined to the germinal matrix; minimal hemorrhage within the ventricle (<10%) on parasagittal view",
            2: "Moderate hemorrhage occupying ≤50% of ventricle volume (<50%) without ventricular dilatation > 4 mm above the 97th percentile",
            3: "Hemorrhage occupying >50% of the ventricle volume; ventricular dilatation > 4 mm above the 97th percentile; parenchymal venous infarction; requiring temporizing neurosurgical procedure (drain, shunt, or reservoir)",
            4: "Hemorrhage with parenchymal venous infarction; resulting in life-threatening consequences (e.g. refractory seizures, hypotension, respiratory depression); requiring urgent stabilization or surgical decompression",
            5: "Death",
        },
    },
    "pvl": {
        "name": "Periventricular Leukomalacia (PVL)",
        "section": "Neurological",
        "definition": "A form of cerebral white matter injury usually seen in preterm infants, characterized by necrotic degeneration or gliosis of white matter adjacent to the cerebral ventricles that may evolve into focal cysts. (MedDRA 10052594; CDISC C154923)",
        "grades": {
            1: "Transient periventricular echo densities persisting > 7 days and resolving completely",
            2: "Transient periventricular echo densities evolving into small localized fronto-parietal cysts or persistent diffuse echo densities",
            3: "Periventricular echo densities evolving into extensive cystic periventricular lesions; or densities extending into the deep white matter",
            4: "-",
            5: "-",
        },
    },
    "nec": {
        "name": "Necrotizing Enterocolitis (NEC)",
        "section": "Gastro-intestinal",
        "definition": "A disease of neonates in which there is extensive mucosal ulceration, pseudomembrane formation, submucosal hemorrhage, and necrosis. (MedDRA 10052818; CDISC C154922)",
        "grades": {
            1: "-",
            2: "-",
            3: "NEC confirmed; major care change indicated (e.g. NPO, antibiotics, non-urgent surgery)",
            4: "Bowel perforation (pneumoperitoneum) (Bell IIIB); shock, DIC, combined respiratory and metabolic acidosis (Bell IIIA); urgent major care change indicated",
            5: "Death",
        },
    },
    "bpd": {
        "name": "Bronchopulmonary Dysplasia (BPD)",
        "section": "Respiratory",
        "definition": "A chronic lung disorder associated with pulmonary maldevelopment, scarring, and/or inflammation that develops in preterm neonates; defined based on treatment with supplemental oxygen for at least 28 days adjusted for the degree of prematurity. (MedDRA 10006475; CDISC C154919)",
        "grades": {
            1: "Supplemental oxygen at 28 days AND breathing room air at 36 weeks PMA (infants <32 weeks) / by 56 days postnatal age (infants >32 weeks) / at discharge",
            2: "Supplemental oxygen at 28 days AND need for 22-30% oxygen or positive pressure at 36 weeks PMA (infants <32 weeks) / by 56 days (infants >32 weeks) / at discharge",
            3: "Supplemental oxygen at 28 days AND need for >30% oxygen and/or positive pressure at 36 weeks PMA (infants <32 weeks) / by 56 days (infants >32 weeks) / at discharge",
            4: "Supplemental oxygen at 28 days AND need for >30% oxygen AND positive pressure at 36 weeks PMA (infants <32 weeks) / by 56 days (infants >32 weeks) / at discharge",
            5: "Death",
        },
    },
    "rop": {
        "name": "Retinopathy of Prematurity (ROP)",
        "section": "Sensory",
        "definition": "A retinal condition of very immature infants that may be characterized by a non-vascularized retina that may lead to neovascularization, scarring, retinal detachment, and blindness. (MedDRA 10038933; CDISC C154925)",
        "grades": {
            1: "Zone 2 ICROP stage 2 with or without plus disease; zone 3 any ICROP stage; no care changes indicated",
            2: "Type 2 pre-threshold ROP (zone 1 ICROP stage 1 or 2 without plus disease; zone 2 ICROP stage 3 without plus disease); requiring more frequent ophthalmic monitoring",
            3: "Type 1 pre-threshold ROP (zone 1 any stage with plus disease; zone 1 ICROP stage 3 without plus disease; zone 2 ICROP stage 2 or 3 with plus disease); threshold ROP; requiring major care changes (e.g. laser intervention, intravitreal anti-VEGF or operative management)",
            4: "Unilateral retinal detachment",
            5: "Blindness (bilateral retinal detachment)",
        },
    },
    "pda": {
        "name": "Patent Ductus Arteriosus (PDA)",
        "section": "Cardiovascular",
        "definition": "A disorder characterized by persistence of the ductus arteriosus (the fetal vascular connection between the pulmonary artery and the aorta) after birth.",
        "grades": {
            1: "PDA NOT needing treatment or resulting in prolongation of respiratory support/hospital stay",
            2: "PDA needing medical treatment but NOT cardiac failure",
            3: "PDA needing surgical treatment or resulting in cardiac failure",
            4: "-",
            5: "Death",
        },
    },
    # --- Domain 3: infection episodes (Form H's dynamic `infections`
    # array, with the Infect/GI/Hema day-log trigger windows as a
    # fallback). Grade text verbatim from the document's Infectious and
    # Neurological sections. ---
    "sepsis_culture_positive": {
        "name": "Neonatal Culture Positive Sepsis",
        "section": "Infectious",
        "definition": "A systemic inflammatory response to an infection. (MedDRA 10082058; CDISC C154927)",
        "grades": {
            1: "Blood culture positive; no care change indicated (e.g. contamination suspected)",
            2: "Blood culture positive with mild or ambiguous signs",
            3: "Blood culture positive with severe signs; support treatment escalated or initiated; care change required",
            4: "Life-threatening consequences (e.g. state of shock, DIC); urgent major care change required",
            5: "Death",
        },
    },
    "sepsis_culture_negative": {
        "name": "Neonatal Culture Negative Sepsis",
        "section": "Infectious",
        "definition": "A systemic inflammatory response without identifiable cause. (MedDRA 10082059; CDISC C154928)",
        "grades": {
            1: "-",
            2: "Suspected sepsis with mild or ambiguous signs",
            3: "Suspected sepsis with severe signs (e.g. fever, grunting); support treatment escalated or initiated; care change required",
            4: "Life-threatening consequences (e.g. state of shock, DIC); urgent major care change required",
            5: "Death",
        },
    },
    "meningitis": {
        "name": "Meningitis / Encephalitis",
        "section": "Neurological",
        "definition": "A disorder characterized by inflammation of the meninges and/or brain matter caused by an infective agent.",
        "grades": {
            1: "-",
            2: "-",
            3: "Meningitis/encephalitis without shock or end-organ failure requiring antibiotic therapy, causing prolongation of hospital stay or increased risk of adverse neurological outcome",
            4: "Accompanied by shock or end-organ failure. Life-threatening consequences; urgent surgical intervention indicated",
            5: "Death",
        },
    },
    # --- Domain 4: haematologic / bilirubin, graded off the treatment
    # recorded in Form H's Haematology section (or the Infect/GI/Hema
    # day-log treatment booleans as a fallback). Grade text verbatim from
    # the document's Metabolic and Hematological sections. ---
    "hyperbilirubinemia": {
        "name": "Hyperbilirubinemia",
        "section": "Metabolic",
        "definition": "A disorder characterized by an increase in indirect bilirubin levels in blood.",
        "grades": {
            1: "Hyperbilirubinemia without need of therapy",
            2: "Hyperbilirubinemia needing treatment with phototherapy",
            3: "Hyperbilirubinemia needing treatment with blood exchange transfusion",
            4: "Hyperbilirubinemia with acute bilirubin encephalopathy",
            5: "Death",
        },
    },
    "anemia": {
        "name": "Anemia",
        "section": "Hematological",
        "definition": "A disorder characterized by a decrease in haemoglobin concentration in blood.",
        "grades": {
            1: "Asymptomatic anemia NOT needing blood transfusion",
            2: "-",
            3: "Anemia needing blood or exchange transfusion",
            4: "-",
            5: "-",
        },
    },
    "thrombocytopenia": {
        "name": "Thrombocytopenia",
        "section": "Hematological",
        "definition": "A disorder characterized by a decrease in the number of platelets in peripheral blood.",
        "grades": {
            1: "NOT associated with active bleeding and above the threshold for platelet transfusion",
            2: "NOT associated with active bleeding but needing platelet transfusion",
            3: "Associated with bleeding or platelet count less than 20,000",
            4: "Associated with intracranial bleeding",
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


# --------------------------------------------------------------------------
# Domain 2 — major morbidities sourced from Form H (NeonatalMorbidities)
# --------------------------------------------------------------------------

_ROMAN_GRADE = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "1": 1, "2": 2, "3": 3, "4": 4}


def _resolve_grade(slug, grade):
    """(grade, grade_text, note). If the requested grade is UNRESOLVED or
    "-" in the source document, step down to the highest grade below it
    that IS defined — never surface a grade the document does not define.
    Returns (None, None, "") if nothing at or below `grade` is defined."""
    grades = AE_DEFINITIONS[slug]["grades"]
    text = grades.get(grade)
    if text not in (None, UNRESOLVED, "-"):
        return grade, text, ""
    for g in range(grade - 1, 0, -1):
        if grades[g] not in (UNRESOLVED, "-"):
            note = (f" (Note: the AE scale does not define Grade {grade} for this event — "
                    f"graded conservatively at the highest defined grade below it.)")
            return g, grades[g], note
    return None, None, ""


def _fh_truthy(*vals):
    for v in vals:
        if v is True:
            return True
        if isinstance(v, str) and v.strip().lower() in ("yes", "true", "1"):
            return True
    return False


def _fh_date(date_val, age_days, day1_date):
    """Best available onset date for a Form H morbidity: the explicit date
    column if present, else day1_date + (age_days - 1), else None."""
    if date_val is not None:
        try:
            return date_val.isoformat()
        except AttributeError:
            return str(date_val) or None
    if day1_date is not None and isinstance(age_days, int) and age_days > 0:
        return (day1_date + timedelta(days=age_days - 1)).isoformat()
    return None


def _fh_candidate(slug, grade, start_date, evidence, end_date=None):
    """Shape one Form H / Form-H-adjacent AE candidate row (same shape as
    _episode). grade=None → detect-only: no grade proposed, the clinician
    assigns it."""
    d = AE_DEFINITIONS[slug]
    grade_str = ""
    severity = f"{d['name']} recorded — grade not auto-assigned; the clinician assigns it."
    if grade is not None:
        g, text, note = _resolve_grade(slug, grade)
        if g is not None:
            grade_str = str(g)
            severity = f"Grade {g}: {text}{note}"
    return {
        "definition_no": slug,
        "description": d["name"],
        "start_date": start_date,
        "end_date": end_date,
        "severity_desc": severity,
        "grade": grade_str,
        "evidence": evidence,
        "nicu_day_start": None,
        "nicu_day_end": None,
    }


def detect_form_h_morbidity_candidates(nm, day1_date=None):
    """nm: the single NeonatalMorbidities (Form H) row for one enrollment,
    or None. Returns AE-candidate dicts for the 6 major morbidities the AE
    severity document covers that Form H already captures with a
    clinician-assigned stage/grade — IVH, PVL, NEC, BPD, ROP, PDA
    (document sections Neurological / Gastro-intestinal / Respiratory /
    Sensory / Cardiovascular).

    Form H is the ONLY source here (PI decision 2026-08-27): if a
    morbidity isn't recorded in Form H it hasn't been clinically
    adjudicated, and the AE register carries regulatory weight — the daily
    helper logs / Form F cranial USG are deliberately NOT a fallback.

    Grade is auto-assigned only where the mapping is unambiguous:
      - IVH  : Form H grade I/II/III/IV → severity Grade 1/2/3/4 (worse eye)
      - PVL  : Form H grade I/II/III   → severity Grade 1/2/3 (worse side);
               grade IV steps down to 3 (the scale defines PVL to Grade 3)
      - NEC  : Bell IIA/IIB/IIIA → Grade 3; Bell IIIB or any surgery →
               Grade 4; Bell 1 (IA/IB) or no stage → detect-only
      - ROP  : a recorded treatment (laser / anti-VEGF / operative) → Grade
               3 (Type 1 / threshold ROP); ROP diagnosed but untreated →
               detect-only (Grade 1 vs 2 needs zone/stage/plus)
      - PDA  : none → Grade 1; medical Rx → Grade 2; ligation / device
               closure → Grade 3
      - BPD  : detect-only — the scale grades BPD by O2 % / positive
               pressure at 36 weeks PMA (NICHD 2001) while Form H stores
               the Jensen 2019 grade; there is no hard-number mapping.
    Grade 5 (Death) is never auto-assigned by any branch."""
    if nm is None:
        return []
    out = []

    # --- IVH (Neurological) ---
    if _fh_truthy(nm.ivh_present, nm.ivh):
        r = _ROMAN_GRADE.get(str(nm.ivh_grade_right or "").strip().lower())
        l = _ROMAN_GRADE.get(str(nm.ivh_grade_left or "").strip().lower())
        grade = max([g for g in (r, l) if g], default=None)
        sides = []
        if r:
            sides.append(f"Right grade {nm.ivh_grade_right}")
        if l:
            sides.append(f"Left grade {nm.ivh_grade_left}")
        start = (_fh_date(nm.ivh_date_right, nm.ivh_age_days_right, day1_date)
                 or _fh_date(nm.ivh_date_left, nm.ivh_age_days_left, day1_date)
                 or _fh_date(nm.ivh_date, nm.ivh_age_days, day1_date))
        ev = "Form H records IVH" + (f" — {', '.join(sides)}" if sides else " (no grade recorded)")
        out.append(_fh_candidate("ivh", grade, start, ev))

    # --- PVL (Neurological) ---
    if _fh_truthy(nm.pvl_present, nm.pvl):
        r = _ROMAN_GRADE.get(str(nm.pvl_grade_right or "").strip().lower())
        l = _ROMAN_GRADE.get(str(nm.pvl_grade_left or "").strip().lower())
        grade = max([g for g in (r, l) if g], default=None)
        sides = []
        if r:
            sides.append(f"Right grade {nm.pvl_grade_right}")
        if l:
            sides.append(f"Left grade {nm.pvl_grade_left}")
        start = (_fh_date(nm.pvl_date_right, nm.pvl_age_days_right, day1_date)
                 or _fh_date(nm.pvl_date_left, nm.pvl_age_days_left, day1_date)
                 or _fh_date(nm.pvl_date, None, day1_date))
        ev = "Form H records cystic PVL" + (f" — {', '.join(sides)}" if sides else " (no grade recorded)")
        out.append(_fh_candidate("pvl", grade, start, ev))

    # --- NEC (Gastro-intestinal) ---
    if _fh_truthy(nm.nec):
        stage = str(nm.nec_stage or "").strip().upper()
        surgery = nm.nec_surgery is True
        if stage == "IIIB" or surgery:
            grade = 4
        elif stage in ("IIA", "IIB", "IIIA"):
            grade = 3
        else:  # IA / IB / blank — unconfirmed NEC
            grade = None
        start = _fh_date(nm.nec_date, nm.nec_age_days, day1_date)
        ev = "Form H records NEC" + (f", Bell stage {stage}" if stage else " (stage not recorded)")
        if surgery:
            ev += ", surgery performed"
        if grade == 3:
            ev += (". Note: the AE scale's Grade 4 also covers Bell IIIA accompanied by shock / "
                   "DIC / combined respiratory-metabolic acidosis — upgrade to Grade 4 if "
                   "systemic collapse was present.")
        elif grade is None:
            ev += (". Bell stage 1 is unconfirmed NEC — the AE scale directs recording the "
                   "severity of individual symptoms (e.g. feeding intolerance) instead.")
        out.append(_fh_candidate("nec", grade, start, ev))

    # --- BPD (Respiratory) — detect-only ---
    if _fh_truthy(nm.bpd):
        bits = []
        if nm.bpd_grade:
            bits.append(f"Jensen grade {nm.bpd_grade}")
        if nm.bpd_support_36w:
            bits.append(f"respiratory support at 36 weeks PMA: {nm.bpd_support_36w}")
        ev = "Form H records BPD" + (f" ({'; '.join(bits)})" if bits else "")
        ev += (". Grade not auto-assigned — the AE scale grades BPD by oxygen % / positive "
               "pressure at 36 weeks PMA (NICHD 2001), which does not map directly onto the "
               "Jensen 2019 grade stored in Form H.")
        out.append(_fh_candidate("bpd", None, None, ev))

    # --- ROP (Sensory) ---
    if _fh_truthy(nm.rop):
        treated = _fh_truthy(
            nm.rop_treatment_right, nm.rop_treatment_left, nm.rop_treatment,
            nm.rop_laser, nm.rop_anti_vegf, nm.rop_vitrectomy,
            nm.rop_laser_right, nm.rop_laser_left,
            nm.rop_anti_vegf_right, nm.rop_anti_vegf_left,
            nm.rop_vitrectomy_right, nm.rop_vitrectomy_left,
        )
        grade = 3 if treated else None
        start = _fh_date(nm.rop_diagnosis_date, None, day1_date)
        eyes = []
        for side, st, zn, pl in (
            ("Right", nm.rop_stage_right, nm.rop_zone_right, nm.rop_plus_right),
            ("Left", nm.rop_stage_left, nm.rop_zone_left, nm.rop_plus_left),
        ):
            d = []
            if zn:
                d.append(f"zone {zn}")
            if st:
                d.append(f"stage {st}")
            if isinstance(pl, str) and pl.strip().lower() == "yes":
                d.append("plus disease")
            if d:
                eyes.append(f"{side}: {', '.join(d)}")
        ev = "Form H records ROP" + (f" — {'; '.join(eyes)}" if eyes else "")
        if treated:
            ev += (". A treatment (laser / anti-VEGF / operative) is recorded → Type 1 or "
                   "threshold ROP.")
        else:
            ev += (". No treatment recorded — grade not auto-assigned "
                   "(Grade 1 vs Grade 2 depends on zone / stage / plus disease).")
        out.append(_fh_candidate("rop", grade, start, ev))

    # --- PDA (Cardiovascular) — only flagged when haemodynamically
    # significant or treated (a trivial self-closing PDA is not an AE). ---
    surgical = str(nm.pda_intervention_rx or "").strip().lower() in ("ligation", "device closure")
    if _fh_truthy(nm.hs_pda) or _fh_truthy(nm.pda_medical_rx) or surgical:
        medical = _fh_truthy(nm.pda_medical_rx)
        if surgical:
            grade = 3
        elif medical:
            grade = 2
        else:
            grade = 1
        bits = []
        if _fh_truthy(nm.hs_pda):
            bits.append("haemodynamically significant PDA")
        if medical:
            bits.append("medical treatment given")
        if surgical:
            bits.append(str(nm.pda_intervention_rx))
        ev = "Form H records " + (", ".join(bits) if bits else "PDA")
        if grade == 1:
            ev += (". No treatment recorded — Grade 1 assumes the PDA did not prolong "
                   "respiratory support / hospital stay; confirm before accepting.")
        elif grade == 3:
            ev += ". Surgical ligation / device closure → Grade 3."
        out.append(_fh_candidate("pda", grade, None, ev))

    return [c for c in out if c]


# --------------------------------------------------------------------------
# Domain 3 — infection episodes (sepsis culture+/−, meningitis)
# --------------------------------------------------------------------------

_SEPSIS_UPGRADE_NOTE = (
    " Grade floored at 2 — upgrade to Grade 3 for severe signs (e.g. fever, "
    "grunting) with support escalation, or Grade 4 for shock / DIC."
)


def _infection_episodes(nm):
    """Form H's `infections` JSON as a list of dicts (tolerant of a
    JSON-string column value or None)."""
    raw = getattr(nm, "infections", None) if nm is not None else None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = None
    return [e for e in raw if isinstance(e, dict)] if isinstance(raw, list) else []


def _hours_to_date(onset_hours, day1_date):
    """Age-at-onset in hours (Form H infection episode) → calendar date,
    counting day1_date as the birth day. None if not resolvable."""
    if day1_date is None:
        return None
    try:
        h = float(onset_hours)
    except (TypeError, ValueError):
        return None
    if h < 0:
        return None
    return (datetime(day1_date.year, day1_date.month, day1_date.day)
            + timedelta(hours=h)).date().isoformat()


def detect_infection_candidates(nm, infection_windows, day1_date=None):
    """Infection-episode AE candidates — culture-positive sepsis,
    culture-negative sepsis, and meningitis.

    Source policy (PI decision 2026-08-27): **Form H primary, day log as
    fallback.** If Form H's dynamic `infections` array has at least one
    `sepsis = "Yes"` episode, those episodes are the whole story and the
    day-log windows are ignored. Otherwise the trigger windows from
    `_compute_infection_windows()` (passed in as `infection_windows`) are
    used.

    Grading (PI decisions 2026-08-27):
      - a Form H sepsis episode → floor Grade 2 (a clinician entering the
        episode has ruled out Grade 1 "contamination"); the G2/G3/G4 split
        (mild vs severe signs vs life-threatening) stays the clinician's
        call, surfaced in the evidence text.
      - meningitis (Form H `focus_meningitis` on an episode, or a day-log
        meningitis window) → Grade 3 — the scale defines no lower grade
        for meningitis; note directs upgrade to Grade 4 for shock /
        end-organ failure.
      - day-log fallback with no Form H episode:
          * "culture" window  → culture-positive sepsis, **detect-only**
            (a lone positive culture with no episode may be a contaminant)
          * "screen" window   → culture-negative sepsis, Grade 2
          * "clinical" window (antibiotics > 5 continuous days) →
            culture-negative sepsis, Grade 2
      - Grade 5 (Death) is never auto-assigned.
    """
    out = []
    episodes = _infection_episodes(nm)

    if episodes:
        for i, e in enumerate(episodes, start=1):
            if str(e.get("sepsis") or "").strip().lower() != "yes":
                continue
            num = e.get("sepsis_episode_number") or i
            onset_h = e.get("sepsis_onset_age")
            start = _hours_to_date(onset_h, day1_date)
            culture_pos = bool(e.get("sepsis_culture"))
            slug = "sepsis_culture_positive" if culture_pos else "sepsis_culture_negative"

            src_map = {"culture_blood": "Blood", "culture_csf": "CSF",
                       "culture_urine": "Urine", "culture_other": "Other"}
            src = [v for k, v in src_map.items() if e.get(k)]
            org_map = {"gram_positive": "Gram-positive", "gram_negative": "Gram-negative",
                       "fungus": "Fungus"}
            org = [v for k, v in org_map.items() if e.get(k)]

            ev = f"Form H infection episode #{num}: "
            ev += "culture-positive" if culture_pos else (
                "screen-positive" if e.get("sepsis_screen") else "clinical / screen-negative")
            if onset_h:
                ev += f", onset ~{onset_h} h of life"
            if src:
                ev += f", culture source: {', '.join(src)}"
            if org:
                ev += f", organism: {', '.join(org)}"
            ev += "." + _SEPSIS_UPGRADE_NOTE
            out.append(_fh_candidate(slug, 2, start, ev))

            if e.get("focus_meningitis") or e.get("culture_csf"):
                mev = (f"Form H infection episode #{num} flags meningitis"
                       + (" (CSF culture positive)" if e.get("culture_csf") else "")
                       + ". Note: upgrade to Grade 4 if accompanied by shock or end-organ failure.")
                out.append(_fh_candidate("meningitis", 3, start, mev))
        return [c for c in out if c]

    # --- fallback: day-log trigger windows ---
    for w in infection_windows or []:
        stype = w.get("suggested_type")
        start, end = w.get("date_start"), w.get("date_end")
        days = f" (NICU day {w.get('nicu_day_start')}"
        days += f"–{w.get('nicu_day_end')})" if w.get("nicu_day_end") != w.get("nicu_day_start") else ")"
        if stype == "culture":
            ev = (f"Blood culture positive{days}. Grade not auto-assigned from the day log "
                  "alone — a positive culture with no corresponding Form H episode may be a "
                  "contaminant; the clinician confirms the episode and grades it.")
            out.append(_fh_candidate("sepsis_culture_positive", None, start, ev, end_date=end))
        elif stype == "screen":
            ev = (f"Sepsis screen positive{days} (no blood culture positive on those days). "
                  + _SEPSIS_UPGRADE_NOTE.strip())
            out.append(_fh_candidate("sepsis_culture_negative", 2, start, ev, end_date=end))
        elif stype == "clinical":
            ev = (f"Antibiotics given for > 5 continuous days{days}, with no positive culture or "
                  "screen on those days — a probable clinically-diagnosed sepsis episode. "
                  + _SEPSIS_UPGRADE_NOTE.strip())
            out.append(_fh_candidate("sepsis_culture_negative", 2, start, ev, end_date=end))
        elif w.get("meningitis"):
            ev = (f"Meningitis flagged in the Infect/GI/Hema day log{days}. "
                  "Note: upgrade to Grade 4 if accompanied by shock or end-organ failure.")
            out.append(_fh_candidate("meningitis", 3, start, ev, end_date=end))

    return [c for c in out if c]


# --------------------------------------------------------------------------
# Domain 4 — haematologic / bilirubin (hyperbilirubinemia, anemia,
# thrombocytopenia), graded off the recorded treatment
# --------------------------------------------------------------------------

_THROMBO_NOTE = (
    " Grade 2 = a platelet transfusion was given. The app captures no platelet count "
    "or bleeding flag — the clinician upgrades to Grade 3 (bleeding / count <20,000) or "
    "Grade 4 (intracranial bleeding) if applicable."
)


def _int_or_none(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _answered(v):
    """A Yes/No/select field the clinician has actually filled in
    (as opposed to left blank)."""
    return v is not None and str(v).strip() != ""


def _yes(v):
    return str(v or "").strip().lower() in ("yes", "true", "1")


def _any_day(inf_logs, attr):
    """Earliest nicu_day where `attr` is True on an InfectGIHema day log,
    or None."""
    days = sorted(l.nicu_day for l in inf_logs
                  if getattr(l, attr, None) is True and l.nicu_day is not None)
    return days[0] if days else None


def detect_form_h_heme_candidates(nm, inf_logs, day1_date=None):
    """Haematologic / bilirubin AE candidates — hyperbilirubinemia,
    anemia, thrombocytopenia. Every grade here comes from the *treatment*
    that was recorded, matching the document's own grade wording.

    Source policy (PI decision 2026-08-27): Form H's Haematology section
    is PRIMARY, per AE term — if the clinician has answered that term's
    top-level Form H question, that answer is used and the day log is
    ignored for it. Otherwise the InfectGIHema day-log treatment booleans
    are the fallback (a recorded transfusion / phototherapy only —
    never a bare low haemoglobin).

    Grading (PI decisions 2026-08-27):
      - Hyperbilirubinemia: BIND ("Bilirubin-Induced Neurologic
        Dysfunction") = Yes → Grade 4 (acute bilirubin encephalopathy);
        exchange transfusion → Grade 3; phototherapy → Grade 2; jaundice
        needing intervention but neither → Grade 2; jaundice with no
        treatment → Grade 1.
      - Anemia: PRBC transfusion → Grade 3; anemia = Yes without a
        transfusion → Grade 1 (the scale defines no Grade 2 for anemia).
      - Thrombocytopenia: platelet transfusion → Grade 2 (the only grade
        the app has the data to reach; note directs the clinician on
        Grade 3/4).
      - Grade 5 (Death) is never auto-assigned.
    """
    inf_logs = inf_logs or []
    out = []

    # ---------------- Hyperbilirubinemia ----------------
    jaundice_fields = (getattr(nm, "jaundice_intervention", None),
                       getattr(nm, "phototherapy", None),
                       getattr(nm, "bind", None),
                       getattr(nm, "dvet", None)) if nm is not None else (None, None, None, None)
    if any(_answered(v) for v in jaundice_fields):
        j_int, photo, bind, dvet = jaundice_fields
        if _yes(bind):
            grade, why = 4, "BIND (acute bilirubin encephalopathy) recorded"
        elif _yes(dvet):
            grade, why = 3, "exchange transfusion given"
        elif _yes(photo):
            grade, why = 2, "phototherapy given"
        elif _yes(j_int):
            grade, why = 2, "jaundice required intervention (modality not phototherapy/exchange per Form H — verify)"
        else:
            grade, why = None, None  # all "No"
        if grade is not None:
            start = _fh_date(getattr(nm, "jaundice_onset", None), None, day1_date)
            out.append(_fh_candidate("hyperbilirubinemia", grade, start,
                                     f"Form H Haematology: {why}."))
    else:
        photo_day = _any_day(inf_logs, "phototherapy")
        exch_day = _any_day(inf_logs, "exchange_transfusion")
        jaun_day = _any_day(inf_logs, "jaundice")
        if exch_day is not None:
            out.append(_fh_candidate("hyperbilirubinemia", 3, _day_to_date(day1_date, exch_day),
                                     f"Exchange transfusion recorded on NICU day {exch_day} (Infect/GI/Hema day log); Form H Haematology not filled."))
        elif photo_day is not None:
            out.append(_fh_candidate("hyperbilirubinemia", 2, _day_to_date(day1_date, photo_day),
                                     f"Phototherapy recorded on NICU day {photo_day} (Infect/GI/Hema day log); Form H Haematology not filled."))
        elif jaun_day is not None:
            out.append(_fh_candidate("hyperbilirubinemia", 1, _day_to_date(day1_date, jaun_day),
                                     f"Jaundice flagged on NICU day {jaun_day} (Infect/GI/Hema day log), no treatment recorded; Form H Haematology not filled."))

    # ---------------- Anemia ----------------
    anemia_ans = getattr(nm, "anemia", None) if nm is not None else None
    if _answered(anemia_ans):
        if _yes(anemia_ans):
            prbc = _yes(getattr(nm, "prbc", None))
            grade = 3 if prbc else 1
            bits = []
            lh = getattr(nm, "lowest_hb", None)
            if _answered(lh):
                bits.append(f"lowest Hb/Hct {lh}")
            sym = getattr(nm, "anemia_symptoms", None)
            if _answered(sym):
                bits.append(f"symptoms: {sym}")
            bits.append("PRBC transfusion given" if prbc else "no transfusion recorded")
            start = _fh_date(None, _int_or_none(getattr(nm, "anemia_onset", None)), day1_date)
            out.append(_fh_candidate("anemia", grade, start,
                                     "Form H Haematology: anemia — " + ", ".join(bits) + "."))
    else:
        prbc_day = _any_day(inf_logs, "prbc_transfusion")
        if prbc_day is not None:
            out.append(_fh_candidate("anemia", 3, _day_to_date(day1_date, prbc_day),
                                     f"PRBC transfusion recorded on NICU day {prbc_day} (Infect/GI/Hema day log); Form H Haematology not filled."))

    # ---------------- Thrombocytopenia ----------------
    plt_ans = getattr(nm, "platelets", None) if nm is not None else None
    if _answered(plt_ans):
        if _yes(plt_ans):
            n = getattr(nm, "platelet_number", None)
            ev = "Form H Haematology: platelet transfusion given"
            ev += f" ({n} transfusion(s))" if _answered(n) else ""
            out.append(_fh_candidate("thrombocytopenia", 2, None, ev + "." + _THROMBO_NOTE))
    else:
        plt_day = _any_day(inf_logs, "platelet_transfusion")
        if plt_day is not None:
            out.append(_fh_candidate("thrombocytopenia", 2, _day_to_date(day1_date, plt_day),
                                     f"Platelet transfusion recorded on NICU day {plt_day} "
                                     f"(Infect/GI/Hema day log); Form H Haematology not filled." + _THROMBO_NOTE))

    return [c for c in out if c]
