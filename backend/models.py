from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, Date, JSON, Time, Text
from datetime import datetime, timezone
from sqlalchemy import UniqueConstraint

def utcnow():
    return datetime.now(timezone.utc)
from db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)

    hashed_password = Column(String, nullable=False)

    role = Column(String, nullable=False)
    site_name = Column(String, nullable=True)  # NULL for super admin

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String, nullable=True)
    action = Column(String, nullable=False)  # INSERT, UPDATE, SOFT_DELETE
    table_name = Column(String, nullable=False, index=True)
    record_id = Column(String, nullable=True)
    enrollment_id = Column(String, nullable=True, index=True)
    screening_id = Column(String, nullable=True, index=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class SiteStaff(Base):
    __tablename__ = "site_staff"

    id = Column(Integer, primary_key=True, index=True)
    site_name = Column(String, index=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="screener")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


# ==========================================================
# PARTICIPANT PII (DPDP / ICMR — separate from clinical data)
# ==========================================================
class ParticipantPII(Base):
    __tablename__ = "participant_pii"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, unique=True, index=True, nullable=True)
    screening_id = Column(String, unique=True, index=True, nullable=True)
    site_name = Column(String, index=True, nullable=True)

    mother_first_name = Column(String, nullable=True)
    mother_surname = Column(String, nullable=True)
    husband_first_name = Column(String, nullable=True)
    husband_surname = Column(String, nullable=True)
    maternal_uid = Column(String, nullable=True)
    hospital_admission_number = Column(String, nullable=True)
    mother_contact = Column(String(15), nullable=True)
    husband_contact = Column(String(15), nullable=True)
    address = Column(String, nullable=True)
    email_address = Column(String, nullable=True)
    house = Column(String, nullable=True)
    city = Column(String, nullable=True)
    district = Column(String, nullable=True)
    state = Column(String, nullable=True)
    pincode = Column(String, nullable=True)
    landmark = Column(String, nullable=True)
    baby_name = Column(String, nullable=True)
    contact_mother = Column(String(15), nullable=True)
    contact_husband = Column(String(15), nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# ==========================================================
# FORM A — SCREENING
# ==========================================================
class Screening(Base):
    __tablename__ = "screenings"

    id = Column(Integer, primary_key=True, index=True)
    screening_id = Column(String, unique=True, index=True)
    enrollment_id = Column(String, index=True)

    site_name = Column(String)
    site_id = Column(String)
    screened_by = Column(String)
    screening_status = Column(String)

    mother_first_name = Column(String)
    mother_surname = Column(String)
    husband_first_name = Column(String)
    husband_surname = Column(String)

    maternal_uid = Column(String)
    hospital_admission_number = Column(String)
    mother_contact = Column(String(10), nullable=True)
    husband_contact = Column(String(10), nullable=True)

    gestation_weeks = Column(Integer)
    gestation_days = Column(Integer)
    gestation_method = Column(String)
    expected_delivery_date = Column(String)
    lmp_date = Column(String)
    inclusion_gest_lt_32 = Column(Boolean)
    anticipated_dr_resus = Column(Boolean)

    exclusion_present = Column(Boolean)
    exclusion_reasons = Column(String)
    reason_for_insufficient_time = Column(String)
    decision_forego_resuscitation_reason = Column(String)
    major_structural_anomalies_if_yes = Column(String)
    fetal_hydrops = Column(String)

    final_decision = Column(String)
    consent_given = Column(String)
    consent_taken_by = Column(String)
    consent_datetime = Column(DateTime, nullable=True)
    consent_form_version = Column(String, nullable=True)
    consent_language = Column(String, nullable=True)
    consent_obtained_by_signature = Column(String, nullable=True)
    reconsent_obtained = Column(Boolean, default=False)
    reconsent_datetime = Column(DateTime, nullable=True)
    reconsent_form_version = Column(String, nullable=True)
    relationship_to_participant = Column(String)
    relationship_other = Column(String)
    reason_not_approached = Column(String)
    reason_not_approached_other = Column(String, nullable=True)

    # Issue #1 Fix 1: reason for consent refusal (was collected by
    # ScreeningForm.jsx but silently dropped — no model/schema column existed)
    reason_for_consent_refusal = Column(String, nullable=True)
    reason_for_consent_refusal_other = Column(String, nullable=True)
    decision_forego_resuscitation_reason_other = Column(String, nullable=True)
    video_pis_shown = Column(String, nullable=True)

    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String, nullable=True)

    screening_datetime = Column(DateTime, default=utcnow)
    created_at = Column(DateTime, default=utcnow)


