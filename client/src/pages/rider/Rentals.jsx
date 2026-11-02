import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Card, CardActionArea, Chip, Container, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import CarImage from '../../components/CarImage';
import { CardSkeleton, EmptyState, PageHeader } from '../../components/ui';
import { get } from '../../lib/api';
import { money } from '../../lib/format';

export default function Rentals() {
  const { data, isLoading } = useQuery({ queryKey: ['cars'], queryFn: () => get('/cars') });
  const [seats, setSeats] = useState('any');
  const cars = useMemo(() => (data?.cars || []).filter(car => seats === 'any' || (seats === '6+' ? car.capacity >= 6 : car.capacity <= 5)), [data, seats]);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader
        eyebrow="Rentals"
        title="Rent a car by the hour"
        subtitle="From 1 hour to 7 days, up to 15 days ahead. Drive yourself or add a chauffeur. Partial hours are rounded up."
        action={(
          <ToggleButtonGroup size="small" exclusive value={seats} onChange={(e, value) => value && setSeats(value)} aria-label="Filter by seats">
            <ToggleButton value="any">Any size</ToggleButton>
            <ToggleButton value="5">Up to 5</ToggleButton>
            <ToggleButton value="6+">6+ seats</ToggleButton>
          </ToggleButtonGroup>
        )}
      />
      {isLoading && <CardSkeleton rows={3} height={140} />}
      {!isLoading && !cars.length && <EmptyState icon={DirectionsCarRounded} title="No cars match" body="Try a different size filter." />}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {cars.map(car => (
          <Card key={car._id} sx={{ transition: 'transform .25s, border-color .25s', '&:hover': { transform: 'translateY(-3px)', borderColor: 'secondary.main' } }}>
            <CardActionArea component={RouterLink} to={`/rentals/${car._id}`} sx={{ p: 2.5, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, mb: 2, borderRadius: 4, bgcolor: 'action.hover' }}><CarImage car={car} width={200} /></Box>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography variant="h6">{car.name}</Typography>
                <Typography variant="subtitle1">{money(car.rentPerHour)}<Typography component="span" variant="caption" color="text.secondary">/h</Typography></Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                <Chip size="small" variant="outlined" label={`${car.capacity} seats`} />
                <Chip size="small" variant="outlined" label={car.fuelType} />
                {car.transmission && <Chip size="small" variant="outlined" label={car.transmission} />}
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Container>
  );
}
