// Side-view vehicle illustrations, drawn in code so they stay crisp, theme-aware
// and weigh nothing. Shapes are stylised, not copies of any real vehicle.
const SHAPES = {
  sedan: {
    body: 'M8 38C8 32 12 30 18 29L34 27 46 16C49 13 53 12 57 12H78C83 12 87 14 90 17L99 27 108 29C113 30 116 33 116 38V42C116 44 114 45 112 45H12C10 45 8 44 8 42Z',
    windows: ['M48 27 56 17C57 16 59 15 61 15H68V27Z', 'M72 27V15H79C81 15 83 16 84 18L91 27Z'],
    wheels: [[30, 45, 9], [94, 45, 9]],
  },
  mini: {
    body: 'M10 38C10 32 14 30 20 29L36 27 48 15C51 12 55 11 59 11H92C97 11 99 13 101 17L106 28C109 30 110 33 110 38V42C110 44 108 45 106 45H14C12 45 10 44 10 42Z',
    windows: ['M50 27 58 16C59 15 61 14 63 14H74V27Z', 'M78 27V14H92C94 14 95 15 96 17L100 27Z'],
    wheels: [[32, 45, 9], [90, 45, 9]],
  },
  suv: {
    body: 'M6 40C6 33 10 30 16 29L30 27 40 12C42 9 45 8 49 8H98C103 8 106 10 108 14L112 26C115 28 116 32 116 38V42C116 44 114 45 112 45H10C8 45 6 44 6 42Z',
    windows: ['M42 26 49 12H66V26Z', 'M70 26V12H86V26Z', 'M90 26V12H100C102 12 103 13 104 15L108 26Z'],
    wheels: [[30, 45, 10], [94, 45, 10]],
  },
  auto: {
    body: 'M30 10H84C90 10 94 14 94 20V40H24V18C24 14 26 10 30 10ZM94 22 106 31V40H94Z',
    windows: ['M32 15H56V30H30V18C30 16 31 15 32 15Z', 'M60 15H86C88 15 89 16 89 18V30H60Z'],
    wheels: [[38, 45, 8], [100, 45, 7]],
  },
};
SHAPES.hatch = SHAPES.mini;
SHAPES['compact-suv'] = SHAPES.suv;
SHAPES.mpv = SHAPES.suv;

export const CATEGORY_COLORS = { auto: '#2EC4B6', mini: '#F3F4F6', sedan: '#9AA1AD', suv: '#FF9F1C' };

export default function VehicleArt({ kind = 'sedan', color, width = 120, title }) {
  const shape = SHAPES[kind] || SHAPES.sedan;
  const fill = color || CATEGORY_COLORS[kind] || '#9AA1AD';
  return (
    <svg viewBox="0 0 122 58" width={width} height={(width * 58) / 122} style={{ maxWidth: '100%', height: 'auto', minWidth: 0 }} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <ellipse cx="61" cy="54" rx="52" ry="3" fill="currentColor" opacity="0.12" />
      <path d={shape.body} fill={fill} />
      <path d={shape.body} fill="url(#rid-sheen)" opacity="0.35" />
      {shape.windows.map(d => <path key={d} d={d} fill="#11141A" opacity="0.85" />)}
      {shape.wheels.map(([cx, cy, r]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r={r} fill="#0B0C0F" />
          <circle cx={cx} cy={cy} r={r * 0.45} fill="#6B7280" />
        </g>
      ))}
      <defs>
        <linearGradient id="rid-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
