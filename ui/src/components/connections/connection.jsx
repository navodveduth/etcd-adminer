import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { Link } from 'react-router-dom';
import ConnectionCard from './connectionCard';
import { PageHeader, Section, EmptyState } from '../shared/page';
import ConfirmationDialog from '../dialogs/confirmationDialog';
import { Session, SessionStore } from '../../storage/session';
import DataService from '../../data/service';

export default function Connection({ onSessionChange }) {
  const store = useMemo(() => new SessionStore(), []);
  const service = useMemo(() => new DataService(), []);
  const [profiles, setProfiles] = useState(() => store.GetAll());
  const [pending, setPending] = useState(null);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const refresh = (open = false) => {
    setProfiles(store.GetAll());
    onSessionChange?.({ open });
  };
  const openProfile = (profile, reauthenticate = false) => {
    if (!reauthenticate && store.Get(profile.Name)?.Password !== undefined) {
      store.SetActiveSession(profile);
      refresh(true);
    } else {
      setPending(profile);
      setPassword('');
      setVisible(false);
      setError(null);
    }
  };
  const cancel = () => {
    controller.current?.abort();
    setPending(null);
    setPassword('');
    setVisible(false);
    setConnecting(false);
    setError(null);
  };
  const connect = async (event) => {
    event.preventDefault();
    if (connecting || !pending) return;
    const profile = pending;
    const abort = new AbortController();
    controller.current = abort;
    setConnecting(true);
    setError(null);
    try {
      const success = await service.TestConnection(
        profile.UserName,
        password,
        profile.BackEnd,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      if (!success) {
        setError('Authentication failed. Check the username and password for this backend.');
        return;
      }
      store.Add(
        new Session(profile.Name, profile.BackEnd, profile.Endpoints, profile.UserName, password),
      );
      store.SetActiveSession(profile);
      setPending(null);
      setPassword('');
      setVisible(false);
      refresh(true);
    } catch (error) {
      if (!abort.signal.aborted)
        setError(
          error.response?.data?.message ??
            'Could not connect. Check the backend, network and server TLS settings, then try again.',
        );
    } finally {
      if (!abort.signal.aborted) setConnecting(false);
    }
  };
  const all = Object.values(profiles);
  const filtered = all.filter((profile) =>
    [profile.Name, profile.BackEnd, profile.UserName, String(profile.Endpoints)].some((value) =>
      value.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const newConnection = (
    <Button component={Link} to="/connection/new" variant="contained" startIcon={<AddIcon />}>
      New connection
    </Button>
  );
  return (
    <>
      <PageHeader
        title="Connections"
        description="Open a saved profile in an isolated workspace. Your drafts and background tasks stay with that workspace."
        actions={all.length ? newConnection : undefined}
      />
      {!all.length ? (
        <Section>
          <EmptyState
            title="No saved connections"
            description="Add a profile for a configured backend, test your credentials, and start browsing. No administrator password is required to start Adminer."
            action={newConnection}
          />
        </Section>
      ) : (
        <>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ mb: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
          >
            <TextField
              label="Search connections"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ width: { xs: '100%', sm: 360 } }}
            />
            <Typography variant="body2" color="text.secondary">
              {filtered.length} of {all.length} profiles · selection is not a live health check
            </Typography>
          </Stack>
          <Box
            aria-label="Saved connections"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: 3,
              alignItems: 'stretch',
            }}
          >
            {filtered.map((profile) => (
              <ConnectionCard
                key={profile.Name}
                connection={profile}
                isActive={profile.isActive}
                openProfile={openProfile}
                deleteSession={setRemoving}
              />
            ))}
          </Box>
          {!filtered.length && (
            <Section>
              <EmptyState
                compact
                title="No matching profiles"
                description="Try a profile name, backend, endpoint or username."
                action={<Button onClick={() => setQuery('')}>Clear search</Button>}
              />
            </Section>
          )}
          <Stack direction="row" sx={{ mt: 2, justifyContent: 'flex-end' }}>
            <Button onClick={() => setDisconnecting(true)}>Disconnect all</Button>
          </Stack>
        </>
      )}
      <Dialog
        open={Boolean(pending)}
        onClose={cancel}
        aria-labelledby="authenticate-profile"
        maxWidth="xs"
        fullWidth
      >
        <Box component="form" autoComplete="on" onSubmit={connect}>
          <DialogTitle id="authenticate-profile">Authenticate {pending?.Name}</DialogTitle>
          <DialogContent>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, overflowWrap: 'anywhere' }}
            >
              Backend: {pending?.BackEnd} · User: {pending?.UserName}
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              value={pending?.UserName ?? ''}
              slotProps={{ input: { readOnly: true } }}
              fullWidth
              sx={{ mb: 2 }}
            />
            <TextField
              autoFocus
              label="Password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={connecting}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        disabled={connecting}
                        onClick={() => setVisible((value) => !value)}
                      >
                        {visible ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Use your browser password manager to save or autofill this login. Choose the entry for
              this backend and username.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={cancel}>{connecting ? 'Cancel request' : 'Cancel'}</Button>
            <Button variant="contained" type="submit" disabled={connecting}>
              {connecting ? 'Authenticating…' : 'Authenticate'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <ConfirmationDialog
        open={Boolean(removing)}
        title={`Delete profile ${removing?.Name ?? ''}?`}
        content="This removes the saved profile and closes its workspaces, discarding drafts and stopping watches and renewal. Cluster keys are not deleted."
        confirmLabel="Delete profile"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          store.Delete(removing);
          setRemoving(null);
          refresh();
        }}
      />
      <ConfirmationDialog
        open={disconnecting}
        title="Disconnect all connections?"
        content="All workspace drafts will be discarded and watches and automatic renewal will stop. Passwords held in this tab will be cleared. Leased keys may expire when renewal stops."
        confirmLabel="Disconnect all"
        onCancel={() => setDisconnecting(false)}
        onConfirm={() => {
          store.DisconnectAll();
          setDisconnecting(false);
          refresh();
        }}
      />
    </>
  );
}
