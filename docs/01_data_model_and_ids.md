# 01 — Data model, IDs and how records are linked

## 1. One table per form

All tables are in `backend/models.py`. **Everything after Form A is keyed by
`enrollment_id`** (a text column, not a foreign key — nothing in the database
stops an orphan row; see chapter 09).

| Form / page | Table | Key | API (backend `main.py`) |
|---|---|---|---|
| Gestation (Inclusion Criteria) Screening Log | `ga_check_log` | `id`; links to Form A via `screening_id` | `/ga-check/…` |
| Form A — Screening | `screenings` | `screening_id` (unique); gets `enrollment_id` written back from Form B | `/screenings/…` |
| Form B — Birth & resuscitation | `birth_resuscitation` | `enrollment_id` (unique) + `screening_id` | `/birth-resuscitation/…` |
| Form C — Maternal details | `maternal_details` | `enrollment_id` | `/maternal-details/…` |
| Form D — Day-1 postnatal | `postnatal_day1` | `enrollment_id` | `/postnatal-day1/…` |
| Form E — NICU admission | `nicu_admission` | `enrollment_id`; holds `day1_date` | `/nicu-admission/…` |
| DMS (Daily Monitoring Sheet) | `minimal_monitoring_day_logs` | `enrollment_id` + `record_date` | `/minimal-monitoring/…` |
| Helper 2 — Resp/CV/Neuro | `resp_cv_neuro_day_logs` | `enrollment_id` + `nicu_day` | `/resp-cv-neuro/…` |
| Helper 3 — FiO₂ AUC | `fio2_auc_logs` | `enrollment_id` (one row, `fio2_logs` JSON by day/block) | `/fio2-auc/…` |
| Helper 4 — Infect/GI/Hema | `infect_gi_hema_day_logs` | `enrollment_id` + `nicu_day` | `/infect-gi-hema/…` |
| Helper 5 — Metab/Renal/Vasc/Eye | `metab_renal_vasc_eye_day_logs` | `enrollment_id` + `nicu_day` | `/metab-renal-vasc-eye/…` |
| Form F — Cranial USG | `cranial_usg_records` | `enrollment_id` (`scan_entries` JSON) | **`/form-h/…`** (historical name — this is Form F, not Form H) |
| Form G — ROP screening | `rop_screening` | `enrollment_id` (`screenings` JSON = visits) | `/rop-screening/…` |
| Form H — Neonatal morbidities | `neonatal_morbidities` | `enrollment_id` | `/neonatal-morbidities/…` |
| Form I — Study outcomes | `study_outcomes` | `enrollment_id` | `/study-outcomes/…` |
| Form J — External hospital / follow-up | `external_hospital_assessments` | `enrollment_id` + `assessment_weeks` (unique pair) | `/external-hospital-assessment/…` |
| Form K — MRI brain | `mri_brain_assessments` | `enrollment_id` | `/form-k/…` |
| Form L — Blender data & summary | `blender_study_summaries` | `enrollment_id` | `/form-l/…` |
| AE — Adverse events | `adverse_events` | `enrollment_id` (`events` JSON list) | `/adverse-events/…` |
| SAE list | `sae_list` | `enrollment_id` (`rows` JSON) | `/sae-list/…` |
| Form Y — SAE report | `sae_reports` | `id`, many per `enrollment_id` | `/sae-report/…` |
| Log of All Births | `birth_log_all_births` | `id`; `matched_screening_id` / `matched_enrollment_id` | `/birth-log/…` |
| Identity (PII) for A–E | `participant_pii` | `screening_id` and/or `enrollment_id` | `routers/pii.py` |
| Audit trail | `audit_log` | `enrollment_id` / `screening_id` | `routers/audit.py` |

**Legacy tables no web page uses** (kept for the mobile app / history — do not
build on them): `cranial_ultrasound`, `composite_outcomes`, `resp_cv_neuro_logs`,
`infect_gi_hema_log`, `metab_renal_vasc_eye_log`, `respiratory_logs`,
`steroid_data`. (A `composite_outcomes` endpoint still exists; the Form L
composites now live in `blender_study_summaries`.)

## 2. The ID chain

```
Gestation Log entry ──(Continue to Form A)──► Form A  screening_id 01-0023
                                                     │  (Form A saved only if GA 25w0d–31w6d)
                                                     ▼
                                              Form B  enrollment_id 01-B-123   (typed by nurse)
                                                     │   or NR-01-0023          (auto: not randomised / no PPV)
                                                     ▼
              Forms C … L, DMS, Helpers, AE, SAE — all keyed by that enrollment_id
```

### Screening ID (`main.generate_screening_id`)
- `<site code>-<next number>`: scans existing ids for the site prefix, takes the
  numeric max + 1 (ignores non-numeric legacy suffixes), zero-padded to 4.
- **Only issued when GA is known and inside 25w0d–31w6d**
  (`main.require_ga_in_inclusion_window`, 422 otherwise). So an out-of-window
  woman never gets a Form A — she is captured in the Gestation Log instead.

