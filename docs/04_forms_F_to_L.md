# 04 — Forms F to L

## General rules for every "auto-fill" on these forms

1. **Fill-if-blank.** A prefill only fills a field that is empty; it never
   replaces an answer. Auto-filled fields show a small "from daily logs" /
   "auto-filled" badge until edited.
2. **Stale warning.** If the source now disagrees with a saved answer, an
   amber "the source data now disagrees …" warning appears — nothing changes.
3. **Force refill** (per section; Form H also "all domains", Form I "all PMA
   checkpoints") overwrites existing answers with the current source values,
   after a confirmation.
4. **Save-time conflict check.** Form H (`confirmFormHConflicts`, all 10
   domains) and Form I (`confirmBrainInjuryConflicts`) re-fetch the live source
   just before saving and ask for confirmation if a typed answer disagrees.
5. **Apply-only suggestions** (BPD, NEC stage, Form L composites, Form G item 18)
   never fill anything until someone presses Apply — chapter 05.

Consequence for data checks: **a saved field answered before its source data
existed stays as it was** until someone reopens the form and applies the
warning / Force refill. This is by design.

---

## Form F — Cranial ultrasound (`cranial_usg_records`, API `/form-h/…`)

- `scan_entries` = list of scans (date, per-side IVH grade None–IV (IV = PVHI),
  per-side cPVL grade, PHVD etc.). DOL = scan date − DOB + 1.
- Scan schedule reference (page `SCHEDULES`): < 28 wk / < 1000 g — Day 1–3,
  4–7, 10–14, (21), 28, 36 wk PMA, 40 wk PMA; 28–31 wk — Day 4–7, 10–14, 28,
  40 wk PMA.
- **Helper 2 gate:** if Helper 2 ever flagged IVH or cPVL
  (`GET /form-h/{id}/helper2-neuro-flags`) and Form F has **no scan**, a banner
  asks for a scan and the tick is withheld.
- Feeds: Form H IVH/PVL/PVHI/PHH/ventriculomegaly (below), brain-injury
  suggestion (ch. 05), AE advisory for severe findings not yet in Form H
  (`ae_reference.detect_pending_cranial_usg_findings`).

## Form G — ROP screening (`rop_screening`)

- Visits in `screenings` JSON (date, method, stage/zone per eye, plus status).
  **DOL** = screening date − DOB + 1 (birth day = DOL 1, PI 2026-09-27);
  **PMA** = GA at birth + (date − DOB) (`rop_form_g_linkage.calculate_dol_and_pma`
  = page `calculateDOLandPMA`).
- **Auto-suggested visits:** a Helper 5 day with ROP detected creates a dated
  visit row with no detail (`rop_form_g_linkage.sync_rop_screening_from_metab_log`);
  it raises a **review alert** until filled or removed
  (`compute_rop_review_alerts`) — this blocks the tick.
- Worst stage / zone / plus / A-ROP / treatment per eye; outcome; final
  screening date; **item 18 "ROP requiring treatment" = Yes automatically when
  treatment required in either eye**, otherwise manual (suggestion — ch. 05).
- Feeds **Form H ROP per eye** (`rop_consistency.derive_form_h_rop_from_form_g`:
  worst stage/zone/plus/A-ROP/treatment per eye) and a Form G ↔ Form H
  mismatch report (`build_rop_consistency_report`; reviewed items stored in
  `neonatal_morbidities.rop_flags_reviewed`).

## Form H — Neonatal morbidities (`neonatal_morbidities`)

One record per baby, filled across the admission. Required for completion:
outcome + discharge date + sign-off + all infection windows reviewed + no
field error (chapter 06). **Discharge date here is the "discharge date"
everywhere** (helper cut-off, death/alive checks, suggestions).

### The 10 auto-fill domains (each = one `GET /neonatal-morbidities/<x>-prefill`)

| Domain (CRF) | Source | What is derived | Deliberately manual |
|---|---|---|---|
| Vascular access (H10, #206–216) | Helper 5 | line Yes/No + day counts (PICC/UVC/UAC/PV/PA, extravasation) | line complication type |
| Metabolic (H4.1, #95–115) | Helper 5 + DMS 5.3.A/5.3.B | hypo/hyperglycaemia (DMS readings < 45 / > 125 mg/dL join Helper 5's), acidosis, dyselectrolytaemia split by Na < 135/> 142, K < 3.5/> 6, iCa < 0.9/> 1.2; ALP peak, lowest Ca/P | symptoms/status; osteopenia Yes/No |
| Renal (H7.1, #173–178) | Helper 5 | AKI, KDIGO stage (current then legacy column), peak creatinine, dialysis, AKI date (via Form E Day 1 Date) | oliguria (needs weight) |
| Haematology (H6, #147–172) | Helper 4 + DMS | jaundice intervention, phototherapy, exchange (count = days), PRBC/platelets/FFP (+counts), peak TSB, lowest Hb; max direct bilirubin from DMS 5.4.B | anaemia Yes/No, jaundice type/aetiology, BIND |
| Neurological (H1, #1–34) | Helper 2 + DMS 5.5 | seizures (+date), ventriculomegaly Yes/No, VI/AHW/TOD/RI maxima | IVH/PVL grades (come from Form F), seizure type/EEG/AEDs |
| Cranial USG → IVH/PVL | **Form F** | per-side max IVH/PVL grade, its date and age, side; PVHI (IVH IV); PHH (≈ Form F PHVD); ventriculomegaly Yes (second source) | PVHI/PHH free text |
| GI (H3, #68–94) | Helper 4 | feed intolerance, PN, probiotic, cholestasis, NEC (= any day **suspected**) + date/age, first-feed age, PDHM/EBM/FM day counts | NEC **stage** (suggestion, ch. 05), surgery detail, full-feed age |
| ROP / thermoregulation (H8/H9) | Helper 5 (+ Form G per eye) | ROP screened / ROP Yes + dates; hypo/hyperthermia **from the temperature value** (< 36.5 / > 37.5), min/max temp | thermal severity/location/aetiology |
| Cardiovascular (H5, #117–146) | Helper 2 + DMS | HS-PDA, shock, inotropes + drug ticks, PDA medical Rx, fluid bolus (+count from DMS 5.1.B), lowest SBP/DBP/MAP from DMS 5.1.A | echo detail, VIS, hydrocortisone |
| Respiratory (H2, #38–67) | Helper 2 | O₂ days, NC/CPAP/NIPPV/HFNC (+days), invasive ventilation (+days, from the intubation flag), steroids, pulmonary haemorrhage, pneumothorax, chest drain, PH, extubation failure, caffeine, apnoea + onset | **BPD** (suggestion, ch. 05) |

Plus:
- **Infection (H11)** — `get_infection_detect` never fills a field. It lists
  candidate windows by the PI's rule, in priority order: culture-positive >
  sepsis-screen-positive > antibiotics > 5 continuous days > meningitis > CLABSI >
  VAP. Each must be marked reviewed (`infection_flags_reviewed`) or turned into
  an episode ("Add infection for this").
- **Survival check** — a Helper 5 "did not survive" day shows a banner offering
  Force refill of all domains at once (`get_survival_check`).

## Form I — Study outcomes (`study_outcomes`)

| Section | Source | Rule |
|---|---|---|
| I.1 Resuscitation | Form B | PPV → ventilation required; chest compressions; intubation; time to spontaneous breathing (seconds). "Switched to 100% O₂" and HIE manual. |
| I.2 Post-resuscitation (`get_post_resus_prefill`) | Helpers 2/4/5, Form H | #7 resp support 0.5–72 h: "No" only when days 1–3 all have a Helper 2 log with the item answered; #8 EOS / #9 LOS from infection windows (onset ≤ day 3 / after); **"No" only once the period is observed** (EOS: days 1–3 logged; LOS/culture: stay ended); mortality ≤ 7 / ≤ 28 d "No" only if known alive past that age |
| I.3–I.5 at 36 / 40 / 44 wk PMA (`get_pma_assessment_prefill`) | Form H, Form F, Form G, Form J, Helpers | death (incremental windows), BPD (36 wk), NEC ≥ IIA, brain injury, ROP — **chapter 05**. Needs Form E Day 1 Date and gestation. |
| I.6 Overall | Form H prefills | MV/CPAP/HFNC/NIPPV days, sepsis overall (any infection window), in-hospital death + date |

## Form J — External hospital / follow-up (`external_hospital_assessments`)
- One row per visit week (36 / 40 / 44…; unique per `assessment_weeks`).
- Death, respiratory support (BPD), NEC, IVH/cPVL per side, ROP per eye +
  treatment, sepsis, MRI done. **Read by** the BPD, ROP, NEC, brain-injury and
  composite suggestions (a visit is dated at its PMA week).

## Form K — MRI brain (`mri_brain_assessments`)
- Selected for MRI subset (25%); if Yes, MRI date + domain findings + overall
  Normal / Abnormal. Feeds Form I "abnormal MRI at TEA" (40 wk) and Form L 12b.

## Form L — Blender data & summary (`blender_study_summaries`)
- L.2 initial / exit / max first-hour FiO₂ + per-minute FiO₂ (filled after
  unblinding — the delivery-room FiO₂ is blinded during the trial).
- L.3 composite outcome 1, composite outcome 2, MRI abnormality — stored
  `"yes"/"no"/"na"`; **suggestions with Apply** (chapter 05).
