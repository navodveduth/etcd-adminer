import { useEffect, useMemo, useState } from 'react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, CircularProgress, Stack } from '@mui/material';
import { lazy, Suspense } from 'react';
import DataService from './data/service';
import { SessionStore } from './storage/session';
import { ReadOnlyContext, useReadOnly } from './readOnly';
import NavMenu from './components/layout/navMenu';
import { DataServiceContext, CapabilityContext, WorkspaceActiveContext, useCapabilities, useWorkspaceActive } from './data/context';

const pages = {
    '/keys': lazy(() => import('./components/keys/keys')),
    '/cluster': lazy(() => import('./components/cluster/cluster')),
    '/metrics': lazy(() => import('./components/cluster/metrics')),
    '/transfer': lazy(() => import('./components/transfer/transfer')),
    '/leases': lazy(() => import('./components/leases/leases')),
    '/watchers': lazy(() => import('./components/watch/watch')),
    '/users': lazy(() => import('./components/access/userList')),
    '/users/new': lazy(() => import('./components/access/createUser')),
    '/roles': lazy(() => import('./components/access/roles')),
};
const adminPages = new Set(['/cluster', '/metrics', '/leases', '/users', '/users/new', '/roles']);

function WorkspacePages() {
    const location = useLocation();
    const capabilities = useCapabilities();
    const active = useWorkspaceActive();
    const [visited, setVisited] = useState({});
    useEffect(() => { if (pages[location.pathname]) setVisited((previous) => ({ ...previous, [location.pathname]: location })); }, [location]);
    const entries = { ...visited, ...(pages[location.pathname] ? { [location.pathname]: location } : {}) };
    if (!pages[location.pathname]) return <Navigate to="/keys" replace />;
    return <>
        {Object.entries(entries).map(([path, savedLocation]) => {
            const Page = pages[path];
            const allowed = !adminPages.has(path) || capabilities?.administrator;
            return <Box key={path} hidden={path !== location.pathname} role="region" aria-label={`${path.slice(1)} page`}>
                <WorkspaceActiveContext.Provider value={active && path === location.pathname}>
                    <Routes location={savedLocation}><Route path={path} element={allowed ? <Suspense fallback={<CircularProgress aria-label="Loading page" />}><Page /></Suspense> : <Alert severity="info">This page requires the etcd root role. Your current connection does not have administrator access.</Alert>} /></Routes>
                </WorkspaceActiveContext.Provider>
            </Box>;
        })}
    </>;
}

export default function Workspace({ profile, active = true }) {
    const instanceReadOnly = useReadOnly();
    const service = useMemo(() => {
        const store = new SessionStore();
        return new DataService({
            GetActiveSession: () => {
                const current = store.Get(profile.Name);
                return current?.BackEnd === profile.BackEnd && current.UserName === profile.UserName && current.Password !== undefined ? current : undefined;
            },
            Get: (name) => store.Get(name), Add: (value) => store.Add(value),
        });
    }, [profile.Name, profile.BackEnd, profile.UserName]);
    const [capabilities, setCapabilities] = useState(null);
    const [capabilityError, setCapabilityError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        let inFlight = false;
        const load = async () => {
            if (inFlight || controller.signal.aborted) return;
            inFlight = true;
            try {
                const value = await service.GetCapabilities(controller.signal);
                if (!controller.signal.aborted) { setCapabilities(value); setCapabilityError(''); }
            } catch {
                if (!controller.signal.aborted) { setCapabilities(null); setCapabilityError('Could not verify access. Administrative and mutating controls are disabled. Reconnect or refresh access.'); }
            } finally { inFlight = false; }
        };
        load();
        const timer = setInterval(load, 30000);
        window.addEventListener('focus', load);
        return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', load); };
    }, [service]);
    return <DataServiceContext.Provider value={service}><CapabilityContext.Provider value={capabilities}><WorkspaceActiveContext.Provider value={active}>
        <ReadOnlyContext.Provider value={instanceReadOnly || !capabilities?.write}>
            <MemoryRouter initialEntries={['/keys']}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                    <Box component="nav" aria-label={`Workspace navigation for ${profile.Name}`} sx={{ minWidth: 210 }}><NavMenu workspace /></Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        {capabilityError && <Alert severity="warning" sx={{ mb: 2 }}>{capabilityError}</Alert>}
                        {!capabilities && !capabilityError ? <CircularProgress aria-label="Checking access" /> : <WorkspacePages />}
                    </Box>
                </Stack>
            </MemoryRouter>
        </ReadOnlyContext.Provider>
    </WorkspaceActiveContext.Provider></CapabilityContext.Provider></DataServiceContext.Provider>;
}