# ==========================================================
# FORM B — BIRTH & RESUSCITATION
# ==========================================================
class BirthResuscitation(Base):
    __tablename__ = "birth_resuscitation"

    id = Column(Integer, primary_key=True, index=True)

    screening_id = Column(String, index=True)
    enrollment_id = Column(String, unique=True, index=True)

    mother_name_first = Column(String)
    mother_name_surname = Column(String)
    maternal_uid = Column(String)

    baby_uid = Column(String, nullable=True)
    contact_mother = Column(String)
    contact_husband = Column(String)
    date_of_birth = Column(Date)
    time_of_birth = Column(Time)
    baby_admission_no = Column(String)
    baby_annual_no = Column(String, nullable=True)

    gestation_weeks = Column(Integer)
    gestation_days = Column(Integer)
    gestation_rand_weeks = Column(Integer, nullable=True)
    gestation_rand_days = Column(Integer, nullable=True)
    birth_weight = Column(Float)
    intrauterine_centile = Column(String, nullable=True)
    
    indication_for_delivery = Column(String)
    indication_for_delivery_other = Column(String, nullable=True)
    indication_edf_detail = Column(String, nullable=True)
    fetal_indication_detail = Column(String, nullable=True)
    obstetric_indication_detail = Column(String, nullable=True)
    maternal_complication = Column(String)
    delivery_mode = Column(String)
    vaginal_delivery_type = Column(String, nullable=True)
    lscs_type = Column(String, nullable=True)
    gender = Column(String)

    poor_resp_efforts = Column(Boolean)
    poor_muscle_tone = Column(Boolean)
    hr_above_100 = Column(Boolean, nullable=True)

    required_resuscitation = Column(Boolean)
    initial_steps = Column(Boolean)
    strata = Column(String, nullable=True)
    enrollment_reason_not_randomized = Column(String, nullable=True)
    enrollment_reason_not_randomized_other = Column(String, nullable=True)
    ppv_required = Column(Boolean)
    device_ppv = Column(String)
    sib_peep_with = Column(String, nullable=True)
    sib_peep_cmh2o = Column(Float, nullable=True)
    tpiece_pip = Column(Float, nullable=True)
    tpiece_peep = Column(Float, nullable=True)
    tpiece_flow = Column(Float, nullable=True)
    interface_used = Column(String, nullable=True)

    intubation = Column(Boolean)
    chest_compression = Column(Boolean)
    ppv_duration = Column(Integer)
    cc_duration = Column(Integer)

    adrenaline = Column(Boolean)
    adrenaline_dilution = Column(String, nullable=True)
    adrenaline_route = Column(String, nullable=True)
    med_doses = Column(Integer)
    adrenaline_cumulative = Column(Float, nullable=True)
    fluid_bolus = Column(Boolean)
    fluid_bolus_doses = Column(Integer, nullable=True)
    fluid_bolus_cumulative = Column(Float, nullable=True)

    placental_transfusion = Column(Boolean)
    transfusion_method = Column(String)
    cord_clamp_timestamp = Column(Time, nullable=True)
    cord_clamp_time = Column(Integer)

    time_to_respiration = Column(Integer)
    respiration_days = Column(Integer, nullable=True)
    respiration_hours = Column(Integer, nullable=True)
    # ✅ FIX C1: Removed duplicate definition - kept nullable version
    time_to_spo2_80 = Column(Integer, nullable=True)
    spo2_5min = Column(Integer)

    randomised = Column(Boolean)
    randomisation_date = Column(String)
    resus_failure = Column(Boolean)

    cord_blood_done = Column(Boolean, nullable=True)
    cord_blood_within_1hr = Column(Boolean, nullable=True)
    cord_blood_source = Column(String, nullable=True)
    cord_ph = Column(Float, nullable=True)
    cord_sbe = Column(Float, nullable=True)
    cord_pco2 = Column(Float, nullable=True)
    interventions = Column(JSON, nullable=True)
    reason_exit_trial_gas = Column(String, nullable=True)
    spo2_exit_trial_gas = Column(Float)
    total_resus_time = Column(Integer, nullable=True)
    blender_stopped = Column(Boolean, nullable=True)
    blender_stopped_description = Column(String, nullable=True)

    created_at = Column(DateTime, default=utcnow)


# ==========================================================
# FORM C — MATERNAL DETAILS (Randomized subjects only)
# ==========================================================
class MaternalDetails(Base):
    __tablename__ = "maternal_details"

    id = Column(Integer, primary_key=True, index=True)

    # ---------- IDENTIFICATION ----------
    enrollment_id = Column(String, index=True, nullable=False)
    mother_name = Column(String)
    mother_age = Column(Integer, nullable=True)
    maternal_uid = Column(String)
    contact_mother = Column(String)
    contact_husband = Column(String)
    address = Column(String)

    # ---------- OBSTETRIC HISTORY ----------
    gravida = Column(String)
    parity = Column(String)
    abortions = Column(String)
    live = Column(String)
    still = Column(String)
    booked = Column(String)
    anc_visits = Column(String)
    multiple = Column(String)

    lmp = Column(String)
    edd = Column(String)
    conception = Column(String)
    artificial_type = Column(String)
    artificial_other = Column(String)

    antenatal_steroids = Column(String)
    steroid_drug = Column(String)
    steroid_doses = Column(String)
    steroid_courses = Column(String)
    lddi_known = Column(String)
    lddi_hours = Column(String)
    antenatal_mgso4 = Column(String)
    gestation_at_steroids = Column(String)
    steroid_date = Column(Date)
    mgso4_date = Column(Date)
    mgso4_gestation_weeks = Column(Integer)
    mgso4_gestation_days = Column(Integer)

    # ---------- MATERNAL MEDICAL DISORDERS ----------
    chronic_hypertension = Column(Boolean, default=False)
    hepatitis = Column(Boolean, default=False)
    heart_disease = Column(Boolean, default=False)
    renal_disease = Column(Boolean, default=False)
    vdrl_positive = Column(Boolean, default=False)
    seizure_disorder = Column(Boolean, default=False)
    asthma = Column(Boolean, default=False)
    hiv = Column(Boolean, default=False)
    thyroid = Column(Boolean, default=False)
    tb = Column(Boolean, default=False)
    malaria = Column(Boolean, default=False)
    severe_anemia = Column(Boolean, default=False)
    other_medical_disorder = Column(String)

    # ---------- OBSTETRIC PROBLEMS ----------
    hdp = Column(String)
    hdp_type = Column(String)

    gdm = Column(String)
    gdm_rx = Column(String)

    liquor = Column(String)

    fgr = Column(String)
    fgr_centile = Column(String)
    doppler = Column(String)
    doppler_other = Column(String)

    obstetric_other = Column(String)

    placental_abnormality = Column(String)
    placental_type = Column(String)
    placental_other = Column(String)

    retroplacental_collection = Column(String)

    aph = Column(String)
    aph_type = Column(String)
    aph_other = Column(String)
    isoimmunization = Column(String, nullable=True)
    # ---------- EVIDENCE OF INFECTION ----------
    pprom = Column(String)
    pprom_duration = Column(String)
    preterm_labor = Column(String)

    triple_i = Column(String)
    maternal_fever = Column(String)
    fetal_tachycardia = Column(String)
    maternal_tlc_high = Column(String)
    maternal_tachycardia = Column(String)
    maternal_abdominal_tenderness = Column(String)
    foul_smelling_liquor = Column(String)
    maternal_uti = Column(String)
    maternal_diarrhea = Column(String)

    # ---------- INTRAPARTUM EVENTS ----------
    msl = Column(String)
    non_reactive_nst = Column(String)
    reduced_fm = Column(String)
    prolonged_labor = Column(String)

    cord_accident = Column(String)
    cord_accident_type = Column(String)

    fetal_bradycardia = Column(String)
    fetal_tachycardia_intrapartum = Column(String)

    duration_rom = Column(String)
    

    uterotonic = Column(String)
    uterotonic_timing = Column(String)

    created_at = Column(DateTime, default=utcnow)

# =========================
# FORM D — DAY 1 POSTNATAL
# =========================

