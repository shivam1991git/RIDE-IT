// Printable booking summary / invoice. "Print" uses the browser's print dialog,
// which can also save it as a PDF.
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Container, Divider, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import PrintRounded from '@mui/icons-material/PrintRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { CardSkeleton } from '../../shared/components/ui';
import { get } from '../../shared/api/apiClient';
import { dateOnly, dateTime, km, money, PAYMENT_STATUS, RENTAL_TYPES, rentalRoute, STATUS } from '../../shared/utils/format';

const rupees = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;

function Lines({ rows }) {
  return (
    <Table size="small" sx={{ '& td': { borderColor: 'divider', px: 0 } }}>
      <TableBody>
        {rows.map(row => (
          <TableRow key={row.label}>
            <TableCell sx={{ fontWeight: row.strong ? 700 : 400 }}>{row.label}</TableCell>
            <TableCell align="right" sx={{ fontWeight: row.strong ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>{row.amount < 0 ? '−' : ''}{rupees(Math.abs(row.amount))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function ReceiptPage() {
  const { id } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ['booking', id], queryFn: () => get(`/bookings/${id}`) });
  if (isLoading) return <Container maxWidth="sm" sx={{ py: 6 }}><CardSkeleton rows={4} /></Container>;
  if (error) return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="error">{error.message}</Alert></Container>;
  const { booking } = data;
  const s = booking.settlement;
  const invoice = booking.status === 'completed';
  const p = booking.payment || {};
  const total = invoice ? (booking.finalAmount ?? booking.totalAmount) : booking.totalAmount;

  const extras = s ? [
    s.extraKm ? { label: `Extra distance (${s.extraKm} km)`, amount: s.extraKmCharge } : null,
    s.extraHours ? { label: `Extra time (${s.extraHours} h)`, amount: s.extraHourCharge } : null,
    s.gst ? { label: 'GST on extras', amount: s.gst } : null,
    s.tolls ? { label: 'Tolls (at actuals)', amount: s.tolls } : null,
    s.parking ? { label: 'Parking (at actuals)', amount: s.parking } : null,
  ].filter(Boolean) : [];

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack direction="row" spacing={1} className="no-print" sx={{ mb: 2, justifyContent: 'space-between' }}>
        <Button startIcon={<ArrowBackRounded />} component={RouterLink} to={`/trips/${booking._id}`}>Back to booking</Button>
        <Button variant="contained" startIcon={<PrintRounded />} onClick={() => window.print()}>Print / save as PDF</Button>
      </Stack>
      <Box className="print-area" sx={{ p: { xs: 2.5, sm: 4 }, border: 1, borderColor: 'divider', borderRadius: 4, bgcolor: 'background.paper' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h4" component="h1">RIDE-IT</Typography>
            <Typography variant="body2" color="text.secondary">Chauffeur-driven car rentals · Varanasi</Typography>
          </Box>
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography variant="h6">{invoice ? 'Invoice' : 'Booking summary'}</Typography>
            <Typography variant="body2">{booking.reference}</Typography>
            <Typography variant="body2" color="text.secondary">{dateOnly(invoice ? (booking.trip?.endedAt || booking.updatedAt) : booking.createdAt)}</Typography>
          </Box>
        </Stack>
        <Divider sx={{ my: 2.5 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">Customer</Typography>
            <Typography variant="body2">{booking.user?.fullName}</Typography>
            <Typography variant="body2" color="text.secondary">{booking.user?.phoneNumber}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Trip</Typography>
            <Typography variant="body2">{RENTAL_TYPES[booking.rentalType] || 'Rental'} · {STATUS[booking.status]?.label}</Typography>
            <Typography variant="body2" color="text.secondary">{rentalRoute(booking)}</Typography>
            <Typography variant="body2" color="text.secondary">{dateTime(booking.start)} → {dateTime(booking.end)}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Car</Typography>
            <Typography variant="body2">{booking.car?.name} {booking.car?.registrationNumber ? `· ${booking.car.registrationNumber}` : ''}</Typography>
          </Box>
          {booking.driver && (
            <Box>
              <Typography variant="overline" color="text.secondary">Chauffeur</Typography>
              <Typography variant="body2">{booking.driver.fullName}</Typography>
            </Box>
          )}
        </Box>
        <Divider sx={{ my: 2.5 }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{invoice ? 'Charges' : 'Estimated price'}</Typography>
        <Lines rows={[...(booking.fareBreakdown || []), ...extras, { label: invoice ? 'Total' : 'Estimated total', amount: total, strong: true }]} />
        {s && <Typography variant="caption" color="text.secondary">Distance driven {km(s.actualKm)} · time {s.actualHours} h</Typography>}
        <Divider sx={{ my: 2.5 }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Payment</Typography>
        <Lines rows={[
          { label: 'Paid', amount: p.paid || 0 },
          ...(p.refunded ? [{ label: 'Refunded', amount: -p.refunded }] : []),
          ...(booking.cancellation?.charge ? [{ label: 'Cancellation charge', amount: booking.cancellation.charge }] : []),
        ]} />
        <Typography variant="body2" sx={{ mt: 1 }}>Status: <b>{PAYMENT_STATUS[p.status]?.label || p.status}</b>{p.refundDue ? ` · refund due ${money(p.refundDue)}` : ''}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          Computer-generated document. Prices include GST where shown. Tolls, parking and interstate taxes are charged at actuals.
        </Typography>
      </Box>
    </Container>
  );
}
