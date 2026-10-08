"""Shared checks for the primary and secondary mobile numbers.

Field names stay mother_contact / husband_contact (and contact_mother /
contact_husband on Form B). Only the rules and the messages change.
"""

from typing import Optional, Tuple

ERR_REQUIRED = "Required"
ERR_DIGITS = "Must be exactly 10 digits"
ERR_START = "Indian mobile must start with 6, 7, 8, or 9"
ERR_SAME = "Primary and secondary must not be the same number"


def mobile_number_error(
    value: Optional[str],
    *,
    required: bool,
    allow_partial: bool = False,
) -> Optional[str]:
    text = (value or "").strip()
    if not text:
        return ERR_REQUIRED if required else None
    if not text.isdigit() or len(text) != 10:
        if allow_partial and text.isdigit() and len(text) < 10:
            return None
        return ERR_DIGITS
    if text[0] not in "6789":
        return ERR_START
    return None


def mobile_pair_errors(
    primary: Optional[str],
    secondary: Optional[str],
    *,
    primary_required: bool,
    allow_partial: bool = False,
) -> Tuple[Optional[str], Optional[str]]:
    primary_error = mobile_number_error(
        primary, required=primary_required, allow_partial=allow_partial
    )
    secondary_error = mobile_number_error(
        secondary, required=False, allow_partial=allow_partial
    )
    primary_text = (primary or "").strip()
    secondary_text = (secondary or "").strip()
    # Compare only complete numbers so a draft can share a typed prefix.
    if (
        not primary_error
        and not secondary_error
        and len(primary_text) == 10
        and primary_text == secondary_text
    ):
        secondary_error = ERR_SAME
    return primary_error, secondary_error
