from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from datetime import datetime, date, time, timedelta
import random, string
import json
import re
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
    CranialUltrasound, ROPScreening, CompositeOutcome, ExternalHospitalAssessment,
    FiO2AUC, RespCVNeuroLog, RespCVNeuroDayLog, InfectGIHemaLog,InfectGIHemaDayLog,
    MetabRenalVascEyeLog,MetabRenalVascEyeDayLog, MinimalMonitoringDayLog,
    CranialUSGRecord, SAEReport, AdverseEvents,
    SAEList, User, MRIBrainAssessment, BlenderStudySummary, ParticipantPII
)
from schemas import ScreeningCreate, ScreeningClinicalOut, ScreeningOut, BirthResuscitationCreate,MetabRenalVascEyeDayCreate, MetabRenalVascEyeDaySubmit, MinimalMonitoringDayCreate, MinimalMonitoringDayOut, BirthResuscitationOut, MaternalDetailsCreate, MaternalDetailsOut, PostnatalDay1Create, PostnatalDay1Out,NICUAdmissionCreate,NICUAdmissionOut,NeonatalMorbiditiesCreate,NeonatalMorbiditiesOut,StudyOutcomesCreate, CranialUSGCreate, CranialUSGSubmit, StudyOutcomesOut,CranialUltrasoundCreate, CranialUltrasoundOut,ROPScreeningCreate, ROPScreeningOut,CompositeOutcomeCreate, CompositeOutcomeOut, ExternalHospitalAssessmentCreate, ExternalHospitalAssessmentOut, FiO2AUCLogCreate, FiO2AUCLogOut, RespCVNeuroLogCreate,RespCVNeuroDayCreate, RespCVNeuroDaySubmit, DischargeUpdate, RespCVNeuroLogOut,InfectGIHemaLogCreate, InfectGIHemaLogOut,MetabRenalVascEyeLogCreate,MetabRenalVascEyeLogOut,SAEReportCreate, SAEReportOut, AdverseEventsCreate, AdverseEventsOut ,SAEListCreate, SAEListOut, UserCreate, UserOut, LoginRequest, LoginResponse, RefreshTokenRequest, TokenRefreshResponse, RespiratoryLogCreate, RespiratoryLogBulkCreate, InfectGIHemaDayCreate, InfectGIHemaDaySubmit,  SteroidDataCreate, FirebaseScreeningImportCreate, MRIBrainCreate, MRIBrainSubmit, MRIBrainOut, BlenderSummaryCreate, BlenderSummarySubmit, BlenderSummaryOut, HelperFormRecordOut, HelperFormRecordsPage
from pydantic import BaseModel
from typing import Optional, List
from deps import (
    get_current_user, is_superadmin, is_global, require_superadmin, ensure_same_site,
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
from staff_service import seed_site_staff, deactivate_stale_site_staff
from user_service import seed_login_users
import security_monitor
from crypto import decrypt_value
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
    get_pii_for_participant,
    can_view_pii_for_site,
)

from sqlalchemy import text, func
from sqlalchemy.exc import IntegrityError
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
    #  -  DB connectivity check with retry (safe for AWS RDS cold start)  - 
    import time
    for attempt in range(1, 6):
        try:
            with engine.connect() as conn:
                db_name = conn.execute(text("SELECT current_database()")).scalar()
                logger.info(" -  CONNECTED DB: %s", db_name)
            break
        except Exception as exc:
            logger.warning("DB not ready (attempt %s/5): %s", attempt, exc)
            if attempt == 5:
                logger.error(" -  Could not connect to DB after 5 attempts  -  startup continuing anyway")
            else:
                time.sleep(3)

    try:
        apply_schema_patches(engine)
    except Exception as exc:
        logger.warning("Schema patches skipped: %s", exc)

    try:
        from crypto import _get_fernet
        _get_fernet()
        logger.info("✅ PII encryption key (KMS-wrapped DEK) loaded successfully")
    except Exception as exc:
        logger.error(
            "❌ Could not load PII encryption key at startup — participant_pii "
            "reads/writes will fail until this is fixed: %s", exc
        )

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
        cleaned = deactivate_stale_site_staff(db)
        if cleaned:
            logger.info("Deactivated %s stale/incorrect site staff record(s)", cleaned)
        new_accounts = seed_login_users(db)
        if new_accounts:
            logger.info(
                "Seeded %s login account(s) ? temp passwords written to "
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

print(f" - - CORS Allowed Origins: {ALLOWED_ORIGINS}")

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

# FIX: the backend used to trust whatever `site_id` the client sent in the
# create-screening payload with zero validation, generating the ID prefix
# straight from it (see generate_screening_id below). The frontend has its
# own SITE_ID_MAP (ScreeningForm.jsx) that's SUPPOSED to match this, and
# does today ? but nothing enforced that, so any drift between them (a
# frontend bug, a stale build, or a legacy user account with a wrong
# site_name already stored from before naming conventions were settled)
# could silently produce a screening_id with the WRONG site prefix ? e.g. a
# GMCH screening getting "01-" (PGIMER's prefix) instead of "02-". This is
# now the single source of truth: create_screening below computes site_id
# from site_name itself and ignores whatever the client sent for site_id,
# so a client-side bug can no longer produce a mismatched prefix.
CANONICAL_SITE_ID_MAP = {
    "PGIMER": "01",
    "GMCH":   "02",
    "IOG":    "03",
    "AFMC":   "04",
    "GMCH-A": "05",
    "AMC":    "06",
}


def generate_screening_id(site_id: str, db: Session):
    # Sequential per-site IDs: "<site_id>-0001", "<site_id>-0002", ...
    #
    # FIX: the previous version did `ORDER BY screening_id DESC LIMIT 1` to
    # find "the highest existing ID" ? but screening_id is a text column, so
    # that's a LEXICOGRAPHIC (string) sort, not a numeric one. Any row whose
    # suffix isn't purely digits (e.g. a legacy/test id like
    # "01-20260626-034005-3GUN") can still sort ahead of a plain numeric one
    # like "01-1000" simply because '2' > '1' as a character ? and since
    # that suffix fails the isdigit() check below, next_number silently fell
    # back to 1, handing out an ID ("01-0001", or whatever number) that
    # already exists ? unique constraint violation on insert.
    #
    # Fix: scan every existing id under this site's prefix, parse out only
    # the ones with a purely-numeric suffix, and take the true numeric max
    # of those + 1. Non-numeric legacy suffixes are simply ignored for
    # numbering purposes instead of corrupting the result.
    prefix = f"{site_id}-"
    rows = (
        db.query(Screening.screening_id)
        .filter(Screening.screening_id.like(f"{prefix}%"))
        .with_for_update()
        .all()
    )
    max_number = 0
    for (sid,) in rows:
        suffix = sid[len(prefix):]
        if suffix.isdigit():
            max_number = max(max_number, int(suffix))
    next_number = max_number + 1
    return f"{prefix}{next_number:04d}"

def compute_screening_status(data):
    """Authoritative screening_status for web + mobile (Form A).

    Labels match Screening Form / ViewEntries banners:
      Screen Failure — GA undeterminable (Neither) OR any exclusion Yes
      Not Eligible   — GA outside 25w0d–31w6d, OR consent No / Not approached
      Eligible       — GA in window, no exclusion, consent Yes or Trial run
      Pending        — screening incomplete (no GA yet) OR clinically OK
                       but consent not yet recorded
    """
    gestation_known = getattr(data, "gestation_known", None)
    ga_source = getattr(data, "ga_source", None)
    if gestation_known == "No" and ga_source == "Neither":
        return "Screen Failure"

    if data.gestation_weeks is None:
        return "Pending"

    weeks = int(data.gestation_weeks)
    days = int(getattr(data, "gestation_days", None) or 0)
    total_days = weeks * 7 + days
    # Eligible window: 25w0d – 31w6d inclusive (Form A GA banner = Not Eligible)
    if total_days < 25 * 7 or total_days > 31 * 7 + 6:
        return "Not Eligible"

    if data.exclusion_present:
        return "Screen Failure"

    consent = getattr(data, "consent_given", None)
    # Trial run is allowed to proceed the same way as Yes (web Sidebar)
    if consent in ("Yes", "Trial run"):
        return "Eligible"

    if consent in ("No", "Not approached"):
        return "Not Eligible"

    # Clinically passed inclusion; consent not answered yet
    return "Pending"


def heal_screening_status(entry, db: Session | None = None) -> bool:
    """Recompute and optionally persist screening_status. Returns True if changed."""
    new_status = compute_screening_status(entry)
    if entry.screening_status == new_status:
        return False
    entry.screening_status = new_status
    if db is not None:
        try:
            db.commit()
            db.refresh(entry)
        except Exception:
            db.rollback()
    return True

def get_accessible_screening_query(db: Session, user: User):
    query = db.query(Screening).filter(Screening.is_deleted.isnot(True))
    if not is_global(user):
        query = query.filter(Screening.site_name == user.site_name)
    return query

def require_enrollment_access(enrollment_id: str, db: Session, user: User):
    if not enrollment_id or not enrollment_id.strip():
        raise HTTPException(
            status_code=422,
            detail="enrollment_id is required — this form can't be saved until randomization assigns one.",
        )
    eid = enrollment_id.strip()
    # Non-randomised / no-PPV placeholder IDs: NR-{screening_id}
    if eid.startswith("NR-"):
        screening = db.query(Screening).filter(
            Screening.screening_id == eid[3:]
        ).first()
        if screening:
            ensure_same_site(screening.site_name, user)
        return
    screening = db.query(Screening).filter(Screening.enrollment_id == eid).first()
    if screening:
        ensure_same_site(screening.site_name, user)


def site_for_enrollment(db: Session, enrollment_id: str | None) -> str | None:
    if not enrollment_id:
        return None
    eid = enrollment_id.strip()
    if eid.startswith("NR-"):
        screening = db.query(Screening).filter(
            Screening.screening_id == eid[3:]
        ).first()
        return screening.site_name if screening else None
    screening = db.query(Screening).filter(Screening.enrollment_id == eid).first()
    return screening.site_name if screening else None


def resolve_birth_enrollment_id(data) -> str | None:
    """Return enrollment_id, auto-assigning NR-{screening_id} for non-randomised / no-PPV."""
    eid = (data.enrollment_id or "").strip() if data.enrollment_id else ""
    if eid:
        return eid
    if data.screening_id and (
        data.randomised is False or data.required_resuscitation is False
    ):
        return f"NR-{data.screening_id}"
    return None


def link_screening_enrollment(
    db: Session, screening_id: str | None, enrollment_id: str | None
) -> None:
    """Write enrollment_id (incl. NR- placeholders) onto the screening row.

    Web Form B loads birth data via screenings.enrollment_id → GET
    /birth-resuscitation/{eid}. Mobile no-PPV / not-randomised saves use
    NR-{screening_id}; without this link the web form opens blank.

    Also keep participant_pii.enrollment_id / screening_id in sync so Form B
    identity fields (maternal UID, mother name, phones) resolve after enroll.
    """
    if not screening_id or not enrollment_id:
        return
    sid = str(screening_id).strip()
    eid = str(enrollment_id).strip()
    if not sid or not eid:
        return
    db.query(Screening).filter(Screening.screening_id == sid).update(
        {"enrollment_id": eid}
    )
    try:
        # Merge Form A (screening_id) and Form B (enrollment_id) PII rows if
        # they split; never stamp screening_id onto a second row.
        upsert_participant_pii(db, enrollment_id=eid, screening_id=sid)
    except Exception:
        pass
    db.commit()

# ============================================================================
# UTILITY ENDPOINTS
# ============================================================================

@app.get("/")
def root():
    return {"message": "PORTAL Trial API is running!"}

# Health check endpoint  -  required by AWS ALB, ECS, and Elastic Beanstalk
@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as exc:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"status": "error", "db": str(exc)})

# Version endpoint  -  reports which git commit is actually running, so
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
        return {"deployed_commit": "unknown", "note": "VERSION file not found  -  deploy.sh may predate this endpoint, or this is a local/dev run"}

# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@app.get("/users/", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Superadmin-only directory of every login account, so accounts can be
    found (and their id looked up) before deactivating/removing one."""
    require_superadmin(current_user)
    return db.query(User).order_by(User.site_name, User.role, User.username).all()


@app.delete("/users/{user_id}")
def remove_user(
    user_id: int,
    hard_delete: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Superadmin-only. By default this DEACTIVATES the account (is_active=
    False) rather than deleting the row ? the account can no longer log in,
    but historical screenings/forms created under their username still show
    who did what. Pass ?hard_delete=true only if you're certain the account
    never created any records (irreversible, and will break any records
    that do reference it)."""
    require_superadmin(current_user)

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove your own account")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if hard_delete:
        db.delete(target)
        db.commit()
        return {"message": f"User '{target.username}' permanently deleted"}

    target.is_active = False
    db.commit()
    return {"message": f"User '{target.username}' deactivated (can no longer log in)"}


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
# FORM A  -  SCREENING ENDPOINTS
# ============================================================================

