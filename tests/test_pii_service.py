"""Unit tests for backend/pii_service.py.

This module previously had very low coverage (~22%). These tests exercise the
role/permission helpers, the payload-shaping helpers, and the DB-backed
upsert/migrate/split helpers against an in-memory SQLite database.
"""

from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from db import Base
import pii_service as pii


# ---------------------------------------------------------------------------
# In-memory SQLite fixtures (only the tables pii_service touches)
# ---------------------------------------------------------------------------


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[models.ParticipantPII.__table__, models.Screening.__table__],
    )
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def make_user(role=None, site_name=None):
    return SimpleNamespace(role=role, site_name=site_name)


# ---------------------------------------------------------------------------
# can_view_pii
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "role,expected",
    [
        ("superadmin", True),
        ("pii_officer", True),
        ("site_user", True),
        ("SUPERADMIN", True),  # case-insensitive
        ("data_entry", False),
        ("", False),
        (None, False),
    ],
)
def test_can_view_pii_by_role(role, expected):
    assert pii.can_view_pii(make_user(role=role)) is expected


# ---------------------------------------------------------------------------
# can_view_pii_for_site
# ---------------------------------------------------------------------------


def test_can_view_pii_for_site_privileged_role_sees_any_site():
    user = make_user(role="superadmin", site_name="PGIMER")
    assert pii.can_view_pii_for_site(user, "GMCH") is True


def test_can_view_pii_for_site_site_user_matching_site():
    user = make_user(role="site_user", site_name="PGIMER")
    assert pii.can_view_pii_for_site(user, "PGIMER") is True


def test_can_view_pii_for_site_site_user_mismatched_site():
    user = make_user(role="site_user", site_name="PGIMER")
    assert pii.can_view_pii_for_site(user, "GMCH") is False


def test_can_view_pii_for_site_denied_role():
    user = make_user(role="data_entry", site_name="PGIMER")
    assert pii.can_view_pii_for_site(user, "PGIMER") is False


def test_can_view_pii_for_site_site_user_missing_site():
    user = make_user(role="site_user", site_name=None)
    assert pii.can_view_pii_for_site(user, "PGIMER") is False


# ---------------------------------------------------------------------------
# _merge
# ---------------------------------------------------------------------------


def test_merge_keeps_non_empty_values():
    out = pii._merge(None, a="x", b=1, c=None, d="")
    assert out == {"a": "x", "b": 1}


def test_merge_falls_back_to_existing_when_new_is_empty():
    existing = SimpleNamespace(a="old_a", b=None, d="old_d")
    out = pii._merge(existing, a="", b="", c=None, d="new_d")
    # a -> falls back to existing "old_a"; b -> existing None so dropped;
    # c -> no existing attr; d -> new value wins
    assert out == {"a": "old_a", "d": "new_d"}


# ---------------------------------------------------------------------------
# extract_screening_pii / clear_screening_pii_columns / strip_keys
# ---------------------------------------------------------------------------


def test_extract_screening_pii_only_returns_known_non_null_fields():
    data = {
        "mother_first_name": "Asha",
        "mother_surname": None,
        "maternal_uid": "UID-1",
        "not_a_pii_field": "ignored",
    }
    assert pii.extract_screening_pii(data) == {
        "mother_first_name": "Asha",
        "maternal_uid": "UID-1",
    }


def test_clear_screening_pii_columns_sets_all_to_none():
    screening = models.Screening(
        screening_id="SCR-1",
        mother_first_name="Asha",
        maternal_uid="UID-1",
        mother_contact="99999",
    )
    pii.clear_screening_pii_columns(screening)
    for field in pii.SCREENING_PII_FIELDS:
        assert getattr(screening, field) is None


def test_strip_keys_removes_requested_keys():
    data = {"a": 1, "b": 2, "c": 3}
    assert pii.strip_keys(data, ("b",)) == {"a": 1, "c": 3}


# ---------------------------------------------------------------------------
# pii_to_dict
# ---------------------------------------------------------------------------


def test_pii_to_dict_none_returns_none():
    assert pii.pii_to_dict(None) is None


def test_pii_to_dict_maps_fields():
    record = models.ParticipantPII(
        enrollment_id="ENR-1",
        screening_id="SCR-1",
        site_name="PGIMER",
        mother_first_name="Asha",
        maternal_uid="UID-1",
    )
    out = pii.pii_to_dict(record)
    assert out["enrollment_id"] == "ENR-1"
    assert out["mother_first_name"] == "Asha"
    assert out["maternal_uid"] == "UID-1"
    assert "updated_at" in out


# ---------------------------------------------------------------------------
# upsert_participant_pii
# ---------------------------------------------------------------------------


def test_upsert_creates_new_record(db):
    record = pii.upsert_participant_pii(
        db,
        enrollment_id="ENR-1",
        screening_id="SCR-1",
        site_name="PGIMER",
        mother_first_name="Asha",
    )
    db.commit()
    assert record.id is not None
    assert record.mother_first_name == "Asha"
    assert record.created_at is not None
    assert record.updated_at is not None
    assert db.query(models.ParticipantPII).count() == 1


