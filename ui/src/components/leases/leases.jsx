import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { useDataService } from '../../data/context';
import { useReadOnly } from '../../readOnly';
import { useWorkspaceActivity } from '../../data/activity';
import {
  CopyValue,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ReadOnlyNotice,
  Section,
  StatCard,
} from '../shared/page';

export default function Leases() {
  const service = useDataService();
  const readOnly = useReadOnly();
  const [ids, setIDs] = useState([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState(null);
  const [ttl, setTTL] = useState('60');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [renewalStatus, setRenewalStatus] = useState('');
  const [sampleTime, setSampleTime] = useState(null);
  const [truncated, setTruncated] = useState(false);
  useWorkspaceActivity('renewal', autoRenew ? 'Lease renewal on' : '');
  const validTTL = /^\d+$/.test(ttl) && Number(ttl) >= 1 && Number(ttl) <= 604800;

  useEffect(() => {
    if (!autoRenew || autoRenew !== selected || readOnly || !selected) return;
    const controller = new AbortController();
    const lease = selected;
    const expires = Date.now() + 15 * 60 * 1000;
    let timer;
    const renew = async () => {
      if (Date.now() >= expires) {
        setAutoRenew(false);
        setRenewalStatus('Automatic renewal stopped after its 15-minute safety limit.');
        return;
      }
      try {
        const result = await service.RenewLease(lease, controller.signal);
        if (controller.signal.aborted) return;
        if (result.ttl <= 0) throw new Error('Lease expired.');
        setRenewalStatus(`Automatically renewed ${lease} at ${new Date().toLocaleTimeString()}.`);
        timer = setTimeout(renew, Math.max(1000, Math.min((result.ttl * 1000) / 3, 30000)));
      } catch (error) {
        if (!controller.signal.aborted) {
          setAutoRenew(false);
          setRenewalStatus(
            'Automatic renewal stopped: renewal could not be confirmed. The lease and attached keys may expire.',
          );
          setError(
            error.response?.data?.message ?? 'Lease renewal failed. Inspect its current TTL.',
          );
        }
      }
    };
    renew();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [autoRenew, selected, readOnly, service]);
  useEffect(() => {
    setAutoRenew(false);
  }, [selected]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    service
      .GetLeases(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setIDs(data.ids);
        setSelected((current) => (data.ids.includes(current) ? current : (data.ids[0] ?? '')));
        setTruncated(Boolean(data.truncated));
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error.response?.data?.message ??
              'Could not load leases. Check your connection and refresh.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, version]);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setRevoking(false);
    setConfirmation('');
    if (selected) {
      service
        .GetLease(selected, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setDetail(data);
            setSampleTime(new Date());
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setError(
              error.response?.data?.message ??
                'Could not inspect this lease. It may have expired; refresh the list.',
            );
        });
    }
    return () => controller.abort();
  }, [service, selected, version]);

  const mutate = async (operation, success) => {
    if (readOnly || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success);
      setVersion((value) => value + 1);
    } catch (error) {
      setError(
        error.response?.data?.message ??
          'The operation could not be confirmed. Refresh before retrying.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Leases & expiration"
        description="A lease deletes its attached keys when it expires or is revoked. Cluster-wide lease administration requires the etcd root role."
      />
      {readOnly && <ReadOnlyNotice />}
      <ErrorState
        message={error}
        onRetry={() => {
          setError('');
          setVersion((value) => value + 1);
        }}
      />
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      {truncated && (
        <Alert severity="warning">
          Showing the first 1,000 lease IDs. Search covers only this loaded inventory. Use etcd
          tooling for a larger inventory.
        </Alert>
      )}
      <Section
        title="Create an expiration lease"
        description="The TTL starts immediately, even before any keys are attached."
      >
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (validTTL)
              mutate(async () => {
                const lease = await service.GrantLease(Number(ttl));
                setSelected(lease.id);
              }, 'Lease created. Attach its ID to a key before it expires.');
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: 'wrap', mb: 2 }}
            aria-label="TTL presets"
          >
            {[
              ['1 minute', '60'],
              ['1 hour', '3600'],
              ['1 day', '86400'],
            ].map(([label, seconds]) => (
              <Button
                key={seconds}
                variant={ttl === seconds ? 'outlined' : 'text'}
                disabled={busy || readOnly}
                onClick={() => setTTL(seconds)}
              >
                {label}
              </Button>
            ))}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'start' }}>
            <TextField
              label="TTL in seconds"
              value={ttl}
              onChange={(event) => setTTL(event.target.value)}
              disabled={busy || readOnly}
              helperText="1 second to 7 days. The timer starts immediately."
              error={!validTTL}
              size="small"
            />
            <Button type="submit" variant="contained" disabled={!validTTL || busy || readOnly}>
              Create lease
            </Button>
          </Stack>
        </Box>
      </Section>
      <Section
        title="Inspect & renew"
        description="TTL is sampled, not a live countdown. Refresh before relying on the remaining time."
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'start' }}>
          <Autocomplete
            options={ids}
            value={ids.includes(selected) ? selected : null}
            onChange={(_event, value) => {
              setError('');
              setSelected(value ?? '');
            }}
            disabled={loading || busy || !ids.length}
            sx={{ width: { xs: '100%', sm: 300 }, minWidth: 0 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Lease ID"
                helperText="Search the loaded lease inventory."
              />
            )}
          />
          <Button
            disabled={loading || busy}
            onClick={() => {
              setError('');
              setVersion((value) => value + 1);
            }}
          >
            Refresh leases
          </Button>
        </Stack>
        {loading && <LoadingState label="Loading leases…" />}
        {!loading && !ids.length && !error && (
          <EmptyState
            compact
            title="No active leases"
            description="Create one above, then attach its ID in the key editor before it expires."
          />
        )}
        {detail && (
          <Stack spacing={2} sx={{ mt: 3 }}>
            <CopyValue value={detail.id} label="lease ID" />
            <Typography variant="caption" color="text.secondary">
              Sampled {sampleTime?.toLocaleTimeString() ?? 'Unavailable'}. Refresh to verify current
              TTL.
            </Typography>
            {detail.ttl <= 0 && (
              <Alert severity="warning">
                This lease was expired or unavailable at the last check. Attached keys may already
                have been deleted.
              </Alert>
            )}
            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
            >
              <StatCard
                label="Remaining TTL at last check"
                value={`${detail.ttl} seconds`}
                detail={`Granted: ${detail.grantedTTL} seconds`}
              />
              <StatCard
                label="Attached keys"
                value={detail.keyCount}
                detail={
                  detail.keyCount > detail.keys.length
                    ? 'First 100 shown below'
                    : 'All attached keys shown below'
                }
              />
            </Box>
            <Typography>
              Attached keys: <b>{detail.keyCount}</b>
              {detail.keyCount > detail.keys.length ? ' (first 100 shown)' : ''}
            </Typography>
            <Box
              component="ul"
              sx={{ maxHeight: 240, overflow: 'auto', pl: 2, overflowWrap: 'anywhere' }}
            >
              {detail.keys.map((item) => (
                <li key={`${item.keyEncoding}:${item.key}`}>
                  <code>{item.key}</code>
                  {item.keyEncoding === 'base64' ? ' (base64)' : ''}
                </li>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Renew once resets the TTL once. Optional workspace renewal lasts at most 15 minutes.
              Closing this workspace, disconnecting, or reloading stops renewal; switching pages
              within it does not. Browser sleep/throttling can still let keys expire.
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoRenew === selected}
                  disabled={readOnly || busy}
                  onChange={(event) => setAutoRenew(event.target.checked ? selected : false)}
                />
              }
              label="Automatically renew in this workspace (15-minute maximum)"
            />
            {renewalStatus && (
              <Alert severity={autoRenew ? 'info' : 'warning'} role="status">
                {renewalStatus}
              </Alert>
            )}
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Button
                disabled={readOnly || busy}
                onClick={() => mutate(() => service.RenewLease(detail.id), 'Lease renewed once.')}
              >
                Renew once
              </Button>
              <Button
                color="error"
                disabled={readOnly || busy}
                onClick={() => {
                  setConfirmation('');
                  setRevoking(true);
                }}
              >
                Revoke lease…
              </Button>
            </Stack>
          </Stack>
        )}
      </Section>
      <Dialog
        open={revoking && Boolean(detail)}
        onClose={() => {
          if (!busy) setRevoking(false);
        }}
        aria-labelledby="revoke-lease-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="revoke-lease-title">Revoke this lease?</DialogTitle>
        <DialogContent>
          <Alert severity="error">
            This permanently deletes ALL {detail?.keyCount ?? 0} attached keys, including any not
            shown above. This cannot be undone.
          </Alert>
          <TextField
            label="Type the lease ID to confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            fullWidth
            sx={{ mt: 2 }}
            disabled={busy}
          />
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setRevoking(false)} disabled={busy}>
            Keep lease
          </Button>
          <Button
            color="error"
            disabled={readOnly || busy || confirmation !== detail?.id}
            onClick={() =>
              mutate(async () => {
                await service.RevokeLease(detail.id);
                setSelected('');
                setRevoking(false);
              }, 'Lease revoked. Attached keys were deleted.')
            }
          >
            Revoke and delete keys
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
