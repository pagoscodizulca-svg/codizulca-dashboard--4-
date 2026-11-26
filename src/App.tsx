/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { startBuildVersionWatcher } from './lib/buildVersionWatcher';
import { AuthGuard } from './components/layout/AuthGuard';
import { MainLayout } from './components/layout/MainLayout';
import { Login } from './pages/Login';
import { PortalMigrationRedirect } from './components/layout/PortalMigrationRedirect';
import { prefetchDashboardOverviewBootstrap } from './lib/dashboardOverviewBootstrap';

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const reloadKey = 'codizulca_chunk_retry_reload_ts';
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(reloadKey);
      } catch {}
      return mod;
    } catch (error) {
      let shouldReload = true;
      try {
        const lastReloadTs = Number(sessionStorage.getItem(reloadKey) || '0');
        if (lastReloadTs > 0 && Date.now() - lastReloadTs < 15000) {
          shouldReload = false;
        }
      } catch {}
      if (shouldReload) {
        try {
          sessionStorage.setItem(reloadKey, String(Date.now()));
          if ('caches' in window) {
            await caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
          }
          if ('serviceWorker' in navigator) {
            await navigator.serviceWorker
              .getRegistrations()
              .then((regs) => Promise.all(regs.map((r) => r.unregister())));
          }
        } catch {}
        window.location.reload();
        return await new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}

const loadDashboardOverviewChunk = () => import('./pages/DashboardOverview').then(m => ({ default: m.DashboardOverview }));

// Precargar chunk y datos del primer módulo en paralelo al arrancar /dashboard (elimina cascada)
if (typeof window !== 'undefined') {
  const p = window.location.pathname || '/';
  if (p === '/' || p === '/dashboard' || p === '/dashboard/') {
    void loadDashboardOverviewChunk();
    prefetchDashboardOverviewBootstrap();
  }
}

const DashboardOverview = lazyWithRetry(loadDashboardOverviewChunk);
const Cuotas = lazyWithRetry(() => import('./pages/Cuotas').then(m => ({ default: m.Cuotas })));
const Ventas = lazyWithRetry(() => import('./pages/Ventas').then(m => ({ default: m.Ventas })));
const Clientes = lazyWithRetry(() => import('./pages/Clientes').then(m => ({ default: m.Clientes })));
const Productos = lazyWithRetry(() => import('./pages/Productos').then(m => ({ default: m.Productos })));
const Inventario = lazyWithRetry(() => import('./pages/Inventario').then(m => ({ default: m.Inventario })));
const GeofenceReview = lazyWithRetry(() => import('./pages/GeofenceReview').then(m => ({ default: m.GeofenceReview })));
const Trazabilidad = lazyWithRetry(() => import('./pages/Trazabilidad').then(m => ({ default: m.Trazabilidad })));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh] bg-black/95 text-zinc-400 text-sm">
    Cargando módulo...
  </div>
);

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  declare props: { children: React.ReactNode };
  state = { hasError: false, errorMsg: '' };

  constructor(props: { children: React.ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error?.message || 'Error inesperado al cargar la vista' };
  }

  componentDidCatch(error: Error) {
    console.error('[AppErrorBoundary] Error capturado:', error);
  }

  handleRecover = () => {
    try {
      sessionStorage.removeItem('codizulca_chunk_retry_reload');
      if ('caches' in window) {
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
      }
    } catch {}
    (this as any).setState({ hasError: false, errorMsg: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-sm w-full bg-[#141414] border border-red-500/30 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-base mx-auto">
              CZ
            </div>
            <h2 className="text-base font-black text-white">Actualizando módulo de información</h2>
            <p className="text-xs text-zinc-400">
              Se detectó una actualización o interrupción temporal al cargar los datos. Presiona el botón para continuar sin perder tu información guardada.
            </p>
            <button
              type="button"
              onClick={this.handleRecover}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider cursor-pointer transition-colors"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => startBuildVersionWatcher(), []);

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Login de Administración / Gerencia */}
              <Route path="/login" element={<Login />} />

              <Route element={<AuthGuard />}>
                <Route path="/dashboard" element={<MainLayout />}>
                  <Route index element={<DashboardOverview />} />
                  <Route path="cuotas" element={<Cuotas />} />
                  <Route path="ventas" element={<Ventas />} />
                  <Route path="clientes" element={<Clientes />} />
                  <Route path="productos" element={<Productos />} />
                  <Route path="inventario" element={<Inventario />} />
                  <Route path="trade" element={<Navigate to="/dashboard" replace />} />
                  <Route path="trade/*" element={<Navigate to="/dashboard" replace />} />
                  <Route path="geofence-review" element={<GeofenceReview />} />
                  <Route path="trazabilidad" element={<Trazabilidad />} />
                  <Route path="admin" element={<Trazabilidad />} />
                </Route>
              </Route>

              {/* Rutas de /portal y /portal/* (Redirección Segura hacia Programa de Trade Marketing) */}
              <Route path="/portal" element={<PortalMigrationRedirect />} />
              <Route path="/portal/*" element={<PortalMigrationRedirect />} />

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
