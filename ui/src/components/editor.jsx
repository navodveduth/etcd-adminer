import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import DataService from '../data/service';
import { useReadOnly } from '../readOnly';

const MonacoEditor = lazy(() => import('./monacoEditor'));

export default function EditorComponent({ etcdKey, isNewKey, onSaved, onDirtyChange }) {
    const readOnly = useReadOnly();
    const service = useMemo(() => new DataService(), []);
    const theme = useTheme();
    const generation = useRef(0);
    const [record, setRecord] = useState(null);
    const [value, setValue] = useState('');
    const [status, setStatus] = useState('idle');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [language, setLanguage] = useState('yaml');
    const [reload, setReload] = useState(0);
    const [leaseMode, setLeaseMode] = useState('preserve');
    const [lease, setLease] = useState('');
    const original = record?.value ?? '';
    const dirty = value !== original || leaseMode !== 'preserve';

    useEffect(() => {
        const current = ++generation.current;
        const controller = new AbortController();
        setRecord(null);
        setValue('');
        setMessage(null);
        setSaving(false);
        setLeaseMode('preserve');
        setLease('');
        onDirtyChange?.(false);
        if (!etcdKey) {
            setStatus('idle');
        } else if (isNewKey) {
            setStatus('ready');
        } else {
            setStatus('loading');
            service.FetchKey(etcdKey, controller.signal).then((data) => {
                if (controller.signal.aborted || generation.current !== current) return;
                setRecord(data);
                setValue(data.value);
                setStatus('ready');
            }).catch(() => {
                if (controller.signal.aborted || generation.current !== current) return;
                setStatus('error');
                setMessage({ severity: 'error', text: 'Could not load this key. Reload before editing.' });
            });
        }
        return () => {
            controller.abort();
            generation.current++;
        };
    }, [etcdKey, isNewKey, reload, service, onDirtyChange]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const changeValue = (next) => {
        const text = next ?? '';
        setValue(text);
        onDirtyChange?.(text !== original || leaseMode !== 'preserve');
    };

    const reloadKey = () => {
        if (dirty && !window.confirm('Discard unsaved changes and reload this key?')) return;
        setReload((version) => version + 1);
    };

    const save = async () => {
        if (readOnly || status !== 'ready' || saving || !etcdKey) return;
        const current = generation.current;
        setSaving(true);
        setMessage(null);
        try {
            if (leaseMode === 'preserve') await service.PutKey(etcdKey, value, String(record?.modRevision ?? '0'));
            else await service.PutKey(etcdKey, value, String(record?.modRevision ?? '0'), leaseMode === 'detach' ? '0' : lease);
            if (generation.current !== current) return;
            onDirtyChange?.(false);
            onSaved?.(etcdKey);
            setReload((version) => version + 1);
        } catch (error) {
            if (generation.current !== current) return;
            setMessage({ severity: 'error', text: error.response?.status === 409
                ? 'This key changed on the server. Your draft is preserved; copy it before reloading.'
                : `${error.response?.data?.message ?? 'Could not save this key.'} Your draft is preserved.` });
        } finally {
            if (generation.current === current) setSaving(false);
        }
    };

    const formatJSON = () => {
        try {
            changeValue(JSON.stringify(JSON.parse(value), null, 2));
            setLanguage('json');
            setMessage(null);
        } catch {
            setMessage({ severity: 'error', text: 'Invalid JSON. The value has not been changed.' });
        }
    };

    return (
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 500 }}>
            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
                <span><b>Key:</b> {etcdKey ?? 'None selected'}</span>
                <span><b>Revision:</b> {record?.modRevision ?? 'New'}</span>
                <span><b>Lease:</b> {record?.lease && String(record.lease) !== '0' ? record.lease : 'None'}</span>
            </Stack>
            {message && <Alert severity={message.severity} sx={{ mb: 2 }}>{message.text}</Alert>}
            {etcdKey && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                <TextField select size="small" label="Expiration on save" value={leaseMode} disabled={readOnly || saving || status !== 'ready'} onChange={(event) => {
                    setLeaseMode(event.target.value);
                    onDirtyChange?.(value !== original || event.target.value !== 'preserve');
                }} sx={{ minWidth: 220 }}>
                    <MenuItem value="preserve">Preserve existing lease</MenuItem>
                    <MenuItem value="detach">Remove expiration</MenuItem>
                    <MenuItem value="attach">Attach a lease ID</MenuItem>
                </TextField>
                {leaseMode === 'attach' && <TextField size="small" label="Lease ID" value={lease} onChange={(event) => setLease(event.target.value)} disabled={readOnly || saving} helperText="The key will be deleted when this lease expires." />}
            </Stack>}
            {status === 'loading' && <p role="status">Loading key…</p>}
            {status === 'idle' && <p>Select a key to edit its value.</p>}
            {status === 'ready' && (
                <Suspense fallback={<p role="status">Loading editor…</p>}>
                    <MonacoEditor
                        height="60vh"
                        language={language}
                        theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
                        value={value}
                        onChange={changeValue}
                        options={{ readOnly: readOnly || saving, automaticLayout: true }}
                    />
                </Suspense>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
                <Select size="small" value={language} onChange={(event) => setLanguage(event.target.value)} inputProps={{ 'aria-label': 'Value language' }}>
                    <MenuItem value="yaml">YAML</MenuItem>
                    <MenuItem value="json">JSON</MenuItem>
                    <MenuItem value="plaintext">Text</MenuItem>
                </Select>
                <Button onClick={formatJSON} disabled={readOnly || status !== 'ready' || saving}>Format JSON</Button>
                <Button variant="contained" onClick={save} disabled={readOnly || status !== 'ready' || saving || !etcdKey || (leaseMode === 'attach' && !/^-?[1-9]\d*$/.test(lease))}>Save</Button>
                <Button onClick={() => { setValue(original); setLeaseMode('preserve'); setLease(''); onDirtyChange?.(false); }} disabled={!dirty || saving}>Discard</Button>
                <Button onClick={reloadKey} disabled={!etcdKey || saving || isNewKey}>Reload</Button>
            </Stack>
        </Paper>
    );
}
