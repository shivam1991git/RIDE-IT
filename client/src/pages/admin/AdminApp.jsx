import { lazy, Suspense, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AppBar, Badge, Box, Divider, Drawer, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, useMediaQuery,
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
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import Logo from '../../components/layout/Logo';
import NotificationBell from '../../components/layout/NotificationBell';
import { get } from '../../lib/api';
import { useAuth } from '../../providers/AuthProvider';
import { useColorMode } from '../../providers/ColorModeProvider';

const Overview = lazy(() => import('./Overview'));
const Bookings = lazy(() => import('./Bookings'));
const People = lazy(() => import('./People'));
const Fleet = lazy(() => import('./Fleet'));
const Pricing = lazy(() => import('./Pricing'));
const Promos = lazy(() => import('./Promos'));
const Support = lazy(() => import('./SupportAdmin'));
const Feedback = lazy(() => import('./Feedback'));
const Audit = lazy(() => import('./Audit'));

const WIDTH = 248;

function Nav({ onNavigate }) {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => get('/admin/stats') });
  const totals = stats.data?.totals || {};
  const items = [
    ['', 'Overview', DashboardRounded],
    ['bookings', 'Bookings', ReceiptLongRounded],
    ['drivers', 'Drivers', BadgeRounded, totals.pendingDrivers],
    ['customers', 'Customers', PeopleRounded],
    ['fleet', 'Rental fleet', DirectionsCarRounded],
    ['pricing', 'Pricing', SellRounded],
    ['promos', 'Promo codes', LocalOfferRounded],
    ['support', 'Support', SupportAgentRounded, totals.openTickets],
    ['feedback', 'Feedback', ReviewsRounded],
    ['admins', 'Admin team', AdminPanelSettingsRounded],
    ['audit', 'Audit log', HistoryRounded],
  ];
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

export default function AdminApp() {
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
              <Route index element={<Overview />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="drivers" element={<People role="driver" />} />
              <Route path="customers" element={<People role="customer" />} />
              <Route path="admins" element={<People role="admin" />} />
              <Route path="fleet" element={<Fleet />} />
              <Route path="pricing" element={<Pricing />} />
              <Route path="promos" element={<Promos />} />
              <Route path="support" element={<Support />} />
              <Route path="feedback" element={<Feedback />} />
              <Route path="audit" element={<Audit />} />
            </Routes>
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}
