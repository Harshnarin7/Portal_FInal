from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from datetime import datetime
import random, string
from models import RespiratoryLog
from auth import hash_password, verify_password
from core.security import create_access_token, create_refresh_token, verify_refresh_token
from config import ACCESS_TOKEN_EXPIRE_MINUTES
from db import Base, engine, SessionLocal, get_db
from models import SteroidData
import models
from models import (
    Screening, BirthResuscitation, MaternalDetails, PostnatalDay1,
    NICUAdmission, NeonatalMorbidities, StudyOutcomes,
    CranialUltrasound, ROPScreening, CompositeOutcome,
    FiO2AUC, RespCVNeuroLog, InfectGIHemaLog,
    MetabRenalVascEyeLog, SAEReport, AdverseEvents,
    SAEList, User
)
from schemas import ScreeningCreate, ScreeningClinicalOut, ScreeningOut, BirthResuscitationCreate, BirthResuscitationOut, MaternalDetailsCreate, MaternalDetailsOut, PostnatalDay1Create, PostnatalDay1Out,NICUAdmissionCreate,NICUAdmissionOut,NeonatalMorbiditiesCreate,NeonatalMorbiditiesOut,StudyOutcomesCreate, StudyOutcomesOut,CranialUltrasoundCreate, CranialUltrasoundOut,ROPScreeningCreate, ROPScreeningOut,CompositeOutcomeCreate, CompositeOutcomeOut, FiO2AUCLogCreate, FiO2AUCLogOut, RespCVNeuroLogCreate, RespCVNeuroLogOut,InfectGIHemaLogCreate, InfectGIHemaLogOut,MetabRenalVascEyeLogCreate,MetabRenalVascEyeLogOut,SAEReportCreate, SAEReportOut, AdverseEventsCreate, AdverseEventsOut ,SAEListCreate, SAEListOut, UserCreate, UserOut, LoginRequest, LoginResponse, RefreshTokenRequest, TokenRefreshResponse, RespiratoryLogCreate, RespiratoryLogBulkCreate, SteroidDataCreate, FirebaseScreeningImportCreate
from pydantic import BaseModel
from typing import Optional, List
from deps import get_current_user, is_superadmin, require_superadmin, ensure_same_site
from routers import enrollment
from routers import pii as pii_router
from routers import staff as staff_router
from routers import audit as audit_router
from audit_service import (
    record_audit,
    row_snapshot,
    stamp_created,
    stamp_updated,
    soft_delete_record,
)
from schema_patches import apply_schema_patches
from staff_service import seed_site_staff
import security_monitor
from pii_service import (
    SCREENING_PII_FIELDS,
    BIRTH_PII_FIELDS,
    MATERNAL_PII_FIELDS,
    POSTNATAL_PII_FIELDS,
    NICU_PII_FIELDS,
    LOG_PII_FIELDS,
    AE_PII_FIELDS,
    extract_screening_pii,
    clear_screening_pii_columns,
    split_and_store_pii,
    migrate_legacy_pii,
    upsert_participant_pii,
)

from sqlalchemy import text
import os
import logging

# ============================================================================
# LOGGING SETUP
# ============================================================================

logger = logging.getLogger(__name__)
logging.getLogger("portal.security").setLevel(logging.INFO)

# ============================================================================
# RATE LIMITER SETUP (Fix A6)
# ============================================================================

limiter = Limiter(
    key_func=get_remote_address,
    strategy="moving-window"
)

# ============================================================================
# DATABASE CONNECTION & INITIALIZATION
# ============================================================================

with engine.connect() as conn:
    db_name = conn.execute(text("SELECT current_database()")).scalar()
    print("✅ CONNECTED DB:", db_name)

Base.metadata.create_all(bind=engine)

# ============================================================================
# FASTAPI APPLICATION SETUP
# ============================================================================

app = FastAPI(title="PORTAL Trial API")
app.include_router(enrollment.router)
app.include_router(pii_router.router)
app.include_router(staff_router.router)
app.include_router(audit_router.router)


