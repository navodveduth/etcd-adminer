import React, { useEffect } from 'react';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { useDataService, useWorkspaceActive } from '../../data/context';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { Link } from 'react-router-dom';
import { useReadOnly } from '../../readOnly';
import { CopyValue, LoadingState, Section } from '../shared/page';
import IconButton from '@mui/material/IconButton';
import RemoveCircleOutlineIcon from '@mui/icons-material/Delete';
import InputAdornment from '@mui/material/InputAdornment';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

export default function UserInfo(props) {
  const roleID = React.useId();
  const readOnly = useReadOnly();
  const active = useWorkspaceActive();

  const [selectedRole, setSelectedRole] = React.useState('');
  const [user, setUser] = React.useState({ roles: [] });
  const [rootConfirmation, setRootConfirmation] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPasswords, setShowPasswords] = React.useState(false);
  const [passwordBusy, setPasswordBusy] = React.useState(false);
  const [roleBusy, setRoleBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  const [removingRole, setRemovingRole] = React.useState('');
  const [revokeConfirmation, setRevokeConfirmation] = React.useState('');
  useEffect(() => {
    if (!active) {
      setPassword('');
      setConfirmPassword('');
      setShowPasswords(false);
    }
  }, [active]);

  const dataService = useDataService();
  const ready = user.name === props.userName;

  const fetchUser = React.useCallback(
    async (username, signal) => {
      try {
        let userDetails = await dataService.FetchUser(username, signal);
        if (signal?.aborted) return;
        if (userDetails.roles == null) {
          userDetails.roles = [];
        }
        setUser(userDetails);
      } catch (error) {
        if (signal?.aborted) return;
        setMessage({
          severity: 'error',
          text: error.response?.data?.message ?? 'Could not load user details.',
        });
      }
    },
    [dataService],
  );

  useEffect(() => {
    const controller = new AbortController();
    setSelectedRole('');
    setRootConfirmation('');
    setRemovingRole('');
    setPassword('');
    setConfirmPassword('');
    setMessage(null);
    fetchUser(props.userName, controller.signal);
    return () => controller.abort();
  }, [props.userName, fetchUser]);

  const handleClickAssignRole = async () => {
    if (readOnly || roleBusy || !ready) return;
    setRoleBusy(true);
    try {
      if (selectedRole === 'root' && rootConfirmation !== 'GRANT ROOT') return;
      let isSuccess = await dataService.AssignRole(
        user.name,
        selectedRole,
        selectedRole === 'root' ? rootConfirmation : undefined,
      );
      if (isSuccess) {
        setSelectedRole('');
        setRootConfirmation('');
        setMessage({ severity: 'success', text: 'Role assigned.' });
        await fetchUser(props.userName);
      }
    } catch (error) {
      setMessage({
        severity: 'error',
        text:
          error.response?.data?.message ??
          'Role assignment could not be confirmed. Refresh the user before retrying.',
      });
    } finally {
      setRoleBusy(false);
    }
  };

  const handleDelete = async (role) => {
    if (readOnly || roleBusy || !ready) return;
    setRoleBusy(true);
    try {
      let isSuccess = await dataService.RemoveRole(user.name, role);
      if (isSuccess) {
        setMessage({ severity: 'success', text: 'Role removed.' });
        setRemovingRole('');
        await fetchUser(props.userName);
      }
    } catch (error) {
      setMessage({
        severity: 'error',
        text:
          error.response?.data?.message ??
          'Role removal could not be confirmed. Refresh the user before retrying.',
      });
    } finally {
      setRoleBusy(false);
    }
  };

  const getRoles = () => {
    return props.allRoles.filter((element) => !user.roles.includes(element));
  };

  const handleChange = (event) => {
    setRootConfirmation('');
    setSelectedRole(event.target.value);
  };

  return (
    <Section
      title="User details"
      description="Roles combine to determine access. Protected accounts and root safeguards are enforced by the server."
    >
      <CopyValue value={props.userName} label="username" />
      {!ready && !message && <LoadingState label="Loading user details" />}
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
      <Grid container size={12}>
        <Grid size={12}>
          <Typography variant="subtitle1" component="h3" gutterBottom>
            Roles:
          </Typography>
        </Grid>
        <Grid size={12}>
          <Paper
            sx={{
              display: 'flex',
              justifyContent: 'left',
              flexWrap: 'wrap',
              listStyle: 'none',
              p: 2,
              my: 1,
            }}
          >
            {((user) => {
              if (user.roles.length < 1 && user.name !== undefined) {
                return <Alert severity="warning">No roles assigned!</Alert>;
              } else {
                return (
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {user.roles.map((role) => (
                      <Stack
                        key={role}
                        direction="row"
                        spacing={0.25}
                        sx={{ alignItems: 'center' }}
                      >
                        <Chip
                          label={role}
                          variant="outlined"
                          component={Link}
                          to={`/roles?name=${encodeURIComponent(role)}`}
                          clickable
                        />
                        <IconButton
                          size="small"
                          aria-label={`Remove role ${role}`}
                          disabled={
                            readOnly ||
                            roleBusy ||
                            !ready ||
                            (user.name === 'root' && role === 'root')
                          }
                          onClick={() => {
                            setRevokeConfirmation('');
                            setRemovingRole(role);
                          }}
                        >
                          <RemoveCircleOutlineIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                  </Stack>
                );
              }
            })(user)}
          </Paper>
        </Grid>
        <Grid size={12}>
          <Typography variant="subtitle1" component="h3" gutterBottom>
            Assign New Role:
          </Typography>
          <FormControl sx={{ my: 1, width: '100%' }}>
            <InputLabel id={`${roleID}-label`}>Roles</InputLabel>
            <Select
              labelId={`${roleID}-label`}
              id={roleID}
              value={selectedRole}
              disabled={readOnly || roleBusy || !ready}
              label="Roles"
              onChange={handleChange}
              autoWidth
            >
              {getRoles().map((role) => (
                <MenuItem key={role} value={role}>
                  {role}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ m: 1 }}>
            {selectedRole === 'root' && (
              <>
                <Alert severity="warning">
                  Root grants unrestricted cluster administration, including every key and every
                  user's access.
                </Alert>
                <TextField
                  label="Type GRANT ROOT to confirm"
                  value={rootConfirmation}
                  onChange={(event) => setRootConfirmation(event.target.value)}
                  disabled={readOnly}
                />
              </>
            )}
            <Button
              variant="contained"
              disabled={
                readOnly ||
                roleBusy ||
                !ready ||
                !selectedRole ||
                (selectedRole === 'root' && rootConfirmation !== 'GRANT ROOT')
              }
              onClick={handleClickAssignRole}
            >
              Assign
            </Button>
          </FormControl>
        </Grid>
      </Grid>
      <Stack spacing={2} sx={{ mt: 3 }}>
        <Typography variant="h6" component="h2">
          Change password
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Password changes require the etcd root role. Accounts listed in the instance's
          protectedUsers policy must be rotated externally. Adminer does not store a shared
          administrator password.
        </Typography>
        <TextField
          label="New password"
          type={showPasswords ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={readOnly || passwordBusy}
          error={new TextEncoder().encode(password).length > 72}
          helperText={`${new TextEncoder().encode(password).length} / 72 UTF-8 bytes. Existing credentials may require reauthentication after a change.`}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPasswords ? 'Hide new passwords' : 'Show new passwords'}
                    onClick={() => setShowPasswords((value) => !value)}
                  >
                    {showPasswords ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          label="Confirm new password"
          type={showPasswords ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={readOnly || passwordBusy}
          error={Boolean(confirmPassword && password !== confirmPassword)}
          helperText={
            confirmPassword && password !== confirmPassword
              ? 'Passwords do not match.'
              : 'Re-enter the new password.'
          }
        />
        <Button
          disabled={
            readOnly ||
            passwordBusy ||
            !password ||
            password !== confirmPassword ||
            !ready ||
            new TextEncoder().encode(password).length > 72
          }
          onClick={async () => {
            setPasswordBusy(true);
            setMessage(null);
            try {
              const result = await dataService.ChangePassword(user.name, password);
              setPassword('');
              setConfirmPassword('');
              setMessage({
                severity: 'success',
                text: result.reauthenticate
                  ? 'Password changed. Disconnect and reauthenticate with the new password.'
                  : 'Password changed successfully.',
              });
            } catch (error) {
              setMessage({
                severity: 'error',
                text:
                  error.response?.data?.message ??
                  'Password change could not be confirmed. Try reconnecting before retrying.',
              });
            } finally {
              setPasswordBusy(false);
            }
          }}
        >
          Change password
        </Button>
      </Stack>
      <Dialog
        open={Boolean(removingRole)}
        onClose={() => {
          if (!roleBusy) setRemovingRole('');
        }}
        aria-labelledby="remove-user-role-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="remove-user-role-title">Remove role {removingRole}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            {user.name} will lose the access granted by this role. Other assigned roles may still
            grant access. Keys are not deleted.
          </Alert>
          {removingRole === 'root' && (
            <TextField
              label="Type REVOKE ROOT to confirm"
              value={revokeConfirmation}
              onChange={(event) => setRevokeConfirmation(event.target.value)}
              sx={{ mt: 2 }}
              fullWidth
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button autoFocus disabled={roleBusy} onClick={() => setRemovingRole('')}>
            Keep role
          </Button>
          <Button
            color="error"
            disabled={
              readOnly ||
              roleBusy ||
              !ready ||
              (removingRole === 'root' && revokeConfirmation !== 'REVOKE ROOT')
            }
            onClick={() => handleDelete(removingRole)}
          >
            Remove role
          </Button>
        </DialogActions>
      </Dialog>
    </Section>
  );
}
