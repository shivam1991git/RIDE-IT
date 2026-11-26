import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, Container, Divider, FormControlLabel, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CallRounded from '@mui/icons-material/CallRounded';
import NavigationRounded from '@mui/icons-material/NavigationRounded';
import MapLayout from '../../shared/components/map/MapLayout';
import CarImage from '../../shared/components/vehicles/CarImage';
import ChauffeurJob from './ChauffeurJobDetails';
import { CardSkeleton, FareBreakdown, RideExtras, RouteLine, StatusChip } from '../../shared/components/ui';
import { get, post } from '../../shared/api/apiClient';
import { dateTime, driverEarning, km, minutes, money } from '../../shared/utils/format';
import { useRealtime } from '../../app/providers/RealtimeProvider';
import { useToast } from '../../app/providers/ToastProvider';

const directions = place => `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;

function RiderCard({ user }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
      <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 }}>{user?.fullName?.[0]}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" noWrap>{user?.fullName}</Typography>
        <Typography variant="body2" color="text.secondary">Rider{user?.rating?.average ? ` · ${user.rating.average}★` : ''}</Typography>
      </Box>
      {user?.phoneNumber && (
        <Tooltip title="Call rider">
          <IconButton component="a" href={`tel:${user.phoneNumber}`} aria-label="Call rider" sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', '&:hover': { bgcolor: 'secondary.dark' } }}><CallRounded /></IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function useAction(id) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ action, body }) => post(`/driver/bookings/${id}/${action}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', id] });
      queryClient.invalidateQueries({ queryKey: ['driver'] });
    },
    onError: error => toast.error(error.message),
  });
}

function RideActions({ booking }) {
  const action = useAction(booking._id);
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [cash, setCash] = useState(false);
  const cashDue = booking.payment?.method === 'cash' && booking.payment?.status !== 'paid';

  switch (booking.status) {
    case 'accepted':
      return (
        <Stack spacing={1.5}>
          <Button variant="outlined" startIcon={<NavigationRounded />} href={directions(booking.pickup)} target="_blank" rel="noopener">Navigate to pickup</Button>
          <Button size="large" variant="contained" onClick={() => action.mutate({ action: 'arrive' })} disabled={action.isPending}>I have arrived</Button>
          <Button color="error" onClick={() => action.mutate({ action: 'release' }, { onSuccess: () => navigate('/driver') })}>Can’t make it — release ride</Button>
        </Stack>
      );
    case 'arrived':
      return (
        <Stack spacing={1.5} component="form" onSubmit={e => { e.preventDefault(); action.mutate({ action: 'start', body: { pin } }); }}>
          <TextField
            label="Rider’s 4-digit PIN"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', style: { fontSize: 28, letterSpacing: '0.5em', textAlign: 'center', fontFamily: 'Sora' } } }}
          />
          <Button type="submit" size="large" variant="contained" disabled={pin.length !== 4 || action.isPending}>Start trip</Button>
        </Stack>
      );
    case 'in_progress':
      return (
        <Stack spacing={1.5}>
          <Button variant="outlined" startIcon={<NavigationRounded />} href={directions(booking.drop)} target="_blank" rel="noopener">Navigate to destination</Button>
          {cashDue && <FormControlLabel control={<Checkbox checked={cash} onChange={e => setCash(e.target.checked)} />} label={`I collected ${money(booking.totalAmount)} in cash`} />}
          <Button size="large" variant="contained" color="success" disabled={(cashDue && !cash) || action.isPending} onClick={() => action.mutate({ action: 'complete', body: { cashCollected: cash } })}>
            Complete trip
          </Button>
        </Stack>
      );
    default:
      return <Button variant="contained" onClick={() => navigate('/driver')}>Back to dashboard</Button>;
  }
}

export default function DriverJob() {
  const { id } = useParams();
  const { connected } = useRealtime();
  const { data, error, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => get(`/bookings/${id}`),
    refetchInterval: query => (['accepted', 'arrived', 'in_progress', 'confirmed'].includes(query.state.data?.booking?.status) ? (connected ? 30000 : 6000) : false),
  });
  const action = useAction(id);
  const [cash, setCash] = useState(false);

  if (isLoading) return <Container maxWidth="sm" sx={{ py: 6 }}><CardSkeleton rows={4} /></Container>;
  if (error) return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="error">{error.message}</Alert></Container>;
  const { booking } = data;

  if (booking.type === 'rental' && booking.rentalType) return <ChauffeurJob booking={booking} />;
  if (booking.type === 'rental') {
    const started = new Date(booking.start) <= new Date();
    const cashDue = booking.payment?.method === 'cash' && booking.payment?.status !== 'paid';
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack spacing={2.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h3" component="h1">Chauffeur job</Typography>
            <StatusChip status={booking.status} />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><CarImage car={booking.car} width={120} /><Typography variant="h6">{booking.car?.name}</Typography></Stack>
          <Typography>{dateTime(booking.start)} → {dateTime(booking.end)} ({booking.totalHours} h)</Typography>
          <RiderCard user={booking.user} />
          <FareBreakdown lines={booking.fareBreakdown} total={booking.totalAmount} />
          {booking.status === 'confirmed' && (started ? (
            <>
              {cashDue && <FormControlLabel control={<Checkbox checked={cash} onChange={e => setCash(e.target.checked)} />} label={`I collected ${money(booking.totalAmount)} in cash`} />}
              <Button variant="contained" color="success" disabled={(cashDue && !cash) || action.isPending} onClick={() => action.mutate({ action: 'complete', body: { cashCollected: cash } })}>Mark rental completed</Button>
            </>
          ) : <Alert severity="info">You can complete this job after it starts.</Alert>)}
        </Stack>
      </Container>
    );
  }

  return (
    <MapLayout map={{ pickup: booking.pickup, drop: booking.drop, stops: booking.stops || [], route: booking.routeGeometry }}>
      <Stack spacing={2.5}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" component="h1">Current trip</Typography>
          <StatusChip status={booking.status} />
        </Stack>
        <RiderCard user={booking.user} />
        <RouteLine pickup={booking.pickup} drop={booking.drop} stops={booking.stops || []} />
        <RideExtras booking={booking} />
        {booking.status === 'in_progress' && booking.stops?.length > 0 && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {booking.stops.map((stop, index) => (
              <Button key={`${stop.lat},${stop.lng},${index}`} size="small" variant="outlined" startIcon={<NavigationRounded />} href={directions(stop)} target="_blank" rel="noopener">
                Stop {index + 1}
              </Button>
            ))}
          </Stack>
        )}
        <Stack direction="row" spacing={1}>
          <Chip size="small" label={km(booking.distanceKm)} />
          <Chip size="small" label={`~${minutes(booking.durationMin)}`} />
          <Chip size="small" variant="outlined" label={`${booking.payment?.method} · ${booking.payment?.status}`} sx={{ textTransform: 'capitalize' }} />
        </Stack>
        <Box>
          <Typography variant="caption" color="text.secondary">You earn</Typography>
          <Typography variant="h3" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(driverEarning(booking))}</Typography>
          {booking.promo?.discount > 0 && (
            <Typography variant="body2" color="text.secondary">
              Rider pays {money(booking.totalAmount)} ({booking.payment?.method}). RIDE-IT adds the {money(booking.promo.discount)} promo {booking.promo.code} to your earnings.
            </Typography>
          )}
        </Box>
        <Divider />
        <RideActions booking={booking} />
      </Stack>
    </MapLayout>
  );
}
