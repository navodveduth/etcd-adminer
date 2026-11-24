import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
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

function waitToReconnect(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
    });
}

export default function Watch() {
    const [params] = useSearchParams();
    const service = useMemo(() => new DataService(), []);
    const serviceRef = useRef(null);
    const controllerRef = useRef(null);
    const revisionRef = useRef('0');
    const [key, setKey] = useState(params.get('key') ?? '/');
    const [mode, setMode] = useState(params.get('mode') === 'exact' ? 'exact' : 'prefix');
    const [values, setValues] = useState(false);
    const [fromRevision, setFromRevision] = useState('');
    const [run, setRun] = useState(null);
    const [status, setStatus] = useState('Stopped');
    const [lastRevision, setLastRevision] = useState('0');
    const [events, setEvents] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!run) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        const bound = serviceRef.current;
        const signal = controller.signal;
        let failures = 0;
        const listen = async () => {
            while (!signal.aborted) {
                let plannedReconnect = false;
                try {
                    setStatus(failures ? `Reconnecting (${failures}/5)` : 'Connecting');
                    await bound.WatchChanges({ ...run, afterRevision: revisionRef.current }, (frame) => {
                        if (signal.aborted) return;
                        if (frame.event === 'resync') {
                            const problem = new Error(`${frame.data.message}. Some changes were not delivered. Restart from a known revision or inspect the keys again.`);
                            problem.fatal = true;
                            throw problem;
                        }
                        if (frame.event === 'ready') {
                            setStatus('Live');
                            revisionRef.current = frame.data.revision;
                            setLastRevision(frame.data.revision);
                        } else if (frame.event === 'changes') {
                            const previous = BigInt(revisionRef.current);
                            const incoming = frame.data.events.filter((event) => BigInt(event.revision) > previous).map((event) => ({ ...event, receivedAt: new Date().toLocaleTimeString() }));
                            if (incoming.length) {
                                setEvents((current) => [...incoming.reverse(), ...current].slice(0, 500));
                                revisionRef.current = frame.data.revision;
                                setLastRevision(frame.data.revision);
                                failures = 0;
                            }
                        } else if (frame.event === 'reconnect') { plannedReconnect = true; failures = 0; }
                    }, signal);
                    if (!plannedReconnect && !signal.aborted) throw new Error('The event stream disconnected.');
                } catch (problem) {
                    if (signal.aborted) return;
                    failures++;
                    if (problem.fatal || [400, 401, 403, 409].includes(problem.response?.status) || failures >= 5) {
                        setError(problem.response?.data?.message ?? problem.message);
                        setStatus('Needs attention');
                        setRun(null);
                        return;
                    }
                    setStatus(`Reconnecting (${failures}/5)`);
                }
                if (!signal.aborted) await waitToReconnect(plannedReconnect ? 300 : Math.min(1000 * 2 ** failures, 30000), signal);
            }
        };
        listen().catch((problem) => { if (!signal.aborted) { setError(problem.message); setStatus('Needs attention'); setRun(null); } });
        return () => {
            controller.abort();
            if (serviceRef.current === bound) serviceRef.current = null;
        };
    }, [run]);

    const start = () => {
        if (!key || (fromRevision && !/^\d+$/.test(fromRevision))) return;
        try {
            serviceRef.current = service.BindActiveSession();
            revisionRef.current = fromRevision ? BigInt(fromRevision).toString() : '0';
            setLastRevision(revisionRef.current);
            setEvents([]); setError('');
            setRun({ key, mode, values });
        } catch (error) { setError(error.message); }
    };

    return (
        <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={2}>
                <Typography variant="h4" component="h1">Live changes</Typography>
                <Chip label={status} color={status === 'Live' ? 'success' : status === 'Needs attention' ? 'warning' : 'default'} role="status" />
            </Stack>
            <Typography color="text.secondary">Watch new changes to a key or prefix. This is not an initial snapshot or a permanent audit log. Only the latest 500 events are kept in this tab.</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField label="Key or prefix" value={key} onChange={(event) => setKey(event.target.value)} disabled={Boolean(run)} fullWidth />
                        <TextField select label="Watch mode" value={mode} onChange={(event) => setMode(event.target.value)} disabled={Boolean(run)} sx={{ minWidth: 180 }}>
                            <MenuItem value="prefix">Prefix and descendants</MenuItem><MenuItem value="exact">Exact key only</MenuItem>
                        </TextField>
                    </Stack>
                    <TextField label="Resume after revision (optional)" value={fromRevision} onChange={(event) => setFromRevision(event.target.value)} disabled={Boolean(run)}
                        helperText="Leave blank for new changes from now. Use a known revision to replay newer changes; compacted history cannot be recovered here." size="small" />
                    <FormControlLabel control={<Checkbox checked={values} disabled={Boolean(run)} onChange={(event) => setValues(event.target.checked)} />} label="Include values (may contain secrets)" />
                    {values && <Alert severity="warning">Values will appear in this tab's event log. Do not share screenshots or leave a sensitive watch open unattended.</Alert>}
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" onClick={start} disabled={Boolean(run) || !key || (Boolean(fromRevision) && !/^\d+$/.test(fromRevision))}>Start watching</Button>
                        <Button onClick={() => { controllerRef.current?.abort(); setRun(null); setStatus('Stopped'); }} disabled={!run}>Stop</Button>
                        <Button onClick={() => setEvents([])} disabled={!events.length}>Clear visible log</Button>
                    </Stack>
                    <Typography variant="body2">Last complete revision: <code>{lastRevision}</code>. Connections renew periodically and resume automatically. Stop or leave this page to release the watch.</Typography>
                </Stack>
            </Paper>
            <TableContainer component={Paper} sx={{ maxHeight: '55vh' }}>
                <Table stickyHeader size="small" aria-label="Live change events">
                    <TableHead><TableRow><TableCell>Received</TableCell><TableCell>Change</TableCell><TableCell>Key</TableCell><TableCell>Revision</TableCell><TableCell>Value</TableCell></TableRow></TableHead>
                    <TableBody>
                        {events.map((event) => <TableRow key={`${event.revision}:${event.type}:${event.keyEncoding}:${event.key}`}>
                            <TableCell>{event.receivedAt}</TableCell><TableCell><Chip size="small" label={event.type} color={event.type === 'DELETE' ? 'warning' : 'success'} /></TableCell>
                            <TableCell sx={{ wordBreak: 'break-all' }}><code>{event.key}</code>{event.keyEncoding === 'base64' ? ' (base64)' : ''}</TableCell><TableCell>{event.revision}</TableCell>
                            <TableCell sx={{ maxWidth: 360, overflow: 'auto' }}><code>{event.value === undefined ? 'Not included' : event.value}</code>{event.valueEncoding === 'base64' ? ' (base64)' : ''}</TableCell>
                        </TableRow>)}
                        {!events.length && <TableRow><TableCell colSpan={5}>{run ? 'Waiting for new changes matching this watch…' : 'Start a watch to see new puts, deletes, and lease expirations.'}</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </TableContainer>
        </Stack>
    );
}
