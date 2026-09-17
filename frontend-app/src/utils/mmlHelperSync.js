/** Shared MML → helper mirror sync (set + clear when MML data removed). */

export function mmlIsEmptyField(v) {
  return v === null || v === undefined || v === "";
}

/** Mirror 5.6.A / 5.1.B Y/N onto helper fields; respect nurse explicit No (false). */
export function mmlSyncTransfusionYnFromMml(current, mmlHas, wasAutofilled) {
  if (current === false) {
    return { next: current, autofilled: wasAutofilled, changed: false };
  }
  if (mmlHas) {
    if (current == null || current === true || wasAutofilled) {
      const changed = current !== true;
      return { next: true, autofilled: true, changed };
    }
    return { next: current, autofilled: wasAutofilled, changed: false };
  }
  if (current === true) {
    return { next: null, autofilled: false, changed: true };
  }
  return { next: current, autofilled: wasAutofilled, changed: false };
}

/**
 * @param {object} opts
 * @param {string|null|undefined} opts.current
 * @param {boolean} [opts.blockedByNotDone]
 * @param {boolean} [opts.wasAutofilled]
 * @param {boolean} [opts.stillMatchesLastAuto]
 * @param {(current: *, entries: *) => boolean} [opts.looksSourced]
 * @param {*} [opts.entryValuesForSourced]
 * @param {string|null|undefined} opts.mmlValue — null/"" = no MML aggregate → clear when allowed
 * @param {boolean} [opts.force] — refresh from MML even when prior partial sync left stale values
 */
export function mmlSyncAggregateFieldFromMml({
  current,
  blockedByNotDone = false,
  wasAutofilled = false,
  stillMatchesLastAuto = false,
  looksSourced = () => false,
  entryValuesForSourced = null,
  mmlValue = null,
  force = false,
}) {
  if (blockedByNotDone) {
    return {
      nextValue: current == null ? "" : String(current),
      autofilled: wasAutofilled,
      changed: false,
    };
  }
  const cur = current == null ? "" : String(current).trim();
  const isEmpty = cur === "";
  const canTouch =
    force ||
    isEmpty ||
    stillMatchesLastAuto ||
    wasAutofilled ||
    looksSourced(current, entryValuesForSourced);

  const mml = mmlValue == null ? "" : String(mmlValue).trim();
  const hasMml = mml !== "";

  if (hasMml) {
    if (!canTouch) {
      return { nextValue: cur, autofilled: wasAutofilled, changed: false };
    }
    if (cur === mml) {
      return {
        nextValue: mml,
        autofilled: true,
        changed: !wasAutofilled,
      };
    }
    return { nextValue: mml, autofilled: true, changed: true };
  }

  if (isEmpty) {
    if (wasAutofilled) {
      return { nextValue: "", autofilled: false, changed: true };
    }
    return { nextValue: "", autofilled: false, changed: false };
  }
  if (!canTouch) {
    return { nextValue: cur, autofilled: wasAutofilled, changed: false };
  }
  return { nextValue: "", autofilled: false, changed: true };
}

const GLUCOSE_SENTINELS = new Set(["Not Tested", "Not Low", "Not High", "0"]);

export function mmlGlucoseStaleWhenNoReadings(current, fieldKey, readings) {
  if (readings.length) return false;
  const t = current == null ? "" : String(current).trim();
  if (!t) return false;
  if (GLUCOSE_SENTINELS.has(t)) return false;
  if (fieldKey === "hypoglycemia_episodes" && t === "0") return false;
  return true;
}

export function mmlSyncGlucoseFieldFromMml({
  current,
  wasAutofilled = false,
  stillMatchesLastAuto = false,
  force = false,
  fieldKey,
  readings,
  computedValue,
  looksSourced,
}) {
  const cur = current == null ? "" : String(current).trim();
  const next = computedValue == null ? "" : String(computedValue).trim();
  const canTouch =
    force ||
    mmlIsEmptyField(current) ||
    stillMatchesLastAuto ||
    wasAutofilled ||
    looksSourced(current, fieldKey, readings) ||
    mmlGlucoseStaleWhenNoReadings(current, fieldKey, readings);

  if (!canTouch) {
    return { nextValue: cur, autofilled: wasAutofilled, changed: false };
  }
  if (cur === next) {
    return { nextValue: next, autofilled: true, changed: !wasAutofilled };
  }
  return { nextValue: next, autofilled: true, changed: true };
}