@app.get("/screenings/", response_model=list[ScreeningClinicalOut])
def get_screenings(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 200,
):
    # Mobile + webforms share this list. Default was 50 which hid older
    # patients on both clients; cap at 500 to keep bulk exports bounded.
    limit = min(max(limit, 1), 500)
    skip = max(skip, 0)
    rows = (
        get_accessible_screening_query(db, current_user)
        .order_by(Screening.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    # Heal stale screening_status so web ViewEntries and mobile chips stay aligned.
    dirty = False
    for row in rows:
        if heal_screening_status(row):
            dirty = True
    if dirty:
        try:
            db.commit()
        except Exception:
            db.rollback()
    if len(rows) >= 50:
        security_monitor.record_bulk_access(
            current_user.username,
            "/screenings/",
            len(rows),
            get_remote_address(request),
        )
    return rows

@app.get("/screening/stats")
def get_screening_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Mobile app dashboards (nurse/PI/scientist/DEO/monitor home screens)
    # call this for their stat cards ? it previously didn't exist at all,
    # so every call silently failed and cards always showed 0/"--".
    # Deliberately a simple {total, enrolled, excluded, pending} shape,
    # not the full CONSORT box breakdown ? same site-scoping as GET
    # /screenings/ so these numbers always agree with the patient list.
    rows = get_accessible_screening_query(db, current_user).all()
    dirty = False
    for row in rows:
        if heal_screening_status(row):
            dirty = True
    if dirty:
        try:
            db.commit()
        except Exception:
            db.rollback()
    enrolled = sum(1 for r in rows if r.screening_status == "Eligible")
    excluded = sum(1 for r in rows
                   if r.screening_status in ("Not Eligible", "Screen Failure"))
    return {
        "total": len(rows),
        "enrolled": enrolled,
        "excluded": excluded,
        "pending": len(rows) - enrolled - excluded,
    }

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

    heal_screening_status(entry, db)
    return entry

@app.post("/screenings/", response_model=ScreeningOut)
def create_screening(
    screening: ScreeningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_same_site(screening.site_name, current_user)

    # FIX: derive site_id from site_name server-side rather than trusting
    # the client's own site_id field ? see CANONICAL_SITE_ID_MAP above for
    # why. If site_name isn't in the canonical map at all (a genuinely
    # unrecognized site, e.g. a typo an admin made in ManageStaff), reject
    # clearly instead of silently falling back to some default that would
    # itself produce a wrong prefix.
    canonical_site_id = CANONICAL_SITE_ID_MAP.get((screening.site_name or "").strip())
    if not canonical_site_id:
        raise HTTPException(
            status_code=422,
            detail=f"Unrecognized site_name '{screening.site_name}' ? cannot determine "
                   f"the correct screening ID prefix. Known sites: "
                   f"{', '.join(CANONICAL_SITE_ID_MAP.keys())}.",
        )
    screening.site_id = canonical_site_id

    # Only auto-generated IDs are safe to silently retry with a new number ?
    # if the CLIENT explicitly supplied its own screening_id (e.g. it thinks
    # it already has a server-confirmed one) and that collides, retrying
    # with a different ID would desync the client's own state, so that case
    # still raises immediately below.
    client_supplied_id = bool(screening.screening_id)

    # Defense in depth: generate_screening_id() now computes the numeric max
    # correctly (see its docstring for the lexicographic-sort bug this used
    # to have), but a bounded retry here means a transient race or any other
    # id-generation edge case still surfaces as a successful save instead of
    # a raw 500/psycopg2 error on the nurse's screen.
    max_attempts = 1 if client_supplied_id else 3
    last_error = None

    for attempt in range(max_attempts):
        try:
            screening_id = screening.screening_id or generate_screening_id(screening.site_id, db)
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
                gestation_known=screening.gestation_known,
                gestation_weeks=screening.gestation_weeks,
                gestation_days=screening.gestation_days,
                gestation_method=screening.gestation_method,
                expected_delivery_date=screening.expected_delivery_date,
                lmp_date=screening.lmp_date,
                ga_source=screening.ga_source,
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
                explicitly_saved=bool(screening.explicitly_saved),
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
        except IntegrityError as e:
            db.rollback()
            is_screening_id_collision = "ix_screenings_screening_id" in str(e) or "screening_id" in str(e)

            if is_screening_id_collision:
                # This almost always means the record was already created by
                # an earlier, successful save (e.g. autosave and the manual
                # Save button both firing, or the client retrying after a
                # dropped response) ? not a genuine conflict. Rather than
                # failing the nurse's save outright, fall back to updating
                # the record that already exists with this screening_id.
                existing = get_accessible_screening_query(db, current_user).filter(
                    Screening.screening_id == screening_id
                ).first()
                if existing is not None:
                    return update_screening(
                        screening_id=screening_id,
                        updated_data=screening,
                        db=db,
                        current_user=current_user,
                    )
                # Existing row isn't visible to this user (different site) ?
                # a real, unrecoverable conflict.
                logger.error(f"SCREENING ERROR: {e}")
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Screening ID {screening_id} is already in use and "
                        "isn't accessible from your site. Please refresh the "
                        "page and try saving again."
                    ),
                )

            if client_supplied_id or attempt == max_attempts - 1:
                logger.error(f"SCREENING ERROR: {e}")
                raise HTTPException(
                    status_code=400,
                    detail="Couldn't save this screening due to a conflicting record. Please refresh the page and try again.",
                )
            last_error = e
            continue  # retry with a freshly generated id
        except Exception as e:
            db.rollback()
            logger.error(f"SCREENING ERROR: {e}")
            raise HTTPException(
                status_code=400,
                detail="Something went wrong while saving this screening. Please try again, and contact support if the problem continues.",
            )

    # Should be unreachable (loop always returns or raises), but just in case:
    raise HTTPException(
        status_code=400,
        detail="Something went wrong while saving this screening. Please try again, and contact support if the problem continues.",
    )

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

        # FIX: same reasoning as create_screening above ? don't trust the
        # client's site_id, derive it from site_name server-side so an
        # update can't silently corrupt an existing record's site_id to
        # something inconsistent with its own already-assigned prefix.
        if "site_name" in update_data:
            canonical_site_id = CANONICAL_SITE_ID_MAP.get((update_data["site_name"] or "").strip())
            if canonical_site_id:
                update_data["site_id"] = canonical_site_id

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

        # FIX: screening_status was only ever computed once, at creation
        # (compute_screening_status() call in create_screening). Every
        # subsequent update ? including the nurse finishing the form after
        # an early/incomplete autosave ? applied field changes but left
        # the ORIGINAL status frozen. A screening whose first autosave fired
        # before gestation_weeks/consent were filled in would get stuck
        # showing "Screen Failure"/"Not Eligible" forever, even once fully
        # and correctly completed as eligible. Recompute on every save.
        entry.screening_status = compute_screening_status(entry)

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
        logger.error(f"SCREENING UPDATE ERROR: {e}")
        raise HTTPException(
            status_code=400,
            detail="Something went wrong while saving this screening. Please try again, and contact support if the problem continues.",
        )

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

    heal_screening_status(entry, db)
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

    heal_screening_status(entry, db)
    return entry

# ============================================================================
# FORM B  -  BIRTH RESUSCITATION ENDPOINTS
# ============================================================================

@app.post("/birth-resuscitation/", response_model=BirthResuscitationOut)
def create_birth_resuscitation(
    data: BirthResuscitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # FIX: this endpoint had NO response_model, unlike its own GET/PUT
    # siblings (both use response_model=BirthResuscitationOut). Without one,
    # FastAPI falls back to serializing the raw SQLAlchemy object directly
    # instead of going through the Pydantic schema ? unreliable, and the
    # likely cause of the frontend's "Enrollment ID not saved" error: the
    # record really was saved, but res.data.enrollment_id came back
    # missing/malformed from this endpoint's response, so the browser never
    # got the ID to store for the next screen.
    enrollment_id = resolve_birth_enrollment_id(data)
    require_enrollment_access(enrollment_id, db, current_user)
    # Re-bind so payload / DB row use the resolved id (incl. NR- placeholders).
    data = data.model_copy(update={"enrollment_id": enrollment_id})
    # FIX: this had no try/except at all. enrollment_id is typed in by hand
    # on Form B (there's no backend generator for it, unlike screening_id),
    # and birth_resuscitation.enrollment_id IS unique at the DB level ? so a
    # nurse typing an enrollment_id that's already in use used to crash with
    # an unhandled 500 / raw psycopg2 traceback, the exact same failure mode
    # the screening_id bug had. Now it's caught and returned as a clear 409.
    try:
        payload = split_and_store_pii(
            db,
            data.model_dump(exclude_unset=True),
            BIRTH_PII_FIELDS,
            enrollment_id=enrollment_id,
            screening_id=data.screening_id,
            site_name=site_for_enrollment(db, enrollment_id),
        )
        existing = (
            db.query(BirthResuscitation)
            .filter(BirthResuscitation.enrollment_id == enrollment_id)
            .first()
        )
        # Non-randomised / no-PPV: also match prior row by screening_id so
        # re-saves don't create a second record if the placeholder id changes.
        if not existing and data.screening_id and (
            data.randomised is False or data.required_resuscitation is False
        ):
            existing = (
                db.query(BirthResuscitation)
                .filter(BirthResuscitation.screening_id == data.screening_id)
                .first()
            )
        if existing:
            # CRITICAL FIX: previously, ANY existing record with this
            # enrollment_id got overwritten with the incoming data ?
            # including its screening_id and baby_uid. That's correct
            # ONLY if this is the same save retrying (same screening_id).
            # If a DIFFERENT patient's screening_id shows up here, this is
            # a genuine typo colliding with someone else's enrollment_id,
            # and blindly overwriting silently destroyed the first
            # patient's entire clinical record with no error to anyone ?
            # confirmed by direct reproduction: Patient A's record
            # (screening_id, baby_uid, all fields) was completely replaced
            # by Patient B's data, with a 200 OK response giving no
            # indication anything was wrong.
            if existing.screening_id and data.screening_id and existing.screening_id != data.screening_id:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Enrollment ID '{data.enrollment_id}' is already used by a "
                        f"different patient (screening {existing.screening_id}). "
                        "Please double-check the enrollment ID and try again."
                    ),
                )
            payload.pop("enrollment_id", None)
            # Keep placeholder NR- ids aligned when matched by screening_id.
            if existing.enrollment_id != enrollment_id:
                existing.enrollment_id = enrollment_id
            for key, value in payload.items():
                # Skip None so partial mobile Form B / Form C saves do not
                # wipe the other half of the birth_resuscitation record.
                if value is None:
                    continue
                setattr(existing, key, value)

            db.commit()
            db.refresh(existing)

            # Always link screening ↔ birth row (randomised OR NR- placeholder)
            # so web Form B can reload mobile-synced data.
            link_screening_enrollment(
                db, existing.screening_id, existing.enrollment_id
            )

            return existing

        entry = BirthResuscitation(**payload)
        db.add(entry)
        db.commit()
        db.refresh(entry)

        # Always write enrollment_id back to screenings (incl. NR- ids from
        # mobile / not-randomised / no-PPV saves) so Form B reopen works.
        link_screening_enrollment(db, entry.screening_id, entry.enrollment_id)

        return entry

    except IntegrityError as e:
        db.rollback()
        if "enrollment_id" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Enrollment ID '{data.enrollment_id}' is already in use by "
                       f"another patient. Please double-check and use a different ID.",
            )
        logger.error(f"BIRTH RESUSCITATION ERROR: {e}")
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")

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
    # original_gestation_* is always Form B GA (the stored BirthResuscitation values).
    # Form B UI must bind to original_* -- never to gestation_weeks/days after overlay.
    record_dict["original_gestation_weeks"] = entry.gestation_weeks
    record_dict["original_gestation_days"] = entry.gestation_days
    record_dict["gestation_source"] = "Form B"

    # Optional NBS overlay on gestation_weeks/days is for downstream forms only
    # (when Form D NBS GA differs from Form B by >14 days). Does not change DB.
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

    # Reattach Form A identity for B1 fields 2/3/5 (stored only in participant_pii).
    try:
        site = site_for_enrollment(db, enrollment_id) or (
            db.query(Screening.site_name)
            .filter(Screening.screening_id == entry.screening_id)
            .scalar()
            if entry.screening_id else None
        )
        if can_view_pii_for_site(current_user, site):
            pii = get_pii_for_participant(
                db,
                enrollment_id=enrollment_id,
                screening_id=entry.screening_id,
            )
            if pii:
                if pii.maternal_uid:
                    record_dict["maternal_uid"] = pii.maternal_uid
                if pii.mother_first_name:
                    record_dict["mother_name_first"] = pii.mother_first_name
                if pii.mother_surname:
                    record_dict["mother_name_surname"] = pii.mother_surname
                contact_m = pii.mother_contact or pii.contact_mother
                contact_h = pii.husband_contact or pii.contact_husband
                if contact_m:
                    record_dict["contact_mother"] = contact_m
                if contact_h:
                    record_dict["contact_husband"] = contact_h
    except Exception:
        # Never fail the clinical GET if PII decrypt/auth fails — Form B
        # still loads; identity fields stay blank and the UI can retry PII.
        pass

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

    # FIX: same class of bug as create_birth_resuscitation (see its comments) —
    # this PUT is looked up by enrollment_id ALONE, with no check that the
    # screening_id in the incoming save actually belongs to the same patient
    # as the row already stored under that enrollment_id. If a nurse working
    # on a DIFFERENT patient's Form B ends up saving under an enrollment_id
    # that's already in use (e.g. a typo, or a stale "already have a birth
    # record" flag in the browser causing a PUT instead of a POST), this used
    # to silently overwrite the first patient's screening_id and merge their
    # records — which is exactly what produced two screenings sharing one
    # enrollment_id, with the second patient's later forms appearing
    # pre-filled with the first patient's data. Block it with a clear 409
    # instead, matching the POST endpoint's guard.
    if (
        entry.screening_id
        and updated_data.screening_id
        and entry.screening_id != updated_data.screening_id
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Enrollment ID '{enrollment_id}' is already used by a "
                f"different patient (screening {entry.screening_id}). "
                "Please double-check the enrollment ID and try again."
            ),
        )

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
            # Skip None so partial mobile Form B / Form C updates do not wipe
            # the other half of the birth_resuscitation record.
            if value is None:
                continue
            setattr(entry, key, value)

        db.commit()
        db.refresh(entry)

        # Keep screenings.enrollment_id in sync for randomised and NR- rows.
        link_screening_enrollment(db, entry.screening_id, entry.enrollment_id)

        return entry

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# ============================================================================
# FORM C  -  MATERNAL DETAILS ENDPOINTS
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
        data.model_dump(exclude_unset=True),
        MATERNAL_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )

    # FIX: this endpoint used to always `db.add(...)` a brand new row, with
    # no check for an existing one ? unlike Form D/E's create endpoints,
    # which both check first. Since maternal_details.enrollment_id also has
    # no unique constraint at the DB level, calling this twice for the same
    # patient (e.g. a network retry, or the frontend's "does this already
    # exist" GET failing so it wrongly falls back to POST) silently created
    # a second, duplicate row instead of erroring OR updating ? the worst
    # kind of bug, because nothing alerts anyone that the data now has two
    # answers. Now it upserts, matching the Form D/E pattern.
    existing = (
        db.query(MaternalDetails)
        .filter(MaternalDetails.enrollment_id == data.enrollment_id)
        .order_by(MaternalDetails.id.desc())
        .first()
    )
    if existing:
        payload.pop("enrollment_id", None)
        for key, value in payload.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

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
        .order_by(MaternalDetails.id.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Maternal details not found")
    payload = split_and_store_pii(
        db,
        data.model_dump(exclude_unset=True),
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
        .order_by(MaternalDetails.id.desc())
        .first()
    )
    if not record:
        return None

    record_dict = {col.name: getattr(record, col.name) for col in record.__table__.columns}

    # Rejoin all PII fields (address, email, and individual address components)
    PII_REJOIN_FIELDS = ("address", "email_address", "house", "city", "district", "state", "pincode", "landmark")
    try:
        pii_row = db.execute(
            text(f"""
                SELECT {", ".join(PII_REJOIN_FIELDS)}
                FROM participant_pii
                WHERE enrollment_id = :enrollment_id
            """),
            {"enrollment_id": enrollment_id}
        ).mappings().fetchone()

        if pii_row:
            # Raw SQL bypasses the ORM's EncryptedString type, so these need
            # an explicit decrypt (see crypto.py — falls back to the value
            # unchanged if it's still a legacy plaintext row). Named access
            # via .mappings() rather than positional pii_row[N] indices, so
            # a future edit to the SELECT column order can't silently
            # assign one PII field's value to a different field's name.
            for field in PII_REJOIN_FIELDS:
                if pii_row[field]:
                    record_dict[field] = decrypt_value(pii_row[field])
    except Exception as e:
        logger.warning("Could not rejoin PII fields from participant_pii: %s", e)

    return record_dict

# ============================================================================
# FORM D  -  POSTNATAL DAY 1 ENDPOINTS
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

    # Upsert: a retry / stale isRecordSaved can POST again for the same
    # enrollment. postnatal_day1.enrollment_id has no unique constraint, so
    # a blind insert used to create a second row; GET then .first() with no
    # ORDER BY could return the older one and look like data vanished.
    existing = (
        db.query(PostnatalDay1)
        .filter(PostnatalDay1.enrollment_id == data.enrollment_id)
        .order_by(PostnatalDay1.id.desc())
        .first()
    )
    if existing:
        payload.pop("enrollment_id", None)
        for key, value in payload.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

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
    ).order_by(PostnatalDay1.id.desc()).first()

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
    ).order_by(PostnatalDay1.id.desc()).first()

    if not record:
        # No existing record  -  create new one (upsert)
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
# FORM E  -  NICU ADMISSION ENDPOINTS
# ============================================================================

def _validate_admission_after_birth(db: Session, enrollment_id: str, admission_datetime):
    """Reject NICU admission date/time earlier than the baby's recorded date/time of birth (Form B)."""
    if admission_datetime is None:
        return
    birth = db.query(BirthResuscitation).filter(
        BirthResuscitation.enrollment_id == enrollment_id
    ).first()
    if not birth or not birth.date_of_birth:
        return
    birth_dt = datetime.combine(
        birth.date_of_birth,
        birth.time_of_birth if birth.time_of_birth else time(0, 0, 0),
    )
    admission_dt = admission_datetime
    if admission_dt.tzinfo is not None:
        admission_dt = admission_dt.replace(tzinfo=None)
    if admission_dt < birth_dt:
        raise HTTPException(
            status_code=422,
            detail="Admission date/time cannot be before Date & Time of Birth (Form B).",
        )


