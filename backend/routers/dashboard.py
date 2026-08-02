"""CONSORT participant flow table — trial monitoring dashboard, Section 1.

Implements the box-by-box logic from the CONSORT dashboard spec, with one
deliberate deviation from the original spec text: Box 4a/4b/5 do NOT filter
on `screening_status`. The live `compute_screening_status()` logic in
main.py maps every excluded record (anomaly / hydrops / GA-out-of-range) to
'Screen Failure', not 'Not Eligible' — so a literal `screening_status =
'Not Eligible'` filter would silently return zero rows for those boxes.
Instead we derive ineligibility directly from `exclusion_present` and
`gestation_weeks`, which is what `compute_screening_status()` itself is
built from. See Harsh's decision on this (July 2026) before changing it.

Depends on Issue #1 fixes (reason_for_consent_refusal, enrollment_id
writeback, ltfu_reason_36/40/44) — all three are implemented alongside this
endpoint.
"""

import csv
import io
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user, is_superadmin, is_global
from models import User

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ALL_SITES = ["PGIMER", "GMCH", "GMCH-A", "AMC", "AFMC", "IOG"]
GRACE_DAYS = 28

# Pre-screening barriers (Box 2). A record with any of these exclusion_reasons
# is NOT ineligible — it never reached formal eligibility assessment.
_BARRIER_SQL = (
    "(COALESCE(s.exclusion_reasons, '') LIKE '%Insufficient time%' "
    "OR COALESCE(s.exclusion_reasons, '') LIKE '%Forego resuscitation%' "
    "OR COALESCE(s.exclusion_reasons, '') LIKE '%IUFD%')"
)

SCREENING_QUERY = text(f"""
    SELECT
        s.site_name AS site_name,

        COUNT(*) AS box1,

        SUM(CASE WHEN {_BARRIER_SQL} THEN 1 ELSE 0 END) AS box2,
        SUM(CASE WHEN s.exclusion_reasons LIKE '%Insufficient time%' THEN 1 ELSE 0 END) AS box2a,
        SUM(CASE WHEN s.exclusion_reasons LIKE '%Forego resuscitation%' THEN 1 ELSE 0 END) AS box2b,
        SUM(CASE WHEN s.exclusion_reasons LIKE '%IUFD%' THEN 1 ELSE 0 END) AS box2c,

        -- Box 4a: screened, not a barrier case, no exclusion flag, but GA
        -- unknown or outside the <32-week inclusion window.
        SUM(CASE WHEN NOT {_BARRIER_SQL}
                 AND COALESCE(s.exclusion_present, FALSE) = FALSE
                 AND (s.gestation_weeks IS NULL OR s.gestation_weeks >= 32)
            THEN 1 ELSE 0 END) AS box4a,

        -- Box 4b: screened, not a barrier case, exclusion flag present
        -- (within "screened", the only remaining exclusion reasons are
        -- structural anomaly / fetal hydrops, since insufficient time /
        -- forego resus / IUFD were already pulled out by Box 2).
        SUM(CASE WHEN NOT {_BARRIER_SQL}
                 AND s.exclusion_present = TRUE
            THEN 1 ELSE 0 END) AS box4b,
        SUM(CASE WHEN NOT {_BARRIER_SQL}
                 AND s.exclusion_present = TRUE
                 AND s.exclusion_reasons LIKE '%Structural anomaly%'
            THEN 1 ELSE 0 END) AS box4b_anomaly,
        SUM(CASE WHEN NOT {_BARRIER_SQL}
                 AND s.exclusion_present = TRUE
                 AND s.exclusion_reasons LIKE '%Fetal hydrops%'
            THEN 1 ELSE 0 END) AS box4b_hydrops,

        -- Box 5: screened, not a barrier case, no exclusion flag, GA known
        -- and within the inclusion window.
        SUM(CASE WHEN NOT {_BARRIER_SQL}
                 AND COALESCE(s.exclusion_present, FALSE) = FALSE
                 AND s.gestation_weeks IS NOT NULL AND s.gestation_weeks < 32
            THEN 1 ELSE 0 END) AS box5,

        -- Box 6: eligible (= Box 5 condition), consent not given/refused,
        -- and no Form B record exists at all.
        SUM(CASE WHEN NOT {_BARRIER_SQL}
                 AND COALESCE(s.exclusion_present, FALSE) = FALSE
                 AND s.gestation_weeks IS NOT NULL AND s.gestation_weeks < 32
                 AND (s.consent_given IS NULL OR s.consent_given != 'Yes')
                 AND br.enrollment_id IS NULL
            THEN 1 ELSE 0 END) AS box6,

        -- Box 7: consented but never randomised.
        SUM(CASE WHEN s.consent_given = 'Yes'
                 AND COALESCE(br.randomised, FALSE) = FALSE
            THEN 1 ELSE 0 END) AS box7,
        SUM(CASE WHEN s.consent_given = 'Yes'
                 AND COALESCE(br.randomised, FALSE) = FALSE
                 AND br.resus_failure = TRUE
            THEN 1 ELSE 0 END) AS box7_resus_failure,
        SUM(CASE WHEN s.consent_given = 'Yes'
                 AND COALESCE(br.randomised, FALSE) = FALSE
                 AND br.reason_exit_trial_gas IS NOT NULL
                 AND br.reason_exit_trial_gas != ''
            THEN 1 ELSE 0 END) AS box7_exit_gas,

        -- Box 8: randomised. Denominator for Boxes 9-11.
        SUM(CASE WHEN br.randomised = TRUE THEN 1 ELSE 0 END) AS box8

    FROM screenings s
    LEFT JOIN birth_resuscitation br ON br.screening_id = s.screening_id
    WHERE s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
    GROUP BY s.site_name
""")

FOLLOWUP_QUERY = text("""
    SELECT
        s.site_name AS site_name,
        br.date_of_birth AS date_of_birth,
        br.gestation_weeks AS gestation_weeks,
        br.gestation_days AS gestation_days,
        co.death_before_36 AS death_before_36,
        co.assess_36_date AS assess_36_date,
        co.ltfu_reason_36 AS ltfu_reason_36,
        co.death_36_40 AS death_36_40,
        co.assess_40_date AS assess_40_date,
        co.ltfu_reason_40 AS ltfu_reason_40,
        co.death_40_44 AS death_40_44,
        co.assess_44_date AS assess_44_date,
        co.ltfu_reason_44 AS ltfu_reason_44
    FROM birth_resuscitation br
    JOIN screenings s ON s.screening_id = br.screening_id
    LEFT JOIN composite_outcomes co ON co.enrollment_id = br.enrollment_id
    WHERE br.randomised = TRUE
      AND s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
""")


