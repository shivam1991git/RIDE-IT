import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, Chip, Container, FormControlLabel, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CarImage from '../../components/CarImage';
import { CardSkeleton, FareBreakdown } from '../../components/ui';
import { get, post } from '../../lib/api';
import { dateTime, money, toLocalInput } from '../../lib/format';
import { useAuth } from '../../providers/AuthProvider';
import { useToast } from '../../providers/ToastProvider';

function defaultWindow() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 2);
  const end = new Date(start.getTime() + 4 * 3600e3);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function RentalCar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { account } = useAuth();
  const [slot, setSlot] = useState(defaultWindow);
  const [driverRequired, setDriverRequired] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const car = useQuery({ queryKey: ['car', id], queryFn: () => get(`/cars/${id}`) });
  const payments = useQuery({ queryKey: ['payments', 'config'], queryFn: () => get('/payments/config'), staleTime: Infinity });

  const request = useMemo(() => {
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { carId: id, start: start.toISOString(), end: end.toISOString(), driverRequired };
  }, [id, slot, driverRequired]);
  const debounced = useDebouncedValue(request);

  const quote = useQuery({
    queryKey: ['rental-quote', debounced],
    queryFn: () => post('/rentals/quote', debounced),
    enabled: Boolean(debounced),
    retry: false,
  });

  const book = useMutation({
    mutationFn: () => post('/rentals', { ...request, paymentMethod }),
    onSuccess: ({ booking }) => { toast.success('Rental booked'); navigate(`/trips/${booking._id}`); },
    onError: error => toast.error(error.message),
  });

  if (car.isLoading) return <Container maxWidth="lg" sx={{ py: 6 }}><CardSkeleton rows={2} height={200} /></Container>;
  if (car.error) return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="error">{car.error.message}</Alert></Container>;
  const { car: detail, busy } = car.data;
  const now = toLocalInput(new Date());

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Button startIcon={<ArrowBackRounded />} component={RouterLink} to="/rentals" sx={{ mb: 2 }}>All cars</Button>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 4 }}>
        <Box>
          <Card sx={{ p: { xs: 3, md: 6 }, display: 'flex', justifyContent: 'center', mb: 3 }}><CarImage car={detail} width={380} /></Card>
          <Typography variant="h2" component="h1">{detail.name}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Chip label={`${detail.capacity} seats`} />
            <Chip label={detail.fuelType} />
            {detail.transmission && <Chip label={detail.transmission} />}
            <Chip color="primary" label={`${money(detail.rentPerHour)} / hour`} />
          </Stack>
          <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Already booked</Typography>
          {busy.length ? (
            <Stack spacing={1}>
              {busy.slice(0, 8).map(slot => (
                <Typography key={slot.start} variant="body2" color="text.secondary">{dateTime(slot.start)} → {dateTime(slot.end)}</Typography>
              ))}
            </Stack>
          ) : <Typography variant="body2" color="text.secondary">No upcoming bookings — this car is wide open.</Typography>}
        </Box>
        <Card sx={{ p: 3, alignSelf: 'start', position: { md: 'sticky' }, top: { md: 88 } }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Choose your time</Typography>
          <Stack spacing={2}>
            <TextField type="datetime-local" label="Start" value={slot.start} onChange={e => setSlot({ ...slot, start: e.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: now } }} />
            <TextField type="datetime-local" label="End" value={slot.end} onChange={e => setSlot({ ...slot, end: e.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: slot.start } }} />
            <FormControlLabel control={<Switch checked={driverRequired} onChange={e => setDriverRequired(e.target.checked)} />} label="Add a chauffeur" />
            {quote.isError && <Alert severity="error">{quote.error.message}</Alert>}
            {quote.data && !quote.data.available && <Alert severity="warning">This car is already booked for part of that time.</Alert>}
            {quote.data && <FareBreakdown lines={quote.data.breakdown} total={quote.data.total} />}
            <ToggleButtonGroup exclusive fullWidth size="small" value={paymentMethod} onChange={(e, value) => value && setPaymentMethod(value)}>
              <ToggleButton value="cash">Pay at pickup</ToggleButton>
              <ToggleButton value="card" disabled={!payments.data?.cardPayments}>Card</ToggleButton>
            </ToggleButtonGroup>
            {account?.role === 'customer' ? (
              <Button size="large" variant="contained" disabled={!quote.data?.available || book.isPending} onClick={() => book.mutate()}>
                {book.isPending ? 'Booking…' : quote.data ? `Book for ${money(quote.data.total)}` : 'Book'}
              </Button>
            ) : (
              <Button size="large" variant="contained" component={RouterLink} to="/login" state={{ from: location.pathname }}>
                {account ? 'Rentals are for rider accounts' : 'Sign in to book'}
              </Button>
            )}
          </Stack>
        </Card>
      </Box>
    </Container>
  );
}
