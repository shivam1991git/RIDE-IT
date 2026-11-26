// Operations desk: every booking, quick views for work that needs attention,
// and a detail drawer with the actions allowed at each stage.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Checkbox, Chip, Divider, Drawer, FormControlLabel, IconButton, InputAdornment, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { FareBreakdown, RouteLine, StatusChip } from '../../../shared/components/ui';
import { get, post } from '../../../shared/api/apiClient';
import { useAppConfig } from '../../../shared/api/useAppConfig';
import { dateTime, money, PAYMENT_STATUS, RENTAL_TYPES, rentalRoute, STATUS, toLocalInput, VEHICLE_CLASSES } from '../../../shared/utils/format';
import { useToast } from '../../../app/providers/ToastProvider';
import { AdminHeader, DataTable, useAdminRole } from '../components/adminShared';

const VIEWS = [
  ['', 'All'],
  ['pending', 'Awaiting approval'],
  ['needs_driver', 'Needs chauffeur'],
  ['unacknowledged', 'Not acknowledged'],
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['active', 'On trip'],
  ['refunds', 'Refunds due'],
];

function PaymentChip({ payment }) {
  const meta = PAYMENT_STATUS[payment?.status] || PAYMENT_STATUS.unpaid;
  return <Chip size="small" variant="outlined" color={meta.tone === 'default' ? 'default' : meta.tone} label={meta.label} />;
}

function Field({ label, children }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', py: 0.4 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography component="div" variant="body2" sx={{ textAlign: 'right', fontWeight: 500, minWidth: 0 }}>{children}</Typography>
    </Stack>
  );
}

function Panel({ title, children, tone }) {
  return (
    <Box sx={{ p: 2, borderRadius: 3, border: 1, borderColor: tone ? `${tone}.main` : 'divider' }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{title}</Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

// Calls an admin booking action and refreshes the drawer and the lists.
function useAction(id, onDone) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ path, body }) => post(path.startsWith('/') ? path : `/admin/bookings/${id}/${path}`, body),
    onSuccess: (data, { message }) => {
      toast.success(message || 'Booking updated');
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['admin-booking', id] });
      queryClient.invalidateQueries({ queryKey: ['candidates', id] });
      onDone?.();
    },
    onError: error => toast.error(error.message),
  });
}

