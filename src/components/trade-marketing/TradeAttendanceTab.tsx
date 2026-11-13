import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  UserPlus,
  Store,
  MapPin,
  RefreshCw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  X,
  Upload,
  ShieldCheck,
  Users,
  Sparkles,
  FileCheck,
  Pencil,
  Eye,
  Sun,
  Sunset,
} from 'lucide-react';
import {
  tradeAttendanceService,
  TRADE_TURNO_DESCRIPTORS,
  TradePromotora,
  TradePromotoraType,
  TradeAttendanceTurno,
  TradeEstadoJornada,
  DailyPromotoraAttendanceRow,
  TradeAttendanceKpiSummary,
  getCaracasCurrentDateKey,
  evaluateTurnoSequenceCoherence,
} from '../../lib/tradeAttendanceService';
import {
  compressAttendanceImageToWebp,
  CompressedWebpResult,
} from '../../lib/imageCompressor';
import { ENRICHED_CLIENTS } from '../../data/clientsWithLocation';

const ESTADO_JORNADA_CONFIG: Record<
  TradeEstadoJornada,
  { label: string; badgeClass: string; dotClass: string }
> = {
  completa: {
    label: 'Completa (4/4)',
    badgeClass: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
    dotClass: 'bg-emerald-400',
  },
  en_progreso: {
    label: 'En Curso',
    badgeClass: 'bg-blue-950/80 border-blue-500/40 text-blue-300',
    dotClass: 'bg-blue-400 animate-pulse',
  },
  parcial_justificada: {
    label: 'Parcial Justificada',
    badgeClass: 'bg-purple-950/80 border-purple-500/40 text-purple-300',
    dotClass: 'bg-purple-400',
  },
  incidencia: {
    label: 'Con Incidencia',
    badgeClass: 'bg-red-950/80 border-red-500/40 text-red-300',
    dotClass: 'bg-red-400 animate-ping',
  },
  pendiente: {
    label: 'Pendiente (0/4)',
    badgeClass: 'bg-zinc-900 border-white/10 text-zinc-400',
    dotClass: 'bg-zinc-500',
  },
};

