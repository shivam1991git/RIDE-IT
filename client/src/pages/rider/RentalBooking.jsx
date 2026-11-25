// A customer's chauffeur booking: status, chauffeur and car, trip, price,
// final bill, payments, and the actions allowed at this stage.
import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Avatar, Box, Button, Card, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  Stack, Step, StepLabel, Stepper, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CallRounded from '@mui/icons-material/CallRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import ReceiptRounded from '@mui/icons-material/ReceiptRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CarImage from '../../components/CarImage';
import { FareBreakdown, StatusChip } from '../../components/ui';
import { RateDriver, SosButton } from '../../components/TripActions';
import { get, post } from '../../lib/api';
import { useRentalOptions } from '../../lib/meta';
import { dateTime, km, money, PAYMENT_STATUS, RENTAL_TYPES, rentalRoute, toLocalInput, VEHICLE_CLASSES } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';

const STEPS = [['pending_approval', 'Requested'], ['confirmed', 'Confirmed'], ['arrived', 'Chauffeur arrived'], ['in_progress', 'On trip'], ['completed', 'Completed']];
const CHANGEABLE = ['pending_approval', 'pending_driver', 'confirmed'];

function useRefresh(booking) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['booking', booking._id] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
  };
}

function Section({ title, children, action }) {
  return (
    <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6">{title}</Typography>
        {action}
      </Stack>
      {children}
    </Card>
  );
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 500 }}>{value}</Typography>
    </Stack>
  );
}

function StatusBanner({ booking }) {
  if (booking.status === 'pending_approval') {
    return <Alert severity="info">We are confirming your car and chauffeur. You will get a notification as soon as it is confirmed.</Alert>;
  }
  if (booking.status === 'confirmed' && !booking.driver) {
    return <Alert severity="info">Your booking is confirmed. We are assigning your chauffeur and will notify you.</Alert>;
  }
  if (booking.status === 'rejected') {
    return (
      <Alert severity="error" action={<Button color="inherit" component={RouterLink} to={`/rentals?type=${booking.rentalType}`}>Book again</Button>}>
        We could not confirm this booking{booking.rejection?.reason ? `: ${booking.rejection.reason}` : '.'}
      </Alert>
    );
  }
  if (booking.status === 'cancelled') {
    const c = booking.cancellation || {};
    return (
      <Alert severity="info">
        Cancelled {c.by === 'admin' ? 'by our team' : 'by you'}{c.reason ? `: ${c.reason}` : ''}.
        {c.charge > 0 ? ` Cancellation charge ${money(c.charge)}.` : ''}
      </Alert>
    );
  }
  return null;
}

function Pin({ pin }) {
  return (
    <Box sx={{ p: 2, borderRadius: 4, border: 1, borderColor: theme => alpha(theme.palette.primary.main, 0.4), bgcolor: theme => alpha(theme.palette.primary.main, 0.08), textAlign: 'center' }}>
      <Typography variant="overline" color="text.secondary">Give this PIN to your chauffeur to start the trip</Typography>
      <Typography aria-label={`Trip PIN ${pin.split('').join(' ')}`} sx={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 40, letterSpacing: '0.4em', ml: '0.4em', color: 'primary.main' }}>{pin}</Typography>
    </Box>
  );
}

function Chauffeur({ booking }) {
  const { driver, car } = booking;
  return (
    <Section title="Your car and chauffeur">
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box sx={{ p: 1, borderRadius: 3, bgcolor: 'action.hover' }}><CarImage car={car} width={110} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1">{car?.name} <Typography component="span" variant="body2" color="text.secondary">· {VEHICLE_CLASSES[car?.category] || ''}</Typography></Typography>
            {car?.registrationNumber && booking.status !== 'pending_approval' && (
              <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: 1 }}>{car.registrationNumber}</Typography>
            )}
            <Typography variant="caption" color="text.secondary">{car?.capacity} seats · {car?.luggage ?? 2} bags{car?.ac !== false ? ' · AC' : ''}</Typography>
          </Box>
        </Stack>
        {driver ? (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 1.5, borderRadius: 3, bgcolor: 'action.hover' }}>
            <Avatar sx={{ width: 48, height: 48, bgcolor: 'secondary.main', color: 'secondary.contrastText', fontWeight: 700 }}>{driver.fullName?.[0]}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="subtitle1" noWrap>{driver.fullName}</Typography>
                {driver.rating?.average && <Chip size="small" icon={<StarRounded />} label={driver.rating.average} />}
              </Stack>
              <Typography variant="body2" color="text.secondary">Verified chauffeur · {driver.phoneNumber}</Typography>
            </Box>
            {driver.phoneNumber && (
              <Tooltip title="Call chauffeur">
                <IconButton component="a" href={`tel:${driver.phoneNumber}`} aria-label="Call chauffeur" sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', '&:hover': { bgcolor: 'secondary.dark' } }}><CallRounded /></IconButton>
              </Tooltip>
            )}
          </Stack>
        ) : ['pending_approval', 'confirmed'].includes(booking.status) && (
          <Typography variant="body2" color="text.secondary">Chauffeur details appear here once assigned.</Typography>
        )}
      </Stack>
    </Section>
  );
}

