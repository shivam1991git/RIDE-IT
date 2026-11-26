// Trip actions shared by instant rides and chauffeur bookings: SOS and rating.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Rating, Stack, TextField, Typography,
} from '@mui/material';
import CallRounded from '@mui/icons-material/CallRounded';
import SosRounded from '@mui/icons-material/SosRounded';
import SmsRounded from '@mui/icons-material/SmsRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import { post } from '../../../shared/api/apiClient';
import { useToast } from '../../../app/providers/ToastProvider';

function currentPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 4000, maximumAge: 60000 },
    );
    return undefined;
  });
}

const SOS_STATUSES = { ride: ['accepted', 'arrived', 'in_progress'], rental: ['arrived', 'in_progress'] };

export function SosButton({ booking }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const sos = useMutation({
    mutationFn: async () => post(`/bookings/${booking._id}/sos`, { location: await currentPosition() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking', booking._id] }),
    onError: error => toast.error(error.message),
  });
  if (!(SOS_STATUSES[booking.type] || []).includes(booking.status)) return null;
  const result = sos.data;
  const message = result?.shareUrl
    ? `I need help. Follow my RIDE-IT trip live: ${result.shareUrl}`
    : `I need help. I am on RIDE-IT trip ${result?.reference || ''} with driver ${booking.driver?.fullName || ''} (${booking.car?.registrationNumber || booking.driver?.vehicle?.plateNumber || ''}).`;
  return (
    <>
      <Button color="error" variant="contained" startIcon={<SosRounded />} onClick={() => setOpen(true)} sx={{ fontWeight: 700 }}>Emergency SOS</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ color: 'error.main' }}>{result ? 'Help is on the way' : 'Need urgent help?'}</DialogTitle>
        <DialogContent>
          {!result ? (
            <Typography color="text.secondary">
              This alerts the RIDE-IT safety team right away with your trip and location. If you are in immediate danger, call 112 first.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              <Alert severity="success">Our safety team has been alerted and will contact you.</Alert>
              <Button fullWidth color="error" variant="contained" size="large" startIcon={<CallRounded />} href={`tel:${result.emergencyNumber}`}>Call {result.emergencyNumber} (emergency)</Button>
              {result.trustedContact ? (
                <Button fullWidth variant="outlined" startIcon={<SmsRounded />} href={`sms:${result.trustedContact.phone}?body=${encodeURIComponent(message)}`}>Text {result.trustedContact.name}</Button>
              ) : (
                <Typography variant="caption" color="text.secondary">Tip: add a trusted contact in your account to message them in one tap.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {!result ? (
            <>
              <Button href="tel:112" color="error">Call 112</Button>
              <Box sx={{ flex: 1 }} />
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button color="error" variant="contained" onClick={() => sos.mutate()} disabled={sos.isPending}>{sos.isPending ? 'Sending…' : 'Send SOS'}</Button>
            </>
          ) : <Button onClick={() => setOpen(false)}>Close</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}

export function RateDriver({ booking }) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  const rate = useMutation({
    mutationFn: () => post(`/bookings/${booking._id}/rate`, { score, comment: comment || undefined }),
    onSuccess: () => { toast.success('Thanks for your feedback!'); queryClient.invalidateQueries({ queryKey: ['booking', booking._id] }); },
    onError: error => toast.error(error.message),
  });
  if (booking.ratingByCustomer) {
    return <Alert severity="success" icon={<StarRounded />}>You rated this trip {booking.ratingByCustomer.score}★</Alert>;
  }
  return (
    <Stack spacing={1.5} sx={{ p: 2, borderRadius: 4, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle1">How was your trip with {booking.driver?.fullName?.split(' ')[0]}?</Typography>
      <Rating value={score} onChange={(e, value) => value && setScore(value)} size="large" />
      <TextField size="small" label="Add a comment (optional)" value={comment} onChange={e => setComment(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      <Button variant="contained" onClick={() => rate.mutate()} disabled={rate.isPending}>Submit rating</Button>
    </Stack>
  );
}
