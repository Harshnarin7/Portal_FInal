from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict
from datetime import datetime, date, time



# =============================================================================
# ✅ FIX C4: NEW SCHEMAS FOR DICT ENDPOINTS
# =============================================================================

# =========================================================================
# RESPIRATORY LOG SCHEMAS
# =========================================================================

class RespiratoryLogCreate(BaseModel):
    """Schema for single respiratory log entry"""
    enrollment_id: str
    date: date
    support_mode: str  # CPAP, NIPPV, IMV, HFNC, NASAL_CANNULA, NC, EXTUBATION_FAILURE
    
    @field_validator("support_mode")
    @classmethod
    def validate_support_mode(cls, v):
        """Validate respiratory support mode"""
        valid_modes = {
            "CPAP", "NIPPV", "IMV", "SIMV", "HFOV",
            "HFNC", "NASAL_CANNULA", "NC", "EXTUBATION_FAILURE"
        }
        if v.upper() not in valid_modes:
            raise ValueError(f"Support mode must be one of: {', '.join(valid_modes)}")
        return v.upper()


class RespiratoryLogBulkCreate(BaseModel):
    """Schema for bulk respiratory log upload"""
    enrollment_id: str
    logs: List[Dict]  # List of {"date": "2026-01-01", "support_mode": "CPAP"}
    steroid_age_days: Optional[int] = None
    
    @field_validator("logs")
    @classmethod
    def validate_logs(cls, v):
        """Validate logs list"""
        if not v:
            raise ValueError("logs cannot be empty")
        if len(v) > 365:  # Max 1 year of daily logs
            raise ValueError("logs cannot exceed 365 entries")
        return v


# =========================================================================
# STEROID DATA SCHEMA
# =========================================================================

class SteroidDataCreate(BaseModel):
    """Schema for steroid treatment data"""
    enrollment_id: str
    steroid_age_days: Optional[int] = None
    pulmonary_hemorrhage: Optional[str] = None
    pulmonary_hypertension: Optional[str] = None
    pneumothorax: Optional[str] = None
    chest_drain: Optional[str] = None
    
    @field_validator("steroid_age_days")
    @classmethod
    def validate_age(cls, v):
        """Age in days should be positive"""
        if v is not None and v < 0:
            raise ValueError("steroid_age_days must be positive")
        if v is not None and v > 365:
            raise ValueError("steroid_age_days cannot exceed 365 days")
        return v


# =========================================================================
# FIREBASE IMPORT SCHEMA
# =========================================================================

class FirebaseScreeningImportCreate(BaseModel):
    """Schema for importing screening data from Firebase"""
    screening_id: str
    site_name: str
    site_id: str
    screened_by: str
    
    mother_first_name: str
    mother_surname: Optional[str] = None
    husband_first_name: Optional[str] = None
    husband_surname: Optional[str] = None
    
    maternal_uid: Optional[str] = None
    hospital_admission_number: Optional[str] = None
    
    gestation_weeks: int
    gestation_days: int
    expected_delivery_date: Optional[date] = None
    
    exclusion_present: bool
    exclusion_reasons: Optional[str] = None
    
    consent_given: Optional[str] = None
    consent_taken_by: Optional[str] = None
    relationship_to_participant: Optional[str] = None
    relationship_other: Optional[str] = None
    reason_not_approached: Optional[str] = None
    
    @field_validator("gestation_weeks")
    @classmethod
    def validate_gestation_weeks(cls, v):
        """Validate gestation weeks (18-42 weeks typical)"""
        if not 18 <= v <= 42:
            raise ValueError("gestation_weeks must be between 18 and 42")
        return v
    
    @field_validator("gestation_days")
    @classmethod
    def validate_gestation_days(cls, v):
        """Validate gestation days (0-6)"""
        if not 0 <= v <= 6:
            raise ValueError("gestation_days must be between 0 and 6")
        return v


# =========================================================================
# EXISTING SCHEMAS (from previous)
# =========================================================================

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str
    site_name: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    site_name: str | None
    is_active: bool

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    site_name: str | None
    expires_in_minutes: int = 480


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int = 480


# ==========================================================
# AUDIT & SITE STAFF
# ==========================================================

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    table_name: str
    record_id: Optional[str] = None
    enrollment_id: Optional[str] = None
    screening_id: Optional[str] = None
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SiteStaffCreate(BaseModel):
    site_name: str
    name: str
    role: Optional[str] = "screener"


class SiteStaffOut(BaseModel):
    id: int
    site_name: str
    name: str
    role: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


# ==========================================================
# PARTICIPANT PII (protected store — B1)
# ==========================================================

class ParticipantPIICreate(BaseModel):
    enrollment_id: Optional[str] = None
    screening_id: Optional[str] = None
    site_name: Optional[str] = None
    mother_first_name: Optional[str] = None
    mother_surname: Optional[str] = None
    husband_first_name: Optional[str] = None
    husband_surname: Optional[str] = None
    maternal_uid: Optional[str] = None
    hospital_admission_number: Optional[str] = None
    mother_contact: Optional[str] = None
    husband_contact: Optional[str] = None
    address: Optional[str] = None
    email_address: Optional[str] = None
    house: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    landmark: Optional[str] = None
    baby_name: Optional[str] = None
    contact_mother: Optional[str] = None
    contact_husband: Optional[str] = None


class ParticipantPIIOut(ParticipantPIICreate):
    id: int
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================================
# FORM A — SCREENING SCHEMAS
# ==========================================================

