"""Suggestions for Form L's composite outcomes (L.3 item 11, 12a) and MRI
item (12b), and Form G item 18 "ROP requiring treatment" (PI 2026-09-30).

Pure decision logic (no DB). The endpoint in main.py gathers each component
(Form I's saved checkpoint answers first, the live BPD/ROP/NEC/brain-injury
suggestions only where Form I is blank) and hands them in.

- Composite 1 = death by 36 wk PMA OR BPD (Jensen, any grade) at 36 wk.
- Composite 2 = death by 44 wk OR BPD at 36 wk OR ROP needing treatment
  (treatment REQUIRED) OR NEC >= IIA OR brain injury (IVH >= III / cPVL >= II),
  all by 44 wk.
- Yes as soon as any component is Yes; No only when every component is a
  known No; otherwise no suggestion, with the unknown components listed.
- Death "No" needs the baby known alive at the checkpoint (still admitted, or
  seen at a Form J visit on/after it).
Always a suggestion: Form L / Form G show it with an Apply button.
"""
from __future__ import annotations

from datetime import date
from typing import Iterable, Optional


def comp(name: str, value: Optional[str], source: str = "", detail: str = "") -> dict:
    """One component: value "Yes" / "No" / None (unknown)."""
    return {"name": name, "value": value, "source": source, "detail": detail}


def _fmt(d: Optional[date]) -> str:
    return d.strftime("%d-%m-%Y") if d else "?"


def death_component(label: str, target: Optional[date], death_date: Optional[date],
                    death_source: str, alive_until: Optional[date], alive_source: str) -> dict:
    """Death by `target`: Yes if a death is dated on/before it; No only when
    the baby is known alive on/after it; else unknown."""
    if target is None:
        return comp(label, None, detail="checkpoint date unknown (gestation / date of birth missing)")
    if death_date and death_date <= target:
        return comp(label, "Yes", death_source, f"died {_fmt(death_date)}")
    if alive_until and alive_until >= target:
        return comp(label, "No", alive_source, f"known alive on {_fmt(alive_until)}")
    seen = f"last known alive {_fmt(alive_until)} ({alive_source})" if alive_until else "no record of the baby after birth"
    return comp(label, None, detail=f"{seen}: needs a Form J visit on/after {_fmt(target)}")


def combine(components: Iterable[dict]) -> dict:
    components = list(components)
    yes = [c for c in components if c["value"] == "Yes"]
    unknown = [c for c in components if c["value"] not in ("Yes", "No")]

    def line(c):
        bits = [c["name"]]
        if c["detail"]:
            bits.append(c["detail"])
        if c["source"]:
            bits.append(f"({c['source']})")
        return " ".join(bits)

    if yes:
        return {"value": "Yes", "status": "suggested",
                "note": "Yes because: " + "; ".join(line(c) for c in yes)}
    if unknown:
        return {"value": None, "status": "pending",
                "note": "Still unknown: " + "; ".join(line(c) for c in unknown)}
    return {"value": "No", "status": "suggested",
            "note": "No: " + "; ".join(f"{c['name']} No ({c['source']})" for c in components)}


def form_i_value(v) -> Optional[str]:
    return "Yes" if v is True else ("No" if v is False else None)


def bpd_from_form_i(grade: Optional[str]) -> Optional[str]:
    """Form I bpd36_jensen_grade option -> BPD Yes/No."""
    if not grade:
        return None
    return "No" if "No BPD" in grade else "Yes"


def mri_suggestion(selected_for_mri: Optional[bool], overall_mri: Optional[str]) -> dict:
    if selected_for_mri is False:
        return {"value": "NA", "status": "suggested", "note": "Not in the MRI subset (Form K)"}
    if selected_for_mri is True and overall_mri in ("Abnormal", "Normal"):
        return {"value": "Yes" if overall_mri == "Abnormal" else "No", "status": "suggested",
                "note": f"Form K overall MRI: {overall_mri}"}
    if selected_for_mri is True:
        return {"value": None, "status": "pending", "note": "Selected for MRI; Form K overall result not entered yet"}
    return {"value": None, "status": "pending", "note": "Form K not filled yet"}


def form_g_item18(treatment_required_any: bool, screening_completed: Optional[date],
                  form_j_treated: bool) -> dict:
    """Form G item 18: Yes when treatment required in either eye (Form G) or
    treated per Form J; No only when screening is completed with none."""
    if treatment_required_any or form_j_treated:
        src = "Form G treatment required" if treatment_required_any else "Form J treatment recorded"
        return {"value": "Yes", "status": "suggested", "note": src}
    if screening_completed:
        return {"value": "No", "status": "suggested",
                "note": f"ROP screening completed {_fmt(screening_completed)} with no treatment required in either eye"}
    return {"value": None, "status": "pending", "note": "ROP screening not completed yet (final screening date)"}
