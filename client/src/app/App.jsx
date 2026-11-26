import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Box, LinearProgress } from '@mui/material';
import AppShell from './layout/AppShell';
import { RequireRole } from './providers/AuthProvider';
import Landing from '../features/home/LandingPage';
import NotFound from '../features/home/NotFoundPage';
import { useMeta } from '../shared/api/useAppConfig';

const Login = lazy(() => import('../features/auth/LoginPage'));
const Register = lazy(() => import('../features/auth/RegisterPage'));
const DriverSignup = lazy(() => import('../features/auth/DriverSignupPage'));
const ForgotPassword = lazy(() => import('../features/auth/ForgotPasswordPage'));
const ResetPassword = lazy(() => import('../features/auth/ResetPasswordPage'));
const BookRide = lazy(() => import('../features/rides/BookRidePage'));
const Trip = lazy(() => import('../features/bookings/BookingDetailsPage'));
const Trips = lazy(() => import('../features/bookings/MyBookingsPage'));
const BookRental = lazy(() => import('../features/rentals/BookRentalPage'));
const Receipt = lazy(() => import('../features/rentals/ReceiptPage'));
const Account = lazy(() => import('../features/account/AccountPage'));
const Support = lazy(() => import('../features/support/HelpCenterPage'));
const DriverHome = lazy(() => import('../features/driver/DriverDashboardPage'));
const DriverJob = lazy(() => import('../features/driver/DriverJobPage'));
const AdminApp = lazy(() => import('../features/admin/AdminLayout'));
const SharedTrip = lazy(() => import('../features/rides/SharedTripPage'));
const ChatWidget = lazy(() => import('../features/assistant/ChatWidget'));

const rider = el => <RequireRole roles={['customer']}>{el}</RequireRole>;
const driver = el => <RequireRole roles={['driver']}>{el}</RequireRole>;
const signedIn = el => <RequireRole roles={['customer', 'driver', 'admin']}>{el}</RequireRole>;

// Instant rides are switched off for the chauffeur-rental launch.
function RidesOnly({ children }) {
  const { ridesEnabled, loaded } = useMeta();
  if (!loaded) return null;
  return ridesEnabled ? children : <Navigate to="/rentals" replace />;
}

function Page({ children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

export default function App() {
  const location = useLocation();
  const section = location.pathname.split('/')[1] || 'home';
  const isAdmin = section === 'admin' && location.pathname !== '/admin/login';

  return (
    <AppShell bare={isAdmin}>
      <Suspense fallback={<Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000 }}><LinearProgress aria-label="Loading page" /></Box>}>
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={isAdmin ? 'admin' : location.pathname}>
            <Route path="/" element={<Page><Landing /></Page>} />
            <Route path="/login" element={<Page><Login /></Page>} />
            <Route path="/admin/login" element={<Page><Login adminOnly /></Page>} />
            <Route path="/register" element={<Page><Register /></Page>} />
            <Route path="/drive" element={<Page><DriverSignup /></Page>} />
            <Route path="/forgot-password" element={<Page><ForgotPassword /></Page>} />
            <Route path="/reset-password" element={<Page><ResetPassword /></Page>} />

            <Route path="/ride" element={<RidesOnly>{rider(<Page><BookRide /></Page>)}</RidesOnly>} />
            <Route path="/trips" element={rider(<Page><Trips /></Page>)} />
            <Route path="/trips/:id" element={signedIn(<Page><Trip /></Page>)} />
            <Route path="/trips/:id/receipt" element={signedIn(<Page><Receipt /></Page>)} />
            <Route path="/rentals" element={<Page><BookRental /></Page>} />
            <Route path="/rentals/:id" element={<Navigate to="/rentals" replace />} />

            <Route path="/account" element={signedIn(<Page><Account /></Page>)} />
            <Route path="/support" element={<Page><Support /></Page>} />
            <Route path="/share/:token" element={<RidesOnly><Page><SharedTrip /></Page></RidesOnly>} />

            <Route path="/driver" element={driver(<Page><DriverHome /></Page>)} />
            <Route path="/driver/jobs/:id" element={driver(<Page><DriverJob /></Page>)} />

            <Route path="/admin/*" element={<RequireRole roles={['admin']}><AdminApp /></RequireRole>} />
            <Route path="*" element={<Page><NotFound /></Page>} />
          </Routes>
        </AnimatePresence>
      </Suspense>
      {!isAdmin && <Suspense fallback={null}><ChatWidget /></Suspense>}
    </AppShell>
  );
}
