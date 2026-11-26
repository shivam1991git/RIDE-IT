import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, Link, Stack, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import AuthLayout from './components/AuthLayout';
import { PasswordField, validateFields } from './components/authFields';
import VehicleArt from '../../shared/components/vehicles/VehicleArt';
import { useAuth } from '../../app/providers/AuthProvider';
import { fieldErrors } from '../../shared/api/apiClient';
import { useAppConfig } from '../../shared/api/useAppConfig';

const CATEGORIES = [['auto', 'Auto'], ['mini', 'Mini'], ['sedan', 'Sedan'], ['suv', 'SUV']];
const PHONE = /^(\+91)?[6-9]\d{9}$/;

// Chauffeurs drive fleet cars, so the vehicle step only exists while instant
// rides (where drivers bring their own car) are switched on.
export default function DriverSignupPage() {
  const { ridesEnabled } = useAppConfig();
  const steps = ridesEnabled ? ['Account', 'Licence', 'Vehicle'] : ['Account', 'Licence & safety'];
  const last = steps.length - 1;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    fullName: '', username: '', email: '', phoneNumber: '', password: '',
    drivingLicenseNumber: '', dob: '', licenseExpiry: '',
    emergencyContact: { name: '', phone: '' },
    vehicle: { category: 'mini', make: '', model: '', plateNumber: '', color: '' },
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { register } = useAuth();

  const set = name => e => setForm({ ...form, [name]: e.target.value });
  const setVehicle = name => e => setForm({ ...form, vehicle: { ...form.vehicle, [name]: e.target.value } });
  const setContact = name => e => setForm({ ...form, emergencyContact: { ...form.emergencyContact, [name]: e.target.value } });

  const validateStep = () => {
    let found = {};
    if (step === 0) found = validateFields(form, ['fullName', 'username', 'email', 'phoneNumber', 'password']);
    if (step === 1) {
      if (form.drivingLicenseNumber.trim().length < 6) found.drivingLicenseNumber = 'Enter your driving licence number';
      const age = form.dob ? (Date.now() - new Date(form.dob)) / (365.25 * 864e5) : 0;
      if (age < 18 || age > 75) found.dob = 'Drivers must be between 18 and 75 years old';
      if (!form.licenseExpiry || new Date(form.licenseExpiry) <= new Date()) found.licenseExpiry = 'Enter a licence valid in the future';
      if (form.emergencyContact.name.trim().length < 2) found['emergencyContact.name'] = 'Enter an emergency contact';
      if (!PHONE.test(form.emergencyContact.phone.replace(/[\s-]/g, ''))) found['emergencyContact.phone'] = 'Enter a valid 10-digit mobile number';
      else if (form.emergencyContact.phone.replace(/[\s-]/g, '').slice(-10) === form.phoneNumber.replace(/[\s-]/g, '').slice(-10)) found['emergencyContact.phone'] = 'Use someone else’s number';
    }
    if (step === 2) {
      if (form.vehicle.make.trim().length < 2) found['vehicle.make'] = 'Enter the vehicle make';
      if (!form.vehicle.model.trim()) found['vehicle.model'] = 'Enter the vehicle model';
      if (form.vehicle.plateNumber.trim().length < 4) found['vehicle.plateNumber'] = 'Enter the registration plate';
    }
    setErrors(found);
    return !Object.keys(found).length;
  };

  const next = async () => {
    if (!validateStep()) return;
    if (step < last) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { vehicle, ...rest } = form;
      await register({ role: 'driver', ...rest, ...(ridesEnabled ? { vehicle } : {}) });
      setDone(true);
    } catch (err) {
      const fields = fieldErrors(err);
      setErrors(fields);
      setError(err.message);
      if (['fullName', 'username', 'email', 'phoneNumber', 'password'].some(name => fields[name]) || err.code === 'duplicate') setStep(0);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Application received" wide>
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <CheckCircleRounded color="success" sx={{ fontSize: 48 }} />
          <Typography>Thanks, {form.fullName.split(' ')[0]}! Our team will verify your licence and police verification. You can sign in now to check your status; trips will be assigned to you once you are approved.</Typography>
          <Button variant="contained" component={RouterLink} to="/login?role=driver">Driver sign in</Button>
        </Stack>
      </AuthLayout>
    );
  }

  const tf = (name, label, props = {}) => (
    <TextField label={label} value={form[name]} onChange={set(name)} error={Boolean(errors[name])} helperText={errors[name] || props.helperText} {...props} />
  );
  const vf = (name, label, props = {}) => (
    <TextField label={label} value={form.vehicle[name]} onChange={setVehicle(name)} error={Boolean(errors[`vehicle.${name}`])} helperText={errors[`vehicle.${name}`]} {...props} />
  );
  const cf = (name, label, props = {}) => (
    <TextField label={label} value={form.emergencyContact[name]} onChange={setContact(name)} error={Boolean(errors[`emergencyContact.${name}`])} helperText={errors[`emergencyContact.${name}`]} {...props} />
  );

  return (
    <AuthLayout title="Drive with RIDE-IT" subtitle="Apply as a chauffeur. We verify every applicant before assigning trips." wide>
      <Stepper activeStep={step} alternativeLabel sx={{ mb: 4 }}>
        {steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>
      <Stack spacing={2} component="form" onSubmit={e => { e.preventDefault(); next(); }} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        {step === 0 && (
          <>
            {tf('fullName', 'Full name (as on licence)', { autoComplete: 'name', autoFocus: true })}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {tf('username', 'Username', { autoComplete: 'username' })}
              {tf('phoneNumber', 'Mobile number', { autoComplete: 'tel', inputMode: 'tel' })}
            </Box>
            {tf('email', 'Email', { type: 'email', autoComplete: 'email' })}
            <PasswordField value={form.password} onChange={set('password')} error={errors.password} />
          </>
        )}
        {step === 1 && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {tf('drivingLicenseNumber', 'Driving licence number', { autoFocus: true })}
              {tf('licenseExpiry', 'Licence valid until', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
              {tf('dob', 'Date of birth', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
            </Box>
            <Typography variant="subtitle2" sx={{ pt: 1 }}>Emergency contact</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {cf('name', 'Name and relation')}
              {cf('phone', 'Mobile number', { inputMode: 'tel' })}
            </Box>
            <Alert severity="info">After you apply, our team will ask for your licence and police verification certificate before assigning trips.</Alert>
          </>
        )}
        {step === 2 && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }} role="radiogroup" aria-label="Vehicle category">
              {CATEGORIES.map(([key, label]) => (
                <Card
                  key={key}
                  component="button"
                  type="button"
                  role="radio"
                  aria-checked={form.vehicle.category === key}
                  onClick={() => setForm({ ...form, vehicle: { ...form.vehicle, category: key } })}
                  sx={{ p: 1.5, cursor: 'pointer', textAlign: 'center', color: 'text.primary', font: 'inherit', borderWidth: 2, borderColor: form.vehicle.category === key ? 'primary.main' : 'divider' }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}><VehicleArt kind={key} width={90} /></Box>
                  <Typography variant="subtitle2">{label}</Typography>
                </Card>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {vf('make', 'Make (e.g. Maruti)')}
              {vf('model', 'Model (e.g. Swift)')}
              {vf('plateNumber', 'Registration plate')}
              {vf('color', 'Colour')}
            </Box>
          </>
        )}
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'space-between', pt: 1 }}>
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          <Button type="submit" variant="contained" disabled={busy}>{step < last ? 'Continue' : busy ? 'Submitting…' : 'Submit application'}</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">Already applied? <Link component={RouterLink} to="/login?role=driver">Sign in as a driver</Link></Typography>
      </Stack>
    </AuthLayout>
  );
}