@app.on_event("startup")
def on_startup_migrations():
    try:
        apply_schema_patches(engine)
    except Exception as exc:
        logger.warning("Schema patches skipped: %s", exc)

    db = SessionLocal()
    try:
        migrated = migrate_legacy_pii(db)
        if migrated:
            logger.info(
                "Migrated PII for %s screening record(s) into participant_pii",
                migrated,
            )
        seeded = seed_site_staff(db)
        if seeded:
            logger.info("Seeded %s site staff record(s)", seeded)
    except Exception as exc:
        logger.warning("Startup migration skipped or failed: %s", exc)
    finally:
        db.close()


@app.middleware("http")
async def security_monitoring_middleware(request: Request, call_next):
    client_ip = get_remote_address(request)
    security_monitor.increment_request_count(client_ip)
    path = request.url.path
    if path.startswith("/docs") or path.startswith("/openapi"):
        return await call_next(request)
    response = await call_next(request)
    if response.status_code == 401 and path not in ("/auth/login", "/auth/refresh"):
        security_monitor.record_suspicious_request(
            client_ip, path, "unauthorized_access"
        )
    return response

# Add rate limiter to app
app.state.limiter = limiter

def rate_limit_error_handler(request: Request, exc: RateLimitExceeded):
    security_monitor.record_rate_limit(
        get_remote_address(request), request.url.path
    )
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "message": "Too many requests. Please try again later.",
        },
    )

app.add_exception_handler(RateLimitExceeded, rate_limit_error_handler)

# ============================================================================
# FIX A4: RESTRICT CORS TO SPECIFIC ORIGINS
# ============================================================================

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

print(f"📍 CORS Allowed Origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_screening_id(site_id: str):
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{site_id}-{timestamp}-{random_suffix}"

def compute_screening_status(data):
    if data.gestation_weeks is None:
        return "Screen Failure"
    if data.gestation_weeks >= 32:
        return "Screen Failure"
    if data.exclusion_present:
        return "Screen Failure"
    if data.consent_given == "Yes":
        return "Eligible"
    return "Not Eligible"

def get_accessible_screening_query(db: Session, user: User):
    query = db.query(Screening).filter(Screening.is_deleted.isnot(True))
    if not is_superadmin(user):
        query = query.filter(Screening.site_name == user.site_name)
    return query

def require_enrollment_access(enrollment_id: str, db: Session, user: User):
    screening = db.query(Screening).filter(Screening.enrollment_id == enrollment_id).first()
    if screening:
        ensure_same_site(screening.site_name, user)

def site_for_enrollment(db: Session, enrollment_id: str | None) -> str | None:
    if not enrollment_id:
        return None
    screening = db.query(Screening).filter(Screening.enrollment_id == enrollment_id).first()
    return screening.site_name if screening else None

# ============================================================================
# UTILITY ENDPOINTS
# ============================================================================

@app.get("/")
def root():
    return {"message": "PORTAL Trial API is running!"}

# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/users/", response_model=UserOut)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_user),  # TEMP: disabled to create first superadmin
):
    # require_superadmin(current_user)  # TEMP: disabled to create first superadmin
    # if is_superadmin(current_user) is False and user.role == "superadmin":  # TEMP
    #     raise HTTPException(status_code=403, detail="Cannot create this role")  # TEMP
    # if (user.role or "").lower() == "superadmin" and not is_superadmin(current_user):  # TEMP
    #     raise HTTPException(status_code=403, detail="Cannot create a superadmin user")  # TEMP

    existing = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    hashed_pwd = hash_password(user.password)

    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_pwd,
        role=user.role,
        site_name=user.site_name
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return db_user

# ============================================================================
# FIX A6: RATE LIMITED LOGIN ENDPOINT
# ============================================================================

@app.post("/auth/login", response_model=LoginResponse)
@limiter.limit("5/15 minutes")
async def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    client_ip = get_remote_address(request)

    if not user or not verify_password(data.password, user.hashed_password):
        security_monitor.record_failed_login(client_ip, data.username)
        logger.warning("Failed login attempt for user '%s' from IP: %s", data.username, client_ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    security_monitor.record_successful_login(user.username, client_ip)
    logger.info("Successful login for user '%s'", user.username)

    claims = {
        "sub": user.username,
        "role": user.role,
        "site_name": user.site_name,
    }
    access_token = create_access_token(claims)
    refresh_token = create_refresh_token(claims)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "role": user.role,
        "site_name": user.site_name,
        "expires_in_minutes": ACCESS_TOKEN_EXPIRE_MINUTES,
    }


