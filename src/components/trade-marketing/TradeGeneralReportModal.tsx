import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  Download,
  FolderArchive,
  CalendarDays,
  UserCheck,
  ThumbsUp,
  CheckCircle2,
  Clock,
  Package,
  MapPin,
  ChevronDown,
  ChevronRight,
  Layers,
  Filter
} from 'lucide-react';
import { DegustacionItem } from '../../lib/degustacionesService';
import {
  GeneralReportScope,
  buildTradeGeneralReportData,
  exportTradeGeneralReportToExcel,
  exportTradeGeneralReportToPDF,
  resolveSellerReportProfile
} from './tradeGeneralReportUtils';

interface TradeGeneralReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  degustaciones: DegustacionItem[];
}

export const TradeGeneralReportModal: React.FC<TradeGeneralReportModalProps> = ({
  isOpen,
  onClose,
  degustaciones
}) => {
  const [scope, setScope] = useState<GeneralReportScope>('all');
  const [selectedSeller, setSelectedSeller] = useState<string>('todos');
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('todas');
  const [includeInactiveSellers, setIncludeInactiveSellers] = useState<boolean>(false);
  const [collapsedSellers, setCollapsedSellers] = useState<Record<string, boolean>>({});
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Universo base (sin filtro de vendedor ni semana) para poblar los selectores del modal
  const baseUniverse = useMemo(
    () => buildTradeGeneralReportData(degustaciones, { scope: 'all' }),
    [degustaciones]
  );

  const availableSellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    baseUniverse.sellers.forEach((s) => map.set(s.sellerKey, s.vendedor));
    if (includeInactiveSellers) {
      baseUniverse.inactiveOfficialSellers.forEach((name) => {
        const prof = resolveSellerReportProfile(name);
        if (!map.has(prof.sellerKey)) {
          map.set(prof.sellerKey, prof.displayName);
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'es'));
  }, [baseUniverse, includeInactiveSellers]);

  // Datos consolidados del Informe General aplicando los filtros seleccionados
  const reportData = useMemo(
    () =>
      buildTradeGeneralReportData(degustaciones, {
        scope,
        selectedSeller,
        selectedWeekKey,
        includeInactiveSellers
      }),
    [degustaciones, scope, selectedSeller, selectedWeekKey, includeInactiveSellers]
  );

  if (!isOpen) return null;

  const toggleSellerCollapse = (sellerKey: string) => {
    setCollapsedSellers((prev) => ({
      ...prev,
      [sellerKey]: !prev[sellerKey]
    }));
  };

  const setAllCollapsed = (collapsed: boolean) => {
    const next: Record<string, boolean> = {};
    reportData.sellers.forEach((s) => {
      next[s.sellerKey] = collapsed;
    });
    setCollapsedSellers(next);
  };

  const handleDownloadPDF = async () => {
    if (isExportingPDF) return;
    try {
      setIsExportingPDF(true);
      await new Promise((r) => setTimeout(r, 40));
      exportTradeGeneralReportToPDF(reportData);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (isExportingExcel) return;
    try {
      setIsExportingExcel(true);
      await new Promise((r) => setTimeout(r, 40));
      exportTradeGeneralReportToExcel(reportData);
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-general-report-title"
    >
      <div className="bg-[#121316] border border-white/10 rounded-2xl w-full max-w-[1440px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* ================================================================= */}
        {/* CABECERA DEL MODAL Y BOTONES DE EXPORTACIÓN DIRECTA (PDF Y EXCEL) */}
        {/* ================================================================= */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-gradient-to-r from-red-950/40 via-zinc-950 to-zinc-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <FolderArchive className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2
                  id="trade-general-report-title"
                  className="text-base sm:text-lg font-black text-white tracking-tight"
                >
                  Informe General de Planificación Semanal por Vendedor
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
                  Trade Marketing
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Consolidado de todas las semanas de planificación con degustaciones archivadas en Historial y cronograma activo organizadas por vendedor.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-end lg:self-center">
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExportingPDF}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg shadow-red-600/25 cursor-pointer"
              title="Emitir y descargar Informe General en PDF Institucional"
            >
              <FileText className="w-4 h-4" />
              <span>{isExportingPDF ? 'Emitiendo PDF...' : 'Descargar Informe PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={isExportingExcel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/25 cursor-pointer"
              title="Emitir y descargar Informe General Multi-Hoja en Excel (.xlsx)"
            >
              <Download className="w-4 h-4" />
              <span>{isExportingExcel ? 'Generando Excel...' : 'Descargar Excel (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Cerrar vista de informe"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* BARRA DE PARÁMETROS DEL INFORME GENERAL                           */}
        {/* ================================================================= */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/10 bg-zinc-950/80 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de Alcance */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-zinc-400">Alcance:</span>
              <select
                aria-label="Alcance del informe"
                value={scope}
                onChange={(e) => setScope(e.target.value as GeneralReportScope)}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-zinc-900 text-white">
                  Todas (Archivadas + En Planificación)
                </option>
                <option value="archived_only" className="bg-zinc-900 text-white">
                  Solo Degustaciones Archivadas (Historial)
                </option>
              </select>
            </div>

            {/* Selector de Semana de Planificación */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-zinc-400">Semana:</span>
              <select
                aria-label="Semana de planificación"
                value={selectedWeekKey}
                onChange={(e) => setSelectedWeekKey(e.target.value)}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              >
                <option value="todas" className="bg-zinc-900 text-white">
                  Todas las Semanas ({baseUniverse.planningWeeks.length})
                </option>
                {baseUniverse.planningWeeks.map((w) => (
                  <option key={w.key} value={w.key} className="bg-zinc-900 text-white">
                    {w.weekLabel} ({w.rangeLabel}) — {w.totalCount} act.
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Vendedor */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
              <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-zinc-400">Vendedor:</span>
              <select
                aria-label="Filtrar informe por vendedor"
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-zinc-900 text-white">
                  Todos los Vendedores ({availableSellerOptions.length})
                </option>
                {availableSellerOptions.map((v) => (
                  <option key={v} value={v} className="bg-zinc-900 text-white">
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-zinc-300 cursor-pointer select-none bg-zinc-900/70 px-3 py-1.5 rounded-xl border border-white/5 hover:border-white/15 transition-colors">
            <input
              type="checkbox"
              checked={includeInactiveSellers}
              onChange={(e) => setIncludeInactiveSellers(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-500 cursor-pointer"
            />
            <span>Incluir vendedores sin solicitudes (0)</span>
          </label>
        </div>

        {/* ================================================================= */}
        {/* CUERPO DEL INFORME: KPIS + MATRIZ SEMANAL + BLOQUES POR VENDEDOR  */}
        {/* ================================================================= */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. TARJETAS KPI RESUMEN */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-zinc-950 border border-white/10 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Semanas de Planificación
              </span>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                  {reportData.totals.totalPlanningWeeks}
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  ({reportData.totals.totalWeeksWithActivity} con actividad)
                </span>
              </div>
            </div>

            <div className="bg-zinc-950 border border-emerald-500/25 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                Degustaciones Archivadas
              </span>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  {reportData.totals.totalArchived}
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  {reportData.totals.totalActive > 0
                    ? `+ ${reportData.totals.totalActive} en cronograma`
                    : 'en Historial auditado'}
                </span>
              </div>
            </div>

            <div className="bg-zinc-950 border border-amber-500/25 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                Vendedores Participantes
              </span>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                  {reportData.totals.totalSellersWithActivity}
                </span>
                <span className="text-xs text-zinc-400 font-mono">organizados por cartera</span>
              </div>
            </div>

            <div className="bg-zinc-950 border border-white/10 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Muestras & Aceptación
              </span>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                  {reportData.totals.totalDelivered.toLocaleString('es-VE')}
                </span>
                <span className="text-xs text-emerald-400 font-mono font-bold">
                  {reportData.totals.avgAcceptance}% Positivo
                </span>
              </div>
            </div>
          </div>

          {/* 2. MATRIZ CONSOLIDADA: VENDEDORES X TODAS LAS SEMANAS DE PLANIFICACIÓN */}
          <div className="bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/10 bg-zinc-900/60 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-white text-xs sm:text-sm uppercase tracking-wider">
                  1. Matriz General de Planificación Semanal por Vendedor (Todas las Semanas)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                Cruce completo de vendedores × semanas de planificación
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[920px]">
                <thead>
                  <tr className="bg-zinc-900/90 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[10px]">
                    <th className="p-3 border-r border-white/10 text-center w-10">#</th>
                    <th className="p-3 border-r border-white/10 min-w-[180px]">Vendedor</th>
                    <th className="p-3 border-r border-white/10 min-w-[150px]">Supervisor / Zona</th>
                    {reportData.planningWeeks.map((w) => (
                      <th
                        key={w.key}
                        className="p-3 border-r border-white/10 text-center min-w-[115px]"
                      >
                        <div className="text-white font-black">{w.weekLabel}</div>
                        <div className="text-[9px] text-zinc-400 font-mono font-normal mt-0.5">
                          {w.rangeLabel}
                        </div>
                      </th>
                    ))}
                    <th className="p-3 border-r border-white/10 text-center min-w-[95px] text-emerald-400">
                      Archivadas
                    </th>
                    <th className="p-3 border-r border-white/10 text-center min-w-[85px] text-blue-400">
                      Activas
                    </th>
                    <th className="p-3 border-r border-white/10 text-center min-w-[80px] text-white">
                      Total
                    </th>
                    <th className="p-3 border-r border-white/10 text-right min-w-[110px]">
                      Muestras
                    </th>
                    <th className="p-3 text-center min-w-[85px]">Aceptación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {reportData.sellers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8 + reportData.planningWeeks.length}
                        className="p-8 text-center text-zinc-500"
                      >
                        No hay degustaciones para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    reportData.sellers.map((seller, idx) => (
                      <tr
                        key={seller.sellerKey}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="p-3 border-r border-white/5 text-center font-mono text-zinc-400 font-bold">
                          {idx + 1}
                        </td>
                        <td className="p-3 border-r border-white/5">
                          <div className="font-bold text-amber-300 flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{seller.vendedor}</span>
                          </div>
                        </td>
                        <td className="p-3 border-r border-white/5">
                          <div className="text-zinc-200 font-semibold text-[11px]">
                            {seller.supervisor}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[180px]">
                            {seller.zona}
                          </div>
                        </td>
                        {reportData.planningWeeks.map((w) => {
                          const st = seller.byWeek[w.key];
                          const count = st?.total || 0;
                          return (
                            <td
                              key={w.key}
                              className="p-3 border-r border-white/5 text-center font-mono"
                            >
                              {count === 0 ? (
                                <span className="text-zinc-600">—</span>
                              ) : (
                                <div className="inline-flex flex-col items-center gap-0.5">
                                  <span className="px-2 py-0.5 rounded-lg bg-zinc-900 border border-white/10 text-white font-black text-xs">
                                    {count}
                                  </span>
                                  <span className="text-[9px] text-emerald-400 font-bold">
                                    {st.archived > 0 && st.active > 0
                                      ? `${st.archived} arch · ${st.active} act`
                                      : st.archived > 0
                                      ? `${st.archived} archiv.`
                                      : `${st.active} prog.`}
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 border-r border-white/5 text-center font-mono font-black text-emerald-400">
                          {seller.archivedCount}
                        </td>
                        <td className="p-3 border-r border-white/5 text-center font-mono font-bold text-blue-400">
                          {seller.activeCount}
                        </td>
                        <td className="p-3 border-r border-white/5 text-center font-mono font-black text-white">
                          {seller.totalCount}
                        </td>
                        <td className="p-3 border-r border-white/5 text-right font-mono">
                          <span className="font-bold text-white">
                            {seller.totalDelivered.toLocaleString('es-VE')}
                          </span>{' '}
                          <span className="text-zinc-500 text-[10px]">
                            / {seller.totalTarget.toLocaleString('es-VE')}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-400">
                          {seller.avgAcceptance > 0 ? `${seller.avgAcceptance}%` : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {reportData.sellers.length > 0 && (
                  <tfoot>
                    <tr className="bg-red-950/40 border-t border-red-500/30 font-bold text-white text-xs">
                      <td className="p-3 border-r border-white/10 text-center font-mono">TOT</td>
                      <td className="p-3 border-r border-white/10" colSpan={2}>
                        TOTAL CONSOLIDADO ({reportData.totals.totalSellersWithActivity} Vendedores con Actividad)
                      </td>
                      {reportData.planningWeeks.map((w) => (
                        <td
                          key={w.key}
                          className="p-3 border-r border-white/10 text-center font-mono"
                        >
                          <div className="font-black text-white">{w.totalCount}</div>
                          {w.totalCount > 0 && (
                            <div className="text-[9px] text-emerald-300">
                              {w.archivedCount} arch
                              {w.activeCount > 0 ? ` / ${w.activeCount} act` : ''}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="p-3 border-r border-white/10 text-center font-mono font-black text-emerald-400">
                        {reportData.totals.totalArchived}
                      </td>
                      <td className="p-3 border-r border-white/10 text-center font-mono text-blue-300">
                        {reportData.totals.totalActive}
                      </td>
                      <td className="p-3 border-r border-white/10 text-center font-mono font-black text-white">
                        {reportData.totals.totalActivities}
                      </td>
                      <td className="p-3 border-r border-white/10 text-right font-mono">
                        {reportData.totals.totalDelivered.toLocaleString('es-VE')}{' '}
                        <span className="text-zinc-400 text-[10px]">
                          / {reportData.totals.totalTarget.toLocaleString('es-VE')}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-emerald-400">
                        {reportData.totals.avgAcceptance > 0
                          ? `${reportData.totals.avgAcceptance}%`
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* 3. DETALLE DE DEGUSTACIONES ARCHIVADAS Y PLANIFICADAS ORGANIZADO POR VENDEDOR */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FolderArchive className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-xs sm:text-sm uppercase tracking-wider">
                  2. Detalle de Degustaciones Archivadas y Semanas de Planificación por Vendedor
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAllCollapsed(false)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white font-semibold cursor-pointer transition-colors"
                >
                  Expandir todos
                </button>
                <button
                  type="button"
                  onClick={() => setAllCollapsed(true)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white font-semibold cursor-pointer transition-colors"
                >
                  Contraer todos
                </button>
              </div>
            </div>

            {reportData.sellers.map((seller, sIdx) => {
              const isCollapsed = Boolean(collapsedSellers[seller.sellerKey]);
              return (
                <div
                  key={seller.sellerKey}
                  className="bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-lg"
                >
                  {/* Encabezado del Vendedor */}
                  <button
                    type="button"
                    onClick={() => toggleSellerCollapse(seller.sellerKey)}
                    className="w-full p-4 bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 text-left hover:bg-zinc-900 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 font-black text-xs font-mono shrink-0">
                        {sIdx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-white text-sm sm:text-base">
                            {seller.vendedor}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-white/10 text-zinc-300 text-[10px] font-mono">
                            Sup: {seller.supervisor}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800/70 border border-white/5 text-zinc-400 text-[10px] font-mono">
                            {seller.zona}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                          Participación en {seller.weeksCoveredCount} de{' '}
                          {reportData.planningWeeks.length} semanas de planificación
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 font-mono font-bold inline-flex items-center gap-1">
                        <FolderArchive className="w-3.5 h-3.5" />
                        {seller.archivedCount} Archivadas
                      </span>
                      {seller.activeCount > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-blue-950/70 border border-blue-500/30 text-blue-300 font-mono font-bold inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {seller.activeCount} En Cronograma
                        </span>
                      )}
                      <span className="px-2.5 py-1 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 font-mono">
                        Muestras:{' '}
                        <strong className="text-white">
                          {seller.totalDelivered.toLocaleString('es-VE')}
                        </strong>{' '}
                        / {seller.totalTarget.toLocaleString('es-VE')}
                      </span>
                      {seller.avgAcceptance > 0 && (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-950/50 border border-emerald-500/20 text-emerald-300 font-mono font-bold inline-flex items-center gap-1">
                          <ThumbsUp className="w-3 h-3" />
                          {seller.avgAcceptance}%
                        </span>
                      )}
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-zinc-400 ml-1" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-400 ml-1" />
                      )}
                    </div>
                  </button>

                  {/* Tabla de Degustaciones del Vendedor organizadas por Semana de Planificación */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      {seller.entries.length === 0 ? (
                        <div className="p-6 text-center text-xs text-zinc-500 font-mono">
                          Este vendedor no registra solicitudes de degustación en las semanas seleccionadas.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse text-xs min-w-[960px]">
                          <thead>
                            <tr className="bg-zinc-900/50 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/5 text-[10px]">
                              <th className="p-3 border-r border-white/5 min-w-[145px]">
                                Semana Planificación
                              </th>
                              <th className="p-3 border-r border-white/5 min-w-[125px]">
                                Fecha / Horario
                              </th>
                              <th className="p-3 border-r border-white/5 min-w-[210px]">
                                Cliente PDV & Zona
                              </th>
                              <th className="p-3 border-r border-white/5 min-w-[180px]">
                                Producto & Actividad
                              </th>
                              <th className="p-3 border-r border-white/5 min-w-[175px]">
                                Promotora Asignada
                              </th>
                              <th className="p-3 border-r border-white/5 text-center min-w-[165px]">
                                Condición / Archivo
                              </th>
                              <th className="p-3 border-r border-white/5 text-right min-w-[105px]">
                                Muestras
                              </th>
                              <th className="p-3 text-center min-w-[90px]">Aceptación</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {seller.entries.map((entry) => {
                              const d = entry.item;
                              const isAssigned = Boolean(
                                d.promoter && !d.promoter.toUpperCase().includes('POR ASIGNAR')
                              );
                              return (
                                <tr
                                  key={d.id}
                                  className="hover:bg-white/[0.02] transition-colors"
                                >
                                  <td className="p-3 border-r border-white/5">
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-red-600/20 border border-red-500/30 text-red-300 font-black text-[10px] uppercase tracking-wider">
                                      {entry.weekLabel}
                                    </span>
                                    <div className="text-[10px] text-zinc-500 font-mono mt-1">
                                      {entry.rangeLabel}
                                    </div>
                                  </td>

                                  <td className="p-3 border-r border-white/5 font-mono">
                                    <div className="font-bold text-white">
                                      {entry.dateFormatted}
                                    </div>
                                    <div className="text-[10px] text-zinc-400">{d.time}</div>
                                  </td>

                                  <td className="p-3 border-r border-white/5">
                                    <div className="font-bold text-white">{d.client}</div>
                                    <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1 mt-0.5">
                                      <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                                      <span>{d.zone}</span>
                                    </div>
                                  </td>

                                  <td className="p-3 border-r border-white/5">
                                    <div className="font-bold text-zinc-100 flex items-center gap-1 font-mono text-[11px]">
                                      <Package className="w-3 h-3 text-red-500 shrink-0" />
                                      <span>{d.product}</span>
                                    </div>
                                    <div className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">
                                      {d.activity}
                                    </div>
                                  </td>

                                  <td className="p-3 border-r border-white/5">
                                    {isAssigned ? (
                                      <span className="font-bold text-emerald-300 text-[11px]">
                                        {d.promoter}
                                      </span>
                                    ) : (
                                      <span className="text-amber-300/90 font-mono text-[10px]">
                                        POR ASIGNAR (Trade Mkt)
                                      </span>
                                    )}
                                  </td>

                                  <td className="p-3 border-r border-white/5 text-center">
                                    {entry.isArchived ? (
                                      d.status === 'cancelled' ? (
                                        <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg border border-red-500/40 bg-red-950/60 text-red-300 inline-flex items-center gap-1">
                                          <FolderArchive className="w-3 h-3" /> Archivada (Canc.)
                                        </span>
                                      ) : (
                                        <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 inline-flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" /> Archivada (Compl.)
                                        </span>
                                      )
                                    ) : (
                                      <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg border border-blue-500/40 bg-blue-950/60 text-blue-300 inline-flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {entry.statusLabel}
                                      </span>
                                    )}
                                  </td>

                                  <td className="p-3 border-r border-white/5 text-right font-mono">
                                    <span className="font-bold text-white">{d.delivered}</span>{' '}
                                    <span className="text-zinc-500 text-[10px]">/ {d.target}</span>
                                  </td>

                                  <td className="p-3 text-center font-mono font-bold text-emerald-400">
                                    {d.acceptanceRate > 0 ? `${d.acceptanceRate}%` : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
