"""CONSORT participant flow table — trial monitoring dashboard, Section 1.

Implements the box-by-box logic from the CONSORT dashboard spec, with one
deliberate deviation from the original spec text: Box 4a/4b/5 do NOT filter
on `screening_status`. The live `compute_screening_status()` logic in
main.py maps every excluded record (anomaly / hydrops / GA-out-of-range) to
'Screen Failure', not 'Not Eligible' — so a literal `screening_status =
'Not Eligible'` filter would silently return zero rows for those boxes.
Instead we derive ineligibility directly from `exclusion_present` and
`gestation_weeks`/`gestation_days` (25w0d–31w6d window), which is what
`compute_screening_status()` itself is built from. See Harsh's decision on
this (July 2026) before changing it.

**Box 1-4 rearranged 2026-09-24** (PI-directed CONSORT redesign, see
project_portal_aws memory for the full 5-point design discussion). Two
terms that used to be synonymous are now deliberately different
populations:
- Box 1 "Approached for Screening" = every `ga_check_log` (GACheckEntry)
  row — the Gestation (Inclusion Criteria) Screening Log's own total,
  literal, not corrected for the "never_checked" gap (see below).
- Box 3 "Screened for Eligibility" = every `screenings` (Form A) row —
  can ONLY ever be reached from a Gestation Log entry that was Reliable
  and <32 weeks (or a direct Form A entry bypassing the log entirely).

Box 2 "Not Screened" is deliberately NOT `Box1 - Box3` — it also counts
births known only from `birth_log_all_births` with no matching Gestation
Log entry at all ("never_checked"), a population Box 1's own total does
not include (explicit PI decision: Box 1 stays the literal Gestation Log
count, accepting that top-level Approached/Screened/Not-Screened
arithmetic will not perfectly balance as a result — see the "not_screened
mismatch" footnote emitted below).

IUFD moved from a Form A post-screening exclusion (Box 4b) to a
pre-screening Box 2 outcome, captured going forward via
`GACheckEntry.found_iufd` — historical Form A records with
`exclusion_reasons LIKE '%IUFD%'` are NOT retroactively reclassified (they
already produced a real Form A row, so they still count under Box 3;
their legacy IUFD text is surfaced as a small separate Box 4b sub-reason
rather than silently dropped or double-counted).

"Insufficient time" is now two differently-labeled events depending on
stage: pre-Form-A ("No time to approach to screen", from
`birth_log_all_births.reason_not_approached`, under Box 2's never-checked
sub-reason) vs. post-Form-A ("No time to approach for consent", from
`Screening.insufficient_time` via `exclusion_reasons`, under Box 4b) — the
same real-world event class, different point in the pathway.

"Forego resuscitation" moved from a pre-screening barrier (old Box 2) to
a Box 4b post-screening exclusion — it's answered ON Form A (item within
A4), meaning Form A genuinely was filled before this exclusion applied,
which is the post-screening case by definition.

Box 7 "Consented — Not randomised" sub-reasons are now a dynamic
breakdown of Form B's own `enrollment_reason_not_randomized` dropdown
(same pattern Box 6 already uses for `reason_for_consent_refusal`) plus a
separate "Vigorous, no PPV needed" bucket auto-derived from
`required_resuscitation = FALSE` — a population `applyInitialStepsNotRequired()`
in BirthResuscitationForm.jsx has always explicitly blanked
`enrollment_reason_not_randomized` for, so it could never appear in a
text-value breakdown and needs this separate query.

Depends on Issue #1 fixes (reason_for_consent_refusal, enrollment_id
writeback, ltfu_reason_36/40/44) — all three are implemented alongside this
endpoint.
"""

import csv
import io
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user, is_superadmin, is_global
from models import AdverseEvents, SAEReport, Screening, User, GACheckEntry, BirthLogEntry

_DOCX_MEDIA = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
logger = logging.getLogger(__name__)

# Canonical order — must match CANONICAL_SITE_ID_MAP in main.py (01-06,
# used for screening/enrollment IDs), not alphabetical or insertion order.
ALL_SITES = ["PGIMER", "GMCH", "IOG", "AFMC", "GMCH-A", "AMC"]


def _dashboard_sites(user: User, site: str | None = None) -> list[str]:
    """Site scope for dashboard endpoints. Global users may narrow with `site`;
    non-global users always get their own site (client `site` is ignored)."""
    if is_global(user):
        if site and site in ALL_SITES:
            return [site]
        return list(ALL_SITES)
    if user.site_name:
        return [user.site_name]
    return []
GRACE_DAYS = 28

# Eligible GA window: 25w0d – 31w6d inclusive (matches Form A / compute_screening_status).
_GA_DAYS_SQL = "(COALESCE(s.gestation_weeks, 0) * 7 + COALESCE(s.gestation_days, 0))"
_GA_IN_WINDOW_SQL = (
    f"(s.gestation_weeks IS NOT NULL AND {_GA_DAYS_SQL} >= 25 * 7 "
    f"AND {_GA_DAYS_SQL} <= 31 * 7 + 6)"
)
_GA_OUT_OR_UNKNOWN_SQL = (
    f"(s.gestation_weeks IS NULL OR {_GA_DAYS_SQL} < 25 * 7 "
    f"OR {_GA_DAYS_SQL} > 31 * 7 + 6)"
)

# Box 1 + Box 2's ga_check_log-sourced sub-reasons, mutually exclusive via
# CASE precedence: continued_to_screening rows are excluded from every
# Box-2 bucket (they produced a real Form A row, already counted in Box 3
# separately); identification_type='Missed...' takes precedence over
# found_iufd/eligible so a retroactively-logged miss is never
# double-classified as also being an eligibility-gap case.
GA_CHECK_QUERY = text("""
    SELECT
        site_name,
        COUNT(*) AS box1,
        SUM(CASE WHEN continued_to_screening = FALSE
                 AND identification_type = 'Missed - identified retrospectively'
            THEN 1 ELSE 0 END) AS box2_missed,
        SUM(CASE WHEN continued_to_screening = FALSE
                 AND identification_type IS DISTINCT FROM 'Missed - identified retrospectively'
                 AND found_iufd = TRUE
            THEN 1 ELSE 0 END) AS box2_iufd,
        SUM(CASE WHEN continued_to_screening = FALSE
                 AND identification_type IS DISTINCT FROM 'Missed - identified retrospectively'
                 AND found_iufd IS NOT TRUE
                 AND eligible = TRUE
            THEN 1 ELSE 0 END) AS box2_eligible_gap,
        SUM(CASE WHEN continued_to_screening = FALSE
                 AND identification_type IS DISTINCT FROM 'Missed - identified retrospectively'
                 AND found_iufd IS NOT TRUE
                 AND eligible = FALSE
            THEN 1 ELSE 0 END) AS box2_not_candidate_older,
        SUM(CASE WHEN continued_to_screening = FALSE
                 AND identification_type IS DISTINCT FROM 'Missed - identified retrospectively'
                 AND found_iufd IS NOT TRUE
                 AND eligible IS NULL
            THEN 1 ELSE 0 END) AS box2_not_candidate_unreliable
    FROM ga_check_log
    GROUP BY site_name
""")

