import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import '@/styles/globals.css';
import { App } from './App';

// Mirrors entrypoints/popup/main.tsx's QueryClient options exactly (same
// staleTime/retry/refetchOnWindowFocus). Duplicated rather than extracted —
// lower risk than reaching into the popup's module for a shared shim
// (Story 7.2 Task 5).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        if (
          error &&
          typeof error === 'object' &&
          'kind' in error &&
          error.kind === 'rate-limited'
        ) {
          return true;
        }
        return true;
      },
      retryDelay: (attemptIndex, error) => {
        if (
          error &&
          typeof error === 'object' &&
          'kind' in error &&
          error.kind === 'rate-limited' &&
          'retryAfterMs' in error &&
          typeof error.retryAfterMs === 'number'
        ) {
          return Math.min(error.retryAfterMs, 30_000);
        }
        return Math.min(1000 * 2 ** attemptIndex, 30_000);
      },
      refetchOnWindowFocus: false,
      // Mirrors the popup's refetchOnReconnect: false (Story 7.2 Finding 6) —
      // kept in sync even though the full page does not read today-total.
      refetchOnReconnect: false,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Full-page mount point (#root) missing in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
