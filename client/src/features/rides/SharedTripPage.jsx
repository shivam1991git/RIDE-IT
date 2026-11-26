// Public, read-only view of a trip someone shared. No sign-in needed; the
// API only returns what is safe to show (no phone numbers, PIN or payment).
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Avatar, Box, Button, Chip, Container, Stack, Typography } from '@mui/material';
import StarRounded from '@mui/icons-material/StarRounded';
import MapLayout from '../../shared/components/map/MapLayout';
import { CardSkeleton, RouteLine, StatusChip } from '../../shared/components/ui';
import { get } from '../../shared/api/apiClient';
import { friendlyDateTime, km, minutes, relativeTime } from '../../shared/utils/format';

const HEADLINE = {
  scheduled: name => `${name}'s ride is scheduled`,
  requested: name => `${name} is waiting for a driver`,
  accepted: name => `A driver is on the way to ${name}`,
  arrived: name => `The driver has reached ${name}`,
  in_progress: name => `${name} is on the way`,
};

export default function SharedTrip() {
  const { token } = useParams();
  const { data, error, isLoading } = useQuery({
    queryKey: ['shared-trip', token],
    queryFn: () => get(`/share/${token}`),
    refetchInterval: query => (query.state.data?.trip?.ended ? false : 15000),
    retry: false,
  });

  if (isLoading) return <Container maxWidth="sm" sx={{ py: 6 }}><CardSkeleton rows={4} /></Container>;
  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity={error.status === 410 ? 'info' : 'warning'}>{error.message}</Alert>
        <Button component={RouterLink} to="/" sx={{ mt: 2 }}>Go to RIDE-IT</Button>
      </Container>
    );
  }

  const { trip } = data;
  const name = trip.riderFirstName || 'Your contact';
  if (trip.ended) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Stack spacing={2}>
          <Typography variant="h4" component="h1">{name}'s trip has ended</Typography>
          <StatusChip status={trip.status} />
          <Typography color="text.secondary">Updated {relativeTime(trip.updatedAt)}. This link stops working an hour after the trip ends.</Typography>
        </Stack>
      </Container>
    );
  }

  const driver = trip.driver;
  return (
    <MapLayout map={{ pickup: trip.pickup, drop: trip.drop, stops: trip.stops, route: trip.routeGeometry, driverLocation: driver?.location }}>
      <Stack spacing={2.5}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
          <Typography variant="h5" component="h1">{(HEADLINE[trip.status] || (n => `${n}'s trip`))(name)}</Typography>
          <StatusChip status={trip.status} />
        </Stack>
        {trip.status === 'scheduled' && trip.scheduledFor && <Alert severity="info">Pickup {friendlyDateTime(trip.scheduledFor)}</Alert>}
        {driver && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
            <Avatar sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', fontWeight: 700 }}>{driver.firstName?.[0]}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="subtitle1">{driver.firstName}</Typography>
                {driver.rating?.average && <Chip size="small" icon={<StarRounded />} label={driver.rating.average} />}
              </Stack>
              <Typography variant="body2" color="text.secondary" noWrap>{[driver.vehicle?.color, driver.vehicle?.make, driver.vehicle?.model].filter(Boolean).join(' ')}</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: 1 }}>{driver.vehicle?.plateNumber}</Typography>
            </Box>
          </Stack>
        )}
        {driver && !driver.location && trip.status !== 'scheduled' && (
          <Typography variant="caption" color="text.secondary">The driver's live location is not available right now.</Typography>
        )}
        <RouteLine pickup={trip.pickup} drop={trip.drop} stops={trip.stops} />
        <Stack direction="row" spacing={1}>
          <Chip size="small" label={km(trip.distanceKm)} />
          <Chip size="small" label={`~${minutes(trip.durationMin)}`} />
        </Stack>
        <Typography variant="caption" color="text.secondary">Shared by {name} from RIDE-IT · refreshes automatically · updated {relativeTime(trip.updatedAt)}</Typography>
      </Stack>
    </MapLayout>
  );
}
