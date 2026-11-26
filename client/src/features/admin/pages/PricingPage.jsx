// Rate cards per vehicle class (super admins edit; others view). Bookings keep
// the price they were made with, so edits only affect new quotes.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import VehicleArt from '../../../shared/components/vehicles/VehicleArt';
import { CardSkeleton } from '../../../shared/components/ui';
import { get, patch } from '../../../shared/api/apiClient';
import { useMeta } from '../../../shared/api/useAppConfig';
import { money } from '../../../shared/utils/format';
import { useToast } from '../../../app/providers/ToastProvider';
import { AdminHeader, useAdminRole } from '../components/adminShared';

const ART = { hatchback: 'hatch', sedan: 'sedan', suv: 'suv', muv: 'mpv' };
const packageLabel = pkg => `${pkg.hours} h / ${pkg.km} km`;

function Num({ label, value, onChange, disabled, step = 1 }) {
  return <TextField size="small" type="number" label={label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} slotProps={{ htmlInput: { min: 0, step } }} />;
}

function RateCard({ item, packages, editable }) {
  const [form, setForm] = useState(item);
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => setForm(item), [item]);
  const price = key => form.packages.find(p => p.key === key)?.price ?? '';
  const setPrice = (key, value) => setForm({ ...form, packages: packages.map(pkg => ({ key: pkg.key, price: pkg.key === key ? value : price(pkg.key) })) });
  const setGroup = (group, key) => value => setForm({ ...form, [group]: { ...form[group], [key]: value } });
  const save = useMutation({
    mutationFn: () => patch(`/admin/rates/${item.vehicleClass}`, {
      label: form.label,
      active: form.active,
      extraKmRate: Number(form.extraKmRate),
      extraHourRate: Number(form.extraHourRate),
      packages: packages.map(pkg => ({ key: pkg.key, price: Number(price(pkg.key)) })),
      outstation: Object.fromEntries(Object.entries(form.outstation).map(([k, v]) => [k, Number(v)])),
      airport: Object.fromEntries(Object.entries(form.airport).map(([k, v]) => [k, Number(v)])),
    }),
    onSuccess: () => { toast.success(`${form.label} rates saved`); queryClient.invalidateQueries({ queryKey: ['admin', 'rates'] }); queryClient.invalidateQueries({ queryKey: ['rental-options'] }); },
    onError: error => toast.error(error.message),
  });
  const dirty = JSON.stringify(form) !== JSON.stringify(item);
  const off = !editable;
  return (
    <Card sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Box sx={{ color: 'text.primary' }}><VehicleArt kind={ART[item.vehicleClass] || 'sedan'} width={80} /></Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">{item.label}</Typography>
          <Typography variant="caption" color="text.secondary">From {money(Math.min(...form.packages.map(p => Number(p.price) || 0)))} before GST</Typography>
        </Box>
        <FormControlLabel control={<Switch checked={form.active} disabled={off} onChange={e => setForm({ ...form, active: e.target.checked })} />} label="Offered" />
      </Stack>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Local packages (₹)</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
        {packages.map(pkg => <Num key={pkg.key} label={packageLabel(pkg)} value={price(pkg.key)} onChange={value => setPrice(pkg.key, value)} disabled={off} />)}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
        <Num label="Extra km ₹" value={form.extraKmRate} onChange={value => setForm({ ...form, extraKmRate: value })} disabled={off} step={0.5} />
        <Num label="Extra hour ₹" value={form.extraHourRate} onChange={value => setForm({ ...form, extraHourRate: value })} disabled={off} />
        <Num label="Airport fare ₹" value={form.airport.fare} onChange={setGroup('airport', 'fare')} disabled={off} />
        <Num label="Airport incl. km" value={form.airport.includedKm} onChange={setGroup('airport', 'includedKm')} disabled={off} />
      </Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Outstation</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(5, 1fr)' }, gap: 1.5 }}>
        <Num label="₹ per km" value={form.outstation.perKm} onChange={setGroup('outstation', 'perKm')} disabled={off} step={0.5} />
        <Num label="Min km / day" value={form.outstation.minKmPerDay} onChange={setGroup('outstation', 'minKmPerDay')} disabled={off} />
        <Num label="One-way min km" value={form.outstation.oneWayMinKm} onChange={setGroup('outstation', 'oneWayMinKm')} disabled={off} />
        <Num label="Driver ₹ / day" value={form.outstation.driverAllowancePerDay} onChange={setGroup('outstation', 'driverAllowancePerDay')} disabled={off} />
        <Num label="Night charge ₹" value={form.outstation.nightCharge} onChange={setGroup('outstation', 'nightCharge')} disabled={off} />
      </Box>
      {dirty && editable && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
          <Button onClick={() => setForm(item)}>Discard</Button>
          <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </Stack>
      )}
    </Card>
  );
}

// Instant ride fares, only while rides are switched on.
function RideFares({ editable }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['admin', 'fares'], queryFn: () => get('/admin/fares') });
  const save = useMutation({
    mutationFn: ({ key, body }) => patch(`/admin/fares/${key}`, body),
    onSuccess: () => { toast.success('Saved'); queryClient.invalidateQueries({ queryKey: ['admin', 'fares'] }); },
    onError: error => toast.error(error.message),
  });
  return (
    <Card sx={{ p: 2.5 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>Instant ride fares</Typography>
      <Stack spacing={1}>
        {(data?.items || []).map(item => (
          <Stack key={item.key} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Typography sx={{ width: 80 }}>{item.name}</Typography>
            {['baseFare', 'perKm', 'perMin', 'minFare'].map(field => (
              <TextField key={field} size="small" type="number" label={field} defaultValue={item[field]} disabled={!editable} sx={{ width: 100 }}
                onBlur={e => Number(e.target.value) !== item[field] && save.mutate({ key: item.key, body: { [field]: Number(e.target.value) } })} />
            ))}
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

export default function Pricing() {
  const { isSuper } = useAdminRole();
  const { ridesEnabled } = useMeta();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'rates'], queryFn: () => get('/admin/rates') });
  return (
    <>
      <AdminHeader title="Pricing" subtitle="Rate cards for each car class. GST, cancellation rules and booking windows are in Settings." />
      <Alert severity="info" sx={{ mb: 2 }}>
        Existing bookings keep the price they were booked at. {isSuper ? '' : 'Only super admins can change rates.'}
      </Alert>
      {isLoading ? <CardSkeleton rows={4} height={200} /> : (
        <Stack spacing={2}>
          {data.items.map(item => <RateCard key={item._id} item={item} packages={data.packages} editable={isSuper} />)}
          {ridesEnabled && <RideFares editable={isSuper} />}
        </Stack>
      )}
    </>
  );
}
