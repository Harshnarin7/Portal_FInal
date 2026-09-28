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
  // Forms that UNLOCK their dependants (PREREQS in Sidebar). Kept separate
  // from the green tick since 2026-09-26: the tick now means "complete"
  // (mandatory fields + validation), but a started Form A/B must still open
  // the DMS/helpers/C-L exactly as before.
  const [unlockedForms, setUnlockedForms] = useState([]);
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
      setUnlockedForms([]);
      setProgress({ form_a: false, form_b: false, form_c: false, form_d: false, form_e: false });
      setIsProgressLoaded(true);
      return;
    }

    if (!enrollmentId) {
      // Pre-enrolment: only Form A. Never show helpers/C/D/E from a polluted cache.
      // Form A unlocks Form B once a screening exists; its tick is set by
      // ScreeningForm from its own validation.
      skipNextPersist.current = true;
      helpersTrustedFor.current = null;
      setCompletedForms([]);
      setUnlockedForms(["form_a"]);
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
      setCompletedForms([]);
      setUnlockedForms(["form_a"]);
      setProgress({ form_a: true, form_b: false, form_c: false, form_d: false, form_e: false });
    }
    setIsProgressLoaded(true);
    if (localStorage.getItem("token")) {
      queueMicrotask(() => fetchProgressRef.current?.(enrollmentId));
    }
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

  // A save that reaches mark/unmark means the form has a record — enough to
  // unlock its dependants, whether or not it is complete.
  const markFormUnlocked = useCallback((formId) => {
    setUnlockedForms((prev) => (prev.includes(formId) ? prev : [...prev, formId]));
  }, []);

  const markFormCompleted = useCallback((formId) => {
    markFormUnlocked(formId);
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
  }, [markFormUnlocked]);

  // Counterpart to markFormCompleted for forms whose "done" state can go
  // backwards — e.g. a helper log where the user adds a reading (ticks it),
  // then deletes that reading before saving again. Without this, the tick
  // is permanently stuck true once counts.done crosses 0 a single time,
  // because markFormCompleted only ever appends and never removes.
  const unmarkFormCompleted = useCallback((formId) => {
    markFormUnlocked(formId);
    setCompletedForms((prev) => {
      if (!prev.includes(formId)) return prev;
      const updated = prev.filter((f) => f !== formId);
      const rawEid = localStorage.getItem("current_enrollment_id");
      const enrollmentId = isUsableEnrollmentId(rawEid) ? String(rawEid).trim() : null;
      const screeningId = validId(localStorage.getItem("current_screening_id"));
      const key = progressStorageKey(enrollmentId, screeningId);
      if (key) {
        localStorage.setItem(key, JSON.stringify(updated));
        setActiveKey(key);
        skipNextPersist.current = true;
      }
      return updated;
    });
  }, [markFormUnlocked]);

  const resetProgress = useCallback(() => {
    const enrollmentId = validId(localStorage.getItem("current_enrollment_id"));
    const screeningId = validId(localStorage.getItem("current_screening_id"));
    const key = progressStorageKey(enrollmentId, screeningId);
    if (key) localStorage.removeItem(key);

    skipNextPersist.current = true;
    helpersTrustedFor.current = null;
    setCompletedForms([]);
    setUnlockedForms([]);
    setProgress({ form_a: false, form_b: false, form_c: false, form_d: false, form_e: false });
    setActiveKey(null);
    setIsProgressLoaded(true);
  }, []);

  const fetchProgress = useCallback(async (enrollmentId) => {
    if (!isUsableEnrollmentId(enrollmentId)) return;
    if (!localStorage.getItem("token")) return;
    const seq = ++fetchSeq.current;
    try {
      const res = await api.get(`/enrollment-status/${enrollmentId}`);
      if (seq !== fetchSeq.current) return;
      const rawCurrent = localStorage.getItem("current_enrollment_id");
      const currentEid = isUsableEnrollmentId(rawCurrent) ? String(rawCurrent).trim() : null;
      if (currentEid && currentEid !== enrollmentId) return;

      const data = res.data;
      // Tick = strict completeness (form_x_complete); unlock = the long-
      // standing loose flag (form_x). An older backend without *_complete
      // falls back to the loose flag for both.
      const fromBackend = [];
      const unlocked = [];
      ["form_a", "form_b", "form_c", "form_d", "form_e"].forEach((f) => {
        const strict = data[`${f}_complete`];
        if (strict === undefined ? data[f] : strict) fromBackend.push(f);
        if (data[f]) unlocked.push(f);
      });
      setUnlockedForms((prev) => [...new Set([
        ...unlocked,
        ...prev.filter((f) => !BACKEND_TRACKED.has(f)),
      ])]);

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
      unlockedForms,
      markFormCompleted,
      unmarkFormCompleted,
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
