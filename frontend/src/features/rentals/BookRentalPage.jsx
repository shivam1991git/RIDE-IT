// Three-step booking for chauffeur-driven cars: trip details → choose a car →
// review and request. Prices always come from the server.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardActionArea, Chip, Container, Divider, MenuItem, Stack, Step, StepLabel, Stepper, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import WbSunnyRounded from '@mui/icons-material/WbSunnyRounded';
import FlightTakeoffRounded from '@mui/icons-material/FlightTakeoffRounded';
import EastRounded from '@mui/icons-material/EastRounded';
import SyncAltRounded from '@mui/icons-material/SyncAltRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import AcUnitRounded from '@mui/icons-material/AcUnitRounded';
import LuggageRounded from '@mui/icons-material/LuggageRounded';
import EventSeatRounded from '@mui/icons-material/EventSeatRounded';
import PlaceSearch from '../../shared/components/map/PlaceSearch';
import CarImage from '../../shared/components/vehicles/CarImage';
import { CardSkeleton, FareBreakdown, PageHeader } from '../../shared/components/ui';
import { post } from '../../shared/api/apiClient';
import { useRentalOptions } from '../../shared/api/useAppConfig';
import { dateTime, km, minutes, money, toLocalInput, VEHICLE_CLASSES } from '../../shared/utils/format';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';

const TYPES = [
  { key: 'hourly', label: 'Hourly', hint: 'Local, 4–6 hours', icon: ScheduleRounded },
  { key: 'full_day', label: 'Full day', hint: 'Local, 8–12 hours', icon: WbSunnyRounded },
  { key: 'airport', label: 'Airport', hint: 'Pickup or drop', icon: FlightTakeoffRounded },
  { key: 'outstation_oneway', label: 'One-way', hint: 'To another city', icon: EastRounded },
  { key: 'outstation_round', label: 'Round trip', hint: 'Outstation and back', icon: SyncAltRounded },
];
const STEPS = ['Trip details', 'Choose a car', 'Review & request'];
const DRAFT_KEY = 'rideit.rental-draft';

function defaultStart(leadHours = 2) {
  const date = new Date(Date.now() + (leadHours + 1) * 3600e3);
  date.setMinutes(0, 0, 0);
  return toLocalInput(date);
}

function emptyTrip(type) {
  const start = defaultStart();
  return {
    rentalType: type,
    packageKey: type === 'full_day' ? '8h80' : '4h40',
    pickup: null,
    drop: null,
    destinationKey: '',
    airportDirection: 'to_airport',
    start,
    returnAt: toLocalInput(new Date(new Date(start).getTime() + 2 * 24 * 3600e3)),
    passengers: 2,
  };
}

// Read without removing: React may call state initialisers twice in development.
// The draft is cleared once it has been used (see BookRental).
function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

// Builds the API body for the chosen trip type, leaving out fields it does not use.
function requestBody(trip) {
  const body = { rentalType: trip.rentalType, start: new Date(trip.start).toISOString(), passengers: Number(trip.passengers) };
  if (['hourly', 'full_day'].includes(trip.rentalType)) Object.assign(body, { packageKey: trip.packageKey, pickup: trip.pickup || undefined, drop: trip.drop || undefined });
  if (trip.rentalType === 'airport') {
    body.airportDirection = trip.airportDirection;
    if (trip.airportDirection === 'to_airport') body.pickup = trip.pickup || undefined;
    else body.drop = trip.drop || undefined;
  }
  if (trip.rentalType.startsWith('outstation')) Object.assign(body, { destinationKey: trip.destinationKey || undefined, pickup: trip.pickup || undefined });
  if (trip.rentalType === 'outstation_round') body.returnAt = new Date(trip.returnAt).toISOString();
  return body;
}

