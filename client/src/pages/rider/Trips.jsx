import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Box, Button, Card, CardActionArea, Container, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { CardSkeleton, EmptyState, PageHeader, RouteLine, StatusChip } from '../../components/ui';
import VehicleArt from '../../components/VehicleArt';
import CarImage from '../../components/CarImage';
import { get } from '../../lib/api';
import { useMeta } from '../../lib/meta';
import { dateTime, friendlyDateTime, money, RENTAL_TYPES, rentalRoute } from '../../lib/format';

function TripCard({ booking }) {
  const rental = booking.type === 'rental';
  const amount = booking.status === 'completed' ? (booking.finalAmount ?? booking.totalAmount) : booking.totalAmount;
  return (
    <Card>
      <CardActionArea component={RouterLink} to={`/trips/${booking._id}`} sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box sx={{ color: 'text.primary', display: { xs: 'none', sm: 'block' } }}>
            {rental ? <CarImage car={booking.car} width={88} /> : <VehicleArt kind={booking.category} width={88} />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {booking.status === 'scheduled' ? `Pickup ${friendlyDateTime(booking.scheduledFor)}` : rental ? friendlyDateTime(booking.start) : dateTime(booking.createdAt)}
              </Typography>
              <StatusChip status={booking.status} />
            </Stack>
            {rental ? (
              <>
                <Typography variant="subtitle1" noWrap>{booking.reference ? `${booking.reference} · ` : ''}{RENTAL_TYPES[booking.rentalType] || `${booking.car?.name} rental`}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{rentalRoute(booking) || `${booking.totalHours} h`}{booking.car?.name ? ` · ${booking.car.name}` : ''}</Typography>
              </>
            ) : <RouteLine pickup={booking.pickup} drop={booking.drop} stops={booking.stops || []} dense />}
          </Box>
          <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(amount)}</Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export default function Trips() {
  const { ridesEnabled } = useMeta();
  const [scope, setScope] = useState('active');
  const [type, setType] = useState('all');
  const effectiveType = ridesEnabled ? type : 'all';
  const query = useInfiniteQuery({
    queryKey: ['bookings', 'mine', scope, effectiveType],
    queryFn: ({ pageParam }) => get(`/bookings?scope=${scope}&page=${pageParam}&limit=10${effectiveType !== 'all' ? `&type=${effectiveType}` : ''}`),
    initialPageParam: 1,
    getNextPageParam: last => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap(page => page.items) || [];
  const bookButton = <Button variant="contained" component={RouterLink} to="/rentals">Book a car</Button>;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader eyebrow="History" title="My bookings" action={bookButton} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', mb: 3 }}>
        <Tabs value={scope} onChange={(e, value) => setScope(value)}>
          <Tab value="active" label="Upcoming & active" />
          <Tab value="past" label="Past" />
        </Tabs>
        {ridesEnabled && (
          <ToggleButtonGroup size="small" exclusive value={type} onChange={(e, value) => value && setType(value)}>
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="ride">Rides</ToggleButton>
            <ToggleButton value="rental">Chauffeur</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>
      {query.isLoading && <CardSkeleton rows={4} height={96} />}
      {!query.isLoading && !items.length && (
        <EmptyState
          icon={ReceiptLongRounded}
          title={scope === 'active' ? 'Nothing coming up' : 'No past bookings yet'}
          body={scope === 'active' ? 'Book a car with a chauffeur and it will show up here.' : 'Your completed, cancelled and declined bookings will appear here.'}
          action={bookButton}
        />
      )}
      <Stack spacing={1.5}>{items.map(booking => <TripCard key={booking._id} booking={booking} />)}</Stack>
      {query.hasNextPage && (
        <Box sx={{ textAlign: 'center', mt: 3 }}>
          <Button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>
        </Box>
      )}
    </Container>
  );
}
