import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Alert, Box, Button, ButtonBase, Chip, IconButton, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SwapVertRounded from '@mui/icons-material/SwapVertRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import CreditCardRounded from '@mui/icons-material/CreditCardRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import MapLayout from '../../components/MapLayout';
import PlaceSearch from '../../components/PlaceSearch';
import VehicleArt from '../../components/VehicleArt';
import { FareBreakdown } from '../../components/ui';
import { get, post } from '../../lib/api';
import { km, minutes, money } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';

function FareOption({ option, selected, onSelect }) {
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
      <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(option.total)}</Typography>
    </ButtonBase>
  );
}

function usePrefill(setPickup, setDrop) {
  const location = useLocation();
  const [params] = useSearchParams();
  const { data } = useQuery({ queryKey: ['geo', 'popular'], queryFn: () => get('/geo/popular'), staleTime: Infinity });
  useEffect(() => {
    if (location.state?.pickup) setPickup(location.state.pickup);
    if (location.state?.drop) setDrop(location.state.drop);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const find = name => data.places.find(place => place.name.toLowerCase() === (name || '').toLowerCase());
    const pickup = find(params.get('pickup'));
    const drop = find(params.get('drop'));
    if (pickup) setPickup(prev => prev || { name: pickup.name, address: pickup.address, lat: pickup.lat, lng: pickup.lng });
    if (drop) setDrop(prev => prev || { name: drop.name, address: drop.address, lat: drop.lat, lng: drop.lng });
  }, [data, params]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function BookRide() {
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [category, setCategory] = useState('mini');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  usePrefill(setPickup, setDrop);

  const active = useQuery({ queryKey: ['bookings', 'active-ride'], queryFn: () => get('/rides/active') });
  const payments = useQuery({ queryKey: ['payments', 'config'], queryFn: () => get('/payments/config'), staleTime: Infinity });
  const ready = Boolean(pickup && drop);
  const quote = useQuery({
    queryKey: ['quote', pickup?.lat, pickup?.lng, drop?.lat, drop?.lng],
    queryFn: () => post('/rides/quote', { pickup, drop }),
    enabled: ready,
    staleTime: 60000,
    retry: false,
  });

  const book = useMutation({
    mutationFn: () => post('/rides', { pickup, drop, category, paymentMethod }),
    onSuccess: ({ booking }) => navigate(`/trips/${booking._id}`),
    onError: error => toast.error(error.message),
  });

  const selected = quote.data?.options.find(option => option.category === category) || quote.data?.options[0];
  const activeRide = active.data?.booking;

  return (
    <MapLayout map={{ pickup, drop, route: quote.data?.geometry }}>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>Where to?</Typography>
      {activeRide && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" component={RouterLink} to={`/trips/${activeRide._id}`}>Open</Button>}>
          You have a ride in progress.
        </Alert>
      )}
      <Box sx={{ position: 'relative' }}>
        <Stack spacing={1.5}>
          <PlaceSearch label="Pickup" kind="pickup" value={pickup} onChange={setPickup} allowLocate />
          <PlaceSearch label="Destination" value={drop} onChange={setDrop} autoFocus={Boolean(pickup) && !drop} />
        </Stack>
        <Tooltip title="Swap pickup and destination">
          <IconButton
            onClick={() => { setPickup(drop); setDrop(pickup); }}
            aria-label="Swap pickup and destination"
            size="small"
            sx={{ position: 'absolute', right: 48, top: '50%', transform: 'translateY(-50%)', bgcolor: 'background.paper', border: 1, borderColor: 'divider', zIndex: 2 }}
          >
            <SwapVertRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <AnimatePresence mode="wait">
        {!ready && (
          <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              Choose a pickup and destination to compare fares. Tip: tap the target icon to use your current location.
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
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                    <Chip size="small" label={km(quote.data.distanceKm)} />
                    <Chip size="small" label={`~${minutes(quote.data.durationMin)}`} />
                    {quote.data.routeSource === 'estimate' && <Chip size="small" variant="outlined" label="Estimated route" />}
                  </Stack>
                  <Stack spacing={1} role="radiogroup" aria-label="Ride type">
                    {quote.data.options.map(option => (
                      <FareOption key={option.category} option={option} selected={selected?.category === option.category} onSelect={() => setCategory(option.category)} />
                    ))}
                  </Stack>
                  {selected && (
                    <Box sx={{ mt: 2 }}>
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
                    disabled={!selected || book.isPending || Boolean(activeRide)}
                    onClick={() => book.mutate()}
                  >
                    {book.isPending ? 'Booking…' : `Book ${selected?.name} · ${money(selected?.total)}`}
                  </Button>
                </>
              )}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </MapLayout>
  );
}
