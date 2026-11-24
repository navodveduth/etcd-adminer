import { createContext, useContext, useMemo } from 'react';
import DataService from './service';

export const DataServiceContext = createContext(null);
export const CapabilityContext = createContext(null);
export const WorkspaceActiveContext = createContext(true);
export function useDataService() {
    const service = useContext(DataServiceContext);
    return useMemo(() => service ?? new DataService(), [service]);
}
export function useCapabilities() { return useContext(CapabilityContext); }
export function useWorkspaceActive() { return useContext(WorkspaceActiveContext); }
