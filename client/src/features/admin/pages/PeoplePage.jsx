import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { del, fieldErrors, get, patch, post } from '../../../shared/api/apiClient';
import { dateOnly } from '../../../shared/utils/format';
import { useMeta } from '../../../shared/api/useAppConfig';
import { useAuth } from '../../../app/providers/AuthProvider';
import { useToast } from '../../../app/providers/ToastProvider';
import { AdminHeader, DataTable, ExpiryChip, toDateInput, useAdminRole } from '../components/adminShared';

const META = {
  customer: { path: 'customers', title: 'Customers', subtitle: 'Rider accounts. Suspend to block sign-in immediately.', statuses: ['active', 'suspended'] },
  driver: { path: 'drivers', title: 'Chauffeurs', subtitle: 'Verify applications and keep licences and police verification up to date. Non-compliant chauffeurs cannot be assigned.', statuses: ['pending', 'approved', 'rejected', 'suspended'] },
  admin: { path: 'admins', title: 'Admin team', subtitle: 'Super admins manage everything; operations runs bookings and the fleet; support handles tickets with read-only access.', statuses: ['active', 'suspended'] },
};
const STATUS_COLOR = { active: 'success', approved: 'success', pending: 'warning', rejected: 'default', suspended: 'error' };
const ADMIN_ROLES = [['super', 'Super admin'], ['operations', 'Operations'], ['support', 'Support']];
const POLICE = { verified: 'success', pending: 'warning', failed: 'error' };

