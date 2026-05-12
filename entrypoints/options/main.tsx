import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import '@/styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Options page mount point (#root) missing in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
