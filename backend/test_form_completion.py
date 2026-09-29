from datetime import date, datetime
from types import SimpleNamespace as NS

import form_completion as fc

SIGNED = dict(completed_by="Dr X", completion_date="2026-09-29")


def test_form_f():
    ok = NS(scan_entries=[{"scanDate": "2026-09-26"}], phvd=False, vp_shunt=True,
            phvd_diagnosis_date=None, vp_shunt_insertion_date="2026-10-01", **SIGNED)
    assert fc.form_f_complete(ok)
    assert not fc.form_f_complete(NS(**{**ok.__dict__, "vp_shunt_insertion_date": None}))
    assert not fc.form_f_complete(NS(**{**ok.__dict__, "scan_entries": []}))
    assert not fc.form_f_complete(NS(**{**ok.__dict__, "completion_date": ""}))


def test_form_g_needs_real_visit_and_no_alerts():
    g = NS(screenings=[{"date": "2026-09-27", "re_stage": "2"}], outcome="Regressed", outcome_other_text=None,
           rop_treatment_composite=False, final_screening_date=date(2026, 12, 1), **SIGNED)
    assert fc.form_g_complete(g, [])
    assert not fc.form_g_complete(g, [{"nicu_day": 30}])
    auto_only = NS(**{**g.__dict__, "screenings": [{"date": "2026-09-27"}]})
    assert not fc.form_g_complete(auto_only, [])


def test_form_h_infection_review_and_page_flag():
    h = NS(outcome="Discharged", discharge_date=date(2026, 9, 26), infection_flags_reviewed=["w1"],
           is_complete=True, **SIGNED)
    assert fc.form_h_complete(h, ["w1"])
    assert not fc.form_h_complete(h, ["w1", "w2"])
    assert not fc.form_h_complete(NS(**{**h.__dict__, "is_complete": False}), ["w1"])
    assert fc.form_h_complete(NS(**{**h.__dict__, "is_complete": None}), ["w1"])  # older rows


def test_form_i_k_l_j():
    i = NS(**{k: False for k in fc.FORM_I_REQUIRED}, **SIGNED)
    assert fc.form_i_complete(i)
    assert not fc.form_i_complete(NS(**{**i.__dict__, "sepsis_los": None}))
    assert fc.form_k_complete(NS(selected_for_mri=False, mri_date=None, overall_mri=None, **SIGNED))
    assert not fc.form_k_complete(NS(selected_for_mri=True, mri_date=None, overall_mri=None, **SIGNED))
    assert fc.form_l_complete(NS(initial_fio2=30.0, exit_fio2=21.0, max_fio2_first_hour=40.0,
                                 composite_outcome_1="no", composite_outcome_2="no", mri_abnormality="na", **SIGNED))
    assert fc.form_j_complete([NS(completed_by=None, completion_date=None), NS(**SIGNED)])
    assert not fc.form_j_complete([])


def test_ae_and_sae_list():
    assert fc.adverse_events_complete(NS(has_adverse_event=False, events=[], **SIGNED))
    ev = {"description": "x", "start_date": "2026-09-27", "grade": "2", "converted_to_sae": "No"}
    assert fc.adverse_events_complete(NS(has_adverse_event=True, events=[ev], **SIGNED))
    assert not fc.adverse_events_complete(NS(has_adverse_event=True, events=[{**ev, "grade": ""}], **SIGNED))
    assert fc.sae_list_complete(NS(rows=[], **SIGNED))
    assert not fc.sae_list_complete(NS(rows=[{"sae": "Sepsis"}], **SIGNED))


def test_nicu_day_and_last_required_day():
    dob = date(2026, 9, 26)
    assert fc.nicu_day_today(dob, datetime(2026, 9, 29, 9, 0)) == 4
    assert fc.nicu_day_today(dob, datetime(2026, 9, 29, 7, 0)) == 3   # before 08:00
    assert fc.helper_last_required_day(1) == 1
    assert fc.helper_last_required_day(10, discharge_day=4) == 4
    assert fc.helper_last_required_day(10, max_day=7) == 7


def test_helper_log_complete():
    pcts = {1: 100, 2: 100, 3: 95}
    assert fc.helper_log_complete(pcts.get, 2)
    assert not fc.helper_log_complete(pcts.get, 3)
    assert not fc.helper_log_complete(pcts.get, 4)   # day 4 has no log


def _win(day, block, fio2, dur):
    return {"day": day, "block": block, "entries": [{"fio2": fio2, "dur": dur}]}


def test_fio2_auc_rule():
    full = [_win(1, "0-12", 30, 12), _win(1, "12-24", 25, 12)]
    assert fc.fio2_auc_complete(full, {1: True}, 1)
    blank = [_win(1, "0-12", "", 12), _win(1, "12-24", "", 12)]       # pre-filled 12 h, no FiO2
    assert not fc.fio2_auc_complete(blank, {1: True}, 1)
    assert fc.fio2_auc_complete([], {1: False, 2: False}, 2)         # room air throughout
    assert not fc.fio2_auc_complete([], {1: False}, 2)               # day 2 not logged anywhere
    assert not fc.fio2_auc_complete(full, {1: True, 2: True}, 2)     # O2 day 2 missing