function CandidateSelect({ label, rows, value, onChange, describe }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={e => onChange(e.target.value)}>
      {rows.map(row => (
        <MenuItem key={row._id} value={row._id} disabled={!row.available}>
          <Stack sx={{ width: '100%' }}>
            <Typography variant="body2">{describe(row)}{row.current ? ' (current)' : ''}</Typography>
            {!row.available && <Typography variant="caption" color="error.main">{row.issue}</Typography>}
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  );
}

const carLabel = car => `${car.name} · ${car.registrationNumber || 'no reg.'} · ${VEHICLE_CLASSES[car.category] || car.category} · ${car.capacity} seats`;
const driverLabel = driver => `${driver.fullName}${driver.rating?.average ? ` · ${driver.rating.average}★` : ''}${driver.declined ? ' · declined this trip' : ''}`;

function ApprovePanel({ booking, candidates }) {
  const action = useAction(booking._id);
  const [carId, setCarId] = useState(booking.car?._id || '');
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const cars = candidates?.cars || [];
  const drivers = candidates?.drivers || [];
  const carOk = cars.find(car => car._id === carId)?.available;
  return (
    <>
      <Panel title="Approve and assign" tone="primary">
        {!candidates ? <Typography variant="body2" color="text.secondary">Checking which cars and chauffeurs are free…</Typography> : (
          <>
            <CandidateSelect label="Car" rows={cars} value={carId} onChange={setCarId} describe={carLabel} />
            {!carOk && <Alert severity="warning">The requested car cannot take this trip. Choose another car.</Alert>}
            <CandidateSelect label="Chauffeur" rows={drivers} value={driverId} onChange={setDriverId} describe={driverLabel} />
            {!drivers.some(d => d.available) && <Alert severity="warning">No chauffeur is free and compliant for this time. Reschedule or reject.</Alert>}
            <Button variant="contained" disabled={!carOk || !driverId || action.isPending}
              onClick={() => action.mutate({ path: 'approve', body: { driverId, ...(carId !== booking.car?._id ? { carId } : {}) }, message: `${booking.reference} confirmed` })}>
              Approve booking
            </Button>
          </>
        )}
      </Panel>
      <Panel title="Reject request">
        <TextField size="small" label="Reason (the customer sees this)" value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
        <Button color="error" variant="outlined" disabled={reason.trim().length < 5 || action.isPending} onClick={() => action.mutate({ path: 'reject', body: { reason }, message: `${booking.reference} rejected` })}>Reject</Button>
      </Panel>
    </>
  );
}

function ChangePanel({ booking, candidates }) {
  const action = useAction(booking._id);
  const [driverId, setDriverId] = useState('');
  const [carId, setCarId] = useState('');
  const [start, setStart] = useState(toLocalInput(booking.start));
  return (
    <Panel title="Change chauffeur, car or time">
      {candidates && (
        <>
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}><CandidateSelect label={booking.driver ? 'New chauffeur' : 'Assign chauffeur'} rows={candidates.drivers.filter(d => !d.current)} value={driverId} onChange={setDriverId} describe={driverLabel} /></Box>
            <Button variant="contained" disabled={!driverId || action.isPending} onClick={() => action.mutate({ path: 'assign-driver', body: { driverId }, message: 'Chauffeur assigned' })}>{booking.driver ? 'Change' : 'Assign'}</Button>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}><CandidateSelect label="Swap car" rows={candidates.cars.filter(c => !c.current)} value={carId} onChange={setCarId} describe={carLabel} /></Box>
            <Button variant="outlined" disabled={!carId || action.isPending} onClick={() => action.mutate({ path: 'change-car', body: { carId }, message: 'Car changed; the price stays the same' })}>Swap</Button>
          </Stack>
        </>
      )}
      <Stack direction="row" spacing={1}>
        <TextField size="small" type="datetime-local" label="New pickup time" value={start} onChange={e => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
        <Button variant="outlined" disabled={!start || action.isPending} onClick={() => action.mutate({ path: 'reschedule', body: { start: new Date(start).toISOString() }, message: 'Pickup time changed' })}>Reschedule</Button>
      </Stack>
    </Panel>
  );
}

function CancelPanel({ booking }) {
  const action = useAction(booking._id);
  const [reason, setReason] = useState('');
  const [refundPercent, setRefundPercent] = useState(100);
  const [confirmActive, setConfirmActive] = useState(false);
  const active = ['arrived', 'in_progress'].includes(booking.status);
  return (
    <Panel title={active ? 'Cancel an active trip' : 'Cancel booking'} tone={active ? 'error' : undefined}>
      <TextField size="small" label="Reason (the customer sees this)" value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
      <TextField select size="small" label="Refund of the amount paid" value={refundPercent} onChange={e => setRefundPercent(Number(e.target.value))} helperText={`Paid so far ${money((booking.payment?.paid || 0) - (booking.payment?.refunded || 0))}`}>
        {[100, 75, 50, 25, 0].map(p => <MenuItem key={p} value={p}>{p}%{p === 100 ? ' (our fault / goodwill)' : p === 0 ? ' (no-show)' : ''}</MenuItem>)}
      </TextField>
      {active && <FormControlLabel control={<Checkbox checked={confirmActive} onChange={e => setConfirmActive(e.target.checked)} />} label="I understand the chauffeur is already with the customer" />}
      <Button color="error" variant="outlined" disabled={reason.trim().length < 3 || (active && !confirmActive) || action.isPending}
        onClick={() => action.mutate({ path: `/bookings/${booking._id}/cancel`, body: { reason, refundPercent, ...(active ? { confirmActive } : {}) }, message: 'Booking cancelled' })}>
        Cancel booking
      </Button>
    </Panel>
  );
}

function CompletePanel({ booking }) {
  const action = useAction(booking._id);
  const [form, setForm] = useState({ actualKm: '', tolls: '', parking: '' });
  const set = name => e => setForm({ ...form, [name]: e.target.value });
  return (
    <Panel title="Close the trip for the chauffeur">
      <Typography variant="caption" color="text.secondary">Use this only if the chauffeur cannot complete the trip in the app.</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
        <TextField size="small" type="number" label="Km driven" value={form.actualKm} onChange={set('actualKm')} />
        <TextField size="small" type="number" label="Tolls ₹" value={form.tolls} onChange={set('tolls')} />
        <TextField size="small" type="number" label="Parking ₹" value={form.parking} onChange={set('parking')} />
      </Box>
      <Button variant="outlined" disabled={form.actualKm === '' || action.isPending}
        onClick={() => action.mutate({ path: 'complete', body: { actualKm: Number(form.actualKm), tolls: Number(form.tolls || 0), parking: Number(form.parking || 0) }, message: 'Trip completed' })}>
        Complete trip
      </Button>
    </Panel>
  );
}

function Payments({ booking, payments, canOperate }) {
  const action = useAction(booking._id);
  const p = booking.payment || {};
  const [form, setForm] = useState({ kind: p.refundDue > 0 ? 'refund' : 'payment', amount: '', method: 'upi', reference: '' });
  useEffect(() => setForm(f => ({ ...f, kind: p.refundDue > 0 ? 'refund' : 'payment' })), [p.refundDue]);
  const closed = ['cancelled', 'rejected'].includes(booking.status);
  const net = (p.paid || 0) - (p.refunded || 0);
  return (
    <Panel title="Payments">
      <Field label="Status"><PaymentChip payment={p} /></Field>
      <Field label="Amount due">{money(p.due ?? booking.totalAmount)}</Field>
      <Field label="Paid (net)">{money(net)}</Field>
      {p.refundDue > 0 && <Field label="Refund to send"><Typography color="warning.main" variant="body2" sx={{ fontWeight: 700 }}>{money(p.refundDue)}</Typography></Field>}
      {payments?.length > 0 && (
        <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
          {payments.map(item => (
            <Typography key={item._id} variant="caption" sx={{ display: 'block' }}>
              {dateTime(item.createdAt)} · {item.kind === 'refund' ? 'Refund' : 'Payment'} {money(item.amount)} · {item.method.toUpperCase()}{item.reference ? ` · ${item.reference}` : ''} · by {item.recordedBy?.name || item.recordedBy?.role}
            </Typography>
          ))}
        </Box>
      )}
      {canOperate && booking.rentalType && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '140px 1fr 100px' }, gap: 1 }}>
            <TextField select size="small" label="Type" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
              <MenuItem value="payment" disabled={closed}>Payment</MenuItem>
              <MenuItem value="refund" disabled={net <= 0}>Refund</MenuItem>
            </TextField>
            <TextField size="small" type="number" label="Amount ₹" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            <TextField select size="small" label="Via" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
              <MenuItem value="upi">UPI</MenuItem><MenuItem value="cash">Cash</MenuItem><MenuItem value="bank">Bank</MenuItem>
            </TextField>
          </Box>
          <TextField size="small" label="UPI / bank reference (optional)" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
          <Button variant="outlined" disabled={!(Number(form.amount) >= 1) || action.isPending}
            onClick={() => action.mutate({ path: 'payments', body: { kind: form.kind, amount: Math.round(Number(form.amount)), method: form.method, reference: form.reference || undefined }, message: form.kind === 'refund' ? 'Refund recorded' : 'Payment recorded' }, { onSuccess: () => setForm({ ...form, amount: '', reference: '' }) })}>
            Record {form.kind}
          </Button>
        </>
      )}
    </Panel>
  );
}

