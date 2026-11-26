import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Button, Stack } from '@mui/material';
import AuthLayout from './components/AuthLayout';
import { PasswordField, rules } from './components/authFields';
import { post } from '../../shared/api/apiClient';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const role = params.get('role') || 'customer';
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ busy: false, done: false, error: '' });

  const submit = async event => {
    event.preventDefault();
    const invalid = rules.password(password);
    if (invalid) {
      setState({ ...state, error: invalid });
      return;
    }
    setState({ busy: true, done: false, error: '' });
    try {
      await post('/auth/reset-password', { role, token, password });
      setState({ busy: false, done: true, error: '' });
    } catch (err) {
      setState({ busy: false, done: false, error: err.message });
    }
  };

  if (!/^[a-f\d]{64}$/.test(token)) {
    return (
      <AuthLayout title="Link not valid">
        <Alert severity="error" sx={{ mb: 2 }}>This reset link is incomplete or invalid.</Alert>
        <Button component={RouterLink} to="/forgot-password" variant="contained">Request a new link</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You will be signed out of all other devices.">
      {state.done ? (
        <Stack spacing={2}>
          <Alert severity="success">Your password has been changed.</Alert>
          <Button component={RouterLink} to={role === 'admin' ? '/admin/login' : `/login?role=${role}`} variant="contained">Sign in</Button>
        </Stack>
      ) : (
        <Stack component="form" spacing={2} onSubmit={submit} noValidate>
          {state.error && <Alert severity="error">{state.error}</Alert>}
          <PasswordField value={password} onChange={e => setPassword(e.target.value)} label="New password" />
          <Button type="submit" variant="contained" size="large" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save new password'}</Button>
        </Stack>
      )}
    </AuthLayout>
  );
}
