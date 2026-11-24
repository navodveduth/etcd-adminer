import * as React from 'react';
import { styled, createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import MuiDrawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import MuiAppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Container from '@mui/material/Container';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import NavMenu from './components/navMenu';
import ConnectionComponent from './components/connection';
import { BrowserRouter, Route, Routes, Navigate, Link } from "react-router-dom";
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import DataService from './data/service';
import { ReadOnlyContext } from './readOnly';
import { SessionStore } from './storage/session'


const drawerWidth = 240;
const KeysComponent = React.lazy(() => import('./components/keys'));
const ClusterInfo = React.lazy(() => import('./components/cluster'));
const UserList = React.lazy(() => import('./components/userList'));
const CreateUser = React.lazy(() => import('./components/createUser'));
const NewConnectionComponent = React.lazy(() => import('./components/newConnection'));
const About = React.lazy(() => import('./components/about'));

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(['width', 'margin'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    marginLeft: drawerWidth,
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    '& .MuiDrawer-paper': {
      position: 'relative',
      whiteSpace: 'nowrap',
      width: drawerWidth,
      transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
      }),
      boxSizing: 'border-box',
      ...(!open && {
        overflowX: 'hidden',
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.leavingScreen,
        }),
        width: theme.spacing(7),
        [theme.breakpoints.up('sm')]: {
          width: theme.spacing(9),
        },
      }),
    },
  }),
);

function App() {
  const settingsService = React.useMemo(() => new DataService(), []);
  const [readOnly, setReadOnly] = React.useState(true);
  const [settingsError, setSettingsError] = React.useState(false);
  React.useEffect(() => {
    const controller = new AbortController();
    settingsService.GetConfig(controller.signal).then((settings) => {
      if (!controller.signal.aborted) setReadOnly(settings.readOnly !== false);
    }).catch(() => {
      if (!controller.signal.aborted) setSettingsError(true);
    });
    return () => controller.abort();
  }, [settingsService]);
  const [open, setOpen] = React.useState(true);
  const [refreshNav, setRefreshNav] = React.useState(false);
  
  // initialize mode from localStorage or default to dark
  const [mode, setMode] = React.useState(() => {
    try {
      return localStorage.getItem('themeMode') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleDrawer = () => {
    setOpen(!open);
  };

  const forceRefreshNav = () => {
    setRefreshNav(!refreshNav);
  }

  const toggleColorMode = () => {
    setMode((prevMode) => {
      const newMode = prevMode === 'light' ? 'dark' : 'light';
      // save to localStorage
      try { localStorage.setItem('themeMode', newMode); } catch { /* Keep an in-memory preference when storage is unavailable. */ }
      return newMode;
    });
  };

  const mdTheme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
        },
      }),
    [mode],
  );

  const sessionStore = new SessionStore();

  const requireConnection = (element) => sessionStore.GetActiveSession()
    ? element
    : <Navigate to="/connection" replace />;

  return (
    <ThemeProvider theme={mdTheme}>
      <ReadOnlyContext.Provider value={readOnly}>
      <BrowserRouter>
        <Box sx={{ display: 'flex' }}>
          <CssBaseline />
          <AppBar position="absolute" open={open}>
            <Toolbar
              sx={{
                pr: '24px', // keep right padding when drawer closed
              }}
            >
              <IconButton
                edge="start"
                color="inherit"
                aria-label="open drawer"
                onClick={toggleDrawer}
                sx={{
                  marginRight: '36px',
                  ...(open && { display: 'none' }),
                }}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                component="h1"
                variant="h6"
                color="inherit"
                noWrap
                sx={{ flexGrow: 1 }}
              >
                ETCD Adminer
              </Typography>
              <IconButton color="inherit" onClick={toggleColorMode}>
                {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
            </Toolbar>
          </AppBar>
          <Drawer variant="permanent" open={open}>
            <Toolbar
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: [1],
                position: 'relative',
              }}
            >
              <Link to="/" style={{ textDecoration: 'none' }}>
                <Paper variant="outlined" sx={{maxHeight:50, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'}}>
                  <img src="/images/logo100.png" alt="etcd-logo" height="50px" width="50px"/>
                </Paper>
              </Link>

              <IconButton onClick={toggleDrawer} sx={{ position: 'absolute', right: 8 }}>
                <ChevronLeftIcon />
              </IconButton>

            </Toolbar>
            <Divider />
            <NavMenu refreshNav={refreshNav} />
          </Drawer>
          <Box
            component="main"
            sx={{
              backgroundColor: (theme) =>
                theme.palette.mode === 'light'
                  ? theme.palette.grey[100]
                  : theme.palette.grey[900],
              flexGrow: 1,
              height: '100vh',
              overflow: 'auto',
            }}
          >
            <Toolbar />
            <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
              {readOnly && <Alert severity={settingsError ? 'error' : 'info'} sx={{ mb: 2 }}>
                {settingsError ? 'Could not load instance settings. Mutating controls are disabled.' : 'Read-only mode: cluster mutations are disabled.'}
              </Alert>}
              <React.Suspense fallback={<CircularProgress aria-label="Loading page" />}>
              <Routes>
                <Route path="/" element={<ConnectionComponent onSessionChange={forceRefreshNav} />} />
                <Route path="connection" element={<ConnectionComponent onSessionChange={forceRefreshNav} />} />
                <Route path="connection/new" element={<NewConnectionComponent forceRefreshNav={forceRefreshNav} />} />
                <Route path="cluster" element={requireConnection(<ClusterInfo />)} />
                <Route path="keys" element={requireConnection(<KeysComponent />)} />
                <Route path="users" element={requireConnection(<UserList />)} />
                <Route path="users/new" element={requireConnection(<CreateUser />)} />
                <Route path="about" element={<About />} />
              </Routes>
              </React.Suspense>
            </Container>
          </Box>
        </Box>
      </BrowserRouter>
      </ReadOnlyContext.Provider>
    </ThemeProvider>
  );
}

export default App;