class PostnatalDay1(Base):
    __tablename__ = "postnatal_day1"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=utcnow)

    # IDENTIFICATION
    enrollment_id = Column(String, index=True)
    gestation_weeks = Column(Integer, nullable=True)
    gestation_days = Column(Integer, nullable=True)
    annual_number = Column(String, nullable=True)
    baby_name = Column(String, nullable=True)
    baby_uid = Column(String, nullable=True)
    birth_weight = Column(Float, nullable=True)
    ga_method = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    growth_status = Column(String, nullable=True)
    sga_centile = Column(String, nullable=True)

    # GOLDEN HOUR
    plastic_wrap = Column(Boolean, nullable=True)
    remained_intubated = Column(Boolean, nullable=True)
    et_intubation = Column(Boolean, nullable=True)
    labored_breathing = Column(Boolean, nullable=True)

    # SURFACTANT
    surfactant_required = Column(Boolean, nullable=True)
    surfactant_indication = Column(String, nullable=True)
    cpap_cm = Column(Float, nullable=True)
    fio2_percent = Column(Float, nullable=True)
    surfactant_method = Column(String, nullable=True)
    premedication_given = Column(Boolean, nullable=True)
    premedication_drugs = Column(String, nullable=True)
    premedication_other = Column(String, nullable=True)
    lisa_catheter = Column(String, nullable=True)
    lisa_catheter_type = Column(String, nullable=True)
    device_assistance = Column(Boolean, nullable=True)
    device_type = Column(String, nullable=True)
    device_type_other = Column(String, nullable=True)
    surfactant_brand = Column(String, nullable=True)
    surfactant_brand_other = Column(String, nullable=True)
    surfactant_dose = Column(Float, nullable=True)
    adverse_effects = Column(Boolean, nullable=True)
    adverse_type = Column(String, nullable=True)
    adverse_type_other = Column(String, nullable=True)
    mode_of_support = Column(String, nullable=True)

    # EARLY RESPIRATORY SUPPORT
    early_cpap = Column(Boolean, nullable=True)
    humidified_gas = Column(Boolean, nullable=True)
    max_fio2_1hr = Column(Float, nullable=True)
    caffeine = Column(Boolean, nullable=True)
    caffeine_dose = Column(Float, nullable=True)
    caffeine_loading = Column(Boolean, nullable=True)
    caffeine_loading_abs = Column(Float, nullable=True)
    caffeine_maint_abs = Column(Float, nullable=True)
    caffeine_date = Column(Date, nullable=True)
    caffeine_time = Column(String, nullable=True)
    intubation_after_resus = Column(Boolean, nullable=True)
    immediate_kmc = Column(Boolean, nullable=True)

    # COMPLETION
    completed_by = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    signature = Column(String, nullable=True)
    completion_date = Column(Date, nullable=True)

class NICUAdmission(Base):
    __tablename__ = "nicu_admission"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, unique=True, index=True)

    baby_uid = Column(String)
    annual_number = Column(String)
    baby_name = Column(String)

    admission_datetime = Column(DateTime)
    age_at_admission_hours = Column(Float)

    temp_dr = Column(Float)
    temp_skin = Column(Float)
    temp_axillary = Column(Float)

    transport_incubator = Column(Boolean)
    transport_mode = Column(String)

    additional_heating = Column(Boolean)
    heating_type = Column(String)

    transport_adverse_event = Column(Boolean)
    adverse_event_type = Column(String)
    tube_accident_type = Column(String)

    transport_mode_resp = Column(String)
    transport_cpap = Column(Float)
    transport_pip  = Column(Float)
    transport_peep = Column(Float)
    transport_map  = Column(Float)
    transport_fio2 = Column(Float)

    nicu_mode_resp = Column(String)
    nicu_cpap = Column(Float)
    nicu_pip  = Column(Float)
    nicu_peep = Column(Float)
    nicu_map  = Column(Float)
    nicu_fio2 = Column(Float)

    completed_by = Column(String)
    designation = Column(String)
    signature = Column(String)
    completion_date = Column(Date)

    # ── Shared "Day 1" anchor for daily/NICU-day forms (e.g. Resp/CV/Neuro log) ──
    # Set once (defaults from date of birth), then locked once any daily data exists.
    day1_date         = Column(Date, nullable=True)
    day1_date_set_by  = Column(String, nullable=True)
    day1_date_set_at  = Column(DateTime, nullable=True)



# ==========================================================
# FORM F — NEONATAL MORBIDITIES MODEL
# ==========================================================

class NeonatalMorbidities(Base):
    __tablename__ = "neonatal_morbidities"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True)

    ivh = Column(Boolean)
    ivh_side = Column(String)
    ivh_grade = Column(String)
    ivh_date = Column(Date)
    ivh_age_days = Column(Integer)
    pvhi = Column(Boolean)
    phh = Column(Boolean)
    vp_shunt = Column(Boolean)

    pvl = Column(Boolean)
    pvl_side = Column(String)
    pvl_grade = Column(String)
    pvl_date = Column(Date)

    ventriculomegaly = Column(Boolean)
    ventriculomegaly_severity = Column(String)
    max_vi_mm = Column(Float)
    ahw_mm = Column(Float)
    tod_mm = Column(Float)
    aca_ri = Column(Float)
    mca_ri = Column(Float)

    seizures = Column(Boolean)
    seizure_date = Column(Date)
    seizure_type = Column(String)
    eeg = Column(String)
    aeds_required = Column(Boolean)
    aed_name = Column(String)
    seizure_etiology = Column(String)

    non_ivh_ich = Column(Boolean)
    non_ivh_ich_type = Column(String)

    meningitis = Column(Boolean)
    meningitis_type = Column(String)
    meningitis_date = Column(Date)
    csf_culture = Column(String)
    csf_organism = Column(String)

    bpd = Column(Boolean)
    bpd_grade = Column(String)
    oxygen_days = Column(Integer)
    vent_days = Column(Integer)
    cpap_days = Column(Integer)

    pulmonary_hemorrhage = Column(Boolean)
    pneumothorax = Column(Boolean)
    pneumothorax_side = Column(String)
    chest_drain = Column(Boolean)
    pulmonary_htn = Column(Boolean)

    apnea = Column(Boolean)
    apnea_onset_days = Column(Integer)
    caffeine = Column(Boolean)
    caffeine_duration_days = Column(Integer)

    postnatal_steroids = Column(Boolean)
    steroid_drug = Column(String)
    steroid_age_days = Column(Integer)
    steroid_dose_mgkg = Column(Float)
    steroid_indication = Column(String)

    feed_intolerance = Column(Boolean)
    nec = Column(Boolean)
    nec_stage = Column(String)
    nec_date = Column(Date)
    nec_surgery = Column(Boolean)

    pn = Column(Boolean)
    pn_days = Column(Integer)
    cholestasis = Column(Boolean)
    max_direct_bilirubin = Column(Float)

    hs_pda = Column(Boolean)
    pda_diagnosed_by = Column(String)
    pda_treatment = Column(String)
    pda_ligation = Column(Boolean)

    shock = Column(Boolean)
    hypotension = Column(Boolean)
    inotropes = Column(Boolean)

    sepsis = Column(Boolean)
    sepsis_type = Column(String)
    sepsis_episodes = Column(Integer)

    total_los_days = Column(Integer)
    nicu_days = Column(Integer)
    discharge_weight = Column(Float)
    discharge_date = Column(Date)
    outcome = Column(String)
    back_referred_hospital = Column(String)

    completed_by = Column(String)
    signature = Column(String)
    completion_date = Column(Date)

    created_at = Column(DateTime, default=utcnow)

