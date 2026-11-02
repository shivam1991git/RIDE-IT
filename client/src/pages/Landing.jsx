import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, Chip, Container, Stack, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import PinRounded from '@mui/icons-material/PinRounded';
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import SensorsRounded from '@mui/icons-material/SensorsRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import PlaceSearch from '../components/PlaceSearch';
import VehicleArt from '../components/VehicleArt';
import HeroVisual from '../components/hero/HeroVisual';
import { get } from '../lib/api';
import { money } from '../lib/format';
import { useAuth } from '../providers/AuthProvider';

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

const DESTINATIONS = [
  { name: 'Kashi Vishwanath Temple', image: '/places/kashi-vishwanath.avif', place: { name: 'Kashi Vishwanath Temple', address: 'Lahori Tola, Varanasi', lat: 25.3109, lng: 83.0107 } },
  { name: 'Dashashwamedh Ghat', image: '/places/dashashwamedh.jpg', place: { name: 'Dashashwamedh Ghat', address: 'Dashashwamedh, Varanasi', lat: 25.3068, lng: 83.0104 } },
  { name: 'Ahilya Ghat', image: '/places/ahilya-ghat.jpg', place: { name: 'Ahilya Ghat', address: 'Dashashwamedh, Varanasi', lat: 25.3074, lng: 83.0112 } },
];

const SAFETY = [
  { icon: PinRounded, title: 'PIN-verified pickup', body: 'Your trip only starts when you share your 4-digit PIN, so you always get into the right car.' },
  { icon: VerifiedUserRounded, title: 'Verified drivers', body: 'Every driver’s licence and vehicle is reviewed by our team before they can accept rides.' },
  { icon: CurrencyRupeeRounded, title: 'Upfront, fixed fares', body: 'The price you see before booking is the price you pay. No surge pricing, ever.' },
  { icon: SensorsRounded, title: 'Live trip status', body: 'Follow your driver from acceptance to drop-off, with instant updates in the app.' },
];

const FAQ = [
  ['How is my fare calculated?', 'Each ride type has a base fare plus a rate per kilometre and per minute along the actual road route. A minimum fare applies to very short trips. You see the exact amount before you confirm.'],
  ['Can I cancel a ride?', 'Yes — any time before the trip starts, from the trip screen. Card payments for cancelled rides are refunded to your card automatically.'],
  ['How do rentals work?', 'Pick a car and a time window (1 hour to 7 days). Add a chauffeur if you like. The car is reserved for you the moment you book.'],
  ['Where do you operate?', 'In and around Varanasi — the ghats, Cantt railway station, BHU, Sarnath and the airport.'],
];

function BookingPanel() {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const go = () => navigate('/ride', { state: { pickup, drop } });
  return (
    <Card sx={{ p: { xs: 2, sm: 3 }, borderRadius: 6, maxWidth: 520, boxShadow: theme => `0 30px 80px -40px ${alpha(theme.palette.primary.main, 0.45)}` }}>
      <Stack spacing={1.5}>
        <PlaceSearch label="Pickup" kind="pickup" value={pickup} onChange={setPickup} allowLocate />
        <PlaceSearch label="Where to?" value={drop} onChange={setDrop} />
        <Button size="large" variant="contained" endIcon={<ArrowForwardRounded />} onClick={go} disabled={!pickup || !drop}>
          See prices
        </Button>
      </Stack>
    </Card>
  );
}

