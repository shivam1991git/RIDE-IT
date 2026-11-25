import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardActionArea, Chip, Container, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import PinRounded from '@mui/icons-material/PinRounded';
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import SosRounded from '@mui/icons-material/SosRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import WbSunnyRounded from '@mui/icons-material/WbSunnyRounded';
import FlightTakeoffRounded from '@mui/icons-material/FlightTakeoffRounded';
import SyncAltRounded from '@mui/icons-material/SyncAltRounded';
import PlaceSearch from '../components/PlaceSearch';
import HeroVisual from '../components/hero/HeroVisual';
import { useRentalOptions } from '../lib/meta';
import { money, toLocalInput } from '../lib/format';
import { useAuth } from '../providers/AuthProvider';

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

const SIGHTS = [
  { name: 'Kashi Vishwanath Temple', image: '/places/kashi-vishwanath.avif' },
  { name: 'Dashashwamedh Ghat', image: '/places/dashashwamedh.jpg' },
  { name: 'Ahilya Ghat', image: '/places/ahilya-ghat.jpg' },
];

const SAFETY = [
  { icon: VerifiedUserRounded, title: 'Verified chauffeurs', body: 'Every chauffeur’s driving licence and police verification are checked by our team, and expired licences are blocked automatically.' },
  { icon: DescriptionRounded, title: 'Documented cars', body: 'Registration, insurance, permit, fitness and PUC certificates are tracked for every car. A car with lapsed papers is never assigned.' },
  { icon: PinRounded, title: 'PIN-verified start', body: 'Your trip only starts when you give your chauffeur the 4-digit PIN from your booking, so you always get into the right car.' },
  { icon: CurrencyRupeeRounded, title: 'Clear, upfront prices', body: 'See the full breakdown with GST before you book, plus exactly how extra km and hours are charged. No surge pricing.' },
  { icon: SosRounded, title: 'SOS during your trip', body: 'One tap alerts our safety team with your trip details and lets you call 112 or your trusted contact.' },
  { icon: SupportAgentRounded, title: 'Real people on call', body: 'Our operations team confirms every booking and is on hand if anything changes on the day.' },
];

const FAQ = [
  ['How does booking work?', 'Choose your trip type, pickup and time, then pick a car and see the full price. Send the request; our team confirms the car and assigns a verified chauffeur, and you are notified with their details.'],
  ['What is included in the price?', 'The car, fuel, the chauffeur and GST, up to the hours and kilometres of your package. Outstation trips include the driver allowance and night charges. Tolls, parking and interstate taxes are paid at actuals.'],
  ['Can I cancel or change my booking?', 'Yes, from your booking page. Cancelling before we confirm is always free. After confirmation: full refund more than 24 h before pickup, 50% between 6 and 24 h, none under 6 h. You can also change the pickup time if the car and chauffeur are free.'],
  ['How do I pay?', 'By UPI or cash. Pay an advance after we confirm, or pay your chauffeur at the end. Your booking always shows what is paid and due, and you can download an invoice.'],
  ['Can I drive the car myself?', 'Not yet. Every RIDE-IT car comes with a verified chauffeur.'],
];

const QUICK_TYPES = [
  ['hourly', 'Hourly', ScheduleRounded],
  ['full_day', 'Full day', WbSunnyRounded],
  ['airport', 'Airport', FlightTakeoffRounded],
  ['outstation_round', 'Outstation', SyncAltRounded],
];

