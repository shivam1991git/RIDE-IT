import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FareBreakdown, RouteLine, StatusChip } from '../../components/ui';
import { get, post } from '../../lib/api';
import { dateTime, money, STATUS } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader, DataTable } from './shared';

function Details({ id, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['booking', id], queryFn: () => get(`/admin/bookings/${id}`), enabled: Boolean(id) });
  const act = useMutation({
    mutationFn: action => post(action === 'cancel' ? `/bookings/${id}/cancel` : `/admin/bookings/${id}/complete`, action === 'cancel' ? { reason: 'Cancelled by support' } : {}),
    onSuccess: () => {
      toast.success('Booking updated');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
    },
    onError: error => toast.error(error.message),
  });
  const booking = data?.booking;
  return (
    <Dialog open={Boolean(id)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Booking details</DialogTitle>
      <DialogContent>
        {booking && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <StatusChip status={booking.status} />
              <Typography variant="body2" color="text.secondary">{booking.type} · created {dateTime(booking.createdAt)}</Typography>
            </Stack>
            {booking.type === 'ride' ? <RouteLine pickup={booking.pickup} drop={booking.drop} /> : <Typography>{booking.car?.name}: {dateTime(booking.start)} → {dateTime(booking.end)}</Typography>}
            <Typography variant="body2"><b>Rider:</b> {booking.user?.fullName} · {booking.user?.phoneNumber}</Typography>
            <Typography variant="body2"><b>Driver:</b> {booking.driver ? `${booking.driver.fullName} · ${booking.driver.vehicle?.plateNumber || ''}` : '—'}</Typography>
            <Typography variant="body2"><b>Payment:</b> {booking.payment?.method} · {booking.payment?.status}</Typography>
            {booking.cancellation?.reason && <Typography variant="body2"><b>Cancellation:</b> {booking.cancellation.reason} ({booking.cancellation.by})</Typography>}
            <FareBreakdown lines={booking.fareBreakdown} total={booking.totalAmount} />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Timeline</Typography>
              {booking.timeline?.map(step => <Typography key={`${step.status}-${step.at}`} variant="caption" sx={{ display: 'block' }} color="text.secondary">{dateTime(step.at)} — {STATUS[step.status]?.label || step.status} ({step.by})</Typography>)}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {booking && ['requested', 'accepted', 'arrived', 'pending_driver', 'confirmed'].includes(booking.status) && (
          <Button color="error" onClick={() => act.mutate('cancel')} disabled={act.isPending}>Cancel booking</Button>
        )}
        {booking && ['in_progress', 'confirmed'].includes(booking.status) && (
          <Button onClick={() => act.mutate('complete')} disabled={act.isPending}>Mark completed</Button>
        )}
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Bookings() {
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const params = new URLSearchParams({ page, limit: 20, ...(filters.status && { status: filters.status }), ...(filters.type && { type: filters.type }) });
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'bookings', params.toString()], queryFn: () => get(`/admin/bookings?${params}`) });

  const columns = [
    { key: 'createdAt', label: 'Created', render: row => dateTime(row.createdAt) },
    { key: 'type', label: 'Type', render: row => (row.type === 'ride' ? `Ride · ${row.category}` : 'Rental') },
    { key: 'route', label: 'Route / car', render: row => <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>{row.type === 'ride' ? `${row.pickup?.name} → ${row.drop?.name}` : row.car?.name}</Typography> },
    { key: 'user', label: 'Rider', render: row => row.user?.fullName },
    { key: 'driver', label: 'Driver', render: row => row.driver?.fullName || '—' },
    { key: 'status', label: 'Status', render: row => <StatusChip status={row.status} /> },
    { key: 'amount', label: 'Fare', align: 'right', render: row => money(row.totalAmount) },
    { key: 'view', label: '', align: 'right', render: row => <Button size="small" onClick={() => setSelected(row._id)}>View</Button> },
  ];

  return (
    <>
      <AdminHeader
        title="Bookings"
        subtitle="Every ride and rental, newest first."
        action={(
          <Stack direction="row" spacing={1.5}>
            <TextField select size="small" label="Type" value={filters.type} onChange={e => { setFilters({ ...filters, type: e.target.value }); setPage(1); }} sx={{ minWidth: 120 }}>
              <MenuItem value="">All</MenuItem><MenuItem value="ride">Rides</MenuItem><MenuItem value="rental">Rentals</MenuItem>
            </TextField>
            <TextField select size="small" label="Status" value={filters.status} onChange={e => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} sx={{ minWidth: 160 }}>
              <MenuItem value="">All</MenuItem>
              {Object.entries(STATUS).map(([key, meta]) => <MenuItem key={key} value={key}>{meta.label}</MenuItem>)}
            </TextField>
          </Stack>
        )}
      />
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} page={page} total={data?.total} onPage={setPage} empty="No bookings match these filters." />
      <Details id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
