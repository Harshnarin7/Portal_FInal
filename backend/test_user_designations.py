"""Designation autofill for Completion Details at every site."""
from user_seed import (
    DESIGNATION_NURSE,
    DESIGNATION_PROJECT_SCIENTIST,
    DESIGNATION_SITE_SCIENTIST,
    designation_for_account,
)


def test_pgimer_nurse_matches_tanvi_yashvi():
    assert designation_for_account("Tanvi Saini", "nurse", "PGIMER") == DESIGNATION_NURSE
    assert designation_for_account("Yashvi Jolly", "nurse", "PGIMER") == DESIGNATION_NURSE


def test_other_site_nurses_same_as_tanvi():
    assert designation_for_account("Anosh", "nurse", "GMCH") == DESIGNATION_NURSE
    assert designation_for_account("Oli Konwar", "nurse", "AMC") == DESIGNATION_NURSE
    assert (
        designation_for_account("Samiksha Deepak Khandagale", "nurse", "GMCH-A")
        == DESIGNATION_NURSE
    )


def test_other_site_scientists_are_prs_ii_medical():
    assert (
        designation_for_account("Dr. Kirti Vishnu Rathod", "site_scientist", "GMCH-A")
        == DESIGNATION_SITE_SCIENTIST
    )
    assert (
        designation_for_account("Dr. Manpreet Kaur", "site_scientist", "GMCH")
        == DESIGNATION_SITE_SCIENTIST
    )
    assert (
        designation_for_account("Nafifa Tasmeen Rahman", "site_scientist", "AMC")
        == DESIGNATION_SITE_SCIENTIST
    )
    assert (
        designation_for_account("Dr. Sobhana", "site_scientist", "IOG")
        == DESIGNATION_SITE_SCIENTIST
    )


def test_pgimer_named_scientist_titles_unchanged():
    assert (
        designation_for_account("Mannat Guliani", "project_scientist", None)
        == DESIGNATION_PROJECT_SCIENTIST
    )
    assert (
        designation_for_account("Dr. Shalini Dhiman", "site_scientist", "PGIMER")
        == "Project Research Scientist III (Non-Medical)"
    )
