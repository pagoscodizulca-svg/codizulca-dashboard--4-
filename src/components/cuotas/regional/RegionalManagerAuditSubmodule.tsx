import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Award,
  Scale,
  FileText,
  Download,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Percent,
  Compass,
  AlertTriangle,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import {
  RegionalAuditTab,
  RegionalAuditMetric,
  SellerAuditRecord,
  SupervisorScorecardData,
  AuditCommitment,
  CommitmentStatus
} from './regionalAuditTypes';
import {
  buildSellerAuditRecords,
  buildSupervisorScorecards,
  buildRegionalSummaryKPIs,
  formatAuditValue,
  getMetricBadgeLabel,
  exportRegionalAuditToPDF,
  INITIAL_AUDIT_COMMITMENTS
} from './regionalAuditUtils';
import { SupervisorScorecardPanel } from './SupervisorScorecardPanel';
import { SellerAuditMatrixPanel } from './SellerAuditMatrixPanel';
import { QuotaFairnessAuditPanel } from './QuotaFairnessAuditPanel';
import { AuditCommitmentsPanel } from './AuditCommitmentsPanel';
import { AuditSellerActionModal } from './AuditSellerActionModal';
import { isExcludedVolumeSeller, normalizeSellerName, getSellerMetadata, OFFICIAL_SELLERS_LIST } from '../sellerSupervisorMap';
import { SellerActivationRow } from '../cuotasData';
import { DEFAULT_DIAS_LABORABLES, DEFAULT_DIAS_TRANSCURRIDOS } from '../volumeQuotasData';

interface RegionalManagerAuditSubmoduleProps {
  activeTab?: string;
  onTabChange?: (tab: any) => void;
  sellers?: SellerActivationRow[];
  diasLaborables?: number;
  diasTranscurridos?: number;
}

const MONTH_ORDER = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

