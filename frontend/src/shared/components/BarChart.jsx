import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// Single-series column chart: one validated hue per mode (no legend needed),
// rounded data-ends on the baseline, recessive grid, hover tooltip per column,
// and a visually hidden table for screen readers.
const BAR = { dark: '#1E9C91', light: '#17998D' };

function niceMax(value) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / exp) * exp;
}

function barPath(x, y, w, h, r) {
  if (h <= 0) return '';
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}

export default function BarChart({ data, label, format = v => v, height = 200, caption }) {
  const theme = useTheme();
  const [active, setActive] = useState(null);
  const width = 640;
  const pad = { top: 12, right: 8, bottom: 28, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const step = innerW / Math.max(1, data.length);
  const barW = Math.min(28, step - 2);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 7);
  const ink = theme.palette.text.secondary;

  return (
    <Box sx={{ position: 'relative' }}>
      <Box component="svg" viewBox={`0 0 ${width} ${height}`} sx={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label={caption || label}>
        {ticks.map(tick => {
          const y = pad.top + innerH - (tick / max) * innerH;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke={theme.palette.divider} strokeWidth="1" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={ink}>{format(tick)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = pad.left + i * step + (step - barW) / 2;
          const y = pad.top + innerH - h;
          return (
            <g key={d.label}>
              <path d={barPath(x, y, barW, h, 4)} fill={BAR[theme.palette.mode]} opacity={active === null || active === i ? 1 : 0.45} />
              {(i % labelEvery === 0 || i === data.length - 1) && (
                <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill={ink}>{d.short || d.label}</text>
              )}
              <rect
                x={pad.left + i * step}
                y={pad.top}
                width={step}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${format(d.value)}`}
                style={{ cursor: 'default', outline: 'none' }}
              />
            </g>
          );
        })}
      </Box>
      {active !== null && (
        <Box
          sx={{
            position: 'absolute', pointerEvents: 'none', top: 0,
            left: `${((pad.left + active * step + step / 2) / width) * 100}%`,
            transform: 'translate(-50%, -100%)', bgcolor: 'background.paper', border: 1, borderColor: 'divider',
            borderRadius: 2, px: 1.25, py: 0.75, boxShadow: 3, whiteSpace: 'nowrap',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{data[active].label}</Typography>
          <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{format(data[active].value)}{data[active].extra ? ` · ${data[active].extra}` : ''}</Typography>
        </Box>
      )}
      <Box component="table" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <caption>{caption || label}</caption>
        <tbody>{data.map(d => <tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
      </Box>
    </Box>
  );
}

// Fills missing days with zero so gaps read as "no activity", not as missing data.
export function lastNDays(rows, days, key = 'value') {
  const map = Object.fromEntries(rows.map(row => [row._id, row]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 864e5);
    const id = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return {
      label: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      short: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: map[id]?.[key] || 0,
      row: map[id],
    };
  });
}