### Enrollment ID
- Typed on Form B. Valid format `^\d{2}-[A-D]-\d{3}$`
  (`baby_uid_duplicate.ENROLLMENT_ID_PATTERN`; frontend `utils/enrollmentId.js`
  `COMPLETE_ENROLLMENT_RE`, `isUsableEnrollmentId`).
- **The server does not reject a malformed enrollment id on Form B create** —
  the pattern is only used by the duplicate check. See chapter 09 §1 (the
  `01-` / `01-B-` records).
- `NR-<screening_id>` is assigned automatically when `randomised = False` or
  `required_resuscitation = False` and no id was typed
  (`main.resolve_birth_enrollment_id`).

### Form A ↔ Form B link (`main.link_screening_enrollment`)
- Every Form B create/update **writes `enrollment_id` onto the screening row**
  (`screenings.enrollment_id`) and merges the Form A / Form B identity rows in
  `participant_pii`.
- It **overwrites** — the screening always points at the *latest* Form B
  enrollment id saved for it.

### Form B create (`main.create_birth_resuscitation`)
1. Resolve the id (typed, or `NR-…`).
2. 409 if **another patient** already owns that enrollment id
   (`find_enrollment_id_conflict`) or that baby UID (`_assert_baby_uid_unique`).
3. Look for an existing row **with the same enrollment id** (or, for NR/no-PPV,
   the same screening id) → update it (skipping `None` values so a partial
   mobile save doesn't wipe the other half).
4. Otherwise **insert a new row**. So if the enrollment id changes between saves
   for a randomised baby (e.g. an autosave with a half-typed id), a **second
   row** is created — see chapter 09 §1.

## 3. Site isolation
- A user sees only their own site unless their role is global
  (`deps.GLOBAL_ROLES` = superadmin, global scientist).
- Every enrollment-keyed endpoint calls `main.require_enrollment_access`
  → finds the screening for that enrollment id (or `NR-` screening id) →
  `deps.ensure_same_site` (403 otherwise). An enrollment id with **no matching
  screening row** passes this check (nothing to compare against).

## 4. Identity data (PII)
- Identity fields are **stripped from the clinical tables** and stored in
  `participant_pii` (`pii_service.split_and_store_pii`), per form:
  - Form A: mother/husband names, maternal UID (CR number), hospital admission
    no., phones (`SCREENING_PII_FIELDS`)
  - Form B: mother names, maternal UID, phones (`BIRTH_PII_FIELDS`)
  - Form C: name, UID, phones, address fields, email (`MATERNAL_PII_FIELDS`)
  - Forms D/E: baby name
- `participant_pii` columns (and the CR number / names in the Gestation Log and
  Log of All Births) are **encrypted at rest** (`crypto.EncryptedString`, AWS KMS
  + Fernet). Consequence: **you cannot search by CR number or name in SQL** —
  code that matches on them (birth-log matching, duplicate CR check) loads the
  site's rows and compares in Python.
- PII is returned only to superadmin / PII officer / same-site users
  (`routers/pii.py`, `pii_service.can_view_pii_for_site`); other users get
  `null` for those fields.

## 5. Saving, autosave and the "complete" flags

| Flag | Where | Set by | Meaning |
|---|---|---|---|
| `explicitly_saved` | screenings, birth_resuscitation, maternal_details | the explicit **Save** button | a person pressed Save (not just autosave) |
| `finalized` | nicu_admission | Form E explicit Save | same idea for Form E |
| `is_complete` | screenings, birth_resuscitation, maternal_details, postnatal_day1, nicu_admission, **neonatal_morbidities** | the web page on **every** save | the page's own validation passed (Forms A–E: its Save validation; Form H: no field error showing) |
| `submission_status` | Helper 2/4/5 day logs | Lock ("submit") | `empty` / `draft` / `submitted` |

- **Autosave is on for most forms**; it saves partial work. Autosave is never
  "completion" — the green tick uses the rules in chapter 06.
- **Stale-write protection (Helpers 2/4/5):** the page sends the `updated_at` it
  loaded; the server returns **409 `stale_write`** if someone else saved in the
  meantime (`concurrent_writes.assert_fresh_write`, ±2 s tolerance). Older app
  builds that omit it get last-write-wins.
- **DMS merge:** two people editing the same DMS sheet don't overwrite each
  other — entries are **unioned by entry id**, and only ids the client
  explicitly deleted (`deleted_entry_ids`) are removed
  (`concurrent_writes.merge_mml_entries_json`).
- **FiO₂ AUC merge:** server blocks for days the page didn't send are kept;
  the client wins for each (day, block) it sent (`concurrent_writes.merge_fio2_logs`).

## 6. Schema changes
- New columns are added at startup by `backend/schema_patches.py`: every
  module-level list named `*_PATCHES` is applied automatically (idempotent
  `ADD COLUMN IF NOT EXISTS`), each group in its own transaction.
- After any deploy, run the model-vs-database check in chapter 09 §6 — a column
  in `models.py` that is missing in the database makes that form's GET fail
  (the page then shows blank).
