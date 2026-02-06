import React, { useState, useCallback, useMemo } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import ConfirmationDialog from './dialogs/confirmationDialog';

export default function KeysList(props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteConfirmationDialogOpen, setDeleteConfirmationDialogOpen] = useState(false);
    const [keyToDelete, setKeyToDelete] = useState(null);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);

    // Memoize the flatten function to prevent recreation on every render
    const flattenKeys = useCallback((node, result = []) => {
        if (!node) return result;

        if (node.type === 'file') {
            result.push({
                path: node.abspath,
                name: node.name,
                isVirtual: node.isVirtual || false
            });
        }
        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => flattenKeys(child, result));
        }
        return result;
    }, []);

    // Memoize the flattened keys to avoid recalculation on every render
    const flatKeys = useMemo(() => {
        if (props.keys) {
            return flattenKeys(props.keys);
        }
        return [];
    }, [props.keys, flattenKeys]);

    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value);
        setPage(0); // Reset to first page when searching
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleEditClick = (path) => {
        props.onKeyClick(path);
    };

    const handleDeleteClick = (key) => {
        setKeyToDelete(key);
        setDeleteConfirmationDialogOpen(true);
    };

    const onConfirmationDialogCancel = () => {
        setDeleteConfirmationDialogOpen(false);
        setKeyToDelete(null);
    };

    const onConfirmationDialogConfirm = () => {
        setDeleteConfirmationDialogOpen(false);
        if (keyToDelete) {
            props.deleteKey({
                abspath: keyToDelete.path,
                type: 'file'
            });
        }
        setKeyToDelete(null);
    };

    const getDeleteDialogContent = () => {
        if (keyToDelete === null) {
            return "";
        }
        return "Do you really want to delete key " + keyToDelete.path + " ?";
    };

    // Memoize filtered keys to avoid recalculation on every render
    const filteredKeys = useMemo(() => {
        if (!searchTerm) return flatKeys;
        const lowerSearch = searchTerm.toLowerCase();
        return flatKeys.filter(key =>
            key.path.toLowerCase().includes(lowerSearch)
        );
    }, [flatKeys, searchTerm]);

    // Paginate the filtered results
    const paginatedKeys = useMemo(() => {
        const startIndex = page * rowsPerPage;
        return filteredKeys.slice(startIndex, startIndex + rowsPerPage);
    }, [filteredKeys, page, rowsPerPage]);

    return (
        <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Search keys..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />
                <Box sx={{ minWidth: 80, textAlign: 'right', fontSize: '0.875rem', color: 'text.secondary' }}>
                    {filteredKeys.length} {filteredKeys.length === 1 ? 'key' : 'keys'}
                </Box>
            </Box>

            <TableContainer component={Paper} sx={{ flexGrow: 1, overflow: 'auto' }}>
                <Table stickyHeader size="small" aria-label="keys table">
                    <TableHead>
                        <TableRow>
                            <TableCell>Key Path</TableCell>
                            <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {paginatedKeys.map((key) => {
                            return (
                                <TableRow
                                    key={key.path}
                                    hover
                                    sx={{
                                        cursor: 'pointer',
                                        opacity: key.isVirtual ? 0.6 : 1,
                                        fontStyle: key.isVirtual ? 'italic' : 'normal'
                                    }}
                                >
                                    <TableCell
                                        component="th"
                                        scope="row"
                                        onClick={() => handleEditClick(key.path)}
                                    >
                                        {key.path}
                                        {key.isVirtual && <span style={{ marginLeft: 8, color: '#999' }}>(unsaved)</span>}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="Delete">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleDeleteClick(key)}
                                                color="error"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {filteredKeys.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={2} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                    {searchTerm ? 'No keys found matching your search' : 'No keys available'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <TablePagination
                rowsPerPageOptions={[10, 25, 50, 100]}
                component="div"
                count={filteredKeys.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                sx={{ flexShrink: 0 }}
            />

            <ConfirmationDialog
                open={deleteConfirmationDialogOpen}
                onCancel={onConfirmationDialogCancel}
                onConfirm={onConfirmationDialogConfirm}
                title={"Delete Key?"}
                content={getDeleteDialogContent()}
            />
        </Box>
    );
}
