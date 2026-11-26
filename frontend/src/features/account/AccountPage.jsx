import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, Chip, Container, IconButton, List, ListItem, ListItemText, Stack, TextField, Typography,
} from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { PageHeader } from '../../shared/components/ui';
import PlaceSearch from '../../shared/components/map/PlaceSearch';
import { PasswordField, rules } from '../auth/components/authFields';
import { api, del, fieldErrors, patch, post } from '../../shared/api/apiClient';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { dateOnly } from '../../shared/utils/format';

function Section({ title, subtitle, children }) {
  return (
    <Card sx={{ p: { xs: 2.5, md: 3.5 } }}>
      <Typography variant="h5">{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      <Box sx={{ mt: 2.5 }}>{children}</Box>
    </Card>
  );
}

function ProfileForm() {
  const { account, setAccount } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: account.fullName || '', email: account.email || '', phoneNumber: account.phoneNumber || '' });
  const [errors, setErrors] = useState({});
  const save = useMutation({
    mutationFn: () => patch('/me', form),
    onSuccess: ({ account: updated }) => { setAccount(updated); setErrors({}); toast.success('Profile saved'); },
    onError: error => { setErrors(fieldErrors(error)); toast.error(error.message); },
  });
  const set = name => e => setForm({ ...form, [name]: e.target.value });
  return (
    <Stack spacing={2} component="form" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <TextField label="Full name" value={form.fullName} onChange={set('fullName')} error={Boolean(errors.fullName)} helperText={errors.fullName} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={Boolean(errors.email)} helperText={errors.email} />
        <TextField label="Mobile number" value={form.phoneNumber} onChange={set('phoneNumber')} error={Boolean(errors.phoneNumber)} helperText={errors.phoneNumber} />
      </Box>
      <TextField label="Username" value={account.username} disabled helperText="Usernames cannot be changed" />
      <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={save.isPending}>Save changes</Button>
    </Stack>
  );
}

function SavedPlaces() {
  const { account, setAccount } = useAuth();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState(null);
  const update = savedPlaces => setAccount({ ...account, savedPlaces });
  const add = useMutation({
    mutationFn: () => post('/me/places', { label, address: place.address || place.name, lat: place.lat, lng: place.lng }),
    onSuccess: result => { update(result.savedPlaces); setLabel(''); setPlace(null); toast.success('Place saved'); },
    onError: error => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: id => del(`/me/places/${id}`),
    onSuccess: result => update(result.savedPlaces),
  });
  return (
    <Stack spacing={2}>
      {account.savedPlaces?.length ? (
        <List disablePadding>
          {account.savedPlaces.map(saved => (
            <ListItem key={saved._id} disableGutters secondaryAction={<IconButton aria-label={`Remove ${saved.label}`} onClick={() => remove.mutate(saved._id)}><DeleteOutlineRounded /></IconButton>}>
              <ListItemText primary={saved.label} secondary={saved.address} />
            </ListItem>
          ))}
        </List>
      ) : <Typography variant="body2" color="text.secondary">No saved places yet. Save Home or Work to book faster.</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr auto' }, gap: 1.5, alignItems: 'start' }}>
        <TextField label="Label" placeholder="Home" value={label} onChange={e => setLabel(e.target.value)} slotProps={{ htmlInput: { maxLength: 30 } }} />
        <PlaceSearch label="Place" value={place} onChange={setPlace} allowLocate />
        <Button variant="outlined" sx={{ height: 56 }} disabled={!label.trim() || !place || add.isPending} onClick={() => add.mutate()}>Save</Button>
      </Box>
    </Stack>
  );
}

function TrustedContact() {
  const { account, setAccount } = useAuth();
  const toast = useToast();
  const current = account.trustedContact?.phone ? account.trustedContact : null;
  const [form, setForm] = useState({ name: current?.name || '', phone: current?.phone || '' });
  const [errors, setErrors] = useState({});
  const save = useMutation({
    mutationFn: () => api('/me/trusted-contact', { method: 'PUT', body: form }),
    onSuccess: ({ trustedContact }) => { setAccount({ ...account, trustedContact }); setErrors({}); toast.success('Trusted contact saved'); },
    onError: error => { setErrors(fieldErrors(error)); toast.error(error.message); },
  });
  const remove = useMutation({
    mutationFn: () => del('/me/trusted-contact'),
    onSuccess: () => { setAccount({ ...account, trustedContact: undefined }); setForm({ name: '', phone: '' }); toast.success('Trusted contact removed'); },
  });
  return (
    <Stack spacing={2} component="form" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField label="Name" placeholder="Mum" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} error={Boolean(errors.name)} helperText={errors.name} slotProps={{ htmlInput: { maxLength: 60 } }} />
        <TextField label="Mobile number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} error={Boolean(errors.phone)} helperText={errors.phone} slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 15 } }} />
      </Box>
      <Stack direction="row" spacing={1.5}>
        <Button type="submit" variant="contained" disabled={!form.name.trim() || !form.phone.trim() || save.isPending}>{current ? 'Update contact' : 'Save contact'}</Button>
        {current && <Button color="error" onClick={() => remove.mutate()} disabled={remove.isPending}>Remove</Button>}
      </Stack>
    </Stack>
  );
}