class ScreeningCreate(BaseModel):
    screening_id: Optional[str] = None
    screening_datetime: Optional[datetime] = None
    enrollment_id: Optional[str] = None
    site_name: str
    site_id: str
    screened_by: str
    screening_datetime: Optional[datetime] = None
    mother_first_name: str
    mother_surname: Optional[str] = None
    husband_first_name: str
    husband_surname: Optional[str] = None
    mother_contact: Optional[str] = None
    husband_contact: Optional[str] = None
    maternal_uid: Optional[str] = None
    hospital_admission_number: Optional[str] = None
    
    gestation_weeks: int
    gestation_days: int
    gestation_method: Optional[str] = None
    expected_delivery_date: Optional[date] = None
    lmp_date: Optional[date] = None 
    exclusion_present: bool
    exclusion_reasons: Optional[str] = None
    reason_for_insufficient_time: Optional[str] = None
    decision_forego_resuscitation_reason: Optional[str] = None
    decision_forego_resuscitation_reason_other: Optional[str] = None
    major_structural_anomalies_if_yes: Optional[str] = None
    fetal_hydrops: Optional[str] = None
    screening_status: Optional[str] = None
    consent_given: Optional[str] = None
    consent_taken_by: Optional[str] = None
    consent_datetime: Optional[datetime] = None
    consent_form_version: Optional[str] = None
    consent_language: Optional[str] = None
    consent_obtained_by_signature: Optional[str] = None
    reconsent_obtained: Optional[bool] = False
    reconsent_datetime: Optional[datetime] = None
    reconsent_form_version: Optional[str] = None
    relationship_to_participant: Optional[str] = None
    relationship_other: Optional[str] = None
    reason_not_approached: Optional[str] = None
    reason_not_approached_other: Optional[str] = None
    reason_for_consent_refusal: Optional[str] = None
    reason_for_consent_refusal_other: Optional[str] = None
    video_pis_shown: Optional[str] = None


class ScreeningClinicalOut(BaseModel):
    """Screening response without PII (clinical / de-identified view)."""

    id: int
    screening_id: str

    enrollment_id: Optional[str] = None
    site_name: Optional[str] = None
    site_id: Optional[str] = None

    screened_by: Optional[str] = None
    screening_status: Optional[str] = None

    gestation_weeks: Optional[int] = None
    gestation_days: Optional[int] = None
    gestation_method: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    lmp_date: Optional[str] = None
    exclusion_present: Optional[bool] = None
    exclusion_reasons: Optional[str] = None
    reason_for_insufficient_time: Optional[str] = None
    decision_forego_resuscitation_reason: Optional[str] = None
    decision_forego_resuscitation_reason_other: Optional[str] = None
    major_structural_anomalies_if_yes: Optional[str] = None
    fetal_hydrops: Optional[str] = None

    consent_given: Optional[str] = None
    consent_taken_by: Optional[str] = None
    consent_datetime: Optional[datetime] = None
    consent_form_version: Optional[str] = None
    consent_language: Optional[str] = None
    consent_obtained_by_signature: Optional[str] = None
    reconsent_obtained: Optional[bool] = False
    reconsent_datetime: Optional[datetime] = None
    reconsent_form_version: Optional[str] = None
    relationship_to_participant: Optional[str] = None
    relationship_other: Optional[str] = None
    reason_not_approached: Optional[str] = None
    reason_not_approached_other: Optional[str] = None
    reason_for_consent_refusal: Optional[str] = None
    reason_for_consent_refusal_other: Optional[str] = None
    video_pis_shown: Optional[str] = None

    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    screening_datetime: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Backward-compatible alias; list/detail screening APIs use clinical view only.
ScreeningOut = ScreeningClinicalOut

# ==========================================================
# FORM B — BIRTH & RESUSCITATION SCHEMAS
# ==========================================================

class BirthResuscitationCreate(BaseModel):
    screening_id: Optional[str] = None
    enrollment_id: Optional[str] = None

    mother_name_first: Optional[str] = None
    mother_name_surname: Optional[str] = None
    maternal_uid: Optional[str] = None

    baby_uid: Optional[str] = None
    contact_mother: Optional[str] = None
    contact_husband: Optional[str] = None

    gestation_weeks: Optional[int] = None
    gestation_days: Optional[int] = None
    birth_weight: Optional[float] = None
    date_of_birth: Optional[date] = None
    time_of_birth: Optional[time] = None
    baby_admission_no: Optional[str] = None
    baby_annual_no: Optional[str] = None
    gestation_rand_weeks: Optional[int] = None
    gestation_rand_days: Optional[int] = None
    intrauterine_centile: Optional[str] = None

    indication_for_delivery: Optional[str] = None
    indication_for_delivery_other: Optional[str] = None
    indication_edf_detail: Optional[str] = None
    fetal_indication_detail: Optional[str] = None
    obstetric_indication_detail: Optional[str] = None
    maternal_complication: Optional[str] = None
    delivery_mode: Optional[str] = None
    vaginal_delivery_type: Optional[str] = None
    lscs_type: Optional[str] = None
    gender: Optional[str] = None

    poor_resp_efforts: Optional[bool] = None
    poor_muscle_tone: Optional[bool] = None
    hr_above_100: Optional[bool] = None
    required_resuscitation: Optional[bool] = None
    initial_steps: Optional[bool] = None
    strata: Optional[str] = None
    enrollment_reason_not_randomized: Optional[str] = None
    enrollment_reason_not_randomized_other: Optional[str] = None

    ppv_required: Optional[bool] = None
    device_ppv: Optional[str] = None
    sib_peep_with: Optional[str] = None
    sib_peep_cmh2o: Optional[float] = None
    tpiece_pip: Optional[float] = None
    tpiece_peep: Optional[float] = None
    tpiece_flow: Optional[float] = None
    interface_used: Optional[str] = None
    intubation: Optional[bool] = None
    chest_compression: Optional[bool] = None

    ppv_duration: Optional[int] = None
    cc_duration: Optional[int] = None

    adrenaline: Optional[bool] = None
    adrenaline_dilution: Optional[str] = None
    adrenaline_route: Optional[str] = None
    med_doses: Optional[int] = None
    adrenaline_cumulative: Optional[float] = None
    fluid_bolus: Optional[bool] = None
    fluid_bolus_doses: Optional[int] = None
    fluid_bolus_cumulative: Optional[float] = None

    placental_transfusion: Optional[bool] = None
    transfusion_method: Optional[str] = None

    cord_clamp_timestamp: Optional[time] = None
    cord_clamp_time: Optional[int] = None
    time_to_respiration: Optional[int] = None
    respiration_days: Optional[int] = None
    respiration_hours: Optional[int] = None
    time_to_spo2_80: Optional[int] = None
    spo2_5min: Optional[int] = None

    randomised: Optional[bool] = None
    randomisation_date: Optional[str] = None

    resus_failure: Optional[bool] = None
    cord_blood_done: Optional[bool] = None
    cord_blood_within_1hr: Optional[bool] = None
    cord_blood_source: Optional[str] = None
    cord_ph: Optional[float] = None
    cord_sbe: Optional[float] = None
    cord_pco2: Optional[float] = None
    interventions: Optional[Dict[str, Dict[str, str]]] = None
    reason_exit_trial_gas: Optional[str] = None
    spo2_exit_trial_gas: Optional[float] = None
    total_resus_time: Optional[int] = None
    blender_stopped: Optional[bool] = None
    blender_stopped_description: Optional[str] = None

    # =====================================================
    # 🔐 VALIDATORS (MUST BE INSIDE CLASS)
    # =====================================================

    @field_validator("baby_uid")
    @classmethod
    def validate_baby_uid(cls, v):
        if not v:
            return None
        if not v.isdigit():
            raise ValueError("Baby UID must contain digits only")
        if len(v) > 12:
            raise ValueError("Baby UID cannot exceed 12 digits")
        return v


    @field_validator("contact_mother", "contact_husband")
    @classmethod
    def validate_contact(cls, v):
        if not v:
            return None
        if not v.isdigit():
            raise ValueError("Contact must contain digits only")
        if len(v) != 10:
            raise ValueError("Contact must be exactly 10 digits")
        return v

    @field_validator("gestation_weeks", "gestation_rand_weeks")
    @classmethod
    def validate_gestation_weeks(cls, v):
        if v is not None and not 18 <= v <= 42:
            raise ValueError("Gestation weeks must be between 18 and 42")
        return v

    @field_validator("gestation_days", "gestation_rand_days")
    @classmethod
    def validate_gestation_days(cls, v):
        if v is not None and not 0 <= v <= 6:
            raise ValueError("Gestation days must be between 0 and 6")
        return v

    @field_validator("birth_weight")
    @classmethod
    def validate_birth_weight(cls, v):
        if v is not None and not 300 <= v <= 6000:
            raise ValueError("Birth weight must be between 300 and 6000 g")
        return v

    @field_validator("intrauterine_centile")
    @classmethod
    def validate_centile(cls, v):
        if v not in (None, "") and not 0 <= float(v) <= 100:
            raise ValueError("Intrauterine centile must be between 0 and 100")
        return v

    @field_validator("spo2_5min", "spo2_exit_trial_gas")
    @classmethod
    def validate_spo2(cls, v):
        if v is not None and not 0 <= v <= 100:
            raise ValueError("SpO2 must be between 0 and 100 percent")
        return v

    @field_validator("cord_clamp_time")
    @classmethod
    def validate_cord_clamp_time(cls, v):
        if v is not None and not 0 <= v <= 300:
            raise ValueError("Cord clamping time must be between 0 and 300 seconds")
        return v

    @field_validator("respiration_hours")
    @classmethod
    def validate_respiration_hours(cls, v):
        if v is not None and not 0 <= v <= 23:
            raise ValueError("Respiration hours must be between 0 and 23")
        return v

    @field_validator("cord_ph")
    @classmethod
    def validate_cord_ph(cls, v):
        if v is not None and not 6.8 <= v <= 7.8:
            raise ValueError("Cord pH must be between 6.8 and 7.8")
        return v

    @field_validator("cord_sbe")
    @classmethod
    def validate_cord_sbe(cls, v):
        if v is not None and not -30 <= v <= 30:
            raise ValueError("Cord SBE must be between -30 and 30")
        return v

    @field_validator("cord_pco2")
    @classmethod
    def validate_cord_pco2(cls, v):
        if v is not None and not 0 <= v <= 200:
            raise ValueError("Cord pCO2 must be between 0 and 200 mmHg")
        return v


