import { Box, Chip, Pagination, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { CardSkeleton } from '../../components/ui';
import { useAuth } from '../../providers/AuthProvider';
import { dateOnly } from '../../lib/format';

// What the signed-in admin may do. The API enforces the same rules; this only
// hides controls that would be refused.
export function useAdminRole() {
  const { account } = useAuth();
  const role = account?.adminRole || 'super';
  return { role, isSuper: role === 'super', canOperate: role === 'super' || role === 'operations' };
}

// "Expired" / "12 days left" / date, for document and licence expiry dates.
export function ExpiryChip({ date, label, missing = 'Not recorded' }) {
  if (!date) return <Chip size="small" color="error" variant="outlined" label={label ? `${label}: ${missing}` : missing} />;
  const days = Math.floor((new Date(date) - Date.now()) / 86400000);
  const color = days < 0 ? 'error' : days <= 30 ? 'warning' : 'default';
  const text = days < 0 ? `expired ${dateOnly(date)}` : days <= 30 ? `${days} days left` : dateOnly(date);
  return <Chip size="small" color={color} variant={color === 'default' ? 'outlined' : 'filled'} label={label ? `${label}: ${text}` : text} />;
}

// Converts a stored date to the yyyy-mm-dd value a date input expects.
export const toDateInput = value => (value ? new Date(new Date(value).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10) : '');

export function AdminHeader({ title, subtitle, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 3 }}>
      <Box>
        <Typography variant="h3" component="h1">{title}</Typography>
        {subtitle && <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

// Tables scroll inside their own container so the page never scrolls sideways.
export function DataTable({ columns, rows, loading, empty = 'Nothing here yet.', page, total, limit = 20, onPage }) {
  if (loading) return <CardSkeleton rows={5} height={52} />;
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 4, bgcolor: 'background.paper', overflow: 'hidden' }}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 720, '& td, & th': { borderColor: 'divider', py: 1.25 } }}>
          <TableHead>
            <TableRow>{columns.map(col => <TableCell key={col.key} align={col.align} sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>{col.label}</TableCell>)}</TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={columns.length} sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>{empty}</TableCell></TableRow>
            )}
            {rows.map(row => (
              <TableRow key={row._id} hover>
                {columns.map(col => <TableCell key={col.key} align={col.align}>{col.render ? col.render(row) : row[col.key]}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {onPage && total > limit && (
        <Stack sx={{ alignItems: 'center', py: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Pagination count={Math.ceil(total / limit)} page={page} onChange={(e, value) => onPage(value)} size="small" />
        </Stack>
      )}
    </Box>
  );
}
