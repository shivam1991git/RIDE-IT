import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { buildTheme } from '../theme';

const ColorModeContext = createContext({ mode: 'dark', toggle: () => {} });

function readStored() {
  try {
    return localStorage.getItem('rid-color-mode');
  } catch {
    return null;
  }
}

export function ColorModeProvider({ children }) {
  const prefersLight = useMediaQuery('(prefers-color-scheme: light)');
  const [stored, setStored] = useState(readStored);
  const mode = stored || (prefersLight ? 'light' : 'dark');
  const theme = useMemo(() => buildTheme(mode), [mode]);

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.palette.background.default);
  }, [theme]);

  const value = useMemo(() => ({
    mode,
    toggle: () => {
      const next = mode === 'dark' ? 'light' : 'dark';
      setStored(next);
      try { localStorage.setItem('rid-color-mode', next); } catch { /* storage unavailable */ }
    },
  }), [mode]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export const useColorMode = () => useContext(ColorModeContext);
