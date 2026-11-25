import { Tab, Tabs } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';

export default function ClusterTabs() {
  const location = useLocation();
  return (
    <Tabs
      value={location.pathname === '/metrics' ? 1 : 0}
      aria-label="Cluster views"
      sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
    >
      <Tab component={Link} to="/cluster" label="Members & summary" />
      <Tab component={Link} to="/metrics" label="Metrics & alarms" />
    </Tabs>
  );
}
