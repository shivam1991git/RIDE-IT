import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Button, Link, MenuItem, Stack, TextField } from '@mui/material';
import AuthLayout from './components/AuthLayout';
import { post } from '../../shared/api/apiClient';
import { rules } from './components/authFields';

export default function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const [role, setRole] = useState(['driver', 'admin'].includes(params.get('role')) ? params.get('role') : 'customer');
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, message: '', error: '' });

  const submit = async event => {
    event.preventDefault();
    const invalid = rules.email(email);
    if (invalid) {
      setState({ busy: false, message: '', error: invalid });
      return;
    }
    setState({ busy: true, message: '', error: '' });
    try {
      const result = await post('/auth/forgot-password', { role, email });
      setState({ busy: false, message: result.message, error: '' });
    } catch (err) {
      setState({ busy: false, message: '', error: err.message });
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We will email you a link that works for 30 minutes.">
      <Stack component="form" spacing={2} onSubmit={submit} noValidate>
        {state.message && <Alert severity="success">{state.message}</Alert>}
        {state.error && <Alert severity="error">{state.error}</Alert>}
        <TextField select label="Account type" value={role} onChange={e => setRole(e.target.value)}>
          <MenuItem value="customer">Rider</MenuItem>
          <MenuItem value="driver">Driver</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
        </TextField>
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <Button type="submit" variant="contained" size="large" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send reset link'}</Button>
        <Link component={RouterLink} to="/login" variant="body2" sx={{ textAlign: 'center' }}>Back to sign in</Link>
      </Stack>
    </AuthLayout>
  );
}
