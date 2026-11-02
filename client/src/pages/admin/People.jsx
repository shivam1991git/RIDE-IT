import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { del, fieldErrors, get, patch, post } from '../../lib/api';
import { dateOnly } from '../../lib/format';
import { useAuth } from '../../providers/AuthProvider';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader, DataTable } from './shared';

const META = {
  customer: { path: 'customers', title: 'Customers', subtitle: 'Rider accounts. Suspend to block sign-in immediately.', statuses: ['active', 'suspended'] },
  driver: { path: 'drivers', title: 'Drivers', subtitle: 'Verify new applications and manage driver access.', statuses: ['pending', 'approved', 'rejected', 'suspended'] },
  admin: { path: 'admins', title: 'Admin team', subtitle: 'People with access to this console.', statuses: ['active', 'suspended'] },
};
const STATUS_COLOR = { active: 'success', approved: 'success', pending: 'warning', rejected: 'default', suspended: 'error' };

function CreateDialog({ role, open, onClose }) {
  const empty = { fullName: '', username: '', email: '', phoneNumber: '', password: '', drivingLicenseNumber: '', dob: '', vehicle: { category: 'mini', make: '', model: '', plateNumber: '' } };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (open) { setForm(empty); setErrors({}); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = useMutation({
    mutationFn: () => {
      const { drivingLicenseNumber, dob, vehicle, ...base } = form;
      return post(`/admin/${META[role].path}`, role === 'driver' ? { ...form } : base);
    },
    onSuccess: () => { toast.success('Account created'); queryClient.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
    onError: err => { setErrors(fieldErrors(err)); setError(err.message); },
  });
  const tf = (name, label, props) => <TextField size="small" label={label} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} error={Boolean(errors[name])} helperText={errors[name]} {...props} />;
  const vf = (name, label) => <TextField size="small" label={label} value={form.vehicle[name]} onChange={e => setForm({ ...form, vehicle: { ...form.vehicle, [name]: e.target.value } })} error={Boolean(errors[`vehicle.${name}`])} helperText={errors[`vehicle.${name}`]} />;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New {role === 'customer' ? 'customer' : role}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {tf('fullName', 'Full name')}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {tf('username', 'Username')}
            {tf('phoneNumber', 'Mobile')}
          </Box>
          {tf('email', 'Email')}
          {tf('password', 'Temporary password', { type: 'password', autoComplete: 'new-password' })}
          {role === 'driver' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                {tf('drivingLicenseNumber', 'Licence number')}
                {tf('dob', 'Date of birth', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField select size="small" label="Category" value={form.vehicle.category} onChange={e => setForm({ ...form, vehicle: { ...form.vehicle, category: e.target.value } })}>
                  {['auto', 'mini', 'sedan', 'suv'].map(c => <MenuItem key={c} value={c}>{c.toUpperCase()}</MenuItem>)}
                </TextField>
                {vf('plateNumber', 'Plate number')}
                {vf('make', 'Make')}
                {vf('model', 'Model')}
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function People({ role }) {
  const meta = META[role];
  const { account } = useAuth();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(role === 'driver' ? 'pending' : '');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => { setStatus(role === 'driver' ? 'pending' : ''); setPage(1); setQ(''); setSearch(''); }, [role]);
  useEffect(() => {
    const id = setTimeout(() => { setSearch(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const params = new URLSearchParams({ page, limit: 20, ...(search && { q: search }), ...(status && { status }) });
  const { data, isLoading } = useQuery({ queryKey: ['admin', meta.path, params.toString()], queryFn: () => get(`/admin/${meta.path}?${params}`) });

  const update = useMutation({
    mutationFn: ({ id, body }) => patch(`/admin/${meta.path}/${id}`, body),
    onSuccess: () => { toast.success('Saved'); queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: error => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: id => del(`/admin/${meta.path}/${id}`),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: error => toast.error(error.message),
  });

  const actions = row => {
    const self = role === 'admin' && row._id === account._id;
    const set = next => update.mutate({ id: row._id, body: { status: next } });
    return (
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
        {role === 'driver' && row.status === 'pending' && <><Button size="small" variant="contained" onClick={() => set('approved')}>Approve</Button><Button size="small" onClick={() => set('rejected')}>Reject</Button></>}
        {!self && ['active', 'approved'].includes(row.status) && <Button size="small" color="error" onClick={() => set('suspended')}>Suspend</Button>}
        {row.status === 'suspended' && <Button size="small" onClick={() => set(role === 'driver' ? 'approved' : 'active')}>Reinstate</Button>}
        {!self && <Button size="small" color="error" onClick={() => { if (window.confirm(`Delete ${row.fullName}? This cannot be undone.`)) remove.mutate(row._id); }}>Delete</Button>}
      </Stack>
    );
  };

  const columns = [
    { key: 'fullName', label: 'Name', render: row => <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{row.fullName}</Typography><Typography variant="caption" color="text.secondary">@{row.username}</Typography></Box> },
    { key: 'contact', label: 'Contact', render: row => <Box><Typography variant="body2">{row.email}</Typography><Typography variant="caption" color="text.secondary">{row.phoneNumber}</Typography></Box> },
    ...(role === 'driver' ? [
      { key: 'vehicle', label: 'Vehicle', render: row => <Box><Typography variant="body2">{[row.vehicle?.make, row.vehicle?.model].filter(Boolean).join(' ') || '—'}</Typography><Typography variant="caption" color="text.secondary">{row.vehicle?.category?.toUpperCase()} · {row.vehicle?.plateNumber}</Typography></Box> },
      { key: 'licence', label: 'Licence', render: row => row.drivingLicenseNumber },
      { key: 'rating', label: 'Rating', render: row => (row.rating?.average ? `${row.rating.average}★ (${row.rating.count})` : '—') },
    ] : []),
    { key: 'status', label: 'Status', render: row => <Chip size="small" color={STATUS_COLOR[row.status] || 'default'} label={row.status || 'active'} /> },
    { key: 'createdAt', label: 'Joined', render: row => (row.createdAt ? dateOnly(row.createdAt) : '—') },
    { key: 'actions', label: '', align: 'right', render: actions },
  ];

  return (
    <>
      <AdminHeader
        title={meta.title}
        subtitle={meta.subtitle}
        action={<Button variant="contained" onClick={() => setCreating(true)}>Add {role === 'customer' ? 'customer' : role}</Button>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search name, username, email or phone" value={q} onChange={e => setQ(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} sx={{ maxWidth: 420 }} />
        <TextField select size="small" label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          {meta.statuses.map(s => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
        </TextField>
      </Stack>
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} page={page} total={data?.total} onPage={setPage} empty={status === 'pending' ? 'No applications waiting. Nice work!' : 'No accounts match.'} />
      <CreateDialog role={role} open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
