import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { get } from '../../shared/api/apiClient';
import { useAuth } from './AuthProvider';
import { useToast } from './ToastProvider';

const RealtimeContext = createContext({ connected: false });

// Socket.IO is a speed-up, not a dependency: pages also poll, so the app keeps
// working when the socket cannot connect (e.g. API cold start on a free host).
export function RealtimeProvider({ children }) {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!account) return undefined;
    let socket;
    let cancelled = false;

    (async () => {
      try {
        const { token } = await get('/auth/socket-token');
        if (cancelled) return;
        socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 5,
        });
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));
        socket.on('booking:update', ({ id }) => {
          queryClient.invalidateQueries({ queryKey: ['booking', id] });
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
          queryClient.invalidateQueries({ queryKey: ['driver'] });
          queryClient.invalidateQueries({ queryKey: ['admin'] });
        });
        socket.on('ride:new', () => queryClient.invalidateQueries({ queryKey: ['driver', 'requests'] }));
        socket.on('rental:new', () => queryClient.invalidateQueries({ queryKey: ['driver', 'requests'] }));
        socket.on('support:new', () => queryClient.invalidateQueries({ queryKey: ['admin', 'support'] }));
        socket.on('sos', ({ rider }) => {
          queryClient.invalidateQueries({ queryKey: ['admin'] });
          toast.error(`SOS from ${rider || 'a rider'} — open Support now`);
        });
        socket.on('notification', notification => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          toast.info(notification.title);
        });
      } catch {
        setConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      setConnected(false);
      socket?.disconnect();
    };
  }, [account?._id, account?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  return <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>;
}

// Pages poll faster (≈6s instead of 30s) while `connected` is false.
export const useRealtime = () => useContext(RealtimeContext);
