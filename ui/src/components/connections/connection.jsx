import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { Link } from 'react-router-dom';
import ConnectionCard from './connectionCard';
import { PageHeader, Section, DataTable, EmptyState, CopyValue } from '../shared/page';
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
  const openProfile = (profile) => {
    if (store.Get(profile.Name)?.Password !== undefined) {
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
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <DataTable aria-label="Saved connections">
              <Table aria-label="Connection profiles">
                <TableHead>
                  <TableRow>
                    <TableCell>Profile</TableCell>
                    <TableCell>Backend / endpoint</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((profile) => (
                    <TableRow key={profile.Name}>
                      <TableCell>
                        <Typography fontWeight={600}>{profile.Name}</Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          sx={{ mt: 0.75 }}
                          label={profile.isActive ? 'Last selected' : 'Saved profile'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {profile.BackEnd}
                        </Typography>
                        <Box sx={{ maxWidth: 500 }}>
                          {(Array.isArray(profile.Endpoints)
                            ? profile.Endpoints
                            : [profile.Endpoints]
                          )
                            .filter(Boolean)
                            .map((endpoint) => (
                              <CopyValue
                                key={endpoint}
                                value={endpoint}
                                mono={false}
                                label={`endpoint for ${profile.Name}`}
                              />
                            ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <code>{profile.UserName}</code>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Button variant="contained" onClick={() => openProfile(profile)}>
                            Open workspace
                          </Button>
                          <Button
                            component={Link}
                            to={`/connection/new?edit=${encodeURIComponent(profile.Name)}`}
                          >
                            Edit / diagnose
                          </Button>
                          <IconButton
                            aria-label={`Delete profile ${profile.Name}`}
                            onClick={() => setRemoving(profile)}
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTable>
          </Box>
          <Stack spacing={2} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {filtered.map((profile) => (
              <ConnectionCard
                key={profile.Name}
                connection={profile}
                isActive={profile.isActive}
                openProfile={openProfile}
                deleteSession={setRemoving}
              />
            ))}
          </Stack>
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
      <Box component="details" sx={{ mt: 3, color: 'text.secondary', fontSize: 14 }}>
        <summary style={{ cursor: 'pointer' }}>How credentials are stored</summary>
        <Typography variant="body2" sx={{ mt: 1, maxWidth: 720 }}>
          Only profile metadata is saved. Passwords remain in this browser tab's memory; reloads
          require reauthentication. Disconnecting clears held passwords and closes affected
          workspaces.
        </Typography>
      </Box>
      <Dialog
        open={Boolean(pending)}
        onClose={cancel}
        aria-labelledby="authenticate-profile"
        maxWidth="xs"
        fullWidth
      >
        <Box component="form" onSubmit={connect}>
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
              autoFocus
              label="Password"
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
              Credentials apply only to this connection.
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
