"""Helper 5 (Minimal Monitoring) block 5.3.A (glucose) / 5.1.A (vitals,
temperature only) -> Helper 4 (Metab/Renal/Vasc/Eye) #1/#4/#15.

Second step of the Minimal Monitoring <-> Helper 1-4 linkage project (see
get_metabolic_prefill's docstring in main.py for step 1, which fed Form H
directly). This step surfaces the same underlying readings inside Helper 4
itself -- so a nurse looking at Helper 4 sees the real worst reading for
that NICU day, not just whatever Form H separately computed admission-wide.

Deliberately a fill-if-blank overlay, NOT the always-overwrite-unless-
"Not Recorded" pattern used by mml_resp_a_autofill.py's Helper 1 overlays
(overlay_resp_cv_day_from_autofill / overlay_resp_cv_blood_gas_from_mml).
That pattern relies on a per-field `*_status` companion column giving the
clinician an explicit "Not Recorded / Not Done" escape hatch before MML is
allowed to always win; lowest_glucose/highest_glucose/axillary_temperature
have no such companion column today, so unconditionally overwriting a
manually-typed value (e.g. from an actual lab draw) with a different
MML-derived number would have no way to be overridden. Fill-if-blank is
the safe default used everywhere else in this codebase for exactly this
reason -- revisit if/when `*_status` columns are added for these fields
too, matching the Helper 1 precedent fully.

Unlike get_metabolic_prefill (step 1), which aggregates across the WHOLE
admission to find the true worst reading Form H should show, this module
is deliberately scoped to a single NICU day, matching what Helper 4 itself
displays -- a day's lowest_glucose/highest_glucose/axillary_temperature is
a per-day fact, not an admission-wide one.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional


def _normalize_ymd(raw: Any) -> Optional[str]:
    if raw is None or raw == "":
        return None
    s = str(raw).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$", s)
    if m:
        dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
        return f"{yyyy}-{mm.zfill(2)}-{dd.zfill(2)}"
    return s[:10] if len(s) >= 10 else s


def _to_float(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # not NaN


def _fmt_num(n: Optional[float]) -> Optional[str]:
    if n is None:
        return None
    r = round(n * 100) / 100
    return str(int(r)) if r == int(r) else str(r)


def _load_entries(entries_json: Any) -> Dict[str, Any]:
    if not entries_json:
        return {}
    try:
        parsed = (
            json.loads(entries_json)
            if isinstance(entries_json, str)
            else entries_json
        )
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def _block_values(mml_row: Any, block_key: str, entry_key: str, legacy_attr: str, helper_calendar_date: str) -> List[float]:
    """Numeric readings from one MML day row's multi-entry block that
    belong to `helper_calendar_date` -- mirrors mml_resp_a_autofill's
    sheet_is_helper / per-entry date-matching so a "today" scratchpad row
    only contributes entries actually dated for the Helper day being
    viewed, not the sheet's own (possibly different) record_date."""
    if mml_row is None:
        return []
    record_date = _normalize_ymd(getattr(mml_row, "record_date", None))
    sheet_is_helper = bool(record_date and record_date == helper_calendar_date)
    entries = _load_entries(getattr(mml_row, "entries_json", None))
    block = entries.get(block_key)
    values: List[float] = []
    if isinstance(block, list) and block:
        for entry in block:
            if not isinstance(entry, dict):
                continue
            if not sheet_is_helper:
                raw_d = entry.get("date")
                ds = _normalize_ymd(raw_d) if raw_d not in (None, "") else record_date
                if ds and ds != helper_calendar_date:
                    continue
            val = _to_float(entry.get(entry_key))
            if val is not None:
                values.append(val)
        return values
    # Legacy pre-multi-entry-redesign row: one flat value for its own date.
    if record_date == helper_calendar_date:
        legacy_val = _to_float(getattr(mml_row, legacy_attr, None))
        if legacy_val is not None:
            values.append(legacy_val)
    return values


def compute_helper4_day_autofill(*mml_rows: Any, helper_calendar_date: str) -> Dict[str, Any]:
    """Merge Minimal Monitoring's 5.3.A (glucose) and 5.1.A (temperature)
    readings dated for `helper_calendar_date` across one or more MML rows
    (the row saved under that exact date, plus -- same as the Helper 1
    precedent -- today's still-open scratchpad row when different, so a
    reading logged before MML's own day-rollover still counts)."""
    glucose_vals: List[float] = []
    temp_vals: List[float] = []
    seen_ids = set()
    for row in mml_rows:
        if row is None:
            continue
        rid = getattr(row, "id", None)
        if rid is not None:
            if rid in seen_ids:
                continue
            seen_ids.add(rid)
        glucose_vals.extend(_block_values(row, "met_a", "glucose", "glucose", helper_calendar_date))
        # DMS stores this as `axillary_temp` (both the cv_a entries_json key and
        # the legacy flat column on MinimalMonitoringDayLog) -- Helper 4's own
        # field is separately named `axillary_temperature`, which is only the
        # OUTPUT key below / the overlay's write target, never the DMS source
        # key. Reading "axillary_temperature" here always missed (silent
        # None), so this overlay branch never actually fired.
        temp_vals.extend(_block_values(row, "cv_a", "axillary_temp", "axillary_temp", helper_calendar_date))

    result: Dict[str, Any] = {"has_data": bool(glucose_vals or temp_vals)}

    # Same <45 / >125 mg/dL thresholds as step 1 (get_metabolic_prefill) --
    # <45 matches both Helper 4's own storage convention and the CRF;
    # >125 is the corrected hyperglycemia threshold (the CRF's own text
    # currently reads ">180", confirmed by the PI as a documentation error
    # being fixed separately).
    lows = [v for v in glucose_vals if v < 45]
    highs = [v for v in glucose_vals if v > 125]
    if lows:
        result["lowest_glucose"] = _fmt_num(min(lows))
    if highs:
        result["highest_glucose"] = _fmt_num(max(highs))

    # axillary_temperature is a single flagged reading, not a lowest/
    # highest pair (Helper 4's own field label: "<36.5 or >37.5") -- report
    # whichever direction the day's readings actually went abnormal,
    # preferring hypothermia if both occurred the same day (the more
    # urgent of the two, and the actual live incident this project was
    # prompted by).
    cold = [v for v in temp_vals if v < 36.5]
    hot = [v for v in temp_vals if v > 37.5]
    if cold:
        result["axillary_temperature"] = _fmt_num(min(cold))
    elif hot:
        result["axillary_temperature"] = _fmt_num(max(hot))

    return result


def _helper4_str_is_blank(val: Any) -> bool:
    return val is None or str(val).strip() == ""


def overlay_helper4_day_from_mml(record, autofill: Dict[str, Any]) -> None:
    """In-memory overlay on GET (does not commit) -- fills lowest_glucose/
    highest_glucose/axillary_temperature only when Helper 4's own field is
    still blank. See module docstring for why this is fill-if-blank rather
    than the Helper 1 precedent's always-overwrite-unless-Not-Recorded."""
    if not autofill.get("has_data"):
        return
    if _helper4_str_is_blank(getattr(record, "lowest_glucose", None)):
        val = autofill.get("lowest_glucose")
        if val is not None:
            record.lowest_glucose = val
    if _helper4_str_is_blank(getattr(record, "highest_glucose", None)):
        val = autofill.get("highest_glucose")
        if val is not None:
            record.highest_glucose = val
    if _helper4_str_is_blank(getattr(record, "axillary_temperature", None)):
        val = autofill.get("axillary_temperature")
        if val is not None:
            record.axillary_temperature = val
