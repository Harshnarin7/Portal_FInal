"""Helper 5 block 5.2.A → Helper 1 respiratory #3–#5 (modes, MAP/CPAP, FiO₂)."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

PRESSURE_MODES = frozenset({"NIPPV", "SIMV", "AC", "A/C", "PSV", "HFOV"})
LOW_FLOW_MODES = frozenset({"NC", "HFNC"})


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


def _modes_list(row: Dict[str, Any]) -> List[str]:
    v = row.get("respiratory_modes")
    if isinstance(v, list):
        return [str(x).strip() for x in v if x]
    if isinstance(v, str) and v.strip():
        return [p.strip() for p in v.split(",") if p.strip()]
    return []


def normalize_helper_support_modes(modes: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for m in modes or []:
        if not m:
            continue
        norm = "AC" if m == "A/C" else m
        if norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out


def get_map_cpap_mode(modes: List[str]) -> Optional[str]:
    if not modes:
        return None
    has_pressure = any(m in PRESSURE_MODES for m in modes)
    has_cpap = "CPAP" in modes
    if has_pressure and has_cpap:
        return "BOTH"
    if has_pressure:
        return "MAP"
    if has_cpap:
        return "CPAP"
    if any(m in LOW_FLOW_MODES for m in modes):
        return "NA"
    return None


def _push_num(arr: List[float], raw: Any) -> None:
    if raw is None or raw == "":
        return
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return
    if n == n:  # not NaN
        arr.append(n)


def parse_resp_a_entries(payload: Any, record_date: Optional[str]) -> List[Dict[str, Any]]:
    if payload is None:
        return []
    if hasattr(payload, "__dict__"):
        data = {
            k: getattr(payload, k)
            for k in (
                "record_date",
                "entries_json",
                "respiratory_modes",
                "max_map_cpap",
                "max_map_cpap_secondary",
                "max_fio2",
            )
            if hasattr(payload, k)
        }
    else:
        data = dict(payload)

    rows: List[Dict[str, Any]] = []
    sheet_date = _normalize_ymd(data.get("record_date")) or _normalize_ymd(record_date)
    effective = _normalize_ymd(record_date) or sheet_date
    sheet_is_helper = bool(
        effective and data.get("record_date")
        and _normalize_ymd(data.get("record_date")) == effective
    )

    entries = data.get("entries_json")
    if isinstance(entries, str):
        try:
            entries = json.loads(entries)
        except (TypeError, ValueError):
            entries = None

    resp_a = (entries or {}).get("resp_a") if isinstance(entries, dict) else None
    if isinstance(resp_a, list):
        for row in resp_a:
            if not isinstance(row, dict):
                continue
            if not sheet_is_helper:
                raw_d = row.get("date")
                ds = _normalize_ymd(raw_d) if raw_d not in (None, "") else sheet_date
                if effective and ds and ds != effective:
                    continue
            modes = _modes_list(row)
            has_nums = any(
                row.get(k) not in (None, "")
                for k in ("max_fio2", "max_map_cpap", "max_map_cpap_secondary")
            )
            if modes or has_nums:
                rows.append(row)

    def append_flat() -> None:
        if effective and sheet_date and sheet_date != effective:
            return
        flat_modes = _modes_list({"respiratory_modes": data.get("respiratory_modes")})
        has_flat = bool(flat_modes) or any(
            data.get(k) not in (None, "")
            for k in ("max_fio2", "max_map_cpap", "max_map_cpap_secondary")
        )
        if not has_flat:
            return
        rows.append(
            {
                "date": sheet_date,
                "respiratory_modes": flat_modes,
                "max_map_cpap": data.get("max_map_cpap") or "",
                "max_map_cpap_secondary": data.get("max_map_cpap_secondary") or "",
                "max_fio2": data.get("max_fio2") or "",
            }
        )

    append_flat()
    if not rows and entries is None:
        append_flat()

    return rows


def _fmt_num(n: Optional[float]) -> Optional[str]:
    if n is None:
        return None
    r = round(n * 100) / 100
    return str(int(r)) if r == int(r) else str(r)


def compute_resp_a_autofill(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    cpap_vals: List[float] = []
    map_vals: List[float] = []
    fio2_vals: List[float] = []
    mode_set: set = set()

    for row in rows:
        modes = _modes_list(row)
        for m in modes:
            mode_set.add(m)
        mode = get_map_cpap_mode(modes)
        if mode == "BOTH":
            _push_num(cpap_vals, row.get("max_map_cpap_secondary"))
            _push_num(map_vals, row.get("max_map_cpap"))
        elif mode == "CPAP":
            _push_num(cpap_vals, row.get("max_map_cpap"))
        elif mode == "MAP":
            _push_num(map_vals, row.get("max_map_cpap"))
        _push_num(fio2_vals, row.get("max_fio2"))

    modes_union = normalize_helper_support_modes(list(mode_set))
    aggregate = get_map_cpap_mode(modes_union)
    max_cpap = max(cpap_vals) if cpap_vals else None
    max_map = max(map_vals) if map_vals else None
    max_fio2 = max(fio2_vals) if fio2_vals else None

    map_cpap = None
    map_cpap_secondary = None
    if aggregate == "BOTH":
        map_cpap = max_map
        map_cpap_secondary = max_cpap
    elif aggregate == "CPAP":
        map_cpap = max_cpap
    elif aggregate == "MAP":
        map_cpap = max_map

    return {
        "has_rows": len(rows) > 0,
        "modes_union": modes_union,
        "aggregate_mode": aggregate,
        "max_fio2": _fmt_num(max_fio2),
        "map_cpap": _fmt_num(map_cpap),
        "map_cpap_secondary": _fmt_num(map_cpap_secondary),
    }


def mml_resp_a_autofill_for_sheet(mml_row: Any, helper_calendar_date: str) -> Dict[str, Any]:
    rows = parse_resp_a_entries(mml_row, helper_calendar_date)
    return compute_resp_a_autofill(rows)


def autofill_from_mml_rows(*mml_rows: Any, helper_calendar_date: str) -> Dict[str, Any]:
    """Merge 5.2.A from one or more MML day rows for a helper calendar date."""
    rows: List[Dict[str, Any]] = []
    seen_ids = set()
    for mml in mml_rows:
        if mml is None:
            continue
        mid = getattr(mml, "id", None)
        if mid is not None and mid in seen_ids:
            continue
        if mid is not None:
            seen_ids.add(mid)
        rows.extend(parse_resp_a_entries(mml, helper_calendar_date))
    return compute_resp_a_autofill(rows)


def calendar_date_for_nicu_day_from_birth(birth_date, nicu_day: int) -> Optional[str]:
    if birth_date is None or nicu_day is None or int(nicu_day) < 1:
        return None
    from datetime import timedelta

    d = birth_date + timedelta(days=int(nicu_day) - 1)
    return d.isoformat()


def _helper_resp_num_is_blank(field: str, val: Any) -> bool:
    if val is None:
        return True
    try:
        n = float(val)
    except (TypeError, ValueError):
        return not str(val).strip()
    if n == 0:
        return True
    if field == "max_fio2" and n == 21:
        return True
    return False


def overlay_resp_cv_day_from_autofill(record, autofill: Dict[str, Any]) -> None:
    """In-memory overlay on GET (does not commit). MML 5.2.A daily max is source of truth."""
    if not autofill.get("has_rows"):
        return
    modes = autofill.get("modes_union") or []
    if modes:
        record.support_modes = ", ".join(modes)
        record.respiratory_support = True

    def set_float_field(field: str, val: Any, blocked: bool) -> None:
        if blocked or val is None or val == "":
            return
        try:
            setattr(record, field, float(val))
        except (TypeError, ValueError):
            pass

    set_float_field(
        "max_fio2",
        autofill.get("max_fio2"),
        bool(getattr(record, "max_fio2_status", None)),
    )
    agg = autofill.get("aggregate_mode")
    map_blocked = bool(getattr(record, "map_cpap_status", None))
    map2_blocked = bool(getattr(record, "map_cpap_secondary_status", None))
    if agg == "BOTH":
        set_float_field("map_cpap", autofill.get("map_cpap"), map_blocked)
        set_float_field("map_cpap_secondary", autofill.get("map_cpap_secondary"), map2_blocked)
    elif agg in ("CPAP", "MAP"):
        set_float_field("map_cpap", autofill.get("map_cpap"), map_blocked)


NOT_RECORDED_LABEL = "Not Recorded / Not Done"


def _mml_json_entry_has_data(entry: Dict[str, Any]) -> bool:
    if not entry:
        return False
    for key, val in entry.items():
        if key in ("id", "date", "time"):
            continue
        if val is None:
            continue
        if isinstance(val, list):
            if val:
                return True
            continue
        if isinstance(val, bool):
            return True
        if str(val).strip():
            return True
    return False


def _push_int(arr: List[int], raw: Any) -> None:
    if raw is None or raw == "":
        return
    try:
        n = int(float(raw))
    except (TypeError, ValueError):
        return
    if n >= 0:
        arr.append(n)


def parse_resp_c_entries(payload: Any, record_date: Optional[str]) -> Dict[str, List[int]]:
    out: Dict[str, List[int]] = {
        "apnea": [],
        "desaturation": [],
        "severe_desat": [],
    }
    if payload is None:
        return out
    if hasattr(payload, "__dict__"):
        data = {
            k: getattr(payload, k)
            for k in (
                "record_date",
                "entries_json",
                "apnea_episodes",
                "desaturation_episodes",
                "severe_desaturation_episodes",
            )
            if hasattr(payload, k)
        }
    else:
        data = dict(payload)

    sheet_date = _normalize_ymd(data.get("record_date")) or _normalize_ymd(record_date)
    effective = _normalize_ymd(record_date) or sheet_date
    sheet_is_helper = bool(
        effective and data.get("record_date")
        and _normalize_ymd(data.get("record_date")) == effective
    )

    entries = data.get("entries_json")
    if isinstance(entries, str):
        try:
            entries = json.loads(entries)
        except (TypeError, ValueError):
            entries = None

    resp_c = (entries or {}).get("resp_c") if isinstance(entries, dict) else None
    if isinstance(resp_c, list):
        for row in resp_c:
            if not isinstance(row, dict):
                continue
            if not sheet_is_helper:
                raw_d = row.get("date")
                ds = _normalize_ymd(raw_d) if raw_d not in (None, "") else sheet_date
                if effective and ds and ds != effective:
                    continue
            if not _mml_json_entry_has_data(row):
                continue
            _push_int(out["apnea"], row.get("apnea_episodes"))
            _push_int(out["desaturation"], row.get("desaturation_episodes"))
            _push_int(out["severe_desat"], row.get("severe_desaturation_episodes"))

    if entries is None:
        _push_int(out["apnea"], data.get("apnea_episodes"))
        _push_int(out["desaturation"], data.get("desaturation_episodes"))
        _push_int(out["severe_desat"], data.get("severe_desaturation_episodes"))

    return out


def compute_resp_c_autofill(readings: Dict[str, List[int]]) -> Dict[str, Any]:
    result: Dict[str, Any] = {"has_rows": False}
    for key, field in (
        ("apnea", "apnea_count"),
        ("desaturation", "desaturation_count"),
        ("severe_desat", "severe_desaturation_count"),
    ):
        vals = readings.get(key) or []
        if vals:
            result["has_rows"] = True
            total = sum(vals)
            if total > 0:
                result[field] = str(total)
    return result


def autofill_resp_c_from_mml_rows(
    *mml_rows: Any, helper_calendar_date: str
) -> Dict[str, Any]:
    merged: Dict[str, List[int]] = {
        "apnea": [],
        "desaturation": [],
        "severe_desat": [],
    }
    seen_ids = set()
    for mml in mml_rows:
        if mml is None:
            continue
        mid = getattr(mml, "id", None)
        if mid is not None and mid in seen_ids:
            continue
        if mid is not None:
            seen_ids.add(mid)
        parsed = parse_resp_c_entries(mml, helper_calendar_date)
        for k in merged:
            merged[k].extend(parsed.get(k) or [])
    return compute_resp_c_autofill(merged)


def overlay_resp_cv_episodes_from_mml(record, episode_autofill: Dict[str, Any]) -> None:
    """In-memory overlay on GET — MML 5.2.C daily sums for Helper 1 #13–#15."""
    if not episode_autofill.get("has_rows"):
        return

    def blocked(field: str) -> bool:
        cur = getattr(record, field, None)
        return cur == NOT_RECORDED_LABEL

    for field in (
        "apnea_count",
        "desaturation_count",
        "severe_desaturation_count",
    ):
        val = episode_autofill.get(field)
        if val is None or val == "":
            continue
        if blocked(field):
            continue
        setattr(record, field, str(val))


