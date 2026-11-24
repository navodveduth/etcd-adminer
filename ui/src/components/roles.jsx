import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DataService from '../data/service';
import { useReadOnly } from '../readOnly';

const scopeDescription = (scope, key, end) => scope === 'prefix'
    ? `every key starting with ${JSON.stringify(key)}`
    : scope === 'range' ? `keys from ${JSON.stringify(key)} up to (excluding) ${JSON.stringify(end)}` : `only the exact key ${JSON.stringify(key)}`;

export default function Roles() {
    const [params] = useSearchParams();
    const service = useMemo(() => new DataService(), []);
    const readOnly = useReadOnly();
    const [roles, setRoles] = useState([]);
    const [selected, setSelected] = useState(params.get('name') ?? '');
    const [detail, setDetail] = useState(null);
    const [name, setName] = useState('');
    const [scope, setScope] = useState('prefix');
    const [access, setAccess] = useState('read');
    const [key, setKey] = useState('');
    const [end, setEnd] = useState('');
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [confirmation, setConfirmation] = useState('');
    const [removing, setRemoving] = useState(null);
    const protectedRole = selected === 'root';

    useEffect(() => {
        const controller = new AbortController();
        service.ListRoles(controller.signal).then((data) => {
            if (controller.signal.aborted) return;
            setRoles(data.roles ?? []);
            setSelected((current) => data.roles?.includes(current) ? current : data.roles?.[0] ?? '');
        }).catch((error) => { if (!controller.signal.aborted) setError(error.response?.data?.message ?? 'Could not load roles. This screen requires an etcd administrator.'); });
        return () => controller.abort();
    }, [service, version]);

    useEffect(() => {
        const controller = new AbortController();
        setDetail(null); setDeleting(false); setRemoving(null); setConfirmation('');
        if (selected) service.GetRole(selected, controller.signal).then((data) => {
            if (!controller.signal.aborted) setDetail(data);
        }).catch((error) => { if (!controller.signal.aborted) setError(error.response?.data?.message ?? 'Could not load this role. Refresh the inventory.'); });
        return () => controller.abort();
    }, [service, selected, version]);

    const mutate = async (operation, message) => {
        if (readOnly || busy) return;
        setBusy(true); setError(''); setNotice('');
        try { await operation(); setNotice(message); setVersion((value) => value + 1); }
        catch (error) { setError(error.response?.data?.message ?? 'The operation could not be confirmed. Refresh before retrying.'); }
        finally { setBusy(false); }
    };

    return (
        <Stack spacing={2}>
            <Typography variant="h4" component="h1">Roles & permissions</Typography>
            <Typography color="text.secondary">Grant the minimum access needed. Permissions from all assigned roles combine; removing one rule may not remove access granted by another role.</Typography>
            {error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success" role="status">{notice}</Alert>}
            <Paper sx={{ p: 3 }} component="form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) mutate(async () => { await service.CreateRole(name.trim()); setSelected(name.trim()); setName(''); }, 'Role created. Grant permissions, then assign it to a user.'); }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField size="small" label="New role name" value={name} onChange={(event) => setName(event.target.value)} disabled={readOnly || busy} helperText="Creating a role does not assign it to anyone." />
                    <Button type="submit" variant="contained" disabled={readOnly || busy || !name.trim() || name.trim() === 'root'}>Create role</Button>
                </Stack>
            </Paper>
            <Paper sx={{ p: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField select label="Role" value={roles.includes(selected) ? selected : ''} onChange={(event) => { setError(''); setSelected(event.target.value); }} disabled={busy || !roles.length} sx={{ minWidth: 220 }}>
                        {roles.map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
                    </TextField>
                    <Button onClick={() => { setError(''); setVersion((value) => value + 1); }} disabled={busy}>Refresh roles</Button>
                    <Button color="error" onClick={() => { setDeleting(true); setConfirmation(''); }} disabled={readOnly || busy || !detail || detail.name !== selected || protectedRole}>Delete role…</Button>
                </Stack>
                {protectedRole && <Alert severity="warning" sx={{ mt: 2 }}>The built-in root role has unrestricted administrator access. Its rules cannot be edited or deleted here.</Alert>}
                {selected && (!detail || detail.name !== selected) && <Typography role="status" sx={{ mt: 2 }}>Loading role details…</Typography>}
                {detail && detail.name === selected && <>
                    <TableContainer sx={{ mt: 2, maxHeight: 320 }}><Table size="small" stickyHeader aria-label="Role permissions">
                        <TableHead><TableRow><TableCell>Access</TableCell><TableCell>Scope</TableCell><TableCell>Key / start</TableCell><TableCell>Exclusive end</TableCell><TableCell>Action</TableCell></TableRow></TableHead>
                        <TableBody>{detail.permissions.map((rule) => <TableRow key={`${rule.keyBase64}:${rule.rangeEndBase64}`}>
                            <TableCell>{rule.access}</TableCell><TableCell>{rule.scope}</TableCell><TableCell><code>{rule.key}</code>{rule.keyEncoding === 'base64' ? ' (base64)' : ''}</TableCell>
                            <TableCell><code>{rule.rangeEnd === '\u0000' ? 'End of keyspace' : rule.rangeEnd || 'Exact key'}</code>{rule.rangeEndEncoding === 'base64' ? ' (base64)' : ''}</TableCell>
                            <TableCell><Button disabled={readOnly || busy || protectedRole} onClick={() => setRemoving(rule)}>Remove</Button></TableCell>
                        </TableRow>)}{!detail.permissions.length && <TableRow><TableCell colSpan={5}>{protectedRole ? 'Unrestricted built-in administrator role.' : 'No rules yet. This role grants no key access until you add permissions.'}</TableCell></TableRow>}</TableBody>
                    </Table></TableContainer>
                    {!protectedRole && <Stack spacing={2} component="form" sx={{ mt: 3 }} onSubmit={(event) => {
                        event.preventDefault();
                        if (key && (scope !== 'range' || end)) mutate(() => service.GrantPermission({ name: selected, access, scope, key, rangeEnd: scope === 'range' ? end : '' }), 'Permission saved. A matching start/end replaces its previous access type.');
                    }}>
                        <Typography variant="h6" component="h2">Grant or replace a permission</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField select label="Access" value={access} onChange={(event) => setAccess(event.target.value)} disabled={readOnly || busy} sx={{ minWidth: 160 }}>
                                <MenuItem value="read">Read only</MenuItem><MenuItem value="write">Write only</MenuItem><MenuItem value="readwrite">Read and write</MenuItem>
                            </TextField>
                            <TextField select label="Scope" value={scope} onChange={(event) => setScope(event.target.value)} disabled={readOnly || busy} sx={{ minWidth: 180 }}>
                                <MenuItem value="prefix">Prefix</MenuItem><MenuItem value="exact">Exact key</MenuItem><MenuItem value="range">Byte-ordered range</MenuItem>
                            </TextField>
                            <TextField label="Key / prefix / range start" value={key} onChange={(event) => setKey(event.target.value)} disabled={readOnly || busy} fullWidth />
                        </Stack>
                        {scope === 'range' && <TextField label="Exclusive range end" value={end} onChange={(event) => setEnd(event.target.value)} disabled={readOnly || busy} />}
                        <Alert severity={access === 'read' ? 'info' : 'warning'}>{`Grant ${access} access to ${scopeDescription(scope, key, end)}. Keys are byte strings, not filesystem paths; /app and /app/ are different prefixes.`}</Alert>
                        <Button type="submit" variant="contained" disabled={readOnly || busy || !key || (scope === 'range' && !end)}>Save permission</Button>
                    </Stack>}
                </>}
            </Paper>
            <Dialog open={deleting} onClose={() => { if (!busy) setDeleting(false); }} aria-labelledby="delete-role-title">
                <DialogTitle id="delete-role-title">Delete role {selected}?</DialogTitle>
                <DialogContent><Alert severity="warning">Every assigned user loses this role's permissions. Keys are not deleted. Recreating the role does not restore its user assignments.</Alert>
                    <TextField label="Type the role name to confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} fullWidth sx={{ mt: 2 }} />
                </DialogContent><DialogActions><Button autoFocus onClick={() => setDeleting(false)} disabled={busy}>Keep role</Button>
                    <Button color="error" disabled={readOnly || busy || confirmation !== selected || protectedRole} onClick={() => mutate(async () => { await service.DeleteRole(selected); setSelected(''); setDeleting(false); }, 'Role deleted. User assignments were removed.')}>Delete role</Button>
                </DialogActions>
            </Dialog>
            <Dialog open={Boolean(removing)} onClose={() => { if (!busy) setRemoving(null); }} aria-labelledby="remove-permission-title">
                <DialogTitle id="remove-permission-title">Remove this permission?</DialogTitle>
                <DialogContent>Users assigned to {selected} lose this {removing?.access} rule for {removing?.key}. Other roles may still grant access.</DialogContent>
                <DialogActions><Button autoFocus disabled={busy} onClick={() => setRemoving(null)}>Keep permission</Button>
                    <Button color="error" disabled={readOnly || busy} onClick={() => mutate(async () => { await service.RevokePermission(selected, removing); setRemoving(null); }, 'Permission removed.')}>Remove permission</Button></DialogActions>
            </Dialog>
        </Stack>
    );
}