@app.post("/auth/refresh", response_model=TokenRefreshResponse)
def refresh_access_token(body: RefreshTokenRequest, db: Session = Depends(get_db)):
    try:
        payload = verify_refresh_token(body.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.username == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    claims = {
        "sub": user.username,
        "role": user.role,
        "site_name": user.site_name,
    }
    return {
        "access_token": create_access_token(claims),
        "expires_in_minutes": ACCESS_TOKEN_EXPIRE_MINUTES,
    }

# ============================================================================
# FORM A — SCREENING ENDPOINTS
# ============================================================================

@app.get("/screenings/", response_model=list[ScreeningClinicalOut])
def get_screenings(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 50,
):
    limit = min(limit, 100)
    rows = (
        get_accessible_screening_query(db, current_user)
        .order_by(Screening.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    if len(rows) >= 50:
        security_monitor.record_bulk_access(
            current_user.username,
            "/screenings/",
            len(rows),
            get_remote_address(request),
        )
    return rows

@app.get("/screenings/{screening_id}", response_model=ScreeningClinicalOut)
def get_screening(
    screening_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = get_accessible_screening_query(db, current_user).filter(
        Screening.screening_id == screening_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Screening not found")
    return entry

@app.post("/screenings/", response_model=ScreeningOut)
def create_screening(
    screening: ScreeningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_same_site(screening.site_name, current_user)
    try:
        screening_id = screening.screening_id or generate_screening_id(screening.site_id)
        enrollment_id = screening.enrollment_id
        status = compute_screening_status(screening)
        pii_payload = extract_screening_pii(screening.model_dump())

        db_screening = Screening(
            screening_id=screening_id,
            enrollment_id=enrollment_id,
            screening_datetime=screening.screening_datetime,
            created_at=datetime.now(),
            screening_status=status,
            site_name=screening.site_name,
            site_id=screening.site_id,
            screened_by=screening.screened_by,
            gestation_weeks=screening.gestation_weeks,
            gestation_days=screening.gestation_days,
            gestation_method=screening.gestation_method,
            expected_delivery_date=screening.expected_delivery_date,
            exclusion_present=screening.exclusion_present,
            exclusion_reasons=screening.exclusion_reasons,
            consent_given=screening.consent_given,
            consent_taken_by=screening.consent_taken_by,
            consent_datetime=screening.consent_datetime,
            consent_form_version=screening.consent_form_version,
            consent_language=screening.consent_language,
            consent_obtained_by_signature=screening.consent_obtained_by_signature,
            reconsent_obtained=screening.reconsent_obtained or False,
            reconsent_datetime=screening.reconsent_datetime,
            reconsent_form_version=screening.reconsent_form_version,
            relationship_to_participant=screening.relationship_to_participant,
            relationship_other=screening.relationship_other,
            reason_not_approached=screening.reason_not_approached,
        )
        stamp_created(db_screening, current_user)

        upsert_participant_pii(
            db,
            enrollment_id=enrollment_id,
            screening_id=screening_id,
            site_name=screening.site_name,
            **pii_payload,
        )

        db.add(db_screening)
        db.flush()
        record_audit(
            db,
            user_id=current_user.id,
            username=current_user.username,
            action="INSERT",
            table_name="screenings",
            record_id=db_screening.id,
            enrollment_id=enrollment_id,
            screening_id=screening_id,
            new_values=row_snapshot(db_screening),
        )
        db.commit()
        db.refresh(db_screening)
        return db_screening

    except Exception as e:
        db.rollback()
        logger.error(f"SCREENING ERROR: {e}")
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")

@app.put("/screenings/{screening_id}", response_model=ScreeningClinicalOut)
def update_screening(
    screening_id: str,
    updated_data: ScreeningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_same_site(updated_data.site_name, current_user)
    entry = get_accessible_screening_query(db, current_user).filter(
        Screening.screening_id == screening_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Screening not found")

    try:
        old_snapshot = row_snapshot(entry)
        update_data = updated_data.model_dump(exclude_unset=True)
        update_data.pop("screening_id", None)
        pii_payload = extract_screening_pii(update_data)
        for field in SCREENING_PII_FIELDS:
            update_data.pop(field, None)

        if pii_payload:
            upsert_participant_pii(
                db,
                enrollment_id=entry.enrollment_id or updated_data.enrollment_id,
                screening_id=screening_id,
                site_name=entry.site_name or updated_data.site_name,
                **pii_payload,
            )

        for key, value in update_data.items():
            setattr(entry, key, value)

        clear_screening_pii_columns(entry)
        stamp_updated(entry, current_user)

        record_audit(
            db,
            user_id=current_user.id,
            username=current_user.username,
            action="UPDATE",
            table_name="screenings",
            record_id=entry.id,
            enrollment_id=entry.enrollment_id,
            screening_id=screening_id,
            old_values=old_snapshot,
            new_values=row_snapshot(entry),
        )
        db.commit()
        db.refresh(entry)

        if not entry.screening_id:
            raise HTTPException(status_code=400, detail="Screening ID lost")

        return entry

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")

@app.delete("/screenings/{id}")
def delete_screening(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = get_accessible_screening_query(db, current_user).filter(Screening.id == id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Screening entry not found")

    try:
        old_snapshot = row_snapshot(entry)
        soft_delete_record(entry, current_user)
        record_audit(
            db,
            user_id=current_user.id,
            username=current_user.username,
            action="SOFT_DELETE",
            table_name="screenings",
            record_id=entry.id,
            enrollment_id=entry.enrollment_id,
            screening_id=entry.screening_id,
            old_values=old_snapshot,
            new_values=row_snapshot(entry),
        )
        db.commit()
        return {"message": f"Entry with ID {id} soft-deleted (audit trail preserved)"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")

@app.post("/import-from-firebase/")
def import_from_firebase(
    data: FirebaseScreeningImportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_same_site(data.site_name, current_user)
    form_a = data.model_dump()
    screening_id = form_a.get("screening_id")

    existing = db.query(Screening).filter(
        Screening.screening_id == screening_id
    ).first()
    if existing:
        return {"message": "Already exists"}

    pii_payload = extract_screening_pii(form_a)
    new_entry = Screening(
        screening_id=screening_id,
        site_name=form_a.get("site_name"),
        site_id=form_a.get("site_id"),
        screened_by=form_a.get("screened_by"),
        gestation_weeks=form_a.get("gestation_weeks"),
        gestation_days=form_a.get("gestation_days"),
        expected_delivery_date=form_a.get("expected_delivery_date"),
        exclusion_present=form_a.get("exclusion_present"),
        exclusion_reasons=form_a.get("exclusion_reasons"),
        consent_given=form_a.get("consent_given"),
        consent_taken_by=form_a.get("consent_taken_by"),
        relationship_to_participant=form_a.get("relationship_to_participant"),
        relationship_other=form_a.get("relationship_other"),
        reason_not_approached=form_a.get("reason_not_approached"),
        screening_datetime=datetime.now(),
        created_at=datetime.now(),
        screening_status="Pending"
    )

    if pii_payload:
        upsert_participant_pii(
            db,
            screening_id=screening_id,
            site_name=form_a.get("site_name"),
            **pii_payload,
        )

    db.add(new_entry)
    db.commit()
    return {"message": "Imported successfully"}

@app.get("/screenings/by-screening-id/{screening_id}", response_model=ScreeningClinicalOut)
def get_screening_by_screening_id(
    screening_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = get_accessible_screening_query(db, current_user).filter(
        Screening.screening_id == screening_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Screening not found")
    return entry

@app.get("/screenings/by-enrollment/{enrollment_id}", response_model=ScreeningClinicalOut)
def get_screening_by_enrollment(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = get_accessible_screening_query(db, current_user).filter(
        Screening.enrollment_id == enrollment_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Screening not found")
    return entry

# ============================================================================
# FORM B — BIRTH RESUSCITATION ENDPOINTS
# ============================================================================

@app.post("/birth-resuscitation/")
def create_birth_resuscitation(
    data: BirthResuscitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), BIRTH_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        screening_id=data.screening_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    entry = BirthResuscitation(**payload)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

@app.get("/birth-resuscitation/{enrollment_id}", response_model=BirthResuscitationOut)
def get_birth_resuscitation(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    entry = db.query(BirthResuscitation).filter(
        BirthResuscitation.enrollment_id == enrollment_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Birth Resuscitation not found")
    return entry

@app.put("/birth-resuscitation/{enrollment_id}", response_model=BirthResuscitationOut)
def update_birth_resuscitation(
    enrollment_id: str,
    updated_data: BirthResuscitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    entry = db.query(BirthResuscitation).filter(
        BirthResuscitation.enrollment_id == enrollment_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")

    try:
        update_data = updated_data.model_dump(exclude_unset=True)
        update_data.pop("enrollment_id", None)
        update_data = split_and_store_pii(
            db, update_data, BIRTH_PII_FIELDS,
            enrollment_id=enrollment_id,
            screening_id=updated_data.screening_id,
            site_name=site_for_enrollment(db, enrollment_id),
        )
        for key, value in update_data.items():
            setattr(entry, key, value)
        db.commit()
        db.refresh(entry)
        return entry
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# ============================================================================
# FORM C — MATERNAL DETAILS ENDPOINTS
# ============================================================================

@app.post("/maternal-details/", response_model=MaternalDetailsOut)
def create_maternal_details(
    data: MaternalDetailsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), MATERNAL_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = MaternalDetails(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/maternal-details/{enrollment_id}")
def get_maternal_details(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return db.query(MaternalDetails).filter(
        MaternalDetails.enrollment_id == enrollment_id
    ).first()

# ============================================================================
# FORM D — POSTNATAL DAY 1 ENDPOINTS
# ============================================================================

@app.post("/postnatal-day1/", response_model=PostnatalDay1Out)
def create_postnatal_day1(
    data: PostnatalDay1Create,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), POSTNATAL_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = PostnatalDay1(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/postnatal-day1/{enrollment_id}")
def get_postnatal_day1(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = db.query(PostnatalDay1).filter(
        PostnatalDay1.enrollment_id == enrollment_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Form D not found")
    return record

# ============================================================================
# FORM E — NICU ADMISSION ENDPOINTS
# ============================================================================

@app.post("/nicu-admission/", response_model=NICUAdmissionOut)
def create_nicu_admission(
    data: NICUAdmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), NICU_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = NICUAdmission(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/nicu-admission/{enrollment_id}", response_model=list[NICUAdmissionOut])
def get_nicu_admission(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return db.query(NICUAdmission).filter(
        NICUAdmission.enrollment_id == enrollment_id
    ).all()

# ============================================================================
# FORM F — NEONATAL MORBIDITIES ENDPOINTS
# ============================================================================

@app.post("/neonatal-morbidities/", response_model=NeonatalMorbiditiesOut)
def create_neonatal_morbidities(
    data: NeonatalMorbiditiesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = NeonatalMorbidities(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/neonatal-morbidities/{enrollment_id}", response_model=list[NeonatalMorbiditiesOut])
def get_neonatal_morbidities(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return db.query(NeonatalMorbidities).filter(
        NeonatalMorbidities.enrollment_id == enrollment_id
    ).all()

# ============================================================================
# FORM G — STUDY OUTCOMES ENDPOINTS
# ============================================================================

@app.post("/study-outcomes/", response_model=StudyOutcomesOut)
def create_study_outcomes(
    data: StudyOutcomesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = StudyOutcomes(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.post("/cranial-ultrasound/", response_model=CranialUltrasoundOut)
def create_cranial_ultrasound(
    data: CranialUltrasoundCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = CranialUltrasound(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.post("/rop-screening/", response_model=ROPScreeningOut)
def create_rop_screening(
    data: ROPScreeningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = ROPScreening(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

# ============================================================================
# FORM J — COMPOSITE OUTCOME ENDPOINTS
# ============================================================================

@app.post("/composite-outcome/", response_model=CompositeOutcomeOut)
def create_composite_outcome(
    data: CompositeOutcomeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    allowed_fields = CompositeOutcome.__table__.columns.keys()
    filtered_data = {k: v for k, v in data.model_dump().items() if k in allowed_fields}
    record = CompositeOutcome(**filtered_data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/composite-outcome/{enrollment_id}", response_model=list[CompositeOutcomeOut])
def get_composite_outcome(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return db.query(CompositeOutcome).filter(
        CompositeOutcome.enrollment_id == enrollment_id
    ).order_by(CompositeOutcome.created_at.desc()).all()

# ============================================================================
# FIO2 AUC LOGGING ENDPOINTS
# ============================================================================

@app.post("/fio2-auc/", response_model=FiO2AUCLogOut)
def create_fio2_auc(
    data: FiO2AUCLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = FiO2AUC(
        enrollment_id=data.enrollment_id,
        total_auc=data.total_auc,
        mean_daily_fio2=data.mean_daily_fio2,
        excess_o2_auc=data.excess_o2_auc,
        fio2_logs=data.fio2_logs
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/fio2-auc/{enrollment_id}", response_model=list[FiO2AUCLogOut])
def get_fio2_auc(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return db.query(FiO2AUC).filter(
        FiO2AUC.enrollment_id == enrollment_id
    ).order_by(FiO2AUC.created_at.desc()).all()

# ============================================================================
# RESP / CV / NEURO LOG ENDPOINTS
# ============================================================================

@app.post("/resp-cv-neuro-log/", response_model=RespCVNeuroLogOut)
def create_resp_cv_neuro_log(
    data: RespCVNeuroLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), LOG_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = RespCVNeuroLog(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/resp-cv-neuro-log/{enrollment_id}", response_model=list[RespCVNeuroLogOut])
def get_resp_cv_neuro_log(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return db.query(RespCVNeuroLog).filter(
        RespCVNeuroLog.enrollment_id == enrollment_id
    ).order_by(RespCVNeuroLog.created_at.desc()).all()

# ============================================================================
# INFECTION / GI / HEMA LOG ENDPOINTS
# ============================================================================

@app.post("/infect-gi-hema-log/", response_model=InfectGIHemaLogOut)
def create_infect_gi_hema_log(
    data: InfectGIHemaLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), LOG_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = InfectGIHemaLog(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

# ============================================================================
# METABOLIC / RENAL / VASCULAR / EYE LOG ENDPOINTS
# ============================================================================

@app.post("/metab-renal-vasc-eye-log/", response_model=MetabRenalVascEyeLogOut)
def create_metab_renal_vasc_eye_log(
    data: MetabRenalVascEyeLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), LOG_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = MetabRenalVascEyeLog(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

# ============================================================================
# SERIOUS ADVERSE EVENT ENDPOINTS
# ============================================================================

@app.post("/sae-report/", response_model=SAEReportOut)
def create_sae_report(
    data: SAEReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = SAEReport(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.post("/adverse-events/", response_model=AdverseEventsOut)
def create_adverse_events(
    data: AdverseEventsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db, data.model_dump(), AE_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = AdverseEvents(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.post("/sae-list/", response_model=SAEListOut)
def create_sae_list(
    data: SAEListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = SAEList(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

# ============================================================================
# RESPIRATORY LOG ENDPOINTS
# ============================================================================

@app.post("/respiratory-log")
def save_log(
    data: RespiratoryLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    log = RespiratoryLog(
        enrollment_id=data.enrollment_id,
        date=data.date,
        support_mode=data.support_mode.upper().replace(" ", "_")
    )
    db.add(log)
    db.commit()
    return {"message": "Saved"}

@app.get("/respiratory-log/{enrollment_id}")
def get_logs(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return db.query(RespiratoryLog).filter(
        RespiratoryLog.enrollment_id == enrollment_id
    ).all()

@app.post("/respiratory-log-bulk")
def save_logs(
    data: RespiratoryLogBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment_id = data.enrollment_id
    require_enrollment_access(enrollment_id, db, current_user)

    try:
        with db.begin():
            db.query(RespiratoryLog).filter(
                RespiratoryLog.enrollment_id == enrollment_id
            ).delete(synchronize_session=False)
            for log in data.logs:
                db.add(RespiratoryLog(
                    enrollment_id=enrollment_id,
                    date=log["date"],
                    support_mode=log["support_mode"].upper().replace(" ", "_"),
                ))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error replacing logs: {str(e)}")

    return {"message": "Replaced successfully"}

@app.get("/respiratory-summary/{enrollment_id}")
def get_summary(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    logs = db.query(RespiratoryLog).filter(
        RespiratoryLog.enrollment_id == enrollment_id
    ).all()

    cpap_days = sum(1 for l in logs if l.support_mode == "CPAP")
    nippv_days = sum(1 for l in logs if l.support_mode == "NIPPV")
    hfnc_days = sum(1 for l in logs if l.support_mode == "HFNC")
    imv_days = sum(1 for l in logs if l.support_mode in ["IMV", "SIMV", "HFOV"])
    nasal_days = sum(1 for l in logs if l.support_mode in ["NASAL_CANNULA", "NC"])
    extubation_failure_episodes = sum(1 for l in logs if l.support_mode == "EXTUBATION_FAILURE")
    extubation_failure = "Yes" if extubation_failure_episodes > 0 else "No"

    steroid = db.query(SteroidData).filter(
        SteroidData.enrollment_id == enrollment_id
    ).first()

    return {
        "cpap": "Yes" if cpap_days else "No",
        "cpap_days": cpap_days,
        "nippv": "Yes" if nippv_days else "No",
        "nippv_days": nippv_days,
        "imv": "Yes" if imv_days else "No",
        "imv_days": imv_days,
        "hfnc": "Yes" if hfnc_days else "No",
        "hfnc_days": hfnc_days,
        "nasal_cannula": "Yes" if nasal_days else "No",
        "nasal_cannula_days": nasal_days,
        "steroid_age_days": steroid.steroid_age_days if steroid else None,
        "pulmonary_hemorrhage": steroid.pulmonary_hemorrhage if steroid else None,
        "pulmonary_hypertension": steroid.pulmonary_hypertension if steroid else None,
        "pneumothorax": steroid.pneumothorax if steroid else None,
        "chest_drain": steroid.chest_drain if steroid else None,
        "extubation_failure": extubation_failure,
        "extubation_failure_episodes": extubation_failure_episodes,
    }

# ============================================================================
# STEROID DATA ENDPOINTS
# ============================================================================

@app.post("/steroid-data")
def save_steroid(
    data: SteroidDataCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enrollment_id = data.enrollment_id
    require_enrollment_access(enrollment_id, db, current_user)

    existing = db.query(SteroidData).filter(
        SteroidData.enrollment_id == enrollment_id
    ).first()

    if existing:
        existing.steroid_age_days = data.steroid_age_days
        existing.pulmonary_hemorrhage = data.pulmonary_hemorrhage
        existing.pulmonary_hypertension = data.pulmonary_hypertension
        existing.pneumothorax = data.pneumothorax
        existing.chest_drain = data.chest_drain
    else:
        db.add(SteroidData(
            enrollment_id=enrollment_id,
            steroid_age_days=data.steroid_age_days,
            pulmonary_hemorrhage=data.pulmonary_hemorrhage,
            pulmonary_hypertension=data.pulmonary_hypertension,
            pneumothorax=data.pneumothorax,
            chest_drain=data.chest_drain,
        ))

    db.commit()
    return {"message": "Steroid saved"}

# ============================================================================
# ENROLLMENT STATUS ENDPOINT
# ============================================================================

@app.get("/enrollment-status/{enrollment_id}")
def get_enrollment_status(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    screening = db.query(Screening).filter(
        Screening.enrollment_id == enrollment_id
    ).first()
    if not screening:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    form_b = db.query(BirthResuscitation).filter(
        BirthResuscitation.enrollment_id == enrollment_id
    ).first() is not None

    form_c = db.query(MaternalDetails).filter(
        MaternalDetails.enrollment_id == enrollment_id
    ).first() is not None

    form_d = db.query(PostnatalDay1).filter(
        PostnatalDay1.enrollment_id == enrollment_id
    ).first() is not None

    if not form_b:
        next_form = "form-b"
    elif not form_c:
        next_form = "form-c"
    elif not form_d:
        next_form = "form-d"
    else:
        next_form = "completed"

    return {
        "enrollment_id": enrollment_id,
        "screening_status": screening.screening_status,
        "form_a": True,
        "form_b": form_b,
        "form_c": form_c,
        "form_d": form_d,
        "next_form": next_form,
    }