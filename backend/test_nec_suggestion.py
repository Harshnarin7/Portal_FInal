from datetime import date

from nec_suggestion import finding, highest_stage, stage_rank, suggest_nec

T36 = date(2026, 11, 11)
T40 = date(2026, 12, 9)


def run(**kw):
    base = dict(checkpoint=36, target_date=T36, findings=[], today=date(2027, 3, 1))
    base.update(kw)
    return suggest_nec(**base)


def test_stage_rank():
    assert stage_rank("IIA") == 3 and stage_rank("Stage IIIB") == 6
    assert stage_rank("") is None and stage_rank(None) is None


def test_iia_by_checkpoint_is_yes_with_first_date_and_surgery():
    r = run(findings=[finding(date(2026, 10, 3), 2, "Helper 4 Day 8"),
                      finding(date(2026, 10, 5), 3, "Helper 4 Day 10"),
                      finding(date(2026, 10, 20), 5, "Form H", surgery=True)])
    assert r["nec_stage"] == "Yes" and r["nec_date"] == "2026-10-05"
    assert r["nec_surgery"] == "Yes" and "highest stage IIIA" in r["note"]


def test_suspected_only_is_not_counted_but_shown():
    r = run(findings=[finding(date(2026, 10, 3), 2, "Helper 4 Day 8")], in_nicu_through=T36)
    assert r["nec_stage"] == "No" and r["suspected_stage"] == "IB"
    assert "NEC suspected: highest stage IB" in r["note"]


def test_no_needs_coverage_in_nicu():
    early = run(in_nicu_through=date(2026, 10, 1))
    assert early["nec_stage"] is None and "covers up to 01-10-2026" in early["note"]
    full = run(in_nicu_through=date(2026, 11, 20))
    assert full["nec_stage"] == "No"


def test_went_home_status_at_leaving():
    r = run(outcome="Discharged", discharge_date=date(2026, 11, 1), in_nicu_through=date(2026, 11, 1))
    assert r["nec_stage"] == "No" and "by leaving" in r["note"]
    lama = run(checkpoint=40, target_date=T40, outcome="Left Against Medical Advice", discharge_date=date(2026, 11, 1))
    assert lama["nec_stage"] == "No"


def test_form_j_nec_overrides_status_at_leaving():
    r = run(checkpoint=40, target_date=T40, outcome="Discharged", discharge_date=date(2026, 11, 1),
            findings=[finding(date(2026, 11, 20), 4, "Form J 40-week visit")],
            negatives=[{"source": "Form H", "until": date(2026, 11, 1)}])
    assert r["nec_stage"] == "Yes" and r["nec_date"] == "2026-11-20"
    assert not r["sources_disagree"]


def test_back_referred_waits_for_form_j():
    r = run(outcome="Back referred", discharge_date=date(2026, 11, 1))
    assert r["nec_stage"] is None and "waiting for the Form J 36-week" in r["note"]
    j = run(outcome="Back referred", discharge_date=date(2026, 11, 1),
            negatives=[{"source": "Form J 36-week visit", "until": T36}])
    assert j["nec_stage"] == "No"


def test_unstaged_nec_left_for_clinician():
    r = run(findings=[finding(None, None, "Form H", known_by=date(2026, 10, 30))], in_nicu_through=T36)
    assert r["nec_stage"] is None and "stage is not recorded" in r["note"]


def test_sources_disagree():
    r = run(findings=[finding(date(2026, 10, 3), 2, "Form H"),
                      finding(date(2026, 10, 5), 3, "Helper 4 Day 10")])
    assert r["nec_stage"] == "Yes" and r["sources_disagree"] and r["status"] == "flag"
    neg = run(findings=[finding(date(2026, 10, 5), 3, "Helper 4 Day 10")],
              negatives=[{"source": "Form H", "until": date(2026, 11, 1)}])
    assert neg["sources_disagree"] and "Form H says no NEC" in neg["note"]


def test_after_checkpoint_not_counted():
    r = run(findings=[finding(date(2026, 11, 20), 3, "Helper 4 Day 56")], in_nicu_through=date(2026, 11, 30))
    assert r["nec_stage"] == "No"


def test_died_before():
    r = run(death_date=date(2026, 10, 10), findings=[finding(date(2026, 10, 5), 4, "Form H")])
    assert r["status"] == "not_applicable" and r["nec_stage"] is None


def test_undated_qualifying_known_by_discharge():
    r = run(findings=[finding(None, 4, "Form H", known_by=date(2026, 10, 30))])
    assert r["nec_stage"] == "Yes" and r["nec_date"] is None and "date of diagnosis not recorded" in r["note"]


def test_highest_stage_for_form_h():
    h = highest_stage([finding(date(2026, 10, 3), 1, "Helper 4 Day 8"),
                       finding(date(2026, 10, 4), 2, "Helper 4 Day 9"),
                       finding(date(2026, 10, 6), 2, "Helper 4 Day 11")])
    assert h == {"stage": "IB", "date": "2026-10-04", "source": "Helper 4 Day 9"}
    assert highest_stage([finding(None, None, "Form H")]) is None
