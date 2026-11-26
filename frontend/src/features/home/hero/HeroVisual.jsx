import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const HeroScene = lazy(() => import('./HeroScene'));

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// Static fallback: same composition as the 3D scene, as an SVG.
function StaticRoute() {
  return (
    <Box component="svg" viewBox="0 0 400 300" sx={{ width: '100%', height: '100%' }} aria-hidden>
      <defs>
        <pattern id="rid-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity="0.08" />
        </pattern>
      </defs>
      <rect width="400" height="300" fill="url(#rid-grid)" />
      <path d="M40 220 C110 140 150 230 210 160 S320 90 360 110" fill="none" stroke="#2EC4B6" strokeWidth="14" strokeOpacity="0.15" strokeLinecap="round" />
      <path className="rid-route-anim" d="M40 220 C110 140 150 230 210 160 S320 90 360 110" fill="none" stroke="#2EC4B6" strokeWidth="4" strokeLinecap="round" />
      <circle cx="40" cy="220" r="10" fill="#2EC4B6" />
      <rect x="350" y="100" width="20" height="20" rx="4" fill="#FF9F1C" />
      <g transform="translate(180 150) rotate(-24)">
        <rect x="-26" y="-12" width="52" height="24" rx="8" fill="#FF9F1C" />
        <rect x="-12" y="-9" width="22" height="18" rx="5" fill="#14171D" />
      </g>
    </Box>
  );
}

export default function HeroVisual() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(hasWebGL()), []);
  const use3d = desktop && !reducedMotion && webgl;

  return (
    <Box sx={{ position: 'relative', width: '100%', height: { xs: 220, sm: 280, md: 520 }, color: 'text.primary' }}>
      {use3d ? (
        <Suspense fallback={<StaticRoute />}>
          <HeroScene dark={theme.palette.mode === 'dark'} />
        </Suspense>
      ) : <StaticRoute />}
    </Box>
  );
}
