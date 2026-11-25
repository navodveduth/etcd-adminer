import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  TableContainer,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

export function PageHeader({ title, description, actions, children }) {
  return (
    <Box component="header" sx={{ mb: 3 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            variant="h4"
            sx={{ fontWeight: 650, letterSpacing: '-.025em', mb: description ? 0.75 : 0 }}
          >
            {title}
          </Typography>
          {description && (
            <Typography color="text.secondary" sx={{ maxWidth: 850 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap' }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {children && <Box sx={{ mt: 2 }}>{children}</Box>}
    </Box>
  );
}

export function Section({ title, description, actions, children, sx, ...props }) {
  return (
    <Paper variant="outlined" {...props} sx={{ p: { xs: 2, sm: 3 }, minWidth: 0, ...sx }}>
      {(title || actions) && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography component="h2" variant="h6" sx={{ fontWeight: 600 }}>
                {title}
              </Typography>
            )}
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {description}
              </Typography>
            )}
          </Box>
          {actions && (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {actions}
            </Stack>
          )}
        </Stack>
      )}
      {children}
    </Paper>
  );
}

export function EmptyState({ title, description, action, compact = false }) {
  return (
    <Stack
      spacing={1.5}
      sx={{ alignItems: 'center', textAlign: 'center', px: 2, py: compact ? 3 : 6 }}
    >
      <InboxOutlinedIcon sx={{ fontSize: 36, color: 'text.disabled' }} aria-hidden="true" />
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ maxWidth: 480 }}>
        {description}
      </Typography>
      {action}
    </Stack>
  );
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again', severity = 'error' }) {
  if (!message) return null;
  return (
    <Alert
      severity={severity}
      sx={{ mb: 2, overflowWrap: 'anywhere' }}
      action={
        onRetry && (
          <Button color="inherit" size="small" onClick={onRetry}>
            {retryLabel}
          </Button>
        )
      }
    >
      {message}
    </Alert>
  );
}

export function LoadingState({ label = 'Loading…', rows = 3 }) {
  return (
    <Box role="status" aria-label={label} sx={{ py: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <CircularProgress size={18} />
        <Typography color="text.secondary" variant="body2">
          {label}
        </Typography>
      </Stack>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={42} sx={{ mb: 1 }} />
      ))}
    </Box>
  );
}

export function DataTable({ children, sx, ...props }) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      tabIndex={0}
      {...props}
      sx={{
        maxWidth: '100%',
        minWidth: 0,
        overflowX: 'auto',
        '& th': { bgcolor: 'action.hover', fontWeight: 600, whiteSpace: 'nowrap' },
        '& .MuiTableCell-stickyHeader': {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
          zIndex: 2,
        },
        '& td': { verticalAlign: 'top', overflowWrap: 'anywhere' },
        ...sx,
      }}
    >
      {children}
    </TableContainer>
  );
}

export function CopyValue({ value, label = 'value', mono = true, shorten = false }) {
  const [message, setMessage] = useState('');
  const text = value == null || value === '' ? 'Unavailable' : String(value);
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{ minWidth: 0, alignItems: 'center', maxWidth: '100%', position: 'relative' }}
    >
      <Tooltip title={shorten ? text : ''}>
        <Box
          component={mono ? 'code' : 'span'}
          sx={{
            fontSize: 'inherit',
            overflowWrap: 'anywhere',
            minWidth: 0,
            ...(shorten && {
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '20ch',
            }),
          }}
        >
          {text}
        </Box>
      </Tooltip>
      {text !== 'Unavailable' && (
        <Tooltip title={message || `Copy ${label}`}>
          <IconButton
            size="small"
            aria-label={`Copy ${label}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setMessage('Copied');
              } catch {
                setMessage('Copy unavailable. Select and copy the text.');
              }
            }}
          >
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
      <Box
        component="span"
        role="status"
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          overflow: 'hidden',
          clipPath: 'inset(50%)',
        }}
      >
        {message}
      </Box>
    </Stack>
  );
}

export function StatCard({ label, value, detail, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography
        variant="h5"
        component="p"
        sx={{ fontWeight: 600, mt: 1, overflowWrap: 'anywhere', color: color ?? 'text.primary' }}
      >
        {value ?? 'Unavailable'}
      </Typography>
      {detail && (
        <Typography color="text.secondary" variant="caption">
          {detail}
        </Typography>
      )}
    </Paper>
  );
}

export function ReadOnlyNotice({
  message = 'View only. Changes are disabled by instance policy or your current permissions.',
}) {
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      {message}
    </Alert>
  );
}

export function StatusBadge({ label, color = 'default' }) {
  return (
    <Chip size="small" variant="outlined" label={label} color={color} sx={{ fontWeight: 500 }} />
  );
}
