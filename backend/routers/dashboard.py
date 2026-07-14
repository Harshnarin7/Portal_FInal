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