# ==========================================================
# FORM G — STUDY OUTCOMES
# ==========================================================

class StudyOutcomes(Base):
    __tablename__ = "study_outcomes"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True)
    baby_uid = Column(String)

    gestation_weeks = Column(Integer)
    birth_weight = Column(Float)

    # Mortality
    mortality_in_hospital = Column(Boolean)
    mortality_after_discharge = Column(Boolean)
    mortality_7_days = Column(Boolean)
    mortality_28_days = Column(Boolean)
    age_at_death = Column(String)

    # BPD
    bpd_jensen = Column(Boolean)
    bpd_nichd = Column(Boolean)

    # Brain & ROP
    abnormal_mri = Column(Boolean)
    rop_44w = Column(Boolean)
    rop_treated = Column(Boolean)
    rop_age_at_dx = Column(String)

    # NEC & Brain injury
    nec_stage_2 = Column(Boolean)
    nec_surgery = Column(Boolean)
    brain_injury = Column(Boolean)

    # Delivery room outcomes
    switched_100_o2 = Column(Boolean)
    cc_epi_volume = Column(Boolean)
    ventilation_required = Column(Boolean)
    time_to_spontaneous_breathing = Column(Integer)

    # FiO2 (0–10 min)
    fio2_0 = Column(Integer)
    fio2_1 = Column(Integer)
    fio2_2 = Column(Integer)
    fio2_3 = Column(Integer)
    fio2_4 = Column(Integer)
    fio2_5 = Column(Integer)
    fio2_6 = Column(Integer)
    fio2_7 = Column(Integer)
    fio2_8 = Column(Integer)
    fio2_9 = Column(Integer)
    fio2_10 = Column(Integer)

    # Other outcomes
    intubation_during_resus = Column(Boolean)
    hie_grade = Column(String)

    resp_support_72h = Column(Boolean)
    mv_days = Column(Integer)
    cpap_days = Column(Integer)
    niv_days = Column(Integer)
    hfnc_days = Column(Integer)

    sepsis_72h = Column(Boolean)
    sepsis_overall = Column(Boolean)

    # Completion
    completed_by = Column(String)
    designation = Column(String)
    signature = Column(String)
    completion_date = Column(Date)

    created_at = Column(DateTime, default=utcnow)

class CranialUltrasound(Base):
    __tablename__ = "cranial_ultrasound"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True)

    gestation_weeks = Column(Integer)
    birth_weight = Column(String)
    dob = Column(String)

    worst_ivh_grade = Column(String)
    ivh_side = Column(String)
    ivh_date = Column(String)
    ivh_dol = Column(String)
    ivh_pma = Column(String)

    phvd = Column(String)
    phvd_date = Column(String)

    vp_shunt = Column(String)
    vp_shunt_date = Column(String)

    cpvl_grade = Column(String)
    cpvl_side = Column(String)
    cpvl_date = Column(String)
    cpvl_dol = Column(String)
    cpvl_pma = Column(String)

    other_findings = Column(String)
    brain_injury_composite = Column(String)

    completed_by = Column(String)
    designation = Column(String)
    signature = Column(String)
    completion_date = Column(String)

    scans = Column(JSON)

    created_at = Column(DateTime, default=utcnow)



# ==========================================================
# FORM I — ROP SCREENING
# ==========================================================

class ROPScreening(Base):
    __tablename__ = "rop_screening"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True)

    gestation_weeks = Column(Integer, nullable=True)
    birth_weight = Column(Float, nullable=True)
    dob = Column(Date, nullable=True)

    # Risk factors
    risk_factors = Column(JSON)  # ["O2 Therapy", "Sepsis", "IVH", ...]

    # Repeatable screening visits (max 12)
    screenings = Column(JSON)
    """
    [
      {
        screening_no: 1,
        date: "2026-01-01",
        dol: 14,
        pma: "32+1",
        re_stage: "2",
        re_zone: "II",
        le_stage: "1",
        le_zone: "II",
        plus_status: "None / Plus / A-ROP",
        next_review: "1 week",
        signature: "Dr X"
      }
    ]
    """

    # Worst disease summary
    worst_stage = Column(String, nullable=True)
    worst_zone = Column(String, nullable=True)
    plus_disease = Column(Boolean, nullable=True)
    a_rop = Column(Boolean, nullable=True)

    # Treatment
    treatment_required = Column(Boolean, nullable=True)
    treatment_type = Column(JSON)  # ["Laser", "Anti-VEGF"]
    anti_vegf_agent = Column(String, nullable=True)
    treatment_re_date = Column(Date, nullable=True)
    treatment_le_date = Column(Date, nullable=True)
    bilateral_treatment = Column(Boolean, nullable=True)
    pma_at_treatment = Column(String, nullable=True)

    # Outcome
    outcome = Column(String, nullable=True)
    final_screening_date = Column(Date, nullable=True)
    pma_discharge = Column(String, nullable=True)
    rop_treatment_composite = Column(Boolean, nullable=True)

    # Completion
    completed_by = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    signature = Column(String, nullable=True)
    completion_date = Column(Date, nullable=True)

    created_at = Column(DateTime, default=utcnow)


# ==========================================================
# FORM J — COMPOSITE OUTCOME ASSESSMENT
# ==========================================================

