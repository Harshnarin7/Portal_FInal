"""NEC suggestion for Form I's PMA checkpoints (I.3/I.4/I.5 "NEC, Modified
Bell's Stage >= IIA") and Form H's NEC stage (H3).

Pure decision logic (no DB), so it can be tested on its own. The endpoints in
main.py turn Helper 4 / Form H / Form J into dated stage findings.

Design agreed with the PI 2026-09-27/28 (same principle as BPD and ROP):
- Cumulative: "NEC Bell >= IIA by the checkpoint date", plus surgery and the
  first date >= IIA. Sources combined, highest stage wins, source named.
- "No" only when the period is covered: still in the NICU at the checkpoint
  with nothing >= IIA; a Form J visit at/after the checkpoint with no NEC; or
  went home (Discharged / on request / LAMA) before the checkpoint without
  NEC -> "No" from the status at leaving (PI decision); a later Form J NEC
  overrides it and raises the disagree warning. Back referred -> wait for
  Form J. Died before the checkpoint -> not applicable.
- NEC recorded without a stage -> no suggestion, note "stage not recorded".
- Stage IA/IB (suspected) stays OUT of the >= IIA answer and the composite,
  but is shown in the note (and suggested for Form H's own stage field).
- A source whose highest stage is < IIA contradicted by another source's
  >= IIA finding in the same period -> higher stage wins + "sources disagree".
"""
from __future__ import annotations

from datetime import date
from typing import Iterable, Optional

STAGE_ORDER = {"IA": 1, "IB": 2, "IIA": 3, "IIB": 4, "IIIA": 5, "IIIB": 6}
STAGE_NAME = {v: k for k, v in STAGE_ORDER.items()}
IIA = STAGE_ORDER["IIA"]
WENT_HOME = {"Discharged", "Discharged home on request", "Left Against Medical Advice"}
BACK_REFERRED = "Back referred"


def stage_rank(value) -> Optional[int]:
    """'IIA' / 'Stage IIA' / 'iia' -> 3. Blank or unknown -> None."""
    if value is None:
        return None
    s = str(value).strip().upper().replace("STAGE", "").strip()
    return STAGE_ORDER.get(s)


def finding(d: Optional[date], rank: Optional[int], source: str, *,
            surgery: Optional[bool] = None, known_by: Optional[date] = None) -> dict:
    """A NEC record. rank None = NEC recorded but stage not recorded.
    known_by: for an undated record known to have happened by then (e.g. Form
    H's summary at discharge)."""
    return {"date": d, "known_by": known_by, "rank": rank, "source": source, "surgery": surgery}


def _when(f: dict) -> Optional[date]:
    return f.get("date") or f.get("known_by")


def _fmt(d: Optional[date]) -> str:
    return d.strftime("%d-%m-%Y") if d else "?"


def highest_stage(findings: Iterable[dict]) -> Optional[dict]:
    """The highest-stage record (earliest date on a tie) - used for Form H's
    stage suggestion strip."""
    staged = [f for f in findings if f.get("rank")]
    if not staged:
        return None
    top = max(f["rank"] for f in staged)
    best = min((f for f in staged if f["rank"] == top), key=lambda f: _when(f) or date.max)
    return {"stage": STAGE_NAME[top], "date": _when(best).isoformat() if _when(best) else None,
            "source": best["source"]}


