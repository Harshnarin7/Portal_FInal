# 05 — Outcome suggestions (BPD, ROP, NEC, brain injury, composites, death)

These drive the **trial outcomes** (Form I checkpoints, Form L composites).
Each rule set is a small pure module with tests, so it can be checked in
isolation:

| Suggestion | Module (tests) | Endpoint | Shown on |
|---|---|---|---|
| BPD (Jensen) | `bpd_suggestion.py` (`test_bpd_suggestion.py`) | `GET /neonatal-morbidities/bpd-suggestion/{id}` | Form H H2.1 — Apply |
| ROP by checkpoint | `rop_suggestion.py` (`test_rop_suggestion.py`) | inside `pma-assessment-prefill` | Form I I.3–I.5 — fill-if-blank + note |
| NEC ≥ IIA by checkpoint | `nec_suggestion.py` (`test_nec_suggestion.py`) | inside `pma-assessment-prefill` | Form I — fill-if-blank + note |
| NEC max stage | `nec_suggestion.highest_stage` | `GET /neonatal-morbidities/nec-stage-suggestion/{id}` | Form H H3 — Apply |
| Brain injury by checkpoint | `brain_injury_suggestion.py` (`test_brain_injury_suggestion.py`) | inside `pma-assessment-prefill` | Form I — fill-if-blank + note |
| Composites + MRI + Form G item 18 | `composite_suggestion.py` (`test_composite_suggestion.py`) | `GET /composite-suggestion/{id}` | Form L L.3, Form G item 18 — Apply |

**Common principles (PI, 27–30 Sept 2026):**
- Checkpoint date = DOB + (weeks × 7 − GA-at-birth days) (`main._pma_target_date`),
  using the **effective gestation** (Form D NBS override, chapter 02).
- Answers are **cumulative** — "has this happened by the checkpoint date".
- Sources are combined; the **worst** finding wins; the source is named in
  a note under the item.
- **"No" only when someone actually looked** late enough; otherwise no
  suggestion, and the note says what is missing.
- Sources that disagree → the worse value is suggested with an amber
  **"sources disagree"** note.
- Died before the checkpoint → no suggestion (death is the composite).

---

## BPD at 36+0 weeks PMA (Jensen 2019)
- Grade by support **on the 36+0 day**: room air → No BPD; NC ≤ 2 L/min →
  Grade 1; NC > 2 L/min, HFNC, CPAP, NIPPV → Grade 2; intubated or
  SIMV/A-C/PSV/HFOV → Grade 3.
- **Still in the NICU**: Helper 2 on that day (± 1 day if missing), read with
  the DMS overlay.
- **Went home before 36+0** (Discharged / on request / LAMA): Form J 36-week
  visit if present, else **status at leaving** (last Helper 2 day up to the
  discharge date).
- **Back referred**: Form J 36-week visit only.
- O₂ with no support mode → flag, no grade. NC with no flow → BPD Yes, grade
  left to the clinician.

## ROP by 36 / 40 / 44 wk (Form I "ROP", "treated", date)
- Sources: Form G visits (per eye), Form J visits (dated at their week),
  Form H summary (valid to discharge), Helper 5 daily flags.
- **Yes** = stage ≥ 1 in either eye seen on/before the checkpoint.
- **No** only with an eye exam on/after the checkpoint showing no ROP up to
  then, or Form G screening **completed** (final screening date) with no ROP.
  A baby who left before screening was complete gets **no suggestion**
  (ROP can appear after discharge).
- **Treated** = treatment dated on/before the checkpoint.
- **ROP requiring treatment** (composite component) = treatment **required**
  in either eye (Form G / Form J), even if not given.

## NEC ≥ IIA by 36 / 40 / 44 wk
- Sources: Helper 4 daily confirmed stage (first day ≥ IIA), Form H stage /
  date / surgery, Form J visits.
- **Yes** = stage ≥ IIA on/before the checkpoint (date = first ≥ IIA).
- **Stage IA/IB (suspected) never counts** toward ≥ IIA or the composite, but
  is shown in the note, and suggested for Form H's max-stage field.
- **No** when: still in the NICU at the checkpoint; or a Form J visit on/after
  it says no NEC; or **went home (Discharged / on request / LAMA) without NEC**
  (status at leaving) — a later Form J NEC overrides.
- NEC recorded with **no stage** → no suggestion.

## Brain injury by 36 / 40 / 44 wk (IVH ≥ III; cPVL ≥ II)
- Sources: Form F scans (point-in-time), Form H grades (**whole-stay summary** —
  can give Yes or a disagreement, never a "No"), Form J visits.
- **Yes** = severe grade dated on/before the checkpoint (undated Form H severe
  grade counts "by discharge", with a prompt to enter the date).
- **IVH "No"** = any scan from **Day 7** of life with no grade III/IV.
- **cPVL "No"** = a scan **on/after the checkpoint**; the 40-week (term) scan
  also answers 44 weeks. Went home before it → no cPVL suggestion.
- Mild grades (IVH I/II, cPVL I) shown in the note, not counted.
- A Helper 2 IVH/cPVL flag with **no graded scan after it** → no suggestion.
- "Sources disagree" is judged on each source's worst grade **across both
  sides** (a per-side comparison gave false warnings — fixed 28-09).

## Death
Two places decide death, with slightly different sources:

| Where | Death date from | "Alive" (for a No) from |
|---|---|---|
| Form I death36/40/44 (`get_pma_assessment_prefill`) | Helper 5 "did not survive" | daily logs up to the checkpoint, or Form H discharge date on/after it |
| Form L composites (`get_composite_suggestion`) | Helper 5, Form H outcome Died, **Form J death** | daily logs, Form H discharge alive, **Form J visit with death = No** |

Form I's windows are **incremental** (birth–36, 36–40, 40–44); the composite
uses "by 36" / "by 44". Known gap: Form I's own death prefill does not yet
read Form J deaths.

## Form L composites (L.3) and MRI; Form G item 18
- **Composite 1** = death by 36 wk **or** BPD (any Jensen grade) at 36 wk.
- **Composite 2** = death by 44 wk **or** BPD **or** ROP requiring treatment
  **or** NEC ≥ IIA **or** brain injury, all by 44 wk.
- Components come from **Form I's saved answers first**; the live suggestions
  above fill only the components Form I leaves blank.
- **Yes** as soon as any component is Yes; **No** only when every component
  is a known No; otherwise no suggestion + the unknown components listed.
- **Death "No" needs the baby known alive** at the checkpoint.
- **12b MRI**: Form K not selected → NA; Abnormal → Yes; Normal → No.
- **Form G item 18**: Yes if treatment required in either eye (Form G) or a
  Form J treatment; No only once screening is completed with none.
- All applied only by pressing **Apply**.
