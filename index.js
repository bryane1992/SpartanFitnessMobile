import { registerRootComponent } from 'expo';
import './src/utils/locationTask'; // register background location task before app mounts

import React from 'react';
import App from './App';
import ErrorBoundary from './src/components/ErrorBoundary';

function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

registerRootComponent(Root);