function Security() {
  const toast = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const change = useMutation({
    mutationFn: () => post('/auth/change-password', form),
    onSuccess: () => { setForm({ currentPassword: '', newPassword: '' }); setError(''); toast.success('Password changed. Other devices were signed out.'); },
    onError: err => setError(err.message),
  });
  const logoutAll = useMutation({
    mutationFn: () => post('/auth/logout-all'),
    onSuccess: async () => { await logout(); navigate('/login'); },
  });
  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} />
      <PasswordField label="New password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button variant="contained" disabled={!form.currentPassword || Boolean(rules.password(form.newPassword)) || change.isPending} onClick={() => change.mutate()}>Change password</Button>
        <Button color="error" onClick={() => logoutAll.mutate()}>Sign out of all devices</Button>
      </Stack>
    </Stack>
  );
}

export default function AccountPage() {
  const { account } = useAuth();
  const vehicle = account.vehicle;
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader eyebrow="Account" title="Your account" subtitle="Manage your profile, saved places and security." />
      <Stack spacing={2.5}>
        <Section title="Profile"><ProfileForm /></Section>
        {account.role === 'customer' && <Section title="Saved places" subtitle="Shown first when you search for a pickup or destination."><SavedPlaces /></Section>}
        {account.role === 'customer' && (
          <Section title="Trusted contact" subtitle="During an SOS you can text this person your live trip link in one tap.">
            <TrustedContact />
          </Section>
        )}
        {account.role === 'driver' && (
          <Section title="Licence & verification" subtitle="Kept up to date by our operations team. Contact support if anything here is wrong.">
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Chip label={`Licence ${account.drivingLicenseNumber}`} variant="outlined" />
              <Chip
                color={!account.licenseExpiry || new Date(account.licenseExpiry) < new Date() ? 'error' : 'default'}
                label={account.licenseExpiry ? `Valid until ${dateOnly(account.licenseExpiry)}` : 'Licence expiry not recorded'}
              />
              <Chip color={account.policeVerification?.status === 'verified' ? 'success' : 'warning'} label={`Police verification: ${account.policeVerification?.status || 'pending'}`} />
              <Chip label={`Account: ${account.status}`} variant="outlined" />
              {account.emergencyContact?.name && <Chip label={`Emergency: ${account.emergencyContact.name} · ${account.emergencyContact.phone}`} variant="outlined" />}
            </Stack>
          </Section>
        )}
        {account.role === 'driver' && vehicle?.category && (
          <Section title="Vehicle" subtitle="Contact support to change your registered vehicle.">
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Chip label={vehicle.category?.toUpperCase()} color="primary" />
              <Chip label={[vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ')} />
              <Chip label={vehicle.plateNumber} variant="outlined" />
              <Chip label={`Status: ${account.status}`} variant="outlined" />
            </Stack>
          </Section>
        )}
        <Section title="Security"><Security /></Section>
      </Stack>
    </Container>
  );
}
