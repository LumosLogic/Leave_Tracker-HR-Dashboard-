import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// Key → boolean map. Missing key = true (enabled by default).
const FeatureFlagContext = createContext({});

export function FeatureFlagProvider({ children }) {
  const { token } = useAuth();

  const { data: flags = {} } = useQuery({
    queryKey:            ['org-features'],
    queryFn:             () => apiGet('/org/features'),
    enabled:             !!token,
    staleTime:           0,               // always treat cached data as stale
    refetchInterval:     30 * 1000,       // poll every 30 s in background
    refetchOnWindowFocus: true,           // instant update when user switches back to tab
    refetchOnMount:      true,
    gcTime:              5 * 60 * 1000,
  });

  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

// Returns true if the feature is enabled (or if no flag exists for it).
export function useFeature(key) {
  const flags = useContext(FeatureFlagContext);
  return key in flags ? flags[key] : true;
}

export { FeatureFlagContext };
