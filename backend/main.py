from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from datetime import datetime, date
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
    FiO2AUC, RespCVNeuroLog, RespCVNeuroDayLog, InfectGIHemaLog,InfectGIHemaDayLog,
    MetabRenalVascEyeLog,MetabRenalVascEyeDayLog, CranialUSGRecord, SAEReport, AdverseEvents,
    SAEList, User, MRIBrainAssessment, BlenderStudySummary
)
from schemas import ScreeningCreate, ScreeningClinicalOut, ScreeningOut, BirthResuscitationCreate,MetabRenalVascEyeDayCreate, MetabRenalVascEyeDaySubmit, BirthResuscitationOut, MaternalDetailsCreate, MaternalDetailsOut, PostnatalDay1Create, PostnatalDay1Out,NICUAdmissionCreate,NICUAdmissionOut,NeonatalMorbiditiesCreate,NeonatalMorbiditiesOut,StudyOutcomesCreate, CranialUSGCreate, CranialUSGSubmit, StudyOutcomesOut,CranialUltrasoundCreate, CranialUltrasoundOut,ROPScreeningCreate, ROPScreeningOut,CompositeOutcomeCreate, CompositeOutcomeOut, FiO2AUCLogCreate, FiO2AUCLogOut, RespCVNeuroLogCreate,RespCVNeuroDayCreate, RespCVNeuroDaySubmit, DischargeUpdate, RespCVNeuroLogOut,InfectGIHemaLogCreate, InfectGIHemaLogOut,MetabRenalVascEyeLogCreate,MetabRenalVascEyeLogOut,SAEReportCreate, SAEReportOut, AdverseEventsCreate, AdverseEventsOut ,SAEListCreate, SAEListOut, UserCreate, UserOut, LoginRequest, LoginResponse, RefreshTokenRequest, TokenRefreshResponse, RespiratoryLogCreate, RespiratoryLogBulkCreate, InfectGIHemaDayCreate, InfectGIHemaDaySubmit,  SteroidDataCreate, FirebaseScreeningImportCreate, MRIBrainCreate, MRIBrainSubmit, MRIBrainOut, BlenderSummaryCreate, BlenderSummarySubmit, BlenderSummaryOut
from pydantic import BaseModel
from typing import Optional, List
from deps import get_current_user, is_superadmin, require_superadmin, ensure_same_site
from routers import enrollment
from routers import pii as pii_router
from routers import staff as staff_router
from routers import audit as audit_router
from routers import dashboard as dashboard_router
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

Base.metadata.create_all(bind=engine)

# ============================================================================
# FASTAPI APPLICATION SETUP
# ============================================================================

app = FastAPI(title="PORTAL Trial API")
app.include_router(enrollment.router)
app.include_router(pii_router.router)
app.include_router(staff_router.router)
app.include_router(audit_router.router)
app.include_router(dashboard_router.router)


@app.on_event("startup")
def on_startup_migrations():
    # ── DB connectivity check with retry (safe for AWS RDS cold start) ──
    import time
    for attempt in range(1, 6):
        try:
            with engine.connect() as conn:
                db_name = conn.execute(text("SELECT current_database()")).scalar()
                logger.info("✅ CONNECTED DB: %s", db_name)
            break
        except Exception as exc:
            logger.warning("DB not ready (attempt %s/5): %s", attempt, exc)
            if attempt == 5:
                logger.error("❌ Could not connect to DB after 5 attempts — startup continuing anyway")
            else:
                time.sleep(3)

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

# Health check endpoint — required by AWS ALB, ECS, and Elastic Beanstalk
@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as exc:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"status": "error", "db": str(exc)})

# Version endpoint — reports which git commit is actually running, so
# deployment status can be checked with `curl https://api.<host>/version`
# instead of guessing from GitHub history. deploy.sh writes VERSION at
# deploy time; if it's missing (e.g. local dev, or an older deploy that
# predates this file) this returns "unknown" rather than failing.
@app.get("/version")
def version_check():
    version_file = os.path.join(os.path.dirname(__file__), "VERSION")
    try:
        with open(version_file) as f:
            info = f.read().strip()
        return {"deployed_commit": info or "unknown"}
    except FileNotFoundError:
        return {"deployed_commit": "unknown", "note": "VERSION file not found — deploy.sh may predate this endpoint, or this is a local/dev run"}

# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/users/", response_model=UserOut)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_superadmin(current_user)
    if is_superadmin(current_user) is False and user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Cannot create this role")
    if (user.role or "").lower() == "superadmin" and not is_superadmin(current_user):
        raise HTTPException(status_code=403, detail="Cannot create a superadmin user")

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
    """
    User login endpoint with brute force protection.
    
    ✅ SECURITY FIXES:
    - Rate limited to 5 attempts per 15 minutes per IP
    - Logs failed attempts
    - Returns 429 Too Many Requests when limit exceeded
    """
    user = db.query(User).filter(User.username == data.username).first()
    
    client_ip = get_remote_address(request)

    if not user or not verify_password(data.password, user.hashed_password):
        security_monitor.record_failed_login(client_ip, data.username)
        logger.warning(
            "Failed login attempt for user '%s' from IP: %s",
            data.username,
            client_ip,
        )
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
            lmp_date=screening.lmp_date,
            exclusion_present=screening.exclusion_present,
            exclusion_reasons=screening.exclusion_reasons,
            reason_for_insufficient_time=screening.reason_for_insufficient_time,
            decision_forego_resuscitation_reason=screening.decision_forego_resuscitation_reason,
            decision_forego_resuscitation_reason_other=screening.decision_forego_resuscitation_reason_other,
            major_structural_anomalies_if_yes=screening.major_structural_anomalies_if_yes,
            fetal_hydrops=screening.fetal_hydrops,
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
            reason_not_approached_other=screening.reason_not_approached_other,
            reason_for_consent_refusal=screening.reason_for_consent_refusal,
            reason_for_consent_refusal_other=screening.reason_for_consent_refusal_other,
            video_pis_shown=screening.video_pis_shown,
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

    except HTTPException:
        db.rollback()
        raise
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
        if not entry.screening_id:
            raise HTTPException(status_code=400, detail="Screening ID lost")

        db.commit()
        db.refresh(entry)

        return entry

    except HTTPException:
        db.rollback()
        raise
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

    except HTTPException:
        db.rollback()
        raise
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
        db,
        data.model_dump(),
        BIRTH_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        screening_id=data.screening_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    entry = BirthResuscitation(**payload)
    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Issue #1 Fix 2: write enrollment_id back to the screenings record on
    # randomisation, so the screenings<->birth_resuscitation join used by the
    # CONSORT dashboard resolves correctly.
    if entry.randomised and entry.screening_id:
        db.query(Screening).filter(
            Screening.screening_id == entry.screening_id
        ).update({"enrollment_id": entry.enrollment_id})
        db.commit()

    return entry

