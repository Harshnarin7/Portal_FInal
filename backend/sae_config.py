"""Static configuration for the SAE / IEC report generator.

Trial- and site-level reference data that is NOT in the clinical database.
Values still shown as ph("...") must be supplied by the PI / trial
coordinator — the report renders them as "[TO BE PROVIDED — ...]" so a gap
is obvious, never silently wrong.

Constants source: PI, 2026-08-31 (partial — remaining gaps to follow).
Source form: the PGIMER-DSMC Serious Adverse Event Reporting Form
(CDSCO / New Drugs and Clinical Trials Rules 2019 standard, 22 items).
"""

PH = "[TO BE PROVIDED]"


def ph(what):
    return f"[TO BE PROVIDED — {what}]"


TRIAL = {
    # CTRI-registered title (used on regulatory submissions). The common
    # short form used in the protocol is "... a triple-arm, multisite,
    # randomized, controlled trial (PORTAL Trial)".
    "protocol_title": (
        "Initial Oxygen for Delivery Room Resuscitation of Preterm Neonates: "
        "A Triple-arm, Multi-site, Randomised, Controlled Trial (PORTAL Trial)"
    ),
    "protocol_no": "IIRPIG-01-00478",
    "ctri_no": "CTRI/2025/09/094952 (registered 17 September 2025)",
    "cdsco_permission": ph(
        "CDSCO clinical trial permission no. + date, or 'Not applicable' with reason"
    ),
    "country": "India",
    "funding": "Indian Council of Medical Research (ICMR)",
    "sponsor": {
        "name": "Indian Council of Medical Research (ICMR)",
        "address": (
            "V. Ramalingaswami Bhawan, P.O. Box No. 4911, Ansari Nagar, "
            "New Delhi - 110029, India"
        ),
        "contact": "Dr Aparna Sinha (Scientist, ICMR) — +91-9968408999",
        "email": "aparna.sinha.deb@gmail.com",
    },
    "cro": "Not applicable",
    "compensation_clause": (
        "Compensation for clinical-trial-related injury or death is governed by "
        "the New Drugs and Clinical Trials Rules, 2019. In the event of "
        "trial-related death the compensation is (B x F x R) / 99.37, where "
        "B = Rs 8,00,000 (base amount), F = the age-related factor of the "
        "Workmen's Compensation Act, and R = the risk factor (R = 1 for this "
        "trial); each participant is covered for approximately Rs 18.4 lakh in "
        "the event of trial-related death, under the trial insurance policy. "
        "Whether compensation has been paid for this specific event — and, if "
        "not, the reason — is to be completed by the investigator."
    ),
    # Full insurance-coverage calculation, for reference / appendices only —
    # not printed in item 21.
    "compensation_detail": (
        "Per-subject cover: Rs 18.4 lakh (B=8 lakh, F=228.54, R=1, formula "
        "(B x F x R)/99.37). Sample size 700. Year 1 (35% enrolment) AOA "
        "Rs 8,83,20,000, premium Rs 8,02,829 + GST; Year 2 (40%) AOA "
        "Rs 10,30,40,000, premium Rs 9,36,634 + GST; Year 3 (25%) AOA "
        "Rs 6,62,40,000, premium Rs 6,02,122 + GST. Total cover required "
        "Rs 25,76,00,000."
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

# Each site reports its SAEs to its own IEC (item 18 = the site's own IEC).
# A copy of every site's SAE also goes to the PGIMER nodal IEC with a cover
# letter (see SUBMISSION_RULES). One of: "own", "pgimer_nodal", "both".
IEC_ROUTING = "both"

PGIMER_IEC = {
    "name": "Institutional Ethics Committee, PGIMER, Chandigarh",
    "address": (
        "Room No. 6006, 6th Floor, P. N. Chuttani Block, PGIMER, Sector 12, "
        "Chandigarh - 160012"
    ),
    "chairperson": "Prof. Parveen Kumar",  # PI: "according to one document I found" — confirm
    "chairperson_address": "Institutional Ethics Committee, PGIMER, Sector 12, Chandigarh - 160012",
    "phone": "+91-172-2755266",
    "emails": ["iecpgi@gmail.com", "iecpgimerdt@gmail.com"],
    "addressee": "Chairperson, Institutional Ethics Committee, PGIMER, Chandigarh",
}

# Per-site investigator block (DSMC item 17) + that site's own IEC block
# (item 18). Keys match CANONICAL_SITE_ID_MAP in main.py.
SITES = {
    "PGIMER": {
        "display": "PGIMER, Chandigarh",
        "ct_site_number": "01",
        "pi_name": "Dr Venkataseshan Sundaram",
        "pi_specialty": "MBBS, MD (Pediatrics), DM (Neonatology)",
        "address": (
            "Post Graduate Institute of Medical Education and Research (PGIMER), "
            "Chandigarh - 160012"
        ),
        "pi_phone": "+91 94780 01129",
        "pi_email": "venkatpgi@gmail.com",
        "iec": None,  # PGIMER site uses PGIMER_IEC
    },
    "GMCH": {
        "display": "GMCH, Chandigarh",
        "ct_site_number": "02",
        "pi_name": "Dr Deepak Chawla",
        "pi_specialty": "MD, DM (Neonatology), FNNF",
        "address": (
            "Department of Neonatology, Room D-410, Level IV, Block D, "
            "Government Medical College & Hospital (GMCH), Sector 32, Chandigarh"
        ),
        "pi_phone": "+91-172-250442, +91-9646121559",
        "pi_email": "drdeepak.chawla@gmail.com",
        "iec": {
            "name": "Institutional Ethics Committee, GMCH, Chandigarh",
            "address": ph("GMCH Chandigarh IEC office address"),
            "chairperson": ph("Chairperson, GMCH Chandigarh IEC"),
            "chairperson_address": ph("Chairperson address"),
            "phone": "0172-2505703",
            "emails": ["iec.gmch32@gmail.com"],
            "addressee": "Chairperson, Institutional Ethics Committee, GMCH, Chandigarh",
        },
    },
    "IOG": {
        "display": "Institute of Obstetrics and Gynaecology (IOG), Chennai",
        "ct_site_number": "03",
        "pi_name": "Dr. S. Mangala Bharathi",
        "pi_specialty": (
            "MBBS, DNB (Pediatrics), DM (Neonatology), "
            "PG Diploma (Public Health Epidemiology)"
        ),
        "address": "No. 2, Pantheon Road, Egmore, Chennai - 600008",
        "pi_phone": "+91 98407 86836",
        "pi_email": "drmangalabharathi@gmail.com",
        "iec": {
            "name": "Institutional Ethics Committee, Madras Medical College, Chennai",
            "address": ph("Madras Medical College IEC office address"),
            "chairperson": "Dr. C. Sridhar, MD",
            "chairperson_address": ph("Chairperson address"),
            "phone": ph("Madras Medical College IEC phone"),
            "emails": [ph("Madras Medical College IEC email")],
            "addressee": "Chairperson, Institutional Ethics Committee, Madras Medical College, Chennai",
        },
    },
    "AFMC": {
        "display": "Armed Forces Medical College (AFMC), Pune",
        "ct_site_number": "04",
        "pi_name": "Brig (Dr) Vishal Vishnu Tewari",
        "pi_specialty": "MD (Pediatrics), DrNB (Neonatology), MNAMS, FNNF",
        "address": (
            "Department of Pediatrics, Golden Jubilee Block, Ground Floor, "
            "Armed Forces Medical College (AFMC), Near Race Course, Pune - 411040"
        ),
        "pi_phone": "+91 88261 18889, +91 73910 44489",
        "pi_email": "docvvt_13@hotmail.com",
        "iec": {
            "name": "Institutional Ethics Committee, AFMC, Pune",
            "address": ph("AFMC IEC office address"),
            "chairperson": "Air Cmde (Dr.) Kevin Fernandez (Retd)",
            "chairperson_address": ph("Chairperson address"),
            "phone": ph("AFMC IEC phone"),
            "emails": [ph("AFMC IEC email")],
            "addressee": "Chairperson, Institutional Ethics Committee, AFMC, Pune",
        },
    },
    "GMCH-A": {
        "display": "GMCH, Chhatrapati Sambhajinagar (Aurangabad)",
        "ct_site_number": "05",
        "pi_name": "Dr. L. S. Deshmukh (Professor & Head)",
        "pi_specialty": (
            "MD (Pediatrics) (Gold Medal), DipNB (Pediatrics), DM (Neonatology)"
        ),
        "address": (
            "Department of Neonatology, Government Medical College & Hospital, "
            "Chhatrapati Sambhajinagar"
        ),
        "pi_phone": "+91 98224 78275",
        "pi_email": "deshmukhls@yahoo.com",
        "iec": {
            "name": "Institutional Ethics Committee (IEC-GMCA)",
            "address": (
                "Department of Pharmacology, Government Medical College, "
                "Chhatrapati Sambhajinagar - 431001"
            ),
            "chairperson": ph("Chairperson, IEC-GMCA"),
            "chairperson_address": ph("Chairperson address"),
            "phone": "0240-2402412-17 Ext. 279",
            "emails": ["iecgmca@gmail.com"],
            "addressee": "Chairperson, Institutional Ethics Committee (IEC-GMCA), Chhatrapati Sambhajinagar",
        },
    },
    "AMC": {
        "display": "Assam Medical College (AMC), Dibrugarh",
        "ct_site_number": "06",
        "pi_name": "Dr. Reeta Bora",
        "pi_specialty": "MBBS, MD (Pediatrics), DM (Neonatology)",
        "address": (
            "Assam Medical College, Department of Paediatrics (SCNU), "
            "Dibrugarh, Assam - 786002"
        ),
        "pi_phone": "+91 94353 94313",
        "pi_email": "bora64reeta@gmail.com",
        "iec": {
            "name": "Institutional Ethics Committee (H), Assam Medical College, Dibrugarh",
            "address": "Barbari, Dibrugarh, Assam - 786002",
            "chairperson": "Dr. Jagadish Mahanta (Retired Director, RMRC, Lahowal)",
            "chairperson_address": "Barbari, Dibrugarh, Assam - 786002",
            "phone": "0373-2300080, 0373-2300852",
            "emails": ["principalamch@rediffmail.com"],
            "addressee": "Chairperson, Institutional Ethics Committee (H), Assam Medical College, Dibrugarh",
        },
    },
}
for _code, _s in SITES.items():
    _s.setdefault("pi_name", ph(f"{_s['display']} — site PI name"))
    _s.setdefault("pi_specialty", ph(f"{_s['display']} — PI specialty/qualification"))
    _s.setdefault("address", ph(f"{_s['display']} — site postal address"))
    _s.setdefault("pi_phone", ph(f"{_s['display']} — PI phone/mobile"))
    _s.setdefault("pi_email", ph(f"{_s['display']} — PI email"))
    _s.setdefault("iec", None)

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
    "This Serious Adverse Event is reported to the Institutional Ethics "
    "Committee overseeing the site, with a covering letter from the Principal "
    "Investigator, within 24 hours of the investigator becoming aware of it. A "
    "detailed follow-up report is submitted within 14 days of its occurrence. "
    "A copy is also sent, with a covering letter, to the nodal Institutional "
    "Ethics Committee, PGIMER, Chandigarh. The report is sent as a hard copy "
    "and a soft copy (MS Word) to the Ethics Committee, and to the Sponsor "
    "(ICMR) and CDSCO within the applicable timeframes."
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
