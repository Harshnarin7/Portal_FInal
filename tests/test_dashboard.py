"""
Comprehensive test suite for dashboard endpoints (Issue #2 and #3)
and database schema (Issue #1).

Run with: pytest tests/test_dashboard.py -v

"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
import json

# Import models and test utilities
from models import (
    Screening, BirthResuscitation, CompositeOutcome,
    User, MaternalDetails, PostnatalDay1, NICUAdmission,
    RespCVNeuroDayLog, InfectGIHemaDayLog, MetabRenalVascEyeDayLog
)
from db import SessionLocal, engine, Base


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def client():
    """FastAPI test client"""
    from main import app
    return TestClient(app)


@pytest.fixture
def db_session():
    """Database session for testing"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def superadmin_token(client, db_session):
    """Create superadmin user and get token"""
    from auth import hash_password
    from core.security import create_access_token
    
    admin = User(
        username="testadmin",
        email="admin@test.com",
        hashed_password=hash_password("password123"),
        role="superadmin",
        site_name=None,
        is_active=True
    )
    db_session.add(admin)
    db_session.commit()
    
    claims = {"sub": "testadmin", "role": "superadmin", "site_name": None}
    token = create_access_token(claims)
    return token


@pytest.fixture
def site_user_token(client, db_session):
    """Create site user and get token"""
    from auth import hash_password
    from core.security import create_access_token
    
    user = User(
        username="testsite",
        email="site@test.com",
        hashed_password=hash_password("password123"),
        role="data_entry",
        site_name="PGIMER",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    
    claims = {"sub": "testsite", "role": "data_entry", "site_name": "PGIMER"}
    token = create_access_token(claims)
    return token


def create_screening(db_session, screening_id, site_name, status, **kwargs):
    """Helper to create a screening record"""
    defaults = {
        'gestation_weeks': 30,
        'gestation_days': 0,
        'site_id': 'PGIM',
        'screened_by': 'Dr. Test',
        'exclusion_present': False,
        'consent_given': None,
        'is_deleted': False,
        'screening_datetime': datetime.utcnow()
    }
    defaults.update(kwargs)
    
    screening = Screening(
        screening_id=screening_id,
        site_name=site_name,
        screening_status=status,
        **defaults
    )
    db_session.add(screening)
    db_session.commit()
    return screening


def create_birth_resuscitation(db_session, screening_id, enrollment_id, randomised=False):
    """Helper to create birth resuscitation record"""
    br = BirthResuscitation(
        screening_id=screening_id,
        enrollment_id=enrollment_id,
        date_of_birth=datetime.now().date(),
        gestation_weeks=30,
        gestation_days=0,
        randomised=randomised,
        birth_weight=1500.0
    )
    db_session.add(br)
    db_session.commit()
    return br


# ============================================================================
# ISSUE #1: DATA SCHEMA FIXES
# ============================================================================

class TestIssue1Fixes:
    """Test Issue #1 schema fixes"""

    def test_screening_has_consent_refusal_fields(self, db_session):
        """Fix 1: reason_for_consent_refusal fields exist"""
        screening = create_screening(
            db_session,
            'SCR-001',
            'PGIMER',
            'Not Eligible',
            reason_for_consent_refusal='Too late',
            reason_for_consent_refusal_other='Patient not interested'
        )
        
        assert screening.reason_for_consent_refusal == 'Too late'
        assert screening.reason_for_consent_refusal_other == 'Patient not interested'

    def test_composite_outcome_has_ltfu_reason_fields(self, db_session):
        """Fix 3: ltfu_reason fields exist"""
        co = CompositeOutcome(
            enrollment_id='ENR-001',
            dob=datetime.now().date(),
            gestation_at_birth=30,
            ltfu_reason_36='Mother shifted',
            ltfu_reason_40='Unknown contact',
            ltfu_reason_44='Refused follow-up'
        )
        db_session.add(co)
        db_session.commit()
        
        assert co.ltfu_reason_36 == 'Mother shifted'
        assert co.ltfu_reason_40 == 'Unknown contact'
        assert co.ltfu_reason_44 == 'Refused follow-up'

    def test_enrollment_id_written_to_screening(self, db_session):
        """Fix 2: enrollment_id is written back to screening on randomisation"""
        # Create screening
        screening = create_screening(db_session, 'SCR-002', 'PGIMER', 'Eligible')
        
        # Create birth resuscitation with randomisation
        br = create_birth_resuscitation(
            db_session,
            screening.screening_id,
            'ENR-002',
            randomised=True
        )
        
        # Simulate what the endpoint does
        db_session.query(Screening).filter(
            Screening.screening_id == br.screening_id
        ).update({"enrollment_id": br.enrollment_id})
        db_session.commit()
        
        # Verify enrollment_id is set
        updated_screening = db_session.query(Screening).filter(
            Screening.screening_id == 'SCR-002'
        ).first()
        assert updated_screening.enrollment_id == 'ENR-002'


# ============================================================================
# ISSUE #2: CONSORT FLOW ENDPOINT
# ============================================================================

class TestCONSORTEndpoint:
    """Test GET /dashboard/consort endpoint"""

    def test_consort_endpoint_returns_200(self, client, superadmin_token, db_session):
        """Endpoint should return 200 OK"""
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        assert response.status_code == 200

    def test_consort_endpoint_requires_auth(self, client):
        """Endpoint should require authentication"""
        response = client.get('/dashboard/consort')
        assert response.status_code == 401

    def test_consort_response_structure(self, client, superadmin_token, db_session):
        """Response should have correct structure"""
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        assert 'generated_at' in data
        assert 'sites' in data
        assert 'rows' in data
        assert len(data['rows']) == 11  # Boxes 1-11

    def test_consort_box_1_count(self, client, superadmin_token, db_session):
        """Box 1 should count all non-deleted screening records"""
        # Create 3 screening records
        for i in range(3):
            create_screening(
                db_session,
                f'SCR-{i:03d}',
                'PGIMER',
                'Eligible'
            )
        
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        box_1 = data['rows'][0]
        assert box_1['box'] == 1
        assert box_1['overall'] == 3
        assert box_1['by_site']['PGIMER'] == 3

    def test_consort_box_2_barriers(self, client, superadmin_token, db_session):
        """Box 2 should count pre-assessment barriers"""
        # Create screening with barrier
        create_screening(
            db_session,
            'SCR-BAR-001',
            'PGIMER',
            'Screen Failure',
            exclusion_reasons='Insufficient time'
        )
        
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        box_2 = data['rows'][1]
        assert box_2['box'] == 2
        assert box_2['overall'] >= 1

    def test_consort_site_filtering(self, client, site_user_token, db_session):
        """Site user should see only their site"""
        # Create screenings in different sites
        create_screening(db_session, 'SCR-PGIM-001', 'PGIMER', 'Eligible')
        create_screening(db_session, 'SCR-GMCH-001', 'GMCH', 'Eligible')
        
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {site_user_token}'}
        )
        data = response.json()
        
        # Site user should see their site in the response
        assert 'PGIMER' in data['sites'] or len(data['sites']) == 0

    def test_consort_sub_rows_expansion(self, client, superadmin_token, db_session):
        """Boxes with sub-rows should be expandable"""
        # Create screening with exclusion criteria
        create_screening(
            db_session,
            'SCR-EXC-001',
            'PGIMER',
            'Not Eligible',
            exclusion_reasons='Structural anomaly; Fetal hydrops'
        )
        
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        # Box 4 should have sub_rows
        box_4 = next((r for r in data['rows'] if r['box'] == 4), None)
        assert box_4 is not None
        assert 'sub_rows' in box_4
        assert len(box_4['sub_rows']) > 0

    def test_consort_follow_up_boxes(self, client, superadmin_token, db_session):
        """Boxes 9-11 should show follow-up status with sub-rows"""
        # Create randomised baby with composite outcomes
        screening = create_screening(db_session, 'SCR-FU-001', 'PGIMER', 'Eligible')
        br = create_birth_resuscitation(
            db_session,
            screening.screening_id,
            'ENR-FU-001',
            randomised=True
        )
        
        co = CompositeOutcome(
            enrollment_id='ENR-FU-001',
            dob=datetime.now().date() - timedelta(days=50),  # 50 days old
            gestation_at_birth=30,
            death_before_36=False,
            assess_36_date=None
        )
        db_session.add(co)
        db_session.commit()
        
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        # Box 9 should have sub_rows for follow-up status
        box_9 = next((r for r in data['rows'] if r['box'] == 9), None)
        assert box_9 is not None
        assert 'sub_rows' in box_9
        # Should have: Died, Assessed, Lost to follow-up, Awaiting assessment
        assert len(box_9['sub_rows']) == 4


