// Fleet owners: the company itself and partners whose cars we run, with their
// agreement terms. Managed by operations; there is no owner login in Phase 1.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { fieldErrors, get, patch, post } from '../../../shared/api/apiClient';
import { useToast } from '../../../app/providers/ToastProvider';
import { AdminHeader, DataTable, ExpiryChip, toDateInput, useAdminRole } from '../components/adminShared';

const EMPTY = { name: '', type: 'partner', phone: '', email: '', address: '', agreement: { reference: '', startsOn: '', endsOn: '', commissionPercent: 0, notes: '' } };

function OwnerDialog({ owner, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    if (!owner) return;
    setError('');
    setErrors({});
    setForm(owner._id ? {
      ...EMPTY, ...owner,
      phone: owner.phone || '', email: owner.email || '', address: owner.address || '',
      agreement: { ...EMPTY.agreement, ...owner.agreement, startsOn: toDateInput(owner.agreement?.startsOn), endsOn: toDateInput(owner.agreement?.endsOn), reference: owner.agreement?.reference || '', notes: owner.agreement?.notes || '' },
    } : EMPTY);
  }, [owner]);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name, type: form.type, phone: form.phone, email: form.email, address: form.address,
        agreement: { ...form.agreement, commissionPercent: Number(form.agreement.commissionPercent || 0) },
      };
      return owner._id ? patch(`/admin/owners/${owner._id}`, body) : post('/admin/owners', body);
    },
    onSuccess: () => { toast.success('Owner saved'); queryClient.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
    onError: err => { setError(err.message); setErrors(fieldErrors(err)); },
  });
  const set = name => e => setForm({ ...form, [name]: e.target.value });
  const setAgreement = name => e => setForm({ ...form, agreement: { ...form.agreement, [name]: e.target.value } });
  return (
    <Dialog open={Boolean(owner)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{owner?._id ? `Edit ${owner.name}` : 'Add a fleet owner'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2 }}>
            <TextField size="small" label="Name" value={form.name} onChange={set('name')} />
            <TextField select size="small" label="Type" value={form.type} onChange={set('type')}>
              <MenuItem value="company">Company-owned</MenuItem><MenuItem value="partner">Partner</MenuItem>
            </TextField>
            <TextField size="small" label="Phone" value={form.phone} onChange={set('phone')} error={Boolean(errors.phone)} helperText={errors.phone} />
            <TextField size="small" label="Email" value={form.email} onChange={set('email')} error={Boolean(errors.email)} helperText={errors.email} />
          </Box>
          <TextField size="small" label="Address" value={form.address} onChange={set('address')} />
          <Typography variant="subtitle2">Agreement</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
            <TextField size="small" label="Reference" value={form.agreement.reference} onChange={setAgreement('reference')} />
            <TextField size="small" type="date" label="Starts" value={form.agreement.startsOn} onChange={setAgreement('startsOn')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Ends" value={form.agreement.endsOn} onChange={setAgreement('endsOn')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="number" label="Owner share %" value={form.agreement.commissionPercent} onChange={setAgreement('commissionPercent')} slotProps={{ htmlInput: { min: 0, max: 100 } }} />
          </Box>
          <TextField size="small" label="Notes" multiline minRows={2} value={form.agreement.notes} onChange={setAgreement('notes')} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending || form.name.trim().length < 2}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function FleetOwnersPage() {
  const { canOperate } = useAdminRole();
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'owners'], queryFn: () => get('/admin/owners') });
  const toggle = useMutation({
    mutationFn: owner => patch(`/admin/owners/${owner._id}`, { active: !owner.active }),
    onSuccess: () => { toast.success('Saved'); queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: error => toast.error(error.message),
  });
  const columns = [
    { key: 'name', label: 'Owner', render: row => <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.type === 'company' ? 'Company-owned' : 'Partner'}</Typography></Box> },
    { key: 'contact', label: 'Contact', render: row => <Box><Typography variant="body2">{row.phone || '—'}</Typography><Typography variant="caption" color="text.secondary">{row.email}</Typography></Box> },
    { key: 'cars', label: 'Active cars', render: row => row.cars },
    { key: 'share', label: 'Owner share', render: row => (row.type === 'partner' ? `${row.agreement?.commissionPercent ?? 0}%` : '—') },
    { key: 'agreement', label: 'Agreement', render: row => (row.type === 'partner' ? <Stack spacing={0.5}><Typography variant="caption">{row.agreement?.reference || 'No reference'}</Typography><ExpiryChip label="Ends" date={row.agreement?.endsOn} /></Stack> : '—') },
    { key: 'status', label: 'Status', render: row => <Chip size="small" color={row.active ? 'success' : 'default'} label={row.active ? 'Active' : 'Inactive'} /> },
    { key: 'actions', label: '', align: 'right', render: row => canOperate && (
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setEditing(row)}>Edit</Button>
        <Button size="small" color={row.active ? 'error' : 'primary'} onClick={() => toggle.mutate(row)}>{row.active ? 'Deactivate' : 'Activate'}</Button>
      </Stack>
    ) },
  ];
  return (
    <>
      <AdminHeader title="Fleet owners" subtitle="Who owns each car, and the agreement with partner owners." action={canOperate && <Button variant="contained" onClick={() => setEditing({})}>Add owner</Button>} />
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} empty="No owners yet. Add your company first, then partners." />
      <OwnerDialog owner={editing} onClose={() => setEditing(null)} />
    </>
  );
}