def _as_date(value):
    """Normalise a DB date value that may come back as a date, datetime, or
    ISO string depending on driver/dialect."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _expected_date(dob, gest_weeks, gest_days, target_weeks):
    """Expected date of a PMA assessment given birth date and GA at birth."""
    dob = _as_date(dob)
    if dob is None or gest_weeks is None:
        return None
    days_at_birth = gest_weeks * 7 + (gest_days or 0)
    return dob + timedelta(days=(target_weeks * 7 - days_at_birth))


def _classify(today, assess_date, died, expected, grace_days=GRACE_DAYS):
    if died is True:
        return "died"
    if assess_date is not None:
        return "assessed"
    if expected is None:
        # Can't compute the expected window without DOB/GA at birth — default
        # to "awaiting" rather than silently mislabeling as lost to follow-up.
        return "awaiting"
    if today > expected + timedelta(days=grace_days):
        return "ltfu"
    return "awaiting"


def _zero_site_dict():
    return {site: 0 for site in ALL_SITES}


def _blank_screening_counts():
    return {
        "box1": 0, "box2": 0, "box2a": 0, "box2b": 0, "box2c": 0,
        "box4a": 0, "box4b": 0, "box4b_anomaly": 0, "box4b_hydrops": 0,
        "box5": 0, "box6": 0, "box7": 0, "box7_resus_failure": 0,
        "box7_exit_gas": 0, "box8": 0,
    }


def _compute_screening_boxes(db: Session):
    counts_by_site = {site: _blank_screening_counts() for site in ALL_SITES}
    refusal_reasons_by_site = {site: {} for site in ALL_SITES}

    for row in db.execute(SCREENING_QUERY).mappings():
        site = row["site_name"]
        if site not in counts_by_site:
            counts_by_site[site] = _blank_screening_counts()
            refusal_reasons_by_site[site] = {}
        for key in _blank_screening_counts():
            counts_by_site[site][key] = int(row[key] or 0)

    # Box 6 sub-reason breakdown: reason_for_consent_refusal (Issue #1 Fix 1).
    # Grouped on the raw stored string — if a woman selected multiple reasons
    # they were stored as one comma-joined value and appear as one row here.
    refusal_query = text(f"""
        SELECT s.site_name AS site_name,
               s.reason_for_consent_refusal AS reason,
               COUNT(*) AS n
        FROM screenings s
        LEFT JOIN birth_resuscitation br ON br.screening_id = s.screening_id
        WHERE s.is_deleted = FALSE
          AND s.site_name IS NOT NULL AND s.site_name != ''
          AND NOT {_BARRIER_SQL}
          AND COALESCE(s.exclusion_present, FALSE) = FALSE
          AND s.gestation_weeks IS NOT NULL AND s.gestation_weeks < 32
          AND (s.consent_given IS NULL OR s.consent_given != 'Yes')
          AND br.enrollment_id IS NULL
          AND s.reason_for_consent_refusal IS NOT NULL
          AND s.reason_for_consent_refusal != ''
        GROUP BY s.site_name, s.reason_for_consent_refusal
    """)
    for row in db.execute(refusal_query).mappings():
        site = row["site_name"]
        refusal_reasons_by_site.setdefault(site, {})
        refusal_reasons_by_site[site][row["reason"]] = int(row["n"] or 0)

    return counts_by_site, refusal_reasons_by_site


def _compute_followup_boxes(db: Session):
    today = date.today()
    # counts[box][state][site] -> int ; ltfu_reasons[box][site][reason] -> int
    boxes = {
        9: {s: {"died": 0, "assessed": 0, "ltfu": 0, "awaiting": 0} for s in ALL_SITES},
        10: {s: {"died": 0, "assessed": 0, "ltfu": 0, "awaiting": 0} for s in ALL_SITES},
        11: {s: {"died": 0, "assessed": 0, "ltfu": 0, "awaiting": 0} for s in ALL_SITES},
    }
    ltfu_reasons = {9: {s: {} for s in ALL_SITES}, 10: {s: {} for s in ALL_SITES}, 11: {s: {} for s in ALL_SITES}}

    for row in db.execute(FOLLOWUP_QUERY).mappings():
        site = row["site_name"]
        for box_map in (boxes, ltfu_reasons):
            for box in box_map:
                box_map[box].setdefault(site, {} if box_map is ltfu_reasons else {"died": 0, "assessed": 0, "ltfu": 0, "awaiting": 0})

        dob = row["date_of_birth"]
        gw, gd = row["gestation_weeks"], row["gestation_days"]

        exp36 = _expected_date(dob, gw, gd, 36)
        state36 = _classify(today, row["assess_36_date"], row["death_before_36"], exp36)
        boxes[9][site][state36] += 1
        if state36 == "ltfu" and row["ltfu_reason_36"]:
            ltfu_reasons[9][site][row["ltfu_reason_36"]] = ltfu_reasons[9][site].get(row["ltfu_reason_36"], 0) + 1

        if state36 == "died":
            continue  # not part of the 40w or 44w denominators

        exp40 = _expected_date(dob, gw, gd, 40)
        state40 = _classify(today, row["assess_40_date"], row["death_36_40"], exp40)
        boxes[10][site][state40] += 1
        if state40 == "ltfu" and row["ltfu_reason_40"]:
            ltfu_reasons[10][site][row["ltfu_reason_40"]] = ltfu_reasons[10][site].get(row["ltfu_reason_40"], 0) + 1

        if state40 == "died":
            continue  # not part of the 44w denominator

        exp44 = _expected_date(dob, gw, gd, 44)
        state44 = _classify(today, row["assess_44_date"], row["death_40_44"], exp44)
        boxes[11][site][state44] += 1
        if state44 == "ltfu" and row["ltfu_reason_44"]:
            ltfu_reasons[11][site][row["ltfu_reason_44"]] = ltfu_reasons[11][site].get(row["ltfu_reason_44"], 0) + 1

    return boxes, ltfu_reasons


def _sum_sites(per_site: dict, sites: list) -> int:
    return sum(per_site.get(s, 0) for s in sites)


def _row(box, label, per_site: dict, sites: list, sub_rows=None):
    r = {
        "box": box,
        "label": label,
        "overall": _sum_sites(per_site, sites),
        "by_site": {s: per_site.get(s, 0) for s in sites},
    }
    if sub_rows:
        r["sub_rows"] = sub_rows
    return r


def _build_rows(counts_by_site, refusal_reasons_by_site, followup_boxes, followup_ltfu_reasons, sites: list):
    def m(box_key):
        return {s: counts_by_site.get(s, _blank_screening_counts())[box_key] for s in ALL_SITES}

    box2a, box2b, box2c = m("box2a"), m("box2b"), m("box2c")
    box4b_anomaly, box4b_hydrops = m("box4b_anomaly"), m("box4b_hydrops")
    box7_resus, box7_exit = m("box7_resus_failure"), m("box7_exit_gas")

    # Box 6 sub-rows: one per distinct refusal-reason string seen at any site.
    all_reasons = sorted({r for site in refusal_reasons_by_site.values() for r in site})
    box6_sub_rows = []
    for reason in all_reasons:
        per_site = {s: refusal_reasons_by_site.get(s, {}).get(reason, 0) for s in ALL_SITES}
        box6_sub_rows.append(_row(None, reason, per_site, sites))

    rows = [
        _row(1, "Approached for screening", m("box1"), sites),
        _row(2, "Not screened", m("box2"), sites, sub_rows=[
            _row(None, "Insufficient time", box2a, sites),
            _row(None, "Decision to forego resuscitation", box2b, sites),
            _row(None, "IUFD at presentation", box2c, sites),
        ]),
        _row(3, "Screened for eligibility",
             {s: counts_by_site.get(s, _blank_screening_counts())["box1"] - counts_by_site.get(s, _blank_screening_counts())["box2"] for s in ALL_SITES},
             sites),
        _row(4, "Excluded after screening (ineligible)",
             {s: counts_by_site.get(s, _blank_screening_counts())["box4a"] + counts_by_site.get(s, _blank_screening_counts())["box4b"] for s in ALL_SITES},
             sites, sub_rows=[
                 _row(None, "Did not meet inclusion criteria (GA outside 25+0\u201331+6 weeks)", m("box4a"), sites),
                 _row(None, "Met inclusion criteria but had exclusion criteria", m("box4b"), sites, sub_rows=[
                     _row(None, "Structural anomaly", box4b_anomaly, sites),
                     _row(None, "Fetal hydrops", box4b_hydrops, sites),
                 ]),
             ]),
        _row(5, "Eligible", m("box5"), sites),
        _row(6, "Refused consent", m("box6"), sites, sub_rows=box6_sub_rows or None),
        _row(7, "Consented but not randomised", m("box7"), sites, sub_rows=[
            _row(None, "Resuscitation failure", box7_resus, sites),
            _row(None, "Exited trial gas", box7_exit, sites),
        ]),
        _row(8, "Randomised", m("box8"), sites),
    ]

    followup_labels = {9: "Status at 36 weeks PMA", 10: "Status at 40 weeks PMA", 11: "Status at 44 weeks PMA"}
    state_labels = [
        ("died", "Died", None),
        ("assessed", "Assessed", None),
        ("ltfu", "Lost to follow-up", "ltfu"),
        ("awaiting", "Awaiting assessment", "awaiting"),
    ]
    for box_num in (9, 10, 11):
        per_site_total = {s: sum(followup_boxes[box_num].get(s, {}).values()) for s in ALL_SITES}
        sub_rows = []
        for state_key, state_label, row_type in state_labels:
            per_site_state = {s: followup_boxes[box_num].get(s, {}).get(state_key, 0) for s in ALL_SITES}
            sub_row = _row(None, state_label, per_site_state, sites)
            sub_row["row_type"] = row_type or state_key
            if state_key == "ltfu":
                reasons_at_sites = followup_ltfu_reasons[box_num]
                distinct = sorted({r for site in reasons_at_sites.values() for r in site})
                if distinct:
                    sub_row["ltfu_reasons"] = [
                        _row(None, reason, {s: reasons_at_sites.get(s, {}).get(reason, 0) for s in ALL_SITES}, sites)
                        for reason in distinct
                    ]
            sub_rows.append(sub_row)
        rows.append(_row(box_num, followup_labels[box_num], per_site_total, sites, sub_rows=sub_rows))

    return rows


def _flatten_for_csv(rows, sites, depth=0):
    flat = []
    for r in rows:
        label = ("\u2014 " * depth) + r["label"]
        flat.append([label, r["overall"]] + [r["by_site"].get(s, 0) for s in sites])
        for sub in r.get("sub_rows", []) or []:
            flat.extend(_flatten_for_csv([sub], sites, depth + 1))
        for sub in r.get("ltfu_reasons", []) or []:
            flat.extend(_flatten_for_csv([sub], sites, depth + 1))
    return flat


@router.get("/consort")
def get_consort_flow(
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    global_view = is_global(current_user)

    if format == "csv" and not is_superadmin(current_user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="CSV export is superadmin-only")

    sites = ALL_SITES if global_view else [current_user.site_name] if current_user.site_name else []

    counts_by_site, refusal_reasons_by_site = _compute_screening_boxes(db)
    followup_boxes, followup_ltfu_reasons = _compute_followup_boxes(db)
    rows = _build_rows(counts_by_site, refusal_reasons_by_site, followup_boxes, followup_ltfu_reasons, sites)

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Label", "Overall"] + sites)
        for line in _flatten_for_csv(rows, sites):
            writer.writerow(line)
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=consort_flow.csv"},
        )

    return {
        "generated_at": generated_at,
        "sites": sites,
        "rows": rows,
        "footnotes": [
            "Sub-categories are not mutually exclusive.",
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2 — DATA QUALITY INDICATORS
# ═══════════════════════════════════════════════════════════════════════════

FORM_KEYS = [
    ("form_c",    "Form C — Maternal Details"),
    ("form_d",    "Form D — Postnatal Day 1"),
    ("form_e",    "Form E — NICU Admission"),
    ("form_f",    "Form F — Cranial USG"),
    ("form_h",    "Form H — Neonatal Morbidities"),
    ("form_j",    "Form J — Composite Outcomes"),
    ("fio2_auc",  "FiO₂ AUC Logs"),
    ("resp_cv",   "Resp/CV/Neuro Logs"),
    ("infect_gi", "Infect/GI/Hema Logs"),
    ("metab",     "Metab/Renal/Vasc/Eye Logs"),
]

COMPLETION_QUERY = text("""
    SELECT
        s.site_name,
        br.enrollment_id,
        CASE WHEN md.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS form_c,
        CASE WHEN pd.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS form_d,
        CASE WHEN na.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS form_e,
        CASE WHEN cu.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS form_f,
        CASE WHEN nm.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS form_h,
        CASE WHEN co.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS form_j,
        CASE WHEN fa.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS fio2_auc,
        CASE WHEN rc.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS resp_cv,
        CASE WHEN ig.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS infect_gi,
        CASE WHEN mv.enrollment_id  IS NOT NULL THEN 1 ELSE 0 END AS metab
    FROM birth_resuscitation br
    JOIN screenings s ON s.screening_id = br.screening_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM maternal_details)              md ON md.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM postnatal_day1)                pd ON pd.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM nicu_admission)                na ON na.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM cranial_usg_records)           cu ON cu.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM neonatal_morbidities)          nm ON nm.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM composite_outcomes)            co ON co.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM fio2_auc_logs)                 fa ON fa.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM resp_cv_neuro_day_logs)        rc ON rc.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM infect_gi_hema_day_logs)       ig ON ig.enrollment_id = br.enrollment_id
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM metab_renal_vasc_eye_day_logs) mv ON mv.enrollment_id = br.enrollment_id
    WHERE br.randomised = TRUE
      AND s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
