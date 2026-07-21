from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
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
    SAEList, User, MRIBrainAssessment, BlenderStudySummary, ParticipantPII
)
from schemas import ScreeningCreate, ScreeningClinicalOut, ScreeningOut, BirthResuscitationCreate,MetabRenalVascEyeDayCreate, MetabRenalVascEyeDaySubmit, BirthResuscitationOut, MaternalDetailsCreate, MaternalDetailsOut, PostnatalDay1Create, PostnatalDay1Out,NICUAdmissionCreate,NICUAdmissionOut,NeonatalMorbiditiesCreate,NeonatalMorbiditiesOut,StudyOutcomesCreate, CranialUSGCreate, CranialUSGSubmit, StudyOutcomesOut,CranialUltrasoundCreate, CranialUltrasoundOut,ROPScreeningCreate, ROPScreeningOut,CompositeOutcomeCreate, CompositeOutcomeOut, FiO2AUCLogCreate, FiO2AUCLogOut, RespCVNeuroLogCreate,RespCVNeuroDayCreate, RespCVNeuroDaySubmit, DischargeUpdate, RespCVNeuroLogOut,InfectGIHemaLogCreate, InfectGIHemaLogOut,MetabRenalVascEyeLogCreate,MetabRenalVascEyeLogOut,SAEReportCreate, SAEReportOut, AdverseEventsCreate, AdverseEventsOut ,SAEListCreate, SAEListOut, UserCreate, UserOut, LoginRequest, LoginResponse, RefreshTokenRequest, TokenRefreshResponse, RespiratoryLogCreate, RespiratoryLogBulkCreate, InfectGIHemaDayCreate, InfectGIHemaDaySubmit,  SteroidDataCreate, FirebaseScreeningImportCreate, MRIBrainCreate, MRIBrainSubmit, MRIBrainOut, BlenderSummaryCreate, BlenderSummarySubmit, BlenderSummaryOut, HelperFormRecordOut, HelperFormRecordsPage
from pydantic import BaseModel
from typing import Optional, List
from deps import (
    get_current_user, is_superadmin, require_superadmin, ensure_same_site,
    ALL_ROLES, ROLE_SUPERADMIN,
)
from routers import enrollment
from routers import pii as pii_router
from routers import staff as staff_router
from routers import audit as audit_router
from routers import dashboard as dashboard_router
from routers import auth as auth_router
import secrets
import string


