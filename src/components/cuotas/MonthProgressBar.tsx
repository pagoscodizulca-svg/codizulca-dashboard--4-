import React, { useState } from 'react';
import { Calendar, Share2, ShieldCheck, FileText, SlidersHorizontal, RotateCcw, Clock, Database } from 'lucide-react';
import {
  DEFAULT_DIAS_LABORABLES,
  DEFAULT_DIAS_TRANSCURRIDOS,
  calculateMonthWorkingProgress,
} from './volumeQuotasData';

export type MainTab =
  | 'activacion'
  | 'activacion_clientes'
  | 'auditoria_maestra'
  | 'volumen'
  | 'volumen_sku'
  | 'pareto';
export type ViewLevel = 'vendedor' | 'supervisores' | 'gerente';

interface MonthProgressBarProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  activeView: ViewLevel;
  onViewChange: (view: ViewLevel) => void;
  onShare: () => void;
  diasLaborables?: number;
  diasTranscurridos?: number;
  isCustomCutoff?: boolean;
  onUpdateProgress?: (diasLaborables: number, diasTranscurridos: number, isCustom: boolean) => void;
}

export const MonthProgressBar: React.FC<MonthProgressBarProps> = ({
  activeTab,
  onTabChange,
  activeView,
  onViewChange,
  onShare,
  diasLaborables = DEFAULT_DIAS_LABORABLES,
  diasTranscurridos = DEFAULT_DIAS_TRANSCURRIDOS,
  isCustomCutoff = false,
  onUpdateProgress,
}) => {
  const [isEditingCutoff, setIsEditingCutoff] = useState(false);
  const autoProgress = calculateMonthWorkingProgress();

  const safeLaborables = Math.max(1, diasLaborables);
  const safeTranscurridos = Math.min(safeLaborables, Math.max(1, diasTranscurridos));
  const diasRestantes = Math.max(0, safeLaborables - safeTranscurridos);
  const porcentaje = Number(((safeTranscurridos / safeLaborables) * 100).toFixed(1));

  const handleGlobalExportPDF = () => {
    window.dispatchEvent(new CustomEvent('cuotas-export-pdf'));
  };

  return (
    <div className="bg-zinc-950/80 border border-white/10 rounded-xl p-3.5 sm:p-4 shadow-xl space-y-4">
      {/* Top Header: Progreso del Mes */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Calendar className="w-5 h-5 text-red-500 shrink-0" />
          <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
            Progreso del Mes
          </h3>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-zinc-900 text-zinc-300 border border-white/10">
            <Clock className="w-3 h-3 text-red-400" />
            {isCustomCutoff
              ? `Corte Manual (${safeTranscurridos}/${safeLaborables}d)`
              : `${autoProgress.monthName} ${autoProgress.year} • Corte ${autoProgress.cutoffDateLabel} (L-S)`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs sm:text-sm text-zinc-400">
          <div>
            <span>Días Laborables: </span>
            <strong className="text-white font-bold font-mono">{safeLaborables}</strong>
          </div>
          <div>
            <span>Transcurridos: </span>
            <strong className="text-white font-bold font-mono">{safeTranscurridos}</strong>
          </div>
          <div>
            <span>Restantes: </span>
            <strong className="text-amber-400 font-bold font-mono">{diasRestantes}</strong>
          </div>
          <div>
            <span>Recorrido: </span>
            <strong className="text-red-500 font-bold font-mono">{porcentaje}%</strong>
          </div>

          {/* Progress Bar */}
          <div
            className="relative w-28 sm:w-36 h-3 bg-zinc-800/90 border border-white/10 rounded-full overflow-hidden shrink-0"
            title={`Recorrido del mes: ${safeTranscurridos} de ${safeLaborables} días laborables (${porcentaje}%) • ${diasRestantes} días restantes`}
          >
            <div
              className="bg-gradient-to-r from-red-700 via-red-600 to-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(porcentaje, 100)}%` }}
            />
            <div className="absolute inset-0 flex justify-between px-1 pointer-events-none">
              <span className="w-px h-full bg-white/10" style={{ marginLeft: '25%' }} />
              <span className="w-px h-full bg-white/15" style={{ marginLeft: '25%' }} />
              <span className="w-px h-full bg-white/10" style={{ marginLeft: '25%' }} />
            </div>
          </div>

          {onUpdateProgress && (
            <button
              type="button"
              onClick={() => setIsEditingCutoff((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isEditingCutoff || isCustomCutoff
                  ? 'bg-red-600/20 text-red-300 border-red-500/40'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-white/10'
              }`}
              title="Ajustar o calibrar el corte de días laborables y transcurridos"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Corte</span>
            </button>
          )}
        </div>
      </div>

      {/* Panel Desplegable de Calibración de Corte del Mes */}
      {isEditingCutoff && onUpdateProgress && (
        <div className="bg-zinc-900/80 border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-400 font-bold uppercase tracking-wider text-[11px]">
              Modo de Corte:
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateProgress(autoProgress.diasLaborables, autoProgress.diasTranscurridos, false)
              }
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                !isCustomCutoff
                  ? 'bg-red-600 text-white shadow'
                  : 'bg-zinc-950 text-zinc-300 border border-white/10 hover:bg-zinc-800'
              }`}
            >
              Automático Hoy ({autoProgress.diasTranscurridos}/{autoProgress.diasLaborables}d • {autoProgress.recorridoPct}%)
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateProgress(
                  autoProgress.diasLaborables,
                  Math.max(1, autoProgress.diasTranscurridos - 1),
                  true
                )
              }
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                isCustomCutoff &&
                safeLaborables === autoProgress.diasLaborables &&
                safeTranscurridos === Math.max(1, autoProgress.diasTranscurridos - 1)
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-zinc-950 text-zinc-300 border border-white/10 hover:bg-zinc-800'
              }`}
            >
              Cierre Día Anterior ({Math.max(1, autoProgress.diasTranscurridos - 1)}/{autoProgress.diasLaborables}d •{' '}
              {(((Math.max(1, autoProgress.diasTranscurridos - 1)) / autoProgress.diasLaborables) * 100).toFixed(1)}%)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-zinc-300">
              <span>Días Laborables:</span>
              <input
                type="number"
                min={1}
                max={31}
                value={safeLaborables}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(31, Number(e.target.value) || 26));
                  onUpdateProgress(val, Math.min(val, safeTranscurridos), true);
                }}
                className="w-14 px-2 py-1 rounded bg-black border border-white/15 text-white font-mono font-bold text-center"
              />
            </label>
            <label className="flex items-center gap-1.5 text-zinc-300">
              <span>Transcurridos:</span>
              <input
                type="number"
                min={1}
                max={safeLaborables}
                value={safeTranscurridos}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(safeLaborables, Number(e.target.value) || 1));
                  onUpdateProgress(safeLaborables, val, true);
                }}
                className="w-14 px-2 py-1 rounded bg-black border border-white/15 text-white font-mono font-bold text-center"
              />
            </label>
            {isCustomCutoff && (
              <button
                type="button"
                onClick={() =>
                  onUpdateProgress(autoProgress.diasLaborables, autoProgress.diasTranscurridos, false)
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold border border-white/10 cursor-pointer"
                title="Restablecer al calendario automático actual"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restablecer</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Subtabs & Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/5">
        {/* Subpestañas del Módulo */}
        <div className="inline-flex flex-wrap items-center p-1 bg-black/50 border border-white/10 rounded-lg text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => onTabChange('activacion')}
            className={`px-3.5 sm:px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              activeTab === 'activacion'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Activación
          </button>
          <button
            type="button"
            onClick={() => onTabChange('activacion_clientes')}
            className={`px-3.5 sm:px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              activeTab === 'activacion_clientes'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Activación Clientes
          </button>
          <button
            type="button"
            onClick={() => onTabChange('auditoria_maestra')}
            className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              activeTab === 'auditoria_maestra'
                ? 'bg-red-600 text-white shadow-md ring-1 ring-white/30'
                : 'text-zinc-300 hover:text-white'
            }`}
            title="Auditoría comparativa y sincronización por lotes de Maestra de Clientes Activos (2.676 clientes / 30 rutas)"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Auditoría Maestra</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('volumen')}
            className={`px-3.5 sm:px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              activeTab === 'volumen'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Volumen
          </button>
          <button
            type="button"
            onClick={() => onTabChange('volumen_sku')}
            className={`px-3.5 sm:px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              activeTab === 'volumen_sku'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Volumen SKU
          </button>
          <button
            type="button"
            onClick={() => onTabChange('pareto')}
            className={`px-3.5 sm:px-4 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
              activeTab === 'pareto'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Pareto
          </button>
        </div>

        {/* Nivel de Vista */}
        <div className="inline-flex items-center p-1 bg-black/50 border border-white/10 rounded-lg text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => onViewChange('vendedor')}
            className={`px-3 sm:px-4 py-1.5 rounded-md font-bold transition-all ${
              activeView === 'vendedor'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Por Vendedor
          </button>
          <button
            type="button"
            onClick={() => onViewChange('supervisores')}
            className={`px-3 sm:px-4 py-1.5 rounded-md font-bold transition-all ${
              activeView === 'supervisores'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Consolidado (Supervisores)
          </button>
          <button
            type="button"
            onClick={() => onViewChange('gerente')}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-md font-bold transition-all ${
              activeView === 'gerente'
                ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Gerente Regional</span>
          </button>
        </div>

        {/* Exportar PDF & Compartir Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGlobalExportPDF}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-lg shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
            title="Exportar el cuadro general activo en PDF respetando los filtros aplicados"
          >
            <FileText className="w-4 h-4" />
            <span>Exportar PDF</span>
          </button>

          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-2 bg-[#00a854] hover:bg-[#009248] text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-lg shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir</span>
          </button>
        </div>
      </div>
    </div>
  );
};
