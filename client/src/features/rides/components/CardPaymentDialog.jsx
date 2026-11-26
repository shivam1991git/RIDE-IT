import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { post } from '../../../shared/api/apiClient';
import { money } from '../../../shared/utils/format';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise;
const getStripe = () => {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
};

function CheckoutForm({ bookingId, amount, onPaid, onClose }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    // The server checks the payment with Stripe before marking it paid.
    try {
      const sync = await post(`/payments/bookings/${bookingId}/sync`);
      onPaid(sync.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <PaymentElement />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Test mode: use card 4242 4242 4242 4242, any future date and any CVC.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={pay} disabled={!stripe || busy}>{busy ? 'Processing…' : `Pay ${money(amount)}`}</Button>
      </DialogActions>
    </>
  );
}

export default function PaymentDialog({ open, bookingId, amount, onClose, onPaid }) {
  const theme = useTheme();
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !publishableKey) return;
    setError('');
    setClientSecret('');
    post(`/payments/bookings/${bookingId}/intent`)
      .then(result => setClientSecret(result.clientSecret))
      .catch(err => setError(err.message));
  }, [open, bookingId]);

  const appearance = useMemo(() => ({
    theme: theme.palette.mode === 'dark' ? 'night' : 'stripe',
    variables: { colorPrimary: theme.palette.primary.main, borderRadius: '12px', fontFamily: 'Inter, system-ui, sans-serif' },
  }), [theme]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Pay by card</DialogTitle>
      {!publishableKey && <DialogContent><Alert severity="info">Card payments are not configured for this deployment.</Alert></DialogContent>}
      {error && <DialogContent><Alert severity="error">{error}</Alert></DialogContent>}
      {publishableKey && !clientSecret && !error && <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>}
      {clientSecret && (
        <Elements stripe={getStripe()} options={{ clientSecret, appearance }}>
          <CheckoutForm bookingId={bookingId} amount={amount} onPaid={onPaid} onClose={onClose} />
        </Elements>
      )}
    </Dialog>
  );
}
