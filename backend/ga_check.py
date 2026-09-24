"""GA Check Log -- part 1 of the CONSORT-completeness plan (see
backend/birth_log_matching.py's header for part 2, already built).

The digitized Log of All Births catches a missed screening only after the
fact, at birth. This log is meant to catch it at the moment of triage: a
near-zero-friction entry logged the instant a nurse checks ANY woman's
gestational age at antenatal clinic/delivery-room triage -- including the
majority who turn out not preterm and would otherwise leave no trace
anywhere in the system. That population IS the CONSORT flow's true "Box 1 --
Approached for screening" count.

Eligibility uses the trial's full 25w0d-31w6d inclusion window -- same
window used by the CONSORT dashboard's Box 5 SQL (backend/routers/
dashboard.py, _GA_IN_WINDOW_SQL) and birth_log_matching.py's own
GA_MIN_DAYS/GA_MAX_DAYS, and by ScreeningForm.jsx's own GA_MIN_WEEKS=25/
GA_MAX_WEEKS=31 -- kept in sync manually across all three, not imported,
for the same reason dashboard.py builds its version as a raw SQL
fragment rather than a reusable Python constant.

**Corrected 2026-09-24**: this used to check ONLY the upper bound
(<32 weeks, no lower bound at all), inconsistent with the other two
copies of this window above -- a Gestation Log entry at e.g. 20 weeks
(a routine antenatal check, well before any preterm concern) was
wrongly classified "eligible" and would have prompted "Continue to
Form A" for a woman who isn't actually in the trial's inclusion window.
Form A's own separate validation (require_ga_in_inclusion_window in
main.py) would still have caught it before anything was saved, so this
was a workflow-correctness bug, not a data-integrity one -- but worth
fixing at the source rather than relying on the downstream guard alone.
"""
from __future__ import annotations

from typing import Optional

RELIABLE_SOURCE = "Reliable"
GA_MIN_WEEKS = 25
GA_MAX_WEEKS = 31  # inclusive -- i.e. up to 31w6d, matches GA_MAX_WEEKS everywhere else


def classify_eligibility(gestation_weeks: Optional[int], ga_source: Optional[str]) -> Optional[bool]:
    """True if 25-31 completed weeks (i.e. up to 31w6d) and the source is
    Reliable; False if known and outside that window (either side); None
    if GA wasn't captured or the source isn't marked Reliable -- mirrors
    Box 5's own full inclusion-window condition, plus the rule that an
    Unknown/Unreliable source must never be able to trigger Form A
    regardless of what weeks value happens to be present. Only the whole-
    weeks value is compared (not days) -- at these integer week
    boundaries the day-of-week component can never flip the in/out
    decision (e.g. 24w6d=174 days is always <25w0d=175 days; 31w0d-31w6d
    is always <=31w6d=223 days), so a days-aware comparison would give
    an identical result to this simpler one."""
    if ga_source != RELIABLE_SOURCE:
        return None
    if gestation_weeks is None:
        return None
    weeks = int(gestation_weeks)
    return GA_MIN_WEEKS <= weeks <= GA_MAX_WEEKS
