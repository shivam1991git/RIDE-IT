import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Box, Button, Card, CardActionArea, Container, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { CardSkeleton, EmptyState, PageHeader, RouteLine, StatusChip } from '../../components/ui';
import VehicleArt from '../../components/VehicleArt';
import CarImage from '../../components/CarImage';
import { get } from '../../lib/api';
import { dateTime, friendlyDateTime, money } from '../../lib/format';

function TripCard({ booking }) {
  return (
    <Card>
      <CardActionArea component={RouterLink} to={`/trips/${booking._id}`} sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box sx={{ color: 'text.primary', display: { xs: 'none', sm: 'block' } }}>
            {booking.type === 'ride' ? <VehicleArt kind={booking.category} width={88} /> : <CarImage car={booking.car} width={88} />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {booking.status === 'scheduled' ? `Pickup ${friendlyDateTime(booking.scheduledFor)}` : dateTime(booking.type === 'rental' ? booking.start : booking.createdAt)}
              </Typography>
              <StatusChip status={booking.status} />
            </Stack>
            {booking.type === 'ride'
              ? <RouteLine pickup={booking.pickup} drop={booking.drop} stops={booking.stops || []} dense />
              : <Typography variant="subtitle1" noWrap>{booking.car?.name} · {booking.totalHours} h rental</Typography>}
          </Box>
          <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(booking.totalAmount)}</Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export default function Trips() {
  const [scope, setScope] = useState('active');
  const [type, setType] = useState('all');
  const query = useInfiniteQuery({
    queryKey: ['bookings', 'mine', scope, type],
    queryFn: ({ pageParam }) => get(`/bookings?scope=${scope}&page=${pageParam}&limit=10${type !== 'all' ? `&type=${type}` : ''}`),
    initialPageParam: 1,
    getNextPageParam: last => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap(page => page.items) || [];

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader eyebrow="History" title="My trips" action={<Button variant="contained" component={RouterLink} to="/ride">Book a ride</Button>} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', mb: 3 }}>
        <Tabs value={scope} onChange={(e, value) => setScope(value)}>
          <Tab value="active" label="Upcoming & active" />
          <Tab value="past" label="Past" />
        </Tabs>
        <ToggleButtonGroup size="small" exclusive value={type} onChange={(e, value) => value && setType(value)}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="ride">Rides</ToggleButton>
          <ToggleButton value="rental">Rentals</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {query.isLoading && <CardSkeleton rows={4} height={96} />}
      {!query.isLoading && !items.length && (
        <EmptyState
          icon={ReceiptLongRounded}
          title={scope === 'active' ? 'Nothing coming up' : 'No past trips yet'}
          body={scope === 'active' ? 'Book a ride or a rental and it will show up here.' : 'Your completed and cancelled trips will appear here.'}
          action={<Button variant="contained" component={RouterLink} to="/ride">Book a ride</Button>}
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
