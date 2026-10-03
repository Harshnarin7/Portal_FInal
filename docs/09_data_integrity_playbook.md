# 09 — Data-integrity playbook

## 0. First, run the check script (read-only)

```bash
ssh -i ~/.ssh/icmr-keypair.pem ubuntu@13.205.77.67
cd /home/ubuntu/portal/backend && source venv/bin/activate
set -a && source .env && set +a
python data_integrity_check.py            # all sites
python data_integrity_check.py PGIMER     # one site
```

`backend/data_integrity_check.py` never writes (rolled-back transaction) and
prints ids and dates only — no names or CR numbers. Sections:

| # | Check | Why it matters |
|---|---|---|
| 1 | Form B enrollment id not complete (`00-X-000`) and not `NR-` | half-typed id saved by autosave (§1) |
| 2 | More than one Form B row for one screening | baby's data split across ids (§1) |
| 3 | Form B saved for a screening that is not Eligible (any Form B row, incl. `NR-`) | protocol / consent problem (§2); server now refuses new saves like this |
| 4 | Form B row whose screening id has no Form A | orphan birth record |
| 5 | Rows in other forms whose enrollment id has no Form B | orphan / mistyped id downstream |
| 6 | Form E Day 1 Date ≠ date of birth | helper days and PMA dates shift (§4) |
| 7 | Randomised babies without Form E Day 1 Date | Form I 36/40/44 wk shows "no data" |
| 8 | Form D NBS gestation > 14 d from Form B | every PMA checkpoint uses the NBS value (§5) |
| 9 | Screenings with consent "Trial run" | test data still in the live database |
| 10 | Model columns missing in the database | form GET fails → page loads blank (§7) |

## 1. Half-typed / changed enrollment ids — split babies
**Seen live 30-09-2026:** `01-` (screening 01-0009) and `01-B-` + `01-B-123`
(screening 01-0031). These two pre-date the fix below; the data itself still
needs repair (see below) — the fix only stops it recurring.

**Mechanism:**
- Form B autosaves once the enrollment id box is **non-empty**; before
  30-09-2026 the server never checked the format on create.
- An existing Form B row is reused only if the **same** enrollment id (or, for
  not-randomised, the same screening id) is sent again. A randomised baby whose
  id changes between saves therefore gets a **new** Form B row.
- `link_screening_enrollment` points the screening at whichever id was saved
  **last**.
- Everything filled afterwards (helpers, Forms C–L) follows whichever id the
  browser held at the time — so data can end up under two ids.

**Fixed 30-09-2026**: `main.require_valid_enrollment_id_format` runs on every
Form B create *and* update — rejects (422) anything that is not a complete
`<site>-<A-D>-<number>` id or an `NR-` placeholder, for every caller (web,
mobile app, direct API call), not just the browser's own autosave guard
(chapter 02).

**Investigate the two existing bad records:** check-script sections 1, 2, 5.
Ask the site which id is correct.

**Repair (superadmin, after a `pg_dump` backup — §8):** in one transaction, move
every row from the wrong id to the right id (`UPDATE <table> SET enrollment_id =
'<right>' WHERE enrollment_id = '<wrong>'` for every table that has the column,
checking first that the right id has no conflicting row for the same day/
checkpoint), delete the empty duplicate Form B row, set
`screenings.enrollment_id` to the right id, and update `participant_pii`.
**Keep `audit_log` rows.** Re-run the check script.

## 2. Consent vs randomisation
**Seen live 30-09-2026:** `01-0031` — Form A consent "No" (28-09, 05:55 IST,
a full day before Form B existed) with two Form B rows saved as randomised
and helper-form data filled in under one of them.

**Mechanism:** the browser sidebar greys out Form B when Form A isn't
Eligible, but that is a **page-only** lock. Before 30-09-2026 nothing on the
server checked it, so any route that skips the browser's own logic — the
mobile app's two "Form B1" buttons (neither checks consent, confirmed by
reading `Portal_app1`), a stale browser tab open from before consent was
recorded, or a direct API call — could still create the record.

**Fixed 30-09-2026**: `main.require_eligible_screening_for_form_b` runs on
every Form B create *and* update (including the `NR-` "no PPV needed" path)
— rejects (422) unless the linked Form A screening is Eligible (GA in
window, no exclusion, consent Yes / Trial run). A screening with no
`screening_id` sent at all passes unchecked (nothing to evaluate against).

**Mobile app fix, 30-09-2026 (`Portal_app1` PR #1, `venkatpgi` account, not
build-tested — no Flutter toolchain available):** both Form B entry points
(`screening_form.dart` `_formBLocked`, `nurse_dashboard.dart` `formBOpen`)
now also require no exclusion and consent Yes/Trial run, so a nurse is
stopped before filling in the form, not after saving it.

**`01-0009` / `01-0031`: confirmed trial-run/test data (PI, 30-09-2026)** —
not a real protocol breach; these will be wiped along with the rest of the
"Trial run" test screenings (check 9) rather than repaired in place. The
server and mobile guards above exist so a *real* case of this can't happen
again, independent of what these two specific test records turn out to be.

## 3. "The value should be X but the form says Y"
Work upstream (README "How to use"):
1. Is the field typed, derived or suggested? (chapters 02–05)
2. **Answered before the source existed?** Fill-if-blank never overwrites — look
   for the amber "source now disagrees" warning; use Force refill / Apply.
3. **DMS read-time overlay**: Helpers 2 and 5 show DMS values that are **not
   saved in the helper row** (chapter 03 §3a). A blank database column with a
   value on screen is normal.
4. **Different source rules**: Form I's death prefill ignores Form J deaths;
   the Form L composite reads them (chapter 05).
5. Check the **effective gestation** and **Day 1 Date** (§4–5) — both move
   dates.

