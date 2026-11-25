import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import { DataTable } from '../shared/page';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import { useReadOnly } from '../../readOnly';
import Chip from '@mui/material/Chip';

export default function UserTable(props) {
  const readOnly = useReadOnly();
  return (
    <DataTable aria-label="Scrollable users">
      <Table aria-label="User directory">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {props.users.map((row) => (
            <TableRow
              key={row}
              selected={props.selectedUser === row}
              sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
            >
              <TableCell component="th" scope="row">
                {row}
                {row === 'root' && (
                  <Chip
                    label="Protected root"
                    size="small"
                    variant="outlined"
                    sx={{ display: 'flex', mt: 1, width: 'fit-content' }}
                  />
                )}
              </TableCell>
              <TableCell align="right">
                <Button
                  sx={{ m: 1 }}
                  variant="outlined"
                  onClick={() => {
                    props.selectUser(row);
                  }}
                >
                  View / edit
                </Button>
                <Button
                  sx={{ m: 1 }}
                  variant="text"
                  color="error"
                  disabled={readOnly || row === 'root'}
                  onClick={() => {
                    props.onDelete(row);
                  }}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTable>
  );
}
