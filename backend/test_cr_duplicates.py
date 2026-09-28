from datetime import date
from types import SimpleNamespace as R

from cr_duplicates import find_duplicate, normalize_cr

ROWS = [R(id=1, mother_uid="2026-0464 4795", date_of_birth=date(2026, 9, 28)),
        R(id=2, mother_uid=None, date_of_birth=None),
        R(id=3, mother_uid="123/2026", date_of_birth=date(2026, 9, 20))]


def test_normalize():
    assert normalize_cr(" 2026-0464 4795 ") == "202604644795" and normalize_cr(None) == ""


def test_blank_cr_is_never_a_duplicate():
    assert find_duplicate(ROWS, "") is None and find_duplicate(ROWS, None) is None


def test_same_cr_found_ignoring_spaces_and_dashes():
    assert find_duplicate(ROWS, "202604644795").id == 1
    assert find_duplicate(ROWS, "123/2026").id == 3


def test_editing_the_same_entry_is_not_a_duplicate():
    assert find_duplicate(ROWS, "202604644795", exclude_id=1) is None


def test_birth_log_needs_same_date_of_birth():
    assert find_duplicate(ROWS, "202604644795", match_dob=True, date_of_birth=date(2026, 9, 28)).id == 1
    assert find_duplicate(ROWS, "202604644795", match_dob=True, date_of_birth=date(2027, 8, 1)) is None
