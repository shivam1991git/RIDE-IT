// Business rules that super admins can change without a deploy.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, Stack, TextField, Typography } from '@mui/material';
import { CardSkeleton } from '../../components/ui';
import { fieldErrors, get, patch } from '../../lib/api';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader } from './shared';

function Section({ title, subtitle, children }) {
  return (
    <Card sx={{ p: 2.5 }}>
      <Typography variant="h6">{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>{children}</Box>
    </Card>
  );
}

export default function Settings() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => get('/admin/settings') });
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (data) setForm(data.item); }, [data]);
  const save = useMutation({
    mutationFn: () => patch('/admin/settings', {
      gstPercent: Number(form.gstPercent),
      bufferMinutes: Number(form.bufferMinutes),
      minLeadHours: Number(form.minLeadHours),
      maxAdvanceDays: Number(form.maxAdvanceDays),
      cancellation: {
        freeHours: Number(form.cancellation.freeHours),
        partialHours: Number(form.cancellation.partialHours),
        partialRefundPercent: Number(form.cancellation.partialRefundPercent),
      },
      upiId: form.upiId || '',
      supportPhone: form.supportPhone || '',
      supportEmail: form.supportEmail || '',
      exclusions: form.exclusions || '',
    }),
    onSuccess: () => {
      setErrors({});
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['rental-options'] });
      queryClient.invalidateQueries({ queryKey: ['meta'] });
    },
    onError: error => { setErrors(fieldErrors(error)); toast.error(error.message); },
  });
  if (isLoading || !form) return <CardSkeleton rows={3} height={140} />;
  const num = (name, label, helper) => (
    <TextField size="small" type="number" label={label} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} helperText={errors[name] || helper} error={Boolean(errors[name])} />
  );
  const policy = (name, label, helper) => (
    <TextField size="small" type="number" label={label} value={form.cancellation[name]} onChange={e => setForm({ ...form, cancellation: { ...form.cancellation, [name]: e.target.value } })} helperText={helper} />
  );
  const text = (name, label, helper) => (
    <TextField size="small" label={label} value={form[name] || ''} onChange={e => setForm({ ...form, [name]: e.target.value })} helperText={errors[name] || helper} error={Boolean(errors[name])} />
  );
  const c = form.cancellation;
  return (
    <>
      <AdminHeader title="Settings" subtitle="Changes apply to new quotes and bookings immediately." />
      <Stack spacing={2}>
        <Section title="Booking window" subtitle="How far ahead customers can book, and the free time kept after each trip.">
          {num('minLeadHours', 'Minimum notice (hours)', 'Time we need to confirm a car and chauffeur')}
          {num('maxAdvanceDays', 'Book up to (days ahead)')}
          {num('bufferMinutes', 'Turnaround after a trip (min)', 'Cleaning and travel to the next pickup')}
        </Section>
        <Section title="Cancellation policy" subtitle="Applies to confirmed bookings. Unconfirmed requests are always free to cancel.">
          {policy('freeHours', 'Free until (hours before pickup)')}
          {policy('partialHours', 'Partial refund until (hours before)')}
          {policy('partialRefundPercent', 'Partial refund (%)')}
        </Section>
        <Alert severity="info">
          Customers see: free cancellation more than {c.freeHours} h before pickup; {c.partialRefundPercent}% refund between {c.partialHours} and {c.freeHours} h; no refund under {c.partialHours} h. The charge is never more than what they have paid.
        </Alert>
        <Section title="Tax, payments and contact">
          {num('gstPercent', 'GST (%)', 'Added to every quote')}
          {text('upiId', 'UPI ID for payments', 'Shown to customers, e.g. rideit@okaxis')}
          {text('supportPhone', 'Support phone')}
          {text('supportEmail', 'Support email')}
          <TextField size="small" label="Not included in the price" value={form.exclusions || ''} onChange={e => setForm({ ...form, exclusions: e.target.value })} multiline sx={{ gridColumn: { sm: 'span 2' } }} />
        </Section>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setForm(data.item)}>Discard</Button>
          <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>Save settings</Button>
        </Stack>
      </Stack>
    </>
  );
}
