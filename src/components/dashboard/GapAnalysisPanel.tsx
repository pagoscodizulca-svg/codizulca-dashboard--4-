import React, { useState, useMemo, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus, Database, FileSpreadsheet, Eye } from 'lucide-react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  PRODUCT_CATALOG_BY_SKU,
  isGenericProductLabel,
  resolveCatalogProductName,
} from '../../data/productCatalog';
import {
  DashboardMonthlyProductRow,
  DashboardMonthlyTotalEntry,
  DashboardOverviewBootstrapPayload,
  fetchDashboardOverviewBootstrap,
  getCachedDashboardBootstrap,
} from '../../lib/dashboardOverviewBootstrap';

const resolveBestProductName = resolveCatalogProductName;

interface GapAnalysisPanelProps {
  kpiId: string;
  kpiLabel: string;
  octoberKpis?: {
    facturacion: number;
    utilidad: number;
    cajas: number;
    kg: number;
    auditBadgeText?: string;
  };
  novemberKpis?: {
    facturacion: number;
    utilidad: number;
    cajas: number;
    kg: number;
  };
  historicalMonthlyTotals?: Record<string, DashboardMonthlyTotalEntry>;
  historicalProducts?: DashboardMonthlyProductRow[];
  novemberProductRows?: DashboardMonthlyProductRow[];
  productCatalog?: Record<string, string>;
  activePeriod?: string;
  onSelectPeriod?: (monthId: string) => void;
  onConsultOctober2026?: () => void;
  isExternalLoading?: boolean;
  syncKey?: string | null;
}

const MONTHS_LIST = [
  { id: '2026-11', label: 'Noviembre 2026 (En Curso)', sourceType: 'sheets' as const },
  { id: '2026-10', label: 'Octubre 2026', sourceType: 'supabase' as const },
  { id: '2026-09', label: 'Septiembre 2026', sourceType: 'supabase' as const },
  { id: '2026-08', label: 'Agosto 2026', sourceType: 'supabase' as const },
  { id: '2026-07', label: 'Julio 2026', sourceType: 'supabase' as const },
  { id: '2026-06', label: 'Junio 2026', sourceType: 'supabase' as const },
  { id: '2026-05', label: 'Mayo 2026', sourceType: 'supabase' as const },
  { id: '2026-04', label: 'Abril 2026', sourceType: 'supabase' as const },
  { id: '2026-03', label: 'Marzo 2026', sourceType: 'supabase' as const },
  { id: '2026-02', label: 'Febrero 2026', sourceType: 'supabase' as const },
  { id: '2026-01', label: 'Enero 2026', sourceType: 'supabase' as const },
];

