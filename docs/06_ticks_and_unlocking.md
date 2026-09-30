# 06 — Sidebar ticks, unlocking and "x / 19 forms"

Two separate ideas — do not confuse them:
- **Unlocked** = the form can be opened (a prerequisite form has been saved).
- **Ticked (green)** = the form is **complete**: key items answered, signed
  off where the form has a sign-off, no validation error. An autosave is
  never completion.

## 1. Unlocking (`components/Sidebar.jsx`, `context/FormProgressContext.jsx`)

- `PREREQS`: Form B needs Form A; **every other form needs Forms A and B**.
- A prerequisite counts once it is **saved** (loose flags `form_a … form_e` from
  `GET /enrollment-status/{id}`, plus any form saved in the session —
  `unlockedForms`), not once it is complete.
- **Enrollment lock** (browser `enrollment_locked` + reason), recomputed from
  Form A when a baby is opened:
  | Reason | Condition | Effect |
  |---|---|---|
  | `ga_out_of_range` / `ga_unknown` | GA outside 25w0d–31w6d, or Screen Failure | Forms B+ locked |
  | `exclusion` | any A4 exclusion | Forms B+ locked |
  | `consent` | consent not Yes / Trial run | Forms B+ locked |
  | `no_ppv` | Form B: baby did not need PPV (`/enrollment-status` `no_ppv`) | **only Forms A, B, C** open (`FORMS_ALLOWED_WHEN_NO_PPV`) |
- `next_form` (server) = first of B, C, (stop if no PPV), D, E not yet saved.

## 2. Green ticks — the rules

Page rules live in `frontend utils/formCompletion.js`; the **same rules run on
the server** (`backend form_completion.py`, returned by `/enrollment-status`
as `<form>_complete`) so ticks survive a reload or a baby switch. Keep the
two files in step.

| Form | Complete when |
|---|---|
| A–E | the page's own Save validation passes, saved as `is_complete` on each save (NULL for mobile/old rows → falls back to the older "saved with real data" rule) |
| F | ≥ 1 dated scan; PHVD and VP shunt answered (with dates if Yes); signed off |
| G | ≥ 1 real visit (dated, with detail or signature); no auto-suggested visit awaiting review; outcome (+ text if Other); item 18; final screening date; signed off |
| H | outcome + discharge date; every infection window reviewed; signed off; page check passed (`neonatal_morbidities.is_complete` not False) |
| I | the 7 starred items (ventilation, 100% O₂, compressions, intubation, resp support 72 h, EOS, LOS); signed off |
| J | ≥ 1 signed-off visit row |
| K | selected-for-MRI answered; if Yes, MRI date + overall result; signed off |
| L | initial / exit / max-first-hour FiO₂, both composites, MRI abnormality; signed off |
| AE | "Adverse event reported?" answered; if Yes, every event has description, start date, grade, converted-to-SAE; signed off |
| SAE list | every non-empty row has SAE term, start date, 24-h notification date; signed off (an empty signed-off list is complete) |
| Form Y (SAE report) | any saved SAE report (page rule today; not a clinical-completeness rule) |
| Helpers 2, 4, 5 | **every NICU day from Day 1 to yesterday at 100%** (Day 1 required even on Day 1), stopping at the Form H discharge day |
| Helper 3 FiO₂ AUC | for days 1 … min(7, yesterday): every day Helper 2 marks Supplemental O₂ = Yes (or that has FiO₂ values) has **both 12-h windows filled with real FiO₂ values**; room-air days not required; a day with no Helper 2 answer and no FiO₂ data = unknown → not complete. No discharge cut-off. |
| DMS | **never ticked** — shows "Today (date): logged / not yet logged" instead |

`x / 19 forms` = ticked items out of 19 (every sidebar item except the DMS).

## 3. When a tick looks wrong
- Server and page disagree → compare `GET /enrollment-status/{id}` `<form>_complete`
  with the rule above; the two rule files must match.
- Tick present but data incomplete → check the stored flag (`is_complete`) was
  written by the current web page (mobile rows have NULL and use the older rule).
- Helper tick missing → find the first day below 100% (`/…/summary`); remember
  the % includes DMS values (chapter 03).