export const TradeAttendanceTab: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => getCaracasCurrentDateKey());
  const [segmentFilter, setSegmentFilter] = useState<'todas' | 'fija' | 'eventual'>('todas');
  const [zoneFilter, setZoneFilter] = useState<string>('todas');
  const [pdvFilter, setPdvFilter] = useState<string>('todos');
  const [estadoFilter, setEstadoFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [rows, setRows] = useState<DailyPromotoraAttendanceRow[]>([]);
  const [kpis, setKpis] = useState<TradeAttendanceKpiSummary>({
    totalPromotoras: 0,
    totalFijas: 0,
    totalEventuales: 0,
    jornadasCompletas: 0,
    enCurso: 0,
    pendientesOIncidencia: 0,
    conIncidencia: 0,
    sinRegistro: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estado del Modal de Carga / Actualización de Turno
  const [uploadModal, setUploadModal] = useState<{
    promotoraId: string;
    turno: TradeAttendanceTurno;
    puntoVenta: string;
    zona: string;
    observaciones: string;
  } | null>(null);
  const [compressedPreview, setCompressedPreview] = useState<CompressedWebpResult | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado del Visor Ejecutivo Lightbox 4x
  const [lightboxRow, setLightboxRow] = useState<DailyPromotoraAttendanceRow | null>(null);
  const [focusedTurno, setFocusedTurno] = useState<TradeAttendanceTurno | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Estado del Modal de Gestión de Promotoras
  const [isPromotoraModalOpen, setIsPromotoraModalOpen] = useState<boolean>(false);
  const [editingPromotora, setEditingPromotora] = useState<{
    id?: string;
    codigo: string;
    cedula: string;
    nombre_completo: string;
    telefono: string;
    tipo_promotora: TradePromotoraType;
    zona: string;
    supervisor_nombre: string;
    punto_venta_habitual: string;
    activa: boolean;
  } | null>(null);
  const [promotoraModalError, setPromotoraModalError] = useState<string | null>(null);
  const [isSavingPromotora, setIsSavingPromotora] = useState<boolean>(false);

  const loadDailyBoard = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const res = await tradeAttendanceService.getDailyAttendanceMatrix(selectedDate);
        setRows(res.rows);
        setKpis(res.kpis);
        setLastSyncTime(new Date());
      } catch (err: any) {
        console.error('[TradeAttendanceTab] Error cargando matriz diaria:', err);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [selectedDate]
  );

  useEffect(() => {
    loadDailyBoard(false);
    const unsubscribe = tradeAttendanceService.subscribeToRealtime(selectedDate, () => {
      loadDailyBoard(true);
    });
    return () => {
      unsubscribe();
    };
  }, [selectedDate, loadDailyBoard]);

  // Catálogos dinámicos de Zonas y Puntos de Venta para los selectores
  const availableZones = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.zonaEfectiva) set.add(r.zonaEfectiva);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  const availablePdvs = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.puntoVentaEfectivo) set.add(r.puntoVentaEfectivo);
    });
    ENRICHED_CLIENTS.slice(0, 60).forEach((c) => {
      if (c.name) set.add(c.name.trim().toUpperCase());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (segmentFilter !== 'todas' && r.tipoPromotoraEfectivo !== segmentFilter) {
        return false;
      }
      if (zoneFilter !== 'todas' && r.zonaEfectiva !== zoneFilter) {
        return false;
      }
      if (pdvFilter !== 'todos' && r.puntoVentaEfectivo !== pdvFilter) {
        return false;
      }
      if (estadoFilter !== 'todos' && r.estadoJornada !== estadoFilter) {
        return false;
      }
      if (q) {
        const matchName = r.promotora.nombre_completo.toLowerCase().includes(q);
        const matchCedula = r.promotora.cedula.toLowerCase().includes(q);
        const matchCodigo = (r.promotora.codigo || '').toLowerCase().includes(q);
        const matchPdv = r.puntoVentaEfectivo.toLowerCase().includes(q);
        if (!matchName && !matchCedula && !matchCodigo && !matchPdv) {
          return false;
        }
      }
      return true;
    });
  }, [rows, segmentFilter, zoneFilter, pdvFilter, estadoFilter, searchQuery]);

  // Promotora y fila actualmente seleccionadas en el modal de carga
  const activeModalRow = useMemo(() => {
    if (!uploadModal) return null;
    return rows.find((r) => r.promotora.id === uploadModal.promotoraId) || null;
  }, [uploadModal, rows]);

  const sequenceCoherence = useMemo(() => {
    if (!uploadModal || !activeModalRow) {
      return { requiresObservation: false, isBlockExitWithoutEntry: false, warningMessage: null };
    }
    return evaluateTurnoSequenceCoherence(activeModalRow.jornada, uploadModal.turno);
  }, [uploadModal, activeModalRow]);

  const openUploadForSlot = (
    row: DailyPromotoraAttendanceRow,
    turno: TradeAttendanceTurno
  ) => {
    setCompressedPreview(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadModal({
      promotoraId: row.promotora.id,
      turno,
      puntoVenta: row.puntoVentaEfectivo,
      zona: row.zonaEfectiva,
      observaciones: row.observaciones || '',
    });
  };

  const openQuickRegisterModal = () => {
    const firstRow = filteredRows[0] || rows[0];
    if (!firstRow) return;
    // Seleccionar automáticamente el primer turno pendiente del día
    const firstPending =
      TRADE_TURNO_DESCRIPTORS.find((d) => !firstRow.turnos[d.turno].isCompleted)?.turno ||
      'manana_entrada';
    openUploadForSlot(firstRow, firstPending);
  };

  const processSelectedFile = async (file: File) => {
    setUploadError(null);
    setIsCompressing(true);
    setUploadProgress(15);
    try {
      const result = await compressAttendanceImageToWebp(file, {
        onProgress: (pct) => setUploadProgress(pct),
      });
      setCompressedPreview(result);
    } catch (err: any) {
      setCompressedPreview(null);
      setUploadError(
        err?.message ||
          'El archivo seleccionado no es una imagen válida (JPEG, PNG o WebP) o está corrupto.'
      );
      setUploadProgress(0);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processSelectedFile(file);
    }
  };

  const handleConfirmUploadTurno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadModal || !activeModalRow || !compressedPreview || isUploading || isCompressing) {
      return;
    }

    if (sequenceCoherence.requiresObservation && !uploadModal.observaciones.trim()) {
      setUploadError(
        sequenceCoherence.warningMessage ||
          'Es obligatorio registrar una observación cuando se omite un turno previo.'
      );
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(20);

    try {
      const res = await tradeAttendanceService.uploadTurnoAttendancePhoto({
        promotora: activeModalRow.promotora,
        fechaJornada: selectedDate,
        turno: uploadModal.turno,
        file: compressedPreview.file,
        puntoVenta: uploadModal.puntoVenta,
        zona: uploadModal.zona,
        observaciones: uploadModal.observaciones.trim() || null,
        existingJornada: activeModalRow.jornada,
        onProgress: (pct) => setUploadProgress(pct),
      });

      const turnoLabel =
        TRADE_TURNO_DESCRIPTORS.find((d) => d.turno === uploadModal.turno)?.fullLabel ||
        uploadModal.turno;

      setFeedbackBanner({
        type: 'success',
        message: `Evidencia "${turnoLabel}" registrada para ${activeModalRow.promotora.nombre_completo} (${res.compressed.compressedKb} KB WebP • ${res.jornada.marcajes_completados}/4 turnos).`,
      });
      setTimeout(() => setFeedbackBanner(null), 6000);

      setUploadModal(null);
      setCompressedPreview(null);
      await loadDailyBoard(true);
    } catch (err: any) {
      setUploadError(err?.message || 'Error al registrar la evidencia del turno.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSavePromotora = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromotora || isSavingPromotora) return;
    setPromotoraModalError(null);
    setIsSavingPromotora(true);
    try {
      const saved = await tradeAttendanceService.upsertPromotora({
        id: editingPromotora.id,
        codigo: editingPromotora.codigo,
        cedula: editingPromotora.cedula,
        nombre_completo: editingPromotora.nombre_completo,
        telefono: editingPromotora.telefono,
        tipo_promotora: editingPromotora.tipo_promotora,
        zona: editingPromotora.zona,
        supervisor_nombre: editingPromotora.supervisor_nombre,
        punto_venta_habitual: editingPromotora.punto_venta_habitual,
        activa: editingPromotora.activa,
      });
      setEditingPromotora(null);
      setFeedbackBanner({
        type: 'success',
        message: `Promotora ${saved.nombre_completo} (${saved.tipo_promotora.toUpperCase()}) guardada correctamente.`,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
      await loadDailyBoard(true);
    } catch (err: any) {
      setPromotoraModalError(err?.message || 'Error al guardar los datos de la promotora.');
    } finally {
      setIsSavingPromotora(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="trade-attendance-tab">
      {/* Banner de retroalimentación */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold shadow-lg ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/90 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. TARJETAS KPI SUPERIORES (TIEMPO REAL)                            */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Promotoras del Día */}
        <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Total Promotoras del Día
            </span>
            <div className="w-8 h-8 rounded-lg bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-300">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-3xl font-black text-white" data-testid="kpi-total-promotoras">
              {kpis.totalPromotoras}
            </span>
            <span className="text-xs text-zinc-400 font-mono">activas en plantilla</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-500/30 text-emerald-300">
              {kpis.totalFijas} Fijas
            </span>
            <span className="px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-500/30 text-amber-300">
              {kpis.totalEventuales} Eventuales
            </span>
          </div>
        </div>

        {/* KPI 2: Jornadas Completas (4/4 fotos verificadas) */}
        <div className="bg-[#121316] border border-emerald-500/20 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              Jornadas Completas (4/4)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-3xl font-black text-emerald-400" data-testid="kpi-jornadas-completas">
              {kpis.jornadasCompletas}
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              {kpis.totalPromotoras > 0
                ? `${Math.round((kpis.jornadasCompletas / kpis.totalPromotoras) * 100)}% cumplimiento`
                : '0% cumplimiento'}
            </span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 text-[11px] text-zinc-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>4/4 evidencias WebP verificadas</span>
          </div>
        </div>

        {/* KPI 3: En Curso / Turno Mañana o Tarde activo (1/4 a 3/4 fotos) */}
        <div className="bg-[#121316] border border-blue-500/20 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
              En Curso (Mañana / Tarde)
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-3xl font-black text-blue-400" data-testid="kpi-en-curso">
              {kpis.enCurso}
            </span>
            <span className="text-xs text-zinc-400 font-mono">1/4 a 3/4 fotos</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 text-[11px] text-zinc-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span>Turno matutino o vespertino activo</span>
          </div>
        </div>

        {/* KPI 4: Pendientes / Con Incidencia (0/4 o marcaje incompleto) */}
        <div className="bg-[#121316] border border-amber-500/20 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              Pendientes / Con Incidencia
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-3xl font-black text-amber-400" data-testid="kpi-pendientes">
              {kpis.pendientesOIncidencia}
            </span>
            <span className="text-xs text-zinc-400 font-mono">requieren seguimiento</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
              {kpis.sinRegistro} sin registro (0/4)
            </span>
            {kpis.conIncidencia > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-red-950/80 border border-red-500/40 text-red-300">
                {kpis.conIncidencia} incidencia(s)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. BARRA DE FILTROS Y ACCIONES EJECUTIVAS                           */}
      {/* =================================================================== */}
      <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Selector de Fecha + Selector Segmentado Rápido */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-[11px] font-bold text-zinc-400 uppercase">Fecha (Caracas):</span>
              <input
                type="date"
                aria-label="Fecha de jornada en America/Caracas"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || getCaracasCurrentDateKey())}
                className="bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer"
              />
            </div>

            {/* Selector Segmentado: Todas | Promotoras Fijas | Promotoras Eventuales */}
            <div
              className="inline-flex items-center bg-black/60 border border-white/10 rounded-xl p-1 gap-1"
              role="group"
              aria-label="Filtro por tipo de promotora"
            >
              <button
                type="button"
                onClick={() => setSegmentFilter('todas')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  segmentFilter === 'todas'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Todas ({kpis.totalPromotoras})
              </button>
              <button
                type="button"
                onClick={() => setSegmentFilter('fija')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  segmentFilter === 'fija'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Promotoras Fijas ({kpis.totalFijas})
              </button>
              <button
                type="button"
                onClick={() => setSegmentFilter('eventual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  segmentFilter === 'eventual'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Promotoras Eventuales ({kpis.totalEventuales})
              </button>
            </div>
          </div>

          {/* Botones de Acción Ejecutivos */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadDailyBoard(false)}
              className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              title={`Última sincronización: ${lastSyncTime.toLocaleTimeString('es-VE')}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPromotoraModalOpen(true);
                setEditingPromotora(null);
                setPromotoraModalError(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>+ Gestionar Promotoras</span>
            </button>

            <button
              type="button"
              onClick={openQuickRegisterModal}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-lg shadow-red-600/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Registrar Asistencia / Asignar Eventual</span>
            </button>
          </div>
        </div>

        {/* Fila secundaria: Buscador por nombre/cédula + Filtros Zona / PDV / Estado */}
        <div className="pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula, código o PDV..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2">
            <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <select
              aria-label="Filtrar por Zona"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="w-full bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="todas" className="bg-zinc-900 text-white">
                Zona: Todas las Zonas
              </option>
              {availableZones.map((z) => (
                <option key={z} value={z} className="bg-zinc-900 text-white">
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2">
            <Store className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <select
              aria-label="Filtrar por Punto de Venta"
              value={pdvFilter}
              onChange={(e) => setPdvFilter(e.target.value)}
              className="w-full bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="todos" className="bg-zinc-900 text-white">
                Punto de Venta: Todos
              </option>
              {availablePdvs.map((pdv) => (
                <option key={pdv} value={pdv} className="bg-zinc-900 text-white">
                  {pdv}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2">
            <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <select
              aria-label="Filtrar por Estado de Jornada"
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className="w-full bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="todos" className="bg-zinc-900 text-white">
                Estado de Jornada: Todos
              </option>
              <option value="completa" className="bg-zinc-900 text-white">
                Completa (4/4 fotos)
              </option>
              <option value="en_progreso" className="bg-zinc-900 text-white">
                En Curso (1/4 a 3/4)
              </option>
              <option value="parcial_justificada" className="bg-zinc-900 text-white">
                Parcial Justificada
              </option>
              <option value="incidencia" className="bg-zinc-900 text-white">
                Con Incidencia
              </option>
              <option value="pendiente" className="bg-zinc-900 text-white">
                Pendiente (0/4)
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 3. MATRIZ VISUAL DE LOS 4 TURNOS FOTOGRÁFICOS                       */}
      {/* =================================================================== */}
      <div className="space-y-4">
        {filteredRows.length === 0 ? (
          <div className="bg-[#121316] border border-white/10 rounded-2xl p-10 text-center space-y-3">
            <Camera className="w-10 h-10 text-zinc-600 mx-auto" />
            <h4 className="text-sm font-bold text-white">
              No se encontraron promotoras con los filtros seleccionados
            </h4>
            <p className="text-xs text-zinc-400">
              Ajusta el segmento (Fijas / Eventuales), la zona o el término de búsqueda.
            </p>
          </div>
        ) : (
          filteredRows.map((row) => {
            const isFija = row.tipoPromotoraEfectivo === 'fija';
            const progressPct = Math.round((row.marcajesCompletados / 4) * 100);
            const estadoCfg =
              ESTADO_JORNADA_CONFIG[row.estadoJornada] || ESTADO_JORNADA_CONFIG.pendiente;

            const renderTurnoCard = (turnoKey: TradeAttendanceTurno) => {
              const slot = row.turnos[turnoKey];
              return (
                <div
                  key={turnoKey}
                  className={`rounded-xl border p-2.5 flex flex-col justify-between transition-all ${
                    slot.isCompleted
                      ? 'bg-zinc-900/90 border-emerald-500/30 hover:border-emerald-400/60'
                      : 'bg-zinc-950/70 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-2">
                    <span className="text-[11px] font-bold text-zinc-200 truncate">
                      {slot.descriptor.shortLabel}
                    </span>
                    {slot.isCompleted ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                        {slot.formattedTimeCaracas || 'Verificado'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {slot.descriptor.expectedTimeHint}
                      </span>
                    )}
                  </div>

                  {slot.isCompleted ? (
                    <div className="space-y-2">
                      <div
                        onClick={() => {
                          setLightboxRow(row);
                          setFocusedTurno(turnoKey);
                          setZoomScale(1);
                        }}
                        className="relative h-28 w-full rounded-lg overflow-hidden bg-black border border-white/10 cursor-pointer group"
                        title="Abrir Visor Ejecutivo 4x"
                      >
                        {slot.signedUrl ? (
                          <img
                            src={slot.signedUrl}
                            alt={`${slot.descriptor.fullLabel} - ${row.promotora.nombre_completo}`}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-emerald-400 bg-emerald-950/20 p-2 text-center">
                            <FileCheck className="w-6 h-6 mb-1" />
                            <span className="text-[10px] font-mono break-all line-clamp-2">
                              {slot.storagePath}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-[10px] font-bold text-white">
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Auditar 4x</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => openUploadForSlot(row, turnoKey)}
                          className="w-full py-1 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Camera className="w-3 h-3 text-amber-400" />
                          <span>Actualizar Turno</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openUploadForSlot(row, turnoKey)}
                      aria-label={`Subir foto ${slot.descriptor.fullLabel} para ${row.promotora.nombre_completo}`}
                      className="h-32 w-full rounded-lg border border-dashed border-white/15 hover:border-red-500/60 bg-zinc-900/40 hover:bg-red-950/20 flex flex-col items-center justify-center gap-1.5 text-zinc-400 hover:text-white transition-all cursor-pointer p-2 text-center"
                    >
                      <Camera className="w-5 h-5 text-red-400" />
                      <span className="text-[11px] font-bold">Subir / Capturar Foto</span>
                      <span className="text-[9px] text-zinc-500 font-mono">WebP &lt; 180 KB</span>
                    </button>
                  )}
                </div>
              );
            };

            return (
              <div
                key={row.promotora.id}
                className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl space-y-4"
              >
                {/* Cabecera de la fila de Promotora */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-white/5">
                  <div className="flex items-start sm:items-center gap-3 flex-wrap">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white shrink-0 ${
                        isFija
                          ? 'bg-gradient-to-br from-emerald-600 to-teal-800'
                          : 'bg-gradient-to-br from-amber-600 to-orange-800'
                      }`}
                    >
                      {row.promotora.nombre_completo.slice(0, 2)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-black text-white tracking-tight">
                          {row.promotora.nombre_completo}
                        </h4>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            isFija
                              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-950/90 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {isFija ? 'PROMOTORA FIJA' : 'PROMOTORA EVENTUAL'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300 font-mono text-[10px] font-bold">
                          {row.promotora.cedula}
                        </span>
                        {row.promotora.codigo && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            #{row.promotora.codigo}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-zinc-400">
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-200">
                          <Store className="w-3.5 h-3.5 text-red-400" />
                          <span>PDV Hoy:</span>
                          <strong className="text-white">{row.puntoVentaEfectivo}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                          <span>{row.zonaEfectiva}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progreso (X/4 fotos), Horas Calculadas y Botón Lightbox 4x */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-1.5 min-w-[155px]">
                      <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                        <span className="text-zinc-400">Progreso Diario</span>
                        <span className="font-mono text-white">
                          {row.marcajesCompletados}/4 fotos
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            row.marcajesCompletados === 4
                              ? 'bg-emerald-500'
                              : row.marcajesCompletados > 0
                              ? 'bg-blue-500'
                              : 'bg-zinc-600'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-1.5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase block">
                        Horas Calculadas
                      </span>
                      <span className="text-xs font-mono font-black text-emerald-400">
                        {row.workedHours.formattedTotal}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono ml-1.5">
                        (AM {row.workedHours.formattedMorning} + PM {row.workedHours.formattedAfternoon})
                      </span>
                    </div>

                    <span
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 ${estadoCfg.badgeClass}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${estadoCfg.dotClass}`} />
                      <span>{estadoCfg.label}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setLightboxRow(row);
                        setFocusedTurno(null);
                        setZoomScale(1);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-red-400" />
                      <span>Auditoría 4x</span>
                    </button>
                  </div>
                </div>

                {/* Cuadrícula de los 2 Bloques (Jornada Mañana + Jornada Tarde = 4 Turnos) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Bloque 1: Jornada Mañana */}
                  <div className="rounded-xl bg-zinc-950/50 border border-white/5 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-amber-300 inline-flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                        <span>Bloque Jornada Mañana (AM)</span>
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        Tiempo AM: <strong>{row.workedHours.formattedMorning}</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {renderTurnoCard('manana_entrada')}
                      {renderTurnoCard('manana_salida')}
                    </div>
                  </div>

                  {/* Bloque 2: Jornada Tarde */}
                  <div className="rounded-xl bg-zinc-950/50 border border-white/5 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-blue-300 inline-flex items-center gap-1.5">
                        <Sunset className="w-3.5 h-3.5 text-blue-400" />
                        <span>Bloque Jornada Tarde (PM)</span>
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        Tiempo PM: <strong>{row.workedHours.formattedAfternoon}</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {renderTurnoCard('tarde_entrada')}
                      {renderTurnoCard('tarde_salida')}
                    </div>
                  </div>
                </div>

                {/* Observaciones de la jornada si existen */}
                {row.observaciones && (
                  <div className="px-3 py-2 rounded-xl bg-zinc-900/80 border border-white/5 text-xs text-zinc-300 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-amber-400 mr-1.5">Observación / Auditoría:</span>
                      <span>{row.observaciones}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* =================================================================== */}
      {/* 4. MODAL DE CARGA / ACTUALIZACIÓN ATÓMICA POR TURNO                 */}
      {/* =================================================================== */}
      {uploadModal && activeModalRow && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121316] border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-red-500" />
                  <span>Registrar / Actualizar Evidencia de Asistencia</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Actualización aislada por ranura vía RPC (las otras 3 fotos del día se mantienen intactas).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadModal(null)}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmUploadTurno} className="space-y-3.5 text-xs">
              {/* Selección de Promotora y Turno */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Promotora ({activeModalRow.tipoPromotoraEfectivo.toUpperCase()})
                  </label>
                  <select
                    value={uploadModal.promotoraId}
                    onChange={(e) => {
                      const targetRow = rows.find((r) => r.promotora.id === e.target.value);
                      if (targetRow) {
                        setUploadModal({
                          ...uploadModal,
                          promotoraId: targetRow.promotora.id,
                          puntoVenta: targetRow.puntoVentaEfectivo,
                          zona: targetRow.zonaEfectiva,
                          observaciones: targetRow.observaciones || '',
                        });
                      }
                    }}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-red-500"
                  >
                    {rows.map((r) => (
                      <option key={r.promotora.id} value={r.promotora.id} className="bg-zinc-900">
                        {r.promotora.nombre_completo} ({r.tipoPromotoraEfectivo.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Turno Fotográfico (1 de 4)
                  </label>
                  <select
                    value={uploadModal.turno}
                    onChange={(e) =>
                      setUploadModal({
                        ...uploadModal,
                        turno: e.target.value as TradeAttendanceTurno,
                      })
                    }
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-red-500"
                  >
                    {TRADE_TURNO_DESCRIPTORS.map((d) => (
                      <option key={d.turno} value={d.turno} className="bg-zinc-900">
                        {d.order}. {d.fullLabel} ({d.expectedTimeHint})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Punto de Venta del Día y Zona (permite rotar PDV en Eventuales) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Punto de Venta / Evento del Día
                  </label>
                  <input
                    type="text"
                    list="trade-pdv-suggestions"
                    required
                    value={uploadModal.puntoVenta}
                    onChange={(e) =>
                      setUploadModal({ ...uploadModal, puntoVenta: e.target.value })
                    }
                    placeholder="Ej. ALKOSTO BELLA VISTA"
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-red-500"
                  />
                  <datalist id="trade-pdv-suggestions">
                    {availablePdvs.map((pdv) => (
                      <option key={pdv} value={pdv} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Zona Operativa
                  </label>
                  <input
                    type="text"
                    value={uploadModal.zona}
                    onChange={(e) => setUploadModal({ ...uploadModal, zona: e.target.value })}
                    placeholder="Ej. MARACAIBO / SAN FRANCISCO"
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Alerta automática si se detecta salto de turno previo */}
              {sequenceCoherence.warningMessage && (
                <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{sequenceCoherence.warningMessage}</span>
                </div>
              )}

              {/* Zona Drag & Drop o Captura Móvil con compresión client-side a WebP */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                  Evidencia Fotográfica (Compresión Automática WebP &lt; 180 KB)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={handleDropFile}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all ${
                    isDraggingFile
                      ? 'border-red-500 bg-red-950/30'
                      : 'border-white/15 hover:border-red-500/60 bg-zinc-900/50'
                  }`}
                >
                  {compressedPreview ? (
                    <div className="space-y-2">
                      <img
                        src={compressedPreview.previewDataUrl}
                        alt="Vista previa WebP"
                        className="h-44 mx-auto rounded-lg object-contain bg-black border border-white/10"
                      />
                      <div className="flex items-center justify-center gap-2 flex-wrap font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 font-bold">
                          WebP Optimizado: {compressedPreview.compressedKb} KB
                        </span>
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {compressedPreview.width}x{compressedPreview.height}px
                        </span>
                        <span className="text-zinc-400">
                          (Original: {compressedPreview.originalKb} KB)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 space-y-1.5">
                      <Upload className="w-7 h-7 text-red-400 mx-auto" />
                      <p className="font-bold text-white">
                        Arrastra una foto aquí o toca para abrir la Cámara / Galería
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        Formatos permitidos: JPEG, PNG, WebP • Se convierte en cliente a WebP (máx. 1280px, &lt; 180 KB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Observación / Justificación */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                  Observaciones de la Jornada{' '}
                  {sequenceCoherence.requiresObservation && (
                    <span className="text-red-400">(Obligatorio por salto de turno)</span>
                  )}
                </label>
                <textarea
                  rows={2}
                  required={sequenceCoherence.requiresObservation}
                  value={uploadModal.observaciones}
                  onChange={(e) =>
                    setUploadModal({ ...uploadModal, observaciones: e.target.value })
                  }
                  placeholder="Ej. Media jornada autorizada en evento vespertino / Retraso por transporte..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {(isCompressing || isUploading) && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-300">
                    <span>
                      {isCompressing
                        ? 'Comprimiendo imagen a WebP...'
                        : 'Subiendo a bucket privado y ejecutando RPC...'}
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 font-bold">
                  {uploadError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setUploadModal(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!compressedPreview || isCompressing || isUploading}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Turno Fotográfico</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. VISOR EJECUTIVO DE AUDITORÍA (LIGHTBOX 4X)                       */}
      {/* =================================================================== */}
      {lightboxRow && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          data-testid="audit-lightbox-4x"
        >
          <div className="bg-[#121316] border border-white/15 rounded-2xl max-w-6xl w-full p-5 shadow-2xl space-y-4">
            {/* Encabezado del Visor 4x */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Visor Ejecutivo de Auditoría 4x — {lightboxRow.promotora.nombre_completo}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      lightboxRow.tipoPromotoraEfectivo === 'fija'
                        ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-950/90 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {lightboxRow.tipoPromotoraEfectivo.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-xs font-bold">
                    Fecha: {lightboxRow.fechaJornada}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  PDV: <strong className="text-white">{lightboxRow.puntoVentaEfectivo}</strong> •
                  Zona: <strong className="text-zinc-200">{lightboxRow.zonaEfectiva}</strong> •
                  Tiempo Total Calculado:{' '}
                  <strong className="text-emerald-400">
                    {lightboxRow.workedHours.formattedTotal}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomScale((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                  className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 cursor-pointer"
                  title="Reducir Zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/10 font-mono text-xs font-bold text-white">
                  {zoomScale}x
                </span>
                <button
                  type="button"
                  onClick={() => setZoomScale((z) => Math.min(3, Number((z + 0.5).toFixed(1))))}
                  className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 cursor-pointer"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxRow(null)}
                  className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Comparativa Lado a Lado de los 4 Turnos del Día */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {TRADE_TURNO_DESCRIPTORS.map((desc) => {
                const slot = lightboxRow.turnos[desc.turno];
                const isFocused = focusedTurno === desc.turno;
                return (
                  <div
                    key={desc.turno}
                    onClick={() => setFocusedTurno(desc.turno)}
                    className={`rounded-xl border p-3 flex flex-col justify-between transition-all cursor-pointer ${
                      isFocused
                        ? 'bg-zinc-900 border-red-500 shadow-lg shadow-red-600/10'
                        : 'bg-zinc-950/80 border-white/10'
                    }`}
                  >
                    <div className="space-y-1 mb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                          Turno {desc.order} • {desc.blockLabel}
                        </span>
                        {slot.isCompleted ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                            {slot.formattedTimeCaracas}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-500 font-mono text-[10px]">
                            Pendiente
                          </span>
                        )}
                      </div>
                      <h5 className="text-xs font-bold text-white">{desc.fullLabel}</h5>
                    </div>

                    <div className="h-56 w-full rounded-lg overflow-hidden bg-black border border-white/10 flex items-center justify-center">
                      {slot.isCompleted && slot.signedUrl ? (
                        <img
                          src={slot.signedUrl}
                          alt={desc.fullLabel}
                          style={{ transform: `scale(${zoomScale})` }}
                          className="w-full h-full object-contain transition-transform duration-200"
                        />
                      ) : slot.isCompleted ? (
                        <div className="p-3 text-center text-emerald-400 space-y-1">
                          <FileCheck className="w-8 h-8 mx-auto" />
                          <p className="text-[10px] font-mono break-all text-zinc-300">
                            {slot.storagePath}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center text-zinc-600 space-y-1 p-3">
                          <Camera className="w-7 h-7 mx-auto" />
                          <p className="text-[11px] font-bold">Sin evidencia registrada</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/5 text-[10px] font-mono text-zinc-400 space-y-1">
                      <div className="truncate" title={slot.storagePath || 'N/A'}>
                        <span className="text-zinc-500">Objeto:</span>{' '}
                        {slot.storagePath || 'No cargado'}
                      </div>
                      <div className="flex items-center justify-between">
                        <span>
                          <span className="text-zinc-500">Usuario:</span>{' '}
                          {slot.recordedByUserId
                            ? `${slot.recordedByUserId.slice(0, 8)}...`
                            : 'Auditoría Server'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxRow(null);
                            openUploadForSlot(lightboxRow, desc.turno);
                          }}
                          className="text-red-400 hover:text-red-300 font-bold underline cursor-pointer"
                        >
                          {slot.isCompleted ? 'Reemplazar' : 'Subir'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 6. MODAL DE GESTIÓN DE PROMOTORAS (ALTA Y EDICIÓN RÁPIDA)           */}
      {/* =================================================================== */}
      {isPromotoraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121316] border border-white/15 rounded-2xl max-w-3xl w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-400" />
                  <span>Catálogo Maestro de Promotoras (Fijas y Eventuales)</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Administra el personal de campo sincronizado con <code>public.trade_promotoras</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPromotoraModalOpen(false)}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editingPromotora ? (
              <form onSubmit={handleSavePromotora} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                      Cédula (Sin Espacios)
                    </label>
                    <input
                      type="text"
                      required
                      value={editingPromotora.cedula}
                      onChange={(e) =>
                        setEditingPromotora({ ...editingPromotora, cedula: e.target.value })
                      }
                      placeholder="V-25123456"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                      Código Interno
                    </label>
                    <input
                      type="text"
                      value={editingPromotora.codigo}
                      onChange={(e) =>
                        setEditingPromotora({ ...editingPromotora, codigo: e.target.value })
                      }
                      placeholder="STF-025"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                      Modalidad Contractual
                    </label>
                    <select
                      value={editingPromotora.tipo_promotora}
                      onChange={(e) =>
                        setEditingPromotora({
                          ...editingPromotora,
                          tipo_promotora: e.target.value as TradePromotoraType,
                        })
                      }
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      <option value="fija">Promotora Fija</option>
                      <option value="eventual">Promotora Eventual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={editingPromotora.nombre_completo}
                      onChange={(e) =>
                        setEditingPromotora({
                          ...editingPromotora,
                          nombre_completo: e.target.value,
                        })
                      }
                      placeholder="NOMBRE Y APELLIDO"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      value={editingPromotora.telefono}
                      onChange={(e) =>
                        setEditingPromotora({ ...editingPromotora, telefono: e.target.value })
                      }
                      placeholder="0414-0000000"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                      Zona Asignada
                    </label>
                    <input
                      type="text"
                      value={editingPromotora.zona}
                      onChange={(e) =>
                        setEditingPromotora({ ...editingPromotora, zona: e.target.value })
                      }
                      placeholder="MARACAIBO / CABIMAS / CORO"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                      Punto de Venta Habitual
                    </label>
                    <input
                      type="text"
                      value={editingPromotora.punto_venta_habitual}
                      onChange={(e) =>
                        setEditingPromotora({
                          ...editingPromotora,
                          punto_venta_habitual: e.target.value,
                        })
                      }
                      placeholder="ALKOSTO BELLA VISTA"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                {promotoraModalError && (
                  <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 font-bold">
                    {promotoraModalError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingPromotora(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold cursor-pointer"
                  >
                    Volver al Listado
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPromotora}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
                  >
                    {isSavingPromotora ? 'Guardando...' : 'Guardar Promotora'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">
                    Total registradas: <strong className="text-white">{rows.length}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingPromotora({
                        codigo: `STF-0${rows.length + 20}`,
                        cedula: '',
                        nombre_completo: '',
                        telefono: '',
                        tipo_promotora: 'eventual',
                        zona: 'MARACAIBO',
                        supervisor_nombre: 'COORDINACIÓN TRADE MARKETING',
                        punto_venta_habitual: 'EVENTO ROTATIVO',
                        activa: true,
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nueva Promotora</span>
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded-xl">
                  {rows.map((r) => (
                    <div
                      key={r.promotora.id}
                      className="p-3 flex items-center justify-between gap-2 hover:bg-white/[0.02] text-xs"
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{r.promotora.nombre_completo}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              r.promotora.tipo_promotora === 'fija'
                                ? 'bg-emerald-950 text-emerald-300'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {r.promotora.tipo_promotora}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {r.promotora.cedula} • {r.promotora.punto_venta_habitual} ({r.promotora.zona})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPromotora({
                            id: r.promotora.id,
                            codigo: r.promotora.codigo || '',
                            cedula: r.promotora.cedula,
                            nombre_completo: r.promotora.nombre_completo,
                            telefono: r.promotora.telefono || '',
                            tipo_promotora: r.promotora.tipo_promotora,
                            zona: r.promotora.zona || '',
                            supervisor_nombre: r.promotora.supervisor_nombre || '',
                            punto_venta_habitual: r.promotora.punto_venta_habitual || '',
                            activa: r.promotora.activa,
                          })
                        }
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
                        title="Editar Promotora"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
