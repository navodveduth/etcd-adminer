import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useDataService } from '../data/context';
import { displayKey, encodeKey, parseTransfer } from '../data/transfer';
import { useReadOnly } from '../readOnly';

export default function Transfer() {
    const service = useDataService();
    const readOnly = useReadOnly();
    const location = useLocation();
    const [operation, setOperation] = useState(location.state?.keys ? 'delete' : 'import');
    const [records, setRecords] = useState(() => (location.state?.keys ?? []).map((key) => ({ keyBase64: encodeKey(key), valueBase64: '' })));
    const [policy, setPolicy] = useState('create');
    const [preview, setPreview] = useState(null);
    const [confirmation, setConfirmation] = useState('');
    const [prefix, setPrefix] = useState('');
    const [cursor, setCursor] = useState('');
    const [pageNumber, setPageNumber] = useState(1);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const controller = useRef(null);
    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        if (!location.state?.keys) return;
        controller.current?.abort(); setBusy(false);
        setOperation('delete'); setPreview(null); setConfirmation('');
        setRecords(location.state.keys.map((key) => ({ keyBase64: encodeKey(key), valueBase64: '' })));
    }, [location.key, location.state]);
    const invalidate = () => { setPreview(null); setConfirmation(''); setMessage(null); };
    const run = async (action) => {
        if (busy) return;
        const abort = new AbortController(); controller.current = abort;
        setBusy(true); setMessage(null);
        try { await action(abort.signal); }
        catch (error) {
            setPreview(null); setConfirmation('');
            if (!abort.signal.aborted) setMessage({ severity: 'error', text: error.response?.data?.message ?? error.message ?? 'Outcome could not be confirmed. Inspect keys and preview again before retrying.' });
        } finally { if (!abort.signal.aborted) setBusy(false); }
    };
    const cancel = () => {
        controller.current?.abort(); setBusy(false); invalidate();
        setMessage({ severity: 'warning', text: 'Request cancelled. An already submitted transaction may have committed. Inspect the keys and preview again; do not blindly retry.' });
    };
    const batch = { version: 1, operation, policy, records };
    return <Stack spacing={3}>
        <Typography variant="h4" component="h1">Import, export & bulk delete</Typography>
        <Alert severity="info">Logical JSON transfer, not a cluster snapshot. Keys and values use base64 to preserve arbitrary bytes. Revisions and lease IDs are not restored. Overwrites preserve an existing key's lease; new keys have no lease.</Alert>
        {message && <Alert severity={message.severity} role="status">{message.text}</Alert>}
        {busy && <Stack spacing={1}><LinearProgress aria-label="Transfer in progress" /><Button onClick={cancel}>Cancel request</Button></Stack>}
        <Paper sx={{ p: 3 }}><Stack spacing={2}>
            <Typography variant="h6" component="h2">Export readable keys</Typography>
            <TextField label="Export prefix (blank = all readable keys)" value={prefix} disabled={busy} onChange={(event) => { setPrefix(event.target.value); setCursor(''); setPageNumber(1); }} />
            <Typography variant="body2">Download up to 20 records / approximately 1 MiB per file. Subsequent pages keep the same snapshot revision. Import one page at a time. Files contain secrets—store them securely.</Typography>
            <Button disabled={busy} onClick={() => run(async (signal) => {
                const data = await service.ExportPage({ prefix, cursor }, signal);
                if (signal.aborted) return;
                const blob = new Blob([JSON.stringify({ version: 1, revision: data.revision, records: data.records }, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a'); link.href = url; link.download = `etcd-export-${data.revision}-page-${pageNumber}.json`; link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setCursor(data.nextCursor ?? ''); setPageNumber(data.hasMore ? pageNumber + 1 : 1);
                setMessage({ severity: 'success', text: `${data.records.length} records downloaded at revision ${data.revision}. ${data.hasMore ? 'More pages remain; download the next page.' : 'Export complete. Another download starts a new snapshot.'}` });
            })}>{cursor ? `Download next page (${pageNumber})` : 'Download first page'}</Button>
            {cursor && <Button disabled={busy} onClick={() => { setCursor(''); setPageNumber(1); }}>Restart export</Button>}
        </Stack></Paper>
        <Paper sx={{ p: 3 }}><Stack spacing={2}>
            <Typography variant="h6" component="h2">Preview before changing keys</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField select label="Operation" value={operation} disabled={busy || readOnly} onChange={(event) => { setOperation(event.target.value); invalidate(); }} sx={{ minWidth: 200 }}><MenuItem value="import">Import values</MenuItem><MenuItem value="delete">Delete listed exact keys</MenuItem></TextField>
                <TextField select label="Conflict policy" value={policy} disabled={busy || readOnly || operation === 'delete'} onChange={(event) => { setPolicy(event.target.value); invalidate(); }} sx={{ minWidth: 200 }}><MenuItem value="create">Create only</MenuItem><MenuItem value="overwrite">Allow overwrites</MenuItem></TextField>
                <Button component="label" disabled={busy || readOnly}>Choose JSON file<input type="file" accept="application/json,.json" hidden onChange={async (event) => {
                    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
                    invalidate();
                    try {
                        if (file.size > 2 * 1024 * 1024) throw new Error('File exceeds 2 MiB.');
                        setRecords(parseTransfer(await file.text()));
                    } catch (error) { setRecords([]); setMessage({ severity: 'error', text: error.message }); }
                }} /></Button>
            </Stack>
            <Typography variant="body2">{records.length} exact keys selected. Maximum 50 per atomic batch. Preview needs read access; mutations also require write access. Larger transfers are separate batches, not globally atomic.</Typography>
            <Button disabled={busy || readOnly || !records.length || records.length > 50} onClick={() => run(async (signal) => {
                const result = await service.TransferBatch({ ...batch, dryRun: true }, signal);
                if (!signal.aborted) { setPreview(result); setConfirmation(''); }
            })}>Validate & preview</Button>
            {preview && <>
                <Alert severity={operation === 'delete' || preview.existing ? 'warning' : 'info'}>{preview.existing} existing keys; {records.length - preview.existing} absent. {operation === 'delete' ? 'Only these exact keys will be deleted; descendants are not included.' : policy === 'create' && preview.existing ? 'Create-only conflicts: select overwrite and preview again, or change the file.' : 'Review the keys below. Existing values may be replaced.'} Preview does not reserve state.</Alert>
                <TableContainer sx={{ maxHeight: 300 }}><Table size="small" aria-label="Transfer preview"><TableHead><TableRow><TableCell>Exact key</TableCell><TableCell>Current revision</TableCell></TableRow></TableHead>
                    <TableBody>{preview.records.map((record) => <TableRow key={record.keyBase64}><TableCell sx={{ wordBreak: 'break-all' }}>{displayKey(record.keyBase64)}</TableCell><TableCell>{record.expectedRevision === '0' ? 'Absent' : record.expectedRevision}</TableCell></TableRow>)}</TableBody>
                </Table></TableContainer>
                <TextField label={`Type ${operation.toUpperCase()} ${records.length} to confirm`} value={confirmation} disabled={busy || readOnly} onChange={(event) => setConfirmation(event.target.value)} />
                <Button color={operation === 'delete' ? 'error' : 'primary'} variant="contained" disabled={busy || readOnly || confirmation !== `${operation.toUpperCase()} ${records.length}` || (operation === 'import' && policy === 'create' && preview.existing > 0)} onClick={() => run(async (signal) => {
                    const result = await service.TransferBatch({ ...batch, dryRun: false, records: preview.records, confirmation }, signal);
                    if (!signal.aborted) { setPreview(null); setRecords([]); setConfirmation(''); setMessage({ severity: 'success', text: `All ${preview.records.length} operations committed atomically at revision ${result.revision}.` }); }
                })}>Apply atomic batch</Button>
            </>}
        </Stack></Paper>
    </Stack>;
}