# Box 2's other sub-reason: births known only from the Log of All Births,
# with NO matching Gestation Log entry at all (never even checked) -- see
# birth_log_matching.py's match_birth_log_entry(). Deliberately NOT part
# of Box 1's own total (see module docstring).
NEVER_CHECKED_QUERY = text("""
    SELECT site_name, COUNT(*) AS n
    FROM birth_log_all_births
    WHERE match_status = 'never_checked'
    GROUP BY site_name
""")

NEVER_CHECKED_REASON_QUERY = text("""
    SELECT site_name, reason_not_approached AS reason, COUNT(*) AS n
    FROM birth_log_all_births
    WHERE match_status = 'never_checked'
      AND reason_not_approached IS NOT NULL AND reason_not_approached != ''
    GROUP BY site_name, reason_not_approached
""")

SCREENING_QUERY = text(f"""
    SELECT
        s.site_name AS site_name,

        -- Box 3: screened for eligibility = every Form A record, full
        -- stop -- can only ever be reached from a Gestation Log entry
        -- that was Reliable and <32 weeks (or a direct Form A entry
        -- bypassing the log).
        COUNT(*) AS box3,

        -- Box 4a: screened, no exclusion flag, but GA unknown or outside
        -- the 25w0d–31w6d inclusion window.
        SUM(CASE WHEN COALESCE(s.exclusion_present, FALSE) = FALSE
                 AND {_GA_OUT_OR_UNKNOWN_SQL}
            THEN 1 ELSE 0 END) AS box4a,

        -- Box 4b: screened, exclusion flag present. Structural anomaly /
        -- fetal hydrops / forego-resuscitation / insufficient-time-for-
        -- consent are the "Met exclusion criteria" sub-reasons; the IUFD
        -- line here is legacy-only (pre-2026-09-24 records where IUFD was
        -- still a Form A exclusion, not a Gestation Log outcome).
        SUM(CASE WHEN s.exclusion_present = TRUE THEN 1 ELSE 0 END) AS box4b,
        SUM(CASE WHEN s.exclusion_present = TRUE
                 AND s.exclusion_reasons LIKE '%Structural anomaly%'
            THEN 1 ELSE 0 END) AS box4b_anomaly,
        SUM(CASE WHEN s.exclusion_present = TRUE
                 AND s.exclusion_reasons LIKE '%Fetal hydrops%'
            THEN 1 ELSE 0 END) AS box4b_hydrops,
        SUM(CASE WHEN s.exclusion_present = TRUE
                 AND s.exclusion_reasons LIKE '%Forego resuscitation%'
            THEN 1 ELSE 0 END) AS box4b_forgo_resus,
        SUM(CASE WHEN s.exclusion_present = TRUE
                 AND s.exclusion_reasons LIKE '%Insufficient time%'
            THEN 1 ELSE 0 END) AS box4b_insufficient_time,
        SUM(CASE WHEN s.exclusion_present = TRUE
                 AND s.exclusion_reasons LIKE '%IUFD%'
            THEN 1 ELSE 0 END) AS box4b_iufd_legacy,

        -- Box 5: screened, no exclusion flag, GA known and within window.
        SUM(CASE WHEN COALESCE(s.exclusion_present, FALSE) = FALSE
                 AND {_GA_IN_WINDOW_SQL}
            THEN 1 ELSE 0 END) AS box5,

        -- Box 6: eligible (= Box 5 condition), consent not given/refused,
        -- and no Form B record exists at all.
        SUM(CASE WHEN COALESCE(s.exclusion_present, FALSE) = FALSE
                 AND {_GA_IN_WINDOW_SQL}
                 AND (s.consent_given IS NULL OR s.consent_given != 'Yes')
                 AND br.enrollment_id IS NULL
            THEN 1 ELSE 0 END) AS box6,

        -- Box 7: consented but never randomised. "Vigorous, no PPV
        -- needed" is auto-derived (required_resuscitation explicitly
        -- FALSE) since applyInitialStepsNotRequired() in
        -- BirthResuscitationForm.jsx always blanks
        -- enrollment_reason_not_randomized for this population -- it
        -- could never appear in the dynamic reason breakdown below.
        SUM(CASE WHEN s.consent_given = 'Yes'
                 AND COALESCE(br.randomised, FALSE) = FALSE
            THEN 1 ELSE 0 END) AS box7,
        SUM(CASE WHEN s.consent_given = 'Yes'
                 AND COALESCE(br.randomised, FALSE) = FALSE
                 AND br.required_resuscitation = FALSE
            THEN 1 ELSE 0 END) AS box7_vigorous,

        -- Box 8: randomised. Denominator for Boxes 9-11.
        SUM(CASE WHEN br.randomised = TRUE THEN 1 ELSE 0 END) AS box8

    FROM screenings s
    LEFT JOIN birth_resuscitation br ON br.screening_id = s.screening_id
    WHERE s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
    GROUP BY s.site_name
""")

