import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';

const CLIENT_BASE_PATH = process.env.CLIENT_BASE_PATH || '/';

const MainApp = () => {
  return (
    <BrowserRouter basename={CLIENT_BASE_PATH}>
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-lg rounded-lg border bg-card p-6 text-center">
              <h1 className="text-lg font-semibold">页面暂时无法显示</h1>
              <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
              <button className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground" onClick={resetErrorBoundary}>重新加载</button>
            </div>
          </div>
        )}
      >
        <RoutesComponent />
        {createPortal(<Toaster />, document.body)}
      </ErrorBoundary>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);
