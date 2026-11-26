import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import '@fontsource-variable/inter';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import 'leaflet/dist/leaflet.css';
import './app/global.css';
import { ColorModeProvider } from './app/providers/ColorModeProvider';
import { ToastProvider } from './app/providers/ToastProvider';
import { AuthProvider } from './app/providers/AuthProvider';
import { RealtimeProvider } from './app/providers/RealtimeProvider';
import App from './app/App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchOnWindowFocus: true,
      retry: (count, error) => count < 2 && (!error?.status || error.status >= 500),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorModeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <MotionConfig reducedMotion="user">
            <ToastProvider>
              <AuthProvider>
                <RealtimeProvider>
                  <App />
                </RealtimeProvider>
              </AuthProvider>
            </ToastProvider>
          </MotionConfig>
        </BrowserRouter>
      </QueryClientProvider>
    </ColorModeProvider>
  </React.StrictMode>,
);
