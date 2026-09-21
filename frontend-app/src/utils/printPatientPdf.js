/**
 * Print / Save-as-PDF using the screening ID as the file name.
 *
 * Chrome/Edge "Save as PDF" uses document.title, then appends ".pdf",
 * so title "01-0001" becomes "01-0001.pdf".
 */
export function resolveScreeningIdForPdf(...candidates) {
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s;
  }
  try {
    const stored = String(localStorage.getItem("current_screening_id") || "").trim();
    if (stored) return stored;
  } catch (_) {}
  return "";
}

export function screeningPdfBasename(screeningId) {
  const raw = String(screeningId || "").trim() || "screening";
  return raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.pdf$/i, "");
}

export function printPatientPdf(screeningId) {
  const basename = screeningPdfBasename(screeningId);
  const previous = document.title;
  document.title = basename;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  setTimeout(restore, 120000);
}
