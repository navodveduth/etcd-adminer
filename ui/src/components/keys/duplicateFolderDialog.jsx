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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useDataService } from '../../data/context';
import { useWorkspaceActivity } from '../../data/activity';
import { useReadOnly } from '../../readOnly';
import {
  applyFolderCopy,
  copyDestinationError,
  folderPrefix,
  previewFolderCopy,
} from '../../data/duplicateFolder';
import { displayKey } from '../../data/transfer';
import { CopyValue, DataTable } from '../shared/page';

export default function DuplicateFolderDialog({ source, onClose, onCopied }) {
  const id = useId();
  const service = useDataService();
  const readOnly = useReadOnly();
  const [destination, setDestination] = useState(`${source.replace(/\/$/, '')}-copy`);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState(null);
  const [complete, setComplete] = useState(false);
  const controller = useRef(null);
  const deadline = useRef(null);
  const phase = useRef('');
  const confirmed = useRef(0);
  useEffect(
    () => () => {
      controller.current?.abort();
      clearTimeout(deadline.current);
    },
    [],
  );
  useWorkspaceActivity('duplicate-folder', busy ? 'Folder copy in progress' : '');
  const validation = copyDestinationError(source, destination);

  const run = async (applying) => {
    if (
      busy ||
      readOnly ||
      validation ||
      (applying && (!preview || confirmation !== `COPY ${preview.count}`))
    )
      return;
    const abort = new AbortController();
    controller.current = abort;
    deadline.current = setTimeout(() => cancel(true), 120000);
    phase.current = applying ? 'apply' : 'preview';
    confirmed.current = 0;
    setBusy(true);
    setMessage(null);
    setComplete(false);
    setProgress(applying ? 'Starting copy…' : 'Reading source snapshot…');
    try {
      if (applying) {
        const copied = await applyFolderCopy(service, preview, {
          signal: abort.signal,
          onProgress: (count) => {
            confirmed.current = count;
            setProgress(`${count} / ${preview.count} keys confirmed copied.`);
          },
        });
        if (abort.signal.aborted) return;
        setMessage({
          severity: 'success',
          text: `${copied} keys copied to ${preview.destination}. The source was not modified. Copied keys have no lease or expiration.`,
        });
        setPreview(null);
        setConfirmation('');
        setComplete(true);
        onCopied?.();
      } else {
        setPreview(null);
        setConfirmation('');
        const result = await previewFolderCopy(service, {
          source,
          destination,
          signal: abort.signal,
          onProgress: setProgress,
        });
        if (!abort.signal.aborted) setPreview(result);
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setPreview(null);
        setConfirmation('');
        const reason = error.response?.data?.message ?? error.message ?? 'Request failed.';
        setMessage({
          severity: 'error',
          text: applying
            ? `${confirmed.current} keys confirmed copied before stopping. ${reason} A submitted batch may have committed even if its response was lost. Inspect the destination before copying again; nothing is rolled back automatically.`
            : `${reason} No copy was applied.`,
        });
      }
    } finally {
      if (controller.current === abort) {
        clearTimeout(deadline.current);
        if (!abort.signal.aborted) {
          setBusy(false);
          phase.current = '';
        }
      }
    }
  };
  const cancel = (timedOut = false) => {
    clearTimeout(deadline.current);
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setPreview(null);
    setConfirmation('');
    setMessage({
      severity: 'warning',
      text: `${timedOut ? 'The 2-minute request limit was reached. ' : ''}${phase.current === 'apply' ? `Copy stopped. ${confirmed.current} keys confirmed copied. The last submitted batch may also have committed. Inspect the destination before retrying; copied keys are not rolled back.` : 'Preview cancelled. No copy was applied.'}`,
    });
    phase.current = '';
  };
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      aria-labelledby={id}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle id={id}>Duplicate folder</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Source folder prefix
            </Typography>
            <CopyValue value={folderPrefix(source)} label="source folder prefix" />
          </Box>
          <TextField
            autoFocus
            label="Destination folder path"
            value={destination}
            onChange={(event) => {
              setDestination(event.target.value);
              setPreview(null);
              setConfirmation('');
              setMessage(null);
              setComplete(false);
              setProgress('');
            }}
            disabled={busy}
            error={Boolean(validation)}
            helperText={
              validation ||
              'Enter the full destination path. A trailing slash is added; case and spaces are preserved.'
            }
            fullWidth
          />
          <Alert severity="info">
            Copies all readable persisted keys below the source prefix, including keys not on the
            current browser page. Keys you cannot read and unsaved drafts are excluded. Existing
            destination keys are never overwritten; unrelated destination keys remain unchanged.
          </Alert>
          <Alert severity="warning">
            Values are copied exactly; embedded tenant IDs or paths are not rewritten. Copied keys
            have no lease / TTL, even if the source expires. Each batch is atomic, but the whole
            folder is not: a failure can leave a partial copy.
          </Alert>
          <Typography variant="caption" color="text.secondary">
            Limit: 1,000 keys / 16 MiB of source records, up to 128 KiB per value and 100 export
            pages. Each preview/copy has a 2-minute time limit. Source pages use one snapshot
            revision. Each write batch contains at most 20 keys.
          </Typography>
          {message && (
            <Alert severity={message.severity} sx={{ overflowWrap: 'anywhere' }} role="status">
              {message.text}
            </Alert>
          )}
          {busy && <LinearProgress aria-label="Folder duplication in progress" />}
          {progress && !complete && (
            <Typography role="status" variant="body2">
              {progress}
            </Typography>
          )}
          {preview && (
            <>
              <Typography variant="body2">
                {preview.count} keys · source snapshot {preview.revision} · {preview.pages.length}{' '}
                atomic batches. No keys have been copied yet.
              </Typography>
              <DataTable aria-label="Scrollable folder copy preview" sx={{ maxHeight: 280 }}>
                <Table stickyHeader size="small" aria-label="Folder copy destination keys">
                  <TableHead>
                    <TableRow>
                      <TableCell>Destination key</TableCell>
                      <TableCell>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.pages.flat().map((record) => (
                      <TableRow key={record.keyBase64}>
                        <TableCell sx={{ fontFamily: 'monospace' }}>
                          {displayKey(record.keyBase64)}
                        </TableCell>
                        <TableCell>Create only</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataTable>
              <TextField
                label={`Type COPY ${preview.count} to confirm`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={busy || readOnly}
                fullWidth
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button autoFocus={false} disabled={busy} onClick={onClose}>
          {complete ? 'Done' : 'Close'}
        </Button>
        {busy ? (
          <Button onClick={() => cancel()}>Cancel request</Button>
        ) : (
          !complete && (
            <Button
              variant={preview ? 'outlined' : 'contained'}
              disabled={readOnly || Boolean(validation)}
              onClick={() => run(false)}
            >
              {preview ? 'Preview again' : 'Preview copy'}
            </Button>
          )
        )}
        {preview && (
          <Button
            variant="contained"
            disabled={busy || readOnly || confirmation !== `COPY ${preview.count}`}
            onClick={() => run(true)}
          >
            Duplicate folder
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
