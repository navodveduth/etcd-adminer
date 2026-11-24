import * as React from 'react';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import { red } from '@mui/material/colors';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Link } from 'react-router-dom';

const ITEM_HEIGHT = 48;

export default function ConnectionCard(props) {


    const useSession = () => {
        props.useSession(props.connection);
    }

    const [anchorEl, setAnchorEl] = React.useState(null);
    const open = Boolean(anchorEl);

    const handleOptionMenuBtnClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleOptionClose = () => {
        setAnchorEl(null);
    };

    let options = [
        {
            name: "Connect",
            onClick: () => {
                connect(props.connection);
                setAnchorEl(null);
            }
        },
        {
            name: "Delete",
            onClick: () => {
                deleteConnection();
                setAnchorEl(null);
            }
        }
    ];

    const connect = (session) => {
        props.useSession(session);
    }

    const deleteConnection = () => {
        if (window.confirm(`Delete profile ${props.connection.Name}? Its workspaces will close, discarding drafts and stopping watches and renewal. Cluster keys are not deleted.`)) props.deleteSession(props.connection);
    }

    return (
        <Card variant="outlined" sx={{ maxWidth: 345, m: 1, border: `${props.isActive ? "3px solid #1976d2" : "1px solid #1976d2"}` }}>
            <CardHeader
                avatar={
                    <Avatar sx={{ bgcolor: red[500] }} aria-label={`User ${props.connection.UserName}`}>
                        {props.connection.UserName.charAt(0).toUpperCase()}
                    </Avatar>
                }
                action={
                    <IconButton aria-label={`Options for ${props.connection.Name}`} onClick={handleOptionMenuBtnClick}>
                        <MoreVertIcon />
                    </IconButton>
                }
                title={props.connection.Name}
            />
            <CardContent>
                <Typography sx={{ mb: 1.5 }} color="text.secondary">
                    Cluster: {props.connection.BackEnd}
                </Typography>
                <Typography sx={{ mb: 1.5 }} color="text.secondary">
                    Endpoints: {props.connection.Endpoints}
                </Typography>
                <Typography sx={{ mb: 1.5 }} color="text.secondary">
                    User: {props.connection.UserName}
                </Typography>
                <Typography sx={{ mb: 1.5 }} color="text.secondary">
                    {props.isActive ? 'Most recently selected connection' : 'Saved profile'}
                </Typography>
            </CardContent>
            <CardActions>
                <Button variant="contained" color="success" size="small" onClick={useSession}>Open workspace</Button>
                <Button component={Link} to={`/connection/new?edit=${encodeURIComponent(props.connection.Name)}`} size="small">Edit / diagnose</Button>
            </CardActions>

            <Menu
                id="long-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={handleOptionClose}
                slotProps={{ paper: {
                    style: {
                        maxHeight: ITEM_HEIGHT * 4.5,
                        width: '20ch',
                    },
                } }}
            >
                {options.map((option) => (
                    <MenuItem key={option.name} onClick={option.onClick}>
                        {option.name}
                    </MenuItem>
                ))}
            </Menu>

        </Card>
    );
}