function TripDetails({ booking }) {
  const isRound = booking.rentalType === 'outstation_round';
  return (
    <Section title="Trip">
      <Row label="Type" value={`${RENTAL_TYPES[booking.rentalType]}${booking.packageKey ? ` · ${booking.packageKey.replace(/(\d+)h(\d+)/, '$1 h / $2 km')}` : ''}`} />
      <Row label="Route" value={rentalRoute(booking)} />
      {booking.drop && !['airport'].includes(booking.rentalType) && <Row label="Final drop" value={booking.drop.name} />}
      <Row label="Pickup" value={dateTime(booking.start)} />
      <Row label={isRound ? 'Return' : 'Until about'} value={dateTime(booking.end)} />
      {booking.distanceKm ? <Row label="Distance" value={`${km(booking.distanceKm)} one way`} /> : null}
      <Row label="Passengers" value={booking.passengers} />
      {booking.instructions && (
        <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">Your instructions</Typography>
          <Typography variant="body2">{booking.instructions}</Typography>
        </Box>
      )}
    </Section>
  );
}

function FinalBill({ booking }) {
  const s = booking.settlement;
  if (!s) return null;
  const lines = [
    { label: 'Trip fare (as booked)', amount: booking.totalAmount },
    s.extraKm ? { label: `Extra ${s.extraKm} km`, amount: s.extraKmCharge } : null,
    s.extraHours ? { label: `Extra ${s.extraHours} h`, amount: s.extraHourCharge } : null,
    s.gst ? { label: 'GST on extras', amount: s.gst } : null,
    s.tolls ? { label: 'Tolls', amount: s.tolls } : null,
    s.parking ? { label: 'Parking', amount: s.parking } : null,
  ].filter(Boolean);
  return (
    <Section title="Final bill">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{km(s.actualKm)} driven in {s.actualHours} h</Typography>
      <FareBreakdown lines={lines} total={booking.finalAmount} />
    </Section>
  );
}

function Payment({ booking }) {
  const toast = useToast();
  const { data: options } = useRentalOptions();
  const p = booking.payment || {};
  const status = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.unpaid;
  const net = (p.paid || 0) - (p.refunded || 0);
  const due = p.due ?? booking.totalAmount;
  const balance = Math.max(0, due - net);
  const open = !['cancelled', 'rejected'].includes(booking.status);
  const upiId = options?.contact?.upiId;
  const copy = async text => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.info(text);
    }
  };
  return (
    <Section title="Payment" action={<Chip size="small" color={status.tone === 'default' ? 'default' : status.tone} label={status.label} />}>
      <Row label="Preferred method" value={(p.method || 'cash').toUpperCase()} />
      <Row label="Paid so far" value={money(net)} />
      {open && <Row label="Balance due" value={money(balance)} />}
      {p.refundDue > 0 && <Row label="Refund due to you" value={money(p.refundDue)} />}
      {open && balance > 0 && booking.status !== 'pending_approval' && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          {upiId ? (
            <>
              <Typography variant="body2">Pay by UPI to <b>{upiId}</b> with note <b>{booking.reference}</b>, or pay your chauffeur at the end of the trip.</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button size="small" startIcon={<ContentCopyRounded />} onClick={() => copy(upiId)}>Copy UPI ID</Button>
                <Button size="small" component="a" href={`upi://pay?pa=${encodeURIComponent(upiId)}&pn=RIDE-IT&am=${balance}&cu=INR&tn=${encodeURIComponent(booking.reference || '')}`}>Open UPI app</Button>
              </Stack>
            </>
          ) : (
            <Typography variant="body2">Pay your chauffeur in cash or UPI at the end of the trip.</Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Payments are confirmed by our team and appear here.</Typography>
        </Box>
      )}
      {booking.status === 'pending_approval' && <Typography variant="caption" color="text.secondary">Nothing to pay until your booking is confirmed.</Typography>}
    </Section>
  );
}

