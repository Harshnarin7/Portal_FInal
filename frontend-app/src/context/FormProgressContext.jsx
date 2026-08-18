// FormProgressContext.jsx — PORTAL Trial
// Sidebar completion must follow the *current* patient and backend truth.
// Never keep a previous enrolment's ticks (core OR helpers) after opening another.
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import api from "../api/axios";
import { isUsableEnrollmentId } from "../utils/enrollmentId";

const FormProgressContext = createContext();

/** Forms whose completion is authoritative from GET /enrollment-status */
const BACKEND_TRACKED = new Set(["form_a", "form_b", "form_c", "form_d", "form_e"]);

const validId = (value) =>
  value && value !== "undefined" && value !== "null" ? value : null;

function progressStorageKey(enrollmentId, screeningId) {
  if (enrollmentId) return `completedForms_${enrollmentId}`;
  if (screeningId) return `completedForms_screening_${screeningId}`;
  return null;
}

export function FormProgressProvider({ children }) {
  const [completedForms, setCompletedForms] = useState([]);
  const [isProgressLoaded, setIsProgressLoaded] = useState(false);
  const [progress, setProgress] = useState({
    form_a: false, form_b: false, form_c: false, form_d: false, form_e: false,
  });
  const [activeKey, setActiveKey] = useState(null);
  const fetchSeq = useRef(0);
  const skipNextPersist = useRef(false);
  // Enrollment we last trusted for local helper ticks — ignore cache written
  // under a different baby's id (cross-patient leak).
  const helpersTrustedFor = useRef(null);

  const fetchProgressRef = useRef(null);

  const loadFromStorage = useCallback(() => {
    const rawEid = localStorage.getItem("current_enrollment_id");
    const enrollmentId = isUsableEnrollmentId(rawEid) ? String(rawEid).trim() : null;
    const screeningId = validId(localStorage.getItem("current_screening_id"));
    const key = progressStorageKey(enrollmentId, screeningId);

    setActiveKey(key);

    if (!enrollmentId && !screeningId) {
      skipNextPersist.current = true;
      helpersTrustedFor.current = null;
      setCompletedForms([]);
      setProgress({ form_a: false, form_b: false, form_c: false, form_d: false, form_e: false });
      setIsProgressLoaded(true);
      return;
    }

    if (!enrollmentId) {
      // Pre-enrolment: only Form A. Never show helpers/C/D/E from a polluted cache.
      skipNextPersist.current = true;
      helpersTrustedFor.current = null;
      setCompletedForms(["form_a"]);
      setProgress({ form_a: true, form_b: false, form_c: false, form_d: false, form_e: false });
      setIsProgressLoaded(true);
      return;
    }

    // Same enrollment: keep current ticks while we refresh. Wiping to [] on every
    // Form A reload (storage event with unchanged eid) left the sidebar at 0/20
    // because fetchProgress did not re-run when enrollmentId was unchanged.
    skipNextPersist.current = true;
    if (helpersTrustedFor.current !== enrollmentId) {
      helpersTrustedFor.current = null;
      setCompletedForms(["form_a"]);
      setProgress({ form_a: true, form_b: false, form_c: false, form_d: false, form_e: false });
    }
    setIsProgressLoaded(true);
    queueMicrotask(() => fetchProgressRef.current?.(enrollmentId));
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || e.key === "current_enrollment_id" || e.key === "current_screening_id") {
        loadFromStorage();
        return;
      }
      const rawEid = localStorage.getItem("current_enrollment_id");
      const eid = isUsableEnrollmentId(rawEid) ? String(rawEid).trim() : null;
      const sid = validId(localStorage.getItem("current_screening_id"));
      const key = progressStorageKey(eid, sid);
      if (key && e.key === key) loadFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isProgressLoaded || !activeKey) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    // Never write ticks onto a key that no longer matches the session patient.
    const rawEid = localStorage.getItem("current_enrollment_id");
    const enrollmentId = isUsableEnrollmentId(rawEid) ? String(rawEid).trim() : null;
    const screeningId = validId(localStorage.getItem("current_screening_id"));
    const expected = progressStorageKey(enrollmentId, screeningId);
    if (!expected || expected !== activeKey) return;
    localStorage.setItem(activeKey, JSON.stringify(completedForms));
  }, [completedForms, isProgressLoaded, activeKey]);

  const markFormCompleted = useCallback((formId) => {
    setCompletedForms((prev) => {
      if (prev.includes(formId)) return prev;
      const updated = [...prev, formId];
      const rawEid = localStorage.getItem("current_enrollment_id");
      const enrollmentId = isUsableEnrollmentId(rawEid) ? String(rawEid).trim() : null;
      const screeningId = validId(localStorage.getItem("current_screening_id"));
      const key = progressStorageKey(enrollmentId, screeningId);
      if (key) {
        localStorage.setItem(key, JSON.stringify(updated));
        setActiveKey(key);
        skipNextPersist.current = true;
        if (enrollmentId) helpersTrustedFor.current = enrollmentId;
      }
      // Do not dispatch storage here — that re-ran loadFromStorage and wiped
      // the tick we just added before fetchProgress could re-merge it.
      return updated;
    });
  }, []);

  const resetProgress = useCallback(() => {
    const enrollmentId = validId(localStorage.getItem("current_enrollment_id"));
    const screeningId = validId(localStorage.getItem("current_screening_id"));
    const key = progressStorageKey(enrollmentId, screeningId);
    if (key) localStorage.removeItem(key);

    skipNextPersist.current = true;
    helpersTrustedFor.current = null;
    setCompletedForms([]);
    setProgress({ form_a: false, form_b: false, form_c: false, form_d: false, form_e: false });
    setActiveKey(null);
    setIsProgressLoaded(true);
  }, []);

  const fetchProgress = useCallback(async (enrollmentId) => {
    if (!isUsableEnrollmentId(enrollmentId)) return;
    const seq = ++fetchSeq.current;
    try {
      const res = await api.get(`/enrollment-status/${enrollmentId}`);
      if (seq !== fetchSeq.current) return;
      const rawCurrent = localStorage.getItem("current_enrollment_id");
      const currentEid = isUsableEnrollmentId(rawCurrent) ? String(rawCurrent).trim() : null;
      if (currentEid && currentEid !== enrollmentId) return;

      const data = res.data;
      const fromBackend = [];
      if (data.form_a) fromBackend.push("form_a");
      if (data.form_b) fromBackend.push("form_b");
      if (data.form_c) fromBackend.push("form_c");
      if (data.form_d) fromBackend.push("form_d");
      if (data.form_e) fromBackend.push("form_e");

      const key = `completedForms_${enrollmentId}`;
      // Helpers are session-only for sidebar ticks. localStorage previously
      // leaked Patient A's helper completions onto Patient B's key whenever
      // the enrollment id flipped — do not rehydrate helpers from cache.
      setCompletedForms((prev) => {
        const prevExtras = (helpersTrustedFor.current === enrollmentId)
          ? prev.filter((f) => !BACKEND_TRACKED.has(f))
          : [];
        helpersTrustedFor.current = enrollmentId;
        const merged = [...new Set([...fromBackend, ...prevExtras])];
        skipNextPersist.current = true;
        setActiveKey(key);
        localStorage.setItem(key, JSON.stringify(merged));
        return merged;
      });

      setProgress({
        form_a: !!data.form_a,
        form_b: !!data.form_b,
        form_c: !!data.form_c,
        form_d: !!data.form_d,
        form_e: !!data.form_e,
        no_ppv: !!data.no_ppv,
        next_form: data.next_form,
      });
      setIsProgressLoaded(true);
    } catch (err) {
      console.error("Failed to fetch progress", err);
    }
  }, []);
  fetchProgressRef.current = fetchProgress;

  return (
    <FormProgressContext.Provider value={{
      completedForms,
      markFormCompleted,
      resetProgress,
      progress,
      fetchProgress,
      isProgressLoaded,
      reloadProgress: loadFromStorage,
    }}>
      {children}
    </FormProgressContext.Provider>
  );
}

export const useFormProgress = () => useContext(FormProgressContext);
