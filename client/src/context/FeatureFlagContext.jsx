import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// FeatureFlagContext — plain flags object (backward compatible with direct useContext callers)
const FeatureFlagContext = createContext({});
// Separate loaded sentinel so sidebar filters can avoid the {} flash
const FeatureFlagsLoadedContext = createContext(false);

export function FeatureFlagProvider({ children }) {
  const { token } = useAuth();

  const { data: flags = {}, isSuccess } = useQuery({
    queryKey:             ['org-features'],
    queryFn:              () => apiGet('/features'),
    enabled:              !!token,
    staleTime:            5 * 60 * 1000,  // fresh for 5 min — no unnecessary background refetch
    refetchInterval:      5 * 60 * 1000,  // poll every 5 min
    refetchOnWindowFocus: true,
    refetchOnMount:       true,
    gcTime:               30 * 60 * 1000, // keep cache 30 min — prevents {} flash when switching tabs
  });

  return (
    <FeatureFlagsLoadedContext.Provider value={isSuccess}>
      <FeatureFlagContext.Provider value={flags}>
        {children}
      </FeatureFlagContext.Provider>
    </FeatureFlagsLoadedContext.Provider>
  );
}

// Returns true if the feature is enabled (or if no flag exists for it).
// Returns false during initial load to prevent feature-gated items flashing visible.
export function useFeature(key) {
  const flags  = useContext(FeatureFlagContext);
  const loaded = useContext(FeatureFlagsLoadedContext);
  if (!loaded) return false;
  return key in flags ? flags[key] : true;
}

export { FeatureFlagContext, FeatureFlagsLoadedContext };
