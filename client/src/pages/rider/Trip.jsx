import { lazy, Suspense, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Alert, Avatar, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  Rating, Stack, Step, StepLabel, Stepper, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CallRounded from '@mui/icons-material/CallRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import CreditCardRounded from '@mui/icons-material/CreditCardRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import ShareRounded from '@mui/icons-material/ShareRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import SosRounded from '@mui/icons-material/SosRounded';
import SmsRounded from '@mui/icons-material/SmsRounded';
import MapLayout from '../../components/MapLayout';
import CarImage from '../../components/CarImage';
import { CardSkeleton, FareBreakdown, RouteLine, StatusChip } from '../../components/ui';
import { del, get, post } from '../../lib/api';
import { dateTime, friendlyDateTime, km, minutes, PREFERENCES } from '../../lib/format';
import { useAuth } from '../../providers/AuthProvider';
import { useRealtime } from '../../providers/RealtimeProvider';
import { useToast } from '../../providers/ToastProvider';

const PaymentDialog = lazy(() => import('../../components/PaymentDialog'));

const LIVE = ['scheduled', 'requested', 'accepted', 'arrived', 'in_progress', 'pending_driver'];
const SHAREABLE = ['scheduled', 'requested', 'accepted', 'arrived', 'in_progress'];
const SOS_STATUSES = ['accepted', 'arrived', 'in_progress'];

function ScheduledCard({ booking }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 2, borderRadius: 4, bgcolor: theme => alpha(theme.palette.info.main, 0.1) }}>
      <EventRounded color="info" sx={{ fontSize: 36 }} />
      <Box>
        <Typography variant="subtitle1">Pickup {friendlyDateTime(booking.scheduledFor)}</Typography>
        <Typography variant="body2" color="text.secondary">
          Your fare is locked. We start finding your driver 15 minutes before pickup and will notify you. Cancel free any time before then.
        </Typography>
      </Box>
    </Stack>
  );
}

function RidePreferences({ booking }) {
  const prefs = PREFERENCES.filter(([key]) => booking.preferences?.[key]);
  if (!prefs.length && !booking.noteToDriver) return null;
  return (
    <Stack spacing={1}>
      {prefs.length > 0 && <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>{prefs.map(([key, label]) => <Chip key={key} size="small" variant="outlined" label={label} />)}</Stack>}
      {booking.noteToDriver && <Typography variant="body2" color="text.secondary">Note to driver: “{booking.noteToDriver}”</Typography>}
    </Stack>
  );
}

function ShareTrip({ booking }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['booking', booking._id] });
  const start = useMutation({
    mutationFn: () => post(`/bookings/${booking._id}/share`),
    onSuccess: async ({ url }) => {
      refresh();
      if (navigator.share) {
        await navigator.share({ title: 'Follow my RIDE-IT trip', url }).catch(() => {});
      } else {
        await copy(url);
      }
    },
    onError: error => toast.error(error.message),
  });
  const stop = useMutation({
    mutationFn: () => del(`/bookings/${booking._id}/share`),
    onSuccess: () => { toast.success('Trip link turned off'); refresh(); },
    onError: error => toast.error(error.message),
  });
  async function copy(url) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Trip link copied. Send it to family or friends.');
    } catch {
      toast.info(url);
    }
  }
  if (!SHAREABLE.includes(booking.status)) return null;
  if (!booking.sharing) {
    return <Button variant="outlined" startIcon={<ShareRounded />} onClick={() => start.mutate()} disabled={start.isPending}>Share live trip</Button>;
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.25, borderRadius: 3, border: 1, borderColor: 'divider' }}>
      <ShareRounded color="secondary" fontSize="small" />
      <Typography variant="body2" sx={{ flex: 1 }}>Live trip link is on</Typography>
      <Button size="small" startIcon={<ContentCopyRounded />} onClick={() => copy(booking.shareUrl)}>Copy</Button>
      <Button size="small" color="inherit" onClick={() => stop.mutate()} disabled={stop.isPending}>Turn off</Button>
    </Stack>
  );
}

function currentPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 4000, maximumAge: 60000 },
    );
    return undefined;
  });
}

