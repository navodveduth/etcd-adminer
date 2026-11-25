import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Stack,
  Chip,
  IconButton,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { Link } from 'react-router-dom';
import { CopyValue } from '../shared/page';

export default function ConnectionCard({ connection, isActive, openProfile, deleteSession }) {
  return (
    <Card variant="outlined" sx={{ minWidth: 0 }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
              {connection.Name}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={isActive ? 'Last selected' : 'Saved profile'}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {connection.BackEnd} · {connection.UserName}
          </Typography>
          {(Array.isArray(connection.Endpoints) ? connection.Endpoints : [connection.Endpoints])
            .filter(Boolean)
            .map((endpoint) => (
              <CopyValue
                key={endpoint}
                value={endpoint}
                label={`endpoint for ${connection.Name}`}
                mono={false}
              />
            ))}
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button variant="contained" onClick={() => openProfile(connection)}>
          Open workspace
        </Button>
        <Button component={Link} to={`/connection/new?edit=${encodeURIComponent(connection.Name)}`}>
          Edit / diagnose
        </Button>
        <IconButton
          aria-label={`Delete profile ${connection.Name}`}
          onClick={() => deleteSession(connection)}
        >
          <DeleteOutlineIcon />
        </IconButton>
      </CardActions>
    </Card>
  );
}
