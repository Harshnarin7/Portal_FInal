"""Brain injury suggestion for Form I's PMA checkpoints (I.3/I.4/I.5 "Brain
injury: a) IVH Grade >= III (Papile), b) cPVL Grade >= II (De Vries)").

Pure decision logic (no DB), so it can be tested on its own. The endpoint in
main.py turns Form F scans, Form H, Form J and Helper 2 flags into dated
records.

Design agreed with the PI 2026-09-28 (same principle as BPD / ROP / NEC):
- Cumulative: "IVH >= III (or cPVL >= II) by the checkpoint date", with the
  first date. Sources combined, worst grade wins, source named.
- IVH "No": any scan from Day 7 of life on with no grade III/IV up to then
  (answers every checkpoint; severe IVH is almost always in the first 72 h).
- cPVL "No": a scan on/after the checkpoint; the protocol's final 40-week
  (term) scan also answers 44 weeks. Went home before that scan with no
  Form J -> no suggestion (cysts can still appear after discharge).
- Mild grades (IVH I/II, cPVL I) are not counted but are shown in the note.
- A Helper 2 IVH/cPVL flag with no graded scan after it -> no suggestion.
- Undated severe grade (Form H) counts "by discharge", date to be entered.
- Died before the checkpoint -> not applicable. Back referred -> wait for
  Form J (for cPVL; IVH still follows the Day-7 rule).
- A summary source (Form H, Form J: worst grade so far) below the threshold
  while another source records a severe grade in its period -> worst grade
  still suggested + "sources disagree".
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, Optional

SEVERE = {"ivh": 3, "cpvl": 2}
LABEL = {"ivh": "IVH", "cpvl": "cPVL"}
ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV"}
WENT_HOME = {"Discharged", "Discharged home on request", "Left Against Medical Advice"}
BACK_REFERRED = "Back referred"


def grade_rank(value) -> Optional[int]:
    """'None' -> 0; 'I'..'IV', 'Grade III', '3' -> 1..4; blank -> None."""
    if value is None:
        return None
    s = str(value).strip().upper().replace("GRADE", "").strip()
    if not s:
        return None
    if s in ("NONE", "NO", "0", "NIL", "NORMAL"):
        return 0
    if s in ("I", "II", "III", "IV"):
        return ("I", "II", "III", "IV").index(s) + 1
    if s[0] in "1234":
        return int(s[0])
    return None


def record(d: Optional[date], rank: int, source: str, *, side: str = "",
           summary: bool = False, known_by: Optional[date] = None,
           can_clear: bool = True) -> dict:
    """One graded look (rank 0 = looked, nothing). summary=True for sources
    that report the worst grade so far (Form H, Form J) rather than one scan.
    can_clear=False: may give Yes / disagree but never the late scan a "No"
    needs (Form H: a whole-stay summary, not a scan)."""
    return {"date": d, "known_by": known_by, "rank": rank, "source": source,
            "side": side, "summary": summary, "can_clear": can_clear}


def _when(r: dict) -> Optional[date]:
    return r.get("date") or r.get("known_by")


def _fmt(d: Optional[date]) -> str:
    return d.strftime("%d-%m-%Y") if d else "?"


def _desc(kind: str, r: dict) -> str:
    side = f" {r['side']}" if r.get("side") else ""
    when = ("on " if r["date"] else "by ") + _fmt(_when(r))
    return f"{LABEL[kind]} grade {ROMAN.get(r['rank'], r['rank'])}{side}, {when} ({r['source']})"


def suggest_brain_injury(
    *,
    kind: str,
    checkpoint: int,
    target_date: date,
    dob: date,
    records: Iterable[dict],
    flags: Iterable[date] = (),
    term_date: Optional[date] = None,
    outcome: Optional[str] = None,
    discharge_date: Optional[date] = None,
    death_date: Optional[date] = None,
    today: Optional[date] = None,
) -> dict:
    """kind 'ivh' or 'cpvl'. records: graded looks (record()). flags: dates
    Helper 2 flagged this injury (ungraded). term_date: 40+0 weeks PMA."""
    severe = SEVERE[kind]
    recs = [r for r in records if r["rank"] is not None]
    flags = sorted(flags)
    out = {"answer": None, "date": None, "status": "pending", "note": "",
           "sources_disagree": False, "mild": None}

    if death_date and death_date < target_date:
        out["status"] = "not_applicable"
        out["note"] = f"died on {_fmt(death_date)}, before {checkpoint} weeks PMA (death is the composite)"
        return out

    dated = [r for r in recs if _when(r)]
    severe_all = sorted((r for r in dated if r["rank"] >= severe), key=_when)
    severe_by_t = [r for r in severe_all if _when(r) <= target_date]
    first_severe = _when(severe_all[0]) if severe_all else None
    mild_by_t = [r for r in dated if 1 <= r["rank"] < severe and _when(r) <= target_date]
    notes = []

    if severe_by_t:
        first = severe_by_t[0]
        worst = max(severe_by_t, key=lambda r: r["rank"])
        out["answer"] = "Yes"
        out["date"] = first["date"].isoformat() if first["date"] else None
        notes.append(_desc(kind, first) + (f"; worst {_desc(kind, worst)}" if worst is not first else ""))
        if not first["date"]:
            notes.append("date of diagnosis not recorded: please enter it")
    else:
        if mild_by_t:
            m = max(mild_by_t, key=lambda r: r["rank"])
            out["mild"] = ROMAN[m["rank"]]
            notes.append(f"{_desc(kind, m)}, not ≥ {ROMAN[severe]}")
        # Graded looks that can answer "No" (point-in-time or summary), before
        # any later severe finding.
        looks = [r for r in dated if r["can_clear"] and r["rank"] < severe and (first_severe is None or _when(r) < first_severe)]
        if kind == "ivh":
            day7 = dob + timedelta(days=6)
            ok = [r for r in looks if _when(r) >= day7]
            rule = "a scan from Day 7 of life on"
        else:
            need = min(target_date, term_date) if (term_date and checkpoint > 40) else target_date
            ok = [r for r in looks if _when(r) >= need]
            rule = (f"a scan on/after {checkpoint} weeks PMA" if need == target_date
                    else "the 40-week (term) scan")
        pending_flags = [f for f in flags if f <= target_date
                         and not any(r["date"] and r["date"] >= f and not r["summary"] for r in recs)]
        if pending_flags:
            notes.append(f"{LABEL[kind]} flagged in Helper 2 on {_fmt(pending_flags[0])}, not yet graded in Form F")
        elif ok:
            best = min(ok, key=_when)
            out["answer"] = "No"
            notes.append(f"no {LABEL[kind]} ≥ {ROMAN[severe]} on {_fmt(_when(best))} ({best['source']})")
        elif severe_all:
            f = severe_all[0]
            notes.append(f"{_desc(kind, f)}, after {checkpoint} weeks PMA; no scan between "
                         f"{'Day 7' if kind == 'ivh' else f'{checkpoint} weeks'} and then shows it was absent: please decide")
        elif today and today < target_date and kind == "cpvl":
            notes.append(f"{checkpoint} weeks PMA is {_fmt(target_date)}; needs {rule}")
        else:
            last = max(dated, key=_when) if dated else None
            seen = f"last graded look {_fmt(_when(last))} ({last['source']})" if last else "no graded scan yet"
            left = ""
            if outcome in WENT_HOME | {BACK_REFERRED} and discharge_date and discharge_date < target_date:
                left = f"{outcome} on {_fmt(discharge_date)}; "
            notes.append(f"{left}{seen}: needs {rule}" + (f" or the Form J {checkpoint}-week visit" if kind == "cpvl" else ""))

    # Disagreement: a summary source (Form H: worst grade over the stay, both
    # sides) below the threshold for a period in which another source records
    # a severe grade. Judged on the source's worst grade across sides, not
    # per side (Form H right II + left III agrees with a grade III scan).
    summaries = {}
    for s_ in recs:
        if s_["summary"]:
            cur = summaries.get(s_["source"])
            until = s_["date"] or s_["known_by"]
            if cur is None or s_["rank"] > cur["rank"]:
                summaries[s_["source"]] = {"rank": s_["rank"], "until": until if cur is None else max(filter(None, [cur["until"], until]), default=None)}
            elif until and (cur["until"] is None or until > cur["until"]):
                cur["until"] = until
    for r in severe_by_t:
        for src, sm in summaries.items():
            if src != r["source"] and sm["rank"] < severe and (sm["until"] is None or _when(r) <= sm["until"]):
                out["sources_disagree"] = True
                worst = ROMAN.get(sm["rank"]) if sm["rank"] else "none"
                notes.append(f"sources disagree: {src} worst grade {worst}, {r['source']} records grade {ROMAN[r['rank']]}")
                break
        if out["sources_disagree"]:
            break

    if out["answer"] is not None:
        out["status"] = "flag" if out["sources_disagree"] else "suggested"
    out["note"] = "; ".join(notes)
    return out
