import { Alert, Box, Typography } from '@mui/material';
import { CopyValue } from '../shared/page';

export default function Node({ node }) {
  return (
    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
      {node.error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {node.error}
        </Alert>
      )}
      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '150px minmax(0, 1fr)' },
          columnGap: 2,
          rowGap: 1.5,
          m: 0,
          '& dt': { color: 'text.secondary', fontSize: 13 },
          '& dd': { m: 0, minWidth: 0, fontSize: 13 },
        }}
      >
        <dt>Member ID (decimal)</dt>
        <dd>
          <CopyValue value={node.ID} label="member ID" />
        </dd>
        <dt>Replication mode</dt>
        <dd>{node.isLearner ? 'Learner (non-voting)' : 'Voting member'}</dd>
        <dt>Client endpoints</dt>
        <dd>
          {node.clientUrls?.length
            ? node.clientUrls.map((url) => (
                <CopyValue key={url} value={url} label="client endpoint" />
              ))
            : 'Not advertised'}
        </dd>
        <dt>Peer endpoints</dt>
        <dd>
          {node.peerUrls?.length
            ? node.peerUrls.map((url) => <CopyValue key={url} value={url} label="peer endpoint" />)
            : 'Not advertised'}
        </dd>
        <dt>Raw database sizes</dt>
        <dd>
          <Typography variant="body2">
            Allocated:{' '}
            {node.available && node.dbSize != null ? `${node.dbSize} bytes` : 'Unavailable'} · In
            use:{' '}
            {node.available && node.dbSizeInUse != null
              ? `${node.dbSizeInUse} bytes`
              : 'Unavailable'}
          </Typography>
        </dd>
      </Box>
    </Box>
  );
}