""")

DAY_LOG_STATUS_QUERY = text("""
    SELECT
        s.site_name,
        t.tbl,
        t.submission_status,
        COUNT(*) AS n
    FROM (
        SELECT br.enrollment_id,
               'resp_cv_neuro'        AS tbl,
               COALESCE(dl.submission_status, 'empty') AS submission_status
        FROM birth_resuscitation br
        JOIN resp_cv_neuro_day_logs dl ON dl.enrollment_id = br.enrollment_id
        WHERE br.randomised = TRUE
        UNION ALL
        SELECT br.enrollment_id,
               'infect_gi_hema'       AS tbl,
               COALESCE(dl.submission_status, 'empty') AS submission_status
        FROM birth_resuscitation br
        JOIN infect_gi_hema_day_logs dl ON dl.enrollment_id = br.enrollment_id
        WHERE br.randomised = TRUE
        UNION ALL
        SELECT br.enrollment_id,
               'metab_renal_vasc_eye' AS tbl,
               COALESCE(dl.submission_status, 'empty') AS submission_status
        FROM birth_resuscitation br
        JOIN metab_renal_vasc_eye_day_logs dl ON dl.enrollment_id = br.enrollment_id
        WHERE br.randomised = TRUE
    ) t
    JOIN birth_resuscitation br2 ON br2.enrollment_id = t.enrollment_id
    JOIN screenings s ON s.screening_id = br2.screening_id
    WHERE s.is_deleted = FALSE AND s.site_name IS NOT NULL AND s.site_name != ''
    GROUP BY s.site_name, t.tbl, t.submission_status
""")

TIMELINESS_FORM_B_QUERY = text("""
    SELECT
        s.site_name,
        EXTRACT(EPOCH FROM (br.created_at - br.date_of_birth::timestamp)) / 3600.0 AS lag_hours
    FROM birth_resuscitation br
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE br.randomised = TRUE
      AND br.date_of_birth IS NOT NULL
      AND br.created_at IS NOT NULL
      AND s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
""")

TIMELINESS_DAY_LOGS_QUERY = text("""
    SELECT s.site_name, 'resp_cv_neuro' AS tbl,
        EXTRACT(EPOCH FROM (dl.saved_at - (br.date_of_birth::timestamp + (dl.nicu_day - 1) * INTERVAL '1 day'))) / 3600.0 AS lag_hours
    FROM resp_cv_neuro_day_logs dl
    JOIN birth_resuscitation br ON br.enrollment_id = dl.enrollment_id
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE br.randomised = TRUE AND dl.saved_at IS NOT NULL AND br.date_of_birth IS NOT NULL
      AND s.is_deleted = FALSE AND s.site_name IS NOT NULL AND s.site_name != ''
    UNION ALL
    SELECT s.site_name, 'infect_gi_hema' AS tbl,
        EXTRACT(EPOCH FROM (dl.saved_at - (br.date_of_birth::timestamp + (dl.nicu_day - 1) * INTERVAL '1 day'))) / 3600.0 AS lag_hours
    FROM infect_gi_hema_day_logs dl
    JOIN birth_resuscitation br ON br.enrollment_id = dl.enrollment_id
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE br.randomised = TRUE AND dl.saved_at IS NOT NULL AND br.date_of_birth IS NOT NULL
      AND s.is_deleted = FALSE AND s.site_name IS NOT NULL AND s.site_name != ''
    UNION ALL
    SELECT s.site_name, 'metab_renal_vasc_eye' AS tbl,
        EXTRACT(EPOCH FROM (dl.saved_at - (br.date_of_birth::timestamp + (dl.nicu_day - 1) * INTERVAL '1 day'))) / 3600.0 AS lag_hours
    FROM metab_renal_vasc_eye_day_logs dl
    JOIN birth_resuscitation br ON br.enrollment_id = dl.enrollment_id
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE br.randomised = TRUE AND dl.saved_at IS NOT NULL AND br.date_of_birth IS NOT NULL
      AND s.is_deleted = FALSE AND s.site_name IS NOT NULL AND s.site_name != ''
