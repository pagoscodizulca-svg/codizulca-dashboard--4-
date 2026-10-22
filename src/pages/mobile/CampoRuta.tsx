import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  Sparkles,
  Store,
  ChevronRight,
  Package,
  Search,
  Filter,
  Users,
  Play,
  CheckCheck,
  Tag,
  CheckSquare,
  FileText,
  X,
  Info,
  Layers,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Mail
} from 'lucide-react';
import {
  degustacionesService,
  DegustacionItem,
  matchPromoterAssignment,
  isPastDegustacionDate
} from '../../lib/degustacionesService';
import { campoService, PromoterProfile } from '../../lib/campoService';
import { STORAGE_KEY_ACTIVE_STORE } from '../../lib/checkinsService';

export const CampoRuta: React.FC = () => {
  const context = useOutletContext<{
    activePromoter: PromoterProfile;
    isOnline: boolean;
  }>();
  const navigate = useNavigate();

  const activePromoter = context?.activePromoter || campoService.getActivePromoter();

  // Lista en vivo de todas las degustaciones
  const [allDegustaciones, setAllDegustaciones] = useState<DegustacionItem[]>(() =>
    degustacionesService.getDegustaciones()
  );

  // Filtros
  const [routePeriod, setRoutePeriod] = useState<'actual' | 'historial'>('actual');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isSyncingRoute, setIsSyncingRoute] = useState<boolean>(false);

  // Modal de detalles de degustación
  const [selectedDegustacion, setSelectedDegustacion] = useState<DegustacionItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Suscripción en tiempo real a cambios de la Coordinadora de Trade Marketing y API de Vendedores
  const syncRouteFromServer = async (force: boolean = false) => {
    setIsSyncingRoute(true);
    try {
      const items = await degustacionesService.getDegustacionesAsync(force);
      if (Array.isArray(items) && items.length > 0) {
        setAllDegustaciones(items);
      }
    } finally {
      setIsSyncingRoute(false);
    }
  };

  useEffect(() => {
    syncRouteFromServer(true);
    const onFocus = () => {
      syncRouteFromServer(false);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activePromoter.id, activePromoter.email]);

  useEffect(() => {
    const unsubscribe = degustacionesService.subscribe((updatedItems) => {
      setAllDegustaciones(updatedItems);
      // Si el modal está abierto, sincronizar la degustación seleccionada
      if (selectedDegustacion) {
        const found = updatedItems.find((d) => d.id === selectedDegustacion.id);
        if (found) setSelectedDegustacion(found);
      }
    });
    return () => unsubscribe();
  }, [selectedDegustacion]);

  const isTradeCoordinator = activePromoter.role === 'Coordinadora Trade Marketing';

  // Degustaciones que corresponden a la promotora activa (o todas las degustaciones si ingresa la Coordinadora de Trade Marketing)
  const myDegustaciones = useMemo(() => {
    if (isTradeCoordinator) {
      return allDegustaciones;
    }
    return allDegustaciones.filter((item) =>
      matchPromoterAssignment(item, activePromoter, activePromoter.email)
    );
  }, [allDegustaciones, activePromoter, isTradeCoordinator]);

  // Separar Ruta Actual (>= hoy o actividades pendientes/en curso) vs Historial (< hoy completadas/canceladas)
  const myCurrentDegustaciones = useMemo(() => {
    return myDegustaciones.filter((item) => {
      if (item.status === 'scheduled' || item.status === 'in_progress') {
        return true;
      }
      return !isPastDegustacionDate(item.date);
    });
  }, [myDegustaciones]);

  const myHistoricalDegustaciones = useMemo(() => {
    return myDegustaciones.filter((item) => {
      if (item.status === 'scheduled' || item.status === 'in_progress') {
        return false;
      }
      return isPastDegustacionDate(item.date);
    });
  }, [myDegustaciones]);

  const periodDegustaciones = routePeriod === 'actual' ? myCurrentDegustaciones : myHistoricalDegustaciones;

  // Filtrado de la lista personal según estado y búsqueda
  const displayedDegustaciones = useMemo(() => {
    return periodDegustaciones.filter((item) => {
      const matchStatus = selectedStatus === 'todos' || item.status === selectedStatus;
      const q = searchTerm.toLowerCase();
      const matchSearch =
        searchTerm.trim() === '' ||
        String(item.activity || '').toLowerCase().includes(q) ||
        String(item.client || '').toLowerCase().includes(q) ||
        String(item.product || '').toLowerCase().includes(q) ||
        String(item.id || '').toLowerCase().includes(q) ||
        (item.promoter && String(item.promoter).toLowerCase().includes(q));
      return matchStatus && matchSearch;
    });
  }, [periodDegustaciones, selectedStatus, searchTerm]);

  // Contadores rápidos para la promotora activa en el periodo seleccionado
  const stats = useMemo(() => {
    return {
      total: periodDegustaciones.length,
      scheduled: periodDegustaciones.filter((d) => d.status === 'scheduled').length,
      in_progress: periodDegustaciones.filter((d) => d.status === 'in_progress').length,
      completed: periodDegustaciones.filter((d) => d.status === 'completed').length,
    };
  }, [periodDegustaciones]);

  // Abrir modal de detalles
  const handleOpenDetails = (item: DegustacionItem) => {
    setSelectedDegustacion(item);
    setIsModalOpen(true);
  };

  // Manejador para iniciar degustación en PDV
  const handleStartDegustacion = (item: DegustacionItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated: DegustacionItem = {
      ...item,
      status: 'in_progress'
    };
    degustacionesService.updateDegustacion(updated);
    localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, item.client);
    if (selectedDegustacion?.id === item.id) {
      setSelectedDegustacion(updated);
    }
    setActionSuccessMsg(`¡Degustación iniciada en ${item.client}!`);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  // Manejador para completar degustación
  const handleCompleteDegustacion = (item: DegustacionItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated: DegustacionItem = {
      ...item,
      status: 'completed',
      delivered: item.delivered > 0 ? item.delivered : item.target
    };
    degustacionesService.updateDegustacion(updated);
    if (selectedDegustacion?.id === item.id) {
      setSelectedDegustacion(updated);
    }
    setActionSuccessMsg(`¡Degustación marcada como completada!`);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  // Incrementar muestras entregadas
  const handleAddSamples = (item: DegustacionItem, count: number) => {
    const newDelivered = Math.min(item.target, item.delivered + count);
    const isNowCompleted = newDelivered >= item.target;
    const updated: DegustacionItem = {
      ...item,
      delivered: newDelivered,
      status: isNowCompleted ? 'completed' : item.status === 'scheduled' ? 'in_progress' : item.status
    };
    degustacionesService.updateDegustacion(updated);
    setSelectedDegustacion(updated);
    setActionSuccessMsg(`+${count} muestras registradas (${newDelivered}/${item.target})`);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  // Navegar al checkin con la tienda preseleccionada
  const handleGoToCheckin = (clientName: string) => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, clientName);
    navigate('/portal/checkin');
  };

  // Navegar al inventario de degustación
  const handleGoToInventario = (clientName: string) => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, clientName);
    navigate('/portal/inventario');
  };

  // Navegar al monitoreo de precios con la tienda preseleccionada
  const handleGoToPrecios = (clientName: string) => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, clientName);
    navigate('/portal/precios');
  };

  return (
    <div className="space-y-3.5 animate-in fade-in duration-300 pb-10 text-white">
      {/* Toast de Notificación Rápida */}
      {actionSuccessMsg && (
        <div className="bg-red-600/95 border border-red-400 text-white px-3.5 py-2 rounded-xl shadow-xl flex items-center justify-between text-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            <span className="font-bold">{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-white/80 hover:text-white ml-2 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. CABECERA COMPACTA: RESUMEN DE RUTA & DEGUSTACIONES                      */}
      {/* ========================================================================= */}
      <div className="bg-[#121212] border border-white/10 rounded-2xl p-3.5 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[9px] uppercase tracking-wider">
                Ruta & Degustaciones
              </span>
              <button
                type="button"
                onClick={() => syncRouteFromServer(true)}
                disabled={isSyncingRoute}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-lg cursor-pointer transition-colors"
                title="Sincronizar degustaciones aceptadas por Trade Marketing"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isSyncingRoute ? 'animate-spin' : ''}`} />
                <span>{isSyncingRoute ? 'Sincronizando...' : 'Sincronizado'}</span>
              </button>
            </div>
            <h2 className="text-sm font-black text-white mt-1 truncate">
              {activePromoter.name}
            </h2>
            <p className="text-[10px] text-zinc-400 font-mono flex items-center gap-1 truncate mt-0.5">
              <Mail className="w-3 h-3 text-red-500 shrink-0" />
              <span className="truncate">{activePromoter.email}</span>
            </p>
          </div>

          {/* Mini Chip Perfil */}
          <div className="flex items-center gap-1.5 bg-[#1a1a1a] border border-white/5 px-2.5 py-1.5 rounded-xl text-right shrink-0">
            <div className="w-7 h-7 rounded-lg overflow-hidden bg-red-600 text-white flex items-center justify-center text-[11px] font-black shrink-0">
              {activePromoter.photoUrl ? (
                <img src={activePromoter.photoUrl} alt={activePromoter.name} className="w-full h-full object-cover" />
              ) : (
                activePromoter.name.charAt(0)
              )}
            </div>
            <div className="text-left">
              <span className="text-[9px] text-zinc-400 block leading-tight">{activePromoter.role}</span>
              <span className="font-bold text-white text-[11px] leading-none block truncate max-w-[90px]">
                {activePromoter.name.split(' ')[0]}
              </span>
            </div>
          </div>
        </div>

        {/* Mini Contadores KPI */}
        <div className="grid grid-cols-4 gap-1.5 mt-2.5 pt-2.5 border-t border-white/5 text-center">
          <button
            onClick={() => setSelectedStatus('todos')}
            className={`p-1.5 rounded-xl border transition-all ${
              selectedStatus === 'todos'
                ? 'bg-zinc-800 border-white/20 text-white'
                : 'bg-[#181818] border-white/5 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="block text-[9px] uppercase font-bold">Total</span>
            <span className="font-mono font-black text-xs text-white">{stats.total}</span>
          </button>
          <button
            onClick={() => setSelectedStatus('scheduled')}
            className={`p-1.5 rounded-xl border transition-all ${
              selectedStatus === 'scheduled'
                ? 'bg-zinc-800 border-white/20 text-white'
                : 'bg-[#181818] border-white/5 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="block text-[9px] uppercase font-bold">Prog.</span>
            <span className="font-mono font-black text-xs text-blue-400">{stats.scheduled}</span>
          </button>
          <button
            onClick={() => setSelectedStatus('in_progress')}
            className={`p-1.5 rounded-xl border transition-all ${
              selectedStatus === 'in_progress'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-[#181818] border-white/5 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="block text-[9px] uppercase font-bold">En Curso</span>
            <span className="font-mono font-black text-xs text-amber-400">{stats.in_progress}</span>
          </button>
          <button
            onClick={() => setSelectedStatus('completed')}
            className={`p-1.5 rounded-xl border transition-all ${
              selectedStatus === 'completed'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-[#181818] border-white/5 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="block text-[9px] uppercase font-bold">Listas</span>
            <span className="font-mono font-black text-xs text-emerald-400">{stats.completed}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. PESTAÑAS RUTA ACTUAL vs HISTORIAL Y BARRA DE BÚSQUEDA                 */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5 bg-[#121212] border border-white/10 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setRoutePeriod('actual')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              routePeriod === 'actual'
                ? 'bg-red-600 text-white shadow font-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Ruta Actual</span>
            <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-mono">
              {myCurrentDegustaciones.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRoutePeriod('historial')}
            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              routePeriod === 'historial'
                ? 'bg-red-600 text-white shadow font-black'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Historial</span>
            <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-mono">
              {myHistoricalDegustaciones.length}
            </span>
          </button>
        </div>

        {/* Buscador Rápido de Mis Actividades */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por PDV, producto o actividad asignada..."
            className="w-full pl-9 pr-8 py-2 bg-[#121212] border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LISTADO COMPACTO Y DISTRIBUIDO DE DEGUSTACIONES                       */}
      {/* ========================================================================= */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
            {routePeriod === 'actual' ? 'Cronograma Actual Asignado' : 'Historial de Degustaciones'} ({displayedDegustaciones.length})
          </span>
          {selectedStatus !== 'todos' && (
            <button
              onClick={() => setSelectedStatus('todos')}
              className="text-[10px] text-red-400 hover:underline font-bold"
            >
              Ver todos los estados
            </button>
          )}
        </div>

        {displayedDegustaciones.length === 0 ? (
          <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-zinc-300">
              {routePeriod === 'actual'
                ? 'Ruta actual lista para las degustaciones de la nueva semana'
                : 'No tienes degustaciones en el historial con los filtros seleccionados'}
            </p>
            <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
              {routePeriod === 'actual'
                ? 'Las degustaciones de fechas anteriores ya pasaron a tu pestaña de Historial. Aquí aparecerán las nuevas degustaciones que te asigne Trade Marketing.'
                : 'Aquí se conservan todas tus degustaciones de fechas anteriores.'}
            </p>
            {routePeriod === 'actual' && myHistoricalDegustaciones.length > 0 && (
              <button
                type="button"
                onClick={() => setRoutePeriod('historial')}
                className="mt-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold transition-colors cursor-pointer"
              >
                Ver Historial ({myHistoricalDegustaciones.length})
              </button>
            )}
          </div>
        ) : (
          displayedDegustaciones.map((item) => {
            const progressPct = item.target > 0 ? Math.min(100, Math.round((item.delivered / item.target) * 100)) : 0;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  item.status === 'in_progress'
                    ? 'bg-[#151515] border-amber-500/40 shadow-lg shadow-amber-500/5'
                    : 'bg-[#141414] border-red-500/30 hover:border-red-500/50'
                }`}
              >
                {/* Cabecera de la Tarjeta */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[9px] font-bold text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded">
                        {item.id}
                      </span>
                      <span className="text-[10px] text-zinc-300 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {item.date}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {item.time}
                      </span>
                    </div>

                    {/* Badge de Estado */}
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase font-mono shrink-0 ${
                        item.status === 'in_progress'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          : item.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-zinc-800 text-zinc-400 border border-white/5'
                      }`}
                    >
                      {item.status === 'in_progress'
                        ? '⚡ En Curso'
                        : item.status === 'completed'
                        ? '✓ Completada'
                        : '🗓️ Programada'}
                    </span>
                  </div>

                  {/* Título de la Actividad & Producto */}
                  <div>
                    <h3 className="font-bold text-white text-xs leading-snug">
                      {item.activity}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-red-400 font-medium mt-0.5">
                      <Package className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.product}</span>
                    </div>
                  </div>

                  {/* PDV / Cliente */}
                  <div className="flex items-start gap-1.5 text-[11px] text-zinc-300 bg-[#1a1a1a] p-2 rounded-xl border border-white/5">
                    <Store className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white text-xs truncate">{item.client}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{item.zone}</p>
                      {isTradeCoordinator && item.promoter && (
                        <p className="text-[10px] text-emerald-400 font-bold truncate mt-0.5 flex items-center gap-1">
                          <Users className="w-3 h-3 shrink-0" />
                          <span>Promotora: {item.promoter}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Barra de Progreso de Degustación */}
                  <div className="space-y-1 pt-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-zinc-400">
                        Muestras Entregadas
                      </span>
                      <span className="font-mono font-bold text-white">
                        {item.delivered} / {item.target} ({progressPct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          item.status === 'completed'
                            ? 'bg-emerald-500'
                            : item.status === 'in_progress'
                            ? 'bg-amber-400'
                            : 'bg-red-600'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Barra de Acciones del Item: Botón de Detalles + Acción Rápida */}
                <div className="bg-[#181818] px-3 py-2 border-t border-white/5 flex items-center justify-between gap-2">
                  {/* BOTÓN PRINCIPAL DE DETALLES (Abre Modal de Especificaciones) */}
                  <button
                    onClick={() => handleOpenDetails(item)}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-400" />
                    <span>Detalles</span>
                  </button>

                  {/* Botón de Acción Operativa Rápida */}
                  {item.status !== 'completed' && (
                    <button
                      onClick={(e) =>
                        item.status === 'in_progress'
                          ? handleCompleteDegustacion(item, e)
                          : handleStartDegustacion(item, e)
                      }
                      className={`py-1.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md ${
                        item.status === 'in_progress'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                          : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                      }`}
                    >
                      {item.status === 'in_progress' ? (
                        <>
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Completar</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Iniciar</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL DE ESPECIFICACIONES DE LA DEGUSTACIÓN                            */}
      {/* ========================================================================= */}
      {isModalOpen && selectedDegustacion && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#141414] border border-white/15 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            {/* Cabecera del Modal */}
            <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3 bg-[#181818]">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[9px] uppercase tracking-wider">
                    Especificación de Degustación
                  </span>
                  <span className="font-mono text-[10px] font-bold text-zinc-400">
                    {selectedDegustacion.id}
                  </span>
                </div>
                <h3 className="text-sm font-black text-white leading-snug">
                  {selectedDegustacion.activity}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-sm font-bold shrink-0 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Contenido con Scroll de Especificaciones */}
            <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
              {/* Estado y Promotora */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#1a1a1a] p-3 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
                    Promotora Asignada
                  </span>
                  <p className="font-bold text-white text-xs">{selectedDegustacion.promoter}</p>
                  <p className="text-[10px] text-red-400 font-mono font-bold">
                    {selectedDegustacion.promoterRole}
                  </p>
                </div>

                <div className="bg-[#1a1a1a] p-3 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">
                    Estado de la Actividad
                  </span>
                  <span
                    className={`inline-block px-2.5 py-1 rounded-xl text-[10px] font-black uppercase font-mono ${
                      selectedDegustacion.status === 'in_progress'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : selectedDegustacion.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-zinc-800 text-zinc-300 border border-white/10'
                    }`}
                  >
                    {selectedDegustacion.status === 'in_progress'
                      ? '⚡ En Curso'
                      : selectedDegustacion.status === 'completed'
                      ? '✓ Completada'
                      : '🗓️ Programada'}
                  </span>
                </div>
              </div>

              {/* Punto de Venta (PDV) */}
              <div className="bg-[#1a1a1a] p-3 rounded-2xl border border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-red-500" />
                    <span>Punto de Venta Asignado (PDV)</span>
                  </span>
                  <button
                    onClick={() => handleGoToCheckin(selectedDegustacion.client)}
                    className="text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-0.5 underline"
                  >
                    <span>Ir a Asistencia</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <p className="font-bold text-white text-xs">{selectedDegustacion.client}</p>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                  <span>{selectedDegustacion.zone}</span>
                </p>
              </div>

              {/* Producto SKU & Horario */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#1a1a1a] p-3 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider flex items-center gap-1">
                    <Package className="w-3 h-3 text-red-400" />
                    <span>Producto SKU</span>
                  </span>
                  <p className="font-bold text-white text-xs">{selectedDegustacion.product}</p>
                </div>

                <div className="bg-[#1a1a1a] p-3 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>Fecha & Horario</span>
                  </span>
                  <p className="font-mono font-bold text-white text-xs">{selectedDegustacion.time}</p>
                  <p className="text-[10px] text-zinc-400">{selectedDegustacion.date}</p>
                </div>
              </div>

              {/* Meta y Progreso de Degustación */}
              <div className="bg-[#1a1a1a] p-3 rounded-2xl border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-red-400" />
                    <span>Progreso de Muestras</span>
                  </span>
                  <span className="font-mono font-bold text-white text-xs">
                    {selectedDegustacion.delivered} / {selectedDegustacion.target} porciones
                  </span>
                </div>

                {/* Barra de Progreso */}
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      selectedDegustacion.status === 'completed'
                        ? 'bg-emerald-500'
                        : selectedDegustacion.status === 'in_progress'
                        ? 'bg-amber-400'
                        : 'bg-red-600'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((selectedDegustacion.delivered / selectedDegustacion.target) * 100)
                      )}%`
                    }}
                  />
                </div>

                {/* Botones de Registro Rápido de Muestras */}
                {selectedDegustacion.status !== 'completed' && (
                  <div className="pt-2 flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-400">Registrar entrega:</span>
                    <button
                      onClick={() => handleAddSamples(selectedDegustacion, 5)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-mono text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      +5
                    </button>
                    <button
                      onClick={() => handleAddSamples(selectedDegustacion, 10)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-mono text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      +10
                    </button>
                    <button
                      onClick={() => handleAddSamples(selectedDegustacion, 25)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-mono text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      +25
                    </button>
                  </div>
                )}
              </div>

              {/* Indicaciones de Trade Marketing */}
              {selectedDegustacion.comments && (
                <div className="p-3 bg-red-950/20 border border-red-500/25 rounded-2xl space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1">
                    💬 Indicaciones de Trade Marketing:
                  </span>
                  <p className="text-zinc-300 text-[11px] italic leading-relaxed">
                    "{selectedDegustacion.comments}"
                  </p>
                </div>
              )}
            </div>

            {/* Pie del Modal con Acciones */}
            <div className="p-3.5 bg-[#181818] border-t border-white/10 space-y-2">
              <div className="flex gap-2">
                {selectedDegustacion.status !== 'completed' ? (
                  <button
                    onClick={() => {
                      if (selectedDegustacion.status === 'in_progress') {
                        handleCompleteDegustacion(selectedDegustacion);
                      } else {
                        handleStartDegustacion(selectedDegustacion);
                      }
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                      selectedDegustacion.status === 'in_progress'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
                    }`}
                  >
                    {selectedDegustacion.status === 'in_progress' ? (
                      <>
                        <CheckCheck className="w-4 h-4" />
                        <span>Marcar Completada</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Iniciar en PDV</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex-1 py-2 px-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-center font-bold text-xs flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Degustación Completada con Éxito</span>
                  </div>
                )}

                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    handleGoToCheckin(selectedDegustacion.client);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Marcar Asistencia en este PDV"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-red-500" />
                  <span>Asistencia</span>
                </button>

                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    handleGoToPrecios(selectedDegustacion.client);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Monitoreo y comparativa de precios en este PDV"
                >
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Precios</span>
                </button>

                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    handleGoToInventario(selectedDegustacion.client);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Registrar balance de inventario"
                >
                  <Package className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Inventario</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
