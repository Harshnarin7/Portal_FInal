"""Unit tests for bpd_suggestion (no database)."""
from datetime import date, timedelta

from bpd_suggestion import suggest_bpd

DOB = date(2026, 9, 26)          # GA 29+3 -> 36+0 on DOB + 46 days = Day 47
D36 = DOB + timedelta(days=46)


def run(days=None, **kw):
    days = days or {}
    args = dict(dob=DOB, ga_weeks=29, ga_days=3, today=D36 + timedelta(days=5),
                death_date=None, outcome=None, discharge_date=None, form_j36=None,
                get_day=lambda n: days.get(n))
    args.update(kw)
    return suggest_bpd(**args)


def test_assessment_day():
    r = run({47: {"respiratory_support": False}})
    assert r["assessment_day"] == 47 and r["assessment_date"] == D36.isoformat()


def test_room_air_no_bpd():
    r = run({47: {"respiratory_support": False}})
    assert (r["status"], r["bpd"], r["bpd_grade"]) == ("suggested", "No", None)


def test_nc_low_flow_grade1():
    r = run({47: {"respiratory_support": True, "support_modes": "NC", "max_flow": 1.5}})
    assert (r["bpd"], r["bpd_grade"], r["bpd_support_36w"]) == ("Yes", "1", "NC ≤ 2L")


def test_nc_high_flow_and_cpap_grade2():
    assert run({47: {"support_modes": "NC", "max_flow": 3}})["bpd_grade"] == "2"
    assert run({47: {"support_modes": "CPAP"}})["bpd_support_36w"] == "NC > 2L / CPAP / NIPPV"
    assert run({47: {"support_modes": "HFNC"}})["bpd_grade"] == "2"


def test_invasive_grade3():
    assert run({47: {"support_modes": "SIMV"}})["bpd_grade"] == "3"
    assert run({47: {"support_modes": "A/C"}})["bpd_grade"] == "3"
    assert run({47: {"endotracheal_intubation": True, "support_modes": "CPAP"}})["bpd_grade"] == "3"


def test_nc_without_flow_asks_for_grade():
    r = run({47: {"support_modes": "NC"}})
    assert (r["status"], r["bpd"], r["bpd_grade"]) == ("suggested", "Yes", None)
    assert "choose the grade" in r["note"]


def test_o2_without_mode_is_flagged():
    r = run({47: {"supp_o2": True}})
    assert (r["status"], r["bpd"]) == ("flag", None)


def test_missing_day_uses_plus_minus_one():
    r = run({46: {"respiratory_support": False}})
    assert r["bpd"] == "No" and "day before" in r["source"]
    r = run({48: {"support_modes": "CPAP"}})
    assert r["bpd_grade"] == "2" and "day after" in r["source"]
    assert run({45: {"respiratory_support": False}})["status"] == "pending"


def test_before_36_weeks_is_pending():
    r = run({1: {"respiratory_support": False}}, today=DOB + timedelta(days=3))
    assert r["status"] == "pending" and "36+0" in r["note"]


def test_died_before_36_weeks_not_applicable():
    r = run(death_date=DOB + timedelta(days=10))
    assert r["status"] == "not_applicable"


def test_discharged_home_early_on_room_air_is_no_bpd():
    r = run({30: {"respiratory_support": False}}, outcome="Discharged",
            discharge_date=DOB + timedelta(days=29), today=DOB + timedelta(days=31))
    assert (r["status"], r["bpd"]) == ("suggested", "No") and "status at leaving" in r["source"]


def test_lama_on_support_graded_at_leaving():
    r = run({20: {"support_modes": "CPAP"}}, outcome="Left Against Medical Advice",
            discharge_date=DOB + timedelta(days=19), today=DOB + timedelta(days=25))
    assert r["bpd_grade"] == "2"


def test_leaving_uses_last_logged_day_before_discharge():
    r = run({18: {"support_modes": "NC", "max_flow": 1}}, outcome="Discharged home on request",
            discharge_date=DOB + timedelta(days=19), today=DOB + timedelta(days=25))
    assert r["bpd_grade"] == "1" and "Day 18" in r["source"]


def test_form_j_36_week_visit_takes_priority_for_early_leavers():
    r = run({30: {"respiratory_support": False}}, outcome="Discharged",
            discharge_date=DOB + timedelta(days=29),
            form_j36={"resp_support": True, "resp_mode": "cpap_nippv"})
    assert r["bpd_grade"] == "2" and r["source"] == "Form J 36-week visit"


def test_back_referred_waits_for_form_j():
    r = run({30: {"respiratory_support": False}}, outcome="Back referred",
            discharge_date=DOB + timedelta(days=29))
    assert r["status"] == "pending" and "Form J" in r["note"]
    r = run(outcome="Back referred", discharge_date=DOB + timedelta(days=29),
            form_j36={"resp_support": False})
    assert r["bpd"] == "No"


def test_born_at_36_weeks_not_applicable():
    assert run(ga_weeks=36, ga_days=0)["status"] == "not_applicable"
