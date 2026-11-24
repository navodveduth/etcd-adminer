import * as React from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Input from '@mui/material/Input';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import FormControl from '@mui/material/FormControl';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import DataService from '../data/service'
import { useReadOnly } from '../readOnly';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
    slotProps: { paper: {
        style: {
            maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
            width: 250,
        },
    } },
};

export default function CreateUser(props) {
    const readOnly = useReadOnly();

    const dataService = React.useMemo(() => new DataService(), []);
    const [submitting, setSubmitting] = React.useState(false);

    let formDefaults = {
        userName: '',
        password: '',
        confirmPassword: '',
        showPassword: false,
        showConfirmPassword: false
    };

    let [values, setValues] = React.useState(formDefaults);

    let [success, setSuccess] = React.useState(false);
    let [successMessage, setSuccessMessage] = React.useState("");
    let [error, setError] = React.useState(false);
    let [errorMessage, setErrorMessage] = React.useState("");
    let [roles, setRoles] = React.useState([]);
    let [availableRoles, setAvailableRoles] = React.useState([]);

    // Form field errors
    let [usernameError, setUsernameError] = React.useState(false);
    let [passwordError, setPasswodError] = React.useState(false);

    const handleSelectChange = (event) => {
        const {
            target: { value },
        } = event;
        setRoles(
            // On autofill we get a stringified value.
            typeof value === 'string' ? value.split(',') : value,
        );
    };

    let clearMessages = () => {
        setUsernameError(false);
        setPasswodError(false);
        setSuccess(false);
        setSuccessMessage("");
        setError(false);
        setErrorMessage("");
    }

    let printErrorMessage = (message) => {
        setErrorMessage(message);
        setError(true);
    }

    let printSuccessMessage = (message) => {
        setSuccessMessage(message);
        setSuccess(true);
    }

    let handleChange = (prop) => (event) => {
        clearMessages();
        setValues({ ...values, [prop]: event.target.value });
    };

    let handleClickShowPassword = () => {
        setValues({
            ...values,
            showPassword: !values.showPassword,
        });
    };

    let handleClickShowConfirmPassword = () => {
        setValues({
            ...values,
            showConfirmPassword: !values.showConfirmPassword,
        });
    };

    let handleMouseDownPassword = (event) => {
        event.preventDefault();
    };

    let alert = (severity, message) => {
        return (
            <Stack sx={{ width: '100%' }} spacing={2}>
                <Alert severity={severity}>{message}</Alert>
            </Stack>
        )
    }

    let handleSubmit = async (e) => {
        if (readOnly || submitting) return;
        e.preventDefault();
        clearMessages();

        let formErr = false;
        if (values.userName === "") {
            formErr = true;
            setUsernameError(true);
        }

        if (values.password === "") {
            formErr = true;
            setPasswodError(true);
        }
		if (new TextEncoder().encode(values.password).length > 72) {
			formErr = true;
			setPasswodError(true);
			printErrorMessage('Passwords must be at most 72 UTF-8 bytes.');
		}

        if (values.password !== values.confirmPassword) {
            formErr = true;
            printErrorMessage("password and confirmation password fields are not identical");
        }

        if (formErr === true) {
            return;
        }

        // Create User
        setSubmitting(true);
        try {
            let status = await dataService.CreateUser(values.userName, values.password, roles);
            if (status) {
                printSuccessMessage("User created Successfully");
                setValues(formDefaults);
                setRoles([]);
            }
        } catch (error) {
            printErrorMessage(error.response?.data?.message ?? 'User creation could not be confirmed. Inspect the user list before retrying.');
        } finally { setSubmitting(false); }
    }

    React.useEffect(() => {

        const controller = new AbortController();
        let fetchData = async () => {
            try {
                let roles = await dataService.GetRoles(controller.signal);
                if (!controller.signal.aborted) setAvailableRoles(roles.filter((role) => role !== 'root'));
            } catch (error) {
                if (!controller.signal.aborted) printErrorMessage(error.response?.data?.message ?? 'Could not load roles. Check your administrator permissions.');
            }
        }

        fetchData();
        return () => controller.abort();
    }, [dataService]);

    return (
        <Grid container spacing={3}>

            <Grid size={{ xs: 12, md: 6, lg: 6 }}>
                <Paper
                    sx={{
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <Typography variant="h6" gutterBottom>
                        New User
                    </Typography>
                    <Alert severity="info">Create with least-privilege roles. Administrator access can be granted afterwards from user details with explicit confirmation.</Alert>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }} >
                        <Grid size={12}>
                            {success === true && successMessage !== "" ? alert("success", successMessage) : null}
                            {error === true && errorMessage !== "" ? alert("error", errorMessage) : null}
                        </Grid>

                        <FormControl fullWidth sx={{ m: 1 }} variant="standard">
                            <InputLabel htmlFor="user-name">User Name</InputLabel>
                            <Input
                                required
                                disabled={readOnly || submitting}
                                id="user-name"
                                value={values.userName}
                                onChange={handleChange('userName')}
                                error={usernameError}
                            />
                        </FormControl>

                        <FormControl fullWidth sx={{ m: 1, mt: 3 }} variant="standard">
                            <InputLabel htmlFor="password">Password</InputLabel>
                            <Input
                                id="password"
                                disabled={readOnly || submitting}
                                type={values.showPassword ? 'text' : 'password'}
                                value={values.password}
                                onChange={handleChange('password')}
                                error={passwordError}
                                endAdornment={
                                    <InputAdornment position="end">
                                        <IconButton
                                            aria-label="toggle password visibility"
                                            onClick={handleClickShowPassword}
                                            onMouseDown={handleMouseDownPassword}
                                        >
                                            {values.showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                }
                            />
                        </FormControl>

                        <FormControl fullWidth sx={{ m: 1, mt: 3 }} variant="standard">
                            <InputLabel htmlFor="confirm-password">Confirm password</InputLabel>
                            <Input
                                id="confirm-password"
                                disabled={readOnly || submitting}
                                type={values.showConfirmPassword ? 'text' : 'password'}
                                value={values.confirmPassword}
                                onChange={handleChange('confirmPassword')}
                                endAdornment={
                                    <InputAdornment position="end">
                                        <IconButton
                                            aria-label="toggle password visibility"
                                            onClick={handleClickShowConfirmPassword}
                                            onMouseDown={handleMouseDownPassword}
                                        >
                                            {values.showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                }
                            />
                        </FormControl>

                        <FormControl sx={{ m: 1, mt: 3 }} fullWidth>
                            <InputLabel id="multi-select-label">Roles</InputLabel>
                            <Select
                                labelId="multi-select-label"
                                id="roles-multi-select"
                                disabled={readOnly || submitting}
                                multiple
                                value={roles}
                                onChange={handleSelectChange}
                                input={<OutlinedInput label="Roles" />}
                                renderValue={(selected) => selected.join(', ')}
                                MenuProps={MenuProps}
                            >
                                {availableRoles.map((name) => (
                                    <MenuItem key={name} value={name}>
                                        <Checkbox checked={roles.indexOf(name) > -1} />
                                        <ListItemText primary={name} />
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Box sx={{ '& > button': { m: 1 } }}>
                            <Button variant="contained" color="success" disabled={readOnly || submitting} onClick={handleSubmit} sx={{ mt: 3, ml: 1 }}>
                                {submitting ? 'Creating user…' : 'Create user'}
                            </Button>
                        </Box>

                    </Box>
                </Paper>
            </Grid>
        </Grid>
    )
}
