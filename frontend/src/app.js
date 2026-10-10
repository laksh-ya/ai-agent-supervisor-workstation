// src/app.js
import React, { Suspense, lazy } from 'react';
import { ChakraProvider, Flex, Spinner, Text } from '@chakra-ui/react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import theme from './theme';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import { WebSocketProvider } from './context/WebSocketContext';
import { AppDataProvider } from './context/AppDataContext';
import { SettingsProvider } from './context/SettingsContext';
import './styles.css';

const ConversationView = lazy(() => import('./pages/ConversationView'));
const AgentConfig = lazy(() => import('./pages/AgentConfig'));
const Templates = lazy(() => import('./pages/Templates'));
const Settings = lazy(() => import('./pages/Settings'));

const PageFallback = () => (
  <Flex h="60vh" align="center" justify="center" direction="column" gap="12px" role="status" aria-live="polite">
    <Spinner color="brand.500" thickness="3px" size="md" />
    <Text fontSize="12px" color="ink.300">Opening workspace</Text>
  </Flex>
);

// Every toast in the app uses the themed card variant
const toastOptions = { defaultOptions: { position: 'bottom-right', variant: 'toast', isClosable: true, duration: 4000 } };

// Providers that need router context (navigation from toasts) live inside the root route
const Root = () => (
  <AppDataProvider>
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </Layout>
  </AppDataProvider>
);

// Data router: required for useBlocker (unsaved-draft guard in the Control Room)
const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/conversations', element: <ConversationView /> },
      { path: '/conversation/:id', element: <ConversationView /> },
      { path: '/agent-config', element: <AgentConfig /> },
      { path: '/templates', element: <Templates /> },
      { path: '/settings', element: <Settings /> },
      { path: '/analysis', element: <Navigate to="/templates" replace /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
], { future: { v7_relativeSplatPath: true } });

function App() {
  return (
    <ChakraProvider theme={theme} toastOptions={toastOptions}>
      <SettingsProvider>
        <WebSocketProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </WebSocketProvider>
      </SettingsProvider>
    </ChakraProvider>
  );
}

export default App;
