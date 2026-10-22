import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  Filter,
  Users,
  Activity,
  Smartphone,
  Laptop,
  Tablet,
  ShieldCheck,
  ShieldAlert,
  ArrowUpDown,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  ExternalLink,
  X,
  FileSpreadsheet,
  Globe,
  Radio,
  Eye,
  KeyRound,
  LogIn,
  LogOut,
  Sparkles,
  Globe2,
  LocateFixed,
  Map as MapIcon,
  Columns
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  trazabilidadService,
  TrazabilidadItem,
  parseCoordinates,
  reverseGeocodeCoordinates
} from '../lib/trazabilidadService';
import { useAuth } from '../lib/auth';
import { UserEarthMapModal } from '../components/trazabilidad/UserEarthMapModal';
import { UsersLiveEarthMap } from '../components/trazabilidad/UsersLiveEarthMap';

export const Trazabilidad: React.FC = () => {
  const { user, corporateProfile, canAccessTrazabilidad } = useAuth();
  const [logs, setLogs] = useState<TrazabilidadItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSyncingGps, setIsSyncingGps] = useState<boolean>(false);
  const [gpsBannerMessage, setGpsBannerMessage] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);

  // Estados de Filtros (Exactos a la Imagen 2)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('todos');
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState<boolean>(false);

  // Ordenamiento
  const [sortField, setSortField] = useState<'timestamp' | 'name' | 'action'>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Modal de Detalle de Conexión
  const [selectedLog, setSelectedLog] = useState<TrazabilidadItem | null>(null);

  // Modo de Visualización: Tabla, Mapeo Satelital o Dividido
  const [viewMode, setViewMode] = useState<'table' | 'map' | 'split'>('table');

  // Modal Google Earth Satelital al Tildar Usuario
  const [selectedUserForEarthModal, setSelectedUserForEarthModal] = useState<TrazabilidadItem | null>(null);

  // Enriquecer registros que tengan coordenadas reales pero aún no tengan dirección exacta
  const enrichLogsWithRealAddresses = async (items: TrazabilidadItem[]) => {
    for (const item of items) {
      if (item.device.coordinates && !item.device.address) {
        const parsed = parseCoordinates(item.device.coordinates);
        if (parsed) {
          const geo = await reverseGeocodeCoordinates(parsed.lat, parsed.lng);
          if (geo && geo.address) {
            await trazabilidadService.updateEvent(item.id, {
              device: {
                ...item.device,
                address: geo.address,
                locationCity: geo.locationCity || item.device.locationCity,
                lat: parsed.lat,
                lng: parsed.lng
              }
            });
          }
        }
      }
    }
  };

  // Carga inicial, sincronización GPS real de la sesión actual y suscripción en tiempo real
  useEffect(() => {
    if (!canAccessTrazabilidad) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);

    trazabilidadService.getAll().then(async (data) => {
      if (!mounted) return;
      setLogs(data);
      setIsLoading(false);

      // Resolver direcciones reales faltantes
      enrichLogsWithRealAddresses(data);

      // Si hay un usuario autenticado y no tiene un registro con GPS verificado hoy, sincronizar su conexión real
      const activeEmail = corporateProfile?.email || user?.email || 'admin@codi.com';
      const activeName = corporateProfile?.name || (activeEmail.toLowerCase().includes('admin')
        ? 'Administrador General'
        : activeEmail.split('@')[0].toUpperCase());
      const activeRole = corporateProfile?.roleLabel || 'Administrador General';
      const hasVerifiedSession = data.some(
        (l) => l.user.email.toLowerCase() === activeEmail.toLowerCase() && l.device.gpsVerified && l.device.address
      );

      if (!hasVerifiedSession || data.length === 0) {
        const syncRes = await trazabilidadService.syncCurrentUserGpsLocation({
          name: activeName,
          email: activeEmail,
          role: activeRole,
          isMobilePortal: false
        });
        if (!syncRes.success && data.length === 0) {
          // Si el navegador aún no otorgó permiso GPS, registrar la conexión real por red/IP
          await trazabilidadService.logConnection(
            {
              name: activeName,
              email: activeEmail,
              role: activeRole
            },
            false
          );
        }
      }
    });

    const unsubscribe = trazabilidadService.subscribe((updatedLogs) => {
      if (mounted) {
        setLogs(updatedLogs);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user?.email]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const data = await trazabilidadService.getAll();
      setLogs(data);
      await enrichLogsWithRealAddresses(data);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleSyncMyRealGps = async () => {
    setIsSyncingGps(true);
    setGpsBannerMessage(null);
    try {
      const activeEmail = user?.email || 'admin@codi.com';
      const activeName = activeEmail.toLowerCase().includes('admin')
        ? 'Admin General'
        : activeEmail.split('@')[0].toUpperCase();

      const res = await trazabilidadService.syncCurrentUserGpsLocation({
        name: activeName,
        email: activeEmail,
        role: 'Administrador',
        isMobilePortal: false
      });

      if (res.success && res.item) {
        setGpsBannerMessage({
          type: 'success',
          text: `GPS Real Verificado (±${res.item.device.accuracy || 10}m): ${res.item.device.address || res.item.device.locationCity} (${res.item.device.coordinates})`
        });
      } else {
        setGpsBannerMessage({
          type: 'warning',
          text: res.error || 'No se pudo obtener la ubicación GPS del navegador. Verifica los permisos de ubicación.'
        });
      }
    } finally {
      setIsSyncingGps(false);
      setTimeout(() => setGpsBannerMessage(null), 9000);
    }
  };

  // Roles disponibles para el filtro
  const availableRoles = [
    { value: 'todos', label: 'Todos los Roles' },
    { value: 'Presidente', label: 'Presidente' },
    { value: 'Directivo', label: 'Directivo' },
    { value: 'Gerente Nacional', label: 'Gerente Nacional' },
    { value: 'Gerente Regional', label: 'Gerente Regional' },
    { value: 'Administrador', label: 'Administrador General' },
    { value: 'Analista', label: 'Analista' },
    { value: 'Trade Marketing', label: 'Trade Marketing' },
    { value: 'Supervisor', label: 'Supervisor' },
    { value: 'Promotora', label: 'Promotora' },
    { value: 'Impulsadora', label: 'Impulsadora' },
    { value: 'Promotor Merchandising', label: 'Promotor Merchandising' }
  ];

  // Alternar ordenamiento
  const handleSort = (field: 'timestamp' | 'name' | 'action') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filtrado y Ordenamiento
  const filteredLogs = useMemo(() => {
    return logs
      .filter((item) => {
        // 1. Filtro por Búsqueda (nombre, usuario/correo, acción o dirección GPS)
        const matchSearch =
          searchTerm.trim() === '' ||
          item.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.action.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.action.details && item.action.details.toLowerCase().includes(searchTerm.toLowerCase())) ||
          item.device.ip.includes(searchTerm) ||
          item.device.locationCity.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.device.address && item.device.address.toLowerCase().includes(searchTerm.toLowerCase()));

        // 2. Filtro por Fecha (dd/mm/aaaa)
        let matchDate = true;
        if (selectedDate) {
          // selectedDate viene en formato YYYY-MM-DD del input type="date"
          const [year, month, day] = selectedDate.split('-');
          const targetFormattedDate = `${day}/${month}/${year}`;
          matchDate = item.formattedDate === targetFormattedDate;
        }

        // 3. Filtro por Rol de Sistema
        const matchRole =
          selectedRole === 'todos' ||
          item.user.role.toLowerCase() === selectedRole.toLowerCase() ||
          (selectedRole === 'Supervisor' && item.user.role.toLowerCase().includes('supervisor'));

        return matchSearch && matchDate && matchRole;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortField === 'timestamp') {
          comp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        } else if (sortField === 'name') {
          comp = a.user.name.localeCompare(b.user.name);
        } else if (sortField === 'action') {
          comp = a.action.label.localeCompare(b.action.label);
        }
        return sortDirection === 'desc' ? -comp : comp;
      });
  }, [logs, searchTerm, selectedDate, selectedRole, sortField, sortDirection]);

  // KPIs Resumen
  const stats = useMemo(() => {
    const todayFormatted = `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;
    const todayLogs = logs.filter(l => l.formattedDate === todayFormatted);
    const activeSessions = logs.filter(l => l.action.status === 'active').length;
    const fieldPromoters = new Set(logs.filter(l => l.action.module.includes('Portal Campo')).map(l => l.user.email)).size;
    const adminSessions = logs.filter(l => l.action.module.includes('Dashboard Gerencia') || l.user.role === 'Administrador').length;

    return {
      total: logs.length,
      today: todayLogs.length,
      active: activeSessions,
      promoters: fieldPromoters,
      adminSessions
    };
  }, [logs]);

  // Exportar Auditoría a Excel
  const handleExportExcel = () => {
    const exportData = filteredLogs.map(item => ({
      'ID Registro': item.id,
      'Fecha': item.formattedDate,
      'Hora': item.formattedTime,
      'Nombre Usuario': item.user.name,
      'Correo / Usuario': item.user.email,
      'Rol del Sistema': item.user.role,
      'Acción Registrada': item.action.label,
      'Detalles de la Acción': item.action.details || '',
      'Módulo': item.action.module,
      'Estado': item.action.status,
      'Dirección IP': item.device.ip,
      'Dispositivo': `${item.device.deviceType} (${item.device.os})`,
      'Navegador': item.device.browser,
      'Tipo de Conexión': item.device.connection,
      'Ciudad / Estado': item.device.locationCity,
      'Dirección Física Exacta (GPS)': item.device.address || item.device.locationCity,
      'GPS Verificado': item.device.gpsVerified ? 'SÍ (Sensor GPS Real)' : 'NO (Red/IP)',
      'Precisión GPS': item.device.accuracy ? `±${item.device.accuracy}m` : 'N/A',
      'Coordenadas': item.device.coordinates || 'Sin coordenadas'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trazabilidad_Conexiones');
    XLSX.writeFile(wb, `Codizulca_Trazabilidad_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!canAccessTrazabilidad) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
        <div className="max-w-lg w-full bg-[#0d0d0d] border border-red-500/30 rounded-3xl p-8 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-500 mx-auto shadow-lg shadow-red-950/50">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black tracking-widest text-white uppercase">
            ACCESO RESTRINGIDO A TRAZABILIDAD
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Por políticas de seguridad corporativa de <strong className="text-white">CODIZULCA</strong>, el módulo de{' '}
            <strong className="text-red-400">Trazabilidad & Auditoría GPS</strong> solo puede ser visualizado por los perfiles de{' '}
            <strong className="text-emerald-400">Gerencia</strong> (Presidente, Directivo, Gerente Nacional, Gerente Regional) y{' '}
            <strong className="text-emerald-400">Administrador General</strong>.
          </p>
          <div className="bg-zinc-900/80 border border-white/10 rounded-xl p-3 text-xs text-zinc-400">
            Tu perfil actual (<span className="text-white font-bold">{corporateProfile?.roleLabel || 'Usuario'}</span>) no cuenta con permisos para consultar este módulo.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in-50 duration-500 font-sans text-zinc-100 max-w-[1700px] mx-auto pb-12">
      
      {/* ========================================================================= */}
      {/* 1. CABECERA PRINCIPAL Y KPIS DE AUDITORÍA EN TIEMPO REAL                 */}
      {/* ========================================================================= */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-[#0d0d0d] border border-white/10 rounded-2xl p-5 shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-500 shadow-lg shadow-red-950/50">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black tracking-widest text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                  TRAZABILIDAD & AUDITORÍA
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  SISTEMA EN VIVO
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  Exclusivo: Gerencia & Admin General
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Supervisión en tiempo real de conexiones, dispositivos, IP real y dirección exacta verificada por GPS.
              </p>
            </div>
          </div>
        </div>

        {/* Acciones Superiores & Selector de Vistas */}
        <div className="flex items-center gap-2.5 self-start xl:self-center flex-wrap">
          
          {/* Selector de Vistas: Tabla vs Mapa Satelital Google Earth */}
          <div className="bg-[#141518] p-1 rounded-2xl border border-white/10 flex items-center gap-1 shadow-md">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Tabla</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mapeo Satelital</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            </button>

            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Dividido</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSyncMyRealGps}
            disabled={isSyncingGps}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-950/80 hover:bg-blue-900 border border-blue-500/40 text-blue-200 text-xs font-bold transition-all cursor-pointer shadow-md"
            title="Capturar ubicación GPS real y dirección física exacta de este dispositivo"
          >
            <LocateFixed className={`w-3.5 h-3.5 text-blue-400 ${isSyncingGps ? 'animate-spin' : ''}`} />
            <span>{isSyncingGps ? 'Obteniendo GPS Real...' : 'Sincronizar Mi GPS Actual'}</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-bold transition-all cursor-pointer shadow-md"
            title="Recargar eventos recientes"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all cursor-pointer shadow-md"
            title="Descargar reporte en formato Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Banner de confirmación de sincronización GPS real */}
      {gpsBannerMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            gpsBannerMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
              : 'bg-amber-950/70 border-amber-500/50 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <LocateFixed className="w-4 h-4 shrink-0" />
            <span>{gpsBannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setGpsBannerMessage(null)}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mini Tarjetas de Métricas de Conexión */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Usuarios En Línea</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-400">{stats.active}</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Sesiones activas en tiempo real</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Conexiones de Hoy</span>
            <p className="text-2xl font-black text-white mt-1">{stats.today}</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Registros durante la jornada</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-500">
            <LogIn className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Promotoras en Campo</span>
            <p className="text-2xl font-black text-amber-400 mt-1">{stats.promoters}</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">App móvil PWA sincronizada</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Smartphone className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Total de Auditorías</span>
            <p className="text-2xl font-black text-blue-400 mt-1">{stats.total}</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Eventos en el historial global</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BARRA DE FILTROS (EXACTA A LA IMAGEN 2 SUBIDA POR EL USUARIO)           */}
      {/* ========================================================================= */}
      <div className="bg-[#0f0f11] border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          
          {/* Bloque BÚSQUEDA */}
          <div className="md:col-span-6 space-y-1.5">
            <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400">
              BÚSQUEDA
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, usuario o acción..."
                className="w-full bg-[#17181c] border border-white/10 rounded-xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-bold cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Bloque FECHA */}
          <div className="md:col-span-3 space-y-1.5">
            <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400">
              FECHA
            </label>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-[#17181c] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 transition-colors font-mono cursor-pointer"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-bold cursor-pointer"
                  title="Limpiar fecha"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Bloque ROL DE SISTEMA */}
          <div className="md:col-span-3 space-y-1.5 relative">
            <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400">
              ROL DE SISTEMA
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                className="w-full bg-[#17181c] hover:bg-zinc-800 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="font-bold truncate">
                    {availableRoles.find(r => r.value === selectedRole)?.label || 'Todos los Roles'}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">▼</span>
              </button>

              {/* Menú Desplegable de Roles */}
              {isRoleDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#17181c] border border-white/15 rounded-xl shadow-2xl z-30 py-1.5 max-h-56 overflow-y-auto animate-in fade-in-50 duration-150">
                  {availableRoles.map((roleOption) => (
                    <button
                      key={roleOption.value}
                      type="button"
                      onClick={() => {
                        setSelectedRole(roleOption.value);
                        setIsRoleDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        selectedRole === roleOption.value
                          ? 'bg-red-600 text-white font-bold'
                          : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <span>{roleOption.label}</span>
                      {selectedRole === roleOption.value && <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resumen de Filtros Activos si alguno está seleccionado */}
        {(searchTerm || selectedDate || selectedRole !== 'todos') && (
          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/5 flex-wrap text-xs">
            <span className="text-zinc-500 text-[11px]">Filtros activos:</span>
            {searchTerm && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-medium border border-white/10">
                Texto: <strong>{searchTerm}</strong>
                <button onClick={() => setSearchTerm('')} className="hover:text-red-400 ml-1">✕</button>
              </span>
            )}
            {selectedDate && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-medium border border-white/10 font-mono">
                Fecha: <strong>{selectedDate}</strong>
                <button onClick={() => setSelectedDate('')} className="hover:text-red-400 ml-1">✕</button>
              </span>
            )}
            {selectedRole !== 'todos' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-medium border border-white/10">
                Rol: <strong>{availableRoles.find(r => r.value === selectedRole)?.label}</strong>
                <button onClick={() => setSelectedRole('todos')} className="hover:text-red-400 ml-1">✕</button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDate('');
                setSelectedRole('todos');
              }}
              className="text-xs text-red-400 hover:text-red-300 underline font-bold ml-auto cursor-pointer"
            >
              Restablecer Filtros
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2.5 SECCIÓN DE MAPEO SATELITAL EN VIVO (CUANDO VIEWMODE ES MAP O SPLIT)   */}
      {/* ========================================================================= */}
      {(viewMode === 'map' || viewMode === 'split') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-emerald-400 animate-pulse" />
              <h3 className="text-sm font-black uppercase text-white tracking-widest">
                MAPEO SATELITAL EN TIEMPO REAL (GOOGLE EARTH)
              </h3>
            </div>
            <span className="text-xs text-zinc-400 font-mono">
              Haz clic en cualquier promotora para volar a su posición o tildarla
            </span>
          </div>
          <UsersLiveEarthMap
            logs={filteredLogs}
            onSelectUserForModal={(item) => setSelectedUserForEarthModal(item)}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TABLA DE TRAZABILIDAD (COLUMNAS EXACTAS A LA IMAGEN 2)                  */}
      {/* ========================================================================= */}
      {(viewMode === 'table' || viewMode === 'split') && (
      <div className="bg-[#0f0f11] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Cabecera con contador de resultados */}
        <div className="px-5 py-3 border-b border-white/10 bg-[#141518] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white uppercase tracking-wider">Registro de Auditoría</span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 border border-white/10 text-zinc-300 font-mono text-[11px] font-black">
              {filteredLogs.length} Eventos
            </span>
            <span className="hidden sm:inline-block text-[11px] text-zinc-400 ml-2">
              • Tilda cualquier usuario para abrir su ubicación en Google Earth
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">
            Mostrando resultados ordenados por fecha descendente
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {/* Headers exactos a la Imagen 2 */}
            <thead>
              <tr className="bg-[#16171b] border-b border-white/10 text-xs font-black uppercase tracking-wider text-zinc-400 select-none">
                
                {/* Columna Tildar / GPS */}
                <th className="p-3 w-14 text-center">
                  <div className="flex flex-col items-center justify-center gap-0.5" title="Tildar para ver ubicación en Google Earth">
                    <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] font-bold text-zinc-400">TILDAR</span>
                  </div>
                </th>

                {/* Columna 1: TIEMPO Y FECHA ↑↓ */}
                <th
                  onClick={() => handleSort('timestamp')}
                  className="p-4 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-red-500 font-black">
                    <span>TIEMPO Y FECHA</span>
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>

                {/* Columna 2: IDENTIDAD ↑↓ */}
                <th
                  onClick={() => handleSort('name')}
                  className="p-4 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>IDENTIDAD</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                </th>

                {/* Columna 3: ACCIÓN REGISTRADA ↑↓ */}
                <th
                  onClick={() => handleSort('action')}
                  className="p-4 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>ACCIÓN REGISTRADA</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                </th>

                {/* Columna 4: DETALLE DE DISPOSITIVO / CONEXIÓN */}
                <th className="p-4">
                  <span>DETALLE DE DISPOSITIVO / CONEXIÓN</span>
                </th>
              </tr>
            </thead>

            {/* Cuerpo de la Tabla */}
            <tbody className="divide-y divide-white/5 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-zinc-400 space-y-3">
                    <RefreshCw className="w-7 h-7 text-red-500 animate-spin mx-auto" />
                    <p className="font-bold text-sm">Cargando registros de trazabilidad...</p>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-zinc-400 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                      <Search className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-white text-sm">No se encontraron eventos</p>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                      Intenta ajustando el término de búsqueda, seleccionando otra fecha o cambiando el rol filtrado.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item) => {
                  const isLive = item.action.status === 'active';
                  const isError = item.action.status === 'warning' || item.action.status === 'error';
                  const isMobile = item.device.deviceType === 'Móvil';
                  const isChecked = selectedUserForEarthModal?.id === item.id;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedLog(item)}
                      className={`hover:bg-white/[0.04] transition-colors cursor-pointer group ${
                        isChecked ? 'bg-red-950/20' : ''
                      }`}
                    >
                      {/* 0. TILDAR PARA VER EN GOOGLE EARTH */}
                      <td 
                        className="p-3 text-center align-top"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUserForEarthModal(item);
                        }}
                      >
                        <div className="flex flex-col items-center justify-center pt-1">
                          <label className="relative flex items-center justify-center cursor-pointer p-1 rounded-lg hover:bg-zinc-800 transition-colors">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => setSelectedUserForEarthModal(item)}
                              className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-red-600 focus:ring-red-500 focus:ring-offset-0 cursor-pointer accent-red-600"
                              title="Tildar para abrir en Google Earth Satelital"
                            />
                          </label>
                          <span className="text-[8px] font-mono text-zinc-500 mt-0.5">GPS</span>
                        </div>
                      </td>

                      {/* 1. TIEMPO Y FECHA */}
                      <td className="p-4 whitespace-nowrap align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="font-bold text-white font-mono text-[13px]">
                              {item.formattedTime}
                            </span>
                            {isLive && (
                              <span className="flex h-2 w-2 relative" title="Sesión Activa Ahora">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px]">
                            <Calendar className="w-3 h-3 text-zinc-600" />
                            <span>{item.formattedDate}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-[10px] text-zinc-500">{item.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* 2. IDENTIDAD */}
                      <td className="p-4 align-top">
                        <div className="flex items-start gap-3 min-w-[200px]">
                          {/* Avatar / Foto */}
                          <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-800 border border-white/10 shrink-0 flex items-center justify-center font-black text-white text-xs shadow-md">
                            {item.user.photoUrl ? (
                              <img
                                src={item.user.photoUrl}
                                alt={item.user.name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className={`w-full h-full ${item.user.avatarBg || 'bg-red-700'} flex items-center justify-center`}>
                                {item.user.name.charAt(0)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-white text-xs uppercase tracking-tight group-hover:text-red-400 transition-colors">
                                {item.user.name}
                              </h4>
                            </div>
                            <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate" title={item.user.email}>
                              {item.user.email}
                            </p>
                            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                              item.user.role === 'Administrador'
                                ? 'bg-red-950/80 border-red-500/40 text-red-400'
                                : item.user.role === 'Coordinador Trade'
                                ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                                : item.user.role === 'Promotor Merchandising'
                                ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                                : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                            }`}>
                              {item.user.role}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 3. ACCIÓN REGISTRADA */}
                      <td className="p-4 align-top">
                        <div className="space-y-1.5 max-w-md">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isLive
                                ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300'
                                : isError
                                ? 'bg-amber-950/80 border border-amber-500/40 text-amber-300'
                                : 'bg-zinc-800 text-zinc-200 border border-white/5'
                            }`}>
                              {item.action.label}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              ({item.action.module})
                            </span>
                          </div>

                          {item.action.details && (
                            <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                              {item.action.details}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 4. DETALLE DE DISPOSITIVO / CONEXIÓN (CON DIRECCIÓN GPS REAL Y ACCESO A GOOGLE EARTH) */}
                      <td className="p-4 align-top">
                        <div className="space-y-1.5 text-xs">
                          {/* IP y Ciudad Real */}
                          <div className="flex items-center gap-2 flex-wrap font-mono">
                            <span className="font-bold text-white bg-black/40 px-2 py-0.5 rounded border border-white/5 text-[11px]">
                              🌐 {item.device.ip}
                            </span>
                            <span className="text-zinc-300 flex items-center gap-1 text-[11px] font-semibold">
                              <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                              <span>{item.device.locationCity}</span>
                            </span>
                          </div>

                          {/* Dirección Física Exacta resuelta desde el GPS Real */}
                          {item.device.address && (
                            <div className="text-[11px] text-emerald-300/95 bg-emerald-950/30 border border-emerald-500/20 rounded-lg px-2.5 py-1 leading-snug max-w-md">
                              <span className="font-bold text-emerald-400">📍 Dirección GPS: </span>
                              <span>{item.device.address}</span>
                            </div>
                          )}

                          {/* Dispositivo y Sistema Operativo */}
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400 pt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 text-zinc-300 font-medium">
                              {isMobile ? (
                                <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <Laptop className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              )}
                              <span>{item.device.os}</span>
                            </span>
                            <span className="text-zinc-600">•</span>
                            <span className="truncate max-w-[160px]">{item.device.browser}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-emerald-400 font-mono text-[10px]">{item.device.connection}</span>
                          </div>

                          {/* Coordenadas GPS Reales con Botón Directo para Abrir en Google Earth */}
                          {item.device.coordinates ? (
                            <div className="pt-1 flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUserForEarthModal(item);
                                }}
                                className={`group/gps inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer shadow-sm text-[10px] font-mono ${
                                  item.device.gpsVerified
                                    ? 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-500/40 text-emerald-300 hover:text-white'
                                    : 'bg-blue-950/70 hover:bg-blue-900 border-blue-500/40 text-blue-300 hover:text-white'
                                }`}
                                title={`Abrir en Google Earth • ${item.device.address || item.device.locationCity}`}
                              >
                                <Globe2
                                  className={`w-3.5 h-3.5 group-hover/gps:scale-110 group-hover/gps:text-white transition-transform ${
                                    item.device.gpsVerified ? 'text-emerald-400 animate-pulse' : 'text-blue-400'
                                  }`}
                                />
                                <span className="font-bold">
                                  {item.device.gpsVerified
                                    ? `GPS Verificado${item.device.accuracy ? ` (±${item.device.accuracy}m)` : ''}:`
                                    : 'Ubicación Red/IP:'}
                                </span>
                                <span>{item.device.coordinates}</span>
                                <span
                                  className={`text-[9px] px-1 py-0.2 rounded border ${
                                    item.device.gpsVerified
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                      : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                  }`}
                                >
                                  Google Earth ↗
                                </span>
                              </button>
                            </div>
                          ) : (
                            <div className="pt-1 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-400 text-[10px] font-mono">
                                Sin permiso GPS en navegador • Haz clic en &quot;Sincronizar Mi GPS Actual&quot;
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer de la Tabla */}
        <div className="p-4 bg-[#141518] border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-400">
          <span>
            Mostrando <strong>{filteredLogs.length}</strong> de <strong>{logs.length}</strong> eventos registrados.
          </span>
          <span className="font-mono text-[11px]">
            Sincronización continua de conexiones • Codizulca 2026
          </span>
        </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: DETALLES COMPLETOS DE LA AUDITORÍA DE CONEXIÓN                  */}
      {/* ========================================================================= */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#121316] border border-white/15 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header del Modal */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#16171b]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-500">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Ficha de Trazabilidad</h3>
                  <span className="text-xs text-zinc-400 font-mono">
                    ID Evento: {selectedLog.id} • {selectedLog.formattedDate} {selectedLog.formattedTime}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* Sección 1: Identidad del Usuario */}
              <div className="p-4 rounded-2xl bg-[#17181c] border border-white/5 space-y-3">
                <h4 className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                  Identidad y Credenciales
                </h4>
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 border border-white/10 shrink-0 flex items-center justify-center font-black text-white text-base">
                    {selectedLog.user.photoUrl ? (
                      <img src={selectedLog.user.photoUrl} alt={selectedLog.user.name} className="w-full h-full object-cover" />
                    ) : (
                      selectedLog.user.name.charAt(0)
                    )}
                  </div>
                  <div>
                    <h5 className="font-black text-white text-sm uppercase">{selectedLog.user.name}</h5>
                    <p className="font-mono text-zinc-400 text-xs">{selectedLog.user.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-red-950/80 border border-red-500/40 text-red-400 text-[10px] font-bold">
                      {selectedLog.user.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sección 2: Acción y Módulo */}
              <div className="p-4 rounded-2xl bg-[#17181c] border border-white/5 space-y-2.5">
                <h4 className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                  Acción Ejecutada
                </h4>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">{selectedLog.action.label}</span>
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                    {selectedLog.action.module}
                  </span>
                </div>
                {selectedLog.action.details && (
                  <p className="text-zinc-300 leading-relaxed bg-black/40 p-3 rounded-xl border border-white/5 font-medium">
                    {selectedLog.action.details}
                  </p>
                )}
              </div>

              {/* Sección 3: Dispositivo, Red & Ubicación */}
              <div className="p-4 rounded-2xl bg-[#17181c] border border-white/5 space-y-2.5 font-mono">
                <h4 className="text-[11px] font-black uppercase text-zinc-400 tracking-wider font-sans">
                  Detalle de Red, Dispositivo & Ubicación GPS Real
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-zinc-500 block text-[10px]">Dirección IP</span>
                    <strong className="text-white">{selectedLog.device.ip}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-zinc-500 block text-[10px]">Tipo de Conexión</span>
                    <strong className="text-emerald-400">{selectedLog.device.connection}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-zinc-500 block text-[10px]">Sistema Operativo</span>
                    <strong className="text-zinc-200">{selectedLog.device.os} ({selectedLog.device.deviceType})</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-zinc-500 block text-[10px]">Navegador Web</span>
                    <strong className="text-zinc-200 truncate block">{selectedLog.device.browser}</strong>
                  </div>
                  <div className="col-span-2 p-2.5 rounded-lg bg-black/30 border border-white/5 space-y-1">
                    <span className="text-zinc-500 block text-[10px]">Dirección Física Exacta (GPS)</span>
                    <div className="text-emerald-300 font-bold">
                      📍 {selectedLog.device.address || selectedLog.device.locationCity}
                    </div>
                    <div className="flex items-center justify-between text-zinc-400 text-[10px] pt-1 border-t border-white/5">
                      <span>Ciudad/Estado: {selectedLog.device.locationCity}</span>
                      {selectedLog.device.coordinates && (
                        <span className="text-white font-bold">
                          {selectedLog.device.coordinates}
                          {selectedLog.device.accuracy ? ` (±${selectedLog.device.accuracy}m)` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 bg-[#141518] border-t border-white/10 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors cursor-pointer text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* 5. MODAL SATELITAL GOOGLE EARTH (AL TILDAR A UN USUARIO)                  */}
      {/* ========================================================================= */}
      {selectedUserForEarthModal && (
        <UserEarthMapModal
          log={selectedUserForEarthModal}
          isOpen={!!selectedUserForEarthModal}
          onClose={() => setSelectedUserForEarthModal(null)}
        />
      )}
    </div>
  );
};
