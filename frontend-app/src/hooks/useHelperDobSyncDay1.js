import { useEffect, useRef } from "react";
import api from "../api/axios";
import { toDateOnlyValue } from "../utils/datetime";

/** Normalize API / Form B date_of_birth to YYYY-MM-DD for date inputs. */
export function normalizeHelperDob(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return toDateOnlyValue(d);
}

/** Partial Form B update — backend PUT uses exclude_unset; only sends DOB. */
export async function patchFormBDateOfBirth(enrollmentId, dateYmd) {
  const norm = normalizeHelperDob(dateYmd);
  if (!enrollmentId || !norm) return;
  await api.put(`/birth-resuscitation/${enrollmentId}`, { date_of_birth: norm });
}

/**
 * When DOB changes and Day 1 is not locked, mirror DOB → day1Date (+ backend day1-date).
 * DOB is the only nurse-editable calendar anchor; NICU Day 1..N derive from it.
 */
export function useHelperDobSyncDay1({
  enrollmentId,
  storageKeyPrefix,
  patientDob,
  day1Date,
  setDay1Date,
  day1DateLocked,
  setDay1DateSetBy,
  setDay1EditArmed,
  user,
  setMessage,
}) {
  const persistRef = useRef(false);

  useEffect(() => {
    const norm = normalizeHelperDob(patientDob);
    if (!norm || day1DateLocked) return;
    if (norm === day1Date) return;

    setDay1Date(norm);
    if (enrollmentId) {
      localStorage.setItem(`${storageKeyPrefix}_day1_${enrollmentId}`, norm);
    }

    if (persistRef.current) return;
    persistRef.current = true;
    (async () => {
      try {
        if (!enrollmentId) return;
        await api.put(`/nicu-admission/${enrollmentId}/day1-date`, { day1_date: norm });
        try {
          await patchFormBDateOfBirth(enrollmentId, norm);
        } catch (formBErr) {
          setMessage?.(
            "⚠️ Day 1 saved but Form B date of birth was not updated — " +
              (formBErr?.response?.data?.detail || "check Form B or try again"),
          );
        }
        setDay1DateSetBy?.(user?.username || user?.name || "");
        setDay1EditArmed?.(false);
      } catch (err) {
        setMessage?.(
          "⚠️ Could not save Day 1 Date — " +
            (err?.response?.data?.detail || "it may already be locked"),
        );
      } finally {
        persistRef.current = false;
      }
    })();
  }, [
    patientDob,
    day1DateLocked,
    enrollmentId,
    storageKeyPrefix,
    day1Date,
    setDay1Date,
    setDay1DateSetBy,
    setDay1EditArmed,
    user,
    setMessage,
  ]);
}
