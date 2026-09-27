from datetime import date

from rop_suggestion import event, exam, stage_rank, suggest_rop

T36 = date(2026, 11, 11)
T40 = date(2026, 12, 9)
T44 = date(2027, 1, 6)


def run(**kw):
    base = dict(checkpoint=40, target_date=T40, exams=[], treatments=[], required=[],
                today=date(2027, 3, 1))
    base.update(kw)
    return suggest_rop(**base)


def test_stage_rank():
    assert stage_rank("None") == 0
    assert stage_rank("4A") == 4
    assert stage_rank("Stage 3") == 3
    assert stage_rank("") is None and stage_rank(None) is None


def test_rop_seen_before_checkpoint():
    r = run(exams=[exam(date(2026, 11, 20), 2, "Form G visit 3")])
    assert r["rop"] == "Yes" and r["rop_date"] == "2026-11-20"
    assert r["status"] == "suggested"


def test_worst_wins_across_sources():
    r = run(exams=[exam(date(2026, 11, 1), 1, "Form G visit 1"),
                   exam(date(2026, 12, 9), 3, "Form J 40-week visit")])
    assert r["rop"] == "Yes" and r["rop_date"] == "2026-11-01"
    assert "stage 3" in r["note"] and "Form J" in r["note"]


def test_no_rop_needs_an_exam_on_or_after_checkpoint():
    only_before = run(exams=[exam(date(2026, 11, 1), 0, "Form G visit 1")])
    assert only_before["rop"] is None and "needs a Form G visit" in only_before["note"]
    after = run(exams=[exam(date(2026, 11, 1), 0, "Form G visit 1"),
                       exam(date(2026, 12, 10), 0, "Form J 40-week visit")])
    assert after["rop"] == "No"
    assert after["rop_treatment_required"] == "No"


def test_screening_completed_no_rop_answers_later_checkpoints():
    r = run(checkpoint=44, target_date=T44,
            exams=[exam(date(2026, 12, 1), 0, "Form G visit 4")],
            screening_completed=date(2026, 12, 1))
    assert r["rop"] == "No"


def test_early_leaver_incomplete_screening_left_blank():
    r = run(exams=[exam(date(2026, 10, 20), 0, "Form G visit 1")],
            outcome="Discharged", discharge_date=date(2026, 10, 25))
    assert r["rop"] is None and r["status"] == "pending"
    assert "Discharged on 25-10-2026" in r["note"] and "Form J 40-week" in r["note"]


def test_back_referred_waits_then_uses_form_j():
    pend = run(outcome="Back referred", discharge_date=date(2026, 10, 25))
    assert pend["rop"] is None
    done = run(outcome="Back referred", discharge_date=date(2026, 10, 25),
               exams=[exam(T40, 0, "Form J 40-week visit")])
    assert done["rop"] == "No"


def test_positive_after_checkpoint_does_not_answer_earlier_checkpoint():
    r = run(checkpoint=36, target_date=T36, exams=[exam(date(2026, 11, 20), 2, "Form G visit 3")])
    assert r["rop"] is None
    later = run(checkpoint=36, target_date=T36,
                exams=[exam(date(2026, 11, 11), 0, "Form G visit 2"),
                       exam(date(2026, 11, 20), 2, "Form G visit 3")])
    assert later["rop"] == "No"


def test_treatment_dated_against_checkpoint():
    ex = [exam(date(2026, 11, 1), 3, "Form G visit 2"), exam(date(2027, 1, 6), 3, "Form J 44-week visit")]
    tx = [event(date(2026, 12, 20), "Form G", "Laser, right eye")]
    at40 = run(exams=ex, treatments=tx)
    assert at40["rop"] == "Yes" and at40["rop_treated"] == "No"
    at44 = run(checkpoint=44, target_date=T44, exams=ex, treatments=tx)
    assert at44["rop_treated"] == "Yes" and at44["rop_treatment_required"] == "Yes"


def test_required_but_not_given_counts_for_composite():
    r = run(exams=[exam(date(2026, 11, 1), 3, "Form G visit 2"), exam(T40, 3, "Form J 40-week visit")],
            required=[event(date(2026, 11, 1), "Form G right eye")])
    assert r["rop_treatment_required"] == "Yes"
    assert r["rop_treated"] == "No"


def test_undated_treatment_left_for_clinician():
    r = run(exams=[exam(date(2026, 11, 1), 3, "Form G visit 2"), exam(T40, 3, "Form J")],
            treatments=[event(None, "Form H")])
    assert r["rop_treated"] is None and "without a date" in r["note"]
    known = run(exams=[exam(date(2026, 11, 1), 3, "Form G visit 2")],
                treatments=[event(None, "Form H", known_by=date(2026, 11, 30))])
    assert known["rop_treated"] == "Yes"


def test_sources_disagree_flag():
    r = run(exams=[exam(date(2026, 11, 1), 2, "Form G visit 2")],
            summary_negatives=[{"kind": "rop", "source": "Form H", "until": date(2026, 11, 30)}])
    assert r["rop"] == "Yes" and r["sources_disagree"] and r["status"] == "flag"
    assert "Form H says no ROP" in r["note"]
    none = run(exams=[exam(date(2026, 12, 20), 2, "Form J 44-week visit")],
               summary_negatives=[{"kind": "rop", "source": "Form H", "until": date(2026, 11, 30)}])
    assert not none["sources_disagree"]


def test_died_before_checkpoint():
    r = run(death_date=date(2026, 11, 1), exams=[exam(date(2026, 10, 20), 2, "Form G")])
    assert r["status"] == "not_applicable" and r["rop"] is None


def test_future_checkpoint_pending():
    r = run(today=date(2026, 10, 1))
    assert r["rop"] is None and "40 weeks PMA is 09-12-2026" in r["note"]
