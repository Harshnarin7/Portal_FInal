"""Unit tests for two-nurse merge / stale-write helpers (no database)."""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from concurrent_writes import (
    STALE_WRITE_MESSAGE,
    assert_fresh_write,
    merge_fio2_logs,
    merge_mml_entries_json,
)


def test_fresh_write_allows_matching_timestamp():
    now = datetime(2026, 9, 19, 12, 0, 0)
    assert_fresh_write(now, now.isoformat() + "Z")


def test_stale_write_raises_409():
    server = datetime(2026, 9, 19, 12, 0, 5)
    expected = datetime(2026, 9, 19, 12, 0, 0).isoformat() + "Z"
    with pytest.raises(HTTPException) as exc:
        assert_fresh_write(server, expected)
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "stale_write"
    assert STALE_WRITE_MESSAGE in exc.value.detail["message"]


def test_omitted_expected_allows_last_write():
    assert_fresh_write(datetime.utcnow(), None)


def test_mml_merge_keeps_other_nurses_block():
    existing = {
        "resp_a": [{"id": "r1", "max_fio2": "30"}],
        "met_a": [{"id": "g1", "glucose": "80"}],
    }
    incoming = {
        "resp_a": [],
        "met_a": [{"id": "g2", "glucose": "95"}],
    }
    merged = merge_mml_entries_json(existing, incoming)
    import json
    out = json.loads(merged)
    assert any(e["id"] == "r1" for e in out["resp_a"])
    ids = {e["id"] for e in out["met_a"]}
    assert ids == {"g1", "g2"}


def test_mml_merge_incoming_edits_same_id():
    existing = {"cv_a": [{"id": "v1", "sbp": "40"}]}
    incoming = {"cv_a": [{"id": "v1", "sbp": "42"}]}
    import json
    out = json.loads(merge_mml_entries_json(existing, incoming))
    assert out["cv_a"][0]["sbp"] == "42"


def test_fio2_merge_keeps_hidden_day():
    existing = [
        {"day": 2, "block": "0-12h", "entries": [{"fio2": "30", "dur": "6"}]},
        {"day": 10, "block": "0-12h", "entries": [{"fio2": "40", "dur": "4"}]},
    ]
    incoming = [
        {"day": 10, "block": "0-12h", "entries": [{"fio2": "45", "dur": "5"}]},
    ]
    merged = merge_fio2_logs(existing, incoming)
    days = {(m["day"], m["block"]): m for m in merged}
    assert days[(2, "0-12h")]["entries"][0]["fio2"] == "30"
    assert days[(10, "0-12h")]["entries"][0]["fio2"] == "45"


def test_timestamp_skew_within_two_seconds_ok():
    server = datetime(2026, 9, 19, 12, 0, 1)
    expected = (server - timedelta(seconds=1)).isoformat() + "Z"
    assert_fresh_write(server, expected)
