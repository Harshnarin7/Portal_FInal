"""Read-only data-integrity report for the PORTAL eCRF.

Runs the checks described in docs/09_data_integrity_playbook.md and prints
what it finds. It NEVER writes to the database (everything runs inside a
transaction that is rolled back).

Run on the server:
    cd /home/ubuntu/portal/backend && source venv/bin/activate
    set -a && source .env && set +a
    python data_integrity_check.py            # all sites
    python data_integrity_check.py PGIMER     # one site

Output contains enrollment / screening ids and dates only - no names or CR
numbers.
"""
from __future__ import annotations

import logging
import re
import sys
from collections import defaultdict

from sqlalchemy import inspect, text

logging.disable(logging.CRITICAL)

from db import engine  # noqa: E402
from cr_duplicates import normalize_cr  # noqa: E402

ENROLLMENT_RE = re.compile(r"^\d{2}-[A-D]-\d{3}$", re.IGNORECASE)
SITE = sys.argv[1] if len(sys.argv) > 1 else None

# Tables keyed by enrollment_id that belong to one baby (excludes identity,
# audit and the two screening logs, which are handled separately).
SKIP = {"audit_log", "participant_pii", "screenings", "birth_resuscitation",
        "ga_check_log", "birth_log_all_births", "users", "site_staff"}


def valid_eid(eid: str | None) -> bool:
    if not eid:
        return False
    return bool(ENROLLMENT_RE.match(eid) or eid.upper().startswith("NR-"))


def section(title: str) -> None:
    print(f"\n=== {title}")


