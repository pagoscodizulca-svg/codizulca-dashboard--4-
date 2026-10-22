/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { AuthGuard } from './components/layout/AuthGuard';
import { MainLayout } from './components/layout/MainLayout';
import { Login } from './pages/Login';
import { CampoLayout } from './components/layout/CampoLayout';
import { PortalLogin } from './pages/mobile/PortalLogin';
import { CampoRuta } from './pages/mobile/CampoRuta';
import { CampoAsistencia } from './pages/mobile/CampoAsistencia';
import { CampoEncuestas } from './pages/mobile/CampoEncuestas';
import { CampoInventario } from './pages/mobile/CampoInventario';
import { CampoPrecios } from './pages/mobile/CampoPrecios';
import { CampoMerchandising } from './pages/mobile/CampoMerchandising';
import { PortalPerfil } from './pages/mobile/PortalPerfil';

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      const reloadKey = 'codizulca_chunk_retry_reload';
      const hasReloaded = sessionStorage.getItem(reloadKey);
      if (!hasReloaded) {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      }
      throw error;
    }
  });
}

const DashboardOverview = lazyWithRetry(() => import('./pages/DashboardOverview').then(m => ({ default: m.DashboardOverview })));
const Cuotas = lazyWithRetry(() => import('./pages/Cuotas').then(m => ({ default: m.Cuotas })));
const Ventas = lazyWithRetry(() => import('./pages/Ventas').then(m => ({ default: m.Ventas })));
const Clientes = lazyWithRetry(() => import('./pages/Clientes').then(m => ({ default: m.Clientes })));
const Productos = lazyWithRetry(() => import('./pages/Productos').then(m => ({ default: m.Productos })));
const Inventario = lazyWithRetry(() => import('./pages/Inventario').then(m => ({ default: m.Inventario })));
const TradeMarketing = lazyWithRetry(() => import('./pages/TradeMarketing').then(m => ({ default: m.TradeMarketing })));
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
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
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
    this.setState({ hasError: false, errorMsg: '' });
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
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Login de Administración / Gerencia */}
              <Route path="/login" element={<Login />} />
              
              {/* Login Móvil Oficial para Promotoras e Impulsadoras de Campo */}
              <Route path="/portal/login" element={<PortalLogin />} />

              <Route element={<AuthGuard />}>
                <Route path="/dashboard" element={<MainLayout />}>
                  <Route index element={<DashboardOverview />} />
                  <Route path="cuotas" element={<Cuotas />} />
                  <Route path="ventas" element={<Ventas />} />
                  <Route path="clientes" element={<Clientes />} />
                  <Route path="productos" element={<Productos />} />
                  <Route path="inventario" element={<Inventario />} />
                  <Route path="trade" element={<TradeMarketing />} />
                  <Route path="geofence-review" element={<GeofenceReview />} />
                  <Route path="trazabilidad" element={<Trazabilidad />} />
                  <Route path="admin" element={<Trazabilidad />} />
                </Route>
              </Route>

              {/* Codizulca Campo PWA Mobile Portal Routes (CampoLayout valida su propia sesión y redirige a /portal/login) */}
              <Route path="/portal" element={<CampoLayout />}>
                <Route index element={<Navigate to="/portal/ruta" replace />} />
                <Route path="ruta" element={<CampoRuta />} />
                <Route path="checkin" element={<CampoAsistencia />} />
                <Route path="asistencia" element={<CampoAsistencia />} />
                <Route path="encuestas" element={<CampoEncuestas />} />
                <Route path="precios" element={<CampoPrecios />} />
                <Route path="inventario" element={<CampoInventario />} />
                <Route path="merchandising" element={<CampoMerchandising />} />
                <Route path="perfil" element={<PortalPerfil />} />
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
