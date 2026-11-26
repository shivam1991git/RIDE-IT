import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Alert, Box, Button, ButtonBase, Chip, Collapse, Dialog, DialogContent, DialogTitle, IconButton, List, ListItemButton,
  ListItemText, MenuItem, Skeleton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SwapVertRounded from '@mui/icons-material/SwapVertRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import CreditCardRounded from '@mui/icons-material/CreditCardRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import LocalOfferRounded from '@mui/icons-material/LocalOfferRounded';
import TempleHinduRounded from '@mui/icons-material/TempleHinduRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import MapLayout from '../../shared/components/map/MapLayout';
import PlaceSearch from '../../shared/components/map/PlaceSearch';
import VehicleArt from '../../shared/components/vehicles/VehicleArt';
import { FareBreakdown } from '../../shared/components/ui';
import { get, post } from '../../shared/api/apiClient';
import { friendlyDateTime, km, minutes, money, PREFERENCES, toLocalInput } from '../../shared/utils/format';
import { useToast } from '../../app/providers/ToastProvider';

const MAX_STOPS = 3;
const WAIT_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const SCHEDULE_MIN_AHEAD_MIN = 30;
const SCHEDULE_MAX_AHEAD_DAYS = 7;

const placeOnly = place => (place ? { name: place.name, address: place.address, lat: place.lat, lng: place.lng } : null);

function FareOption({ option, selected, onSelect }) {
  const discounted = option.discount > 0;
  return (
    <ButtonBase
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      sx={{
        width: '100%', textAlign: 'left', borderRadius: 4, p: 1.5, gap: 1.5, justifyContent: 'flex-start',
        border: 2, borderColor: selected ? 'primary.main' : 'transparent',
        bgcolor: selected ? theme => alpha(theme.palette.primary.main, 0.08) : 'action.hover',
        transition: 'border-color .2s, background-color .2s',
      }}
    >
      <Box sx={{ color: 'text.primary', flexShrink: 0 }}><VehicleArt kind={option.category} width={76} /></Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle1">{option.name}</Typography>
          <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', color: 'text.secondary' }}>
            <PersonRounded sx={{ fontSize: 15 }} /><Typography variant="caption">{option.capacity}</Typography>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{option.description}</Typography>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        {discounted && <Typography variant="caption" color="text.secondary" sx={{ textDecoration: 'line-through', display: 'block' }}>{money(option.originalTotal)}</Typography>}
        <Typography variant="h6" color={discounted ? 'success.main' : undefined} sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(option.total)}</Typography>
      </Box>
    </ButtonBase>
  );
}