def main() -> int:
    issues = 0
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.connect() as c:
        trans = c.begin()
        try:
            site_sql = "AND s.site_name = :site" if SITE else ""
            params = {"site": SITE} if SITE else {}

            births = c.execute(text(f"""
                SELECT b.id, b.enrollment_id, b.screening_id, b.date_of_birth, b.randomised,
                       b.required_resuscitation, s.consent_given, s.screening_status,
                       s.site_name, s.enrollment_id AS s_eid
                FROM birth_resuscitation b
                LEFT JOIN screenings s ON s.screening_id = b.screening_id
                WHERE TRUE {site_sql}
            """), params).mappings().all()
            eids = {r["enrollment_id"] for r in births if r["enrollment_id"]}

            section("1. Form B enrollment ids that are not a complete id (00-X-000) or NR-")
            bad = [r for r in births if not valid_eid(r["enrollment_id"])]
            for r in bad:
                print(f"  birth #{r['id']}: enrollment_id={r['enrollment_id']!r} screening={r['screening_id']} "
                      f"site={r['site_name']} randomised={r['randomised']}")
            issues += len(bad)
            print("  none" if not bad else "")

            section("2. Screenings with more than one Form B row (split baby)")
            by_sid = defaultdict(list)
            for r in births:
                if r["screening_id"]:
                    by_sid[r["screening_id"]].append(r)
            split = {k: v for k, v in by_sid.items() if len(v) > 1}
            for sid, rows in split.items():
                print(f"  screening {sid}: Form B ids {[r['enrollment_id'] for r in rows]}; "
                      f"screening points to {rows[0]['s_eid']!r}")
            issues += len(split)
            print("  none" if not split else "")

            section("3. Form B saved for a screening that is not Eligible "
                    "(mirrors main.require_eligible_screening_for_form_b, added 30-09-2026 -"
                    " covers randomised AND NR- rows, not just randomised=True)")
            mismatch = [r for r in births if r["screening_id"] and r["site_name"] is not None
                        and (r["screening_status"] or "") != "Eligible"]
            for r in mismatch:
                print(f"  {r['enrollment_id']} (screening {r['screening_id']}): "
                      f"status={r['screening_status']!r} consent={r['consent_given']!r} "
                      f"randomised={r['randomised']}")
            issues += len(mismatch)
            print("  none" if not mismatch else "")

            section("4. Form B row with no matching Form A (screening id unknown)")
            orphan_b = [r for r in births if r["screening_id"] and r["site_name"] is None]
            for r in orphan_b:
                print(f"  {r['enrollment_id']}: screening {r['screening_id']} not found")
            issues += len(orphan_b)
            print("  none" if not orphan_b else "")

            section("5. Rows in other forms whose enrollment_id has no Form B")
            orphans = 0
            for t in sorted(tables - SKIP):
                cols = {col["name"] for col in insp.get_columns(t)}
                if "enrollment_id" not in cols:
                    continue
                rows = c.execute(text(f"SELECT DISTINCT enrollment_id FROM {t} WHERE enrollment_id IS NOT NULL")).all()
                missing = sorted({x[0] for x in rows} - eids) if not SITE else []
                if missing:
                    orphans += len(missing)
                    print(f"  {t}: {missing[:10]}{' …' if len(missing) > 10 else ''}")
            issues += orphans
            print("  none" if not orphans else "")

            section("6. Form E Day 1 Date different from Form B date of birth")
            rows = c.execute(text("""
                SELECT n.enrollment_id, n.day1_date, b.date_of_birth
                FROM nicu_admission n JOIN birth_resuscitation b ON b.enrollment_id = n.enrollment_id
                WHERE n.day1_date IS NOT NULL AND b.date_of_birth IS NOT NULL AND n.day1_date <> b.date_of_birth
            """)).all()
            for r in rows:
                if r[0] in eids:
                    print(f"  {r[0]}: Day 1 Date {r[1]} vs DOB {r[2]} (helper days / PMA dates will shift)")
                    issues += 1
            print("  none" if not rows else "")

            section("7. Randomised babies with no Form E Day 1 Date (Form I PMA section shows no data)")
            rows = c.execute(text("""
                SELECT b.enrollment_id FROM birth_resuscitation b
                LEFT JOIN nicu_admission n ON n.enrollment_id = b.enrollment_id
                WHERE b.randomised IS TRUE AND (n.id IS NULL OR n.day1_date IS NULL)
            """)).all()
            listed = [r[0] for r in rows if r[0] in eids]
            print("  " + (", ".join(listed) if listed else "none"))

            section("8. Effective gestation changed by Form D NBS (> 14 days from Form B)")
            rows = c.execute(text("""
                SELECT b.enrollment_id, b.gestation_weeks, b.gestation_days, d.gestation_weeks, d.gestation_days
                FROM birth_resuscitation b JOIN postnatal_day1 d ON d.enrollment_id = b.enrollment_id
                WHERE d.ga_method = 'NBS' AND d.gestation_weeks IS NOT NULL AND b.gestation_weeks IS NOT NULL
            """)).all()
            shown = 0
            for r in rows:
                if r[0] not in eids:
                    continue
                diff = abs((r[3] * 7 + (r[4] or 0)) - (r[1] * 7 + (r[2] or 0)))
                if diff > 14:
                    shown += 1
                    print(f"  {r[0]}: Form B {r[1]}+{r[2] or 0} -> Form D NBS {r[3]}+{r[4] or 0} "
                          f"({diff} days) - all PMA checkpoints use the NBS value")
            print("  none" if not shown else "")

            section("9. Test data still present (consent 'Trial run')")
            rows = c.execute(text(f"""
                SELECT s.screening_id, s.enrollment_id, s.site_name FROM screenings s
                WHERE s.consent_given = 'Trial run' {site_sql}
            """), params).all()
            print("  " + (", ".join(f"{r[0]}/{r[1]}" for r in rows) if rows else "none"))

            section("10. Schema: model columns missing in the database")
            from models import Base  # noqa: E402
            gaps = 0
            for t, table in Base.metadata.tables.items():
                if t not in tables:
                    print(f"  MISSING TABLE {t}")
                    gaps += 1
                    continue
                missing = {col.name for col in table.columns} - {x["name"] for x in insp.get_columns(t)}
                if missing:
                    print(f"  {t}: {sorted(missing)}")
                    gaps += 1
            issues += gaps
            print("  none" if not gaps else "")

            section("11. Log of All Births: entries sharing a CR + date of "
                    "birth with no Birth order recorded (mirrors the "
                    "'Not classified' badge on the page itself, chapter 08 §3)")
            from crypto import decrypt_value  # noqa: E402
            blab_site_sql = "AND site_name = :site" if SITE else ""
            blab_rows = c.execute(text(f"""
                SELECT id, site_name, mother_uid, date_of_birth, birth_order
                FROM birth_log_all_births WHERE TRUE {blab_site_sql}
            """), params).fetchall()
            groups = defaultdict(list)
            for rid, site, uid_enc, dob, order in blab_rows:
                uid = normalize_cr(decrypt_value(uid_enc)) if uid_enc else ""
                if uid and dob:
                    groups[(site, uid, dob)].append((rid, order))
            unclassified = {k: v for k, v in groups.items()
                            if len(v) > 1 and any(order is None for _, order in v)}
            for (site, _, dob), rows_ in unclassified.items():
                print(f"  {site} {dob}: Log of All Births ids {[r for r, _ in rows_]}")
            issues += len(unclassified)
            print("  none" if not unclassified else "")
        finally:
            trans.rollback()

    print(f"\nIssues needing attention (sections 1-6, 10-11): {issues}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
