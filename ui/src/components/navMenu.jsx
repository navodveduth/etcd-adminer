import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import InfoIcon from '@mui/icons-material/Info';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import LayersIcon from '@mui/icons-material/Layers';
import StorageIcon from '@mui/icons-material/Storage';
import AssignmentIcon from '@mui/icons-material/Assignment';
import TimerIcon from '@mui/icons-material/Timer';
import { NavLink } from 'react-router-dom';
import { SessionStore } from '../storage/session';
import { useCapabilities } from '../data/context';

const destinations = [
  { path: 'connection', label: 'Connection', icon: DashboardIcon },
  { path: 'cluster', label: 'Cluster', icon: StorageIcon, connection: true },
  { path: 'metrics', label: 'Overview', icon: BarChartIcon, connection: true },
  { path: 'keys', label: 'Keys', icon: AssignmentIcon, connection: true },
  { path: 'transfer', label: 'Import / export', icon: AssignmentIcon, connection: true },
  { path: 'leases', label: 'Leases / TTL', icon: TimerIcon, connection: true },
  { path: 'watchers', label: 'Live changes', icon: BarChartIcon, connection: true },
  { path: 'users', label: 'Users', icon: PeopleIcon, connection: true },
  { path: 'roles', label: 'Roles', icon: LayersIcon, connection: true },
  { path: 'about', label: 'About', icon: InfoIcon },
];

export default function NavMenu({ workspace = false }) {
  const capabilities = useCapabilities();
  const hasConnection = workspace || Boolean(new SessionStore().GetActiveSession());
  const administratorPages = new Set(['metrics', 'cluster', 'leases', 'users', 'roles']);
  return (
    <List>
      {destinations.filter(({ path }) => !workspace || !['connection', 'about'].includes(path)).map(({ path, label, icon: Icon, connection, disabled }) => (
        <ListItemButton key={path} component={NavLink} to={`/${path}`} title={workspace && administratorPages.has(path) && !capabilities?.administrator ? 'Requires the etcd root role' : label}
          disabled={disabled || (connection && !hasConnection) || (workspace && administratorPages.has(path) && !capabilities?.administrator)} sx={{ borderRadius: 2, mb: 0.5, '&.active': { bgcolor: 'action.selected' } }}>
          <ListItemIcon><Icon /></ListItemIcon>
          <ListItemText primary={label} />
        </ListItemButton>
      ))}
    </List>
  );
}
