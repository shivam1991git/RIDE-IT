import { useState } from 'react';
import { IconButton, InputAdornment, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';

// Mirrors the server rules so users get instant feedback; the server still validates.
export const rules = {
  fullName: v => (v.trim().length >= 2 ? '' : 'Enter your full name'),
  username: v => (/^[a-zA-Z0-9_.]{3,30}$/.test(v) ? '' : '3–30 letters, numbers, dots or underscores'),
  email: v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address'),
  phoneNumber: v => (/^(\+91)?[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '')) ? '' : 'Enter a valid 10-digit Indian mobile number'),
  password: v => (v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v) ? '' : 'At least 8 characters with a letter and a number'),
};

export function validateFields(values, names) {
  return Object.fromEntries(names.map(name => [name, rules[name]?.(values[name] || '') || '']).filter(([, message]) => message));
}

function strength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

export function PasswordField({ value, onChange, error, label = 'Password', autoComplete = 'new-password' }) {
  const [show, setShow] = useState(false);
  const score = strength(value);
  const colors = ['error', 'error', 'warning', 'warning', 'success', 'success'];
  return (
    <Stack spacing={0.75}>
      <TextField
        label={label}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        error={Boolean(error)}
        helperText={error || 'At least 8 characters, including a letter and a number'}
        slotProps={{ input: { endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} edge="end">{show ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton>
          </InputAdornment>
        ) } }}
      />
      {value && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <LinearProgress variant="determinate" value={(score / 5) * 100} color={colors[score]} sx={{ flex: 1, height: 6, borderRadius: 3 }} aria-label="Password strength" />
          <Typography variant="caption" color="text.secondary">{['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][score]}</Typography>
        </Stack>
      )}
    </Stack>
  );
}
