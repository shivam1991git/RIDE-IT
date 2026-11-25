// A chauffeur's assigned trip: acknowledge or decline, arrive, start with the
// customer's PIN and opening odometer, then close with the final reading,
// tolls/parking and the money collected.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Avatar, Box, Button, Card, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import CallRounded from '@mui/icons-material/CallRounded';
import NavigationRounded from '@mui/icons-material/NavigationRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';
import CarImage from '../../components/CarImage';
import { FareBreakdown, StatusChip } from '../../components/ui';
import { post } from '../../lib/api';
import { dateTime, km, money, PAYMENT_STATUS, RENTAL_TYPES, rentalRoute } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';

const directions = place => `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
const ARRIVE_WINDOW_HOURS = 3;

// `inline`: the form shows the error itself, so no toast covers its button.
function useAction(id, { inline = false } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ action, body }) => post(`/driver/bookings/${id}/${action}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
      queryClient.invalidateQueries({ queryKey: ['driver'] });
    },
    onError: error => { if (!inline) toast.error(error.message); },
  });
}

function Customer({ user }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
      <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 }}>{user?.fullName?.[0]}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" noWrap>{user?.fullName}</Typography>
        <Typography variant="body2" color="text.secondary">Customer{user?.rating?.average ? ` · ${user.rating.average}★` : ''} · {user?.phoneNumber}</Typography>
      </Box>
      {user?.phoneNumber && (
        <Tooltip title="Call customer">
          <IconButton component="a" href={`tel:${user.phoneNumber}`} aria-label="Call customer" sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', '&:hover': { bgcolor: 'secondary.dark' } }}><CallRounded /></IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', py: 0.4 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 500 }}>{value}</Typography>
    </Stack>
  );
}

function DeclineDialog({ booking, open, onClose }) {
  const [reason, setReason] = useState('');
  const action = useAction(booking._id);
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Can’t do this trip?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Operations will be alerted to assign another chauffeur. Please tell them why.</Typography>
        <TextField label="Reason" value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} fullWidth />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Back</Button>
        <Button color="error" variant="contained" disabled={reason.trim().length < 3 || action.isPending}
          onClick={() => action.mutate({ action: 'decline', body: { reason } }, { onSuccess: () => { toast.success('Operations has been told'); navigate('/driver'); } })}>
          Decline trip
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function IssueDialog({ booking, open, onClose }) {
  const [form, setForm] = useState({ category: 'breakdown', message: '' });
  const action = useAction(booking._id);
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Report a problem</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="What happened?" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            <MenuItem value="breakdown">Vehicle breakdown</MenuItem>
            <MenuItem value="accident">Accident</MenuItem>
            <MenuItem value="customer">Customer issue</MenuItem>
            <MenuItem value="route">Route or traffic problem</MenuItem>
            <MenuItem value="other">Something else</MenuItem>
          </TextField>
          <TextField label="Details" multiline minRows={3} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} slotProps={{ htmlInput: { maxLength: 1000 } }} helperText="Where are you, and what do you need?" />
          {['breakdown', 'accident'].includes(form.category) && <Alert severity="warning">This is sent as urgent. If anyone is hurt, call 112 first.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={form.message.trim().length < 5 || action.isPending}
          onClick={() => action.mutate({ action: 'issue', body: form }, { onSuccess: () => { toast.success('Reported. Operations will call you.'); onClose(); } })}>
          Send report
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StartForm({ booking }) {
  const action = useAction(booking._id, { inline: true });
  const [pin, setPin] = useState('');
  const [odometer, setOdometer] = useState('');
  const valid = pin.length === 4 && odometer !== '' && Number(odometer) >= 0;
  return (
    <Stack spacing={1.5} component="form" onSubmit={e => { e.preventDefault(); action.mutate({ action: 'start', body: { pin, startOdometer: Number(odometer) } }); }}>
      {action.error && <Alert severity="error">{action.error.message}</Alert>}
      <TextField
        label="Customer’s 4-digit PIN"
        value={pin}
        onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); action.reset(); }}
        slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', style: { fontSize: 28, letterSpacing: '0.5em', textAlign: 'center', fontFamily: 'Sora' } } }}
      />
      <TextField label="Opening odometer (km)" type="number" value={odometer} onChange={e => setOdometer(e.target.value)} slotProps={{ htmlInput: { min: 0, inputMode: 'numeric' } }} />
      <Button type="submit" size="large" variant="contained" disabled={!valid || action.isPending}>Start trip</Button>
    </Stack>
  );
}