@app.get("/birth-resuscitation/{enrollment_id}", response_model=BirthResuscitationOut)
def get_birth_resuscitation(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    entry = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.enrollment_id == enrollment_id)
        .first()
    )

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
            db,
            update_data,
            BIRTH_PII_FIELDS,
            enrollment_id=enrollment_id,
            screening_id=updated_data.screening_id,
            site_name=site_for_enrollment(db, enrollment_id),
        )

        for key, value in update_data.items():
            setattr(entry, key, value)

        db.commit()
        db.refresh(entry)

        # Issue #1 Fix 2: keep screenings.enrollment_id in sync if this
        # update is what randomises the baby (or edits a randomised record).
        if entry.randomised and entry.screening_id:
            db.query(Screening).filter(
                Screening.screening_id == entry.screening_id
            ).update({"enrollment_id": entry.enrollment_id})
            db.commit()

        return entry

    except HTTPException:
        db.rollback()
        raise
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
        db,
        data.model_dump(),
        MATERNAL_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    record = MaternalDetails(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.put("/maternal-details/{enrollment_id}", response_model=MaternalDetailsOut)
def update_maternal_details(
    enrollment_id: str,
    data: MaternalDetailsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(MaternalDetails)
        .filter(MaternalDetails.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Maternal details not found")
    payload = split_and_store_pii(
        db,
        data.model_dump(),
        MATERNAL_PII_FIELDS,
        enrollment_id=enrollment_id,
        site_name=site_for_enrollment(db, enrollment_id),
    )
    for key, value in payload.items():
        setattr(record, key, value)
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
    record = (
        db.query(MaternalDetails)
        .filter(MaternalDetails.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        return None

    record_dict = {col.name: getattr(record, col.name) for col in record.__table__.columns}

    # Rejoin all PII fields (address, email, and individual address components)
    try:
        pii_row = db.execute(
            text("""
                SELECT address, email_address, house, city, district,
                       state, pincode, landmark
                FROM participant_pii
                WHERE enrollment_id = :enrollment_id
            """),
            {"enrollment_id": enrollment_id}
        ).fetchone()

        if pii_row:
            if pii_row[0]: record_dict["address"]       = pii_row[0]
            if pii_row[1]: record_dict["email_address"] = pii_row[1]
            if pii_row[2]: record_dict["house"]         = pii_row[2]
            if pii_row[3]: record_dict["city"]          = pii_row[3]
            if pii_row[4]: record_dict["district"]      = pii_row[4]
            if pii_row[5]: record_dict["state"]         = pii_row[5]
            if pii_row[6]: record_dict["pincode"]       = pii_row[6]
            if pii_row[7]: record_dict["landmark"]      = pii_row[7]
    except Exception as e:
        logger.warning("Could not rejoin PII fields from participant_pii: %s", e)

    return record_dict

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
        db,
        data.model_dump(),
        POSTNATAL_PII_FIELDS,
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
        return None

    return record


@app.put("/postnatal-day1/{enrollment_id}")
def update_postnatal_day1(
    enrollment_id: str,
    data: PostnatalDay1Create,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = db.query(PostnatalDay1).filter(
        PostnatalDay1.enrollment_id == enrollment_id
    ).first()

    if not record:
        # No existing record — create new one (upsert)
        payload = split_and_store_pii(
            db,
            data.model_dump(),
            POSTNATAL_PII_FIELDS,
            enrollment_id=enrollment_id,
            site_name=site_for_enrollment(db, enrollment_id),
        )
        record = PostnatalDay1(**payload)
        db.add(record)
    else:
        # Update existing record
        payload = split_and_store_pii(
            db,
            data.model_dump(),
            POSTNATAL_PII_FIELDS,
            enrollment_id=enrollment_id,
            site_name=site_for_enrollment(db, enrollment_id),
        )
        for key, value in payload.items():
            if hasattr(record, key):
                setattr(record, key, value)

    db.commit()
    db.refresh(record)
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
        db,
        data.model_dump(),
        NICU_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    
    # Check if record already exists (upsert pattern)
    existing_record = db.query(NICUAdmission).filter(
        NICUAdmission.enrollment_id == data.enrollment_id
    ).first()
    
    if existing_record:
        # Update existing record
        for key, value in payload.items():
            if hasattr(existing_record, key):
                setattr(existing_record, key, value)
        db.commit()
        db.refresh(existing_record)
        return existing_record
    else:
        # Create new record
        record = NICUAdmission(**payload)
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

@app.get("/nicu-admission/{enrollment_id}")
def get_nicu_admission(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(NICUAdmission)
        .filter(NICUAdmission.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        return None
    return record


@app.put("/nicu-admission/{enrollment_id}")
def update_nicu_admission(
    enrollment_id: str,
    data: NICUAdmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = db.query(NICUAdmission).filter(
        NICUAdmission.enrollment_id == enrollment_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Form E not found")
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    for key, value in payload.items():
        if hasattr(record, key):
            setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return record

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
    return (
        db.query(NeonatalMorbidities)
        .filter(NeonatalMorbidities.enrollment_id == enrollment_id)
        .all()
    )

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

    filtered_data = {
        key: value
        for key, value in data.model_dump().items()
        if key in allowed_fields
    }

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
    return (
        db.query(CompositeOutcome)
        .filter(CompositeOutcome.enrollment_id == enrollment_id)
        .order_by(CompositeOutcome.created_at.desc())
        .all()
    )

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
    return (
        db.query(FiO2AUC)
        .filter(FiO2AUC.enrollment_id == enrollment_id)
        .order_by(FiO2AUC.created_at.desc())
        .all()
    )


@app.put("/fio2-auc/{enrollment_id}")
def update_fio2_auc(
    enrollment_id: str,
    data: FiO2AUCLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(FiO2AUC)
        .filter(FiO2AUC.enrollment_id == enrollment_id)
        .order_by(FiO2AUC.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="FiO₂ AUC record not found")
    record.total_auc       = data.total_auc
    record.mean_daily_fio2 = data.mean_daily_fio2
    record.excess_o2_auc   = data.excess_o2_auc
    record.fio2_logs       = data.fio2_logs
    db.commit()
    db.refresh(record)
    return record

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
        db,
        data.model_dump(),
        LOG_PII_FIELDS,
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
    return (
        db.query(RespCVNeuroLog)
        .filter(RespCVNeuroLog.enrollment_id == enrollment_id)
        .order_by(RespCVNeuroLog.created_at.desc())
        .all()
    )


@app.put("/resp-cv-neuro-log/{enrollment_id}")
def update_resp_cv_neuro_log(
    enrollment_id: str,
    data: RespCVNeuroLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(RespCVNeuroLog)
        .filter(RespCVNeuroLog.enrollment_id == enrollment_id)
        .order_by(RespCVNeuroLog.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.daily_log  = data.daily_log
    record.gestation  = data.gestation
    record.mother_name= data.mother_name
    db.commit()
    db.refresh(record)
    return record

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
        db,
        data.model_dump(),
        LOG_PII_FIELDS,
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

@app.post(
    "/metab-renal-vasc-eye-log/",
    response_model=MetabRenalVascEyeLogOut
)
def create_metab_renal_vasc_eye_log(
    data: MetabRenalVascEyeLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db,
        data.model_dump(),
        LOG_PII_FIELDS,
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
        db,
        data.model_dump(),
        AE_PII_FIELDS,
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
    logs = db.query(RespiratoryLog).filter(
        RespiratoryLog.enrollment_id == enrollment_id
    ).all()

    return logs

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
                db.add(
                    RespiratoryLog(
                        enrollment_id=enrollment_id,
                        date=log["date"],
                        support_mode=log["support_mode"]
                        .upper()
                        .replace(" ", "_"),
                    )
                )
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
    
    steroid_age_days = steroid.steroid_age_days if steroid else None
    pulmonary_hemorrhage = steroid.pulmonary_hemorrhage if steroid else None
    pulmonary_hypertension = steroid.pulmonary_hypertension if steroid else None
    pneumothorax = steroid.pneumothorax if steroid else None
    chest_drain = steroid.chest_drain if steroid else None
    
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
        "steroid_age_days": steroid_age_days,
        "pulmonary_hemorrhage": pulmonary_hemorrhage,
        "pulmonary_hypertension": pulmonary_hypertension,
        "pneumothorax": pneumothorax,
        "chest_drain": chest_drain,
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
    steroid_age_days = data.steroid_age_days
    pulmonary_hemorrhage = data.pulmonary_hemorrhage
    pulmonary_hypertension = data.pulmonary_hypertension
    pneumothorax = data.pneumothorax
    chest_drain = data.chest_drain

    existing = db.query(SteroidData).filter(
        SteroidData.enrollment_id == enrollment_id
    ).first()

    if existing:
        existing.steroid_age_days = steroid_age_days
        existing.pulmonary_hemorrhage = pulmonary_hemorrhage
        existing.pulmonary_hypertension = pulmonary_hypertension
        existing.pneumothorax = pneumothorax
        existing.chest_drain = chest_drain
    else:
        new = SteroidData(
            enrollment_id=enrollment_id,
            steroid_age_days=steroid_age_days,
            pulmonary_hemorrhage=pulmonary_hemorrhage,
            pulmonary_hypertension=pulmonary_hypertension,
            pneumothorax=pneumothorax,
            chest_drain=chest_drain
        )
        db.add(new)

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
    screening = (
        db.query(Screening)
        .filter(Screening.enrollment_id == enrollment_id)
        .first()
    )

    if not screening:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    form_b = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.enrollment_id == enrollment_id)
        .first()
        is not None
    )

    form_c = (
        db.query(MaternalDetails)
        .filter(MaternalDetails.enrollment_id == enrollment_id)
        .first()
        is not None
    )

    form_d = (
        db.query(PostnatalDay1)
        .filter(PostnatalDay1.enrollment_id == enrollment_id)
        .first()
        is not None
    )

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
# ─────────────────────────────────────────────────────────────
# Paste these routes into main.py
# below the existing FiO2 AUC section
# ─────────────────────────────────────────────────────────────

# ============================================================================
# RESP / CV / NEURO DAILY LOG — NEW STRUCTURED ENDPOINTS
# Replaces the old /resp-cv-neuro-log/ blob endpoints
# ============================================================================

def _compute_completion_pct(record) -> int:
    """Compute completion % for a RespCVNeuroDayLog row."""
    resp_fields = [
        "support_modes", "max_fio2", "max_flow",
        "supp_o2", "surfactant", "caffeine", "apnea",
        "desaturations", "extub_attempted", "extub_failure",
        "pulm_hemorrhage", "pneumothorax", "chest_drain",
        "pphn", "postnatal_steroids",
    ]  # 15 fields
    cv_fields = [
        "pda_suspected", "echo_done", "hs_pda",
        "pda_medical_rx", "shock", "vasoactive_support",
    ]  # 6 fields
    neuro_base = [
        "cranial_usg", "ivh", "pvl_suspected", "cpvl_confirmed",
        "ventriculomegaly", "clinical_seizures", "eeg_seizures",
        "aeds_given", "non_ivh_ich", "meningitis_suspected",
    ]  # 10 base fields

    def answered(val):
        return val is not None and val != ""

    resp_done  = sum(1 for f in resp_fields  if answered(getattr(record, f, None)))
    cv_done    = sum(1 for f in cv_fields    if answered(getattr(record, f, None)))
    neuro_done = sum(1 for f in neuro_base   if answered(getattr(record, f, None)))

    ivh_visible = getattr(record, "ivh", None) is True
    if ivh_visible and answered(getattr(record, "ivh_grade", None)):
        neuro_done += 1

    total_fields = 15 + 6 + (11 if ivh_visible else 10)
    total_done   = resp_done + cv_done + neuro_done

    return min(100, round((total_done / total_fields) * 100)) if total_fields else 0


# ── GET single day ────────────────────────────────────────────
@app.get("/resp-cv-neuro/{enrollment_id}/{nicu_day}")
def get_resp_cv_neuro_day(
    enrollment_id: str,
    nicu_day:      int,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(RespCVNeuroDayLog)
        .filter(
            RespCVNeuroDayLog.enrollment_id == enrollment_id,
            RespCVNeuroDayLog.nicu_day      == nicu_day,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="No data for this day")
    return record


# ── POST create day ───────────────────────────────────────────
@app.post("/resp-cv-neuro/")
def create_resp_cv_neuro_day(
    data:         RespCVNeuroDayCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    # Prevent duplicate — upsert pattern
    existing = (
        db.query(RespCVNeuroDayLog)
        .filter(
            RespCVNeuroDayLog.enrollment_id == data.enrollment_id,
            RespCVNeuroDayLog.nicu_day      == data.nicu_day,
        )
        .first()
    )
    if existing:
        # Update instead of creating duplicate
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = RespCVNeuroDayLog(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ── PUT update day ────────────────────────────────────────────
@app.put("/resp-cv-neuro/{enrollment_id}/{nicu_day}")
def update_resp_cv_neuro_day(
    enrollment_id: str,
    nicu_day:      int,
    data:          RespCVNeuroDayCreate,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(RespCVNeuroDayLog)
        .filter(
            RespCVNeuroDayLog.enrollment_id == enrollment_id,
            RespCVNeuroDayLog.nicu_day      == nicu_day,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found — use POST to create")

    # Block edits on submitted days
    if record.submission_status == "submitted":
        raise HTTPException(status_code=403, detail="Day is submitted and locked")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("enrollment_id", "nicu_day"):
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


# ── PATCH submit day ──────────────────────────────────────────
@app.patch("/resp-cv-neuro/{enrollment_id}/{nicu_day}/submit")
def submit_resp_cv_neuro_day(
    enrollment_id: str,
    nicu_day:      int,
    data:          RespCVNeuroDaySubmit,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(RespCVNeuroDayLog)
        .filter(
            RespCVNeuroDayLog.enrollment_id == enrollment_id,
            RespCVNeuroDayLog.nicu_day      == nicu_day,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Day record not found")

    record.submission_status = "submitted"
    record.submitted_at      = data.submitted_at
    record.submitted_by      = data.submitted_by
    db.commit()
    db.refresh(record)
    return {"message": f"Day {nicu_day} submitted and locked", "status": "submitted"}


# ── GET summary (all days for timeline status indicators) ─────
@app.get("/resp-cv-neuro/{enrollment_id}/summary")
def get_resp_cv_neuro_summary(
    enrollment_id: str,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    records = (
        db.query(RespCVNeuroDayLog)
        .filter(RespCVNeuroDayLog.enrollment_id == enrollment_id)
        .order_by(RespCVNeuroDayLog.nicu_day)
        .all()
    )
    return [
        {
            "nicu_day":          r.nicu_day,
            "submission_status": r.submission_status or "empty",
            "completion_pct":    _compute_completion_pct(r),
            "saved_at":          r.saved_at,
            "submitted_at":      r.submitted_at,
        }
        for r in records
    ]


# ── PATCH discharge ───────────────────────────────────────────
@app.patch("/enrollment/{enrollment_id}/discharge")
def discharge_enrollment(
    enrollment_id: str,
    data:          DischargeUpdate,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)

    # Validate discharge_date up front so an invalid value is reported to the
    # caller instead of being silently swallowed while still returning success.
    try:
        parsed_discharge_date = date.fromisoformat(data.discharge_date)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid discharge_date '{data.discharge_date}'; expected YYYY-MM-DD",
        )

    # Update NeonatalMorbidities discharge_date if it exists
    morbidity = (
        db.query(NeonatalMorbidities)
        .filter(NeonatalMorbidities.enrollment_id == enrollment_id)
        .first()
    )
    if morbidity:
        try:
            morbidity.discharge_date = parsed_discharge_date
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Failed to persist discharge_date for %s: %s", enrollment_id, e)
            raise HTTPException(status_code=400, detail=f"Error saving discharge date: {str(e)}")

    # Also store on BirthResuscitation for date_of_birth reference
    # (frontend reads b.discharge_date from birth-resuscitation)
    birth = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.enrollment_id == enrollment_id)
        .first()
    )

    # Since BirthResuscitation has no discharge_date column,
    # we store it in the Screening record's notes or use a
    # separate approach. For now return success — add a
    # discharge_date column to BirthResuscitation if needed.

    return {
        "message":        f"Patient discharged on Day {data.discharge_day}",
        "discharge_date": data.discharge_date,
        "discharge_day":  data.discharge_day,
    }
# ─────────────────────────────────────────────────────────────
# Paste into main.py after the Resp-CV-Neuro routes section
#
# Add to main.py imports:
#   from models import InfectGIHemaDayLog
#   from schemas import InfectGIHemaDayCreate, InfectGIHemaDaySubmit
# ─────────────────────────────────────────────────────────────

# ============================================================================
# INFECT / GI / HEMA DAILY LOG — STRUCTURED PER-DAY ENDPOINTS
# ============================================================================

def _infect_completion_pct(r) -> int:
    """Compute completion % respecting conditional field visibility."""

    def ans(v): return v is not None and v != ""

    # Infection base (always visible): 7 fields
    inf_base   = ["sepsis_suspected","antibiotics","antibiotic_day",
                   "lp_done","csf_culture_positive","clabsi","vap"]
    inf_sepsis = ["blood_culture_sent","blood_culture_positive","eos","los"]

    sepsis_yes = getattr(r, "sepsis_suspected", None) is True
    inf_total  = len(inf_base) + (len(inf_sepsis) if sepsis_yes else 0)
    inf_done   = (sum(1 for k in inf_base   if ans(getattr(r, k, None)))
                + (sum(1 for k in inf_sepsis if ans(getattr(r, k, None))) if sepsis_yes else 0))

    # GI base: 8 always visible
    gi_base = ["npo","enteral_feeds_started","feed_volume","full_feeds",
               "parenteral_nutrition","probiotic","feed_intolerance","nec_suspected"]
    gi_nec  = ["nec_confirmed_stage","nec_surgery"]

    nec_yes   = getattr(r, "nec_suspected", None) is True
    gi_total  = len(gi_base) + (len(gi_nec) if nec_yes else 0)
    gi_done   = (sum(1 for k in gi_base if ans(getattr(r, k, None)))
               + (sum(1 for k in gi_nec  if ans(getattr(r, k, None))) if nec_yes else 0))

    # Hematology base: 6 always visible
    hema_base    = ["jaundice","peak_tsb","exchange_transfusion",
                    "prbc_transfusion","platelet_transfusion","ffp_cryo"]
    hema_jaundice= ["phototherapy"]

    jaundice_yes = getattr(r, "jaundice", None) is True
    hema_total   = len(hema_base) + (len(hema_jaundice) if jaundice_yes else 0)
    hema_done    = (sum(1 for k in hema_base    if ans(getattr(r, k, None)))
                  + (sum(1 for k in hema_jaundice if ans(getattr(r, k, None))) if jaundice_yes else 0))

    total_fields = inf_total + gi_total + hema_total
    total_done   = inf_done + gi_done + hema_done

    return min(100, round((total_done / total_fields) * 100)) if total_fields else 0


# ── GET single day ────────────────────────────────────────────
@app.get("/infect-gi-hema/{enrollment_id}/{nicu_day}")
def get_infect_gi_hema_day(
    enrollment_id: str,
    nicu_day:      int,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(InfectGIHemaDayLog)
        .filter(
            InfectGIHemaDayLog.enrollment_id == enrollment_id,
            InfectGIHemaDayLog.nicu_day      == nicu_day,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="No data for this day")
    return record


# ── GET summary (all days — for timeline status indicators) ───
@app.get("/infect-gi-hema/{enrollment_id}/summary")
def get_infect_gi_hema_summary(
    enrollment_id: str,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    records = (
        db.query(InfectGIHemaDayLog)
        .filter(InfectGIHemaDayLog.enrollment_id == enrollment_id)
        .order_by(InfectGIHemaDayLog.nicu_day)
        .all()
    )
    return [
        {
            "nicu_day":          r.nicu_day,
            "submission_status": r.submission_status or "empty",
            "completion_pct":    _infect_completion_pct(r),
            "saved_at":          r.saved_at,
            "submitted_at":      r.submitted_at,
        }
        for r in records
    ]


# ── POST create day (upsert) ──────────────────────────────────
@app.post("/infect-gi-hema/")
def create_infect_gi_hema_day(
    data:         InfectGIHemaDayCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    existing = (
        db.query(InfectGIHemaDayLog)
        .filter(
            InfectGIHemaDayLog.enrollment_id == data.enrollment_id,
            InfectGIHemaDayLog.nicu_day      == data.nicu_day,
        )
        .first()
    )
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = InfectGIHemaDayLog(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ── PUT update day ────────────────────────────────────────────
@app.put("/infect-gi-hema/{enrollment_id}/{nicu_day}")
def update_infect_gi_hema_day(
    enrollment_id: str,
    nicu_day:      int,
    data:          InfectGIHemaDayCreate,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(InfectGIHemaDayLog)
        .filter(
            InfectGIHemaDayLog.enrollment_id == enrollment_id,
            InfectGIHemaDayLog.nicu_day      == nicu_day,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found — use POST to create")
    if record.submission_status == "submitted":
        raise HTTPException(status_code=403, detail="Day is submitted and locked")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("enrollment_id", "nicu_day"):
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


# ── PATCH submit day ──────────────────────────────────────────
@app.patch("/infect-gi-hema/{enrollment_id}/{nicu_day}/submit")
def submit_infect_gi_hema_day(
    enrollment_id: str,
    nicu_day:      int,
    data:          InfectGIHemaDaySubmit,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(InfectGIHemaDayLog)
        .filter(
            InfectGIHemaDayLog.enrollment_id == enrollment_id,
            InfectGIHemaDayLog.nicu_day      == nicu_day,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Day record not found")

    record.submission_status = "submitted"
    record.submitted_at      = data.submitted_at
    record.submitted_by      = data.submitted_by
    db.commit()
    db.refresh(record)
    return {"message": f"Day {nicu_day} submitted and locked", "status": "submitted"}
# ═══════════════════════════════════════════════════════════════
# 3. ADD TO main.py  (imports + routes)
#
# Add to imports:
#   from models import MetabRenalVascEyeDayLog
#   from schemas import MetabRenalVascEyeDayCreate, MetabRenalVascEyeDaySubmit
# ═══════════════════════════════════════════════════════════════
 
def _metab_completion_pct(r) -> int:
    def ans(v): return v is not None and v != "" and not (isinstance(v, list) and len(v)==0)
 
    metab_base   = ["hypoglycemia","hypoglycemia_rx","hyperglycemia","insulin",
                    "metabolic_acidosis","dyselectrolytemia","osteopenia_suspected"]
    metab_dysele = ["dyselectrolytemia_type"]
    dysele_yes   = getattr(r, "dyselectrolytemia", None) is True
    metab_total  = len(metab_base) + (len(metab_dysele) if dysele_yes else 0)
    metab_done   = (sum(1 for k in metab_base if ans(getattr(r, k, None)))
                  + (1 if dysele_yes and ans(getattr(r, "dyselectrolytemia_type", None)) else 0))
 
    renal_base  = ["aki_suspected","creatinine","urine_output_low","dialysis_crrt"]
    renal_aki   = ["aki_kdigo_stage"]
    aki_yes     = getattr(r, "aki_suspected", None) is True
    renal_total = len(renal_base) + (len(renal_aki) if aki_yes else 0)
    renal_done  = (sum(1 for k in renal_base if ans(getattr(r, k, None)))
                 + (1 if aki_yes and ans(getattr(r, "aki_kdigo_stage", None)) else 0))
 
    thermo_keys = ["hypothermia","hyperthermia"]
    thermo_done = sum(1 for k in thermo_keys if ans(getattr(r, k, None)))
 
    vasc_keys   = ["picc_in_situ","uvc_in_situ","uac_in_situ","peripheral_iv",
                   "peripheral_arterial","extravasation_injury","line_complication"]
    vasc_done   = sum(1 for k in vasc_keys if ans(getattr(r, k, None)))
 
    eye_base    = ["rop_screening_due","rop_screened","rop_detected"]
    eye_rop     = ["rop_stage","plus_disease","rop_treatment"]
    rop_yes     = getattr(r, "rop_detected", None) is True
    eye_total   = len(eye_base) + (len(eye_rop) if rop_yes else 0)
    eye_done    = (sum(1 for k in eye_base if ans(getattr(r, k, None)))
                 + (sum(1 for k in eye_rop if ans(getattr(r, k, None))) if rop_yes else 0))
 
    total_fields = metab_total + renal_total + len(thermo_keys) + len(vasc_keys) + eye_total
    total_done   = metab_done + renal_done + thermo_done + vasc_done + eye_done
    return min(100, round((total_done / total_fields) * 100)) if total_fields else 0
 
 
@app.get("/metab-renal-vasc-eye/{enrollment_id}/summary")
def get_metab_renal_vasc_eye_summary(
    enrollment_id: str,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    records = (
        db.query(MetabRenalVascEyeDayLog)
        .filter(MetabRenalVascEyeDayLog.enrollment_id == enrollment_id)
        .order_by(MetabRenalVascEyeDayLog.nicu_day)
        .all()
    )
    return [{"nicu_day": r.nicu_day, "submission_status": r.submission_status or "empty",
             "completion_pct": _metab_completion_pct(r), "saved_at": r.saved_at,
             "submitted_at": r.submitted_at} for r in records]
 
 
@app.get("/metab-renal-vasc-eye/{enrollment_id}/{nicu_day}")
def get_metab_renal_vasc_eye_day(
    enrollment_id: str, nicu_day: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = db.query(MetabRenalVascEyeDayLog).filter(
        MetabRenalVascEyeDayLog.enrollment_id == enrollment_id,
        MetabRenalVascEyeDayLog.nicu_day      == nicu_day,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="No data for this day")
    return record
 
 
@app.post("/metab-renal-vasc-eye/")
def create_metab_renal_vasc_eye_day(
    data: MetabRenalVascEyeDayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    existing = db.query(MetabRenalVascEyeDayLog).filter(
        MetabRenalVascEyeDayLog.enrollment_id == data.enrollment_id,
        MetabRenalVascEyeDayLog.nicu_day      == data.nicu_day,
    ).first()
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key): setattr(existing, key, value)
        db.commit(); db.refresh(existing); return existing
    record = MetabRenalVascEyeDayLog(**data.model_dump())
    db.add(record); db.commit(); db.refresh(record); return record
 
 
@app.put("/metab-renal-vasc-eye/{enrollment_id}/{nicu_day}")
def update_metab_renal_vasc_eye_day(
    enrollment_id: str, nicu_day: int,
    data: MetabRenalVascEyeDayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = db.query(MetabRenalVascEyeDayLog).filter(
        MetabRenalVascEyeDayLog.enrollment_id == enrollment_id,
        MetabRenalVascEyeDayLog.nicu_day      == nicu_day,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found — use POST to create")
    if record.submission_status == "submitted":
        raise HTTPException(status_code=403, detail="Day is submitted and locked")
    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("enrollment_id","nicu_day"):
            setattr(record, key, value)
    db.commit(); db.refresh(record); return record
 
 
@app.patch("/metab-renal-vasc-eye/{enrollment_id}/{nicu_day}/submit")
def submit_metab_renal_vasc_eye_day(
    enrollment_id: str, nicu_day: int,
    data: MetabRenalVascEyeDaySubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = db.query(MetabRenalVascEyeDayLog).filter(
        MetabRenalVascEyeDayLog.enrollment_id == enrollment_id,
        MetabRenalVascEyeDayLog.nicu_day      == nicu_day,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Day record not found")
    record.submission_status = "submitted"
    record.submitted_at      = data.submitted_at
    record.submitted_by      = data.submitted_by
    db.commit(); db.refresh(record)
    return {"message": f"Day {nicu_day} submitted and locked", "status": "submitted"}
# ============================================================================
# FORM H — CRANIAL USG ENDPOINTS
# Add these to main.py
#
# REQUIRED IMPORTS (add to top of main.py):
#   from models import CranialUSGRecord
#   from schemas import CranialUSGCreate, CranialUSGSubmit
# ============================================================================

# ── POST — create or upsert ───────────────────────────────────
@app.post("/form-h/")
def create_form_h(
    data:         CranialUSGCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    existing = (
        db.query(CranialUSGRecord)
        .filter(CranialUSGRecord.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = CranialUSGRecord(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ── GET — load by enrollment_id ───────────────────────────────
@app.get("/form-h/{enrollment_id}")
def get_form_h(
    enrollment_id: str,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(CranialUSGRecord)
        .filter(CranialUSGRecord.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form H not found")
    return record


# ── PUT — full update ─────────────────────────────────────────
@app.put("/form-h/{enrollment_id}")
def update_form_h(
    enrollment_id: str,
    data:          CranialUSGCreate,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(CranialUSGRecord)
        .filter(CranialUSGRecord.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form H not found — use POST to create")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


# ── PATCH — submit and lock ───────────────────────────────────
@app.patch("/form-h/{enrollment_id}/submit")
def submit_form_h(
    enrollment_id: str,
    data:          CranialUSGSubmit,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(CranialUSGRecord)
        .filter(CranialUSGRecord.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form H not found")

    # Update all fields from payload, then lock
    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    record.submission_status = "submitted"
    db.commit()
    db.refresh(record)
    return {"message": "Form H submitted and locked", "status": "submitted"}


# ============================================================================
# FORM K — MRI Brain Assessment Endpoints
# ============================================================================

@app.post("/form-k", response_model=MRIBrainOut)
def create_form_k(
    data:         MRIBrainCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    existing = (
        db.query(MRIBrainAssessment)
        .filter(MRIBrainAssessment.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = MRIBrainAssessment(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/form-k/{enrollment_id}", response_model=MRIBrainOut)
def get_form_k(
    enrollment_id: str,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(MRIBrainAssessment)
        .filter(MRIBrainAssessment.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form K not found")
    return record


@app.put("/form-k/{enrollment_id}", response_model=MRIBrainOut)
def update_form_k(
    enrollment_id: str,
    data:          MRIBrainCreate,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(MRIBrainAssessment)
        .filter(MRIBrainAssessment.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form K not found — use POST to create")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


@app.patch("/form-k/{enrollment_id}/submit")
def submit_form_k(
    enrollment_id: str,
    data:          MRIBrainSubmit,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(MRIBrainAssessment)
        .filter(MRIBrainAssessment.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form K not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    record.submission_status = "submitted"
    db.commit()
    db.refresh(record)
    return {"message": "Form K submitted and locked", "status": "submitted"}


# ============================================================================
# FORM L — Blender Data & Study Summary Endpoints
# ============================================================================

@app.post("/form-l", response_model=BlenderSummaryOut)
def create_form_l(
    data:         BlenderSummaryCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    existing = (
        db.query(BlenderStudySummary)
        .filter(BlenderStudySummary.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = BlenderStudySummary(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/form-l/{enrollment_id}", response_model=BlenderSummaryOut)
def get_form_l(
    enrollment_id: str,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(BlenderStudySummary)
        .filter(BlenderStudySummary.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form L not found")
    return record


@app.put("/form-l/{enrollment_id}", response_model=BlenderSummaryOut)
def update_form_l(
    enrollment_id: str,
    data:          BlenderSummaryCreate,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(BlenderStudySummary)
        .filter(BlenderStudySummary.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form L not found — use POST to create")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


@app.patch("/form-l/{enrollment_id}/submit")
def submit_form_l(
    enrollment_id: str,
    data:          BlenderSummarySubmit,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(BlenderStudySummary)
        .filter(BlenderStudySummary.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Form L not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    record.submission_status = "submitted"
    db.commit()
    db.refresh(record)
    return {"message": "Form L submitted and locked", "status": "submitted"}