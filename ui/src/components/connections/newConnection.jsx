import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { CopyValue, PageHeader, Section } from '../shared/page';
import ConfirmationDialog from '../dialogs/confirmationDialog';
import { SessionStore, Session } from '../../storage/session';
import DataService from '../../data/service';

export default function NewConnection({ forceRefreshNav }) {
  const [params] = useSearchParams();
  const editing = params.get('edit');
  const store = useMemo(() => new SessionStore(), []);
  const service = useMemo(() => new DataService(), []);
  const original = useMemo(() => (editing ? store.Get(editing) : null), [editing, store]);
  const [name, setName] = useState(original?.Name ?? '');
  const [backend, setBackend] = useState(original?.BackEnd ?? '');
  const [username, setUsername] = useState(original?.UserName ?? '');
  const [password, setPassword] = useState('');
  const [clusters, setClusters] = useState([]);
  const [tested, setTested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [visible, setVisible] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const controller = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const abort = new AbortController();
    service
      .GetConfig(abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setClusters(data.clusters ?? []);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setMessage({
            severity: 'error',
            text: 'Could not load configured backends. Check the Adminer server and reload.',
          });
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, [service]);
  const change = (setter) => (event) => {
    setter(event.target.value);
    setTested(false);
    setMessage(null);
  };
  const test = async () => {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setTested(false);
    setMessage(null);
    const start = performance.now();
    try {
      const success = await service.TestConnection(username, password, backend, abort.signal);
      if (abort.signal.aborted) return;
      setTested(success);
      setMessage(
        success
          ? {
              severity: 'success',
              text: `Authentication succeeded in ${Math.round(performance.now() - start)} ms (HTTP + etcd authentication, not cluster operation latency). Access is checked separately per operation.`,
            }
          : {
              severity: 'error',
              text: 'Authentication rejected. Check username and password for this backend. This is not a network success guarantee for every member.',
            },
      );
    } catch (error) {
      if (!abort.signal.aborted)
        setMessage({
          severity: 'error',
          text:
            error.response?.data?.message ??
            'Connection failed. Verify the configured endpoints, backend TLS/CA/client certificate, server logs, and network reachability. Browser profiles cannot change server-side transport settings.',
        });
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  const save = (confirmed = false) => {
    if (!tested || busy || !name.trim()) return;
    if ((!editing || name.trim() !== editing) && store.Get(name.trim())) {
      setMessage({
        severity: 'error',
        text: 'That profile name already exists. Choose another name.',
      });
      return;
    }
    if (editing && !confirmed) {
      setConfirmEdit(true);
      return;
    }
    setConfirmEdit(false);
    try {
      const cluster = clusters.find((item) => item.name === backend);
      const profile = new Session(
        name.trim(),
        backend,
        cluster?.endpoints ?? [],
        username,
        password,
      );
      store.Add(profile);
      if (editing && editing !== profile.Name) store.Delete({ Name: editing });
      store.SetActiveSession(profile);
      setPassword('');
      forceRefreshNav?.({ open: true, replaced: editing });
      navigate('/connection');
    } catch {
      setMessage({
        severity: 'error',
        text: 'Could not save the profile. Check local-storage permissions.',
      });
    }
  };
  const duplicate = Boolean(name.trim() && name.trim() !== editing && store.Get(name.trim()));
  const selected = clusters.find((item) => item.name === backend);
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <PageHeader
        title={editing ? 'Edit connection' : 'New connection'}
        description="Choose a configured backend, verify your credentials, then open an isolated workspace."
        actions={
          <Button component={Link} to="/connection">
            Back to connections
          </Button>
        }
      />
      <Stepper activeStep={tested ? 2 : busy ? 1 : 0} sx={{ mb: 3 }}>
        {['Profile details', 'Verify access', 'Open workspace'].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <Section
        title="Connection details"
        description="A profile saves the backend and username, never your password."
      >
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Stack spacing={2.5}>
            <TextField
              label="Profile name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              autoFocus
              required
              error={duplicate}
              helperText={
                duplicate
                  ? 'This profile name already exists. Choose another name.'
                  : 'A short label to identify this workspace.'
              }
            />
            <TextField
              select
              label="Backend"
              value={selected ? backend : ''}
              onChange={change(setBackend)}
              disabled={busy || !clusters.length}
              required
              helperText={
                !clusters.length
                  ? 'No backend loaded. Check the instance configuration and refresh.'
                  : 'Endpoints and TLS are configured on the Adminer server.'
              }
            >
              {clusters.map((cluster) => (
                <MenuItem key={cluster.name} value={cluster.name}>
                  {cluster.name}
                </MenuItem>
              ))}
            </TextField>
            {selected && (
              <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontSize: 13 }}>
                {selected.endpoints?.map((endpoint) => (
                  <CopyValue
                    key={endpoint}
                    value={endpoint}
                    label="backend endpoint"
                    mono={false}
                  />
                ))}
              </Box>
            )}
            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
            >
              <TextField
                label="Username"
                value={username}
                onChange={change(setUsername)}
                disabled={busy}
                autoComplete="username"
                required
              />
              <TextField
                label="Password"
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={change(setPassword)}
                disabled={busy}
                autoComplete="current-password"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={visible ? 'Hide password' : 'Show password'}
                          disabled={busy}
                          onClick={() => setVisible((value) => !value)}
                        >
                          {visible ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
            {message && (
              <Alert severity={message.severity} role="status" sx={{ overflowWrap: 'anywhere' }}>
                {message.text}
              </Alert>
            )}
            {!tested && (
              <Typography variant="body2" color="text.secondary">
                Test this backend and credentials before saving. Changing either requires a fresh
                test.
              </Typography>
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                type="button"
                variant="outlined"
                disabled={busy || !backend || !username}
                onClick={test}
              >
                {busy ? 'Testing…' : 'Test & diagnose'}
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={!tested || busy || !name.trim() || duplicate}
              >
                Save & open workspace
              </Button>
              {busy && (
                <Button
                  onClick={() => {
                    controller.current?.abort();
                    setBusy(false);
                    setMessage({ severity: 'info', text: 'Connection test cancelled.' });
                  }}
                >
                  Cancel test
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>
      </Section>
      <Box component="details" sx={{ mt: 2, color: 'text.secondary', fontSize: 14 }}>
        <summary style={{ cursor: 'pointer' }}>Credential privacy and troubleshooting</summary>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Passwords remain only in tab memory. A reload requires sign-in again. For transport
          failures, verify the configured host/port, CA, TLS server name and client certificate on
          the Adminer server. Do not paste passwords or authorization headers into diagnostics.
        </Typography>
      </Box>
      <ConfirmationDialog
        open={confirmEdit}
        title="Save changes to this profile?"
        content="Workspaces for the old profile will close, discarding drafts and stopping watches and automatic renewal. The new profile opens only after the verified credentials are saved."
        confirmLabel="Save changes"
        destructive={false}
        onCancel={() => setConfirmEdit(false)}
        onConfirm={() => save(true)}
      />
    </Box>
  );
}