def _push_gas(arr: List[float], raw: Any) -> None:
    if raw is None or raw == "":
        return
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return
    if n > 0:
        arr.append(n)


def parse_resp_b_entries(payload: Any, record_date: Optional[str]) -> Dict[str, List[float]]:
    out: Dict[str, List[float]] = {"ph": [], "pao2": [], "paco2": []}
    if payload is None:
        return out
    if hasattr(payload, "__dict__"):
        data = {
            k: getattr(payload, k)
            for k in ("record_date", "entries_json", "ph", "pao2", "paco2")
            if hasattr(payload, k)
        }
    else:
        data = dict(payload)

    sheet_date = _normalize_ymd(data.get("record_date")) or _normalize_ymd(record_date)
    effective = _normalize_ymd(record_date) or sheet_date
    sheet_is_helper = bool(
        effective and data.get("record_date")
        and _normalize_ymd(data.get("record_date")) == effective
    )

    entries = data.get("entries_json")
    if isinstance(entries, str):
        try:
            entries = json.loads(entries)
        except (TypeError, ValueError):
            entries = None

    resp_b = (entries or {}).get("resp_b") if isinstance(entries, dict) else None
    if isinstance(resp_b, list):
        for row in resp_b:
            if not isinstance(row, dict):
                continue
            if not sheet_is_helper:
                raw_d = row.get("date")
                ds = _normalize_ymd(raw_d) if raw_d not in (None, "") else sheet_date
                if effective and ds and ds != effective:
                    continue
            if not _mml_json_entry_has_data(row):
                continue
            _push_gas(out["ph"], row.get("ph"))
            _push_gas(out["pao2"], row.get("pao2"))
            _push_gas(out["paco2"], row.get("paco2"))

    if entries is None:
        _push_gas(out["ph"], data.get("ph"))
        _push_gas(out["pao2"], data.get("pao2"))
        _push_gas(out["paco2"], data.get("paco2"))

    return out


