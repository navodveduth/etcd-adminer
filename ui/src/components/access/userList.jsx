import { useEffect, useState } from 'react';
import { Box, Button, TextField, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Link } from 'react-router-dom';
import ConfirmationDialog from '../dialogs/confirmationDialog';
import UserInfo from './userInfo';
import UserTable from './userTable';
import { useDataService, useWorkspaceActive } from '../../data/context';
import { useReadOnly } from '../../readOnly';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ReadOnlyNotice,
  Section,
} from '../shared/page';

export default function UserList() {
  const service = useDataService();
  const active = useWorkspaceActive();
  const readOnly = useReadOnly();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState('');
  const [removing, setRemoving] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    Promise.all([service.GetUsers(controller.signal), service.GetRoles(controller.signal)])
      .then(([users, roles]) => {
        if (!controller.signal.aborted) {
          setUsers(users);
          setRoles(roles);
          setError('');
          setSelected((current) => (users.includes(current) ? current : ''));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error.response?.data?.message ??
              'Could not refresh users and roles. Check administrator access.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, active, version]);
  const filtered = users.filter((name) => name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageHeader
        title="Users"
        description="Manage logins and role assignments. Removing a user removes access, not cluster keys."
        actions={
          <>
            <Button
              variant="outlined"
              disabled={loading || busy}
              onClick={() => setVersion((value) => value + 1)}
            >
              Refresh users
            </Button>
            <Button
              component={Link}
              to="/users/new"
              variant="contained"
              startIcon={<AddIcon />}
              disabled={readOnly}
            >
              Create user
            </Button>
          </>
        }
      />
      {readOnly && <ReadOnlyNotice />}
      <ErrorState message={error} onRetry={() => setVersion((value) => value + 1)} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Section
          title="User directory"
          description="Select a user to inspect roles or change their password."
          sx={{ display: { xs: selected ? 'none' : 'block', lg: 'block' } }}
        >
          <Stack spacing={2}>
            <TextField
              label="Search users"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {loading ? (
              <LoadingState label="Loading users" />
            ) : filtered.length ? (
              <UserTable
                users={filtered}
                selectedUser={selected}
                selectUser={setSelected}
                onDelete={setRemoving}
              />
            ) : (
              <EmptyState
                compact
                title={users.length ? 'No matching users' : 'No users reported'}
                description={
                  users.length
                    ? 'Try another username or clear the search.'
                    : 'Refresh the directory or create a least-privilege account.'
                }
                action={query && <Button onClick={() => setQuery('')}>Clear search</Button>}
              />
            )}
          </Stack>
        </Section>
        {selected ? (
          <Box sx={{ minWidth: 0 }}>
            <Button sx={{ mb: 2, display: { lg: 'none' } }} onClick={() => setSelected('')}>
              Back to user directory
            </Button>
            <UserInfo key={selected} allRoles={roles} userName={selected} />
          </Box>
        ) : (
          <Section sx={{ display: { xs: 'none', lg: 'block' } }}>
            <EmptyState
              title="Select a user"
              description="Assigned roles, permission links and password controls appear here."
            />
          </Section>
        )}
      </Box>
      <ConfirmationDialog
        open={Boolean(removing)}
        busy={busy}
        title={`Delete user ${removing}?`}
        content="This removes their login and role assignments, not their etcd keys. Protected accounts must be managed externally. This cannot be undone."
        confirmLabel="Delete user"
        onCancel={() => setRemoving('')}
        onConfirm={async () => {
          if (readOnly || busy) return;
          setBusy(true);
          try {
            await service.DeleteUser(removing);
            if (selected === removing) setSelected('');
            setRemoving('');
            setVersion((value) => value + 1);
          } catch (error) {
            setError(
              error.response?.data?.message ??
                'Deletion could not be confirmed. Refresh before retrying.',
            );
            setRemoving('');
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