def suggest_nec(
    *,
    checkpoint: int,
    target_date: date,
    findings: Iterable[dict],
    negatives: Iterable[dict] = (),
    in_nicu_through: Optional[date] = None,
    outcome: Optional[str] = None,
    discharge_date: Optional[date] = None,
    death_date: Optional[date] = None,
    today: Optional[date] = None,
) -> dict:
    """negatives: [{"source", "until": date}] - a period a source says had no
    NEC (Form H "No" to discharge, a Form J visit with NEC "No").
    in_nicu_through: last date the NICU record covers (Form H discharge date,
    else the last Helper 4 log)."""
    findings = list(findings)
    negatives = list(negatives)
    out = {"nec_stage": None, "nec_date": None, "nec_surgery": None,
           "status": "pending", "note": "", "sources_disagree": False,
           "suspected_stage": None, "target_date": target_date.isoformat()}

    if death_date and death_date < target_date:
        out["status"] = "not_applicable"
        out["note"] = f"Died on {_fmt(death_date)}, before {checkpoint} weeks PMA: counts as death in the composite; no NEC suggestion"
        return out

    by_t = [f for f in findings if _when(f) and _when(f) <= target_date]
    qualifying = sorted((f for f in by_t if f["rank"] and f["rank"] >= IIA), key=_when)
    suspected = [f for f in by_t if f["rank"] and f["rank"] < IIA]
    unstaged = [f for f in by_t if f["rank"] is None]
    notes = []

    if qualifying:
        first = qualifying[0]
        top = max(qualifying, key=lambda f: f["rank"])
        out["nec_stage"] = "Yes"
        out["nec_date"] = _when(first).isoformat() if first["date"] else None
        notes.append(f"NEC stage {STAGE_NAME[first['rank']]} {'on' if first['date'] else 'by'} {_fmt(_when(first))} ({first['source']})"
                     + (f"; highest stage {STAGE_NAME[top['rank']]} ({top['source']})" if top is not first else ""))
        if not first["date"]:
            notes.append("date of diagnosis not recorded: please enter it")
        surg = [f["surgery"] for f in qualifying if f["surgery"] is not None]
        if any(surg):
            out["nec_surgery"] = "Yes"
        elif surg:
            out["nec_surgery"] = "No"
    else:
        if suspected:
            s = max(suspected, key=lambda f: f["rank"])
            out["suspected_stage"] = STAGE_NAME[s["rank"]]
            notes.append(f"NEC suspected: highest stage {STAGE_NAME[s['rank']]} {'on' if s['date'] else 'by'} {_fmt(_when(s))} ({s['source']}), not ≥ IIA")
        covered_by = None
        if unstaged and not suspected:
            notes.append(f"NEC recorded ({unstaged[0]['source']}) but the stage is not recorded: please answer yourself")
        else:
            j_clear = [n for n in negatives if n["source"].startswith("Form J") and n["until"] and n["until"] >= target_date]
            if in_nicu_through and in_nicu_through >= target_date:
                covered_by = f"in the NICU through {checkpoint} weeks PMA with no NEC ≥ IIA"
            elif j_clear:
                covered_by = f"{j_clear[0]['source']} records no NEC"
            elif outcome in WENT_HOME and discharge_date and discharge_date < target_date:
                covered_by = f"no NEC ≥ IIA by leaving ({outcome}, {_fmt(discharge_date)}); a later Form J visit overrides this"
        if covered_by:
            out["nec_stage"] = "No"
            notes.append(covered_by)
        elif not unstaged:
            if today and today < target_date:
                notes.append(f"{checkpoint} weeks PMA is {_fmt(target_date)}")
            elif outcome == BACK_REFERRED and discharge_date and discharge_date < target_date:
                notes.append(f"Back referred on {_fmt(discharge_date)}: waiting for the Form J {checkpoint}-week visit")
            else:
                last = _fmt(in_nicu_through) if in_nicu_through else "none"
                notes.append(f"NICU record covers up to {last}: needs the daily logs / Form H discharge up to {_fmt(target_date)}, or the Form J {checkpoint}-week visit")

    # Disagreement: a period one source calls < IIA (or no NEC) that another
    # source records as >= IIA.
    ranked_sources = {}
    for f in findings:
        if f["rank"]:
            ranked_sources[f["source"].split(" Day")[0]] = max(ranked_sources.get(f["source"].split(" Day")[0], 0), f["rank"])
    for f in qualifying:
        for n in negatives:
            if n["source"] != f["source"] and (n["until"] is None or _when(f) <= n["until"]):
                out["sources_disagree"] = True
                notes.append(f"sources disagree: {n['source']} says no NEC, {f['source']} records stage {STAGE_NAME[f['rank']]}")
                break
        for src, rank in ranked_sources.items():
            if rank < IIA and not f["source"].startswith(src):
                out["sources_disagree"] = True
                notes.append(f"sources disagree: {src} highest stage {STAGE_NAME[rank]}, {f['source']} records stage {STAGE_NAME[f['rank']]}")
        if out["sources_disagree"]:
            break

    if out["nec_stage"] is not None:
        out["status"] = "flag" if out["sources_disagree"] else "suggested"
    out["note"] = "; ".join(notes)
    return out
