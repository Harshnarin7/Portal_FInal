"""ROP suggestion for Form I's PMA checkpoints (I.3/I.4/I.5 ROP items) and the
composite component "ROP requiring treatment".

Pure decision logic (no DB), so it can be tested on its own. The endpoint in
main.py turns Form G / Form J / Form H / Helper 5 into dated eye findings and
passes them in.

Design agreed with the PI 2026-09-27 (same principle as BPD: in-hospital data
up to discharge + follow-up visits for babies who leave early):
- Every answer is cumulative: "has this happened by the checkpoint date".
- Sources are combined and the worst finding wins, with its source named.
- ROP Yes  = stage >= 1 in either eye seen on or before the checkpoint.
- Treated  = laser / anti-VEGF / vitrectomy dated on or before the checkpoint.
- ROP No only when someone looked: an eye exam on or after the checkpoint with
  no ROP seen up to then, or ROP screening completed (Form G final screening
  date) with no ROP ever. ROP can still appear after discharge, so a baby who
  left before screening was complete gets NO suggestion (PI decision), only a
  note naming the missing follow-up. Back referred: same, wait for Form J.
- "ROP requiring treatment" (composite) = treatment REQUIRED in either eye
  (Form G / Form J), even if it was not given (PI decision).
- Sources disagree (a summary "no ROP" / "no treatment" contradicted by a
  dated finding elsewhere) -> worst finding still suggested, plus a flag.
- Died before the checkpoint -> no ROP suggestion (death is the composite).
Always a suggestion: Form I fills blank fields only and warns on a mismatch.
"""
from __future__ import annotations

from datetime import date
from typing import Iterable, Optional

LEFT_EARLY = {"Discharged", "Discharged home on request", "Left Against Medical Advice", "Back referred"}


def stage_rank(value) -> Optional[int]:
    """'None'/'0' -> 0, '1'..'5', '4A'/'4B', 'Stage 3' -> the number. Blank or
    unknown -> None (not examined / not recorded)."""
    if value is None:
        return None
    s = str(value).strip().lower().replace("stage", "").strip()
    if not s:
        return None
    if s in ("none", "no", "0", "no rop", "nil"):
        return 0
    if s[0].isdigit():
        return int(s[0])
    return None


def exam(d: Optional[date], rank: Optional[int], source: str, detail: str = "") -> dict:
    return {"date": d, "rank": rank, "source": source, "detail": detail}


def event(d: Optional[date], source: str, detail: str = "", known_by: Optional[date] = None) -> dict:
    """A treatment (or treatment-required) event. `known_by` is used when the
    event has no date of its own but is known to have happened by then (e.g.
    Form H's summary at discharge)."""
    return {"date": d, "known_by": known_by, "source": source, "detail": detail}


def _by(e: dict) -> Optional[date]:
    return e.get("date") or e.get("known_by")


def _fmt(d: Optional[date]) -> str:
    return d.strftime("%d-%m-%Y") if d else "?"


