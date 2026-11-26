import { lazy, Suspense } from 'react';
import { Box, Card, Skeleton } from '@mui/material';

const RideMap = lazy(() => import('./RideMap'));

// Map-first layout: full-bleed map with a floating panel on desktop,
// map on top and a sheet-style panel below on mobile.
export default function MapLayout({ map, children }) {
  return (
    <Box sx={{ position: 'relative', height: { md: 'calc(100dvh - 68px)' }, display: { xs: 'flex', md: 'block' }, flexDirection: 'column' }}>
      <Box sx={{ position: { md: 'absolute' }, inset: 0, height: { xs: '38vh', sm: '44vh', md: '100%' }, minHeight: 240 }}>
        <Suspense fallback={<Skeleton variant="rectangular" height="100%" />}>
          <RideMap {...map} />
        </Suspense>
      </Box>
      <Card
        sx={{
          position: { md: 'absolute' },
          top: { md: 24 },
          left: { md: 24 },
          bottom: { md: 24 },
          width: { md: 430 },
          mt: { xs: -3, md: 0 },
          zIndex: 500,
          borderRadius: { xs: '24px 24px 0 0', md: 6 },
          borderBottom: { xs: 0, md: 1 },
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 30px 80px -30px rgba(0,0,0,.5)',
        }}
      >
        <Box sx={{ display: { md: 'none' }, width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.25 }} />
        <Box sx={{ p: { xs: 2.5, sm: 3 }, overflowY: { md: 'auto' }, flex: 1 }}>{children}</Box>
      </Card>
    </Box>
  );
}
