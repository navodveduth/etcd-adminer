import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  CssBaseline,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import CloseIcon from '@mui/icons-material/Close';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import { EmptyState } from './components/shared/page';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import DataService from './data/service';
import { ReadOnlyContext } from './readOnly';
import { SessionStore } from './storage/session';
import Workspace from './workspaces';
import WorkspaceTabs from './components/layout/workspaceTabs';
import { WorkspaceActivity } from './data/activity';
import Connection from './components/connections/connection';

const NewConnection = lazy(() => import('./components/connections/newConnection'));
const About = lazy(() => import('./components/about'));

function Shell({ mode, toggleMode }) {
  const [page, setPage] = useState('connection');
  const [connectionPageVersion, setConnectionPageVersion] = useState(0);
  const store = useMemo(() => new SessionStore(), []);
  const [workspaces, setWorkspaces] = useState([]);
  const [active, setActive] = useState('');
  const [notice, setNotice] = useState('');
  const [help, setHelp] = useState(false);
  const [closing, setClosing] = useState(null);
  const [activities, setActivities] = useState({});
  const workspaceIDs = useRef(new Set());
  workspaceIDs.current = new Set(workspaces.map((workspace) => workspace.id));
  const activityChanged = useCallback((id, kind, label) => {
    if (!workspaceIDs.current.has(id)) return;
    setActivities((current) =>
      current[id]?.[kind] === label
        ? current
        : { ...current, [id]: { ...current[id], [kind]: label } },
    );
  }, []);
  useEffect(() => {
    setActivities((current) => {
      const retained = Object.fromEntries(
        Object.entries(current).filter(([id]) => workspaceIDs.current.has(id)),
      );
      return Object.keys(retained).length === Object.keys(current).length ? current : retained;
    });
  }, [workspaces]);
  useEffect(() => {
    if (page === 'workspace' && active) document.getElementById(`tab-${active}`)?.focus();
  }, [active, page]);
  const managing = page !== 'workspace';
  const sessionChanged = ({ open = true, replaced } = {}) => {
    const profile = store.GetActiveSession();
    const retained = workspaces.filter(({ profile: previous }) => {
      if (previous.Name === replaced) return false;
      const current = store.Get(previous.Name);
      return (
        current?.Password !== undefined &&
        current.BackEnd === previous.BackEnd &&
        current.UserName === previous.UserName
      );
    });
    if (!open) {
      setWorkspaces(retained);
      if (!retained.some((item) => item.id === active)) setActive(retained[0]?.id ?? '');
      return;
    }
    if (!profile) {
      setWorkspaces(retained);
      if (!retained.some((item) => item.id === active)) setActive(retained[0]?.id ?? '');
      return;
    }
    const existing = retained.find(
      (item) =>
        item.profile.Name === profile.Name &&
        item.profile.BackEnd === profile.BackEnd &&
        item.profile.UserName === profile.UserName,
    );
    if (existing) {
      setActive(existing.id);
      setWorkspaces(retained);
    } else if (retained.length >= 4) {
      setNotice('Four workspaces are already open. Close one before opening another.');
      return;
    } else {
      const id = crypto.randomUUID();
      setWorkspaces([
        ...retained,
        {
          id,
          profile: { Name: profile.Name, BackEnd: profile.BackEnd, UserName: profile.UserName },
        },
      ]);
      setActive(id);
    }
    setPage('workspace');
  };
  const close = (id) => {
    setClosing(workspaces.find((item) => item.id === id) ?? null);
  };
  const confirmClose = () => {
    const id = closing.id;
    const retained = workspaces.filter((item) => item.id !== id);
    setWorkspaces(retained);
    if (active === id) setActive(retained[0]?.id ?? '');
    setClosing(null);
  };
  useEffect(() => {
    const shortcuts = (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setHelp(true);
      }
      if (event.altKey && !event.ctrlKey && /^[1-4]$/.test(event.key)) {
        const workspace = workspaces[Number(event.key) - 1];
        if (workspace) {
          event.preventDefault();
          setActive(workspace.id);
          setPage('workspace');
        }
      }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [workspaces]);
  return (
    <>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: 8,
          top: -60,
          zIndex: 2000,
          '&:focus': { top: 8 },
          bgcolor: 'background.paper',
          p: 1,
        }}
      >
        Skip to main content
      </Box>
      <AppBar position="sticky" elevation={0}>
        <Toolbar
          sx={{
            gap: { xs: 0.5, sm: 2 },
            minHeight: 64,
            px: { xs: 1.5, sm: 3 },
            '& > .MuiButton-root': { minWidth: 0, px: { xs: 0.75, sm: 1 } },
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Button
              color="inherit"
              aria-label="ETCD Adminer — Connections"
              onClick={() => {
                setConnectionPageVersion((version) => version + 1);
                setPage('connection');
              }}
              sx={{ minWidth: 0, gap: 1.5, px: 0.5 }}
            >
              <StorageOutlinedIcon sx={{ display: { xs: 'none', sm: 'block' } }} />
              <Typography
                variant="h6"
                component="span"
                sx={{ whiteSpace: 'nowrap', fontSize: { xs: 16, sm: 18 }, fontWeight: 600 }}
              >
                ETCD Adminer
              </Typography>
            </Button>
          </Box>
          <Button color="inherit" size="small" onClick={() => setPage('about')}>
            About
          </Button>
          <Button color="inherit" size="small" onClick={() => setHelp(true)}>
            Shortcuts
          </Button>
          <IconButton
            color="inherit"
            aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleMode}
          >
            <Brightness4Icon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container
        component="main"
        id="main-content"
        tabIndex={-1}
        maxWidth={false}
        sx={{ py: { xs: 2, sm: 3 }, px: { xs: 2, sm: 3, xl: 4 }, minWidth: 0, outline: 'none' }}
      >
        <WorkspaceTabs
          workspaces={workspaces}
          activities={activities}
          active={managing ? '' : active}
          onChange={(id) => {
            setActive(id);
            setPage('workspace');
          }}
          onClose={close}
          onConnections={() => setPage('connection')}
        />
        {notice && (
          <Alert severity="warning" onClose={() => setNotice('')} sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}
        <Suspense fallback={<CircularProgress aria-label="Loading page" />}>
          {page === 'connection' && (
            <MemoryRouter key={connectionPageVersion} initialEntries={['/connection']}>
              <Routes>
                <Route
                  path="/connection"
                  element={<Connection onSessionChange={sessionChanged} />}
                />
                <Route
                  path="/connection/new"
                  element={<NewConnection forceRefreshNav={sessionChanged} />}
                />
                <Route path="*" element={<Navigate to="/connection" replace />} />
              </Routes>
            </MemoryRouter>
          )}
          {page === 'about' && <About />}
          {page === 'workspace' && !workspaces.length && (
            <EmptyState
              title="No open workspaces"
              description="Open a saved connection to browse keys and manage your cluster."
              action={
                <Button variant="contained" onClick={() => setPage('connection')}>
                  Open a connection
                </Button>
              }
            />
          )}
        </Suspense>
        {workspaces.map((workspace) => (
          <Box
            key={workspace.id}
            id={`panel-${workspace.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${workspace.id}`}
            hidden={managing || active !== workspace.id}
          >
            <WorkspaceActivity id={workspace.id} onChange={activityChanged}>
              <Workspace
                profile={workspace.profile}
                active={!managing && active === workspace.id}
              />
            </WorkspaceActivity>
          </Box>
        ))}
      </Container>
      <Dialog
        open={Boolean(closing)}
        onClose={() => setClosing(null)}
        aria-labelledby="close-workspace-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="close-workspace-title">
          Close {closing?.profile.Name} workspace?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Unsaved drafts will be discarded. Watches and automatic lease renewal in this workspace
            will stop.
          </Typography>
          <Alert severity="warning">
            Attached keys may expire after renewal stops. Closing does not revoke a lease or delete
            cluster keys directly.
          </Alert>
          {(activities[closing?.id]?.['duplicate-folder'] ||
            activities[closing?.id]?.transfer ||
            activities[closing?.id]?.['create-key']) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              A key write, transfer or folder copy is in progress. Submitted requests may already
              have committed. Closing stops further requests, not committed writes. Inspect the
              destination before retrying; no rollback is performed.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setClosing(null)}>
            Keep workspace
          </Button>
          <Button color="error" onClick={confirmClose}>
            Close workspace
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={help} onClose={() => setHelp(false)} aria-labelledby="shortcut-help">
        <Box sx={{ position: 'relative' }}>
          <DialogTitle id="shortcut-help" sx={{ pr: 7 }}>
            Keyboard shortcuts
          </DialogTitle>
          <IconButton
            autoFocus
            aria-label="Close help"
            onClick={() => setHelp(false)}
            sx={{ position: 'absolute', right: 12, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Shortcuts act on the focused page or selected workspace.
          </Typography>
          <Box
            component="dl"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 2,
              m: 0,
              '& dt': { fontFamily: 'monospace', fontSize: 13 },
              '& dd': { m: 0, fontSize: 14 },
            }}
          >
            <dt>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} + S</dt>
            <dd>Save the focused key editor</dd>
            <dt>Alt + F</dt>
            <dd>Focus key prefix search</dd>
            <dt>Alt + R</dt>
            <dd>Refresh key listing</dd>
            <dt>Alt + 1–4</dt>
            <dd>Switch workspace</dd>
            <dt>Shift + F10</dt>
            <dd>Open focused tree item menu</dd>
            <dt>F1 / Escape</dt>
            <dd>Open help / close dialog</dd>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function App() {
  const service = useMemo(() => new DataService(), []);
  const [readOnly, setReadOnly] = useState(true);
  const [settingsError, setSettingsError] = useState(false);
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('themeMode') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === 'dark' ? '#90caf9' : '#1976d2' },
          background: {
            default: mode === 'dark' ? '#101721' : '#f4f7fb',
            paper: mode === 'dark' ? '#182230' : '#ffffff',
          },
        },
        shape: { borderRadius: 8 },
        typography: {
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 14,
          h4: { fontSize: '1.65rem' },
          h6: { fontSize: '1.05rem' },
          body1: { fontSize: '.9375rem', lineHeight: 1.6 },
        },
        components: {
          MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: { root: { backgroundImage: 'none' } },
          },
          MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: { root: { textTransform: 'none', fontWeight: 550, minHeight: 36 } },
          },
          MuiTableCell: {
            styleOverrides: {
              head: { fontWeight: 600 },
              root: { paddingTop: 14, paddingBottom: 14 },
            },
          },
          MuiDialogActions: {
            styleOverrides: { root: { padding: '16px 24px', gap: 4, flexWrap: 'wrap' } },
          },
          MuiTabs: { styleOverrides: { indicator: { display: 'none' } } },
          MuiTab: {
            styleOverrides: {
              root: {
                textTransform: 'none',
                minHeight: 44,
                borderBottom: '2px solid transparent',
                '&.Mui-selected': {
                  borderBottomColor: mode === 'dark' ? '#90caf9' : '#1976d2',
                  fontWeight: 600,
                },
              },
            },
          },
        },
      }),
    [mode],
  );
  useEffect(() => {
    const controller = new AbortController();
    service
      .GetConfig(controller.signal)
      .then((settings) => {
        if (!controller.signal.aborted) setReadOnly(settings.readOnly !== false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSettingsError(true);
      });
    return () => controller.abort();
  }, [service]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ReadOnlyContext.Provider value={readOnly}>
        {readOnly && (
          <Alert severity={settingsError ? 'error' : 'info'}>
            {settingsError
              ? 'Could not load instance settings. Mutating controls are disabled.'
              : 'Read-only instance: mutations are disabled.'}
          </Alert>
        )}
        <Shell
          mode={mode}
          toggleMode={() =>
            setMode((previous) => {
              const next = previous === 'dark' ? 'light' : 'dark';
              try {
                localStorage.setItem('themeMode', next);
              } catch {
                /* Memory-only preference. */
              }
              return next;
            })
          }
        />
      </ReadOnlyContext.Provider>
    </ThemeProvider>
  );
}