def suggest_rop(
    *,
    checkpoint: int,
    target_date: date,
    exams: Iterable[dict],
    treatments: Iterable[dict],
    required: Iterable[dict],
    screening_completed: Optional[date] = None,
    summary_negatives: Iterable[dict] = (),
    death_date: Optional[date] = None,
    outcome: Optional[str] = None,
    discharge_date: Optional[date] = None,
    today: Optional[date] = None,
) -> dict:
    """Returns {rop, rop_date, rop_treated, rop_treatment_required, status,
    note, sources_disagree}. Values are "Yes"/"No"/None (None = no suggestion).

    summary_negatives: [{"kind": "rop"|"treatment", "source", "until": date|None}]
    - a whole-record claim like Form H "ROP: No" (valid up to discharge) or
    Form G worst stage "None" in both eyes (valid up to its last visit).
    """
    # A detection with no stage recorded (e.g. Helper 5 "ROP detected" ticked
    # with no stage) used to be silently defaulted to Stage 1 by the caller
    # -- kept separately here instead, so it can surface as "please stage
    # it" (mirroring nec_suggestion.suggest_nec's `unstaged` handling) rather
    # than quietly asserting a specific stage nobody recorded.
    unstaged = [e for e in exams if e.get("date") and e.get("rank") is None]
    exams = [e for e in exams if e.get("date") and e.get("rank") is not None]
    treatments = list(treatments)
    required = list(required)
    out = {"rop": None, "rop_date": None, "rop_treated": None,
           "rop_treatment_required": None, "status": "pending",
           "note": "", "sources_disagree": False, "target_date": target_date.isoformat()}

    if death_date and death_date < target_date:
        out["status"] = "not_applicable"
        out["note"] = f"Died on {_fmt(death_date)}, before {checkpoint} weeks PMA: counts as death in the composite; no ROP suggestion."
        return out

    positives = sorted((e for e in exams if e["rank"] >= 1), key=lambda e: e["date"])
    pos_by_t = [e for e in positives if e["date"] <= target_date]
    last_exam = max(exams, key=lambda e: e["date"]) if exams else None
    looked_after_t = [e for e in exams if e["date"] >= target_date]
    notes = []

    # ---- ROP present by the checkpoint ----
    if pos_by_t:
        first = pos_by_t[0]
        worst = max(pos_by_t, key=lambda e: e["rank"])
        out["rop"] = "Yes"
        out["rop_date"] = first["date"].isoformat()
        notes.append(f"ROP first seen {_fmt(first['date'])} ({first['source']}); worst by {checkpoint} weeks: stage {worst['rank']} ({worst['source']}{', ' + worst['detail'] if worst['detail'] else ''})")
    else:
        first_pos = positives[0]["date"] if positives else None
        clean_after = [e for e in looked_after_t if e["rank"] == 0 and (first_pos is None or e["date"] < first_pos)]
        if clean_after:
            e = min(clean_after, key=lambda x: x["date"])
            out["rop"] = "No"
            notes.append(f"no ROP on {_fmt(e['date'])} ({e['source']}), on/after {checkpoint} weeks PMA")
        elif screening_completed and not positives:
            out["rop"] = "No"
            notes.append(f"ROP screening completed {_fmt(screening_completed)} (Form G) with no ROP")
        elif positives:
            notes.append(f"ROP first seen {_fmt(first_pos)}, after {checkpoint} weeks PMA ({_fmt(target_date)}); no eye exam between {checkpoint} weeks and then shows it was absent")

    # ---- Treated (actual treatment) by the checkpoint ----
    treated_by_t = [t for t in treatments if _by(t) and _by(t) <= target_date]
    undated_treat = [t for t in treatments if not _by(t)]
    if treated_by_t:
        t = min(treated_by_t, key=_by)
        out["rop_treated"] = "Yes"
        notes.append(f"treated {'on ' + _fmt(t['date']) if t['date'] else 'by ' + _fmt(t['known_by'])} ({t['source']}{', ' + t['detail'] if t['detail'] else ''})")
    elif out["rop"] == "Yes":
        if undated_treat:
            notes.append(f"treatment recorded without a date ({undated_treat[0]['source']}): please answer 'Treated' yourself")
        elif looked_after_t or screening_completed:
            out["rop_treated"] = "No"

    # ---- ROP requiring treatment (composite component) ----
    req_by_t = [r for r in required + treatments if _by(r) and _by(r) <= target_date]
    undated_req = [r for r in required if not _by(r)]
    if req_by_t:
        out["rop_treatment_required"] = "Yes"
    elif undated_req:
        notes.append(f"treatment required ({undated_req[0]['source']}) but no date: cannot place it before/after {checkpoint} weeks")
    elif out["rop"] == "No" or (out["rop"] == "Yes" and out["rop_treated"] == "No"):
        out["rop_treatment_required"] = "No"

    # ---- Disagreement between sources ----
    for neg in summary_negatives:
        until = neg.get("until")
        if neg["kind"] == "rop":
            clash = [e for e in positives if e["source"] != neg["source"] and (until is None or e["date"] <= until)]
        else:
            clash = [t for t in treatments if t["source"] != neg["source"] and (until is None or not _by(t) or _by(t) <= until)]
        if clash:
            out["sources_disagree"] = True
            what = "ROP" if neg["kind"] == "rop" else "ROP treatment"
            notes.append(f"sources disagree: {neg['source']} says no {what}, {clash[0]['source']} records it")

    # ---- Status + what is missing ----
    if out["rop"] is not None:
        out["status"] = "flag" if out["sources_disagree"] else "suggested"
    else:
        unstaged_by_t = [e for e in unstaged if e["date"] <= target_date]
        if unstaged_by_t:
            u = min(unstaged_by_t, key=lambda e: e["date"])
            notes.append(f"ROP detected ({u['source']}) but no stage recorded: please answer yourself")
        elif today and today < target_date and not positives:
            notes.append(f"{checkpoint} weeks PMA is {_fmt(target_date)}")
        else:
            left = bool(outcome in LEFT_EARLY and discharge_date and discharge_date < target_date)
            where = (f"{outcome} on {_fmt(discharge_date)} before ROP screening was complete; " if left else "")
            seen = (f"last eye exam {_fmt(last_exam['date'])} ({last_exam['source']})" if last_exam else "no eye exam recorded")
            notes.append(f"{where}{seen}: needs a Form G visit or the Form J {checkpoint}-week visit on/after {_fmt(target_date)}")
    out["note"] = "; ".join(notes)
    return out
