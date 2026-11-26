import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import DataObjectIcon from '@mui/icons-material/DataObject';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import SensorsIcon from '@mui/icons-material/Sensors';
import { NavLink } from 'react-router-dom';
import { useContext } from 'react';
import { useCapabilities, WorkspacePathsContext } from '../../data/context';

const groups = [
  { label: 'Browse', items: [{ path: 'keys', label: 'Keys', icon: DataObjectIcon }] },
  {
    label: 'Cluster',
    items: [
      { path: 'cluster', label: 'Cluster', icon: StorageOutlinedIcon, admin: true },
      { path: 'metrics', label: 'Metrics', icon: QueryStatsIcon, admin: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: 'transfer', label: 'Import / export', icon: SwapVertIcon },
      { path: 'leases', label: 'Leases / TTL', icon: TimerOutlinedIcon, admin: true },
      { path: 'watchers', label: 'Live changes', icon: SensorsIcon },
    ],
  },
  {
    label: 'Access',
    items: [
      { path: 'users', label: 'Users', icon: PeopleOutlineIcon, admin: true },
      { path: 'roles', label: 'Roles', icon: LayersOutlinedIcon, admin: true },
    ],
  },
];

export default function NavMenu({ workspace = false, onNavigate }) {
  const capabilities = useCapabilities();
  const paths = useContext(WorkspacePathsContext);
  return (
    <Box sx={{ py: 1 }}>
      {groups.map((group) => (
        <Box key={group.label} sx={{ mb: 1.5 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ px: 1.5, fontSize: 10.5, letterSpacing: '.09em', fontWeight: 650 }}
          >
            {group.label}
          </Typography>
          <List disablePadding>
            {group.items.map(({ path, label, icon: Icon, admin }) => (
              <ListItemButton
                key={path}
                component={NavLink}
                to={paths[`/${path}`] ?? `/${path}`}
                onClick={onNavigate}
                title={
                  workspace && admin && !capabilities?.administrator
                    ? 'Requires the etcd root role'
                    : label
                }
                disabled={workspace && admin && !capabilities?.administrator}
                sx={{
                  borderRadius: 1.5,
                  py: 1,
                  mb: 0.25,
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: 'action.selected',
                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={label} slotProps={{ primary: { variant: 'body2' } }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      ))}
      {workspace && !capabilities?.administrator && (
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ px: 1.5, maxWidth: 210 }}
        >
          Administrator pages require the etcd root role.
        </Typography>
      )}
    </Box>
  );
}
