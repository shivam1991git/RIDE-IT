import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Box, LinearProgress } from '@mui/material';
import AppShell from './components/layout/AppShell';
import { RequireRole } from './providers/AuthProvider';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';

const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const DriverSignup = lazy(() => import('./pages/auth/DriverSignup'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const BookRide = lazy(() => import('./pages/rider/BookRide'));
const Trip = lazy(() => import('./pages/rider/Trip'));
const Trips = lazy(() => import('./pages/rider/Trips'));
const Rentals = lazy(() => import('./pages/rider/Rentals'));
const RentalCar = lazy(() => import('./pages/rider/RentalCar'));
const Account = lazy(() => import('./pages/Account'));
const Support = lazy(() => import('./pages/Support'));
const DriverHome = lazy(() => import('./pages/driver/DriverHome'));
const DriverJob = lazy(() => import('./pages/driver/DriverJob'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));
const SharedTrip = lazy(() => import('./pages/SharedTrip'));
const ChatWidget = lazy(() => import('./components/chat/ChatWidget'));

const rider = el => <RequireRole roles={['customer']}>{el}</RequireRole>;
const driver = el => <RequireRole roles={['driver']}>{el}</RequireRole>;
const signedIn = el => <RequireRole roles={['customer', 'driver', 'admin']}>{el}</RequireRole>;

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

            <Route path="/ride" element={rider(<Page><BookRide /></Page>)} />
            <Route path="/trips" element={rider(<Page><Trips /></Page>)} />
            <Route path="/trips/:id" element={signedIn(<Page><Trip /></Page>)} />
            <Route path="/rentals" element={<Page><Rentals /></Page>} />
            <Route path="/rentals/:id" element={<Page><RentalCar /></Page>} />

            <Route path="/account" element={signedIn(<Page><Account /></Page>)} />
            <Route path="/support" element={<Page><Support /></Page>} />
            <Route path="/share/:token" element={<Page><SharedTrip /></Page>} />

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
