/** Normalize mobile + web ICF signature fields into a PNG data URL for SignaturePad. */
export function resolveConsentSignatureFromRecord(record) {
  if (!record) {
    return { image: "", capturedAt: "" };
  }
  const img = String(record.consent_signature_image || "").trim();
  const legacy = String(record.consent_obtained_by_signature || "").trim();
  const raw = img || legacy;
  if (!raw) {
    return { image: "", capturedAt: "" };
  }
  const image = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
  const capturedAt =
    record.consent_signature_captured_at ||
    (image && record.consent_datetime ? record.consent_datetime : "") ||
    "";
  return { image, capturedAt: capturedAt ? String(capturedAt) : "" };
}

export function resolvePiSignatureFromRecord(record) {
  if (!record) return { image: "", capturedAt: "" };
  const raw = String(record.pi_signature_image || "").trim();
  if (!raw) return { image: "", capturedAt: "" };
  const image = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
  const capturedAt = record.pi_signature_captured_at || "";
  return { image, capturedAt: capturedAt ? String(capturedAt) : "" };
}
