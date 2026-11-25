import { Box, Link, Stack, Typography } from '@mui/material';
import { PageHeader, Section } from './shared/page';

export default function About() {
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <PageHeader
        title="About ETCD Adminer"
        description="A browser workspace for inspecting etcd keys, cluster telemetry and access controls."
      />
      <Stack spacing={3}>
        <Section title="Project & documentation">
          <Stack spacing={1.5}>
            <Link
              href="https://github.com/navodveduth/etcd-adminer"
              target="_blank"
              rel="noopener noreferrer"
            >
              Project source & setup documentation
            </Link>
            <Link href="https://etcd.io/docs/" target="_blank" rel="noopener noreferrer">
              etcd documentation
            </Link>
            <Typography variant="body2" color="text.secondary">
              Forked from{' '}
              <Link
                href="https://github.com/srimaln91/etcd-adminer"
                target="_blank"
                rel="noopener noreferrer"
              >
                srimaln91/etcd-adminer
              </Link>
              . Cluster server versions are shown in the Cluster view; this build does not expose an
              application version.
            </Typography>
          </Stack>
        </Section>
        <Section title="Workspace privacy & safety">
          <Stack spacing={2}>
            <Typography>
              Saved profiles contain metadata, not passwords. Passwords and drafts remain in this
              browser tab's memory. Reloading requires reauthentication. Use your browser password
              manager to save and autofill credentials; save prompts depend on your browser and its
              settings. For different backend passwords under the same username, label the saved
              entries by backend in your password manager. This does not keep a workspace connected
              after closing its tab. Use HTTPS when accessing Adminer remotely.
            </Typography>
            <Typography>
              Watches and automatic lease renewal belong to their workspace. Switching pages keeps
              them running; closing, disconnecting or reloading stops them. Browser sleep can still
              allow leases to expire.
            </Typography>
            <Typography>
              Logical JSON exports are not cluster snapshots. Export files and optional watch values
              may contain secrets. Keep them private and do not include credentials in issue
              reports.
            </Typography>
          </Stack>
        </Section>
        <Section title="Troubleshooting">
          <Stack spacing={1.5}>
            <Typography>
              For connection failures, test the selected backend from Connections. Endpoints, TLS
              certificates and server names are configured on the Adminer server.
            </Typography>
            <Typography>
              Administrator pages require the authenticated caller's etcd root role. Refresh access
              after role changes. An unavailable status RPC does not establish whether the cluster
              has write quorum.
            </Typography>
            <Typography>
              Open Shortcuts in the header (F1) for keyboard navigation and editor actions.
            </Typography>
          </Stack>
        </Section>
      </Stack>
    </Box>
  );
}
