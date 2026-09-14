import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isUsableEnrollmentId } from "../utils/enrollmentId";

/** Sends /form-c → /form-c/:enrollmentId (etc.) using the session patient. */
export default function EnrollmentFormRedirect({ basePath, formLabel = "this form" }) {
  const navigate = useNavigate();
  const raw = localStorage.getItem("current_enrollment_id");
  const eid = isUsableEnrollmentId(raw) ? String(raw).trim() : null;

  useEffect(() => {
    if (eid) navigate(`${basePath}/${eid}`, { replace: true });
  }, [basePath, eid, navigate]);

  if (eid) {
    return <div className="rcn-loading">Opening {formLabel}…</div>;
  }

  return (
    <div className="rcn-loading" style={{ padding: 24, maxWidth: 520, lineHeight: 1.5 }}>
      <p><strong>No enrollment ID for this patient.</strong></p>
      <p>
        Complete Form B (save with a valid enrollment ID or NR- placeholder) or open
        the baby from View Entries, then choose {formLabel} from the sidebar.
      </p>
    </div>
  );
}
