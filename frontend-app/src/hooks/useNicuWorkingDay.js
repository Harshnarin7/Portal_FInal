import { useEffect, useMemo, useRef, useState } from "react";
import { nicuDayNumberFromDay1 } from "../utils/datetime";

/** Recompute NICU "working day" on a timer so the default tab rolls at the grace hour. */
export function useNicuWorkingDay(day1Date) {
  const [asOf, setAsOf] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setAsOf(new Date());
    const id = setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const todayNicuDay = useMemo(
    () => nicuDayNumberFromDay1(day1Date, asOf),
    [day1Date, asOf],
  );

  return todayNicuDay;
}

/**
 * Default helper tab = grace-shifted working day on open. When the working day
 * advances (e.g. after 8:00), follow it only if the nurse was still on the
 * previous working day — not when reviewing an older day.
 */
export function useDefaultToWorkingNicuDay(todayNicuDay, enrollmentId, activeDay, setActiveDay) {
  const enrollmentRef = useRef(null);
  const prevWorkingRef = useRef(null);

  useEffect(() => {
    if (todayNicuDay == null) return;

    if (enrollmentRef.current !== enrollmentId) {
      enrollmentRef.current = enrollmentId;
      prevWorkingRef.current = null;
    }

    const prevWorking = prevWorkingRef.current;
    const shouldDefault =
      prevWorking === null ||
      (activeDay === prevWorking && todayNicuDay !== prevWorking);

    if (shouldDefault) {
      setActiveDay(todayNicuDay);
    }
    prevWorkingRef.current = todayNicuDay;
  }, [todayNicuDay, enrollmentId, activeDay, setActiveDay]);
}
