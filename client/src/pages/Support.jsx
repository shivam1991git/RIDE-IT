import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, Chip, Container, Rating, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { PageHeader } from '../components/ui';
import { get, post } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useAuth } from '../providers/AuthProvider';
import { useToast } from '../providers/ToastProvider';

const TOPICS = [
  ['Booking a car', 'Open “Book a car”, choose hourly, full day, outstation or airport, enter your pickup and time, and pick a car. You see the full price first. Our team confirms your car and assigns a verified chauffeur; you are notified at each step.'],
  ['What the price includes', 'The car, fuel and chauffeur, up to the km and hours of your package, and GST. Extra km and hours are charged at the rates shown on your booking. Tolls, parking and interstate taxes are paid at actuals. Outstation prices include the driver allowance.'],
  ['Cancelling', 'Cancel from your booking. Before we confirm it is always free. After confirmation: more than 24 h before pickup, full refund; 6–24 h, 50% refund; under 6 h, no refund. You are never charged more than you have already paid.'],
  ['Changing the pickup time', 'Open your booking and choose “Change pickup time”. We check that your car and chauffeur are free at the new time; the price stays the same.'],
  ['Payments & refunds', 'Pay by UPI or cash: an advance after confirmation, or everything to your chauffeur at the end. Your booking shows what is paid and due. Refunds are sent to your UPI or bank account.'],
  ['Your trip PIN', 'Your booking shows a 4-digit PIN once confirmed. Give it to your chauffeur only when you are in the right car — the trip cannot start without it.'],
  ['Becoming a chauffeur', 'Apply from “Drive with us” with your licence details. We verify your licence and police verification before assigning trips.'],
];

const STATUS_COLORS = { open: 'warning', in_progress: 'info', resolved: 'success' };

function TicketForm() {
  const [params] = useSearchParams();
  const bookingId = /^[a-f\d]{24}$/i.test(params.get('booking') || '') ? params.get('booking') : undefined;
  const [form, setForm] = useState({ subject: bookingId ? 'Help with my booking' : '', message: '' });
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => post('/support', { ...form, bookingId }),
    onSuccess: () => { setForm({ subject: '', message: '' }); toast.success('Ticket created. We will reply in your notifications.'); queryClient.invalidateQueries({ queryKey: ['support'] }); },
    onError: error => toast.error(error.message),
  });
  return (
    <Stack spacing={2} component="form" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
      <TextField label="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
      <TextField label="How can we help?" multiline minRows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} helperText={bookingId ? 'This ticket is linked to your booking, so our team can see its details.' : 'Include your booking reference (e.g. BK1042) if this is about a booking.'} slotProps={{ htmlInput: { maxLength: 2000 } }} />
      <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={form.subject.trim().length < 3 || form.message.trim().length < 10 || create.isPending}>Send to support</Button>
    </Stack>
  );
}

function AppFeedback() {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const send = useMutation({
    mutationFn: () => post('/feedback', { appRating: rating, additionalComments: comment || undefined }),
    onSuccess: () => setSent(true),
    onError: error => toast.error(error.message),
  });
  if (sent) return <Alert severity="success">Thank you — your feedback helps us improve RIDE-IT.</Alert>;
  return (
    <Stack spacing={1.5}>
      <Rating value={rating} onChange={(e, value) => setRating(value || 0)} size="large" aria-label="Rate the app" />
      <TextField size="small" label="Anything we could do better? (optional)" value={comment} onChange={e => setComment(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
      <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} disabled={!rating || send.isPending} onClick={() => send.mutate()}>Send feedback</Button>
    </Stack>
  );
}

export default function Support() {
  const { account } = useAuth();
  const canFile = account && account.role !== 'admin';
  const tickets = useQuery({ queryKey: ['support'], queryFn: () => get('/support'), enabled: Boolean(canFile) });

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader eyebrow="Help centre" title="How can we help?" subtitle="Quick answers below, or ask the assistant in the corner. For anything else, our team replies to tickets in your notifications." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Box>
          {TOPICS.map(([title, body]) => (
            <Accordion key={title} disableGutters elevation={0} sx={{ bgcolor: 'transparent', borderBottom: 1, borderColor: 'divider', '&::before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography sx={{ fontWeight: 600 }}>{title}</Typography></AccordionSummary>
              <AccordionDetails><Typography color="text.secondary">{body}</Typography></AccordionDetails>
            </Accordion>
          ))}
        </Box>
        <Stack spacing={2.5}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>Contact support</Typography>
            {canFile ? <TicketForm /> : (
              <Stack spacing={2}>
                <Typography color="text.secondary">Sign in so we can link your request to your account and reply to you.</Typography>
                <Button variant="contained" component={RouterLink} to="/login" sx={{ alignSelf: 'flex-start' }}>Sign in</Button>
              </Stack>
            )}
          </Card>
          {canFile && tickets.data?.items?.length > 0 && (
            <Card sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>Your tickets</Typography>
              <Stack spacing={1.5}>
                {tickets.data.items.map(ticket => (
                  <Box key={ticket._id} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'action.hover' }}>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" noWrap>{ticket.subject}</Typography>
                      <Chip size="small" color={STATUS_COLORS[ticket.status]} label={ticket.status.replace('_', ' ')} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{relativeTime(ticket.createdAt)}</Typography>
                    {ticket.adminReply && <Typography variant="body2" sx={{ mt: 1 }}><b>Support:</b> {ticket.adminReply}</Typography>}
                  </Box>
                ))}
              </Stack>
            </Card>
          )}
          {canFile && <Card sx={{ p: 3 }}><Typography variant="h6" sx={{ mb: 1 }}>Rate RIDE-IT</Typography><AppFeedback /></Card>}
        </Stack>
      </Box>
    </Container>
  );
}
