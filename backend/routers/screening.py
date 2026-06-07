from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models import Screening, User
from deps import get_current_user, get_db

router = APIRouter(prefix="/screenings", tags=["Screenings"])


@router.get("/{screening_id}")
def get_screening(
    screening_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    screening = db.query(Screening).filter(
        Screening.screening_id == screening_id
    ).first()

    if not screening:
        raise HTTPException(status_code=404, detail="Screening not found")
    if (current_user.role or "").lower() != "superadmin":
        if not current_user.site_name or screening.site_name != current_user.site_name:
            raise HTTPException(status_code=403, detail="Access denied for this site")

    return screening