class CompositeOutcome(Base):
    __tablename__ = "composite_outcomes"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True, nullable=False)

    gestation_at_birth = Column(Integer)
    dob = Column(Date)

    # ================= 36 WEEKS =================
    assess_36_date = Column(Date)
    assess_36_method = Column(String)
    actual_pma_36_weeks = Column(Integer)
    actual_pma_36_days = Column(Integer)

    death_before_36 = Column(Boolean)
    death_36_date = Column(Date)
    death_36_age_days = Column(Integer)
    death_36_cause = Column(String)

    # Issue #1 Fix 3: reason for missed follow-up at 36 weeks PMA
    ltfu_reason_36 = Column(String, nullable=True)

    resp_support_36 = Column(String)
    bpd_jensen_grade = Column(String)

    radiographic_lung_disease = Column(Boolean)
    fio2_36 = Column(Float)
    flow_rate_36 = Column(Float)
    bpd_nichd_grade = Column(String)

    composite_36 = Column(Boolean)

    # ================= 40 WEEKS =================
    assess_40_date = Column(Date)
    assess_40_method = Column(String)
    actual_pma_40_weeks = Column(Integer)
    actual_pma_40_days = Column(Integer)

    death_36_40 = Column(Boolean)
    death_40_date = Column(Date)
    death_40_age_days = Column(Integer)
    death_40_cause = Column(String)

    # Issue #1 Fix 3: reason for missed follow-up at 40 weeks PMA
    ltfu_reason_40 = Column(String, nullable=True)

    rop_any = Column(Boolean)
    rop_stage = Column(String)
    rop_zone = Column(String)
    rop_plus = Column(Boolean)
    a_rop = Column(Boolean)
    rop_treatment = Column(Boolean)
    rop_treatment_type = Column(String)
    rop_bilateral = Column(Boolean)
    rop_rx = Column(Boolean)

    nec_dx = Column(Boolean)
    nec_date = Column(Date)
    nec_stage = Column(String)
    nec_surgery = Column(Boolean)
    nec_stage_ge_2a = Column(Boolean)

    ivh_dx = Column(Boolean)
    ivh_grade = Column(String)
    ivh_ge_3 = Column(Boolean)

    cpvl_dx = Column(Boolean)
    cpvl_grade = Column(String)
    cpvl_ge_2 = Column(Boolean)

    composite_40 = Column(Boolean)

    # ================= 44 WEEKS =================
    assess_44_date = Column(Date)
    assess_44_method = Column(String)
    actual_pma_44_weeks = Column(Integer)
    actual_pma_44_days = Column(Integer)

    death_40_44 = Column(Boolean)
    death_44_date = Column(Date)
    death_44_age_days = Column(Integer)
    death_44_cause = Column(String)

    # Issue #1 Fix 3: reason for missed follow-up at 44 weeks PMA
    ltfu_reason_44 = Column(String, nullable=True)

    new_rop = Column(Boolean)
    additional_rop_rx = Column(Boolean)
    additional_rop_rx_type = Column(String)

    new_nec = Column(Boolean)
    new_nec_stage = Column(String)

    new_ivh = Column(Boolean)
    new_ivh_grade = Column(String)

    new_cpvl = Column(Boolean)
    new_cpvl_grade = Column(String)

    composite_44 = Column(Boolean)

    # ================= MRI =================
    mri_subset = Column(Boolean)
    mri_date = Column(Date)
    mri_weeks = Column(Integer)
    mri_days = Column(Integer)
    scanner = Column(String)
    sedation = Column(Boolean)
    sedation_agent = Column(String)
    sequences = Column(JSON)

    overall_mri = Column(String)
    mri_summary = Column(String)

    # ================= FINAL =================
    final_composite_36 = Column(Boolean)
    final_composite_44 = Column(Boolean)
    mri_abnormal = Column(Boolean)

    completed_by = Column(String)
    designation = Column(String)
    signature = Column(String)
    completion_date = Column(Date)

    created_at = Column(DateTime, default=utcnow)

# ==========================================================
# HELPER FORM — FiO2 LOGGING (AUC CALCULATION)
# ==========================================================

class FiO2AUC(Base):
    __tablename__ = "fio2_auc_logs"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True, nullable=False)

    dob = Column(Date)
    gestation_weeks = Column(Integer)

    # 6-hourly records for 7 days (stored as JSON)
    # Each entry: { day, block, fio2, mode }
    fio2_logs = Column(JSON)

    # ================= DERIVED =================
    total_auc = Column(Float)              # Σ (FiO2 × hours)
    mean_daily_fio2 = Column(Float)        # Mean FiO2 over 7 days
    excess_o2_auc = Column(Float)           # Total AUC - (0.21 × 168)

    completed_by = Column(String)
    designation = Column(String)
    signature = Column(String)
    completion_date = Column(Date)

    created_at = Column(DateTime, default=utcnow)


# ==========================================================
# HELPER FORM VS6.1 — RESP / CV / NEURO DAILY LOG
# ==========================================================

class RespCVNeuroLog(Base):
    __tablename__ = "resp_cv_neuro_logs"

    id = Column(Integer, primary_key=True, index=True)

    enrollment_id = Column(String, index=True, nullable=False)

    gestation = Column(String)
    mother_name = Column(String)
    maternal_uid = Column(String)

    # Main grid data (31 days × parameters)
    daily_log = Column(JSON)

    completed_by = Column(String)
    designation = Column(String)
    signature = Column(String)
    completion_date = Column(Date)

    created_at = Column(DateTime, default=utcnow)


class InfectGIHemaLog(Base):
    __tablename__ = "infect_gi_hema_log"

    id = Column(Integer, primary_key=True, index=True)

    enrollment_id = Column(String, index=True, nullable=False)
    gestation = Column(String, nullable=True)
    mother_name = Column(String, nullable=True)
    maternal_uid = Column(String, nullable=True)

    daily_log = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(
        DateTime,
        default=utcnow,
        onupdate=utcnow
    )

class MetabRenalVascEyeLog(Base):
    __tablename__ = "metab_renal_vasc_eye_log"

    id = Column(Integer, primary_key=True, index=True)

    enrollment_id = Column(String, index=True, nullable=False)
    gestation = Column(String, nullable=True)
    mother_name = Column(String, nullable=True)
    maternal_uid = Column(String, nullable=True)

    daily_log = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(
        DateTime,
        default=utcnow,
        onupdate=utcnow
    )