""")

ACTION_LIST_QUERY = text("""
    SELECT 'consented_no_form_b' AS issue, s.site_name, s.screening_id AS ref_id
    FROM screenings s
    WHERE s.consent_given = 'Yes' AND s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
      AND NOT EXISTS (SELECT 1 FROM birth_resuscitation br WHERE br.screening_id = s.screening_id)
    UNION ALL
    SELECT 'randomised_no_form_c' AS issue, s.site_name, br.enrollment_id AS ref_id
    FROM birth_resuscitation br
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE br.randomised = TRUE AND s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
      AND NOT EXISTS (SELECT 1 FROM maternal_details md WHERE md.enrollment_id = br.enrollment_id)
    UNION ALL
    SELECT 'randomised_no_form_i' AS issue, s.site_name, br.enrollment_id AS ref_id
    FROM birth_resuscitation br
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE br.randomised = TRUE AND s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
      AND NOT EXISTS (SELECT 1 FROM study_outcomes so WHERE so.enrollment_id = br.enrollment_id)
    UNION ALL
    SELECT 'few_day_logs' AS issue, s.site_name, br.enrollment_id AS ref_id
    FROM birth_resuscitation br
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE br.randomised = TRUE AND br.date_of_birth IS NOT NULL
      AND (CURRENT_DATE - br.date_of_birth) >= 7
      AND s.is_deleted = FALSE AND s.site_name IS NOT NULL AND s.site_name != ''
      AND (SELECT COUNT(*) FROM resp_cv_neuro_day_logs dl WHERE dl.enrollment_id = br.enrollment_id) < 7
""")

SITE_ACTIVITY_QUERY = text("""
    SELECT site_name, MAX(last_entry) AS last_entry FROM (
        SELECT site_name, MAX(created_at) AS last_entry
        FROM screenings
        WHERE is_deleted = FALSE AND site_name IS NOT NULL AND site_name != ''
        GROUP BY site_name
        UNION ALL
        SELECT s.site_name, MAX(d.created_at) AS last_entry
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        JOIN (
            SELECT enrollment_id, created_at FROM maternal_details
            UNION ALL SELECT enrollment_id, created_at FROM postnatal_day1
            UNION ALL SELECT enrollment_id, created_at FROM resp_cv_neuro_day_logs
            UNION ALL SELECT enrollment_id, created_at FROM infect_gi_hema_day_logs
            UNION ALL SELECT enrollment_id, created_at FROM metab_renal_vasc_eye_day_logs
        ) d ON d.enrollment_id = br.enrollment_id
        WHERE br.randomised = TRUE AND s.is_deleted = FALSE
          AND s.site_name IS NOT NULL AND s.site_name != ''
        GROUP BY s.site_name
    ) sub
    GROUP BY site_name
""")

WEEKLY_COUNTS_QUERY = text("""
    SELECT site_name,
           DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Kolkata') AS week_start,
           COUNT(*) AS n
    FROM (
        SELECT site_name, created_at FROM screenings
        WHERE is_deleted = FALSE AND site_name IS NOT NULL AND site_name != ''
          AND created_at >= NOW() - INTERVAL '28 days'
        UNION ALL
        SELECT s.site_name, br.created_at
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE s.is_deleted = FALSE AND s.site_name IS NOT NULL AND s.site_name != ''
          AND br.created_at >= NOW() - INTERVAL '28 days'
    ) t
    GROUP BY site_name, week_start
    ORDER BY week_start
