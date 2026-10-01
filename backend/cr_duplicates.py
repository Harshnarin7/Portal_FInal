"""Duplicate CR-number check for the Gestation (Inclusion Criteria) Screening
Log and the Log of All Births (PI 2026-09-28).

- The CR number is NOT mandatory: an entry without one is saved and shown as
  "CR pending" until it is filled in.
- A CR number already logged at the same site is flagged as a duplicate on
  the form itself and the save is refused, unless the user confirms it is a
  genuinely separate record (Gestation Log: a new contact of the same woman;
  Log of All Births: a twin / multiple birth).
- Log of All Births: the same CR is only a duplicate for the same date of
  birth (a later pregnancy of the same mother is a new birth).

Pure (no DB): mother_uid is an encrypted column, so the endpoint loads the
site's rows and passes them in, same as birth_log_matching.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional


def normalize_cr(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"[\s\-]+", "", str(value).strip().upper())


def find_duplicate(rows: Iterable, mother_uid: Optional[str], *, exclude_id=None,
                   date_of_birth=None, match_dob: bool = False, birth_order=None):
    """First row with the same normalised CR (and, for births, the same date
    of birth), ignoring `exclude_id`. None when the CR is blank or unique.

    birth_order (PI 2026-10-01): a twin/triplet genuinely shares the mother's
    CR number and date of birth with its sibling(s) -- that is not a data-
    entry mistake, so a *different*, explicitly-stated birth_order on both
    sides is not treated as a duplicate. A row with no birth_order recorded
    (every row before this field existed, or a still-unclassified entry)
    keeps the old behaviour and is still flagged -- only a genuine,
    stated disagreement in order clears the match, so an existing real
    duplicate is never silently hidden just because the new column is
    blank on one or both sides."""
    cr = normalize_cr(mother_uid)
    if not cr:
        return None
    for r in rows:
        if exclude_id is not None and getattr(r, "id", None) == exclude_id:
            continue
        if normalize_cr(getattr(r, "mother_uid", None)) != cr:
            continue
        if match_dob and getattr(r, "date_of_birth", None) != date_of_birth:
            continue
        other_order = getattr(r, "birth_order", None)
        if birth_order is not None and other_order is not None and birth_order != other_order:
            continue
        return r
    return None
