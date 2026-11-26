import { Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function Logo({ to = '/', size = 30 }) {
  return (
    <Box
      component={RouterLink}
      to={to}
      aria-label="RIDE-IT home"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.1, textDecoration: 'none', color: 'text.primary' }}
    >
      <Box component="svg" viewBox="0 0 64 64" sx={{ width: size, height: size, flexShrink: 0 }} aria-hidden>
        <rect width="64" height="64" rx="16" fill="#FF9F1C" />
        <path d="M18 44V20h14.5c6 0 10 3.6 10 8.8 0 3.9-2.2 6.8-5.8 8L44 44h-7.6l-6.4-6.6h-4.8V44H18zm7.2-12.6h6.9c2.4 0 3.9-1.2 3.9-3.2s-1.5-3.2-3.9-3.2h-6.9v6.4z" fill="#120C02" />
        <circle cx="48" cy="18" r="4" fill="#120C02" />
      </Box>
      <Box component="span" sx={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: size * 0.62, letterSpacing: '-0.03em' }}>
        RIDE<Box component="span" sx={{ color: 'primary.main' }}>·</Box>IT
      </Box>
    </Box>
  );
}
