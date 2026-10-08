"""Primary mobile is required. Secondary is optional, and must differ."""

import pytest
from pydantic import ValidationError

from mobile_numbers import ERR_SAME, mobile_pair_errors
from schemas import BirthResuscitationCreate, ScreeningCreate


def _screening(**overrides):
    base = dict(
        site_name="PGIMER",
        site_id="01",
        screened_by="Nurse",
        mother_first_name="A",
        husband_first_name="B",
        gestation_weeks=28,
        gestation_days=0,
        exclusion_present=False,
        is_complete=True,
        mother_contact="9876543210",
        husband_contact=None,
    )
    base.update(overrides)
    return ScreeningCreate(**base)


def test_primary_empty_fails():
    with pytest.raises(ValidationError):
        _screening(mother_contact="")


def test_primary_only_passes():
    row = _screening(mother_contact="9876543210", husband_contact="")
    assert row.mother_contact == "9876543210"
    assert not row.husband_contact


def test_both_valid_passes():
    row = _screening(mother_contact="9876543210", husband_contact="9123456780")
    assert row.husband_contact == "9123456780"


def test_secondary_invalid_fails():
    with pytest.raises(ValidationError):
        _screening(husband_contact="12345")


def test_both_the_same_fails():
    with pytest.raises(ValidationError, match=ERR_SAME):
        _screening(mother_contact="9876543210", husband_contact="9876543210")


def test_draft_may_omit_primary():
    row = _screening(is_complete=False, mother_contact="", husband_contact="")
    assert row.mother_contact in (None, "")


def test_birth_secondary_may_be_empty_and_must_differ():
    ok = BirthResuscitationCreate(
        contact_mother="9876543210", contact_husband=None
    )
    assert ok.contact_mother == "9876543210"
    with pytest.raises(ValidationError, match=ERR_SAME):
        BirthResuscitationCreate(
            contact_mother="9876543210", contact_husband="9876543210"
        )


def test_pair_messages():
    primary, secondary = mobile_pair_errors("", "", primary_required=True)
    assert primary == "Required"
    assert secondary is None
    primary, secondary = mobile_pair_errors("9876543210", "9876543210", primary_required=True)
    assert secondary == ERR_SAME
