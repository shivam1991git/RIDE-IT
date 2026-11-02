import { createContext, useCallback, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { get, post } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await get('/auth/session')).account,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Drop cached data from the previous session, but keep the ['me'] query that
  // this provider is subscribed to (clearing it would leave the hook stale).
  const resetOtherQueries = useCallback(() => {
    queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'me' });
  }, [queryClient]);

  const setAccount = useCallback(account => {
    queryClient.setQueryData(['me'], account);
  }, [queryClient]);

  const login = useCallback(async credentials => {
    const { account } = await post('/auth/login', credentials);
    resetOtherQueries();
    setAccount(account);
    return account;
  }, [resetOtherQueries, setAccount]);

  const register = useCallback(async payload => {
    const result = await post('/auth/register', payload);
    if (!result.pendingApproval) {
      resetOtherQueries();
      setAccount(result.account);
    }
    return result;
  }, [resetOtherQueries, setAccount]);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    resetOtherQueries();
    setAccount(null);
  }, [resetOtherQueries, setAccount]);

  const value = useMemo(() => ({
    account: data || null,
    role: data?.role || null,
    loading: isLoading,
    login,
    register,
    logout,
    setAccount,
  }), [data, isLoading, login, register, logout, setAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const homeFor = role => ({ customer: '/ride', driver: '/driver', admin: '/admin' }[role] || '/');

export function RequireRole({ roles, children }) {
  const { account, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress aria-label="Loading your account" />
      </Box>
    );
  }
  if (!account) {
    const loginPath = roles.length === 1 && roles[0] === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  }
  if (!roles.includes(account.role)) return <Navigate to={homeFor(account.role)} replace />;
  return children;
}
