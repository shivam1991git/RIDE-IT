import { useQuery } from '@tanstack/react-query';
import { get } from './api';

// What the API offers right now. Phase 1 runs chauffeur rentals only; instant
// rides come back when the server sets RIDES_ENABLED.
export function useMeta() {
  const { data } = useQuery({ queryKey: ['meta'], queryFn: () => get('/meta'), staleTime: 10 * 60 * 1000 });
  return { ridesEnabled: Boolean(data?.ridesEnabled), support: data?.support || {}, loaded: Boolean(data) };
}

// Rental catalogue: trip types, packages, destinations, prices and policies.
export function useRentalOptions() {
  return useQuery({ queryKey: ['rental-options'], queryFn: () => get('/rentals/options'), staleTime: 5 * 60 * 1000 });
}
