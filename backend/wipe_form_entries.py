"""
PORTAL Trial — wipe test CRF / helper / SAE / PII rows
======================================================
Deletes every patient form entry (screening through helpers, SAE, PII,
audit trail). Does NOT delete staff logins (`users`) or site screeners
(`site_staff`). After this, new Form A IDs start again at 01-0001 etc.

Dry-run (counts only, no delete):

    docker compose exec backend python wipe_form_entries.py

Actually wipe (AWS production — irreversible):

    docker compose exec backend python wipe_form_entries.py --yes-wipe-all-form-entries
"""

from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import inspect, text

sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal, engine  # noqa: E402

# Staff / roster — never touched.
KEEP_TABLES = frozenset({"users", "site_staff", "alembic_version"})

# Clinical + PII + test audit. Order does not matter for a single TRUNCATE.
FORM_TABLES = [
    "audit_log",
    "participant_pii",
    "screenings",
    "birth_resuscitation",
    "maternal_details",
    "postnatal_day1",
    "nicu_admission",
    "neonatal_morbidities",
    "study_outcomes",
    "cranial_ultrasound",
    "rop_screening",
    "composite_outcomes",
    "external_hospital_assessments",
    "fio2_auc_logs",
    "resp_cv_neuro_logs",
    "infect_gi_hema_log",
    "metab_renal_vasc_eye_log",
    "sae_reports",
    "adverse_events",
    "sae_list",
    "respiratory_logs",
    "steroid_data",
    "resp_cv_neuro_day_logs",
    "infect_gi_hema_day_logs",
    "metab_renal_vasc_eye_day_logs",
    "minimal_monitoring_day_logs",
    "cranial_usg_records",
    "mri_brain_assessments",
    "blender_study_summaries",
]


def _existing_tables() -> set[str]:
    return set(inspect(engine).get_table_names())


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Wipe all test form entries. Keeps users and site_staff."
    )
    parser.add_argument(
        "--yes-wipe-all-form-entries",
        action="store_true",
        help="Required to actually delete. Without this flag, only counts are printed.",
    )
    args = parser.parse_args()

    existing = _existing_tables()
    unexpected_keep = existing & KEEP_TABLES
    targets = [t for t in FORM_TABLES if t in existing]
    extra = sorted(existing - KEEP_TABLES - set(FORM_TABLES))

    db = SessionLocal()
    try:
        print("Database:", engine.url.render_as_string(hide_password=True))
        print()
        print("KEPT (not wiped):", ", ".join(sorted(unexpected_keep)) or "(none found)")
        for t in sorted(unexpected_keep):
            n = db.execute(text(f"SELECT COUNT(*) FROM {_quote(t)}")).scalar()
            print(f"  {t:40s} {n}")
        print()
        print("FORM / PII / AUDIT rows that will be deleted:")
        total = 0
        for t in targets:
            n = db.execute(text(f"SELECT COUNT(*) FROM {_quote(t)}")).scalar() or 0
            total += int(n)
            print(f"  {t:40s} {n}")
        if extra:
            print()
            print("Other tables (left alone — not in the wipe list):")
            for t in extra:
                n = db.execute(text(f"SELECT COUNT(*) FROM {_quote(t)}")).scalar()
                print(f"  {t:40s} {n}")
        print()
        print(f"Total form/PII/audit rows: {total}")

        if not args.yes_wipe_all_form_entries:
            print()
            print("Dry-run only. Nothing was deleted.")
            print("To wipe the AWS test entries, run:")
            print("  docker compose exec backend python wipe_form_entries.py --yes-wipe-all-form-entries")
            return 0

        if not targets:
            print("No form tables found. Nothing to wipe.")
            return 0

        quoted = ", ".join(_quote(t) for t in targets)
        db.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
        db.commit()
        print()
        print("Wiped. Staff logins and site screeners are unchanged.")
        print("Next Form A at each site will be numbered 0001 again.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
