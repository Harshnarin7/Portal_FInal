// FormProgressContext.jsx — PORTAL Trial
// FIX: Reload completedForms whenever enrollment_id changes in localStorage
// so refreshing a form page never resets the sidebar.
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/axios";

const FormProgressContext = createContext();

export function FormProgressProvider({ children }) {
  const [completedForms,    setCompletedForms]    = useState([]);
  const [isProgressLoaded,  setIsProgressLoaded]  = useState(false);
  const [progress,          setProgress]          = useState({
    form_a: false, form_b: false, form_c: false, form_d: false,
  });

  /* ─── Core loader: reads from localStorage keyed by enrollmentId ─── */
  const loadFromStorage = useCallback(() => {
    const enrollmentId = localStorage.getItem("current_enrollment_id");

    if (!enrollmentId || enrollmentId === "undefined" || enrollmentId === "null") {
      // No enrollment yet — Form A only
      const screeningId = localStorage.getItem("current_screening_id");
      if (screeningId && screeningId !== "undefined" && screeningId !== "null") {
        // Screening exists, form_a is done
        const key = `completedForms_screening_${screeningId}`;
        const saved = localStorage.getItem(key);
        setCompletedForms(saved ? JSON.parse(saved) : ["form_a"]);
      } else {
        setCompletedForms([]);
      }
      setIsProgressLoaded(true);
      return;
    }

    const key = `completedForms_${enrollmentId}`;
    const saved = localStorage.getItem(key);
    setCompletedForms(saved ? JSON.parse(saved) : []);
    setIsProgressLoaded(true);
  }, []);

  /* ─── Load on mount ─── */
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  /* ─── Re-load whenever localStorage changes (same tab or cross-tab) ─── */
  useEffect(() => {
    const onStorage = (e) => {
      // Reload when enrollment_id or screening_id changes
      if (!e.key || e.key === "current_enrollment_id" || e.key === "current_screening_id") {
        loadFromStorage();
      }
      // Also reload if completedForms for current enrollment changes
      const eid = localStorage.getItem("current_enrollment_id");
      if (eid && e.key === `completedForms_${eid}`) {
        loadFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadFromStorage]);

  /* ─── Persist completedForms whenever it changes ─── */
  useEffect(() => {
    if (!isProgressLoaded) return;

    const enrollmentId = localStorage.getItem("current_enrollment_id");
    if (enrollmentId && enrollmentId !== "undefined" && enrollmentId !== "null") {
      const key = `completedForms_${enrollmentId}`;
      localStorage.setItem(key, JSON.stringify(completedForms));
    } else {
      // Pre-enrollment: save under screening key
      const screeningId = localStorage.getItem("current_screening_id");
      if (screeningId && screeningId !== "undefined" && screeningId !== "null") {
        const key = `completedForms_screening_${screeningId}`;
        localStorage.setItem(key, JSON.stringify(completedForms));
      }
    }
  }, [completedForms, isProgressLoaded]);

  /* ─── Mark a form completed ─── */
  const markFormCompleted = useCallback((formId) => {
    setCompletedForms(prev => {
      if (prev.includes(formId)) return prev;
      const updated = [...prev, formId];

      // Immediately persist to the right key
      const enrollmentId = localStorage.getItem("current_enrollment_id");
      if (enrollmentId && enrollmentId !== "undefined" && enrollmentId !== "null") {
        localStorage.setItem(`completedForms_${enrollmentId}`, JSON.stringify(updated));
      } else {
        const screeningId = localStorage.getItem("current_screening_id");
        if (screeningId && screeningId !== "undefined" && screeningId !== "null") {
          localStorage.setItem(`completedForms_screening_${screeningId}`, JSON.stringify(updated));
        }
      }

      // Notify sidebar in same tab
      window.dispatchEvent(new Event("storage"));
      return updated;
    });
  }, []);

  /* ─── Reset ALL progress (for New Entry) ─── */
  const resetProgress = useCallback(() => {
    setCompletedForms([]);
    setProgress({ form_a: false, form_b: false, form_c: false, form_d: false });
    setIsProgressLoaded(false);

    // Clean up old keys
    const enrollmentId = localStorage.getItem("current_enrollment_id");
    if (enrollmentId) localStorage.removeItem(`completedForms_${enrollmentId}`);
    const screeningId = localStorage.getItem("current_screening_id");
    if (screeningId) localStorage.removeItem(`completedForms_screening_${screeningId}`);

    // Slight delay then mark as loaded so sidebar doesn't stay in loading
    setTimeout(() => setIsProgressLoaded(true), 50);
  }, []);

  /* ─── Fetch backend progress to sync with DB ─── */
  const fetchProgress = useCallback(async (enrollmentId) => {
    if (!enrollmentId) return;
    try {
      const res = await api.get(`/enrollment-status/${enrollmentId}`);
      const data = res.data;

      // Rebuild completedForms from backend truth
      const fromBackend = [];
      if (data.form_a) fromBackend.push("form_a");
      if (data.form_b) fromBackend.push("form_b");
      if (data.form_c) fromBackend.push("form_c");
      if (data.form_d) fromBackend.push("form_d");

      // Merge with localStorage (localStorage may have more recent completions)
      const key = `completedForms_${enrollmentId}`;
      const local = localStorage.getItem(key);
      const localForms = local ? JSON.parse(local) : [];
      const merged = [...new Set([...fromBackend, ...localForms])];

      setCompletedForms(merged);
      localStorage.setItem(key, JSON.stringify(merged));
      setProgress(data);
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
    }}>
      {children}
    </FormProgressContext.Provider>
  );
}

export const useFormProgress = () => useContext(FormProgressContext);
