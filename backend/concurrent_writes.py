"""Helpers so two nurses can save the same baby without silently wiping each other.

DMS: union-merge entries_json by block + entry id (different sections / new
readings both keep). Helper day logs: optimistic lock via expected_updated_at.
FiO₂: merge by (day, block) so omitted (hidden) days stay on the server.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException

STALE_WRITE_MESSAGE = (
    "Another nurse saved this day. Showing their latest version — "
    "add your answers again and save."
)

_META_KEYS = {"id", "date", "time", "slot_time"}


def parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    s = str(value).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo:
        dt = dt.replace(tzinfo=None)
    return dt


def assert_fresh_write(server_updated_at: Any, expected_updated_at: Optional[str]) -> None:
    """409 when the client loaded an older row than the one now on the server.

    Omitted expected_updated_at is allowed so older app builds still save
    (last-write-wins). New web + mobile always send the timestamp from GET.
    """
    if not expected_updated_at:
        return
    if server_updated_at is None:
        return
    exp = parse_dt(expected_updated_at)
    srv = parse_dt(server_updated_at)
    if exp is None or srv is None:
        return
    if abs((srv - exp).total_seconds()) <= 2:
        return
    raise HTTPException(
        status_code=409,
        detail={
            "code": "stale_write",
            "message": STALE_WRITE_MESSAGE,
            "current_updated_at": srv.isoformat() + "Z",
        },
    )


def _parse_entries(raw: Any) -> dict:
    if raw is None or raw == "":
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def entry_has_clinical(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    for key, val in entry.items():
        if key in _META_KEYS:
            continue
        if val is None or val == "":
            continue
        if isinstance(val, list) and len(val) == 0:
            continue
        return True
    return False


def merge_mml_entries_json(
    existing_raw: Any, incoming_raw: Any, deleted_ids: Any = None,
) -> Optional[str]:
    """Union merge per DMS block, then drop rows the client explicitly deleted.

    The union alone can never delete: a row missing from the incoming save is
    indistinguishable from another nurse's row this screen never loaded, so a
    reading a nurse removed reappeared on the next load. `deleted_ids` are
    entry ids the client removed on purpose — only those are dropped, so the
    two-nurse guarantee (neither save wipes the other's new rows) still holds.
    Older clients (mobile) omit it and keep plain union behaviour.
    """
    merged = _union_mml_entries_json(existing_raw, incoming_raw)
    drop = {str(i).strip() for i in (deleted_ids or []) if str(i or "").strip()}
    if not drop or merged is None:
        return merged
    parsed = _parse_entries(merged)
    for key, entries in parsed.items():
        if isinstance(entries, list):
            parsed[key] = [
                e for e in entries
                if not (isinstance(e, dict) and str(e.get("id") or "").strip() in drop)
            ]
    return json.dumps(parsed)


def _union_mml_entries_json(existing_raw: Any, incoming_raw: Any) -> Optional[str]:
    """Union merge per DMS block. Empty incoming blocks never delete server rows."""
    existing = _parse_entries(existing_raw)
    incoming = _parse_entries(incoming_raw)
    if not existing:
        if incoming_raw is None:
            return None
        return incoming_raw if isinstance(incoming_raw, str) else json.dumps(incoming)
    if not incoming:
        if existing_raw is None:
            return None
        return existing_raw if isinstance(existing_raw, str) else json.dumps(existing)

    merged: dict[str, list] = {}
    for key in set(existing) | set(incoming):
        server_list = existing.get(key) or []
        inc_list = incoming.get(key) or []
        if not isinstance(server_list, list):
            server_list = []
        if not isinstance(inc_list, list):
            inc_list = []
        inc_clinical = [e for e in inc_list if entry_has_clinical(e)]
        if not inc_clinical:
            merged[key] = list(server_list)
            continue
        by_id: dict[str, dict] = {}
        order_ids: list[str] = []
        anon: list[dict] = []

        def push(entry: Any, overwrite: bool) -> None:
            if not isinstance(entry, dict):
                return
            eid = str(entry.get("id") or "").strip()
            if not eid:
                if entry_has_clinical(entry):
                    anon.append(entry)
                return
            if eid not in by_id:
                order_ids.append(eid)
            if overwrite or eid not in by_id:
                by_id[eid] = entry

        for entry in server_list:
            push(entry, False)
        for entry in inc_clinical:
            push(entry, True)
        merged[key] = [by_id[i] for i in order_ids] + anon
    return json.dumps(merged)


def _log_key(log: dict) -> tuple:
    try:
        day = int(log.get("day") or 0)
    except (TypeError, ValueError):
        day = 0
    return day, str(log.get("block") or "")


def merge_fio2_logs(existing: Any, incoming: Any) -> list:
    """Keep server blocks the client did not send (hidden days). Incoming wins
    for any (day, block) the client included."""
    server = [dict(x) for x in (existing or []) if isinstance(x, dict)]
    inc = [dict(x) for x in (incoming or []) if isinstance(x, dict)]
    if not server:
        return inc
    merged = list(server)
    index = {_log_key(m): i for i, m in enumerate(merged)}
    for row in inc:
        k = _log_key(row)
        if k not in index:
            index[k] = len(merged)
            merged.append(row)
        else:
            merged[index[k]] = row
    return merged
