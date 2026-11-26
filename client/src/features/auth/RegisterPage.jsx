import { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import AuthLayout from './components/AuthLayout';
import { PasswordField, validateFields } from './components/authFields';
import { useAuth } from '../../app/providers/AuthProvider';
import { fieldErrors } from '../../shared/api/apiClient';

const FIELDS = ['fullName', 'username', 'email', 'phoneNumber', 'password'];

export default function Register() {
  const [form, setForm] = useState({ fullName: '', username: '', email: '', phoneNumber: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Only same-site paths, so a crafted link cannot redirect elsewhere after sign-up.
  const from = typeof location.state?.from === 'string' && /^\/(?![/\\])/.test(location.state.from) ? location.state.from : '/rentals';

  const set = name => event => {
    setForm({ ...form, [name]: event.target.value });
    if (errors[name]) setErrors({ ...errors, [name]: '' });
  };

  const submit = async event => {
    event.preventDefault();
    const found = validateFields(form, FIELDS);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError('');
    try {
      await register({ role: 'customer', ...form });
      navigate(from, { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (name, label, props = {}) => (
    <TextField label={label} value={form[name]} onChange={set(name)} error={Boolean(errors[name])} helperText={errors[name]} {...props} />
  );

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than a minute." aside={{ title: 'Your car and chauffeur, sorted.', body: 'Book hourly, full-day, outstation and airport trips with verified chauffeurs. Every price and receipt in one place.' }}>
      <Stack component="form" spacing={2} onSubmit={submit} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        {field('fullName', 'Full name', { autoComplete: 'name', autoFocus: true })}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {field('username', 'Username', { autoComplete: 'username' })}
          {field('phoneNumber', 'Mobile number', { autoComplete: 'tel', inputMode: 'tel' })}
        </Box>
        {field('email', 'Email', { autoComplete: 'email', type: 'email' })}
        <PasswordField value={form.password} onChange={set('password')} error={errors.password} />
        <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Already have an account? <Link component={RouterLink} to="/login">Sign in</Link> · Want to drive? <Link component={RouterLink} to="/drive">Apply</Link>
        </Typography>
      </Stack>
    </AuthLayout>
  );
}
