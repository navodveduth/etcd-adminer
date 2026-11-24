import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DataService from '../data/service';
import { useReadOnly } from '../readOnly';

export default function Leases() {
    const service = useMemo(() => new DataService(), []);
    const readOnly = useReadOnly();
    const [ids, setIDs] = useState([]);
    const [selected, setSelected] = useState('');
    const [detail, setDetail] = useState(null);
    const [ttl, setTTL] = useState('60');
    const [version, setVersion] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [revoking, setRevoking] = useState(false);
    const [confirmation, setConfirmation] = useState('');
    const validTTL = /^\d+$/.test(ttl) && Number(ttl) >= 1 && Number(ttl) <= 604800;

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        service.GetLeases(controller.signal).then((data) => {
            if (controller.signal.aborted) return;
            setIDs(data.ids);
            setSelected((current) => data.ids.includes(current) ? current : data.ids[0] ?? '');
            if (data.truncated) setNotice('Showing the first 1,000 lease IDs. Use etcd tooling for a larger inventory.');
        }).catch((error) => {
            if (!controller.signal.aborted) setError(error.response?.data?.message ?? 'Could not load leases. Check your connection and refresh.');
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [service, version]);

    useEffect(() => {
        const controller = new AbortController();
        setDetail(null);
        setRevoking(false);
        setConfirmation('');
        if (selected) {
            service.GetLease(selected, controller.signal).then((data) => {
                if (!controller.signal.aborted) setDetail(data);
            }).catch((error) => {
                if (!controller.signal.aborted) setError(error.response?.data?.message ?? 'Could not inspect this lease. It may have expired; refresh the list.');
            });
        }
        return () => controller.abort();
    }, [service, selected, version]);

    const mutate = async (operation, success) => {
        if (readOnly || busy) return;
        setBusy(true); setError(''); setNotice('');
        try {
            await operation();
            setNotice(success);
            setVersion((value) => value + 1);
        } catch (error) {
            setError(error.response?.data?.message ?? 'The operation could not be confirmed. Refresh before retrying.');
        } finally { setBusy(false); }
    };

    return (
        <Stack spacing={2}>
            <Typography variant="h4" component="h1">Leases & expiration</Typography>
            <Typography color="text.secondary">A lease deletes its attached keys when it expires or is revoked. Cluster-wide lease administration requires the etcd root role.</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {notice && <Alert severity="success" role="status">{notice}</Alert>}
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" component="h2" gutterBottom>Create an expiration lease</Typography>
                <Box component="form" onSubmit={(event) => {
                    event.preventDefault();
                    if (validTTL) mutate(async () => { const lease = await service.GrantLease(Number(ttl)); setSelected(lease.id); }, 'Lease created. Attach its ID to a key before it expires.');
                }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="start">
                        <TextField label="TTL in seconds" value={ttl} onChange={(event) => setTTL(event.target.value)} disabled={busy || readOnly}
                            helperText="1 second to 7 days. The timer starts immediately." error={!validTTL} size="small" />
                        <Button type="submit" variant="contained" disabled={!validTTL || busy || readOnly}>Create lease</Button>
                    </Stack>
                </Box>
            </Paper>
            <Paper sx={{ p: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="start">
                    <TextField select label="Lease ID" value={ids.includes(selected) ? selected : ''} onChange={(event) => { setError(''); setSelected(event.target.value); }} disabled={loading || busy || !ids.length} sx={{ minWidth: 260 }}>
                        {ids.map((id) => <MenuItem key={id} value={id}>{id}</MenuItem>)}
                    </TextField>
                    <Button disabled={loading || busy} onClick={() => { setError(''); setVersion((value) => value + 1); }}>Refresh leases</Button>
                </Stack>
                {loading && <Typography role="status" sx={{ mt: 2 }}>Loading leases…</Typography>}
                {!loading && !ids.length && !error && <Typography sx={{ mt: 2 }}>No active leases. Create one above, then attach its ID in the key editor.</Typography>}
                {detail && <Stack spacing={2} sx={{ mt: 3 }}>
                    <Typography><b>Lease ID:</b> <Box component="code" sx={{ userSelect: 'all' }}>{detail.id}</Box></Typography>
                    <Typography>Remaining TTL at last check: <b>{detail.ttl} seconds</b> (granted: {detail.grantedTTL} seconds)</Typography>
                    <Typography>Attached keys: <b>{detail.keyCount}</b>{detail.keyCount > detail.keys.length ? ' (first 100 shown)' : ''}</Typography>
                    <Box component="ul" sx={{ maxHeight: 240, overflow: 'auto' }}>{detail.keys.map((item) => <li key={`${item.keyEncoding}:${item.key}`}><code>{item.key}</code>{item.keyEncoding === 'base64' ? ' (base64)' : ''}</li>)}</Box>
                    <Typography variant="body2" color="text.secondary">Renew once resets the TTL once. There is no automatic background renewal; leaving this page does not keep the lease alive.</Typography>
                    <Stack direction="row" spacing={2}>
                        <Button disabled={readOnly || busy} onClick={() => mutate(() => service.RenewLease(detail.id), 'Lease renewed once.')}>Renew once</Button>
                        <Button color="error" disabled={readOnly || busy} onClick={() => { setConfirmation(''); setRevoking(true); }}>Revoke lease…</Button>
                    </Stack>
                </Stack>}
            </Paper>
            <Dialog open={revoking && Boolean(detail)} onClose={() => { if (!busy) setRevoking(false); }} aria-labelledby="revoke-lease-title">
                <DialogTitle id="revoke-lease-title">Revoke this lease?</DialogTitle>
                <DialogContent>
                    <Alert severity="error">This permanently deletes ALL {detail?.keyCount ?? 0} attached keys, including any not shown above. This cannot be undone.</Alert>
                    <TextField label="Type the lease ID to confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} fullWidth sx={{ mt: 2 }} disabled={busy} />
                </DialogContent>
                <DialogActions>
                    <Button autoFocus onClick={() => setRevoking(false)} disabled={busy}>Keep lease</Button>
                    <Button color="error" disabled={readOnly || busy || confirmation !== detail?.id} onClick={() => mutate(async () => { await service.RevokeLease(detail.id); setSelected(''); setRevoking(false); }, 'Lease revoked. Attached keys were deleted.')}>Revoke and delete keys</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
