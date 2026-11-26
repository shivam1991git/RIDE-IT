import { useEffect, useRef } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Alert, Box, Button, Card, Chip, Container, Stack, Switch, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import InboxRounded from '@mui/icons-material/InboxRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import { CardSkeleton, EmptyState, RideExtras, RouteLine, StatCard, StatusChip } from '../../shared/components/ui';
import BarChart, { lastNDays } from '../../shared/components/BarChart';
import CarImage from '../../shared/components/vehicles/CarImage';
import { get, patch, post } from '../../shared/api/apiClient';
import { dateTime, dateOnly, friendlyDateTime, km, money, driverEarning, RENTAL_TYPES, rentalRoute } from '../../shared/utils/format';
import { useMeta } from '../../shared/api/useAppConfig';
import { useAuth } from '../../app/providers/AuthProvider';
import { useRealtime } from '../../app/providers/RealtimeProvider';
import { useToast } from '../../app/providers/ToastProvider';

// Shares the driver's position while online so riders' requests can be sorted by distance.
function useLocationSharing(enabled) {
  const last = useRef(0);
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(position => {
      if (Date.now() - last.current < 20000) return;
      last.current = Date.now();
      post('/driver/location', { lat: position.coords.latitude, lng: position.coords.longitude }).catch(() => {});
    }, () => {}, { enableHighAccuracy: true, maximumAge: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
}

function RequestCard({ booking, onAccept, busy }) {
  const ride = booking.type === 'ride';
  return (
    <Card component={motion.div} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} sx={{ p: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.25, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Chip size="small" color={ride ? 'primary' : 'secondary'} label={ride ? booking.category.toUpperCase() : 'CHAUFFEUR RENTAL'} />
            {booking.pickupDistanceKm !== undefined && <Chip size="small" variant="outlined" label={`${km(booking.pickupDistanceKm)} to pickup`} />}
            <Typography variant="caption" color="text.secondary">{booking.user?.fullName}{booking.user?.rating?.average ? ` · ${booking.user.rating.average}★` : ''}</Typography>
          </Stack>
          {ride ? (
            <>
              <RouteLine pickup={booking.pickup} drop={booking.drop} stops={booking.stops || []} dense />
              <RideExtras booking={booking} dense />
            </>
          ) : (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <CarImage car={booking.car} width={72} />
              <Box>
                <Typography variant="subtitle2">{booking.car?.name}</Typography>
                <Typography variant="body2" color="text.secondary">{dateTime(booking.start)} · {booking.totalHours} h</Typography>
              </Box>
            </Stack>
          )}
        </Box>
        <Stack direction={{ xs: 'row', sm: 'column' }} spacing={1} sx={{ alignItems: { xs: 'center', sm: 'flex-end' }, justifyContent: 'space-between' }}>
          <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(driverEarning(booking))}</Typography>
          <Button variant="contained" onClick={() => onAccept(booking)} disabled={busy}>Accept</Button>
        </Stack>
      </Stack>
    </Card>
  );
}

// A trip operations has assigned to this chauffeur.
function AssignmentCard({ booking, onAcknowledge, busy }) {
  const acknowledged = Boolean(booking.assignment?.acknowledgedAt) || booking.status !== 'confirmed';
  return (
    <Card sx={{ p: 2.5, borderColor: acknowledged ? 'divider' : 'warning.main' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Chip size="small" color="primary" label={booking.reference} />
            <StatusChip status={booking.status} />
            <Typography variant="caption" color="text.secondary">{RENTAL_TYPES[booking.rentalType]}</Typography>
          </Stack>
          <Typography variant="subtitle1">{friendlyDateTime(booking.start)}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{rentalRoute(booking)}</Typography>
          <Typography variant="caption" color="text.secondary">{booking.car?.name} · {booking.car?.registrationNumber} · {booking.passengers} pax · {booking.user?.fullName}</Typography>
        </Box>
        <Stack direction={{ xs: 'row', sm: 'column' }} spacing={1} sx={{ alignItems: { sm: 'flex-end' } }}>
          {!acknowledged && <Button variant="contained" onClick={() => onAcknowledge(booking)} disabled={busy}>Acknowledge</Button>}
          <Button variant={acknowledged ? 'contained' : 'outlined'} component={RouterLink} to={`/driver/jobs/${booking._id}`}>Open</Button>
        </Stack>
      </Stack>
    </Card>
  );
}

function Compliance({ driver }) {
  if (!driver || driver.status !== 'approved') return null;
  const days = driver.licenseExpiry ? Math.floor((new Date(driver.licenseExpiry) - Date.now()) / 86400000) : null;
  const messages = [];
  if (driver.policeVerification?.status !== 'verified') messages.push('Your police verification is not complete yet, so trips cannot be assigned to you. Please share it with operations.');
  if (days === null) messages.push('Your licence expiry date is missing. Please share your licence with operations.');
  else if (days < 0) messages.push(`Your driving licence expired on ${dateOnly(driver.licenseExpiry)}. Renew it to get new trips.`);
  else if (days <= 30) messages.push(`Your driving licence expires on ${dateOnly(driver.licenseExpiry)}. Renew it soon to keep getting trips.`);
  if (!messages.length) return null;
  return <Alert severity="warning" sx={{ mb: 3 }}>{messages.join(' ')}</Alert>;
}

export default function DriverHome() {
  const { account } = useAuth();
  const { connected } = useRealtime();
  const { ridesEnabled } = useMeta();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const summary = useQuery({ queryKey: ['driver', 'summary'], queryFn: () => get('/driver/summary') });
  const driver = summary.data?.driver;
  const online = Boolean(driver?.isOnline);
  const approved = driver?.status === 'approved';
  useLocationSharing(online && ridesEnabled);

  const requests = useQuery({
    queryKey: ['driver', 'requests'],
    queryFn: () => get('/driver/requests'),
    enabled: approved && ridesEnabled,
    refetchInterval: online ? (connected ? 30000 : 8000) : false,
  });
  const assignments = useQuery({
    queryKey: ['driver', 'assignments'],
    queryFn: () => get('/driver/assignments'),
    enabled: approved,
    refetchInterval: connected ? 60000 : 15000,
  });
  const acknowledge = useMutation({
    mutationFn: booking => post(`/driver/bookings/${booking._id}/acknowledge`),
    onSuccess: () => { toast.success('Trip acknowledged'); queryClient.invalidateQueries({ queryKey: ['driver'] }); },
    onError: error => toast.error(error.message),
  });
  const history = useQuery({ queryKey: ['bookings', 'driver-history'], queryFn: () => get('/bookings?scope=past&limit=5') });

  const toggle = useMutation({
    mutationFn: isOnline => patch('/driver/availability', { isOnline }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver'] });
    },
    onError: error => toast.error(error.message),
  });
  const accept = useMutation({
    mutationFn: booking => post(`/driver/bookings/${booking._id}/accept`),
    onSuccess: ({ booking }) => {
      queryClient.invalidateQueries({ queryKey: ['driver'] });
      if (booking.type === 'ride') navigate(`/driver/jobs/${booking._id}`);
      else toast.success('Rental assigned to you');
    },
    onError: error => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ['driver', 'requests'] });
    },
  });

  if (summary.isLoading) return <Container maxWidth="lg" sx={{ py: 6 }}><CardSkeleton rows={4} /></Container>;
  const stats = summary.data?.stats || {};
  const chart = lastNDays(summary.data?.daily || [], 7, 'earnings').map(d => ({ ...d, extra: `${d.row?.trips || 0} trips` }));
  const items = [...(requests.data?.rides || []), ...(requests.data?.rentals || [])];

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, mb: 3 }}>
        <Box>
          <Typography variant="overline" color="primary">Driver</Typography>
          <Typography variant="h2" component="h1">Hi, {account.fullName.split(' ')[0]}</Typography>
        </Box>
        {ridesEnabled && <Card
          sx={{
            p: 1.5, pl: 2.5, display: 'flex', alignItems: 'center', gap: 2, borderRadius: 999,
            borderColor: online ? 'success.main' : 'divider',
            bgcolor: theme => (online ? alpha(theme.palette.success.main, 0.1) : 'background.paper'),
          }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: online ? 'success.main' : 'text.disabled', color: 'success.main' }} className={online ? 'rid-pulse' : undefined} />
          <Box>
            <Typography variant="subtitle1">{online ? 'You are online' : 'You are offline'}</Typography>
            <Typography variant="caption" color="text.secondary">{online ? `Receiving ${driver.vehicle?.category?.toUpperCase()} requests` : 'Go online to receive ride requests'}</Typography>
          </Box>
          <Switch checked={online} onChange={e => toggle.mutate(e.target.checked)} disabled={!approved || toggle.isPending} slotProps={{ input: { 'aria-label': 'Online status' } }} />
        </Card>}
      </Stack>

      {!approved && (
        <Alert severity={driver?.status === 'pending' ? 'info' : 'warning'} sx={{ mb: 3 }}>
          {driver?.status === 'pending'
            ? 'Your application is being reviewed. Our team checks your licence and police verification; you will be notified once approved.'
            : `Your driver account is ${driver?.status}. Contact support for help.`}
        </Alert>
      )}
      <Compliance driver={driver} />
      {summary.data?.activeBookingId && (
        <Alert severity="warning" sx={{ mb: 3 }} action={<Button color="inherit" component={RouterLink} to={`/driver/jobs/${summary.data.activeBookingId}`}>Open trip</Button>}>
          You have a trip in progress.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Today" value={money(stats.todayEarnings)} hint={`${stats.todayTrips || 0} trips`} icon={TodayRounded} />
        <StatCard label="Last 7 days" value={money(stats.weekEarnings)} icon={CurrencyRupeeRounded} accent="secondary" />
        <StatCard label="All trips" value={stats.trips || 0} hint={`${stats.distanceKm || 0} km driven`} icon={DirectionsCarRounded} accent="secondary" />
        <StatCard label="Rating" value={driver?.rating?.average ?? '—'} hint={`${driver?.rating?.count || 0} ratings`} icon={StarRounded} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 1.5 }}>Your assigned trips</Typography>
          {!approved ? null : assignments.isLoading ? <CardSkeleton rows={2} height={110} /> : assignments.data?.upcoming?.length ? (
            <Stack spacing={1.5} sx={{ mb: 3 }}>
              {assignments.data.upcoming.map(booking => <AssignmentCard key={booking._id} booking={booking} onAcknowledge={b => acknowledge.mutate(b)} busy={acknowledge.isPending} />)}
            </Stack>
          ) : (
            <Box sx={{ mb: 3 }}>
              <EmptyState icon={EventAvailableRounded} title="No trips assigned yet" body="When operations assigns you a trip it appears here, and you get a notification." />
            </Box>
          )}
          {ridesEnabled && <>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="h5">Ride requests</Typography>
            {online && <Chip size="small" label={connected ? 'Live' : 'Refreshing every few seconds'} color={connected ? 'success' : 'default'} variant="outlined" />}
          </Stack>
          {!approved ? null : requests.isLoading ? <CardSkeleton rows={2} height={110} /> : items.length ? (
            <Stack spacing={1.5}>
              <AnimatePresence initial={false}>
                {items.map(booking => <RequestCard key={booking._id} booking={booking} onAccept={b => accept.mutate(b)} busy={accept.isPending} />)}
              </AnimatePresence>
            </Stack>
          ) : (
            <EmptyState
              icon={InboxRounded}
              title={online ? 'Waiting for requests' : 'You are offline'}
              body={online ? 'New ride requests for your vehicle type appear here instantly.' : 'Switch online to start receiving ride requests.'}
            />
          )}
          </>}
        </Box>
        <Stack spacing={3}>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6">Trips, last 7 days</Typography>
            <Typography variant="caption" color="text.secondary">Value of completed trips</Typography>
            <Box sx={{ mt: 2 }}><BarChart data={chart} label="Daily earnings" format={money} caption="Driver earnings per day for the last 7 days" /></Box>
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Recent trips</Typography>
            {history.data?.items?.length ? (
              <Stack spacing={1.25}>
                {history.data.items.map(b => (
                  <Stack key={b._id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{b.type === 'ride' ? `${b.pickup?.name} → ${b.drop?.name}` : `${b.reference || ''} ${RENTAL_TYPES[b.rentalType] || `${b.car?.name} rental`}`}</Typography>
                      <Typography variant="caption" color="text.secondary">{dateTime(b.updatedAt)}</Typography>
                    </Box>
                    <StatusChip status={b.status} />
                    <Typography variant="subtitle2">{money(driverEarning(b))}</Typography>
                  </Stack>
                ))}
              </Stack>
            ) : <Typography variant="body2" color="text.secondary">Completed trips will show up here.</Typography>}
          </Card>
        </Stack>
      </Box>
    </Container>
  );
}
