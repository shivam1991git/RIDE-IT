import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
  ['Booking a ride', 'Open Ride, set your pickup and destination, compare fares for each vehicle type, choose cash or card and confirm. A nearby verified driver accepts and you can follow the status live.'],
  ['Cancelling', 'Cancel a ride from the trip screen any time before it starts. Rentals can be cancelled online until the start time. Card payments for cancelled bookings are refunded automatically.'],
  ['Your ride PIN', 'Each ride has a 4-digit PIN shown on your trip screen. Share it with your driver only once you are in the right car — the trip cannot start without it.'],
  ['Fares', 'Fares are calculated on our servers from road distance and estimated time for each vehicle type, with a minimum fare for short trips. The price shown before booking is what you pay.'],
  ['Payments & refunds', 'Pay cash to your driver, or by card through Stripe. Refunds for cancelled card payments go back to the original card.'],
  ['Becoming a driver', 'Apply from “Drive with us” with your licence and vehicle details. Our team verifies applications before drivers can go online.'],
];

const STATUS_COLORS = { open: 'warning', in_progress: 'info', resolved: 'success' };

function TicketForm() {
  const [form, setForm] = useState({ subject: '', message: '' });
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => post('/support', form),
    onSuccess: () => { setForm({ subject: '', message: '' }); toast.success('Ticket created. We will reply in your notifications.'); queryClient.invalidateQueries({ queryKey: ['support'] }); },
    onError: error => toast.error(error.message),
  });
  return (
    <Stack spacing={2} component="form" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
      <TextField label="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
      <TextField label="How can we help?" multiline minRows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} helperText="Include your trip date and route if this is about a booking." slotProps={{ htmlInput: { maxLength: 2000 } }} />
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