class SAEReport(Base):
    __tablename__ = "sae_reports"

    id = Column(Integer, primary_key=True, index=True)

    # I. Event Identification
    study_id = Column(String, nullable=True)
    enrollment_id = Column(String, index=True, nullable=False)
    report_type = Column(String, nullable=False)  # Initial / Follow-up / Final
    report_date = Column(String, nullable=False)

    # II. Event Description
    diagnosis = Column(String, nullable=False)
    onset_datetime = Column(String, nullable=False)
    end_datetime = Column(String, nullable=True)
    ongoing = Column(Boolean, default=False)

    # III. Seriousness criteria (multiple)
    seriousness = Column(JSON, nullable=False)  # list of criteria

    # IV–VII
    severity = Column(String, nullable=False)
    causality = Column(String, nullable=False)
    action_taken = Column(String, nullable=False)
    outcome = Column(String, nullable=False)
    date_of_death = Column(String, nullable=True)

    # VIII. Narrative
    narrative = Column(String, nullable=False)

    # IX. Reporter
    reporter_name = Column(String, nullable=False)
    reporter_designation = Column(String, nullable=False)
    reporter_contact = Column(String, nullable=True)
    reporter_date = Column(String, nullable=False)
    reporter_signature = Column(String, nullable=True)

    # X. Investigator verification
    investigator_name = Column(String, nullable=True)
    investigator_signature = Column(String, nullable=True)
    investigator_date = Column(String, nullable=True)
    site = Column(String, nullable=True)

    created_at = Column(DateTime, default=utcnow) 

class AdverseEvents(Base):
    __tablename__ = "adverse_events"

    id = Column(Integer, primary_key=True, index=True)

    enrollment_id = Column(String, index=True, nullable=False)
    mother_name = Column(String, nullable=True)
    baby_uid = Column(String, nullable=True)
    maternal_uid = Column(String, nullable=True)

    has_adverse_event = Column(Boolean, nullable=False)

    events = Column(JSON, nullable=True)  # list of AE rows

    completed_by = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    completion_date = Column(String, nullable=True)

    created_at = Column(DateTime, default=utcnow)  

class SAEList(Base):
    __tablename__ = "sae_list"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True, nullable=False)

    rows = Column(JSON, nullable=False)

    completed_by = Column(String)
    designation = Column(String)
    completion_date = Column(String)

    created_at = Column(DateTime, default=utcnow)         

class RespiratoryLog(Base):
    __tablename__ = "respiratory_logs"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String)
    date = Column(Date)
    support_mode = Column(String)  # CPAP / NIPPV / IMV    
    steroid_age_days = Column(Integer, nullable=True)

class SteroidData(Base):
    __tablename__ = "steroid_data"

    id = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True)
    steroid_age_days = Column(Integer)    
    pulmonary_hemorrhage = Column(String)
    pulmonary_hypertension = Column(String)
    pneumothorax = Column(String)
    chest_drain = Column(String)
# ─────────────────────────────────────────────────────────────
# Add this class to models.py
# Replaces the old RespCVNeuroLog JSON blob with per-day,
# per-field structured columns matching the new frontend.
# ─────────────────────────────────────────────────────────────

class RespCVNeuroDayLog(Base):
    __tablename__ = "resp_cv_neuro_day_logs"

    id            = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True, nullable=False)
    nicu_day      = Column(Integer, nullable=False, index=True)  # 1, 2, 3 …

    # ── 2.1 WEIGHT ────────────────────────────────────────────
    weight_kg           = Column(String, nullable=True)

    # ── RESPIRATORY ──────────────────────────────────────────
    respiratory_support = Column(Boolean, nullable=True)   # #1
    endotracheal_intubation = Column(Boolean, nullable=True)  # #2
    support_modes      = Column(String, nullable=True)   # "NC, HFNC, CPAP"  #3
    map_cpap           = Column(Float,  nullable=True)   # cm H2O  #4
    max_fio2           = Column(Float,  nullable=True)   # %  #5
    max_flow           = Column(Float,  nullable=True)   # L/min  #6

    supp_o2            = Column(Boolean, nullable=True)  # #7
    lowest_ph           = Column(String, nullable=True)  # #8
    pao2_range           = Column(String, nullable=True)  # #9
    paco2_range          = Column(String, nullable=True)  # #10
    surfactant         = Column(Boolean, nullable=True)  # #11
    caffeine           = Column(Boolean, nullable=True)  # #12
    apnea_count               = Column(String, nullable=True)  # #13
    desaturation_count        = Column(String, nullable=True)  # #14
    severe_desaturation_count = Column(String, nullable=True)  # #15
    extub_attempted    = Column(Boolean, nullable=True)  # #16
    extub_failure      = Column(Boolean, nullable=True)  # #17
    pulm_hemorrhage    = Column(Boolean, nullable=True)  # #18
    pneumothorax       = Column(Boolean, nullable=True)  # #19
    chest_drain        = Column(Boolean, nullable=True)  # #20
    pphn               = Column(Boolean, nullable=True)  # #21
    postnatal_steroids = Column(Boolean, nullable=True)  # #22

    # Legacy — superseded by apnea_count / desaturation_count
    apnea              = Column(Boolean, nullable=True)
    desaturations      = Column(Boolean, nullable=True)

    # ── CARDIOVASCULAR ───────────────────────────────────────
    pda_suspected      = Column(Boolean, nullable=True)  # #23
    echo_done          = Column(Boolean, nullable=True)  # #24
    hs_pda             = Column(Boolean, nullable=True)  # #25
    shock              = Column(Boolean, nullable=True)  # #26
    vasoactive_support = Column(Boolean, nullable=True)  # #27
    vasoactive_drugs   = Column(String,  nullable=True)  # "Dopamine, Dobutamine"  #28
    fluid_bolus        = Column(String,  nullable=True)  # #29

    # Legacy — no longer part of the numbered sequence
    pda_medical_rx     = Column(Boolean, nullable=True)

    # ── NEUROLOGICAL ─────────────────────────────────────────
    cranial_usg          = Column(Boolean, nullable=True)  # #30
    ivh                  = Column(Boolean, nullable=True)  # #31
    ivh_grade            = Column(String,  nullable=True)  # "I","II","III","IV"
    cpvl_confirmed       = Column(Boolean, nullable=True)  # #32
    ventriculomegaly     = Column(Boolean, nullable=True)  # #33
    clinical_seizures    = Column(Boolean, nullable=True)  # #34
    eeg_seizures         = Column(Boolean, nullable=True)  # #35
    aeds_given           = Column(Boolean, nullable=True)  # #36
    non_ivh_ich          = Column(Boolean, nullable=True)  # #37

    # Legacy — no longer part of the numbered sequence
    pvl_suspected        = Column(Boolean, nullable=True)
    meningitis_suspected = Column(Boolean, nullable=True)

    # ── SUBMISSION WORKFLOW ───────────────────────────────────
    submission_status = Column(String,  nullable=True, default="empty")
    # "empty" | "draft" | "complete" | "submitted" | "late"
    saved_at    = Column(DateTime, nullable=True)
    saved_by    = Column(String,   nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    submitted_by = Column(String,   nullable=True)

    # ── SITE-MONITOR OVERRIDE (temporary reopen of a locked/past day) ──
    override_unlocked_until = Column(DateTime, nullable=True)
    override_reason         = Column(Text, nullable=True)
    override_by             = Column(String, nullable=True)

    created_at  = Column(DateTime, default=utcnow)
    updated_at  = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        # one row per enrollment+day
        __import__('sqlalchemy').UniqueConstraint(
            'enrollment_id', 'nicu_day', name='uq_resp_cv_neuro_enrollment_day'
        ),
    )
