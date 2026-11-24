import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Package,
  Briefcase,
  MapPin,
  Building2,
  TrendingUp,
  Download,
  Search,
  Filter,
  RefreshCw,
  Layers,
  ChevronLeft,
  ChevronRight,
  PieChart as PieChartIcon,
  AlertCircle,
  Award,
  Sparkles,
  BarChart3,
  FileSpreadsheet,
  FileText,
  ClipboardList,
  ShieldAlert,
  ArrowUpRight,
  SlidersHorizontal,
  X,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
  CartesianGrid
} from 'recharts';
import { getSellerMetadata, normalizeSellerName, isExcludedVolumeSeller } from './sellerSupervisorMap';
import {
  ParetoDimension,
  ParetoMetric,
  ABCClass,
  InsightStatus,
  ClientSalesItem,
  ProductSalesItem,
  SellerMonthlyItem,
  ParetoRowItem,
  ParetoSummaryStats,
  ParetoInsightsData,
  Pareto360Mode,
  MONTH_LABELS
} from './paretoTypes';
import {
  formatParetoValue,
  getParetoMetricLabel,
  getParetoDimensionLabel,
  exportParetoToExcel,
  exportParetoToPDF
} from './paretoExportUtils';
import { ParetoInsightsPanel } from './ParetoInsightsPanel';
import { ParetoActionPlanModal } from './ParetoActionPlanModal';
import { Pareto360Modal } from './Pareto360Modal';
import { ClientLimitFilter, ClientLimit } from './ClientLimitFilter';
import { ProductClientsBreakdown } from './ProductClientsBreakdown';
import { MultiMonthSelect } from './MultiMonthSelect';

interface ParetoChartTooltipProps {
  active?: boolean;
  payload?: any[];
  metric: ParetoMetric;
}

const ParetoChartTooltip: React.FC<ParetoChartTooltipProps> = ({ active, payload, metric }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-zinc-900 border border-white/20 rounded-xl p-3 shadow-2xl text-xs space-y-1">
        <p className="font-bold text-white max-w-xs">{d.fullName}</p>
        <p className="text-zinc-300 font-mono">
          {getParetoMetricLabel(metric)}:{' '}
          <strong className="text-white">{formatParetoValue(d.valor, metric)}</strong>
        </p>
        <p className="text-red-400 font-bold font-mono">
          % Acumulado: {d.pctAcumulado}%
        </p>
        <p className="text-zinc-400 text-[10px]">
          Clasificación:{' '}
          <span
            className={`font-black ${
              d.clasificacion === 'A'
                ? 'text-red-400'
                : d.clasificacion === 'B'
                ? 'text-amber-400'
                : 'text-zinc-400'
            }`}
          >
            CLASE {d.clasificacion}
          </span>
        </p>
      </div>
    );
  }
  return null;
};

