import { useState } from 'react';
import { Link as RouterLink, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Box, Button, Container, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Stack, Toolbar, Tooltip, Typography, useMediaQuery, useScrollTrigger,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import MenuRounded from '@mui/icons-material/MenuRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import DirectionsCarRounded from '@mui/icons-material/DirectionsCarRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import Logo from './Logo';
import Footer from './Footer';
import NotificationBell from './NotificationBell';
import { useAuth, homeFor } from '../../providers/AuthProvider';
import { useColorMode } from '../../providers/ColorModeProvider';

const NAV = {
  guest: [
    { to: '/ride', label: 'Ride', icon: DirectionsCarRounded },
    { to: '/rentals', label: 'Rentals', icon: KeyRounded },
    { to: '/drive', label: 'Drive with us', icon: SpeedRounded },
    { to: '/support', label: 'Help', icon: SupportAgentRounded },
  ],
  customer: [
    { to: '/ride', label: 'Ride', icon: DirectionsCarRounded },
    { to: '/rentals', label: 'Rentals', icon: KeyRounded },
    { to: '/trips', label: 'My trips', icon: ReceiptLongRounded },
    { to: '/support', label: 'Help', icon: SupportAgentRounded },
  ],
  driver: [
    { to: '/driver', label: 'Dashboard', icon: SpeedRounded },
    { to: '/support', label: 'Help', icon: SupportAgentRounded },
  ],
  admin: [
    { to: '/admin', label: 'Admin console', icon: DashboardRounded },
  ],
};

function ThemeToggle() {
  const { mode, toggle } = useColorMode();
  return (
    <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
      <IconButton onClick={toggle} aria-label="Toggle colour theme">
        {mode === 'dark' ? <LightModeRounded /> : <DarkModeRounded />}
      </IconButton>
    </Tooltip>
  );
}

function AccountMenu() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const initials = account.fullName.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return (
    <>
      <IconButton onClick={e => setAnchor(e.currentTarget)} aria-label="Account menu" sx={{ p: 0.5 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', color: 'secondary.contrastText', fontSize: 14, fontWeight: 700 }}>{initials}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 220, mt: 1 } } }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{account.fullName}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{account.role === 'customer' ? 'Rider' : account.role}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); navigate(homeFor(account.role)); }}>Home</MenuItem>
        <MenuItem onClick={() => { setAnchor(null); navigate('/account'); }}>Account & settings</MenuItem>
        <MenuItem onClick={async () => { setAnchor(null); await logout(); navigate('/'); }} sx={{ color: 'error.main' }}>Sign out</MenuItem>
      </Menu>
    </>
  );
}

function Header() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 8 });
  const { account, role, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const links = NAV[role || 'guest'];

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        backdropFilter: 'saturate(160%) blur(14px)',
        backgroundColor: alpha(theme.palette.background.default, scrolled ? 0.82 : 0.6),
        borderBottom: `1px solid ${scrolled ? theme.palette.divider : 'transparent'}`,
        transition: 'border-color .2s, background-color .2s',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ gap: 2, minHeight: { xs: 60, md: 68 } }}>
          <Logo to={account ? homeFor(role) : '/'} />
          {desktop && (
            <Stack direction="row" spacing={0.5} sx={{ ml: 3 }} component="nav" aria-label="Main">
              {links.map(link => (
                <Button
                  key={link.to}
                  component={NavLink}
                  to={link.to}
                  end={link.to === '/admin' || link.to === '/driver'}
                  color="inherit"
                  sx={{ color: 'text.secondary', '&.active': { color: 'text.primary', bgcolor: 'action.selected' } }}
                >
                  {link.label}
                </Button>
              ))}
            </Stack>
          )}
          <Box sx={{ flex: 1 }} />
          <ThemeToggle />
          {account ? (
            <>
              <NotificationBell />
              {desktop && <AccountMenu />}
            </>
          ) : desktop && (
            <Stack direction="row" spacing={1}>
              <Button component={RouterLink} to="/login" color="inherit">Sign in</Button>
              <Button component={RouterLink} to="/register" variant="contained">Sign up</Button>
            </Stack>
          )}
          {!desktop && (
            <IconButton onClick={() => setOpen(true)} aria-label="Open menu" edge="end">
              <MenuRounded />
            </IconButton>
          )}
        </Toolbar>
      </Container>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)} slotProps={{ paper: { sx: { width: 'min(320px, 86vw)', p: 2 } } }}>
        <Box sx={{ mb: 2, px: 1 }}><Logo /></Box>
        {account && (
          <Box sx={{ px: 1, mb: 1 }}>
            <Typography variant="subtitle1">{account.fullName}</Typography>
            <Typography variant="body2" color="text.secondary">{account.email}</Typography>
          </Box>
        )}
        <List onClick={() => setOpen(false)}>
          {links.map(({ to, label, icon: Icon }) => (
            <ListItemButton key={to} component={NavLink} to={to} sx={{ borderRadius: 2, '&.active': { bgcolor: 'action.selected' } }}>
              <ListItemIcon sx={{ minWidth: 40 }}><Icon /></ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
          {account && (
            <ListItemButton component={NavLink} to="/account" sx={{ borderRadius: 2 }}>
              <ListItemIcon sx={{ minWidth: 40 }}><PersonRounded /></ListItemIcon>
              <ListItemText primary="Account" />
            </ListItemButton>
          )}
        </List>
        <Divider sx={{ my: 1 }} />
        {account ? (
          <Button startIcon={<LogoutRounded />} color="error" onClick={async () => { setOpen(false); await logout(); navigate('/'); }}>Sign out</Button>
        ) : (
          <Stack spacing={1}>
            <Button component={RouterLink} to="/register" variant="contained" onClick={() => setOpen(false)}>Sign up</Button>
            <Button component={RouterLink} to="/login" variant="outlined" onClick={() => setOpen(false)}>Sign in</Button>
          </Stack>
        )}
      </Drawer>
    </AppBar>
  );
}

const FULL_BLEED = ['/ride', '/driver/jobs', '/trips/'];

export default function AppShell({ children, bare }) {
  const { pathname } = useLocation();
  if (bare) return children;
  const hideFooter = FULL_BLEED.some(prefix => pathname.startsWith(prefix));
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <a href="#main" style={{ position: 'absolute', left: -9999 }} onFocus={e => { e.target.style.left = '8px'; }} onBlur={e => { e.target.style.left = '-9999px'; }}>Skip to content</a>
      <Header />
      <Box component="main" id="main" sx={{ flex: 1 }}>{children}</Box>
      {!hideFooter && <Footer />}
    </Box>
  );
}