class BirthResuscitationOut(BirthResuscitationCreate):
    id: int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True

  

# ==========================================================
# FORM C — MATERNAL DETAILS SCHEMAS
# ==========================================================

class MaternalDetailsCreate(BaseModel):
    enrollment_id: Optional[str] = None
    mother_name: Optional[str] = None
    maternal_uid: Optional[str] = None
    mother_age: Optional[int] = None
    contact_mother: Optional[str] = None
    contact_husband: Optional[str] = None
    address: Optional[str] = None
    # Individual address fields (stored in participant_pii)
    house: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    landmark: Optional[str] = None
    email_address: Optional[str] = None

    gravida: Optional[int] = None
    parity: Optional[int] = None
    abortions: Optional[int] = None
    live: Optional[int] = None
    still: Optional[int] = None
    booked: Optional[str] = None  # "Booked"/"Unbooked"/"Not known" — stored as String
    anc_visits: Optional[int] = None
    multiple: Optional[str] = None

    lmp: Optional[str] = None
    edd: Optional[str] = None
    conception: Optional[str] = None
    artificial_type: Optional[str] = None
    artificial_other: Optional[str] = None

    # These are stored as String in the DB model — send raw "Yes"/"No"/"Not known"
    antenatal_steroids: Optional[str] = None
    steroid_date: Optional[date] = None
    steroid_drug: Optional[str] = None
    steroid_doses: Optional[str] = None
    steroid_courses: Optional[str] = None
    lddi_known: Optional[str] = None
    lddi_hours: Optional[str] = None
    antenatal_mgso4: Optional[str] = None
    gestation_at_steroids: Optional[str] = None
    mgso4_date: Optional[date] = None
    mgso4_gestation_weeks: Optional[int] = None
    mgso4_gestation_days: Optional[int] = None

    chronic_hypertension: Optional[bool] = None
    hepatitis: Optional[bool] = None
    heart_disease: Optional[bool] = None
    renal_disease: Optional[bool] = None
    vdrl_positive: Optional[bool] = None
    seizure_disorder: Optional[bool] = None
    asthma: Optional[bool] = None
    hiv: Optional[bool] = None
    thyroid: Optional[bool] = None
    tb: Optional[bool] = None
    malaria: Optional[bool] = None
    severe_anemia: Optional[bool] = None
    other_medical_disorder: Optional[str] = None

    # All below stored as Column(String) in DB — send raw "Yes"/"No"/"Not known"
    hdp: Optional[str] = None
    hdp_type: Optional[str] = None
    gdm: Optional[str] = None
    gdm_rx: Optional[str] = None
    liquor: Optional[str] = None
    fgr: Optional[str] = None
    fgr_centile: Optional[str] = None
    doppler: Optional[str] = None
    doppler_other: Optional[str] = None

    placental_abnormality: Optional[str] = None
    placental_type: Optional[str] = None
    placental_other: Optional[str] = None
    retroplacental_collection: Optional[str] = None

    aph: Optional[str] = None
    aph_type: Optional[str] = None
    aph_other: Optional[str] = None
    isoimmunization: Optional[str] = None
    pprom: Optional[str] = None
    pprom_duration: Optional[str] = None
    preterm_labor: Optional[str] = None
    triple_i: Optional[str] = None

    maternal_fever: Optional[str] = None
    fetal_tachycardia: Optional[str] = None
    maternal_tlc_high: Optional[str] = None
    maternal_tachycardia: Optional[str] = None
    maternal_abdominal_tenderness: Optional[str] = None
    foul_smelling_liquor: Optional[str] = None
    maternal_uti: Optional[str] = None
    maternal_diarrhea: Optional[str] = None

    msl: Optional[str] = None
    non_reactive_nst: Optional[str] = None
    reduced_fm: Optional[str] = None
    prolonged_labor: Optional[str] = None

    cord_accident: Optional[str] = None
    cord_accident_type: Optional[str] = None

    fetal_bradycardia: Optional[str] = None
    fetal_tachycardia_intrapartum: Optional[str] = None

    duration_rom: Optional[str] = None

    uterotonic: Optional[str] = None
    uterotonic_timing: Optional[str] = None


