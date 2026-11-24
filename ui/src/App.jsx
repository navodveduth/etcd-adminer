import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Alert, AppBar, Box, Button, CircularProgress, Container, CssBaseline, Dialog, DialogContent, DialogTitle, IconButton, Toolbar, Typography } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import DataService from './data/service';
import { ReadOnlyContext } from './readOnly';
import { SessionStore } from './storage/session';
import Workspace from './workspaces';
import WorkspaceTabs from './components/workspaceTabs';
import Connection from './components/connection';

const NewConnection = lazy(() => import('./components/newConnection'));
const About = lazy(() => import('./components/about'));

function Shell({ mode, toggleMode }) {
    const [page, setPage] = useState('connection');
    const store = useMemo(() => new SessionStore(), []);
    const [workspaces, setWorkspaces] = useState([]);
    const [active, setActive] = useState('');
    const [notice, setNotice] = useState('');
    const [help, setHelp] = useState(false);
    const managing = page !== 'workspace';
    const sessionChanged = ({ open = true, replaced } = {}) => {
        const profile = store.GetActiveSession();
        const retained = workspaces.filter(({ profile: previous }) => {
            if (previous.Name === replaced) return false;
            const current = store.Get(previous.Name);
            return current?.Password !== undefined && current.BackEnd === previous.BackEnd && current.UserName === previous.UserName;
        });
        if (!open) { setWorkspaces(retained); if (!retained.some((item) => item.id === active)) setActive(retained[0]?.id ?? ''); return; }
        if (!profile) { setWorkspaces(retained); if (!retained.some((item) => item.id === active)) setActive(retained[0]?.id ?? ''); return; }
        const existing = retained.find((item) => item.profile.Name === profile.Name && item.profile.BackEnd === profile.BackEnd && item.profile.UserName === profile.UserName);
        if (existing) { setActive(existing.id); setWorkspaces(retained); }
        else if (retained.length >= 4) { setNotice('Four workspaces are already open. Close one before opening another.'); return; }
        else {
            const id = crypto.randomUUID(); setWorkspaces([...retained, { id, profile: { Name: profile.Name, BackEnd: profile.BackEnd, UserName: profile.UserName } }]); setActive(id);
        }
        setPage('workspace');
    };
    const close = (id) => {
        if (!window.confirm('Close this workspace? Unsaved drafts are discarded; its watches and automatic lease renewal stop. Attached keys can expire when renewal stops.')) return;
        const retained = workspaces.filter((item) => item.id !== id); setWorkspaces(retained);
        if (active === id) setActive(retained[0]?.id ?? '');
    };
    useEffect(() => {
        const shortcuts = (event) => {
            if (event.key === 'F1') { event.preventDefault(); setHelp(true); }
            if (event.altKey && !event.ctrlKey && /^[1-4]$/.test(event.key)) {
                const workspace = workspaces[Number(event.key) - 1];
                if (workspace) { event.preventDefault(); setActive(workspace.id); setPage('workspace'); }
            }
        };
        window.addEventListener('keydown', shortcuts);
        return () => window.removeEventListener('keydown', shortcuts);
    }, [workspaces]);
    return <>
        <Box component="a" href="#main-content" sx={{ position: 'absolute', left: 8, top: -60, zIndex: 2000, '&:focus': { top: 8 }, bgcolor: 'background.paper', p: 1 }}>Skip to main content</Box>
        <AppBar position="static" elevation={0}><Toolbar sx={{ gap: 2 }}>
            <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>ETCD Adminer</Typography>
            <Button color="inherit" onClick={() => setPage('about')}>About</Button>
            <Button color="inherit" onClick={() => setHelp(true)}>Shortcuts</Button>
            <IconButton color="inherit" aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleMode}><Brightness4Icon /></IconButton>
        </Toolbar></AppBar>
        <Container component="main" id="main-content" tabIndex={-1} maxWidth={false} sx={{ py: 3 }}>
            <WorkspaceTabs workspaces={workspaces} active={managing ? '' : active} onChange={(id) => { setActive(id); setPage('workspace'); }} onClose={close} onConnections={() => setPage('connection')} />
            {notice && <Alert severity="warning" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
            <Suspense fallback={<CircularProgress aria-label="Loading page" />}>
                {page === 'connection' && <MemoryRouter initialEntries={['/connection']}><Routes>
                    <Route path="/connection" element={<Connection onSessionChange={sessionChanged} />} />
                    <Route path="/connection/new" element={<NewConnection forceRefreshNav={sessionChanged} />} />
                    <Route path="*" element={<Navigate to="/connection" replace />} />
                </Routes></MemoryRouter>}
                {page === 'about' && <About />}
                {page === 'workspace' && !workspaces.length && <Button onClick={() => setPage('connection')}>Open a connection</Button>}
            </Suspense>
            {workspaces.map((workspace) => <Box key={workspace.id} id={`panel-${workspace.id}`} role="tabpanel" aria-labelledby={`tab-${workspace.id}`} hidden={managing || active !== workspace.id}>
                <Workspace profile={workspace.profile} active={!managing && active === workspace.id} />
            </Box>)}
        </Container>
        <Dialog open={help} onClose={() => setHelp(false)} aria-labelledby="shortcut-help"><DialogTitle id="shortcut-help">Keyboard shortcuts</DialogTitle><DialogContent>
            <Typography>Ctrl/Cmd+S: save the focused key editor. Alt+R: refresh keys. Alt+F: focus key prefix. Alt+1–4: switch workspace. F1: this help. Escape: close dialogs.</Typography>
            <Button autoFocus onClick={() => setHelp(false)}>Close help</Button>
        </DialogContent></Dialog>
    </>;
}

export default function App() {
    const service = useMemo(() => new DataService(), []);
    const [readOnly, setReadOnly] = useState(true);
    const [settingsError, setSettingsError] = useState(false);
    const [mode, setMode] = useState(() => { try { return localStorage.getItem('themeMode') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } });
    const theme = useMemo(() => createTheme({ palette: { mode, primary: { main: mode === 'dark' ? '#80cbc4' : '#00695c' } }, shape: { borderRadius: 10 }, components: { MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } } } }), [mode]);
    useEffect(() => {
        const controller = new AbortController();
        service.GetConfig(controller.signal).then((settings) => { if (!controller.signal.aborted) setReadOnly(settings.readOnly !== false); }).catch(() => { if (!controller.signal.aborted) setSettingsError(true); });
        return () => controller.abort();
    }, [service]);
    return <ThemeProvider theme={theme}><CssBaseline /><ReadOnlyContext.Provider value={readOnly}>
        {readOnly && <Alert severity={settingsError ? 'error' : 'info'}>{settingsError ? 'Could not load instance settings. Mutating controls are disabled.' : 'Read-only instance: mutations are disabled.'}</Alert>}
        <Shell mode={mode} toggleMode={() => setMode((previous) => { const next = previous === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('themeMode', next); } catch { /* Memory-only preference. */ } return next; })} />
    </ReadOnlyContext.Provider></ThemeProvider>;
}
