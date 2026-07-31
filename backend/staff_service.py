"""Seed site staff roster into database."""

from sqlalchemy.orm import Session

from models import SiteStaff
from staff_seed import DEFAULT_SITE_STAFF

# Known-wrong (site_name, name) pairs from before the 2026-07-31 roster
# correction — deactivated rather than deleted, so any historical link
# (e.g. a screening record's screened_by referencing the old string) is
# preserved. The /sites/{site}/screeners endpoint already filters on
# is_active, so deactivated rows silently drop out of the dropdown.
STALE_SITE_STAFF: list[tuple[str, str]] = [
    ("GMCH", "Arushu"),              # typo — corrected to "Arushi"
    ("IOG", "Yashvi Jolly"),         # wrong site — she's PGIMER staff
    ("GMCH-A", "Nurse A"),           # placeholder, replaced with real roster
    ("GMCH-A", "Nurse B"),           # placeholder, replaced with real roster
    ("AMC", "Nurse A"),              # placeholder, replaced with real roster
    ("AMC", "Nurse B"),              # placeholder, replaced with real roster
]


def seed_site_staff(db: Session) -> int:
    added = 0
    for site_name, names in DEFAULT_SITE_STAFF.items():
        for name in names:
            exists = (
                db.query(SiteStaff)
                .filter(SiteStaff.site_name == site_name, SiteStaff.name == name)
                .first()
            )
            if exists:
                continue
            db.add(
                SiteStaff(
                    site_name=site_name,
                    name=name,
                    role="screener",
                    is_active=True,
                )
            )
            added += 1
    if added:
        db.commit()
    return added


def deactivate_stale_site_staff(db: Session) -> int:
    deactivated = 0
    for site_name, name in STALE_SITE_STAFF:
        row = (
            db.query(SiteStaff)
            .filter(
                SiteStaff.site_name == site_name,
                SiteStaff.name == name,
                SiteStaff.is_active.is_(True),
            )
            .first()
        )
        if not row:
            continue
        row.is_active = False
        deactivated += 1
    if deactivated:
        db.commit()
    return deactivated