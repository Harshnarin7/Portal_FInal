/** Shared Form A / Form B mobile-number labels and checks. */

export const PRIMARY_MOBILE_LABEL = "17. Mobile number - Primary";
export const SECONDARY_MOBILE_LABEL = "Mobile number - Secondary";
export const FORM_B_PRIMARY_MOBILE_LABEL = "5. Mobile number - Primary";
export const FORM_B_SECONDARY_MOBILE_LABEL = "5. Mobile number - Secondary";

export const ERR_REQUIRED = "Required";
export const ERR_DIGITS = "Must be exactly 10 digits";
export const ERR_START = "Indian mobile must start with 6, 7, 8, or 9";
export const ERR_SAME = "Primary and secondary must not be the same number";

export function mobileNumberError(value, { required }) {
  const text = String(value || "").trim();
  if (!text) return required ? ERR_REQUIRED : "";
  if (!/^\d{10}$/.test(text)) return ERR_DIGITS;
  if (!/^[6-9]/.test(text)) return ERR_START;
  return "";
}

/** Primary is always required. Secondary is checked only when it has a value. */
export function mobilePairErrors(primary, secondary) {
  const primaryError = mobileNumberError(primary, { required: true });
  let secondaryError = mobileNumberError(secondary, { required: false });
  const primaryText = String(primary || "").trim();
  const secondaryText = String(secondary || "").trim();
  if (!primaryError && !secondaryError && primaryText && secondaryText && primaryText === secondaryText) {
    secondaryError = ERR_SAME;
  }
  return { primary: primaryError, secondary: secondaryError };
}
