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
import DataService from '../data/service'
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { Link } from 'react-router-dom';
import { useReadOnly } from '../readOnly';

export default function UserInfo(props) {
    const readOnly = useReadOnly();

    const [selectedRole, setSelectedRole] = React.useState('');
    const [user, setUser] = React.useState({ roles: [] });
    const [rootConfirmation, setRootConfirmation] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [passwordBusy, setPasswordBusy] = React.useState(false);
    const [roleBusy, setRoleBusy] = React.useState(false);
    const [message, setMessage] = React.useState(null);
    const [removingRole, setRemovingRole] = React.useState('');
    const [revokeConfirmation, setRevokeConfirmation] = React.useState('');

    const dataService = React.useMemo(() => new DataService(), []);
    const ready = user.name === props.userName;

    const fetchUser = React.useCallback(async (username, signal) => {
        try {
            let userDetails = await dataService.FetchUser(username, signal);
            if (signal?.aborted) return;
            if(userDetails.roles == null) {
                userDetails.roles = [];
            }
            setUser(userDetails);
        } catch (error) {
            if (signal?.aborted) return;
            setMessage({ severity: 'error', text: error.response?.data?.message ?? 'Could not load user details.' });
        }
    }, [dataService]);

    useEffect(() => {
        const controller = new AbortController();
        fetchUser(props.userName, controller.signal);
        return () => controller.abort();
    },[props.userName, fetchUser]);

    const handleClickAssignRole = async () => {
        if (readOnly || roleBusy || !ready) return;
        setRoleBusy(true);
        try {
            if (selectedRole === 'root' && rootConfirmation !== 'GRANT ROOT') return;
            let isSuccess = await dataService.AssignRole(user.name, selectedRole, selectedRole === 'root' ? rootConfirmation : undefined);
            if (isSuccess) {
                setSelectedRole(''); setRootConfirmation('');
                setMessage({ severity: 'success', text: 'Role assigned.' });
                await fetchUser(props.userName);
            }
        } catch (error) {
            setMessage({ severity: 'error', text: error.response?.data?.message ?? 'Role assignment could not be confirmed. Refresh the user before retrying.' });
        } finally { setRoleBusy(false); }
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
            setMessage({ severity: 'error', text: error.response?.data?.message ?? 'Role removal could not be confirmed. Refresh the user before retrying.' });
        } finally { setRoleBusy(false); }
    };

    const getRoles = () => {
        return props.allRoles.filter(element => !user.roles.includes(element));
    };

    const handleChange = (event) => {
        setRootConfirmation('');
        setSelectedRole(event.target.value);
    };

    return (
        <Paper
            sx={{
                p: 2,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Typography variant="h6" gutterBottom>
                User Info: {user.name}
            </Typography>
            {message && <Alert severity={message.severity}>{message.text}</Alert>}
            <Grid container size={12}>
                <Grid size={12}>
                    <Typography variant="subtitle1" gutterBottom>
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
                            m: 2,
                        }}
                    >

                        {
                            ((user) => {
                                if(user.roles.length < 1 && user.name !== undefined) {
                                    return(<Alert severity="warning">No roles assigned!</Alert>)
                                } else{
                                    return(
                                        <Stack direction="row" spacing={1}>
                                            
                                            {user.roles.map((role) => (
                                                <Chip
                                                    key={role}
                                                    label={role}
                                                    variant="outlined"
                                                    component={Link} to={`/roles?name=${encodeURIComponent(role)}`} clickable
                                                    onDelete={readOnly || roleBusy || !ready || (user.name === 'root' && role === 'root') ? undefined : () => { setRevokeConfirmation(''); setRemovingRole(role); }}
                                                />
                                            ))}
                                        </Stack>
                                    )
                                }
                            })(user)
                        }
                        
                    </Paper>
                </Grid>
                <Grid size={12}>
                    <Typography variant="subtitle1" gutterBottom>
                        Assign New Role:
                    </Typography>
                    <FormControl sx={{ m: 1, width: "100px" }}>
                        <InputLabel id="demo-simple-select-label">Roles</InputLabel>
                        <Select
                            labelId="demo-simple-select-label"
                            id="demo-simple-select"
                            value={selectedRole}
                            disabled={readOnly || roleBusy || !ready}
                            label="Roles"
                            onChange={handleChange}
                            autoWidth
                        >
                            {getRoles().map((role) => (
                                <MenuItem key={role} value={role}>{role}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl sx={{ m: 1 }}>
                        {selectedRole === 'root' && <>
                            <Alert severity="warning">Root grants unrestricted cluster administration, including every key and every user's access.</Alert>
                            <TextField label="Type GRANT ROOT to confirm" value={rootConfirmation} onChange={(event) => setRootConfirmation(event.target.value)} disabled={readOnly} />
                        </>}
                        <Button variant="contained" color="success" disabled={readOnly || roleBusy || !ready || !selectedRole || (selectedRole === 'root' && rootConfirmation !== 'GRANT ROOT')} onClick={handleClickAssignRole}>
                            Assign
                        </Button>
                    </FormControl>
                </Grid>
            </Grid>
            <Stack spacing={2} sx={{ mt: 3 }}>
                <Typography variant="h6" component="h2">Change password</Typography>
                <Typography variant="body2" color="text.secondary">Password changes require the etcd root role. Configured service-admin credentials must be rotated externally and updated in their protected source.</Typography>
                <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={readOnly || passwordBusy} />
                <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={readOnly || passwordBusy} />
                <Button disabled={readOnly || passwordBusy || !password || password !== confirmPassword || !ready || new TextEncoder().encode(password).length > 72} onClick={async () => {
                    setPasswordBusy(true); setMessage(null);
                    try {
                        const result = await dataService.ChangePassword(user.name, password);
                        setPassword(''); setConfirmPassword('');
                        setMessage({ severity: 'success', text: result.reauthenticate ? 'Password changed. Disconnect and reauthenticate with the new password.' : 'Password changed successfully.' });
                    } catch (error) { setMessage({ severity: 'error', text: error.response?.data?.message ?? 'Password change could not be confirmed. Try reconnecting before retrying.' }); }
                    finally { setPasswordBusy(false); }
                }}>Change password</Button>
            </Stack>
            <Dialog open={Boolean(removingRole)} onClose={() => { if (!roleBusy) setRemovingRole(''); }} aria-labelledby="remove-user-role-title">
                <DialogTitle id="remove-user-role-title">Remove role {removingRole}?</DialogTitle>
                <DialogContent>
                    <Alert severity="warning">{user.name} will lose the access granted by this role. Other assigned roles may still grant access. Keys are not deleted.</Alert>
                    {removingRole === 'root' && <TextField label="Type REVOKE ROOT to confirm" value={revokeConfirmation} onChange={(event) => setRevokeConfirmation(event.target.value)} sx={{ mt: 2 }} fullWidth />}
                </DialogContent>
                <DialogActions><Button autoFocus disabled={roleBusy} onClick={() => setRemovingRole('')}>Keep role</Button>
                    <Button color="error" disabled={readOnly || roleBusy || !ready || (removingRole === 'root' && revokeConfirmation !== 'REVOKE ROOT')} onClick={() => handleDelete(removingRole)}>Remove role</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    )
}
