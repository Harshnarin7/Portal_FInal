"""Form H vs Form G ROP consistency checks."""

from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db import Base, SessionLocal, engine
from models import BirthResuscitation, NeonatalMorbidities, ROPScreening, Screening, User
from rop_consistency import build_rop_consistency_report, check_rop_consistency


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
        username="ropconadmin",
        email="ropcon@test.com",
        hashed_password=hash_password("password123"),
        role="superadmin",
        site_name=None,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    return create_access_token({"sub": "ropconadmin", "role": "superadmin", "site_name": None})


def _seed(db: Session, eid: str):
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
    db.add(
        BirthResuscitation(
            screening_id=screening.screening_id,
            enrollment_id=eid,
            date_of_birth=date(2026, 1, 1),
            gestation_weeks=28,
            gestation_days=0,
            randomised=True,
            birth_weight=1200.0,
        )
    )
    db.commit()


class TestRopConsistency:
    def test_matching_values_no_discrepancy(self, db_session):
        eid = "ENR-RC-MATCH"
        _seed(db_session, eid)
        db_session.add(
            NeonatalMorbidities(
                enrollment_id=eid,
                rop_side="Bilateral",
                rop_stage_right="2",
                rop_zone_right="II",
                rop_plus_right="Yes",
                rop_stage_left="1",
                rop_zone_left="II",
                rop_plus_left="Yes",
            )
        )
        db_session.add(
            ROPScreening(
                enrollment_id=eid,
                screenings=[
                    {
                        "screening_no": 1,
                        "date": "2026-02-01",
                        "re_stage": "2",
                        "re_zone": "II",
                        "le_stage": "1",
                        "le_zone": "II",
                        "plus_status": "Plus",
                    }
                ],
            )
        )
        db_session.commit()

        assert check_rop_consistency(eid, db_session) == []

    def test_differing_values_returns_discrepancy(self, db_session):
        eid = "ENR-RC-DIFF"
        _seed(db_session, eid)
        db_session.add(
            NeonatalMorbidities(
                enrollment_id=eid,
                rop_side="Right",
                rop_stage_right="2",
                rop_zone_right="II",
                rop_plus_right="Yes",
            )
        )
        db_session.add(
            ROPScreening(
                enrollment_id=eid,
                screenings=[
                    {
                        "screening_no": 1,
                        "date": "2026-03-01",
                        "re_stage": "1",
                        "re_zone": "II",
                        "plus_status": "Plus",
                    }
                ],
            )
        )
        db_session.commit()

        disc = check_rop_consistency(eid, db_session)
        assert len(disc) == 1
        assert disc[0]["field"] == "stage_right"
        assert disc[0]["form_h_value"] == "2"
        assert disc[0]["form_g_value"] == "1"
        assert disc[0]["form_g_date"] == "2026-03-01"

    def test_reviewed_discrepancy_excluded_from_dashboard_not_from_all_list(
        self, client, superadmin_token, db_session
    ):
        eid = "ENR-RC-REV"
        _seed(db_session, eid)
        db_session.add(
            NeonatalMorbidities(
                enrollment_id=eid,
                rop_side="Right",
                rop_stage_right="3",
                rop_zone_right="III",
                rop_plus_right="No",
                rop_flags_reviewed=["stage_right"],
            )
        )
        db_session.add(
            ROPScreening(
                enrollment_id=eid,
                screenings=[
                    {
                        "screening_no": 1,
                        "date": "2026-04-01",
                        "re_stage": "2",
                        "re_zone": "III",
                        "plus_status": "None",
                    }
                ],
            )
        )
        db_session.commit()

        report = build_rop_consistency_report(eid, db_session)
        assert len(report["all_discrepancies"]) == 1
        assert report["all_discrepancies"][0]["reviewed"] is True
        assert len(report["unreviewed_discrepancies"]) == 0

        headers = {"Authorization": f"Bearer {superadmin_token}"}
        dq = client.get("/dashboard/data-quality", headers=headers)
        assert dq.status_code == 200
        action = next(a for a in dq.json()["action_list"] if a["key"] == "rop_form_mismatch")
        assert action["overall"] == 0