def generate_temp_password(length: int = 12) -> str:
    """Strong temp password: mixed case + digit + symbol guaranteed, rest random."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length - 2))
        pwd += secrets.choice(string.digits) + secrets.choice("!@#$%&*")
        if any(c.islower() for c in pwd) and any(c.isupper() for c in pwd):
            return pwd
from audit_service import (
    record_audit,
    row_snapshot,
    stamp_created,
    stamp_updated,
    soft_delete_record,
)
from schema_patches import apply_schema_patches
from staff_service import seed_site_staff
from user_service import seed_login_users
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
    can_view_pii_for_site,
)

from sqlalchemy import text, func
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
app.include_router(auth_router.router)
app.include_router(enrollment.router)
app.include_router(pii_router.router)
app.include_router(staff_router.router)
app.include_router(audit_router.router)
app.include_router(dashboard_router.router)


@app.on_event("startup")
def on_startup_migrations():
    # â”€â”€ DB connectivity check with retry (safe for AWS RDS cold start) â”€â”€
    import time
    for attempt in range(1, 6):
        try:
            with engine.connect() as conn:
                db_name = conn.execute(text("SELECT current_database()")).scalar()
                logger.info("âœ… CONNECTED DB: %s", db_name)
            break
        except Exception as exc:
            logger.warning("DB not ready (attempt %s/5): %s", attempt, exc)
            if attempt == 5:
                logger.error("âŒ Could not connect to DB after 5 attempts â€” startup continuing anyway")
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
        new_accounts = seed_login_users(db)
        if new_accounts:
            logger.info(
                "Seeded %s login account(s) — temp passwords written to "
                "backend/credentials/ on this server, NOT logged. Retrieve "
                "and delete that file after distributing passwords.",
                new_accounts,
            )
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
            "detail": "Too many attempts. Please wait a few minutes and try again.",
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

print(f"ðŸ“ CORS Allowed Origins: {ALLOWED_ORIGINS}")

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

def generate_screening_id(site_id: str, db: Session):
    # Sequential per-site IDs: "<site_id>-0001", "<site_id>-0002", ...
    # Uses a row lock on the highest existing ID for this site so two nurses
    # screening at the same site simultaneously can't be handed the same
    # number (Postgres FOR UPDATE blocks the second request until the first
    # transaction commits, rather than both computing the same next number).
    prefix = f"{site_id}-"
    existing = (
        db.query(Screening.screening_id)
        .filter(Screening.screening_id.like(f"{prefix}%"))
        .order_by(Screening.screening_id.desc())
        .with_for_update()
        .first()
    )
    next_number = 1
    if existing:
        suffix = existing[0][len(prefix):]
        if suffix.isdigit():
            next_number = int(suffix) + 1
    return f"{prefix}{next_number:04d}"

def compute_screening_status(data):
    if data.gestation_weeks is None:
        return "Screen Failure"
    
    if data.gestation_weeks >= 32:
        return "Screen Failure"
    
    if data.exclusion_present:
        return "Screen Failure"
    
    if data.consent_given == "Yes":
        return "Eligible"

    if data.consent_given in ("No", "Not approached"):
        return "Not Eligible"

    # Consent hasn't been captured yet (mid-form / autosaved draft) —
    # this is NOT a final "Not Eligible" decision, so don't mark it as
    # excluded. Leave it as Pending until the screener actually reaches
    # and answers the consent step.
    return "Pending"

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

# Health check endpoint â€” required by AWS ALB, ECS, and Elastic Beanstalk
@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as exc:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"status": "error", "db": str(exc)})

# Version endpoint â€” reports which git commit is actually running, so
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
        return {"deployed_commit": "unknown", "note": "VERSION file not found â€” deploy.sh may predate this endpoint, or this is a local/dev run"}

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
    role = (user.role or "").lower()
    if role not in ALL_ROLES:
        raise HTTPException(status_code=400, detail=f"Unknown role '{user.role}'")
    if role == ROLE_SUPERADMIN and not is_superadmin(current_user):
        raise HTTPException(status_code=403, detail="Cannot create a superadmin user")

    existing = db.query(User).filter(User.username == user.username).first()
    if not existing and user.email:
        existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    hashed_pwd = hash_password(user.password)

    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_pwd,
        role=role,
        site_name=user.site_name,
        full_name=user.full_name or user.username,
        mobile=user.mobile,
        must_change_password=True,
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return db_user


@app.post("/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Superadmin-triggered reset: generates a new temp password and forces
    a change on next login. Exists because staff accounts are username-only
    (no real email), so there's no self-serve forgot-password/OTP flow."""
    require_superadmin(current_user)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = generate_temp_password()
    target.hashed_password = hash_password(temp_password)
    target.must_change_password = True
    db.commit()

    return {"username": target.username, "temp_password": temp_password}


# NOTE: /auth/login, /auth/refresh, /auth/me, /auth/logout, /auth/change-password
# now live in routers/auth.py (shared by the web portal and the Flutter app).

# ============================================================================
# FORM A â€” SCREENING ENDPOINTS
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
        screening_id = screening.screening_id or generate_screening_id(screening.site_id, db)
        enrollment_id = screening.enrollment_id
        status = compute_screening_status(screening)
        pii_payload = extract_screening_pii(screening.model_dump())

        # Upsert: autosave may have already created this record; update it instead of re-inserting
        existing = db.query(Screening).filter(Screening.screening_id == screening_id).first()
        if existing:
            old_snapshot = row_snapshot(existing)
            update_data = screening.model_dump(exclude_unset=True)
            update_data.pop("screening_id", None)
            for key, value in update_data.items():
                if hasattr(existing, key) and key not in ("id", "created_at"):
                    setattr(existing, key, value)
            existing.screening_status = status
            clear_screening_pii_columns(existing)
            stamp_updated(existing, current_user)
            if pii_payload:
                upsert_participant_pii(
                    db,
                    enrollment_id=existing.enrollment_id or enrollment_id,
                    screening_id=screening_id,
                    site_name=existing.site_name,
                    **pii_payload,
                )
            record_audit(
                db,
                user_id=current_user.id,
                username=current_user.username,
                action="UPDATE",
                table_name="screenings",
                record_id=existing.id,
                enrollment_id=existing.enrollment_id,
                screening_id=screening_id,
                old_values=old_snapshot,
                new_values=row_snapshot(existing),
            )
            db.commit()
            db.refresh(existing)
            return existing

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
# FORM B â€” BIRTH RESUSCITATION ENDPOINTS
# ============================================================================