// What is still missing before we can search, in plain words.
function missing(trip) {
  if (['hourly', 'full_day', 'outstation_oneway', 'outstation_round'].includes(trip.rentalType) && !trip.pickup) return 'Choose your pickup address';
  if (trip.rentalType === 'airport' && trip.airportDirection === 'to_airport' && !trip.pickup) return 'Choose your pickup address';
  if (trip.rentalType === 'airport' && trip.airportDirection === 'from_airport' && !trip.drop) return 'Choose your drop address';
  if (trip.rentalType.startsWith('outstation') && !trip.destinationKey) return 'Choose a destination';
  if (!trip.start || Number.isNaN(new Date(trip.start).getTime())) return 'Choose a pickup date and time';
  if (trip.rentalType === 'outstation_round' && !(new Date(trip.returnAt) > new Date(trip.start))) return 'Return must be after pickup';
  return null;
}

function TypePicker({ value, onChange }) {
  return (
    <Box role="radiogroup" aria-label="Trip type" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' }, gap: 1.25 }}>
      {TYPES.map(({ key, label, hint, icon: Icon }) => {
        const active = value === key;
        return (
          <Card key={key} sx={{ borderWidth: 2, borderColor: active ? 'primary.main' : 'divider', bgcolor: theme => (active ? alpha(theme.palette.primary.main, 0.08) : 'background.paper') }}>
            <CardActionArea role="radio" aria-checked={active} onClick={() => onChange(key)} sx={{ p: 1.5, height: '100%' }}>
              <Icon color={active ? 'primary' : 'action'} />
              <Typography variant="subtitle2" sx={{ mt: 0.5 }}>{label}</Typography>
              <Typography variant="caption" color="text.secondary">{hint}</Typography>
            </CardActionArea>
          </Card>
        );
      })}
    </Box>
  );
}

