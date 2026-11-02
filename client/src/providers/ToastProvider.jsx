import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((severity, message) => {
    setToast({ severity, message, key: Date.now() });
  }, []);

  const value = useMemo(() => ({
    success: message => show('success', message),
    error: message => show('error', message),
    info: message => show('info', message),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={toast?.key}
        open={Boolean(toast)}
        autoHideDuration={4500}
        onClose={(event, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, sm: 24 } }}
      >
        {toast ? (
          <Alert variant="filled" severity={toast.severity} onClose={() => setToast(null)} sx={{ fontWeight: 500 }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