// Licence expiry, police verification and emergency contact for a chauffeur.
function ComplianceDialog({ driver, onClose }) {
  const [form, setForm] = useState(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    if (driver) {
      setForm({
        drivingLicenseNumber: driver.drivingLicenseNumber || '',
        licenseExpiry: toDateInput(driver.licenseExpiry),
        police: driver.policeVerification?.status || 'pending',
        policeReference: driver.policeVerification?.reference || '',
        contactName: driver.emergencyContact?.name || '',
        contactPhone: driver.emergencyContact?.phone || '',
      });
    }
  }, [driver]);
  const save = useMutation({
    mutationFn: () => patch(`/admin/drivers/${driver._id}`, {
      drivingLicenseNumber: form.drivingLicenseNumber,
      licenseExpiry: form.licenseExpiry || '',
      policeVerification: { status: form.police, reference: form.policeReference },
      emergencyContact: { name: form.contactName, phone: form.contactPhone },
    }),
    onSuccess: () => { toast.success('Compliance details saved'); queryClient.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
    onError: error => toast.error(error.message),
  });
  if (!driver || !form) return null;
  const set = name => e => setForm({ ...form, [name]: e.target.value });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Compliance: {driver.fullName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField size="small" label="Driving licence number" value={form.drivingLicenseNumber} onChange={set('drivingLicenseNumber')} />
            <TextField size="small" type="date" label="Licence valid until" value={form.licenseExpiry} onChange={set('licenseExpiry')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select size="small" label="Police verification" value={form.police} onChange={set('police')}>
              <MenuItem value="pending">Pending</MenuItem><MenuItem value="verified">Verified</MenuItem><MenuItem value="failed">Failed</MenuItem>
            </TextField>
            <TextField size="small" label="Verification reference" value={form.policeReference} onChange={set('policeReference')} />
            <TextField size="small" label="Emergency contact" value={form.contactName} onChange={set('contactName')} />
            <TextField size="small" label="Emergency phone" value={form.contactPhone} onChange={set('contactPhone')} />
          </Box>
          <Alert severity="info">A chauffeur can be assigned only with a licence valid through the trip and a verified police check.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function CreateDialog({ role, open, onClose }) {
  const { ridesEnabled } = useMeta();
  const empty = { fullName: '', username: '', email: '', phoneNumber: '', password: '', drivingLicenseNumber: '', dob: '', licenseExpiry: '', adminRole: 'operations', vehicle: { category: 'mini', make: '', model: '', plateNumber: '' } };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (open) { setForm(empty); setErrors({}); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = useMutation({
    mutationFn: () => {
      const { drivingLicenseNumber, dob, vehicle, licenseExpiry, adminRole, ...base } = form;
      if (role === 'driver') return post(`/admin/${META[role].path}`, { ...base, drivingLicenseNumber, dob, ...(licenseExpiry ? { licenseExpiry } : {}), ...(ridesEnabled ? { vehicle } : {}) });
      return post(`/admin/${META[role].path}`, role === 'admin' ? { ...base, adminRole } : base);
    },
    onSuccess: () => { toast.success('Account created'); queryClient.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
    onError: err => { setErrors(fieldErrors(err)); setError(err.message); },
  });
  const tf = (name, label, props) => <TextField size="small" label={label} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} error={Boolean(errors[name])} helperText={errors[name]} {...props} />;
  const vf = (name, label) => <TextField size="small" label={label} value={form.vehicle[name]} onChange={e => setForm({ ...form, vehicle: { ...form.vehicle, [name]: e.target.value } })} error={Boolean(errors[`vehicle.${name}`])} helperText={errors[`vehicle.${name}`]} />;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New {role === 'customer' ? 'customer' : role === 'driver' ? 'chauffeur' : 'admin'}</DialogTitle>
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
          {role === 'admin' && (
            <TextField select size="small" label="Role" value={form.adminRole} onChange={e => setForm({ ...form, adminRole: e.target.value })}>
              {ADMIN_ROLES.map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
            </TextField>
          )}
          {role === 'driver' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                {tf('drivingLicenseNumber', 'Licence number')}
                {tf('dob', 'Date of birth', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
                {tf('licenseExpiry', 'Licence valid until', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
              </Box>
              {ridesEnabled && <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField select size="small" label="Category" value={form.vehicle.category} onChange={e => setForm({ ...form, vehicle: { ...form.vehicle, category: e.target.value } })}>
                  {['auto', 'mini', 'sedan', 'suv'].map(c => <MenuItem key={c} value={c}>{c.toUpperCase()}</MenuItem>)}
                </TextField>
                {vf('plateNumber', 'Plate number')}
                {vf('make', 'Make')}
                {vf('model', 'Model')}
              </Box>}
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
  const { ridesEnabled } = useMeta();
  const { canOperate } = useAdminRole();
  const [compliance, setCompliance] = useState(null);
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
    if (!canOperate) return null;
    const self = role === 'admin' && row._id === account._id;
    const set = next => update.mutate({ id: row._id, body: { status: next } });
    return (
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
        {role === 'driver' && <Button size="small" onClick={() => setCompliance(row)}>Compliance</Button>}
        {role === 'driver' && row.status === 'pending' && <><Button size="small" variant="contained" onClick={() => set('approved')}>Approve</Button><Button size="small" onClick={() => set('rejected')}>Reject</Button></>}
        {role === 'admin' && !self && (
          <TextField select size="small" value={row.adminRole || 'super'} onChange={e => update.mutate({ id: row._id, body: { adminRole: e.target.value } })} sx={{ minWidth: 130 }} aria-label="Admin role">
            {ADMIN_ROLES.map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
          </TextField>
        )}
        {!self && ['active', 'approved'].includes(row.status) && <Button size="small" color="error" onClick={() => set('suspended')}>Suspend</Button>}
        {row.status === 'suspended' && <Button size="small" onClick={() => set(role === 'driver' ? 'approved' : 'active')}>Reinstate</Button>}
        {!self && <Button size="small" color="error" onClick={() => { if (window.confirm(`Delete ${row.fullName}? This cannot be undone.`)) remove.mutate(row._id); }}>Delete</Button>}
      </Stack>
    );
  };

  const columns = [
    { key: 'fullName', label: 'Name', render: row => <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>{row.fullName}</Typography><Typography variant="caption" color="text.secondary">@{row.username}</Typography></Box> },
    { key: 'contact', label: 'Contact', render: row => <Box><Typography variant="body2">{row.email}</Typography><Typography variant="caption" color="text.secondary">{row.phoneNumber}</Typography></Box> },
    ...(role === 'admin' ? [{ key: 'adminRole', label: 'Role', render: row => <Chip size="small" variant="outlined" label={ADMIN_ROLES.find(([key]) => key === (row.adminRole || 'super'))?.[1]} /> }] : []),
    ...(role === 'driver' ? [
      { key: 'licenceExpiry', label: 'Licence', render: row => <Stack spacing={0.5}><Typography variant="caption">{row.drivingLicenseNumber}</Typography><ExpiryChip date={row.licenseExpiry} /></Stack> },
      { key: 'police', label: 'Police check', render: row => <Chip size="small" color={POLICE[row.policeVerification?.status || 'pending']} label={row.policeVerification?.status || 'pending'} /> },
      ...(ridesEnabled ? [{ key: 'vehicle', label: 'Vehicle', render: row => <Box><Typography variant="body2">{[row.vehicle?.make, row.vehicle?.model].filter(Boolean).join(' ') || '—'}</Typography><Typography variant="caption" color="text.secondary">{row.vehicle?.category?.toUpperCase()} · {row.vehicle?.plateNumber}</Typography></Box> }] : []),
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
        action={canOperate && <Button variant="contained" onClick={() => setCreating(true)}>Add {role === 'customer' ? 'customer' : role === 'driver' ? 'chauffeur' : 'admin'}</Button>}
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
      <ComplianceDialog driver={compliance} onClose={() => setCompliance(null)} />
    </>
  );
}