class MaternalDetailsOut(MaternalDetailsCreate):
    id: int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# =========================
# FORM D — SCHEMAS
# =========================

class PostnatalDay1Create(BaseModel):
    enrollment_id: str | None = None
    gestation_weeks: int | None = None
    gestation_days: int | None = None
    annual_number: str | None = None
    baby_name: str | None = None
    baby_uid: str | None = None
    birth_weight: float | None = None

    plastic_wrap: bool | None = None
    remained_intubated: bool | None = None
    et_intubation: bool | None = None
    labored_breathing: bool | None = None

    surfactant_required: bool | None = None
    surfactant_indication: str | None = None
    cpap_cm: float | None = None
    fio2_percent: float | None = None
    surfactant_method: str | None = None
    lisa_catheter: str | None = None
    device_assistance: bool | None = None
    device_type: str | None = None
    surfactant_brand: str | None = None
    surfactant_dose: float | None = None
    adverse_effects: bool | None = None
    adverse_type: str | None = None
    mode_of_support: Optional[str] = None

    early_cpap: bool | None = None
    humidified_gas: bool | None = None
    max_fio2_1hr: float | None = None
    caffeine: bool | None = None
    caffeine_dose: float | None = None
    intubation_after_resus: bool | None = None
    immediate_kmc: bool | None = None

    surfactant_brand_other: str | None = None
    lisa_catheter_type: str | None = None
    adverse_type_other: str | None = None
    device_type_other: str | None = None
    caffeine_loading: bool | None = None
    caffeine_loading_abs: float | None = None
    caffeine_maint_abs: float | None = None
    caffeine_date: date | None = None
    caffeine_time: str | None = None

    completed_by: str | None = None
    designation: str | None = None
    signature: str | None = None
    completion_date: date | None = None


class PostnatalDay1Out(PostnatalDay1Create):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class NICUAdmissionCreate(BaseModel):
    enrollment_id: str

    baby_uid: Optional[str] = None
    annual_number: Optional[str] = None
    baby_name: Optional[str] = None

    admission_datetime: Optional[datetime] = None
    age_at_admission_hours: Optional[float] = None

    temp_dr: Optional[float] = None
    temp_skin: Optional[float] = None
    temp_axillary: Optional[float] = None

    transport_incubator: Optional[bool] = None
    transport_mode: Optional[str] = None

    additional_heating: Optional[bool] = None
    heating_type: Optional[str] = None

    transport_adverse_event: Optional[bool] = None
    adverse_event_type: Optional[str] = None
    tube_accident_type: Optional[str] = None

    transport_mode_resp: Optional[str] = None
    transport_cpap: Optional[float] = None
    transport_pip:  Optional[float] = None
    transport_peep: Optional[float] = None
    transport_map:  Optional[float] = None
    transport_fio2: Optional[float] = None

    nicu_mode_resp: Optional[str] = None
    nicu_cpap: Optional[float] = None
    nicu_pip:  Optional[float] = None
    nicu_peep: Optional[float] = None
    nicu_map:  Optional[float] = None
    nicu_fio2: Optional[float] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    signature: Optional[str] = None
    completion_date: Optional[date] = None
    
class NICUAdmissionOut(NICUAdmissionCreate):
    id: int

    class Config:
        from_attributes = True        
# ==========================================================
# FORM F — NEONATAL MORBIDITIES
# ==========================================================

class NeonatalMorbiditiesCreate(BaseModel):
    enrollment_id: str | None = None

    # ---------------- NEUROLOGICAL ----------------
    ivh: bool | None = None
    ivh_side: str | None = None
    ivh_grade: str | None = None
    ivh_date: date | None = None
    ivh_age_days: int | None = None
    pvhi: bool | None = None
    phh: bool | None = None
    vp_shunt: bool | None = None

    pvl: bool | None = None
    pvl_side: str | None = None
    pvl_grade: str | None = None
    pvl_date: date | None = None

    ventriculomegaly: bool | None = None
    ventriculomegaly_severity: str | None = None
    max_vi_mm: float | None = None
    ahw_mm: float | None = None
    tod_mm: float | None = None
    aca_ri: float | None = None
    mca_ri: float | None = None

    seizures: bool | None = None
    seizure_date: date | None = None
    seizure_type: str | None = None
    eeg: str | None = None
    aeds_required: bool | None = None
    aed_name: str | None = None
    seizure_etiology: str | None = None

    non_ivh_ich: bool | None = None
    non_ivh_ich_type: str | None = None

    meningitis: bool | None = None
    meningitis_type: str | None = None
    meningitis_date: date | None = None
    csf_culture: str | None = None
    csf_organism: str | None = None

    # ---------------- RESPIRATORY ----------------
    bpd: bool | None = None
    bpd_grade: str | None = None
    oxygen_days: int | None = None
    vent_days: int | None = None
    cpap_days: int | None = None

    pulmonary_hemorrhage: bool | None = None
    pneumothorax: bool | None = None
    pneumothorax_side: str | None = None
    chest_drain: bool | None = None
    pulmonary_htn: bool | None = None

    apnea: bool | None = None
    apnea_onset_days: int | None = None
    caffeine: bool | None = None
    caffeine_duration_days: int | None = None

    postnatal_steroids: bool | None = None
    steroid_drug: str | None = None
    steroid_age_days: int | None = None
    steroid_dose_mgkg: float | None = None
    steroid_indication: str | None = None

    # ---------------- GASTROINTESTINAL ----------------
    feed_intolerance: bool | None = None
    nec: bool | None = None
    nec_stage: str | None = None
    nec_date: date | None = None
    nec_surgery: bool | None = None

    pn: bool | None = None
    pn_days: int | None = None
    cholestasis: bool | None = None
    max_direct_bilirubin: float | None = None

    # ---------------- CARDIOVASCULAR ----------------
    hs_pda: bool | None = None
    pda_diagnosed_by: str | None = None
    pda_treatment: str | None = None
    pda_ligation: bool | None = None

    shock: bool | None = None
    hypotension: bool | None = None
    inotropes: bool | None = None

    # ---------------- INFECTION ----------------
    sepsis: bool | None = None
    sepsis_type: str | None = None
    sepsis_episodes: int | None = None

    # ---------------- HOSPITAL COURSE ----------------
    total_los_days: int | None = None
    nicu_days: int | None = None
    discharge_weight: float | None = None
    discharge_date: date | None = None
    outcome: str | None = None
    back_referred_hospital: str | None = None

    completed_by: str | None = None
    signature: str | None = None
    completion_date: date | None = None


