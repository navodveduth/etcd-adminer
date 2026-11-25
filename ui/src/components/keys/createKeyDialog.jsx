import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useDataService } from '../../data/context';
import { useWorkspaceActivity } from '../../data/activity';
import { useReadOnly } from '../../readOnly';
import ConfirmationDialog from '../dialogs/confirmationDialog';

export default function CreateKeyDialog({ initialKey = '', onClose, onCreated }) {
  const id = useId();
  const service = useDataService();
  const readOnly = useReadOnly();
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const controller = useRef(null);
  const dirty = key !== initialKey || value !== '';
  const keyBytes = new TextEncoder().encode(key).length;
  const valueBytes = new TextEncoder().encode(value).length;
  const valid = keyBytes > 0 && keyBytes <= 8192 && valueBytes <= 128 * 1024;
  useWorkspaceActivity('create-key', busy ? 'Creating key' : '');
  useWorkspaceActivity('new-key-draft', dirty ? 'New key draft' : '');
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const close = () => {
    if (!busy) {
      if (dirty) setDiscarding(true);
      else onClose();
    }
  };
  const create = async (event) => {
    event.preventDefault();
    if (busy || readOnly || !valid) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setMessage(null);
    try {
      await service.PutKey(key, value, '0', undefined, abort.signal);
      if (!abort.signal.aborted) onCreated(key);
    } catch (error) {
      if (!abort.signal.aborted)
        setMessage({
          severity: 'error',
          text:
            error.response?.status === 409
              ? 'This key already exists. Nothing was overwritten. Choose another path, or open the existing key in the editor.'
              : `${error.response?.data?.message ?? 'Key creation could not be confirmed. Inspect this exact key before retrying.'} Your input is preserved.`,
        });
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  return (
    <>
      <Dialog open onClose={close} aria-labelledby={id} fullWidth maxWidth="md">
        <Box component="form" onSubmit={create}>
          <DialogTitle id={id}>New key & value</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <Typography color="text.secondary">
                Enter the exact key path and its value. Parent folders appear automatically; you do
                not need to create them first.
              </Typography>
              <TextField
                autoFocus
                label="Full key path"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setMessage(null);
                }}
                placeholder="/system/automation-services/driver-simulator/common/redis/pool-timeout"
                disabled={busy || readOnly}
                error={keyBytes > 8192}
                helperText={
                  keyBytes > 8192
                    ? 'Key exceeds 8192 UTF-8 bytes.'
                    : 'Case, slashes and spaces are preserved exactly. Existing keys are never overwritten.'
                }
                fullWidth
                slotProps={{
                  htmlInput: { spellCheck: false },
                  input: { sx: { fontFamily: 'monospace', fontSize: 14 } },
                }}
              />
              <TextField
                label="Value"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setMessage(null);
                }}
                disabled={busy || readOnly}
                multiline
                minRows={6}
                maxRows={14}
                fullWidth
                error={valueBytes > 128 * 1024}
                helperText={`${valueBytes.toLocaleString()} / 131,072 UTF-8 bytes. Empty values are allowed. Text is stored exactly, without JSON/YAML conversion.`}
                slotProps={{
                  htmlInput: { spellCheck: false },
                  input: { sx: { fontFamily: 'monospace', fontSize: 14 } },
                }}
              />
              <Typography variant="body2" color="text.secondary">
                The new key has no lease / TTL. You can attach a lease later in the value editor.
                Your current editor draft will not be replaced.
              </Typography>
              {busy && <LinearProgress aria-label="Creating key" />}
              {message && (
                <Alert severity={message.severity} role="status" sx={{ overflowWrap: 'anywhere' }}>
                  {message.text}
                </Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            {busy && (
              <Button
                onClick={() => {
                  controller.current?.abort();
                  setBusy(false);
                  setMessage({
                    severity: 'warning',
                    text: 'Request cancelled. The key may already have been created. Inspect the exact path before retrying; your input is preserved.',
                  });
                }}
              >
                Cancel request
              </Button>
            )}
            <Button variant="contained" type="submit" disabled={busy || readOnly || !valid}>
              {busy ? 'Creating…' : 'Create key'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <ConfirmationDialog
        open={discarding}
        title="Discard new key input?"
        content="The key path and value entered here will be discarded. Your existing editor draft will not be changed. Cancelling does not undo an already submitted request."
        confirmLabel="Discard input"
        onCancel={() => setDiscarding(false)}
        onConfirm={onClose}
      />
    </>
  );
}
