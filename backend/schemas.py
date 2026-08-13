from pydantic import BaseModel, field_validator, model_validator
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
    email: str | None = None
    password: str
    role: str
    site_name: str | None = None
    full_name: str | None = None
    mobile: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str | None
    role: str
    site_name: str | None
    full_name: str | None
    mobile: str | None
    must_change_password: bool
    is_active: bool

    class Config:
        from_attributes = True


class UserProfileOut(BaseModel):
    """Shape expected by the Flutter app's UserProfile.fromJson (/auth/me,
    and the `user` field of the login response)."""
    id: str
    username: str
    email: str
    full_name: str
    mobile: str | None
    role: str  # uppercase token, see deps.MOBILE_ROLE_MAP
    site_id: str | None
    site_name: str | None
    must_change_password: bool
    last_login_at: str | None


class LoginRequest(BaseModel):
    # Accepts both the web login form (username) and the mobile app
    # (email_or_username + device metadata); everything but the credentials
    # is optional so either client can call the same endpoint.
    username: str | None = None
    email_or_username: str | None = None
    password: str
    device_id: str | None = None
    device_name: str | None = None
    device_os: str | None = None
    app_version: str | None = None

    def identifier(self) -> str:
        return (self.email_or_username or self.username or "").strip()


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    site_name: str | None
    expires_in_minutes: int = 480
    user: UserProfileOut


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


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


class ParticipantPIIBatchRequest(BaseModel):
    """Bulk PII lookup for patient lists (mobile + webforms)."""
    screening_ids: List[str] = []


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
    
    gestation_known: Optional[str] = None
    gestation_weeks: int
    gestation_days: int
    gestation_method: Optional[str] = None
    expected_delivery_date: Optional[date] = None
    lmp_date: Optional[date] = None 
    ga_source: Optional[str] = None
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
    # Needed by Form B (Birth & Resuscitation) to auto-calculate gestation
    # at randomization — was missing here, so Form B always received
    # screening_datetime as undefined and silently skipped that calculation.
    screening_datetime: Optional[datetime] = None
    screening_status: Optional[str] = None

    gestation_known: Optional[str] = None
    gestation_weeks: Optional[int] = None
    gestation_days: Optional[int] = None
    gestation_method: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    lmp_date: Optional[str] = None
    ga_source: Optional[str] = None
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
    blender_letter: Optional[str] = None
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

    @field_validator("spo2_5min")
    @classmethod
    def validate_spo2_5min(cls, v):
        if v is not None and not 1 <= v <= 100:
            raise ValueError("SpO2 at 5 min must be between 1 and 100 percent")
        return v

    @field_validator("spo2_exit_trial_gas")
    @classmethod
    def validate_spo2_exit(cls, v):
        if v is not None and not 1 <= v <= 100:
            raise ValueError("SpO2 at exit from trial gas must be between 1 and 100 percent")
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
    original_gestation_weeks: Optional[int] = None
    original_gestation_days: Optional[int] = None
    gestation_source: Optional[str] = None

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
    multiple_other: Optional[str] = None

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
    steroid_courses_status: Optional[str] = None
    steroid_courses: Optional[str] = None
    steroid_beta_doses: Optional[int] = None
    steroid_dexa_doses: Optional[int] = None
    steroid_beta_courses: Optional[int] = None
    steroid_dexa_courses: Optional[int] = None
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
    hypothyroidism: Optional[bool] = None
    hyperthyroidism: Optional[bool] = None
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

    @field_validator(
        "steroid_doses",
        "steroid_courses",
        "lddi_hours",
        "pprom_duration",
        "duration_rom",
        mode="before",
    )
    @classmethod
    def stringify_numeric_text_fields(cls, v):
        if v is None:
            return v
        return str(v)


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
    ga_method: str | None = None
    gender: str | None = None
    growth_status: str | None = None
    sga_centile: str | None = None

    plastic_wrap: bool | None = None
    remained_intubated: bool | None = None
    et_intubation: bool | None = None
    labored_breathing: bool | None = None

    surfactant_required: bool | None = None
    surfactant_indication: str | None = None
    cpap_cm: float | None = None
    fio2_percent: float | None = None
    surfactant_method: str | None = None
    premedication_given: bool | None = None
    premedication_drugs: str | None = None
    premedication_other: str | None = None
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
    lisa_catheter_other: str | None = None
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
    finalized: Optional[bool] = None

class NICUAdmissionOut(NICUAdmissionCreate):
    id: int

    class Config:
        from_attributes = True        
# ==========================================================
# FORM F — NEONATAL MORBIDITIES
# ==========================================================

def _blank_strings_to_none(data):
    """
    React controlled inputs (number/date/select) default to "" when untouched,
    not null/undefined. Form H has ~260 optional fields, so on any real submit
    plenty of them will still be "". Pydantic v2 will not coerce "" into an
    int/float/date, so without this every partially-filled submission would
    fail with a 422. Treat "" as "not answered" (None) uniformly, for every
    field, before type validation runs.
    """
    if not isinstance(data, dict):
        return data
    return {k: (None if v == "" else v) for k, v in data.items()}