function QuickBook() {
  const navigate = useNavigate();
  const [type, setType] = useState('hourly');
  const [pickup, setPickup] = useState(null);
  const [start, setStart] = useState(() => {
    const date = new Date(Date.now() + 3 * 3600e3);
    date.setMinutes(0, 0, 0);
    return toLocalInput(date);
  });
  const go = () => navigate(`/rentals?type=${type}`, { state: { trip: { pickup, start } } });
  return (
    <Card sx={{ p: { xs: 2, sm: 3 }, borderRadius: 6, maxWidth: 520, boxShadow: theme => `0 30px 80px -40px ${alpha(theme.palette.primary.main, 0.45)}` }}>
      <Stack spacing={1.5}>
        <ToggleButtonGroup exclusive fullWidth size="small" value={type} onChange={(e, value) => value && setType(value)} aria-label="Trip type">
          {QUICK_TYPES.map(([key, label, Icon]) => (
            <ToggleButton key={key} value={key} sx={{ flexDirection: 'column', gap: 0.25, py: 1, textTransform: 'none' }}>
              <Icon fontSize="small" /><Typography variant="caption" sx={{ fontWeight: 600 }}>{label}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <PlaceSearch label="Pickup address" kind="pickup" value={pickup} onChange={setPickup} allowLocate />
        <TextField type="datetime-local" label="Pickup date & time" value={start} onChange={e => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button size="large" variant="contained" endIcon={<ArrowForwardRounded />} onClick={go}>See cars & prices</Button>
      </Stack>
    </Card>
  );
}

export default function Landing() {
  const { role } = useAuth();
  const { data: options } = useRentalOptions();
  const classes = options?.classes || [];
  const cheapest = key => (classes.length ? Math.min(...classes.map(c => c[key])) : null);
  const TYPES = [
    { key: 'hourly', title: 'Hourly in the city', body: '4 or 6 hours with a chauffeur for shopping, meetings or errands. Your car waits wherever you stop.', price: cheapest('hourlyFrom'), icon: ScheduleRounded },
    { key: 'full_day', title: 'Full day darshan', body: '8 or 12 hours across temples, ghats and Sarnath at your own pace. Ideal for families.', price: cheapest('fullDayFrom'), icon: WbSunnyRounded },
    { key: 'airport', title: 'Airport transfers', body: 'Fixed-price drops and pickups at Babatpur airport, with 30 minutes of free waiting for your flight.', price: cheapest('airportFare'), icon: FlightTakeoffRounded },
    { key: 'outstation_round', title: 'Outstation trips', body: 'One-way or round trips to Prayagraj, Ayodhya, Bodh Gaya and more, with driver allowance included.', perKm: cheapest('perKm'), icon: SyncAltRounded },
  ];

  return (
    <>
      {/* Hero */}
      <Box sx={{ position: 'relative', overflow: 'hidden' }}>
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: theme => `radial-gradient(60% 60% at 80% 30%, ${alpha(theme.palette.primary.main, 0.12)}, transparent 70%)` }} />
        <Container maxWidth="lg" sx={{ position: 'relative', pt: { xs: 4, md: 8 }, pb: { xs: 6, md: 10 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, gap: { xs: 3, md: 4 }, alignItems: 'center' }}>
            <Box>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <Chip label="Chauffeur-driven cars in Varanasi" size="small" icon={<Box component="span" className="rid-pulse" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'secondary.main', color: 'secondary.main', ml: '10px !important' }} />} sx={{ mb: 2.5, bgcolor: 'action.hover' }} />
                <Typography variant="h1">
                  Your car and driver,<br />
                  <Box component="span" sx={{ color: 'primary.main' }}>sorted</Box> in minutes.
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 2.5, mb: 4, fontSize: { xs: '1.05rem', md: '1.15rem' }, maxWidth: 480 }}>
                  Hourly and full-day hire, airport transfers and outstation trips, each with a verified chauffeur. See the full price before you book.
                </Typography>
              </motion.div>
              {role === 'driver' || role === 'admin' ? (
                <Button size="large" variant="contained" component={RouterLink} to={role === 'driver' ? '/driver' : '/admin'} endIcon={<ArrowForwardRounded />}>
                  Go to your dashboard
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
                  <QuickBook />
                </motion.div>
              )}
            </Box>
            <HeroVisual />
          </Box>
        </Container>
      </Box>

      {/* Trip types */}
      <Container maxWidth="lg" id="services" sx={{ py: { xs: 6, md: 10 }, scrollMarginTop: 80 }}>
        <motion.div {...reveal}>
          <Typography variant="overline" color="primary">What we offer</Typography>
          <Typography variant="h2" sx={{ mb: 1 }}>A chauffeur for every kind of trip</Typography>
          <Typography color="text.secondary" sx={{ mb: 5, maxWidth: 560 }}>Hatchbacks, sedans, SUVs and 7-seaters. Prices include fuel, the chauffeur and GST.</Typography>
        </motion.div>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {TYPES.map(({ key, title, body, price, perKm, icon: Icon }, index) => (
            <motion.div key={key} {...reveal} transition={{ ...reveal.transition, delay: index * 0.06 }} style={{ height: '100%' }}>
              <Card sx={{ height: '100%', transition: 'transform .25s, border-color .25s', '&:hover': { transform: 'translateY(-4px)', borderColor: 'primary.main' } }}>
                <CardActionArea component={RouterLink} to={`/rentals?type=${key}`} sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: theme => alpha(theme.palette.primary.main, 0.12), color: 'primary.main', mb: 2 }}><Icon /></Box>
                  <Typography variant="h5">{title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2, flex: 1 }}>{body}</Typography>
                  {price ? <Typography variant="body2">From <b>{money(price)}</b></Typography> : null}
                  {perKm ? <Typography variant="body2">From <b>₹{perKm}/km</b></Typography> : null}
                </CardActionArea>
              </Card>
            </motion.div>
          ))}
        </Box>
      </Container>

      {/* How it works */}
      <Box sx={{ bgcolor: 'background.paper', borderBlock: 1, borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
          <motion.div {...reveal}>
            <Typography variant="overline" color="primary">How it works</Typography>
            <Typography variant="h2" sx={{ mb: 5 }}>From request to drop-off</Typography>
          </motion.div>
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 3 }}>
            {[
              ['Choose your trip', 'Pick the trip type, pickup and time, then a car. The full price with GST is shown before you book.'],
              ['We confirm', 'Our team checks the car and assigns a verified chauffeur. You get their name, number and the car’s plate.'],
              ['Meet your chauffeur', 'Share your 4-digit PIN to start. Your chauffeur stays with you for the whole package.'],
              ['Pay your way', 'UPI or cash, in advance or at the end. Your invoice is ready the moment the trip ends.'],
            ].map(([title, body], index) => (
              <motion.li key={title} {...reveal} transition={{ ...reveal.transition, delay: index * 0.08 }}>
                <Typography sx={{ fontFamily: 'Sora', fontWeight: 700, fontSize: 44, lineHeight: 1, color: 'primary.main', opacity: 0.9 }}>0{index + 1}</Typography>
                <Typography variant="h5" sx={{ mt: 2 }}>{title}</Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>{body}</Typography>
              </motion.li>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Safety */}
      <Container maxWidth="lg" id="safety" sx={{ py: { xs: 6, md: 10 }, scrollMarginTop: 80 }}>
        <motion.div {...reveal}>
          <Typography variant="overline" color="primary">Safety & trust</Typography>
          <Typography variant="h2" sx={{ mb: 1 }}>Checked before every trip</Typography>
          <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 620 }}>Compliance is enforced by the system, not just promised: a chauffeur or car with lapsed documents cannot be assigned.</Typography>
        </motion.div>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {SAFETY.map(({ icon: Icon, title, body }, index) => (
            <motion.div key={title} {...reveal} transition={{ ...reveal.transition, delay: index * 0.05 }}>
              <Card sx={{ p: 3, height: '100%' }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: theme => alpha(theme.palette.secondary.main, 0.14), color: 'secondary.main', mb: 2 }}><Icon /></Box>
                <Typography variant="h6">{title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{body}</Typography>
              </Card>
            </motion.div>
          ))}
        </Box>
      </Container>

      {/* Destinations */}
      <Container maxWidth="lg" sx={{ pb: { xs: 6, md: 10 } }}>
        <motion.div {...reveal}>
          <Typography variant="overline" color="primary">Explore Kashi and beyond</Typography>
          <Typography variant="h2" sx={{ mb: 4 }}>Where our guests go</Typography>
        </motion.div>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, gridTemplateRows: { md: '240px 240px' }, gap: 2 }}>
          {SIGHTS.map((sight, index) => (
            <Box
              key={sight.name}
              component={RouterLink}
              to="/rentals?type=full_day"
              sx={{
                position: 'relative', overflow: 'hidden', borderRadius: 5, color: '#fff', textDecoration: 'none', minHeight: 220, gridRow: { md: index === 0 ? 'span 2' : 'auto' },
                '& img': { transition: 'transform .6s cubic-bezier(.22,1,.36,1)' }, '&:hover img': { transform: 'scale(1.05)' },
              }}
            >
              <Box component="img" src={sight.image} alt={sight.name} loading="lazy" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.75))' }} />
              <Stack direction="row" sx={{ position: 'absolute', left: 20, right: 20, bottom: 18, justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Typography variant="h5" sx={{ color: '#fff' }}>{sight.name}</Typography>
                <Chip label="Full day with chauffeur" size="small" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }} />
              </Stack>
            </Box>
          ))}
        </Box>
        {options?.destinations?.length > 0 && (
          <Stack direction="row" sx={{ mt: 3, flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ mr: 1 }}>Outstation:</Typography>
            {options.destinations.map(item => (
              <Chip key={item.key} label={item.name} component={RouterLink} to="/rentals?type=outstation_round" clickable variant="outlined" />
            ))}
          </Stack>
        )}
      </Container>

      {/* FAQ + chauffeur CTA */}
      <Container maxWidth="lg">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: 6 } }}>
          <Box>
            <Typography variant="overline" color="primary">FAQ</Typography>
            <Typography variant="h3" sx={{ mb: 3 }}>Good to know</Typography>
            {FAQ.map(([question, answer]) => (
              <Accordion key={question} disableGutters elevation={0} sx={{ bgcolor: 'transparent', borderBottom: 1, borderColor: 'divider', '&::before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography sx={{ fontWeight: 600 }}>{question}</Typography></AccordionSummary>
                <AccordionDetails><Typography color="text.secondary">{answer}</Typography></AccordionDetails>
              </Accordion>
            ))}
          </Box>
          <Card sx={{ p: { xs: 3, md: 5 }, alignSelf: 'start', bgcolor: 'primary.main', color: 'primary.contrastText', border: 0 }}>
            <Typography variant="overline" sx={{ opacity: 0.8 }}>Drive with RIDE-IT</Typography>
            <Typography variant="h3" sx={{ color: 'inherit', mt: 1 }}>Work as a chauffeur</Typography>
            <Typography sx={{ mt: 1.5, mb: 3, opacity: 0.85 }}>Apply with your driving licence. Once our team verifies your licence and police verification, trips are assigned to you in the app.</Typography>
            <Button variant="contained" component={RouterLink} to="/drive" sx={{ bgcolor: '#120C02', color: '#fff', '&:hover': { bgcolor: '#2a2216' } }} endIcon={<ArrowForwardRounded />}>Apply now</Button>
          </Card>
        </Box>
      </Container>
    </>
  );
}
