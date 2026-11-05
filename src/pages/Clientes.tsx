import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Building2, 
  UserCircle, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Store, 
  Layers, 
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Compass,
  LayoutGrid,
  Table as TableIcon,
  Download,
  Map as MapIcon,
  ExternalLink,
  Clock,
  Sparkles,
  Phone,
  Globe2,
  Target,
  Copy,
  Check,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ENRICHED_CLIENTS, EnrichedClient, SURVEY_STATS, buildEnrichedClientsFromCartera } from '../data/clientsWithLocation';
import { getSellerMetadata, hydrateSellerMetadataFromSupabase, isValidVolumeSeller, OFFICIAL_SUPERVISORS } from '../components/cuotas/sellerSupervisorMap';
import { ClientCard } from '../components/clientes/ClientCard';
import { ClientMapModal } from '../components/clientes/ClientMapModal';
import { AllClientsMap, getSellerColor } from '../components/clientes/AllClientsMap';
import { VendedorMultiSelect, SellerOption } from '../components/clientes/VendedorMultiSelect';

export type GeofenceFilterMode = 'ALL' | 'GEOFENCE_ALL' | 'COMPLETA' | 'PENDIENTE' | 'MODIFICADA';

export const Clientes: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupervisor, setSelectedSupervisor] = useState('ALL');
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [selectedCanal, setSelectedCanal] = useState('ALL');
  const [selectedGpsFilter, setSelectedGpsFilter] = useState<GeofenceFilterMode>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'map' | 'table'>('cards');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24;

  // Selected client for map modal
  const [selectedClientForMap, setSelectedClientForMap] = useState<EnrichedClient | null>(null);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live synchronized portfolio (hydrated dynamically from /api/clientes/maestra & Supabase)
  const [liveClients, setLiveClients] = useState<EnrichedClient[]>(ENRICHED_CLIENTS);
  const [liveStats, setLiveStats] = useState(SURVEY_STATS);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/clientes/maestra')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload || !Array.isArray(payload.clientes)) return;
        if (Array.isArray(payload.vendedores) && payload.vendedores.length > 0) {
          hydrateSellerMetadataFromSupabase(payload.vendedores);
        }
        const enriched = buildEnrichedClientsFromCartera(payload.clientes);
        if (enriched.clients.length > 0) {
          setLiveClients(enriched.clients);
          setLiveStats(enriched.stats);
        }
        if (payload.syncedAt) {
          const prevSync = localStorage.getItem('codizulca_maestra_sync_version');
          if (prevSync !== payload.syncedAt) {
            localStorage.setItem('codizulca_maestra_sync_version', String(payload.syncedAt));
          }
        }
      })
      .catch(() => {
        // Fallback silencioso a ENRICHED_CLIENTS empaquetado localmente
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Extract unique official supervisors (Johnatan Soto, Ali Perez, Nelson Finol)
  const supervisorsList = useMemo(() => {
    return [...OFFICIAL_SUPERVISORS];
  }, []);

  // Extract unique sellers with both total clients and geocercas count (strictly official 25 sellers)
  const sellersList = useMemo(() => {
    const map = new Map<string, { total: number; withGps: number }>();
    liveClients.forEach(c => {
      if (selectedSupervisor === 'ALL' || c.supervisor === selectedSupervisor) {
        if (c.vendedor && isValidVolumeSeller(c.vendedor)) {
          const current = map.get(c.vendedor) || { total: 0, withGps: 0 };
          current.total += 1;
          if (c.hasLocation) current.withGps += 1;
          map.set(c.vendedor, current);
        }
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedSupervisor, liveClients]);

  // Options for VendedorMultiSelect
  const sellersOptions: SellerOption[] = useMemo(() => {
    return sellersList.map(([seller, stats]) => ({
      name: seller,
      total: stats.total,
      withGps: stats.withGps,
      color: getSellerColor(seller)
    }));
  }, [sellersList]);

  // Extract unique canales
  const canalesList = useMemo(() => {
    const set = new Set<string>();
    liveClients.forEach(c => {
      if (c.canal) set.add(c.canal);
    });
    return Array.from(set).sort();
  }, [liveClients]);

  // Filtered clients
  const filteredData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return liveClients.filter(client => {
      // 1. Search term
      let matchSearch = true;
      if (term) {
        const inName = client.nombre.toLowerCase().includes(term);
        const inId = client.id.toLowerCase().includes(term);
        const inVendedor = client.vendedor.toLowerCase().includes(term);
        const inSupervisor = client.supervisor.toLowerCase().includes(term);
        const inZona = client.zona.toLowerCase().includes(term);
        const inSector = client.sector.toLowerCase().includes(term);
        const inRif = (client.rif || client.survey?.rifCedula || '').toLowerCase().includes(term);
        const inMunicipio = client.survey?.municipio?.toLowerCase().includes(term) || false;
        const inEstado = client.survey?.estado?.toLowerCase().includes(term) || false;
        const inTelefono = client.survey?.telefono?.toLowerCase().includes(term) || false;
        matchSearch = inName || inId || inVendedor || inSupervisor || inZona || inSector || inRif || inMunicipio || inEstado || inTelefono;
      }

      // 2. Supervisor
      const matchSupervisor = selectedSupervisor === 'ALL' || client.supervisor === selectedSupervisor;

      // 3. Vendedor (Multi-selection)
      const matchSeller = selectedSellers.length === 0 || selectedSellers.includes(client.vendedor);

      // 4. Canal
      const matchCanal = selectedCanal === 'ALL' || client.canal === selectedCanal;

      // 5. GPS / Geocerca filter (Total Global of surveys, or by status)
      const matchGps = 
        selectedGpsFilter === 'ALL' || 
        (selectedGpsFilter === 'GEOFENCE_ALL' && client.hasLocation) ||
        (selectedGpsFilter === 'COMPLETA' && client.hasLocation && client.survey?.estadoEncuesta?.toUpperCase() === 'COMPLETA') ||
        (selectedGpsFilter === 'PENDIENTE' && client.hasLocation && client.survey?.estadoEncuesta?.toUpperCase() === 'PENDIENTE') ||
        (selectedGpsFilter === 'MODIFICADA' && client.hasLocation && client.survey?.estadoEncuesta?.toUpperCase() === 'MODIFICADA');

      return matchSearch && matchSupervisor && matchSeller && matchCanal && matchGps;
    });
  }, [searchTerm, selectedSupervisor, selectedSellers, selectedCanal, selectedGpsFilter, liveClients]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSupervisor, selectedSellers, selectedCanal, selectedGpsFilter]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  const handleOpenMap = (client: EnrichedClient) => {
    setSelectedClientForMap(client);
    setIsMapModalOpen(true);
  };

  const canalBadgeColor = (canal: string) => {
    const c = (canal || '').toUpperCase();
    if (c.includes('CARNICERIA') || c.includes('FRIGORIFICO') || c.includes('CHARCUTERIA')) {
      return 'bg-red-950/70 text-red-300 border-red-800/60 font-bold';
    }
    if (c.includes('SUPERMERCADO') || c.includes('CADENA') || c.includes('HIPERMERCADO')) {
      return 'bg-zinc-900 text-white border-white/20 font-bold';
    }
    return 'bg-zinc-900 text-zinc-300 border-white/10 font-medium';
  };

  // Export to Excel with coordinates and geofences
  const handleExportExcel = () => {
    const exportRows = filteredData.map(c => {
      const hasGps = c.hasLocation && c.survey?.latitud && c.survey?.longitud;
      const lat = c.survey?.latitud;
      const lng = c.survey?.longitud;
      return {
        'Código Cliente': c.id,
        'Nombre Cliente': c.nombre,
        'RIF / Cédula': c.rif || c.survey?.rifCedula || '',
        'Sector': c.sector,
        'Vendedor Asignado': c.vendedor,
        'Supervisor': c.supervisor,
        'Zona': c.zona,
        'Región': c.region,
        'Canal Comercial': c.canal,
        'Dirección Exacta GPS': c.direccion || c.survey?.direccion || '',
        'Geocerca Sincronizada': hasGps ? 'SÍ (Activa 50m)' : 'NO (Pendiente)',
        'Estatus Geocerca / Encuesta': c.survey?.estadoEncuesta || (hasGps ? 'COMPLETA' : 'PENDIENTE GPS'),
        'Latitud': lat ?? '',
        'Longitud': lng ?? '',
        'Perímetro de Visita': hasGps ? '50 Metros' : '',
        'Estado Geográfico': c.survey?.estado ?? '',
        'Municipio': c.survey?.municipio ?? '',
        'Teléfono': c.survey?.telefono ?? '',
        'Fecha Encuesta': c.survey?.fecha ?? '',
        'Link Google Maps': hasGps ? `https://www.google.com/maps?q=${lat},${lng}` : '',
        'Link Google Earth 3D': hasGps ? `https://earth.google.com/web/@${lat},${lng},120a,350d,35y,0t,0r` : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Geocercas y Cartera');
    XLSX.writeFile(wb, `Geocercas_Clientes_Codizulca_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 font-sans text-zinc-100 max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] flex items-center gap-2">
              <Target className="w-7 h-7 text-red-500" />
              MÓDULO DE CLIENTES & GEOCERCAS
            </h2>
            <span className="px-3 py-1 text-xs font-bold bg-zinc-900 text-white border border-white/10 rounded-full flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              {liveStats.totalWithGps.toLocaleString()} Geocercas Sincronizadas • Radio 50m
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1.5 max-w-4xl">
            Sincronización integral de todas las ubicaciones GPS de clientes por vendedor, sin importar estatus (Completas, Pendientes y Modificadas). Perímetros de visita de 50 metros y rutas territoriales oficiales Codizulca.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-[#e00613] text-zinc-200 hover:text-white border border-white/10 hover:border-red-500/50 text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4 text-red-400" />
            <span>Exportar Geocercas Excel ({filteredData.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clientes Cartera */}
        <div 
          onClick={() => setSelectedGpsFilter('ALL')}
          className={`border rounded-2xl p-5 flex items-center gap-4 shadow-lg cursor-pointer transition-all ${
            selectedGpsFilter === 'ALL'
              ? 'bg-zinc-900 border-red-500 ring-2 ring-red-500/20'
              : 'bg-zinc-950/90 border-white/10 hover:border-white/30'
          }`}
        >
          <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-red-500 shrink-0">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Clientes Cartera</p>
            <p className="text-2xl font-black text-white">{liveClients.length.toLocaleString()}</p>
            <p className="text-[11px] text-zinc-400">Base total consolidada</p>
          </div>
        </div>

        {/* Geocercas Sincronizadas (Clickable filter with sub-statuses) */}
        <div 
          className={`border rounded-2xl p-5 shadow-lg transition-all ${
            selectedGpsFilter !== 'ALL'
              ? 'bg-red-950/50 border-red-500 ring-2 ring-red-500/30' 
              : 'bg-zinc-950/90 border-white/10 hover:border-red-500/60'
          }`}
        >
          <div 
            onClick={() => setSelectedGpsFilter(selectedGpsFilter === 'GEOFENCE_ALL' ? 'ALL' : 'GEOFENCE_ALL')}
            className="flex items-center gap-4 cursor-pointer mb-2.5"
          >
            <div className="h-12 w-12 rounded-xl bg-red-950/70 border border-red-700/60 flex items-center justify-center text-red-500 shrink-0">
              <Target className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold tracking-widest text-white uppercase">Geocercas Sincronizadas</p>
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-white">{liveStats.totalWithGps.toLocaleString()}</p>
                <span className="text-[10px] font-bold text-red-400 uppercase">Todos los Estatus</span>
              </div>
            </div>
          </div>

          {/* Quick status filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-white/10 text-[10px]">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSelectedGpsFilter(selectedGpsFilter === 'COMPLETA' ? 'ALL' : 'COMPLETA'); }}
              className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer font-bold flex items-center gap-1 ${
                selectedGpsFilter === 'COMPLETA' ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-zinc-900 text-emerald-400 border-emerald-900/60 hover:border-emerald-500'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {liveStats.completasCount.toLocaleString()} Completas
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSelectedGpsFilter(selectedGpsFilter === 'PENDIENTE' ? 'ALL' : 'PENDIENTE'); }}
              className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer font-bold flex items-center gap-1 ${
                selectedGpsFilter === 'PENDIENTE' ? 'bg-amber-600 text-white border-amber-400' : 'bg-zinc-900 text-amber-400 border-amber-900/60 hover:border-amber-500'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {liveStats.pendientesCount.toLocaleString()} Pendientes
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSelectedGpsFilter(selectedGpsFilter === 'MODIFICADA' ? 'ALL' : 'MODIFICADA'); }}
              className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer font-bold flex items-center gap-1 ${
                selectedGpsFilter === 'MODIFICADA' ? 'bg-blue-600 text-white border-blue-400' : 'bg-zinc-900 text-blue-400 border-blue-900/60 hover:border-blue-500'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              {liveStats.modificadasCount.toLocaleString()} Modificadas
            </button>
          </div>
        </div>

        {/* Vendedores con Geocercas */}
        <div className="bg-zinc-950/90 border border-white/10 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
          <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-red-500 shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Vendedores en Ruta</p>
            <p className="text-2xl font-black text-white">{sellersList.filter(([_, s]) => s.withGps > 0).length}</p>
            <p className="text-[11px] text-zinc-400">Rutas comerciales activas</p>
          </div>
        </div>

        {/* Municipios Georreferenciados */}
        <div className="bg-zinc-950/90 border border-white/10 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
          <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-red-500 shrink-0">
            <Compass className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Municipios Cobertura</p>
            <p className="text-2xl font-black text-white">{liveStats.municipios.length}</p>
            <p className="text-[11px] text-zinc-400">Zulia, Falcón y Trujillo</p>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & View Switcher */}
      <div className="bg-zinc-950/60 border border-white/10 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main search input */}
          <div className="relative flex-1 min-w-[260px] sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Buscar por cliente, RIF, vendedor, municipio..." 
              className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* View Mode Buttons (Cards, Map, Table) */}
          <div className="flex items-center bg-black/60 border border-white/10 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'cards' 
                  ? 'bg-red-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Tarjetas ({filteredData.length})</span>
            </button>

            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'map' 
                  ? 'bg-red-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Mapa Cobertura</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'table' 
                  ? 'bg-red-600 text-white shadow' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabla</span>
            </button>
          </div>
        </div>

        {/* Second Row: Specific Select Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5">
          {/* Vendedor Filter (Multi-Select) */}
          <VendedorMultiSelect
            sellers={sellersOptions}
            selectedSellers={selectedSellers}
            onChange={setSelectedSellers}
          />

          {/* Supervisor Filter */}
          <select 
            className="bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-red-500"
            value={selectedSupervisor}
            onChange={(e) => {
              setSelectedSupervisor(e.target.value);
              setSelectedSellers([]);
            }}
          >
            <option value="ALL">Todos los Supervisores ({supervisorsList.length})</option>
            {supervisorsList.map((sup) => (
              <option key={sup} value={sup}>{sup}</option>
            ))}
          </select>

          {/* Canal Filter */}
          <select 
            className="bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-red-500"
            value={selectedCanal}
            onChange={(e) => setSelectedCanal(e.target.value)}
          >
            <option value="ALL">Todos los Canales ({canalesList.length})</option>
            {canalesList.map((canal) => (
              <option key={canal} value={canal}>{canal}</option>
            ))}
          </select>

          {/* GPS / Geocercas Filter: Total Global & Status Selectors */}
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1 flex-wrap">
            <button
              onClick={() => setSelectedGpsFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedGpsFilter === 'ALL' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todos ({liveClients.length.toLocaleString()})
            </button>
            <button
              onClick={() => setSelectedGpsFilter('GEOFENCE_ALL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                selectedGpsFilter === 'GEOFENCE_ALL' ? 'bg-[#e00613] text-white border border-red-500 shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Target className="w-3.5 h-3.5 text-white" />
              Total Geocercas ({liveStats.totalWithGps.toLocaleString()})
            </button>
            <button
              onClick={() => setSelectedGpsFilter('COMPLETA')}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedGpsFilter === 'COMPLETA' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-400/80 hover:text-emerald-300'
              }`}
            >
              ✓ Completas ({liveStats.completasCount.toLocaleString()})
            </button>
            <button
              onClick={() => setSelectedGpsFilter('PENDIENTE')}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedGpsFilter === 'PENDIENTE' ? 'bg-amber-600 text-white font-bold' : 'text-amber-400/80 hover:text-amber-300'
              }`}
            >
              ⏳ Pendientes ({liveStats.pendientesCount.toLocaleString()})
            </button>
            <button
              onClick={() => setSelectedGpsFilter('MODIFICADA')}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                selectedGpsFilter === 'MODIFICADA' ? 'bg-blue-600 text-white font-bold' : 'text-blue-400/80 hover:text-blue-300'
              }`}
            >
              ✎ Modificadas ({liveStats.modificadasCount.toLocaleString()})
            </button>
          </div>

          {/* Reset Filters button */}
          {(searchTerm || selectedSupervisor !== 'ALL' || selectedSellers.length > 0 || selectedCanal !== 'ALL' || selectedGpsFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedSupervisor('ALL');
                setSelectedSellers([]);
                setSelectedCanal('ALL');
                setSelectedGpsFilter('ALL');
              }}
              className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors ml-auto flex items-center gap-1 cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Selected Sellers Active Chips */}
        {selectedSellers.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
            <span className="text-[11px] text-zinc-400 font-bold">Vendedores activos:</span>
            {selectedSellers.map(seller => (
              <span
                key={seller}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/40 border border-red-500/40 text-red-200"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getSellerColor(seller) }} />
                {seller}
                <button
                  type="button"
                  onClick={() => setSelectedSellers(selectedSellers.filter(s => s !== seller))}
                  className="hover:text-white ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelectedSellers([])}
              className="text-[11px] text-red-400 hover:text-red-300 underline font-semibold ml-1 cursor-pointer"
            >
              Limpiar todos
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {viewMode === 'map' ? (
        /* 1. Global Coverage & Geocercas Map */
        <AllClientsMap
          clients={filteredData}
          onSelectClient={handleOpenMap}
        />
      ) : viewMode === 'cards' ? (
        /* 2. Client Cards Grid (Requested Feature) */
        <div className="space-y-6">
          {paginatedData.length === 0 ? (
            <div className="bg-zinc-950/60 border border-white/10 rounded-2xl p-12 text-center space-y-3">
              <Target className="w-10 h-10 text-zinc-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No se encontraron clientes o geocercas</h4>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                No hay resultados con los filtros actuales de vendedor, supervisor o estatus de geocerca.
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSupervisor('ALL');
                  setSelectedSellers([]);
                  setSelectedCanal('ALL');
                  setSelectedGpsFilter('ALL');
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {paginatedData.map((client) => (
                <ClientCard
                  key={`${client.id}-${client.vendedor}`}
                  client={client}
                  onOpenMap={handleOpenMap}
                  canalBadgeColor={canalBadgeColor}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {filteredData.length > itemsPerPage && (
            <div className="bg-zinc-950/70 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
              <div>
                Mostrando <span className="text-white font-semibold">{filteredData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> a{' '}
                <span className="text-white font-semibold">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> de{' '}
                <span className="text-white font-semibold">{filteredData.length.toLocaleString()}</span> clientes
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-zinc-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 font-semibold"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <span className="px-3 py-1 font-bold text-white bg-zinc-900 rounded-lg border border-white/10">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-zinc-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 font-semibold"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 3. Detailed Geocercas Table View */
        <div className="bg-zinc-950/70 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/10">
                  <th className="p-4 font-bold text-zinc-400 uppercase tracking-wider">Código / Cliente</th>
                  <th className="p-4 font-bold text-zinc-400 uppercase tracking-wider">Sector de Ubicación</th>
                  <th className="p-4 font-bold text-zinc-400 uppercase tracking-wider">Vendedor Asignado</th>
                  <th className="p-4 font-bold text-zinc-400 uppercase tracking-wider">Estatus Geocerca</th>
                  <th className="p-4 font-bold text-zinc-400 uppercase tracking-wider">Perímetro & Coords GPS</th>
                  <th className="p-4 font-bold text-zinc-400 uppercase tracking-wider">Canal</th>
                  <th className="p-4 font-bold text-zinc-400 uppercase tracking-wider text-right">Ficha & Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedData.map((client) => {
                  const hasGps = client.hasLocation && client.survey?.latitud && client.survey?.longitud;
                  const lat = client.survey?.latitud;
                  const lng = client.survey?.longitud;
                  const sellerColor = getSellerColor(client.vendedor);
                  const estado = client.survey?.estadoEncuesta?.toUpperCase();

                  const statusBadgeClass = estado === 'COMPLETA' 
                    ? 'bg-red-950/70 text-white border-red-600/60 font-bold' 
                    : estado === 'PENDIENTE' 
                    ? 'bg-zinc-900 text-zinc-300 border-white/10 font-medium' 
                    : estado === 'MODIFICADA' 
                    ? 'bg-zinc-900 text-zinc-200 border-white/20 font-medium' 
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800';

                  const googleEarthUrl = hasGps ? `https://earth.google.com/web/@${lat},${lng},120a,350d,35y,0t,0r` : null;

                  return (
                    <tr key={`${client.id}-${client.vendedor}`} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-black text-white bg-red-950/80 border border-red-700/60 px-2 py-0.5 rounded shadow-sm">
                            <span className="text-red-400 font-bold">COD:</span> #{client.id}
                          </span>
                          {hasGps && (
                            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" title="Geocerca Sincronizada" />
                          )}
                        </div>
                        <p className="font-bold text-white text-sm">{client.nombre}</p>
                        {(client.rif || client.survey?.rifCedula) && (
                          <p className="text-[11px] text-zinc-500 font-mono">RIF: {client.rif || client.survey?.rifCedula}</p>
                        )}
                      </td>

                      {/* Columna Sector de Ubicación */}
                      <td className="p-4 max-w-[280px]">
                        <p className="font-bold text-white text-xs flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span>{client.sector}</span>
                        </p>
                        {(client.direccion || client.survey?.direccion) && (
                          <p className="text-[11px] text-zinc-300 mt-0.5 leading-snug">
                            {client.direccion || client.survey?.direccion}
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {client.survey?.municipio ? `${client.survey.municipio}, ${client.survey.estado || 'Zulia'}` : client.zona}
                        </p>
                      </td>
                      
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: sellerColor }} 
                          />
                          <span className="font-semibold text-zinc-200">
                            {client.vendedor}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 ml-4">{client.supervisor}</p>
                      </td>

                      <td className="p-4">
                        {hasGps ? (
                          <div className="space-y-1">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeClass}`}>
                              {estado === 'COMPLETA' && <CheckCircle2 className="w-3 h-3 text-red-400" />}
                              {estado === 'PENDIENTE' && <Clock className="w-3 h-3 text-zinc-400" />}
                              {estado === 'MODIFICADA' && <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />}
                              {estado || 'COMPLETA'}
                            </span>
                            <p className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                              <Target className="w-3 h-3 text-red-500" />
                              Radio: 50m activo
                            </p>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 italic bg-zinc-900 px-2 py-0.5 rounded border border-white/5">
                            <Clock className="w-3 h-3" />
                            Pendiente GPS
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-mono text-[11px]">
                        {hasGps ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white bg-zinc-900 border border-white/10 px-2 py-0.5 rounded">
                                {lat?.toFixed(5)}, {lng?.toFixed(5)}
                              </span>
                              <button
                                onClick={() => handleCopyText(`${lat}, ${lng}`, client.id)}
                                className="p-1 rounded bg-black/40 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                title="Copiar coordenadas"
                              >
                                {copiedId === client.id ? (
                                  <Check className="w-3 h-3 text-red-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            {client.survey?.fecha && (
                              <p className="text-[10px] text-zinc-500 font-sans">
                                Fecha: {client.survey.fecha}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">Sin coordenadas</span>
                        )}
                      </td>

                      <td className="p-4">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${canalBadgeColor(client.canal)}`}>
                          {client.canal}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleOpenMap(client)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow cursor-pointer ${
                              hasGps 
                                ? 'bg-[#e00613] hover:bg-[#c90510] text-white shadow-red-950/60' 
                                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10'
                            }`}
                            title="Ver Ficha Técnica Oficial del Cliente"
                          >
                            <Compass className="w-3.5 h-3.5" />
                            <span>Ver Ficha</span>
                          </button>

                          {hasGps && googleEarthUrl && (
                            <a
                              href={googleEarthUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 transition-colors"
                              title="Explorar en Google Earth 3D"
                            >
                              <Globe2 className="w-3.5 h-3.5 text-red-500" />
                            </a>
                          )}
                          {hasGps && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-colors"
                              title="Abrir en Google Maps"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table pagination */}
          <div className="p-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
            <div>
              Mostrando <span className="text-white font-semibold">{filteredData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> a{' '}
              <span className="text-white font-semibold">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> de{' '}
              <span className="text-white font-semibold">{filteredData.length.toLocaleString()}</span> clientes
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="px-3 py-1 font-bold text-white bg-zinc-900 rounded-lg">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Map Modal for Selected Client */}
      <ClientMapModal
        client={selectedClientForMap}
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
      />
    </div>
  );
};
