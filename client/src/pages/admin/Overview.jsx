import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/material';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import SensorsRounded from '@mui/icons-material/SensorsRounded';
import BarChart, { lastNDays } from '../../components/BarChart';
import { CardSkeleton, StatCard, StatusChip } from '../../components/ui';
import { get } from '../../lib/api';
import { money, STATUS } from '../../lib/format';
import { AdminHeader } from './shared';

const CATEGORY_NAMES = { auto: 'Auto', mini: 'Mini', sedan: 'Sedan', suv: 'SUV' };

export default function Overview() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => get('/admin/stats'), refetchInterval: 60000 });
  if (isLoading) return <CardSkeleton rows={4} height={120} />;
  const { totals, bookingsByStatus, revenue, daily, ridesByCategory } = data;
  const totalRevenue = Object.values(revenue).reduce((sum, row) => sum + row.total, 0);
  const completed = Object.values(revenue).reduce((sum, row) => sum + row.count, 0);
  const bookingsChart = lastNDays(daily, 14, 'bookings');
  const categoryRows = Object.entries(ridesByCategory).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categoryRows.map(([, count]) => count));

  return (
    <>
      <AdminHeader title="Overview" subtitle="Live snapshot of the platform." />
      {totals.pendingDrivers > 0 && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button color="inherit" component={RouterLink} to="/admin/drivers">Review</Button>}>
          {totals.pendingDrivers} driver application{totals.pendingDrivers > 1 ? 's' : ''} waiting for verification.
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Revenue (completed)" value={money(totalRevenue)} hint={`${completed} completed bookings`} icon={CurrencyRupeeRounded} />
        <StatCard label="Riders" value={totals.customers} icon={PeopleRounded} accent="secondary" />
        <StatCard label="Drivers" value={totals.drivers} hint={`${totals.pendingDrivers} pending`} icon={BadgeRounded} accent="secondary" />
        <StatCard label="Drivers online" value={totals.onlineDrivers} hint={`${totals.cars} rental cars`} icon={SensorsRounded} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 3 }}>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6">Bookings per day</Typography>
          <Typography variant="caption" color="text.secondary">Last 14 days, rides and rentals</Typography>
          <Box sx={{ mt: 2 }}>
            <BarChart data={bookingsChart.map(d => ({ ...d, extra: d.row ? `${money(d.row.completedRevenue)} completed` : undefined }))} label="Bookings per day" caption="Bookings created per day over the last 14 days" />
          </Box>
        </Card>
        <Stack spacing={3}>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Bookings by status</Typography>
            <Stack spacing={1}>
              {Object.keys(STATUS).filter(status => bookingsByStatus[status]).map(status => (
                <Stack key={status} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <StatusChip status={status} />
                  <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{bookingsByStatus[status]}</Typography>
                </Stack>
              ))}
              {!Object.keys(bookingsByStatus).length && <Typography variant="body2" color="text.secondary">No bookings yet.</Typography>}
            </Stack>
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Rides by vehicle type</Typography>
            <Stack spacing={1.25} component="dl" sx={{ m: 0 }}>
              {categoryRows.map(([category, count]) => (
                <Box key={category}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography component="dt" variant="body2">{CATEGORY_NAMES[category] || category}</Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>{count}</Typography>
                  </Stack>
                  <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', mt: 0.5 }}>
                    <Box sx={{ height: '100%', width: `${(count / maxCategory) * 100}%`, borderRadius: 3, bgcolor: theme => (theme.palette.mode === 'dark' ? '#1E9C91' : '#17998D') }} />
                  </Box>
                </Box>
              ))}
              {!categoryRows.length && <Typography variant="body2" color="text.secondary">No rides yet.</Typography>}
            </Stack>
          </Card>
        </Stack>
      </Box>
    </>
  );
}
