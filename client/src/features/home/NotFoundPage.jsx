import { Link as RouterLink } from 'react-router-dom';
import { Button, Container, Typography } from '@mui/material';
import VehicleArt from '../../shared/components/vehicles/VehicleArt';

export default function NotFound() {
  return (
    <Container maxWidth="sm" sx={{ py: 12, textAlign: 'center' }}>
      <Typography sx={{ color: 'text.primary', display: 'flex', justifyContent: 'center', mb: 3 }} component="div"><VehicleArt kind="auto" width={160} /></Typography>
      <Typography variant="h2" component="h1">Wrong turn</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>We could not find that page. Let’s get you back on the route.</Typography>
      <Button variant="contained" component={RouterLink} to="/">Back home</Button>
    </Container>
  );
}