def test_upsert_updates_existing_by_enrollment_id(db):
    pii.upsert_participant_pii(
        db, enrollment_id="ENR-1", mother_first_name="Asha"
    )
    db.commit()

    pii.upsert_participant_pii(
        db, enrollment_id="ENR-1", mother_surname="Devi", site_name="GMCH"
    )
    db.commit()

    rows = db.query(models.ParticipantPII).all()
    assert len(rows) == 1
    row = rows[0]
    # existing first name preserved, surname added, site set
    assert row.mother_first_name == "Asha"
    assert row.mother_surname == "Devi"
    assert row.site_name == "GMCH"


def test_upsert_matches_by_screening_id_when_no_enrollment(db):
    pii.upsert_participant_pii(
        db, screening_id="SCR-9", mother_first_name="Asha"
    )
    db.commit()

    # Now provide enrollment_id for the first time; should match on screening_id
    record = pii.upsert_participant_pii(
        db, enrollment_id="ENR-9", screening_id="SCR-9", husband_first_name="Ram"
    )
    db.commit()

    assert db.query(models.ParticipantPII).count() == 1
    assert record.enrollment_id == "ENR-9"
    assert record.mother_first_name == "Asha"
    assert record.husband_first_name == "Ram"


# ---------------------------------------------------------------------------
# get_pii_for_participant
# ---------------------------------------------------------------------------


def test_get_pii_for_participant_by_enrollment(db):
    pii.upsert_participant_pii(db, enrollment_id="ENR-1", mother_first_name="Asha")
    db.commit()
    found = pii.get_pii_for_participant(db, enrollment_id="ENR-1")
    assert found is not None
    assert found.mother_first_name == "Asha"


def test_get_pii_for_participant_by_screening(db):
    pii.upsert_participant_pii(db, screening_id="SCR-1", mother_first_name="Asha")
    db.commit()
    found = pii.get_pii_for_participant(db, screening_id="SCR-1")
    assert found is not None
    assert found.mother_first_name == "Asha"


def test_get_pii_for_participant_not_found(db):
    assert pii.get_pii_for_participant(db, enrollment_id="MISSING") is None
    assert pii.get_pii_for_participant(db) is None


# ---------------------------------------------------------------------------
# migrate_legacy_pii
# ---------------------------------------------------------------------------


def test_migrate_legacy_pii_moves_and_clears(db):
    s = models.Screening(
        screening_id="SCR-1",
        enrollment_id="ENR-1",
        site_name="PGIMER",
        mother_first_name="Asha",
        maternal_uid="UID-1",
    )
    # A screening with no PII should be skipped
    s2 = models.Screening(screening_id="SCR-2", enrollment_id="ENR-2")
    db.add_all([s, s2])
    db.commit()

    migrated = pii.migrate_legacy_pii(db)
    assert migrated == 1

    moved = pii.get_pii_for_participant(db, enrollment_id="ENR-1")
    assert moved is not None
    assert moved.mother_first_name == "Asha"
    assert moved.maternal_uid == "UID-1"

    # source columns cleared
    refreshed = db.query(models.Screening).filter_by(screening_id="SCR-1").first()
    assert refreshed.mother_first_name is None
    assert refreshed.maternal_uid is None


# ---------------------------------------------------------------------------
# split_and_store_pii
# ---------------------------------------------------------------------------


def test_split_and_store_pii_removes_keys_and_stores(db):
    payload = {
        "enrollment_id": "ENR-1",
        "mother_name_first": "Asha",
        "mother_name_surname": "Devi",
        "contact_mother": "99999",
        "clinical_value": 42,
    }
    pii_keys = pii.BIRTH_PII_FIELDS
    returned = pii.split_and_store_pii(
        db, payload, pii_keys, enrollment_id="ENR-1", site_name="PGIMER"
    )
    db.commit()

    # PII keys removed from payload, clinical field retained
    assert "mother_name_first" not in returned
    assert "contact_mother" not in returned
    assert returned["clinical_value"] == 42

    stored = pii.get_pii_for_participant(db, enrollment_id="ENR-1")
    assert stored is not None
    assert stored.mother_first_name == "Asha"
    assert stored.mother_surname == "Devi"
    assert stored.mother_contact == "99999"


def test_split_and_store_pii_splits_full_mother_name(db):
    payload = {"mother_name": "Asha Devi", "maternal_uid": "UID-1"}
    pii.split_and_store_pii(
        db, payload, pii.MATERNAL_PII_FIELDS, enrollment_id="ENR-2"
    )
    db.commit()
    stored = pii.get_pii_for_participant(db, enrollment_id="ENR-2")
    assert stored.mother_first_name == "Asha"
    assert stored.mother_surname == "Devi"


def test_split_and_store_pii_no_pii_values_is_noop(db):
    payload = {"clinical_value": 1, "mother_name": ""}
    returned = pii.split_and_store_pii(
        db, payload, pii.MATERNAL_PII_FIELDS, enrollment_id="ENR-3"
    )
    db.commit()
    assert returned == {"clinical_value": 1}
    assert db.query(models.ParticipantPII).count() == 0


# ---------------------------------------------------------------------------
# screening_to_clinical_dict
# ---------------------------------------------------------------------------


def test_screening_to_clinical_dict_excludes_pii():
    s = models.Screening(
        screening_id="SCR-1",
        enrollment_id="ENR-1",
        site_name="PGIMER",
        mother_first_name="Asha",
        maternal_uid="UID-1",
    )
    out = pii.screening_to_clinical_dict(s)
    assert out["screening_id"] == "SCR-1"
    assert out["site_name"] == "PGIMER"
    for field in pii.SCREENING_PII_FIELDS:
        assert field not in out
