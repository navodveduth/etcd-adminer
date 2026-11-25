import { useEffect, useMemo, useRef, useState } from 'react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, Chip, Drawer, IconButton, Stack, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { LoadingState } from './components/shared/page';
import { lazy, Suspense } from 'react';
import DataService from './data/service';
import { SessionStore } from './storage/session';
import { ReadOnlyContext, useReadOnly } from './readOnly';
import NavMenu from './components/layout/navMenu';
import {
  DataServiceContext,
  CapabilityContext,
  WorkspaceActiveContext,
  useCapabilities,
  useWorkspaceActive,
} from './data/context';

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
  const content = useRef(null);
  useEffect(() => {
    if (active) content.current?.focus({ preventScroll: true });
  }, [location.pathname, active]);
  useEffect(() => {
    if (pages[location.pathname])
      setVisited((previous) => ({ ...previous, [location.pathname]: location }));
  }, [location]);
  const entries = {
    ...visited,
    ...(pages[location.pathname] ? { [location.pathname]: location } : {}),
  };
  if (!pages[location.pathname]) return <Navigate to="/keys" replace />;
  return (
    <Box ref={content} tabIndex={-1} sx={{ outline: 'none', minWidth: 0 }}>
      {Object.entries(entries).map(([path, savedLocation]) => {
        const Page = pages[path];
        const allowed = !adminPages.has(path) || capabilities?.administrator;
        return (
          <Box
            key={path}
            hidden={path !== location.pathname}
            role="region"
            aria-label={`${path.slice(1)} page`}
          >
            <WorkspaceActiveContext.Provider value={active && path === location.pathname}>
              <Routes location={savedLocation}>
                <Route
                  path={path}
                  element={
                    allowed ? (
                      <Suspense fallback={<LoadingState label="Loading page" />}>
                        <Page />
                      </Suspense>
                    ) : (
                      <Alert severity="info">
                        This page requires the etcd root role. Your current connection does not have
                        administrator access.
                      </Alert>
                    )
                  }
                />
              </Routes>
            </WorkspaceActiveContext.Provider>
          </Box>
        );
      })}
    </Box>
  );
}

function WorkspaceNavigation({ profile, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 2, md: 3 }}
      sx={{ alignItems: { md: 'flex-start' } }}
    >
      <Button
        startIcon={<MenuIcon />}
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{ display: { md: 'none' }, alignSelf: 'flex-start' }}
      >
        Navigate workspace
      </Button>
      <Box
        component="nav"
        aria-label={`Workspace navigation for ${profile.Name}`}
        sx={{
          display: { xs: 'none', md: 'block' },
          width: 204,
          flexShrink: 0,
          position: 'sticky',
          top: 88,
        }}
      >
        <NavMenu workspace />
      </Box>
      <Drawer open={open} onClose={() => setOpen(false)}>
        <Box component="nav" aria-label="Workspace menu" sx={{ width: 260, p: 2 }}>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography fontWeight={600}>{profile.Name}</Typography>
            <IconButton aria-label="Close navigation" onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <NavMenu workspace onNavigate={() => setOpen(false)} />
        </Box>
      </Drawer>
      <Box sx={{ minWidth: 0, flex: 1, width: '100%' }}>{children}</Box>
    </Stack>
  );
}

export default function Workspace({ profile, active = true }) {
  const instanceReadOnly = useReadOnly();
  const service = useMemo(() => {
    const store = new SessionStore();
    return new DataService({
      GetActiveSession: () => {
        const current = store.Get(profile.Name);
        return current?.BackEnd === profile.BackEnd &&
          current.UserName === profile.UserName &&
          current.Password !== undefined
          ? current
          : undefined;
      },
      Get: (name) => store.Get(name),
      Add: (value) => store.Add(value),
    });
  }, [profile.Name, profile.BackEnd, profile.UserName]);
  const [capabilities, setCapabilities] = useState(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [accessVersion, setAccessVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const value = await service.GetCapabilities(controller.signal);
        if (!controller.signal.aborted) {
          setCapabilities(value);
          setCapabilityError('');
        }
      } catch {
        if (!controller.signal.aborted) {
          setCapabilities(null);
          setCapabilityError(
            'Could not verify access. Administrative and mutating controls are disabled. Reconnect or refresh access.',
          );
        }
      } finally {
        inFlight = false;
      }
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener('focus', load);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [service, accessVersion]);
  return (
    <DataServiceContext.Provider value={service}>
      <CapabilityContext.Provider value={capabilities}>
        <WorkspaceActiveContext.Provider value={active}>
          <ReadOnlyContext.Provider value={instanceReadOnly || !capabilities?.write}>
            <MemoryRouter initialEntries={['/keys']}>
              <WorkspaceNavigation profile={profile}>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ mb: 2.5, alignItems: 'center', fontSize: 13 }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Backend{' '}
                    <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {profile.BackEnd}
                    </Box>{' '}
                    · User{' '}
                    <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {profile.UserName}
                    </Box>
                  </Typography>
                  {capabilities?.administrator && (
                    <Chip size="small" variant="outlined" label="Administrator" />
                  )}
                  {(instanceReadOnly || (capabilities && !capabilities.write)) && (
                    <Chip
                      size="small"
                      color="info"
                      variant="outlined"
                      label={instanceReadOnly ? 'Read-only instance' : 'View only'}
                    />
                  )}
                </Stack>
                {capabilityError && (
                  <Alert
                    severity="warning"
                    sx={{ mb: 2 }}
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => setAccessVersion((value) => value + 1)}
                      >
                        Refresh access
                      </Button>
                    }
                  >
                    {capabilityError}
                  </Alert>
                )}
                {!capabilities && !capabilityError ? (
                  <LoadingState label="Checking access" />
                ) : (
                  <WorkspacePages />
                )}
              </WorkspaceNavigation>
            </MemoryRouter>
          </ReadOnlyContext.Provider>
        </WorkspaceActiveContext.Provider>
      </CapabilityContext.Provider>
    </DataServiceContext.Provider>
  );
}
