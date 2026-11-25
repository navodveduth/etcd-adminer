import { useEffect, useId, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { CopyValue } from '../shared/page';

export default function NewKeyDialog({
  open,
  handleClose,
  handleSubmit,
  directory = false,
  prefix = '',
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setInvalid(false);
    }
  }, [open]);
  return (
    <Dialog open={Boolean(open)} onClose={handleClose} aria-labelledby={id} fullWidth maxWidth="xs">
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name) {
            setInvalid(true);
            return;
          }
          handleSubmit(name);
        }}
      >
        <DialogTitle id={id}>{directory ? 'New folder' : 'New key'}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {directory
              ? 'Folders are virtual prefixes, not etcd objects. An empty folder stays only in this workspace until you save a key beneath it.'
              : 'Create a draft beneath the selected prefix. Nothing is written to etcd until you save its value in the editor.'}
          </DialogContentText>
          <TextField
            autoFocus
            label="Name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setInvalid(false);
            }}
            fullWidth
            error={invalid}
            helperText={
              invalid ? 'Enter a nonempty name.' : 'Case and spaces are preserved exactly.'
            }
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Exact {directory ? 'virtual prefix' : 'key'} preview
          </Typography>
          <CopyValue value={`${prefix}${name}`} label="new key path" />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" type="submit">
            {directory ? 'Create folder' : 'Create draft'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