export const ParetoSubmodule: React.FC = () => {
  const [data, setData] = useState<{
    clients: ClientSalesItem[];
    products: ProductSalesItem[];
    sellerMonthlyData: SellerMonthlyItem[];
    availableMonths: string[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Controles del Pareto (Opción 1: Dimensiones Conmutables)
  const [dimension, setDimension] = useState<ParetoDimension>('clientes');
  const [metric, setMetric] = useState<ParetoMetric>('cajas');
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('ALL');
  const [selectedCanal, setSelectedCanal] = useState<string>('ALL');
  const [filterClass, setFilterClass] = useState<'ALL' | ABCClass>('ALL');
  const [filterInsight, setFilterInsight] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Límite de Clientes (Top 20, Top 50, Top 100 o Todos)
  const [clientLimit, setClientLimit] = useState<ClientLimit>('ALL');

  // Selección de Producto Específico para Análisis Detallado
  const [selectedProduct, setSelectedProduct] = useState<ParetoRowItem | null>(null);
  const productBreakdownRef = React.useRef<HTMLDivElement | null>(null);

  // Modales y Exportación (Opción 5 y Dashboard 360)
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isActionPlanOpen, setIsActionPlanOpen] = useState<boolean>(false);
  const [active360Mode, setActive360Mode] = useState<Pareto360Mode | null>(null);

  // Paginación
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Cargar datos reales desde el backend con reintentos automáticos y fallback
  const fetchData = async (retryCount = 0) => {
    setIsLoading(true);
    setError(null);
    try {
      let res: Response;
      try {
        res = await fetch('/api/pareto-data');
        if (!res.ok) {
          res = await fetch('/data/pareto-data.json');
        }
      } catch {
        res = await fetch('/data/pareto-data.json');
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: Error al cargar datos de Pareto`);
      const json = await res.json();
      if (!json || (!json.clients && !json.products)) {
        throw new Error('Formato de datos de Pareto inválido');
      }
      setData(json);
      setError(null);
      setIsLoading(false);
    } catch (err: any) {
      console.warn(`[Pareto] Intento ${retryCount + 1} fallido:`, err?.message || err);
      // Fallback secundario directo a static file
      try {
        const fallbackRes = await fetch('/data/pareto-data.json');
        if (fallbackRes.ok) {
          const fallbackJson = await fallbackRes.json();
          if (fallbackJson && (fallbackJson.clients || fallbackJson.products)) {
            setData(fallbackJson);
            setError(null);
            setIsLoading(false);
            return;
          }
        }
      } catch (fbErr) {
        // Ignore fallback error and continue to retry
      }

      if (retryCount < 2) {
        setTimeout(() => {
          fetchData(retryCount + 1);
        }, (retryCount + 1) * 800);
        return;
      }

      console.error('Error fetching pareto data:', err);
      setError(err?.message || 'Error al conectar con la base de datos de ventas.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    dimension,
    metric,
    selectedMonths,
    selectedSupervisor,
    selectedCanal,
    filterClass,
    filterInsight,
    searchTerm,
    clientLimit,
  ]);

  // Smooth scroll to product breakdown when a product is checked/selected
  useEffect(() => {
    if (selectedProduct && productBreakdownRef.current) {
      productBreakdownRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedProduct?.id]);

  // Lista dinámica de supervisores y canales disponibles
  const availableSupervisors = useMemo(() => {
    return ['JOHNATAN SOTO', 'ALI PEREZ', 'NELSON FINOL'];
  }, []);

  const availableCanales = useMemo(() => {
    if (!data?.clients) return [];
    const set = new Set<string>();
    data.clients.forEach((c) => {
      if (c.canal && c.canal.trim() !== '') set.add(c.canal.trim());
    });
    return Array.from(set).sort();
  }, [data]);

  // Función de extracción de valor por métrica con soporte multimes
  const getItemMetricValue = (
    itemMonths: Record<string, { monto: number; cajas: number; kgs: number }>,
    totMonto: number,
    totCajas: number,
    totKgs: number,
    targetMetric: ParetoMetric,
    targetMonths: string[]
  ): number => {
    if (
      !targetMonths ||
      targetMonths.length === 0 ||
      targetMonths.includes('ALL') ||
      (data?.availableMonths && targetMonths.length >= data.availableMonths.length)
    ) {
      if (targetMetric === 'cajas') return totCajas;
      if (targetMetric === 'kgs') return totKgs;
      return totMonto;
    }
    let sum = 0;
    for (const mName of targetMonths) {
      const m = itemMonths?.[mName];
      if (m) {
        if (targetMetric === 'cajas') sum += m.cajas || 0;
        else if (targetMetric === 'kgs') sum += m.kgs || 0;
        else sum += m.monto || 0;
      }
    }
    return sum;
  };

  // Cálculo de Pareto para la Dimensión Seleccionada con Detección de Riesgos (Opción 4)
  const { allRows, summaryStats, insights } = useMemo(() => {
    if (!data) return { allRows: [], summaryStats: null, insights: null };

    let rawList: Array<{
      id: string;
      idsList?: string[];
      nombre: string;
      secundario?: string;
      terciario?: string;
      vendedoresList?: string[];
      supervisor?: string;
      zona?: string;
      canal?: string;
      region?: string;
      valor: number;
      facturasCount?: number;
      months?: Record<string, { monto: number; cajas: number; kgs: number }>;
      dropPct?: number;
      growthPct?: number;
    }> = [];

    // ==========================================
    // 1. DIMENSIÓN: CLIENTES (CARTERA)
    // ==========================================
    if (dimension === 'clientes') {
      data.clients.forEach((c) => {
        const cleanVendedor = normalizeSellerName(c.vendedor || '') || c.vendedor;
        const meta = getSellerMetadata(cleanVendedor);
        const supervisor = meta.supervisor || 'SIN SUPERVISOR';
        const zona = meta.zona || 'Sin Zona';
        const canal = c.canal || 'GENERAL';

        const val = getItemMetricValue(
          c.months || {},
          c.monto,
          c.cajas,
          c.kgs,
          metric,
          selectedMonths
        );

        if (val <= 0) return;

        // Detección de tendencia intermensual para Opción 4 (Insights)
        const m = c.months || {};
        const julVal = metric === 'cajas' ? (m['JULIO']?.cajas || 0) : (m['JULIO']?.monto || 0);
        const agoVal = metric === 'cajas' ? (m['AGOSTO']?.cajas || 0) : (m['AGOSTO']?.monto || 0);
        const sepVal = metric === 'cajas' ? (m['SEPTIEMBRE']?.cajas || 0) : (m['SEPTIEMBRE']?.monto || 0);
        const prevAvg = (julVal + agoVal) / 2;

        let dropPct: number | undefined = undefined;
        let growthPct: number | undefined = undefined;

        if (prevAvg > 10) {
          if (sepVal === 0) {
            dropPct = 100;
          } else if (sepVal < prevAvg * 0.45) {
            dropPct = Math.round((1 - sepVal / prevAvg) * 100);
          } else if (sepVal > prevAvg * 1.25) {
            growthPct = Math.round((sepVal / prevAvg - 1) * 100);
          }
        }

        rawList.push({
          id: c.id_cliente,
          idsList: c.idsList,
          nombre: c.cliente || `Cliente #${c.id_cliente}`,
          secundario: cleanVendedor,
          vendedoresList: c.vendedoresList
            ? Array.from(new Set(c.vendedoresList.map((v) => normalizeSellerName(v) || v)))
            : undefined,
          terciario: c.idsList && c.idsList.length > 1 ? `${c.idsList.length} Sucursales / Códigos ERP` : `ID: ${c.id_cliente}`,
          supervisor,
          zona,
          canal,
          region: c.region || meta.region || 'OCCIDENTE',
          valor: val,
          facturasCount: c.facturasCount,
          months: c.months,
          dropPct,
          growthPct,
        });
      });
    }

    // ==========================================
    // 2. DIMENSIÓN: PRODUCTOS / SKUS
    // ==========================================
    else if (dimension === 'productos') {
      data.products.forEach((p) => {
        const val = getItemMetricValue(
          p.months || {},
          p.monto,
          p.cajas,
          p.kgs,
          metric,
          selectedMonths
        );

        if (val <= 0) return;

        rawList.push({
          id: String(p.id_articulo),
          nombre: p.articulo,
          secundario: `Cód: ${p.id_articulo}`,
          valor: val,
          months: p.months,
        });
      });
    }

    // ==========================================
    // 3. DIMENSIÓN: FUERZA DE VENTAS (VENDEDORES)
    // ==========================================
    else if (dimension === 'vendedores') {
      const sellersMap = new Map<string, {
        vendedor: string;
        supervisor: string;
        zona: string;
        region: string;
        valor: number;
        facturasCount: number;
      }>();

      data.sellerMonthlyData.forEach((s) => {
        if (
          selectedMonths.length > 0 &&
          !selectedMonths.includes('ALL') &&
          !selectedMonths.includes(s.mes)
        ) {
          return;
        }

        if (isExcludedVolumeSeller(s.vendedor)) return;
        const normVendedor = normalizeSellerName(s.vendedor);
        const meta = getSellerMetadata(normVendedor);
        let val = 0;
        if (metric === 'cajas') val = s.cajas;
        else if (metric === 'kgs') val = s.kgs;
        else val = s.montoNeto;

        if (!sellersMap.has(normVendedor)) {
          sellersMap.set(normVendedor, {
            vendedor: normVendedor,
            supervisor: meta.supervisor,
            zona: meta.zona,
            region: meta.region,
            valor: 0,
            facturasCount: 0,
          });
        }

        const obj = sellersMap.get(normVendedor)!;
        obj.valor += val;
        obj.facturasCount += s.facturasCount || 0;
      });

      sellersMap.forEach((s) => {
        if (s.valor <= 0) return;
        rawList.push({
          id: s.vendedor,
          nombre: s.vendedor,
          secundario: s.supervisor,
          terciario: s.zona,
          supervisor: s.supervisor,
          zona: s.zona,
          region: s.region,
          valor: s.valor,
          facturasCount: s.facturasCount,
        });
      });
    }

    // ==========================================
    // 4. DIMENSIÓN: ZONAS COMERCIALES
    // ==========================================
    else if (dimension === 'zonas') {
      const zonesMap = new Map<string, {
        zona: string;
        supervisor: string;
        region: string;
        vendedores: Set<string>;
        valor: number;
      }>();

      data.sellerMonthlyData.forEach((s) => {
        if (
          selectedMonths.length > 0 &&
          !selectedMonths.includes('ALL') &&
          !selectedMonths.includes(s.mes)
        ) {
          return;
        }
        if (isExcludedVolumeSeller(s.vendedor)) return;
        const normVendedor = normalizeSellerName(s.vendedor);
        const meta = getSellerMetadata(normVendedor);
        const zonaKey = meta.zona || 'Sin Zona';

        let val = 0;
        if (metric === 'cajas') val = s.cajas;
        else if (metric === 'kgs') val = s.kgs;
        else val = s.montoNeto;

        if (!zonesMap.has(zonaKey)) {
          zonesMap.set(zonaKey, {
            zona: zonaKey,
            supervisor: meta.supervisor,
            region: meta.region,
            vendedores: new Set(),
            valor: 0,
          });
        }
        const obj = zonesMap.get(zonaKey)!;
        obj.valor += val;
        obj.vendedores.add(normVendedor);
      });

      zonesMap.forEach((z) => {
        if (z.valor <= 0) return;
        rawList.push({
          id: z.zona,
          nombre: z.zona,
          secundario: z.supervisor,
          terciario: `${z.vendedores.size} Vendedores`,
          supervisor: z.supervisor,
          zona: z.zona,
          region: z.region,
          valor: z.valor,
        });
      });
    }

    // ==========================================
    // 5. DIMENSIÓN: CANALES DE VENTA
    // ==========================================
    else if (dimension === 'canales') {
      const canalesMap = new Map<string, {
        canal: string;
        clientesCount: number;
        valor: number;
      }>();

      data.clients.forEach((c) => {
        const canalKey = (c.canal && c.canal.trim() !== '') ? c.canal.trim() : 'GENERAL';
        const val = getItemMetricValue(
          c.months || {},
          c.monto,
          c.cajas,
          c.kgs,
          metric,
          selectedMonths
        );
        if (val <= 0) return;

        if (!canalesMap.has(canalKey)) {
          canalesMap.set(canalKey, {
            canal: canalKey,
            clientesCount: 0,
            valor: 0,
          });
        }
        const obj = canalesMap.get(canalKey)!;
        obj.valor += val;
        obj.clientesCount++;
      });

      canalesMap.forEach((c) => {
        if (c.valor <= 0) return;
        rawList.push({
          id: c.canal,
          nombre: c.canal,
          secundario: `${c.clientesCount} Clientes con venta`,
          canal: c.canal,
          valor: c.valor,
        });
      });
    }

    // Filtros contextuales (Supervisor, Canal, Búsqueda de texto)
    let filtered = rawList.filter((item) => {
      if (selectedSupervisor !== 'ALL' && item.supervisor && item.supervisor !== selectedSupervisor) {
        return false;
      }
      if (selectedCanal !== 'ALL' && item.canal && item.canal !== selectedCanal) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase();
        const matchesName = item.nombre.toLowerCase().includes(q);
        const matchesSec = item.secundario?.toLowerCase().includes(q);
        const matchesTer = item.terciario?.toLowerCase().includes(q);
        const matchesId = item.id.toLowerCase().includes(q);
        const matchesVendList = item.vendedoresList?.some((v) => v.toLowerCase().includes(q));
        const matchesIdsList = item.idsList?.some((id) => id.toLowerCase().includes(q));
        if (!matchesName && !matchesSec && !matchesTer && !matchesId && !matchesVendList && !matchesIdsList) return false;
      }
      return true;
    });

    // Ordenar descendente por valor absoluto
    filtered.sort((a, b) => b.valor - a.valor);

    // Calcular totales y acumulación de Pareto
    const totalSum = filtered.reduce((acc, it) => acc + it.valor, 0);

    let cumulative = 0;
    let countA = 0;
    let countB = 0;
    let countC = 0;
    let valueA = 0;
    let valueB = 0;
    let valueC = 0;

    const vipAtRiskList: ParetoRowItem[] = [];
    const growthOpportunityList: ParetoRowItem[] = [];
    const topAnchorList: ParetoRowItem[] = [];

    const rows: ParetoRowItem[] = filtered.map((item, index) => {
      const prevCumulativePct = totalSum > 0 ? (cumulative / totalSum) * 100 : 0;
      cumulative += item.valor;
      const pctCumulative = totalSum > 0 ? parseFloat(((cumulative / totalSum) * 100).toFixed(2)) : 0;
      const pctIndividual = totalSum > 0 ? parseFloat(((item.valor / totalSum) * 100).toFixed(2)) : 0;

      // Asignación de Clasificación ABC Oficial de Pareto:
      let clasificacion: ABCClass = 'C';
      if (prevCumulativePct < 80) {
        clasificacion = 'A';
        countA++;
        valueA += item.valor;
      } else if (prevCumulativePct < 95) {
        clasificacion = 'B';
        countB++;
        valueB += item.valor;
      } else {
        clasificacion = 'C';
        countC++;
        valueC += item.valor;
      }

      // Diagnóstico de Insight por fila (Opción 4)
      let insightStatus: InsightStatus = 'NORMAL';
      if (index < 10) {
        insightStatus = 'TOP_ANCHOR';
      }

      if (clasificacion === 'A' && (item.dropPct && item.dropPct >= 50)) {
        insightStatus = 'AT_RISK';
      } else if (clasificacion === 'B' && (item.growthPct && item.growthPct >= 20)) {
        insightStatus = 'GROWTH_OPPORTUNITY';
      }

      const rowItem: ParetoRowItem = {
        ...item,
        ranking: index + 1,
        pctIndividual,
        valorAcumulado: cumulative,
        pctAcumulado: pctCumulative,
        pctCumulative,
        clasificacion,
        insightStatus,
      };

      if (insightStatus === 'AT_RISK') vipAtRiskList.push(rowItem);
      if (insightStatus === 'GROWTH_OPPORTUNITY') growthOpportunityList.push(rowItem);
      if (index < 10) topAnchorList.push(rowItem);

      return rowItem;
    });

    const totalEntities = rows.length;
    const paretoRatio = totalEntities > 0 ? ((countA / totalEntities) * 100).toFixed(1) : '0';
    const valuePctA = totalSum > 0 ? ((valueA / totalSum) * 100).toFixed(1) : '0';
    const valuePctB = totalSum > 0 ? ((valueB / totalSum) * 100).toFixed(1) : '0';
    const valuePctC = totalSum > 0 ? ((valueC / totalSum) * 100).toFixed(1) : '0';

    // Ratios de Concentración de Riesgo
    const top1Val = rows[0]?.valor || 0;
    const top3Val = rows.slice(0, 3).reduce((acc, r) => acc + r.valor, 0);
    const top5Val = rows.slice(0, 5).reduce((acc, r) => acc + r.valor, 0);
    const top10Val = rows.slice(0, 10).reduce((acc, r) => acc + r.valor, 0);

    const top1Pct = totalSum > 0 ? parseFloat(((top1Val / totalSum) * 100).toFixed(1)) : 0;
    const top3Pct = totalSum > 0 ? parseFloat(((top3Val / totalSum) * 100).toFixed(1)) : 0;
    const top5Pct = totalSum > 0 ? parseFloat(((top5Val / totalSum) * 100).toFixed(1)) : 0;
    const top10Pct = totalSum > 0 ? parseFloat(((top10Val / totalSum) * 100).toFixed(1)) : 0;

    let concentrationLevel: 'ALTA' | 'MEDIA' | 'SALUDABLE' = 'SALUDABLE';
    let concentrationDescription = 'Distribución equilibrada del volumen sin dependencia excesiva en pocas cuentas.';

    if (top5Pct > 35 || top10Pct > 50) {
      concentrationLevel = 'ALTA';
      concentrationDescription = `Hiperconcentración detectada: El Top 10 absorbe el ${top10Pct}% del negocio global. Requiere blindaje comercial estricto.`;
    } else if (top5Pct > 20 || top10Pct > 30) {
      concentrationLevel = 'MEDIA';
      concentrationDescription = `Concentración moderada: El Top 10 representa el ${top10Pct}% del volumen. Oportunidad de diversificar en Clase B.`;
    }

    const calculatedInsights: ParetoInsightsData = {
      vipAtRiskCount: vipAtRiskList.length,
      vipAtRiskList,
      growthOpportunityCount: growthOpportunityList.length,
      growthOpportunityList,
      topAnchorCount: topAnchorList.length,
      topAnchorList,
      top1Pct,
      top3Pct,
      top5Pct,
      top10Pct,
      concentrationLevel,
      concentrationDescription,
    };

    return {
      allRows: rows,
      summaryStats: {
        totalEntities,
        totalSum,
        countA,
        countB,
        countC,
        valueA,
        valueB,
        valueC,
        valuePctA,
        valuePctB,
        valuePctC,
        paretoRatio,
      },
      insights: calculatedInsights,
    };
  }, [data, dimension, metric, selectedMonths, selectedSupervisor, selectedCanal, searchTerm]);

  // Filtrado final por categoría ABC y por Insight
  const displayRows = useMemo(() => {
    let list = allRows;
    if (filterClass !== 'ALL') {
      list = list.filter((r) => r.clasificacion === filterClass);
    }
    if (filterInsight === 'AT_RISK') {
      list = list.filter((r) => r.insightStatus === 'AT_RISK');
    } else if (filterInsight === 'GROWTH_OPPORTUNITY') {
      list = list.filter((r) => r.insightStatus === 'GROWTH_OPPORTUNITY');
    } else if (filterInsight === 'TOP_ANCHOR') {
      list = list.filter((r) => r.ranking <= 10);
    }

    // Aplicar Límite de Registros (Top 20, Top 50, Top 100 o Todos)
    if (clientLimit !== 'ALL') {
      list = list.slice(0, clientLimit);
    }

    return list;
  }, [allRows, filterClass, filterInsight, clientLimit]);

  // Paginación dinámica: al seleccionar Top 20, Top 50 o Top 100 se muestran TODOS los registros directamente en la tabla
  const effectiveItemsPerPage = clientLimit !== 'ALL' ? clientLimit : 50;
  const totalPages = Math.ceil(displayRows.length / effectiveItemsPerPage) || 1;
  const paginatedRows = useMemo(() => {
    if (clientLimit !== 'ALL') {
      return displayRows; // Muestra exactamente los 20, 50 o 100 registros en pantalla sin truncamiento
    }
    const start = (currentPage - 1) * effectiveItemsPerPage;
    return displayRows.slice(start, start + effectiveItemsPerPage);
  }, [displayRows, currentPage, effectiveItemsPerPage, clientLimit]);

  // Datos para el gráfico combinado de Pareto (Top 20 entidades)
  const chartData = useMemo(() => {
    return allRows.slice(0, 20).map((r) => ({
      name: r.nombre.length > 18 ? r.nombre.slice(0, 16) + '...' : r.nombre,
      fullName: r.nombre,
      valor: Math.round(r.valor),
      pctAcumulado: parseFloat(r.pctCumulative.toFixed(1)),
      clasificacion: r.clasificacion,
    }));
  }, [allRows]);

  const monthsExportLabel =
    selectedMonths.length > 0 && !selectedMonths.includes('ALL')
      ? selectedMonths.join(', ')
      : 'ALL';

  // Handlers de Exportación (Opción 5)
  const handleExportPDF = async () => {
    const listToExport = displayRows;
    if (listToExport.length === 0 || isExportingPDF) return;
    try {
      setIsExportingPDF(true);
      await new Promise((r) => setTimeout(r, 60));

      const activeFilterParts: string[] = [];
      if (selectedSupervisor !== 'ALL') activeFilterParts.push(`Supervisor: ${selectedSupervisor}`);
      if (selectedCanal !== 'ALL') activeFilterParts.push(`Canal: ${selectedCanal}`);
      if (filterClass !== 'ALL') activeFilterParts.push(`Clase ABC: ${filterClass}`);
      if (filterInsight !== 'ALL') activeFilterParts.push(`Insight: ${filterInsight}`);
      if (clientLimit !== 'ALL') activeFilterParts.push(`Limite: Top ${clientLimit}`);
      if (searchTerm.trim()) activeFilterParts.push(`Busqueda: "${searchTerm.trim()}"`);
      const filterMetadata =
        activeFilterParts.length > 0 ? activeFilterParts.join(' | ') : 'Todos los registros (Sin filtro)';

      exportParetoToPDF(
        listToExport,
        summaryStats,
        insights,
        dimension,
        metric,
        monthsExportLabel,
        filterMetadata
      );
    } catch (err) {
      console.error('Error generando PDF de Pareto:', err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  useEffect(() => {
    const onExportEvent = () => {
      handleExportPDF();
    };
    window.addEventListener('cuotas-export-pdf', onExportEvent);
    return () => window.removeEventListener('cuotas-export-pdf', onExportEvent);
  });

  const handleExportExcel = async () => {
    const listToExport = displayRows.length > 0 ? displayRows : allRows;
    if (listToExport.length === 0 || isExportingExcel) return;
    try {
      setIsExportingExcel(true);
      await new Promise((r) => setTimeout(r, 60));
      exportParetoToExcel(listToExport, summaryStats, insights, dimension, metric, monthsExportLabel);
    } catch (err) {
      console.error('Error generando Excel de Pareto:', err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* 1. BARRA SUPERIOR: SELECTOR DE DIMENSIÓN CONMUTABLE (Opción 1) Y ACCIONES DE EXPORTACIÓN (Opción 5) */}
      <div className="bg-zinc-950/80 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-600/10 border border-red-500/20 text-red-500 shadow-inner">
              <PieChartIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white tracking-wide uppercase">
                  Análisis Pareto 80/20 Multidimensional
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                  INSIGHTS & OPERACIONES
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Identifica los <strong className="text-zinc-200">pocos vitales</strong>, detecta riesgos de deserción y genera planes operativos de campo.
              </p>
            </div>
          </div>

          {/* Acciones: Plan Operativo, Exportar Excel y PDF */}
          <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
            {/* Botón Plan de Acción Operativa (Opción 5) */}
            <button
              type="button"
              onClick={() => setIsActionPlanOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-red-600/20"
              title="Abrir Plan de Acción para Supervisores y Vendedores"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Plan Operativo</span>
            </button>

            {/* Exportar Excel (.xlsx) (Opción 5) */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel || allRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-emerald-600/20 disabled:opacity-50"
              title="Descargar Reporte Multi-Hoja en Excel (.xlsx)"
            >
              <FileSpreadsheet className={`w-3.5 h-3.5 ${isExportingExcel ? 'animate-bounce' : ''}`} />
              <span>{isExportingExcel ? 'Generando Excel...' : 'Excel (.xlsx)'}</span>
            </button>

            {/* Exportar PDF */}
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExportingPDF || allRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-bold transition-colors border border-white/10 disabled:opacity-50"
              title="Descargar Reporte Oficial de Pareto en PDF"
            >
              <FileText className={`w-3.5 h-3.5 ${isExportingPDF ? 'animate-bounce' : ''}`} />
              <span>{isExportingPDF ? 'Generando PDF...' : 'Reporte PDF'}</span>
            </button>

            {/* Recargar */}
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={isLoading}
              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
              title="Recargar datos de Pareto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-red-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* ALERTA DE ERROR DE CONEXIÓN CON BOTÓN DE REINTENTO */}
        {error && !data && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <p className="font-bold text-white text-sm">Error de conexión al cargar datos de Pareto</p>
                <p className="text-zinc-300 text-[11px] mt-0.5">{error}. Haz clic en reintentar para restablecer la conexión.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 self-start sm:self-center transition-all cursor-pointer shadow-lg shadow-red-600/30 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Reintentar Conexión</span>
            </button>
          </div>
        )}

        {/* SELECTOR PRINCIPAL DE DIMENSIÓN (5 BOTONES CONMUTABLES) */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2 block flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-400" />
            Entidad a Analizar (Dimensión):
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => setDimension('clientes')}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                dimension === 'clientes'
                  ? 'bg-red-600/15 border-red-500 text-white shadow-lg shadow-red-600/10'
                  : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <div className={`p-2 rounded-lg ${dimension === 'clientes' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">Clientes (Cartera)</span>
                <span className="text-[10px] text-zinc-500 block truncate">2,800+ comercios</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDimension('productos')}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                dimension === 'productos'
                  ? 'bg-red-600/15 border-red-500 text-white shadow-lg shadow-red-600/10'
                  : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <div className={`p-2 rounded-lg ${dimension === 'productos' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">Productos / SKUs</span>
                <span className="text-[10px] text-zinc-500 block truncate">280+ artículos</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDimension('vendedores')}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                dimension === 'vendedores'
                  ? 'bg-red-600/15 border-red-500 text-white shadow-lg shadow-red-600/10'
                  : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <div className={`p-2 rounded-lg ${dimension === 'vendedores' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                <Briefcase className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">Fuerza de Ventas</span>
                <span className="text-[10px] text-zinc-500 block truncate">28 vendedores</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDimension('zonas')}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                dimension === 'zonas'
                  ? 'bg-red-600/15 border-red-500 text-white shadow-lg shadow-red-600/10'
                  : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <div className={`p-2 rounded-lg ${dimension === 'zonas' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">Zonas Comerciales</span>
                <span className="text-[10px] text-zinc-500 block truncate">Rutas y territorios</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDimension('canales')}
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                dimension === 'canales'
                  ? 'bg-red-600/15 border-red-500 text-white shadow-lg shadow-red-600/10'
                  : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <div className={`p-2 rounded-lg ${dimension === 'canales' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">Canales de Venta</span>
                <span className="text-[10px] text-zinc-500 block truncate">Segmentación</span>
              </div>
            </button>
          </div>
        </div>

        {/* 2. BARRA DE FILTROS SECUNDARIOS: MÉTRICA, PERÍODO, SUPERVISOR, CANAL, LÍMITE Y BÚSQUEDA */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Conmutador de Métrica (Cajas / Monto / Kgs) */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setMetric('cajas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                metric === 'cajas' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bultos (Cajas)
            </button>
            <button
              type="button"
              onClick={() => setMetric('monto')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                metric === 'monto' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Ventas ($)
            </button>
            <button
              type="button"
              onClick={() => setMetric('kgs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                metric === 'kgs' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Kilos (Kg)
            </button>
          </div>

          {/* Filtros desplegables y búsqueda */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro desplegable de Meses (Multiselección compacta) */}
            <MultiMonthSelect
              selectedMonths={selectedMonths}
              onChange={setSelectedMonths}
              availableMonths={data?.availableMonths}
            />

            {(dimension === 'clientes' || dimension === 'vendedores' || dimension === 'zonas') && (
              <select
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-200 focus:outline-none focus:border-red-500"
              >
                <option value="ALL">Todos los Supervisores</option>
                {availableSupervisors.map((s) => (
                  <option key={s} value={s}>
                    Sup: {s}
                  </option>
                ))}
              </select>
            )}

            {dimension === 'clientes' && (
              <select
                value={selectedCanal}
                onChange={(e) => setSelectedCanal(e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-200 focus:outline-none focus:border-red-500 max-w-[160px]"
              >
                <option value="ALL">Todos los Canales</option>
                {availableCanales.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {/* Filtro Límite de Registros (Top 20, 50, 100 o Todos) */}
            <ClientLimitFilter
              value={clientLimit}
              onChange={setClientLimit}
              label={
                dimension === 'clientes'
                  ? 'LÍMITE DE CLIENTES'
                  : dimension === 'productos'
                  ? 'LÍMITE DE PRODUCTOS'
                  : 'LÍMITE DE REGISTROS'
              }
              totalAvailable={allRows.length}
            />

            {/* Indicador de Producto Tildado */}
            {dimension === 'productos' && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/70 border border-white/10 text-xs text-zinc-300 backdrop-blur-md">
                <Package className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="truncate max-w-[220px]">
                  {selectedProduct
                    ? `Tildado: ${selectedProduct.nombre}`
                    : 'Tilda un producto para ver métricas'}
                </span>
                {selectedProduct && (
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="ml-1 text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10 cursor-pointer"
                    title="Desmarcar producto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={`Buscar en ${getParetoDimensionLabel(dimension)}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500 w-44 sm:w-56"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. PANEL DE DETECCIÓN AUTOMÁTICA DE RIESGOS Y OPORTUNIDADES (OPCIÓN 4: INSIGHTS) */}
      {insights && (
        <ParetoInsightsPanel
          insights={insights}
          dimension={dimension}
          metric={metric}
          currentFilterInsight={filterInsight}
          onFilterInsightChange={setFilterInsight}
          onOpenActionPlan={() => setIsActionPlanOpen(true)}
          onOpen360={(m) => setActive360Mode(m)}
        />
      )}

      {/* 3. RESUMEN EJECUTIVO ABC Y REGLA 80/20 (CARDS KPI INTERACTIVAS) */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="p-4 rounded-xl border border-white/5 bg-zinc-950/60 animate-pulse space-y-3">
              <div className="h-3 w-32 bg-zinc-800 rounded" />
              <div className="h-8 w-24 bg-zinc-800/80 rounded" />
              <div className="h-3 w-40 bg-zinc-800/40 rounded" />
            </div>
          ))}
        </div>
      ) : summaryStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            onClick={() => setFilterClass('ALL')}
            className={`p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all ${
              filterClass === 'ALL'
                ? 'bg-zinc-900/90 border-white/30 shadow-lg'
                : 'bg-zinc-950/60 border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider mb-1.5">
              <span>Universo Analizado</span>
              <Award className="w-4 h-4 text-zinc-400" />
            </div>
            <p className="text-3xl sm:text-4xl font-black text-white">{summaryStats.totalEntities.toLocaleString('es-VE')}</p>
            <p className="text-xs text-zinc-400 mt-1 font-mono">
              Total: <strong className="text-white">{formatParetoValue(summaryStats.totalSum, metric)}</strong>
            </p>
          </div>

          <div
            onClick={() => setFilterClass(filterClass === 'A' ? 'ALL' : 'A')}
            className={`p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all ${
              filterClass === 'A'
                ? 'bg-red-950/40 border-red-500 shadow-lg shadow-red-500/10'
                : 'bg-zinc-950/60 border-red-500/20 hover:border-red-500/40'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5 text-red-400">
              <span>Clase A (Vitales 80%)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 border border-red-500/40">
                {summaryStats.valuePctA}%
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl sm:text-4xl font-black text-white">{summaryStats.countA}</p>
              <span className="text-xs text-red-400 font-bold font-mono">
                ({summaryStats.paretoRatio}%)
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-1 font-mono">
              Suma: <strong className="text-red-400">{formatParetoValue(summaryStats.valueA, metric)}</strong>
            </p>
          </div>

          <div
            onClick={() => setFilterClass(filterClass === 'B' ? 'ALL' : 'B')}
            className={`p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all ${
              filterClass === 'B'
                ? 'bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-500/10'
                : 'bg-zinc-950/60 border-amber-500/20 hover:border-amber-500/40'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5 text-amber-400">
              <span>Clase B (Desarrollo 15%)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 border border-amber-500/40">
                {summaryStats.valuePctB}%
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl sm:text-4xl font-black text-white">{summaryStats.countB}</p>
              <span className="text-xs text-amber-400 font-bold font-mono">
                (
                {summaryStats.totalEntities > 0
                  ? ((summaryStats.countB / summaryStats.totalEntities) * 100).toFixed(1)
                  : 0}
                %)
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-1 font-mono">
              Suma: <strong className="text-amber-400">{formatParetoValue(summaryStats.valueB, metric)}</strong>
            </p>
          </div>

          <div
            onClick={() => setFilterClass(filterClass === 'C' ? 'ALL' : 'C')}
            className={`p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all ${
              filterClass === 'C'
                ? 'bg-zinc-800 border-zinc-400 shadow-lg'
                : 'bg-zinc-950/60 border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5 text-zinc-400">
              <span>Clase C (Cola 5%)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-800 border border-zinc-700 text-zinc-300">
                {summaryStats.valuePctC}%
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl sm:text-4xl font-black text-white">{summaryStats.countC}</p>
              <span className="text-xs text-zinc-400 font-bold font-mono">
                (
                {summaryStats.totalEntities > 0
                  ? ((summaryStats.countC / summaryStats.totalEntities) * 100).toFixed(1)
                  : 0}
                %)
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-1 font-mono">
              Suma: <strong className="text-zinc-300">{formatParetoValue(summaryStats.valueC, metric)}</strong>
            </p>
          </div>
        </div>
      )}

      {/* 4. GRÁFICO COMBINADO DE PARETO (BARRAS DE VOLUMEN + CURVA DE LORENZ ACUMULADA) */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-red-500" />
            <h4 className="text-sm font-bold text-white tracking-wide uppercase">
              Curva de Concentración Pareto (Top 20 {getParetoDimensionLabel(dimension)})
            </h4>
          </div>
          <span className="text-[11px] text-zinc-400">
            Línea punteada roja marca el umbral del <strong className="text-red-400">80% acumulado</strong>
          </span>
        </div>

        <div className="h-[280px] w-full pt-2">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mr-2 text-red-500" />
              Cargando gráfico de Pareto...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
              No hay datos para graficar con los filtros actuales.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 15, right: 25, bottom: 25, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis
                  yAxisId="left"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  stroke="#ef4444"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<ParetoChartTooltip metric={metric} />} />
                <ReferenceLine
                  yAxisId="right"
                  y={80}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: '80% Pareto',
                    fill: '#ef4444',
                    fontSize: 10,
                    position: 'insideTopLeft',
                  }}
                />
                <Bar yAxisId="left" dataKey="valor" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => {
                    let fillColor = '#64748b';
                    if (entry.clasificacion === 'A') fillColor = '#dc2626';
                    else if (entry.clasificacion === 'B') fillColor = '#f59e0b';
                    return <Cell key={`cell-${index}`} fill={fillColor} />;
                  })}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pctAcumulado"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#38bdf8' }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 4.5. DESGLOSE DETALLADO DEL PRODUCTO TILDADO (MÉTRICAS + CLIENTES COMPRADORES + LÍMITES) */}
      {dimension === 'productos' && selectedProduct && (
        <div ref={productBreakdownRef} className="scroll-mt-4">
          <ProductClientsBreakdown
            product={selectedProduct}
            selectedMonths={selectedMonths}
            onMonthChange={setSelectedMonths}
            metric={metric}
            portfolioTotalSum={summaryStats?.totalSum || 0}
            onClose={() => setSelectedProduct(null)}
          />
        </div>
      )}

      {/* 5. TABLA DETALLADA DE REGISTROS CON RANKING, CLASIFICACIÓN ABC Y ESTADO DE INSIGHT */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
              Listado Ordenado de {getParetoDimensionLabel(dimension)}
            </h4>
            <span className="text-[11px] text-zinc-400">
              ({clientLimit !== 'ALL'
                ? `Mostrando Top ${displayRows.length} de ${allRows.length} ${getParetoDimensionLabel(dimension).toLowerCase()}`
                : `${displayRows.length} registros`}
              {filterClass !== 'ALL' ? ` • Clase ${filterClass}` : ''}
              {filterInsight !== 'ALL' ? ` • Filtro Insight: ${filterInsight}` : ''})
            </span>
          </div>

          {/* Filtros rápidos: Clases ABC, Límites e Insights */}
          <div className="flex flex-wrap items-center gap-2">
            {filterInsight !== 'ALL' && (
              <button
                type="button"
                onClick={() => setFilterInsight('ALL')}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 border border-red-500/40 text-[10px] font-bold text-red-300 hover:bg-red-600/30 transition-colors"
              >
                <span>Filtro Insight Activo</span>
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Selector rápido de límite en cabecera de tabla */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5 text-[11px]">
              <span className="text-zinc-400 px-2 font-bold">Límite:</span>
              <button
                type="button"
                onClick={() => setClientLimit(20)}
                className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  clientLimit === 20 ? 'bg-[#e00613] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Top 20
              </button>
              <button
                type="button"
                onClick={() => setClientLimit(50)}
                className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  clientLimit === 50 ? 'bg-[#e00613] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Top 50
              </button>
              <button
                type="button"
                onClick={() => setClientLimit(100)}
                className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  clientLimit === 100 ? 'bg-[#e00613] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Top 100
              </button>
              <button
                type="button"
                onClick={() => setClientLimit('ALL')}
                className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  clientLimit === 'ALL' ? 'bg-[#e00613] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Todos
              </button>
            </div>

            {/* Aviso de producto tildado */}
            {dimension === 'productos' && (
              <div className="flex items-center gap-2">
                {selectedProduct ? (
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/20 border border-red-500/40 text-[11px] font-bold text-red-300 hover:bg-red-600/30 transition-all cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-red-400" />
                    <span>Tildado: {selectedProduct.nombre.slice(0, 22)}... (Desmarcar)</span>
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  <span className="text-[11px] text-zinc-400 italic flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-red-400" />
                    Tilda cualquier producto en la lista para ver clientes compradores
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5 text-[11px]">
              <span className="text-zinc-400 px-2">Clase:</span>
              <button
                type="button"
                onClick={() => setFilterClass('ALL')}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  filterClass === 'ALL' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilterClass('A')}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  filterClass === 'A' ? 'bg-red-600 text-white' : 'text-red-400/70 hover:text-red-400'
                }`}
              >
                Solo A
              </button>
              <button
                type="button"
                onClick={() => setFilterClass('B')}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  filterClass === 'B' ? 'bg-amber-600 text-white' : 'text-amber-400/70 hover:text-amber-400'
                }`}
              >
                Solo B
              </button>
              <button
                type="button"
                onClick={() => setFilterClass('C')}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  filterClass === 'C' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Solo C
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExportingPDF || displayRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50"
              title="Exportar cuadro general de Pareto filtrado a PDF"
            >
              <FileText className={`w-3.5 h-3.5 ${isExportingPDF ? 'animate-bounce' : ''}`} />
              <span>{isExportingPDF ? 'Generando...' : 'Exportar PDF'}</span>
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/90 text-zinc-300 uppercase font-bold text-[10px] tracking-wider border-b border-white/10">
              <tr>
                {dimension === 'productos' && (
                  <th className="py-3 px-2 text-center w-12 text-[10px]">Tildar</th>
                )}
                <th className="py-3 px-3 text-center w-12">#</th>
                <th className="py-3 px-3">
                  {dimension === 'clientes'
                    ? 'Cliente / Razón Social'
                    : dimension === 'productos'
                    ? 'Artículo / Descripción'
                    : dimension === 'vendedores'
                    ? 'Vendedor'
                    : dimension === 'zonas'
                    ? 'Zona Comercial'
                    : 'Canal de Distribución'}
                </th>
                {dimension === 'clientes' && (
                  <>
                    <th className="py-3 px-3">Canal</th>
                    <th className="py-3 px-3">Vendedor</th>
                    <th className="py-3 px-3">Supervisor</th>
                  </>
                )}
                {dimension === 'productos' && <th className="py-3 px-3">Código</th>}
                {dimension === 'vendedores' && (
                  <>
                    <th className="py-3 px-3">Supervisor</th>
                    <th className="py-3 px-3">Zona</th>
                  </>
                )}
                {dimension === 'zonas' && (
                  <>
                    <th className="py-3 px-3">Supervisor</th>
                    <th className="py-3 px-3">Vendedores</th>
                  </>
                )}
                {dimension === 'canales' && <th className="py-3 px-3">Clientes Activos</th>}
                <th className="py-3 px-3 text-right">
                  {metric === 'monto' ? 'Total Ventas ($)' : metric === 'cajas' ? 'Total Cajas' : 'Total Kilos'}
                </th>
                <th className="py-3 px-3 text-right">% Indiv.</th>
                <th className="py-3 px-3 text-right">% Acum.</th>
                <th className="py-3 px-3 text-center">Clase ABC</th>
                <th className="py-3 px-3 text-center">Diagnóstico / Insight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-zinc-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-500 mb-2" />
                    Calculando distribución Pareto y evaluando riesgos...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-zinc-500">
                    No se encontraron registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr
                    key={`${row.id}-${row.ranking}`}
                    onClick={() => {
                      if (dimension === 'productos') {
                        setSelectedProduct((prev) => (prev?.id === row.id ? null : row));
                      }
                    }}
                    className={`group transition-colors ${
                      dimension === 'productos' ? 'cursor-pointer' : ''
                    } ${
                      dimension === 'productos' && selectedProduct?.id === row.id
                        ? 'bg-red-950/40 border-l-4 border-l-[#e00613]'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {dimension === 'productos' && (
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProduct((prev) => (prev?.id === row.id ? null : row));
                          }}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            selectedProduct?.id === row.id
                              ? 'bg-[#e00613] text-white border-red-500 shadow-md shadow-red-600/30 ring-2 ring-red-500/50'
                              : 'bg-zinc-900 text-zinc-400 border-white/10 hover:text-white hover:border-red-500/50'
                          }`}
                          title={
                            selectedProduct?.id === row.id
                              ? 'Desmarcar producto'
                              : 'Tildar para ver clientes compradores y métricas'
                          }
                        >
                          {selectedProduct?.id === row.id ? (
                            <CheckSquare className="w-4 h-4 text-white" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-zinc-400">
                      {row.ranking}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white max-w-sm truncate" title={row.nombre}>
                          {row.nombre}
                        </span>
                        {dimension === 'productos' && selectedProduct?.id === row.id && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black bg-[#e00613] text-white shadow-sm flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            Tildado • Viendo Clientes
                          </span>
                        )}
                        {dimension === 'productos' && selectedProduct?.id !== row.id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProduct(row);
                            }}
                            className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded text-[9px] font-bold bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <span>Ver Clientes</span>
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                        {dimension === 'clientes' && row.idsList && row.idsList.length > 1 && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/30"
                            title={`Cliente Unificado: ${row.idsList.length} códigos ERP consolidados (${row.idsList.join(', ')})`}
                          >
                            {row.idsList.length} Sucursales
                          </span>
                        )}
                      </div>
                      {row.terciario && dimension !== 'clientes' && dimension !== 'vendedores' && (
                        <div className="text-[10px] text-zinc-500">{row.terciario}</div>
                      )}
                    </td>

                    {dimension === 'clientes' && (
                      <>
                        <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                          <span className="px-2 py-0.5 bg-zinc-900 border border-white/5 rounded text-[10px]">
                            {row.canal || 'GENERAL'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300 max-w-[140px]" title={row.vendedoresList ? `Vendedores: ${row.vendedoresList.join(', ')}` : row.secundario}>
                          <div className="flex items-center gap-1">
                            <span className="truncate">{row.secundario || '-'}</span>
                            {row.vendedoresList && row.vendedoresList.length > 1 && (
                              <span
                                className="px-1 py-0.2 rounded text-[8px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0"
                                title={`Vendedores asignados: ${row.vendedoresList.join(', ')}`}
                              >
                                +{row.vendedoresList.length - 1}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400 text-[11px] max-w-[130px] truncate">
                          {row.supervisor || '-'}
                        </td>
                      </>
                    )}

                    {dimension === 'productos' && (
                      <td className="py-2.5 px-3 font-mono text-zinc-400">{row.id}</td>
                    )}

                    {dimension === 'vendedores' && (
                      <>
                        <td className="py-2.5 px-3 text-zinc-300">{row.supervisor || '-'}</td>
                        <td className="py-2.5 px-3 text-zinc-400">{row.zona || '-'}</td>
                      </>
                    )}

                    {dimension === 'zonas' && (
                      <>
                        <td className="py-2.5 px-3 text-zinc-300">{row.supervisor || '-'}</td>
                        <td className="py-2.5 px-3 text-zinc-400">{row.terciario || '-'}</td>
                      </>
                    )}

                    {dimension === 'canales' && (
                      <td className="py-2.5 px-3 text-zinc-400">{row.secundario || '-'}</td>
                    )}

                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                      {formatParetoValue(row.valor, metric)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                      {row.pctIndividual.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-400">
                      {row.pctAcumulado.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider ${
                          row.clasificacion === 'A'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : row.clasificacion === 'B'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        CLASE {row.clasificacion}
                      </span>
                    </td>

                    {/* Columna Diagnóstico / Insight (Opción 4) */}
                    <td className="py-2.5 px-3 text-center">
                      {row.insightStatus === 'AT_RISK' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600/20 text-red-400 border border-red-500/30">
                          <ShieldAlert className="w-3 h-3 text-red-400" />
                          <span>{row.dropPct ? `En Riesgo (-${row.dropPct}%)` : 'Sin compras'}</span>
                        </span>
                      ) : row.insightStatus === 'GROWTH_OPPORTUNITY' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                          <span>Potencial (+{row.growthPct || 20}%)</span>
                        </span>
                      ) : row.ranking <= 10 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <Award className="w-3 h-3 text-amber-400" />
                          <span>Cuenta Ancla Top 10</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-500">Estable</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {paginatedRows.length > 0 && (() => {
              const preValueCols = dimension === 'clientes' ? 5 : dimension === 'canales' ? 3 : 4;
              const pageValor = paginatedRows.reduce((acc, r) => acc + (r.valor || 0), 0);
              const pagePctIndiv = paginatedRows.reduce((acc, r) => acc + (r.pctIndividual || 0), 0);
              const pageEndAcum = paginatedRows[paginatedRows.length - 1]?.pctAcumulado || 0;

              const filteredValor = displayRows.reduce((acc, r) => acc + (r.valor || 0), 0);
              const filteredPctIndiv = displayRows.reduce((acc, r) => acc + (r.pctIndividual || 0), 0);
              const globalValor = summaryStats?.totalValue ?? allRows.reduce((acc, r) => acc + (r.valor || 0), 0);
              const isFilteredSubset = displayRows.length !== allRows.length;

              return (
                <tfoot className="bg-zinc-900/95 border-t-2 border-red-500/40 text-xs">
                  {/* Fila 1: Subtotal de la Página Actual */}
                  <tr className="border-b border-white/10 bg-zinc-900/70">
                    <td colSpan={preValueCols} className="py-2.5 px-4 font-bold text-zinc-300 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] border border-white/10">
                          PÁG {currentPage} / {totalPages}
                        </span>
                        <span>Subtotal Página Actual ({paginatedRows.length} registros mostrados)</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-200">
                      {formatParetoValue(pageValor, metric)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-300">
                      {pagePctIndiv.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-400">
                      {pageEndAcum.toFixed(2)}%
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-center text-[11px] text-zinc-400">
                      Acumulado hasta fila #{paginatedRows[paginatedRows.length - 1]?.ranking || paginatedRows.length}
                    </td>
                  </tr>

                  {/* Fila 2: Total Global Acumulado */}
                  <tr className="bg-gradient-to-r from-red-950/30 via-zinc-900 to-zinc-900">
                    <td colSpan={preValueCols} className="py-3 px-4 font-black text-white uppercase tracking-wider">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[#e00613] text-white font-mono text-[10px] shadow-sm">
                          TOTAL GLOBAL
                        </span>
                        <span>
                          {isFilteredSubset
                            ? `Total Filtrado (${displayRows.length} registros) • Global General (${allRows.length}): ${formatParetoValue(globalValor, metric)}`
                            : `Total Global Consolidado (${allRows.length} registros en Pareto)`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-white text-sm">
                      {formatParetoValue(isFilteredSubset ? filteredValor : globalValor, metric)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-400">
                      {(isFilteredSubset ? filteredPctIndiv : 100).toFixed(2)}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-red-400">
                      100.00%
                    </td>
                    <td colSpan={2} className="py-3 px-3 text-center">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 font-bold">
                          A: {summaryStats?.countA || 0}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                          B: {summaryStats?.countB || 0}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold">
                          C: {summaryStats?.countC || 0}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>

        {/* Paginación y Resumen Global al final de cada página */}
        {displayRows.length > 0 && (() => {
          const pageValor = paginatedRows.reduce((acc, r) => acc + (r.valor || 0), 0);
          const pagePctIndiv = paginatedRows.reduce((acc, r) => acc + (r.pctIndividual || 0), 0);
          const globalValor = summaryStats?.totalValue ?? allRows.reduce((acc, r) => acc + (r.valor || 0), 0);
          return (
            <div className="p-3 border-t border-white/10 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Mostrando <strong className="text-white">{(currentPage - 1) * effectiveItemsPerPage + 1}</strong> a{' '}
                  <strong className="text-white">{Math.min(currentPage * effectiveItemsPerPage, displayRows.length)}</strong> de{' '}
                  <strong className="text-white">{displayRows.length}</strong> registros
                </span>
                <span className="hidden sm:inline text-zinc-600">|</span>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-white/10 text-zinc-300 font-mono text-[11px]">
                  Subtotal Pág {currentPage}: <strong className="text-white">{formatParetoValue(pageValor, metric)}</strong> ({pagePctIndiv.toFixed(2)}%)
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-red-950/30 border border-red-500/30 text-zinc-200 font-mono text-[11px]">
                  Total Global: <strong className="text-white font-black">{formatParetoValue(globalValor, metric)}</strong> (100%)
                </span>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-mono font-bold text-white">
                    Pág {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* 6. MODAL DE PLAN DE ACCIÓN OPERATIVO (OPCIÓN 5) */}
      {isActionPlanOpen && (
        <ParetoActionPlanModal
          isOpen={isActionPlanOpen}
          onClose={() => setIsActionPlanOpen(false)}
          rows={allRows}
          summary={summaryStats}
          insights={insights}
          dimension={dimension}
          metric={metric}
          selectedMonth={monthsExportLabel}
        />
      )}

      {/* 7. DASHBOARD 360° DE INSIGHTS (ALERTA DE FUGA, CONCENTRACIÓN Y ALTO POTENCIAL) */}
      {active360Mode && (
        <Pareto360Modal
          isOpen={active360Mode !== null}
          onClose={() => setActive360Mode(null)}
          mode={active360Mode}
          onModeChange={(m) => setActive360Mode(m)}
          rows={allRows}
          summary={summaryStats}
          insights={insights}
          dimension={dimension}
          metric={metric}
          selectedMonth={monthsExportLabel}
        />
      )}
    </div>
  );
};
