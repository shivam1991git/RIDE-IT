import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import VehicleArt from '../../components/VehicleArt';
import { CardSkeleton } from '../../components/ui';
import { get, patch } from '../../lib/api';
import { money } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader } from './shared';

const FIELDS = [['baseFare', 'Base ₹'], ['perKm', '₹ / km'], ['perMin', '₹ / min'], ['minFare', 'Minimum ₹'], ['capacity', 'Seats']];

// Same formula as the server, for a live preview of a sample 8 km / 20 min trip.
const sample = f => Math.round(Math.max(Number(f.baseFare) + Number(f.perKm) * 8 + Number(f.perMin) * 20, Number(f.minFare)));

function CategoryCard({ item }) {
  const [form, setForm] = useState(item);
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => setForm(item), [item]);
  const save = useMutation({
    mutationFn: () => patch(`/admin/fares/${item.key}`, {
      name: form.name, description: form.description, active: form.active,
      ...Object.fromEntries(FIELDS.map(([key]) => [key, Number(form[key])])),
    }),
    onSuccess: () => { toast.success(`${form.name} pricing saved`); queryClient.invalidateQueries({ queryKey: ['admin', 'fares'] }); queryClient.invalidateQueries({ queryKey: ['fares'] }); },
    onError: error => toast.error(error.message),
  });
  const dirty = JSON.stringify(form) !== JSON.stringify(item);
  return (
    <Card sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Box sx={{ color: 'text.primary' }}><VehicleArt kind={item.key} width={80} /></Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">Sample 8 km / 20 min trip: <b>{money(sample(form))}</b></Typography>
        </Box>
        <FormControlLabel control={<Switch checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />} label="Active" />
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 1.5 }}>
        {FIELDS.map(([key, label]) => (
          <TextField key={key} size="small" type="number" label={label} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} slotProps={{ htmlInput: { min: 0, step: key === 'capacity' ? 1 : 0.5 } }} />
        ))}
      </Box>
      <TextField size="small" label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} sx={{ mt: 1.5 }} />
      {dirty && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, justifyContent: 'flex-end' }}>
          <Button onClick={() => setForm(item)}>Discard</Button>
          <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </Stack>
      )}
    </Card>
  );
}

export default function Pricing() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'fares'], queryFn: () => get('/admin/fares') });
  return (
    <>
      <AdminHeader title="Pricing" subtitle="Fare = max(base + per-km × distance + per-minute × time, minimum). Changes apply to new quotes immediately." />
      <Alert severity="info" sx={{ mb: 2 }}>Existing bookings keep the fare they were booked at.</Alert>
      {isLoading ? <CardSkeleton rows={4} height={160} /> : (
        <Stack spacing={2}>{data.items.map(item => <CategoryCard key={item._id} item={item} />)}</Stack>
      )}
    </>
  );
}
