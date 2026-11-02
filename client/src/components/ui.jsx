// Small shared building blocks used across pages.
import { Box, Card, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { STATUS } from '../lib/format';

export function StatusChip({ status, size = 'small' }) {
  const meta = STATUS[status] || { label: status, tone: 'default' };
  const live = ['requested', 'accepted', 'arrived', 'in_progress'].includes(status);
  return (
    <Chip
      size={size}
      label={meta.label}
      color={meta.tone === 'default' ? 'default' : meta.tone}
      variant={meta.tone === 'default' ? 'outlined' : 'filled'}
      icon={live ? <Box component="span" className="rid-pulse" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'currentColor', ml: '8px !important' }} /> : undefined}
      sx={{ fontWeight: 600 }}
    />
  );
}

export function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' }, mb: 4 }}>
      <Box>
        {eyebrow && <Typography variant="overline" color="primary">{eyebrow}</Typography>}
        <Typography variant="h2" component="h1">{title}</Typography>
        {subtitle && <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 640 }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <Card sx={{ p: { xs: 4, md: 6 }, textAlign: 'center', borderStyle: 'dashed' }}>
      {Icon && (
        <Box sx={{ width: 56, height: 56, borderRadius: 4, mx: 'auto', mb: 2, display: 'grid', placeItems: 'center', bgcolor: theme => alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
          <Icon />
        </Box>
      )}
      <Typography variant="h5">{title}</Typography>
      {body && <Typography color="text.secondary" sx={{ mt: 1, mb: action ? 3 : 0, maxWidth: 420, mx: 'auto' }}>{body}</Typography>}
      {action}
    </Card>
  );
}

export function StatCard({ label, value, hint, icon: Icon, accent = 'primary' }) {
  return (
    <Card sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        {Icon && <Icon sx={{ color: `${accent}.main`, fontSize: 20 }} />}
      </Stack>
      <Typography sx={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: { xs: 26, md: 30 }, letterSpacing: '-0.03em', mt: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Card>
  );
}

export function CardSkeleton({ rows = 3, height = 72 }) {
  return (
    <Stack spacing={1.5} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} variant="rounded" height={height} sx={{ borderRadius: 4 }} />)}
    </Stack>
  );
}

export function FareBreakdown({ lines, total }) {
  return (
    <Stack spacing={0.75}>
      {lines?.map(line => (
        <Stack key={line.label} direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">{line.label}</Typography>
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>₹{line.amount.toFixed(2)}</Typography>
        </Stack>
      ))}
      <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle1">Total</Typography>
        <Typography variant="subtitle1" sx={{ fontVariantNumeric: 'tabular-nums' }}>₹{Math.round(total)}</Typography>
      </Stack>
    </Stack>
  );
}

export function RouteLine({ pickup, drop, dense }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
      <Stack sx={{ alignItems: 'center', pt: 0.75 }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'secondary.main' }} />
        <Box sx={{ width: 2, flex: 1, minHeight: dense ? 14 : 22, my: 0.5, bgcolor: 'divider' }} />
        <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: 'primary.main' }} />
      </Stack>
      <Stack spacing={dense ? 0.75 : 1.5} sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{pickup?.name}</Typography>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{drop?.name}</Typography>
      </Stack>
    </Stack>
  );
}
