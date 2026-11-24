import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { SessionStore, Session } from '../../storage/session';
import DataService from '../../data/service';

export default function NewConnection({ forceRefreshNav }) {
    const [params] = useSearchParams();
    const editing = params.get('edit');
    const store = useMemo(() => new SessionStore(), []);
    const service = useMemo(() => new DataService(), []);
    const original = useMemo(() => editing ? store.Get(editing) : null, [editing, store]);
    const [name, setName] = useState(original?.Name ?? '');
    const [backend, setBackend] = useState(original?.BackEnd ?? '');
    const [username, setUsername] = useState(original?.UserName ?? '');
    const [password, setPassword] = useState('');
    const [clusters, setClusters] = useState([]);
    const [tested, setTested] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const controller = useRef(null);
    const navigate = useNavigate();
    useEffect(() => {
        const abort = new AbortController();
        service.GetConfig(abort.signal).then((data) => { if (!abort.signal.aborted) setClusters(data.clusters ?? []); }).catch(() => { if (!abort.signal.aborted) setMessage({ severity: 'error', text: 'Could not load configured backends. Check the Adminer server and reload.' }); });
        return () => { abort.abort(); controller.current?.abort(); };
    }, [service]);
    const change = (setter) => (event) => { setter(event.target.value); setTested(false); setMessage(null); };
    const test = async () => {
        if (busy) return;
        const abort = new AbortController(); controller.current = abort;
        setBusy(true); setTested(false); setMessage(null);
        const start = performance.now();
        try {
            const success = await service.TestConnection(username, password, backend, abort.signal);
            if (abort.signal.aborted) return;
            setTested(success);
            setMessage(success ? { severity: 'success', text: `Authentication succeeded in ${Math.round(performance.now() - start)} ms (HTTP + etcd authentication, not cluster operation latency). Access is checked separately per operation.` }
                : { severity: 'error', text: 'Authentication rejected. Check username and password for this backend. This is not a network success guarantee for every member.' });
        } catch (error) {
            if (!abort.signal.aborted) setMessage({ severity: 'error', text: error.response?.data?.message ?? 'Connection failed. Verify the configured endpoints, backend TLS/CA/client certificate, server logs, and network reachability. Browser profiles cannot change server-side transport settings.' });
        } finally { if (!abort.signal.aborted) setBusy(false); }
    };
    const save = () => {
        if (!tested || busy || !name.trim()) return;
        if ((!editing || name.trim() !== editing) && store.Get(name.trim())) { setMessage({ severity: 'error', text: 'That profile name already exists. Choose another name.' }); return; }
        if (editing && !window.confirm('Save profile changes? Open workspaces for the old identity will close; their drafts, watches and automatic renewal will be discarded/stopped.')) return;
        try {
            const cluster = clusters.find((item) => item.name === backend);
            const profile = new Session(name.trim(), backend, cluster?.endpoints ?? [], username, password);
            store.Add(profile);
            if (editing && editing !== profile.Name) store.Delete({ Name: editing });
            store.SetActiveSession(profile); setPassword('');
            forceRefreshNav?.({ open: true, replaced: editing }); navigate('/connection');
        } catch { setMessage({ severity: 'error', text: 'Could not save the profile. Check local-storage permissions.' }); }
    };
    return <Paper sx={{ p: 3, maxWidth: 760, mx: 'auto' }}><Stack spacing={3}>
        <Typography variant="h4" component="h1">{editing ? 'Edit connection' : 'New connection'}</Typography>
        <Alert severity="info">Only profile metadata is saved. Passwords stay in browser-tab memory. Backend endpoints and TLS are configured on the Adminer server.</Alert>
        {message && <Alert severity={message.severity} role="status">{message.text}</Alert>}
        <TextField label="Profile name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} autoFocus required />
        <TextField select label="Backend" value={clusters.some((item) => item.name === backend) ? backend : ''} onChange={change(setBackend)} disabled={busy} required>
            {clusters.map((cluster) => <MenuItem key={cluster.name} value={cluster.name}>{cluster.name} · {cluster.endpoints?.join(', ')}</MenuItem>)}
        </TextField>
        <TextField label="Username" value={username} onChange={change(setUsername)} disabled={busy} autoComplete="username" required />
        <TextField label="Password" type="password" value={password} onChange={change(setPassword)} disabled={busy} autoComplete="current-password" />
        <Stack direction="row" spacing={2}>
            <Button variant="outlined" disabled={busy || !backend || !username} onClick={test}>{busy ? 'Testing…' : 'Test & diagnose'}</Button>
            <Button variant="contained" disabled={!tested || busy || !name.trim()} onClick={save}>Save & open workspace</Button>
            {busy ? <Button onClick={() => { controller.current?.abort(); setBusy(false); setMessage({ severity: 'info', text: 'Connection test cancelled.' }); }}>Cancel test</Button> : <Button component={Link} to="/connection">Back</Button>}
        </Stack>
    </Stack></Paper>;
}
