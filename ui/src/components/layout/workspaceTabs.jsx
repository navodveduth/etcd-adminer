import { useRef } from 'react';
import { Box, Button, IconButton, Paper, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import { workspaceLabel } from '../../data/presentation';

export default function WorkspaceTabs({ workspaces, active, onChange, onClose, onConnections }) {
  const tabs = useRef(new Map());
  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        display: 'flex',
        alignItems: 'center',
        minWidth: 0,
        overflow: 'hidden',
        borderRadius: 2,
      }}
    >
      <Box
        role="tablist"
        aria-label="Connection workspaces"
        sx={{ flex: 1, display: 'flex', minWidth: 0, overflowX: 'auto' }}
        onKeyDown={(event) => {
          if (event.target.getAttribute('role') !== 'tab') return;
          const index = workspaces.findIndex((item) => `tab-${item.id}` === event.target.id);
          let next;
          if (event.key === 'ArrowRight') next = (index + 1) % workspaces.length;
          if (event.key === 'ArrowLeft') next = (index - 1 + workspaces.length) % workspaces.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = workspaces.length - 1;
          if (next !== undefined) {
            event.preventDefault();
            tabs.current.get(workspaces[next].id)?.focus();
            onChange(workspaces[next].id);
          }
        }}
      >
        {!workspaces.length && (
          <Box sx={{ px: 2, py: 1.75, color: 'text.secondary', fontSize: 14 }}>
            Open a connection to create a workspace
          </Box>
        )}
        {workspaces.map((workspace, index) => (
          <Box
            key={workspace.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              borderBottom: 2,
              borderBottomColor: active === workspace.id ? 'primary.main' : 'transparent',
              bgcolor: active === workspace.id ? 'action.selected' : undefined,
            }}
          >
            <Tooltip
              describeChild
              title={`Backend: ${workspace.profile.BackEnd} · User: ${workspace.profile.UserName}`}
            >
              <Button
                id={`tab-${workspace.id}`}
                ref={(element) => {
                  if (element) tabs.current.set(workspace.id, element);
                  else tabs.current.delete(workspace.id);
                }}
                role="tab"
                aria-selected={active === workspace.id}
                aria-controls={`panel-${workspace.id}`}
                tabIndex={active === workspace.id || (!active && index === 0) ? 0 : -1}
                color={active === workspace.id ? 'primary' : 'inherit'}
                onClick={() => onChange(workspace.id)}
                sx={{
                  px: 2,
                  py: 1.5,
                  whiteSpace: 'nowrap',
                  maxWidth: 300,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                  textTransform: 'none',
                }}
              >
                {workspaceLabel(workspace.profile)}
              </Button>
            </Tooltip>
            <Tooltip title={`Close ${workspace.profile.Name} workspace`}>
              <IconButton
                aria-label={
                  active === workspace.id
                    ? 'Close active workspace'
                    : `Close ${workspace.profile.Name} workspace`
                }
                size="small"
                onClick={() => onClose(workspace.id)}
                sx={{ mr: 0.75 }}
              >
                <CloseIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
      <Button startIcon={<AddIcon />} onClick={onConnections} sx={{ px: 2, flexShrink: 0 }}>
        Connections
      </Button>
    </Paper>
  );
}
