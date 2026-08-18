"""
One-time cleanup: merge duplicate postnatal_day1 rows per enrollment_id.

Context
-------
POST /postnatal-day1/ used to always INSERT. enrollment_id is not unique at
the DB level, so a network retry or a stale Form D isRecordSaved flag could
create a second row. GET then used .first() with no ORDER BY, which could
return the older row and make later saves look like they vanished.

This script is idempotent and MUST be run manually against the target
database (including production). It is not wired into schema_patches.py
and will not run on server startup.

For each enrollment_id with more than one row:
  1. Sort rows by id descending (newest first).
  2. Merge columns: prefer the newest non-null value, then walk older rows
     until a non-null is found. This recovers fields saved on a row that
     GET later did not return.
  3. Write the merged values onto the newest row.
  4. Only after that commit succeeds, delete the older duplicate row(s).

Usage (from the backend folder, with DATABASE_URL pointing at the target):
    python cleanup_postnatal_day1_duplicates.py

A review log is printed to stdout and written next to this script as
cleanup_postnatal_day1_duplicates.log so Harsh can inspect what changed.
"""
from __future__ import annotations

from datetime import date, datetime, time
from pathlib import Path

from sqlalchemy import func

from db import SessionLocal
from models import PostnatalDay1

SKIP_COLUMNS = {"id", "enrollment_id"}
LOG_PATH = Path(__file__).resolve().parent / "cleanup_postnatal_day1_duplicates.log"


def _fmt(value):
    if value is None:
        return "NULL"
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return repr(value)


def merge_group(rows):
    """rows must be newest-first (highest id first). Returns (keep, deleted_ids, changes)."""
    keep = rows[0]
    older = rows[1:]
    changes = []

    for col in keep.__table__.columns:
        name = col.name
        if name in SKIP_COLUMNS:
            continue
        chosen = None
        source_id = None
        for row in rows:
            value = getattr(row, name)
            if value is not None:
                chosen = value
                source_id = row.id
                break
        current = getattr(keep, name)
        if current != chosen:
            changes.append(
                {
                    "column": name,
                    "from": current,
                    "to": chosen,
                    "from_row_id": source_id,
                }
            )
            setattr(keep, name, chosen)

    return keep, [r.id for r in older], changes


def main():
    lines = []

    def log(msg=""):
        print(msg)
        lines.append(msg)

    db = SessionLocal()
    try:
        dup_ids = (
            db.query(PostnatalDay1.enrollment_id)
            .group_by(PostnatalDay1.enrollment_id)
            .having(func.count(PostnatalDay1.id) > 1)
            .all()
        )
        enrollment_ids = [eid for (eid,) in dup_ids if eid]

        log(f"postnatal_day1 duplicate cleanup started {datetime.now().isoformat()}")
        log(f"DATABASE target: {db.get_bind().url.render_as_string(hide_password=True)}")
        log(f"enrollment_ids with >1 row: {len(enrollment_ids)}")
        log("")

        if not enrollment_ids:
            log("Nothing to do — no duplicate enrollment_id groups found.")
            return

        merged_count = 0
        deleted_count = 0

        for enrollment_id in sorted(enrollment_ids):
            rows = (
                db.query(PostnatalDay1)
                .filter(PostnatalDay1.enrollment_id == enrollment_id)
                .order_by(PostnatalDay1.id.desc())
                .all()
            )
            if len(rows) < 2:
                continue

            keep, older_ids, changes = merge_group(rows)
            all_ids = [r.id for r in rows]

            log(f"enrollment_id={enrollment_id}")
            log(f"  rows (newest first): {all_ids}")
            log(f"  keep_id={keep.id}  delete_ids={older_ids}")
            if changes:
                for change in changes:
                    log(
                        f"  merge {change['column']}: "
                        f"{_fmt(change['from'])} -> {_fmt(change['to'])} "
                        f"(from row id={change['from_row_id']})"
                    )
            else:
                log("  merge: newest row already had every non-null value")

            db.flush()
            db.query(PostnatalDay1).filter(PostnatalDay1.id.in_(older_ids)).delete(
                synchronize_session=False
            )
            db.commit()

            merged_count += 1
            deleted_count += len(older_ids)
            log("  committed")
            log("")

        remaining = (
            db.query(PostnatalDay1.enrollment_id)
            .group_by(PostnatalDay1.enrollment_id)
            .having(func.count(PostnatalDay1.id) > 1)
            .count()
        )
        log("cleanup complete")
        log(f"  groups merged: {merged_count}")
        log(f"  older rows deleted: {deleted_count}")
        log(f"  remaining duplicate groups: {remaining}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        LOG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\nReview log written to {LOG_PATH}")


if __name__ == "__main__":
    main()