function Details({ id, onClose }) {
  const { canOperate } = useAdminRole();
  const { data } = useQuery({ queryKey: ['admin-booking', id], queryFn: () => get(`/admin/bookings/${id}`), enabled: Boolean(id) });
  const booking = data?.booking;
  const changeable = booking && ['pending_approval', 'pending_driver', 'confirmed'].includes(booking.status) && booking.rentalType;
  const candidates = useQuery({
    queryKey: ['candidates', id],
    queryFn: () => get(`/admin/bookings/${id}/candidates`),
    enabled: Boolean(id && changeable && canOperate),
  });
  const rideAction = useAction(id);
  const s = booking?.settlement;

  return (
    <Drawer anchor="right" open={Boolean(id)} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 }, p: { xs: 2, sm: 3 } } } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">{booking?.reference || 'Booking'}</Typography>
        <IconButton onClick={onClose} aria-label="Close details"><CloseRounded /></IconButton>
      </Stack>
      {!booking ? <Typography color="text.secondary">Loading…</Typography> : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <StatusChip status={booking.status} />
            <PaymentChip payment={booking.payment} />
            <Typography variant="body2" color="text.secondary">{booking.type === 'rental' ? (RENTAL_TYPES[booking.rentalType] || 'Rental') : `Ride · ${booking.category}`}</Typography>
          </Stack>
          {booking.status === 'rejected' && <Alert severity="error">Rejected: {booking.rejection?.reason}</Alert>}
          {booking.cancellation?.at && <Alert severity="info">Cancelled by {booking.cancellation.by}{booking.cancellation.reason ? `: ${booking.cancellation.reason}` : ''}{booking.cancellation.refundPercent !== undefined ? ` · refund ${booking.cancellation.refundPercent}% · charge ${money(booking.cancellation.charge || 0)}` : ''}</Alert>}
          {booking.assignment?.declines?.length > 0 && <Alert severity="warning">Declined by {booking.assignment.declines.length} chauffeur(s): {booking.assignment.declines.map(d => d.reason).join('; ')}</Alert>}

          <Box>
            {booking.type === 'ride' ? <RouteLine pickup={booking.pickup} drop={booking.drop} /> : <Field label="Route">{rentalRoute(booking)}</Field>}
            {booking.type === 'rental' && <Field label="Pickup">{dateTime(booking.start)}</Field>}
            {booking.type === 'rental' && <Field label={booking.rentalType === 'outstation_round' ? 'Return' : 'Until'}>{dateTime(booking.end)}</Field>}
            <Field label="Customer">{booking.user?.fullName} · {booking.user?.phoneNumber}</Field>
            {booking.car && <Field label="Car">{booking.car.name} · {booking.car.registrationNumber || '—'}</Field>}
            <Field label="Chauffeur">{booking.driver ? `${booking.driver.fullName} · ${booking.driver.phoneNumber}` : <Chip size="small" color="warning" label="Not assigned" />}</Field>
            {booking.driver && booking.status === 'confirmed' && <Field label="Acknowledged">{booking.assignment?.acknowledgedAt ? dateTime(booking.assignment.acknowledgedAt) : <Chip size="small" color="warning" label="Not yet" />}</Field>}
            {booking.passengers && <Field label="Passengers">{booking.passengers}</Field>}
            {booking.instructions && <Field label="Instructions">{booking.instructions}</Field>}
            {booking.trip?.startOdometer !== undefined && <Field label="Odometer">{booking.trip.startOdometer}{booking.trip.endOdometer !== undefined ? ` → ${booking.trip.endOdometer}` : ''} km</Field>}
          </Box>

          <FareBreakdown lines={booking.fareBreakdown} total={booking.totalAmount} />
          {s && (
            <Alert severity="info">
              Final bill {money(booking.finalAmount)}: {s.actualKm} km in {s.actualHours} h; extra km {money(s.extraKmCharge)}, extra hours {money(s.extraHourCharge)}, GST {money(s.gst)}, tolls {money(s.tolls)}, parking {money(s.parking)}.
            </Alert>
          )}

          {canOperate && booking.rentalType && ['pending_approval', 'pending_driver'].includes(booking.status) && <ApprovePanel key={booking.updatedAt} booking={booking} candidates={candidates.data} />}
          {canOperate && booking.rentalType && booking.status === 'confirmed' && <ChangePanel key={booking.updatedAt} booking={booking} candidates={candidates.data} />}
          {canOperate && booking.rentalType && booking.status === 'in_progress' && <CompletePanel booking={booking} />}

          {booking.type === 'rental' && <Payments booking={booking} payments={data.payments} canOperate={canOperate} />}
          {canOperate && booking.type === 'rental' && ['pending_approval', 'pending_driver', 'confirmed', 'arrived', 'in_progress'].includes(booking.status) && <CancelPanel key={booking.status} booking={booking} />}
          {canOperate && booking.type === 'ride' && ['requested', 'accepted', 'arrived', 'scheduled'].includes(booking.status) && (
            <Button color="error" variant="outlined" onClick={() => rideAction.mutate({ path: `/bookings/${booking._id}/cancel`, body: { reason: 'Cancelled by support' } })}>Cancel ride</Button>
          )}
          {!canOperate && <Alert severity="info">Your role can view bookings. Ask an operations admin to make changes.</Alert>}

          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Timeline</Typography>
            {booking.timeline?.map((step, index) => (
              <Typography key={`${step.status}-${step.at}-${index}`} variant="caption" sx={{ display: 'block' }} color="text.secondary">
                {dateTime(step.at)} · {STATUS[step.status]?.label || step.status} ({step.by}){step.note ? ` · ${step.note}` : ''}
              </Typography>
            ))}
          </Box>
        </Stack>
      )}
    </Drawer>
  );
}

