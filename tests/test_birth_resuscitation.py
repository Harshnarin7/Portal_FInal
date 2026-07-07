from datetime import date, time

from backend.schemas import BirthResuscitationCreate


def test_birth_resuscitation_schema_preserves_clinical_sections():
    interventions = {
        "oxygen": {"1": "Yes", "5": "No"},
        "apgar": {"1": "4", "5": "8"},
    }
    data = BirthResuscitationCreate(
        screening_id="SCR-1",
        enrollment_id="ENR-1",
        baby_admission_no="ADM-1",
        baby_annual_no="ANN-1",
        date_of_birth=date(2026, 1, 2),
        time_of_birth=time(23, 59, 30),
        gestation_rand_weeks=29,
        gestation_rand_days=2,
        hr_above_100=True,
        strata="≥28–31wk",
        cord_clamp_timestamp=time(0, 0, 15),
        cord_clamp_time=45,
        cord_blood_done=True,
        cord_ph=7.21,
        respiration_days=0,
        respiration_hours=2,
        blender_stopped=True,
        blender_stopped_description="Unexpected shutdown",
        interventions=interventions,
    )

    payload = data.model_dump()

    assert payload["baby_admission_no"] == "ADM-1"
    assert payload["cord_clamp_timestamp"] == time(0, 0, 15)
    assert payload["cord_ph"] == 7.21
    assert payload["blender_stopped_description"] == "Unexpected shutdown"
    assert payload["interventions"] == interventions


def test_birth_resuscitation_schema_preserves_device_and_adrenaline_details():
    data = BirthResuscitationCreate(
        sib_peep_with="Yes",
        sib_peep_cmh2o=5,
        tpiece_pip=20,
        tpiece_peep=5,
        tpiece_flow=8,
        interface_used="Mask",
        adrenaline_dilution="1:10,000",
        adrenaline_route="IV",
        adrenaline_cumulative=0.03,
        fluid_bolus_doses=2,
        fluid_bolus_cumulative=20,
    )

    payload = data.model_dump()

    assert payload["sib_peep_cmh2o"] == 5
    assert payload["interface_used"] == "Mask"
    assert payload["adrenaline_cumulative"] == 0.03
    assert payload["fluid_bolus_doses"] == 2
