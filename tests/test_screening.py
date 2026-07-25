"""
Regression tests for Form A (Screening) create/update bugs found and fixed
during a live-production incident: a UniqueViolation crash on screening_id
retry, a silently-accepted blank enrollment_id on Birth Resuscitation, and
screening_status getting frozen at whatever it was on first save instead of
reflecting the final, complete data.

Run with: pytest tests/test_screening.py -v
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import User, Screening
from db import SessionLocal, engine, Base


# ============================================================================
# FIXTURES — mirrors test_dashboard.py's conventions
# ============================================================================

@pytest.fixture
def client():
    from main import app
    return TestClient(app)


@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def nurse_token(client, db_session):
    from auth import hash_password
    from core.security import create_access_token

    user = User(
        username="test_nurse_pgimer",
        email="nurse@test.com",
        hashed_password=hash_password("password123"),
        role="nurse",
        site_name="PGIMER",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    claims = {"sub": "test_nurse_pgimer", "role": "nurse", "site_name": "PGIMER"}
    return create_access_token(claims)


def _valid_screening_payload(**overrides):
    payload = {
        "screening_id": "01-9001",
        "site_name": "PGIMER",
        "site_id": "01",
        "screened_by": "test_nurse_pgimer",
        "mother_first_name": "Test",
        "husband_first_name": "Test",
        "gestation_weeks": 24,
        "gestation_days": 0,
        "exclusion_present": False,
    }
    payload.update(overrides)
    return payload


# ============================================================================
# TEST 1 — the exact production crash: retrying a POST with an
# already-existing client-supplied screening_id must upsert, not 500/400.
# ============================================================================

def test_duplicate_screening_id_post_upserts_instead_of_crashing(client, nurse_token, db_session):
    headers = {"Authorization": f"Bearer {nurse_token}"}
    payload = _valid_screening_payload(screening_id="01-9001")

    first = client.post("/screenings/", json=payload, headers=headers)
    assert first.status_code == 200, first.text

    # This second POST, with the exact same client-supplied screening_id,
    # is what crashed with psycopg2.errors.UniqueViolation in production —
    # e.g. mobile app retries after a dropped connection with a locally
    # cached ID from a save that actually already succeeded server-side.
    second = client.post("/screenings/", json=payload, headers=headers)
    assert second.status_code == 200, second.text
    assert second.json()["screening_id"] == "01-9001"

    # Confirm it's genuinely one row (an update), not a rejected duplicate.
    count = db_session.query(Screening).filter(
        Screening.screening_id == "01-9001"
    ).count()
    assert count == 1


# ============================================================================
# TEST 2 — enrollment_id is required for every enrollment-scoped endpoint.
# require_enrollment_access() previously did nothing when enrollment_id was
# blank/None (it only checked site-access IF a matching screening existed),
# silently letting blank-enrollment_id records through.
# ============================================================================

def test_birth_resuscitation_requires_enrollment_id(client, nurse_token):
    headers = {"Authorization": f"Bearer {nurse_token}"}
    resp = client.post("/birth-resuscitation/", json={
        "screening_id": "01-9001",
        "baby_uid": "9001",
        # enrollment_id intentionally omitted
    }, headers=headers)
    assert resp.status_code == 422
    assert "enrollment_id" in resp.text


# ============================================================================
# TEST 3 — screening_status must be recomputed on every update, not frozen
# from whatever partial/incomplete state existed at creation. A screening
# that starts out excluded (e.g. exclusion_present=True on an early
# autosave) but is later corrected to be genuinely eligible must show as
# Eligible, not stay stuck at the original status forever.
# ============================================================================

def test_screening_status_recomputes_on_update(client, nurse_token):
    headers = {"Authorization": f"Bearer {nurse_token}"}

    created = client.post("/screenings/", json=_valid_screening_payload(
        screening_id="01-9002", exclusion_present=True,
    ), headers=headers)
    assert created.status_code == 200, created.text
    assert created.json()["screening_status"] == "Screen Failure"

    corrected = client.put("/screenings/01-9002", json=_valid_screening_payload(
        screening_id="01-9002", exclusion_present=False, consent_given="Yes",
    ), headers=headers)
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["screening_status"] == "Eligible", (
        "screening_status is frozen from the original save instead of "
        "reflecting the corrected data — the recompute-on-update fix is "
        "missing or was reverted."
    )


# ============================================================================
# TEST 4-6 — Forms C (Maternal Details), D (Postnatal Day 1), E (NICU
# Admission). Each must: reject a missing enrollment_id, accept a valid
# create, and accept a follow-up update to the SAME enrollment_id without
# creating a duplicate row.
# ============================================================================

@pytest.mark.parametrize("form_name,create_path,update_path_fmt,extra_fields", [
    ("Form C — Maternal Details", "/maternal-details/", "/maternal-details/{eid}", {}),
    ("Form D — Postnatal Day 1",  "/postnatal-day1/",   "/postnatal-day1/{eid}",   {}),
    ("Form E — NICU Admission",   "/nicu-admission/",   "/nicu-admission/{eid}",   {}),
])
def test_form_c_d_e_reject_missing_enrollment_id(client, nurse_token, form_name, create_path, update_path_fmt, extra_fields):
    headers = {"Authorization": f"Bearer {nurse_token}"}
    resp = client.post(create_path, json={**extra_fields}, headers=headers)
    assert resp.status_code == 422, f"{form_name}: expected 422 for missing enrollment_id, got {resp.status_code}: {resp.text}"


@pytest.mark.parametrize("form_name,create_path,update_path_fmt,enrollment_id", [
    ("Form C — Maternal Details", "/maternal-details/", "/maternal-details/{eid}", "01-ENR-C1"),
    ("Form D — Postnatal Day 1",  "/postnatal-day1/",   "/postnatal-day1/{eid}",   "01-ENR-D1"),
    ("Form E — NICU Admission",   "/nicu-admission/",   "/nicu-admission/{eid}",   "01-ENR-E1"),
])
def test_form_c_d_e_create_then_update_round_trip(client, nurse_token, db_session, form_name, create_path, update_path_fmt, enrollment_id):
    headers = {"Authorization": f"Bearer {nurse_token}"}

    extra = {"landmark": "Test landmark"} if "maternal" in create_path else {}
    created = client.post(create_path, json={"enrollment_id": enrollment_id, **extra}, headers=headers)
    assert created.status_code == 200, f"{form_name} create failed: {created.status_code} {created.text}"

    updated = client.put(update_path_fmt.format(eid=enrollment_id),
                          json={"enrollment_id": enrollment_id, **extra}, headers=headers)
    assert updated.status_code == 200, f"{form_name} update failed: {updated.status_code} {updated.text}"


# ============================================================================
# TEST 7 — regression test for the newest fix: POST /maternal-details/
# previously had NO existing-record check at all. Calling it twice for the
# same enrollment_id (e.g. a network retry) used to silently create a
# SECOND, conflicting row — no error, no warning, just corrupted data with
# two different answers for the same patient. Must now upsert.
# ============================================================================

def test_maternal_details_duplicate_post_does_not_create_second_row(client, nurse_token, db_session):
    headers = {"Authorization": f"Bearer {nurse_token}"}
    eid = "01-ENR-DUPE-C"

    first = client.post("/maternal-details/", json={"enrollment_id": eid, "landmark": "Test landmark"}, headers=headers)
    assert first.status_code == 200, first.text

    second = client.post("/maternal-details/", json={"enrollment_id": eid, "landmark": "Test landmark"}, headers=headers)
    assert second.status_code == 200, (
        f"Expected the second POST to upsert cleanly, got {second.status_code}: {second.text}"
    )

    from models import MaternalDetails
    count = db_session.query(MaternalDetails).filter(
        MaternalDetails.enrollment_id == eid
    ).count()
    assert count == 1, (
        f"Expected exactly 1 row for enrollment_id={eid}, found {count} — "
        "duplicate-row data corruption bug is present."
    )


# ============================================================================
# TEST 8 — regression test for the Birth Resuscitation fix: a nurse typing
# an enrollment_id that's already used by another patient previously caused
# an unhandled 500 with a raw psycopg2 traceback. Must now be a clean 409.
# ============================================================================

def test_birth_resuscitation_duplicate_enrollment_id_returns_clean_409(client, nurse_token, db_session):
    headers = {"Authorization": f"Bearer {nurse_token}"}

    first = client.post("/birth-resuscitation/", json={
        "screening_id": "01-9003", "baby_uid": "9003", "enrollment_id": "01-DUPE-B",
    }, headers=headers)
    assert first.status_code == 200, first.text

    # Different screening_id, but the SAME enrollment_id — this is the typo
    # scenario: a nurse fat-fingers an enrollment_id that's already in use
    # by a different patient's Form B record.
    conflict = client.post("/birth-resuscitation/", json={
        "screening_id": "01-9004", "baby_uid": "9004", "enrollment_id": "01-DUPE-B",
    }, headers=headers)
    assert conflict.status_code == 409, (
        f"Expected a clean 409 conflict, got {conflict.status_code}: {conflict.text}"
    )
    assert "500" not in str(conflict.status_code)