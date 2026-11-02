import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import CarImage from '../../components/CarImage';
import { del, get, patch, post } from '../../lib/api';
import { money } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader, DataTable } from './shared';

const SHAPES = [['/cars/hatch.svg', 'Hatchback illustration'], ['/cars/sedan.svg', 'Sedan illustration'], ['/cars/suv.svg', 'SUV illustration'], ['/cars/mpv.svg', 'MPV illustration']];
const EMPTY = { name: '', image: '/cars/sedan.svg', capacity: 5, fuelType: 'Petrol', transmission: 'Manual', rentPerHour: 200, active: true };

function CarDialog({ car, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (car) { setForm(car._id ? { ...EMPTY, ...car } : EMPTY); setError(''); } }, [car]);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, image: form.image, capacity: Number(form.capacity), fuelType: form.fuelType, transmission: form.transmission, rentPerHour: Number(form.rentPerHour), active: form.active };
      return car._id ? patch(`/admin/cars/${car._id}`, body) : post('/admin/cars', body);
    },
    onSuccess: () => { toast.success('Car saved'); queryClient.invalidateQueries({ queryKey: ['admin', 'cars'] }); queryClient.invalidateQueries({ queryKey: ['cars'] }); onClose(); },
    onError: err => setError(err.message),
  });
  const set = name => e => setForm({ ...form, [name]: e.target.value });
  return (
    <Dialog open={Boolean(car)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{car?._id ? 'Edit car' : 'Add a rental car'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderRadius: 3, bgcolor: 'action.hover' }}><CarImage car={form} width={220} /></Box>
          <TextField size="small" label="Name" value={form.name} onChange={set('name')} />
          <TextField size="small" label="Image" value={form.image} onChange={set('image')} helperText="An https:// photo URL, or pick an illustration below" />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {SHAPES.map(([value, label]) => <Chip key={value} label={label} onClick={() => setForm({ ...form, image: value })} color={form.image === value ? 'primary' : 'default'} />)}
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
            <TextField size="small" type="number" label="Seats" value={form.capacity} onChange={set('capacity')} />
            <TextField size="small" type="number" label="₹ per hour" value={form.rentPerHour} onChange={set('rentPerHour')} />
            <TextField select size="small" label="Fuel" value={form.fuelType} onChange={set('fuelType')}>
              {['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'].map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Gearbox" value={form.transmission || 'Manual'} onChange={set('transmission')}>
              <MenuItem value="Manual">Manual</MenuItem><MenuItem value="Automatic">Automatic</MenuItem>
            </TextField>
          </Box>
          <FormControlLabel control={<Switch checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />} label="Available for booking" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Fleet() {
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'cars'], queryFn: () => get('/admin/cars') });
  const remove = useMutation({
    mutationFn: id => del(`/admin/cars/${id}`),
    onSuccess: result => { toast.success(result.retired ? 'Car has bookings, so it was retired instead' : 'Car deleted'); queryClient.invalidateQueries({ queryKey: ['admin', 'cars'] }); },
    onError: error => toast.error(error.message),
  });
  const columns = [
    { key: 'car', label: 'Car', render: row => <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><CarImage car={row} width={80} /><Typography variant="body2" sx={{ fontWeight: 600 }}>{row.name}</Typography></Stack> },
    { key: 'capacity', label: 'Seats' },
    { key: 'fuelType', label: 'Fuel' },
    { key: 'rentPerHour', label: 'Rate', render: row => `${money(row.rentPerHour)}/h` },
    { key: 'active', label: 'Status', render: row => <Chip size="small" color={row.active ? 'success' : 'default'} label={row.active ? 'Available' : 'Retired'} /> },
    { key: 'actions', label: '', align: 'right', render: row => (
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setEditing(row)}>Edit</Button>
        {row.active && <Button size="small" color="error" onClick={() => { if (window.confirm(`Remove ${row.name}?`)) remove.mutate(row._id); }}>Remove</Button>}
      </Stack>
    ) },
  ];
  return (
    <>
      <AdminHeader title="Rental fleet" subtitle="Cars available for hourly rentals. Cars with booking history are retired, not deleted." action={<Button variant="contained" onClick={() => setEditing({})}>Add car</Button>} />
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} empty="No cars yet." />
      <CarDialog car={editing} onClose={() => setEditing(null)} />
    </>
  );
}