@app.post("/birth-resuscitation/")
def create_birth_resuscitation(
    data: BirthResuscitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.enrollment_id:
        raise HTTPException(status_code=422, detail="enrollment_id is required — please enter it before saving Form B")
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = split_and_store_pii(
        db,
        data.model_dump(),
        BIRTH_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        screening_id=data.screening_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    existing = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        payload.pop("enrollment_id", None)
        for key, value in payload.items():
            setattr(existing, key, value)

        db.commit()
        db.refresh(existing)

        if existing.randomised and existing.screening_id:
            db.query(Screening).filter(
                Screening.screening_id == existing.screening_id
            ).update({"enrollment_id": existing.enrollment_id})
            db.commit()

        return existing

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

    record_dict = {col.name: getattr(entry, col.name) for col in entry.__table__.columns}
    record_dict["original_gestation_weeks"] = entry.gestation_weeks
    record_dict["original_gestation_days"] = entry.gestation_days
    record_dict["gestation_source"] = "Form B"

    form_d = (
        db.query(PostnatalDay1)
        .filter(PostnatalDay1.enrollment_id == enrollment_id)
        .first()
    )
    if (
        form_d
        and form_d.ga_method == "NBS"
        and form_d.gestation_weeks is not None
        and form_d.gestation_days is not None
        and entry.gestation_weeks is not None
        and entry.gestation_days is not None
    ):
        original_days = int(entry.gestation_weeks) * 7 + int(entry.gestation_days or 0)
        nbs_days = int(form_d.gestation_weeks) * 7 + int(form_d.gestation_days or 0)
        if abs(nbs_days - original_days) > 14:
            record_dict["gestation_weeks"] = form_d.gestation_weeks
            record_dict["gestation_days"] = form_d.gestation_days
            record_dict["gestation_source"] = "Form D NBS"

    return record_dict

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
# FORM C â€” MATERNAL DETAILS ENDPOINTS
# ============================================================================

@app.post("/maternal-details/", response_model=MaternalDetailsOut)
def create_maternal_details(
    data: MaternalDetailsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    if not data.landmark or not data.landmark.strip():
        raise HTTPException(status_code=422, detail="Nearest landmark is required")
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
    if not data.landmark or not data.landmark.strip():
        raise HTTPException(status_code=422, detail="Nearest landmark is required")
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
# FORM D â€” POSTNATAL DAY 1 ENDPOINTS
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
        data.model_dump(exclude_unset=True),
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
        # No existing record â€” create new one (upsert)
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
# FORM E â€” NICU ADMISSION ENDPOINTS
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
    payload = split_and_store_pii(
        db,
        data.model_dump(),
        NICU_PII_FIELDS,
        enrollment_id=enrollment_id,
        site_name=site_for_enrollment(db, enrollment_id),
    )
    payload["enrollment_id"] = enrollment_id

    record = db.query(NICUAdmission).filter(
        NICUAdmission.enrollment_id == enrollment_id
    ).first()
    if not record:
        record = NICUAdmission(**payload)
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    for key, value in payload.items():
        if hasattr(record, key):
            setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return record


# â”€â”€ Day 1 Date (shared across RespCVNeuro / InfectGIHema / MetabRenalVascEye logs) â”€â”€
class Day1DateUpdate(BaseModel):
    day1_date: date


def _day1_date_is_locked(db: Session, enrollment_id: str) -> bool:
    """Day 1 Date locks once any daily log has been entered for this baby,
    since changing it afterwards would reshuffle which days are past/future."""
    if db.query(RespCVNeuroDayLog).filter(
        RespCVNeuroDayLog.enrollment_id == enrollment_id
    ).first():
        return True
    if db.query(InfectGIHemaDayLog).filter(
        InfectGIHemaDayLog.enrollment_id == enrollment_id
    ).first():
        return True
    if db.query(MetabRenalVascEyeDayLog).filter(
        MetabRenalVascEyeDayLog.enrollment_id == enrollment_id
    ).first():
        return True
    return False


@app.get("/nicu-admission/{enrollment_id}/day1-date")
def get_day1_date(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = db.query(NICUAdmission).filter(
        NICUAdmission.enrollment_id == enrollment_id
    ).first()
    return {
        "day1_date": record.day1_date if record else None,
        "day1_date_set_by": record.day1_date_set_by if record else None,
        "locked": _day1_date_is_locked(db, enrollment_id),
    }


@app.put("/nicu-admission/{enrollment_id}/day1-date")
def update_day1_date(
    enrollment_id: str,
    data: Day1DateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)

    if _day1_date_is_locked(db, enrollment_id) and not is_superadmin(current_user):
        raise HTTPException(
            status_code=409,
            detail="Day 1 Date is locked because daily data already exists for this baby.",
        )

    record = db.query(NICUAdmission).filter(
        NICUAdmission.enrollment_id == enrollment_id
    ).first()
    if not record:
        record = NICUAdmission(enrollment_id=enrollment_id)
        db.add(record)

    record.day1_date = data.day1_date
    record.day1_date_set_by = getattr(current_user, "username", None)
    record.day1_date_set_at = datetime.utcnow()

    db.commit()
    db.refresh(record)
    return {
        "day1_date": record.day1_date,
        "day1_date_set_by": record.day1_date_set_by,
        "locked": _day1_date_is_locked(db, enrollment_id),
    }


# ============================================================================
# FORM F â€” NEONATAL MORBIDITIES ENDPOINTS
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
# FORM G â€” STUDY OUTCOMES ENDPOINTS
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
# FORM J â€” COMPOSITE OUTCOME ENDPOINTS
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
        record = FiO2AUC(enrollment_id=enrollment_id)
        db.add(record)
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
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Paste these routes into main.py
# below the existing FiO2 AUC section
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# ============================================================================
# RESP / CV / NEURO DAILY LOG â€” NEW STRUCTURED ENDPOINTS
# Replaces the old /resp-cv-neuro-log/ blob endpoints
# ============================================================================

def _compute_completion_pct(record) -> int:
    """Compute completion % for a RespCVNeuroDayLog row (spec items 1-37)."""

    def answered(val):
        return val is not None and val != ""

    # ── RESPIRATORY (items 1-22) ──
    resp_bool_fields = [
        "respiratory_support", "endotracheal_intubation",       # 1, 2
        "supp_o2", "surfactant", "caffeine",                    # 7, 11, 12
        "extub_attempted", "extub_failure", "pulm_hemorrhage",  # 16, 17, 18
        "pneumothorax", "chest_drain", "pphn", "postnatal_steroids",  # 19-22
    ]
    resp_text_fields = [
        "map_cpap", "max_fio2", "max_flow",                     # 4, 5, 6
        "lowest_ph", "pao2_range", "paco2_range",                # 8, 9, 10
        "apnea_count", "desaturation_count", "severe_desaturation_count",  # 13, 14, 15
    ]
    resp_done = (
        (1 if answered(getattr(record, "weight_kg", None)) else 0)      # 2.1 weight
        + sum(1 for f in resp_bool_fields if answered(getattr(record, f, None)))
        + sum(1 for f in resp_text_fields if answered(getattr(record, f, None)))
        + (1 if answered(getattr(record, "support_modes", None)) else 0)  # 3
    )
    resp_total = len(resp_bool_fields) + len(resp_text_fields) + 1 + 1  # = 23 (weight + items 1-22)

    # ── CARDIOVASCULAR (items 23-29) ──
    cv_bool_fields = ["pda_suspected", "echo_done", "hs_pda", "shock", "vasoactive_support"]  # 23-27
    vasoactive_visible = getattr(record, "vasoactive_support", None) is True
    cv_done = (
        sum(1 for f in cv_bool_fields if answered(getattr(record, f, None)))
        + (1 if answered(getattr(record, "fluid_bolus", None)) else 0)  # 29
        + (1 if vasoactive_visible and answered(getattr(record, "vasoactive_drugs", None)) else 0)  # 28
    )
    cv_total = len(cv_bool_fields) + 1 + (1 if vasoactive_visible else 0)

    # ── NEUROLOGICAL (items 30-37) ──
    neuro_base = [
        "cranial_usg", "ivh", "cpvl_confirmed", "ventriculomegaly",       # 30-33
        "clinical_seizures", "eeg_seizures", "aeds_given", "non_ivh_ich",  # 34-37
    ]
    ivh_visible = getattr(record, "ivh", None) is True
    neuro_done = sum(1 for f in neuro_base if answered(getattr(record, f, None)))
    if ivh_visible and answered(getattr(record, "ivh_grade", None)):
        neuro_done += 1
    neuro_total = len(neuro_base) + (1 if ivh_visible else 0)

    total_fields = resp_total + cv_total + neuro_total  # = 37 (+1 if vasoactive/ivh visible)
    total_done   = resp_done + cv_done + neuro_done

    return min(100, round((total_done / total_fields) * 100)) if total_fields else 0


# â”€â”€ GET single day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


# â”€â”€ GET summary (all days for timeline status indicators) â”€â”€â”€â”€â”€
# ── GET records (cross-patient list — Helper Form Records page) ──────────────
@app.get("/resp-cv-neuro/records", response_model=HelperFormRecordsPage)
def list_resp_cv_neuro_records(
    request:      Request,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    date_filter:  str     = "today",   # today | yesterday | last7 | all
    status:       str     = "all",     # all | pending | completed | empty | draft | complete | submitted | late
    site:         str | None = None,
    search:       str     = "",
    page:         int     = 1,
    per_page:     int     = 25,
):
    """List Helper Form 2 (Resp/CV/Neuro) daily-log records across patients,
    for the day-to-day work queue. 'Today' is derived from date_of_birth +
    (nicu_day - 1), matching the calendar date the form itself computes for
    each NICU day — not the row's created_at/updated_at, which only reflects
    when it was last edited."""
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)

    screening_query = db.query(Screening).filter(Screening.is_deleted.isnot(True))
    if not is_superadmin(current_user):
        screening_query = screening_query.filter(Screening.site_name == current_user.site_name)
    elif site:
        screening_query = screening_query.filter(Screening.site_name == site)

    accessible = {s.enrollment_id: s for s in screening_query.all() if s.enrollment_id}
    if not accessible:
        return HelperFormRecordsPage(total=0, page=page, per_page=per_page, records=[])

    logs = (
        db.query(RespCVNeuroDayLog)
        .filter(RespCVNeuroDayLog.enrollment_id.in_(accessible.keys()))
        .all()
    )

    dob_map = {
        r.enrollment_id: r.date_of_birth
        for r in db.query(BirthResuscitation.enrollment_id, BirthResuscitation.date_of_birth)
        .filter(BirthResuscitation.enrollment_id.in_(accessible.keys()))
        .all()
    }

    pii_map = {}
    for p in db.query(ParticipantPII).filter(ParticipantPII.enrollment_id.in_(accessible.keys())).all():
        screening = accessible.get(p.enrollment_id)
        site_name = screening.site_name if screening else None
        if can_view_pii_for_site(current_user, site_name):
            name = " ".join(filter(None, [p.mother_first_name, p.mother_surname])).strip()
            pii_map[p.enrollment_id] = name or None

    today = date.today()
    if date_filter == "today":
        date_range = (today, today)
    elif date_filter == "yesterday":
        y = today - timedelta(days=1)
        date_range = (y, y)
    elif date_filter == "last7":
        date_range = (today - timedelta(days=6), today)
    else:
        date_range = None

    status_pending = {"empty", "draft", "complete", "late"}
    search_lower = search.strip().lower()

    rows: list[HelperFormRecordOut] = []
    for log in logs:
        screening = accessible.get(log.enrollment_id)
        dob = dob_map.get(log.enrollment_id)
        calendar_date = (dob + timedelta(days=log.nicu_day - 1)) if dob else None

        if date_range and (calendar_date is None or not (date_range[0] <= calendar_date <= date_range[1])):
            continue

        log_status = log.submission_status or "empty"
        if status == "pending" and log_status not in status_pending:
            continue
        if status == "completed" and log_status != "submitted":
            continue
        if status not in ("all", "pending", "completed") and log_status != status:
            continue

        mother_name = pii_map.get(log.enrollment_id)

        if search_lower:
            haystack = " ".join(filter(None, [
                log.enrollment_id,
                screening.screening_id if screening else None,
                mother_name,
            ])).lower()
            if search_lower not in haystack:
                continue

        rows.append(HelperFormRecordOut(
            enrollment_id=log.enrollment_id,
            screening_id=screening.screening_id if screening else None,
            site_name=screening.site_name if screening else None,
            nicu_day=log.nicu_day,
            calendar_date=calendar_date,
            mother_name=mother_name,
            submission_status=log_status,
            completion_pct=_compute_completion_pct(log),
            saved_at=log.saved_at,
            saved_by=log.saved_by,
            submitted_at=log.submitted_at,
            submitted_by=log.submitted_by,
            created_at=log.created_at,
            updated_at=log.updated_at,
        ))

    rows.sort(key=lambda r: r.updated_at or r.created_at or datetime.min, reverse=True)

    total = len(rows)
    start = (page - 1) * per_page
    page_rows = rows[start:start + per_page]

    if total >= 50:
        security_monitor.record_bulk_access(
            current_user.username,
            "/resp-cv-neuro/records",
            total,
            get_remote_address(request),
        )

    return HelperFormRecordsPage(total=total, page=page, per_page=per_page, records=page_rows)


# ── GET latest update (lightweight polling for "new records" banner) ─────────
@app.get("/resp-cv-neuro/records/latest-update")
def get_resp_cv_neuro_latest_update(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Returns the most recent updated_at across accessible Helper Form 2 day
    logs, so the frontend can detect newly-synced or edited records with a
    cheap poll instead of re-fetching the full list."""
    query = (
        db.query(func.max(RespCVNeuroDayLog.updated_at))
        .join(Screening, Screening.enrollment_id == RespCVNeuroDayLog.enrollment_id)
        .filter(Screening.is_deleted.isnot(True))
    )
    if not is_superadmin(current_user):
        query = query.filter(Screening.site_name == current_user.site_name)
    return {"latest_updated_at": query.scalar()}


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


# â”€â”€ POST create day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/resp-cv-neuro/")
def create_resp_cv_neuro_day(
    data:         RespCVNeuroDayCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    # Prevent duplicate â€” upsert pattern
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


# â”€â”€ PUT update day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        raise HTTPException(status_code=404, detail="Record not found â€” use POST to create")

    # Block edits on submitted days
    if record.submission_status == "submitted":
        raise HTTPException(status_code=403, detail="Day is submitted and locked")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("enrollment_id", "nicu_day"):
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


# â”€â”€ PATCH submit day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

# â”€â”€ PATCH discharge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    # separate approach. For now return success â€” add a
    # discharge_date column to BirthResuscitation if needed.

    return {
        "message":        f"Patient discharged on Day {data.discharge_day}",
        "discharge_date": data.discharge_date,
        "discharge_day":  data.discharge_day,
    }
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Paste into main.py after the Resp-CV-Neuro routes section
#
# Add to main.py imports:
#   from models import InfectGIHemaDayLog
#   from schemas import InfectGIHemaDayCreate, InfectGIHemaDaySubmit
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# ============================================================================
# INFECT / GI / HEMA DAILY LOG â€” STRUCTURED PER-DAY ENDPOINTS
# ============================================================================

def _infect_completion_pct(r) -> int:
    """Compute completion % for all 30 fields with proper conditional logic."""

    def ans(v):
        """Check if value is answered (handles arrays/strings/None)."""
        if v is None or v == "":
            return False
        if isinstance(v, list):
            return len(v) > 0
        return True

    # ── INFECTION (Fields 1-9) ──────────────────────────────────
    # Base fields (always visible): 6 fields
    INF_BASE = ["sepsis_suspected", "antibiotics", "lp_done", "clabsi", "vap"]  # 1,4,5,8,9
    # Sepsis conditional fields: 2 fields (visible when sepsis_suspected = Yes)
    INF_SEPSIS = ["blood_culture_sent", "blood_culture_positive"]  # 2,3
    # Meningitis field: 1 field (visible when meningitis = Yes)
    INF_MENING = ["meningitis_type"]  # 7

    sepsis_yes = getattr(r, "sepsis_suspected", None) is True
    meningitis_yes = getattr(r, "meningitis", None) is True

    inf_total = (
        len(INF_BASE)
        + 1  # meningitis Y/N (#6)
        + (len(INF_SEPSIS) if sepsis_yes else 0)
        + (len(INF_MENING) if meningitis_yes else 0)
    )
    inf_done = (
        sum(1 for k in INF_BASE if ans(getattr(r, k, None)))
        + (1 if ans(getattr(r, "meningitis", None)) else 0)
        + (sum(1 for k in INF_SEPSIS if ans(getattr(r, k, None))) if sepsis_yes else 0)
        + (sum(1 for k in INF_MENING if ans(getattr(r, k, None))) if meningitis_yes else 0)
    )

    # ── GASTROINTESTINAL (Fields 10-22) ────────────────────────
    # Base fields (always visible): 12 fields
    GI_BASE = [
        "npo", "men", "feed_type",
        "cumulative_feed_volume", "feed_volume", "iv_fluids",
        "parenteral_nutrition", "probiotic", "feed_intolerance",
        "nec_suspected", "cholestasis"
    ]  # 10-11, 13-20, 22
    
    # Handle field rename: enteral_feeds_received (new) or enteral_feeds_started (old)
    enteral_feeds_field = "enteral_feeds_received" if hasattr(r, "enteral_feeds_received") else "enteral_feeds_started"
    
    # NEC conditional field: 1 field (visible when nec_suspected = Yes)
    GI_NEC = ["nec_confirmed_stage"]  # 21

    nec_yes = getattr(r, "nec_suspected", None) is True
    gi_total = len(GI_BASE) + 1 + (len(GI_NEC) if nec_yes else 0)  # +1 for enteral_feeds field
    gi_done = (
        sum(1 for k in GI_BASE if ans(getattr(r, k, None)))
        + (1 if ans(getattr(r, enteral_feeds_field, None)) else 0)  # Check either old or new field name
        + (sum(1 for k in GI_NEC if ans(getattr(r, k, None))) if nec_yes else 0)
    )

    # ── HEMATOLOGY (Fields 23-30) ──────────────────────────────
    # Base fields (always visible): 7 fields
    HEMA_BASE = [
        "hb_value", "jaundice", "peak_tsb", "exchange_transfusion",
        "prbc_transfusion", "platelet_transfusion", "ffp_cryo"
    ]  # 23,24,26-30
    # Jaundice conditional field: 1 field (visible when jaundice = Yes)
    HEMA_JAUNDICE = ["phototherapy"]  # 25

    jaundice_yes = getattr(r, "jaundice", None) is True
    hema_total = len(HEMA_BASE) + (len(HEMA_JAUNDICE) if jaundice_yes else 0)
    hema_done = (
        sum(1 for k in HEMA_BASE if ans(getattr(r, k, None)))
        + (sum(1 for k in HEMA_JAUNDICE if ans(getattr(r, k, None))) if jaundice_yes else 0)
    )

    total_fields = inf_total + gi_total + hema_total
    total_done = inf_done + gi_done + hema_done

    return min(100, round((total_done / total_fields) * 100)) if total_fields else 0


# â”€â”€ GET summary (all days â€” for timeline status indicators) â”€â”€â”€
# NOTE: this must be declared BEFORE the "/{nicu_day}" route below, otherwise
# FastAPI matches "summary" against the int path param first and returns 422.
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
    
    print(f"DEBUG: Found {len(records)} records for enrollment {enrollment_id}")
    
    result = []
    for r in records:
        try:
            print(f"DEBUG: Processing day {r.nicu_day}")
            print(f"  - nicu_day type: {type(r.nicu_day)}, value: {r.nicu_day}")
            print(f"  - submission_status type: {type(r.submission_status)}, value: {r.submission_status}")
            
            completion_pct = _infect_completion_pct(r)
            print(f"  - completion_pct: {completion_pct}")
            
            item = {
                "nicu_day":          r.nicu_day,
                "submission_status": r.submission_status or "empty",
                "completion_pct":    completion_pct,
                "saved_at":          r.saved_at,
                "submitted_at":      r.submitted_at,
            }
            print(f"  - item created successfully: {item}")
            result.append(item)
        except Exception as e:
            import traceback
            print(f"ERROR processing day {r.nicu_day}: {e}")
            print(traceback.format_exc())
            raise
    
    print(f"DEBUG: Returning result with {len(result)} items")
    return result


# â”€â”€ GET single day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


# â”€â”€ POST create day (upsert) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


# â”€â”€ PUT update day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        raise HTTPException(status_code=404, detail="Record not found â€” use POST to create")
    if record.submission_status == "submitted":
        raise HTTPException(status_code=403, detail="Day is submitted and locked")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("enrollment_id", "nicu_day"):
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


# â”€â”€ PATCH submit day â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# 3. ADD TO main.py  (imports + routes)
#
# Add to imports:
#   from models import MetabRenalVascEyeDayLog
#   from schemas import MetabRenalVascEyeDayCreate, MetabRenalVascEyeDaySubmit
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 
def _metab_completion_pct(r) -> int:
    """Compute completion % for Helper Form 4 (items 1-25)."""
    def ans(v): return v is not None and v != "" and not (isinstance(v, list) and len(v)==0)

    # ── 4.1 METABOLIC (items 1-10) ──
    metab_fields = [
        "lowest_glucose", "hypoglycemia_episodes", "hypoglycemia_rx",  # 1, 2, 3
        "highest_glucose", "insulin", "metabolic_acidosis",            # 4, 5, 6
        "sodium_value", "potassium_value", "ionized_calcium_value",    # 7, 8, 9
        "osteopenia_suspected",                                        # 10
    ]
    metab_done  = sum(1 for k in metab_fields if ans(getattr(r, k, None)))
    metab_total = len(metab_fields)

    # ── 4.2 RENAL (items 11-14) ──
    renal_fields = ["aki_stage", "creatinine", "urine_output_total", "dialysis_crrt"]
    renal_done   = sum(1 for k in renal_fields if ans(getattr(r, k, None)))
    renal_total  = len(renal_fields)

    # ── 4.3 THERMOREGULATION (item 15) ──
    thermo_fields = ["axillary_temperature"]
    thermo_done   = sum(1 for k in thermo_fields if ans(getattr(r, k, None)))

    # ── 4.4 VASCULAR ACCESS (items 16-22) ──
    vasc_keys   = ["picc_in_situ","uvc_in_situ","uac_in_situ","peripheral_iv",
                   "peripheral_arterial","extravasation_injury","line_complication"]
    vasc_done   = sum(1 for k in vasc_keys if ans(getattr(r, k, None)))

    # ── 4.5 OPHTHALMOLOGY (items 23-25) ──
    eye_base    = ["rop_screening_due","rop_screened","rop_detected"]
    eye_rop     = ["rop_stage","plus_disease","rop_treatment"]
    rop_yes     = getattr(r, "rop_detected", None) is True
    eye_total   = len(eye_base) + (len(eye_rop) if rop_yes else 0)
    eye_done    = (sum(1 for k in eye_base if ans(getattr(r, k, None)))
                 + (sum(1 for k in eye_rop if ans(getattr(r, k, None))) if rop_yes else 0))

    # ── 4.6 LOCATION / 4.7 SURVIVED THE DAY ──
    tail_fields = ["location", "survived_the_day"]
    tail_done   = sum(1 for k in tail_fields if ans(getattr(r, k, None)))

    total_fields = (metab_total + renal_total + len(thermo_fields) + len(vasc_keys)
                    + eye_total + len(tail_fields))
    total_done   = metab_done + renal_done + thermo_done + vasc_done + eye_done + tail_done
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
        raise HTTPException(status_code=404, detail="Record not found â€” use POST to create")
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
# FORM H â€” CRANIAL USG ENDPOINTS
# Add these to main.py
#
# REQUIRED IMPORTS (add to top of main.py):
#   from models import CranialUSGRecord
#   from schemas import CranialUSGCreate, CranialUSGSubmit
# ============================================================================

# â”€â”€ POST â€” create or upsert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


# â”€â”€ GET â€” load by enrollment_id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


# â”€â”€ PUT â€” full update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        raise HTTPException(status_code=404, detail="Form H not found â€” use POST to create")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


# â”€â”€ PATCH â€” submit and lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
# FORM K â€” MRI Brain Assessment Endpoints
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
        raise HTTPException(status_code=404, detail="Form K not found â€” use POST to create")

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
# FORM L â€” Blender Data & Study Summary Endpoints
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
        raise HTTPException(status_code=404, detail="Form L not found â€” use POST to create")

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