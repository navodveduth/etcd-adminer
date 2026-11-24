import { useMemo, useState } from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Checkbox from '@mui/material/Checkbox';
import ConfirmationDialog from './dialogs/confirmationDialog';
import { useReadOnly } from '../readOnly';

export default function KeysList({ items, loading, onKeyClick, deleteKey, selected = [], onSelect }) {
    const readOnly = useReadOnly();
    const [filter, setFilter] = useState('');
    const [deleting, setDeleting] = useState(null);
    const filtered = useMemo(() => items.filter((item) => item.key.toLowerCase().includes(filter.toLowerCase())), [items, filter]);
    return (
        <>
            <TextField size="small" label="Filter this page" value={filter} onChange={(event) => setFilter(event.target.value)} sx={{ my: 1 }} />
            {loading ? <CircularProgress aria-label="Loading keys" /> : (
                <TableContainer sx={{ maxHeight: '60vh' }}>
                    <Table size="small" stickyHeader aria-label="Keys on this page">
                        <TableHead><TableRow>{onSelect && <TableCell>Select</TableCell>}<TableCell>Key</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
                        <TableBody>
                            {filtered.map((item) => (
                                <TableRow key={`${item.isVirtual ? 'draft:' : 'key:'}${item.key}`}>
                                    {onSelect && <TableCell><Checkbox checked={selected.includes(item.key)} disabled={readOnly || item.isVirtual || (!selected.includes(item.key) && selected.length >= 50)} onChange={() => onSelect(item.key)} inputProps={{ 'aria-label': `Select ${item.key}` }} /></TableCell>}
                                    <TableCell><button type="button" onClick={() => onKeyClick(item.key)}>{item.key}{item.isVirtual ? ' (unsaved)' : ''}</button></TableCell>
                                    <TableCell><IconButton aria-label={`Delete ${item.key}`} disabled={readOnly} onClick={() => setDeleting(item)}><DeleteIcon /></IconButton></TableCell>
                                </TableRow>
                            ))}
                            {!filtered.length && <TableRow><TableCell colSpan={2}>No keys on this page match.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            <ConfirmationDialog open={Boolean(deleting)} title="Delete key?" content={`Delete ${deleting?.key ?? ''}?`}
                onCancel={() => setDeleting(null)} onConfirm={() => { deleteKey({ abspath: deleting.key, type: 'file', isVirtual: deleting.isVirtual }); setDeleting(null); }} />
        </>
    );
}
