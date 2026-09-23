"""GA Check Log -- part 1 of the CONSORT-completeness plan (see
backend/birth_log_matching.py's header for part 2, already built).

The digitized Log of All Births catches a missed screening only after the
fact, at birth. This log is meant to catch it at the moment of triage: a
near-zero-friction entry logged the instant a nurse checks ANY woman's
gestational age at antenatal clinic/delivery-room triage -- including the
majority who turn out not preterm and would otherwise leave no trace
anywhere in the system. That population IS the CONSORT flow's true "Box 1 --
Approached for screening" count.

Eligibility uses the same <32-completed-weeks threshold already used by the
CONSORT dashboard's Box 5 SQL (backend/routers/dashboard.py) and by
ScreeningForm.jsx's own GA_MAX_WEEKS=31 inclusion window -- kept in sync
manually, not imported, for the same reason birth_log_matching.py's
GA_MIN_DAYS/GA_MAX_DAYS constants are: routers/dashboard.py builds its
version as a raw SQL fragment rather than a reusable Python constant.
"""
from __future__ import annotations

from typing import Optional

RELIABLE_SOURCE = "Reliable"


def classify_eligibility(gestation_weeks: Optional[int], ga_source: Optional[str]) -> Optional[bool]:
    """True if gestation_weeks < 32 (the trial's upper GA bound), False if
    known and >=32, None if GA wasn't captured or the source isn't marked
    Reliable -- mirrors Box 5's own "gestation_weeks IS NOT NULL AND
    gestation_weeks < 32" condition, plus the rule that an Unknown/
    Unreliable source must never be able to trigger Form A regardless of
    what weeks value happens to be present."""
    if ga_source != RELIABLE_SOURCE:
        return None
    if gestation_weeks is None:
        return None
    return int(gestation_weeks) < 32
