// Small shared building blocks used across pages.
import { Box, Card, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { friendlyDateTime, PREFERENCES, STATUS } from '../utils/format';

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
          <Typography variant="body2" color={line.amount < 0 ? 'success.main' : 'text.secondary'}>{line.label}</Typography>
          <Typography variant="body2" color={line.amount < 0 ? 'success.main' : undefined} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {line.amount < 0 ? '−' : ''}₹{Math.abs(line.amount).toFixed(2)}
          </Typography>
        </Stack>
      ))}
      <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle1">Total</Typography>
        <Typography variant="subtitle1" sx={{ fontVariantNumeric: 'tabular-nums' }}>₹{Math.round(total)}</Typography>
      </Stack>
    </Stack>
  );
}

// What the driver needs to know beyond the route: pickup time for scheduled
// rides, waiting at stops, rider preferences and their note.
export function RideExtras({ booking, dense }) {
  const prefs = PREFERENCES.filter(([key]) => booking.preferences?.[key]);
  const waitMin = (booking.stops || []).reduce((sum, stop) => sum + (stop.waitMin || 0), 0);
  if (!prefs.length && !booking.noteToDriver && !waitMin && !booking.scheduledFor) return null;
  return (
    <Stack spacing={0.75} sx={{ mt: dense ? 1 : 0 }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {booking.scheduledFor && <Chip size="small" color="info" variant="outlined" label={`Pickup ${friendlyDateTime(booking.scheduledFor)}`} />}
        {waitMin > 0 && <Chip size="small" variant="outlined" label={`Wait ${waitMin} min at stops`} />}
        {prefs.map(([key, label]) => <Chip key={key} size="small" label={label} />)}
      </Stack>
      {booking.noteToDriver && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }} noWrap={dense}>“{booking.noteToDriver}”</Typography>
      )}
    </Stack>
  );
}

// Pickup → (stops) → drop, as a vertical timeline. Dense mode collapses stops into a count.
export function RouteLine({ pickup, drop, stops = [], dense }) {
  const rows = [{ kind: 'pickup', place: pickup }];
  if (dense && stops.length) rows.push({ kind: 'stop', label: `${stops.length} stop${stops.length > 1 ? 's' : ''}` });
  else stops.forEach(stop => rows.push({ kind: 'stop', place: stop }));
  rows.push({ kind: 'drop', place: drop });
  const dot = kind => ({
    width: 9, height: 9, flexShrink: 0,
    borderRadius: kind === 'drop' ? '2px' : '50%',
    bgcolor: kind === 'pickup' ? 'secondary.main' : kind === 'drop' ? 'primary.main' : 'text.secondary',
  });
  return (
    <Stack sx={{ minWidth: 0 }}>
      {rows.map((row, index) => (
        <Stack key={`${row.kind}-${index}`} direction="row" spacing={1.5} sx={{ minWidth: 0 }}>
          <Stack sx={{ alignItems: 'center', pt: 0.75 }}>
            <Box sx={dot(row.kind)} />
            {index < rows.length - 1 && <Box sx={{ width: 2, flex: 1, minHeight: dense ? 10 : 16, my: 0.5, bgcolor: 'divider' }} />}
          </Stack>
          <Box sx={{ minWidth: 0, pb: index < rows.length - 1 ? (dense ? 0.5 : 1) : 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: row.kind === 'stop' ? 500 : 600, color: row.kind === 'stop' ? 'text.secondary' : undefined }}>
              {row.label || row.place?.name}
            </Typography>
            {!dense && row.kind === 'stop' && row.place?.waitMin > 0 && (
              <Typography variant="caption" color="text.secondary">Driver waits {row.place.waitMin} min</Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
