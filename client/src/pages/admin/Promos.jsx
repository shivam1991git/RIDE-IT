import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import { fieldErrors, get, patch, post } from '../../lib/api';
import { dateTime, money, toLocalInput } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader, DataTable } from './shared';

const CATEGORIES = ['auto', 'mini', 'sedan', 'suv'];

const blank = () => ({
  code: '', description: '', kind: 'percent', value: 20, maxDiscount: 100, minFare: 0, categories: [],
  validUntil: toLocalInput(new Date(Date.now() + 30 * 86400000)), usageLimit: 0, perUserLimit: 1, public: true, active: true,
});

function describe(promo) {
  const off = promo.kind === 'percent' ? `${promo.value}%${promo.maxDiscount ? ` (max ${money(promo.maxDiscount)})` : ''}` : money(promo.value);
  return `${off} off${promo.minFare ? ` · min ${money(promo.minFare)}` : ''}`;
}

function status(promo) {
  if (!promo.active) return ['Paused', 'default'];
  if (new Date(promo.validUntil) < new Date()) return ['Expired', 'default'];
  if (promo.usageLimit && promo.usedCount >= promo.usageLimit) return ['Used up', 'warning'];
  return ['Live', 'success'];
}

function PromoForm({ initial, onClose }) {
  const editing = Boolean(initial?._id);
  const [form, setForm] = useState(() => (editing
    ? { ...initial, validUntil: toLocalInput(initial.validUntil) }
    : blank()));
  const [errors, setErrors] = useState({});
  const queryClient = useQueryClient();
  const toast = useToast();
  const set = (key, cast = v => v) => e => setForm({ ...form, [key]: cast(e.target.value) });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        description: form.description,
        kind: form.kind,
        value: Number(form.value),
        maxDiscount: Number(form.maxDiscount) || 0,
        minFare: Number(form.minFare) || 0,
        categories: form.categories,
        validUntil: new Date(form.validUntil).toISOString(),
        usageLimit: Number(form.usageLimit) || 0,
        perUserLimit: Number(form.perUserLimit) || 1,
        public: form.public,
        active: form.active,
      };
      return editing ? patch(`/admin/promos/${initial._id}`, body) : post('/admin/promos', { ...body, code: form.code });
    },
    onSuccess: () => {
      toast.success(editing ? 'Promo updated' : 'Promo created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'promos'] });
      onClose();
    },
    onError: error => { setErrors(fieldErrors(error)); toast.error(error.message); },
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? `Edit ${initial.code}` : 'New promo code'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Code"
            value={form.code}
            disabled={editing}
            onChange={e => setForm({ ...form, code: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 20) })}
            error={Boolean(errors.code)}
            helperText={errors.code || (editing ? 'Codes cannot be changed once created' : '3–20 letters or digits, e.g. WELCOME50')}
          />
          <TextField label="Description (shown to riders)" value={form.description} onChange={set('description')} slotProps={{ htmlInput: { maxLength: 160 } }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            <TextField select label="Type" value={form.kind} onChange={set('kind')}>
              <MenuItem value="percent">Percent off</MenuItem>
              <MenuItem value="flat">Flat ₹ off</MenuItem>
            </TextField>
            <TextField type="number" label={form.kind === 'percent' ? 'Percent' : 'Rupees'} value={form.value} onChange={set('value')} slotProps={{ htmlInput: { min: 1, max: form.kind === 'percent' ? 90 : 5000 } }} />
            <TextField type="number" label="Max discount ₹" value={form.maxDiscount} onChange={set('maxDiscount')} disabled={form.kind === 'flat'} helperText="0 = no cap" slotProps={{ htmlInput: { min: 0 } }} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            <TextField type="number" label="Minimum fare ₹" value={form.minFare} onChange={set('minFare')} slotProps={{ htmlInput: { min: 0 } }} />
            <TextField type="number" label="Total uses" value={form.usageLimit} onChange={set('usageLimit')} helperText="0 = unlimited" slotProps={{ htmlInput: { min: 0 } }} />
            <TextField type="number" label="Uses per rider" value={form.perUserLimit} onChange={set('perUserLimit')} slotProps={{ htmlInput: { min: 1, max: 20 } }} />
          </Box>
          <TextField
            type="datetime-local"
            label="Valid until"
            value={form.validUntil}
            onChange={set('validUntil')}
            error={Boolean(errors.validUntil)}
            helperText={errors.validUntil}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Ride types (none selected = all)</Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {CATEGORIES.map(category => {
                const on = form.categories.includes(category);
                return (
                  <Chip
                    key={category}
                    label={category.toUpperCase()}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => setForm({ ...form, categories: on ? form.categories.filter(c => c !== category) : [...form.categories, category] })}
                  />
                );
              })}
            </Stack>
          </Box>
          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Switch checked={form.public} onChange={e => setForm({ ...form, public: e.target.checked })} />} label="Show in Offers" />
            <FormControlLabel control={<Switch checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />} label="Active" />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending || (!editing && form.code.length < 3)}>{editing ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Promos() {
  const [editing, setEditing] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'promos'], queryFn: () => get('/admin/promos') });
  const columns = [
    { key: 'code', label: 'Code', render: row => <Chip size="small" label={row.code} sx={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }} /> },
    { key: 'offer', label: 'Offer', render: row => <Typography variant="body2">{describe(row)}</Typography> },
    { key: 'categories', label: 'Rides', render: row => (row.categories?.length ? row.categories.join(', ') : 'All') },
    { key: 'used', label: 'Used', render: row => `${row.usedCount}${row.usageLimit ? ` / ${row.usageLimit}` : ''}` },
    { key: 'validUntil', label: 'Valid until', render: row => dateTime(row.validUntil) },
    { key: 'status', label: 'Status', render: row => { const [label, color] = status(row); return <Chip size="small" color={color} label={label} />; } },
    { key: 'action', label: '', align: 'right', render: row => <Button size="small" onClick={() => setEditing(row)}>Edit</Button> },
  ];
  return (
    <>
      <AdminHeader
        title="Promo codes"
        subtitle="Discounts riders apply at booking. Uses are given back automatically when a ride is cancelled or no driver is found."
        action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({})}>New promo</Button>}
      />
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} empty="No promo codes yet. Create one to run an offer." />
      {editing && <PromoForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