function SosButton({ booking }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const sos = useMutation({
    mutationFn: async () => post(`/bookings/${booking._id}/sos`, { location: await currentPosition() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking', booking._id] }),
    onError: error => toast.error(error.message),
  });
  if (!SOS_STATUSES.includes(booking.status)) return null;
  const result = sos.data;
  const smsBody = result ? encodeURIComponent(`I need help. Follow my RIDE-IT trip live: ${result.shareUrl}`) : '';
  return (
    <>
      <Button color="error" variant="contained" startIcon={<SosRounded />} onClick={() => setOpen(true)} sx={{ fontWeight: 700 }}>Emergency SOS</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ color: 'error.main' }}>{result ? 'Help is on the way' : 'Need urgent help?'}</DialogTitle>
        <DialogContent>
          {!result ? (
            <Typography color="text.secondary">
              This alerts the RIDE-IT safety team right away with your trip and location, and turns on live trip sharing.
              If you are in immediate danger, call 112 first.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              <Alert severity="success">Our safety team has been alerted and will contact you.</Alert>
              <Button fullWidth color="error" variant="contained" size="large" startIcon={<CallRounded />} href={`tel:${result.emergencyNumber}`}>Call {result.emergencyNumber} (emergency)</Button>
              {result.trustedContact ? (
                <Button fullWidth variant="outlined" startIcon={<SmsRounded />} href={`sms:${result.trustedContact.phone}?body=${smsBody}`}>Text {result.trustedContact.name} your live trip</Button>
              ) : (
                <Typography variant="caption" color="text.secondary">Tip: add a trusted contact in your profile to message them in one tap.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {!result ? (
            <>
              <Button href="tel:112" color="error">Call 112</Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button color="error" variant="contained" onClick={() => sos.mutate()} disabled={sos.isPending}>{sos.isPending ? 'Sending…' : 'Send SOS'}</Button>
            </>
          ) : <Button onClick={() => setOpen(false)}>Close</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}
const RIDE_STEPS = [['requested', 'Requested'], ['accepted', 'Driver assigned'], ['arrived', 'Driver arrived'], ['in_progress', 'On trip'], ['completed', 'Completed']];

function Searching() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', py: 3, textAlign: 'center' }}>
      <Box sx={{ position: 'relative', width: 96, height: 96, display: 'grid', placeItems: 'center', color: 'primary.main' }}>
        {[0, 0.5, 1].map(delay => (
          <Box key={delay} component={motion.span} initial={{ scale: 0.5, opacity: 0.7 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 2, repeat: Infinity, delay }} sx={{ position: 'absolute', inset: 0, borderRadius: '50%', border: 2, borderColor: 'primary.main' }} />
        ))}
        <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'primary.main' }} />
      </Box>
      <Typography variant="h5">Finding your driver</Typography>
      <Typography variant="body2" color="text.secondary">Nearby drivers are seeing your request. This usually takes a minute or two.</Typography>
    </Stack>
  );
}

function DriverCard({ driver }) {
  if (!driver) return null;
  const v = driver.vehicle || {};
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
      <Avatar sx={{ width: 52, height: 52, bgcolor: 'secondary.main', color: 'secondary.contrastText', fontWeight: 700 }}>{driver.fullName?.[0]}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle1" noWrap>{driver.fullName}</Typography>
          {driver.rating?.average && <Chip size="small" icon={<StarRounded />} label={driver.rating.average} />}
        </Stack>
        <Typography variant="body2" color="text.secondary" noWrap>{[v.color, v.make, v.model].filter(Boolean).join(' ')}</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: 1 }}>{v.plateNumber}</Typography>
      </Box>
      {driver.phoneNumber && (
        <Tooltip title="Call driver">
          <IconButton component="a" href={`tel:${driver.phoneNumber}`} aria-label="Call driver" sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', '&:hover': { bgcolor: 'secondary.dark' } }}><CallRounded /></IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function Pin({ pin }) {
  return (
    <Box sx={{ p: 2, borderRadius: 4, border: 1, borderColor: theme => alpha(theme.palette.primary.main, 0.4), bgcolor: theme => alpha(theme.palette.primary.main, 0.08), textAlign: 'center' }}>
      <Typography variant="overline" color="text.secondary">Share this PIN with your driver to start</Typography>
      <Typography aria-label={`Ride PIN ${pin.split('').join(' ')}`} sx={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 40, letterSpacing: '0.4em', ml: '0.4em', color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>{pin}</Typography>
    </Box>
  );
}

function RateDriver({ booking }) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  const rate = useMutation({
    mutationFn: () => post(`/bookings/${booking._id}/rate`, { score, comment: comment || undefined }),
    onSuccess: () => { toast.success('Thanks for your feedback!'); queryClient.invalidateQueries({ queryKey: ['booking', booking._id] }); },
    onError: error => toast.error(error.message),
  });
  if (booking.ratingByCustomer) {
    return <Alert severity="success" icon={<StarRounded />}>You rated this trip {booking.ratingByCustomer.score}★</Alert>;
  }
  return (
    <Stack spacing={1.5} sx={{ p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle1">How was your trip with {booking.driver?.fullName?.split(' ')[0]}?</Typography>
      <Rating value={score} onChange={(e, value) => value && setScore(value)} size="large" />
      <TextField size="small" label="Add a comment (optional)" value={comment} onChange={e => setComment(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      <Button variant="contained" onClick={() => rate.mutate()} disabled={rate.isPending}>Submit rating</Button>
    </Stack>
  );
}

function CancelButton({ booking }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: () => post(`/bookings/${booking._id}/cancel`, { reason: reason || undefined }),
    onSuccess: () => {
      setOpen(false);
      toast.success('Booking cancelled');
      queryClient.invalidateQueries({ queryKey: ['booking', booking._id] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: error => toast.error(error.message),
  });
  return (
    <>
      <Button color="error" variant="outlined" fullWidth onClick={() => setOpen(true)}>Cancel {booking.type === 'ride' ? 'ride' : 'rental'}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Cancel this {booking.type}?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {booking.payment?.status === 'paid' ? 'Your card payment will be refunded automatically.' : 'There is no cancellation fee.'}
          </Typography>
          <TextField label="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setOpen(false)}>Keep it</Button>
          <Button color="error" variant="contained" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel booking</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function PaymentRow({ booking }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const payment = booking.payment || {};
  const canPay = payment.method === 'card' && ['pending', 'failed'].includes(payment.status) && !['cancelled', 'expired'].includes(booking.status);
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Box>
        <Typography variant="body2" color="text.secondary">Payment</Typography>
        <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{payment.method} · {payment.status}</Typography>
      </Box>
      {canPay && (
        <>
          <Button startIcon={<CreditCardRounded />} variant="contained" size="small" onClick={() => setOpen(true)}>Pay now</Button>
          {open && (
            <Suspense fallback={null}>
              <PaymentDialog
                open={open}
                bookingId={booking._id}
                amount={booking.totalAmount}
                onClose={() => setOpen(false)}
                onPaid={status => {
                  setOpen(false);
                  toast.success(status === 'paid' ? 'Payment received' : 'Payment is processing');
                  queryClient.invalidateQueries({ queryKey: ['booking', booking._id] });
                }}
              />
            </Suspense>
          )}
        </>
      )}
    </Stack>
  );
}

function RideDetails({ booking }) {
  const active = ['scheduled', 'requested', 'accepted', 'arrived'].includes(booking.status);
  const isRider = useAuth().role === 'customer';
  const stepIndex = RIDE_STEPS.findIndex(([status]) => status === booking.status);
  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">Your ride</Typography>
        <StatusChip status={booking.status} />
      </Stack>
      {booking.status === 'scheduled' && <ScheduledCard booking={booking} />}
      {booking.status === 'requested' && <Searching />}
      {['accepted', 'arrived', 'in_progress'].includes(booking.status) && <DriverCard driver={booking.driver} />}
      {booking.pin && ['scheduled', 'requested', 'accepted', 'arrived'].includes(booking.status) && <Pin pin={booking.pin} />}
      {isRider && <SosButton booking={booking} />}
      {isRider && <ShareTrip booking={booking} />}
      {booking.status === 'expired' && (
        <Alert severity="warning">
          {booking.cancellation?.by === 'system' && booking.cancellation.reason
            ? `This scheduled ride could not start: ${booking.cancellation.reason.toLowerCase()}.`
            : 'No driver accepted in time. Please try again — drivers are more available a few minutes later.'}
        </Alert>
      )}
      {booking.status === 'cancelled' && <Alert severity="info">This ride was cancelled{booking.cancellation?.by === 'admin' ? ' by our support team' : ''}.</Alert>}
      {stepIndex >= 0 && (
        <Stepper activeStep={booking.status === 'completed' ? RIDE_STEPS.length : stepIndex} orientation="horizontal" alternativeLabel sx={{ '& .MuiStepLabel-label': { fontSize: 11, mt: 0.5 } }}>
          {RIDE_STEPS.map(([status, label]) => <Step key={status}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>
      )}
      <Divider />
      <RouteLine pickup={booking.pickup} drop={booking.drop} stops={booking.stops || []} />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Chip size="small" label={km(booking.distanceKm)} />
        <Chip size="small" label={`~${minutes(booking.durationMin)}`} />
        <Chip size="small" label={booking.category?.toUpperCase()} variant="outlined" />
        {booking.promo?.code && <Chip size="small" color="success" variant="outlined" label={`${booking.promo.code} applied`} />}
      </Stack>
      <RidePreferences booking={booking} />
      <FareBreakdown lines={booking.fareBreakdown} total={booking.totalAmount} />
      <PaymentRow booking={booking} />
      {booking.status === 'completed' && booking.driver && <RateDriver booking={booking} />}
      {active && <CancelButton booking={booking} />}
      {['completed', 'cancelled', 'expired'].includes(booking.status) && (
        <Button variant="contained" component={RouterLink} to="/ride" state={{ pickup: booking.pickup, drop: booking.drop, stops: booking.stops }}>Book again</Button>
      )}
    </Stack>
  );
}

function RentalDetails({ booking }) {
  const canCancel = ['pending_driver', 'confirmed'].includes(booking.status) && new Date(booking.start) > new Date();
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={2.5}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h3" component="h1">Rental</Typography>
          <StatusChip status={booking.status} />
        </Stack>
        <Box sx={{ p: 3, borderRadius: 5, bgcolor: 'action.hover', display: 'flex', justifyContent: 'center' }}><CarImage car={booking.car} width={240} /></Box>
        <Typography variant="h5">{booking.car?.name}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Box><Typography variant="caption" color="text.secondary">From</Typography><Typography variant="subtitle1">{dateTime(booking.start)}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Until</Typography><Typography variant="subtitle1">{dateTime(booking.end)}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Duration</Typography><Typography variant="subtitle1">{booking.totalHours} h</Typography></Box>
        </Stack>
        {booking.driverRequired && (booking.driver ? <DriverCard driver={booking.driver} /> : <Alert severity="info">We are assigning a chauffeur. You will be notified.</Alert>)}
        <FareBreakdown lines={booking.fareBreakdown} total={booking.totalAmount} />
        <PaymentRow booking={booking} />
        {canCancel && <CancelButton booking={booking} />}
      </Stack>
    </Container>
  );
}

export default function Trip() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { connected } = useRealtime();
  const { data, error, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => get(`/bookings/${id}`),
    refetchInterval: query => (LIVE.includes(query.state.data?.booking?.status) ? (connected ? 30000 : 6000) : false),
  });

  if (isLoading) return <Container maxWidth="sm" sx={{ py: 6 }}><CardSkeleton rows={4} /></Container>;
  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error" action={<Button color="inherit" onClick={() => navigate('/trips')}>My trips</Button>}>{error.message}</Alert>
      </Container>
    );
  }
  const { booking } = data;
  if (booking.type === 'rental') return <RentalDetails booking={booking} />;
  return (
    <MapLayout map={{ pickup: booking.pickup, drop: booking.drop, stops: booking.stops || [], route: booking.routeGeometry, animated: ['requested', 'accepted', 'arrived', 'in_progress'].includes(booking.status) }}>
      <RideDetails booking={booking} />
    </MapLayout>
  );
}
