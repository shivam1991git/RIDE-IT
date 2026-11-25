// Fleet: cars, their owners and compliance documents. A car with a missing or
// expired document is never offered to customers or assigned to a trip.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import CarImage from '../../components/CarImage';
import { del, fieldErrors, get, patch, post } from '../../lib/api';
import { VEHICLE_CLASSES } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader, DataTable, ExpiryChip, toDateInput, useAdminRole } from './shared';

const SHAPES = [['/cars/hatch.svg', 'Hatchback'], ['/cars/sedan.svg', 'Sedan'], ['/cars/compact-suv.svg', 'Compact SUV'], ['/cars/suv.svg', 'SUV'], ['/cars/mpv.svg', 'MUV']];
const DOCS = [['rc', 'RC (registration)'], ['insurance', 'Insurance'], ['permit', 'Permit'], ['fitness', 'Fitness certificate'], ['puc', 'PUC certificate']];
const emptyDocs = () => Object.fromEntries(DOCS.map(([key]) => [key, { number: '', expiresOn: '' }]));
const EMPTY = { name: '', image: '/cars/sedan.svg', category: 'sedan', registrationNumber: '', capacity: 4, luggage: 2, ac: true, fuelType: 'Petrol', transmission: 'Manual', owner: '', maintenance: false, active: true, documents: emptyDocs() };

function fromCar(car) {
  const documents = emptyDocs();
  for (const [key] of DOCS) {
    documents[key] = { number: car.documents?.[key]?.number || '', expiresOn: toDateInput(car.documents?.[key]?.expiresOn) };
  }
  return { ...EMPTY, ...car, owner: car.owner?._id || car.owner || '', registrationNumber: car.registrationNumber || '', documents };
}

