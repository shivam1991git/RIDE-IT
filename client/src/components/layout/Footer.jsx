import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Link, Stack, Typography } from '@mui/material';
import Logo from './Logo';

const COLUMNS = [
  { title: 'Ride', links: [['Book a ride', '/ride'], ['Rentals', '/rentals'], ['My trips', '/trips']] },
  { title: 'Drive', links: [['Become a driver', '/drive'], ['Driver sign in', '/login?role=driver']] },
  { title: 'Help', links: [['Help centre', '/support'], ['Safety', '/#safety'], ['Fares', '/#fares']] },
];

export default function Footer() {
  return (
    <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', mt: 8, py: { xs: 5, md: 7 } }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 4, md: 8 }} sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ maxWidth: 320 }}>
            <Logo />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Rides and hourly rentals across Varanasi — from the ghats to the airport. Upfront fares, verified drivers.
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 4 }}>
            {COLUMNS.map(column => (
              <Box key={column.title}>
                <Typography variant="overline" color="text.secondary">{column.title}</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {column.links.map(([label, to]) => (
                    <Link key={label} component={RouterLink} to={to} color="text.primary" variant="body2">{label}</Link>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 6 }}>
          © {new Date().getFullYear()} RIDE-IT · A personal portfolio project. Map data © OpenStreetMap contributors.
        </Typography>
      </Container>
    </Box>
  );
}
