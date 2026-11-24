import { useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { Link, Navigate } from 'react-router-dom';
import ConnectionCard from './connectionCard';
import { Session, SessionStore } from '../storage/session';
import DataService from '../data/service';

export default function Connection({ onSessionChange }) {
    const store = useMemo(() => new SessionStore(), []);
    const service = useMemo(() => new DataService(), []);
    const [profiles, setProfiles] = useState(() => store.GetAll());
    const [pending, setPending] = useState(null);
    const [password, setPassword] = useState('');
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState(null);

    const refresh = (open = false) => { setProfiles(store.GetAll()); onSessionChange?.({ open }); };
    const useSession = (profile) => {
        if (store.Get(profile.Name)?.Password !== undefined) {
            store.SetActiveSession(profile);
            refresh(true);
        } else {
            setPending(profile);
            setPassword('');
            setError(null);
        }
    };
    const connect = async (event) => {
        event.preventDefault();
        setConnecting(true);
        setError(null);
        try {
            if (!await service.TestConnection(pending.UserName, password, pending.BackEnd)) {
                setError('Authentication failed. Check your credentials.');
                return;
            }
            store.Add(new Session(pending.Name, pending.BackEnd, pending.Endpoints, pending.UserName, password));
            store.SetActiveSession(pending);
            setPending(null);
            setPassword('');
            refresh(true);
        } catch {
            setError('Could not connect. Check cluster availability and try again.');
        } finally {
            setConnecting(false);
        }
    };
    if (!Object.keys(profiles).length) return <Navigate to="/connection/new" replace />;
    return (
        <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Saved connections</Typography>
            <Alert severity="info" sx={{ my: 2 }}>Only profile metadata is saved. Passwords remain in this tab's memory; reloads require reauthentication.</Alert>
            <Grid container spacing={2}>
                {Object.values(profiles).map((profile) => (
                    <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={profile.Name}>
                        <ConnectionCard connection={profile} isActive={profile.isActive} useSession={useSession}
                            deleteSession={(profile) => { store.Delete(profile); refresh(); }} />
                    </Grid>
                ))}
            </Grid>
            <Button component={Link} to="/connection/new">New connection</Button>
            <Button onClick={() => { store.DisconnectAll(); refresh(); }}>Disconnect all</Button>
            <Dialog open={Boolean(pending)} onClose={() => { if (!connecting) { setPending(null); setPassword(''); } }}>
                <form onSubmit={connect}>
                    <DialogTitle>Authenticate {pending?.Name}</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error">{error}</Alert>}
                        <TextField autoFocus label="Password" type="password" autoComplete="current-password" value={password}
                            onChange={(event) => setPassword(event.target.value)} disabled={connecting} fullWidth sx={{ mt: 1 }} />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => { setPending(null); setPassword(''); }} disabled={connecting}>Cancel</Button>
                        <Button type="submit" disabled={connecting}>Authenticate</Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Paper>
    );
}
