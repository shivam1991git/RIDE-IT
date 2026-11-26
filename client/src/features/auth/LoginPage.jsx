import { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, IconButton, InputAdornment, Link, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import AuthLayout from './components/AuthLayout';
import { useAuth, homeFor } from '../../app/providers/AuthProvider';

export default function Login({ adminOnly = false }) {
  const [params] = useSearchParams();
  const [role, setRole] = useState(adminOnly ? 'admin' : params.get('role') === 'driver' ? 'driver' : 'customer');
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!form.identifier.trim() || !form.password) {
      setError('Enter your username or email and password.');
      return;
    }
    setBusy(true);
    try {
      const account = await login({ role, ...form });
      // Only follow same-site paths ("/x"), never "//host" or "/\host".
      const from = location.state?.from;
      const safeFrom = typeof from === 'string' && /^\/(?![/\\])/.test(from) ? from : null;
      navigate(safeFrom && account.role === 'customer' ? safeFrom : homeFor(account.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={adminOnly ? 'Admin sign in' : 'Welcome back'}
      subtitle={adminOnly ? 'Restricted to RIDE-IT operations staff.' : 'Sign in to book rides and see your trips.'}
    >
      {!adminOnly && (
        <Tabs value={role} onChange={(e, value) => setRole(value)} variant="fullWidth" sx={{ mb: 3, bgcolor: 'action.hover', borderRadius: 999, p: 0.5, minHeight: 0, '& .MuiTabs-indicator': { height: '100%', borderRadius: 999, zIndex: 0, bgcolor: 'background.paper' }, '& .MuiTab-root': { zIndex: 1, minHeight: 40 } }}>
          <Tab value="customer" label="Rider" />
          <Tab value="driver" label="Driver" />
        </Tabs>
      )}
      <Stack component="form" spacing={2} onSubmit={submit} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Username or email" autoComplete="username" value={form.identifier} onChange={e => setForm({ ...form, identifier: e.target.value })} autoFocus />
        <TextField
          label="Password"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          slotProps={{ input: { endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} edge="end">{show ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton>
            </InputAdornment>
          ) } }}
        />
        <Link component={RouterLink} to={`/forgot-password?role=${role}`} variant="body2" sx={{ alignSelf: 'flex-end' }}>Forgot password?</Link>
        <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        {!adminOnly && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {role === 'driver'
              ? <>Want to drive with us? <Link component={RouterLink} to="/drive">Apply here</Link></>
              : <>New to RIDE-IT? <Link component={RouterLink} to="/register">Create an account</Link></>}
          </Typography>
        )}
      </Stack>
    </AuthLayout>
  );
}
