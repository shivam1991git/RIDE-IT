import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Box, LinearProgress } from '@mui/material';
import AppShell from './layout/AppShell';
import { RequireRole } from './providers/AuthProvider';
import LandingPage from '../features/home/LandingPage';
import NotFoundPage from '../features/home/NotFoundPage';
import { useAppConfig } from '../shared/api/useAppConfig';

const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'));
const DriverSignupPage = lazy(() => import('../features/auth/DriverSignupPage'));
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const BookRidePage = lazy(() => import('../features/rides/BookRidePage'));
const BookingDetailsPage = lazy(() => import('../features/bookings/BookingDetailsPage'));
const MyBookingsPage = lazy(() => import('../features/bookings/MyBookingsPage'));
const BookRentalPage = lazy(() => import('../features/rentals/BookRentalPage'));
const ReceiptPage = lazy(() => import('../features/rentals/ReceiptPage'));
const AccountPage = lazy(() => import('../features/account/AccountPage'));
const HelpCenterPage = lazy(() => import('../features/support/HelpCenterPage'));
const DriverDashboardPage = lazy(() => import('../features/driver/DriverDashboardPage'));
const DriverJobPage = lazy(() => import('../features/driver/DriverJobPage'));
const AdminLayout = lazy(() => import('../features/admin/AdminLayout'));
const SharedTripPage = lazy(() => import('../features/rides/SharedTripPage'));
const ChatWidget = lazy(() => import('../features/assistant/ChatWidget'));

const rider = el => <RequireRole roles={['customer']}>{el}</RequireRole>;
const driver = el => <RequireRole roles={['driver']}>{el}</RequireRole>;
const signedIn = el => <RequireRole roles={['customer', 'driver', 'admin']}>{el}</RequireRole>;

// Instant rides are switched off for the chauffeur-rental launch.
function RidesOnly({ children }) {
  const { ridesEnabled, loaded } = useAppConfig();
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
            <Route path="/" element={<Page><LandingPage /></Page>} />
            <Route path="/login" element={<Page><LoginPage /></Page>} />
            <Route path="/admin/login" element={<Page><LoginPage adminOnly /></Page>} />
            <Route path="/register" element={<Page><RegisterPage /></Page>} />
            <Route path="/drive" element={<Page><DriverSignupPage /></Page>} />
            <Route path="/forgot-password" element={<Page><ForgotPasswordPage /></Page>} />
            <Route path="/reset-password" element={<Page><ResetPasswordPage /></Page>} />

            <Route path="/ride" element={<RidesOnly>{rider(<Page><BookRidePage /></Page>)}</RidesOnly>} />
            <Route path="/trips" element={rider(<Page><MyBookingsPage /></Page>)} />
            <Route path="/trips/:id" element={signedIn(<Page><BookingDetailsPage /></Page>)} />
            <Route path="/trips/:id/receipt" element={signedIn(<Page><ReceiptPage /></Page>)} />
            <Route path="/rentals" element={<Page><BookRentalPage /></Page>} />
            <Route path="/rentals/:id" element={<Navigate to="/rentals" replace />} />

            <Route path="/account" element={signedIn(<Page><AccountPage /></Page>)} />
            <Route path="/support" element={<Page><HelpCenterPage /></Page>} />
            <Route path="/share/:token" element={<RidesOnly><Page><SharedTripPage /></Page></RidesOnly>} />

            <Route path="/driver" element={driver(<Page><DriverDashboardPage /></Page>)} />
            <Route path="/driver/jobs/:id" element={driver(<Page><DriverJobPage /></Page>)} />

            <Route path="/admin/*" element={<RequireRole roles={['admin']}><AdminLayout /></RequireRole>} />
            <Route path="*" element={<Page><NotFoundPage /></Page>} />
          </Routes>
        </AnimatePresence>
      </Suspense>
      {!isAdmin && <Suspense fallback={null}><ChatWidget /></Suspense>}
    </AppShell>
  );
}