export default function BookingsPage() {
  const { ridesEnabled } = useAppConfig();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(([key]) => key === params.get('view')) ? params.get('view') : '';
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const query = new URLSearchParams({ page, limit: 20, ...(view && { view }), ...(search && { q: search }), ...(filters.status && { status: filters.status }), ...(filters.type && { type: filters.type }) });
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'bookings', query.toString()], queryFn: () => get(`/admin/bookings?${query}`), refetchInterval: 60000 });

  const columns = [
    { key: 'ref', label: 'Booking', render: row => <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{row.reference || '—'}</Typography><Typography variant="caption" color="text.secondary">{row.type === 'ride' ? `Ride · ${row.category}` : RENTAL_TYPES[row.rentalType] || 'Rental'}</Typography></Box> },
    { key: 'start', label: 'Pickup', render: row => (row.start ? dateTime(row.start) : dateTime(row.createdAt)) },
    { key: 'user', label: 'Customer', render: row => <Box><Typography variant="body2">{row.user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{row.user?.phoneNumber}</Typography></Box> },
    { key: 'car', label: 'Car', render: row => (row.car ? <Box><Typography variant="body2" noWrap>{row.car.name}</Typography><Typography variant="caption" color="text.secondary">{row.car.registrationNumber}</Typography></Box> : '—') },
    { key: 'driver', label: 'Chauffeur', render: row => row.driver?.fullName || (row.type === 'rental' && ['confirmed'].includes(row.status) ? <Chip size="small" color="warning" label="Needed" /> : '—') },
    { key: 'status', label: 'Status', render: row => <StatusChip status={row.status} /> },
    { key: 'payment', label: 'Payment', render: row => (row.type === 'rental' && row.rentalType ? <PaymentChip payment={row.payment} /> : row.payment?.status) },
    { key: 'amount', label: 'Amount', align: 'right', render: row => money(row.finalAmount ?? row.totalAmount) },
    { key: 'view', label: '', align: 'right', render: row => <Button size="small" onClick={() => setSelected(row._id)}>Open</Button> },
  ];

  return (
    <>
      <AdminHeader title="Bookings" subtitle="Approve requests, assign chauffeurs and track payments." />
      <Tabs value={view} onChange={(e, value) => { setParams(value ? { view: value } : {}); setPage(1); }} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {VIEWS.map(([key, label]) => <Tab key={key || 'all'} value={key} label={label} />)}
      </Tabs>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search reference, customer name or phone" value={q} onChange={e => setQ(e.target.value)} sx={{ flex: 1, maxWidth: 420 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
        {ridesEnabled && (
          <TextField select size="small" label="Type" value={filters.type} onChange={e => { setFilters({ ...filters, type: e.target.value }); setPage(1); }} sx={{ minWidth: 120 }}>
            <MenuItem value="">All</MenuItem><MenuItem value="ride">Rides</MenuItem><MenuItem value="rental">Chauffeur</MenuItem>
          </TextField>
        )}
        <TextField select size="small" label="Status" value={filters.status} onChange={e => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">All</MenuItem>
          {Object.entries(STATUS).map(([key, meta]) => <MenuItem key={key} value={key}>{meta.label}</MenuItem>)}
        </TextField>
      </Stack>
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} page={page} total={data?.total} onPage={setPage} empty={view ? 'Nothing here. All caught up!' : 'No bookings match these filters.'} />
      <Details id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