# Box 7's dynamic sub-reason breakdown -- Form B's own
# enrollment_reason_not_randomized values (GA≥32/consent withdrawn/blender
# malfunction/etc.), same pattern Box 6 already uses for
# reason_for_consent_refusal. Excludes required_resuscitation=FALSE rows
# (the separate "Vigorous, no PPV needed" bucket above) so a stray
# leftover text value there is never double-counted.
NOT_RANDOMISED_REASON_QUERY = text("""
    SELECT s.site_name AS site_name,
           br.enrollment_reason_not_randomized AS reason,
           COUNT(*) AS n
    FROM birth_resuscitation br
    JOIN screenings s ON s.screening_id = br.screening_id
    WHERE s.consent_given = 'Yes'
      AND COALESCE(br.randomised, FALSE) = FALSE
      AND br.required_resuscitation IS DISTINCT FROM FALSE
      AND s.is_deleted = FALSE
      AND s.site_name IS NOT NULL AND s.site_name != ''
      AND br.enrollment_reason_not_randomized IS NOT NULL
      AND br.enrollment_reason_not_randomized != ''
    GROUP BY s.site_name, br.enrollment_reason_not_randomized
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
        "box3": 0,
        "box4a": 0, "box4b": 0, "box4b_anomaly": 0, "box4b_hydrops": 0,
        "box4b_forgo_resus": 0, "box4b_insufficient_time": 0, "box4b_iufd_legacy": 0,
        "box5": 0, "box6": 0, "box7": 0, "box7_vigorous": 0, "box8": 0,
    }


def _blank_ga_check_counts():
    return {
        "box1": 0, "box2_missed": 0, "box2_iufd": 0, "box2_eligible_gap": 0,
        "box2_not_candidate_older": 0, "box2_not_candidate_unreliable": 0,
    }


def _compute_screening_boxes(db: Session):
    counts_by_site = {site: _blank_screening_counts() for site in ALL_SITES}
    refusal_reasons_by_site = {site: {} for site in ALL_SITES}
    not_randomised_reasons_by_site = {site: {} for site in ALL_SITES}

    for row in db.execute(SCREENING_QUERY).mappings():
        site = row["site_name"]
        if site not in counts_by_site:
            counts_by_site[site] = _blank_screening_counts()
            refusal_reasons_by_site[site] = {}
            not_randomised_reasons_by_site[site] = {}
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
          AND COALESCE(s.exclusion_present, FALSE) = FALSE
          AND {_GA_IN_WINDOW_SQL}
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

    # Box 7 sub-reason breakdown: Form B's own enrollment_reason_not_randomized.
    for row in db.execute(NOT_RANDOMISED_REASON_QUERY).mappings():
        site = row["site_name"]
        not_randomised_reasons_by_site.setdefault(site, {})
        not_randomised_reasons_by_site[site][row["reason"]] = int(row["n"] or 0)

    return counts_by_site, refusal_reasons_by_site, not_randomised_reasons_by_site


def _compute_ga_check_boxes(db: Session):
    """Box 1 (Approached for Screening) + most of Box 2 (Not Screened)'s
    sub-reasons -- sourced from the Gestation (Inclusion Criteria)
    Screening Log itself, plus the "never_checked" sub-reason sourced from
    the Log of All Births (births with no matching Gestation Log entry at
    all). See module docstring for why Box 1's own total deliberately does
    NOT include never_checked."""
    ga_counts_by_site = {site: _blank_ga_check_counts() for site in ALL_SITES}
    never_checked_by_site = {site: 0 for site in ALL_SITES}
    never_checked_reasons_by_site = {site: {} for site in ALL_SITES}

    for row in db.execute(GA_CHECK_QUERY).mappings():
        site = row["site_name"]
        if site not in ga_counts_by_site:
            ga_counts_by_site[site] = _blank_ga_check_counts()
        for key in _blank_ga_check_counts():
            ga_counts_by_site[site][key] = int(row[key] or 0)

    for row in db.execute(NEVER_CHECKED_QUERY).mappings():
        site = row["site_name"]
        never_checked_by_site.setdefault(site, 0)
        never_checked_by_site[site] = int(row["n"] or 0)

    for row in db.execute(NEVER_CHECKED_REASON_QUERY).mappings():
        site = row["site_name"]
        never_checked_reasons_by_site.setdefault(site, {})
        never_checked_reasons_by_site[site][row["reason"]] = int(row["n"] or 0)

    return ga_counts_by_site, never_checked_by_site, never_checked_reasons_by_site


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


def _build_rows(ga_counts_by_site, never_checked_by_site, never_checked_reasons_by_site,
                 counts_by_site, refusal_reasons_by_site, not_randomised_reasons_by_site,
                 followup_boxes, followup_ltfu_reasons, sites: list):
    def m(box_key):
        return {s: counts_by_site.get(s, _blank_screening_counts())[box_key] for s in ALL_SITES}

    def gm(box_key):
        return {s: ga_counts_by_site.get(s, _blank_ga_check_counts())[box_key] for s in ALL_SITES}

    box4b_anomaly, box4b_hydrops = m("box4b_anomaly"), m("box4b_hydrops")
    box4b_forgo_resus, box4b_insufficient_time = m("box4b_forgo_resus"), m("box4b_insufficient_time")
    box4b_iufd_legacy = m("box4b_iufd_legacy")
    box7_vigorous = m("box7_vigorous")

    box2_missed, box2_iufd = gm("box2_missed"), gm("box2_iufd")
    box2_eligible_gap = gm("box2_eligible_gap")
    box2_not_candidate_older, box2_not_candidate_unreliable = gm("box2_not_candidate_older"), gm("box2_not_candidate_unreliable")

    # Box 2's "never checked" sub-row, with its own reason breakdown
    # (Log of All Births' reason_not_approached, incl. the renamed
    # "No time to approach to screen").
    never_checked_reasons = sorted({r for site in never_checked_reasons_by_site.values() for r in site})
    never_checked_sub_rows = [
        _row(None, reason, {s: never_checked_reasons_by_site.get(s, {}).get(reason, 0) for s in ALL_SITES}, sites)
        for reason in never_checked_reasons
    ] or None
    box2_never_checked_total = {s: never_checked_by_site.get(s, 0) for s in ALL_SITES}

    box2_total = {
        s: box2_never_checked_total.get(s, 0) + box2_missed.get(s, 0) + box2_iufd.get(s, 0)
           + box2_eligible_gap.get(s, 0) + box2_not_candidate_older.get(s, 0) + box2_not_candidate_unreliable.get(s, 0)
        for s in ALL_SITES
    }

    # Box 6 sub-rows: one per distinct refusal-reason string seen at any site.
    all_reasons = sorted({r for site in refusal_reasons_by_site.values() for r in site})
    box6_sub_rows = []
    for reason in all_reasons:
        per_site = {s: refusal_reasons_by_site.get(s, {}).get(reason, 0) for s in ALL_SITES}
        box6_sub_rows.append(_row(None, reason, per_site, sites))

    # Box 7 sub-rows: Form B's own enrollment_reason_not_randomized values,
    # plus the separately-derived "Vigorous, no PPV needed" bucket (never
    # a text value in that column -- see NOT_RANDOMISED_REASON_QUERY).
    not_randomised_reasons = sorted({r for site in not_randomised_reasons_by_site.values() for r in site})
    box7_sub_rows = [
        _row(None, reason, {s: not_randomised_reasons_by_site.get(s, {}).get(reason, 0) for s in ALL_SITES}, sites)
        for reason in not_randomised_reasons
    ]
    box7_sub_rows.append(_row(None, "Vigorous, no PPV needed", box7_vigorous, sites))

    rows = [
        _row(1, "Approached for screening", gm("box1"), sites),
        _row(2, "Not screened", box2_total, sites, sub_rows=[
            _row(None, "Never checked (known only from Log of All Births)", box2_never_checked_total, sites,
                 sub_rows=never_checked_sub_rows),
            _row(None, "Missed - identified retrospectively", box2_missed, sites),
            _row(None, "IUFD at screening", box2_iufd, sites),
            _row(None, "Eligible but Form A not yet completed", box2_eligible_gap, sites),
            _row(None, "Checked, gestation \u226532 weeks (reliable source)", box2_not_candidate_older, sites),
            _row(None, "Checked, gestation source unreliable/unknown", box2_not_candidate_unreliable, sites),
        ]),
        _row(3, "Screened for eligibility", m("box3"), sites),
        _row(4, "Excluded after screening (ineligible)",
             {s: counts_by_site.get(s, _blank_screening_counts())["box4a"] + counts_by_site.get(s, _blank_screening_counts())["box4b"] for s in ALL_SITES},
             sites, sub_rows=[
                 _row(None, "Did not meet inclusion criteria (GA outside 25+0\u201331+6 weeks)", m("box4a"), sites),
                 _row(None, "Met exclusion criteria", m("box4b"), sites, sub_rows=[
                     _row(None, "Antenatally suspected or confirmed major structural anomaly", box4b_anomaly, sites),
                     _row(None, "Fetal hydrops", box4b_hydrops, sites),
                     _row(None, "Parental request / neonatologist decision to forego resuscitation", box4b_forgo_resus, sites),
                     _row(None, "No time to approach for consent", box4b_insufficient_time, sites),
                     _row(None, "IUFD (identified during screening \u2014 legacy, rare)", box4b_iufd_legacy, sites),
                 ]),
             ]),
        _row(5, "Eligible", m("box5"), sites),
        _row(6, "Refused consent", m("box6"), sites, sub_rows=box6_sub_rows or None),
        _row(7, "Consented but not randomised", m("box7"), sites, sub_rows=box7_sub_rows or None),
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
    site: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    global_view = is_global(current_user)

    if format == "csv" and not is_superadmin(current_user):
        raise HTTPException(status_code=403, detail="CSV export is superadmin-only")

    sites = _dashboard_sites(current_user, site)

    ga_counts_by_site, never_checked_by_site, never_checked_reasons_by_site = _compute_ga_check_boxes(db)
    counts_by_site, refusal_reasons_by_site, not_randomised_reasons_by_site = _compute_screening_boxes(db)
    followup_boxes, followup_ltfu_reasons = _compute_followup_boxes(db)
    rows = _build_rows(
        ga_counts_by_site, never_checked_by_site, never_checked_reasons_by_site,
        counts_by_site, refusal_reasons_by_site, not_randomised_reasons_by_site,
        followup_boxes, followup_ltfu_reasons, sites,
    )

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
            "\"Approached for Screening\" (Box 1) is the Gestation (Inclusion Criteria) "
            "Screening Log's own total. \"Not Screened\" (Box 2) additionally includes "
            "births known only from the Log of All Births with no matching Gestation "
            "Log entry at all (\"never checked\") -- a population Box 1's total does "
            "not include, by design, so Approached + Not-Screened arithmetic will not "
            "perfectly reconcile against Box 1 alone.",
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
    ("form_j",    "Form J — External Hospital Outcomes"),
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
        CASE WHEN eha.enrollment_id IS NOT NULL THEN 1 ELSE 0 END AS form_j,
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
    LEFT JOIN (SELECT DISTINCT enrollment_id FROM external_hospital_assessments) eha ON eha.enrollment_id = br.enrollment_id
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
    UNION ALL
    SELECT 'rop_detected_no_form_g' AS issue, sub.site_name, sub.enrollment_id AS ref_id
    FROM (
        SELECT DISTINCT s.site_name, dl.enrollment_id
        FROM metab_renal_vasc_eye_day_logs dl
        JOIN birth_resuscitation br ON br.enrollment_id = dl.enrollment_id
        JOIN screenings s ON s.screening_id = br.screening_id
        LEFT JOIN LATERAL (
            SELECT rs.screenings
            FROM rop_screening rs
            WHERE rs.enrollment_id = dl.enrollment_id
            ORDER BY rs.id DESC
            LIMIT 1
        ) rop ON TRUE
        WHERE dl.rop_detected IS TRUE
          AND br.randomised = TRUE
          AND br.date_of_birth IS NOT NULL
          AND s.is_deleted = FALSE
          AND s.site_name IS NOT NULL AND s.site_name != ''
          AND NOT EXISTS (
            SELECT 1
            FROM json_array_elements(
                CASE
                    WHEN rop.screenings IS NULL THEN '[]'::json
                    WHEN json_typeof(rop.screenings::json) = 'array' THEN rop.screenings::json
                    ELSE '[]'::json
                END
            ) elem
            WHERE NULLIF(elem->>'date', '') IS NOT NULL
              AND (elem->>'date')::date >= (br.date_of_birth + (dl.nicu_day - 1))
          )
    ) sub
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
    site: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sites = _dashboard_sites(current_user, site)
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
        "rop_detected_no_form_g": "ROP detected on Helper Form 4 log but Form G not updated for that date",
        "rop_form_mismatch": "Form H vs Form G ROP fields differ (unreviewed)",
    }
    action_counts = {key: {s: 0 for s in ALL_SITES} for key in ACTION_LABELS}
    for row in db.execute(ACTION_LIST_QUERY).mappings():
        site = row["site_name"]
        issue = row["issue"]
        if site in site_set and issue in action_counts:
            action_counts[issue][site] = action_counts[issue].get(site, 0) + 1

    from rop_consistency import iter_rop_mismatch_enrollments

    for site, _eid in iter_rop_mismatch_enrollments(db, site_set):
        if site in action_counts.get("rop_form_mismatch", {}):
            action_counts["rop_form_mismatch"][site] = (
                action_counts["rop_form_mismatch"].get(site, 0) + 1
            )

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


def _completeness_rows_for_sites(db: Session, site_set: set) -> list:
    """One row per randomised enrollment from COMPLETION_QUERY (not site-aggregated)."""
    total_count = len(FORM_KEYS)
    rows_out = []
    for row in db.execute(COMPLETION_QUERY).mappings():
        site = row["site_name"]
        if site not in site_set:
            continue
        completed_count = sum(int(row.get(k) or 0) for k, _ in FORM_KEYS)
        completeness_pct = (
            round(100 * completed_count / total_count, 1) if total_count else 0.0
        )
        entry = {
            "enrollment_id": row["enrollment_id"],
            "site_name": site,
            "completed_count": completed_count,
            "total_count": total_count,
            "completeness_pct": completeness_pct,
        }
        for key, _ in FORM_KEYS:
            entry[key] = int(row.get(key) or 0)
        rows_out.append(entry)
    rows_out.sort(
        key=lambda r: (r["completeness_pct"], r["enrollment_id"] or ""),
    )
    return rows_out


@router.get("/completeness-by-enrollment")
def get_completeness_by_enrollment(
    site: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-enrollment form presence flags (same joins as completion matrix)."""
    sites = _dashboard_sites(current_user, site)
    site_set = set(sites)
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "generated_at": generated_at,
        "sites": sites,
        "forms": [{"key": k, "label": lbl} for k, lbl in FORM_KEYS],
        "rows": _completeness_rows_for_sites(db, site_set),
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

    # Sites list, restricted to those with any randomised patient (from
    # denominator) but ordered canonically, not by arbitrary SQL row order.
    sites = [s for s in ALL_SITES if s in denom_overall]

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
# SECTION 5b — PERIODIC CUMULATIVE AE/SAE SUMMARY REPORT (Phase 3)
# GET /dashboard/safety/summary-report
# ============================================================
#
# Site-wise, date-ranged .docx line-listing pulling from the two AE data
# sources: sae_reports (CIOMS-shaped SAE detail) and adverse_events (the
# broader per-baby AE register). See project memory / sae_summary_report.py
# for the design rationale. This endpoint assembles all data; the docx
# module itself is DB-free (same discipline as ae_reference.py/sae_report.py).


def _parse_date_prefix(s):
    """Parse the leading YYYY-MM-DD off a date/datetime string. Returns None
    (never raises) for missing/malformed input — callers treat None as
    'include regardless of range', since a safety report must never silently
    drop an AE/SAE just because its date field is unparsed."""
    if not s:
        return None
    try:
        return datetime.strptime(str(s).strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _in_date_range(d, date_from, date_to):
    if d is None:
        return True
    if date_from and d < date_from:
        return False
    if date_to and d > date_to:
        return False
    return True


def _sites_for_enrollments(db: Session, enrollment_ids: list[str]) -> dict[str, str]:
    """Bulk site lookup for a batch of enrollment_ids, mirroring main.py's
    per-id site_for_enrollment() (including its NR-{screening_id} handling
    for non-randomised babies). Duplicated locally rather than imported —
    routers/dashboard.py is imported BY main.py, so importing back from
    main.py would be circular; this file already duplicates ALL_SITES from
    main.py's CANONICAL_SITE_ID_MAP under the same constraint."""
    result: dict[str, str] = {}
    plain = [e for e in enrollment_ids if e and not e.startswith("NR-")]
    nr = [e[3:] for e in enrollment_ids if e and e.startswith("NR-")]
    if plain:
        for eid, site in (
            db.query(Screening.enrollment_id, Screening.site_name)
            .filter(Screening.enrollment_id.in_(plain))
            .all()
        ):
            result[eid] = site
    if nr:
        for sid, site in (
            db.query(Screening.screening_id, Screening.site_name)
            .filter(Screening.screening_id.in_(nr))
            .all()
        ):
            result[f"NR-{sid}"] = site
    return result


def build_summary_ctx(
    sae_records, ae_records, site_lookup, date_from, date_to, generated_by, severity_label,
):
    """Pure aggregation: turn already-fetched SAEReport/AdverseEvents rows
    into the ctx shape sae_summary_report.build_summary_report_docx() wants.
    No DB access — takes plain fetched rows/site_lookup so it's unit-testable
    without a database (same separation as ae_reference.py's detectors).
    `severity_label` is injected (rather than imported) purely to keep this
    function importable without a live sae_config in a test context.

    date_from/date_to are already-parsed `date` objects or None."""
    sae_by_site: dict[str, list] = {}
    ae_by_site: dict[str, list] = {}
    counts: dict[str, dict] = {"__overall__": {"n_ae": 0, "n_sae": 0}}

    def _bump(site, key):
        counts.setdefault(site, {"n_ae": 0, "n_sae": 0})
        counts[site][key] += 1
        counts["__overall__"][key] += 1

    for r in sae_records:
        onset = _parse_date_prefix(r.onset_datetime) or _parse_date_prefix(r.report_date)
        if not _in_date_range(onset, date_from, date_to):
            continue
        site = (r.site or "").strip() or site_lookup.get(r.enrollment_id) or "Site not recorded"
        sae_by_site.setdefault(site, []).append({
            "enrollment_id": r.enrollment_id,
            "onset": r.onset_datetime or r.report_date,
            "diagnosis": r.diagnosis,
            "seriousness": ", ".join(r.seriousness) if isinstance(r.seriousness, list) else r.seriousness,
            "severity_label": severity_label(r.severity),
            "causality": r.causality,
            "action_taken": r.action_taken,
            "outcome": r.outcome,
        })
        _bump(site, "n_sae")

    for rec in ae_records:
        site = site_lookup.get(rec.enrollment_id) or "Site not recorded"
        for ev in (rec.events or []):
            if not isinstance(ev, dict):
                continue
            onset = _parse_date_prefix(ev.get("start_date"))
            if not _in_date_range(onset, date_from, date_to):
                continue
            grade = ev.get("grade")
            ae_by_site.setdefault(site, []).append({
                "enrollment_id": rec.enrollment_id,
                "onset": ev.get("start_date"),
                "description": ev.get("description"),
                "grade_label": severity_label(grade) if grade else None,
                "converted_to_sae": ev.get("converted_to_sae"),
            })
            _bump(site, "n_ae")

    sites = list(ALL_SITES)
    extra_sites = (set(sae_by_site) | set(ae_by_site)) - set(ALL_SITES)
    sites.extend(sorted(extra_sites))

    return {
        "date_from": date_from.isoformat() if hasattr(date_from, "isoformat") else date_from,
        "date_to": date_to.isoformat() if hasattr(date_to, "isoformat") else date_to,
        "generated_by": generated_by,
        "sites": sites,
        "sae_by_site": sae_by_site,
        "ae_by_site": ae_by_site,
        "counts": counts,
    }


@router.get("/safety/summary-report")
def get_safety_summary_report(
    date_from: str | None = Query(None, description="YYYY-MM-DD, inclusive"),
    date_to: str | None = Query(None, description="YYYY-MM-DD, inclusive"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Periodic cumulative AE/SAE safety summary, site-wise, as a .docx —
    Phase 3 of the AE/SAE project. Section A lists sae_reports rows
    (CIOMS-shaped: causality/seriousness/outcome). Section B lists every row
    in every enrollment's adverse_events.events register (broader, shallower
    — no causality/outcome captured there). Both filtered to [date_from,
    date_to] on onset date where a date is parseable; rows with an
    unparseable/missing date are always included rather than silently
    dropped from a safety report."""
    if current_user.role.lower() != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")

    import sae_config as cfg
    import sae_summary_report

    df = _parse_date_prefix(date_from)
    dt = _parse_date_prefix(date_to)

    sae_records = db.query(SAEReport).all()
    ae_records = db.query(AdverseEvents).all()

    all_enrollment_ids = list(
        {r.enrollment_id for r in sae_records if r.enrollment_id}
        | {r.enrollment_id for r in ae_records if r.enrollment_id}
    )
    site_lookup = _sites_for_enrollments(db, all_enrollment_ids)

    ctx = build_summary_ctx(
        sae_records, ae_records, site_lookup, df, dt,
        getattr(current_user, "username", None), cfg.severity_label,
    )
    # Keep the caller's original raw strings in the doc header rather than
    # the parsed/re-serialized date, so "trial start"/"present" fallbacks
    # from a blank param still read naturally.
    ctx["date_from"], ctx["date_to"] = date_from, date_to

    data = sae_summary_report.build_summary_report_docx(ctx)
    fname = f"AE_SAE_summary_{date_from or 'start'}_to_{date_to or 'now'}.docx"
    return Response(
        content=data,
        media_type=_DOCX_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


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


# ============================================================
# GET /dashboard/ops-summary — Clinical Ops dashboard (live only)
# Available to any authenticated user; site-scoped like CONSORT.
# ============================================================

@router.get("/ops-summary")
def get_ops_summary(
    site: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sites = _dashboard_sites(current_user, site)
    site_set = set(s for s in sites if s)
    global_view = is_global(current_user)

    KPI_Q = text("""
        SELECT
            COALESCE(s.site_name, '__unknown__') AS site_name,
            COUNT(*) AS screened,
            SUM(CASE WHEN s.screening_status = 'Eligible' THEN 1 ELSE 0 END) AS eligible,
            SUM(CASE WHEN s.screening_status = 'Screen Failure' THEN 1 ELSE 0 END) AS screen_failures,
            SUM(CASE WHEN s.screening_status = 'Not Eligible' THEN 1 ELSE 0 END) AS not_eligible,
            SUM(CASE WHEN s.enrollment_id IS NOT NULL AND s.enrollment_id <> '' THEN 1 ELSE 0 END) AS with_enrollment_id,
            SUM(CASE WHEN s.consent_given = 'Yes' THEN 1 ELSE 0 END) AS consented
        FROM screenings s
        WHERE COALESCE(s.is_deleted, FALSE) = FALSE
          AND s.site_name IS NOT NULL AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY COALESCE(s.site_name, '__unknown__')
    """)

    RAND_Q = text("""
        SELECT
            COALESCE(s.site_name, '__unknown__') AS site_name,
            COUNT(*) AS randomised
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE br.randomised = TRUE
          AND COALESCE(s.is_deleted, FALSE) = FALSE
          AND s.site_name IS NOT NULL AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY COALESCE(s.site_name, '__unknown__')
    """)

    MONTHLY_Q = text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', COALESCE(br.created_at, NOW())), 'Mon') AS m,
            DATE_TRUNC('month', COALESCE(br.created_at, NOW())) AS month_start,
            COUNT(*) AS n
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE br.randomised = TRUE
          AND COALESCE(s.is_deleted, FALSE) = FALSE
          AND s.site_name IS NOT NULL AND s.site_name NOT IN ('', 'DRAFT')
        GROUP BY DATE_TRUNC('month', COALESCE(br.created_at, NOW()))
        ORDER BY month_start
    """)

    MONTHLY_SITE_Q = text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', COALESCE(br.created_at, NOW())), 'Mon') AS m,
            DATE_TRUNC('month', COALESCE(br.created_at, NOW())) AS month_start,
            COUNT(*) AS n
        FROM birth_resuscitation br
        JOIN screenings s ON s.screening_id = br.screening_id
        WHERE br.randomised = TRUE
          AND COALESCE(s.is_deleted, FALSE) = FALSE
          AND s.site_name = :site
        GROUP BY DATE_TRUNC('month', COALESCE(br.created_at, NOW()))
        ORDER BY month_start
    """)

    RECENT_Q = text("""
        SELECT
            s.screening_id,
            s.enrollment_id,
            s.site_name,
            s.screening_status,
            s.updated_at,
            s.created_at
        FROM screenings s
        WHERE COALESCE(s.is_deleted, FALSE) = FALSE
          AND s.site_name IS NOT NULL AND s.site_name NOT IN ('', 'DRAFT')
        ORDER BY COALESCE(s.updated_at, s.created_at) DESC NULLS LAST
        LIMIT 40
    """)

    SAE_LIST_Q = text("""
        SELECT
            sr.id,
            sr.enrollment_id,
            sr.site,
            sr.diagnosis,
            sr.severity,
            sr.outcome,
            sr.report_type,
            sr.report_date,
            sr.ongoing
        FROM sae_reports sr
        ORDER BY sr.id DESC
        LIMIT 50
    """)

    kpi_rows = db.execute(KPI_Q).mappings().all()
    rand_rows = {r["site_name"]: int(r["randomised"] or 0) for r in db.execute(RAND_Q).mappings().all()}

    by_site = []
    totals = {
        "screened": 0,
        "eligible": 0,
        "screen_failures": 0,
        "not_eligible": 0,
        "with_enrollment_id": 0,
        "consented": 0,
        "randomised": 0,
    }
    for r in kpi_rows:
        site = r["site_name"]
        if site_set and site not in site_set:
            continue
        sc = int(r["screened"] or 0)
        el = int(r["eligible"] or 0)
        sf = int(r["screen_failures"] or 0)
        ne = int(r["not_eligible"] or 0)
        we = int(r["with_enrollment_id"] or 0)
        co = int(r["consented"] or 0)
        rn = rand_rows.get(site, 0)
        by_site.append({
            "site": site,
            "screened": sc,
            "eligible": el,
            "screen_failures": sf,
            "enrolled": rn,
            "consented": co,
        })
        totals["screened"] += sc
        totals["eligible"] += el
        totals["screen_failures"] += sf
        totals["not_eligible"] += ne
        totals["with_enrollment_id"] += we
        totals["consented"] += co
        totals["randomised"] += rn

    by_site.sort(key=lambda x: x["enrolled"], reverse=True)

    if not global_view and site_set:
        site_name = next(iter(site_set))
        monthly_src = db.execute(MONTHLY_SITE_Q, {"site": site_name}).mappings().all()
    else:
        monthly_src = db.execute(MONTHLY_Q).mappings().all()
    monthly = [
        {"m": r["m"], "n": int(r["n"] or 0), "month_start": str(r["month_start"])[:10]}
        for r in monthly_src
    ]

    site_totals = {s: 0 for s in ALL_SITES}
    site_counts = {s: {k: 0 for k, _ in FORM_KEYS} for s in ALL_SITES}
    for row in db.execute(COMPLETION_QUERY).mappings():
        site = row["site_name"]
        if site_set and site not in site_set:
            continue
        if site not in site_totals:
            continue
        site_totals[site] = site_totals.get(site, 0) + 1
        for key, _ in FORM_KEYS:
            if row.get(key):
                site_counts[site][key] = site_counts[site].get(key, 0) + 1

    scope_sites = sites if sites else ALL_SITES
    overall_total = sum(site_totals.get(s, 0) for s in scope_sites)
    form_completion = []
    for key, label in FORM_KEYS:
        n = sum(site_counts.get(s, {}).get(key, 0) for s in scope_sites)
        pct = round(100 * n / overall_total, 1) if overall_total else 0
        form_completion.append({"key": key, "label": label, "n": n, "total": overall_total, "pct": pct})

    ACTION_LABELS = {
        "consented_no_form_b": "Consented but Form B not entered",
        "randomised_no_form_c": "Randomised but Form C missing",
        "randomised_no_form_i": "Randomised but Form I missing",
        "few_day_logs": "Randomised >=7 days with <7 Resp/CV/Neuro logs",
        "rop_detected_no_form_g": "ROP detected on Helper Form 4 — Form G screening missing for date",
        "rop_form_mismatch": "Form H vs Form G ROP mismatch (unreviewed)",
    }
    action_items = {k: [] for k in ACTION_LABELS}
    action_counts = {k: 0 for k in ACTION_LABELS}
    for row in db.execute(ACTION_LIST_QUERY).mappings():
        site = row["site_name"]
        if site_set and site not in site_set:
            continue
        issue = row["issue"]
        if issue not in ACTION_LABELS:
            continue
        action_counts[issue] += 1
        if len(action_items[issue]) < 8:
            action_items[issue].append({"site": site, "ref": row["ref_id"]})

    from rop_consistency import iter_rop_mismatch_enrollments

    for site, eid in iter_rop_mismatch_enrollments(db, site_set if site_set else None):
        if site_set and site not in site_set:
            continue
        action_counts["rop_form_mismatch"] += 1
        if len(action_items["rop_form_mismatch"]) < 8:
            action_items["rop_form_mismatch"].append({"site": site, "ref": eid})

    tasks = [
        {
            "key": k,
            "title": ACTION_LABELS[k],
            "count": action_counts[k],
            "items": [f"{it['ref']} · {it['site']}" for it in action_items[k]],
        }
        for k in ACTION_LABELS
    ]
    pending_forms = (
        action_counts.get("consented_no_form_b", 0)
        + action_counts.get("randomised_no_form_c", 0)
        + action_counts.get("randomised_no_form_i", 0)
    )
    log_gaps = action_counts.get("few_day_logs", 0)

    sae_rows = []
    for r in db.execute(SAE_LIST_Q).mappings().all():
        site = r["site"] or ""
        if site_set:
            if not site or site not in site_set:
                continue
        resolved = (r["outcome"] or "").lower() in ("recovered", "resolved", "fatal")
        sae_rows.append({
            "id": f"SAE-{r['id']}",
            "enrollment_id": r["enrollment_id"],
            "site": site or "—",
            "diagnosis": r["diagnosis"] or "SAE",
            "severity": r["severity"] or "—",
            "outcome": r["outcome"] or "—",
            "report_type": r["report_type"] or "—",
            "ongoing": bool(r["ongoing"]),
            "open": bool(r["ongoing"]) or not resolved,
        })
    open_saes = sum(1 for s in sae_rows if s["open"])

    safety = {"randomised_n": totals["randomised"], "mortality": {}, "morbidities": {}}
    try:
        if global_view:
            mort = db.execute(text("""
                SELECT
                    COUNT(so.enrollment_id) AS n,
                    SUM(CASE WHEN so.mortality_in_hospital = TRUE THEN 1 ELSE 0 END) AS n_hosp,
                    SUM(CASE WHEN so.mortality_28_days = TRUE THEN 1 ELSE 0 END) AS n_28d
                FROM study_outcomes so
                JOIN birth_resuscitation br ON br.enrollment_id = so.enrollment_id AND br.randomised = TRUE
                JOIN screenings s ON s.screening_id = br.screening_id
                WHERE COALESCE(s.is_deleted, FALSE) = FALSE
                  AND s.site_name IS NOT NULL AND s.site_name NOT IN ('', 'DRAFT')
            """)).mappings().first()
        else:
            mort = db.execute(text("""
                SELECT
                    COUNT(so.enrollment_id) AS n,
                    SUM(CASE WHEN so.mortality_in_hospital = TRUE THEN 1 ELSE 0 END) AS n_hosp,
                    SUM(CASE WHEN so.mortality_28_days = TRUE THEN 1 ELSE 0 END) AS n_28d
                FROM study_outcomes so
                JOIN birth_resuscitation br ON br.enrollment_id = so.enrollment_id AND br.randomised = TRUE
                JOIN screenings s ON s.screening_id = br.screening_id
                WHERE COALESCE(s.is_deleted, FALSE) = FALSE
                  AND s.site_name = :site
            """), {"site": next(iter(site_set), "")}).mappings().first()
        n = int((mort or {}).get("n") or 0)
        nh = int((mort or {}).get("n_hosp") or 0)
        n28 = int((mort or {}).get("n_28d") or 0)
        safety["mortality"] = {
            "n": n,
            "in_hospital": {"n": nh, "pct": round(100 * nh / n, 1) if n else 0},
            "at_28_days": {"n": n28, "pct": round(100 * n28 / n, 1) if n else 0},
        }
    except Exception:
        safety["mortality"] = {"n": 0, "in_hospital": {"n": 0, "pct": 0}, "at_28_days": {"n": 0, "pct": 0}}

    try:
        if global_view:
            morb = db.execute(text("""
                SELECT
                    COUNT(nm.enrollment_id) AS n,
                    SUM(CASE WHEN nm.bpd = TRUE THEN 1 ELSE 0 END) AS n_bpd,
                    SUM(CASE WHEN nm.nec = TRUE THEN 1 ELSE 0 END) AS n_nec,
                    SUM(CASE WHEN nm.rop_treatment = 'Yes' THEN 1 ELSE 0 END) AS n_rop,
                    SUM(CASE WHEN nm.ivh_present = 'Yes' AND nm.ivh_grade IN ('3','4') THEN 1 ELSE 0 END) AS n_ivh
                FROM neonatal_morbidities nm
                JOIN birth_resuscitation br ON br.enrollment_id = nm.enrollment_id AND br.randomised = TRUE
                JOIN screenings s ON s.screening_id = br.screening_id
                WHERE COALESCE(s.is_deleted, FALSE) = FALSE
                  AND s.site_name IS NOT NULL AND s.site_name NOT IN ('', 'DRAFT')
            """)).mappings().first()
        else:
            morb = db.execute(text("""
                SELECT
                    COUNT(nm.enrollment_id) AS n,
                    SUM(CASE WHEN nm.bpd = TRUE THEN 1 ELSE 0 END) AS n_bpd,
                    SUM(CASE WHEN nm.nec = TRUE THEN 1 ELSE 0 END) AS n_nec,
                    SUM(CASE WHEN nm.rop_treatment = 'Yes' THEN 1 ELSE 0 END) AS n_rop,
                    SUM(CASE WHEN nm.ivh_present = 'Yes' AND nm.ivh_grade IN ('3','4') THEN 1 ELSE 0 END) AS n_ivh
                FROM neonatal_morbidities nm
                JOIN birth_resuscitation br ON br.enrollment_id = nm.enrollment_id AND br.randomised = TRUE
                JOIN screenings s ON s.screening_id = br.screening_id
                WHERE COALESCE(s.is_deleted, FALSE) = FALSE
                  AND s.site_name = :site
            """), {"site": next(iter(site_set), "")}).mappings().first()
        n = int((morb or {}).get("n") or 0)

        def _p(v):
            vv = int(v or 0)
            return {"n": vv, "pct": round(100 * vv / n, 1) if n else 0}

        safety["morbidities"] = {
            "n": n,
            "bpd": _p((morb or {}).get("n_bpd")),
            "nec": _p((morb or {}).get("n_nec")),
            "rop_tx": _p((morb or {}).get("n_rop")),
            "ivh_severe": _p((morb or {}).get("n_ivh")),
        }
    except Exception:
        safety["morbidities"] = {
            "n": 0,
            "bpd": {"n": 0, "pct": 0},
            "nec": {"n": 0, "pct": 0},
            "rop_tx": {"n": 0, "pct": 0},
            "ivh_severe": {"n": 0, "pct": 0},
        }

    activities = []
    for r in db.execute(RECENT_Q).mappings().all():
        site = r["site_name"]
        if site_set and site not in site_set:
            continue
        status = r["screening_status"] or "Updated"
        eid = r["enrollment_id"] or r["screening_id"]
        ts = r["updated_at"] or r["created_at"]
        when = "—"
        if ts:
            try:
                aware = ts if getattr(ts, "tzinfo", None) else ts.replace(tzinfo=timezone.utc)
                delta = datetime.now(timezone.utc) - aware
                mins = int(delta.total_seconds() // 60)
                if mins < 60:
                    when = f"{max(mins, 0)}m"
                elif mins < 1440:
                    when = f"{mins // 60}h"
                else:
                    when = f"{mins // 1440}d"
            except Exception:
                when = "—"
        col = "#0E7C7B"
        if status == "Screen Failure":
            col = "#ef4444"
        elif status == "Eligible":
            col = "#22c55e"
        activities.append({
            "col": col,
            "txt": f"{status} — {eid} ({site})",
            "t": when,
        })
        if len(activities) >= 8:
            break

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "target": 700,
        "kpis": {
            "screened": totals["screened"],
            "eligible": totals["eligible"],
            "screen_failures": totals["screen_failures"],
            "enrolled": totals["randomised"],
            "consented": totals["consented"],
            "open_saes": open_saes,
            "pending_forms": pending_forms,
            "log_gaps": log_gaps,
            "eligible": totals["eligible"],
        },
        "by_site": by_site,
        "monthly": monthly,
        "form_completion": form_completion,
        "tasks": tasks,
        "saes": sae_rows[:20],
        "safety": safety,
        "activities": activities,
        "notifications": [
            {
                "type": "info" if "Eligible" in a["txt"] else ("error" if "Failure" in a["txt"] else "warn"),
                "msg": a["txt"],
                "time": f"{a['t']} ago" if a["t"] != "—" else "—",
            }
            for a in activities[:5]
        ],
    }


# ============================================================
# SECTION 7 — AI INSIGHTS
# POST /dashboard/ai-insights
#
# Proxies chat messages to the Anthropic API. This MUST stay server-side:
# the frontend previously called api.anthropic.com directly from the
# browser, which can never work (Anthropic doesn't allow direct browser
# calls, and there was no API key on the request anyway) and would be a
# credential-leak risk if "fixed" by embedding a key in the JS bundle.
# The API key lives only in this server's .env (ANTHROPIC_API_KEY),
# read fresh on each request so a rotated key takes effect without a
# backend restart.
# ============================================================

ANTHROPIC_MODEL = "claude-sonnet-5"


class AIInsightMessage(BaseModel):
    role: str
    content: str


class AIInsightRequest(BaseModel):
    message: str
    history: list[AIInsightMessage] = []


@router.post("/ai-insights")
def post_ai_insight(
    body: AIInsightRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.lower() != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin only")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI Insights is not configured on this server (missing ANTHROPIC_API_KEY)",
        )

    # Reuse the same live figures the rest of the dashboard shows, computed
    # fresh from the DB — never trust arm/outcome numbers from the client.
    ops = get_ops_summary(db=db, current_user=current_user)
    kpis = ops.get("kpis", {})
    by_site = ops.get("by_site", [])
    form_completion = ops.get("form_completion", [])
    safety = ops.get("safety", {})
    mort = safety.get("mortality", {}) or {}
    morb = safety.get("morbidities", {}) or {}

    target = ops.get("target") or 0
    enrolled = kpis.get("enrolled", 0) or 0
    pct = round(100 * enrolled / target) if target else 0

    site_line = ", ".join(
        f"{s.get('site')}(sc{s.get('screened', 0)},en{s.get('enrolled', 0)})" for s in by_site
    ) or "none"
    form_line = "; ".join(
        f"{f.get('label')}: {f.get('pct') or 0}%" for f in form_completion
    ) or "n/a"

    system_prompt = f"""You are an AI assistant embedded in the PORTAL clinical trial dashboard.
PORTAL is a multi-centre neonatal RCT comparing FiO₂ levels (30%, 60%, 90%) for preterm infants <32 weeks.

Use ONLY this live snapshot (do not invent counts):
- Screened: {kpis.get('screened', 0)}, Enrolled (randomised): {enrolled} / {target} ({pct}%)
- Screen failures: {kpis.get('screen_failures', 0)}
- Open SAEs: {kpis.get('open_saes', 0)}
- Pending form actions: {kpis.get('pending_forms', 0)}
- Sites: {site_line}
- Form completeness: {form_line}
- Mortality in-hospital: {mort.get('in_hospital', {}).get('n', 0)} ({mort.get('in_hospital', {}).get('pct', 0)}%)
- BPD: {morb.get('bpd', {}).get('n', 0)} ({morb.get('bpd', {}).get('pct', 0)}%), NEC: {morb.get('nec', {}).get('n', 0)}, ROP treated: {morb.get('rop_tx', {}).get('n', 0)}, Severe IVH: {morb.get('ivh_severe', {}).get('n', 0)}
- Arm allocation counts are blinded / not available in live ops data.

Be clinically precise, concise (2-4 sentences unless more is needed), and actionable.
If data is zero or missing, say so — do not invent figures."""

    messages = [{"role": m.role, "content": m.content} for m in body.history]
    messages.append({"role": "user", "content": body.message})

    payload = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 1000,
        "system": system_prompt,
        "messages": messages,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        logger.error("AI Insights: Anthropic API returned %s: %s", e.code, detail)
        raise HTTPException(status_code=502, detail="AI Insights is temporarily unavailable")
    except Exception as e:
        logger.error("AI Insights: request to Anthropic failed: %s", e)
        raise HTTPException(status_code=502, detail="AI Insights is temporarily unavailable")

    reply = "".join(
        block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
    ) or "Unable to generate a response."

    return {"reply": reply}