# ─────────────────────────────────────────────────────────────
# Add this class to models.py
# Place after the existing RespCVNeuroDayLog class
# ─────────────────────────────────────────────────────────────
from sqlalchemy import UniqueConstraint

class InfectGIHemaDayLog(Base):
    __tablename__ = "infect_gi_hema_day_logs"

    id            = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True, nullable=False)
    nicu_day      = Column(Integer, nullable=False, index=True)

    # ── INFECTION ────────────────────────────────────────────
    sepsis_suspected        = Column(Boolean, nullable=True)
    blood_culture_sent      = Column(Boolean, nullable=True)
    blood_culture_positive  = Column(Boolean, nullable=True)
    eos                     = Column(Boolean, nullable=True)
    los                     = Column(Boolean, nullable=True)
    antibiotics             = Column(Boolean, nullable=True)
    antibiotic_day          = Column(Boolean, nullable=True)
    lp_done                 = Column(Boolean, nullable=True)
    csf_culture_positive    = Column(Boolean, nullable=True)
    clabsi                  = Column(Boolean, nullable=True)
    vap                     = Column(Boolean, nullable=True)

    # ── GASTROINTESTINAL ─────────────────────────────────────
    npo                     = Column(Boolean, nullable=True)
    enteral_feeds_started   = Column(Boolean, nullable=True)
    feed_volume             = Column(Float,   nullable=True)   # ml/kg/day
    full_feeds              = Column(Boolean, nullable=True)
    parenteral_nutrition    = Column(Boolean, nullable=True)
    probiotic               = Column(Boolean, nullable=True)
    feed_intolerance        = Column(Boolean, nullable=True)
    nec_suspected           = Column(Boolean, nullable=True)
    nec_confirmed_stage     = Column(String,  nullable=True)   # "Stage I/II/III"
    nec_surgery             = Column(Boolean, nullable=True)

    # ── HEMATOLOGY ───────────────────────────────────────────
    jaundice                = Column(Boolean, nullable=True)
    phototherapy            = Column(Boolean, nullable=True)
    peak_tsb                = Column(Float,   nullable=True)   # mg/dL
    exchange_transfusion    = Column(Boolean, nullable=True)
    prbc_transfusion        = Column(Boolean, nullable=True)
    platelet_transfusion    = Column(Boolean, nullable=True)
    ffp_cryo                = Column(Boolean, nullable=True)

    # ── SUBMISSION WORKFLOW ───────────────────────────────────
    submission_status = Column(String,   nullable=True, default="empty")
    saved_at          = Column(DateTime, nullable=True)
    saved_by          = Column(String,   nullable=True)
    submitted_at      = Column(DateTime, nullable=True)
    submitted_by      = Column(String,   nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint(
            'enrollment_id', 'nicu_day',
            name='uq_infect_gi_hema_enrollment_day'
        ),
    )
class MetabRenalVascEyeDayLog(Base):
    __tablename__ = "metab_renal_vasc_eye_day_logs"
 
    id            = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, index=True, nullable=False)
    nicu_day      = Column(Integer, nullable=False, index=True)
 
    # ── METABOLIC ────────────────────────────────────────────
    hypoglycemia           = Column(Boolean, nullable=True)
    hypoglycemia_rx        = Column(Boolean, nullable=True)
    hyperglycemia          = Column(Boolean, nullable=True)
    insulin                = Column(Boolean, nullable=True)
    metabolic_acidosis     = Column(Boolean, nullable=True)
    dyselectrolytemia      = Column(Boolean, nullable=True)
    dyselectrolytemia_type = Column(String,  nullable=True)  # "Na,K,Ca"
    osteopenia_suspected   = Column(Boolean, nullable=True)
 
    # ── RENAL ─────────────────────────────────────────────────
    aki_suspected          = Column(Boolean, nullable=True)
    aki_kdigo_stage        = Column(String,  nullable=True)  # "Stage 1/2/3"
    creatinine             = Column(Float,   nullable=True)  # mg/dL
    urine_output_low       = Column(Boolean, nullable=True)
    dialysis_crrt          = Column(Boolean, nullable=True)
 
    # ── THERMOREGULATION ─────────────────────────────────────
    hypothermia            = Column(Boolean, nullable=True)
    hyperthermia           = Column(Boolean, nullable=True)
 
    # ── VASCULAR ACCESS ───────────────────────────────────────
    picc_in_situ           = Column(Boolean, nullable=True)
    uvc_in_situ            = Column(Boolean, nullable=True)
    uac_in_situ            = Column(Boolean, nullable=True)
    peripheral_iv          = Column(Boolean, nullable=True)
    peripheral_arterial    = Column(Boolean, nullable=True)
    extravasation_injury   = Column(Boolean, nullable=True)
    line_complication      = Column(Boolean, nullable=True)
 
    # ── OPHTHALMOLOGY ─────────────────────────────────────────
    rop_screening_due      = Column(Boolean, nullable=True)
    rop_screened           = Column(Boolean, nullable=True)
    rop_detected           = Column(Boolean, nullable=True)
    rop_stage              = Column(String,  nullable=True)  # "Stage 1"–"Stage 5"
    plus_disease           = Column(Boolean, nullable=True)
    rop_treatment          = Column(Boolean, nullable=True)
 
    # ── WORKFLOW ──────────────────────────────────────────────
    submission_status = Column(String,   nullable=True, default="empty")
    saved_at          = Column(DateTime, nullable=True)
    saved_by          = Column(String,   nullable=True)
    submitted_at      = Column(DateTime, nullable=True)
    submitted_by      = Column(String,   nullable=True)
 
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
 
    __table_args__ = (
        UniqueConstraint(
            'enrollment_id', 'nicu_day',
            name='uq_metab_renal_vasc_eye_enrollment_day'
        ),
    )
 
