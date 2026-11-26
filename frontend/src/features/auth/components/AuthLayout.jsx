import { Box, Card, Container, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import VehicleArt from '../../../shared/components/vehicles/VehicleArt';

export default function AuthLayout({ title, subtitle, children, aside, wide }) {
  return (
    <Container maxWidth={wide ? 'md' : 'lg'} sx={{ py: { xs: 3, md: 7 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: wide ? '1fr' : '1fr 1fr' }, gap: 4, alignItems: 'center' }}>
        {!wide && (
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Typography variant="h2">{aside?.title || 'Rides that respect your time.'}</Typography>
            <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 420 }}>{aside?.body || 'Upfront fares, verified drivers and live trip updates — across Varanasi.'}</Typography>
            <Stack direction="row" spacing={-2} sx={{ mt: 6, color: 'text.primary' }}>
              <VehicleArt kind="auto" width={150} />
              <VehicleArt kind="mini" width={160} />
            </Stack>
          </Box>
        )}
        <Card sx={{ p: { xs: 3, sm: 4.5 }, borderRadius: 6, maxWidth: wide ? 760 : 480, width: '100%', mx: 'auto', boxShadow: theme => `0 40px 100px -60px ${alpha(theme.palette.primary.main, 0.6)}` }}>
          <Typography variant="h3" component="h1">{title}</Typography>
          {subtitle && <Typography color="text.secondary" sx={{ mt: 1 }}>{subtitle}</Typography>}
          <Box sx={{ mt: 3 }}>{children}</Box>
        </Card>
      </Box>
    </Container>
  );
}