def compute_resp_b_autofill(readings: Dict[str, List[float]]) -> Dict[str, Any]:
    result: Dict[str, Any] = {"has_rows": False}
    ph = readings.get("ph") or []
    pao2 = readings.get("pao2") or []
    paco2 = readings.get("paco2") or []
    if ph:
        result["has_rows"] = True
        result["lowest_ph"] = _fmt_num(min(ph))
    if pao2:
        result["has_rows"] = True
        lo, hi = min(pao2), max(pao2)
        result["pao2_low"] = _fmt_num(lo)
        result["pao2_high"] = _fmt_num(hi)
    if paco2:
        result["has_rows"] = True
        lo, hi = min(paco2), max(paco2)
        result["paco2_low"] = _fmt_num(lo)
        result["paco2_high"] = _fmt_num(hi)
    return result


def autofill_resp_b_from_mml_rows(
    *mml_rows: Any, helper_calendar_date: str
) -> Dict[str, Any]:
    merged: Dict[str, List[float]] = {"ph": [], "pao2": [], "paco2": []}
    seen_ids = set()
    for mml in mml_rows:
        if mml is None:
            continue
        mid = getattr(mml, "id", None)
        if mid is not None and mid in seen_ids:
            continue
        if mid is not None:
            seen_ids.add(mid)
        parsed = parse_resp_b_entries(mml, helper_calendar_date)
        for k in merged:
            merged[k].extend(parsed.get(k) or [])
    return compute_resp_b_autofill(merged)


def _range_not_recorded(val: Any) -> bool:
    if val is None:
        return False
    s = str(val).strip()
    return s == NOT_RECORDED_LABEL or s.lower() == "not done"


def overlay_resp_cv_blood_gas_from_mml(record, blood_gas: Dict[str, Any]) -> None:
    """In-memory overlay on GET — MML 5.2.B for Helper 1 #8–#10."""
    if not blood_gas.get("has_rows"):
        return
    if not _range_not_recorded(getattr(record, "lowest_ph", None)):
        lp = blood_gas.get("lowest_ph")
        if lp is not None:
            record.lowest_ph = str(lp)
    if not _range_not_recorded(getattr(record, "pao2_range", None)):
        lo, hi = blood_gas.get("pao2_low"), blood_gas.get("pao2_high")
        if lo is not None and hi is not None:
            record.pao2_range = f"{lo}-{hi}"
    if not _range_not_recorded(getattr(record, "paco2_range", None)):
        lo, hi = blood_gas.get("paco2_low"), blood_gas.get("paco2_high")
        if lo is not None and hi is not None:
            record.paco2_range = f"{lo}-{hi}"