# ============================================================================
# FORM H — CranialUSGRecord MODEL
# Add this class to models.py
# ============================================================================

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy import UniqueConstraint

class CranialUSGRecord(Base):
    __tablename__ = "cranial_usg_records"

    id            = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, unique=True, index=True, nullable=False)

    # ── Scan entries — stored as JSON array ──────────────────
    # Each element: { _id, scanNumber, scanDate, sonographer,
    #   ivhGradeRight, ivhGradeLeft, cpvlGradeRight, cpvlGradeLeft,
    #   findings, dol, pma }
    scan_entries  = Column(JSON, nullable=True, default=list)

    # ── Post-hemorrhagic complications ───────────────────────
    phvd                   = Column(Boolean, nullable=True)
    phvd_diagnosis_date    = Column(String,  nullable=True)
    vp_shunt               = Column(Boolean, nullable=True)
    vp_shunt_insertion_date= Column(String,  nullable=True)

    # ── Other findings ───────────────────────────────────────
    ventriculomegaly       = Column(Boolean, nullable=True)
    subependymal_cyst      = Column(Boolean, nullable=True)
    choroid_plexus_cyst    = Column(Boolean, nullable=True)
    cerebellar_hemorrhage  = Column(Boolean, nullable=True)
    subdural_hemorrhage    = Column(Boolean, nullable=True)
    other_finding          = Column(Boolean, nullable=True)
    other_finding_text     = Column(String,  nullable=True)

    # ── Auto-calculated composite ─────────────────────────────
    brain_injury_composite = Column(Boolean, nullable=True)

    # ── Schedule & workflow ───────────────────────────────────
    schedule_key      = Column(String,   nullable=True)  # "lt28" | "w28_31"
    submission_status = Column(String,   nullable=True, default="draft")
    saved_at          = Column(String,   nullable=True)
    saved_by          = Column(String,   nullable=True)
    submitted_at      = Column(String,   nullable=True)
    submitted_by      = Column(String,   nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
 

# ============================================================================
# FORM K — MRI Brain Assessment
# ============================================================================
class MRIBrainAssessment(Base):
    __tablename__ = "mri_brain_assessments"

    id            = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, unique=True, index=True, nullable=False)

    # K.1 Identification
    dob             = Column(String,  nullable=True)
    gestation_weeks = Column(Integer, nullable=True)
    gestation_days  = Column(Integer, nullable=True)
    mri_date        = Column(String,  nullable=True)
    pma_weeks       = Column(Integer, nullable=True)
    pma_days        = Column(Integer, nullable=True)

    # K.1 Subset selection
    selected_for_mri = Column(Boolean, nullable=True)

    # K.2 MRI Details
    scanner       = Column(String,  nullable=True)   # "3T Philips" | "Equivalent 3T"
    sedation      = Column(Boolean, nullable=True)
    sedation_agent = Column(String, nullable=True)
    sequences     = Column(JSON,    nullable=True, default=list)  # ["DWI","T2",...]

    # K.3 Findings — stored as JSON objects
    # Each: { present: bool, type: [], site: [], location: [], details: "" }
    myelination     = Column(String,  nullable=True)   # "Appropriate for age" | "Delayed"
    bg_thalamus     = Column(JSON,    nullable=True)
    plic            = Column(JSON,    nullable=True)
    white_matter    = Column(JSON,    nullable=True)
    corpus_callosum = Column(JSON,    nullable=True)
    cerebellum      = Column(JSON,    nullable=True)
    atrophy         = Column(JSON,    nullable=True)
    hemorrhage_swi  = Column(JSON,    nullable=True)

    # K.4 Overall result
    overall_mri      = Column(String, nullable=True)   # "Normal" | "Abnormal"
    mri_summary      = Column(String, nullable=True)
    radiologist_name = Column(String, nullable=True)
    radiologist_date = Column(String, nullable=True)

    # Footer
    completed_by    = Column(String,  nullable=True)
    designation     = Column(String,  nullable=True)
    completion_date = Column(String,  nullable=True)

    # Workflow
    submission_status = Column(String,   nullable=True, default="draft")
    saved_at          = Column(String,   nullable=True)
    saved_by          = Column(String,   nullable=True)
    submitted_at      = Column(String,   nullable=True)
    submitted_by      = Column(String,   nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# ============================================================================
# FORM L — Blender Data and Study Summary
# ============================================================================
class BlenderStudySummary(Base):
    __tablename__ = "blender_study_summaries"

    id            = Column(Integer, primary_key=True, index=True)
    enrollment_id = Column(String, unique=True, index=True, nullable=False)

    # L.1 Identification
    dob             = Column(String,  nullable=True)
    gestation_weeks = Column(Integer, nullable=True)
    gestation_days  = Column(Integer, nullable=True)
    pma_weeks       = Column(Integer, nullable=True)
    pma_days        = Column(Integer, nullable=True)
    mother_name     = Column(String,  nullable=True)
    baby_name       = Column(String,  nullable=True)

    # L.2 Blender Details
    initial_fio2          = Column(Float,   nullable=True)   # %
    exit_fio2             = Column(Float,   nullable=True)   # %
    max_fio2_first_hour   = Column(Float,   nullable=True)   # %
    fio2_per_minute       = Column(JSON,    nullable=True, default=list)  # [val_0, val_1, ... val_10]

    # L.3 Composite Outcomes
    # True = Yes, False = No, None = not set, "na" = N/A
    composite_outcome_1 = Column(String, nullable=True)  # stored as "yes"/"no"/"na"
    composite_outcome_2 = Column(String, nullable=True)
    mri_abnormality     = Column(String, nullable=True)

    # Footer
    completed_by    = Column(String,  nullable=True)
    designation     = Column(String,  nullable=True)
    completion_date = Column(String,  nullable=True)

    # Workflow
    submission_status = Column(String,   nullable=True, default="draft")
    saved_at          = Column(String,   nullable=True)
    saved_by          = Column(String,   nullable=True)
    submitted_at      = Column(String,   nullable=True)
    submitted_by      = Column(String,   nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)