class InfectionEpisode(BaseModel):
    """
    One entry in Form H's H10 INFECTION section. The CRF (Word doc) hardcodes
    two copies of this field set ("INFECTION 1" / "INFECTION 2"); the frontend
    now models it as a repeatable list instead, so this can hold any number of
    episodes per patient.
    """

    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        return _blank_strings_to_none(data)

    sepsis: Optional[str] = None
    sepsis_episode_number: Optional[int] = None
    vap_episode_number: Optional[int] = None
    sepsis_clinical: Optional[bool] = None
    sepsis_screen: Optional[bool] = None
    sepsis_culture: Optional[bool] = None
    sepsis_onset_age: Optional[int] = None
    blood_culture_age_hours: Optional[int] = None
    blood_culture_age_days: Optional[int] = None

    screen_crp: Optional[bool] = None
    screen_pct: Optional[bool] = None
    screen_other: Optional[bool] = None
    screen_other_text: Optional[str] = None

    culture_blood: Optional[bool] = None
    culture_csf: Optional[bool] = None
    culture_urine: Optional[bool] = None
    culture_other: Optional[bool] = None
    culture_other_text: Optional[str] = None

    gram_positive: Optional[bool] = None
    gram_negative: Optional[bool] = None
    fungus: Optional[bool] = None

    staph_aureus: Optional[bool] = None
    staph_hemolyticus: Optional[bool] = None
    staph_epidermidis: Optional[bool] = None
    gp_other: Optional[bool] = None
    gp_other_text: Optional[str] = None

    acinetobacter: Optional[bool] = None
    ecoli: Optional[bool] = None
    klebsiella: Optional[bool] = None
    serratia: Optional[bool] = None
    pseudomonas: Optional[bool] = None
    gn_other: Optional[bool] = None
    gn_other_text: Optional[str] = None

    mdr: Optional[str] = None
    xdr: Optional[str] = None

    focus_septicemia: Optional[bool] = None
    focus_pneumonia: Optional[bool] = None
    focus_meningitis: Optional[bool] = None
    focus_bone_joint: Optional[bool] = None
    focus_uti: Optional[bool] = None
    focus_other: Optional[bool] = None
    focus_other_text: Optional[str] = None

    clabsi: Optional[str] = None
    vap: Optional[str] = None

    # CRF #233–234 (Infection 1) / #251–252 (Infection 2) — totals sit inside
    # each printed infection block, so they are stored per episode as well.
    total_sepsis_episodes: Optional[int] = None
    total_vap_episodes: Optional[int] = None


