import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { useDataService, useCapabilities } from '../../data/context';
import { useReadOnly } from '../../readOnly';
import { Box, Typography } from '@mui/material';
import { CopyValue, EmptyState, LoadingState, StatusBadge } from '../shared/page';
import ConfirmationDialog from '../dialogs/confirmationDialog';

const MonacoEditor = lazy(() => import('./monacoEditor'));

export default function EditorComponent({
  etcdKey,
  isNewKey,
  onSaved,
  onDirtyChange,
  serverRevision,
  actions,
}) {
  const instanceReadOnly = useReadOnly();
  const capabilities = useCapabilities();
  const [keyWritable, setKeyWritable] = useState(false);
  const readOnly = instanceReadOnly || (capabilities !== null && !keyWritable);
  const service = useDataService();
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
  const [discardAction, setDiscardAction] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  useEffect(() => {
    if (!capabilities || !etcdKey) return;
    const controller = new AbortController();
    setKeyWritable(false);
    service
      .GetCapabilities(controller.signal, etcdKey)
      .then((value) => {
        if (!controller.signal.aborted) setKeyWritable(value.write === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setKeyWritable(false);
      });
    return () => controller.abort();
  }, [service, etcdKey, capabilities]);

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
      service
        .FetchKey(etcdKey, controller.signal)
        .then((data) => {
          if (controller.signal.aborted || generation.current !== current) return;
          setRecord(data);
          setValue(data.value);
          setStatus('ready');
        })
        .catch(() => {
          if (controller.signal.aborted || generation.current !== current) return;
          setStatus('error');
          setMessage({
            severity: 'error',
            text: 'Could not load this key. Reload before editing.',
          });
        });
    }
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [etcdKey, isNewKey, reload, service, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changeValue = (next) => {
    const text = next ?? '';
    setValue(text);
    onDirtyChange?.(text !== original || leaseMode !== 'preserve');
  };

  const reloadKey = () => {
    if (dirty) {
      setDiscardAction('reload');
      return;
    }
    setReload((version) => version + 1);
  };

  const save = async () => {
    if (readOnly || status !== 'ready' || saving || !etcdKey) return;
    const current = generation.current;
    setSaving(true);
    setMessage(null);
    try {
      if (leaseMode === 'preserve')
        await service.PutKey(etcdKey, value, String(record?.modRevision ?? '0'));
      else
        await service.PutKey(
          etcdKey,
          value,
          String(record?.modRevision ?? '0'),
          leaseMode === 'detach' ? '0' : lease,
        );
      if (generation.current !== current) return;
      onDirtyChange?.(false);
      onSaved?.(etcdKey);
      setReload((version) => version + 1);
    } catch (error) {
      if (generation.current !== current) return;
      setMessage({
        severity: 'error',
        text:
          error.response?.status === 409
            ? 'This key changed on the server. Your draft is preserved; copy it before reloading.'
            : `${error.response?.data?.message ?? 'Could not save this key.'} Your draft is preserved.`,
      });
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
    <Paper
      component="section"
      aria-label="Key value editor"
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopPropagation();
          save();
        }
      }}
      variant="outlined"
      sx={{ p: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}
    >
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ mb: 1, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography component="h2" variant="h6">
          Value editor
        </Typography>
        {actions}
      </Stack>
      {etcdKey && (
        <Box sx={{ mb: 1, minWidth: 0 }}>
          <CopyValue value={etcdKey} label="exact key" />
        </Box>
      )}
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap', mb: 1.5, fontSize: 13, alignItems: 'center' }}
      >
        <StatusBadge
          label={dirty ? 'Unsaved changes' : isNewKey ? 'New key draft' : 'Saved value'}
          color={dirty ? 'warning' : 'default'}
        />
        <span>
          <b>Revision:</b> {record?.modRevision ?? 'New'}
        </span>
        <span>
          <b>Lease:</b> {record?.lease && String(record.lease) !== '0' ? record.lease : 'None'}
        </span>
      </Stack>
      {message && (
        <Alert severity={message.severity} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}
      {capabilities && !instanceReadOnly && !keyWritable && etcdKey && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Editing is disabled until write access to this exact key is confirmed.
        </Alert>
      )}
      {serverRevision && record && serverRevision !== record.modRevision && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Live update: this key changed or was deleted. Your draft has not been replaced. Reload to
          inspect current data; saving still checks the loaded revision.
        </Alert>
      )}
      {etcdKey && (!readOnly || leaseMode !== 'preserve') && (
        <Box
          component="details"
          open={leaseMode !== 'preserve' ? true : undefined}
          sx={{ mb: 1.5, fontSize: 12, color: 'text.secondary' }}
        >
          <Box component="summary" sx={{ cursor: 'pointer', py: 0.5 }}>
            Expiration on save ·{' '}
            {leaseMode === 'preserve'
              ? 'Preserve lease'
              : leaseMode === 'detach'
                ? 'Remove expiration'
                : 'Attach lease'}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              size="small"
              label="Expiration on save"
              value={leaseMode}
              disabled={readOnly || saving || status !== 'ready'}
              onChange={(event) => {
                setLeaseMode(event.target.value);
                onDirtyChange?.(value !== original || event.target.value !== 'preserve');
              }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="preserve">Preserve existing lease</MenuItem>
              <MenuItem value="detach">Remove expiration</MenuItem>
              <MenuItem value="attach">Attach a lease ID</MenuItem>
            </TextField>
            {leaseMode === 'attach' && (
              <TextField
                size="small"
                label="Lease ID"
                value={lease}
                onChange={(event) => setLease(event.target.value)}
                disabled={readOnly || saving}
                helperText="The key will be deleted when this lease expires."
              />
            )}
          </Stack>
        </Box>
      )}
      <Stack
        aria-label="Editor actions"
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ mb: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Select
            size="small"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            inputProps={{ 'aria-label': 'Value language' }}
          >
            <MenuItem value="yaml">YAML</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
            <MenuItem value="plaintext">Text</MenuItem>
          </Select>
          <Button onClick={formatJSON} disabled={readOnly || status !== 'ready' || saving}>
            Format JSON
          </Button>
        </Stack>
        <Stack
          role="group"
          aria-label="Save and draft actions"
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ ml: 'auto', justifyContent: 'flex-end', flexWrap: 'wrap', maxWidth: '100%' }}
        >
          <Button
            variant="contained"
            onClick={save}
            disabled={
              readOnly ||
              status !== 'ready' ||
              saving ||
              !etcdKey ||
              (leaseMode === 'attach' && !/^-?[1-9]\d*$/.test(lease))
            }
          >
            Save
          </Button>
          <Button
            onClick={() => {
              setDiscardAction('discard');
            }}
            disabled={!dirty || saving}
          >
            Discard
          </Button>
          <Button onClick={reloadKey} disabled={!etcdKey || saving || isNewKey}>
            Reload
          </Button>
          <Button
            disabled={status !== 'ready'}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                setCopyNotice('Draft copied. It may contain secrets; keep it private.');
              } catch {
                setCopyNotice(
                  'Clipboard unavailable. Select the editor text and copy it manually.',
                );
              }
            }}
          >
            Copy draft
          </Button>
        </Stack>
      </Stack>
      {status === 'loading' && <LoadingState label="Loading key…" />}
      {status === 'idle' && (
        <EmptyState
          title="Select a key"
          description="Choose a key from the folder or list view to inspect its value, revision and expiration. Unsaved drafts stay in this workspace."
        />
      )}
      {status === 'ready' && (
        <Suspense fallback={<LoadingState label="Loading editor…" />}>
          <MonacoEditor
            height="clamp(220px, 42vh, 480px)"
            language={language}
            theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
            value={value}
            onChange={changeValue}
            options={{ readOnly: readOnly || saving, automaticLayout: true }}
          />
        </Suspense>
      )}
      {copyNotice && (
        <Typography role="status" variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          {copyNotice}
        </Typography>
      )}
      <ConfirmationDialog
        open={Boolean(discardAction)}
        title="Discard this draft?"
        content="Unsaved value and expiration changes will be lost. Copy any text you want to keep before continuing."
        confirmLabel={discardAction === 'reload' ? 'Discard & reload' : 'Discard draft'}
        onCancel={() => setDiscardAction('')}
        onConfirm={() => {
          setValue(original);
          setLeaseMode('preserve');
          setLease('');
          onDirtyChange?.(false);
          if (discardAction === 'reload') setReload((version) => version + 1);
          setDiscardAction('');
        }}
      />
    </Paper>
  );
}