""")


def _median_q1_q3(values):
    if not values:
        return None, None, None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    median = s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2
    q1 = s[n // 4]
    q3 = s[min(3 * n // 4, n - 1)]
    return round(median, 1), round(q1, 1), round(q3, 1)


@router.get("/data-quality")
def get_data_quality(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    global_view = is_global(current_user)
    sites = ALL_SITES if global_view else ([current_user.site_name] if current_user.site_name else [])
    site_set = set(sites)
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # ── 1. Completion matrix ──────────────────────────────────────────────
    site_totals = {s: 0 for s in ALL_SITES}
    site_counts = {s: {k: 0 for k, _ in FORM_KEYS} for s in ALL_SITES}
    for row in db.execute(COMPLETION_QUERY).mappings():
        site = row["site_name"]
        if site not in site_set:
            continue
        site_totals[site] = site_totals.get(site, 0) + 1
        for key, _ in FORM_KEYS:
            if row.get(key):
                site_counts[site][key] = site_counts[site].get(key, 0) + 1

    overall_total = sum(site_totals[s] for s in sites)
    overall_counts = {k: sum(site_counts[s].get(k, 0) for s in sites) for k, _ in FORM_KEYS}

    def _pct(n, total):
        return round(100 * n / total, 1) if total else None

    completion_matrix = {
        "forms": [{"key": k, "label": lbl} for k, lbl in FORM_KEYS],
        "overall": {
            "total": overall_total,
            **{k: {"n": overall_counts[k], "pct": _pct(overall_counts[k], overall_total)} for k, _ in FORM_KEYS},
        },
        "by_site": {
            s: {
                "total": site_totals[s],
                **{k: {"n": site_counts[s].get(k, 0), "pct": _pct(site_counts[s].get(k, 0), site_totals[s])} for k, _ in FORM_KEYS},
            }
            for s in sites
        },
    }

    # ── 2. Daily log submission status ────────────────────────────────────
    LOG_TABLES = [
        ("resp_cv_neuro",         "Resp/CV/Neuro"),
        ("infect_gi_hema",        "Infect/GI/Hema"),
        ("metab_renal_vasc_eye",  "Metab/Renal/Vasc/Eye"),
    ]
    STATUSES = ["empty", "draft", "complete", "submitted", "late"]
    log_data = {tbl: {s: {st: 0 for st in STATUSES} for s in ALL_SITES} for tbl, _ in LOG_TABLES}
    for row in db.execute(DAY_LOG_STATUS_QUERY).mappings():
        site = row["site_name"]
        if site not in site_set:
            continue
        tbl = row["tbl"]
        st = row["submission_status"] if row["submission_status"] in STATUSES else "empty"
        if tbl in log_data and site in log_data[tbl]:
            log_data[tbl][site][st] = log_data[tbl][site].get(st, 0) + int(row["n"] or 0)

    daily_log_status = []
    for tbl_key, tbl_label in LOG_TABLES:
        overall_st = {st: sum(log_data[tbl_key].get(s, {}).get(st, 0) for s in sites) for st in STATUSES}
        daily_log_status.append({
            "table": tbl_key,
            "label": tbl_label,
            "overall": overall_st,
            "by_site": {s: log_data[tbl_key].get(s, {st: 0 for st in STATUSES}) for s in sites},
        })

    # ── 3. Timeliness ─────────────────────────────────────────────────────
    formb_lags = {s: [] for s in ALL_SITES}
    for row in db.execute(TIMELINESS_FORM_B_QUERY).mappings():
        site = row["site_name"]
        if site in site_set and row["lag_hours"] is not None:
            h = float(row["lag_hours"])
            if 0 <= h <= 8760:
                formb_lags[site].append(h)

    log_lags = {tbl_key: {s: [] for s in ALL_SITES} for tbl_key, _ in LOG_TABLES}
    for row in db.execute(TIMELINESS_DAY_LOGS_QUERY).mappings():
        site = row["site_name"]
        tbl = row["tbl"]
        if site in site_set and row["lag_hours"] is not None:
            h = float(row["lag_hours"])
            if 0 <= h <= 8760 and tbl in log_lags and site in log_lags[tbl]:
                log_lags[tbl][site].append(h)

    def _timed_row(label, lags_by_site):
        all_vals = [v for s in sites for v in lags_by_site.get(s, [])]
        med, q1, q3 = _median_q1_q3(all_vals)
        by_site = {}
        for s in sites:
            m, q1s, q3s = _median_q1_q3(lags_by_site.get(s, []))
            by_site[s] = {"median": m, "q1": q1s, "q3": q3s, "n": len(lags_by_site.get(s, []))}
        return {"label": label, "unit": "hours", "overall": {"median": med, "q1": q1, "q3": q3, "n": len(all_vals)}, "by_site": by_site}

    timeliness = [_timed_row("Form B — Birth Resuscitation", formb_lags)]
    for tbl_key, tbl_label in LOG_TABLES:
        timeliness.append(_timed_row(f"{tbl_label} Daily Logs", log_lags.get(tbl_key, {})))

    # ── 4. Action list ────────────────────────────────────────────────────
    ACTION_LABELS = {
        "consented_no_form_b": "Consented but Form B (Birth Resuscitation) not yet entered",
        "randomised_no_form_c": "Randomised but Form C (Maternal Details) missing",
        "randomised_no_form_i": "Randomised but Form I (Study Outcomes) missing",
        "few_day_logs": "Randomised ≥7 days old with <7 Resp/CV/Neuro daily log entries",
    }
    action_counts = {key: {s: 0 for s in ALL_SITES} for key in ACTION_LABELS}
    for row in db.execute(ACTION_LIST_QUERY).mappings():
        site = row["site_name"]
        issue = row["issue"]
        if site in site_set and issue in action_counts:
            action_counts[issue][site] = action_counts[issue].get(site, 0) + 1

    action_list = []
    for key, label in ACTION_LABELS.items():
        overall = sum(action_counts[key].get(s, 0) for s in sites)
        action_list.append({
            "key": key,
            "label": label,
            "overall": overall,
            "by_site": {s: action_counts[key].get(s, 0) for s in sites},
        })

    # ── 5. Site activity ─────────────────────────────────────────────────
    last_entry = {s: None for s in sites}
    for row in db.execute(SITE_ACTIVITY_QUERY).mappings():
        site = row["site_name"]
        if site in site_set and row["last_entry"]:
            dt = row["last_entry"]
            last_entry[site] = dt.date().isoformat() if hasattr(dt, "date") else str(dt)[:10]

    today_date = date.today()
    inactive_flags = {
        s: (last_entry[s] is None or (today_date - date.fromisoformat(last_entry[s])).days >= 14)
        for s in sites
    }

    weekly_raw = {s: {} for s in sites}
    for row in db.execute(WEEKLY_COUNTS_QUERY).mappings():
        site = row["site_name"]
        if site in site_set and row["week_start"]:
            wk = row["week_start"]
            wk_str = wk.date().isoformat() if hasattr(wk, "date") else str(wk)[:10]
            weekly_raw[site][wk_str] = int(row["n"] or 0)

    week_starts = sorted({w for d in weekly_raw.values() for w in d})
    weekly_counts = {s: [weekly_raw[s].get(w, 0) for w in week_starts] for s in sites}

    return {
        "generated_at": generated_at,
        "sites": sites,
        "completion_matrix": completion_matrix,
        "daily_log_status": daily_log_status,
        "timeliness": timeliness,
        "action_list": action_list,
        "site_activity": {
            "last_entry": last_entry,
            "inactive_flags": inactive_flags,
            "week_labels": week_starts,
            "weekly_counts": weekly_counts,
        },
    }


# ============================================================
# SECTION 3 — CLINICAL CARE QUALITY
# GET /dashboard/clinical-quality
# ============================================================

def _cq_pct(n, d):
    if not d:
        return None
    return round(100 * (n or 0) / d, 1)


def _build_dr(r):
    n  = int(r["n"] or 0)
    nd = int(r["n_temp_dr_recorded"] or 0)
    return {
        "n": n,
        "placental_transfusion": {"n": int(r["n_placental_transfusion"] or 0), "pct": _cq_pct(r["n_placental_transfusion"], n)},
        "cord_clamp_time": {
            "median": int(r["median_cord_clamp"]) if r["median_cord_clamp"] is not None else None,
            "p25":    int(r["p25_cord_clamp"])    if r["p25_cord_clamp"]    is not None else None,
            "p75":    int(r["p75_cord_clamp"])    if r["p75_cord_clamp"]    is not None else None,
        },
        "hypothermia_dr":    {"n": int(r["n_hypothermia_dr"] or 0),    "pct": _cq_pct(r["n_hypothermia_dr"],    nd), "denominator": nd},
        "ppv":               {"n": int(r["n_ppv"] or 0),               "pct": _cq_pct(r["n_ppv"],               n)},
        "intubation":        {"n": int(r["n_intubation"] or 0),        "pct": _cq_pct(r["n_intubation"],        n)},
        "chest_compression": {"n": int(r["n_chest_compression"] or 0), "pct": _cq_pct(r["n_chest_compression"], n)},
        "adrenaline":        {"n": int(r["n_adrenaline"] or 0),        "pct": _cq_pct(r["n_adrenaline"],        n)},
    }


def _build_gh(r):
    n  = int(r["n"] or 0)
    nt = int(r["n_temp_axillary_recorded"] or 0)
    return {
        "n": n,
        "plastic_wrap":     {"n": int(r["n_plastic_wrap"] or 0),   "pct": _cq_pct(r["n_plastic_wrap"],   n)},
        "immediate_kmc":    {"n": int(r["n_immediate_kmc"] or 0),  "pct": _cq_pct(r["n_immediate_kmc"],  n)},
        "early_cpap":       {"n": int(r["n_early_cpap"] or 0),     "pct": _cq_pct(r["n_early_cpap"],     n)},
        "caffeine":         {"n": int(r["n_caffeine"] or 0),       "pct": _cq_pct(r["n_caffeine"],       n)},
        "surfactant":       {"n": int(r["n_surfactant"] or 0),     "pct": _cq_pct(r["n_surfactant"],     n)},
        "hypothermia_nicu": {"n": int(r["n_hypothermia_nicu"] or 0), "pct": _cq_pct(r["n_hypothermia_nicu"], nt), "denominator": nt},
    }


def _build_resp(r):
    n = int(r["n_logs"] or 0)
    return {
        "n_logs":          n,
        "invasive_vent":   {"n": int(r["n_invasive"] or 0),        "pct": _cq_pct(r["n_invasive"],        n)},
        "cpap":            {"n": int(r["n_cpap"] or 0),            "pct": _cq_pct(r["n_cpap"],            n)},
        "hfnc":            {"n": int(r["n_hfnc"] or 0),            "pct": _cq_pct(r["n_hfnc"],            n)},
        "room_air":        {"n": int(r["n_room_air"] or 0),        "pct": _cq_pct(r["n_room_air"],        n)},
        "surfactant_days": {"n": int(r["n_surfactant_days"] or 0), "pct": _cq_pct(r["n_surfactant_days"], n)},
        "caffeine_days":   {"n": int(r["n_caffeine_days"] or 0),   "pct": _cq_pct(r["n_caffeine_days"],   n)},
        "pphn":            {"n": int(r["n_pphn"] or 0),            "pct": _cq_pct(r["n_pphn"],            n)},
        "pulm_hemorrhage": {"n": int(r["n_pulm_hemorrhage"] or 0), "pct": _cq_pct(r["n_pulm_hemorrhage"], n)},
        "pneumothorax":    {"n": int(r["n_pneumothorax"] or 0),    "pct": _cq_pct(r["n_pneumothorax"],    n)},
    }


def _build_nutr(r):
    n = int(r["n_logs"] or 0)
    return {
        "n_logs":            n,
        "enteral":           {"n": int(r["n_enteral"] or 0),           "pct": _cq_pct(r["n_enteral"],           n)},
        "ebm":               {"n": int(r["n_ebm"] or 0),               "pct": _cq_pct(r["n_ebm"],               n)},
        "pdhm":              {"n": int(r["n_pdhm"] or 0),              "pct": _cq_pct(r["n_pdhm"],              n)},
        "pn":                {"n": int(r["n_pn"] or 0),                "pct": _cq_pct(r["n_pn"],                n)},
        "nec_suspected":     {"n": int(r["n_nec_suspected"] or 0),     "pct": _cq_pct(r["n_nec_suspected"],     n)},
        "nec_confirmed":     {"n": int(r["n_nec_confirmed"] or 0),     "pct": _cq_pct(r["n_nec_confirmed"],     n)},
        "jaundice_days":     {"n": int(r["n_jaundice_days"] or 0),     "pct": _cq_pct(r["n_jaundice_days"],     n)},
        "phototherapy_days": {"n": int(r["n_phototherapy_days"] or 0), "pct": _cq_pct(r["n_phototherapy_days"], n)},
    }


def _build_infect(r):
    n  = int(r["n_logs"] or 0)
    ns = int(r["n_sepsis_suspected"] or 0)
    nc = int(r["n_culture_sent"] or 0)
    return {
        "n_logs":           n,
        "sepsis_suspected": {"n": ns, "pct": _cq_pct(ns, n)},
        "culture_sent_when_suspected": {
            "n": int(r["n_culture_sent_when_suspected"] or 0),
            "pct": _cq_pct(r["n_culture_sent_when_suspected"], ns),
            "denominator": ns,
        },
        "culture_positive": {
            "n": int(r["n_culture_positive"] or 0),
            "pct": _cq_pct(r["n_culture_positive"], nc),
            "denominator": nc,
        },
        "antibiotic_days": {"n": int(r["n_antibiotic_days"] or 0), "pct": _cq_pct(r["n_antibiotic_days"], n)},
        "clabsi":          {"n": int(r["n_clabsi"] or 0),          "pct": _cq_pct(r["n_clabsi"],          n)},
        "vap":             {"n": int(r["n_vap"] or 0),             "pct": _cq_pct(r["n_vap"],             n)},
    }


def _cq_split(rows, builder):
    overall, by_site = {}, {}
    for r in rows:
        sn = r["site_name"]
        if sn is None or sn == "__overall__":
            overall = builder(r)
        else:
            by_site[sn] = builder(r)
    return {"overall": overall, "by_site": by_site}


@router.get("/clinical-quality")
def get_clinical_quality(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.lower() != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")

    DR_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(br.enrollment_id)                                                              AS n,
            SUM(CASE WHEN br.placental_transfusion  THEN 1 ELSE 0 END)                          AS n_placental_transfusion,
            ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY br.cord_clamp_time))             AS median_cord_clamp,
            ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY br.cord_clamp_time))             AS p25_cord_clamp,
            ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY br.cord_clamp_time))             AS p75_cord_clamp,
            SUM(CASE WHEN na.temp_dr IS NOT NULL                        THEN 1 ELSE 0 END)      AS n_temp_dr_recorded,
            SUM(CASE WHEN na.temp_dr IS NOT NULL AND na.temp_dr < 36.5  THEN 1 ELSE 0 END)     AS n_hypothermia_dr,
            SUM(CASE WHEN br.ppv_required       THEN 1 ELSE 0 END)                              AS n_ppv,
            SUM(CASE WHEN br.intubation         THEN 1 ELSE 0 END)                              AS n_intubation,
            SUM(CASE WHEN br.chest_compression  THEN 1 ELSE 0 END)                              AS n_chest_compression,
            SUM(CASE WHEN br.adrenaline         THEN 1 ELSE 0 END)                              AS n_adrenaline
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        LEFT JOIN nicu_admission na ON na.enrollment_id = br.enrollment_id
        WHERE br.randomised = TRUE AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    GH_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(pd.enrollment_id)                                                                        AS n,
            SUM(CASE WHEN pd.plastic_wrap        THEN 1 ELSE 0 END)                                       AS n_plastic_wrap,
            SUM(CASE WHEN pd.immediate_kmc       THEN 1 ELSE 0 END)                                       AS n_immediate_kmc,
            SUM(CASE WHEN pd.early_cpap          THEN 1 ELSE 0 END)                                       AS n_early_cpap,
            SUM(CASE WHEN pd.caffeine            THEN 1 ELSE 0 END)                                       AS n_caffeine,
            SUM(CASE WHEN pd.surfactant_required THEN 1 ELSE 0 END)                                       AS n_surfactant,
            SUM(CASE WHEN na.temp_axillary IS NOT NULL                               THEN 1 ELSE 0 END)   AS n_temp_axillary_recorded,
            SUM(CASE WHEN na.temp_axillary IS NOT NULL AND na.temp_axillary < 36.5  THEN 1 ELSE 0 END)   AS n_hypothermia_nicu
        FROM postnatal_day1 pd
        JOIN birth_resuscitation br ON br.enrollment_id = pd.enrollment_id AND br.randomised = TRUE
        JOIN screenings s ON s.screening_id = br.screening_id
        LEFT JOIN nicu_admission na ON na.enrollment_id = pd.enrollment_id
        WHERE s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    RESP_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(*)                                                                                    AS n_logs,
            SUM(CASE WHEN r.endotracheal_intubation                          THEN 1 ELSE 0 END)        AS n_invasive,
            SUM(CASE WHEN NOT COALESCE(r.endotracheal_intubation, FALSE)
                          AND r.support_modes ILIKE '%%cpap%%'               THEN 1 ELSE 0 END)        AS n_cpap,
            SUM(CASE WHEN NOT COALESCE(r.endotracheal_intubation, FALSE)
                          AND (r.support_modes ILIKE '%%hfnc%%'
                            OR r.support_modes ILIKE '%%high flow%%')        THEN 1 ELSE 0 END)        AS n_hfnc,
            SUM(CASE WHEN r.respiratory_support = FALSE                      THEN 1 ELSE 0 END)        AS n_room_air,
            SUM(CASE WHEN r.surfactant                                       THEN 1 ELSE 0 END)        AS n_surfactant_days,
            SUM(CASE WHEN r.caffeine                                         THEN 1 ELSE 0 END)        AS n_caffeine_days,
            SUM(CASE WHEN r.pphn                                             THEN 1 ELSE 0 END)        AS n_pphn,
            SUM(CASE WHEN r.pulm_hemorrhage                                  THEN 1 ELSE 0 END)        AS n_pulm_hemorrhage,
            SUM(CASE WHEN r.pneumothorax                                     THEN 1 ELSE 0 END)        AS n_pneumothorax
        FROM resp_cv_neuro_day_logs r
        JOIN birth_resuscitation br ON br.enrollment_id = r.enrollment_id AND br.randomised = TRUE
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE r.submission_status IN ('complete', 'submitted', 'late') AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    NUTR_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(*)                                                                                            AS n_logs,
            SUM(CASE WHEN i.enteral_feeds_received                                           THEN 1 ELSE 0 END) AS n_enteral,
            SUM(CASE WHEN i.feed_type ILIKE '%%EBM%%'                                        THEN 1 ELSE 0 END) AS n_ebm,
            SUM(CASE WHEN i.feed_type ILIKE '%%PDHM%%' OR i.feed_type ILIKE '%%DHM%%'        THEN 1 ELSE 0 END) AS n_pdhm,
            SUM(CASE WHEN i.parenteral_nutrition                                              THEN 1 ELSE 0 END) AS n_pn,
            SUM(CASE WHEN i.nec_suspected                                                    THEN 1 ELSE 0 END) AS n_nec_suspected,
            SUM(CASE WHEN i.nec_confirmed_stage IS NOT NULL AND i.nec_confirmed_stage != ''  THEN 1 ELSE 0 END) AS n_nec_confirmed,
            SUM(CASE WHEN i.jaundice                                                         THEN 1 ELSE 0 END) AS n_jaundice_days,
            SUM(CASE WHEN i.phototherapy                                                     THEN 1 ELSE 0 END) AS n_phototherapy_days
        FROM infect_gi_hema_day_logs i
        JOIN birth_resuscitation br ON br.enrollment_id = i.enrollment_id AND br.randomised = TRUE
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE i.submission_status IN ('complete', 'submitted', 'late') AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    INFECT_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(*)                                                                       AS n_logs,
            SUM(CASE WHEN i.sepsis_suspected                          THEN 1 ELSE 0 END)  AS n_sepsis_suspected,
            SUM(CASE WHEN i.sepsis_suspected AND i.blood_culture_sent THEN 1 ELSE 0 END)  AS n_culture_sent_when_suspected,
            SUM(CASE WHEN i.blood_culture_sent                        THEN 1 ELSE 0 END)  AS n_culture_sent,
            SUM(CASE WHEN i.blood_culture_positive                    THEN 1 ELSE 0 END)  AS n_culture_positive,
            SUM(CASE WHEN i.antibiotics                               THEN 1 ELSE 0 END)  AS n_antibiotic_days,
            SUM(CASE WHEN i.clabsi                                    THEN 1 ELSE 0 END)  AS n_clabsi,
            SUM(CASE WHEN i.vap                                       THEN 1 ELSE 0 END)  AS n_vap
        FROM infect_gi_hema_day_logs i
        JOIN birth_resuscitation br ON br.enrollment_id = i.enrollment_id AND br.randomised = TRUE
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE i.submission_status IN ('complete', 'submitted', 'late') AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    def run(q):
        return db.execute(q).mappings().all()

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "delivery_room": _cq_split(run(DR_Q),     _build_dr),
        "golden_hour":   _cq_split(run(GH_Q),     _build_gh),
        "respiratory":   _cq_split(run(RESP_Q),   _build_resp),
        "nutrition":     _cq_split(run(NUTR_Q),   _build_nutr),
        "infection":     _cq_split(run(INFECT_Q), _build_infect),
    }


# ============================================================
# SECTION 4 — BASELINE CHARACTERISTICS
# GET /dashboard/baseline
# ============================================================

def _bl_pct(n, d):
    if not d:
        return None
    return round(100 * (n or 0) / d, 1)


def _build_infant(r):
    n  = int(r["n"] or 0)
    nc = int(r["n_centile_recorded"] or 0)
    return {
        "n": n,
        "ga_weeks": {
            "median": float(r["median_ga"]) if r["median_ga"] is not None else None,
            "p25":    float(r["p25_ga"])    if r["p25_ga"]    is not None else None,
            "p75":    float(r["p75_ga"])    if r["p75_ga"]    is not None else None,
        },
        "birth_weight_g": {
            "median": int(r["median_bw"]) if r["median_bw"] is not None else None,
            "p25":    int(r["p25_bw"])    if r["p25_bw"]    is not None else None,
            "p75":    int(r["p75_bw"])    if r["p75_bw"]    is not None else None,
        },
        "male":    {"n": int(r["n_male"] or 0),    "pct": _bl_pct(r["n_male"],    n)},
        "dsd":     {"n": int(r["n_dsd"] or 0),     "pct": _bl_pct(r["n_dsd"],     n)},
        "sga":     {"n": int(r["n_sga"] or 0),     "pct": _bl_pct(r["n_sga"],     nc), "denominator": nc},
        "vaginal": {"n": int(r["n_vaginal"] or 0), "pct": _bl_pct(r["n_vaginal"], n)},
        "lscs":    {"n": int(r["n_lscs"] or 0),    "pct": _bl_pct(r["n_lscs"],    n)},
    }


def _build_antenatal(r):
    n  = int(r["n"] or 0)
    ns = int(r["n_steroids"] or 0)
    return {
        "n": n,
        "steroids":          {"n": ns,                                "pct": _bl_pct(ns,                         n)},
        "complete_steroids": {"n": int(r["n_complete_steroids"] or 0),"pct": _bl_pct(r["n_complete_steroids"],   ns), "denominator": ns},
        "mgso4":             {"n": int(r["n_mgso4"] or 0),           "pct": _bl_pct(r["n_mgso4"],               n)},
        "hdp":               {"n": int(r["n_hdp"] or 0),             "pct": _bl_pct(r["n_hdp"],                 n)},
        "pprom":             {"n": int(r["n_pprom"] or 0),           "pct": _bl_pct(r["n_pprom"],               n)},
        "fgr":               {"n": int(r["n_fgr"] or 0),             "pct": _bl_pct(r["n_fgr"],                 n)},
        "multiple":          {"n": int(r["n_multiple"] or 0),        "pct": _bl_pct(r["n_multiple"],            n)},
    }


def _bl_split(rows, builder):
    overall, by_site = {}, {}
    for r in rows:
        sn = r["site_name"]
        if sn is None or sn == "__overall__":
            overall = builder(r)
        else:
            by_site[sn] = builder(r)
    return {"overall": overall, "by_site": by_site}


@router.get("/baseline")
def get_baseline(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.lower() != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")

    INFANT_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(br.enrollment_id)                                                                                      AS n,
            ROUND(CAST(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY br.gestation_weeks + br.gestation_days / 7.0) AS numeric), 1) AS median_ga,
            ROUND(CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY br.gestation_weeks + br.gestation_days / 7.0) AS numeric), 1) AS p25_ga,
            ROUND(CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY br.gestation_weeks + br.gestation_days / 7.0) AS numeric), 1) AS p75_ga,
            ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY br.birth_weight))                                        AS median_bw,
            ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY br.birth_weight))                                        AS p25_bw,
            ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY br.birth_weight))                                        AS p75_bw,
            SUM(CASE WHEN br.gender = 'Male'                                                          THEN 1 ELSE 0 END) AS n_male,
            SUM(CASE WHEN br.gender NOT IN ('Male', 'Female') AND br.gender IS NOT NULL               THEN 1 ELSE 0 END) AS n_dsd,
            SUM(CASE WHEN br.intrauterine_centile ~ '^[0-9.]+$'
                      AND CAST(br.intrauterine_centile AS FLOAT) < 10                                 THEN 1 ELSE 0 END) AS n_sga,
            SUM(CASE WHEN br.intrauterine_centile ~ '^[0-9.]+$'                                       THEN 1 ELSE 0 END) AS n_centile_recorded,
            SUM(CASE WHEN br.delivery_mode = 'Vaginal'                                                THEN 1 ELSE 0 END) AS n_vaginal,
            SUM(CASE WHEN br.delivery_mode = 'LSCS'                                                   THEN 1 ELSE 0 END) AS n_lscs
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE br.randomised = TRUE AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    ANTENATAL_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(md.enrollment_id)                                                                                          AS n,
            SUM(CASE WHEN LOWER(md.antenatal_steroids) = 'yes'                                               THEN 1 ELSE 0 END) AS n_steroids,
            SUM(CASE WHEN LOWER(md.antenatal_steroids) = 'yes' AND md.steroid_doses IN ('2', '4')            THEN 1 ELSE 0 END) AS n_complete_steroids,
            SUM(CASE WHEN LOWER(md.antenatal_mgso4) = 'yes'                                                  THEN 1 ELSE 0 END) AS n_mgso4,
            SUM(CASE WHEN LOWER(md.hdp) = 'yes'                                                              THEN 1 ELSE 0 END) AS n_hdp,
            SUM(CASE WHEN LOWER(md.pprom) = 'yes'                                                            THEN 1 ELSE 0 END) AS n_pprom,
            SUM(CASE WHEN LOWER(md.fgr) = 'yes'                                                              THEN 1 ELSE 0 END) AS n_fgr,
            SUM(CASE WHEN md.multiple IS NOT NULL AND LOWER(md.multiple) NOT IN ('no', 'singleton', '')      THEN 1 ELSE 0 END) AS n_multiple
        FROM maternal_details md
        JOIN birth_resuscitation br ON br.enrollment_id = md.enrollment_id AND br.randomised = TRUE
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    def run(q):
        return db.execute(q).mappings().all()

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "infant":     _bl_split(run(INFANT_Q),     _build_infant),
        "antenatal":  _bl_split(run(ANTENATAL_Q),  _build_antenatal),
    }


# ============================================================
# SECTION 5 — ADVERSE EVENTS AND SAEs
# GET /dashboard/safety
# ============================================================

def _sf_pct(n, d):
    if not d:
        return None
    return round(100 * (n or 0) / d, 1)


def _build_safety_row(r, total_n):
    n = int(r["n"] or 0)
    return {"n": n, "pct": _sf_pct(n, total_n)}


@router.get("/safety")
def get_safety(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.lower() != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")

    # Total randomised per site (denominator)
    DENOM_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(br.enrollment_id) AS n
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE br.randomised = TRUE AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    # SAE counts by site
    SAE_Q = text("""
        SELECT
            COALESCE(sr.site, '__overall__') AS site_name,
            COUNT(*) AS n_sae,
            SUM(CASE WHEN LOWER(sr.severity) = 'mild'     THEN 1 ELSE 0 END) AS n_mild,
            SUM(CASE WHEN LOWER(sr.severity) = 'moderate' THEN 1 ELSE 0 END) AS n_moderate,
            SUM(CASE WHEN LOWER(sr.severity) = 'severe'   THEN 1 ELSE 0 END) AS n_severe,
            SUM(CASE WHEN LOWER(sr.causality) IN ('probable','definite','possible') THEN 1 ELSE 0 END) AS n_related,
            SUM(CASE WHEN LOWER(sr.outcome) = 'fatal'     THEN 1 ELSE 0 END) AS n_fatal
        FROM sae_reports sr
        GROUP BY GROUPING SETS ((sr.site), ())
    """)

    # Mortality from study_outcomes (joined to randomised cohort)
    MORT_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(so.enrollment_id)                                                                AS n,
            SUM(CASE WHEN so.mortality_in_hospital = TRUE    THEN 1 ELSE 0 END) AS n_hosp,
            SUM(CASE WHEN so.mortality_7_days = TRUE         THEN 1 ELSE 0 END) AS n_7d,
            SUM(CASE WHEN so.mortality_28_days = TRUE        THEN 1 ELSE 0 END) AS n_28d,
            SUM(CASE WHEN so.mortality_after_discharge = TRUE THEN 1 ELSE 0 END) AS n_post_dc
        FROM study_outcomes so
        JOIN birth_resuscitation br ON br.enrollment_id = so.enrollment_id AND br.randomised = TRUE
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    # Major morbidities from neonatal_morbidities
    MORB_Q = text("""
        SELECT
            COALESCE(s.site_name, '__overall__') AS site_name,
            COUNT(nm.enrollment_id)                                                                          AS n,
            SUM(CASE WHEN nm.ivh_present = 'Yes'                                               THEN 1 ELSE 0 END) AS n_ivh_any,
            SUM(CASE WHEN nm.ivh_present = 'Yes' AND nm.ivh_grade IN ('3','4')                 THEN 1 ELSE 0 END) AS n_ivh_severe,
            SUM(CASE WHEN nm.nec = TRUE                                                        THEN 1 ELSE 0 END) AS n_nec_any,
            SUM(CASE WHEN nm.nec = TRUE AND nm.nec_stage IN ('2','3','2a','2b','3a','3b')      THEN 1 ELSE 0 END) AS n_nec_2plus,
            SUM(CASE WHEN nm.bpd = TRUE                                                        THEN 1 ELSE 0 END) AS n_bpd,
            SUM(CASE WHEN nm.rop_treatment = 'Yes'                                             THEN 1 ELSE 0 END) AS n_rop_tx,
            SUM(CASE WHEN nm.sepsis = TRUE                                                     THEN 1 ELSE 0 END) AS n_sepsis,
            SUM(CASE WHEN nm.pneumothorax = TRUE                                               THEN 1 ELSE 0 END) AS n_pneumo
        FROM neonatal_morbidities nm
        JOIN birth_resuscitation br ON br.enrollment_id = nm.enrollment_id AND br.randomised = TRUE
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE s.site_name NOT IN ('', 'DRAFT')
        GROUP BY GROUPING SETS ((s.site_name), ())
    """)

    def run(q):
        return db.execute(q).mappings().all()

    denom_rows = run(DENOM_Q)
    denom_overall = {r["site_name"] if r["site_name"] else "__overall__": int(r["n"] or 0) for r in denom_rows}
    total_n = denom_overall.get("__overall__", 0) or denom_overall.get(None, 0)

    def denom_for(site):
        return denom_overall.get(site, 0) or denom_overall.get("__overall__" if site is None else site, 0)

    # Build SAE summary
    sae_rows = run(SAE_Q)
    sae_overall, sae_by_site = {}, {}
    for r in sae_rows:
        sn = r["site_name"]
        d = {
            "n_sae": int(r["n_sae"] or 0),
            "n_mild": int(r["n_mild"] or 0),
            "n_moderate": int(r["n_moderate"] or 0),
            "n_severe": int(r["n_severe"] or 0),
            "n_related": int(r["n_related"] or 0),
            "n_fatal": int(r["n_fatal"] or 0),
        }
        if sn is None or sn == "__overall__":
            sae_overall = d
        else:
            sae_by_site[sn] = d
    if not sae_overall:
        sae_overall = {"n_sae": 0, "n_mild": 0, "n_moderate": 0, "n_severe": 0, "n_related": 0, "n_fatal": 0}

    # Build mortality
    def _build_mort(r):
        n = int(r["n"] or 0)
        return {
            "n": n,
            "in_hospital":       {"n": int(r["n_hosp"]   or 0), "pct": _sf_pct(r["n_hosp"],   n)},
            "at_7_days":         {"n": int(r["n_7d"]     or 0), "pct": _sf_pct(r["n_7d"],     n)},
            "at_28_days":        {"n": int(r["n_28d"]    or 0), "pct": _sf_pct(r["n_28d"],    n)},
            "after_discharge":   {"n": int(r["n_post_dc"] or 0), "pct": _sf_pct(r["n_post_dc"], n)},
        }

    mort_rows = run(MORT_Q)
    mort_overall, mort_by_site = {}, {}
    for r in mort_rows:
        sn = r["site_name"]
        if sn is None or sn == "__overall__":
            mort_overall = _build_mort(r)
        else:
            mort_by_site[sn] = _build_mort(r)

    # Build morbidities
    def _build_morb(r):
        n = int(r["n"] or 0)
        return {
            "n": n,
            "ivh_any":    {"n": int(r["n_ivh_any"]    or 0), "pct": _sf_pct(r["n_ivh_any"],    n)},
            "ivh_severe": {"n": int(r["n_ivh_severe"]  or 0), "pct": _sf_pct(r["n_ivh_severe"], n)},
            "nec_any":    {"n": int(r["n_nec_any"]    or 0), "pct": _sf_pct(r["n_nec_any"],    n)},
            "nec_2plus":  {"n": int(r["n_nec_2plus"]  or 0), "pct": _sf_pct(r["n_nec_2plus"],  n)},
            "bpd":        {"n": int(r["n_bpd"]        or 0), "pct": _sf_pct(r["n_bpd"],        n)},
            "rop_tx":     {"n": int(r["n_rop_tx"]     or 0), "pct": _sf_pct(r["n_rop_tx"],     n)},
            "sepsis":     {"n": int(r["n_sepsis"]     or 0), "pct": _sf_pct(r["n_sepsis"],     n)},
            "pneumo":     {"n": int(r["n_pneumo"]     or 0), "pct": _sf_pct(r["n_pneumo"],     n)},
        }

    morb_rows = run(MORB_Q)
    morb_overall, morb_by_site = {}, {}
    for r in morb_rows:
        sn = r["site_name"]
        if sn is None or sn == "__overall__":
            morb_overall = _build_morb(r)
        else:
            morb_by_site[sn] = _build_morb(r)

    # Sites list (from denominator)
    sites = [k for k in denom_overall if k not in (None, "__overall__")]

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "sites": sites,
        "randomised_n": total_n,
        "sae": {
            "overall": sae_overall,
            "by_site": sae_by_site,
        },
        "mortality": {
            "overall": mort_overall,
            "by_site": mort_by_site,
        },
        "morbidity": {
            "overall": morb_overall,
            "by_site": morb_by_site,
        },
    }


# ============================================================
# SECTION 6 — ENROLLMENT TREND & FORECAST
# GET /dashboard/enrollment-trend
# ============================================================

@router.get("/enrollment-trend")
def get_enrollment_trend(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.lower() != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")

    TREND_Q = text("""
        SELECT
            DATE(br.created_at) AS enrol_date,
            COUNT(*)            AS daily_n
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE br.randomised = TRUE
          AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY DATE(br.created_at)
        ORDER BY enrol_date
    """)

    rows = db.execute(TREND_Q).mappings().all()

    by_date = []
    cumulative = 0
    for r in rows:
        cumulative += int(r["daily_n"])
        by_date.append({
            "date":       str(r["enrol_date"]),
            "n":          int(r["daily_n"]),
            "cumulative": cumulative,
        })

    return {
        "generated_at":     datetime.utcnow().isoformat(),
        "total_randomised": cumulative,
        "by_date":          by_date,
    }