function CancelDialog({ booking, open, onClose }) {
  const [reason, setReason] = useState('');
  const toast = useToast();
  const refresh = useRefresh(booking);
  const terms = useQuery({ queryKey: ['cancel-terms', booking._id], queryFn: () => get(`/rentals/${booking._id}/cancel-terms`), enabled: open, staleTime: 0 });
  const cancel = useMutation({
    mutationFn: () => post(`/bookings/${booking._id}/cancel`, { reason: reason || undefined }),
    onSuccess: () => { toast.success('Booking cancelled'); onClose(); refresh(); },
    onError: error => toast.error(error.message),
  });
  const t = terms.data?.terms;
  let summary = 'Checking the cancellation terms…';
  if (terms.error) summary = terms.error.message;
  else if (t) {
    if (t.rule === 'not_confirmed') summary = 'Your booking is not confirmed yet, so cancelling is free.';
    else if (t.paid === 0) summary = `You have not paid anything, so there is nothing to pay. (Policy: ${t.refundPercent}% refund at this time.)`;
    else summary = `Policy: ${t.refundPercent}% refund at this time. Cancellation charge ${money(t.charge)}; we will refund ${money(t.refund)} of the ${money(t.paid)} you paid.`;
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Cancel {booking.reference}?</DialogTitle>
      <DialogContent>
        <Alert severity={t && t.charge > 0 ? 'warning' : 'info'} sx={{ mb: 2 }}>{summary}</Alert>
        <TextField label="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Keep booking</Button>
        <Button color="error" variant="contained" onClick={() => cancel.mutate()} disabled={cancel.isPending || !t}>Cancel booking</Button>
      </DialogActions>
    </Dialog>
  );
}

function RescheduleDialog({ booking, open, onClose }) {
  const [start, setStart] = useState(() => toLocalInput(booking.start));
  const toast = useToast();
  const refresh = useRefresh(booking);
  const move = useMutation({
    mutationFn: () => post(`/rentals/${booking._id}/reschedule`, { start: new Date(start).toISOString() }),
    onSuccess: () => { toast.success('Pickup time changed'); onClose(); refresh(); },
    onError: error => toast.error(error.message),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Change pickup time</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>The trip keeps the same length and price. We check that your car{booking.driver ? ' and chauffeur are' : ' is'} free at the new time.</Typography>
        <TextField type="datetime-local" label="New pickup" value={start} onChange={e => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ mt: 1 }} fullWidth />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={() => move.mutate()} disabled={move.isPending || !start}>Change time</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function RentalBooking({ booking }) {
  const location = useLocation();
  const [dialog, setDialog] = useState(null);
  const changeable = CHANGEABLE.includes(booking.status) && new Date(booking.start) > new Date();
  const stepIndex = STEPS.findIndex(([status]) => status === booking.status);
  const showPin = booking.pin && ['confirmed', 'arrived'].includes(booking.status) && booking.driver;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={2.5}>
        {location.state?.justBooked && booking.status === 'pending_approval' && (
          <Alert icon={<CheckCircleRounded />} severity="success">Request {booking.reference} received. We will confirm your car and chauffeur shortly.</Alert>
        )}
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Box>
            <Typography variant="overline" color="primary">{RENTAL_TYPES[booking.rentalType] || 'Rental'}</Typography>
            <Typography variant="h3" component="h1">{booking.reference || 'Booking'}</Typography>
          </Box>
          <StatusChip status={booking.status} size="medium" />
        </Stack>
        {stepIndex >= 0 && (
          <Stepper activeStep={booking.status === 'completed' ? STEPS.length : stepIndex} alternativeLabel sx={{ '& .MuiStepLabel-label': { fontSize: 11, mt: 0.5 } }}>
            {STEPS.map(([status, label]) => <Step key={status}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>
        )}
        <StatusBanner booking={booking} />
        {showPin && <Pin pin={booking.pin} />}
        <SosButton booking={booking} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
          <Stack spacing={2.5}>
            <Chauffeur booking={booking} />
            <TripDetails booking={booking} />
          </Stack>
          <Stack spacing={2.5}>
            <Section title="Price">
              <FareBreakdown lines={booking.fareBreakdown} total={booking.totalAmount} />
              {booking.rates && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Extra km ₹{booking.rates.extraKmRate}/km{booking.rates.extraHourRate ? `, extra hour ₹${booking.rates.extraHourRate}` : ''} + GST. Tolls and parking at actuals.
                </Typography>
              )}
            </Section>
            <FinalBill booking={booking} />
            <Payment booking={booking} />
          </Stack>
        </Box>

        {booking.status === 'completed' && booking.driver && <RateDriver booking={booking} />}
        <Divider />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}>
          {changeable && <Button variant="outlined" onClick={() => setDialog('reschedule')}>Change pickup time</Button>}
          {changeable && <Button color="error" variant="outlined" onClick={() => setDialog('cancel')}>Cancel booking</Button>}
          <Button startIcon={<ReceiptRounded />} component={RouterLink} to={`/trips/${booking._id}/receipt`}>{booking.status === 'completed' ? 'Invoice' : 'Booking summary'}</Button>
          <Button startIcon={<SupportAgentRounded />} component={RouterLink} to={`/support?booking=${booking._id}`}>Get help</Button>
          {['completed', 'cancelled', 'rejected'].includes(booking.status) && (
            <Button variant="contained" component={RouterLink} to={`/rentals?type=${booking.rentalType}`}>Book again</Button>
          )}
        </Stack>
      </Stack>
      {dialog === 'cancel' && <CancelDialog booking={booking} open onClose={() => setDialog(null)} />}
      {dialog === 'reschedule' && <RescheduleDialog booking={booking} open onClose={() => setDialog(null)} />}
    </Container>
  );
}
