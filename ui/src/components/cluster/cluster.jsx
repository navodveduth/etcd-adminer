import { Fragment, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Collapse,
  IconButton,
  Stack,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import Node from './etcdNode';
import ClusterTabs from './clusterTabs';
import {
  CopyValue,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
} from '../shared/page';
import { useDataService, useWorkspaceActive } from '../../data/context';
import { formatBytes } from '../../data/presentation';

const role = (node) =>
  !node.available
    ? 'Unavailable'
    : node.isLearner
      ? 'Learner'
      : node.isLeader === 'leader'
        ? 'Leader'
        : node.isLeader === 'follower'
          ? 'Follower'
          : 'Unknown';

export default function ClusterInfo() {
  const service = useDataService();
  const active = useWorkspaceActive();
  const mobile = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [sampledAt, setSampledAt] = useState(null);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    service
      .GetClusterInfo(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError('');
          setSampledAt(new Date());
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error.response?.data?.message ??
              'Cluster inventory unavailable. Check this connection and administrator permissions.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, version, active]);
  const nodes = data?.nodes ?? [];
  const responding = nodes.filter((node) => node.available);
  return (
    <>
      <PageHeader
        title="Cluster"
        description="Membership and endpoint status for this connection. A responding endpoint is not a write-quorum health guarantee."
        actions={
          <Button
            startIcon={<RefreshIcon />}
            variant="outlined"
            onClick={() => setVersion((value) => value + 1)}
            disabled={loading}
          >
            Refresh members
          </Button>
        }
      />
      <ClusterTabs />
      <ErrorState
        message={
          error &&
          `${error}${data ? ' Last successful inventory is shown below and may be stale.' : ''}`
        }
        onRetry={() => setVersion((value) => value + 1)}
      />
      {!data && loading && <LoadingState label="Loading cluster members" />}
      {data && (
        <Stack spacing={3}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            <StatCard
              label="Endpoints responding"
              value={`${responding.length} / ${nodes.length}`}
              detail="Status RPC result at last check"
            />
            <StatCard
              label="Leader observed"
              value={
                responding.find((node) => node.isLeader === 'leader')?.name || 'Not identified'
              }
              detail="As reported by sampled members"
            />
            <StatCard
              label="Server versions"
              value={
                [...new Set(responding.map((node) => node.version).filter(Boolean))].join(', ') ||
                'Unavailable'
              }
              detail={sampledAt ? `Last checked ${sampledAt.toLocaleTimeString()}` : ''}
            />
          </Box>
          <Section
            title="Members"
            description="Database sizes are shown in binary units. Expand a member for endpoints, exact IDs and raw sizes."
          >
            {!nodes.length ? (
              <EmptyState
                title="No members reported"
                description="The backend returned an empty membership list. Refresh or verify the selected cluster."
                action={
                  <Button onClick={() => setVersion((value) => value + 1)}>Refresh members</Button>
                }
              />
            ) : mobile ? (
              <Stack spacing={1.5}>
                {nodes.map((node) => (
                  <Accordion key={node.ID} variant="outlined" disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={600}>{node.name || 'Unnamed member'}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.75, alignItems: 'center' }}>
                          <StatusBadge
                            label={role(node)}
                            color={
                              !node.available
                                ? 'warning'
                                : node.isLeader === 'leader'
                                  ? 'primary'
                                  : 'default'
                            }
                          />
                          <Typography variant="caption" color="text.secondary">
                            {node.available ? formatBytes(node.dbSize) : 'Status unavailable'}
                          </Typography>
                        </Stack>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Node node={node} />
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Stack>
            ) : (
              <DataTable aria-label="Scrollable member inventory">
                <Table size="small" aria-label="Cluster members">
                  <TableHead>
                    <TableRow>
                      <TableCell>Member</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Version</TableCell>
                      <TableCell>Allocated / in use</TableCell>
                      <TableCell>Client endpoint</TableCell>
                      <TableCell>Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nodes.map((node) => (
                      <Fragment key={node.ID}>
                        <TableRow>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {node.name || 'Unnamed member'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {node.available
                                ? 'Status responding'
                                : node.error || 'Status unavailable'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={role(node)}
                              color={
                                !node.available
                                  ? 'warning'
                                  : node.isLeader === 'leader'
                                    ? 'primary'
                                    : 'default'
                              }
                            />
                          </TableCell>
                          <TableCell>{node.version || 'Unavailable'}</TableCell>
                          <TableCell>
                            {node.available ? (
                              <>
                                {formatBytes(node.dbSize)}
                                <Typography
                                  variant="caption"
                                  display="block"
                                  color="text.secondary"
                                >
                                  {formatBytes(node.dbSizeInUse)} in use
                                </Typography>
                              </>
                            ) : (
                              'Unavailable'
                            )}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 300 }}>
                            <CopyValue
                              value={node.clientUrls?.[0]}
                              label={`endpoint for ${node.name || node.ID}`}
                              mono={false}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton
                              aria-label={`Show details for ${node.name || node.ID}`}
                              aria-expanded={expanded === node.ID}
                              onClick={() => setExpanded(expanded === node.ID ? null : node.ID)}
                            >
                              <ExpandMoreIcon
                                sx={{
                                  transform: expanded === node.ID ? 'rotate(180deg)' : undefined,
                                }}
                              />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            sx={{ p: 0, border: expanded === node.ID ? undefined : 0 }}
                          >
                            <Collapse in={expanded === node.ID} unmountOnExit>
                              <Node node={node} />
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </DataTable>
            )}
          </Section>
          <Section
            title="Cluster identity"
            description="IDs are exact decimal strings. Keyspace revisions are available in the key browser, not inferred from the membership response."
          >
            <Box
              component="dl"
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '150px minmax(0, 1fr)' },
                gap: 1.5,
                m: 0,
                '& dt': { color: 'text.secondary', fontSize: 14 },
                '& dd': { m: 0, minWidth: 0, fontSize: 14 },
              }}
            >
              <dt>Cluster ID</dt>
              <dd>
                <CopyValue value={data.clusterID} label="cluster ID" />
              </dd>
              <dt>Responding member ID</dt>
              <dd>
                <CopyValue value={data.memberID} label="responding member ID" />
              </dd>
              <dt>Raft term</dt>
              <dd>{data.raftTerm || 'Unavailable'}</dd>
            </Box>
          </Section>
        </Stack>
      )}
    </>
  );
}
