import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  IconButton,
  InputAdornment,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useDataService, useWorkspaceActive } from '../../data/context';
import { useReadOnly } from '../../readOnly';
import { PageHeader, ReadOnlyNotice, Section } from '../shared/page';

export default function CreateUser() {
  const service = useDataService();
  const readOnly = useReadOnly();
  const active = useWorkspaceActive();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [roles, setRoles] = useState([]);
  const [available, setAvailable] = useState([]);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState(null);
  const [version, setVersion] = useState(0);
  const passwordBytes = new TextEncoder().encode(password).length;
  useEffect(() => {
    if (!active) {
      setPassword('');
      setConfirmation('');
      setVisible(false);
    }
  }, [active]);
  useEffect(() => {
    const controller = new AbortController();
    service
      .GetRoles(controller.signal)
      .then((roles) => {
        if (!controller.signal.aborted) setAvailable(roles.filter((role) => role !== 'root'));
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setMessage({
            severity: 'error',
            text:
              error.response?.data?.message ??
              'Could not load roles. Check administrator permissions and retry.',
          });
      });
    return () => controller.abort();
  }, [service, version]);
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <PageHeader
        title="New user"
        description="Create a login with least-privilege roles. Administrator access can be granted afterwards from user details with explicit confirmation."
        actions={
          <Button component={Link} to="/users">
            Back to users
          </Button>
        }
      />
      {readOnly && <ReadOnlyNotice />}
      <Section
        title="Account details"
        description="Usernames are exact and case-sensitive. Passwords are sent only for this operation."
      >
        <Box
          component="form"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (readOnly || busy) return;
            setAttempted(true);
            setMessage(null);
            if (!name || !password || passwordBytes > 72 || password !== confirmation) return;
            setBusy(true);
            try {
              const created = await service.CreateUser(name, password, roles);
              if (created) {
                setMessage({
                  severity: 'success',
                  text: `User ${name} created. Review the user directory to verify assigned access.`,
                });
                setName('');
                setPassword('');
                setConfirmation('');
                setRoles([]);
                setVisible(false);
                setAttempted(false);
              }
            } catch (error) {
              setMessage({
                severity: 'error',
                text:
                  error.response?.data?.message ??
                  'User creation could not be confirmed. Inspect the user list before retrying.',
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Stack spacing={2.5}>
            {message && (
              <Alert
                severity={message.severity}
                action={
                  message.severity === 'error' && (
                    <Button color="inherit" onClick={() => setVersion((value) => value + 1)}>
                      Reload roles
                    </Button>
                  )
                }
              >
                {message.text}
              </Alert>
            )}
            <TextField
              autoFocus
              label="User Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              disabled={readOnly || busy}
              error={attempted && !name}
              helperText={
                attempted && !name
                  ? 'Enter a username.'
                  : 'No automatic trimming or case conversion.'
              }
              autoComplete="off"
            />
            <TextField
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              required
              disabled={readOnly || busy}
              error={(attempted && !password) || passwordBytes > 72}
              helperText={`${passwordBytes} / 72 UTF-8 bytes. A nonempty password is required.`}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        onClick={() => setVisible((value) => !value)}
                      >
                        {visible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Confirm password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              required
              disabled={readOnly || busy}
              error={Boolean((attempted || confirmation) && password !== confirmation)}
              helperText={
                (attempted || confirmation) && password !== confirmation
                  ? 'Passwords do not match.'
                  : 'Re-enter the new password.'
              }
            />
            <TextField
              select
              label="Roles"
              value={roles}
              onChange={(event) =>
                setRoles(
                  typeof event.target.value === 'string'
                    ? event.target.value.split(',')
                    : event.target.value,
                )
              }
              disabled={readOnly || busy}
              slotProps={{
                select: { multiple: true, renderValue: (selected) => selected.join(', ') },
              }}
              helperText="Optional. No roles means no key access; root is intentionally excluded here."
            >
              {available.map((role) => (
                <MenuItem key={role} value={role}>
                  <Checkbox checked={roles.includes(role)} />
                  <ListItemText primary={role} />
                </MenuItem>
              ))}
            </TextField>
            {!available.length && (
              <Typography variant="body2" color="text.secondary">
                No non-root roles loaded. You can assign roles later from user details.
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" type="submit" disabled={readOnly || busy}>
                {busy ? 'Creating user…' : 'Create user'}
              </Button>
              <Button component={Link} to="/users" disabled={busy}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Section>
    </Box>
  );
}
