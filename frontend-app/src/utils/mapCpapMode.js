const PRESSURE_MODES = ["NIPPV", "SIMV", "A/C", "AC", "PSV", "HFOV"];
const LOW_FLOW_MODES = ["NC", "HFNC"];

/**
 * NC/HFNC only → NA; CPAP only → CPAP; pressure modes → MAP;
 * CPAP + pressure → BOTH (two fields). Matches RespCVNeuroLog / Helper 1.
 */
export function getMapCpapMode(modes) {
  if (!modes || modes.length === 0) return null;
  const hasPressureMode = modes.some((m) => PRESSURE_MODES.includes(m));
  const hasCPAP = modes.includes("CPAP");
  if (hasPressureMode && hasCPAP) return "BOTH";
  if (hasPressureMode) return "MAP";
  if (hasCPAP) return "CPAP";
  if (modes.some((m) => LOW_FLOW_MODES.includes(m))) return "NA";
  return null;
}

/** Soft range hints for CPAP vs MAP (cm H₂O). */
export function validateMapCpap(value, mode) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 0) return "Value can't be negative";
  if (mode === "CPAP") {
    if (num < 3 || num > 12) return "CPAP is usually 3–12 cmH₂O — please double-check this value";
  } else if (mode === "MAP") {
    if (num < 4 || num > 30) return "MAP is usually 4–30 cmH₂O — please double-check this value";
  } else if (num > 40) {
    return "This value looks too high for MAP/CPAP — please double-check";
  }
  return null;
}
