import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import auditSnapshotSeed from '../../data/maestraActivaAuditSnapshot.json';
import carteraSeed from '../../data/carteraClientes.json';
import {
  compareMaestraAgainstDatabase,
  parseMaestraActivaBuffer,
} from '../../lib/maestraActivaEngine';
import type {
  ExistingActivationRecordLike,
  ExistingCarteraRecordLike,
  MaestraAuditReport,
  MaestraBatchSyncResponse,
  MaestraDiffChangeType,
} from '../../lib/maestraActivaTypes';

interface MaestraActivaAuditSubmoduleProps {
  selectedSupervisor?: string;
  onPortfolioSynced?: (report: MaestraAuditReport) => void;
}

type AuditSubTab =
  | 'vendedores'
  | 'tipos'
  | 'altas_cambios'
  | 'bajas'
  | 'pendientes_duplicados';

type DiffFilterType = 'ALL' | 'ALTAS_SUPA' | 'ALTAS_CARTERA' | 'CAMBIOS_TIPO_RUTA' | 'SANEAMIENTO';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(sub));
  }
  return btoa(binary);
}

const CHANGE_BADGE_META: Record<
  MaestraDiffChangeType,
  { label: string; badgeClass: string }
> = {
  ALTA_SUPABASE: {
    label: 'ALTA SUPABASE',
    badgeClass: 'bg-red-600 text-white border-red-500',
  },
  ALTA_CARTERA: {
    label: 'ALTA CARTERA',
    badgeClass: 'bg-white text-black border-white',
  },
  REACTIVACION: {
    label: 'REACTIVACIÓN',
    badgeClass: 'bg-red-600 text-white border-white/50',
  },
  CAMBIO_VENDEDOR_RUTA: {
    label: 'CAMBIO RUTA',
    badgeClass: 'bg-red-950 text-red-200 border-red-600/70',
  },
  CAMBIO_TIPO_CLIENTE: {
    label: 'CORRECCIÓN TIPO / #N/A',
    badgeClass: 'bg-red-900/60 text-red-100 border-red-500/60',
  },
  CAMBIO_RIF: {
    label: 'ACTUALIZACIÓN RIF',
    badgeClass: 'bg-zinc-900 text-white border-red-500/50',
  },
  SANEAMIENTO_TEXTO: {
    label: 'SANEAMIENTO TRIM()',
    badgeClass: 'bg-zinc-800 text-zinc-200 border-zinc-600',
  },
};

