import { useId } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

export default function ConfirmationDialog({
  open,
  title,
  content,
  onCancel,
  onConfirm,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  destructive = true,
  warning,
}) {
  const id = useId();
  return (
    <Dialog
      open={Boolean(open)}
      onClose={() => {
        if (!busy) onCancel();
      }}
      aria-labelledby={id}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id={id}>{title}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {content}
        </Typography>
        {warning && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {warning}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button autoFocus disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant="contained"
          color={destructive ? 'error' : 'primary'}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
