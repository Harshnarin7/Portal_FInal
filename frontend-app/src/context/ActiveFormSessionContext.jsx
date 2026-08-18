import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";

const ActiveFormSessionContext = createContext(null);

export function ActiveFormSessionProvider({ children }) {
  const ref = useRef(null); // { isDirty: () => bool, doSave: () => Promise }
  const register = useCallback((session) => { ref.current = session; }, []);
  const unregister = useCallback(() => { ref.current = null; }, []);
  const getActiveSession = useCallback(() => ref.current, []);
  return (
    <ActiveFormSessionContext.Provider value={{ register, unregister, getActiveSession }}>
      {children}
    </ActiveFormSessionContext.Provider>
  );
}

export const useActiveFormSessionRegistry = () => useContext(ActiveFormSessionContext);

/**
 * Register a form that does not use useFormSession so Sidebar can flush
 * unsaved edits before client-side navigation.
 */
export function useRegisterActiveFormSession(isDirty, doSave) {
  const registry = useActiveFormSessionRegistry();
  const isDirtyRef = useRef(isDirty);
  const doSaveRef = useRef(doSave);
  isDirtyRef.current = isDirty;
  doSaveRef.current = doSave;

  useEffect(() => {
    if (!registry) return undefined;
    registry.register({
      isDirty: () => {
        const v = isDirtyRef.current;
        return typeof v === "function" ? !!v() : !!v;
      },
      doSave: async () => {
        if (doSaveRef.current) await doSaveRef.current();
      },
    });
    return () => registry.unregister();
  }, [registry]);
}
