// mmlSheetFetch.js — PORTAL Trial
// Shared GET for Daily Monitoring Sheet (DMS) data used by the helper forms.
//
// Each helper autofill loader fetched the same DMS sheet on its own (both
// /on/{date} and /today, each with a fresh `?_=`/`?t=` cache-buster), so one
// Helper 2 refresh tick issued ~12 identical requests every 15 s. Identical
// requests made within a short window now share one network call; each caller
// still gets its own copy of the data. A DMS save in this browser clears the
// cache so the next refresh always reads the saved sheet.
import api from "../api/axios";

const WINDOW_MS = 3000;
const recent = new Map(); // key -> { at, promise }

function cacheKey(url, config) {
  const u = new URL(url, "http://local");
  u.searchParams.delete("_"); // cache-busters only — not part of the request's meaning
  u.searchParams.delete("t");
  Object.entries(config?.params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.sort();
  return `${u.pathname}?${u.searchParams.toString()}`;
}

const clone = (data) => (data == null ? data : JSON.parse(JSON.stringify(data)));

export function getMmlSheet(url, config) {
  const key = cacheKey(url, config);
  const hit = recent.get(key);
  if (hit && Date.now() - hit.at < WINDOW_MS) {
    return hit.promise.then((res) => ({ ...res, data: clone(res.data) }));
  }
  const promise = api.get(url, config);
  recent.set(key, { at: Date.now(), promise });
  promise.catch(() => recent.delete(key));
  return promise.then((res) => ({ ...res, data: clone(res.data) }));
}

export function clearMmlSheetCache() {
  recent.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("portal-mml-saved", clearMmlSheetCache);
}