@app.post("/nicu-admission/", response_model=NICUAdmissionOut)
def create_nicu_admission(
    data: NICUAdmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    _validate_admission_after_birth(db, data.enrollment_id, data.admission_datetime)
    payload = split_and_store_pii(
        db,
        data.model_dump(exclude_unset=True),
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
    _validate_admission_after_birth(db, enrollment_id, data.admission_datetime)
    payload = split_and_store_pii(
        db,
        data.model_dump(exclude_unset=True),
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


#  -  Day 1 Date (shared across RespCVNeuro / InfectGIHema / MetabRenalVascEye logs)  - 
class Day1DateUpdate(BaseModel):
    day1_date: date


# Nurses may only record Day 1 Date as "today", or as "yesterday" up until
# this local hour — mirrors the RCN/IGH/MRVE_LATE_GRACE_HOUR used on the
# frontend so a nurse finishing an overnight shift can still log yesterday's
# date, without allowing arbitrary/backdated entries afterwards.
DAY1_DATE_ENTRY_GRACE_HOUR = 11


def _day1_date_within_allowed_range(value: date) -> bool:
    now = datetime.now()
    today = now.date()
    if value == today:
        return True
    if value == today - timedelta(days=1) and now.hour < DAY1_DATE_ENTRY_GRACE_HOUR:
        return True
    return False


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
    day1_date_value = record.day1_date if record else None
    return {
        "day1_date": day1_date_value,
        "day1_date_set_by": record.day1_date_set_by if record else None,
        # Only lock once a date has actually been set — a record with daily
        # data but no Day 1 Date yet (e.g. it was skipped when the day was
        # first saved) must stay editable so a nurse can go back and fill
        # it in, rather than being permanently stuck without one.
        "locked": bool(day1_date_value) and _day1_date_is_locked(db, enrollment_id),
    }


@app.put("/nicu-admission/{enrollment_id}/day1-date")
def update_day1_date(
    enrollment_id: str,
    data: Day1DateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)

    record = db.query(NICUAdmission).filter(
        NICUAdmission.enrollment_id == enrollment_id
    ).first()
    already_set = bool(record and record.day1_date)

    if already_set and _day1_date_is_locked(db, enrollment_id) and not is_superadmin(current_user):
        raise HTTPException(
            status_code=409,
            detail="Day 1 Date is locked because daily data already exists for this baby.",
        )

    # Superadmin corrections (explicit unlock) are allowed to set any date;
    # everyday entry by nurses is restricted to today / yesterday-before-11am
    # so the date can't be fat-fingered to some unrelated day.
    if not is_superadmin(current_user) and not _day1_date_within_allowed_range(data.day1_date):
        raise HTTPException(
            status_code=400,
            detail=(
                "Day 1 Date can only be set to today's date, or yesterday's "
                f"date before {DAY1_DATE_ENTRY_GRACE_HOUR}:00 AM."
            ),
        )

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
# FORM F  -  NEONATAL MORBIDITIES ENDPOINTS
# ============================================================================

@app.post("/neonatal-morbidities/", response_model=NeonatalMorbiditiesOut)
def create_neonatal_morbidities(
    data: NeonatalMorbiditiesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    # Upsert against the newest row for this enrollment so revisit+save never
    # writes an older duplicate while the UI loads the latest.
    existing = (
        db.query(NeonatalMorbidities)
        .filter(NeonatalMorbidities.enrollment_id == data.enrollment_id)
        .order_by(NeonatalMorbidities.id.desc())
        .first()
    )
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key) and key != "enrollment_id":
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = NeonatalMorbidities(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.put("/neonatal-morbidities/{enrollment_id}", response_model=NeonatalMorbiditiesOut)
def update_neonatal_morbidities(
    enrollment_id: str,
    data: NeonatalMorbiditiesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(NeonatalMorbidities)
        .filter(NeonatalMorbidities.enrollment_id == enrollment_id)
        .order_by(NeonatalMorbidities.id.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Record not found ? use POST to create")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

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
        .order_by(NeonatalMorbidities.id.asc())
        .all()
    )


@app.get("/neonatal-morbidities/vascular-access-prefill/{enrollment_id}")
def get_vascular_access_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Metab/Renal/Vasc/Eye helper daily logs into Form H's
    Vascular Access section (H10.1/H10.2, CRF #206-216). Unlike most Form H
    domains, every field here is a deterministic day-count or any-day
    boolean — no clinical judgment call needed, which is why this domain
    was picked as the first to auto-fill. The frontend only uses this to
    fill fields the clinician hasn't touched yet; it never overwrites an
    existing value (see the loadExistingFormH/fetchResp ordering bug fixed
    2026-08-22 for why that discipline matters)."""
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(MetabRenalVascEyeDayLog)
        .filter(MetabRenalVascEyeDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def count_days(attr):
        return sum(1 for l in logs if getattr(l, attr) is True)

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "picc": "Yes" if any_day("picc_in_situ") else "No",
        "picc_days": count_days("picc_in_situ"),
        "uvc": "Yes" if any_day("uvc_in_situ") else "No",
        "uvc_days": count_days("uvc_in_situ"),
        "uac": "Yes" if any_day("uac_in_situ") else "No",
        "uac_days": count_days("uac_in_situ"),
        "peripheral_venous": "Yes" if any_day("peripheral_iv") else "No",
        "peripheral_arterial": "Yes" if any_day("peripheral_arterial") else "No",
        "extravasation": "Yes" if any_day("extravasation_injury") else "No",
        # Day logs record only whether a complication happened, not which
        # type (phlebitis/infection) — that detail genuinely needs a
        # clinician's judgment, so this is surfaced as an advisory note in
        # the UI rather than auto-checking a specific complication type.
        "line_complication_any": any_day("line_complication"),
    }


@app.get("/neonatal-morbidities/metabolic-prefill/{enrollment_id}")
def get_metabolic_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Metab/Renal/Vasc/Eye helper daily logs into Form H's
    Metabolic Disturbances section (H4.1, CRF #95-112). The day-log's
    glucose/electrolyte fields are only populated on a day when a reading
    is actually out of range (see MetabRenalVascEyeDayLog's column
    comments), so a non-blank value on any day already means "this
    happened at least once" — sodium/potassium/ionized-calcium values are
    also numerically thresholded here (same cutoffs as the day-log
    comments) to split into the hypo-/hyper- checkboxes Form H uses.
    Symptom/status detail (#106-111) and the osteopenia lab values
    (#113-115 — ALP/total Ca/phosphorus) have no matching day-log source
    and are never touched here; only fields with a genuine source are
    returned. Same never-overwrite discipline as vascular-access-prefill:
    the frontend only fills fields the clinician hasn't touched yet."""
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(MetabRenalVascEyeDayLog)
        .filter(MetabRenalVascEyeDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def to_float(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def count_days(attr):
        return sum(1 for l in logs if getattr(l, attr) is True)

    def numeric_values(attr):
        return [v for v in (to_float(getattr(l, attr)) for l in logs) if v is not None]

    def sum_int(attr):
        total = 0
        for l in logs:
            try:
                total += int(getattr(l, attr) or 0)
            except (TypeError, ValueError):
                pass
        return total

    glucose_low = numeric_values("lowest_glucose")
    glucose_high = numeric_values("highest_glucose")
    sodium_vals = numeric_values("sodium_value")
    potassium_vals = numeric_values("potassium_value")
    calcium_vals = numeric_values("ionized_calcium_value")

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "hypoglycemia": "Yes" if glucose_low else "No",
        "hypoglycemia_episodes": sum_int("hypoglycemia_episodes"),
        "hypoglycemia_lowest": min(glucose_low) if glucose_low else None,
        "hypoglycemia_rx": "Yes" if any_day("hypoglycemia_rx") else "No",
        "hypoglycemia_rx_duration": count_days("hypoglycemia_rx"),
        "hyperglycemia": "Yes" if glucose_high else "No",
        "hyperglycemia_highest": max(glucose_high) if glucose_high else None,
        "hyperglycemia_rx": "Yes" if any_day("insulin") else "No",
        "metabolic_acidosis": "Yes" if any_day("metabolic_acidosis") else "No",
        "dyselectrolytemia": "Yes" if (sodium_vals or potassium_vals or calcium_vals) else "No",
        "dyselectro_na": bool(sodium_vals),
        "dyselectro_k": bool(potassium_vals),
        "dyselectro_ca": bool(calcium_vals),
        "hyponatremia": any(v < 135 for v in sodium_vals),
        "hypernatremia": any(v > 142 for v in sodium_vals),
        "hypokalemia": any(v < 3.5 for v in potassium_vals),
        "hyperkalemia": any(v > 6 for v in potassium_vals),
        "hypocalcemia": any(v < 0.9 for v in calcium_vals),
        "hypercalcemia": any(v > 1.2 for v in calcium_vals),
        "osteopenia": "Yes" if any_day("osteopenia_suspected") else "No",
    }


@app.get("/neonatal-morbidities/renal-prefill/{enrollment_id}")
def get_renal_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Metab/Renal/Vasc/Eye helper daily logs into Form H's
    Renal / AKI section (H7.1, CRF #173-178).

    - aki / aki_dialysis: direct any-day booleans (aki_suspected,
      dialysis_crrt).
    - aki_stage1/2/3: derived from the day log's KDIGO stage string,
      checked against both the current aki_stage column and the legacy
      aki_kdigo_stage column (older records may only have the latter).
    - aki_peak_creatinine: highest creatinine recorded across the
      admission, preferring the current creatinine_value column per row
      and falling back to the legacy numeric creatinine column when that
      row's creatinine_value isn't a parseable number (e.g. "Not Tested").
    - aki_date: earliest NICU day AKI was suspected, converted to a
      calendar date via NICUAdmission.day1_date — only returned when
      day1_date has actually been set for this baby.
    - aki_oliguria: intentionally NEVER auto-filled. The only related
      day-log column (urine_output_low) is explicitly legacy/superseded,
      and computing true oliguria needs a rate threshold against body
      weight that isn't available from this table — always left for
      manual clinical entry."""
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(MetabRenalVascEyeDayLog)
        .filter(MetabRenalVascEyeDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def to_float(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def stage_match(stage_num):
        target = f"stage {stage_num}"
        return any(
            (l.aki_stage or "").strip().lower() == target
            or (l.aki_kdigo_stage or "").strip().lower() == target
            for l in logs
        )

    creatinine_values = []
    for l in logs:
        v = to_float(l.creatinine_value)
        if v is None:
            v = l.creatinine
        if v is not None:
            creatinine_values.append(v)

    aki_date = None
    aki_days = [l.nicu_day for l in logs if l.aki_suspected is True]
    if aki_days:
        nicu = (
            db.query(NICUAdmission)
            .filter(NICUAdmission.enrollment_id == enrollment_id)
            .first()
        )
        if nicu and nicu.day1_date:
            aki_date = (nicu.day1_date + timedelta(days=min(aki_days) - 1)).isoformat()

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "aki": "Yes" if any_day("aki_suspected") else "No",
        "aki_date": aki_date,
        "aki_stage1": stage_match(1),
        "aki_stage2": stage_match(2),
        "aki_stage3": stage_match(3),
        "aki_peak_creatinine": max(creatinine_values) if creatinine_values else None,
        "aki_dialysis": "Yes" if any_day("dialysis_crrt") else "No",
    }


@app.get("/neonatal-morbidities/heme-prefill/{enrollment_id}")
def get_heme_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Infect/GI/Hema helper daily logs into Form H's
    Hematology section (H6, CRF #147-172).

    - jaundice_intervention / phototherapy / dvet ("Exchange transfusion")
      / prbc / platelets / ffp_cryo: direct any-day booleans from the day
      log's own identically-scoped fields (jaundice, phototherapy,
      exchange_transfusion, prbc_transfusion, platelet_transfusion,
      ffp_cryo).
    - peak_tsb: highest value recorded across the admission.
    - lowest_hb: lowest value recorded across the admission — filled even
      though the parent "Anemia" Yes/No is never auto-derived (see below),
      so it's ready the moment a clinician marks Anemia Yes.
    - dvet_number / prbc_number / platelet_number: day-count of days the
      respective boolean was true, as a proxy for "number of transfusions/
      exchanges" — the day log can't tell multiple same-day events apart
      from one, so this can undercount, same caveat as Metabolic's
      hypoglycemia_rx_duration.
    - jaundice_onset: earliest NICU day jaundice was true, converted to a
      calendar date via NICUAdmission.day1_date — same pattern as Renal's
      aki_date, only returned when day1_date has been set.
    - jaundice_type (Conjugated/Unconjugated), bind, ivig, jaundice_etiology,
      anemia (the Yes/No itself — no fixed Hb cutoff works across every
      gestation/postnatal age, this needs real clinical judgement),
      anemia_onset/etiology/symptoms, prbc_volume, cmv_screened,
      leukoreduced, irradiated: all intentionally never auto-filled — no
      day-log source, or (for anemia) a diagnosis call the day log's raw
      Hb number can't substitute for."""
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(InfectGIHemaDayLog)
        .filter(InfectGIHemaDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def count_days(attr):
        return sum(1 for l in logs if getattr(l, attr) is True)

    tsb_values = [l.peak_tsb for l in logs if l.peak_tsb is not None]
    hb_values = [l.hb_value for l in logs if l.hb_value is not None]

    jaundice_onset = None
    jaundice_days = [l.nicu_day for l in logs if l.jaundice is True]
    if jaundice_days:
        nicu = (
            db.query(NICUAdmission)
            .filter(NICUAdmission.enrollment_id == enrollment_id)
            .first()
        )
        if nicu and nicu.day1_date:
            jaundice_onset = (nicu.day1_date + timedelta(days=min(jaundice_days) - 1)).isoformat()

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "jaundice_intervention": "Yes" if any_day("jaundice") else "No",
        "jaundice_onset": jaundice_onset,
        "peak_tsb": max(tsb_values) if tsb_values else None,
        "phototherapy": "Yes" if any_day("phototherapy") else "No",
        "dvet": "Yes" if any_day("exchange_transfusion") else "No",
        "dvet_number": count_days("exchange_transfusion") or None,
        "lowest_hb": min(hb_values) if hb_values else None,
        "prbc": "Yes" if any_day("prbc_transfusion") else "No",
        "prbc_number": count_days("prbc_transfusion") or None,
        "platelets": "Yes" if any_day("platelet_transfusion") else "No",
        "platelet_number": count_days("platelet_transfusion") or None,
        "ffp_cryo": "Yes" if any_day("ffp_cryo") else "No",
        "ffp_number": count_days("ffp_cryo") or None,
    }


@app.get("/neonatal-morbidities/neuro-prefill/{enrollment_id}")
def get_neuro_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Resp/CV/Neuro helper daily logs into Form H's
    Neurological section (H1, CRF #1-34).

    The day log only records "did cranial USG/EEG show X on this day" as a
    flat boolean, with no side and no grade — so only the top-level "was X
    ever present" Yes/No for each of IVH / cPVL / Ventriculomegaly /
    Seizures can be safely derived. Everything that requires reading an
    actual scan or EEG trace (IVH/PVL side, grade, per-side date/age;
    ventriculomegaly severity, VI/AHW/TOD/ACA-RI/MCA-RI; seizure type, EEG
    result, status epilepticus, AEDs, etiology) stays manual — the day log
    has no equivalent field, and guessing a grade or laterality from a
    single "yes/no" flag would be actively wrong, not just incomplete.

    - ivh_present / pvl_present / ventriculomegaly_present / seizures:
      any-day booleans from ivh / cpvl_confirmed / ventriculomegaly /
      clinical_seizures respectively.
    - seizure_date: the one Neuro onset date Form H stores as a single
      (non-side-specific) field, so — unlike IVH/PVL's per-side dates —
      it can use the same cross-table day1_date + earliest-true-day pattern
      as Renal's aki_date / Heme's jaundice_onset.
    - eeg_seizures and aeds_given (both booleans on the day log) are
      deliberately not mapped to anything: Form H's `eeg` field is a
      Not done/Normal/Abnormal select, a different question than "did the
      EEG show a seizure", and aed_number/aed_type need the actual drugs
      given, which the day log doesn't capture.
    - non_ivh_ich on the day log has no corresponding Form H field at all
      (Form H tracks non_ivh_ich but it isn't rendered/used in the current
      H1 JSX), so it's left out entirely rather than filling a field
      nothing displays.
    """
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(RespCVNeuroDayLog)
        .filter(RespCVNeuroDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    seizure_date = None
    seizure_days = [l.nicu_day for l in logs if l.clinical_seizures is True]
    if seizure_days:
        nicu = (
            db.query(NICUAdmission)
            .filter(NICUAdmission.enrollment_id == enrollment_id)
            .first()
        )
        if nicu and nicu.day1_date:
            seizure_date = (nicu.day1_date + timedelta(days=min(seizure_days) - 1)).isoformat()

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "ivh_present": "Yes" if any_day("ivh") else "No",
        "pvl_present": "Yes" if any_day("cpvl_confirmed") else "No",
        "ventriculomegaly_present": "Yes" if any_day("ventriculomegaly") else "No",
        "seizures": "Yes" if any_day("clinical_seizures") else "No",
        "seizure_date": seizure_date,
    }


@app.get("/neonatal-morbidities/gi-prefill/{enrollment_id}")
def get_gi_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Infect/GI/Hema helper daily logs into Form H's
    Gastrointestinal section (H3, CRF #68-94).

    - feed_intolerance / pn / probiotic / cholestasis: direct any-day
      booleans from the day log's identically-scoped fields.
    - nec: any-day `nec_suspected` — same "suspected flag drives the
      top-level Yes/No, clinician reviews/can uncheck" convention already
      used for Renal's AKI (`aki_suspected`).
    - nec_date / nec_age_days: derived from the earliest day
      `nec_suspected` was true. nec_date uses the usual
      NICUAdmission.day1_date cross-table pattern; nec_age_days is just
      that same earliest day minus 1 (nicu_day 1 == age 0), no join
      needed — a NICU day number *is* an age in days once day1 is fixed.
    - nec_stage is deliberately NOT filled: the day log's
      `nec_confirmed_stage` is coarse ("Stage I/II/III") while Form H's
      nec_stage is the 6-way Bell staging (IA/IB/IIA/IIB/IIIA/IIIB) —
      guessing the A/B subdivision would be inventing data, not deriving it.
      nec_surgery/nec_surgery_type/nec_resection(_length)/nec_stoma have no
      day-log equivalent at all (the log only flags NEC was suspected, not
      what was done about it).
    - age_first_feed: earliest day `enteral_feeds_received` was true,
      same earliest-day-minus-1 pattern as nec_age_days.
    - pdhm_days / ebm_days / fm_days: day log's `feed_type` is a
      comma-separated string per day (e.g. "PDHM,EBM") — same format as
      `support_modes` elsewhere in this file — so each is a day-count of
      how many rows list that feed type, not a simple any-day boolean.
    - pn_days: day-count of `parenteral_nutrition` being true, same
      day-count-as-proxy convention as Heme's dvet_number/prbc_number
      (can undercount multiple same-day events, but there's only ever one
      PN status per day here so it's exact, not just a proxy).
    - age_full_feeds is deliberately NOT filled: the day log has no
      "full feeds achieved" flag, only raw ml/kg/day volumes
      (`cumulative_feed_volume`/`feed_volume`), and picking a volume
      threshold to call "full feeds" would be a clinical/protocol
      judgment call this endpoint shouldn't make.
    - pn_adverse (+ its Cholestasis/Electrolyte/Acidosis/Hypercapnia/Other
      breakdown), probiotic strain type, Lactobacillus/Bifidobacterium,
      tpn_associated, max_direct_bilirubin, and the feed-intolerance
      symptom checkboxes (#69) all have no day-log source — the log only
      has flat top-level booleans, never this level of detail.
    """
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(InfectGIHemaDayLog)
        .filter(InfectGIHemaDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def count_days(attr):
        return sum(1 for l in logs if getattr(l, attr) is True)

    def count_days_with_feed_type(token):
        count = 0
        for l in logs:
            types = [t.strip() for t in (l.feed_type or "").split(",") if t.strip()]
            if token in types:
                count += 1
        return count

    nicu = (
        db.query(NICUAdmission)
        .filter(NICUAdmission.enrollment_id == enrollment_id)
        .first()
    )

    nec_date = None
    nec_age_days = None
    nec_days = [l.nicu_day for l in logs if l.nec_suspected is True]
    if nec_days:
        nec_age_days = min(nec_days) - 1
        if nicu and nicu.day1_date:
            nec_date = (nicu.day1_date + timedelta(days=nec_age_days)).isoformat()

    age_first_feed = None
    feed_days = [l.nicu_day for l in logs if l.enteral_feeds_received is True]
    if feed_days:
        age_first_feed = min(feed_days) - 1

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "feed_intolerance": "Yes" if any_day("feed_intolerance") else "No",
        "nec": "Yes" if any_day("nec_suspected") else "No",
        "nec_date": nec_date,
        "nec_age_days": nec_age_days,
        "age_first_feed": age_first_feed,
        "pdhm_days": count_days_with_feed_type("PDHM") or None,
        "ebm_days": count_days_with_feed_type("EBM") or None,
        "fm_days": count_days_with_feed_type("FM") or None,
        "pn": "Yes" if any_day("parenteral_nutrition") else "No",
        "pn_days": count_days("parenteral_nutrition") or None,
        "probiotic": "Yes" if any_day("probiotic") else "No",
        "cholestasis": "Yes" if any_day("cholestasis") else "No",
    }


@app.get("/neonatal-morbidities/rop-thermoreg-prefill/{enrollment_id}")
def get_rop_thermoreg_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Metab/Renal/Vasc/Eye helper daily logs into Form H's
    Ophthalmology (H8, CRF #179-196) and Thermoregulation (H9, CRF
    #197-205) sections.

    Thermoregulation:
    - hypothermia / hyperthermia: derived from the axillary_temperature
      *value* itself (<36.5 / >37.5, the same thresholds already shown
      in both the day log's own field label and Form H's own field
      labels), NOT from the day log's dedicated `hypothermia`/
      `hyperthermia` boolean columns. Those columns exist in the schema
      but are never populated by the current MetabRenalVascEyeLog.jsx
      UI — it only ever sends `axillary_temperature`, confirmed via a
      live DB check showing 100% of rows have both columns NULL
      regardless of the recorded temperature (bug found 2026-08-24 via
      beta-tester feedback: a 38.7°C reading still showed Form H's
      Hyperthermia as "No", because `any_day("hyperthermia")` was
      reading a column nothing ever writes to). Falls back to the
      boolean columns only when no day has a parseable temperature at
      all, in case a future data-entry path populates them directly.
    - hypothermia_lowest_temp / hyperthermia_temp: admission-wide MIN/MAX
      of `axillary_temperature` (stored as a string but a genuine numeric
      °C reading per day, per MetabRenalVascEyeLog.jsx's NumRow usage) —
      same admission-wide-extremum convention as Renal's peak creatinine
      / Heme's lowest Hb, not conditioned on which day the boolean was
      also true. (This half of the endpoint was already correct — only
      the Yes/No flags above were reading a dead column.)
    - Severity (mild/moderate/severe), location (DR/Transport/NICU), and
      etiology (sepsis/environment/immaturity/IVH/other) checkboxes have
      no day-log source. The day log does have its own `location` field
      (DR/NICU/Step-down/Nursery/KMC-N/Other), but that tracks where the
      baby was *that day* in general — using it to infer where a specific
      thermal event happened would be an inference the data doesn't
      actually support, not a derivation.

    Ophthalmology / ROP:
    - rop_screened / rop: direct any-day booleans from the day log's
      `rop_screened` / `rop_detected`.
    - rop_first_screen_date / rop_diagnosis_date: earliest day
      `rop_screened` / `rop_detected` was true, via the usual
      NICUAdmission.day1_date cross-table pattern.
    - rop_method, rop_side, and every per-eye field (stage/plus/zone/
      A-ROP/treatment/treatment-type, right and left) are deliberately
      NOT filled: the day log's `rop_stage`/`plus_disease`/`rop_treatment`
      are single flat fields with no left/right split, so there's no way
      to know which eye (or both) they refer to — same side-ambiguity
      reasoning as IVH/PVL in the Neuro domain. Zone and A-ROP have no
      day-log field at all.
    """
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(MetabRenalVascEyeDayLog)
        .filter(MetabRenalVascEyeDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def to_float(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def numeric_values(attr):
        return [v for v in (to_float(getattr(l, attr)) for l in logs) if v is not None]

    nicu = (
        db.query(NICUAdmission)
        .filter(NICUAdmission.enrollment_id == enrollment_id)
        .first()
    )

    def earliest_date(attr):
        days = [l.nicu_day for l in logs if getattr(l, attr) is True]
        if not days or not nicu or not nicu.day1_date:
            return None
        return (nicu.day1_date + timedelta(days=min(days) - 1)).isoformat()

    temps = numeric_values("axillary_temperature")
    hypothermia_from_temp = any(t < 36.5 for t in temps)
    hyperthermia_from_temp = any(t > 37.5 for t in temps)

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "hypothermia": "Yes" if (hypothermia_from_temp or (not temps and any_day("hypothermia"))) else "No",
        "hypothermia_lowest_temp": min(temps) if temps else None,
        "hyperthermia": "Yes" if (hyperthermia_from_temp or (not temps and any_day("hyperthermia"))) else "No",
        "hyperthermia_temp": max(temps) if temps else None,
        "rop_screened": "Yes" if any_day("rop_screened") else "No",
        "rop_first_screen_date": earliest_date("rop_screened"),
        "rop": "Yes" if any_day("rop_detected") else "No",
        "rop_diagnosis_date": earliest_date("rop_detected"),
    }


@app.get("/neonatal-morbidities/cv-prefill/{enrollment_id}")
def get_cv_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Resp/CV/Neuro helper daily logs into Form H's
    Cardiovascular section (H5, CRF #117-146; H5.1 Structural Heart
    Disease has no day-log source at all and is skipped entirely).

    - hs_pda / shock / inotropes: direct any-day booleans from the day
      log's hs_pda / shock / vasoactive_support.
    - pda_medical_rx: any-day boolean from the day log's own
      `pda_medical_rx` column — note this column is marked legacy/
      superseded in the day log's own schema (no longer part of the
      current numbered field sequence), so it may simply be blank on
      every row logged after the helper-form redesign. Using it is safe
      either way (a blank/never-True column just contributes nothing),
      but don't expect it to catch newer entries.
    - fluid_bolus / fluid_bolus_number: fluid_bolus (the Yes/No) still
      comes from the Helper Form 2 day log's `fluid_bolus_given` boolean
      (#29) — "Yes" if any day has fluid_bolus_given is True.
      fluid_bolus_number, however, is NOT a day-count — it's the sum of
      every numeric value entered in the Minimal Monitoring form's 5.1.B
      "Fluid Bolus" multi-entry block (`cv_b` in entries_json) across
      every day logged for this enrollment. Each "Log another reading"
      entry in 5.1.B contributes its own value (e.g. a day with entries
      3, 4, 5 contributes 12; the next day's 3, 12, 2 adds another 17,
      for a running total of 29). Rows saved before the multi-entry
      redesign have no entries_json — those fall back to the row's
      legacy flat `fluid_bolus_given` column instead.
    - inotrope_duration: day-count of vasoactive_support being true.
    - inotrope_dopa/dobu/adr/nadr/milri/vaso: whether each drug name
      ("Dopamine"/"Dobutamine"/"Adrenaline"/"Noradrenaline"/"Milrinone"/
      "Vasopressin") ever appears in the day log's comma-separated
      `vasoactive_drugs` field — same CSV-token technique as GI's
      pdhm/ebm/fm_days, applied here to a boolean-per-token instead of a
      day-count.
    - SBP/DBP/MAP: the lowest value ever recorded for each vital across
      every Minimal Monitoring day sheet logged for this enrollment (a
      4th table, separate from RespCVNeuroDayLog — Minimal Monitoring's
      "today" sheet wipes at 8 AM, but every day's save is still a
      permanent row keyed by record_date, so scanning all of them gives
      the full-stay history even though only "today" is ever visible in
      that helper form's own UI). Each of the three vitals is its own
      independent running minimum — the reading that produced the lowest
      SBP does not have to be the same reading, or even the same day, as
      the one that produced the lowest DBP or MAP. See
      `_lowest_minimal_monitoring_vital` below for how a day's multiple
      "Log another reading" entries (and older legacy single-value rows)
      are scanned.
    - Everything else has no day-log source: PDA diagnosis method
      (clinical/echo/both) and all clinical-exam/echo-measurement detail
      (murmur, TDD, peak velocity, pattern, shunt, LA:Ao, systemic steal,
      LPA velocity — `echo_done` only confirms an echo happened, not what
      it showed), PDA agent/courses/dose/intervention/ligation-or-device
      age, hypotension (the day log has no hypotension field at all, only
      shock), VIS score (needs dose-weighted values the day log doesn't
      capture), and hydrocortisone-for-BP + its timing (the day log's
      `postnatal_steroids` is a BPD/lung indication, a different clinical
      purpose — reusing it here would misrepresent why the drug was
      given).
    """
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(RespCVNeuroDayLog)
        .filter(RespCVNeuroDayLog.enrollment_id == enrollment_id)
        .all()
    )
    mml_logs = (
        db.query(MinimalMonitoringDayLog)
        .filter(MinimalMonitoringDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs and not mml_logs:
        return {"has_data": False}

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def count_days(attr):
        return sum(1 for l in logs if getattr(l, attr) is True)

    bolus_days = [l for l in logs if l.fluid_bolus_given is True]

    all_drug_tokens = set()
    for l in logs:
        all_drug_tokens.update(
            t.strip() for t in (l.vasoactive_drugs or "").split(",") if t.strip()
        )

    def _lowest_minimal_monitoring_vital(entries_json_key, legacy_attr):
        """Scans every Minimal Monitoring day row's 5.1.A "Vitals" multi-
        entry block for the lowest numeric value of a given field. Rows
        saved before the multi-entry redesign have no entries_json — for
        those, fall back to the row's own legacy flat column (the single
        reading that row ever held)."""
        best = None
        for row in mml_logs:
            row_had_entries = False
            if row.entries_json:
                try:
                    parsed = (
                        json.loads(row.entries_json)
                        if isinstance(row.entries_json, str)
                        else row.entries_json
                    )
                    for entry in (parsed or {}).get("cv_a", []) or []:
                        raw = entry.get(entries_json_key)
                        if raw is None or raw == "":
                            continue
                        try:
                            val = float(raw)
                        except (TypeError, ValueError):
                            continue
                        row_had_entries = True
                        if best is None or val < best:
                            best = val
                except (TypeError, ValueError):
                    pass
            if not row_had_entries:
                legacy_val = getattr(row, legacy_attr)
                if legacy_val is not None and (best is None or legacy_val < best):
                    best = legacy_val
        return best

    lowest_sbp = _lowest_minimal_monitoring_vital("sbp", "sbp")
    lowest_dbp = _lowest_minimal_monitoring_vital("dbp", "dbp")
    lowest_map = _lowest_minimal_monitoring_vital("map_value", "map_value")

    def _parse_leading_number(raw):
        """Pulls the leading numeric value out of a Fluid Bolus 5.1.B
        entry, e.g. "10" -> 10.0, "10ml/kg NS" -> 10.0. Returns None for
        blank/non-numeric text."""
        if raw is None:
            return None
        m = re.match(r"^\s*(\d+(?:\.\d+)?)", str(raw))
        return float(m.group(1)) if m else None

    def _sum_minimal_monitoring_fluid_bolus():
        """Sums every 5.1.B "Fluid Bolus" entry (`cv_b` in entries_json)
        across every Minimal Monitoring day row for this enrollment —
        this is the running "number of courses" total for Form H's #29
        fluid_bolus_number, NOT a day-count. Rows saved before the
        multi-entry redesign have no entries_json — those fall back to
        the row's own legacy flat `fluid_bolus_given` column."""
        total = 0.0
        any_found = False
        for row in mml_logs:
            row_had_entries = False
            if row.entries_json:
                try:
                    parsed = (
                        json.loads(row.entries_json)
                        if isinstance(row.entries_json, str)
                        else row.entries_json
                    )
                    for entry in (parsed or {}).get("cv_b", []) or []:
                        val = _parse_leading_number(entry.get("fluid_bolus_given"))
                        if val is None:
                            continue
                        row_had_entries = True
                        any_found = True
                        total += val
                except (TypeError, ValueError):
                    pass
            if not row_had_entries:
                legacy_val = _parse_leading_number(row.fluid_bolus_given)
                if legacy_val is not None:
                    any_found = True
                    total += legacy_val
        return total, any_found

    fluid_bolus_total, fluid_bolus_any = _sum_minimal_monitoring_fluid_bolus()
    fluid_bolus_number_value = (
        int(fluid_bolus_total) if fluid_bolus_total == int(fluid_bolus_total) else fluid_bolus_total
    ) if fluid_bolus_any else None

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "mml_days_count": len(mml_logs),
        # These stay None (not "No"/False) when there are no RespCVNeuro
        # day logs at all — the difference between "confirmed no shock"
        # and "no CV day-log data exists yet" matters, and the frontend's
        # isBlank() skip only respects the former if we return None here.
        "hs_pda": ("Yes" if any_day("hs_pda") else "No") if logs else None,
        "pda_medical_rx": ("Yes" if any_day("pda_medical_rx") else "No") if logs else None,
        "shock": ("Yes" if any_day("shock") else "No") if logs else None,
        "fluid_bolus": ("Yes" if bolus_days else "No") if logs else None,
        "fluid_bolus_number": fluid_bolus_number_value,
        "inotropes": ("Yes" if any_day("vasoactive_support") else "No") if logs else None,
        "inotrope_duration": (count_days("vasoactive_support") or None) if logs else None,
        "inotrope_dopa": ("Dopamine" in all_drug_tokens) if logs else None,
        "inotrope_dobu": ("Dobutamine" in all_drug_tokens) if logs else None,
        "inotrope_adr": ("Adrenaline" in all_drug_tokens) if logs else None,
        "inotrope_nadr": ("Noradrenaline" in all_drug_tokens) if logs else None,
        "inotrope_milri": ("Milrinone" in all_drug_tokens) if logs else None,
        "inotrope_vaso": ("Vasopressin" in all_drug_tokens) if logs else None,
        "sbp": lowest_sbp,
        "dbp": lowest_dbp,
        "map": lowest_map,
    }


def _consecutive_day_runs(days):
    """Collapses a sorted, deduplicated list of NICU day numbers into
    maximal consecutive runs, e.g. [4,5,6,9,10] -> [(4,6), (9,10)]."""
    if not days:
        return []
    runs = []
    start = prev = days[0]
    for d in days[1:]:
        if d == prev + 1:
            prev = d
            continue
        runs.append((start, prev))
        start = prev = d
    runs.append((start, prev))
    return runs


@app.get("/neonatal-morbidities/infection-detect/{enrollment_id}")
def get_infection_detect(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detects candidate infection episodes in the Infect/GI/Hema helper
    daily logs for Form H's H11 Infection section, using the PI-specified
    trigger rule (2026-08-23) — unlike every other prefill endpoint in
    this file, this NEVER fills a Form H field directly. Form H's
    Infection section is a dynamic array of clinician-judged episodes
    with no day-log analog for "which episode does this day belong to",
    and episode-boundary determination ("fresh episode vs. continuation
    of one already being treated") is an explicit clinical judgment call
    per the PI — not something to infer from daily flags. This endpoint
    only surfaces candidate windows for review; the frontend uses them to
    (a) show an advisory banner and (b) optionally pre-fill a *single*
    new infection entry when a clinician manually clicks "Add Infection
    for this", never auto-creating entries on its own.

    Trigger rule, in priority order (culture wins over screen wins over
    duration-based clinical diagnosis, since a positive test is a harder
    fact than a duration pattern):
    1. blood_culture_positive = True on any day -> "culture" window.
    2. A sepsis_screens_json entry with result="Positive" on a day not
       already covered by a culture window -> "screen" window. (Screen
       result is captured directly by the nurse per screen — CRP/PCT/
       Hematological — deliberately NOT inferred from antibiotic
       duration, since the PI confirmed duration bands aren't fixed
       enough to serve as a screen-result proxy.)
    3. antibiotics = True for >5 continuous days, on days not already
       covered by a culture or screen window -> "clinical" window.
    4. meningitis = True (or meningitis_type set) -> "meningitis" window.
       Form H currently has no rendered field for meningitis at all
       (dead validateMeningitis/formData.meningitis code, no JSX renders
       it) so this can only ever be advisory, never pre-filled.
    5. clabsi = True -> "clabsi" window.
    6. vap = True -> "vap" window.

    Each window is a maximal run of consecutive NICU days for that
    trigger (via NICUAdmission.day1_date, same cross-table pattern as
    every other domain's onset dates) — never merged across different
    trigger types, since that merging is exactly the episode-boundary
    judgment call the PI said can't be ruled.
    """
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(InfectGIHemaDayLog)
        .filter(InfectGIHemaDayLog.enrollment_id == enrollment_id)
        .order_by(InfectGIHemaDayLog.nicu_day)
        .all()
    )
    if not logs:
        return {"has_data": False}

    nicu = (
        db.query(NICUAdmission)
        .filter(NICUAdmission.enrollment_id == enrollment_id)
        .first()
    )

    def date_for(day):
        if not nicu or not nicu.day1_date:
            return None
        return (nicu.day1_date + timedelta(days=day - 1)).isoformat()

    def make_window(signature, reason, suggested_type, start, end, **extra):
        return {
            "signature": signature,
            "reason": reason,
            "suggested_type": suggested_type,
            "nicu_day_start": start,
            "nicu_day_end": end,
            "date_start": date_for(start),
            "date_end": date_for(end),
            **extra,
        }

    windows = []

    culture_days = sorted({l.nicu_day for l in logs if l.blood_culture_positive is True})
    for start, end in _consecutive_day_runs(culture_days):
        windows.append(make_window(
            f"culture:{start}-{end}", "Blood culture positive", "culture", start, end,
        ))

    screen_positive_days = set()
    for l in logs:
        try:
            screens = json.loads(l.sepsis_screens_json) if l.sepsis_screens_json else []
        except (ValueError, TypeError):
            screens = []
        if any((s or {}).get("result") == "Positive" for s in screens):
            screen_positive_days.add(l.nicu_day)
    screen_only_days = sorted(screen_positive_days - set(culture_days))
    for start, end in _consecutive_day_runs(screen_only_days):
        windows.append(make_window(
            f"screen:{start}-{end}", "Sepsis screen positive", "screen", start, end,
        ))

    covered_days = set(culture_days) | screen_positive_days
    antibiotic_days = sorted({l.nicu_day for l in logs if l.antibiotics is True})
    for start, end in _consecutive_day_runs(antibiotic_days):
        if (end - start + 1) > 5 and not (set(range(start, end + 1)) & covered_days):
            windows.append(make_window(
                f"antibiotics:{start}-{end}", "Antibiotics >5 continuous days", "clinical", start, end,
            ))

    meningitis_days = sorted({
        l.nicu_day for l in logs
        if l.meningitis is True or (l.meningitis_type or "").strip()
    })
    for start, end in _consecutive_day_runs(meningitis_days):
        windows.append(make_window(
            f"meningitis:{start}-{end}", "Meningitis", None, start, end, meningitis=True,
        ))

    clabsi_days = sorted({l.nicu_day for l in logs if l.clabsi is True})
    for start, end in _consecutive_day_runs(clabsi_days):
        windows.append(make_window(
            f"clabsi:{start}-{end}", "CLABSI", None, start, end, clabsi=True,
        ))

    vap_days = sorted({l.nicu_day for l in logs if l.vap is True})
    for start, end in _consecutive_day_runs(vap_days):
        windows.append(make_window(
            f"vap:{start}-{end}", "VAP", None, start, end, vap=True,
        ))

    windows.sort(key=lambda w: w["nicu_day_start"])

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "windows": windows,
    }


@app.get("/neonatal-morbidities/resp-prefill/{enrollment_id}")
def get_resp_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates the Resp/CV/Neuro helper daily logs into Form H's
    Respiratory section (H2, CRF #38-67; H2.1 BPD — #35-37 — is
    deliberately skipped, see below).

    - oxygen_days <- day-count of supp_o2.
    - nasal_cannula/cpap/nippv/hfnc (+ their _days counts) <- whether
      "NC"/"CPAP"/"NIPPV"/"HFNC" ever appears in the day log's
      comma-separated support_modes field, same CSV-token technique as
      GI's pdhm/ebm/fm_days and CV's vasoactive drug checkboxes.
    - invasive_ventilation / imv_days <- any-day / day-count of
      endotracheal_intubation. Deliberately NOT derived from
      support_modes containing an invasive mode token (SIMV/AC/PSV/
      HFOV) — endotracheal_intubation is the day log's own direct
      answer to "was this baby on invasive ventilation," more precise
      than reverse-engineering it from four different ventilator-mode
      acronyms.
    - postnatal_steroids / pulmonary_hemorrhage / pneumothorax /
      chest_drain / pulmonary_hypertension / extubation_failure /
      caffeine_used <- direct any-day booleans from the day log's
      postnatal_steroids / pulm_hemorrhage / pneumothorax / chest_drain
      / pphn / extub_failure / caffeine.
    - extubation_episodes / caffeine_duration <- day-count of
      extub_failure / caffeine (day-count-as-proxy, same caveat as
      every other domain's *_number/*_days fields).
    - apnea / apnea_onset_age: derived from apnea_count (the current
      numbered field, #13) parsed as a number per day; any day with a
      count > 0 counts as an apnea day. Falls back to the legacy `apnea`
      boolean only if no day has a parseable apnea_count at all — same
      current-field-preferred-over-legacy convention as Renal's KDIGO
      stage. apnea_onset_age is the earliest such day minus 1 (nicu_day
      1 == age 0), same day-granularity age pattern as GI's
      nec_age_days — no cross-table join needed since this wants an age
      in days, not a calendar date.

    Deliberately NOT filled:
    - bpd / bpd_support_36w / bpd_grade: BPD is a diagnosis made from
      respiratory support status at a specific point in time (36 weeks
      PMA), not an any-day aggregate — it needs gestational age (from a
      different form), a PMA-date calculation, and reading the single
      day log entry AT that calculated date, not before or after. That
      is a meaningfully different and higher-stakes kind of derivation
      than everything else in this endpoint and deserves its own
      dedicated design pass rather than being folded in here.
    - oxygen_exposure ("Integrated Oxygen Exposure"): this appears to
      correspond to FiO2 AUC data captured in a completely different
      helper form (fio2_auc_logs / Helper 1), outside the 3 day-log
      tables this whole auto-fill project has used — not pulled in here.
    - pneumothorax_side: no laterality in the day log.
    - rx_sildenafil/rx_ino/rx_miliri/rx_vaso/rx_other(_text): no
      specific PPHN treatment drug tracked in the day log.
    - steroid_age_days/steroid_drug(_other)/steroid_dose/steroid_dose_2/
      steroid_indication(_other): the day log only has a flat
      postnatal_steroids boolean, no drug/dose/indication/age detail.
    """
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(RespCVNeuroDayLog)
        .filter(RespCVNeuroDayLog.enrollment_id == enrollment_id)
        .all()
    )
    if not logs:
        return {"has_data": False}

    def any_day(attr):
        return any(getattr(l, attr) is True for l in logs)

    def count_days(attr):
        return sum(1 for l in logs if getattr(l, attr) is True)

    def count_days_with_mode(token):
        count = 0
        for l in logs:
            modes = [m.strip() for m in (l.support_modes or "").split(",") if m.strip()]
            if token in modes:
                count += 1
        return count

    def to_int(v):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None

    apnea_days = sorted({
        l.nicu_day for l in logs
        if (to_int(l.apnea_count) or 0) > 0
    })
    if not apnea_days:
        apnea_days = sorted({l.nicu_day for l in logs if l.apnea is True})

    return {
        "has_data": True,
        "log_days_count": len(logs),
        "oxygen_days": count_days("supp_o2") or None,
        "nasal_cannula": "Yes" if count_days_with_mode("NC") else "No",
        "nasal_cannula_days": count_days_with_mode("NC") or None,
        "cpap": "Yes" if count_days_with_mode("CPAP") else "No",
        "cpap_days": count_days_with_mode("CPAP") or None,
        "nippv": "Yes" if count_days_with_mode("NIPPV") else "No",
        "nippv_days": count_days_with_mode("NIPPV") or None,
        "hfnc": "Yes" if count_days_with_mode("HFNC") else "No",
        "hfnc_days": count_days_with_mode("HFNC") or None,
        "invasive_ventilation": "Yes" if any_day("endotracheal_intubation") else "No",
        "imv_days": count_days("endotracheal_intubation") or None,
        "postnatal_steroids": "Yes" if any_day("postnatal_steroids") else "No",
        "pulmonary_hemorrhage": "Yes" if any_day("pulm_hemorrhage") else "No",
        "pneumothorax": "Yes" if any_day("pneumothorax") else "No",
        "chest_drain": "Yes" if any_day("chest_drain") else "No",
        "pulmonary_hypertension": "Yes" if any_day("pphn") else "No",
        "extubation_failure": "Yes" if any_day("extub_failure") else "No",
        "extubation_episodes": count_days("extub_failure") or None,
        "apnea": "Yes" if apnea_days else "No",
        "apnea_onset_age": (min(apnea_days) - 1) if apnea_days else None,
        "caffeine_used": "Yes" if any_day("caffeine") else "No",
        "caffeine_duration": count_days("caffeine") or None,
    }


@app.get("/neonatal-morbidities/survival-check/{enrollment_id}")
def get_survival_check(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Checks whether any Metab/Renal/Vasc/Eye helper daily log
    (`survived_the_day`, the only day log with this field) recorded that
    the baby did not survive that day.

    Used to surface a one-time prompt on Form H: if the baby died, the
    normal only-fill-if-blank auto-fill discipline undersells the daily
    logs — a field answered "No" early in the admission, before things
    got worse, never gets revisited on its own. This endpoint doesn't
    fill anything itself; the frontend uses it to show a banner offering
    to run Force Refill (already-built, per-domain, overwrite-aware)
    across every domain at once, not to invent any new auto-fill logic.
    """
    require_enrollment_access(enrollment_id, db, current_user)

    logs = (
        db.query(MetabRenalVascEyeDayLog)
        .filter(MetabRenalVascEyeDayLog.enrollment_id == enrollment_id)
        .all()
    )
    death_days = sorted({l.nicu_day for l in logs if l.survived_the_day is False})
    if not death_days:
        return {"did_not_survive": False}

    nicu = (
        db.query(NICUAdmission)
        .filter(NICUAdmission.enrollment_id == enrollment_id)
        .first()
    )
    day = min(death_days)
    date = (nicu.day1_date + timedelta(days=day - 1)).isoformat() if nicu and nicu.day1_date else None

    return {"did_not_survive": True, "day": day, "date": date}


@app.get("/neonatal-morbidities/cranial-usg-prefill/{enrollment_id}")
def get_cranial_usg_prefill(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregates Form F (Cranial USG, `cranial_usg_records`) into Form
    H's IVH/PVL detail (CRF #1-8, #13-20) — the side/grade/date fields
    the Neuro domain (`get_neuro_prefill`, day-log-based) deliberately
    left manual, because the daily nursing log has no side or grade,
    only a flat "was IVH ever seen" boolean. Form F is a dedicated
    serial cranial-ultrasound form with real Papile (IVH) / De Vries
    (cPVL) grading per side per scan — a far more authoritative source
    for exactly the detail the Neuro domain couldn't provide.

    - ivh_grade_right/left, pvl_grade_right/left: the highest grade
      (None < I < II < III < IV, same ordering Form F itself uses)
      recorded on that side across all scans. Only returned if that
      side's max grade is not "None" — Form H's grade selects have no
      "None" option, and a side that never showed a finding shouldn't
      get a value at all. PVL grades are converted from Form F's
      Roman-numeral strings to Form H's stored "1"-"4" values (Form H
      keeps "1"-"4" for backward compatibility with old records even
      though the label shown is Roman numerals).
    - ivh_date_right/left, pvl_date_right/left: the scanDate of the
      scan where that side's max grade was first recorded.
    - ivh_age_days_right/left, pvl_age_days_right/left: that scan's
      `dol` (day of life — Form F already computes this per scan) minus
      1, since DOL is 1-indexed (birth day = DOL 1) and this project's
      day-log age fields use day1=age0 throughout.
    - ivh_side: "Right"/"Left"/"Bilateral" depending on which side(s)
      ever showed a grade above None. pvl_side uses the same logic but
      returns "Both" instead of "Bilateral" — Form H's PVL side select
      stores "Both" for backward compatibility even though it displays
      "Bilateral".
    - ivh_present/pvl_present: also offered here (Yes, in addition to
      the Neuro domain's day-log-based version) — a real grade on a
      scan is compelling evidence IVH/cPVL is present even if the day
      log never flagged it, and the detail fields above are gated
      behind these Yes/No values being set, so a scan-only finding
      needs this to actually become visible. Both sources use the same
      fill-if-blank discipline, so there's no risk of conflicting data —
      whichever resolves first fills a still-blank field, and a real
      disagreement between whatever ends up saved and either source
      surfaces via each domain's own staleness check on the next load.
    - vp_shunt: direct boolean from Form F's own `vp_shunt` flag.

    Deliberately NOT filled: pvhi and phh — Form F's `phvd` (post-
    hemorrhagic ventricular dilatation) is a related but not identical
    concept to Form H's PHH (post-hemorrhagic hydrocephalus); mapping
    one to the other would be a clinical judgment call, not a
    derivation. ivh_description (free text) is not populated from Form
    F's per-scan `findings` notes in this first pass — matching
    unstructured text across scans/sides isn't a clean 1:1 mapping the
    way the graded fields are. ventriculomegaly_present is intentionally
    left to the Neuro domain alone and not duplicated here, even though
    Form F also has a `ventriculomegaly` flag — no real benefit to a
    second source for a single flat boolean already covered elsewhere.
    """
    require_enrollment_access(enrollment_id, db, current_user)

    record = (
        db.query(CranialUSGRecord)
        .filter(CranialUSGRecord.enrollment_id == enrollment_id)
        .first()
    )
    if not record or not record.scan_entries:
        return {"has_data": False}

    GRADE_ORDER = {"None": 0, "I": 1, "II": 2, "III": 3, "IV": 4}
    PVL_GRADE_TO_FORM_H = {"I": "1", "II": "2", "III": "3", "IV": "4"}

    def best_side(grade_key):
        best_grade = "None"
        best_scan = None
        for scan in record.scan_entries:
            g = (scan or {}).get(grade_key) or "None"
            if GRADE_ORDER.get(g, 0) > GRADE_ORDER.get(best_grade, 0):
                best_grade = g
                best_scan = scan
        return best_grade, best_scan

    def scan_age_days(scan):
        dol = (scan or {}).get("dol")
        return (dol - 1) if isinstance(dol, int) else None

    ivh_r_grade, ivh_r_scan = best_side("ivhGradeRight")
    ivh_l_grade, ivh_l_scan = best_side("ivhGradeLeft")
    pvl_r_grade, pvl_r_scan = best_side("cpvlGradeRight")
    pvl_l_grade, pvl_l_scan = best_side("cpvlGradeLeft")

    result = {"has_data": True, "scan_count": len(record.scan_entries)}

    ivh_r_found = ivh_r_grade != "None"
    ivh_l_found = ivh_l_grade != "None"
    if ivh_r_found or ivh_l_found:
        result["ivh_present"] = "Yes"
        result["ivh_side"] = (
            "Bilateral" if (ivh_r_found and ivh_l_found)
            else "Right" if ivh_r_found else "Left"
        )
    if ivh_r_found:
        result["ivh_grade_right"] = ivh_r_grade
        result["ivh_date_right"] = (ivh_r_scan or {}).get("scanDate")
        result["ivh_age_days_right"] = scan_age_days(ivh_r_scan)
    if ivh_l_found:
        result["ivh_grade_left"] = ivh_l_grade
        result["ivh_date_left"] = (ivh_l_scan or {}).get("scanDate")
        result["ivh_age_days_left"] = scan_age_days(ivh_l_scan)

    pvl_r_found = pvl_r_grade != "None"
    pvl_l_found = pvl_l_grade != "None"
    if pvl_r_found or pvl_l_found:
        result["pvl_present"] = "Yes"
        result["pvl_side"] = (
            "Both" if (pvl_r_found and pvl_l_found)
            else "Right" if pvl_r_found else "Left"
        )
    if pvl_r_found:
        result["pvl_grade_right"] = PVL_GRADE_TO_FORM_H.get(pvl_r_grade)
        result["pvl_date_right"] = (pvl_r_scan or {}).get("scanDate")
        result["pvl_age_days_right"] = scan_age_days(pvl_r_scan)
    if pvl_l_found:
        result["pvl_grade_left"] = PVL_GRADE_TO_FORM_H.get(pvl_l_grade)
        result["pvl_date_left"] = (pvl_l_scan or {}).get("scanDate")
        result["pvl_age_days_left"] = scan_age_days(pvl_l_scan)

    result["vp_shunt"] = "Yes" if record.vp_shunt is True else "No"

    return result


# ============================================================================
# FORM G  -  STUDY OUTCOMES ENDPOINTS
# ============================================================================

@app.post("/study-outcomes/", response_model=StudyOutcomesOut)
def create_study_outcomes(
    data: StudyOutcomesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    # Upsert, same pattern as neonatal-morbidities: Form I is one
    # comprehensive record per enrollment filled incrementally across
    # sessions (36/40/44-week follow-ups), not a repeatable-events list,
    # so POST after the first save should update, not duplicate.
    existing = (
        db.query(StudyOutcomes)
        .filter(StudyOutcomes.enrollment_id == data.enrollment_id)
        .order_by(StudyOutcomes.id.desc())
        .first()
    )
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key) and key != "enrollment_id":
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = StudyOutcomes(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@app.get("/study-outcomes/{enrollment_id}", response_model=list[StudyOutcomesOut])
def get_study_outcomes(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return (
        db.query(StudyOutcomes)
        .filter(StudyOutcomes.enrollment_id == enrollment_id)
        .order_by(StudyOutcomes.id.asc())
        .all()
    )

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

    existing = (
        db.query(ROPScreening)
        .filter(ROPScreening.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in data.model_dump(exclude_unset=True).items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = ROPScreening(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/rop-screening/{enrollment_id}", response_model=ROPScreeningOut)
def get_rop_screening(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(ROPScreening)
        .filter(ROPScreening.enrollment_id == enrollment_id)
        .order_by(ROPScreening.id.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="ROP screening record not found")
    return record

# ============================================================================
# FORM J  -  COMPOSITE OUTCOME ENDPOINTS
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
# FORM J ? EXTERNAL HOSPITAL ASSESSMENT (36 / 40 / 44 weeks)
# ============================================================================

@app.post("/external-hospital-assessment/", response_model=ExternalHospitalAssessmentOut)
def upsert_external_hospital_assessment(
    data: ExternalHospitalAssessmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)
    if data.assessment_weeks is None or int(data.assessment_weeks) < 1:
        raise HTTPException(status_code=400, detail="assessment_weeks must be a positive number")
    weeks = int(data.assessment_weeks)

    allowed = set(ExternalHospitalAssessment.__table__.columns.keys()) - {"id", "created_at", "updated_at"}
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}
    payload["assessment_weeks"] = weeks

    existing = (
        db.query(ExternalHospitalAssessment)
        .filter(
            ExternalHospitalAssessment.enrollment_id == data.enrollment_id,
            ExternalHospitalAssessment.assessment_weeks == weeks,
        )
        .first()
    )
    if existing:
        for key, value in payload.items():
            if key in ("enrollment_id", "assessment_weeks"):
                continue
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = ExternalHospitalAssessment(**payload)
    db.add(record)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(record)
    return record


@app.get(
    "/external-hospital-assessment/{enrollment_id}",
    response_model=list[ExternalHospitalAssessmentOut],
)
def get_external_hospital_assessments(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    return (
        db.query(ExternalHospitalAssessment)
        .filter(ExternalHospitalAssessment.enrollment_id == enrollment_id)
        .order_by(ExternalHospitalAssessment.assessment_weeks.asc())
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
    """Upsert — one FiO₂ row per enrollment (same as PUT). Prevents web/mobile
    POST from stacking duplicate rows that hide older good data on GET newest-first."""
    require_enrollment_access(data.enrollment_id, db, current_user)
    record = (
        db.query(FiO2AUC)
        .filter(FiO2AUC.enrollment_id == data.enrollment_id)
        .order_by(FiO2AUC.created_at.desc())
        .first()
    )
    if not record:
        record = FiO2AUC(enrollment_id=data.enrollment_id)
        db.add(record)
    record.total_auc = data.total_auc
    record.mean_daily_fio2 = data.mean_daily_fio2
    record.excess_o2_auc = data.excess_o2_auc
    record.fio2_logs = data.fio2_logs
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

def _sae_payload(data: SAEReportCreate) -> dict:
    """Full dump filtered to model columns; normalize list/bool defaults."""
    allowed = set(SAEReport.__table__.columns.keys()) - {
        "id", "created_at", "updated_at",
    }
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}
    if payload.get("seriousness") is None:
        payload["seriousness"] = []
    if payload.get("ongoing") is None:
        payload["ongoing"] = False
    return payload


@app.post("/sae-report/", response_model=SAEReportOut)
def create_sae_report(
    data: SAEReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new SAE report (multiple reports allowed per enrollment)."""
    require_enrollment_access(data.enrollment_id, db, current_user)
    payload = _sae_payload(data)
    record = SAEReport(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/sae-report/id/{report_id}", response_model=SAEReportOut)
def get_sae_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(SAEReport).filter(SAEReport.id == report_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="SAE report not found")
    require_enrollment_access(record.enrollment_id, db, current_user)
    return record


@app.put("/sae-report/{report_id}", response_model=SAEReportOut)
def update_sae_report(
    report_id: int,
    data: SAEReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full-field update so cleared values persist (no data loss / stale fields)."""
    record = db.query(SAEReport).filter(SAEReport.id == report_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="SAE report not found")
    require_enrollment_access(record.enrollment_id, db, current_user)
    if data.enrollment_id and data.enrollment_id != record.enrollment_id:
        require_enrollment_access(data.enrollment_id, db, current_user)

    payload = _sae_payload(data)
    for key, value in payload.items():
        if key == "enrollment_id":
            continue
        setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


@app.get("/sae-report/{enrollment_id}", response_model=List[SAEReportOut])
def list_sae_reports(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all SAE reports for an enrollment (newest first)."""
    require_enrollment_access(enrollment_id, db, current_user)
    return (
        db.query(SAEReport)
        .filter(SAEReport.enrollment_id == enrollment_id)
        .order_by(SAEReport.id.desc())
        .all()
    )

@app.post("/adverse-events/", response_model=AdverseEventsOut)
def create_adverse_events(
    data: AdverseEventsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert AE form by enrollment_id (one record per enrollment)."""
    require_enrollment_access(data.enrollment_id, db, current_user)

    allowed = set(AdverseEvents.__table__.columns.keys()) - {
        "id", "created_at", "updated_at",
    }
    raw = {k: v for k, v in data.model_dump().items() if k in allowed or k in AE_PII_FIELDS}
    if raw.get("events") is None:
        raw["events"] = []

    payload = split_and_store_pii(
        db,
        raw,
        AE_PII_FIELDS,
        enrollment_id=data.enrollment_id,
        site_name=site_for_enrollment(db, data.enrollment_id),
    )
    payload = {k: v for k, v in payload.items() if k in allowed}

    existing = (
        db.query(AdverseEvents)
        .filter(AdverseEvents.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in payload.items():
            if key == "enrollment_id":
                continue
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return _ae_out_with_pii(db, existing, current_user)

    record = AdverseEvents(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return _ae_out_with_pii(db, record, current_user)


@app.get("/adverse-events/{enrollment_id}", response_model=Optional[AdverseEventsOut])
def get_adverse_events(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return saved AE form, or null if not filled yet (not an error)."""
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(AdverseEvents)
        .filter(AdverseEvents.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        return None
    return _ae_out_with_pii(db, record, current_user)


@app.put("/adverse-events/{enrollment_id}", response_model=AdverseEventsOut)
def update_adverse_events(
    enrollment_id: str,
    data: AdverseEventsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(AdverseEvents)
        .filter(AdverseEvents.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Adverse Events form not found ? use POST to create")

    allowed = set(AdverseEvents.__table__.columns.keys()) - {
        "id", "created_at", "updated_at", "enrollment_id",
    }
    raw = {k: v for k, v in data.model_dump().items() if k in allowed or k in AE_PII_FIELDS}
    if raw.get("events") is None:
        raw["events"] = []
    raw["enrollment_id"] = enrollment_id

    payload = split_and_store_pii(
        db,
        raw,
        AE_PII_FIELDS,
        enrollment_id=enrollment_id,
        site_name=site_for_enrollment(db, enrollment_id),
    )
    payload = {k: v for k, v in payload.items() if k in allowed}
    for key, value in payload.items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return _ae_out_with_pii(db, record, current_user)


def _ae_out_with_pii(db: Session, record: AdverseEvents, current_user: User) -> dict:
    """Reattach mother_name / maternal_uid from PII store for UI reload."""
    data = AdverseEventsOut.model_validate(record).model_dump()
    try:
        from pii_service import can_view_pii_for_site
        site = site_for_enrollment(db, record.enrollment_id)
        if can_view_pii_for_site(current_user, site):
            pii = (
                db.query(ParticipantPII)
                .filter(ParticipantPII.enrollment_id == record.enrollment_id)
                .first()
            )
            if pii:
                if not data.get("mother_name"):
                    name = f"{pii.mother_first_name or ''} {pii.mother_surname or ''}".strip()
                    if name:
                        data["mother_name"] = name
                if not data.get("maternal_uid") and pii.maternal_uid:
                    data["maternal_uid"] = pii.maternal_uid
    except Exception:
        pass
    return data

@app.post("/sae-list/", response_model=SAEListOut)
def create_sae_list(
    data: SAEListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert SAE listing by enrollment_id (one record per enrollment)."""
    require_enrollment_access(data.enrollment_id, db, current_user)

    allowed = set(SAEList.__table__.columns.keys()) - {
        "id", "created_at", "updated_at",
    }
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}
    if payload.get("rows") is None:
        payload["rows"] = []

    existing = (
        db.query(SAEList)
        .filter(SAEList.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in payload.items():
            if key == "enrollment_id":
                continue
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = SAEList(**payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/sae-list/{enrollment_id}", response_model=Optional[SAEListOut])
def get_sae_list(
    enrollment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return saved SAE list, or null if not filled yet."""
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(SAEList)
        .filter(SAEList.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        return None
    return record


@app.put("/sae-list/{enrollment_id}", response_model=SAEListOut)
def update_sae_list(
    enrollment_id: str,
    data: SAEListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(SAEList)
        .filter(SAEList.enrollment_id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="SAE list not found ? use POST to create")

    allowed = set(SAEList.__table__.columns.keys()) - {
        "id", "created_at", "updated_at", "enrollment_id",
    }
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}
    if payload.get("rows") is None:
        payload["rows"] = []
    for key, value in payload.items():
        setattr(record, key, value)

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

    birth = (
        db.query(BirthResuscitation)
        .filter(BirthResuscitation.enrollment_id == enrollment_id)
        .first()
    )
    # Row existence alone is not "complete" — the 10s background autosave can
    # silently persist an in-progress draft (e.g. once baby_uid is typed)
    # before the user ever clicks Save. explicitly_saved is set only by the
    # explicit Save button; legacy rows saved before that flag existed still
    # count if they carry real clinical data, not just identifiers autosave
    # writes early. Mirrors the form_e fix below.
    form_b = bool(
        birth
        and (
            birth.explicitly_saved is True
            or (
                birth.gestation_weeks is not None
                or birth.birth_weight is not None
                or (birth.delivery_mode not in (None, ""))
                or birth.required_resuscitation is not None
            )
        )
    )
    # PPV / resuscitation not required ? stop after Forms A?C
    no_ppv = form_b and birth.required_resuscitation is False

    maternal = (
        db.query(MaternalDetails)
        .filter(MaternalDetails.enrollment_id == enrollment_id)
        .first()
    )
    # Row existence alone is not "complete" — empty autosave shells must not
    # green-tick Form C in the sidebar.
    form_c = bool(
        maternal
        and (
            maternal.mother_age is not None
            or (maternal.gravida not in (None, ""))
            or (maternal.booked not in (None, ""))
            or (maternal.address not in (None, ""))
            or (maternal.antenatal_steroids not in (None, ""))
        )
    )

    postnatal = (
        db.query(PostnatalDay1)
        .filter(PostnatalDay1.enrollment_id == enrollment_id)
        .first()
    )
    form_d = bool(
        postnatal
        and (
            postnatal.ga_method not in (None, "")
            or postnatal.baby_name not in (None, "")
            or postnatal.plastic_wrap is not None
            or postnatal.surfactant_required is not None
        )
    )

    nicu = (
        db.query(NICUAdmission)
        .filter(NICUAdmission.enrollment_id == enrollment_id)
        .first()
    )
    # Opening Form E copies baby_uid / baby_name from Form B, then autosave
    # (or a helper Day-1 date stub) writes a nicu_admission row. Those must
    # not green-tick the sidebar. finalized is set only by the explicit Save
    # button. Legacy rows saved before that flag existed still count if they
    # have real Form E clinical data — not identification copied from Form B.
    form_e = bool(
        nicu
        and (
            nicu.finalized is True
            or (
                nicu.admission_datetime is not None
                and (
                    nicu.temp_dr is not None
                    or nicu.temp_skin is not None
                    or nicu.temp_axillary is not None
                    or (nicu.nicu_mode_resp not in (None, ""))
                    or (nicu.completed_by not in (None, ""))
                )
            )
        )
    )

    if not form_b:
        next_form = "form-b"
    elif not form_c:
        next_form = "form-c"
    elif no_ppv:
        next_form = "completed"
    elif not form_d:
        next_form = "form-d"
    elif not form_e:
        next_form = "form-e"
    else:
        next_form = "completed"

    return {
        "enrollment_id": enrollment_id,
        "screening_status": screening.screening_status,
        "form_a": True,
        "form_b": form_b,
        "form_c": form_c,
        "form_d": form_d,
        "form_e": form_e,
        "no_ppv": no_ppv,
        "next_form": next_form,
    }
#  - 
# Paste these routes into main.py
# below the existing FiO2 AUC section
#  - 

# ============================================================================
# RESP / CV / NEURO DAILY LOG  -  NEW STRUCTURED ENDPOINTS
# Replaces the old /resp-cv-neuro-log/ blob endpoints
# ============================================================================

def _compute_completion_pct(record) -> int:
    """Compute completion % for a RespCVNeuroDayLog row (spec items 1-37)."""

    def answered(val):
        return val is not None and val != ""
    def answered_value_or_status(value_field, status_field):
        return (
            answered(getattr(record, value_field, None))
            or answered(getattr(record, status_field, None))
        )

    #  -  RESPIRATORY (items 1-22)  - 
    resp_bool_fields = [
        "respiratory_support", "endotracheal_intubation",       # 1, 2
        "surfactant", "caffeine",                               # 11, 12
        "extub_attempted", "pulm_hemorrhage",                   # 16, 18
        "pneumothorax", "chest_drain", "pphn", "postnatal_steroids",  # 19-22
    ]
    resp_text_fields = [
        "lowest_ph", "pao2_range", "paco2_range",                # 8, 9, 10
        "apnea_count", "desaturation_count", "severe_desaturation_count",  # 13, 14, 15
    ]
    # #3-7 depend on respiratory support mode / status:
    #  - #4 (MAP/CPAP), #5 (Max FiO2), #6 (Max Gas Flow), #7 (Supplemental O2)
    #    are only asked when Respiratory support (#1) is Yes ? if it's No,
    #    they're N/A and shouldn't block completion.
    #  - #4b (the second CPAP/MAP field) only applies when CPAP is combined
    #    with a MAP-generating mode (NIPPV/SIMV/A-C/PSV/HFOV) on the same day.
    #  - #17 (Extubation failure) is only asked when Extubation attempted
    #    (#16) is Yes.
    _modes = [m.strip() for m in (getattr(record, "support_modes", None) or "").split(",") if m.strip()]
    _pressure_modes = {"NIPPV", "SIMV", "AC", "PSV", "HFOV"}
    _has_pressure_mode = any(m in _pressure_modes for m in _modes)
    _has_cpap = "CPAP" in _modes
    if _has_pressure_mode and _has_cpap:
        _map_cpap_mode = "BOTH"
    elif _has_pressure_mode:
        _map_cpap_mode = "MAP"
    elif _has_cpap:
        _map_cpap_mode = "CPAP"
    elif any(m in {"NC", "HFNC"} for m in _modes):
        _map_cpap_mode = "NA"
    else:
        _map_cpap_mode = None
    _dual_cpap_map = _map_cpap_mode == "BOTH"
    _map_cpap_na   = _map_cpap_mode == "NA"
    _resp_support_no = getattr(record, "respiratory_support", None) is False
    _extub_attempted_yes = getattr(record, "extub_attempted", None) is True
    resp_done = (
        (1 if answered(getattr(record, "weight_kg", None)) else 0)      # 2.1 weight
        + sum(1 for f in resp_bool_fields if answered(getattr(record, f, None)))
        + sum(1 for f in resp_text_fields if answered(getattr(record, f, None)))
        + (1 if answered(getattr(record, "support_modes", None)) else 0)  # 3
        + (1 if (_resp_support_no or _map_cpap_na or answered_value_or_status("map_cpap", "map_cpap_status")) else 0)  # 4
        + (1 if (_dual_cpap_map and answered_value_or_status("map_cpap_secondary", "map_cpap_secondary_status")) else 0)  # 4b
        + (1 if (_resp_support_no or answered_value_or_status("max_fio2", "max_fio2_status")) else 0)   # 5
        + (1 if (_resp_support_no or answered_value_or_status("max_flow", "max_flow_status")) else 0)   # 6
        + (1 if (_resp_support_no or answered(getattr(record, "supp_o2", None))) else 0)    # 7
        + (1 if (not _extub_attempted_yes or answered(getattr(record, "extub_failure", None))) else 0)  # 17
    )
    resp_total = len(resp_bool_fields) + len(resp_text_fields) + 1 + 5 + (1 if _dual_cpap_map else 0)  # weight + #3,4,5,6,7,17 (+4b when dual)

    #  -  CARDIOVASCULAR (items 23-29)  - 
    cv_bool_fields = ["pda_suspected", "echo_done", "hs_pda", "shock", "vasoactive_support"]  # 23-27
    vasoactive_visible = getattr(record, "vasoactive_support", None) is True
    cv_done = (
        sum(1 for f in cv_bool_fields if answered(getattr(record, f, None)))
        + (1 if answered(getattr(record, "fluid_bolus_given", None)) else 0)  # 29
        + (1 if vasoactive_visible and answered(getattr(record, "vasoactive_drugs", None)) else 0)  # 28
    )
    cv_total = len(cv_bool_fields) + 1 + (1 if vasoactive_visible else 0)

    #  -  NEUROLOGICAL (items 30-37)  - 
    neuro_base = [
        "cranial_usg", "ivh", "cpvl_confirmed", "ventriculomegaly",       # 30-33
        "clinical_seizures", "eeg_seizures", "aeds_given", "non_ivh_ich",  # 34-37
    ]
    neuro_done = sum(1 for f in neuro_base if answered(getattr(record, f, None)))
    neuro_total = len(neuro_base)

    total_fields = resp_total + cv_total + neuro_total  # = 37 (+1 if vasoactive visible)
    total_done   = resp_done + cv_done + neuro_done

    return min(100, round((total_done / total_fields) * 100)) if total_fields else 0


#  -  GET single day  - 


#  -  GET summary (all days for timeline status indicators)  - 
#  -  GET records (cross-patient list ? Helper Form Records page)  - 
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
    each NICU day ? not the row's created_at/updated_at, which only reflects
    when it was last edited."""
    per_page = min(max(per_page, 1), 100)
    page = max(page, 1)

    screening_query = db.query(Screening).filter(Screening.is_deleted.isnot(True))
    if not is_global(current_user):
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


#  -  GET latest update (lightweight polling for "new records" banner)  - 
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
    if not is_global(current_user):
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
            "surfactant":        r.surfactant,
            "supp_o2":           r.supp_o2,
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


#  -  POST create day  - 
@app.post("/resp-cv-neuro/")
def create_resp_cv_neuro_day(
    data:         RespCVNeuroDayCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    # Prevent duplicate  -  upsert pattern
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


#  -  PUT update day  - 
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
        raise HTTPException(status_code=404, detail="Record not found  -  use POST to create")

    # Block edits on submitted days, unless a superadmin override is
    # currently active (see /override-unlock) — a stale/expired override
    # doesn't count, so this is re-checked on every write, not just once.
    override_active = record.override_unlocked_until and record.override_unlocked_until > datetime.utcnow()
    if record.submission_status == "submitted" and not override_active:
        raise HTTPException(status_code=403, detail="Day is submitted and locked")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("enrollment_id", "nicu_day"):
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


#  -  PATCH submit day  - 
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


class OverrideUnlockRequest(BaseModel):
    reason: str
    hours: int = 2


def _override_unlock_day(
    db: Session,
    model,
    table_name: str,
    enrollment_id: str,
    nicu_day: int,
    data: OverrideUnlockRequest,
    current_user: User,
):
    """Shared logic behind the /override-unlock endpoints on Helper Forms
    2/3/4 (Resp-CV-Neuro, Infect-GI-Hema, Metab-Renal-Vasc-Eye) —
    superadmin-only, time-boxed reopen of a locked day (past-calendar OR
    submitted), with a mandatory reason recorded both on the row
    (override_reason/override_by/override_unlocked_until) and in the audit
    trail. The matching PUT endpoint for each form checks
    override_unlocked_until as an alternative to "not submitted" before
    accepting an edit while this window is open — see its "Block edits"
    guard. Frontend modals for all three forms already called this
    endpoint before it existed; only the backend side and the trigger
    button for a *submitted* (not just past-calendar-locked) day were
    missing until 2026-08-23."""
    if not is_superadmin(current_user):
        raise HTTPException(status_code=403, detail="Superadmin only")
    reason = (data.reason or "").strip()
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="A reason (at least 5 characters) is required")
    if not (1 <= data.hours <= 24):
        raise HTTPException(status_code=400, detail="hours must be between 1 and 24")

    require_enrollment_access(enrollment_id, db, current_user)
    record = (
        db.query(model)
        .filter(model.enrollment_id == enrollment_id, model.nicu_day == nicu_day)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Day record not found")

    old_values = row_snapshot(record)
    until = datetime.utcnow() + timedelta(hours=data.hours)
    record.override_unlocked_until = until
    record.override_reason = reason
    record.override_by = current_user.username
    db.flush()
    record_audit(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="OVERRIDE_UNLOCK",
        table_name=table_name,
        record_id=record.id,
        enrollment_id=enrollment_id,
        old_values=old_values,
        new_values={**row_snapshot(record), "reason": reason, "hours": data.hours},
    )
    db.commit()
    return {"override_unlocked_until": until.isoformat()}


@app.patch("/resp-cv-neuro/{enrollment_id}/{nicu_day}/override-unlock")
def override_unlock_resp_cv_neuro_day(
    enrollment_id: str,
    nicu_day: int,
    data: OverrideUnlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _override_unlock_day(
        db, RespCVNeuroDayLog, "resp_cv_neuro_day_logs",
        enrollment_id, nicu_day, data, current_user,
    )


#  -  PATCH discharge  -
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
    # separate approach. For now return success  -  add a
    # discharge_date column to BirthResuscitation if needed.

    return {
        "message":        f"Patient discharged on Day {data.discharge_day}",
        "discharge_date": data.discharge_date,
        "discharge_day":  data.discharge_day,
    }
#  - 
# Paste into main.py after the Resp-CV-Neuro routes section
#
# Add to main.py imports:
#   from models import InfectGIHemaDayLog
#   from schemas import InfectGIHemaDayCreate, InfectGIHemaDaySubmit
#  - 

# ============================================================================
# INFECT / GI / HEMA DAILY LOG  -  STRUCTURED PER-DAY ENDPOINTS
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

    #  -  INFECTION (Fields 1-9)  - ?
    # Base fields (always visible): 6 fields
    INF_BASE = ["sepsis_suspected", "antibiotics", "lp_done", "clabsi", "vap"]  # 1,4,5,8,9
    # Sepsis conditional fields: blood culture sent + result/status.
    INF_SEPSIS = ["blood_culture_sent"]  # 2
    # Meningitis field: 1 field (visible when meningitis = Yes)
    INF_MENING = ["meningitis_type"]  # 7

    sepsis_yes = getattr(r, "sepsis_suspected", None) is True
    blood_culture_sent_yes = getattr(r, "blood_culture_sent", None) is True
    meningitis_yes = getattr(r, "meningitis", None) is True

    inf_total = (
        len(INF_BASE)
        + 1  # meningitis Y/N (#6)
        + (len(INF_SEPSIS) if sepsis_yes else 0)
        + (1 if sepsis_yes and blood_culture_sent_yes else 0)
        + (len(INF_MENING) if meningitis_yes else 0)
    )
    inf_done = (
        sum(1 for k in INF_BASE if ans(getattr(r, k, None)))
        + (1 if ans(getattr(r, "meningitis", None)) else 0)
        + (sum(1 for k in INF_SEPSIS if ans(getattr(r, k, None))) if sepsis_yes else 0)
        + (1 if sepsis_yes and blood_culture_sent_yes and (
            ans(getattr(r, "blood_culture_positive", None))
            or ans(getattr(r, "blood_culture_status", None))
        ) else 0)
        + (sum(1 for k in INF_MENING if ans(getattr(r, k, None))) if meningitis_yes else 0)
    )

    #  -  GASTROINTESTINAL (Fields 10-22)  - 
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
        + (1 if not ans(getattr(r, "cumulative_feed_volume", None)) and ans(getattr(r, "cumulative_feed_volume_status", None)) else 0)
        + (1 if not ans(getattr(r, "feed_volume", None)) and ans(getattr(r, "feed_volume_status", None)) else 0)
        + (1 if ans(getattr(r, enteral_feeds_field, None)) else 0)  # Check either old or new field name
        + (sum(1 for k in GI_NEC if ans(getattr(r, k, None))) if nec_yes else 0)
    )

    #  -  HEMATOLOGY (Fields 23-30)  - 
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
        + (1 if not ans(getattr(r, "hb_value", None)) and ans(getattr(r, "hb_value_status", None)) else 0)
        + (1 if not ans(getattr(r, "peak_tsb", None)) and ans(getattr(r, "peak_tsb_status", None)) else 0)
        + (sum(1 for k in HEMA_JAUNDICE if ans(getattr(r, k, None))) if jaundice_yes else 0)
    )

    total_fields = inf_total + gi_total + hema_total
    total_done = inf_done + gi_done + hema_done

    return min(100, round((total_done / total_fields) * 100)) if total_fields else 0


#  -  GET summary (all days  -  for timeline status indicators)  - 
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


#  -  GET single day  - 
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


#  -  POST create day (upsert)  - 
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


#  -  PUT update day  - 
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
        raise HTTPException(status_code=404, detail="Record not found  -  use POST to create")
    # Block edits on submitted days, unless a superadmin override is
    # currently active (see /override-unlock).
    override_active = record.override_unlocked_until and record.override_unlocked_until > datetime.utcnow()
    if record.submission_status == "submitted" and not override_active:
        raise HTTPException(status_code=403, detail="Day is submitted and locked")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key not in ("enrollment_id", "nicu_day"):
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


#  -  PATCH submit day  -
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


@app.patch("/infect-gi-hema/{enrollment_id}/{nicu_day}/override-unlock")
def override_unlock_infect_gi_hema_day(
    enrollment_id: str,
    nicu_day: int,
    data: OverrideUnlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _override_unlock_day(
        db, InfectGIHemaDayLog, "infect_gi_hema_day_logs",
        enrollment_id, nicu_day, data, current_user,
    )


#  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
# 3. ADD TO main.py  (imports + routes)
#
# Add to imports:
#   from models import MetabRenalVascEyeDayLog
#   from schemas import MetabRenalVascEyeDayCreate, MetabRenalVascEyeDaySubmit
#  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 
def _metab_completion_pct(r) -> int:
    """Compute completion % for Helper Form 4 (items 1-25), with gated fields."""
    def ans(v): return v is not None and v != "" and not (isinstance(v, list) and len(v)==0)

    def _is_numeric_high(v):
        if v is None or v == "" or v in ("Not Tested", "Not High", "Not Low", "Result Awaited", "Not Recorded / Not Done"):
            return False
        try:
            return float(v) > 180
        except (TypeError, ValueError):
            return False

    hypo_eps = getattr(r, "hypoglycemia_episodes", None)
    try:
        hypo_n = int(float(hypo_eps)) if hypo_eps not in (None, "") else 0
    except (TypeError, ValueError):
        hypo_n = 0
    hypo_rx_needed = hypo_n > 0
    hyper_rx_needed = _is_numeric_high(getattr(r, "highest_glucose", None))

    metab_fields = [
        "lowest_glucose", "hypoglycemia_episodes",
        *(["hypoglycemia_rx"] if hypo_rx_needed else []),
        "highest_glucose",
        *(["insulin"] if hyper_rx_needed else []),
        "metabolic_acidosis",
        "sodium_value", "potassium_value", "ionized_calcium_value",
        "osteopenia_suspected",
    ]
    metab_done  = sum(1 for k in metab_fields if ans(getattr(r, k, None)))
    metab_total = len(metab_fields)

    # #11 Yes/No in aki_suspected; stage only when Yes. Creatinine prefers string col.
    aki_yes = getattr(r, "aki_suspected", None) is True
    creat = getattr(r, "creatinine_value", None)
    if not ans(creat):
        creat = getattr(r, "creatinine", None)
    renal_fields = [
        "aki_suspected",
        *(["aki_stage"] if aki_yes else []),
    ]
    renal_done = sum(1 for k in renal_fields if ans(getattr(r, k, None)))
    renal_done += 1 if ans(creat) else 0
    renal_done += 1 if (
        ans(getattr(r, "urine_output_8am_2pm", None))
        or ans(getattr(r, "urine_output_8am_2pm_status", None))
        or ans(getattr(r, "urine_output_2pm_8pm", None))
        or ans(getattr(r, "urine_output_2pm_8pm_status", None))
        or ans(getattr(r, "urine_output_8pm_8am", None))
        or ans(getattr(r, "urine_output_8pm_8am_status", None))
        or ans(getattr(r, "urine_output_total", None))
    ) else 0
    renal_done += 1 if ans(getattr(r, "dialysis_crrt", None)) else 0
    renal_total = len(renal_fields) + 3  # creat + urine + dialysis

    thermo_fields = ["axillary_temperature"]
    thermo_done   = sum(1 for k in thermo_fields if ans(getattr(r, k, None)))

    extravasation_needed = (
        getattr(r, "peripheral_iv", None) is True
        or getattr(r, "peripheral_arterial", None) is True
    )
    vasc_keys = [
        "picc_in_situ", "uvc_in_situ", "uac_in_situ",
        "peripheral_iv", "peripheral_arterial",
        *(["extravasation_injury"] if extravasation_needed else []),
        "line_complication",
    ]
    vasc_done = sum(1 for k in vasc_keys if ans(getattr(r, k, None)))

    due = getattr(r, "rop_screening_due", None) is True
    screened = getattr(r, "rop_screened", None) is True
    eye_keys = [
        "rop_screening_due",
        *(["rop_screened"] if due else []),
        *(["rop_detected"] if due and screened else []),
    ]
    rop_yes = getattr(r, "rop_detected", None) is True
    eye_rop = ["rop_stage", "plus_disease", "rop_treatment"]
    eye_total = len(eye_keys) + (len(eye_rop) if rop_yes else 0)
    eye_done = (
        sum(1 for k in eye_keys if ans(getattr(r, k, None)))
        + (sum(1 for k in eye_rop if ans(getattr(r, k, None))) if rop_yes else 0)
    )

    tail_fields = ["location", "survived_the_day"]
    tail_done   = sum(1 for k in tail_fields if ans(getattr(r, k, None)))

    total_fields = (
        metab_total + renal_total + len(thermo_fields) + len(vasc_keys)
        + eye_total + len(tail_fields)
    )
    total_done = metab_done + renal_done + thermo_done + vasc_done + eye_done + tail_done
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
    # Empty day is normal ? return null (200) so the client can show a blank
    # sheet without treating "not started yet" as an error.
    if not record:
        return None
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
        raise HTTPException(status_code=404, detail="Record not found  -  use POST to create")
    # Block edits on submitted days, unless a superadmin override is
    # currently active (see /override-unlock).
    override_active = record.override_unlocked_until and record.override_unlocked_until > datetime.utcnow()
    if record.submission_status == "submitted" and not override_active:
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


@app.patch("/metab-renal-vasc-eye/{enrollment_id}/{nicu_day}/override-unlock")
def override_unlock_metab_renal_vasc_eye_day(
    enrollment_id: str,
    nicu_day: int,
    data: OverrideUnlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _override_unlock_day(
        db, MetabRenalVascEyeDayLog, "metab_renal_vasc_eye_day_logs",
        enrollment_id, nicu_day, data, current_user,
    )


MINIMAL_MONITORING_CORE_FIELDS = [
    "record_date", "shift",
]

# Soft progress fields ? filled when values are available (not all required to submit)
MINIMAL_MONITORING_FIELDS = [
    "record_date", "shift", "axillary_temp", "sbp", "dbp", "map_value",
    "fluid_bolus_given", "vasoactive_drugs", "vasoactive_dose",
    "vasoactive_unit", "pda_agent", "pda_dose", "respiratory_time",
    "respiratory_modes", "max_map_cpap", "max_fio2", "ph", "pao2",
    "paco2", "apnea_shift", "apnea_episodes", "desaturation_episodes",
    "severe_desaturation_episodes", "postnatal_steroids", "steroid_dose",
    "glucose", "alp", "total_calcium", "phosphorus",
    "electrolyte_abnormality", "hypo_hyper",
    "symptomatic_status", "cumulative_feed_volume", "feed_shift",
    "direct_bilirubin", "imaging_date", "ventriculomegaly_severity",
    "vi", "ahw", "tod", "aca_ri", "mca_ri", "transfusion_products",
    "transfusion_count", "prbc_volume",
]


# Nurse-friendly day boundary (same idea as RespCVNeuroLog's RCN_LATE_GRACE_HOUR):
# before boundary_hour local time, "today" still means the previous calendar date.
MML_LATE_GRACE_HOUR = 8


def _mml_sheet_date(boundary_hour: int = MML_LATE_GRACE_HOUR) -> str:
    now = datetime.now()
    sheet = now.date()
    if now.hour < max(0, min(23, int(boundary_hour))):
        sheet = sheet - timedelta(days=1)
    return sheet.isoformat()


def _mml_empty_payload(enrollment_id: str, record_date: str) -> dict:
    return {
        "id": None,
        "enrollment_id": enrollment_id,
        "nicu_day": None,
        "record_date": record_date,
        "submission_status": "empty",
        "entries_json": None,
    }


@app.get("/minimal-monitoring/{enrollment_id}/today", response_model=MinimalMonitoringDayOut)
def get_minimal_monitoring_today(
    enrollment_id: str,
    boundary_hour: int = MML_LATE_GRACE_HOUR,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Load today's scratchpad sheet. Does not create a row if none exists."""
    require_enrollment_access(enrollment_id, db, current_user)
    record_date = _mml_sheet_date(boundary_hour)
    record = (
        db.query(MinimalMonitoringDayLog)
        .filter(
            MinimalMonitoringDayLog.enrollment_id == enrollment_id,
            MinimalMonitoringDayLog.record_date == record_date,
        )
        .first()
    )
    if not record:
        return _mml_empty_payload(enrollment_id, record_date)
    return record


@app.put("/minimal-monitoring/{enrollment_id}/today", response_model=MinimalMonitoringDayOut)
def upsert_minimal_monitoring_today(
    enrollment_id: str,
    data: MinimalMonitoringDayCreate,
    boundary_hour: int = MML_LATE_GRACE_HOUR,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert today's scratchpad. Always editable ? no submit/lock gating."""
    require_enrollment_access(enrollment_id, db, current_user)
    record_date = _mml_sheet_date(boundary_hour)
    payload = data.model_dump(exclude_unset=True)
    payload["enrollment_id"] = enrollment_id
    payload["record_date"] = record_date
    # Scratchpad is never locked; keep a soft draft marker for older clients.
    if not payload.get("submission_status") or payload.get("submission_status") == "empty":
        payload["submission_status"] = "draft"
    if "saved_at" not in payload or payload.get("saved_at") is None:
        payload["saved_at"] = datetime.utcnow()

    record = (
        db.query(MinimalMonitoringDayLog)
        .filter(
            MinimalMonitoringDayLog.enrollment_id == enrollment_id,
            MinimalMonitoringDayLog.record_date == record_date,
        )
        .first()
    )
    if record:
        for key, value in payload.items():
            if key == "enrollment_id":
                continue
            if hasattr(record, key):
                setattr(record, key, value)
        db.commit()
        db.refresh(record)
        return record

    # Only pass columns that exist on the model
    col_keys = {c.name for c in MinimalMonitoringDayLog.__table__.columns}
    create_data = {k: v for k, v in payload.items() if k in col_keys}
    record = MinimalMonitoringDayLog(**create_data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
# ============================================================================
# FORM H  -  CRANIAL USG ENDPOINTS
# Add these to main.py
#
# REQUIRED IMPORTS (add to top of main.py):
#   from models import CranialUSGRecord
#   from schemas import CranialUSGCreate, CranialUSGSubmit
# ============================================================================

#  -  POST  -  create or upsert  - 
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


#  -  GET  -  load by enrollment_id  - 
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


#  -  PUT  -  full update  - 
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
        raise HTTPException(status_code=404, detail="Form H not found  -  use POST to create")

    for key, value in data.model_dump(exclude_unset=True).items():
        if hasattr(record, key) and key != "enrollment_id":
            setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return record


#  -  PATCH  -  submit and lock  - 
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
# FORM K  -  MRI Brain Assessment Endpoints
# ============================================================================

@app.post("/form-k", response_model=MRIBrainOut)
def create_form_k(
    data:         MRIBrainCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    allowed = set(MRIBrainAssessment.__table__.columns.keys()) - {
        "id", "created_at", "updated_at", "submitted_at", "submitted_by",
    }
    # Full dump (not exclude_unset) so empty/cleared fields overwrite stale DB values
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}

    existing = (
        db.query(MRIBrainAssessment)
        .filter(MRIBrainAssessment.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in payload.items():
            if key == "enrollment_id":
                continue
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = MRIBrainAssessment(**payload)
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
        raise HTTPException(status_code=404, detail="Form K not found ? use POST to create")

    allowed = set(MRIBrainAssessment.__table__.columns.keys()) - {
        "id", "created_at", "updated_at", "submitted_at", "submitted_by", "enrollment_id",
    }
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}
    for key, value in payload.items():
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
# FORM L  -  Blender Data & Study Summary Endpoints
# ============================================================================

@app.post("/form-l", response_model=BlenderSummaryOut)
def create_form_l(
    data:         BlenderSummaryCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    require_enrollment_access(data.enrollment_id, db, current_user)

    allowed = set(BlenderStudySummary.__table__.columns.keys()) - {
        "id", "created_at", "updated_at", "submitted_at", "submitted_by",
    }
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}
    # Normalize minute list length to 11 slots
    mins = payload.get("fio2_per_minute")
    if mins is None:
        payload["fio2_per_minute"] = [None] * 11
    elif isinstance(mins, list):
        padded = list(mins[:11]) + [None] * max(0, 11 - len(mins))
        payload["fio2_per_minute"] = padded

    existing = (
        db.query(BlenderStudySummary)
        .filter(BlenderStudySummary.enrollment_id == data.enrollment_id)
        .first()
    )
    if existing:
        for key, value in payload.items():
            if key == "enrollment_id":
                continue
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    record = BlenderStudySummary(**payload)
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
        raise HTTPException(status_code=404, detail="Form L not found ? use POST to create")

    allowed = set(BlenderStudySummary.__table__.columns.keys()) - {
        "id", "created_at", "updated_at", "submitted_at", "submitted_by", "enrollment_id",
    }
    payload = {k: v for k, v in data.model_dump().items() if k in allowed}
    mins = payload.get("fio2_per_minute")
    if mins is None:
        payload["fio2_per_minute"] = [None] * 11
    elif isinstance(mins, list):
        payload["fio2_per_minute"] = list(mins[:11]) + [None] * max(0, 11 - len(mins))

    for key, value in payload.items():
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