export const GapAnalysisPanel: React.FC<GapAnalysisPanelProps> = ({
  kpiId,
  kpiLabel,
  octoberKpis,
  novemberKpis,
  historicalMonthlyTotals,
  historicalProducts,
  novemberProductRows,
  productCatalog,
  activePeriod,
  onSelectPeriod,
  onConsultOctober2026,
  isExternalLoading = false,
  syncKey,
}) => {
  const [selectedMonths, setSelectedMonths] = useState<string[]>(['2026-10', '2026-11']);
  const [fallbackBootstrap, setFallbackBootstrap] = useState<DashboardOverviewBootstrapPayload | null>(() =>
    getCachedDashboardBootstrap()
  );
  const [isFallbackLoading, setIsFallbackLoading] = useState(false);

  const hasExternalHistory = Boolean(
    historicalMonthlyTotals &&
      Object.keys(historicalMonthlyTotals).length > 0 &&
      historicalProducts &&
      historicalProducts.length > 0
  );

  // Solo consultar el endpoint bootstrap si el componente se monta sin los datos pre-cargados del Dashboard
  useEffect(() => {
    if (hasExternalHistory) return;
    let cancelled = false;
    setIsFallbackLoading(true);
    fetchDashboardOverviewBootstrap({ forceRefresh: false })
      .then((data) => {
        if (!cancelled && data) {
          setFallbackBootstrap(data);
        }
      })
      .finally(() => {
        if (!cancelled) setIsFallbackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasExternalHistory, syncKey]);

  const effectiveMonthlyTotals = useMemo<Record<string, DashboardMonthlyTotalEntry>>(() => {
    if (historicalMonthlyTotals && Object.keys(historicalMonthlyTotals).length > 0) {
      return historicalMonthlyTotals;
    }
    return fallbackBootstrap?.historical?.monthlyTotals || {};
  }, [historicalMonthlyTotals, fallbackBootstrap]);

  const effectiveCatalog = useMemo<Record<string, string>>(() => {
    return {
      ...PRODUCT_CATALOG_BY_SKU,
      ...(fallbackBootstrap?.productCatalog || {}),
      ...(productCatalog || {}),
    };
  }, [productCatalog, fallbackBootstrap]);

  const allSalesData = useMemo(() => {
    const histRows =
      historicalProducts && historicalProducts.length > 0
        ? historicalProducts
        : fallbackBootstrap?.historical?.products || [];
    const novRows =
      novemberProductRows && novemberProductRows.length > 0
        ? novemberProductRows
        : fallbackBootstrap?.november?.productMonthly || [];

    const combined: Array<{
      period: string;
      product_id: string;
      product_name: string;
      total_revenue: number;
      total_boxes_sold: number;
      total_kgs: number;
      total_utilidad: number;
      total_fa: number;
      total_dv: number;
    }> = [];

    for (const r of novRows) {
      const sku = String(r.id_articulo || '').trim() || 'SIN-SKU';
      combined.push({
        period: '2026-11',
        product_id: sku,
        product_name: resolveBestProductName(sku, r.articulo, effectiveCatalog),
        total_revenue: Number(r.monto) || 0,
        total_boxes_sold: Number(r.cajas) || 0,
        total_kgs: Number(r.kgs_lts) || 0,
        total_utilidad: Number(r.utilidad) || 0,
        total_fa: Number(r.montoFA) || 0,
        total_dv: Number(r.montoDV) || 0,
      });
    }

    for (const r of histRows) {
      if (!r.period || r.period === '2026-11') continue;
      const sku = String(r.id_articulo || '').trim() || 'SIN-SKU';
      combined.push({
        period: r.period,
        product_id: sku,
        product_name: resolveBestProductName(sku, r.articulo, effectiveCatalog),
        total_revenue: Number(r.monto) || 0,
        total_boxes_sold: Number(r.cajas) || 0,
        total_kgs: Number(r.kgs_lts) || 0,
        total_utilidad: Number(r.utilidad) || 0,
        total_fa: Number(r.montoFA) || 0,
        total_dv: Number(r.montoDV) || 0,
      });
    }

    return combined;
  }, [historicalProducts, novemberProductRows, fallbackBootstrap, effectiveCatalog]);

  const isLoading = !hasExternalHistory && (isExternalLoading || isFallbackLoading) && allSalesData.length === 0;

  const handleMonthToggle = (monthId: string) => {
    setSelectedMonths((prev) => {
      if (prev.includes(monthId)) {
        return prev.filter((m) => m !== monthId);
      }
      if (prev.length >= 2) {
        return [prev[1], monthId];
      }
      return [...prev, monthId];
    });
  };

  const handleInspectPeriod = (e: React.MouseEvent, monthId: string) => {
    e.stopPropagation();
    if (onSelectPeriod) {
      onSelectPeriod(monthId);
    } else if (monthId === '2026-10' && onConsultOctober2026) {
      onConsultOctober2026();
    }
  };

  const getProductRowValue = (row: (typeof allSalesData)[number]): number => {
    switch (kpiId) {
      case 'facturacion':
        return row.total_revenue || 0;
      case 'cajas':
        return row.total_boxes_sold || 0;
      case 'kilogramos':
        return row.total_kgs || 0;
      case 'utilidad':
        return row.total_utilidad || 0;
      case 'margen':
        return row.total_revenue > 0 ? (row.total_utilidad / row.total_revenue) * 100 : 0;
      default:
        return row.total_revenue || 0;
    }
  };

  const monthTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    const productSumByMonth: Record<string, { rev: number; util: number; cajas: number; kg: number }> = {};

    for (const m of MONTHS_LIST) {
      totals[m.id] = 0;
      productSumByMonth[m.id] = { rev: 0, util: 0, cajas: 0, kg: 0 };
    }

    for (const row of allSalesData) {
      const bucket = productSumByMonth[row.period];
      if (!bucket) continue;
      bucket.rev += row.total_revenue;
      bucket.util += row.total_utilidad;
      bucket.cajas += row.total_boxes_sold;
      bucket.kg += row.total_kgs;
    }

    for (const m of MONTHS_LIST) {
      if (m.id === '2026-11') {
        const novSrc = novemberKpis || (fallbackBootstrap?.november?.summary
          ? {
              facturacion: fallbackBootstrap.november.summary.facturacionTotal,
              utilidad: fallbackBootstrap.november.summary.utilidadBruta,
              cajas: fallbackBootstrap.november.summary.cajasDespachadas,
              kg: fallbackBootstrap.november.summary.totalKilogramos,
            }
          : null);
        const rev = novSrc ? novSrc.facturacion : productSumByMonth['2026-11'].rev;
        const util = novSrc ? novSrc.utilidad : productSumByMonth['2026-11'].util;
        const cajas = novSrc ? novSrc.cajas : productSumByMonth['2026-11'].cajas;
        const kg = novSrc ? novSrc.kg : productSumByMonth['2026-11'].kg;

        switch (kpiId) {
          case 'facturacion':
            totals[m.id] = rev;
            break;
          case 'utilidad':
            totals[m.id] = util;
            break;
          case 'margen':
            totals[m.id] = rev > 0 ? (util / rev) * 100 : 0;
            break;
          case 'cajas':
            totals[m.id] = cajas;
            break;
          case 'kilogramos':
            totals[m.id] = kg;
            break;
          default:
            totals[m.id] = rev;
        }
        continue;
      }

      // Meses históricos (Enero–Octubre 2026) desde Supabase `history_sales`
      const histTot = effectiveMonthlyTotals[m.id];
      if (m.id === '2026-10' && octoberKpis && octoberKpis.facturacion > 0) {
        const rev = octoberKpis.facturacion;
        const util = octoberKpis.utilidad;
        switch (kpiId) {
          case 'facturacion':
            totals[m.id] = rev;
            break;
          case 'utilidad':
            totals[m.id] = util;
            break;
          case 'margen':
            totals[m.id] = rev > 0 ? (util / rev) * 100 : 0;
            break;
          case 'cajas':
            totals[m.id] = octoberKpis.cajas;
            break;
          case 'kilogramos':
            totals[m.id] = octoberKpis.kg;
            break;
          default:
            totals[m.id] = rev;
        }
      } else if (histTot) {
        const rev = histTot.totalNeto;
        const util = histTot.totalUtilidad;
        switch (kpiId) {
          case 'facturacion':
            totals[m.id] = rev;
            break;
          case 'utilidad':
            totals[m.id] = util;
            break;
          case 'margen':
            totals[m.id] = rev > 0 && histTot.hasExactUtilidad ? (util / rev) * 100 : 0;
            break;
          case 'cajas':
            totals[m.id] = histTot.totalCajas;
            break;
          case 'kilogramos':
            totals[m.id] = histTot.totalKgs;
            break;
          default:
            totals[m.id] = rev;
        }
      } else {
        const b = productSumByMonth[m.id];
        switch (kpiId) {
          case 'facturacion':
            totals[m.id] = b.rev;
            break;
          case 'utilidad':
            totals[m.id] = b.util;
            break;
          case 'margen':
            totals[m.id] = b.rev > 0 ? (b.util / b.rev) * 100 : 0;
            break;
          case 'cajas':
            totals[m.id] = b.cajas;
            break;
          case 'kilogramos':
            totals[m.id] = b.kg;
            break;
          default:
            totals[m.id] = b.rev;
        }
      }
    }

    return totals;
  }, [allSalesData, kpiId, octoberKpis, novemberKpis, effectiveMonthlyTotals, fallbackBootstrap]);

  const formatVal = (val: number, showLabel = true) => {
    if (kpiId === 'margen') {
      return `${val.toFixed(2)}%`;
    }
    if (kpiId === 'facturacion' || kpiId === 'utilidad') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }
    const suffix = showLabel ? (kpiId === 'cajas' ? ' Cajas' : ' Kg') : '';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val) + suffix;
  };

  const analysis = useMemo(() => {
    if (selectedMonths.length !== 2) return null;

    const sortedMonths = [...selectedMonths].sort();
    const m1 = sortedMonths[0]; // Older
    const m2 = sortedMonths[1]; // Newer

    const v1 = monthTotals[m1] || 0;
    const v2 = monthTotals[m2] || 0;

    const productStats: Record<string, { name: string; v1: number; v2: number; rev1: number; rev2: number; util1: number; util2: number }> = {};

    for (const row of allSalesData) {
      if (row.period !== m1 && row.period !== m2) continue;
      const val = getProductRowValue(row);
      const prodName = resolveBestProductName(row.product_id, row.product_name, effectiveCatalog);

      if (!productStats[row.product_id]) {
        productStats[row.product_id] = { name: prodName, v1: 0, v2: 0, rev1: 0, rev2: 0, util1: 0, util2: 0 };
      } else if (isGenericProductLabel(productStats[row.product_id].name) && !isGenericProductLabel(prodName)) {
        productStats[row.product_id].name = prodName;
      }

      if (row.period === m1) {
        productStats[row.product_id].v1 += val;
        productStats[row.product_id].rev1 += row.total_revenue;
        productStats[row.product_id].util1 += row.total_utilidad;
      } else {
        productStats[row.product_id].v2 += val;
        productStats[row.product_id].rev2 += row.total_revenue;
        productStats[row.product_id].util2 += row.total_utilidad;
      }
    }

    const diff = v2 - v1;
    const percent = v1 === 0 ? (v2 > 0 ? 100 : 0) : (diff / Math.abs(v1)) * 100;
    const isPositive = diff >= 0;

    const prodArray = Object.values(productStats).map((p) => {
      const p1 = kpiId === 'margen' ? (p.rev1 > 0 ? (p.util1 / p.rev1) * 100 : 0) : p.v1;
      const p2 = kpiId === 'margen' ? (p.rev2 > 0 ? (p.util2 / p.rev2) * 100 : 0) : p.v2;
      return {
        name: p.name,
        diff: p2 - p1,
        v1: p1,
        v2: p2,
      };
    });

    const topGrowth = [...prodArray].filter((p) => p.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3);
    const topDecline = [...prodArray].filter((p) => p.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3);

    const m1Label = MONTHS_LIST.find((m) => m.id === m1)?.label || m1;
    const m2Label = MONTHS_LIST.find((m) => m.id === m2)?.label || m2;

    const chartData = [...prodArray]
      .sort((a, b) => (Math.abs(b.v2) + Math.abs(b.v1)) - (Math.abs(a.v2) + Math.abs(a.v1)))
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        [m1Label]: parseFloat(p.v1.toFixed(2)),
        [m2Label]: parseFloat(p.v2.toFixed(2)),
        brecha: parseFloat((p.v2 - p.v1).toFixed(2)),
      }));

    return {
      m1,
      m2,
      m1Label,
      m2Label,
      v1: formatVal(v1),
      v2: formatVal(v2),
      diff: formatVal(Math.abs(diff)),
      percent: percent.toFixed(1),
      isPositive,
      topGrowth,
      topDecline,
      chartData,
    };
  }, [selectedMonths, allSalesData, monthTotals, kpiId, effectiveCatalog]);

  return (
    <div className="bg-zinc-950/80 border border-white/10 rounded-xl mt-2 overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-300">
      <div className="p-4 border-b border-white/5 bg-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold tracking-widest text-white uppercase flex items-center gap-2">
            Análisis de Brecha: <span className="text-red-500">{kpiLabel}</span>
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Selecciona 2 meses para comparar el rendimiento y ver el desglose de productos. Mes actual vía Google Sheets; historial anterior vía Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-950/50 border border-emerald-500/30 text-emerald-300">
            <FileSpreadsheet className="w-3 h-3" /> Nov 2026: Google Sheets
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-950/50 border border-amber-500/30 text-amber-300">
            <Database className="w-3 h-3" /> Ene–Oct 2026: Supabase
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/5">
        {/* Left Panel: Months */}
        <div className="p-4 space-y-2 col-span-1 max-h-[340px] md:max-h-none md:h-[520px] overflow-y-auto custom-scrollbar">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 sticky top-0 bg-zinc-950/95 py-1.5 z-10 backdrop-blur-sm">
            Meses Disponibles
          </p>
          <div className="space-y-1.5">
            {MONTHS_LIST.map((month) => {
              const isSelected = selectedMonths.includes(month.id);
              const isActiveInDashboard = activePeriod === month.id;
              const val = monthTotals[month.id] || 0;
              const histEntry = effectiveMonthlyTotals[month.id];
              const isUtilityUnavailable =
                (kpiId === 'utilidad' || kpiId === 'margen') &&
                month.sourceType === 'supabase' &&
                histEntry &&
                !histEntry.hasExactUtilidad;

              return (
                <div
                  key={month.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleMonthToggle(month.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleMonthToggle(month.id);
                    }
                  }}
                  className={`w-full flex flex-col gap-1.5 px-3.5 py-2.5 rounded-lg text-sm transition-all duration-200 border cursor-pointer ${
                    isSelected
                      ? 'bg-red-950/40 border-red-900/60 text-white shadow-[0_0_10px_rgba(220,38,38,0.2)]'
                      : 'bg-white/5 border-transparent text-zinc-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col items-start text-left min-w-0">
                      <span className={isSelected ? 'font-bold text-white leading-tight' : 'font-medium leading-tight'}>
                        {month.label}
                      </span>
                      {isLoading ? (
                        <span className="text-[10px] text-zinc-500 font-mono mt-0.5 animate-pulse">
                          Cargando desde Supabase...
                        </span>
                      ) : isUtilityUnavailable ? (
                        <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          N/D (sin costo en BD)
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-200 font-mono font-semibold mt-0.5">
                          {formatVal(val, false)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_5px_rgba(220,38,38,0.8)] animate-pulse" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    {month.sourceType === 'sheets' ? (
                      <span className="text-[9px] text-emerald-400/90 font-semibold truncate">
                        Google Sheets • Mes Actual
                      </span>
                    ) : (
                      <span
                        className="text-[9px] text-amber-400/90 font-medium truncate"
                        title={histEntry?.auditBadgeText || 'Fuente: Tabla history_sales en Supabase'}
                      >
                        Supabase • {histEntry ? `${histEntry.validRows.toLocaleString('es-ES')} reg.` : 'history_sales'}
                      </span>
                    )}

                    {(onSelectPeriod || (month.id === '2026-10' && onConsultOctober2026)) && (
                      <button
                        type="button"
                        onClick={(e) => handleInspectPeriod(e, month.id)}
                        className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
                          isActiveInDashboard
                            ? 'bg-red-600/30 border-red-500/60 text-red-200'
                            : 'bg-black/40 border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
                        }`}
                        title={`Ver ${month.label} en las métricas principales del Dashboard`}
                      >
                        <Eye className="w-2.5 h-2.5" />
                        {isActiveInDashboard ? 'Activo' : 'Consultar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Analysis */}
        <div className="p-4 sm:p-6 col-span-1 md:col-span-3 bg-black/20 md:h-[520px] overflow-y-auto custom-scrollbar">
          {selectedMonths.length < 2 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-60 min-h-[200px]">
              <div className="p-3 rounded-full bg-white/5">
                <Minus className="h-6 w-6 text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-400">Selecciona 2 meses del panel izquierdo para generar el análisis.</p>
            </div>
          ) : isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 min-h-[200px]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-red-600"></div>
              <p className="text-sm text-zinc-400">Sincronizando historial desde Supabase...</p>
            </div>
          ) : analysis ? (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Total Difference */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white/[0.02] border border-white/5 p-5 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Diferencia Total</p>
                  <p className="text-sm text-zinc-300 font-medium">
                    {analysis.m1Label} <span className="text-zinc-500">({analysis.v1})</span> vs{' '}
                    {analysis.m2Label} <span className="text-zinc-500">({analysis.v2})</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-bold text-sm tracking-wider border ${
                      analysis.isPositive
                        ? 'bg-green-950/30 text-green-500 border-green-900/50'
                        : 'bg-red-950/30 text-red-500 border-red-900/50'
                    }`}
                  >
                    {analysis.isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {analysis.percent}%
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black tracking-wider ${analysis.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {analysis.isPositive ? '+' : '-'}{analysis.diff}
                    </p>
                  </div>
                </div>
              </div>

              {/* Product Rankings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Growth */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-500 border-b border-white/5 pb-2">
                    <TrendingUp className="h-4 w-4" />
                    <h4 className="text-xs font-bold uppercase tracking-widest">Mayor Crecimiento</h4>
                  </div>
                  <div className="space-y-3">
                    {analysis.topGrowth.length > 0 ? (
                      analysis.topGrowth.map((prod, i) => (
                        <div key={i} className="flex justify-between items-center gap-3 bg-black/40 p-3 rounded-lg border border-green-900/20">
                          <span className="text-xs font-bold text-zinc-200 flex-1 min-w-0 leading-snug break-words" title={prod.name}>
                            {prod.name}
                          </span>
                          <span className="text-xs font-bold text-green-500 bg-green-950/40 px-2.5 py-1 rounded shrink-0">
                            +{formatVal(prod.diff)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No hubo productos con crecimiento.</p>
                    )}
                  </div>
                </div>

                {/* Top Decline */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-red-500 border-b border-white/5 pb-2">
                    <TrendingDown className="h-4 w-4" />
                    <h4 className="text-xs font-bold uppercase tracking-widest">Mayor Caída</h4>
                  </div>
                  <div className="space-y-3">
                    {analysis.topDecline.length > 0 ? (
                      analysis.topDecline.map((prod, i) => (
                        <div key={i} className="flex justify-between items-center gap-3 bg-black/40 p-3 rounded-lg border border-red-900/20">
                          <span className="text-xs font-bold text-zinc-200 flex-1 min-w-0 leading-snug break-words" title={prod.name}>
                            {prod.name}
                          </span>
                          <span className="text-xs font-bold text-red-500 bg-red-950/40 px-2.5 py-1 rounded shrink-0">
                            -{formatVal(Math.abs(prod.diff))}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No hubo productos con caída.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Comparative Chart */}
              {analysis.chartData.length > 0 && (
                <div className="bg-black/40 border border-white/5 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">
                    Top 5 Productos Comparados ({analysis.m1Label} vs {analysis.m2Label})
                  </h4>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={analysis.chartData} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: '#a1a1aa', fontSize: 10 }}
                          tickFormatter={(v) => (String(v).length > 18 ? `${String(v).slice(0, 16)}…` : String(v))}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: '#09090b',
                            borderColor: '#27272a',
                            borderRadius: '8px',
                            fontSize: '11px',
                          }}
                          formatter={(val: any) => formatVal(Number(val) || 0)}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <Bar dataKey={analysis.m1Label} fill="#52525b" radius={[4, 4, 0, 0]} barSize={22} />
                        <Bar dataKey={analysis.m2Label} fill="#dc2626" radius={[4, 4, 0, 0]} barSize={22} />
                        <Line type="monotone" dataKey="brecha" name="Brecha" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
