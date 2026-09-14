import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const validScreeningId = (value) =>
  value && value !== "undefined" && value !== "null" ? String(value).trim() : null;

/** Sends /form-b → /form-b/:screeningId using the session patient. */
export default function ScreeningFormRedirect({ basePath, formLabel = "this form" }) {
  const navigate = useNavigate();
  const sid = validScreeningId(localStorage.getItem("current_screening_id"));

  useEffect(() => {
    if (sid) navigate(`${basePath}/${sid}`, { replace: true });
  }, [basePath, sid, navigate]);

  if (sid) {
    return <div className="rcn-loading">Opening {formLabel}…</div>;
  }

  return (
    <div className="rcn-loading" style={{ padding: 24, maxWidth: 520, lineHeight: 1.5 }}>
      <p><strong>No screening ID for this patient.</strong></p>
      <p>
        Start or open Form A for the baby, or pick the participant from View Entries,
        then open {formLabel} from the sidebar.
      </p>
    </div>
  );
}