class NeonatalMorbiditiesOut(NeonatalMorbiditiesCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ==========================================================
# FORM G — STUDY OUTCOMES SCHEMAS
# ==========================================================

class StudyOutcomesCreate(BaseModel):
    enrollment_id: Optional[str] = None
    baby_uid: Optional[str] = None

    gestation_weeks: Optional[int] = None
    birth_weight: Optional[float] = None

    mortality_in_hospital: Optional[bool] = None
    mortality_after_discharge: Optional[bool] = None
    mortality_7_days: Optional[bool] = None
    mortality_28_days: Optional[bool] = None
    age_at_death: Optional[str]= None

    bpd_jensen: Optional[bool] = None
    bpd_nichd: Optional[bool] = None

    abnormal_mri: Optional[bool] = None
    rop_44w: Optional[bool] = None
    rop_treated: Optional[bool] = None
    rop_age_at_dx: Optional[str] = None

    nec_stage_2: Optional[bool] = None
    nec_surgery: Optional[bool] = None
    brain_injury: Optional[bool] = None

    switched_100_o2: Optional[bool] = None
    cc_epi_volume: Optional[bool] = None
    ventilation_required: Optional[bool] = None
    time_to_spontaneous_breathing: Optional[int] = None

    fio2_0: Optional[int] = None
    fio2_1: Optional[int] = None
    fio2_2: Optional[int] = None
    fio2_3: Optional[int] = None
    fio2_4: Optional[int] = None
    fio2_5: Optional[int] = None
    fio2_6: Optional[int] = None
    fio2_7: Optional[int] = None
    fio2_8: Optional[int] = None
    fio2_9: Optional[int] = None
    fio2_10: Optional[int] = None

    intubation_during_resus: Optional[bool] = None
    hie_grade: Optional[str] = None

    resp_support_72h: Optional[bool] = None
    mv_days: Optional[int] = None
    cpap_days: Optional[int] = None
    niv_days: Optional[int] = None
    hfnc_days: Optional[int] = None

    sepsis_72h: Optional[bool] = None
    sepsis_overall: Optional[bool] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    signature: Optional[str] = None
    completion_date: Optional[date] = None


class StudyOutcomesOut(StudyOutcomesCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True




class CranialScanCreate(BaseModel):
    timing: str
    scan_date: Optional[date] = None

    dol: Optional[int] = None
    pma: Optional[str] = None
    findings: Optional[str] = None
    signature: Optional[str] = None


class CranialUltrasoundCreate(BaseModel):
    enrollment_id: str

    gestation_weeks: Optional[int] = None
    birth_weight: Optional[float] = None
    dob: Optional[date] = None

    scans: List[CranialScanCreate]

    # Detailed findings
    worst_ivh_grade: Optional[str] = None
    ivh_side: Optional[str] = None
    ivh_date: Optional[date] = None
    ivh_dol: Optional[int] = None
    ivh_pma: Optional[str] = None

    phvd: Optional[bool] = None
    phvd_date: Optional[date] = None

    vp_shunt: Optional[bool] = None
    vp_shunt_date: Optional[date] = None

    cpvl_grade: Optional[str] = None
    cpvl_side: Optional[str] = None
    cpvl_date: Optional[date] = None
    cpvl_dol: Optional[int] = None
    cpvl_pma: Optional[str] = None

    other_findings: Optional[str] = None
    brain_injury_composite: Optional[bool] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    signature: Optional[str] = None
    completion_date: Optional[date] = None


class CranialUltrasoundOut(CranialUltrasoundCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ROPScreeningCreate(BaseModel):
    enrollment_id: str

    gestation_weeks: Optional[int]
    birth_weight: Optional[float]
    dob: Optional[date]

    risk_factors: Optional[list]
    screenings: Optional[list]

    worst_stage: Optional[str]
    worst_zone: Optional[str]
    plus_disease: Optional[bool]
    a_rop: Optional[bool]

    treatment_required: Optional[bool]
    treatment_type: Optional[list]
    anti_vegf_agent: Optional[str]
    treatment_re_date: Optional[date]
    treatment_le_date: Optional[date]
    bilateral_treatment: Optional[bool]
    pma_at_treatment: Optional[str]

    outcome: Optional[str]
    final_screening_date: Optional[date]
    pma_discharge: Optional[str]
    rop_treatment_composite: Optional[bool]

    completed_by: Optional[str]
    designation: Optional[str]
    signature: Optional[str]
    completion_date: Optional[date]


class ROPScreeningOut(ROPScreeningCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True  


class CompositeOutcomeCreate(BaseModel):
    enrollment_id: str

    gestation_at_birth: Optional[int] = None
    dob: Optional[date] = None

    assess_36_date: Optional[date] = None
    assess_36_method: Optional[str] = None
    actual_pma_36_weeks: Optional[int] = None
    actual_pma_36_days: Optional[int] = None

    death_before_36: Optional[bool] = None
    death_36_date: Optional[date] = None
    death_36_age_days: Optional[int] = None
    death_36_cause: Optional[str] = None
    ltfu_reason_36: Optional[str] = None

    resp_support_36: Optional[str] = None
    bpd_jensen_grade: Optional[str] = None

    radiographic_lung_disease: Optional[bool] = None
    fio2_36: Optional[float] = None
    flow_rate_36: Optional[float] = None
    bpd_nichd_grade: Optional[str] = None

    composite_36: Optional[bool] = None

    assess_40_date: Optional[date] = None
    assess_40_method: Optional[str] = None
    actual_pma_40_weeks: Optional[int] = None
    actual_pma_40_days: Optional[int] = None

    death_36_40: Optional[bool] = None
    death_40_date: Optional[date] = None
    death_40_age_days: Optional[int] = None
    death_40_cause: Optional[str] = None
    ltfu_reason_40: Optional[str] = None

    rop_any: Optional[bool] = None
    rop_stage: Optional[str] = None
    rop_zone: Optional[str] = None
    rop_plus: Optional[bool] = None
    a_rop: Optional[bool] = None
    rop_treatment: Optional[bool] = None
    rop_treatment_type: Optional[str] = None
    rop_bilateral: Optional[bool] = None
    rop_rx: Optional[bool] = None

    nec_dx: Optional[bool] = None
    nec_date: Optional[date] = None
    nec_stage: Optional[str] = None
    nec_surgery: Optional[bool] = None
    nec_stage_ge_2a: Optional[bool] = None

    ivh_dx: Optional[bool] = None
    ivh_grade: Optional[str] = None
    ivh_ge_3: Optional[bool] = None

    cpvl_dx: Optional[bool] = None
    cpvl_grade: Optional[str] = None
    cpvl_ge_2: Optional[bool] = None

    composite_40: Optional[bool] = None

    assess_44_date: Optional[date] = None
    assess_44_method: Optional[str] = None
    actual_pma_44_weeks: Optional[int] = None
    actual_pma_44_days: Optional[int] = None

    death_40_44: Optional[bool] = None
    death_44_date: Optional[date] = None
    death_44_age_days: Optional[int] = None
    death_44_cause: Optional[str] = None
    ltfu_reason_44: Optional[str] = None

    new_rop: Optional[bool] = None
    additional_rop_rx: Optional[bool] = None
    additional_rop_rx_type: Optional[str] = None

    new_nec: Optional[bool] = None
    new_nec_stage: Optional[str] = None

    new_ivh: Optional[bool] = None
    new_ivh_grade: Optional[str] = None

    new_cpvl: Optional[bool] = None
    new_cpvl_grade: Optional[str] = None

    composite_44: Optional[bool] = None

    mri_subset: Optional[bool] = None
    mri_date: Optional[date] = None
    mri_weeks: Optional[int] = None
    mri_days: Optional[int] = None
    scanner: Optional[str] = None
    sedation: Optional[bool] = None
    sedation_agent: Optional[str] = None
    sequences: Optional[List[str]] = []

    overall_mri: Optional[str] = None
    mri_summary: Optional[str] = None

    final_composite_36: Optional[bool] = None
    final_composite_44: Optional[bool] = None
    mri_abnormal: Optional[bool] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    signature: Optional[str] = None
    completion_date: Optional[date] = None

    model_config = {"extra": "allow"}


class CompositeOutcomeOut(CompositeOutcomeCreate):
    id: int

    class Config:
        from_attributes = True


class FiO2AUCLogCreate(BaseModel):
    enrollment_id: str

    dob: Optional[date] = None
    gestation_weeks: Optional[int] = None

    fio2_logs: Optional[List[Dict]] = []

    total_auc: Optional[float] = None
    mean_daily_fio2: Optional[float] = None
    excess_o2_auc: Optional[float] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    signature: Optional[str] = None
    completion_date: Optional[date] = None

    model_config = {"extra": "allow"}


class FiO2AUCLogOut(FiO2AUCLogCreate):
    id: int

    class Config:
        from_attributes = True

class RespCVNeuroLogCreate(BaseModel):
    enrollment_id: str

    gestation: Optional[str] = None
    mother_name: Optional[str] = None
    maternal_uid: Optional[str] = None

    daily_log: Optional[List[Dict]] = []

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    signature: Optional[str] = None
    completion_date: Optional[date] = None

    model_config = {"extra": "allow"}


class RespCVNeuroLogOut(RespCVNeuroLogCreate):
    id: int

    class Config:
        from_attributes = True        


class InfectGIHemaLogCreate(BaseModel):
    enrollment_id: str
    gestation: Optional[str] = None
    mother_name: Optional[str] = None
    maternal_uid: Optional[str] = None
    daily_log: List[Dict]

class InfectGIHemaLogOut(InfectGIHemaLogCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True        

class MetabRenalVascEyeLogCreate(BaseModel):
    enrollment_id: str
    gestation: Optional[str] = None
    mother_name: Optional[str] = None
    maternal_uid: Optional[str] = None
    daily_log: List[Dict]

class MetabRenalVascEyeLogOut(MetabRenalVascEyeLogCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True        


class SAEReportCreate(BaseModel):
    study_id: Optional[str] = None
    enrollment_id: str
    report_type: str
    report_date: str

    diagnosis: str
    onset_datetime: str
    end_datetime: Optional[str] = None
    ongoing: bool = False

    seriousness: List[str]

    severity: str
    causality: str
    action_taken: str
    outcome: str
    date_of_death: Optional[str] = None

    narrative: str

    reporter_name: str
    reporter_designation: str
    reporter_contact: Optional[str] = None
    reporter_date: str
    reporter_signature: Optional[str] = None

    investigator_name: Optional[str] = None
    investigator_signature: Optional[str] = None
    investigator_date: Optional[str] = None
    site: Optional[str] = None


class SAEReportOut(SAEReportCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True  

class AdverseEventRow(BaseModel):
    description: Optional[str] = None
    definition_no: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    severity_desc: Optional[str] = None
    grade: Optional[str] = None
    converted_to_sae: Optional[str] = None


class AdverseEventsCreate(BaseModel):
    enrollment_id: str
    mother_name: Optional[str] = None
    baby_uid: Optional[str] = None
    maternal_uid: Optional[str] = None

    has_adverse_event: bool

    events: Optional[List[AdverseEventRow]] = []

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    completion_date: Optional[str] = None


class AdverseEventsOut(AdverseEventsCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True              

class SAEListCreate(BaseModel):
    enrollment_id: str
    rows: list
    completed_by: str | None = None
    designation: str | None = None
    completion_date: str | None = None


class SAEListOut(SAEListCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
class RespCVNeuroDayCreate(BaseModel):
    enrollment_id: str
    nicu_day:      int

    # Respiratory
    support_modes:      Optional[str]   = None
    max_fio2:           Optional[float] = None
    max_flow:           Optional[float] = None
    supp_o2:            Optional[bool]  = None
    surfactant:         Optional[bool]  = None
    caffeine:           Optional[bool]  = None
    apnea:              Optional[bool]  = None
    desaturations:      Optional[bool]  = None
    extub_attempted:    Optional[bool]  = None
    extub_failure:      Optional[bool]  = None
    pulm_hemorrhage:    Optional[bool]  = None
    pneumothorax:       Optional[bool]  = None
    chest_drain:        Optional[bool]  = None
    pphn:               Optional[bool]  = None
    postnatal_steroids: Optional[bool]  = None

    # Cardiovascular
    pda_suspected:      Optional[bool]  = None
    echo_done:          Optional[bool]  = None
    hs_pda:             Optional[bool]  = None
    pda_medical_rx:     Optional[bool]  = None
    shock:              Optional[bool]  = None
    vasoactive_support: Optional[bool]  = None
    vasoactive_drugs:   Optional[str]   = None

    # Neurological
    cranial_usg:          Optional[bool] = None
    ivh:                  Optional[bool] = None
    ivh_grade:            Optional[str]  = None
    pvl_suspected:        Optional[bool] = None
    cpvl_confirmed:       Optional[bool] = None
    ventriculomegaly:     Optional[bool] = None
    clinical_seizures:    Optional[bool] = None
    eeg_seizures:         Optional[bool] = None
    aeds_given:           Optional[bool] = None
    non_ivh_ich:          Optional[bool] = None
    meningitis_suspected: Optional[bool] = None

    # Workflow
    submission_status: Optional[str]      = "draft"
    saved_at:          Optional[datetime] = None
    saved_by:          Optional[str]      = None


class RespCVNeuroDaySubmit(BaseModel):
    submission_status: str        # "submitted"
    submitted_at:      datetime
    submitted_by:      str


class RespCVNeuroDayOut(RespCVNeuroDayCreate):
    id:           int
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[str]      = None
    created_at:   Optional[datetime] = None
    updated_at:   Optional[datetime] = None

    class Config:
        from_attributes = True


class RespCVNeuroDaySummary(BaseModel):
    nicu_day:          int
    submission_status: Optional[str]      = "empty"
    completion_pct:    Optional[int]      = 0
    saved_at:          Optional[datetime] = None
    submitted_at:      Optional[datetime] = None

    class Config:
        from_attributes = True


class DischargeUpdate(BaseModel):
    discharge_date: str   # "YYYY-MM-DD"
    discharge_day:  int
# ─────────────────────────────────────────────────────────────
# Add these to schemas.py
# ─────────────────────────────────────────────────────────────
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class InfectGIHemaDayCreate(BaseModel):
    enrollment_id: str
    nicu_day:      int

    # Infection
    sepsis_suspected:       Optional[bool]  = None
    blood_culture_sent:     Optional[bool]  = None
    blood_culture_positive: Optional[bool]  = None
    eos:                    Optional[bool]  = None
    los:                    Optional[bool]  = None
    antibiotics:            Optional[bool]  = None
    antibiotic_day:         Optional[bool]  = None
    lp_done:                Optional[bool]  = None
    csf_culture_positive:   Optional[bool]  = None
    clabsi:                 Optional[bool]  = None
    vap:                    Optional[bool]  = None

    # GI
    npo:                    Optional[bool]  = None
    enteral_feeds_started:  Optional[bool]  = None
    feed_volume:            Optional[float] = None
    full_feeds:             Optional[bool]  = None
    parenteral_nutrition:   Optional[bool]  = None
    probiotic:              Optional[bool]  = None
    feed_intolerance:       Optional[bool]  = None
    nec_suspected:          Optional[bool]  = None
    nec_confirmed_stage:    Optional[str]   = None
    nec_surgery:            Optional[bool]  = None

    # Hematology
    jaundice:               Optional[bool]  = None
    phototherapy:           Optional[bool]  = None
    peak_tsb:               Optional[float] = None
    exchange_transfusion:   Optional[bool]  = None
    prbc_transfusion:       Optional[bool]  = None
    platelet_transfusion:   Optional[bool]  = None
    ffp_cryo:               Optional[bool]  = None

    # Workflow
    submission_status:      Optional[str]      = "draft"
    saved_at:               Optional[datetime] = None
    saved_by:               Optional[str]      = None


class InfectGIHemaDaySubmit(BaseModel):
    submission_status: str
    submitted_at:      datetime
    submitted_by:      str


class InfectGIHemaDayOut(InfectGIHemaDayCreate):
    id:           int
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[str]      = None
    created_at:   Optional[datetime] = None
    updated_at:   Optional[datetime] = None

    class Config:
        from_attributes = True
# ═══════════════════════════════════════════════════════════════
# 2. ADD TO schemas.py
# ═══════════════════════════════════════════════════════════════
 
class MetabRenalVascEyeDayCreate(BaseModel):
    enrollment_id: str
    nicu_day:      int
    hypoglycemia:           Optional[bool]  = None
    hypoglycemia_rx:        Optional[bool]  = None
    hyperglycemia:          Optional[bool]  = None
    insulin:                Optional[bool]  = None
    metabolic_acidosis:     Optional[bool]  = None
    dyselectrolytemia:      Optional[bool]  = None
    dyselectrolytemia_type: Optional[str]   = None
    osteopenia_suspected:   Optional[bool]  = None
    aki_suspected:          Optional[bool]  = None
    aki_kdigo_stage:        Optional[str]   = None
    creatinine:             Optional[float] = None
    urine_output_low:       Optional[bool]  = None
    dialysis_crrt:          Optional[bool]  = None
    hypothermia:            Optional[bool]  = None
    hyperthermia:           Optional[bool]  = None
    picc_in_situ:           Optional[bool]  = None
    uvc_in_situ:            Optional[bool]  = None
    uac_in_situ:            Optional[bool]  = None
    peripheral_iv:          Optional[bool]  = None
    peripheral_arterial:    Optional[bool]  = None
    extravasation_injury:   Optional[bool]  = None
    line_complication:      Optional[bool]  = None
    rop_screening_due:      Optional[bool]  = None
    rop_screened:           Optional[bool]  = None
    rop_detected:           Optional[bool]  = None
    rop_stage:              Optional[str]   = None
    plus_disease:           Optional[bool]  = None
    rop_treatment:          Optional[bool]  = None
    submission_status:      Optional[str]      = "draft"
    saved_at:               Optional[datetime] = None
    saved_by:               Optional[str]      = None

class MetabRenalVascEyeDaySubmit(BaseModel):
    submission_status: str
    submitted_at:      datetime
    submitted_by:      str

class MetabRenalVascEyeDayOut(MetabRenalVascEyeDayCreate):
    id:           int
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[str]      = None
    created_at:   Optional[datetime] = None
    updated_at:   Optional[datetime] = None
    class Config:
        from_attributes = True
# ============================================================================
# FORM H — Pydantic schemas
# Add these to schemas.py
# ============================================================================

from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class CranialUSGCreate(BaseModel):
    enrollment_id:           str
    scan_entries:            Optional[List[Any]]  = []
    phvd:                    Optional[bool]       = None
    phvd_diagnosis_date:     Optional[str]        = None
    vp_shunt:                Optional[bool]       = None
    vp_shunt_insertion_date: Optional[str]        = None
    ventriculomegaly:        Optional[bool]       = None
    subependymal_cyst:       Optional[bool]       = None
    choroid_plexus_cyst:     Optional[bool]       = None
    cerebellar_hemorrhage:   Optional[bool]       = None
    subdural_hemorrhage:     Optional[bool]       = None
    other_finding:           Optional[bool]       = None
    other_finding_text:      Optional[str]        = None
    brain_injury_composite:  Optional[bool]       = None
    schedule_key:            Optional[str]        = None
    submission_status:       Optional[str]        = "draft"
    saved_at:                Optional[str]        = None
    saved_by:                Optional[str]        = None


class CranialUSGSubmit(CranialUSGCreate):
    submission_status: str = "submitted"
    submitted_at:      Optional[str] = None
    submitted_by:      Optional[str] = None


class CranialUSGOut(CranialUSGCreate):
    id:           int
    submitted_at: Optional[str] = None
    submitted_by: Optional[str] = None
    created_at:   Optional[datetime] = None
    updated_at:   Optional[datetime] = None

    class Config:
        from_attributes = True

# ============================================================================
# FORM K — MRI Brain Assessment Schemas
# ============================================================================
class MRIBrainCreate(BaseModel):
    enrollment_id:    str

    # K.1 Identification
    dob:              Optional[str]  = None
    gestation_weeks:  Optional[int]  = None
    gestation_days:   Optional[int]  = None
    mri_date:         Optional[str]  = None
    pma_weeks:        Optional[int]  = None
    pma_days:         Optional[int]  = None
    selected_for_mri: Optional[bool] = None

    # K.2 MRI Details
    scanner:          Optional[str]  = None
    sedation:         Optional[bool] = None
    sedation_agent:   Optional[str]  = None
    sequences:        Optional[List[str]] = []

    # K.3 Findings
    myelination:      Optional[str]  = None
    bg_thalamus:      Optional[Dict] = None
    plic:             Optional[Dict] = None
    white_matter:     Optional[Dict] = None
    corpus_callosum:  Optional[Dict] = None
    cerebellum:       Optional[Dict] = None
    atrophy:          Optional[Dict] = None
    hemorrhage_swi:   Optional[Dict] = None

    # K.4 Overall
    overall_mri:      Optional[str]  = None
    mri_summary:      Optional[str]  = None
    radiologist_name: Optional[str]  = None
    radiologist_date: Optional[str]  = None

    # Footer
    completed_by:     Optional[str]  = None
    designation:      Optional[str]  = None
    completion_date:  Optional[str]  = None

    # Workflow
    submission_status: Optional[str] = "draft"
    saved_at:          Optional[str] = None
    saved_by:          Optional[str] = None


class MRIBrainSubmit(MRIBrainCreate):
    submission_status: str = "submitted"
    submitted_at:      Optional[str] = None
    submitted_by:      Optional[str] = None


class MRIBrainOut(MRIBrainCreate):
    id:           int
    submitted_at: Optional[str]      = None
    submitted_by: Optional[str]      = None
    created_at:   Optional[datetime] = None
    updated_at:   Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================================
# FORM L — Blender Data & Study Summary Schemas
# ============================================================================
class BlenderSummaryCreate(BaseModel):
    enrollment_id:  str

    # L.1 Identification
    dob:             Optional[str]   = None
    gestation_weeks: Optional[int]   = None
    gestation_days:  Optional[int]   = None
    pma_weeks:       Optional[int]   = None
    pma_days:        Optional[int]   = None
    mother_name:     Optional[str]   = None
    baby_name:       Optional[str]   = None

    # L.2 Blender Details
    initial_fio2:        Optional[float]      = None
    exit_fio2:           Optional[float]      = None
    max_fio2_first_hour: Optional[float]      = None
    fio2_per_minute:     Optional[List]       = []  # 11-element list [min_0 … min_10]

    # L.3 Composite Outcomes  ("yes" | "no" | "na" | None)
    composite_outcome_1: Optional[str] = None
    composite_outcome_2: Optional[str] = None
    mri_abnormality:     Optional[str] = None

    # Footer
    completed_by:    Optional[str] = None
    designation:     Optional[str] = None
    completion_date: Optional[str] = None

    # Workflow
    submission_status: Optional[str] = "draft"
    saved_at:          Optional[str] = None
    saved_by:          Optional[str] = None


class BlenderSummarySubmit(BlenderSummaryCreate):
    submission_status: str = "submitted"
    submitted_at:      Optional[str] = None
    submitted_by:      Optional[str] = None


class BlenderSummaryOut(BlenderSummaryCreate):
    id:           int
    submitted_at: Optional[str]      = None
    submitted_by: Optional[str]      = None
    created_at:   Optional[datetime] = None
    updated_at:   Optional[datetime] = None

    class Config:
        from_attributes = True