function usePrefill(setPickup, setDrop, setStops) {
  const location = useLocation();
  const [params] = useSearchParams();
  const { data } = useQuery({ queryKey: ['geo', 'popular'], queryFn: () => get('/geo/popular'), staleTime: Infinity });
  useEffect(() => {
    if (location.state?.pickup) setPickup(placeOnly(location.state.pickup));
    if (location.state?.drop) setDrop(placeOnly(location.state.drop));
    if (location.state?.stops?.length) setStops(location.state.stops.map(stop => ({ place: placeOnly(stop), waitMin: stop.waitMin || 0 })));
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const find = name => data.places.find(place => place.name.toLowerCase() === (name || '').toLowerCase());
    const pickup = find(params.get('pickup'));
    const drop = find(params.get('drop'));
    if (pickup) setPickup(prev => prev || placeOnly(pickup));
    if (drop) setDrop(prev => prev || placeOnly(drop));
  }, [data, params]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Curated multi-stop outings. Applying one fills in the stops and destination.
function Circuits({ pickup, activeKey, onApply }) {
  const { data } = useQuery({ queryKey: ['circuits'], queryFn: () => get('/circuits'), staleTime: Infinity });
  if (!data?.circuits?.length) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <TempleHinduRounded fontSize="small" color="primary" />
        <Typography variant="subtitle2">Darshan Circuits</Typography>
        {!pickup && <Typography variant="caption" color="text.secondary">· set a pickup first</Typography>}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5, mx: -0.5, px: 0.5 }}>
        {data.circuits.map(circuit => (
          <Tooltip key={circuit.key} title={`${circuit.description} Driver waits ${minutes(circuit.totalWaitMin)} in total.`}>
            <span>
              <Chip
                label={circuit.name}
                color={activeKey === circuit.key ? 'primary' : 'default'}
                variant={activeKey === circuit.key ? 'filled' : 'outlined'}
                disabled={!pickup}
                onClick={() => onApply(circuit)}
                onDelete={activeKey === circuit.key ? () => onApply(null) : undefined}
              />
            </span>
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
}

function StopRow({ index, stop, onChange, onRemove }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <PlaceSearch label={`Stop ${index + 1}`} kind="stop" value={stop.place} onChange={place => onChange({ ...stop, place })} autoFocus={!stop.place} />
      </Box>
      <TextField
        select
        label="Wait"
        value={stop.waitMin}
        onChange={e => onChange({ ...stop, waitMin: Number(e.target.value) })}
        sx={{ width: 96, flexShrink: 0 }}
        slotProps={{ htmlInput: { 'aria-label': `Driver wait at stop ${index + 1}` } }}
      >
        {WAIT_OPTIONS.map(value => <MenuItem key={value} value={value}>{value ? `${value} min` : 'None'}</MenuItem>)}
      </TextField>
      <Tooltip title="Remove stop">
        <IconButton aria-label={`Remove stop ${index + 1}`} onClick={onRemove} sx={{ mt: 1 }}><CloseRounded fontSize="small" /></IconButton>
      </Tooltip>
    </Stack>
  );
}

function PromoDialog({ open, onClose, onApply }) {
  const [code, setCode] = useState('');
  const offers = useQuery({ queryKey: ['promos', 'offers'], queryFn: () => get('/promos/offers'), enabled: open });
  const submit = value => {
    const clean = value.trim().toUpperCase();
    if (clean) { onApply(clean); setCode(''); onClose(); }
  };
  const describe = offer => (offer.kind === 'percent'
    ? `${offer.value}% off${offer.maxDiscount ? `, up to ${money(offer.maxDiscount)}` : ''}`
    : `${money(offer.value)} off`);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Offers &amp; promo codes</DialogTitle>
      <DialogContent>
        <Stack component="form" direction="row" spacing={1} sx={{ mt: 1 }} onSubmit={e => { e.preventDefault(); submit(code); }}>
          <TextField
            label="Promo code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 20))}
            size="small"
            autoFocus
          />
          <Button type="submit" variant="contained" disabled={code.length < 3}>Apply</Button>
        </Stack>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Available offers</Typography>
        {offers.isLoading && <Skeleton variant="rounded" height={56} />}
        {offers.data && !offers.data.offers.length && <Typography variant="body2" color="text.secondary">No offers right now. Check back soon.</Typography>}
        <List disablePadding>
          {offers.data?.offers.map(offer => (
            <ListItemButton key={offer.code} onClick={() => submit(offer.code)} sx={{ borderRadius: 3, border: 1, borderColor: 'divider', mb: 1, borderStyle: 'dashed' }}>
              <ListItemText
                primary={<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Chip size="small" color="success" label={offer.code} /><Typography variant="subtitle2">{describe(offer)}</Typography></Stack>}
                secondary={[
                  offer.description,
                  offer.minFare ? `Min fare ${money(offer.minFare)}` : null,
                  offer.categories?.length ? `On ${offer.categories.join(', ')}` : null,
                  `Valid until ${friendlyDateTime(offer.validUntil)}`,
                ].filter(Boolean).join(' · ')}
              />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}

function scheduleBounds() {
  const min = new Date(Date.now() + (SCHEDULE_MIN_AHEAD_MIN + 1) * 60000);
  const max = new Date(Date.now() + SCHEDULE_MAX_AHEAD_DAYS * 86400000);
  return { min, max };
}

export default function BookRide() {
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [stops, setStops] = useState([]);
  const [circuit, setCircuit] = useState(null);
  const [category, setCategory] = useState('mini');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [when, setWhen] = useState('now');
  const [scheduleAt, setScheduleAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60000)));
  const [preferences, setPreferences] = useState({});
  const [note, setNote] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoOpen, setPromoOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  usePrefill(setPickup, setDrop, setStops);

  const filledStops = useMemo(() => stops.filter(stop => stop.place).map(stop => ({ ...stop.place, waitMin: stop.waitMin })), [stops]);
  const pendingStops = stops.length !== filledStops.length;

  const active = useQuery({ queryKey: ['bookings', 'active-ride'], queryFn: () => get('/rides/active') });
  const payments = useQuery({ queryKey: ['payments', 'config'], queryFn: () => get('/payments/config'), staleTime: Infinity });
  const ready = Boolean(pickup && drop) && !pendingStops;
  const routeBody = { pickup, drop, stops: filledStops, promoCode: promoCode || undefined };
  const quote = useQuery({
    queryKey: ['quote', pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, JSON.stringify(filledStops), promoCode],
    queryFn: () => post('/rides/quote', routeBody),
    enabled: ready,
    staleTime: 60000,
    retry: false,
  });

  const { min: scheduleMin, max: scheduleMax } = scheduleBounds();
  const scheduledDate = when === 'later' && scheduleAt ? new Date(scheduleAt) : null;
  let scheduleError = null;
  if (when === 'later') {
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) scheduleError = 'Choose a pickup date and time';
    else if (scheduledDate < new Date(Date.now() + SCHEDULE_MIN_AHEAD_MIN * 60000)) scheduleError = `Choose a time at least ${SCHEDULE_MIN_AHEAD_MIN} minutes from now`;
    else if (scheduledDate > scheduleMax) scheduleError = `You can schedule up to ${SCHEDULE_MAX_AHEAD_DAYS} days ahead`;
  }

  const book = useMutation({
    mutationFn: () => post('/rides', {
      ...routeBody,
      category,
      paymentMethod,
      circuit: circuit || undefined,
      scheduledFor: scheduledDate ? scheduledDate.toISOString() : undefined,
      preferences: Object.keys(preferences).length ? preferences : undefined,
      noteToDriver: note.trim() || undefined,
    }),
    onSuccess: ({ booking }) => {
      if (booking.status === 'scheduled') toast.success(`Ride scheduled for ${friendlyDateTime(booking.scheduledFor)}`);
      navigate(`/trips/${booking._id}`);
    },
    onError: error => {
      if (error.code === 'promo_invalid') setPromoCode('');
      toast.error(error.message);
    },
  });

  const applyCircuit = item => {
    if (!item) {
      setCircuit(null);
      setStops([]);
      return;
    }
    setCircuit(item.key);
    setStops(item.stops.map(stop => ({ place: placeOnly(stop), waitMin: stop.waitMin })));
    setDrop(item.drop === 'pickup' ? pickup : placeOnly(item.drop));
  };
  // Any manual edit to the route means it is no longer the curated circuit.
  const editRoute = fn => (...args) => { setCircuit(null); fn(...args); };

  const selected = quote.data?.options.find(option => option.category === category) || quote.data?.options[0];
  const activeRide = active.data?.booking;
  const blockedByActive = Boolean(activeRide) && when === 'now';
  const promo = quote.data?.promo;

  return (
    <MapLayout map={{ pickup, drop, stops: filledStops, route: quote.data?.geometry }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">Where to?</Typography>
        <ToggleButtonGroup exclusive size="small" value={when} onChange={(e, value) => value && setWhen(value)} aria-label="When">
          <ToggleButton value="now"><BoltRounded fontSize="small" sx={{ mr: 0.5 }} />Now</ToggleButton>
          <ToggleButton value="later"><EventRounded fontSize="small" sx={{ mr: 0.5 }} />Schedule</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {activeRide && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" component={RouterLink} to={`/trips/${activeRide._id}`}>Open</Button>}>
          You have a ride in progress.{when === 'now' ? ' You can still schedule one for later.' : ''}
        </Alert>
      )}
      <Collapse in={when === 'later'}>
        <TextField
          type="datetime-local"
          label="Pickup time"
          value={scheduleAt}
          onChange={e => setScheduleAt(e.target.value)}
          error={Boolean(scheduleError)}
          helperText={scheduleError || (scheduledDate ? `${friendlyDateTime(scheduledDate)} · fare is locked now; we find your driver 15 min before` : ' ')}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: toLocalInput(scheduleMin), max: toLocalInput(scheduleMax) } }}
          sx={{ mb: 1.5 }}
        />
      </Collapse>

      <Box sx={{ position: 'relative' }}>
        <Stack spacing={1.5}>
          <PlaceSearch label="Pickup" kind="pickup" value={pickup} onChange={editRoute(setPickup)} allowLocate />
          {stops.map((stop, index) => (
            <StopRow
              key={index}
              index={index}
              stop={stop}
              onChange={editRoute(next => setStops(list => list.map((item, i) => (i === index ? next : item))))}
              onRemove={editRoute(() => setStops(list => list.filter((_, i) => i !== index)))}
            />
          ))}
          <PlaceSearch label="Destination" value={drop} onChange={editRoute(setDrop)} autoFocus={Boolean(pickup) && !drop && !stops.length} />
        </Stack>
        {!stops.length && (
          <Tooltip title="Swap pickup and destination">
            <IconButton
              onClick={editRoute(() => { setPickup(drop); setDrop(pickup); })}
              aria-label="Swap pickup and destination"
              size="small"
              sx={{ position: 'absolute', right: 48, top: '50%', transform: 'translateY(-50%)', bgcolor: 'background.paper', border: 1, borderColor: 'divider', zIndex: 2 }}
            >
              <SwapVertRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button size="small" startIcon={<AddRounded />} disabled={stops.length >= MAX_STOPS} onClick={editRoute(() => setStops(list => [...list, { place: null, waitMin: 10 }]))}>
          {stops.length >= MAX_STOPS ? `Max ${MAX_STOPS} stops` : 'Add stop'}
        </Button>
        <Button size="small" startIcon={<TuneRounded />} onClick={() => setShowExtras(!showExtras)}>
          Preferences{Object.keys(preferences).length || note ? ' •' : ''}
        </Button>
      </Stack>
      <Collapse in={showExtras}>
        <Box sx={{ p: 1.5, mt: 1, borderRadius: 3, bgcolor: 'action.hover' }}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {PREFERENCES.map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                color={preferences[key] ? 'secondary' : 'default'}
                variant={preferences[key] ? 'filled' : 'outlined'}
                aria-pressed={Boolean(preferences[key])}
                onClick={() => setPreferences(prev => {
                  const next = { ...prev };
                  if (next[key]) delete next[key]; else next[key] = true;
                  return next;
                })}
              />
            ))}
          </Stack>
          <TextField
            size="small"
            label="Note for your driver"
            placeholder="e.g. Gate 2, near the blue kiosk"
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 200))}
            helperText={`${note.length}/200`}
            sx={{ mt: 1.5 }}
          />
        </Box>
      </Collapse>

      <Circuits pickup={pickup} activeKey={circuit} onApply={applyCircuit} />

      <AnimatePresence mode="wait">
        {!ready && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              {pendingStops
                ? 'Choose a place for each stop, or remove empty stops, to see fares.'
                : 'Choose a pickup and destination to compare fares. Tip: tap the target icon to use your current location.'}
            </Typography>
          </motion.div>
        )}
        {ready && (
          <motion.div key="quote" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Box sx={{ mt: 3 }}>
              {quote.isLoading && <Stack spacing={1.25}>{[0, 1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={68} sx={{ borderRadius: 4 }} />)}</Stack>}
              {quote.isError && <Alert severity="error">{quote.error.message}</Alert>}
              {quote.data && (
                <>
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                    <Chip size="small" label={km(quote.data.distanceKm)} />
                    <Chip size="small" label={`~${minutes(quote.data.durationMin)}`} />
                    {quote.data.waitMin > 0 && <Chip size="small" label={`+${minutes(quote.data.waitMin)} waiting`} />}
                    {quote.data.routeSource === 'estimate' && <Chip size="small" variant="outlined" label="Estimated route" />}
                  </Stack>
                  <Stack spacing={1} role="radiogroup" aria-label="Ride type">
                    {quote.data.options.map(option => (
                      <FareOption key={option.category} option={option} selected={selected?.category === option.category} onSelect={() => setCategory(option.category)} />
                    ))}
                  </Stack>

                  <Box sx={{ mt: 1.5 }}>
                    {promoCode ? (
                      <Stack spacing={0.5}>
                        <Chip
                          icon={<LocalOfferRounded />}
                          color={promo?.valid ? 'success' : 'default'}
                          label={promo?.valid ? `${promoCode} applied` : promoCode}
                          onDelete={() => setPromoCode('')}
                          sx={{ alignSelf: 'flex-start' }}
                        />
                        {promo && !promo.valid && <Typography variant="caption" color="error">{promo.message}</Typography>}
                        {promo?.valid && selected?.promoError && <Typography variant="caption" color="warning.main">{selected.promoError}</Typography>}
                      </Stack>
                    ) : (
                      <Button size="small" startIcon={<LocalOfferRounded />} onClick={() => setPromoOpen(true)}>Offers &amp; promo code</Button>
                    )}
                  </Box>

                  {selected && (
                    <Box sx={{ mt: 1 }}>
                      <Button size="small" onClick={() => setShowBreakdown(!showBreakdown)}>{showBreakdown ? 'Hide' : 'Show'} fare breakdown</Button>
                      {showBreakdown && <Box sx={{ mt: 1 }}><FareBreakdown lines={selected.breakdown} total={selected.total} /></Box>}
                    </Box>
                  )}
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 1 }}>Pay with</Typography>
                  <ToggleButtonGroup exclusive fullWidth value={paymentMethod} onChange={(e, value) => value && setPaymentMethod(value)} size="small">
                    <ToggleButton value="cash"><PaymentsRounded sx={{ mr: 1 }} fontSize="small" />Cash</ToggleButton>
                    <ToggleButton value="card" disabled={!payments.data?.cardPayments}><CreditCardRounded sx={{ mr: 1 }} fontSize="small" />Card</ToggleButton>
                  </ToggleButtonGroup>
                  {!payments.data?.cardPayments && <Typography variant="caption" color="text.secondary">Card payments are not enabled on this deployment.</Typography>}
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    sx={{ mt: 2.5 }}
                    endIcon={<ArrowForwardRounded />}
                    disabled={!selected || book.isPending || blockedByActive || Boolean(scheduleError)}
                    onClick={() => book.mutate()}
                  >
                    {book.isPending ? 'Booking…' : `${when === 'later' ? 'Schedule' : 'Book'} ${selected?.name} · ${money(selected?.total)}`}
                  </Button>
                  {blockedByActive && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>Finish your current ride first, or switch to Schedule.</Typography>}
                </>
              )}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
      <PromoDialog open={promoOpen} onClose={() => setPromoOpen(false)} onApply={setPromoCode} />
    </MapLayout>
  );
}
