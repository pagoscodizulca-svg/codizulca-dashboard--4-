import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Target,
  Users,
  ChevronRight,
  Eye,
  EyeOff,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  History,
  ExternalLink,
  FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_DIAS_LABORABLES,
  DEFAULT_DIAS_TRANSCURRIDOS,
  SKU_FILTER_OPTIONS,
  getSellerVolumeQuota,
  getSellerOctoberRealFromSheet,
  hasVolumeQuota,
  syncVolumeQuotasFromGoogleSheet
} from './volumeQuotasData';
import { SellerMultiSelect, SellerOption } from './SellerMultiSelect';
import { SellerVolumeHistoryModal } from './SellerVolumeHistoryModal';

export type MetricType = 'cajas' | 'monto' | 'kgs';

export interface ComparisonItem {
  id: string;
  name: string;
  supervisor: string;
  zona?: string;
  region?: string;
  sellersCount?: number;
  meta: number;
  real: number;
  pctReal: number;
  proyectado: number;
  pctProyectado: number;
  brecha: number;
  ritmoDiario: number;
  sellers?: ComparisonItem[];
}

interface SupervisorVolumeComparativeAnalysisProps {
  sellerRows: Array<{
    vendedor: string;
    supervisor: string;
    zona: string;
    region: string;
    months: Record<string, { cajas: number; monto: number; kgs: number }>;
    totalCajas: number;
    totalMonto: number;
    totalKgs: number;
  }>;
  supervisorRows: Array<{
    supervisor: string;
    region: string;
    sellersCount: number;
    sellers: any[];
    months: Record<string, { cajas: number; monto: number; kgs: number }>;
    totalCajas: number;
    totalMonto: number;
    totalKgs: number;
  }>;
  metric: MetricType;
  selectedMonth?: string;
  diasLaborables?: number;
  diasTranscurridos?: number;
  rawSellerMonthlyData?: any[];
  availableMonths?: string[];
  onOpenSellerHistory?: (sellerName: string) => void;
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

export const SupervisorVolumeComparativeAnalysis: React.FC<SupervisorVolumeComparativeAnalysisProps> = ({
  sellerRows,
  supervisorRows,
  metric,
  selectedMonth = 'NOVIEMBRE',
  diasLaborables = DEFAULT_DIAS_LABORABLES,
  diasTranscurridos = DEFAULT_DIAS_TRANSCURRIDOS,
  rawSellerMonthlyData = [],
  availableMonths = [],
  onOpenSellerHistory,
}) => {
  // Filtros de encabezado
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('ALL');
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [selectedSku, setSelectedSku] = useState<string>('ALL');
  const [activeAnalysisMonth, setActiveAnalysisMonth] = useState<string>(selectedMonth);

  // Modal para ver historial completo del vendedor
  const [historySeller, setHistorySeller] = useState<string | null>(null);

  // Modos de visualización solicitados
  const [displayMode, setDisplayMode] = useState<'ambos' | 'grafico' | 'tabla'>('ambos');
  const [metricMode, setMetricMode] = useState<'porcentaje' | 'absoluto'>('porcentaje');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [quotasVersion, setQuotasVersion] = useState<number>(0);

  // Sincronizar cuotas de volumen en vivo desde el Google Sheet vía /api/sheets
  useEffect(() => {
    let mounted = true;
    syncVolumeQuotasFromGoogleSheet().then((updated) => {
      if (mounted && updated) {
        setQuotasVersion((v) => v + 1);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Actualizar mes si cambia la prop
  useEffect(() => {
    if (selectedMonth && selectedMonth !== activeAnalysisMonth) {
      setActiveAnalysisMonth(selectedMonth);
    }
  }, [selectedMonth]);

  // Lista de todos los meses con datos históricos disponibles
  const allHistoricalMonths = useMemo(() => {
    if (availableMonths && availableMonths.length > 0) {
      return [...availableMonths].sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
    }
    // Fallback a meses estándar 2026 incluyendo Noviembre
    return ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE'];
  }, [availableMonths]);

  const diasRestantes = Math.max(1, diasLaborables - diasTranscurridos);
  const factorProyeccion = diasTranscurridos > 0 ? diasLaborables / diasTranscurridos : 1;
  const metaAlDiaPct = Number(((diasTranscurridos / diasLaborables) * 100).toFixed(1));

  // Lista de supervisores únicos
  const availableSupervisors = useMemo(() => {
    const list = Array.from(new Set(supervisorRows.map((s) => s.supervisor)));
    return list.sort();
  }, [supervisorRows]);

  // Opciones de vendedores formateadas para SellerMultiSelect con supervisor y zona (solo los 28 con cuota asignada en Cuotas Volumen)
  const availableSellerOptions = useMemo<SellerOption[]>(() => {
    let list = sellerRows.filter((s) => hasVolumeQuota(s.vendedor));
    if (selectedSupervisor !== 'ALL') {
      list = list.filter((s) => s.supervisor === selectedSupervisor);
    }
    const map = new Map<string, SellerOption>();
    list.forEach((s) => {
      if (!map.has(s.vendedor)) {
        map.set(s.vendedor, {
          name: s.vendedor,
          supervisor: s.supervisor,
          zona: s.zona,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sellerRows, selectedSupervisor, quotasVersion]);

  // Sincronizar vendedores seleccionados al cambiar de supervisor
  useEffect(() => {
    if (selectedSupervisor !== 'ALL' && selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
      const allowedNames = new Set(availableSellerOptions.map((o) => o.name));
      const filtered = selectedSellers.filter((name) => allowedNames.has(name));
      if (filtered.length !== selectedSellers.length) {
        setSelectedSellers(filtered);
      }
    }
  }, [selectedSupervisor, availableSellerOptions]);

  const handleSupervisorChange = (sup: string) => {
    setSelectedSupervisor(sup);
    // Limpiar selección previa para que tome automáticamente todos los del nuevo supervisor
    setSelectedSellers([]);
  };

  const getMetricValue = (
    item: { cajas: number; monto: number; kgs: number } | undefined,
    type: MetricType = metric
  ) => {
    if (!item) return 0;
    if (type === 'monto') return item.monto;
    if (type === 'cajas') return item.cajas;
    return item.kgs;
  };

  const formatUnit = (val: number, type: MetricType = metric) => {
    const safeVal = Number.isFinite(val) ? val : 0;
    if (type === 'monto') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(safeVal);
    }
    return (
      new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
      }).format(safeVal) + (type === 'cajas' ? ' cj' : ' kg')
    );
  };

  const metricLabel = metric === 'kgs' ? 'Kg' : metric === 'cajas' ? 'Cj' : '$';

  // 1. Cálculo consolidado para Supervisores y sus Vendedores para el mes seleccionado
  const supervisorsConsolidated = useMemo<ComparisonItem[]>(() => {
    return supervisorRows.map((sup) => {
      let supMeta = 0;
      let supReal = 0;
      const sellersUnderSup: ComparisonItem[] = [];

      sup.sellers
        .filter((s) => hasVolumeQuota(s.vendedor))
        .forEach((s) => {
          const sMeta = getSellerVolumeQuota(s.vendedor, metric, selectedSku);
          const sMonthData = s.months[activeAnalysisMonth];
          let sReal = sMonthData ? getMetricValue(sMonthData, metric) : 0;

          if (activeAnalysisMonth === 'OCTUBRE') {
            if (metric === 'kgs') {
              const sheetRealKg = getSellerOctoberRealFromSheet(s.vendedor, selectedSku);
              if (sheetRealKg !== null) {
                sReal = sheetRealKg;
              }
            } else if (selectedSku !== 'ALL') {
              const sheetSkuReal = getSellerOctoberRealFromSheet(s.vendedor, selectedSku);
              const sheetAllReal = getSellerOctoberRealFromSheet(s.vendedor, 'ALL');
              if (sheetSkuReal !== null && sheetAllReal && sheetAllReal > 0) {
                sReal = sReal * (sheetSkuReal / sheetAllReal);
              }
            }
          } else if (selectedSku !== 'ALL') {
            const totalQuota = getSellerVolumeQuota(s.vendedor, metric, 'ALL');
            if (totalQuota > 0) {
              sReal = sReal * (sMeta / totalQuota);
            }
          }

          const sPctReal = sMeta > 0 ? (sReal / sMeta) * 100 : 0;
          const sProyectado = sReal * factorProyeccion;
          const sPctProyectado = sMeta > 0 ? (sProyectado / sMeta) * 100 : 0;
          const sBrecha = Math.max(0, sMeta - sReal);
          const sRitmo = sBrecha / diasRestantes;

          supMeta += sMeta;
          supReal += sReal;

          sellersUnderSup.push({
            id: s.vendedor,
            name: s.vendedor,
            supervisor: sup.supervisor,
            zona: s.zona,
            region: s.region,
            meta: sMeta,
            real: sReal,
            pctReal: Number(sPctReal.toFixed(1)),
            proyectado: sProyectado,
            pctProyectado: Number(sPctProyectado.toFixed(1)),
            brecha: sBrecha,
            ritmoDiario: sRitmo,
          });
        });

      // Ordenar vendedores de mayor a menor cumplimiento
      sellersUnderSup.sort((a, b) => b.pctReal - a.pctReal);

      const pctReal = supMeta > 0 ? (supReal / supMeta) * 100 : 0;
      const proyectado = supReal * factorProyeccion;
      const pctProyectado = supMeta > 0 ? (proyectado / supMeta) * 100 : 0;
      const brecha = Math.max(0, supMeta - supReal);
      const ritmoDiario = brecha / diasRestantes;

      return {
        id: sup.supervisor,
        name: sup.supervisor,
        supervisor: sup.supervisor,
        region: sup.region,
        sellersCount: sellersUnderSup.length,
        meta: supMeta,
        real: supReal,
        pctReal: Number(pctReal.toFixed(1)),
        proyectado,
        pctProyectado: Number(pctProyectado.toFixed(1)),
        brecha,
        ritmoDiario,
        sellers: sellersUnderSup,
      };
    });
  }, [supervisorRows, activeAnalysisMonth, metric, selectedSku, factorProyeccion, diasRestantes, quotasVersion]);

  // Lista plana de todos los vendedores calculados
  const allCalculatedSellers = useMemo(() => {
    return supervisorsConsolidated.flatMap((sup) => sup.sellers || []);
  }, [supervisorsConsolidated]);

  // 2. Datos del gráfico interactivo con filtrado multiselección
  const chartData = useMemo(() => {
    // Si el usuario seleccionó vendedores específicos con el filtro multiselección:
    if (selectedSellers.length > 0) {
      if (selectedSellers.length === 1 && selectedSellers[0] === '__NONE__') {
        return [];
      }
      const matched = allCalculatedSellers.filter((s) => selectedSellers.includes(s.name));
      return matched.map((s) => ({
        name: s.name,
        displayName: s.name.length > 18 ? s.name.slice(0, 16) + '...' : s.name,
        meta: s.meta,
        real: s.real,
        pctReal: s.pctReal,
        proyectado: Math.round(s.proyectado),
        pctProyectado: s.pctProyectado,
        brecha: s.brecha,
        ritmoDiario: s.ritmoDiario,
      }));
    }

    // Si se seleccionó un supervisor específico (sin multiselección explícita = todos sus vendedores)
    if (selectedSupervisor !== 'ALL') {
      const targetSup = supervisorsConsolidated.find((s) => s.name === selectedSupervisor);
      if (!targetSup || !targetSup.sellers) return [];
      return targetSup.sellers.map((s) => ({
        name: s.name,
        displayName: s.name.length > 18 ? s.name.slice(0, 16) + '...' : s.name,
        meta: s.meta,
        real: s.real,
        pctReal: s.pctReal,
        proyectado: Math.round(s.proyectado),
        pctProyectado: s.pctProyectado,
        brecha: s.brecha,
        ritmoDiario: s.ritmoDiario,
      }));
    }

    // Si "Todos los supervisores" está seleccionado y "Todos los vendedores":
    // Graficar todos los 27-28 vendedores de la empresa lado a lado (como en el mockup del usuario)
    return allCalculatedSellers.map((s) => ({
      name: s.name,
      displayName: s.name.length > 18 ? s.name.slice(0, 16) + '...' : s.name,
      meta: s.meta,
      real: s.real,
      pctReal: s.pctReal,
      proyectado: Math.round(s.proyectado),
      pctProyectado: s.pctProyectado,
      brecha: s.brecha,
      ritmoDiario: s.ritmoDiario,
    }));
  }, [selectedSellers, selectedSupervisor, supervisorsConsolidated, allCalculatedSellers]);

  // Totales rápidos
  const totals = useMemo(() => {
    let source = chartData.length > 0 ? chartData : allCalculatedSellers;
    const totMeta = source.reduce((acc, s) => acc + s.meta, 0);
    const totReal = source.reduce((acc, s) => acc + s.real, 0);
    const totProy = totReal * factorProyeccion;
    const totPctReal = totMeta > 0 ? (totReal / totMeta) * 100 : 0;
    const totPctProy = totMeta > 0 ? (totProy / totMeta) * 100 : 0;
    const totBrecha = Math.max(0, totMeta - totReal);

    return {
      count: source.length,
      meta: totMeta,
      real: totReal,
      proyectado: totProy,
      pctReal: Number(totPctReal.toFixed(1)),
      pctProyectado: Number(totPctProy.toFixed(1)),
      brecha: totBrecha,
    };
  }, [chartData, allCalculatedSellers, factorProyeccion]);

  // Manejar apertura de historial del vendedor
  const handleOpenSellerHistory = (name: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onOpenSellerHistory) {
      onOpenSellerHistory(name);
    }
    setHistorySeller(name);
  };

  // Exportar Cuadro General de Análisis Comparativo a PDF respetando todos los filtros
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const skuLabel = SKU_FILTER_OPTIONS.find((o) => o.id === selectedSku)?.label || selectedSku;

    doc.setFontSize(13.5);
    doc.setTextColor(185, 28, 28);
    doc.text(
      `CODIZULCA - CUADRO GENERAL COMPARATIVO DE CUOTAS DE VOLUMEN (${activeAnalysisMonth} 2026)`,
      14,
      14
    );

    const activeFilters: string[] = [
      `Mes: ${activeAnalysisMonth} 2026`,
      `Metrica: ${metricLabel}`,
      `SKU/Rubro: ${skuLabel}`,
    ];
    if (selectedSupervisor !== 'ALL') activeFilters.push(`Supervisor: ${selectedSupervisor}`);
    if (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
      activeFilters.push(
        `Vendedores (${selectedSellers.length}): ${selectedSellers.slice(0, 4).join(', ')}${
          selectedSellers.length > 4 ? '...' : ''
        }`
      );
    }

    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `${activeFilters.join(' | ')} | Meta al Dia: ${metaAlDiaPct}% | Exportado: ${new Date().toLocaleString('es-VE')}`,
      14,
      20
    );

    const headRow = [
      'SUPERVISOR / VENDEDOR',
      'EQUIPO',
      `META (${metricLabel})`,
      `REAL (${metricLabel})`,
      '% CUMPL. REAL',
      `META AL DIA (${metaAlDiaPct}%)`,
      'PROYECCION CIERRE',
      '% PROYECTADO',
      'BRECHA FALTANTE',
      'RITMO DIARIO REQ.',
    ];

    const bodyRows: any[][] = [];

    const filteredSupervisors = supervisorsConsolidated.filter((sup) => {
      if (selectedSupervisor !== 'ALL' && sup.id !== selectedSupervisor) return false;
      if (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
        return (sup.sellers || []).some((s) => selectedSellers.includes(s.name));
      }
      return true;
    });

    filteredSupervisors.forEach((sup) => {
      const sellersToDisplay =
        selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__'
          ? (sup.sellers || []).filter((s) => selectedSellers.includes(s.name))
          : sup.sellers || [];

      const supMeta =
        selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__'
          ? sellersToDisplay.reduce((a, b) => a + b.meta, 0)
          : sup.meta;
      const supReal =
        selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__'
          ? sellersToDisplay.reduce((a, b) => a + b.real, 0)
          : sup.real;
      const supPctReal = supMeta > 0 ? Number(((supReal / supMeta) * 100).toFixed(1)) : 0;
      const supProy = supReal * factorProyeccion;
      const supPctProy = supMeta > 0 ? Number(((supProy / supMeta) * 100).toFixed(1)) : 0;
      const supBrecha = Math.max(0, supMeta - supReal);
      const supRitmo = supBrecha / diasRestantes;
      const isAboveDaily = supPctReal >= metaAlDiaPct;

      bodyRows.push([
        `${sup.name} (${sup.region || ''})`,
        `${sellersToDisplay.length} vend.`,
        formatUnit(supMeta),
        formatUnit(supReal),
        `${supPctReal}%`,
        supPctReal >= 100 ? 'Superado' : isAboveDaily ? 'Al Dia' : 'En Riesgo',
        formatUnit(supProy),
        `${supPctProy}%`,
        supBrecha > 0 ? `-${formatUnit(supBrecha)}` : 'Completada',
        supBrecha > 0 ? `${formatUnit(supRitmo)} /dia` : '-',
      ]);

      sellersToDisplay.forEach((seller, idx) => {
        const isSellerAboveDaily = seller.pctReal >= metaAlDiaPct;
        bodyRows.push([
          `   -> ${seller.name}`,
          `#${idx + 1}`,
          formatUnit(seller.meta),
          formatUnit(seller.real),
          `${seller.pctReal}%`,
          seller.pctReal >= 100 ? 'Superado' : isSellerAboveDaily ? 'En Ritmo' : 'Retrasado',
          formatUnit(seller.proyectado),
          `${seller.pctProyectado}%`,
          seller.brecha > 0 ? `-${formatUnit(seller.brecha)}` : 'Meta OK',
          seller.brecha > 0 ? `${formatUnit(seller.ritmoDiario)} /dia` : '-',
        ]);
      });
    });

    const footRow = [
      `TOTAL CONSOLIDADO (${selectedSupervisor === 'ALL' ? `${filteredSupervisors.length} Equipos` : selectedSupervisor})`,
      `${totals.count} vend.`,
      formatUnit(totals.meta),
      formatUnit(totals.real),
      `${totals.pctReal}%`,
      totals.pctReal >= metaAlDiaPct
        ? 'En Ritmo'
        : `Retraso (${(totals.pctReal - metaAlDiaPct).toFixed(1)}%)`,
      formatUnit(totals.proyectado),
      `${totals.pctProyectado}%`,
      totals.brecha > 0 ? `-${formatUnit(totals.brecha)}` : 'Completada',
      totals.brecha > 0 ? `${formatUnit(totals.brecha / diasRestantes)} /dia` : '-',
    ];

    autoTable(doc, {
      startY: 24,
      head: [headRow],
      body: bodyRows,
      foot: [footRow],
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        halign: 'center',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [185, 28, 28],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 55 },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const firstCell = String((data.row.raw as any[])?.[0] || '');
          if (!firstCell.startsWith('   ->')) {
            data.cell.styles.fillColor = [235, 235, 240];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    doc.save(
      `Cuotas_Volumen_Comparativo_${activeAnalysisMonth}_${metricLabel}_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`
    );
  };

  // Formateador de Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const dataItem = payload[0]?.payload;
    if (!dataItem) return null;

    const isAboveDaily = dataItem.pctReal >= metaAlDiaPct;

    return (
      <div className="bg-zinc-950/95 border border-white/20 p-3.5 rounded-xl shadow-2xl backdrop-blur-xl text-xs space-y-2 min-w-[240px]">
        <div className="border-b border-white/10 pb-1.5 flex items-center justify-between gap-2">
          <span className="font-bold text-white text-sm truncate">{dataItem.name}</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              dataItem.pctReal >= 100
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : isAboveDaily
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
          >
            {dataItem.pctReal >= 100
              ? 'Superado'
              : isAboveDaily
              ? 'En Ritmo'
              : 'En Riesgo'}
          </span>
        </div>

        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="flex justify-between text-zinc-400">
            <span>Meta Asignada:</span>
            <strong className="text-zinc-200">{formatUnit(dataItem.meta)}</strong>
          </div>

          <div className="flex justify-between text-rose-400 font-bold">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Volumen Real:
            </span>
            <span>
              {formatUnit(dataItem.real)} ({dataItem.pctReal}%)
            </span>
          </div>

          <div className="flex justify-between text-amber-400 font-bold">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Proyección Cierre:
            </span>
            <span>
              {formatUnit(dataItem.proyectado)} ({dataItem.pctProyectado}%)
            </span>
          </div>

          <div className="border-t border-white/10 pt-1.5 flex justify-between text-zinc-400">
            <span>Meta al Día ({metaAlDiaPct}%):</span>
            <span className={isAboveDaily ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {isAboveDaily ? '✓ Al día' : `Faltan ${formatUnit(Math.max(0, (dataItem.meta * metaAlDiaPct) / 100 - dataItem.real))}`}
            </span>
          </div>

          <div className="flex justify-between text-zinc-500 text-[10px]">
            <span>Brecha Faltante:</span>
            <span className="text-zinc-300 font-bold">{formatUnit(dataItem.brecha)}</span>
          </div>

          <div className="pt-1 border-t border-white/10 text-center">
            <span className="text-[10px] text-red-400">Clic en la fila para ver historial mensual completo</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. BARRA SUPERIOR DE FILTROS: Supervisores, Vendedores Multiselección, SKU, y Mes Histórico */}
      <div className="bg-zinc-950/90 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3.5 flex-1 min-w-[300px]">
          {/* Filtro Supervisores */}
          <div className="flex flex-col gap-1 min-w-[170px]">
            <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-red-400" />
              Supervisores
            </label>
            <select
              value={selectedSupervisor}
              onChange={(e) => handleSupervisorChange(e.target.value)}
              className="bg-black/80 border border-white/10 hover:border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 cursor-pointer shadow-inner"
            >
              <option value="ALL">Todos los supervisores</option>
              {availableSupervisors.map((sup) => (
                <option key={sup} value={sup}>
                  {sup}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Vendedores Multiselección para comparativas */}
          <div className="flex flex-col gap-1 min-w-[240px] flex-1 max-w-md">
            <label className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-red-400" />
                Vendedores (Multiselección Comparativa)
              </span>
              {selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__' && (
                <span className="text-[10px] font-bold text-red-400">
                  {selectedSellers.length} seleccionados para comparar
                </span>
              )}
            </label>
            <SellerMultiSelect
              sellers={availableSellerOptions}
              selectedSellers={selectedSellers}
              onChange={setSelectedSellers}
              supervisorLabel={selectedSupervisor !== 'ALL' ? selectedSupervisor : undefined}
            />
          </div>

          {/* Selector de Mes Histórico para analizar meses anteriores */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Mes de Análisis
            </label>
            <select
              value={activeAnalysisMonth}
              onChange={(e) => setActiveAnalysisMonth(e.target.value)}
              className="bg-black/80 border border-amber-500/30 hover:border-amber-500/50 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400 cursor-pointer shadow-inner"
            >
              {allHistoricalMonths.map((m) => (
                <option key={m} value={m}>
                  {m} 2026
                </option>
              ))}
            </select>
          </div>

          {/* Filtro SKU / Rubros */}
          <div className="flex flex-col gap-1 min-w-[170px]">
            <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-red-400" />
              SKU / Rubro
            </label>
            <select
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="bg-black/80 border border-white/10 hover:border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 cursor-pointer shadow-inner"
            >
              {SKU_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tarjetas resumen rápido */}
        <div className="flex items-center gap-2.5 font-mono text-xs">
          <div className="bg-zinc-900/90 border border-white/10 px-3 py-2 rounded-xl text-right">
            <span className="text-[10px] text-zinc-400 block font-sans">
              Meta ({totals.count} vend.):
            </span>
            <strong className="text-zinc-200 font-bold">{formatUnit(totals.meta)}</strong>
          </div>
          <div className="bg-zinc-900/90 border border-red-500/30 px-3 py-2 rounded-xl text-right">
            <span className="text-[10px] text-zinc-400 block font-sans">Cumplimiento Real:</span>
            <strong className="text-red-400 font-black">{totals.pctReal}%</strong>
          </div>
          <div className="bg-zinc-900/90 border border-amber-500/30 px-3 py-2 rounded-xl text-right">
            <span className="text-[10px] text-zinc-400 block font-sans">Proyección Cierre:</span>
            <strong className="text-amber-400 font-black">{totals.pctProyectado}%</strong>
          </div>
        </div>
      </div>

      {/* 2. CARD PRINCIPAL: ANÁLISIS COMPARATIVO LADO A LADO */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
        {/* Cabecera de la Sección con Switchers */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-600/10 border border-red-500/30 text-red-500">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                {selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__'
                  ? `Comparativa Lado a Lado (${selectedSellers.length} Vendedores Seleccionados)`
                  : selectedSupervisor !== 'ALL'
                  ? `Análisis Comparativo por Vendedor - Equipo ${selectedSupervisor}`
                  : 'Análisis Comparativo por Vendedor (Volumen de Ventas)'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                Comparativa de metas, volumen real alcanzado, meta al día ({metaAlDiaPct}%) y proyección a cierre ({activeAnalysisMonth}).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switch [ Ambos | Gráfico | Tabla ] */}
            <div className="flex items-center bg-black/70 p-1 rounded-xl border border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDisplayMode('ambos')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  displayMode === 'ambos' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Ambos
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('grafico')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  displayMode === 'grafico' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Gráfico
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('tabla')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  displayMode === 'tabla' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Tabla
              </button>
            </div>

            {/* Botón Exportar PDF */}
            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Exportar cuadro comparativo filtrado a PDF"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Exportar PDF</span>
            </button>

            {/* Botón [ Ocultar / Mostrar ] */}
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
            >
              {isCollapsed ? <Eye className="w-3.5 h-3.5 text-zinc-400" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{isCollapsed ? 'Mostrar ▾' : 'Ocultar ▴'}</span>
            </button>
          </div>
        </div>

        {/* Contenido colapsable */}
        {!isCollapsed && (
          <div className="p-4 sm:p-5 space-y-6">
            {/* SUB-BARRA: COMPARATIVA LADO A LADO Y CONMUTADOR % vs VALORES ABSOLUTOS */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2 text-xs font-black tracking-wide text-zinc-200 uppercase">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                <span>
                  COMPARATIVA LADO A LADO - METAS Y CUMPLIMIENTO DE VOLUMEN ({metricLabel.toUpperCase()})
                </span>
              </div>

              {/* Botón Conmutador [% Cumplimiento | Valores Absolutos] */}
              <div className="flex items-center bg-black/70 p-1 rounded-xl border border-white/10 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setMetricMode('porcentaje')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    metricMode === 'porcentaje' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  % Cumplimiento
                </button>
                <button
                  type="button"
                  onClick={() => setMetricMode('absoluto')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    metricMode === 'absoluto' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Valores Absolutos ({metricLabel})
                </button>
              </div>
            </div>

            {/* 3. EL GRÁFICO LADO A LADO */}
            {(displayMode === 'ambos' || displayMode === 'grafico') && (
              <div className="space-y-2">
                {chartData.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl text-zinc-500 space-y-2">
                    <Target className="w-8 h-8 text-zinc-600" />
                    <span className="text-sm">No hay vendedores seleccionados para comparar.</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSellers([])}
                      className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-bold hover:bg-red-600 hover:text-white transition-all"
                    >
                      Seleccionar Todos
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-[320px] sm:h-[380px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 25, right: 30, left: 10, bottom: 65 }}
                        barGap={4}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis
                          dataKey="displayName"
                          stroke="#71717a"
                          fontSize={11}
                          interval={0}
                          angle={-35}
                          textAnchor="end"
                          tick={{ fill: '#a1a1aa' }}
                        />
                        <YAxis
                          stroke="#71717a"
                          fontSize={11}
                          domain={metricMode === 'porcentaje' ? [0, 140] : [0, 'auto']}
                          ticks={metricMode === 'porcentaje' ? [0, 35, 70, 105, 140] : undefined}
                          tickFormatter={(val) => (metricMode === 'porcentaje' ? `${val}%` : formatUnit(val))}
                          tick={{ fill: '#a1a1aa' }}
                        />
                        <Tooltip content={<CustomTooltip />} />

                        {/* Línea de referencia: Meta 100% */}
                        {metricMode === 'porcentaje' && (
                          <ReferenceLine
                            y={100}
                            stroke="#10b981"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{
                              value: 'Meta 100%',
                              position: 'top',
                              fill: '#10b981',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          />
                        )}

                        {/* Línea de referencia: Meta al día (73.1%) */}
                        {metricMode === 'porcentaje' && (
                          <ReferenceLine
                            y={metaAlDiaPct}
                            stroke="#ef4444"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{
                              value: `Meta al día (${metaAlDiaPct}%)`,
                              position: 'insideTopRight',
                              fill: '#ef4444',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          />
                        )}

                        {/* Barra 1: % Cumplimiento Proyectado (Amarillo / Ámbar #f59e0b) */}
                        <Bar
                          dataKey={metricMode === 'porcentaje' ? 'pctProyectado' : 'proyectado'}
                          name="% Cumplimiento Proyectado"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />

                        {/* Barra 2: % Cumplimiento Real (Rojo #ef4444) */}
                        <Bar
                          dataKey={metricMode === 'porcentaje' ? 'pctReal' : 'real'}
                          name="% Cumplimiento Real"
                          fill="#ef4444"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Leyenda personalizada en el pie del gráfico */}
                <div className="flex items-center justify-center gap-6 text-xs font-semibold text-zinc-300 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-[#f59e0b]" />
                    <span>% Cumplimiento Proyectado</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded bg-[#ef4444]" />
                    <span>% Cumplimiento Real</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-[11px] text-zinc-500 pl-4 border-l border-white/10">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 border-t border-dashed border-emerald-500 inline-block" />
                      Meta 100%
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 border-t border-dashed border-red-500 inline-block" />
                      Meta al día ({metaAlDiaPct}%)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. TABLA CONSOLIDADA CON ACCIONES Y BOTÓN DE HISTORIAL */}
            {(displayMode === 'ambos' || displayMode === 'tabla') && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                  <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                    CONSOLIDADO DETALLADO POR SUPERVISOR Y VENDEDORES
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <History className="w-3 h-3 text-red-400" />
                      Haz clic en el botón <strong className="text-white">"Historial"</strong> de cualquier vendedor para ver su evolución mensual completa.
                    </span>
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm"
                      title="Exportar cuadro general filtrado a PDF"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Exportar PDF</span>
                    </button>
                  </div>
                </div>

                <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-950/70">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-900 border-b border-white/10 text-zinc-300 font-bold uppercase text-[10px] tracking-wider">
                          <th className="p-3 border-r border-white/10">Supervisor / Vendedor</th>
                          <th className="p-3 text-center border-r border-white/10">Equipo</th>
                          <th className="p-3 text-center border-r border-white/10">Meta ({metricLabel})</th>
                          <th className="p-3 text-center border-r border-white/10">Real ({metricLabel})</th>
                          <th className="p-3 text-center border-r border-white/10 bg-red-950/20 text-red-300">
                            % Cumplimiento Real
                          </th>
                          <th className="p-3 text-center border-r border-white/10">
                            Meta al Día ({metaAlDiaPct}%)
                          </th>
                          <th className="p-3 text-center border-r border-white/10 bg-amber-950/20 text-amber-300">
                            Proyección Cierre
                          </th>
                          <th className="p-3 text-center border-r border-white/10 bg-amber-950/20 text-amber-300">
                            % Proyectado
                          </th>
                          <th className="p-3 text-center border-r border-white/10">Brecha Faltante</th>
                          <th className="p-3 text-center border-r border-white/10">Ritmo Diario Req.</th>
                          <th className="p-3 text-center">Historial</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {supervisorsConsolidated
                          .filter((sup) => {
                            if (selectedSupervisor !== 'ALL' && sup.id !== selectedSupervisor) return false;
                            if (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
                              return (sup.sellers || []).some((s) => selectedSellers.includes(s.name));
                            }
                            return true;
                          })
                          .map((sup) => {
                          const isExpanded =
                            expandedRow === sup.id ||
                            selectedSupervisor === sup.id ||
                            (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__');
                          const isAboveDaily = sup.pctReal >= metaAlDiaPct;

                          // Filtrar vendedores según la multiselección si está activa
                          const sellersToDisplay =
                            selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__'
                              ? (sup.sellers || []).filter((s) => selectedSellers.includes(s.name))
                              : sup.sellers || [];

                          return (
                            <React.Fragment key={sup.id}>
                              {/* Fila del Supervisor */}
                              <tr
                                onClick={() => setExpandedRow(isExpanded ? null : sup.id)}
                                className={`cursor-pointer transition-colors select-none ${
                                  isExpanded
                                    ? 'bg-zinc-900/90 border-l-4 border-l-red-500'
                                    : 'hover:bg-white/[0.04]'
                                }`}
                              >
                                <td className="p-3 border-r border-white/10 font-bold text-white">
                                  <div className="flex items-center gap-2.5">
                                    <button
                                      type="button"
                                      className={`p-1 rounded-md transition-transform duration-200 ${
                                        isExpanded ? 'rotate-90 bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400'
                                      }`}
                                    >
                                      <ChevronRight className="w-3 h-3" />
                                    </button>
                                    <div className="flex flex-col">
                                      <span className="text-white text-sm">{sup.name}</span>
                                      <span className="text-[10px] text-zinc-400 font-normal">{sup.region}</span>
                                    </div>
                                  </div>
                                </td>

                                <td className="p-3 text-center font-mono border-r border-white/10">
                                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[11px] font-bold">
                                    {sup.sellersCount} vend.
                                  </span>
                                </td>

                                <td className="p-3 text-center font-mono font-semibold text-zinc-300 border-r border-white/10">
                                  {formatUnit(sup.meta)}
                                </td>

                                <td className="p-3 text-center font-mono font-bold text-white border-r border-white/10">
                                  {formatUnit(sup.real)}
                                </td>

                                {/* % Cumplimiento Real */}
                                <td className="p-3 text-center border-r border-white/10 bg-red-950/10">
                                  <div className="flex flex-col items-center gap-1">
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-xs font-black font-mono ${
                                        sup.pctReal >= 100
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                          : isAboveDaily
                                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                                          : 'bg-red-500/20 text-red-400 border border-red-500/40'
                                      }`}
                                    >
                                      {sup.pctReal}%
                                    </span>
                                    <div className="w-20 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-red-500 rounded-full"
                                        style={{ width: `${Math.min(sup.pctReal, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>

                                {/* Estado respecto a Meta al Día */}
                                <td className="p-3 text-center border-r border-white/10">
                                  <span
                                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${
                                      sup.pctReal >= 100
                                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                                        : isAboveDaily
                                        ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20'
                                        : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                                    }`}
                                  >
                                    {sup.pctReal >= 100 ? (
                                      <>
                                        <CheckCircle2 className="w-3 h-3" />
                                        Superado
                                      </>
                                    ) : isAboveDaily ? (
                                      <>
                                        <TrendingUp className="w-3 h-3" />
                                        Al Día
                                      </>
                                    ) : (
                                      <>
                                        <AlertTriangle className="w-3 h-3" />
                                        En Riesgo
                                      </>
                                    )}
                                  </span>
                                </td>

                                {/* Proyección Cierre */}
                                <td className="p-3 text-center font-mono font-bold text-amber-300 border-r border-white/10 bg-amber-950/10">
                                  {formatUnit(sup.proyectado)}
                                </td>

                                {/* % Proyectado */}
                                <td className="p-3 text-center border-r border-white/10 bg-amber-950/10 font-mono font-black text-amber-400">
                                  <span
                                    className={`px-2 py-0.5 rounded ${
                                      sup.pctProyectado >= 100
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    }`}
                                  >
                                    {sup.pctProyectado}%
                                  </span>
                                </td>

                                {/* Brecha Faltante */}
                                <td className="p-3 text-center font-mono text-zinc-300 border-r border-white/10">
                                  {sup.brecha > 0 ? (
                                    <span className="text-rose-400 font-semibold">-{formatUnit(sup.brecha)}</span>
                                  ) : (
                                    <span className="text-emerald-400 font-bold">¡Completada!</span>
                                  )}
                                </td>

                                {/* Ritmo Diario Requerido */}
                                <td className="p-3 text-center font-mono text-zinc-300 border-r border-white/10">
                                  {sup.brecha > 0 ? (
                                    <span className="text-zinc-200 font-bold">
                                      {formatUnit(sup.ritmoDiario)}
                                      <span className="text-[10px] text-zinc-500 font-normal"> /día</span>
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600">-</span>
                                  )}
                                </td>

                                <td className="p-3 text-center text-zinc-500 text-[10px]">
                                  {isExpanded ? 'Ver vendedores ↓' : 'Desplegar'}
                                </td>
                              </tr>

                              {/* Vendedores Asignados al Supervisor cuando se expande */}
                              {isExpanded &&
                                sellersToDisplay.map((seller, sIdx) => {
                                  const isSellerAboveDaily = seller.pctReal >= metaAlDiaPct;

                                  return (
                                    <tr
                                      key={seller.id}
                                      onClick={() => handleOpenSellerHistory(seller.name)}
                                      className="bg-zinc-950/90 hover:bg-zinc-900/80 border-b border-white/5 transition-colors text-xs cursor-pointer group"
                                      title="Haz clic para ver el historial mensual completo de este vendedor"
                                    >
                                      <td className="py-2.5 pl-9 pr-3 border-r border-white/10">
                                        <div className="flex items-center gap-2">
                                          <span className="text-red-500 font-mono text-xs">↳</span>
                                          <span className="font-semibold text-zinc-200 group-hover:text-red-400 transition-colors">
                                            {seller.name}
                                          </span>
                                        </div>
                                      </td>

                                      <td className="py-2.5 text-center font-mono text-zinc-500 text-[11px] border-r border-white/10">
                                        #{sIdx + 1}
                                      </td>

                                      <td className="py-2.5 text-center font-mono text-zinc-400 border-r border-white/10">
                                        {formatUnit(seller.meta)}
                                      </td>

                                      <td className="py-2.5 text-center font-mono font-bold text-zinc-200 border-r border-white/10">
                                        {formatUnit(seller.real)}
                                      </td>

                                      <td className="py-2.5 text-center border-r border-white/10 bg-red-950/5">
                                        <span
                                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                                            seller.pctReal >= 100
                                              ? 'text-emerald-400 bg-emerald-500/10'
                                              : isSellerAboveDaily
                                              ? 'text-yellow-400 bg-yellow-500/10'
                                              : 'text-red-400 bg-red-500/10'
                                          }`}
                                        >
                                          {seller.pctReal}%
                                        </span>
                                      </td>

                                      <td className="py-2.5 text-center border-r border-white/10 text-[10px]">
                                        <span
                                          className={
                                            seller.pctReal >= 100
                                              ? 'text-emerald-400 font-bold'
                                              : isSellerAboveDaily
                                              ? 'text-yellow-400 font-bold'
                                              : 'text-rose-400 font-bold'
                                          }
                                        >
                                          {seller.pctReal >= 100
                                            ? 'Superado'
                                            : isSellerAboveDaily
                                            ? 'En Ritmo'
                                            : 'Retrasado'}
                                        </span>
                                      </td>

                                      <td className="py-2.5 text-center font-mono text-amber-300 border-r border-white/10 bg-amber-950/5 text-[11px]">
                                        {formatUnit(seller.proyectado)}
                                      </td>

                                      <td className="py-2.5 text-center border-r border-white/10 bg-amber-950/5 font-mono text-[11px] font-bold text-amber-400">
                                        {seller.pctProyectado}%
                                      </td>

                                      <td className="py-2.5 text-center font-mono text-zinc-400 border-r border-white/10 text-[11px]">
                                        {seller.brecha > 0 ? (
                                          <span className="text-rose-400">-{formatUnit(seller.brecha)}</span>
                                        ) : (
                                          <span className="text-emerald-400">Meta OK</span>
                                        )}
                                      </td>

                                      <td className="py-2.5 text-center font-mono text-zinc-400 border-r border-white/10 text-[11px]">
                                        {seller.brecha > 0 ? formatUnit(seller.ritmoDiario) : '-'}
                                      </td>

                                      {/* Botón de acción: Ver Historial */}
                                      <td className="py-2 text-center">
                                        <button
                                          type="button"
                                          onClick={(e) => handleOpenSellerHistory(seller.name, e)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-all text-[10px] font-bold shadow-sm"
                                        >
                                          <TrendingUp className="w-3 h-3 text-red-400 group-hover:text-white" />
                                          <span>Historial</span>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-zinc-900/95 border-t-2 border-red-500/40 font-mono text-xs">
                        <tr>
                          <td className="p-3 border-r border-white/10 font-black text-white uppercase tracking-wider">
                            TOTAL CONSOLIDADO ({selectedSupervisor === 'ALL' ? '3 Equipos' : selectedSupervisor})
                          </td>
                          <td className="p-3 text-center font-bold text-zinc-200 border-r border-white/10">
                            {totals.count}
                          </td>
                          <td className="p-3 text-center font-bold text-zinc-200 border-r border-white/10">
                            {formatUnit(totals.meta)}
                          </td>
                          <td className="p-3 text-center font-black text-white border-r border-white/10">
                            {formatUnit(totals.real)}
                          </td>
                          <td className="p-3 text-center border-r border-white/10 bg-red-950/20">
                            <span
                              className={`px-2 py-0.5 rounded font-black ${
                                totals.pctReal >= 100
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : totals.pctReal >= metaAlDiaPct
                                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
                              }`}
                            >
                              {totals.pctReal}%
                            </span>
                          </td>
                          <td className="p-3 text-center border-r border-white/10 font-sans text-[11px]">
                            <span className={totals.pctReal >= metaAlDiaPct ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {totals.pctReal >= metaAlDiaPct ? '✓ En Ritmo' : `Retraso (${(totals.pctReal - metaAlDiaPct).toFixed(1)}%)`}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-amber-300 border-r border-white/10 bg-amber-950/15">
                            {formatUnit(totals.proyectado)}
                          </td>
                          <td className="p-3 text-center border-r border-white/10 bg-amber-950/15 font-black text-amber-400">
                            {totals.pctProyectado}%
                          </td>
                          <td className="p-3 text-center font-bold border-r border-white/10">
                            {totals.brecha > 0 ? (
                              <span className="text-rose-400">-{formatUnit(totals.brecha)}</span>
                            ) : (
                              <span className="text-emerald-400">¡Completada!</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-zinc-200 border-r border-white/10">
                            {totals.brecha > 0 ? `${formatUnit(totals.brecha / diasRestantes)} /día` : '-'}
                          </td>
                          <td className="p-3 text-center text-[10px] text-zinc-400 font-sans">
                            Global {activeAnalysisMonth}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE HISTORIAL COMPLETO DE VOLUMEN DE MERCANCÍA DEL VENDEDOR */}
      <SellerVolumeHistoryModal
        sellerName={historySeller}
        isOpen={!!historySeller}
        onClose={() => setHistorySeller(null)}
        rawSellerMonthlyData={rawSellerMonthlyData}
        currentMetric={metric}
      />
    </div>
  );
};
