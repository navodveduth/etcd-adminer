import { createContext, useCallback, useContext, useEffect } from 'react';

const ActivityContext = createContext(null);
export function WorkspaceActivity({ id, onChange, children }) {
  const report = useCallback((kind, label) => onChange(id, kind, label), [id, onChange]);
  return <ActivityContext.Provider value={report}>{children}</ActivityContext.Provider>;
}
export function useWorkspaceActivity(kind, label) {
  const report = useContext(ActivityContext);
  useEffect(() => {
    report?.(kind, label);
    return () => report?.(kind, '');
  }, [report, kind, label]);
}
