import { Box, Button, IconButton, Stack, Tab, Tabs, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function WorkspaceTabs({ workspaces, active, onChange, onClose, onConnections }) {
  return (
    <Stack direction="row" spacing={1} sx={{ mb: 3, alignItems: 'center' }}>
      <Tabs
        value={workspaces.some((workspace) => workspace.id === active) ? active : false}
        onChange={(_event, id) => onChange(id)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Connection workspaces"
        sx={{ flex: 1 }}
      >
        {workspaces.map((workspace) => (
          <Tab
            id={`tab-${workspace.id}`}
            aria-controls={`panel-${workspace.id}`}
            value={workspace.id}
            key={workspace.id}
            label={
              <Box component="span">
                {workspace.profile.Name} · {workspace.profile.BackEnd} ·{' '}
                {workspace.profile.UserName}
              </Box>
            }
          />
        ))}
      </Tabs>
      {active && (
        <Tooltip title="Close active workspace (stops watches and renewal)">
          <IconButton aria-label="Close active workspace" onClick={() => onClose(active)}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      )}
      <Button onClick={onConnections}>Connections</Button>
    </Stack>
  );
}
