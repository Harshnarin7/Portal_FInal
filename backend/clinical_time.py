"""Clinical-day clock for PORTAL (all sites are in India).

The server runs on UTC. Anything that means "today" in the NICU sense — DMS
sheet dates, the 8 am NICU-day boundary, "today" filters, report dates —
must use India time, or it rolls over at 5:30 am / splits the 8 am boundary
to 1:30 pm IST (found 2026-09-27: /minimal-monitoring/.../today changed day
at 1:30 pm IST, and DMS saves for the current date were rejected between
midnight and 5:30 am IST). Record timestamps (created_at, saved_at, ...)
are NOT clinical days and stay as they are.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

CLINICAL_TZ = ZoneInfo("Asia/Kolkata")


def clinical_now() -> datetime:
    """Current wall-clock time in India, as a naive datetime (same shape
    as datetime.now() so existing comparisons keep working)."""
    return datetime.now(CLINICAL_TZ).replace(tzinfo=None)


def clinical_today() -> date:
    """Today's calendar date in India."""
    return clinical_now().date()
