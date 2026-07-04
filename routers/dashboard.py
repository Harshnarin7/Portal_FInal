"""
Dashboard endpoints for trial monitoring:
- GET /dashboard/consort — CONSORT participant flow table (Issue #2)
- GET /dashboard/data-quality — Data quality indicators (Issue #3)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, text
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from db import get_db
from models import (
    Screening, BirthResuscitation, CompositeOutcome,
    MaternalDetails, PostnatalDay1, NICUAdmission, NeonatalMorbidities,
    RespCVNeuroDayLog, InfectGIHemaDayLog, MetabRenalVascEyeDayLog,
    CranialUSGRecord, AuditLog, User
)
from deps import get_current_user, is_superadmin
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# ============================================================================
# HELPER: Site Filtering
# ============================================================================

def get_site_filter(user: User):
    """Return site filter for superadmin (all) or site user (their site)."""
    if is_superadmin(user):
        return None  # No filter — see all
    return user.site_name


# ============================================================================
# CONSORT FLOW TABLE (Issue #2)
# ============================================================================

class CONSORTBox(BaseModel):
    box: int
    label: str
    overall: int
    by_site: Dict[str, int]
    sub_rows: Optional[List[Dict[str, Any]]] = None


class CONSORTResponse(BaseModel):
    generated_at: str
    sites: List[str]
    rows: List[CONSORTBox]


@router.get("/consort", response_model=CONSORTResponse)
def get_consort_flow(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    CONSORT participant flow table (Issue #2).
    
    Boxes 1–11 showing recruitment funnel from screening to follow-up.
    Superadmin sees all sites; site users see only their site + Overall.
    """
    
    generated_at = datetime.utcnow().isoformat() + "Z"
    site_filter = get_site_filter(current_user)
    
    # Get all sites for superadmin; just current site for site users
    if is_superadmin(current_user):
        all_sites = sorted([
            site[0] for site in db.query(Screening.site_name)
            .filter(Screening.is_deleted == False, Screening.site_name.isnot(None))
            .distinct()
            .all()
            if site[0] and site[0].strip()
        ])
    else:
        all_sites = [current_user.site_name] if current_user.site_name else []
    
    # ========================================================================
    # BOX 1: Approached for screening (all non-deleted from real sites)
    # ========================================================================
    
    def count_box_1(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != ''
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_1_overall = count_box_1()
    box_1_by_site = {site: count_box_1(site) for site in all_sites}
    
    # ========================================================================
    # BOX 2: Not screened (pre-assessment barriers)
    # ========================================================================
    
    def count_box_2(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            or_(
                Screening.exclusion_reasons.like('%Insufficient time%'),
                Screening.exclusion_reasons.like('%Forego resuscitation%'),
                Screening.exclusion_reasons.like('%IUFD%')
            )
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    def count_box_2a(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.exclusion_reasons.like('%Insufficient time%')
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    def count_box_2b(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.exclusion_reasons.like('%Forego resuscitation%')
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    def count_box_2c(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.exclusion_reasons.like('%IUFD%')
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_2_overall = count_box_2()
    box_2_by_site = {site: count_box_2(site) for site in all_sites}
    
    # ========================================================================
    # BOX 3: Screened for eligibility (Box 1 - Box 2)
    # ========================================================================
    
    box_3_overall = box_1_overall - box_2_overall
    box_3_by_site = {site: box_1_by_site[site] - box_2_by_site[site] for site in all_sites}
    
    # ========================================================================
    # BOX 4a: Excluded (GA outside 25+0 to 31+6 weeks)
    # ========================================================================
    
    def count_box_4a(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.screening_status == 'Not Eligible',
            ~or_(
                Screening.exclusion_reasons.like('%Insufficient time%'),
                Screening.exclusion_reasons.like('%Forego resuscitation%'),
                Screening.exclusion_reasons.like('%IUFD%'),
                Screening.exclusion_reasons.like('%Structural anomaly%'),
                Screening.exclusion_reasons.like('%Fetal hydrops%')
            )
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_4a_overall = count_box_4a()
    box_4a_by_site = {site: count_box_4a(site) for site in all_sites}
    
    # ========================================================================
    # BOX 4b: Excluded (met inclusion but had exclusion criteria)
    # ========================================================================
    
    def count_box_4b(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.screening_status == 'Not Eligible',
            or_(
                Screening.exclusion_reasons.like('%Structural anomaly%'),
                Screening.exclusion_reasons.like('%Fetal hydrops%')
            )
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    def count_box_4b_structural(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.screening_status == 'Not Eligible',
            Screening.exclusion_reasons.like('%Structural anomaly%')
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    def count_box_4b_hydrops(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.screening_status == 'Not Eligible',
            Screening.exclusion_reasons.like('%Fetal hydrops%')
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_4b_overall = count_box_4b()
    box_4b_by_site = {site: count_box_4b(site) for site in all_sites}
    
    # ========================================================================
    # BOX 5: Eligible
    # ========================================================================
    
    def count_box_5(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.screening_status == 'Eligible'
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_5_overall = count_box_5()
    box_5_by_site = {site: count_box_5(site) for site in all_sites}
    
    # ========================================================================
    # BOX 6: Refused consent
    # ========================================================================
    
    def count_box_6(site_name=None):
        q = db.query(func.count(Screening.id)).filter(
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.screening_status == 'Eligible',
            or_(Screening.consent_given.isnull(), Screening.consent_given != 'Yes'),
            ~BirthResuscitation.enrollment_id.isnot(None)
        ).outerjoin(
            BirthResuscitation,
            BirthResuscitation.screening_id == Screening.screening_id
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_6_overall = count_box_6()
    box_6_by_site = {site: count_box_6(site) for site in all_sites}
    
    # ========================================================================
    # BOX 7: Consented but not randomised
    # ========================================================================
    
    def count_box_7(site_name=None):
        q = db.query(func.count(BirthResuscitation.id)).filter(
            BirthResuscitation.screening_id.isnot(None),
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.consent_given == 'Yes',
            or_(BirthResuscitation.randomised == False, BirthResuscitation.randomised.isnull())
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    def count_box_7_resus_failure(site_name=None):
        q = db.query(func.count(BirthResuscitation.id)).filter(
            BirthResuscitation.screening_id.isnot(None),
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.consent_given == 'Yes',
            or_(BirthResuscitation.randomised == False, BirthResuscitation.randomised.isnull()),
            BirthResuscitation.resus_failure == True
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    def count_box_7_exit_gas(site_name=None):
        q = db.query(func.count(BirthResuscitation.id)).filter(
            BirthResuscitation.screening_id.isnot(None),
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            Screening.consent_given == 'Yes',
            or_(BirthResuscitation.randomised == False, BirthResuscitation.randomised.isnull()),
            BirthResuscitation.reason_exit_trial_gas.isnot(None),
            BirthResuscitation.reason_exit_trial_gas != ''
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_7_overall = count_box_7()
    box_7_by_site = {site: count_box_7(site) for site in all_sites}
    
    # ========================================================================
    # BOX 8: Randomised (denominator for follow-up)
    # ========================================================================
    
    def count_box_8(site_name=None):
        q = db.query(func.count(BirthResuscitation.id)).filter(
            BirthResuscitation.screening_id.isnot(None),
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != '',
            BirthResuscitation.randomised == True
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            q = q.filter(Screening.site_name == site_name)
        return q.scalar() or 0
    
    box_8_overall = count_box_8()
    box_8_by_site = {site: count_box_8(site) for site in all_sites}
    
    # ========================================================================
    # BOXES 9, 10, 11: Follow-up status at 36w, 40w, 44w PMA
    # ========================================================================
    
    def get_expected_pma_dates(br):
        """Compute expected assessment dates for a birth record."""
        if not br.date_of_birth or br.gestation_weeks is None:
            return None, None, None
        
        dob = br.date_of_birth if isinstance(br.date_of_birth, datetime) else datetime.combine(br.date_of_birth, datetime.min.time())
        gest_days = (br.gestation_weeks * 7) + (br.gestation_days or 0)
        
        expected_36w = dob + timedelta(days=(36 * 7 - gest_days))
        expected_40w = dob + timedelta(days=(40 * 7 - gest_days))
        expected_44w = dob + timedelta(days=(44 * 7 - gest_days))
        
        return expected_36w, expected_40w, expected_44w
    
    def count_box_9_status(status, site_name=None):
        """Count Box 9 follow-up status at 36w PMA."""
        randomised = db.query(BirthResuscitation).filter(
            BirthResuscitation.randomised == True,
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != ''
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            randomised = randomised.filter(Screening.site_name == site_name)
        
        randomised_babies = randomised.all()
        count = 0
        now = datetime.utcnow()
        
        for br in randomised_babies:
            co = db.query(CompositeOutcome).filter(
                CompositeOutcome.enrollment_id == br.enrollment_id
            ).first()
            
            if not co:
                continue
            
            expected_36w, _, _ = get_expected_pma_dates(br)
            if not expected_36w:
                continue
            
            if status == 'died':
                if co.death_before_36:
                    count += 1
            elif status == 'assessed':
                if co.assess_36_date and not co.death_before_36:
                    count += 1
            elif status == 'ltfu':
                if not co.assess_36_date and not co.death_before_36 and now > (expected_36w + timedelta(days=28)):
                    count += 1
            elif status == 'awaiting':
                if not co.assess_36_date and not co.death_before_36 and now <= (expected_36w + timedelta(days=28)):
                    count += 1
        
        return count
    
    # Similar helpers for Box 10 and 11
    def count_box_10_status(status, site_name=None):
        """Count Box 10 follow-up status at 40w PMA (denominator = alive after Box 9)."""
        randomised = db.query(BirthResuscitation).filter(
            BirthResuscitation.randomised == True,
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != ''
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            randomised = randomised.filter(Screening.site_name == site_name)
        
        randomised_babies = randomised.all()
        count = 0
        now = datetime.utcnow()
        
        for br in randomised_babies:
            co = db.query(CompositeOutcome).filter(
                CompositeOutcome.enrollment_id == br.enrollment_id
            ).first()
            
            if not co or co.death_before_36:
                continue
            
            _, expected_40w, _ = get_expected_pma_dates(br)
            if not expected_40w:
                continue
            
            if status == 'died':
                if co.death_36_40:
                    count += 1
            elif status == 'assessed':
                if co.assess_40_date and not co.death_36_40:
                    count += 1
            elif status == 'ltfu':
                if not co.assess_40_date and not co.death_36_40 and now > (expected_40w + timedelta(days=28)):
                    count += 1
            elif status == 'awaiting':
                if not co.assess_40_date and not co.death_36_40 and now <= (expected_40w + timedelta(days=28)):
                    count += 1
        
        return count
    
    def count_box_11_status(status, site_name=None):
        """Count Box 11 follow-up status at 44w PMA (denominator = alive after Box 10)."""
        randomised = db.query(BirthResuscitation).filter(
            BirthResuscitation.randomised == True,
            Screening.is_deleted == False,
            Screening.site_name.isnot(None),
            Screening.site_name != ''
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            randomised = randomised.filter(Screening.site_name == site_name)
        
        randomised_babies = randomised.all()
        count = 0
        now = datetime.utcnow()
        
        for br in randomised_babies:
            co = db.query(CompositeOutcome).filter(
                CompositeOutcome.enrollment_id == br.enrollment_id
            ).first()
            
            if not co or co.death_before_36 or co.death_36_40:
                continue
            
            _, _, expected_44w = get_expected_pma_dates(br)
            if not expected_44w:
                continue
            
            if status == 'died':
                if co.death_40_44:
                    count += 1
            elif status == 'assessed':
                if co.assess_44_date and not co.death_40_44:
                    count += 1
            elif status == 'ltfu':
                if not co.assess_44_date and not co.death_40_44 and now > (expected_44w + timedelta(days=28)):
                    count += 1
            elif status == 'awaiting':
                if not co.assess_44_date and not co.death_40_44 and now <= (expected_44w + timedelta(days=28)):
                    count += 1
        
        return count
    
    # ========================================================================
    # BUILD RESPONSE
    # ========================================================================
    
    rows = [
        CONSORTBox(
            box=1,
            label="Approached for screening",
            overall=box_1_overall,
            by_site=box_1_by_site
        ),
        CONSORTBox(
            box=2,
            label="Not screened",
            overall=box_2_overall,
            by_site=box_2_by_site,
            sub_rows=[
                {
                    "label": "Insufficient time",
                    "overall": count_box_2a(),
                    "by_site": {site: count_box_2a(site) for site in all_sites}
                },
                {
                    "label": "Decision to forego resuscitation",
                    "overall": count_box_2b(),
                    "by_site": {site: count_box_2b(site) for site in all_sites}
                },
                {
                    "label": "IUFD at presentation",
                    "overall": count_box_2c(),
                    "by_site": {site: count_box_2c(site) for site in all_sites}
                }
            ]
        ),
        CONSORTBox(
            box=3,
            label="Screened for eligibility",
            overall=box_3_overall,
            by_site=box_3_by_site
        ),
        CONSORTBox(
            box=4,
            label="Excluded after screening",
            overall=box_4a_overall + box_4b_overall,
            by_site={site: box_4a_by_site[site] + box_4b_by_site[site] for site in all_sites},
            sub_rows=[
                {
                    "label": "Did not meet inclusion criteria (GA)",
                    "overall": box_4a_overall,
                    "by_site": box_4a_by_site
                },
                {
                    "label": "Met inclusion but had exclusion criteria",
                    "overall": box_4b_overall,
                    "by_site": box_4b_by_site,
                    "sub_items": [
                        {
                            "label": "Structural anomaly",
                            "overall": count_box_4b_structural(),
                            "by_site": {site: count_box_4b_structural(site) for site in all_sites}
                        },
                        {
                            "label": "Fetal hydrops",
                            "overall": count_box_4b_hydrops(),
                            "by_site": {site: count_box_4b_hydrops(site) for site in all_sites}
                        }
                    ]
                }
            ]
        ),
        CONSORTBox(
            box=5,
            label="Eligible",
            overall=box_5_overall,
            by_site=box_5_by_site
        ),
        CONSORTBox(
            box=6,
            label="Refused consent",
            overall=box_6_overall,
            by_site=box_6_by_site
        ),
        CONSORTBox(
            box=7,
            label="Consented but not randomised",
            overall=box_7_overall,
            by_site=box_7_by_site,
            sub_rows=[
                {
                    "label": "Resuscitation failure",
                    "overall": count_box_7_resus_failure(),
                    "by_site": {site: count_box_7_resus_failure(site) for site in all_sites}
                },
                {
                    "label": "Exited trial gas",
                    "overall": count_box_7_exit_gas(),
                    "by_site": {site: count_box_7_exit_gas(site) for site in all_sites}
                }
            ]
        ),
        CONSORTBox(
            box=8,
            label="Randomised",
            overall=box_8_overall,
            by_site=box_8_by_site
        ),
        CONSORTBox(
            box=9,
            label="Status at 36 weeks PMA",
            overall=box_8_overall,  # Denominator is all randomised
            by_site=box_8_by_site,
            sub_rows=[
                {
                    "label": "Died before 36w",
                    "overall": count_box_9_status('died'),
                    "by_site": {site: count_box_9_status('died', site) for site in all_sites}
                },
                {
                    "label": "Assessed at 36w",
                    "overall": count_box_9_status('assessed'),
                    "by_site": {site: count_box_9_status('assessed', site) for site in all_sites}
                },
                {
                    "label": "Lost to follow-up",
                    "overall": count_box_9_status('ltfu'),
                    "by_site": {site: count_box_9_status('ltfu', site) for site in all_sites}
                },
                {
                    "label": "Awaiting assessment",
                    "overall": count_box_9_status('awaiting'),
                    "by_site": {site: count_box_9_status('awaiting', site) for site in all_sites}
                }
            ]
        ),
        CONSORTBox(
            box=10,
            label="Status at 40 weeks PMA",
            overall=box_8_overall,
            by_site=box_8_by_site,
            sub_rows=[
                {
                    "label": "Died between 36w and 40w",
                    "overall": count_box_10_status('died'),
                    "by_site": {site: count_box_10_status('died', site) for site in all_sites}
                },
                {
                    "label": "Assessed at 40w",
                    "overall": count_box_10_status('assessed'),
                    "by_site": {site: count_box_10_status('assessed', site) for site in all_sites}
                },
                {
                    "label": "Lost to follow-up",
                    "overall": count_box_10_status('ltfu'),
                    "by_site": {site: count_box_10_status('ltfu', site) for site in all_sites}
                },
                {
                    "label": "Awaiting assessment",
                    "overall": count_box_10_status('awaiting'),
                    "by_site": {site: count_box_10_status('awaiting', site) for site in all_sites}
                }
            ]
        ),
        CONSORTBox(
            box=11,
            label="Status at 44 weeks PMA",
            overall=box_8_overall,
            by_site=box_8_by_site,
            sub_rows=[
                {
                    "label": "Died between 40w and 44w",
                    "overall": count_box_11_status('died'),
                    "by_site": {site: count_box_11_status('died', site) for site in all_sites}
                },
                {
                    "label": "Assessed at 44w",
                    "overall": count_box_11_status('assessed'),
                    "by_site": {site: count_box_11_status('assessed', site) for site in all_sites}
                },
                {
                    "label": "Lost to follow-up",
                    "overall": count_box_11_status('ltfu'),
                    "by_site": {site: count_box_11_status('ltfu', site) for site in all_sites}
                },
                {
                    "label": "Awaiting assessment",
                    "overall": count_box_11_status('awaiting'),
                    "by_site": {site: count_box_11_status('awaiting', site) for site in all_sites}
                }
            ]
        )
    ]
    
    # Filter by-site if site user
    if not is_superadmin(current_user) and current_user.site_name:
        for row in rows:
            row.by_site = {
                "Overall": row.overall,
                current_user.site_name: row.by_site.get(current_user.site_name, 0)
            }
    
    return CONSORTResponse(
        generated_at=generated_at,
        sites=all_sites,
        rows=rows
    )


# ============================================================================
# DATA QUALITY DASHBOARD (Issue #3)
# ============================================================================

class FormCompletionMetric(BaseModel):
    form: str
    overall: Dict[str, int]
    by_site: Optional[Dict[str, Dict[str, int]]] = None


class DailyLogStatusMetric(BaseModel):
    log_type: str
    overall: Dict[str, int]
    by_site: Optional[Dict[str, Dict[str, int]]] = None


class TimelinessMetric(BaseModel):
    form: str
    overall: Dict[str, float]
    by_site: Optional[Dict[str, Dict[str, float]]] = None


class GapRecord(BaseModel):
    identifier: str
    site: str
    date: Optional[str] = None
    details: Optional[str] = None


class SiteActivityRecord(BaseModel):
    site: str
    last_entry_at: Optional[str] = None
    weekly_counts: Optional[Dict[str, int]] = None
    status: str  # "active", "inactive_14d", "inactive_28d"


class DataQualityResponse(BaseModel):
    generated_at: str
    sites: List[str]
    form_completion: List[FormCompletionMetric]
    daily_log_status: Dict[str, DailyLogStatusMetric]
    timeliness: List[TimelinessMetric]
    gaps: Dict[str, List[GapRecord]]
    site_activity: List[SiteActivityRecord]


@router.get("/data-quality", response_model=DataQualityResponse)
def get_data_quality(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Data Quality Indicators (Issue #3).
    
    Five panels: form completion, daily log status, timeliness, cross-form gaps, site activity.
    """
    
    generated_at = datetime.utcnow().isoformat() + "Z"
    site_filter = get_site_filter(current_user)
    
    # Get all sites
    if is_superadmin(current_user):
        all_sites = sorted([
            site[0] for site in db.query(Screening.site_name)
            .filter(Screening.is_deleted == False, Screening.site_name.isnot(None))
            .distinct()
            .all()
            if site[0] and site[0].strip()
        ])
    else:
        all_sites = [current_user.site_name] if current_user.site_name else []
    
    # ========================================================================
    # PANEL 1: FORM COMPLETION MATRIX
    # ========================================================================
    
    def get_form_completion_stats(site_name=None):
        # Base query for randomised
        base = db.query(BirthResuscitation).filter(
            BirthResuscitation.randomised == True,
            Screening.is_deleted == False
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            base = base.filter(Screening.site_name == site_name)
        
        randomised_count = base.count()
        if randomised_count == 0:
            return {}
        
        stats = {}
        
        # Form C — Maternal Details
        form_c = base.join(
            MaternalDetails,
            MaternalDetails.enrollment_id == BirthResuscitation.enrollment_id,
            isouter=True
        ).filter(MaternalDetails.id.isnot(None)).count()
        stats['Form C'] = {"expected": randomised_count, "present": form_c}
        
        # Form D — Postnatal Day 1
        form_d = base.join(
            PostnatalDay1,
            PostnatalDay1.enrollment_id == BirthResuscitation.enrollment_id,
            isouter=True
        ).filter(PostnatalDay1.id.isnot(None)).count()
        stats['Form D (Day 1)'] = {"expected": randomised_count, "present": form_d}
        
        # Form D — NICU Admission
        form_nicu = base.join(
            NICUAdmission,
            NICUAdmission.enrollment_id == BirthResuscitation.enrollment_id,
            isouter=True
        ).filter(NICUAdmission.id.isnot(None)).count()
        stats['Form D (NICU)'] = {"expected": randomised_count, "present": form_nicu}
        
        # Form F — Neonatal Morbidities
        form_f = base.join(
            NeonatalMorbidities,
            NeonatalMorbidities.enrollment_id == BirthResuscitation.enrollment_id,
            isouter=True
        ).filter(NeonatalMorbidities.id.isnot(None)).count()
        stats['Form F'] = {"expected": randomised_count, "present": form_f}
        
        # Form H — Cranial USG
        form_h = base.join(
            CranialUSGRecord,
            CranialUSGRecord.enrollment_id == BirthResuscitation.enrollment_id,
            isouter=True
        ).filter(CranialUSGRecord.id.isnot(None)).count()
        stats['Form H'] = {"expected": randomised_count, "present": form_h}
        
        # Form J — Composite Outcomes
        form_j = base.join(
            CompositeOutcome,
            CompositeOutcome.enrollment_id == BirthResuscitation.enrollment_id,
            isouter=True
        ).filter(CompositeOutcome.id.isnot(None)).count()
        stats['Form J'] = {"expected": randomised_count, "present": form_j}
        
        # Daily logs (days 1–7 per randomised baby)
        expected_daily = randomised_count * 7
        
        resp_logs = db.query(func.count(RespCVNeuroDayLog.id)).filter(
            RespCVNeuroDayLog.nicu_day.between(1, 7),
            BirthResuscitation.randomised == True,
            Screening.is_deleted == False
        ).join(
            BirthResuscitation,
            BirthResuscitation.enrollment_id == RespCVNeuroDayLog.enrollment_id
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            resp_logs = resp_logs.filter(Screening.site_name == site_name)
        stats['Resp/CV/Neuro logs'] = {"expected": expected_daily, "present": resp_logs.scalar() or 0}
        
        infect_logs = db.query(func.count(InfectGIHemaDayLog.id)).filter(
            InfectGIHemaDayLog.nicu_day.between(1, 7),
            BirthResuscitation.randomised == True,
            Screening.is_deleted == False
        ).join(
            BirthResuscitation,
            BirthResuscitation.enrollment_id == InfectGIHemaDayLog.enrollment_id
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            infect_logs = infect_logs.filter(Screening.site_name == site_name)
        stats['Infect/GI/Hema logs'] = {"expected": expected_daily, "present": infect_logs.scalar() or 0}
        
        metab_logs = db.query(func.count(MetabRenalVascEyeDayLog.id)).filter(
            MetabRenalVascEyeDayLog.nicu_day.between(1, 7),
            BirthResuscitation.randomised == True,
            Screening.is_deleted == False
        ).join(
            BirthResuscitation,
            BirthResuscitation.enrollment_id == MetabRenalVascEyeDayLog.enrollment_id
        ).join(
            Screening,
            Screening.screening_id == BirthResuscitation.screening_id
        )
        if site_name:
            metab_logs = metab_logs.filter(Screening.site_name == site_name)
        stats['Metab/Renal/Vasc/Eye logs'] = {"expected": expected_daily, "present": metab_logs.scalar() or 0}
        
        return stats
    
    # Overall form completion
    form_completion_overall = get_form_completion_stats()
    form_completion_by_site = {site: get_form_completion_stats(site) for site in all_sites}
    
    form_completion_rows = [
        FormCompletionMetric(
            form=form_name,
            overall=form_completion_overall.get(form_name, {"expected": 0, "present": 0}),
            by_site={site: form_completion_by_site[site].get(form_name, {"expected": 0, "present": 0}) for site in all_sites}
        )
        for form_name in form_completion_overall.keys()
    ]
    
    # ========================================================================
    # PANEL 2: DAILY LOG SUBMISSION STATUS
    # ========================================================================
    
    def get_daily_log_status(log_type, site_name=None):
        """Get submission status breakdown for a daily log type."""
        if log_type == 'resp_cv_neuro':
            model = RespCVNeuroDayLog
        elif log_type == 'infect_gi_hema':
            model = InfectGIHemaDayLog
        elif log_type == 'metab_renal_vasc_eye':
            model = MetabRenalVascEyeDayLog
        else:
            return {}
        
        statuses = ['empty', 'draft', 'complete', 'submitted', 'late']
        result = {status: 0 for status in statuses}
        
        for status in statuses:
            q = db.query(func.count(model.id)).filter(
                model.nicu_day.between(1, 7),
                model.submission_status == status
            )
            if site_name:
                q = q.filter(model.enrollment_id.in_(
                    db.query(BirthResuscitation.enrollment_id).filter(
                        BirthResuscitation.randomised == True,
                        Screening.site_name == site_name,
                        Screening.is_deleted == False
                    ).join(
                        Screening,
                        Screening.screening_id == BirthResuscitation.screening_id
                    )
                ))
            result[status] = q.scalar() or 0
        
        return result
    
    daily_log_status = {
        'resp_cv_neuro': DailyLogStatusMetric(
            log_type='Resp/CV/Neuro',
            overall=get_daily_log_status('resp_cv_neuro'),
            by_site={site: get_daily_log_status('resp_cv_neuro', site) for site in all_sites}
        ),
        'infect_gi_hema': DailyLogStatusMetric(
            log_type='Infect/GI/Hema',
            overall=get_daily_log_status('infect_gi_hema'),
            by_site={site: get_daily_log_status('infect_gi_hema', site) for site in all_sites}
        ),
        'metab_renal_vasc_eye': DailyLogStatusMetric(
            log_type='Metab/Renal/Vasc/Eye',
            overall=get_daily_log_status('metab_renal_vasc_eye'),
            by_site={site: get_daily_log_status('metab_renal_vasc_eye', site) for site in all_sites}
        )
    }
    
    # ========================================================================
    # PANEL 3: DATA ENTRY TIMELINESS
    # ========================================================================
    
    def get_timeliness_stats(form, site_name=None):
        """Calculate median lag (days) from event to entry."""
        # Form A: screening_datetime to created_at
        if form == 'Form A':
            q = db.query(
                func.percentile_cont(0.5).within_group(
                    (func.extract('epoch', (Screening.created_at - Screening.screening_datetime)) / 86400).cast(float)
                ).label('median'),
                func.percentile_cont(0.25).within_group(
                    (func.extract('epoch', (Screening.created_at - Screening.screening_datetime)) / 86400).cast(float)
                ).label('p25'),
                func.percentile_cont(0.75).within_group(
                    (func.extract('epoch', (Screening.created_at - Screening.screening_datetime)) / 86400).cast(float)
                ).label('p75')
            ).filter(
                Screening.is_deleted == False,
                Screening.screening_datetime.isnot(None),
                Screening.created_at.isnot(None)
            )
            if site_name:
                q = q.filter(Screening.site_name == site_name)
            result = q.first()
            return {
                "median_lag_days": float(result[0]) if result[0] else 0,
                "p25": float(result[1]) if result[1] else 0,
                "p75": float(result[2]) if result[2] else 0
            } if result else {"median_lag_days": 0, "p25": 0, "p75": 0}
        
        # Form B: date_of_birth to created_at
        elif form == 'Form B':
            q = db.query(
                func.percentile_cont(0.5).within_group(
                    (func.extract('epoch', (BirthResuscitation.created_at - func.cast(BirthResuscitation.date_of_birth, type_=type(datetime)))) / 86400).cast(float)
                ).label('median'),
            ).filter(
                BirthResuscitation.date_of_birth.isnot(None),
                BirthResuscitation.created_at.isnot(None),
                Screening.is_deleted == False
            ).join(
                Screening,
                Screening.screening_id == BirthResuscitation.screening_id
            )
            if site_name:
                q = q.filter(Screening.site_name == site_name)
            result = q.first()
            return {
                "median_lag_days": float(result[0]) if result and result[0] else 0,
                "p25": 0,
                "p75": 0
            }
        
        return {"median_lag_days": 0, "p25": 0, "p75": 0}
    
    timeliness_rows = [
        TimelinessMetric(
            form='Form A (Screening)',
            overall=get_timeliness_stats('Form A'),
            by_site={site: get_timeliness_stats('Form A', site) for site in all_sites}
        ),
        TimelinessMetric(
            form='Form B (Birth Resus)',
            overall=get_timeliness_stats('Form B'),
            by_site={site: get_timeliness_stats('Form B', site) for site in all_sites}
        )
    ]
    
    # ========================================================================
    # PANEL 4: CROSS-FORM GAPS
    # ========================================================================
    
    # Gap 1: Consented but no Form B
    gap_1_records = []
    consented = db.query(Screening).filter(
        Screening.consent_given == 'Yes',
        Screening.is_deleted == False
    )
    if not is_superadmin(current_user):
        consented = consented.filter(Screening.site_name == current_user.site_name)
    
    for screening in consented.all():
        birth = db.query(BirthResuscitation).filter(
            BirthResuscitation.screening_id == screening.screening_id
        ).first()
        if not birth:
            gap_1_records.append(GapRecord(
                identifier=screening.screening_id,
                site=screening.site_name or '',
                date=screening.consent_datetime.isoformat() if screening.consent_datetime else None
            ))
    
    # Gap 2: Randomised but no Form C
    gap_2_records = []
    randomised = db.query(BirthResuscitation).filter(
        BirthResuscitation.randomised == True,
        Screening.is_deleted == False
    ).join(
        Screening,
        Screening.screening_id == BirthResuscitation.screening_id
    )
    if not is_superadmin(current_user):
        randomised = randomised.filter(Screening.site_name == current_user.site_name)
    
    for birth in randomised.all():
        maternal = db.query(MaternalDetails).filter(
            MaternalDetails.enrollment_id == birth.enrollment_id
        ).first()
        if not maternal:
            gap_2_records.append(GapRecord(
                identifier=birth.enrollment_id,
                site=db.query(Screening).filter(Screening.screening_id == birth.screening_id).first().site_name or '',
                date=birth.date_of_birth.isoformat() if birth.date_of_birth else None
            ))
    
    # Gap 3: Randomised but no Form J
    gap_3_records = []
    for birth in randomised.all():
        outcome = db.query(CompositeOutcome).filter(
            CompositeOutcome.enrollment_id == birth.enrollment_id
        ).first()
        if not outcome:
            gap_3_records.append(GapRecord(
                identifier=birth.enrollment_id,
                site=db.query(Screening).filter(Screening.screening_id == birth.screening_id).first().site_name or '',
                date=birth.date_of_birth.isoformat() if birth.date_of_birth else None
            ))
    
    # Gap 4: Baby ≥7 days old but <7 daily log entries
    gap_4_records = []
    now = datetime.utcnow()
    for birth in randomised.all():
        if not birth.date_of_birth:
            continue
        dob = birth.date_of_birth if isinstance(birth.date_of_birth, datetime) else datetime.combine(birth.date_of_birth, datetime.min.time())
        if now >= dob + timedelta(days=7):
            rcn_days = db.query(func.count(RespCVNeuroDayLog.id)).filter(
                RespCVNeuroDayLog.enrollment_id == birth.enrollment_id,
                RespCVNeuroDayLog.nicu_day.between(1, 7)
            ).scalar() or 0
            
            if rcn_days < 7:
                gap_4_records.append(GapRecord(
                    identifier=birth.enrollment_id,
                    site=db.query(Screening).filter(Screening.screening_id == birth.screening_id).first().site_name or '',
                    date=birth.date_of_birth.isoformat(),
                    details=f"Resp/CV/Neuro: {rcn_days}/7 days"
                ))
    
    gaps = {
        'consented_no_form_b': gap_1_records[:50],  # Limit to first 50
        'randomised_no_form_c': gap_2_records[:50],
        'randomised_no_form_j': gap_3_records[:50],
        'incomplete_daily_logs': gap_4_records[:50]
    }
    
    # ========================================================================
    # PANEL 5: SITE ACTIVITY
    # ========================================================================
    
    site_activity_records = []
    for site in all_sites:
        # Last entry date
        last_entry = db.query(func.max(AuditLog.created_at)).filter(
            AuditLog.action == 'INSERT',
            AuditLog.created_at.isnot(None)
        ).scalar()
        
        # Weekly counts (last 4 weeks)
        four_weeks_ago = now - timedelta(days=28)
        weekly = db.query(
            func.date_trunc('week', AuditLog.created_at).label('week'),
            func.count(AuditLog.id).label('count')
        ).filter(
            AuditLog.action == 'INSERT',
            AuditLog.created_at >= four_weeks_ago
        ).group_by('week').order_by('week').all()
        
        weekly_counts = {
            w[0].isoformat() if w[0] else 'unknown': w[1] for w in weekly
        } if weekly else {}
        
        # Determine activity status
        if last_entry:
            days_ago = (now - last_entry).days
            status = 'active' if days_ago <= 7 else 'inactive_14d' if days_ago <= 14 else 'inactive_28d'
        else:
            status = 'inactive_28d'
        
        site_activity_records.append(SiteActivityRecord(
            site=site,
            last_entry_at=last_entry.isoformat() if last_entry else None,
            weekly_counts=weekly_counts,
            status=status
        ))
    
    return DataQualityResponse(
        generated_at=generated_at,
        sites=all_sites,
        form_completion=form_completion_rows,
        daily_log_status=daily_log_status,
        timeliness=timeliness_rows,
        gaps=gaps,
        site_activity=site_activity_records
    )