class NeonatalMorbiditiesCreate(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        return _blank_strings_to_none(data)

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

    # ================================================================
    # EXTENDED FIELDS (added to match the full Form H / CRF field set —
    # previously these ~248 fields were collected by the frontend but
    # silently dropped on save because they weren't in this schema.)
    # ================================================================

    # ---------------- NEUROLOGICAL (H1) — extended ----------------
    aed_number: Optional[str] = None
    aed_other: Optional[str] = None
    aed_type: Optional[List[str]] = []
    ahw: Optional[float] = None
    eeg_result: Optional[str] = None
    etiology: Optional[str] = None
    etiology_other: Optional[str] = None
    ich_type: Optional[str] = None
    ivh_date_left: Optional[date] = None
    ivh_date_right: Optional[date] = None
    ivh_age_days_left: Optional[int] = None
    ivh_age_days_right: Optional[int] = None
    ivh_description: Optional[str] = None
    ivh_description_left: Optional[str] = None
    ivh_description_right: Optional[str] = None
    ivh_grade_left: Optional[str] = None
    ivh_grade_right: Optional[str] = None
    ivh_present: Optional[str] = None
    pvl_date_left: Optional[date] = None
    pvl_date_right: Optional[date] = None
    pvl_grade_left: Optional[str] = None
    pvl_grade_right: Optional[str] = None
    pvl_present: Optional[str] = None
    pvl_age_days_left: Optional[int] = None   # CRF #20
    pvl_age_days_right: Optional[int] = None  # CRF #17
    status_epilepticus: Optional[bool] = None  # CRF #31
    tod_max: Optional[float] = None
    ventriculomegaly_present: Optional[str] = None
    vi_max: Optional[float] = None

    # ---------------- RESPIRATORY (H2) — extended ----------------
    age_steroid: Optional[int] = None
    apnea_onset_age: Optional[int] = None
    bpd_support_36w: Optional[str] = None
    caffeine_duration: Optional[int] = None
    caffeine_used: Optional[str] = None
    cpap: Optional[str] = None
    cpap_used: Optional[str] = None
    extubation_episodes: Optional[int] = None
    extubation_failure: Optional[str] = None
    hc_after_first: Optional[bool] = None
    hc_after_second: Optional[bool] = None
    hc_first_drug: Optional[bool] = None
    hfnc: Optional[str] = None
    hfnc_days: Optional[int] = None
    hfnc_used: Optional[str] = None
    hydrocortisone_bp: Optional[str] = None
    imv_days: Optional[int] = None
    imv_used: Optional[str] = None
    invasive_ventilation: Optional[str] = None
    nasal_cannula: Optional[str] = None
    nasal_cannula_days: Optional[int] = None
    nasal_cannula_used: Optional[str] = None
    nippv: Optional[str] = None
    nippv_days: Optional[int] = None
    nippv_used: Optional[str] = None
    o2_days: Optional[int] = None
    oxygen_exposure: Optional[float] = None
    pulmonary_hypertension: Optional[str] = None
    rx_ino: Optional[bool] = None
    rx_miliri: Optional[bool] = None
    rx_other: Optional[bool] = None
    rx_other_text: Optional[str] = None
    rx_sildenafil: Optional[bool] = None
    rx_vaso: Optional[bool] = None
    steroid_dose: Optional[float] = None
    steroid_dose_2: Optional[float] = None
    steroid_drug_other: Optional[str] = None
    steroid_indication_other: Optional[str] = None

    # ---------------- GASTROINTESTINAL (H3) — extended ----------------
    age_first_feed: Optional[int] = None
    age_full_feeds: Optional[int] = None
    age_full_feeds_summary: Optional[int] = None
    bifidobacterium: Optional[str] = None
    ebm_days: Optional[int] = None
    fi_abdominal_distension: Optional[bool] = None
    fi_altered_aspirates: Optional[bool] = None
    fi_prefeed_aspirates: Optional[bool] = None
    fi_sluggish_bowel: Optional[bool] = None
    fi_others: Optional[bool] = None
    fi_others_text: Optional[str] = None
    strain_others: Optional[bool] = None
    fm_days: Optional[int] = None
    lactobacillus: Optional[str] = None
    nec_age_days: Optional[int] = None
    nec_resection: Optional[str] = None
    nec_resection_length: Optional[float] = None
    nec_stoma: Optional[str] = None
    nec_surgery_type: Optional[str] = None
    pdhm_days: Optional[int] = None
    pn_acidosis: Optional[bool] = None
    pn_adverse: Optional[str] = None
    pn_cholestasis: Optional[bool] = None
    pn_days_summary: Optional[int] = None
    pn_electrolyte: Optional[bool] = None
    pn_hypercapnia: Optional[bool] = None
    pn_other: Optional[bool] = None
    pn_other_text: Optional[str] = None
    probiotic: Optional[str] = None
    strain_bi: Optional[bool] = None
    strain_mono: Optional[bool] = None
    strain_multi: Optional[bool] = None
    tpn_associated: Optional[str] = None

    # ---------------- METABOLIC (H4) — extended ----------------
    alp_peak: Optional[float] = None
    dyselectro_ca: Optional[bool] = None
    dyselectro_k: Optional[bool] = None
    dyselectro_na: Optional[bool] = None
    dyselectrolytemia: Optional[str] = None
    hyperglycemia: Optional[str] = None
    hyperglycemia_highest: Optional[float] = None
    hyperglycemia_rx: Optional[str] = None
    hypoglycemia: Optional[str] = None
    hypoglycemia_episodes: Optional[int] = None
    hypoglycemia_lowest: Optional[float] = None
    hypoglycemia_rx: Optional[str] = None
    hypoglycemia_rx_duration: Optional[int] = None
    lowest_calcium: Optional[float] = None
    lowest_phosphorus: Optional[float] = None
    metabolic_acidosis: Optional[str] = None
    osteopenia: Optional[str] = None
    hyponatremia: Optional[bool] = None
    hyponatremia_status: Optional[str] = None
    hyponatremia_symptoms: Optional[str] = None
    hypernatremia: Optional[bool] = None
    hypernatremia_status: Optional[str] = None
    hypernatremia_symptoms: Optional[str] = None
    hypokalemia: Optional[bool] = None
    hypokalemia_status: Optional[str] = None
    hypokalemia_symptoms: Optional[str] = None
    hyperkalemia: Optional[bool] = None
    hyperkalemia_status: Optional[str] = None
    hyperkalemia_symptoms: Optional[str] = None
    hypocalcemia: Optional[bool] = None
    hypocalcemia_status: Optional[str] = None
    hypocalcemia_symptoms: Optional[str] = None
    hypercalcemia: Optional[bool] = None
    hypercalcemia_status: Optional[str] = None
    hypercalcemia_symptoms: Optional[str] = None

    # ---------------- CARDIOVASCULAR (H5) — extended ----------------
    dbp: Optional[float] = None
    fluid_bolus: Optional[str] = None
    fluid_bolus_number: Optional[int] = None
    hypotension_both: Optional[bool] = None
    hypotension_diastolic: Optional[bool] = None
    hypotension_systolic: Optional[bool] = None
    inotrope_adr: Optional[bool] = None
    inotrope_dobu: Optional[bool] = None
    inotrope_dopa: Optional[bool] = None
    inotrope_duration: Optional[int] = None
    inotrope_milri: Optional[bool] = None
    inotrope_nadr: Optional[bool] = None
    inotrope_vaso: Optional[bool] = None
    pda_both: Optional[bool] = None
    pda_bounding_pulse: Optional[bool] = None
    pda_clinical: Optional[bool] = None
    pda_courses: Optional[int] = None
    pda_cumulative_dose: Optional[float] = None
    pda_echo: Optional[bool] = None
    pda_hyperactive_precordium: Optional[bool] = None
    pda_ibu: Optional[bool] = None
    pda_indo: Optional[bool] = None
    pda_intervention_rx: Optional[str] = None
    pda_device_closure_age: Optional[int] = None
    pda_la_ao: Optional[float] = None
    pda_ligation_age: Optional[int] = None
    pda_lpa_velocity: Optional[float] = None
    pda_medical_rx: Optional[str] = None
    pda_murmur: Optional[bool] = None
    pda_other_feature: Optional[bool] = None
    pda_other_feature_text: Optional[str] = None
    pda_pattern_growing: Optional[bool] = None
    pda_pattern_none: Optional[bool] = None
    pda_pattern_pulsatile: Optional[bool] = None
    pda_pcm: Optional[bool] = None
    pda_peak_velocity: Optional[float] = None
    pda_shunt: Optional[str] = None
    pda_systemic_steal: Optional[str] = None
    pda_tdd: Optional[float] = None
    pda_wide_pp: Optional[bool] = None
    sbp: Optional[float] = None
    structural_heart_disease: Optional[str] = None
    structural_heart_disease_detail: Optional[str] = None
    vis_score: Optional[float] = None

    # ---------------- HEMATOLOGY (H6) — extended ----------------
    anemia: Optional[str] = None
    anemia_chf: Optional[str] = None
    anemia_etiology: Optional[str] = None
    anemia_etiology_other: Optional[str] = None
    anemia_onset: Optional[float] = None
    anemia_symptoms: Optional[str] = None        # CRF #163
    anemia_symptoms_other: Optional[str] = None
    bind: Optional[str] = None
    cmv_screened: Optional[str] = None
    dvet: Optional[str] = None
    dvet_number: Optional[int] = None
    ffp_cryo: Optional[str] = None
    ffp_number: Optional[int] = None
    irradiated: Optional[str] = None
    ivig: Optional[str] = None
    jaundice_etiology: Optional[str] = None
    jaundice_etiology_other: Optional[str] = None
    jaundice_intervention: Optional[str] = None  # CRF #147
    jaundice_onset: Optional[date] = None
    jaundice_passive: Optional[date] = None
    jaundice_type: Optional[str] = None
    leukoreduced: Optional[str] = None           # CRF #171
    lowest_hb: Optional[float] = None
    peak_tsb: Optional[float] = None
    phototherapy: Optional[str] = None
    platelet_number: Optional[int] = None
    platelets: Optional[str] = None
    prbc: Optional[str] = None
    prbc_number: Optional[int] = None
    prbc_volume: Optional[float] = None

    # ---------------- RENAL (H7) — extended ----------------
    aki: Optional[str] = None
    aki_date: Optional[date] = None
    aki_dialysis: Optional[str] = None
    aki_oliguria: Optional[str] = None
    aki_peak_creatinine: Optional[float] = None
    aki_stage1: Optional[bool] = None
    aki_stage2: Optional[bool] = None
    aki_stage3: Optional[bool] = None

    # ---------------- OPHTHALMOLOGY / ROP (H8) — extended ----------------
    rop: Optional[str] = None
    rop_anti_vegf: Optional[bool] = None
    rop_arop: Optional[str] = None
    rop_bilateral: Optional[str] = None
    rop_comment: Optional[str] = None
    rop_diagnosis_date: Optional[date] = None
    rop_first_screen_date: Optional[date] = None
    rop_laser: Optional[bool] = None
    rop_method: Optional[str] = None
    rop_method_ido: Optional[bool] = None
    rop_method_retcam: Optional[bool] = None
    rop_other: Optional[bool] = None
    rop_other_text: Optional[str] = None
    rop_plus: Optional[str] = None
    rop_screened: Optional[str] = None
    rop_side: Optional[str] = None
    rop_stage1: Optional[bool] = None
    rop_stage2: Optional[bool] = None
    rop_stage3: Optional[bool] = None
    rop_stage4: Optional[bool] = None
    rop_stage5: Optional[bool] = None
    rop_treatment: Optional[str] = None
    rop_vitrectomy: Optional[bool] = None
    rop_zone1: Optional[bool] = None
    rop_zone2: Optional[bool] = None
    rop_zone3: Optional[bool] = None
    rop_stage_right: Optional[str] = None
    rop_plus_right: Optional[str] = None
    rop_zone_right: Optional[str] = None
    rop_arop_right: Optional[str] = None
    rop_treatment_right: Optional[str] = None
    rop_laser_right: Optional[bool] = None
    rop_anti_vegf_right: Optional[bool] = None
    rop_vitrectomy_right: Optional[bool] = None
    rop_other_right: Optional[bool] = None
    rop_other_text_right: Optional[str] = None
    rop_stage_left: Optional[str] = None
    rop_plus_left: Optional[str] = None
    rop_zone_left: Optional[str] = None
    rop_arop_left: Optional[str] = None
    rop_treatment_left: Optional[str] = None
    rop_laser_left: Optional[bool] = None
    rop_anti_vegf_left: Optional[bool] = None
    rop_vitrectomy_left: Optional[bool] = None
    rop_other_left: Optional[bool] = None
    rop_other_text_left: Optional[str] = None

    # ---------------- THERMOREGULATION (H8) — extended ----------------
    hyperthermia: Optional[str] = None
    hyperthermia_clothing: Optional[bool] = None
    hyperthermia_environment: Optional[bool] = None
    hyperthermia_equipment: Optional[bool] = None
    hyperthermia_location_dr: Optional[bool] = None
    hyperthermia_location_nicu: Optional[bool] = None
    hyperthermia_location_transport: Optional[bool] = None
    hyperthermia_other: Optional[bool] = None
    hyperthermia_other_text: Optional[str] = None
    hyperthermia_probe: Optional[bool] = None
    hyperthermia_sepsis: Optional[bool] = None
    hyperthermia_temp: Optional[float] = None
    hyperthermia_wrap: Optional[bool] = None
    hypothermia: Optional[str] = None
    hypothermia_environment: Optional[bool] = None
    hypothermia_immaturity: Optional[bool] = None
    hypothermia_ivh: Optional[bool] = None
    hypothermia_location_dr: Optional[bool] = None
    hypothermia_location_nicu: Optional[bool] = None
    hypothermia_location_transport: Optional[bool] = None
    hypothermia_lowest_temp: Optional[float] = None
    hypothermia_mild: Optional[bool] = None
    hypothermia_moderate: Optional[bool] = None
    hypothermia_other: Optional[bool] = None
    hypothermia_other_text: Optional[str] = None
    hypothermia_sepsis: Optional[bool] = None
    hypothermia_severe: Optional[bool] = None

    # ---------------- VASCULAR ACCESS (H9) — extended ----------------
    arterial_posterior_tibial: Optional[bool] = None
    arterial_radial: Optional[bool] = None
    extravasation: Optional[str] = None
    line_comp_infection: Optional[bool] = None
    line_comp_none: Optional[bool] = None
    line_comp_thrombosis: Optional[bool] = None
    line_comp_phlebitis: Optional[bool] = None
    peripheral_arterial: Optional[str] = None
    peripheral_venous: Optional[str] = None
    picc: Optional[str] = None
    picc_days: Optional[int] = None
    uac: Optional[str] = None
    uac_days: Optional[int] = None
    uvc: Optional[str] = None
    uvc_days: Optional[int] = None

    # ---------------- INFECTION (H10) — cumulative totals ----------------
    vap_episodes: Optional[int] = None

    # ---------------- HOSPITAL COURSE (H12) — extended ----------------
    back_referral_hospital: Optional[str] = None
    back_referral_other: Optional[str] = None
    designation: Optional[str] = None
    discharge_hc: Optional[float] = None
    total_los: Optional[int] = None

    # ---------------- INFECTION (H10) — dynamic, repeatable episodes ----------------
    infections: Optional[List[InfectionEpisode]] = []


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

    # ---- Form I extended fields (sections I.1-I.6) ----
    resus_chest_compressions: Optional[bool] = None

    sepsis_eos: Optional[bool] = None
    sepsis_los: Optional[bool] = None
    culture_positive_sepsis: Optional[bool] = None
    culture_positive_body_fluid: Optional[str] = None
    mortality_7d_cause: Optional[str] = None
    mortality_7d_date: Optional[date] = None
    mortality_7d_time: Optional[str] = None
    mortality_7d_age_hrs: Optional[float] = None
    mortality_28d_cause: Optional[str] = None
    mortality_28d_date: Optional[date] = None
    mortality_28d_time: Optional[str] = None
    mortality_28d_age_days: Optional[float] = None

    encounter36_method: Optional[str] = None
    encounter36_other: Optional[str] = None
    encounter36_other_text: Optional[str] = None
    death36: Optional[bool] = None
    death36_cause: Optional[str] = None
    death36_date: Optional[date] = None
    death36_time: Optional[str] = None
    death36_age_days: Optional[float] = None
    bpd36_jensen_grade: Optional[str] = None
    bpd36_jensen_date: Optional[date] = None
    bpd36_nichd_radiographic: Optional[bool] = None
    bpd36_nichd_fio2: Optional[float] = None
    bpd36_nichd_flow: Optional[float] = None
    bpd36_nichd_grade: Optional[str] = None
    bpd36_nichd_date: Optional[date] = None
    nec36_stage: Optional[bool] = None
    nec36_surgery: Optional[bool] = None
    nec36_date: Optional[date] = None
    ivh36_grade3: Optional[bool] = None
    ivh36_date: Optional[date] = None
    cpvl36_grade2: Optional[bool] = None
    cpvl36_date: Optional[date] = None
    rop36: Optional[bool] = None
    rop36_treated: Optional[bool] = None
    rop36_date: Optional[date] = None

    encounter40_method: Optional[str] = None
    encounter40_other: Optional[str] = None
    encounter40_other_text: Optional[str] = None
    death40: Optional[bool] = None
    death40_cause: Optional[str] = None
    death40_date: Optional[date] = None
    death40_time: Optional[str] = None
    death40_age_days: Optional[float] = None
    nec40_stage: Optional[bool] = None
    nec40_surgery: Optional[bool] = None
    nec40_date: Optional[date] = None
    ivh40_grade3: Optional[bool] = None
    ivh40_date: Optional[date] = None
    cpvl40_grade2: Optional[bool] = None
    cpvl40_date: Optional[date] = None
    rop40: Optional[bool] = None
    rop40_treated: Optional[bool] = None
    rop40_date: Optional[date] = None
    abnormal_mri_tea: Optional[str] = None

    encounter44_method: Optional[str] = None
    encounter44_other: Optional[str] = None
    encounter44_other_text: Optional[str] = None
    death44: Optional[bool] = None
    death44_cause: Optional[str] = None
    death44_date: Optional[date] = None
    death44_time: Optional[str] = None
    death44_age_days: Optional[float] = None
    nec44_stage: Optional[bool] = None
    nec44_surgery: Optional[bool] = None
    nec44_date: Optional[date] = None
    ivh44_grade3: Optional[bool] = None
    ivh44_date: Optional[date] = None
    cpvl44_grade2: Optional[bool] = None
    cpvl44_date: Optional[date] = None
    rop44_assessed: Optional[bool] = None
    rop44_treated: Optional[bool] = None
    rop44_date: Optional[date] = None

    nippv_days: Optional[int] = None
    sepsis_overall_episodes: Optional[int] = None
    mortality_hospital_cause: Optional[str] = None
    mortality_hospital_date: Optional[date] = None
    mortality_hospital_time: Optional[str] = None
    mortality_hospital_age_days: Optional[float] = None
    mortality_after_discharge_cause: Optional[str] = None
    mortality_after_discharge_date: Optional[date] = None
    mortality_after_discharge_time: Optional[str] = None
    mortality_after_discharge_age_days: Optional[float] = None

    # Free-text Additional information per CRF row number, e.g. {"1": "note", "7": "..."}
    crf_additional_notes: Optional[dict] = None


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

    gestation_weeks: Optional[int] = None
    birth_weight: Optional[float] = None
    dob: Optional[date] = None

    risk_factors: Optional[list] = None
    screenings: Optional[list] = None

    # RIGHT EYE (CRF items 1-8)
    worst_stage: Optional[str] = None
    worst_zone: Optional[str] = None
    plus_disease: Optional[bool] = None
    a_rop: Optional[bool] = None

    treatment_required: Optional[bool] = None
    treatment_type: Optional[list] = None
    anti_vegf_agent: Optional[str] = None
    treatment_re_date: Optional[date] = None
    pma_at_treatment_re: Optional[str] = None

    # LEFT EYE (CRF items 9-16) — independent of RIGHT
    worst_stage_le: Optional[str] = None
    worst_zone_le: Optional[str] = None
    plus_disease_le: Optional[bool] = None
    a_rop_le: Optional[bool] = None

    treatment_required_le: Optional[bool] = None
    treatment_type_le: Optional[list] = None
    anti_vegf_agent_le: Optional[str] = None
    treatment_le_date: Optional[date] = None
    pma_at_treatment_le: Optional[str] = None

    # Outcome (CRF items 17-20)
    outcome: Optional[str] = None
    outcome_other_text: Optional[str] = None
    final_screening_date: Optional[date] = None
    pma_discharge: Optional[str] = None
    rop_treatment_composite: Optional[bool] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    signature: Optional[str] = None
    completion_date: Optional[date] = None


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


# ── Form J: External Hospital Assessment (per 36/40/44 week visit) ──
class ExternalHospitalAssessmentCreate(BaseModel):
    enrollment_id: str
    assessment_weeks: int  # 36, 40, or 44

    mother_name: Optional[str] = None
    dob: Optional[date] = None

    death: Optional[bool] = None
    death_cause: Optional[str] = None
    death_date: Optional[date] = None
    death_time: Optional[str] = None
    death_age_days: Optional[int] = None

    resp_support: Optional[bool] = None
    resp_support_date: Optional[date] = None
    resp_mode: Optional[str] = None
    flow_rate: Optional[float] = None
    fio2: Optional[float] = None
    radiographic_lung: Optional[bool] = None

    nec: Optional[bool] = None
    nec_stage: Optional[str] = None
    nec_date: Optional[date] = None
    nec_surgery: Optional[bool] = None

    ivh_right: Optional[str] = None
    ivh_right_date: Optional[date] = None
    ivh_left: Optional[str] = None
    ivh_left_date: Optional[date] = None
    cpvl_right: Optional[str] = None
    cpvl_right_date: Optional[date] = None
    cpvl_left: Optional[str] = None
    cpvl_left_date: Optional[date] = None

    rop_right: Optional[str] = None
    plus_right: Optional[bool] = None
    arop_right: Optional[bool] = None
    zone_right: Optional[str] = None
    treat_right: Optional[bool] = None
    treat_date_right: Optional[date] = None

    rop_left: Optional[str] = None
    plus_left: Optional[bool] = None
    arop_left: Optional[bool] = None
    zone_left: Optional[str] = None
    treat_left: Optional[bool] = None
    treat_date_left: Optional[date] = None

    sepsis: Optional[bool] = None
    sepsis_episodes: Optional[int] = None

    mri_done: Optional[bool] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    hospital: Optional[str] = None
    completion_date: Optional[date] = None

    model_config = {"extra": "allow"}


class ExternalHospitalAssessmentOut(ExternalHospitalAssessmentCreate):
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
    """
    Form Y — SAE Reporting. Fields are optional so drafts can be saved without
    422s; empty strings from the UI are treated as None. Required clinical
    completeness is enforced in the form workflow, not as hard API rejects.
    """

    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        return _blank_strings_to_none(data)

    study_id: Optional[str] = None
    enrollment_id: str
    report_type: Optional[str] = None
    report_date: Optional[str] = None

    diagnosis: Optional[str] = None
    onset_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    ongoing: Optional[bool] = False

    seriousness: Optional[List[str]] = None

    severity: Optional[str] = None
    causality: Optional[str] = None
    action_taken: Optional[str] = None
    outcome: Optional[str] = None
    date_of_death: Optional[str] = None

    narrative: Optional[str] = None

    reporter_name: Optional[str] = None
    reporter_designation: Optional[str] = None
    reporter_contact: Optional[str] = None
    reporter_date: Optional[str] = None
    reporter_signature: Optional[str] = None

    investigator_name: Optional[str] = None
    investigator_signature: Optional[str] = None
    investigator_date: Optional[str] = None
    site: Optional[str] = None

    class Config:
        extra = "ignore"


class SAEReportOut(SAEReportCreate):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        extra = "ignore"  

class AdverseEventRow(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        return _blank_strings_to_none(data)

    description: Optional[str] = None
    definition_no: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    severity_desc: Optional[str] = None
    grade: Optional[str] = None
    converted_to_sae: Optional[str] = None

    class Config:
        extra = "ignore"


class AdverseEventsCreate(BaseModel):
    """Helper Form — Adverse Events (INC AE Scale v1.0)."""

    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        return _blank_strings_to_none(data)

    enrollment_id: str
    mother_name: Optional[str] = None
    baby_uid: Optional[str] = None
    maternal_uid: Optional[str] = None

    has_adverse_event: Optional[bool] = None

    events: Optional[List[AdverseEventRow]] = None

    completed_by: Optional[str] = None
    designation: Optional[str] = None
    completion_date: Optional[str] = None

    class Config:
        extra = "ignore"


class AdverseEventsOut(AdverseEventsCreate):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        extra = "ignore" 

class SAEListRow(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        return _blank_strings_to_none(data)

    sae: Optional[str] = None
    definition_no: Optional[str] = None
    start_date: Optional[str] = None
    notification_24h: Optional[str] = None
    end_date: Optional[str] = None
    notify_initial: Optional[str] = None
    notify_10d: Optional[str] = None
    notify_resolution: Optional[str] = None

    class Config:
        extra = "ignore"


class SAEListCreate(BaseModel):
    """Helper Form — Serious Adverse Events Listing."""

    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data):
        return _blank_strings_to_none(data)

    enrollment_id: str
    rows: Optional[List[SAEListRow]] = None
    completed_by: Optional[str] = None
    designation: Optional[str] = None
    completion_date: Optional[str] = None

    class Config:
        extra = "ignore"


class SAEListOut(SAEListCreate):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        extra = "ignore"
class RespCVNeuroDayCreate(BaseModel):
    enrollment_id: str
    nicu_day:      int

    # 2.1 Weight
    weight_kg: Optional[str] = None

    # Respiratory
    respiratory_support: Optional[bool]  = None  # #1
    endotracheal_intubation: Optional[bool] = None  # #2
    support_modes:      Optional[str]   = None  # #3
    map_cpap:           Optional[float] = None  # #4 (MAP value, or CPAP value if CPAP is the only pressure mode)
    map_cpap_secondary: Optional[float] = None  # #4b — CPAP value, only used when CPAP AND a MAP-generating mode (NIPPV/SIMV/A-C/PSV/HFOV) are BOTH selected
    max_fio2:           Optional[float] = None  # #5
    max_flow:           Optional[float] = None  # #6
    supp_o2:            Optional[bool]  = None  # #7
    lowest_ph:          Optional[str]   = None  # #8
    pao2_range:         Optional[str]   = None  # #9
    paco2_range:        Optional[str]   = None  # #10
    surfactant:         Optional[bool]  = None  # #11
    caffeine:           Optional[bool]  = None  # #12
    apnea_count:              Optional[str] = None  # #13
    desaturation_count:       Optional[str] = None  # #14
    severe_desaturation_count: Optional[str] = None  # #15
    extub_attempted:    Optional[bool]  = None  # #16
    extub_failure:      Optional[bool]  = None  # #17
    pulm_hemorrhage:    Optional[bool]  = None  # #18
    pneumothorax:       Optional[bool]  = None  # #19
    chest_drain:        Optional[bool]  = None  # #20
    pphn:               Optional[bool]  = None  # #21
    postnatal_steroids: Optional[bool]  = None  # #22

    # Legacy fields kept for backward compatibility with old records
    # (superseded by apnea_count / desaturation_count above)
    apnea:              Optional[bool]  = None
    desaturations:      Optional[bool]  = None

    # Cardiovascular
    pda_suspected:      Optional[bool]  = None  # #23
    echo_done:          Optional[bool]  = None  # #24
    hs_pda:             Optional[bool]  = None  # #25
    shock:              Optional[bool]  = None  # #26
    vasoactive_support: Optional[bool]  = None  # #27
    vasoactive_drugs:   Optional[str]   = None  # #28
    fluid_bolus:        Optional[str]   = None  # #29

    # Legacy field kept for backward compatibility with old records
    pda_medical_rx:     Optional[bool]  = None

    # Neurological
    cranial_usg:          Optional[bool] = None  # #30
    ivh:                  Optional[bool] = None  # #31
    ivh_grade:            Optional[str]  = None
    cpvl_confirmed:       Optional[bool] = None  # #32
    ventriculomegaly:     Optional[bool] = None  # #33
    clinical_seizures:    Optional[bool] = None  # #34
    eeg_seizures:         Optional[bool] = None  # #35
    aeds_given:           Optional[bool] = None  # #36
    non_ivh_ich:          Optional[bool] = None  # #37

    # Legacy fields kept for backward compatibility with old records
    pvl_suspected:        Optional[bool] = None
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


class HelperFormRecordOut(BaseModel):
    """One row in the cross-patient Helper Form 2 (Resp/CV/Neuro) records list."""
    enrollment_id:     str
    screening_id:      Optional[str]      = None
    site_name:         Optional[str]      = None
    nicu_day:          int
    calendar_date:     Optional[date]     = None
    mother_name:       Optional[str]      = None
    submission_status: Optional[str]      = "empty"
    completion_pct:    Optional[int]      = 0
    saved_at:          Optional[datetime] = None
    saved_by:          Optional[str]      = None
    submitted_at:      Optional[datetime] = None
    submitted_by:      Optional[str]      = None
    created_at:        Optional[datetime] = None
    updated_at:        Optional[datetime] = None

    class Config:
        from_attributes = True


class HelperFormRecordsPage(BaseModel):
    total:    int
    page:     int
    per_page: int
    records:  List[HelperFormRecordOut]
# ─────────────────────────────────────────────────────────────
# Add these to schemas.py
# ─────────────────────────────────────────────────────────────
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class InfectGIHemaDayCreate(BaseModel):
    enrollment_id: str
    nicu_day:      int

    # ── INFECTION (Fields 1-9) ───────────────────────────────
    sepsis_suspected:       Optional[bool]  = None  # #1
    blood_culture_sent:     Optional[bool]  = None  # #2
    blood_culture_positive: Optional[bool]  = None  # #3
    antibiotics:            Optional[bool]  = None  # #4
    lp_done:                Optional[bool]  = None  # #5
    meningitis:             Optional[bool]  = None  # #6 Y/N
    meningitis_type:        Optional[str]   = None  # #7 Probable/Proven
    clabsi:                 Optional[bool]  = None  # #8
    vap:                    Optional[bool]  = None  # #9

    # ── GASTROINTESTINAL (Fields 10-22) ──────────────────────
    npo:                     Optional[bool]  = None  # #10
    men:                     Optional[bool]  = None  # #11 Minimal Enteral Nutrition
    enteral_feeds_received:  Optional[bool]  = None  # #12
    feed_type:               Optional[str]   = None  # #13 "PDHM,EBM,FM"
    cumulative_feed_volume:  Optional[float] = None  # #14 ml/kg/day
    feed_volume:             Optional[float] = None  # #15 ml/kg/day
    iv_fluids:               Optional[bool]  = None  # #16
    parenteral_nutrition:    Optional[bool]  = None  # #17
    probiotic:               Optional[bool]  = None  # #18
    feed_intolerance:        Optional[bool]  = None  # #19
    nec_suspected:           Optional[bool]  = None  # #20
    nec_confirmed_stage:     Optional[str]   = None  # #21 "Stage I/II/III"
    cholestasis:             Optional[bool]  = None  # #22

    # ── HEMATOLOGY (Fields 23-30) ────────────────────────────
    hb_value:               Optional[float] = None  # #23 g/dL
    jaundice:               Optional[bool]  = None  # #24
    phototherapy:           Optional[bool]  = None  # #25 (conditional)
    peak_tsb:               Optional[float] = None  # #26 mg/dL
    exchange_transfusion:   Optional[bool]  = None  # #27
    prbc_transfusion:       Optional[bool]  = None  # #28
    platelet_transfusion:   Optional[bool]  = None  # #29
    ffp_cryo:               Optional[bool]  = None  # #30

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

    # 4.1 Metabolic
    lowest_glucose:         Optional[str]   = None  # #1
    hypoglycemia_episodes:  Optional[str]   = None  # #2
    hypoglycemia_rx:        Optional[bool]  = None  # #3
    highest_glucose:        Optional[str]   = None  # #4
    insulin:                Optional[bool]  = None  # #5
    metabolic_acidosis:     Optional[bool]  = None  # #6 (derived)
    sodium_value:           Optional[str]   = None  # #7 summary
    potassium_value:        Optional[str]   = None  # #8 summary
    ionized_calcium_value:  Optional[str]   = None  # #9 summary
    osteopenia_suspected:   Optional[bool]  = None  # #10

    ph_readings_json:         Optional[str] = None
    sodium_readings_json:     Optional[str] = None
    potassium_readings_json:  Optional[str] = None
    calcium_readings_json:    Optional[str] = None

    # Legacy — superseded by the numbered fields above
    hypoglycemia:           Optional[bool]  = None
    hyperglycemia:          Optional[bool]  = None
    dyselectrolytemia:      Optional[bool]  = None
    dyselectrolytemia_type: Optional[str]   = None

    # 4.2 Renal
    aki_suspected:          Optional[bool]  = None  # #11 Yes/No
    aki_stage:              Optional[str]   = None  # KDIGO stage when #11 Yes
    creatinine:             Optional[float] = None  # legacy float
    creatinine_value:       Optional[str]   = None  # #12 numeric | Not Tested | Awaited
    urine_output_8am_2pm:   Optional[float] = None
    urine_output_2pm_8pm:   Optional[float] = None
    urine_output_8pm_8am:   Optional[float] = None
    urine_output_total:     Optional[str]   = None  # #13 summary (sum)
    dialysis_crrt:          Optional[bool]  = None  # #14

    # Legacy
    aki_kdigo_stage:        Optional[str]   = None
    urine_output_low:       Optional[bool]  = None

    # 4.3 Thermoregulation
    axillary_temperature:   Optional[str]   = None  # #15

    # Legacy — superseded by axillary_temperature above
    hypothermia:            Optional[bool]  = None
    hyperthermia:           Optional[bool]  = None

    # 4.4 Vascular access
    picc_in_situ:           Optional[bool]  = None  # #16
    uvc_in_situ:            Optional[bool]  = None  # #17
    uac_in_situ:            Optional[bool]  = None  # #18
    peripheral_iv:          Optional[bool]  = None  # #19
    peripheral_arterial:    Optional[bool]  = None  # #20
    extravasation_injury:   Optional[bool]  = None  # #21
    line_complication:      Optional[bool]  = None  # #22

    # 4.5 Ophthalmology
    rop_screening_due:      Optional[bool]  = None  # #23
    rop_screened:           Optional[bool]  = None  # #24
    rop_detected:           Optional[bool]  = None  # #25
    rop_stage:              Optional[str]   = None
    plus_disease:           Optional[bool]  = None
    rop_treatment:          Optional[bool]  = None

    # 4.6 Location
    location:               Optional[str]   = None

    # 4.7 Survived the day
    survived_the_day:       Optional[bool]  = None

    submission_status:      Optional[str]      = "draft"
    saved_at:               Optional[datetime] = None
    saved_by:               Optional[str]      = None

    # The frontend's numeric inputs (Lowest/Highest Glucose, Sodium, Potassium,
    # Ionized Calcium, Urine Output Total, Axillary Temperature, Hypoglycemia
    # Episodes) send JS numbers, but these are stored as VARCHAR to allow
    # free-text entry (e.g. a range). Coerce int/float -> str here so a
    # numeric value from the form doesn't fail validation with a 422.
    @field_validator(
        "lowest_glucose", "hypoglycemia_episodes", "highest_glucose",
        "sodium_value", "potassium_value", "ionized_calcium_value",
        "urine_output_total", "axillary_temperature", "creatinine_value",
        mode="before",
    )
    @classmethod
    def _coerce_numeric_to_str(cls, v):
        if isinstance(v, (int, float)):
            return str(v)
        return v

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


class MinimalMonitoringDayCreate(BaseModel):
    enrollment_id: str
    nicu_day: Optional[int] = None

    record_date: Optional[str] = None
    shift: Optional[str] = None

    axillary_temp: Optional[float] = None
    sbp: Optional[float] = None
    dbp: Optional[float] = None
    map_value: Optional[float] = None
    fluid_bolus_given: Optional[str] = None
    vasoactive_drugs: Optional[str] = None
    vasoactive_dose: Optional[str] = None
    vasoactive_unit: Optional[str] = None
    pda_agent: Optional[str] = None
    pda_dose: Optional[str] = None

    respiratory_time: Optional[str] = None
    respiratory_modes: Optional[str] = None
    max_map_cpap: Optional[float] = None
    max_fio2: Optional[float] = None
    ph: Optional[float] = None
    pao2: Optional[float] = None
    paco2: Optional[float] = None
    apnea_episodes: Optional[int] = None
    desaturation_episodes: Optional[int] = None
    severe_desaturation_episodes: Optional[int] = None
    postnatal_steroids: Optional[str] = None
    steroid_dose: Optional[str] = None

    glucose: Optional[float] = None
    alp: Optional[float] = None
    total_calcium: Optional[float] = None
    phosphorus: Optional[float] = None
    electrolyte_abnormality: Optional[bool] = None
    electrolytes: Optional[str] = None
    hypo_hyper: Optional[str] = None
    symptomatic_status: Optional[str] = None
    symptomatic_detail: Optional[str] = None

    cumulative_feed_volume: Optional[float] = None
    direct_bilirubin: Optional[float] = None

    imaging_date: Optional[str] = None
    ventriculomegaly_severity: Optional[str] = None
    vi: Optional[float] = None
    ahw: Optional[float] = None
    tod: Optional[float] = None
    aca_ri: Optional[float] = None
    mca_ri: Optional[float] = None

    transfusion_products: Optional[str] = None
    transfusion_count: Optional[int] = None
    prbc_volume: Optional[float] = None

    entries_json: Optional[str] = None
    steroid_other: Optional[str] = None
    apnea_shift: Optional[str] = None
    feed_shift: Optional[str] = None

    submission_status: Optional[str] = "draft"
    saved_at: Optional[datetime] = None
    saved_by: Optional[str] = None


class MinimalMonitoringDaySubmit(BaseModel):
    submission_status: str
    submitted_at: datetime
    submitted_by: str


class MinimalMonitoringDayOut(MinimalMonitoringDayCreate):
    id: Optional[int] = None
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
    completed_by:            Optional[str]        = None
    designation:             Optional[str]        = None
    completion_date:         Optional[str]        = None


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
    sequences:        Optional[List[str]] = None

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

    model_config = {"extra": "ignore"}


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
    fio2_per_minute:     Optional[List]       = None  # 11-element list [min_0 … min_10]

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

    model_config = {"extra": "ignore"}


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
