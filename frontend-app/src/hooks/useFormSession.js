/**
 * useFormSession — shared hook for all PORTAL Trial forms
 *
 * Provides:
 *   - autoSave (every 10s, offline-aware)
 *   - saveDraft (skip validation)
 *   - isDirty / lastSaved / autoSaveStatus
 *   - Online/offline detection + banner state
 *   - beforeunload warning
 *   - Last-saved relative time string
 *   - Missing fields modal state
 *   - Draft saved modal state
 *
 * Usage:
 *   const session = useFormSession({
 *     formKey: "form_b",               // used for NotesBox key
 *     isLoaded: isFormBLoaded,         // true = use PUT, false = use POST
 *     enrollmentId: formData.enrollment_id,
 *     buildPayload: () => ({ ... }),   // returns the draft payload
 *     endpoint: "/birth-resuscitation", // backend route (no trailing slash)
 *     idField: "enrollment_id",        // which payload field is the record ID
 *   });
 */

import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/axios";
import { relativeTime } from "../utils/datetime";

export default function useFormSession({
  formKey,
  isLoaded,
  recordId,          // the ID to use in PUT url (enrollment_id or screening_id)
  buildPayload,      // () => object  — caller builds the draft-safe payload
  endpoint,          // e.g. "/maternal-details"
  enabled = true,    // set false to disable auto-save entirely
}) {
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle"); // idle|saving|saved|error
  const [lastSaved,      setLastSaved]      = useState(null);
  const [isDirty,        setIsDirty]        = useState(false);
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const [offlineQueue,   setOfflineQueue]   = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [missingFields,  setMissingFields]  = useState([]);
  const [showMissingModal, setShowMissingModal] = useState(false);

  const autoSaveTimer   = useRef(null);
  const isInitialRender = useRef(true);

  /* ── Mark dirty (call this whenever formData changes) ── */
  const markDirty = useCallback(() => {
    if (isInitialRender.current) { isInitialRender.current = false; return; }
    setIsDirty(true);
  }, []);

  /* ── Reset initial render flag (call after data loads) ── */
  const resetInitialRender = useCallback(() => {
    isInitialRender.current = true;
  }, []);

  /* ── Online / Offline ── */
  useEffect(() => {
    const goOnline  = () => { setIsOnline(true); if (offlineQueue) doSave(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [offlineQueue]); // eslint-disable-line

  /* ── beforeunload ── */
  useEffect(() => {
    const h = e => { if (!isDirty) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  /* ── Core save (used by autoSave and saveDraft) ── */
  const doSave = useCallback(async () => {
    if (!enabled) return;
    if (!navigator.onLine) { setOfflineQueue(true); return; }

    setAutoSaveStatus("saving");
    try {
      const payload = buildPayload();
      const res = isLoaded && recordId
        ? await api.put(`${endpoint}/${recordId}`, payload)
        : await api.post(`${endpoint}/`, payload);

      // Persist IDs if backend returns them
      const sid = res.data?.screening_id;
      const eid = res.data?.enrollment_id;
      if (sid) localStorage.setItem("current_screening_id", sid);
      if (eid) localStorage.setItem("current_enrollment_id", eid);
      window.dispatchEvent(new Event("storage"));

      setAutoSaveStatus("saved");
      setLastSaved(new Date());
      setIsDirty(false);
      setOfflineQueue(false);
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
      return res.data;
    } catch (err) {
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
      throw err;
    }
  }, [enabled, isLoaded, recordId, endpoint, buildPayload]); // eslint-disable-line

  /* ── Auto-save interval (10s) ── */
  useEffect(() => {
    if (!enabled) return;
    clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(doSave, 10000);
    return () => clearInterval(autoSaveTimer.current);
  }, [doSave, enabled]);

  /* ── Save for Later (no validation) ── */
  const saveDraft = useCallback(async () => {
    try {
      const data = await doSave();
      setShowDraftModal(true);
      return data;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      let msg = "Draft save failed.";
      if (Array.isArray(detail))       msg = "Draft save failed: " + detail.map(e => `${e.loc?.slice(-1)[0]} — ${e.msg}`).join("; ");
      else if (typeof detail === "string") msg = `Draft save failed: ${detail}`;
      throw new Error(msg);
    }
  }, [doSave]);

  /* ── Show missing fields modal ── */
  const showMissing = useCallback((fields) => {
    setMissingFields(fields);
    setShowMissingModal(true);
  }, []);

  /* ── Relative time string ── */
  const relT = useCallback((date) => relativeTime(date), []);

  return {
    /* state */
    autoSaveStatus, lastSaved, isDirty, isOnline, offlineQueue,
    showDraftModal, setShowDraftModal,
    missingFields,  setMissingFields,
    showMissingModal, setShowMissingModal,
    /* actions */
    markDirty, resetInitialRender, doSave, saveDraft, showMissing,
    /* helpers */
    relT,
    /* note key */
    noteKey: `${formKey}_${localStorage.getItem("current_enrollment_id") || "new"}`,
  };
}