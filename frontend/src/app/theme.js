import { createTheme, alpha } from '@mui/material/styles';

// RIDE-IT design tokens.
// Saffron (marigold, ghats at dusk) is the single action colour; teal marks
// routes and live status. Everything else is quiet graphite or warm paper.
export const tokens = {
  saffron: '#FF9F1C',
  saffronDeep: '#E07B00',
  teal: '#2EC4B6',
  dark: {
    bg: '#0B0C0F',
    surface: '#13151A',
    raised: '#1B1E25',
    border: 'rgba(255,255,255,0.08)',
    text: '#F3F4F6',
    muted: '#9AA1AD',
  },
  light: {
    bg: '#F6F4EF',
    surface: '#FFFFFF',
    raised: '#FBFAF7',
    border: 'rgba(17,19,24,0.10)',
    text: '#111318',
    muted: '#5A606C',
  },
  radius: { sm: 10, md: 14, lg: 20, xl: 28 },
  fontDisplay: '"Sora", "Inter Variable", system-ui, sans-serif',
  fontBody: '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
};

function palette(mode) {
  const t = tokens[mode];
  return {
    mode,
    primary: { main: tokens.saffron, dark: tokens.saffronDeep, contrastText: '#120C02' },
    secondary: { main: tokens.teal, contrastText: '#041311' },
    success: { main: mode === 'dark' ? '#3DDC97' : '#1E9E64' },
    warning: { main: '#FFC145' },
    error: { main: mode === 'dark' ? '#FF6B6B' : '#D93838' },
    info: { main: '#5AA9FF' },
    background: { default: t.bg, paper: t.surface },
    text: { primary: t.text, secondary: t.muted },
    divider: t.border,
    raised: t.raised,
  };
}

export function buildTheme(mode) {
  const t = tokens[mode];
  const theme = createTheme({
    palette: palette(mode),
    // 4px unit so sx={{ borderRadius: 6 }} means 24px; components set their
    // own radii from the tokens below.
    shape: { borderRadius: 4 },
    spacing: 8,
    typography: {
      fontFamily: tokens.fontBody,
      h1: { fontFamily: tokens.fontDisplay, fontWeight: 700, fontSize: 'clamp(2.4rem, 5.6vw, 4.4rem)', lineHeight: 1.04, letterSpacing: '-0.035em' },
      h2: { fontFamily: tokens.fontDisplay, fontWeight: 700, fontSize: 'clamp(1.8rem, 3.6vw, 2.75rem)', lineHeight: 1.1, letterSpacing: '-0.03em' },
      h3: { fontFamily: tokens.fontDisplay, fontWeight: 600, fontSize: 'clamp(1.4rem, 2.4vw, 1.9rem)', lineHeight: 1.2, letterSpacing: '-0.02em' },
      h4: { fontFamily: tokens.fontDisplay, fontWeight: 600, fontSize: '1.35rem', letterSpacing: '-0.015em' },
      h5: { fontFamily: tokens.fontDisplay, fontWeight: 600, fontSize: '1.1rem' },
      h6: { fontFamily: tokens.fontDisplay, fontWeight: 600, fontSize: '1rem' },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600, fontSize: '0.875rem' },
      body1: { fontSize: '1rem', lineHeight: 1.6 },
      body2: { fontSize: '0.9rem', lineHeight: 1.55 },
      overline: { fontWeight: 600, letterSpacing: '0.14em', fontSize: '0.72rem' },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: mode },
          body: { backgroundColor: t.bg, WebkitFontSmoothing: 'antialiased' },
          '::selection': { background: alpha(tokens.saffron, 0.35) },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, paddingInline: 20, minHeight: 42 },
          sizeLarge: { minHeight: 52, paddingInline: 28, fontSize: '1rem' },
          sizeSmall: { minHeight: 32, paddingInline: 14 },
          outlined: { borderColor: t.border },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: tokens.radius.md }, outlined: { borderColor: t.border } },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { borderRadius: tokens.radius.lg, borderColor: t.border, backgroundColor: t.surface } },
      },
      MuiTextField: { defaultProps: { fullWidth: true } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            backgroundColor: t.raised,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: t.border },
          },
        },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 999 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: tokens.radius.xl, border: `1px solid ${t.border}` } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: tokens.radius.md } } },
      MuiLink: { defaultProps: { underline: 'hover' } },
    },
  });
  theme.tokens = { ...tokens, current: t };
  return theme;
}
