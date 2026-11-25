import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useDataService, useWorkspaceActive } from '../../data/context';
import { formatBytes as bytes } from '../../data/presentation';
import {
  CopyValue,
  DataTable,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  StatCard,
} from '../shared/page';
import ClusterTabs from './clusterTabs';

export default function Metrics() {
  const service = useDataService();
  const active = useWorkspaceActive();
  const [sample, setSample] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [interval, setIntervalSeconds] = useState(15);
  const [version, setVersion] = useState(0);
  const [age, setAge] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let inFlight = false;
    let failures = 0;
    const poll = async () => {
      if (!active || document.hidden || inFlight || controller.signal.aborted) return;
      inFlight = true;
      setLoading(true);
      try {
        const data = await service.GetMetrics(controller.signal);
        if (controller.signal.aborted) return;
        setSample(data);
        setError('');
        failures = 0;
        setHistory((items) => [...items, data].slice(-60));
      } catch (error) {
        failures++;
        if (!controller.signal.aborted)
          setError(
            error.response?.data?.message ??
              'Metrics unavailable. Last successful sample is retained and may be stale.',
          );
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (interval)
            timer = setTimeout(poll, Math.min(120, interval * 2 ** Math.min(failures, 3)) * 1000);
        }
      }
    };
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        poll();
      }
    };
    poll();
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [service, interval, version, active]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setAge(
          sample ? Math.max(0, Math.floor((Date.now() - Date.parse(sample.sampledAt)) / 1000)) : 0,
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [sample]);
  const available = sample?.members.filter((member) => member.available) ?? [];
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Cluster metrics"
        description="Maintenance telemetry from configured endpoints. Status availability is not a write-quorum test."
        actions={
          <Button
            variant="outlined"
            onClick={() => setVersion((value) => value + 1)}
            disabled={loading}
          >
            Refresh now
          </Button>
        }
      >
        <Chip
          size="small"
          variant="outlined"
          label={sample ? `${error ? 'Stale · ' : ''}${age}s since sample` : 'Waiting for sample'}
          color={error || age > 45 ? 'warning' : 'default'}
        />
      </PageHeader>
      <ClusterTabs />
      <Stack direction="row" spacing={2}>
        <TextField
          select
          size="small"
          label="Refresh"
          value={interval}
          onChange={(event) => setIntervalSeconds(Number(event.target.value))}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value={0}>Manual</MenuItem>
          <MenuItem value={15}>Every 15 seconds</MenuItem>
          <MenuItem value={30}>Every 30 seconds</MenuItem>
          <MenuItem value={60}>Every minute</MenuItem>
        </TextField>
      </Stack>
      {loading && <LinearProgress aria-label="Refreshing metrics" />}
      <ErrorState
        message={
          error &&
          `${error}${sample ? ' Last successful data is shown below and may be stale.' : ''}`
        }
        onRetry={() => setVersion((value) => value + 1)}
      />
      {!sample && loading && <LoadingState label="Loading cluster metrics" />}
      {sample && (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            {[
              ['Endpoints responding', `${available.length} / ${sample.members.length}`],
              [
                'Leader IDs observed',
                [...new Set(available.map((member) => member.leader))].join(', ') || 'Unavailable',
              ],
              ['Active alarms', sample.alarmError ? 'Unavailable' : sample.alarms.length],
            ].map(([title, value]) => (
              <StatCard key={title} label={title} value={value} />
            ))}
          </Box>
          {sample.truncated && (
            <Alert severity="warning">Only the first 16 configured endpoints are sampled.</Alert>
          )}
          {sample.alarmError && <Alert severity="warning">{sample.alarmError}</Alert>}
          {sample.alarms.map((alarm) => (
            <Alert key={`${alarm.member}:${alarm.type}`} severity="error">
              {alarm.member}: {alarm.type}.{' '}
              {alarm.type === 'NOSPACE'
                ? 'Database quota reached. Review retention, compaction and safe defragmentation before disarming.'
                : 'Investigate member integrity and etcd logs before taking corrective action.'}
            </Alert>
          ))}
          <DataTable aria-label="Scrollable metrics table">
            <Table aria-label="Member metrics" size="small">
              <TableHead>
                <TableRow>
                  {[
                    'Endpoint / member',
                    'Status',
                    'Version',
                    'Database / in use',
                    'Quota used',
                    'Raft term / applied lag',
                  ].map((label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sample.members.map((member) => (
                  <TableRow key={member.endpoint}>
                    <TableCell>
                      <CopyValue value={member.endpoint} label="metrics endpoint" mono={false} />
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        {member.id ?? 'Unknown member'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {member.available
                        ? member.id === member.leader
                          ? 'Leader'
                          : member.leader === '0'
                            ? 'No leader'
                            : 'Follower'
                        : member.error}
                      {member.errors?.map((error) => (
                        <Alert key={error} severity="warning">
                          {error}
                        </Alert>
                      ))}
                    </TableCell>
                    <TableCell>{member.version ?? 'Unavailable'}</TableCell>
                    <TableCell>
                      {member.available
                        ? `${bytes(member.dbSize)} / ${bytes(member.dbInUse)}`
                        : 'Unavailable'}
                    </TableCell>
                    <TableCell>
                      {member.available && member.quota
                        ? `${((member.dbSize / member.quota) * 100).toFixed(1)}% of ${bytes(member.quota)}`
                        : 'Unavailable'}
                    </TableCell>
                    <TableCell>
                      {member.available
                        ? `${member.term} / ${member.applyLag || 'Unknown'}`
                        : 'Unavailable'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
          <Typography variant="body2" color="text.secondary">
            Database is allocated size; in use is the live portion. Quota is unavailable when the
            backend does not report a supported limit, never assumed to be zero. Quota percentages
            above 100% require investigation.
          </Typography>
          <Section
            title="Database size trend"
            description="Up to 60 samples in this workspace, not persistent history. Gaps indicate unavailable members."
          >
            {sample.members.map((member) => {
              const values = history
                .map((item) => item.members.find((node) => node.endpoint === member.endpoint))
                .map((node) => (node?.available ? node.dbSize : null));
              const maximum = Math.max(1, ...values.filter((value) => value !== null));
              return (
                <Box key={member.endpoint} sx={{ mt: 2 }}>
                  <Typography variant="body2">{member.endpoint}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {values.length} samples · Vertical scale: 0 – {bytes(maximum)} allocated ·
                    Newest sample at right
                  </Typography>
                  <svg
                    viewBox="0 0 600 80"
                    width="100%"
                    height="80"
                    role="img"
                    aria-label={`Database size samples for ${member.endpoint}`}
                  >
                    {values.map((value, i) =>
                      value === null ? null : (
                        <rect
                          key={i}
                          x={600 - values.length * 10 + i * 10}
                          y={80 - (value / maximum) * 75}
                          width="7"
                          height={(value / maximum) * 75}
                          fill="currentColor"
                        >
                          <title>{bytes(value)}</title>
                        </rect>
                      ),
                    )}
                  </svg>
                </Box>
              );
            })}
          </Section>
          <Typography variant="caption">
            Sample: {new Date(sample.sampledAt).toLocaleString()} · {sample.source} · Binary size
            units, Raft indices/terms as decimal strings.
          </Typography>
        </>
      )}
      <Alert severity="info">
        Throughput, latency histograms, WAL fsync and commit rates need a separately configured
        Prometheus integration. They are unavailable here—not inferred from a status snapshot.
      </Alert>
    </Stack>
  );
}