function TripForm({ trip, setTrip, options, onSearch, searching, error }) {
  const set = patch => setTrip({ ...trip, ...patch });
  const packages = (options?.packages || []).filter(pkg => pkg.kind === trip.rentalType);
  const lead = options?.policy?.minLeadHours ?? 2;
  const minStart = toLocalInput(new Date(Date.now() + lead * 3600e3));
  const maxStart = toLocalInput(new Date(Date.now() + (options?.policy?.maxAdvanceDays ?? 30) * 24 * 3600e3));
  const blocker = missing(trip);
  const isLocal = ['hourly', 'full_day'].includes(trip.rentalType);
  const isOutstation = trip.rentalType.startsWith('outstation');

  return (
    <Stack spacing={2.5} component="form" onSubmit={e => { e.preventDefault(); if (!blocker) onSearch(); }}>
      <TypePicker value={trip.rentalType} onChange={rentalType => set({ rentalType, packageKey: rentalType === 'full_day' ? '8h80' : '4h40' })} />

      {isLocal && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Package</Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {packages.map(pkg => (
              <Chip key={pkg.key} label={pkg.label} onClick={() => set({ packageKey: pkg.key })} color={trip.packageKey === pkg.key ? 'primary' : 'default'} variant={trip.packageKey === pkg.key ? 'filled' : 'outlined'} />
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary">Your chauffeur stays with you for the whole package. Extra km and hours are charged at the rates shown with each car.</Typography>
        </Box>
      )}

      {trip.rentalType === 'airport' && (
        <ToggleButtonGroup exclusive fullWidth size="small" value={trip.airportDirection} onChange={(e, value) => value && set({ airportDirection: value })} aria-label="Airport direction">
          <ToggleButton value="to_airport">Drop at airport</ToggleButton>
          <ToggleButton value="from_airport">Pickup from airport</ToggleButton>
        </ToggleButtonGroup>
      )}

      {(trip.rentalType !== 'airport' || trip.airportDirection === 'to_airport') && (
        <PlaceSearch label="Pickup address" kind="pickup" value={trip.pickup} onChange={pickup => set({ pickup })} allowLocate />
      )}
      {trip.rentalType === 'airport' && trip.airportDirection === 'from_airport' && (
        <>
          <Alert severity="info" icon={<FlightTakeoffRounded />}>Pickup at {options?.airport?.name || 'the airport'}. 30 minutes of waiting for delayed flights is included.</Alert>
          <PlaceSearch label="Drop address" value={trip.drop} onChange={drop => set({ drop })} />
        </>
      )}
      {isLocal && <PlaceSearch label="Final drop (optional)" value={trip.drop} onChange={drop => set({ drop })} />}

      {isOutstation && (
        <TextField select label="Destination" value={trip.destinationKey} onChange={e => set({ destinationKey: e.target.value })} helperText="Popular trips from Varanasi. For other cities, contact support.">
          {(options?.destinations || []).map(item => <MenuItem key={item.key} value={item.key}>{item.name}</MenuItem>)}
        </TextField>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: trip.rentalType === 'outstation_round' ? '1fr 1fr 120px' : '1fr 120px' }, gap: 2 }}>
        <TextField type="datetime-local" label="Pickup date & time" value={trip.start} onChange={e => set({ start: e.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minStart, max: maxStart } }} helperText={`At least ${lead} h ahead`} />
        {trip.rentalType === 'outstation_round' && (
          <TextField type="datetime-local" label="Return date & time" value={trip.returnAt} onChange={e => set({ returnAt: e.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: trip.start } }} helperText="When you are back in Varanasi" />
        )}
        <TextField select label="Passengers" value={trip.passengers} onChange={e => set({ passengers: e.target.value })}>
          {[1, 2, 3, 4, 5, 6, 7].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" size="large" variant="contained" disabled={Boolean(blocker) || searching}>
        {searching ? 'Finding cars…' : blocker || 'See cars & prices'}
      </Button>
    </Stack>
  );
}

function TripSummary({ trip }) {
  const route = trip.destination
    ? `${trip.pickup?.name} → ${trip.destination.name}${trip.rentalType === 'outstation_round' ? ' and back' : ''}`
    : trip.drop ? `${trip.pickup?.name} → ${trip.drop.name}` : trip.pickup?.name;
  return (
    <Card sx={{ p: 2, bgcolor: 'action.hover', border: 0 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 2 }} sx={{ justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1">{trip.label}{trip.package ? ` · ${trip.package.label}` : ''}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{route}</Typography>
        </Box>
        <Box sx={{ textAlign: { sm: 'right' } }}>
          <Typography variant="body2">{dateTime(trip.start)}{trip.rentalType === 'outstation_round' ? ` → ${dateTime(trip.end)}` : ''}</Typography>
          <Typography variant="caption" color="text.secondary">
            {[trip.distanceKm ? `${km(trip.distanceKm)} one way` : null, trip.durationMin ? `~${minutes(trip.durationMin)} drive` : null, `${trip.passengers} passenger${trip.passengers > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      </Stack>
    </Card>
  );
}

function CarOption({ row, onSelect }) {
  const { car, fare, available, reason } = row;
  return (
    <Card sx={{ opacity: available ? 1 : 0.55, transition: 'border-color .2s, transform .2s', '&:hover': available ? { borderColor: 'primary.main', transform: 'translateY(-2px)' } : {} }}>
      <CardActionArea disabled={!available} onClick={() => onSelect(row)} sx={{ p: 2 }} aria-label={`${car.name}, ${money(fare.total)}${available ? '' : `, ${reason}`}`}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 1, borderRadius: 3, bgcolor: 'action.hover', minWidth: { sm: 150 } }}><CarImage car={car} width={130} /></Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h6">{car.name}</Typography>
              <Chip size="small" label={VEHICLE_CLASSES[car.category] || car.category} />
            </Stack>
            <Typography variant="caption" color="text.secondary">or similar · {car.fuelType}</Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 1, color: 'text.secondary', flexWrap: 'wrap' }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><EventSeatRounded fontSize="small" /><Typography variant="body2">{car.capacity} seats</Typography></Stack>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><LuggageRounded fontSize="small" /><Typography variant="body2">{car.luggage ?? 2} bags</Typography></Stack>
              {car.ac !== false && <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><AcUnitRounded fontSize="small" /><Typography variant="body2">AC</Typography></Stack>}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{fare.extras}</Typography>
          </Box>
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(fare.total)}</Typography>
            <Typography variant="caption" color={available ? 'text.secondary' : 'error.main'}>{available ? 'incl. GST' : reason}</Typography>
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

function CarList({ result, onSelect, onBack }) {
  const [vehicleClass, setVehicleClass] = useState('all');
  const rows = result.cars.filter(row => vehicleClass === 'all' || row.car.category === vehicleClass);
  const classes = [...new Set(result.cars.map(row => row.car.category))];
  const anyAvailable = result.cars.some(row => row.available);
  return (
    <Stack spacing={2}>
      <Button startIcon={<ArrowBackRounded />} onClick={onBack} sx={{ alignSelf: 'flex-start' }}>Change trip</Button>
      <TripSummary trip={result.trip} />
      {classes.length > 1 && (
        <ToggleButtonGroup exclusive size="small" value={vehicleClass} onChange={(e, value) => value && setVehicleClass(value)} aria-label="Car type" sx={{ flexWrap: 'wrap' }}>
          <ToggleButton value="all">All</ToggleButton>
          {classes.map(key => <ToggleButton key={key} value={key}>{VEHICLE_CLASSES[key] || key}</ToggleButton>)}
        </ToggleButtonGroup>
      )}
      {!anyAvailable && <Alert severity="warning">No car is free for this trip. Try another time, or contact support and we will try to arrange one.</Alert>}
      {rows.map(row => <CarOption key={row.car._id} row={row} onSelect={onSelect} />)}
    </Stack>
  );
}

function Review({ result, choice, onBack, onBooked, initialInstructions = '' }) {
  const { account } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: options } = useRentalOptions();
  const [instructions, setInstructions] = useState(initialInstructions);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const policy = options?.policy?.cancellation;

  const book = useMutation({
    mutationFn: () => post('/rentals', { ...result.request, carId: choice.car._id, instructions: instructions || undefined, paymentMethod }),
    onSuccess: ({ booking }) => onBooked(booking),
    onError: error => toast.error(error.message),
  });
  const signIn = () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ trip: result.form, carId: choice.car._id, instructions }));
    } catch {
      // Private mode: the customer just re-enters the trip.
    }
    navigate('/login', { state: { from: location.pathname + location.search } });
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 3, alignItems: 'start' }}>
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackRounded />} onClick={onBack} sx={{ alignSelf: 'flex-start' }}>Choose another car</Button>
        <TripSummary trip={result.trip} />
        <Card sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <CarImage car={choice.car} width={110} />
            <Box>
              <Typography variant="h6">{choice.car.name}</Typography>
              <Typography variant="body2" color="text.secondary">{VEHICLE_CLASSES[choice.car.category]} · {choice.car.capacity} seats · with a verified chauffeur</Typography>
            </Box>
          </Stack>
        </Card>
        <Card sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>What is included</Typography>
          <Stack spacing={0.5}>
            {choice.fare.inclusions.map(item => <Stack key={item} direction="row" spacing={1}><CheckCircleRounded color="success" fontSize="small" /><Typography variant="body2">{item}</Typography></Stack>)}
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2"><b>Extra usage:</b> {choice.fare.extras}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}><b>Not included:</b> {choice.fare.exclusions}</Typography>
          {policy && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              <b>Cancellation:</b> free until we confirm, and up to {policy.freeHours} h before pickup. {policy.partialHours}–{policy.freeHours} h before: {policy.partialRefundPercent}% refund. Under {policy.partialHours} h: no refund.
            </Typography>
          )}
        </Card>
        <TextField label="Instructions for your chauffeur (optional)" multiline minRows={2} value={instructions} onChange={e => setInstructions(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} helperText={`${instructions.length}/500 · e.g. flight number, landmarks, luggage, places to visit`} />
      </Stack>

      <Card sx={{ p: 3, position: { md: 'sticky' }, top: { md: 88 } }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Price</Typography>
        <FareBreakdown lines={choice.fare.breakdown} total={choice.fare.total} />
        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>How would you like to pay?</Typography>
        <ToggleButtonGroup exclusive fullWidth size="small" value={paymentMethod} onChange={(e, value) => value && setPaymentMethod(value)} aria-label="Payment method">
          <ToggleButton value="upi">UPI</ToggleButton>
          <ToggleButton value="cash">Cash</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Nothing is charged now. After we confirm, pay an advance or the full amount by UPI, or pay your chauffeur at the end of the trip.
        </Typography>
        {account?.role === 'customer' ? (
          <>
            <Typography variant="body2" sx={{ mt: 2 }}>Booking for <b>{account.fullName}</b> · {account.phoneNumber}</Typography>
            <Button fullWidth size="large" variant="contained" sx={{ mt: 2 }} onClick={() => book.mutate()} disabled={book.isPending}>
              {book.isPending ? 'Sending request…' : `Request booking · ${money(choice.fare.total)}`}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>Our team confirms your car and chauffeur, usually within an hour.</Typography>
          </>
        ) : account ? (
          <Alert severity="info" sx={{ mt: 2 }}>Bookings are made from customer accounts.</Alert>
        ) : (
          <Button fullWidth size="large" variant="contained" sx={{ mt: 2 }} onClick={signIn}>Sign in to request</Button>
        )}
      </Card>
    </Box>
  );
}

export default function BookRentalPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { data: options, isLoading } = useRentalOptions();
  const initialType = TYPES.some(t => t.key === params.get('type')) ? params.get('type') : 'hourly';
  const [draft] = useState(readDraft);
  // A draft saved before sign-in wins; otherwise take what the home page passed along.
  const [trip, setTrip] = useState(() => draft?.trip || { ...emptyTrip(initialType), ...(location.state?.trip?.pickup ? { pickup: location.state.trip.pickup } : {}), ...(location.state?.trip?.start ? { start: location.state.trip.start } : {}) });
  const [result, setResult] = useState(null);
  const [choice, setChoice] = useState(null);
  const [error, setError] = useState('');

  // The URL carries the trip type, so links like /rentals?type=airport work even
  // while this page is already open (e.g. from the footer).
  const urlType = params.get('type');
  useEffect(() => {
    if (TYPES.some(t => t.key === urlType) && urlType !== trip.rentalType) {
      setTrip(current => ({ ...current, rentalType: urlType, packageKey: urlType === 'full_day' ? '8h80' : '4h40' }));
      setResult(null);
      setChoice(null);
    }
  }, [urlType]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTripAndUrl = next => {
    setTrip(next);
    if (next.rentalType !== urlType) setParams({ type: next.rentalType }, { replace: true });
  };

  const search = useMutation({
    mutationFn: body => post('/rentals/search', body),
    onSuccess: (data, body) => {
      setError('');
      setResult({ ...data, request: body, form: trip });
      setChoice(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: err => setError(err.message),
  });

  // Coming back from sign-in: re-run the search and reopen the chosen car.
  const restored = useRef(false);
  useEffect(() => {
    if (!draft?.trip || restored.current) return;
    restored.current = true;
    clearDraft();
    post('/rentals/search', requestBody(draft.trip)).then(data => {
      setResult({ ...data, request: requestBody(draft.trip), form: draft.trip });
      const row = data.cars.find(item => item.car._id === draft.carId && item.available);
      if (row) setChoice(row);
      else toast.info('That car is no longer free. Please choose another.');
    }).catch(err => setError(err.message));
  }, [draft, toast]);

  const step = choice ? 2 : result ? 1 : 0;
  const header = useMemo(() => (
    <PageHeader eyebrow="Chauffeur-driven" title="Book a car with a driver" subtitle="Hourly and full-day packages in Varanasi, outstation trips and airport transfers. Every price is shown in full before you book." />
  ), []);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      {header}
      <Stepper activeStep={step} alternativeLabel sx={{ mb: 3, '& .MuiStepLabel-label': { fontSize: 12 } }}>
        {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>
      {isLoading && <CardSkeleton rows={3} />}
      {!isLoading && step === 0 && (
        <Box sx={{ maxWidth: 760, mx: 'auto' }}>
          <TripForm trip={trip} setTrip={setTripAndUrl} options={options} onSearch={() => search.mutate(requestBody(trip))} searching={search.isPending} error={error} />
        </Box>
      )}
      {step === 1 && (
        <Box sx={{ maxWidth: 860, mx: 'auto' }}>
          <CarList result={result} onSelect={setChoice} onBack={() => setResult(null)} />
        </Box>
      )}
      {step === 2 && (
        <Review
          result={result}
          choice={choice}
          onBack={() => setChoice(null)}
          onBooked={booking => navigate(`/trips/${booking._id}`, { state: { justBooked: true } })}
          initialInstructions={draft?.instructions || ''}
        />
      )}
    </Container>
  );
}
