import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, Chip, Stack, Typography } from '@mui/material';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import BarChart, { lastNDays } from '../../../shared/components/BarChart';
import { CardSkeleton, StatCard, StatusChip } from '../../../shared/components/ui';
import { get } from '../../../shared/api/apiClient';
import { dateOnly, money, RENTAL_TYPES, STATUS } from '../../../shared/utils/format';
import { AdminHeader } from '../components/adminShared';

// Work waiting for operations, most urgent first.
function Attention({ attention, totals }) {
  const items = [
    [attention.pendingApproval, 'booking request waiting for approval', 'requests waiting for approval', '/admin/bookings?view=pending', 'warning'],
    [attention.needsDriver, 'confirmed booking needs a chauffeur', 'confirmed bookings need a chauffeur', '/admin/bookings?view=needs_driver', 'error'],
    [attention.unacknowledged, 'chauffeur has not acknowledged a trip in the next 24 h', 'chauffeurs have not acknowledged trips in the next 24 h', '/admin/bookings?view=unacknowledged', 'warning'],
    [attention.refundsDue, 'refund to send', 'refunds to send', '/admin/bookings?view=refunds', 'info'],
    [totals.urgentTickets, 'urgent support ticket (SOS / breakdown)', 'urgent support tickets (SOS / breakdowns)', '/admin/support', 'error'],
    [totals.pendingDrivers, 'chauffeur application to verify', 'chauffeur applications to verify', '/admin/drivers', 'info'],
  ].filter(([count]) => count > 0);
  if (!items.length) return <Alert severity="success" sx={{ mb: 3 }}>All caught up. No bookings or applications are waiting.</Alert>;
  return (
    <Stack spacing={1} sx={{ mb: 3 }}>
      {items.map(([count, one, many, to, severity]) => (
        <Alert key={to + one} severity={severity} action={<Button color="inherit" component={RouterLink} to={to}>Open</Button>}>
          <b>{count}</b> {count === 1 ? one : many}
        </Alert>
      ))}
    </Stack>
  );
}

export default function OverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => get('/admin/stats'), refetchInterval: 60000 });
  if (isLoading) return <CardSkeleton rows={4} height={120} />;
  const { totals, attention, bookingsByStatus, revenue, daily, rentalsByType, complianceAlerts, complianceAlertCount } = data;
  const completedRevenue = Object.values(revenue).reduce((sum, row) => sum + row.total, 0);
  const completed = Object.values(revenue).reduce((sum, row) => sum + row.count, 0);
  const bookingsChart = lastNDays(daily, 14, 'bookings');
  const typeRows = Object.entries(rentalsByType).sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(1, ...typeRows.map(([, count]) => count));
  const totalBookings = Object.values(bookingsByStatus).reduce((sum, count) => sum + count, 0);

  return (
    <>
      <AdminHeader title="Overview" subtitle="Today’s operations at a glance." />
      <Attention attention={attention} totals={totals} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Pickups today" value={totals.todayPickups} hint={`${totalBookings} bookings in total`} icon={TodayRounded} />
        <StatCard label="Waiting for approval" value={attention.pendingApproval} hint={`${bookingsByStatus.confirmed || 0} confirmed`} icon={PendingActionsRounded} accent="secondary" />
        <StatCard label="On trip now" value={(bookingsByStatus.in_progress || 0) + (bookingsByStatus.arrived || 0)} hint={`${completed} completed`} icon={DirectionsCarRounded} />
        <StatCard label="Cars free now" value={totals.availableCars} hint={`${totals.busyCars} busy · ${totals.carsInMaintenance} in workshop`} icon={DirectionsCarRounded} accent="secondary" />
        <StatCard label="Chauffeurs free now" value={totals.availableDrivers} hint={`${totals.busyDrivers} on trip · ${totals.drivers} approved`} icon={BadgeRounded} />
        <StatCard label="Money collected" value={money(totals.collected)} hint={`${money(completedRevenue)} billed on completed trips`} icon={CurrencyRupeeRounded} accent="secondary" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 3 }}>
        <Stack spacing={3}>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6">Bookings per day</Typography>
            <Typography variant="caption" color="text.secondary">Requests created in the last 14 days</Typography>
            <Box sx={{ mt: 2 }}>
              <BarChart data={bookingsChart.map(d => ({ ...d, extra: d.row ? `${money(d.row.completedRevenue)} completed` : undefined }))} label="Bookings per day" caption="Bookings created per day over the last 14 days" />
            </Box>
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6">Documents and licences</Typography>
              <Button size="small" component={RouterLink} to="/admin/fleet">Fleet</Button>
            </Stack>
            {complianceAlerts.length ? (
              <Stack spacing={1}>
                {complianceAlerts.map(alert => (
                  <Stack key={`${alert.id}-${alert.item}`} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" noWrap sx={{ minWidth: 0 }}><b>{alert.name}</b> · {alert.item}</Typography>
                    <Chip size="small" color={alert.expired ? 'error' : 'warning'} label={alert.expiresOn ? `${alert.expired ? 'expired' : 'expires'} ${dateOnly(alert.expiresOn)}` : 'action needed'} />
                  </Stack>
                ))}
                {complianceAlertCount > complianceAlerts.length && <Typography variant="caption" color="text.secondary">and {complianceAlertCount - complianceAlerts.length} more</Typography>}
              </Stack>
            ) : <Typography variant="body2" color="text.secondary">Every car and chauffeur document is valid for at least 30 days.</Typography>}
          </Card>
        </Stack>
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
              {!totalBookings && <Typography variant="body2" color="text.secondary">No bookings yet.</Typography>}
            </Stack>
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Bookings by trip type</Typography>
            <Stack spacing={1.25} component="dl" sx={{ m: 0 }}>
              {typeRows.map(([type, count]) => (
                <Box key={type}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography component="dt" variant="body2">{RENTAL_TYPES[type] || type}</Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>{count}</Typography>
                  </Stack>
                  <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', mt: 0.5 }}>
                    <Box sx={{ height: '100%', width: `${(count / maxType) * 100}%`, borderRadius: 3, bgcolor: theme => (theme.palette.mode === 'dark' ? '#1E9C91' : '#17998D') }} />
                  </Box>
                </Box>
              ))}
              {!typeRows.length && <Typography variant="body2" color="text.secondary">No chauffeur bookings yet.</Typography>}
            </Stack>
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>People</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Chip icon={<PeopleRounded />} label={`${totals.customers} customers`} />
              <Chip icon={<BadgeRounded />} label={`${totals.drivers} chauffeurs`} />
              <Chip icon={<DirectionsCarRounded />} label={`${totals.cars} cars`} />
            </Stack>
          </Card>
        </Stack>
      </Box>
    </>
  );
}
