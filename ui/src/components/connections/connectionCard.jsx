import { useId, useState } from 'react';
import {
  Avatar,
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Stack,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Link } from 'react-router-dom';
import { CopyValue } from '../shared/page';

export default function ConnectionCard({ connection, isActive, openProfile, deleteSession }) {
  const id = useId();
  const [anchor, setAnchor] = useState(null);
  const endpoints = (
    Array.isArray(connection.Endpoints) ? connection.Endpoints : [connection.Endpoints]
  ).filter(Boolean);
  return (
    <Card
      component="article"
      aria-labelledby={`${id}-title`}
      variant="outlined"
      sx={{
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        border: '2px solid',
        borderColor: isActive ? 'primary.main' : 'divider',
        transition: 'border-color 150ms, box-shadow 150ms',
        '&:hover, &:focus-within': { borderColor: 'primary.main', boxShadow: 3 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <CardContent sx={{ p: 3, flex: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', mb: 3 }}>
          <Avatar
            sx={{
              bgcolor: 'action.selected',
              color: 'primary.main',
              width: 44,
              height: 44,
              fontWeight: 600,
            }}
          >
            {Array.from(connection.Name)[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              id={`${id}-title`}
              component="h2"
              variant="h6"
              sx={{ overflowWrap: 'anywhere', mb: 0.75 }}
            >
              {connection.Name}
            </Typography>
            {isActive && (
              <Chip size="small" variant="outlined" color="primary" label="Last selected" />
            )}
          </Box>
          <IconButton
            size="small"
            aria-label={`Actions for ${connection.Name}`}
            aria-haspopup="menu"
            aria-controls={anchor ? `${id}-menu` : undefined}
            aria-expanded={Boolean(anchor)}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
        </Stack>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Backend
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {connection.BackEnd}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              {endpoints.length > 1 ? 'Endpoints' : 'Endpoint'}
            </Typography>
            {endpoints.length ? (
              endpoints.map((endpoint) => (
                <Box key={endpoint} sx={{ fontSize: 14, mt: 0.25 }}>
                  <CopyValue
                    value={endpoint}
                    label={`endpoint for ${connection.Name}`}
                    mono={false}
                  />
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No endpoint advertised
              </Typography>
            )}
          </Box>
          <Box sx={{ minWidth: 0, fontSize: 14 }}>
            <Typography variant="caption" color="text.secondary">
              User
            </Typography>
            <CopyValue value={connection.UserName} label={`username for ${connection.Name}`} />
          </Box>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 3, pb: 3, pt: 1 }}>
        <Button
          fullWidth
          variant="contained"
          endIcon={<ArrowForwardIcon />}
          onClick={() => openProfile(connection)}
        >
          Open workspace
        </Button>
      </CardActions>
      <Menu
        id={`${id}-menu`}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            openProfile(connection, true);
          }}
        >
          Reauthenticate
        </MenuItem>
        <MenuItem
          component={Link}
          to={`/connection/new?edit=${encodeURIComponent(connection.Name)}`}
          onClick={() => setAnchor(null)}
        >
          Edit / diagnose
        </MenuItem>
        <Divider />
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            setAnchor(null);
            deleteSession(connection);
          }}
        >
          Delete profile
        </MenuItem>
      </Menu>
    </Card>
  );
}
