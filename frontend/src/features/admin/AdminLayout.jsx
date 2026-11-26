import { lazy, Suspense, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, AppBar, Badge, Box, Divider, Drawer, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuRounded from '@mui/icons-material/MenuRounded';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import SellRounded from '@mui/icons-material/SellRounded';
import LocalOfferRounded from '@mui/icons-material/LocalOfferRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import ReviewsRounded from '@mui/icons-material/ReviewsRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import Logo from '../../app/layout/Logo';
import NotificationBell from '../../app/layout/NotificationBell';
import { get } from '../../shared/api/apiClient';
import { useAuth } from '../../app/providers/AuthProvider';
import { useColorMode } from '../../app/providers/ColorModeProvider';
import { useAppConfig } from '../../shared/api/useAppConfig';
import { useAdminRole } from './components/adminShared';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const BookingsPage = lazy(() => import('./pages/BookingsPage'));
const PeoplePage = lazy(() => import('./pages/PeoplePage'));
const FleetPage = lazy(() => import('./pages/FleetPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const PromoCodesPage = lazy(() => import('./pages/PromoCodesPage'));
const SupportTicketsPage = lazy(() => import('./pages/SupportTicketsPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const FleetOwnersPage = lazy(() => import('./pages/FleetOwnersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const WIDTH = 248;

const ALL = ['super', 'operations', 'support'];
const SUPER_ONLY = ['super'];

function Nav({ onNavigate }) {
  const { role } = useAdminRole();
  const { ridesEnabled } = useAppConfig();
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => get('/admin/stats'), refetchInterval: 60000 });
  const totals = stats.data?.totals || {};
  const attention = stats.data?.attention || {};
  const items = [
    ['', 'Overview', DashboardRounded, 0, ALL],
    ['bookings', 'Bookings', ReceiptLongRounded, (attention.pendingApproval || 0) + (attention.needsDriver || 0), ALL],
    ['drivers', 'Chauffeurs', BadgeRounded, totals.pendingDrivers, ALL],
    ['customers', 'Customers', PeopleRounded, 0, ALL],
    ['fleet', 'Fleet', DirectionsCarRounded, stats.data?.complianceAlertCount, ALL],
    ['owners', 'Fleet owners', HandshakeRounded, 0, ALL],
    ['pricing', 'Pricing', SellRounded, 0, ALL],
    ...(ridesEnabled ? [['promos', 'Promo codes', LocalOfferRounded, 0, SUPER_ONLY]] : []),
    ['support', 'Support', SupportAgentRounded, totals.openTickets, ALL],
    ['feedback', 'Feedback', ReviewsRounded, 0, ALL],
    ['settings', 'Settings', TuneRounded, 0, SUPER_ONLY],
    ['admins', 'Admin team', AdminPanelSettingsRounded, 0, SUPER_ONLY],
    ['audit', 'Audit log', HistoryRounded, 0, SUPER_ONLY],
  ].filter(item => item[4].includes(role));
  return (
    <List sx={{ px: 1.5 }} onClick={onNavigate}>
      {items.map(([path, label, Icon, badge]) => (
        <ListItemButton key={path} component={NavLink} to={`/admin${path ? `/${path}` : ''}`} end sx={{ borderRadius: 3, mb: 0.25, '&.active': { bgcolor: 'action.selected', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}>
          <ListItemIcon sx={{ minWidth: 38 }}><Badge color="primary" badgeContent={badge || 0}><Icon fontSize="small" /></Badge></ListItemIcon>
          <ListItemText primary={label} slotProps={{ primary: { fontWeight: 500, fontSize: 14 } }} />
        </ListItemButton>
      ))}
    </List>
  );
}

function SuperOnly({ children }) {
  const { isSuper } = useAdminRole();
  return isSuper ? children : <Alert severity="warning">Only super admins can open this page.</Alert>;
}

export default function AdminLayout() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [open, setOpen] = useState(false);
  const { account, logout } = useAuth();
  const { toggle } = useColorMode();
  const navigate = useNavigate();

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2.5 }}><Logo to="/admin" /></Box>
      <Typography variant="overline" color="text.secondary" sx={{ px: 3 }}>Operations</Typography>
      <Nav onNavigate={() => setOpen(false)} />
      <Box sx={{ flex: 1 }} />
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2">{account.fullName}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'capitalize' }}>{account.adminRole || 'super'} admin</Typography>
        <Typography variant="caption" color="text.secondary">{account.email}</Typography>
        <List dense sx={{ mt: 1 }}>
          <ListItemButton sx={{ borderRadius: 2 }} onClick={toggle}><ListItemText primary="Toggle theme" /></ListItemButton>
          <ListItemButton sx={{ borderRadius: 2 }} onClick={async () => { await logout(); navigate('/admin/login'); }}>
            <ListItemIcon sx={{ minWidth: 32 }}><LogoutRounded fontSize="small" /></ListItemIcon><ListItemText primary="Sign out" />
          </ListItemButton>
        </List>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <Drawer
        variant={desktop ? 'permanent' : 'temporary'}
        open={desktop || open}
        onClose={() => setOpen(false)}
        sx={{ width: { lg: WIDTH }, flexShrink: 0, '& .MuiDrawer-paper': { width: WIDTH, borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper' } }}
      >
        {drawer}
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: 'blur(12px)', borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar sx={{ gap: 1 }}>
            {!desktop && <IconButton onClick={() => setOpen(true)} aria-label="Open navigation" edge="start"><MenuRounded /></IconButton>}
            <Typography variant="h6" sx={{ flex: 1 }}>Admin console</Typography>
            <NotificationBell />
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1400 }}>
          <Suspense fallback={<LinearProgress />}>
            <Routes>
              <Route index element={<OverviewPage />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="drivers" element={<PeoplePage role="driver" />} />
              <Route path="customers" element={<PeoplePage role="customer" />} />
              <Route path="admins" element={<SuperOnly><PeoplePage role="admin" /></SuperOnly>} />
              <Route path="fleet" element={<FleetPage />} />
              <Route path="owners" element={<FleetOwnersPage />} />
              <Route path="pricing" element={<PricingPage />} />
              <Route path="promos" element={<SuperOnly><PromoCodesPage /></SuperOnly>} />
              <Route path="support" element={<SupportTicketsPage />} />
              <Route path="feedback" element={<FeedbackPage />} />
              <Route path="settings" element={<SuperOnly><SettingsPage /></SuperOnly>} />
              <Route path="audit" element={<SuperOnly><AuditLogPage /></SuperOnly>} />
            </Routes>
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}
