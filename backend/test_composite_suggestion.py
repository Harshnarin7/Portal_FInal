from datetime import date

import composite_suggestion as cs

T36, T44 = date(2026, 11, 11), date(2027, 1, 6)


def test_death_component():
    assert cs.death_component("Death", T36, date(2026, 10, 1), "Helper 5", None, "")["value"] == "Yes"
    assert cs.death_component("Death", T36, None, "", date(2026, 11, 20), "Form J 40-week visit")["value"] == "No"
    u = cs.death_component("Death", T36, None, "", date(2026, 10, 1), "Form H discharge")
    assert u["value"] is None and "needs the baby known alive" in u["detail"]
    assert cs.death_component("Death", T36, date(2026, 12, 1), "Form J", date(2026, 11, 20), "x")["value"] == "No"


def test_combine_yes_no_unknown():
    y = cs.combine([cs.comp("Death", "No", "Form I"), cs.comp("BPD", "Yes", "Form I", "Grade 2")])
    assert y["value"] == "Yes" and "BPD Grade 2 (Form I)" in y["note"]
    n = cs.combine([cs.comp("Death", "No", "Form I"), cs.comp("BPD", "No", "Form I")])
    assert n["value"] == "No"
    u = cs.combine([cs.comp("Death", None, detail="needs Form J"), cs.comp("BPD", "No", "Form I")])
    assert u["value"] is None and u["status"] == "pending" and "Death needs Form J" in u["note"]
    # a Yes wins even when another component is unknown
    assert cs.combine([cs.comp("Death", None), cs.comp("NEC", "Yes", "Form I")])["value"] == "Yes"


def test_form_i_mappings():
    assert cs.bpd_from_form_i("Room air → No BPD") == "No"
    assert cs.bpd_from_form_i("NC > 2 L/min or CPAP/NIPPV → Grade 2") == "Yes"
    assert cs.bpd_from_form_i(None) is None
    assert cs.form_i_value(False) == "No" and cs.form_i_value(None) is None


def test_mri_and_g18():
    assert cs.mri_suggestion(False, None)["value"] == "NA"
    assert cs.mri_suggestion(True, "Abnormal")["value"] == "Yes"
    assert cs.mri_suggestion(True, None)["value"] is None
    assert cs.form_g_item18(True, None, False)["value"] == "Yes"
    assert cs.form_g_item18(False, date(2026, 12, 1), False)["value"] == "No"
    assert cs.form_g_item18(False, None, False)["value"] is None
    assert cs.form_g_item18(False, date(2026, 12, 1), True)["value"] == "Yes"