function CompleteForm({ booking }) {
  const action = useAction(booking._id, { inline: true });
  const startKm = booking.trip?.startOdometer ?? 0;
  const rates = booking.rates || {};
  const [form, setForm] = useState({ endOdometer: '', tolls: '', parking: '', amount: '', method: 'cash' });
  const set = name => e => setForm({ ...form, [name]: e.target.value });
  const end = Number(form.endOdometer);
  const driven = form.endOdometer === '' ? null : end - startKm;
  // Preview only; the server works out the bill (including extra hours and GST).
  const extraKm = driven !== null && rates.includedKm ? Math.max(0, Math.ceil(driven - rates.includedKm)) : 0;
  const extraKmCharge = extraKm * (rates.extraKmRate || 0);
  const preview = booking.totalAmount + extraKmCharge + Math.round(extraKmCharge * (rates.gstPercent || 0) / 100) + Number(form.tolls || 0) + Number(form.parking || 0);
  const paid = (booking.payment?.paid || 0) - (booking.payment?.refunded || 0);
  const owed = Math.max(0, preview - paid);
  const invalid = form.endOdometer === '' || driven < 0;
  const submit = () => action.mutate({
    action: 'complete',
    body: {
      endOdometer: end,
      tolls: Number(form.tolls || 0),
      parking: Number(form.parking || 0),
      ...(Number(form.amount) > 0 ? { collected: { amount: Number(form.amount), method: form.method } } : {}),
    },
  });
  return (
    <Stack spacing={1.5}>
      <TextField label="Closing odometer (km)" type="number" value={form.endOdometer} onChange={set('endOdometer')} error={driven !== null && driven < 0}
        helperText={driven === null ? `Opening reading: ${startKm} km` : driven < 0 ? `Must be at least ${startKm}` : `${driven} km driven${extraKm ? ` · ${extraKm} km extra` : ''}`} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <TextField label="Tolls paid (₹)" type="number" value={form.tolls} onChange={set('tolls')} slotProps={{ htmlInput: { min: 0 } }} />
        <TextField label="Parking paid (₹)" type="number" value={form.parking} onChange={set('parking')} slotProps={{ htmlInput: { min: 0 } }} />
      </Box>
      {!invalid && (
        <Alert severity="info">Estimated final bill {money(preview)} · already paid {money(paid)} · collect about <b>{money(owed)}</b>. Extra hours, if any, are added by the system.</Alert>
      )}
      <Stack direction="row" spacing={1.5}>
        <TextField label="Amount collected now (₹)" type="number" value={form.amount} onChange={set('amount')} sx={{ flex: 1 }} slotProps={{ htmlInput: { min: 0 } }} />
        <ToggleButtonGroup exclusive size="small" value={form.method} onChange={(e, value) => value && setForm({ ...form, method: value })} aria-label="Collected by">
          <ToggleButton value="cash">Cash</ToggleButton>
          <ToggleButton value="upi">UPI</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {action.error && <Alert severity="error">{action.error.message}</Alert>}
      <Button size="large" variant="contained" color="success" disabled={invalid || action.isPending} onClick={submit}>Complete trip</Button>
    </Stack>
  );
}