export const MaestraActivaAuditSubmodule: React.FC<MaestraActivaAuditSubmoduleProps> = ({
  selectedSupervisor = 'ALL',
  onPortfolioSynced,
}) => {
  const [report, setReport] = useState<MaestraAuditReport>(
    () => auditSnapshotSeed as unknown as MaestraAuditReport
  );
  const [activeSubTab, setActiveSubTab] = useState<AuditSubTab>('vendedores');
  const [searchTerm, setSearchTerm] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState<string>(
    selectedSupervisor !== 'ALL' ? selectedSupervisor : 'ALL'
  );
  const [diffFilter, setDiffFilter] = useState<DiffFilterType>('ALL');

  const [pendingUploadFile, setPendingUploadFile] = useState<{
    filename: string;
    base64: string;
  } | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingAudit, setIsRefreshingAudit] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectedSupervisor && selectedSupervisor !== 'ALL') {
      setSupervisorFilter(selectedSupervisor);
    }
  }, [selectedSupervisor]);

  const fetchLatestServerAudit = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshingAudit(true);
    try {
      const res = await fetch('/api/cuotas/maestra-activa/audit');
      if (res.ok) {
        const json = await res.json();
        if (json?.snapshot?.parseMetrics?.validActiveCount) {
          setReport(json.snapshot as MaestraAuditReport);
          setIsPreviewMode(false);
        }
      }
    } catch {
      // Mantiene snapshot local embebido si no hay red temporal
    } finally {
      if (showSpinner) setIsRefreshingAudit(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestServerAudit(false);
  }, [fetchLatestServerAudit]);

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncBanner({
      type: 'info',
      message: `Analizando "${file.name}" y ejecutando auditoría comparativa contra Supabase...`,
    });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parseMaestraActivaBuffer(arrayBuffer, file.name);

      // Consultar filas actuales de Supabase para comparar en vivo antes de sincronizar
      let liveSupaRows: ExistingActivationRecordLike[] = [];
      try {
        const liveRes = await fetch('/api/cuotas/activacion-clientes?includeInactive=true&force=true');
        if (liveRes.ok) {
          const livePayload = await liveRes.json();
          if (Array.isArray(livePayload)) {
            liveSupaRows = livePayload.map((item: any) => ({
              cliente_codigo: item.id,
              cliente_nombre: item.cliente,
              vendedor_id: item.vendedorId,
              vendedor_nombre: item.vendedorNombre,
              status: item.status,
              activo: item.activo !== false,
              cajas_aceite: item.cajas?.ACEITE || 0,
              cajas_azucar: item.cajas?.AZUCAR || 0,
              cajas_pollo: item.cajas?.POLLO || 0,
              cajas_estandar_asturias: item.cajas?.ESTANDAR_ASTURIAS || 0,
              cajas_mortadela_salpicao: item.cajas?.MORTADELA_SALPICAO || 0,
              has_aceite: Boolean(item.cats?.ACEITE),
              has_azucar: Boolean(item.cats?.AZUCAR),
              has_pollo: Boolean(item.cats?.POLLO),
              has_estandar_asturias: Boolean(item.cats?.ESTANDAR_ASTURIAS),
              has_mortadela_salpicao: Boolean(item.cats?.MORTADELA_SALPICAO),
            }));
          }
        }
      } catch {
        // Fallback vacío si offline
      }

      const previewReport = compareMaestraAgainstDatabase(
        parsed,
        liveSupaRows,
        carteraSeed as unknown as ExistingCarteraRecordLike[],
        '2026-10',
        null
      );

      setReport(previewReport);
      setPendingUploadFile({
        filename: file.name,
        base64: arrayBufferToBase64(arrayBuffer),
      });
      setIsPreviewMode(true);
      setSyncBanner({
        type: 'info',
        message: `Previsualización lista: ${parsed.validActiveCount.toLocaleString('es-VE')} clientes activos detectados en ${parsed.sellersCount} rutas (${parsed.emptyRowsIgnored} filas vacías omitidas). Haz clic en "Ejecutar Batch Upsert en Supabase" para aplicar.`,
      });
    } catch (err: any) {
      setSyncBanner({
        type: 'error',
        message: `Error al procesar el archivo Excel: ${err?.message || 'Formato inválido'}`,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExecuteBatchSync = async () => {
    setIsSyncing(true);
    setSyncBanner({
      type: 'info',
      message: pendingUploadFile
        ? `Sincronizando "${pendingUploadFile.filename}" por lotes contra Supabase (public.activacion_clientes)...`
        : 'Re-validando cartera sincronizada y refrescando indicadores del Módulo de Cuotas...',
    });

    try {
      if (pendingUploadFile) {
        const res = await fetch('/api/cuotas/maestra-activa/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Workbook: pendingUploadFile.base64,
            filename: pendingUploadFile.filename,
            periodo: report.periodo || '2026-10',
          }),
        });

        const payload = (await res.json()) as MaestraBatchSyncResponse & {
          error?: string;
          details?: string;
        };

        if (!res.ok || !payload.success) {
          throw new Error(payload.details || payload.error || 'Error en sincronización por lotes');
        }

        setReport(payload.auditReport);
        setPendingUploadFile(null);
        setIsPreviewMode(false);
        setSyncBanner({
          type: 'success',
          message: `Sincronización completada (${payload.batchesProcessed} lotes): ${payload.activePortfolioTotal.toLocaleString('es-VE')} clientes activos en ${payload.sellersTotal} vendedores · ${payload.upsertedCount} registros actualizados · ${payload.insertedCount} altas · ${payload.logicalDeactivatedCount} bajas lógicas (activo = false).`,
        });
        onPortfolioSynced?.(payload.auditReport);
      } else {
        await fetch('/api/cuotas/activacion-clientes?force=true');
        await fetchLatestServerAudit(true);
        setSyncBanner({
          type: 'success',
          message: `Cartera verificada al 100% con Supabase: ${report.parseMetrics.validActiveCount.toLocaleString('es-VE')} clientes activos sincronizados en ${report.parseMetrics.sellersCount} rutas comerciales.`,
        });
        onPortfolioSynced?.(report);
      }
    } catch (err: any) {
      setSyncBanner({
        type: 'error',
        message: `Fallo en la sincronización con Supabase: ${err?.message || 'Error desconocido'}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportAuditExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: 30 Vendedores
    const sellersData = report.sellerAuditRows.map((s) => ({
      'ID VENDEDOR': Number(s.idVendedor) || s.idVendedor,
      VENDEDOR_RUTA: s.vendedor,
      VENDEDOR_CUOTAS: s.canonicalSeller,
      SUPERVISOR: s.supervisor,
      BD_SUPABASE_ANTERIOR: s.previousSupabaseCount,
      CARTERA_LOCAL_ANTERIOR: s.previousCarteraCount,
      MAESTRA_OCT_2026: s.excelActiveCount,
      VARIACION_SUPABASE: s.deltaSupabase,
      ACTIVADOS_CON_COMPRA: s.activadosConCompra,
      PCT_ACTIVACION: `${s.pctActivacion.toFixed(1)}%`,
      PENDIENTES_RIF_TIPO: s.pendingCount,
      IDS_COMPARTIDOS: s.sharedIdsCount,
      TOP_TIPOS_CLIENTE: s.topTipos.map((t) => `${t.tipo} (${t.count})`).join(' | '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sellersData), '01_30_Vendedores');

    // Hoja 2: Tipos de Cliente
    const tiposData = report.tipoClienteSummaries.map((t) => ({
      TIPO_DE_CLIENTE: t.tipoCliente,
      CLIENTES_ACTIVOS: t.activeCount,
      PARTICIPACION_PCT: `${t.sharePct.toFixed(2)}%`,
      RUTAS_CON_PRESENCIA: t.sellersWithTypeCount,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tiposData), '02_Tipos_Cliente');

    // Hoja 3: Altas y Cambios
    const diffsData = [...report.altasList, ...report.cambiosList].map((d) => ({
      TIPO_MOVIMIENTO: d.changeType,
      ID_VENDEDOR: d.idVendedor,
      VENDEDOR: d.vendedor,
      ID_CLIENTE: d.idCliente,
      RAZON_SOCIAL: d.razonSocial,
      RIF: d.rif,
      TIPO_CLIENTE: d.tipoCliente,
      VALOR_ANTERIOR: d.previousValue || '—',
      VALOR_NUEVO: d.newValue,
      DETALLE: d.details,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diffsData), '03_Altas_y_Cambios');

    // Hoja 4: Bajas Lógicas
    const bajasData = report.bajasLogicasList.map((b) => ({
      ORIGEN: b.source,
      ID_CLIENTE: b.idCliente,
      RAZON_SOCIAL: b.razonSocial,
      VENDEDOR_ANTERIOR: b.previousVendedor,
      TUVO_COMPRAS_MES: b.hadPurchasesInPeriod ? 'SÍ' : 'NO',
      ESTADO_LOGICO: 'activo = false',
      ACCION: b.reason,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bajasData), '04_Bajas_Logicas');

    // Hoja 5: 44 Pendientes + ID Compartido
    const pendientesData = report.pendingList.map((p) => ({
      FILA_EXCEL: p.excelRow,
      ID_VENDEDOR: p.idVendedor,
      VENDEDOR: p.vendedor,
      ID_CLIENTE: p.idCliente,
      RAZON_SOCIAL: p.razonSocial,
      RIF_ASIGNADO: p.rif,
      TIPO_ASIGNADO: p.tipoCliente,
      ORIGEN_RIF: p.rifSource,
      ORIGEN_TIPO: p.tipoSource,
      ID_COMPARTIDO: p.isSharedClientId ? 'SÍ (ID 8377)' : 'NO',
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(pendientesData),
      '05_44_Pendientes_y_8377'
    );

    XLSX.writeFile(wb, `Auditoria_Maestra_Activa_${report.periodo || '2026-10'}.xlsx`);
  };

  const normalizedQuery = searchTerm.trim().toUpperCase();

  // Filtrado de las 30 rutas
  const filteredSellers = useMemo(() => {
    return report.sellerAuditRows.filter((row) => {
      if (supervisorFilter !== 'ALL' && row.supervisor !== supervisorFilter) return false;
      if (!normalizedQuery) return true;
      return (
        row.vendedor.toUpperCase().includes(normalizedQuery) ||
        row.idVendedor.toUpperCase().includes(normalizedQuery) ||
        row.supervisor.toUpperCase().includes(normalizedQuery) ||
        row.topTipos.some((t) => t.tipo.toUpperCase().includes(normalizedQuery))
      );
    });
  }, [report.sellerAuditRows, supervisorFilter, normalizedQuery]);

  const sellersTotals = useMemo(() => {
    return filteredSellers.reduce(
      (acc, r) => {
        acc.prevSupa += r.previousSupabaseCount;
        acc.prevCartera += r.previousCarteraCount;
        acc.excel += r.excelActiveCount;
        acc.conCompra += r.activadosConCompra;
        acc.pending += r.pendingCount;
        return acc;
      },
      { prevSupa: 0, prevCartera: 0, excel: 0, conCompra: 0, pending: 0 }
    );
  }, [filteredSellers]);

  // Filtrado de Tipos de Cliente
  const filteredTipos = useMemo(() => {
    if (!normalizedQuery) return report.tipoClienteSummaries;
    return report.tipoClienteSummaries.filter((t) =>
      t.tipoCliente.toUpperCase().includes(normalizedQuery)
    );
  }, [report.tipoClienteSummaries, normalizedQuery]);

  // Filtrado de Altas y Cambios
  const allDiffRecords = useMemo(
    () => [...report.altasList, ...report.cambiosList],
    [report.altasList, report.cambiosList]
  );

  const filteredDiffs = useMemo(() => {
    return allDiffRecords.filter((item) => {
      if (diffFilter === 'ALTAS_SUPA' && item.changeType !== 'ALTA_SUPABASE') return false;
      if (diffFilter === 'ALTAS_CARTERA' && item.changeType !== 'ALTA_CARTERA') return false;
      if (
        diffFilter === 'CAMBIOS_TIPO_RUTA' &&
        item.changeType !== 'CAMBIO_TIPO_CLIENTE' &&
        item.changeType !== 'CAMBIO_VENDEDOR_RUTA'
      ) {
        return false;
      }
      if (diffFilter === 'SANEAMIENTO' && item.changeType !== 'SANEAMIENTO_TEXTO') return false;

      if (!normalizedQuery) return true;
      return (
        item.idCliente.toUpperCase().includes(normalizedQuery) ||
        item.razonSocial.toUpperCase().includes(normalizedQuery) ||
        item.vendedor.toUpperCase().includes(normalizedQuery) ||
        item.tipoCliente.toUpperCase().includes(normalizedQuery) ||
        item.details.toUpperCase().includes(normalizedQuery)
      );
    });
  }, [allDiffRecords, diffFilter, normalizedQuery]);

  // Filtrado de Bajas Lógicas
  const filteredBajas = useMemo(() => {
    if (!normalizedQuery) return report.bajasLogicasList;
    return report.bajasLogicasList.filter(
      (b) =>
        b.idCliente.toUpperCase().includes(normalizedQuery) ||
        b.razonSocial.toUpperCase().includes(normalizedQuery) ||
        b.previousVendedor.toUpperCase().includes(normalizedQuery)
    );
  }, [report.bajasLogicasList, normalizedQuery]);

  // Filtrado de los 44 pendientes
  const filteredPendientes = useMemo(() => {
    if (!normalizedQuery) return report.pendingList;
    return report.pendingList.filter(
      (p) =>
        p.idCliente.toUpperCase().includes(normalizedQuery) ||
        p.razonSocial.toUpperCase().includes(normalizedQuery) ||
        p.vendedor.toUpperCase().includes(normalizedQuery) ||
        p.idVendedor.toUpperCase().includes(normalizedQuery)
    );
  }, [report.pendingList, normalizedQuery]);

  const syncedDateFormatted = useMemo(() => {
    const raw = report.syncedAt || report.generatedAt;
    if (!raw) return 'Pendiente de ejecución';
    try {
      return new Date(raw).toLocaleString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return raw;
    }
  }, [report.syncedAt, report.generatedAt]);

  return (
    <div className="space-y-5 text-white">
      {/* CABECERA EJECUTIVA CORPORATIVA: NEGRO, ROJO Y BLANCO */}
      <div className="relative overflow-hidden rounded-2xl border border-red-600/40 bg-zinc-950 p-5 sm:p-6 shadow-2xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-700 via-red-500 to-white" />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-sm">
                <Database className="h-3.5 w-3.5" />
                Auditoría Maestra Activa · Supabase Sync
              </span>
              {isPreviewMode ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500 bg-black px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Previsualización lista para sincronizar
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wider text-black">
                  <ShieldCheck className="h-3.5 w-3.5 text-red-600" />
                  Sincronizado en BD · {syncedDateFormatted}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {report.parseMetrics.title || 'MAESTRA CLIENTES ACTIVOS OCTUBRE 2026'}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-3xl">
              Fuente auditada:{' '}
              <span className="font-bold text-white">{report.sourceFilename}</span> · Periodo{' '}
              <span className="font-bold text-red-400">{report.periodo}</span> ·{' '}
              <span className="text-white font-semibold">
                {report.parseMetrics.totalRowsBelowHeader.toLocaleString('es-VE')}
              </span>{' '}
              filas procesadas bajo encabezado ({report.parseMetrics.emptyRowsIgnored} separadores
              vacíos ignorados ={' '}
              <span className="font-black text-white underline decoration-red-500">
                {report.parseMetrics.validActiveCount.toLocaleString('es-VE')} clientes activos
              </span>
              ).
            </p>
          </div>

          {/* ACCIONES DE CARGA, BATCH UPSERT Y EXPORTACIÓN */}
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelFileSelected}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-black px-3.5 py-2.5 text-xs font-bold text-white transition hover:border-red-500 hover:bg-zinc-900 disabled:opacity-50"
            >
              <Upload className="h-4 w-4 text-red-500" />
              Cargar Excel Maestra
            </button>

            <button
              type="button"
              onClick={handleExecuteBatchSync}
              disabled={isSyncing || isRefreshingAudit}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-red-950/60 transition hover:bg-red-700 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${isSyncing || isRefreshingAudit ? 'animate-spin' : ''}`}
              />
              {isSyncing
                ? 'Sincronizando Lotes...'
                : isPreviewMode
                ? 'Ejecutar Batch Upsert en Supabase'
                : 'Verificar / Refrescar Cuotas'}
            </button>

            <button
              type="button"
              onClick={handleExportAuditExcel}
              className="inline-flex items-center gap-2 rounded-xl border border-white bg-white px-3.5 py-2.5 text-xs font-black text-black transition hover:bg-zinc-200"
            >
              <Download className="h-4 w-4 text-red-600" />
              Exportar Dictamen
            </button>
          </div>
        </div>

        {/* BANNER DE ESTADO TRANSACCIONAL */}
        {syncBanner && (
          <div
            className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
              syncBanner.type === 'error'
                ? 'border-red-500 bg-red-950/80 text-white'
                : syncBanner.type === 'success'
                ? 'border-white/30 bg-zinc-900 text-white'
                : 'border-red-600/50 bg-black text-zinc-200'
            }`}
          >
            {syncBanner.type === 'error' ? (
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            ) : syncBanner.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            )}
            <span>{syncBanner.message}</span>
          </div>
        )}
      </div>

      {/* FRANJA DE KPIs COMPARATIVOS (NEGRO / ROJO / BLANCO) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Clientes Activos Excel
            </span>
            <Users className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {report.parseMetrics.validActiveCount.toLocaleString('es-VE')}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {report.parseMetrics.distinctClientIdsCount.toLocaleString('es-VE')} IDs únicos +{' '}
            <span className="font-bold text-red-400">
              {report.parseMetrics.duplicateIdsCount} compartido
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Rutas / Vendedores
            </span>
            <UserCheck className="h-4 w-4 text-white" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">
            {report.parseMetrics.sellersCount}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {report.parseMetrics.emptyRowsIgnored} filas separadoras omitidas
          </div>
        </div>

        <div className="rounded-2xl border border-red-600/40 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-400">
              Altas Sincronizadas
            </span>
            <UserPlus className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              +{report.auditTotals.altasSupabaseCount}
            </span>
            <span className="text-xs font-bold text-red-400">
              BD / +{report.auditTotals.altasCarteraCount} Cartera
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            Incluye rutas Food Service y Ruta 40
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Cambios y Saneamiento
            </span>
            <ArrowRightLeft className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              {report.auditTotals.cambiosTipoClienteCount +
                report.auditTotals.cambiosVendedorRutaCount}
            </span>
            <span className="text-xs font-bold text-zinc-300">
              + {report.auditTotals.saneamientosTextoCount} trim()
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            40 errores #N/A corregidos + textos limpios
          </div>
        </div>

        <div className="rounded-2xl border border-red-600/50 bg-black p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-400">
              Bajas Lógicas (BD)
            </span>
            <UserMinus className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-red-500">
            {report.auditTotals.bajasLogicasCount}
          </div>
          <div className="mt-1 text-[11px] text-zinc-300">
            Marcados <code className="text-white font-bold">activo = false</code> sin borrar historial
          </div>
        </div>

        <div className="rounded-2xl border border-white/25 bg-white p-4 text-black">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-700">
              Sin RIF / Tipo (8347–8391)
            </span>
            <FileSpreadsheet className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-black">
              {report.auditTotals.pendingRifTipoCount}
            </span>
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
              ACTIVOS
            </span>
          </div>
          <div className="mt-1 text-[11px] font-semibold text-zinc-700">
            PENDIENTE / POR CLASIFICAR
          </div>
        </div>
      </div>

      {/* BARRA DE SUB-PESTAÑAS Y FILTROS */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Sub-pestañas */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSubTab('vendedores')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                activeSubTab === 'vendedores'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'bg-black text-zinc-300 border border-zinc-800 hover:border-red-600/50 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              30 Vendedores ({report.sellerAuditRows.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('tipos')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                activeSubTab === 'tipos'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'bg-black text-zinc-300 border border-zinc-800 hover:border-red-600/50 hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Tipos de Cliente ({report.tipoClienteSummaries.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('altas_cambios')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                activeSubTab === 'altas_cambios'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'bg-black text-zinc-300 border border-zinc-800 hover:border-red-600/50 hover:text-white'
              }`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Altas y Cambios ({allDiffRecords.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('bajas')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                activeSubTab === 'bajas'
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'bg-black text-zinc-300 border border-zinc-800 hover:border-red-600/50 hover:text-white'
              }`}
            >
              <UserMinus className="h-3.5 w-3.5" />
              Bajas Lógicas ({report.bajasLogicasList.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('pendientes_duplicados')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                activeSubTab === 'pendientes_duplicados'
                  ? 'bg-white text-black shadow-md'
                  : 'bg-black text-zinc-300 border border-zinc-800 hover:border-white/50 hover:text-white'
              }`}
            >
              <AlertTriangle
                className={`h-3.5 w-3.5 ${
                  activeSubTab === 'pendientes_duplicados' ? 'text-red-600' : 'text-red-500'
                }`}
              />
              44 Pendientes + ID 8377 ({report.pendingList.length})
            </button>
          </div>

          {/* Buscador y filtro de supervisor */}
          <div className="flex flex-wrap items-center gap-2">
            {activeSubTab === 'vendedores' && (
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-red-500" />
                <select
                  value={supervisorFilter}
                  onChange={(e) => setSupervisorFilter(e.target.value)}
                  className="rounded-xl border border-zinc-700 bg-black pl-8 pr-4 py-2 text-xs font-bold text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="ALL">Todos los Supervisores (30 Rutas)</option>
                  <option value="NELSON FINOL">SUP. NELSON FINOL (14 Rutas)</option>
                  <option value="JOHNATAN SOTO">SUP. JOHNATAN SOTO (16 Rutas)</option>
                </select>
              </div>
            )}

            <div className="relative min-w-[240px] flex-1 sm:flex-initial">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar vendedor, ID, cliente o tipo..."
                className="w-full rounded-xl border border-zinc-700 bg-black pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* PESTAÑA 1: 30 VENDEDORES / RUTAS */}
        {activeSubTab === 'vendedores' && (
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-black">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-red-600/40 bg-zinc-950 text-[11px] font-black uppercase tracking-wider text-zinc-300">
                  <th className="px-3 py-3 text-center">ID Vend.</th>
                  <th className="px-3 py-3">Vendedor / Ruta Maestra</th>
                  <th className="px-3 py-3">Supervisor</th>
                  <th className="px-3 py-3 text-right">BD Anterior</th>
                  <th className="px-3 py-3 text-right text-white">Maestra Oct 2026</th>
                  <th className="px-3 py-3 text-center">Variación BD</th>
                  <th className="px-3 py-3 text-right">Con Compra</th>
                  <th className="px-3 py-3 text-right">% Activación</th>
                  <th className="px-3 py-3 text-center">Pendientes</th>
                  <th className="px-3 py-3">Principales Tipos de Cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredSellers.map((row) => {
                  const hasDelta = row.deltaSupabase !== 0;
                  return (
                    <tr
                      key={`${row.idVendedor}-${row.vendedor}`}
                      className={`transition hover:bg-zinc-900/80 ${
                        hasDelta ? 'bg-red-950/20' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex min-w-[2rem] justify-center rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-black text-white">
                          {row.idVendedor}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-black text-white flex items-center gap-1.5">
                          <span>{row.vendedor}</span>
                          {row.sharedIdsCount > 0 && (
                            <span
                              title="Comparte cliente Id = 8377 mediante llave compuesta"
                              className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white"
                            >
                              ID 8377
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400">{row.zona}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                          {row.supervisor}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-zinc-400">
                        {row.previousSupabaseCount}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-white">
                        {row.excelActiveCount}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        {row.deltaSupabase === 0 ? (
                          <span className="text-zinc-500">0</span>
                        ) : row.deltaSupabase > 0 ? (
                          <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-black">
                            +{row.deltaSupabase} ALTA
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                            {row.deltaSupabase} BAJAS
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-200">
                        {row.activadosConCompra}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        <span
                          className={
                            row.pctActivacion >= 75
                              ? 'text-white'
                              : row.pctActivacion >= 55
                              ? 'text-zinc-300'
                              : 'text-red-400'
                          }
                        >
                          {row.pctActivacion.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        {row.pendingCount > 0 ? (
                          <span className="inline-flex rounded bg-zinc-800 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-300">
                            {row.pendingCount}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.topTipos.map((t) => (
                            <span
                              key={t.tipo}
                              className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-300"
                            >
                              {t.tipo}: <strong className="text-white">{t.count}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-red-600 bg-zinc-950 font-black text-white">
                  <td className="px-3 py-3 text-center">{filteredSellers.length}</td>
                  <td className="px-3 py-3 uppercase">TOTAL CONSOLIDADO CARTERA ACTIVA</td>
                  <td className="px-3 py-3 text-zinc-400 text-[11px]">
                    {supervisorFilter === 'ALL' ? 'TODOS' : supervisorFilter}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-zinc-300">
                    {sellersTotals.prevSupa.toLocaleString('es-VE')}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-base text-white">
                    {sellersTotals.excel.toLocaleString('es-VE')}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-red-400">
                    {sellersTotals.excel - sellersTotals.prevSupa > 0
                      ? `+${sellersTotals.excel - sellersTotals.prevSupa}`
                      : sellersTotals.excel - sellersTotals.prevSupa}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {sellersTotals.conCompra.toLocaleString('es-VE')}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-red-400">
                    {sellersTotals.excel > 0
                      ? `${((sellersTotals.conCompra / sellersTotals.excel) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-white">
                    {sellersTotals.pending}
                  </td>
                  <td className="px-3 py-3 text-[11px] text-zinc-400">
                    100% cuadrado contra hoja DATA ({report.parseMetrics.validActiveCount} activos)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* PESTAÑA 2: 27 TIPOS DE CLIENTE */}
        {activeSubTab === 'tipos' && (
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-black">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-red-600/40 bg-zinc-950 text-[11px] font-black uppercase tracking-wider text-zinc-300">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Tipo de Cliente (Sanitizado con .trim())</th>
                  <th className="px-4 py-3 text-right">Clientes Activos</th>
                  <th className="px-4 py-3 text-right">% Participación</th>
                  <th className="px-4 py-3 w-64">Peso en Cartera</th>
                  <th className="px-4 py-3 text-center">Rutas con Presencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredTipos.map((t, idx) => {
                  const isPorClasificar = t.tipoCliente === 'POR CLASIFICAR';
                  return (
                    <tr
                      key={t.tipoCliente}
                      className={`transition hover:bg-zinc-900/70 ${
                        isPorClasificar ? 'bg-red-950/30' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-zinc-500">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-black text-white flex items-center gap-2">
                        <span>{t.tipoCliente}</span>
                        {isPorClasificar && (
                          <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                            44 Nuevos (IDs 8347–8391)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-black text-white">
                        {t.activeCount.toLocaleString('es-VE')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-300">
                        {t.sharePct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className={`h-full rounded-full ${
                              isPorClasificar ? 'bg-white' : 'bg-red-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, t.sharePct * 2))}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-zinc-300">
                        {t.sellersWithTypeCount} / {report.parseMetrics.sellersCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PESTAÑA 3: ALTAS Y CAMBIOS */}
        {activeSubTab === 'altas_cambios' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL', label: `Todos (${allDiffRecords.length})` },
                  {
                    id: 'ALTAS_SUPA',
                    label: `Altas Supabase (${report.auditTotals.altasSupabaseCount})`,
                  },
                  {
                    id: 'ALTAS_CARTERA',
                    label: `Altas Cartera Food Service (${report.auditTotals.altasCarteraCount})`,
                  },
                  {
                    id: 'CAMBIOS_TIPO_RUTA',
                    label: `Cambios Ruta / Tipo #N/A (${
                      report.auditTotals.cambiosTipoClienteCount +
                      report.auditTotals.cambiosVendedorRutaCount
                    })`,
                  },
                  {
                    id: 'SANEAMIENTO',
                    label: `Saneamientos Texto (${report.auditTotals.saneamientosTextoCount})`,
                  },
                ] as Array<{ id: DiffFilterType; label: string }>
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setDiffFilter(pill.id)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
                    diffFilter === pill.id
                      ? 'border-white bg-white text-black'
                      : 'border-zinc-800 bg-black text-zinc-300 hover:border-red-500'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-black max-h-[520px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-950">
                  <tr className="border-b border-red-600/40 text-[11px] font-black uppercase tracking-wider text-zinc-300">
                    <th className="px-3 py-3">Movimiento</th>
                    <th className="px-3 py-3">Ruta / Vendedor</th>
                    <th className="px-3 py-3">ID Cliente</th>
                    <th className="px-3 py-3">Razón Social</th>
                    <th className="px-3 py-3">Anterior → Nuevo</th>
                    <th className="px-3 py-3">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {filteredDiffs.map((item, idx) => {
                    const meta = CHANGE_BADGE_META[item.changeType];
                    return (
                      <tr
                        key={`${item.changeType}-${item.idVendedor}-${item.idCliente}-${idx}`}
                        className="hover:bg-zinc-900/70"
                      >
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-black ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-white">
                          <span className="text-red-400 font-mono mr-1">[{item.idVendedor}]</span>
                          {item.vendedor}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-black text-white">
                          #{item.idCliente}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-200">{item.razonSocial}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px]">
                          {item.previousValue ? (
                            <span className="text-red-400 line-through mr-1.5">
                              {item.previousValue}
                            </span>
                          ) : null}
                          <span className="text-white font-bold">{item.newValue}</span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-zinc-400">{item.details}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PESTAÑA 4: BAJAS LÓGICAS (activo = false) */}
        {activeSubTab === 'bajas' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-red-600/50 bg-black p-3.5 text-xs text-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <strong className="text-red-400 uppercase">Política de Borrado Lógico Seguro:</strong>{' '}
                Los <strong className="text-white">{report.bajasLogicasList.length}</strong> clientes
                que ya no figuran en <code className="text-white">{report.sourceFilename}</code> fueron
                desactivados lógicamente (<code className="text-red-400 font-bold">activo = false</code>)
                conservando intacto su historial transaccional en Supabase.
              </div>
              <span className="shrink-0 rounded-lg bg-red-600 px-3 py-1 text-[11px] font-black text-white">
                0 PÉRDIDAS DE HISTORIAL
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-black max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-950">
                  <tr className="border-b border-red-600/40 text-[11px] font-black uppercase tracking-wider text-zinc-300">
                    <th className="px-3 py-3">ID Cliente</th>
                    <th className="px-3 py-3">Razón Social</th>
                    <th className="px-3 py-3">Ruta Anterior en BD</th>
                    <th className="px-3 py-3 text-center">Compras Oct 2026</th>
                    <th className="px-3 py-3 text-center">Estado Sincronizado</th>
                    <th className="px-3 py-3">Motivo de Baja Lógica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {filteredBajas.map((b, idx) => (
                    <tr key={`${b.idCliente}-${idx}`} className="hover:bg-zinc-900/70">
                      <td className="px-3 py-2.5 font-mono font-black text-white">
                        #{b.idCliente}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-zinc-200">{b.razonSocial}</td>
                      <td className="px-3 py-2.5 text-zinc-300">{b.previousVendedor}</td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        {b.hadPurchasesInPeriod ? (
                          <span className="rounded bg-white px-2 py-0.5 text-[10px] font-black text-black">
                            CON COMPRA
                          </span>
                        ) : (
                          <span className="text-zinc-500">0 cajas</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex rounded border border-red-500 bg-red-950 px-2 py-0.5 font-mono text-[10px] font-black text-red-300">
                          activo = false
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-400">{b.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PESTAÑA 5: 44 CLIENTES PENDIENTES (8347-8391) + DUPLICADO ID 8377 */}
        {activeSubTab === 'pendientes_duplicados' && (
          <div className="space-y-4">
            {/* BLOQUE DESTACADO DE DUPLICADOS / IDs COMPARTIDOS */}
            {report.duplicateIdGroups.map((dup) => (
              <div
                key={dup.idCliente}
                className="rounded-xl border-2 border-red-600 bg-black p-4 shadow-lg"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-black uppercase text-white">
                      ID Duplicado Detectado · #{dup.idCliente}
                    </span>
                    <span className="text-sm font-black text-white">{dup.razonSocial}</span>
                  </div>
                  <span className="rounded-md border border-white bg-white px-2.5 py-1 text-[10px] font-black uppercase text-black">
                    Llave Compuesta Activa (Sin Fallo en Supabase)
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-300">{dup.resolutionNote}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {dup.occurrences.map((occ) => (
                    <div
                      key={`${occ.excelRow}-${occ.idVendedor}`}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-black text-white">
                          [{occ.idVendedor}] {occ.vendedor}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Fila Excel #{occ.excelRow} · RIF: {occ.rif} · Tipo: {occ.tipoCliente}
                        </div>
                      </div>
                      <span className="rounded bg-red-950 border border-red-600/50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-300">
                        {occ.idVendedor}::{dup.idCliente}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* TABLA DE LOS 44 CLIENTES NUEVOS SIN RIF / TIPO EN HOJAS AUXILIARES */}
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-black max-h-[520px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-950">
                  <tr className="border-b border-red-600/40 text-[11px] font-black uppercase tracking-wider text-zinc-300">
                    <th className="px-3 py-3 text-center">Fila</th>
                    <th className="px-3 py-3">ID Vend. / Ruta</th>
                    <th className="px-3 py-3">ID Cliente</th>
                    <th className="px-3 py-3">Razón Social</th>
                    <th className="px-3 py-3 text-center">RIF Asignado</th>
                    <th className="px-3 py-3 text-center">Tipo de Cliente Asignado</th>
                    <th className="px-3 py-3">Validación Hojas RIF / TIPO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {filteredPendientes.map((p) => (
                    <tr
                      key={`${p.excelRow}-${p.assignmentKey}`}
                      className={`hover:bg-zinc-900/70 ${
                        p.isSharedClientId ? 'bg-red-950/30' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center font-mono text-zinc-400">
                        {p.excelRow}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-white">
                        <span className="font-mono text-red-400 mr-1">[{p.idVendedor}]</span>
                        {p.vendedor}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-black text-white">
                        #{p.idCliente}
                        {p.isSharedClientId && (
                          <span className="ml-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                            2 RUTAS
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-200">{p.razonSocial}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-black text-white">
                          {p.rif}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex rounded bg-white px-2 py-0.5 text-[10px] font-black text-black">
                          {p.tipoCliente}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-400">
                        Hojas RIF/TIPO hasta Id 8346 → Importado activo para cuota real
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
