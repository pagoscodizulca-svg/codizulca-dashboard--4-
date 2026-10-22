import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Store,
  MapPin,
  CheckSquare,
  ClipboardList,
  Tag,
  Package,
  Layers,
  Users,
  LogOut,
  Wifi,
  WifiOff,
  Sparkles,
  RefreshCw,
  X,
  AlertCircle,
  Clock,
  UserCheck
} from 'lucide-react';
import { campoService, PROMOTERS_LIST, TRADE_COORDINATOR_PROFILE } from '../../lib/campoService';
import { checkinsService } from '../../lib/checkinsService';
import { matchPromoterName } from '../../lib/degustacionesService';
import { trazabilidadService } from '../../lib/trazabilidadService';
import { FueraDeHorarioScreen } from '../mobile/FueraDeHorarioScreen';

export const CampoLayout: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Verificación de Autenticación de Promotora
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => campoService.isAuthenticatedPromoter());

  // Estados del Layout
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [activePromoter, setActivePromoter] = useState(() => campoService.getActivePromoter());
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(() => campoService.getQueue().length);
  const [isFlushingQueue, setIsFlushingQueue] = useState<boolean>(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const [showProfileBanner, setShowProfileBanner] = useState<boolean>(true);
  const [isWithinHours, setIsWithinHours] = useState<boolean>(() => campoService.isWithinCommercialHours());

  // 1. Detección Inteligente y Autenticación
  useEffect(() => {
    // Si tiene sesión activa de Coordinación en el Dashboard, sincronizarla automáticamente con el Portal
    if (!campoService.isAuthenticatedPromoter()) {
      try {
        const rawCorp = localStorage.getItem('codizulca_dashboard_profile');
        if (rawCorp) {
          const parsedCorp = JSON.parse(rawCorp);
          if (parsedCorp?.roleKey === 'trade_marketing') {
            campoService.setActivePromoter(TRADE_COORDINATOR_PROFILE);
            localStorage.setItem('portal_auth_token', 'AUTH-COORD-' + Date.now().toString());
            localStorage.setItem('portal_authenticated_user_id', TRADE_COORDINATOR_PROFILE.id);
            setActivePromoter(TRADE_COORDINATOR_PROFILE);
            setIsAuthenticated(true);
          }
        }
      } catch {
        // ignore
      }
    }

    // Si no está autenticado, redirigir a login de promotoras
    if (!campoService.isAuthenticatedPromoter()) {
      setIsAuthenticated(false);
      navigate('/portal/login', { replace: true });
      return;
    }

    let currentProfile = campoService.getActivePromoter();
    const emailParam = searchParams.get('email');
    const userParam = searchParams.get('user') || searchParams.get('promoter');
    const roleParam = searchParams.get('role');

    if (emailParam || userParam || roleParam) {
      const allProfiles = [TRADE_COORDINATOR_PROFILE, ...PROMOTERS_LIST];
      const found = allProfiles.find((p) => {
        if (emailParam && p.email.trim().toLowerCase() === emailParam.trim().toLowerCase()) return true;
        if (userParam && (p.email.trim().toLowerCase() === userParam.trim().toLowerCase() || matchPromoterName(p.name, userParam))) return true;
        if (roleParam?.toLowerCase() === 'merchandising' && p.role === 'Promotor Merchandising') return true;
        if (roleParam?.toLowerCase().includes('coordinador') && p.role === 'Coordinadora Trade Marketing') return true;
        return false;
      });

      // Seguridad: los parámetros de URL NUNCA permiten cambiar de identidad; solo se aplican
      // si corresponden exactamente al usuario autenticado en esta sesión.
      const authenticatedId = localStorage.getItem('portal_authenticated_user_id');
      if (found && found.id === authenticatedId) {
        campoService.setActivePromoter(found);
        setActivePromoter(found);
        currentProfile = found;
      }
    }

    // Sincronizar automáticamente la coordenada GPS y dirección física real de la promotora conectada
    trazabilidadService.syncCurrentUserGpsLocation({
      name: currentProfile.name,
      email: currentProfile.email,
      role: currentProfile.role,
      photoUrl: currentProfile.photoUrl,
      isMobilePortal: true
    }).catch(() => {});
  }, [searchParams, navigate]);

  // 2. Monitoreo de Conectividad & Sincronización Automática
  useEffect(() => {
    const syncPendingAndLocalCheckins = async () => {
      try {
        const [resCampo, resCheckins] = await Promise.all([
          campoService.flushQueue(),
          checkinsService.flushOfflineQueue(),
        ]);
        await checkinsService.getAllCheckIns(true);
        const totalSynced = (resCampo?.synced || 0) + (resCheckins?.syncedCount || 0);
        if (totalSynced > 0) {
          setSyncToastMessage(`¡Conexión restaurada! Se sincronizaron ${totalSynced} registros pendientes.`);
          setTimeout(() => setSyncToastMessage(null), 5000);
        }
        setPendingQueueCount((resCampo?.remaining || 0) + (resCheckins?.remainingCount || 0));
      } catch {}
    };

    const handleOnline = async () => {
      setIsOnline(true);
      await syncPendingAndLocalCheckins();
    };

    if (navigator.onLine) {
      syncPendingAndLocalCheckins();
    }

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdated = (e: any) => {
      setPendingQueueCount(e.detail?.count || 0);
    };

    const handlePromoterChanged = () => {
      setActivePromoter(campoService.getActivePromoter());
    };

    const handleLogout = () => {
      setIsAuthenticated(false);
      navigate('/portal/login', { replace: true });
    };

    const handleHoursChanged = () => {
      setIsWithinHours(campoService.isWithinCommercialHours());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('codizulca_sync_queue_updated', handleQueueUpdated);
    window.addEventListener('codizulca_promoter_changed', handlePromoterChanged);
    window.addEventListener('codizulca_promoter_logout', handleLogout);
    window.addEventListener('codizulca_hours_changed', handleHoursChanged);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('codizulca_sync_queue_updated', handleQueueUpdated);
      window.removeEventListener('codizulca_promoter_changed', handlePromoterChanged);
      window.removeEventListener('codizulca_promoter_logout', handleLogout);
      window.removeEventListener('codizulca_hours_changed', handleHoursChanged);
    };
  }, [navigate]);

  const handleManualSync = async () => {
    if (!navigator.onLine) {
      alert('Sin conexión a internet. Los registros están guardados en tu teléfono de forma segura.');
      return;
    }
    setIsFlushingQueue(true);
    try {
      const [res, chkRes] = await Promise.all([
        campoService.flushQueue(),
        checkinsService.flushOfflineQueue(),
      ]);
      await checkinsService.getAllCheckIns(true);
      const totalSynced = (res?.synced || 0) + (chkRes?.syncedCount || 0);
      const totalRemaining = (res?.remaining || 0) + (chkRes?.remainingCount || 0);
      setPendingQueueCount(totalRemaining);
      setSyncToastMessage(
        totalSynced > 0
          ? `Sincronizados ${totalSynced} registros con el servidor.`
          : 'Todos los registros ya están al día.'
      );
      setTimeout(() => setSyncToastMessage(null), 4000);
    } finally {
      setIsFlushingQueue(false);
    }
  };

  const handleLogoutClick = () => {
    if (window.confirm(`¿Deseas cerrar la sesión de ${activePromoter.name}?`)) {
      campoService.logoutPromoter();
      navigate('/portal/login', { replace: true });
    }
  };

  // Si no está autenticado, redirigir directamente al login móvil (evita pantalla en blanco)
  if (!isAuthenticated && !campoService.isAuthenticatedPromoter()) {
    return <Navigate to="/portal/login" replace />;
  }

  // Si está fuera de horario y no tiene bypass activado
  const isCoordinatorRole = activePromoter.role === 'Coordinadora Trade Marketing';
  if (!isWithinHours && !isCoordinatorRole) {
    return <FueraDeHorarioScreen onBypass={() => setIsWithinHours(true)} />;
  }

  const isMerchandisingRole = activePromoter.role === 'Promotor Merchandising' || isCoordinatorRole;

  // Configuración adaptativa de pestañas según rol:
  const tabs = [
    { to: '/portal/ruta', label: 'Ruta', icon: MapPin },
    { to: '/portal/checkin', label: 'Asistencia', icon: CheckSquare },
    { to: '/portal/encuestas', label: 'Encuestas', icon: ClipboardList },
    { to: '/portal/precios', label: 'Precios', icon: Tag },
    { to: '/portal/inventario', label: 'Inventario', icon: Package },
    ...(isMerchandisingRole
      ? [{ to: '/portal/merchandising', label: 'Merchandising', icon: Layers, isSpecial: true }]
      : [])
  ];

  return (
    <div className="min-h-[100dvh] bg-[#000000] text-white flex flex-col font-sans selection:bg-red-600 selection:text-white pb-20 pb-safe">
      
      {/* ========================================================================= */}
      {/* 2.A. BARRA SUPERIOR FIJA (STICKY HEADER)                                */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-md border-b border-[#262626] px-3.5 py-2.5 pt-safe shadow-xl">
        <div className="max-w-[512px] mx-auto flex items-center justify-between gap-2">
          
          {/* Logo CZ + Título Codizulca Campo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center font-black text-white text-xs shadow-lg shadow-red-600/30 shrink-0">
              CZ
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xs font-black text-white tracking-tight uppercase leading-none">
                  Codizulca Campo
                </h1>
                {/* Insignia de Rol Dinámico */}
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider leading-none ${
                  isCoordinatorRole
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40'
                    : isMerchandisingRole
                    ? 'bg-red-600/20 text-red-400 border border-red-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {isCoordinatorRole ? 'Coordinadora Trade' : isMerchandisingRole ? 'Merchandising' : 'Impulsadoras'}
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 font-mono leading-tight mt-0.5">
                Trade Marketing • PDV
              </p>
            </div>
          </div>

          {/* Acciones Derecha: Chip de Usuario, Estado Online/Offline y Salir */}
          <div className="flex items-center gap-1.5">
            {/* Indicador pulsante Online / Offline */}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors ${
                isOnline
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400'
              }`}
              title={isOnline ? 'Conexión a internet activa' : 'Sin señal - Modo Offline activo'}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`} />
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Chip de Usuario Activo con Foto */}
            <NavLink
              to="/portal/perfil"
              className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[#171717] hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
              title="Ver Mi Perfil Personal"
            >
              <div className="w-5 h-5 rounded-md overflow-hidden bg-red-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                {activePromoter.photoUrl ? (
                  <img src={activePromoter.photoUrl} alt={activePromoter.name} className="w-full h-full object-cover" />
                ) : (
                  activePromoter.name.charAt(0)
                )}
              </div>
              <span className="text-[11px] max-w-[85px] truncate font-medium">
                {activePromoter.name.split(' ')[0]}
              </span>
            </NavLink>

            {/* Botón Salir / Logout */}
            <button
              onClick={handleLogoutClick}
              className="p-1.5 rounded-xl bg-neutral-900 hover:bg-red-950/50 border border-neutral-800 hover:border-red-500/40 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Cerrar sesión de promotora"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2.B. BANNER DE ACTIVACIÓN DE PERFIL CON VALIDACIÓN                        */}
      {/* ========================================================================= */}
      {showProfileBanner && (
        <div className="bg-[#121212] border-b border-neutral-800/80 px-3.5 py-2">
          <div className="max-w-[512px] mx-auto flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-sm">👤</span>
              <div className="truncate">
                <span className="text-neutral-400 text-[11px]">Sesión Activa: </span>
                <strong className="text-white text-[11px] font-black">{activePromoter.name}</strong>
                <span className="text-neutral-500 text-[10px] ml-1.5 font-mono">({activePromoter.role})</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isCoordinatorRole && (
                <NavLink
                  to="/dashboard/trade"
                  className="px-2 py-0.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-black transition-colors cursor-pointer"
                >
                  Panel Trade ↗
                </NavLink>
              )}
              <NavLink
                to="/portal/perfil"
                className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[10px] font-bold transition-colors cursor-pointer"
              >
                Mi Ficha
              </NavLink>
              <button
                onClick={() => setShowProfileBanner(false)}
                className="p-1 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                title="Cerrar aviso"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta de sincronización offline flotante si hay cola pendiente */}
      {pendingQueueCount > 0 && (
        <div className="bg-amber-950/50 border-b border-amber-500/40 px-3.5 py-1.5">
          <div className="max-w-[512px] mx-auto flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-amber-300 font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{pendingQueueCount} registro(s) guardado(s) offline</span>
            </div>
            <button
              onClick={handleManualSync}
              disabled={isFlushingQueue}
              className="px-2.5 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isFlushingQueue ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast de confirmación de sincronización */}
      {syncToastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-[480px] bg-emerald-900/90 border border-emerald-400 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between text-xs animate-in slide-in-from-top-4 duration-300">
          <span>{syncToastMessage}</span>
          <button onClick={() => setSyncToastMessage(null)} className="text-emerald-200 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2.C. BARRA DE PESTAÑAS ADAPTATIVA                                         */}
      {/* ========================================================================= */}
      <nav className="sticky top-[53px] z-30 bg-[#0d0d0d] border-b border-[#262626] px-1.5 py-1.5 shadow-md">
        <div className={`max-w-[512px] mx-auto grid ${isMerchandisingRole ? 'grid-cols-6' : 'grid-cols-5'} gap-0.5 sm:gap-1`}>
          {tabs.map((tab) => {
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center py-2 px-1 rounded-xl text-center transition-all duration-200 cursor-pointer ${
                    isActive
                      ? tab.isSpecial
                        ? 'bg-gradient-to-b from-red-600 to-rose-700 text-white font-black shadow-lg shadow-red-600/30'
                        : 'bg-red-600 text-white font-black shadow-md shadow-red-600/25'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900/60'
                  }`
                }
              >
                <div className="relative">
                  <tab.icon className="w-4 h-4 mb-0.5" />
                  {tab.isSpecial && (
                    <span className="absolute -top-1 -right-1 text-[8px] animate-bounce">🌟</span>
                  )}
                </div>
                <span className="text-[10px] font-bold tracking-tight leading-none truncate max-w-full">
                  {tab.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* ========================================================================= */}
      {/* CONTENEDOR DE FORMULARIOS Y CÁMARA (ANCHO MÁXIMO: 512PX EXACTO)         */}
      {/* ========================================================================= */}
      <main className="flex-1 w-full max-w-[512px] mx-auto p-3 sm:p-4">
        <Outlet context={{ activePromoter, isOnline, pendingQueueCount }} />
      </main>
    </div>
  );
};
