"""Seed site staff roster into database."""

from sqlalchemy.orm import Session

from models import SiteStaff
from staff_seed import DEFAULT_SITE_STAFF


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
