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
import { Link } from 'react-router-dom';
import { SessionStore } from '../storage/session';

const destinations = [
  { path: 'connection', label: 'Connection', icon: DashboardIcon },
  { path: 'cluster', label: 'Cluster', icon: StorageIcon, connection: true },
  { path: 'keys', label: 'Keys', icon: AssignmentIcon, connection: true },
  { path: 'leases', label: 'Leases / TTL', icon: TimerIcon, connection: true },
  { path: 'watchers', label: 'Live changes', icon: BarChartIcon, connection: true },
  { path: 'users', label: 'Users', icon: PeopleIcon, connection: true },
  { path: 'roles', label: 'Roles', icon: LayersIcon, disabled: true },
  { path: 'about', label: 'About', icon: InfoIcon },
];

export default function NavMenu() {
  const hasConnection = Boolean(new SessionStore().GetActiveSession());
  return (
    <List>
      {destinations.map(({ path, label, icon: Icon, connection, disabled }) => (
        <ListItemButton key={path} component={Link} to={`/${path}`} disabled={disabled || (connection && !hasConnection)}>
          <ListItemIcon><Icon /></ListItemIcon>
          <ListItemText primary={label} />
        </ListItemButton>
      ))}
    </List>
  );
}
