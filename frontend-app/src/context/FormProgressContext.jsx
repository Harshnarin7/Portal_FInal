import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

const FormProgressContext = createContext();

export function FormProgressProvider({ children }) {
  
  // ✅ Local progress (for sidebar ticks)
  const [completedForms, setCompletedForms] = useState([]);

  const [isProgressLoaded, setIsProgressLoaded] = useState(false);
  // ✅ Backend progress (optional use)
  const [progress, setProgress] = useState({
    form_a: false,
    form_b: false,
    form_c: false,
    form_d: false,
  });

  // ✅ Sync with localStorage
useEffect(() => {
  const enrollmentId = localStorage.getItem("current_enrollment_id");

  if (!enrollmentId) {
    // 🔥 IMPORTANT FIX
    setCompletedForms([]);
    setIsProgressLoaded(true);
    return;
  }

  const key = `completedForms_${enrollmentId}`;
  const saved = localStorage.getItem(key);

  setCompletedForms(saved ? JSON.parse(saved) : []);
  setIsProgressLoaded(true);
}, []);

useEffect(() => {
  const enrollmentId = localStorage.getItem("current_enrollment_id");
  if (!enrollmentId) return;

  const key = `completedForms_${enrollmentId}`;
  localStorage.setItem(key, JSON.stringify(completedForms));
}, [completedForms]);

  // ✅ Mark form as completed
 const markFormCompleted = (formId) => {
  setCompletedForms((prev) => {
    if (prev.includes(formId)) return prev;

    const updated = [...prev, formId];

    const enrollmentId = localStorage.getItem("current_enrollment_id"); // ✅ FIX
    if (!enrollmentId) return prev;

    const key = `completedForms_${enrollmentId}`; // ✅ FIX
    localStorage.setItem(key, JSON.stringify(updated));

    return updated;
  });
};

  // ✅ Reset ALL progress (🔥 important for New Entry)
  const resetProgress = () => {
    setCompletedForms([]);
    setProgress({
      form_a: false,
      form_b: false,
      form_c: false,
      form_d:false,
    });

    const enrollmentId = localStorage.getItem("current_enrollment_id");
if (enrollmentId) {
  localStorage.removeItem(`completedForms_${enrollmentId}`);
}
  };

  // ✅ Fetch backend progress (optional)
  const fetchProgress = async (enrollmentId) => {
    try {
      const res = await api.get(`/enrollment-status/${enrollmentId}`);
      setProgress(res.data);
    } catch (err) {
      console.error("Failed to fetch progress", err);
    }
  };

  return (
    <FormProgressContext.Provider
      value={{
        completedForms,
        markFormCompleted,
        resetProgress,
        progress,
        fetchProgress,
        isProgressLoaded
      }}
    >
      {children}
    </FormProgressContext.Provider>
  );
}

export const useFormProgress = () => useContext(FormProgressContext);