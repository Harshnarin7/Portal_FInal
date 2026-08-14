// FormProgressContext.jsx — PORTAL Trial
// Sidebar completion must follow the *current* patient and backend truth.
// Never keep a previous enrolment's B/C/D ticks after opening another screening.
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import api from "../api/axios";

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
    form_a: false, form_b: false, form_c: false, form_d: false,
  });
  // Persist only to the key we last loaded — never write stale ticks onto a new patient.
  const [activeKey, setActiveKey] = useState(null);
  const fetchSeq = useRef(0);

  const loadFromStorage = useCallback(() => {
    const enrollmentId = validId(localStorage.getItem("current_enrollment_id"));
    const screeningId = validId(localStorage.getItem("current_screening_id"));
    const key = progressStorageKey(enrollmentId, screeningId);

    setActiveKey(key);

    if (!enrollmentId && !screeningId) {
      setCompletedForms([]);
      setIsProgressLoaded(true);
      return;
    }

    if (!enrollmentId) {
      // Pre-enrolment: Form A only unless a screening-scoped cache exists
      const saved = key ? localStorage.getItem(key) : null;
      setCompletedForms(saved ? JSON.parse(saved) : ["form_a"]);
      setIsProgressLoaded(true);
      return;
    }

    const saved = key ? localStorage.getItem(key) : null;
    setCompletedForms(saved ? JSON.parse(saved) : []);
    setIsProgressLoaded(true);
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    const onStorage = (e) => {
      // Custom same-tab Event("storage") has no key — treat as full session sync
      if (!e.key || e.key === "current_enrollment_id" || e.key === "current_screening_id") {
        loadFromStorage();
        return;
      }
      const eid = validId(localStorage.getItem("current_enrollment_id"));
      const sid = validId(localStorage.getItem("current_screening_id"));
      const key = progressStorageKey(eid, sid);
      if (key && e.key === key) loadFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isProgressLoaded || !activeKey) return;
    localStorage.setItem(activeKey, JSON.stringify(completedForms));
  }, [completedForms, isProgressLoaded, activeKey]);

  const markFormCompleted = useCallback((formId) => {
    setCompletedForms((prev) => {
      if (prev.includes(formId)) return prev;
      const updated = [...prev, formId];
      const enrollmentId = validId(localStorage.getItem("current_enrollment_id"));
      const screeningId = validId(localStorage.getItem("current_screening_id"));
      const key = progressStorageKey(enrollmentId, screeningId);
      if (key) {
        localStorage.setItem(key, JSON.stringify(updated));
        setActiveKey(key);
      }
      window.dispatchEvent(new Event("storage"));
      return updated;
    });
  }, []);

  const resetProgress = useCallback(() => {
    const enrollmentId = validId(localStorage.getItem("current_enrollment_id"));
    const screeningId = validId(localStorage.getItem("current_screening_id"));
    const key = progressStorageKey(enrollmentId, screeningId);
    if (key) localStorage.removeItem(key);

    setCompletedForms([]);
    setProgress({ form_a: false, form_b: false, form_c: false, form_d: false });
    setActiveKey(null);
    setIsProgressLoaded(true);
  }, []);

  const fetchProgress = useCallback(async (enrollmentId) => {
    if (!validId(enrollmentId)) return;
    const seq = ++fetchSeq.current;
    try {
      const res = await api.get(`/enrollment-status/${enrollmentId}`);
      if (seq !== fetchSeq.current) return; // stale response
      // Ignore if nurse already switched patients
      const currentEid = validId(localStorage.getItem("current_enrollment_id"));
      if (currentEid && currentEid !== enrollmentId) return;

      const data = res.data;
      const fromBackend = [];
      if (data.form_a) fromBackend.push("form_a");
      if (data.form_b) fromBackend.push("form_b");
      if (data.form_c) fromBackend.push("form_c");
      if (data.form_d) fromBackend.push("form_d");
      if (data.form_e) fromBackend.push("form_e");

      // Keep helper/other ticks that enrollment-status does not cover,
      // but never keep stale B/C/D when the DB says they are empty.
      const key = `completedForms_${enrollmentId}`;
      const local = localStorage.getItem(key);
      const localForms = local ? JSON.parse(local) : [];
      const localExtras = localForms.filter((f) => !BACKEND_TRACKED.has(f));
      const merged = [...new Set([...fromBackend, ...localExtras])];

      setActiveKey(key);
      setCompletedForms(merged);
      localStorage.setItem(key, JSON.stringify(merged));
      setProgress(data);
      setIsProgressLoaded(true);
    } catch (err) {
      console.error("Failed to fetch progress", err);
    }
  }, []);

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
