# PORTAL eCRF — logic, calculations and form linkage reference

This folder documents **how every form's data is derived, checked and passed on**,
from Form A (screening) to Form L (summary), the daily logs, AE/SAE and the
screening logs. It exists for one purpose: **when a number looks wrong, find
where it came from and why.**

It was written from the code as of 30-09-2026 (commit on `main` after
`06b9f68`). Every rule names the file and function that implements it — if
the doc and the code ever disagree, **the code is what runs**; fix the doc in
the same commit.

## Chapters

| File | Covers |
|---|---|
| [01_data_model_and_ids.md](01_data_model_and_ids.md) | Tables per form, ID scheme (screening / enrollment / NR-), site isolation, PII split + encryption, autosave, "saved" vs "complete" flags |
| [02_forms_A_to_E.md](02_forms_A_to_E.md) | Screening, birth/resuscitation, maternal, day-1 postnatal, NICU admission |
| [03_daily_logs_DMS_and_helpers.md](03_daily_logs_DMS_and_helpers.md) | Daily Monitoring Sheet (DMS) and Helpers 2–5: what the DMS feeds, completion %, day numbering, locking and override |
| [04_forms_F_to_L.md](04_forms_F_to_L.md) | Cranial USG, ROP, Form H (morbidities) and its 10 auto-fill domains, Form I checkpoints, Forms J/K/L |
| [05_outcome_suggestions.md](05_outcome_suggestions.md) | BPD, ROP, NEC, brain injury and composite-outcome suggestions; death rules |
| [06_ticks_and_unlocking.md](06_ticks_and_unlocking.md) | Sidebar green ticks, form unlocking, "x / 19 forms" |
| [07_ae_sae.md](07_ae_sae.md) | AE detection (32 terms), grading, SAE reports, IEC/CDSCO documents |
| [08_screening_logs_and_consort.md](08_screening_logs_and_consort.md) | Gestation (Inclusion Criteria) Screening Log, Log of All Births, matching, CR-number rules, CONSORT boxes |
| [09_data_integrity_playbook.md](09_data_integrity_playbook.md) | Known failure modes, checks to run, how to investigate and repair |

## Glossary

| Term | Meaning |
|---|---|
| **Screening ID** | Form A id, `<site code>-<4 digits>`, e.g. `01-0023`. Issued by the server (`main.generate_screening_id`) only once GA is known and inside 25w0d–31w6d. |
| **Enrollment ID** | Randomised baby id, `<site code>-<blender A–D>-<3 digits>`, e.g. `01-B-123`. **Typed by the nurse on Form B** (no generator); valid format `^\d{2}-[A-D]-\d{3}$` (`baby_uid_duplicate.ENROLLMENT_ID_PATTERN`, `frontend utils/enrollmentId.js`). |
| **NR- id** | `NR-<screening id>`, auto-assigned by the server to a birth that was **not randomised or needed no PPV** (`main.resolve_birth_enrollment_id`). Used as that baby's enrollment id everywhere. |
| **Site code** | PGIMER 01, GMCH 02, IOG 03, AFMC 04, GMCH-A 05, AMC 06 (`main.CANONICAL_SITE_ID_MAP`). |
| **DOB / Day 1** | NICU Day 1 = date of birth. Day N = DOB + (N − 1). Form E also stores a nurse-entered "Day 1 Date" (`nicu_admission.day1_date`), which should equal DOB. |
| **NICU working day** | The current NICU day, where **before 08:00 counts as the previous day** (`frontend utils/datetime.nicuDayNumberFromDay1`, `backend form_completion.nicu_day_today`). Clinical time is **IST** (`backend clinical_time.py`); the server clock is UTC. |
| **PMA checkpoint** | Date the baby reaches 36+0 / 40+0 / 44+0 weeks PMA = DOB + (weeks×7 − GA-at-birth days) (`main._pma_target_date`). |
| **DMS** | Daily Monitoring Sheet (`minimal_monitoring_day_logs`), the bedside scratchpad — was "Helper 1". |
| **Helper 2 / 3 / 4 / 5** | Resp-CV-Neuro daily log / FiO₂ AUC / Infect-GI-Hema daily log / Metab-Renal-Vasc-Eye daily log. **Some backend names still use older numbering** — e.g. `mml_helper5_autofill.py` is Helper 5 today; always check the route, not the name. |
| **Suggestion** | A value the system proposes from other forms. Either fills a blank field (Form H / Form I prefill) or waits for an **Apply** click (BPD, NEC stage, Form L composites, Form G item 18). Never overwrites a saved answer except via an explicit "Force refill". |

## How to use this when data looks wrong

1. Identify the **field** and the **form** it shows on.
2. Look it up in the chapter for that form: it says whether the value is typed, derived, or suggested, and from which source.
3. If derived: check the **source** record(s) named there (the playbook, chapter 09, has read-only queries).
4. If the source is right but the field is wrong: the field was probably **answered before the source existed** (fill-if-blank never overwrites) — use the form's Force refill / Apply, or correct by hand.
5. If the source itself is wrong, go one step further upstream and repeat.