function CarDialog({ car, owners, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (car) { setForm(car._id ? fromCar(car) : EMPTY); setError(''); setErrors({}); setTab(0); } }, [car]);
  const save = useMutation({
    mutationFn: () => {
      const documents = Object.fromEntries(DOCS.map(([key]) => [key, { number: form.documents[key].number, expiresOn: form.documents[key].expiresOn || '' }]));
      const body = {
        name: form.name, image: form.image, category: form.category, capacity: Number(form.capacity), luggage: Number(form.luggage), ac: form.ac,
        fuelType: form.fuelType, transmission: form.transmission, owner: form.owner || null, maintenance: form.maintenance, active: form.active, documents,
        ...(form.registrationNumber ? { registrationNumber: form.registrationNumber } : {}),
      };
      return car._id ? patch(`/admin/cars/${car._id}`, body) : post('/admin/cars', body);
    },
    onSuccess: () => { toast.success('Car saved'); queryClient.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
    onError: err => { setError(err.message); setErrors(fieldErrors(err)); },
  });
  const set = name => e => setForm({ ...form, [name]: e.target.value });
  const setDoc = (key, field) => e => setForm({ ...form, documents: { ...form.documents, [key]: { ...form.documents[key], [field]: e.target.value } } });
  return (
    <Dialog open={Boolean(car)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{car?._id ? `Edit ${car.name}` : 'Add a car'}</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab label="Details" />
          <Tab label="Documents" />
        </Tabs>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {tab === 0 ? (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderRadius: 3, bgcolor: 'action.hover' }}><CarImage car={form} width={200} /></Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField size="small" label="Name (make and model)" value={form.name} onChange={set('name')} />
              <TextField size="small" label="Registration number" placeholder="UP65 AB 1234" value={form.registrationNumber} onChange={set('registrationNumber')} error={Boolean(errors.registrationNumber)} helperText={errors.registrationNumber} />
              <TextField select size="small" label="Class (sets the price)" value={form.category} onChange={set('category')}>
                {Object.entries(VEHICLE_CLASSES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Owner" value={form.owner} onChange={set('owner')}>
                <MenuItem value="">Not set</MenuItem>
                {owners.map(owner => <MenuItem key={owner._id} value={owner._id} disabled={!owner.active}>{owner.name} ({owner.type})</MenuItem>)}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
              <TextField size="small" type="number" label="Seats" value={form.capacity} onChange={set('capacity')} />
              <TextField size="small" type="number" label="Bags" value={form.luggage} onChange={set('luggage')} />
              <TextField select size="small" label="Fuel" value={form.fuelType} onChange={set('fuelType')}>
                {['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'].map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Gearbox" value={form.transmission || 'Manual'} onChange={set('transmission')}>
                <MenuItem value="Manual">Manual</MenuItem><MenuItem value="Automatic">Automatic</MenuItem>
              </TextField>
            </Box>
            <TextField size="small" label="Image" value={form.image} onChange={set('image')} helperText="An https:// photo URL, or pick an illustration" />
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {SHAPES.map(([value, label]) => <Chip key={value} label={label} onClick={() => setForm({ ...form, image: value })} color={form.image === value ? 'primary' : 'default'} />)}
            </Stack>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
              <FormControlLabel control={<Switch checked={form.ac} onChange={e => setForm({ ...form, ac: e.target.checked })} />} label="AC" />
              <FormControlLabel control={<Switch checked={form.maintenance} onChange={e => setForm({ ...form, maintenance: e.target.checked })} />} label="In maintenance" />
              <FormControlLabel control={<Switch checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />} label="In the fleet" />
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">All five are required before the car can be booked. A document that expires before a trip ends blocks that trip.</Typography>
            {DOCS.map(([key, label]) => (
              <Box key={key} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' }, gap: 1.5 }}>
                <TextField size="small" label={`${label} number`} value={form.documents[key].number} onChange={setDoc(key, 'number')} />
                <TextField size="small" type="date" label={key === 'rc' ? 'Valid until (optional)' : 'Valid until'} value={form.documents[key].expiresOn} onChange={setDoc(key, 'expiresOn')} slotProps={{ inputLabel: { shrink: true } }} />
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending || form.name.trim().length < 2}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Fleet() {
  const { canOperate } = useAdminRole();
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'cars'], queryFn: () => get('/admin/cars') });
  const owners = useQuery({ queryKey: ['admin', 'owners'], queryFn: () => get('/admin/owners') });
  const update = useMutation({
    mutationFn: ({ id, body }) => patch(`/admin/cars/${id}`, body),
    onSuccess: () => { toast.success('Saved'); queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: error => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: id => del(`/admin/cars/${id}`),
    onSuccess: result => { toast.success(result.retired ? 'Car has booking history, so it was retired' : 'Car deleted'); queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: error => toast.error(error.message),
  });
  const items = (data?.items || []).filter(car => (filter === 'all' ? car.active : filter === 'attention' ? car.active && car.issue : !car.active));
  const attention = (data?.items || []).filter(car => car.active && car.issue).length;

  const columns = [
    { key: 'car', label: 'Car', render: row => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <CarImage car={row} width={72} />
        <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{row.name}</Typography><Typography variant="caption" sx={{ fontFamily: 'ui-monospace, monospace' }}>{row.registrationNumber || 'No registration'}</Typography></Box>
      </Stack>
    ) },
    { key: 'class', label: 'Class', render: row => `${VEHICLE_CLASSES[row.category] || row.category} · ${row.capacity} seats` },
    { key: 'owner', label: 'Owner', render: row => row.owner?.name || '—' },
    { key: 'docs', label: 'Documents', render: row => (
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, maxWidth: 360 }}>
        {DOCS.filter(([key]) => key !== 'rc').map(([key, label]) => <ExpiryChip key={key} label={label.split(' ')[0]} date={row.documents?.[key]?.expiresOn} missing="missing" />)}
      </Stack>
    ) },
    { key: 'status', label: 'Status', render: row => (
      <Box>
        <Chip size="small" color={!row.active ? 'default' : row.maintenance ? 'warning' : row.issue ? 'error' : 'success'} label={!row.active ? 'Retired' : row.maintenance ? 'Maintenance' : row.issue ? 'Blocked' : 'Bookable'} />
        {row.active && row.issue && !row.maintenance && <Typography variant="caption" color="error.main" sx={{ display: 'block', maxWidth: 220 }}>{row.issue}</Typography>}
      </Box>
    ) },
    { key: 'actions', label: '', align: 'right', render: row => canOperate && (
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setEditing(row)}>Edit</Button>
        {row.active && <Button size="small" onClick={() => update.mutate({ id: row._id, body: { maintenance: !row.maintenance } })}>{row.maintenance ? 'Back on road' : 'Maintenance'}</Button>}
        {row.active && <Button size="small" color="error" onClick={() => { if (window.confirm(`Remove ${row.name} from the fleet?`)) remove.mutate(row._id); }}>Retire</Button>}
      </Stack>
    ) },
  ];
  return (
    <>
      <AdminHeader title="Fleet" subtitle="Cars, owners and compliance documents. Cars with lapsed papers are blocked automatically." action={canOperate && <Button variant="contained" onClick={() => setEditing({})}>Add car</Button>} />
      <Tabs value={filter} onChange={(e, value) => setFilter(value)} sx={{ mb: 2 }}>
        <Tab value="all" label="Active fleet" />
        <Tab value="attention" label={`Needs attention (${attention})`} />
        <Tab value="retired" label="Retired" />
      </Tabs>
      <DataTable columns={columns} rows={items} loading={isLoading} empty={filter === 'attention' ? 'Every car is bookable.' : 'No cars here.'} />
      <CarDialog car={editing} owners={owners.data?.items || []} onClose={() => setEditing(null)} />
    </>
  );
}
