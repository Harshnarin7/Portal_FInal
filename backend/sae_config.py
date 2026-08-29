"""Static configuration for the SAE / IEC report generator.

Everything here is trial-level or site-level reference data that is NOT in
the clinical database. Values shown as PLACEHOLDER must be supplied by the
PI / trial coordinator before a generated report is submission-ready — the
report renders them as "[TO BE PROVIDED — ...]" so nothing is silently
wrong.

Source form: the PGIMER-DSMC Serious Adverse Event Reporting Form
(CDSCO / New Drugs and Clinical Trials Rules 2019 standard, 22 items).
"""

PH = "[TO BE PROVIDED]"


def ph(what):
    return f"[TO BE PROVIDED — {what}]"


TRIAL = {
    "protocol_title": (
        "Initial Oxygen for Delivery Room Resuscitation of Preterm neonates: "
        "a triple-arm, multisite, randomized, controlled trial (PORTAL Trial)"
    ),
    "protocol_no": ph("ICMR protocol / grant number"),
    "ctri_no": ph("CTRI/YYYY/MM/NNNNNN"),
    "cdsco_permission": ph(
        "CDSCO clinical trial permission no. + date, or 'Not applicable' with reason"
    ),
    "country": "India",
    "funding": "Indian Council of Medical Research (ICMR)",
    "sponsor": {
        "name": "Indian Council of Medical Research (ICMR)",
        "address": ph("ICMR sponsor postal address"),
        "contact": ph("ICMR sponsor phone"),
        "email": ph("ICMR sponsor email"),
    },
    "cro": "Not applicable",
    "compensation_clause": ph(
        "trial's standard compensation wording for item 21"
    ),
    # The randomised intervention, worded so the arm is never revealed.
    "suspect_intervention": {
        "generic_name": (
            "Blinded randomised delivery-room oxygen concentration — one of "
            "30%, 60% or 90% FiO2 (allocation concealed via the oxygen-blender "
            "firmware; the treating team and this report are blinded to the arm)"
        ),
        "indication": "Resuscitation of a preterm neonate at birth",
        "dosage_form": "Medical gas (oxygen/air blend), inhalational",
        "daily_dose": (
            "Titrated per protocol from the randomised starting FiO2 against "
            "target SpO2; actual daily FiO2 values are in the respiratory "
            "support log"
        ),
        "route": (
            "Inhalation — face mask / T-piece / nasal prongs / endotracheal tube"
        ),
        "start": "From birth (delivery-room resuscitation)",
        "stop": "Weaned to room air per protocol (see respiratory support log)",
    },
}

# IEC routing — does each site report to its own IEC, the PGIMER nodal IEC,
# or both?  One of: "own", "pgimer_nodal", "both".
IEC_ROUTING = ph('"own" | "pgimer_nodal" | "both"')

PGIMER_IEC = {
    "name": "Institute Ethics Committee, PGIMER, Chandigarh",
    "address": ph("PGIMER IEC office postal address"),
    "chairperson": ph("Chairperson, PGIMER IEC — name"),
    "chairperson_address": ph("Chairperson postal address"),
    "phone": "0172-2755266",
    "emails": ["iecpgimerdt@gmail.com", "iecpgi@gmail.com"],
    "addressee": "Chairperson, Institute Ethics Committee, PGIMER, Chandigarh",
}

# Per-site investigator block (DSMC item 17) and, if IEC_ROUTING is "own"
# or "both", that site's own IEC block (item 18). Keys match
# CANONICAL_SITE_ID_MAP in main.py.
SITES = {
    "PGIMER": {"display": "PGIMER Chandigarh", "ct_site_number": "01"},
    "GMCH":   {"display": "GMCH Chandigarh",   "ct_site_number": "02"},
    "IOG":    {"display": "IOG Chennai",       "ct_site_number": "03"},
    "AFMC":   {"display": "AFMC Pune",         "ct_site_number": "04"},
    "GMCH-A": {"display": "GMCH Aurangabad",   "ct_site_number": "05"},
    "AMC":    {"display": "AMC Dibrugarh",     "ct_site_number": "06"},
}
for _code, _s in SITES.items():
    _s.setdefault("pi_name", ph(f"{_s['display']} — site PI name"))
    _s.setdefault("pi_specialty", ph(f"{_s['display']} — PI specialty/qualification"))
    _s.setdefault("address", ph(f"{_s['display']} — site postal address"))
    _s.setdefault("pi_phone", ph(f"{_s['display']} — PI phone/mobile"))
    _s.setdefault("pi_email", ph(f"{_s['display']} — PI email"))
    _s.setdefault("iec", None)  # None → use PGIMER_IEC; else a dict like PGIMER_IEC

# INC NAESS severity grade → label used on FormY_SAE and in the report.
SEVERITY_GRADES = {
    "1": "Grade 1 — Mild",
    "2": "Grade 2 — Moderate",
    "3": "Grade 3 — Severe",
    "4": "Grade 4 — Life-threatening",
    "5": "Grade 5 — Death",
}

# Legacy FormY_SAE 3-level severity values → nearest INC grade label.
SEVERITY_LEGACY_MAP = {
    "Mild (Transient)": "Grade 1 — Mild",
    "Moderate (Interferes with activity)": "Grade 2 — Moderate",
    "Severe (Incapacitating)": "Grade 3 — Severe",
}

SUBMISSION_RULES = (
    "This Serious Adverse Event is reported to the Institute Ethics Committee "
    "with a covering letter from the Principal Investigator within 24 hours of "
    "the investigator becoming aware of it. A detailed follow-up report is "
    "submitted within 14 days of its occurrence. The report is sent as a hard "
    "copy and a soft copy (MS Word) to the Ethics Committee, and to the "
    "Sponsor and CDSCO within the applicable timeframes."
)


def site_for(site_code):
    """SITES entry for a site code, with a safe fallback."""
    return SITES.get((site_code or "").strip(), {
        "display": site_code or "Unknown site",
        "ct_site_number": ph("CT site number"),
        "pi_name": ph("site PI name"),
        "pi_specialty": ph("PI specialty"),
        "address": ph("site address"),
        "pi_phone": ph("PI phone"),
        "pi_email": ph("PI email"),
        "iec": None,
    })


def iec_for(site_code):
    """The IEC block to print for a site (its own, or the PGIMER nodal)."""
    s = SITES.get((site_code or "").strip())
    if s and s.get("iec"):
        return s["iec"]
    return PGIMER_IEC


def severity_label(value):
    """Normalise whatever is stored in SAEReport.severity to a grade label:
    an INC grade digit, a legacy 3-level string, or an already-formatted
    'Grade N — ...' label."""
    if not value:
        return ""
    v = str(value).strip()
    if v in SEVERITY_GRADES:
        return SEVERITY_GRADES[v]
    if v in SEVERITY_LEGACY_MAP:
        return SEVERITY_LEGACY_MAP[v]
    for digit, label in SEVERITY_GRADES.items():
        if v == label or v.lower().startswith(f"grade {digit}"):
            return label
    return v