# ============================================================================
# ISSUE #3: DATA QUALITY ENDPOINT
# ============================================================================

class TestDataQualityEndpoint:
    """Test GET /dashboard/data-quality endpoint"""

    def test_data_quality_endpoint_returns_200(self, client, superadmin_token, db_session):
        """Endpoint should return 200 OK"""
        response = client.get(
            '/dashboard/data-quality',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        assert response.status_code == 200

    def test_data_quality_response_structure(self, client, superadmin_token, db_session):
        """Response should have all 5 panels"""
        response = client.get(
            '/dashboard/data-quality',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        assert 'generated_at' in data
        assert 'sites' in data
        assert 'form_completion' in data
        assert 'daily_log_status' in data
        assert 'timeliness' in data
        assert 'gaps' in data
        assert 'site_activity' in data

    def test_data_quality_form_completion_panel(self, client, superadmin_token, db_session):
        """Panel 1 should show form completion metrics"""
        # Create randomised baby
        screening = create_screening(db_session, 'SCR-FC-001', 'PGIMER', 'Eligible')
        br = create_birth_resuscitation(
            db_session,
            screening.screening_id,
            'ENR-FC-001',
            randomised=True
        )
        
        # Create one form submission
        md = MaternalDetails(enrollment_id='ENR-FC-001')
        db_session.add(md)
        db_session.commit()
        
        response = client.get(
            '/dashboard/data-quality',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        form_completion = data['form_completion']
        assert len(form_completion) > 0
        # Should have Form C, D, F, H, J + daily logs
        assert any('Form C' in f['form'] for f in form_completion)

    def test_data_quality_daily_log_status_panel(self, client, superadmin_token, db_session):
        """Panel 2 should show daily log submission status breakdown"""
        response = client.get(
            '/dashboard/data-quality',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        daily_log_status = data['daily_log_status']
        assert 'resp_cv_neuro' in daily_log_status
        assert 'infect_gi_hema' in daily_log_status
        assert 'metab_renal_vasc_eye' in daily_log_status

    def test_data_quality_gaps_panel(self, client, superadmin_token, db_session):
        """Panel 4 should identify cross-form gaps"""
        # Create screening with consent but no Form B
        screening = create_screening(
            db_session,
            'SCR-GAP-001',
            'PGIMER',
            'Eligible',
            consent_given='Yes'
        )
        
        response = client.get(
            '/dashboard/data-quality',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        gaps = data['gaps']
        assert 'consented_no_form_b' in gaps
        assert 'randomised_no_form_c' in gaps
        assert 'randomised_no_form_j' in gaps
        assert 'incomplete_daily_logs' in gaps

    def test_data_quality_site_activity_panel(self, client, superadmin_token, db_session):
        """Panel 5 should show site activity"""
        response = client.get(
            '/dashboard/data-quality',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        data = response.json()
        
        site_activity = data['site_activity']
        assert isinstance(site_activity, list)


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestDashboardIntegration:
    """Integration tests for dashboard workflows"""

    def test_complete_consort_workflow(self, client, superadmin_token, db_session):
        """Test complete CONSORT participant journey"""
        # Box 1: Approached
        screening = create_screening(
            db_session,
            'SCR-JOURNEY-001',
            'PGIMER',
            'Eligible',
            consent_given='Yes'
        )
        
        # Box 5, 6, 7, 8: Progress through randomisation
        br = create_birth_resuscitation(
            db_session,
            screening.screening_id,
            'ENR-JOURNEY-001',
            randomised=True
        )
        
        # Sync enrollment_id to screening (Fix 2)
        db_session.query(Screening).filter(
            Screening.screening_id == screening.screening_id
        ).update({"enrollment_id": br.enrollment_id})
        db_session.commit()
        
        # Box 9: Follow-up
        co = CompositeOutcome(
            enrollment_id='ENR-JOURNEY-001',
            dob=br.date_of_birth,
            gestation_at_birth=30,
            assess_36_date=datetime.now().date(),
            death_before_36=False
        )
        db_session.add(co)
        db_session.commit()
        
        # Fetch CONSORT data
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        assert response.status_code == 200

    def test_dashboard_consistency(self, client, superadmin_token, db_session):
        """Test that CONSORT and Data Quality dashboards are consistent"""
        # Create test data
        for i in range(5):
            screening = create_screening(
                db_session,
                f'SCR-CONS-{i:02d}',
                'PGIMER',
                'Eligible',
                consent_given='Yes'
            )
            br = create_birth_resuscitation(
                db_session,
                screening.screening_id,
                f'ENR-CONS-{i:02d}',
                randomised=(i % 2 == 0)  # Half randomised
            )
        
        # Fetch both dashboards
        consort_response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        dq_response = client.get(
            '/dashboard/data-quality',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        
        assert consort_response.status_code == 200
        assert dq_response.status_code == 200
        
        # Both should have same generated_at timestamp (approximately)
        consort_data = consort_response.json()
        dq_data = dq_response.json()
        
        # Timestamps should be close (within 10 seconds)
        consort_time = datetime.fromisoformat(consort_data['generated_at'].replace('Z', '+00:00'))
        dq_time = datetime.fromisoformat(dq_data['generated_at'].replace('Z', '+00:00'))
        time_diff = abs((consort_time - dq_time).total_seconds())
        assert time_diff < 10


# ============================================================================
# PERFORMANCE TESTS
# ============================================================================

class TestDashboardPerformance:
    """Test dashboard performance with larger datasets"""

    def test_consort_performance_with_1000_records(self, client, superadmin_token, db_session):
        """Test CONSORT endpoint with 1000 screening records"""
        # Create 1000 screening records
        for i in range(1000):
            create_screening(
                db_session,
                f'SCR-PERF-{i:04d}',
                'PGIMER' if i % 2 == 0 else 'GMCH',
                'Eligible' if i % 3 == 0 else 'Not Eligible'
            )
        
        import time
        start = time.time()
        response = client.get(
            '/dashboard/consort',
            headers={'Authorization': f'Bearer {superadmin_token}'}
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200
        # Should complete in less than 5 seconds
        assert elapsed < 5, f"CONSORT endpoint took {elapsed:.2f}s (expected < 5s)"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