export default function ChauffeurJob({ booking }) {
  const action = useAction(booking._id);
  const [dialog, setDialog] = useState(null);
  const startsIn = (new Date(booking.start).getTime() - Date.now()) / 3600e3;
  const canArrive = startsIn <= ARRIVE_WINDOW_HOURS;
  const destination = booking.destination || booking.drop;
  const s = booking.settlement;
  const payment = PAYMENT_STATUS[booking.payment?.status] || PAYMENT_STATUS.unpaid;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={2.5}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="overline" color="primary">{RENTAL_TYPES[booking.rentalType]}</Typography>
            <Typography variant="h3" component="h1">{booking.reference}</Typography>
          </Box>
          <StatusChip status={booking.status} size="medium" />
        </Stack>

        {booking.status === 'confirmed' && !booking.assignment?.acknowledgedAt && (
          <Alert severity="warning" action={<Button color="inherit" onClick={() => action.mutate({ action: 'acknowledge' })} disabled={action.isPending}>Acknowledge</Button>}>
            Please confirm you will do this trip.
          </Alert>
        )}

        <Customer user={booking.user} />

        <Card sx={{ p: 2 }}>
          <Row label="Pickup time" value={dateTime(booking.start)} />
          <Row label={booking.rentalType === 'outstation_round' ? 'Return by' : 'Until about'} value={dateTime(booking.end)} />
          <Row label="Route" value={rentalRoute(booking)} />
          <Row label="Pickup address" value={booking.pickup?.address || booking.pickup?.name} />
          <Row label="Package" value={booking.packageKey?.replace(/(\d+)h(\d+)/, '$1 h / $2 km')} />
          <Row label="Distance" value={booking.distanceKm ? `${km(booking.distanceKm)} one way` : null} />
          <Row label="Passengers" value={booking.passengers} />
          {booking.instructions && (
            <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary">Customer’s instructions</Typography>
              <Typography variant="body2">{booking.instructions}</Typography>
            </Box>
          )}
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <CarImage car={booking.car} width={90} />
            <Box>
              <Typography variant="subtitle2">{booking.car?.name}</Typography>
              <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{booking.car?.registrationNumber}</Typography>
            </Box>
          </Stack>
        </Card>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {['confirmed', 'arrived'].includes(booking.status) && booking.pickup && (
            <Button variant="outlined" startIcon={<NavigationRounded />} href={directions(booking.pickup)} target="_blank" rel="noopener">Navigate to pickup</Button>
          )}
          {booking.status === 'in_progress' && destination && (
            <Button variant="outlined" startIcon={<NavigationRounded />} href={directions(destination)} target="_blank" rel="noopener">Navigate to {destination.name}</Button>
          )}
          {['confirmed', 'arrived', 'in_progress'].includes(booking.status) && (
            <Button color="warning" startIcon={<ReportProblemRounded />} onClick={() => setDialog('issue')}>Report a problem</Button>
          )}
        </Stack>

        <Divider />

        {booking.status === 'confirmed' && (
          <Stack spacing={1.5}>
            <Button size="large" variant="contained" disabled={!canArrive || action.isPending} onClick={() => action.mutate({ action: 'arrive' })}>I have arrived at pickup</Button>
            {!canArrive && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>Available from {ARRIVE_WINDOW_HOURS} hours before pickup.</Typography>}
            <Button color="error" onClick={() => setDialog('decline')}>I can’t do this trip</Button>
          </Stack>
        )}
        {booking.status === 'arrived' && <StartForm booking={booking} />}
        {booking.status === 'in_progress' && <CompleteForm booking={booking} />}
        {booking.status === 'completed' && s && (
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Final bill</Typography>
            <FareBreakdown
              lines={[
                { label: 'Booked fare', amount: booking.totalAmount },
                ...(s.extraKmCharge ? [{ label: `Extra ${s.extraKm} km`, amount: s.extraKmCharge }] : []),
                ...(s.extraHourCharge ? [{ label: `Extra ${s.extraHours} h`, amount: s.extraHourCharge }] : []),
                ...(s.gst ? [{ label: 'GST on extras', amount: s.gst }] : []),
                ...(s.tolls ? [{ label: 'Tolls', amount: s.tolls }] : []),
                ...(s.parking ? [{ label: 'Parking', amount: s.parking }] : []),
              ]}
              total={booking.finalAmount}
            />
            <Chip size="small" sx={{ mt: 1.5 }} color={payment.tone === 'default' ? 'default' : payment.tone} label={`Payment: ${payment.label}`} />
          </Card>
        )}
        {['cancelled'].includes(booking.status) && <Alert severity="info">This trip was cancelled{booking.cancellation?.reason ? `: ${booking.cancellation.reason}` : ''}.</Alert>}
      </Stack>
      {dialog === 'decline' && <DeclineDialog booking={booking} open onClose={() => setDialog(null)} />}
      {dialog === 'issue' && <IssueDialog booking={booking} open onClose={() => setDialog(null)} />}
    </Container>
  );
}