## 4. Dates
- Day N = DOB + N − 1. `nicu_admission.day1_date` equals DOB (check 6).
- **`day1_date` is auto-derived, not a form field (fixed 02-10-2026)**: no
  Helper form (web or mobile) ever actually set it — a DOB/Day1 sync
  UI was built (`useHelperDobSyncDay1`/`HelperDobDay1Panel`, web;
  `helper_dob_day1_bar.dart`, mobile) but never wired into any page; every
  Helper form just reads Form B's `date_of_birth` into its own local state
  for day-numbering and never writes `day1_date` back. Confirmed live
  02-10-2026: all 3 babies in production had `day1_date` NULL, including
  one with 11 days of Helper 2 entries already logged — so Form I's PMA
  checkpoints (IVH/cPVL/NEC/ROP/BPD/death) and every AE/SAE onset-date
  calculation had silently returned nothing for every real baby.
  `main._sync_day1_date()` now auto-sets `nicu_admission.day1_date` from
  `birth_resuscitation.date_of_birth` the moment both rows exist — called
  from every Form B and Form E create/update endpoint. Never overwrites an
  already-set value, so a superadmin correction via `PUT
  /nicu-admission/{id}/day1-date` still sticks. A baby enrolled before this
  fix needs one of Form B/Form E re-saved (or the dedicated PUT) to backfill
  it — check section 7 below.
- Clinical day uses **IST with an 08:00 boundary**; the server clock is UTC.
  Saved timestamps (`created_at`, `saved_at`, …) are **UTC**, stored without a
  time zone — add 5 h 30 min to read them as IST.
- DMS sheet dates: only today, or yesterday before 08:00.

## 5. Gestation
- Effective GA = Form B, **replaced by Form D NBS if > 14 days different**.
  A mistaken NBS entry silently shifts BPD 36+0, all PMA checkpoints,
  follow-up due dates and CONSORT Boxes 9–11 (check 8).
- Form A only accepts 25w0d–31w6d; the Gestation Log decides eligibility on
  whole weeks 25–31 with a Reliable source.

## 6. Ticks don't match reality
See chapter 06 §3. Server ticks come from `form_completion.py`; page ticks
from `utils/formCompletion.js` — a mismatch means the two rule files have
drifted.

## 7. Schema drift
A column added to `models.py` must also be added to a `*_PATCHES` list in
`schema_patches.py`, or the form's GET fails (500) and the page opens blank.
Check section 10 after every deploy.

## 8. Safe repair procedure
1. **Backup first**:
   `pg_dump "$URL" -Fc -f /home/ubuntu/<reason>_<date>.dump` (URL = DATABASE_URL
   with `postgresql+psycopg2://` → `postgresql://`); verify with
   `pg_restore -l`; `chmod 600` (it contains identity data); delete it when no
   longer needed.
2. **Dry run**: count exactly the rows you will touch.
3. **One transaction** for the change; verify counts after.
4. **Never delete `audit_log` rows** — they record what happened (the test-baby
   clean-up of 30-09-2026 kept them).
5. Record the change (date, reason, backup file) in the project log (`CLAUDE.md`
   deployment history).

## 9a. Simulation testing (02-10-2026)
A PI bug report on `02-B-003` (Form I's 36-week IVH suggestion returning
nothing — day1_date gap, §4) prompted building 8 synthetic "Trial run" test
babies (`01-D-901`..`908`, scripted via direct ORM inserts, not through the
UI) covering known trap conditions: PMA-at-birth boundary, a Helper-2 flag
with no graded scan, Form-H-vs-Form-F/Helper-4 disagreement, a suspected
but unstaged NEC/ROP, early death, discharged/Back-referred before a
checkpoint with no Form J, a fully-populated admission across every
auto-fill domain, and AE threshold boundary values. Confirmed several
designs work correctly (pending-flag messaging, sources-disagree
detection, Form-H-only AE policy even under disagreement, incremental
death windows, Grade 5 never auto-assigned) and found one real bug (fixed
same day): `_rop_checkpoint_suggestion`'s Helper 5 fallback used
`stage_rank(l.rop_stage) or 1`, silently defaulting an unstaged "ROP
detected" tick to Stage 1 instead of flagging it for the clinician the way
NEC's parallel code already did — `rop_suggestion.suggest_rop` now has the
same "unstaged" branch NEC has. Re-run this kind of simulation after any
future change to the suggestion/detection functions in `main.py`,
`*_suggestion.py`, or `ae_reference.py`.

## 9. Known open issues (01-10-2026)
- **Log of All Births: 4 twin/triplet pairs (8 rows) saved before the Birth
  order field existed** (chapter 08 §3) — PGIMER row ids 11/12 (23-09),
  91/92 (27-09), 102/103 (28-09), 159/160 (01-10). Each pair shows "Not
  classified — shares CR + DOB" in the table; a nurse opens each row via
  Edit and sets "Birth type"/"This baby is the…" — I don't know birth
  order myself and shouldn't guess it from entry sequence.
- `01-`, `01-B-`, `01-B-123` and the other 8 "Trial run" screenings (incl.
  `01-A-001` with helper data): **confirmed test data (PI)** — will be wiped
  wholesale rather than repaired individually. No manual fix needed; §1/§2's
  repair procedure is documented for a *future* case, not for these records.
- Mobile app fix (`Portal_app1` PR #1) is **open, not yet merged/build-tested**
  by Harsh — until then the mobile Form B buttons on his deployed app build
  still don't check consent.
- DMS → Helper 4 transfusion "set by DMS" marker isn't saved (PR #49 comment).
- Helper 5 "N days with no data entered" warning ignores the discharge day.
- Form I death prefill doesn't read Form J deaths.