export default function Landing() {
  const { role } = useAuth();
  const { data } = useQuery({ queryKey: ['fares'], queryFn: () => get('/fares/categories'), staleTime: 10 * 60 * 1000 });
  const navigate = useNavigate();

  return (
    <>
      {/* Hero */}
      <Box sx={{ position: 'relative', overflow: 'hidden' }}>
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: theme => `radial-gradient(60% 60% at 80% 30%, ${alpha(theme.palette.primary.main, 0.12)}, transparent 70%)` }} />
        <Container maxWidth="lg" sx={{ position: 'relative', pt: { xs: 4, md: 8 }, pb: { xs: 6, md: 10 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, gap: { xs: 3, md: 4 }, alignItems: 'center' }}>
            <Box>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <Chip label="Now riding across Varanasi" size="small" icon={<Box component="span" className="rid-pulse" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'secondary.main', color: 'secondary.main', ml: '10px !important' }} />} sx={{ mb: 2.5, bgcolor: 'action.hover' }} />
                <Typography variant="h1">
                  Your city,<br />
                  <Box component="span" sx={{ color: 'primary.main' }}>one tap</Box> away.
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 2.5, mb: 4, fontSize: { xs: '1.05rem', md: '1.15rem' }, maxWidth: 480 }}>
                  Autos, cabs and hourly rentals from the ghats to the airport. Upfront fares, verified drivers and live trip status.
                </Typography>
              </motion.div>
              {role === 'driver' || role === 'admin' ? (
                <Button size="large" variant="contained" component={RouterLink} to={role === 'driver' ? '/driver' : '/admin'} endIcon={<ArrowForwardRounded />}>
                  Go to your dashboard
                </Button>
              ) : (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
                  <BookingPanel />
                </motion.div>
              )}
            </Box>
            <HeroVisual />
          </Box>
        </Container>
      </Box>

      {/* Ride types bento */}
      <Container maxWidth="lg" id="fares" sx={{ py: { xs: 6, md: 10 }, scrollMarginTop: 80 }}>
        <motion.div {...reveal}>
          <Typography variant="overline" color="primary">Ride types</Typography>
          <Typography variant="h2" sx={{ mb: 1 }}>The right ride for every trip</Typography>
          <Typography color="text.secondary" sx={{ mb: 5, maxWidth: 560 }}>Live prices from our fare engine. Pick a vehicle when you book and see the exact fare first.</Typography>
        </motion.div>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {(data?.categories || []).map((category, index) => (
            <motion.div key={category.key} {...reveal} transition={{ ...reveal.transition, delay: index * 0.06 }} style={{ height: '100%' }}>
              <Card
                sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', transition: 'transform .25s, border-color .25s', '&:hover': { transform: 'translateY(-4px)', borderColor: 'primary.main' } }}
              >
                <Box sx={{ color: 'text.primary', mb: 2 }}><VehicleArt kind={category.key} width={140} /></Box>
                <Typography variant="h5">{category.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, flex: 1 }}>{category.description}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Chip size="small" label={`${category.capacity} seats`} variant="outlined" />
                  <Chip size="small" label={`₹${category.perKm}/km`} variant="outlined" />
                </Stack>
                <Typography variant="body2" sx={{ mt: 2 }}>From <b>{money(category.minFare)}</b></Typography>
              </Card>
            </motion.div>
          ))}
          <motion.div {...reveal} style={{ gridColumn: '1 / -1' }}>
            <Card sx={{ p: { xs: 3, md: 4 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, gap: 3, alignItems: 'center', background: theme => `linear-gradient(120deg, ${alpha(theme.palette.secondary.main, 0.14)}, transparent 60%)` }}>
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}><KeyRounded color="secondary" /><Typography variant="overline" color="secondary">Rentals</Typography></Stack>
                <Typography variant="h3">Need a car for the day?</Typography>
                <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Book by the hour, from 1 hour to 7 days. Drive yourself or add a chauffeur for ₹{data?.rentalDriverPerHour ?? 30}/hour.</Typography>
                <Button variant="outlined" color="secondary" component={RouterLink} to="/rentals" endIcon={<ArrowForwardRounded />}>Browse rental cars</Button>
              </Box>
              <Stack direction="row" spacing={-3} sx={{ justifyContent: 'center', color: 'text.primary', minWidth: 0, overflow: 'hidden', '& > svg': { flex: '0 1 auto' } }}>
                <VehicleArt kind="suv" color="#2EC4B6" width={170} />
                <VehicleArt kind="sedan" color="#F3F4F6" width={150} />
              </Stack>
            </Card>
          </motion.div>
        </Box>
      </Container>

      {/* How it works */}
      <Box sx={{ bgcolor: 'background.paper', borderBlock: 1, borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
          <motion.div {...reveal}>
            <Typography variant="overline" color="primary">How it works</Typography>
            <Typography variant="h2" sx={{ mb: 5 }}>From “where to?” to drop-off</Typography>
          </motion.div>
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 3 }}>
            {[
              ['Set your route', 'Search a place, pick a saved spot, or use your current location.'],
              ['Compare & choose', 'See the exact fare for Auto, Mini, Sedan and SUV side by side.'],
              ['Get matched', 'A verified driver nearby accepts. Watch them approach live.'],
              ['Share your PIN', 'Your trip starts only with your PIN. Pay by cash or card.'],
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, gap: { xs: 4, md: 8 } }}>
          <motion.div {...reveal}>
            <Typography variant="overline" color="primary">Safety & trust</Typography>
            <Typography variant="h2">Built so you can relax and ride</Typography>
            <Typography color="text.secondary" sx={{ mt: 2 }}>Every booking is checked on our servers — prices, permissions and trip status — not just in the app.</Typography>
            <Button sx={{ mt: 3 }} variant="outlined" component={RouterLink} to="/support" startIcon={<SupportAgentRounded />}>Visit the help centre</Button>
          </motion.div>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {SAFETY.map(({ icon: Icon, title, body }, index) => (
              <motion.div key={title} {...reveal} transition={{ ...reveal.transition, delay: index * 0.06 }}>
                <Card sx={{ p: 3, height: '100%' }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: theme => alpha(theme.palette.secondary.main, 0.14), color: 'secondary.main', mb: 2 }}><Icon /></Box>
                  <Typography variant="h6">{title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{body}</Typography>
                </Card>
              </motion.div>
            ))}
          </Box>
        </Box>
      </Container>

      {/* Destinations */}
      <Container maxWidth="lg" sx={{ pb: { xs: 6, md: 10 } }}>
        <motion.div {...reveal}>
          <Typography variant="overline" color="primary">Explore Kashi</Typography>
          <Typography variant="h2" sx={{ mb: 4 }}>Popular rides this week</Typography>
        </motion.div>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, gridTemplateRows: { md: '240px 240px' }, gap: 2 }}>
          {DESTINATIONS.map((destination, index) => (
            <Box
              key={destination.name}
              component={motion.button}
              {...reveal}
              onClick={() => navigate('/ride', { state: { drop: destination.place } })}
              sx={{
                position: 'relative', overflow: 'hidden', borderRadius: 5, border: 0, p: 0, cursor: 'pointer', textAlign: 'left', color: '#fff',
                minHeight: 220, gridRow: { md: index === 0 ? 'span 2' : 'auto' },
                '& img': { transition: 'transform .6s cubic-bezier(.22,1,.36,1)' }, '&:hover img': { transform: 'scale(1.05)' },
              }}
            >
              <Box component="img" src={destination.image} alt={destination.name} loading="lazy" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.75))' }} />
              <Stack direction="row" sx={{ position: 'absolute', left: 20, right: 20, bottom: 18, justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Typography variant="h5" sx={{ color: '#fff' }}>{destination.name}</Typography>
                <Chip label="Ride here" size="small" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }} />
              </Stack>
            </Box>
          ))}
        </Box>
      </Container>

      {/* FAQ + driver CTA */}
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
            <Typography variant="h3" sx={{ color: 'inherit', mt: 1 }}>Earn on your own schedule</Typography>
            <Typography sx={{ mt: 1.5, mb: 3, opacity: 0.85 }}>Sign up with your licence and vehicle. Once our team verifies you, go online whenever you like.</Typography>
            <Button variant="contained" component={RouterLink} to="/drive" sx={{ bgcolor: '#120C02', color: '#fff', '&:hover': { bgcolor: '#2a2216' } }} endIcon={<ArrowForwardRounded />}>Become a driver</Button>
          </Card>
        </Box>
      </Container>
    </>
  );
}
