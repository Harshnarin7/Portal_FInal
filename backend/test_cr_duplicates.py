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


# Twin/triplet/quadruplet disambiguation (PI 2026-10-01): a multiple birth
# genuinely shares the mother's CR number and date of birth with its
# sibling(s) -- that is not a duplicate once both sides state which baby
# they are.
TWIN_DOB = date(2026, 9, 23)
TWIN1 = R(id=11, mother_uid="202604644795", date_of_birth=TWIN_DOB, birth_order=1)
LEGACY_NO_ORDER = R(id=5, mother_uid="202604644795", date_of_birth=TWIN_DOB, birth_order=None)


def test_different_stated_birth_order_is_not_a_duplicate():
    assert find_duplicate([TWIN1], "202604644795", match_dob=True,
                          date_of_birth=TWIN_DOB, birth_order=2) is None


def test_same_stated_birth_order_is_still_a_duplicate():
    dup = find_duplicate([TWIN1], "202604644795", match_dob=True,
                         date_of_birth=TWIN_DOB, birth_order=1)
    assert dup is not None and dup.id == 11


def test_a_legacy_row_with_no_order_is_still_flagged():
    """Only a stated disagreement in order clears the match -- a row saved
    before this field existed (or a still-unclassified entry) must not have
    its duplicate warning silently suppressed just because the new column
    happens to be blank."""
    dup = find_duplicate([LEGACY_NO_ORDER], "202604644795", match_dob=True,
                         date_of_birth=TWIN_DOB, birth_order=2)
    assert dup is not None and dup.id == 5


def test_an_entry_with_no_order_stated_is_still_flagged_against_a_stated_twin():
    dup = find_duplicate([TWIN1], "202604644795", match_dob=True,
                         date_of_birth=TWIN_DOB, birth_order=None)
    assert dup is not None and dup.id == 11
