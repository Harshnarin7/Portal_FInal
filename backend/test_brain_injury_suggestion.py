from datetime import date, timedelta

from brain_injury_suggestion import grade_rank, record, suggest_brain_injury

DOB = date(2026, 9, 26)            # GA 29+3 -> 36+0 on 11-11, 40+0 on 09-12, 44+0 on 06-01
T36, T40, T44 = date(2026, 11, 11), date(2026, 12, 9), date(2027, 1, 6)


def day(n):
    return DOB + timedelta(days=n - 1)


def run(kind, **kw):
    base = dict(kind=kind, checkpoint=36, target_date=T36, dob=DOB, records=[],
                term_date=T40, today=date(2027, 3, 1))
    base.update(kw)
    return suggest_brain_injury(**base)


def test_grade_rank():
    assert grade_rank("Grade III") == 3 and grade_rank("IV") == 4 and grade_rank("2") == 2
    assert grade_rank("None") == 0 and grade_rank("") is None


def test_ivh_severe_yes_with_first_date_and_worst():
    r = run("ivh", records=[record(day(2), 3, "Form F scan 1", side="right"),
                            record(day(5), 4, "Form F scan 2", side="left")])
    assert r["answer"] == "Yes" and r["date"] == day(2).isoformat()
    assert "worst IVH grade IV left" in r["note"]


def test_ivh_no_needs_day7_scan():
    early = run("ivh", records=[record(day(3), 1, "Form F scan 1", side="right")])
    assert early["answer"] is None and "Day 7" in early["note"] and early["mild"] == "I"
    ok = run("ivh", checkpoint=44, target_date=T44,
             records=[record(day(3), 2, "Form F scan 1"), record(day(10), 0, "Form F scan 2")])
    assert ok["answer"] == "No" and "grade II" in ok["note"]


def test_cpvl_no_needs_scan_on_or_after_checkpoint():
    day28 = run("cpvl", records=[record(day(28), 0, "Form F scan 3")])
    assert day28["answer"] is None and "on/after 36 weeks" in day28["note"]
    at36 = run("cpvl", records=[record(T36, 0, "Form F scan 4")])
    assert at36["answer"] == "No"


def test_term_scan_answers_44():
    r = run("cpvl", checkpoint=44, target_date=T44, records=[record(T40, 0, "Form F final scan")])
    assert r["answer"] == "No"
    none = run("cpvl", checkpoint=44, target_date=T44, records=[record(day(28), 0, "Form F scan 3")])
    assert none["answer"] is None and "40-week (term) scan" in none["note"]


def test_went_home_ivh_answered_cpvl_waits():
    kw = dict(checkpoint=40, target_date=T40, outcome="Discharged", discharge_date=day(40),
              records=[record(day(10), 0, "Form F scan 2"), record(day(28), 0, "Form F scan 3")])
    assert run("ivh", **kw)["answer"] == "No"
    c = run("cpvl", **kw)
    assert c["answer"] is None and "Discharged on" in c["note"] and "Form J 40-week" in c["note"]
    j = run("cpvl", **{**kw, "records": kw["records"] + [record(T40, 0, "Form J 40-week visit", summary=True)]})
    assert j["answer"] == "No"


def test_form_h_summary_cannot_clear_but_can_say_yes():
    h_none = run("cpvl", records=[record(None, 0, "Form H", summary=True, known_by=T40, can_clear=False)])
    assert h_none["answer"] is None
    h_sev = run("ivh", records=[record(None, 3, "Form H", summary=True, known_by=day(30), can_clear=False)])
    assert h_sev["answer"] == "Yes" and h_sev["date"] is None and "please enter it" in h_sev["note"]


def test_helper2_flag_not_graded_blocks_no():
    r = run("ivh", records=[record(day(10), 0, "Form F scan 2")], flags=[day(12)])
    assert r["answer"] is None and "not yet graded in Form F" in r["note"]
    graded = run("ivh", records=[record(day(10), 0, "Form F scan 2"), record(day(14), 1, "Form F scan 3")],
                 flags=[day(12)])
    assert graded["answer"] == "No"


def test_sources_disagree():
    r = run("ivh", records=[record(day(3), 3, "Form F scan 1"),
                            record(None, 2, "Form H", summary=True, known_by=day(30), can_clear=False)])
    assert r["answer"] == "Yes" and r["sources_disagree"] and r["status"] == "flag"
    resolved = run("ivh", records=[record(day(3), 3, "Form F scan 1"), record(day(28), 0, "Form F scan 3")])
    assert not resolved["sources_disagree"]


def test_severe_after_checkpoint_not_counted():
    r = run("cpvl", records=[record(T36, 0, "Form F scan 4"), record(T40, 2, "Form F final scan")])
    assert r["answer"] == "No"
    r40 = run("cpvl", checkpoint=40, target_date=T40,
              records=[record(T36, 0, "Form F scan 4"), record(T40, 2, "Form F final scan")])
    assert r40["answer"] == "Yes"


def test_died_before():
    r = run("ivh", death_date=day(20), records=[record(day(2), 4, "Form F scan 1")])
    assert r["status"] == "not_applicable" and r["answer"] is None


def test_severe_first_seen_after_checkpoint_note():
    r = run("cpvl", records=[record(day(28), 0, "Form F scan 3"), record(T40, 2, "Form J 40-week visit")])
    assert r["answer"] is None and "after 36 weeks PMA" in r["note"] and "please decide" in r["note"]


def test_form_h_worst_across_sides_agrees_with_scan():
    # Test One live case: Form H right II + left III vs Form F scan left III
    recs = [record(day(1), 3, "Form F scan 1", side="left"),
            record(day(1), 2, "Form H", side="right", summary=True, can_clear=False),
            record(day(1), 3, "Form H", side="left", summary=True, can_clear=False)]
    r = run("ivh", records=recs)
    assert r["answer"] == "Yes" and not r["sources_disagree"] and r["status"] == "suggested"