export const RegionalManagerAuditSubmodule: React.FC<RegionalManagerAuditSubmoduleProps> = ({
  activeTab = 'volumen',
  onTabChange,
  sellers = [],
  diasLaborables = DEFAULT_DIAS_LABORABLES,
  diasTranscurridos = DEFAULT_DIAS_TRANSCURRIDOS
}) => {
  // Estado de Navegación interna del Gerente Regional
  const [activeSubtab, setActiveSubtab] = useState<RegionalAuditTab>('matriz_auditoria');
  const [metric, setMetric] = useState<RegionalAuditMetric>('kgs');
  const [activeMonth, setActiveMonth] = useState<string>('OCTUBRE');
  const [supervisorFilter, setSupervisorFilter] = useState<string>('ALL');

  // Estado de Datos de Ventas
  const [salesData, setSalesData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Estado de Auditoría Persistente en localStorage (con migración automática de vendedores reasignados)
  const [commitments, setCommitments] = useState<AuditCommitment[]>(() => {
    try {
      const saved = localStorage.getItem('codizulca_regional_audit_commitments');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((c: AuditCommitment) => ({
            ...c,
            vendedor: c?.vendedor ? normalizeSellerName(c.vendedor) || c.vendedor : c?.vendedor,
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }
    return INITIAL_AUDIT_COMMITMENTS;
  });

  const [auditOverrides, setAuditOverrides] = useState<Record<string, { calif?: number; causa?: string }>>(() => {
    try {
      const saved = localStorage.getItem('codizulca_regional_audit_overrides');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const migrated: Record<string, { calif?: number; causa?: string }> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, { calif?: number; causa?: string }>)) {
            const normKey = normalizeSellerName(k) || k;
            migrated[normKey] = migrated[normKey] ? { ...v, ...migrated[normKey] } : v;
          }
          return migrated;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return {};
  });

  // Modal de Auditoría
  const [auditModalRecord, setAuditModalRecord] = useState<SellerAuditRecord | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);

  // Guardar en localStorage
  useEffect(() => {
    try {
      localStorage.setItem('codizulca_regional_audit_commitments', JSON.stringify(commitments));
    } catch (e) {
      console.error(e);
    }
  }, [commitments]);

  useEffect(() => {
    try {
      localStorage.setItem('codizulca_regional_audit_overrides', JSON.stringify(auditOverrides));
    } catch (e) {
      console.error(e);
    }
  }, [auditOverrides]);

  // Carga de Datos Mensuales desde el servidor
  useEffect(() => {
    let isMounted = true;
    const loadVolumeData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/sellers-monthly-volume');
        if (res.ok) {
          const json = await res.json();
          if (isMounted) {
            setSalesData(json);
            const availableMonths: string[] = Array.isArray(json.monthlyTotals)
              ? json.monthlyTotals.map((m: any) => m.mes)
              : Array.isArray(json.monthsAvailable)
              ? json.monthsAvailable
              : [];
            if (availableMonths.length > 0) {
              const sorted = [...availableMonths].sort(
                (a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b)
              );
              if (sorted.includes('OCTUBRE')) {
                setActiveMonth('OCTUBRE');
              } else {
                setActiveMonth(sorted[sorted.length - 1]);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching volume data in Regional Manager Submodule:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadVolumeData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Procesar filas de vendedores
  const sellerRows = useMemo(() => {
    if (!salesData?.sellerMonthlyData) return [];

    const grouped: Record<
      string,
      {
        vendedor: string;
        supervisor: string;
        zona: string;
        region: string;
        months: Record<string, { cajas: number; monto: number; kgs: number }>;
        totalCajas: number;
        totalMonto: number;
        totalKgs: number;
      }
    > = {};

    OFFICIAL_SELLERS_LIST.forEach((vendedor) => {
      const meta = getSellerMetadata(vendedor);
      grouped[vendedor] = {
        vendedor,
        supervisor: meta.supervisor,
        zona: meta.zona,
        region: meta.region,
        months: {},
        totalCajas: 0,
        totalMonto: 0,
        totalKgs: 0,
      };
    });

    salesData.sellerMonthlyData.forEach((row: any) => {
      if (isExcludedVolumeSeller(row.vendedor)) return;
      const normVendedor = normalizeSellerName(row.vendedor);
      const meta = getSellerMetadata(normVendedor);

      if (!grouped[normVendedor]) {
        grouped[normVendedor] = {
          vendedor: normVendedor,
          supervisor: meta.supervisor,
          zona: meta.zona,
          region: meta.region,
          months: {},
          totalCajas: 0,
          totalMonto: 0,
          totalKgs: 0,
        };
      }

      const existingMonth = grouped[normVendedor].months[row.mes];
      if (existingMonth) {
        existingMonth.cajas += row.cajas;
        existingMonth.monto += row.montoNeto;
        existingMonth.kgs += row.kgs;
      } else {
        grouped[normVendedor].months[row.mes] = {
          cajas: row.cajas,
          monto: row.montoNeto,
          kgs: row.kgs,
        };
      }

      grouped[normVendedor].totalCajas += row.cajas;
      grouped[normVendedor].totalMonto += row.montoNeto;
      grouped[normVendedor].totalKgs += row.kgs;
    });

    return Object.values(grouped);
  }, [salesData]);

  // Generar Registros de Auditoría
  const sellerAuditRecords = useMemo(() => {
    const raw = buildSellerAuditRecords(sellerRows, metric, activeMonth, diasLaborables, diasTranscurridos);
    // Aplicar overrides guardados
    return raw.map((r) => {
      const override = auditOverrides[r.id];
      if (override) {
        return {
          ...r,
          calificacionAcompanamiento: override.calif ?? r.calificacionAcompanamiento,
          causaRaizDesviacion: override.causa ?? r.causaRaizDesviacion,
        };
      }
      return r;
    });
  }, [sellerRows, metric, activeMonth, diasLaborables, diasTranscurridos, auditOverrides]);

  // Generar Scorecards de Supervisores (Johnatan Soto vs Nelson Finol)
  const supervisorScorecards = useMemo(() => {
    return buildSupervisorScorecards(sellerAuditRecords, commitments, diasLaborables, diasTranscurridos);
  }, [sellerAuditRecords, commitments, diasLaborables, diasTranscurridos]);

  // KPIs Resumen Regional
  const summaryKPIs = useMemo(() => {
    return buildRegionalSummaryKPIs(supervisorScorecards, sellerAuditRecords, commitments);
  }, [supervisorScorecards, sellerAuditRecords, commitments]);

  // Manejador para guardar auditoría y nuevo compromiso
  const handleSaveAuditAndCommitment = (
    sellerId: string,
    calificacionAcompanamiento: number,
    causaRaiz: string,
    nuevoCompromiso?: any
  ) => {
    // 1. Guardar override
    setAuditOverrides((prev) => ({
      ...prev,
      [sellerId]: {
        calif: calificacionAcompanamiento,
        causa: causaRaiz,
      },
    }));

    // 2. Si se solicitó crear compromiso
    if (nuevoCompromiso) {
      const folioNum = String(commitments.length + 85).padStart(3, '0');
      const newEntry: AuditCommitment = {
        id: `comm-${Date.now()}`,
        folio: `ACTA-REG-2026-${folioNum}`,
        fechaCreacion: new Date().toISOString().slice(0, 10),
        estado: 'en_ejecucion',
        gerenteAutoriza: 'Gerente Regional Codizulca',
        ...nuevoCompromiso,
      };

      setCommitments((prev) => [newEntry, ...prev]);
    }
  };

  const handleUpdateCommitmentStatus = (id: string, newStatus: CommitmentStatus) => {
    setCommitments((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              estado: newStatus,
              fechaResolucion: newStatus === 'cumplido' ? new Date().toISOString().slice(0, 10) : undefined,
            }
          : c
      )
    );
  };

  const handleDeleteCommitment = (id: string) => {
    setCommitments((prev) => prev.filter((c) => c.id !== id));
  };

  const handleExportPDF = () => {
    setIsExportingPDF(true);
    try {
      exportRegionalAuditToPDF(
        summaryKPIs,
        supervisorScorecards,
        sellerAuditRecords,
        commitments,
        metric,
        activeMonth,
        diasLaborables,
        diasTranscurridos
      );
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingPDF(false);
    }
  };

  useEffect(() => {
    const onExportEvent = () => handleExportPDF();
    window.addEventListener('cuotas-export-pdf', onExportEvent);
    return () => window.removeEventListener('cuotas-export-pdf', onExportEvent);
  });

  const metaAlDiaPct = ((diasTranscurridos / diasLaborables) * 100).toFixed(1);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* 1. ENCABEZADO EJECUTIVO DE AUDITORÍA REGIONAL */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30">
                    NIVEL EJECUTIVO
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">
                    CODIZULCA C.A.
                  </span>
                </div>
                <h2 className="text-lg sm:text-2xl font-black tracking-wider text-white uppercase mt-0.5">
                  SUBMÓDULO GERENTE REGIONAL — AUDITORÍA Y EVALUACIÓN DE SUPERVISIÓN
                </h2>
              </div>
            </div>
          </div>

          {/* Selectores y Botones de Acción */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Selector de Mes */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl text-xs">
              <Calendar className="w-4 h-4 text-red-500 shrink-0" />
              <select
                value={activeMonth}
                onChange={(e) => setActiveMonth(e.target.value)}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              >
                {MONTH_ORDER.map((m) => (
                  <option key={m} value={m} className="bg-zinc-900 text-white">
                    {m} 2026
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Métrica */}
            <div className="inline-flex rounded-xl p-1 bg-zinc-900 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setMetric('monto')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  metric === 'monto' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Monto ($)
              </button>
              <button
                type="button"
                onClick={() => setMetric('cajas')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  metric === 'cajas' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Cajas (cj)
              </button>
              <button
                type="button"
                onClick={() => setMetric('kgs')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  metric === 'kgs' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Kilos (Kg)
              </button>
            </div>

            {/* Botón Exportar PDF */}
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs border border-white/10 shadow-md transition-all active:scale-95 disabled:opacity-50"
              title="Descargar informe oficial de auditoría con formato para firmas"
            >
              <Download className="w-4 h-4 text-red-500" />
              <span>{isExportingPDF ? 'Generando...' : 'Informe PDF'}</span>
            </button>
          </div>
        </div>

        {/* 2. GRID DE RESUMEN EJECUTIVO (KPIS REGIONALES) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* KPI 1: Cumplimiento Regional */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
              % Cumplimiento Regional
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-white">
                {summaryKPIs.pctCumplimientoRegional.toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px] text-zinc-500">
              Ritmo esperado: <strong className="text-zinc-300 font-mono">{metaAlDiaPct}%</strong>
            </div>
          </div>

          {/* KPI 2: Real Acumulado */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
              Real Acumulado ({activeMonth})
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-black font-mono text-emerald-400 truncate">
                {formatAuditValue(summaryKPIs.realRegional, metric)}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500">
              Meta: {formatAuditValue(summaryKPIs.metaRegional, metric)}
            </div>
          </div>

          {/* KPI 3: Proyección EOM */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
              Proyección Run-Rate EOM
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-black font-mono text-amber-400 truncate">
                {formatAuditValue(summaryKPIs.proyectadoRegional, metric)}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500">
              Cierre est: <strong className="text-amber-400 font-mono">{summaryKPIs.pctProyectadoRegional.toFixed(1)}%</strong>
            </div>
          </div>

          {/* KPI 4: Health Score Promedio */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
              Supervisory Health Score
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl sm:text-2xl font-black font-mono ${
                summaryKPIs.promedioHealthScore >= 80 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {summaryKPIs.promedioHealthScore.toFixed(0)}
              </span>
              <span className="text-xs text-zinc-500">/ 100</span>
            </div>
            <div className="text-[10px] text-zinc-500">
              Promedio ponderado 3 equipos
            </div>
          </div>

          {/* KPI 5: Vendedores en Zona Crítica */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
              Vendedores en Rezago
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-red-400">
                {summaryKPIs.totalVendedoresCriticos}
              </span>
              <span className="text-xs text-zinc-500 font-mono">/ {summaryKPIs.totalVendedores}</span>
            </div>
            <div className="text-[10px] text-red-400 font-bold">
              {((summaryKPIs.totalVendedoresCriticos / summaryKPIs.totalVendedores) * 100).toFixed(0)}% requiere intervención
            </div>
          </div>

          {/* KPI 6: Actas y Compromisos */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
              Planes de Acción Activos
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-white">
                {summaryKPIs.totalCompromisosActivos}
              </span>
              <span className="text-xs text-zinc-500">en curso</span>
            </div>
            <div className="text-[10px] text-emerald-400">
              {summaryKPIs.totalCompromisosCumplidos} actas cumplidas
            </div>
          </div>
        </div>

        {/* 3. BARRA DE SUBPESTAÑAS DE AUDITORÍA REGIONAL */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-black/60 border border-white/10 rounded-xl text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => setActiveSubtab('matriz_auditoria')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg font-bold transition-all ${
                activeSubtab === 'matriz_auditoria'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>1. Matriz de Auditoría 1-a-1</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-red-200 font-mono font-bold">
                {sellerAuditRecords.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubtab('scorecards')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg font-bold transition-all ${
                activeSubtab === 'scorecards'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>2. Scorecards de Supervisores</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubtab('calibracion_cuotas')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg font-bold transition-all ${
                activeSubtab === 'calibracion_cuotas'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>3. Calibración & Sesgos</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubtab('actas_compromisos')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg font-bold transition-all ${
                activeSubtab === 'actas_compromisos'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>4. Actas y Compromisos</span>
              {summaryKPIs.totalCompromisosActivos > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-mono font-bold">
                  {summaryKPIs.totalCompromisosActivos}
                </span>
              )}
            </button>
          </div>

          <div className="text-xs text-zinc-500 hidden xl:block font-mono">
            Auditoría Comercial • Supervisores Johnatan Soto / Ali Perez / Nelson Finol
          </div>
        </div>
      </div>

      {/* 4. RENDERIZADO DEL SUBMÓDULO SEGÚN SUBPESTAÑA ACTIVA */}
      {activeSubtab === 'matriz_auditoria' && (
        <SellerAuditMatrixPanel
          sellerRecords={sellerAuditRecords}
          metric={metric}
          selectedSupervisorFilter={supervisorFilter}
          onSupervisorFilterChange={setSupervisorFilter}
          onOpenAuditModal={(rec) => setAuditModalRecord(rec)}
          diasLaborables={diasLaborables}
          diasTranscurridos={diasTranscurridos}
        />
      )}

      {activeSubtab === 'scorecards' && (
        <SupervisorScorecardPanel
          scorecards={supervisorScorecards}
          metric={metric}
          diasLaborables={diasLaborables}
          diasTranscurridos={diasTranscurridos}
          onSelectSupervisorForAudit={(sup) => {
            setSupervisorFilter(sup);
            setActiveSubtab('matriz_auditoria');
          }}
          onOpenNewCommitment={(sup) => {
            const firstOfSup = sellerAuditRecords.find((s) => s.supervisor === sup) || sellerAuditRecords[0];
            setAuditModalRecord(firstOfSup);
          }}
        />
      )}

      {activeSubtab === 'calibracion_cuotas' && (
        <QuotaFairnessAuditPanel
          sellerRecords={sellerAuditRecords}
          metric={metric}
          onOpenAuditModal={(rec) => setAuditModalRecord(rec)}
        />
      )}

      {activeSubtab === 'actas_compromisos' && (
        <AuditCommitmentsPanel
          commitments={commitments}
          onUpdateCommitmentStatus={handleUpdateCommitmentStatus}
          onOpenNewCommitmentModal={() => {
            setAuditModalRecord(sellerAuditRecords[0] || null);
          }}
          onDeleteCommitment={handleDeleteCommitment}
        />
      )}

      {/* 5. MODAL DE AUDITORÍA 1 A 1 Y PLAN DE ACCIÓN */}
      <AuditSellerActionModal
        isOpen={Boolean(auditModalRecord)}
        onClose={() => setAuditModalRecord(null)}
        sellerRecord={auditModalRecord}
        metric={metric}
        onSaveAuditAndCommitment={handleSaveAuditAndCommitment}
      />
    </div>
  );
};
