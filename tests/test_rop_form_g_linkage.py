"""ROP detection on Helper Form 4 → Form G screening linkage."""

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db import Base, SessionLocal, engine
from models import (
    BirthResuscitation,
    MetabRenalVascEyeDayLog,
    Screening,
    User,
)


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def superadmin_token(db_session):
    from auth import hash_password
    from core.security import create_access_token

    admin = User(
        username="ropadmin",
        email="ropadmin@test.com",
        hashed_password=hash_password("password123"),
        role="superadmin",
        site_name=None,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return create_access_token({"sub": "ropadmin", "role": "superadmin", "site_name": None})


def _seed_randomised_patient(db: Session, eid: str, dob: date):
    screening = Screening(
        screening_id=f"SCR-{eid}",
        site_name="PGIMER",
        site_id="PGIM",
        screening_status="Eligible",
        gestation_weeks=28,
        gestation_days=0,
        screened_by="Dr Test",
        exclusion_present=False,
        is_deleted=False,
        screening_datetime=datetime.utcnow(),
        enrollment_id=eid,
    )
    db.add(screening)
    br = BirthResuscitation(
        screening_id=screening.screening_id,
        enrollment_id=eid,
        date_of_birth=dob,
        gestation_weeks=28,
        gestation_days=0,
        randomised=True,
        birth_weight=1200.0,
    )
    db.add(br)
    db.commit()


class TestRopFormGLinkage:
    def test_rop_detected_creates_form_g_screening_with_derived_date(
        self, client, superadmin_token, db_session
    ):
        eid = "ENR-ROP-A"
        dob = date(2026, 1, 1)
        _seed_randomised_patient(db_session, eid, dob)
        headers = {"Authorization": f"Bearer {superadmin_token}"}

        res = client.post(
            "/metab-renal-vasc-eye/",
            json={"enrollment_id": eid, "nicu_day": 5, "rop_detected": True},
            headers=headers,
        )
        assert res.status_code == 200

        rop = client.get(f"/rop-screening/{eid}", headers=headers)
        assert rop.status_code == 200
        body = rop.json()
        assert len(body["screenings"]) == 1
        assert body["screenings"][0]["date"] == "2026-01-05"
        assert body["screenings"][0]["from_metab_day_log"] is True
        assert body["screenings"][0]["source_nicu_day"] == 5
        assert body["rop_needs_review"] is True
        assert len(body["rop_review_alerts"]) >= 1

    def test_repeat_save_same_nicu_day_does_not_duplicate(
        self, client, superadmin_token, db_session
    ):
        eid = "ENR-ROP-B"
        _seed_randomised_patient(db_session, eid, date(2026, 2, 1))
        headers = {"Authorization": f"Bearer {superadmin_token}"}
        payload = {"enrollment_id": eid, "nicu_day": 3, "rop_detected": True}

        client.post("/metab-renal-vasc-eye/", json=payload, headers=headers)
        client.put(
            f"/metab-renal-vasc-eye/{eid}/3",
            json={**payload, "rop_detected": True},
            headers=headers,
        )

        rop = client.get(f"/rop-screening/{eid}", headers=headers).json()
        assert len(rop["screenings"]) == 1

    def test_dashboard_flags_rop_without_matching_form_g_date(
        self, client, superadmin_token, db_session
    ):
        eid = "ENR-ROP-C"
        dob = date(2026, 3, 10)
        _seed_randomised_patient(db_session, eid, dob)
        db_session.add(
            MetabRenalVascEyeDayLog(
                enrollment_id=eid,
                nicu_day=7,
                rop_detected=True,
                submission_status="draft",
            )
        )
        db_session.commit()

        headers = {"Authorization": f"Bearer {superadmin_token}"}
        dq = client.get("/dashboard/data-quality", headers=headers)
        assert dq.status_code == 200
        action = next(
            a for a in dq.json()["action_list"] if a["key"] == "rop_detected_no_form_g"
        )
        assert action["overall"] >= 1
