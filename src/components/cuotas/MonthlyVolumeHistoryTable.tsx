import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  RefreshCw, 
  Search, 
  Download, 
  TrendingUp, 
  Package, 
  DollarSign, 
  Scale, 
  Database, 
  Calendar, 
  CheckCircle2, 
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Check,
  RotateCcw,
  Users,
  ChevronsUpDown
} from 'lucide-react';
import { ViewLevel } from './MonthProgressBar';
import { getSellerMetadata, isExcludedVolumeSeller, normalizeSellerName, OFFICIAL_SELLERS_LIST, OFFICIAL_SUPERVISORS } from './sellerSupervisorMap';
import { SellerMultiSelect, SellerOption } from './SellerMultiSelect';
import { SupervisorVolumeComparativeAnalysis } from './SupervisorVolumeComparativeAnalysis';
import { SellerVolumeHistoryModal } from './SellerVolumeHistoryModal';
import {
  DEFAULT_DIAS_LABORABLES,
  DEFAULT_DIAS_TRANSCURRIDOS,
  syncVolumeQuotasFromGoogleSheet,
} from './volumeQuotasData';

export interface MonthlyTotalItem {
  mes: string;
  ano: number;
  cajas: number;
  kgs: number;
  montoNeto: number;
  montoFA: number;
  montoDV: number;
  vendedoresCount: number;
  facturasCount: number;
}

export interface SellerMonthItem {
  vendedor: string;
  mes: string;
  ano: number;
  cajas: number;
  kgs: number;
  montoNeto: number;
  montoFA: number;
  montoDV: number;
  cajasFA: number;
  cajasDV: number;
  facturasCount: number;
}

interface MonthlyVolumeHistoryTableProps {
  viewLevel: ViewLevel;
  onOpenSkuVolume?: () => void;
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

const SHORT_MONTHS: Record<string, string> = {
  ENERO: 'ENE',
  FEBRERO: 'FEB',
  MARZO: 'MAR',
  ABRIL: 'ABR',
  MAYO: 'MAY',
  JUNIO: 'JUN',
  JULIO: 'JUL',
  AGOSTO: 'AGO',
  SEPTIEMBRE: 'SEP',
  OCTUBRE: 'OCT',
  NOVIEMBRE: 'NOV',
  DICIEMBRE: 'DIC',
};

type MetricType = 'cajas' | 'monto' | 'kgs';

export const MonthlyVolumeHistoryTable: React.FC<MonthlyVolumeHistoryTableProps> = ({
  viewLevel,
  onOpenSkuVolume,
  diasLaborables = DEFAULT_DIAS_LABORABLES,
  diasTranscurridos = DEFAULT_DIAS_TRANSCURRIDOS,
}) => {
  const [data, setData] = useState<{
    ano: number;
    lastSync: string;
    totalSourceRows: number;
    monthlyTotals: MonthlyTotalItem[];
    sellerMonthlyData: SellerMonthItem[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricType>('kgs');
  const [searchTerm, setSearchTerm] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('ALL');
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
  const [historyModalSeller, setHistoryModalSeller] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);

  // Multiselect months state
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [expandedSupervisors, setExpandedSupervisors] = useState<Set<string>>(new Set());

  const toggleSupervisorExpand = (supName: string) => {
    setExpandedSupervisors((prev) => {
      const next = new Set(prev);
      if (next.has(supName)) {
        next.delete(supName);
      } else {
        next.add(supName);
      }
      return next;
    });
  };

  // Load initial data and sync live volume quotas from Google Sheet via /api/sheets
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        await syncVolumeQuotasFromGoogleSheet().catch(() => {});
        const res = await fetch('/api/sellers-monthly-volume');
        if (res.ok && isMounted) {
          const json = await res.json();
          if (json && Array.isArray(json.sellerMonthlyData)) {
            json.sellerMonthlyData = json.sellerMonthlyData.filter((s: SellerMonthItem) => !isExcludedVolumeSeller(s.vendedor));
          }
          setData(json);
        }
      } catch (err) {
        console.error('Failed to load sellers monthly volume:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Available months present in data sorted chronologically
  const sortedMonths = useMemo(() => {
    if (!data?.monthlyTotals) return [];
    return [...data.monthlyTotals]
      .map((m) => m.mes)
      .sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  }, [data]);

  // Default selection: last 2 available months (to easily compare current with previous month)
  useEffect(() => {
    if (sortedMonths.length > 0 && selectedMonths.length === 0) {
      if (sortedMonths.length >= 2) {
        setSelectedMonths([
          sortedMonths[sortedMonths.length - 2],
          sortedMonths[sortedMonths.length - 1],
        ]);
      } else {
        setSelectedMonths([sortedMonths[sortedMonths.length - 1]]);
      }
    }
  }, [sortedMonths, selectedMonths.length]);

  // Trigger Supabase and Google Sheet full re-sync
  const handleSyncWithSupabase = async () => {
    setIsSyncing(true);
    setSyncMessage('Sincronizando con Google Sheet y Supabase...');
    try {
      await syncVolumeQuotasFromGoogleSheet();
      const res = await fetch('/api/sync-sellers-monthly-volume', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.sellerMonthlyData)) {
          json.sellerMonthlyData = json.sellerMonthlyData.filter((s: SellerMonthItem) => !isExcludedVolumeSeller(s.vendedor));
        }
        setData(json);
        setSyncMessage(`¡Sincronizado! ${json.totalSourceRows?.toLocaleString()} transacciones procesadas.`);
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage('Error al sincronizar con Supabase');
      }
    } catch (e: any) {
      console.error(e);
      setSyncMessage('Fallo de conexión al sincronizar');
    } finally {
      setIsSyncing(false);
    }
  };

  // Selected months sorted chronologically
  const sortedSelectedMonths = useMemo(() => {
    return [...selectedMonths].sort(
      (a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b)
    );
  }, [selectedMonths]);

  // Multiselect toggle handlers
  const handleToggleMonth = (month: string) => {
    setSelectedMonths((prev) => {
      if (prev.includes(month)) {
        // Keep at least one month selected
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== month);
      } else {
        return [...prev, month];
      }
    });
  };

  const handleSelectLastTwo = () => {
    if (sortedMonths.length >= 2) {
      setSelectedMonths([
        sortedMonths[sortedMonths.length - 2],
        sortedMonths[sortedMonths.length - 1],
      ]);
    } else if (sortedMonths.length === 1) {
      setSelectedMonths([sortedMonths[0]]);
    }
  };

  const handleSelectLatest = () => {
    if (sortedMonths.length > 0) {
      setSelectedMonths([sortedMonths[sortedMonths.length - 1]]);
    }
  };

  const handleSelectAll = () => {
    setSelectedMonths([...sortedMonths]);
  };

  // Identification of previous and current comparison months
  const comparisonInfo = useMemo(() => {
    if (sortedSelectedMonths.length >= 2) {
      const prevMonth = sortedSelectedMonths[sortedSelectedMonths.length - 2];
      const currMonth = sortedSelectedMonths[sortedSelectedMonths.length - 1];
      return {
        hasComparison: true,
        prevMonth,
        currMonth,
        label: `Comparando ${currMonth} vs ${prevMonth} (Mes Anterior)`,
      };
    } else if (sortedSelectedMonths.length === 1) {
      const currMonth = sortedSelectedMonths[0];
      const currIdx = sortedMonths.indexOf(currMonth);
      const prevMonth = currIdx > 0 ? sortedMonths[currIdx - 1] : null;
      return {
        hasComparison: Boolean(prevMonth),
        prevMonth,
        currMonth,
        label: prevMonth
          ? `Comparando ${currMonth} vs ${prevMonth} (Calendario)`
          : `Mes seleccionado: ${currMonth}`,
      };
    }
    return {
      hasComparison: false,
      prevMonth: null,
      currMonth: null,
      label: 'Sin meses seleccionados',
    };
  }, [sortedSelectedMonths, sortedMonths]);

  // Unique list of supervisors
  const supervisorsList = useMemo(() => {
    const set = new Set<string>(OFFICIAL_SUPERVISORS);
    if (data?.sellerMonthlyData) {
      data.sellerMonthlyData.forEach((s) => {
        if (isExcludedVolumeSeller(s.vendedor)) return;
        const meta = getSellerMetadata(s.vendedor);
        set.add(meta.supervisor);
      });
    }
    return Array.from(set).sort();
  }, [data]);

  // Vendedores disponibles filtrados automáticamente según el supervisor seleccionado
  const availableSellers = useMemo<SellerOption[]>(() => {
    const map = new Map<string, SellerOption>();
    OFFICIAL_SELLERS_LIST.forEach((vendedor) => {
      const meta = getSellerMetadata(vendedor);
      if (supervisorFilter !== 'ALL' && meta.supervisor !== supervisorFilter) return;
      map.set(vendedor, {
        name: vendedor,
        supervisor: meta.supervisor,
        zona: meta.zona,
      });
    });
    if (data?.sellerMonthlyData) {
      data.sellerMonthlyData.forEach((s) => {
        if (isExcludedVolumeSeller(s.vendedor)) return;
        const meta = getSellerMetadata(s.vendedor);
        const normName = normalizeSellerName(s.vendedor);
        if (supervisorFilter !== 'ALL' && meta.supervisor !== supervisorFilter) {
          return;
        }
        if (!map.has(normName)) {
          map.set(normName, {
            name: normName,
            supervisor: meta.supervisor,
            zona: meta.zona,
          });
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, supervisorFilter]);

  // Sincronización automática: al cambiar el supervisor, limpiar los vendedores que no correspondan
  useEffect(() => {
    if (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
      const availableNames = new Set(availableSellers.map((s) => s.name));
      const validSelected = selectedSellers.filter((name) => availableNames.has(name));
      if (validSelected.length !== selectedSellers.length) {
        setSelectedSellers(validSelected);
      }
    }
  }, [supervisorFilter, availableSellers]);

  // Helper to extract value according to metric
  const getMetricValue = (
    item: { cajas: number; monto: number; kgs: number } | undefined,
    type: MetricType = metric
  ) => {
    if (!item) return 0;
    if (type === 'monto') return item.monto;
    if (type === 'cajas') return item.cajas;
    return item.kgs;
  };

  const formatValue = (val: number, type: MetricType = metric) => {
    if (val === undefined || isNaN(val)) return '0';
    if (type === 'monto') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(val);
    }
    if (type === 'cajas') {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
      }).format(Math.round(val)) + ' cj';
    }
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Math.round(val)) + ' kg';
  };

  const formatDiff = (diff: number, type: MetricType = metric) => {
    if (diff === 0) return '0';
    const sign = diff > 0 ? '+' : '';
    return sign + formatValue(diff, type);
  };

  const renderPctBadge = (pct: number, isNew: boolean = false) => {
    if (isNew) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
          <ArrowUpRight className="w-3 h-3" /> Nuevo
        </span>
      );
    }
    if (pct > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
          <ArrowUpRight className="w-3 h-3" /> +{pct.toFixed(1)}%
        </span>
      );
    }
    if (pct < 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
          <ArrowDownRight className="w-3 h-3" /> {pct.toFixed(1)}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 font-mono">
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  };

  // Seller grouped monthly records
  const sellerRows = useMemo(() => {
    if (!data?.sellerMonthlyData) return [];

    const grouped: Record<
      string,
      {
        vendedor: string;
        supervisor: string;
        zona: string;
        region: string;
        months: Record<string, { cajas: number; monto: number; kgs: number; montoFA: number; montoDV: number }>;
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

    data.sellerMonthlyData.forEach((row) => {
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
        existingMonth.montoFA += row.montoFA || 0;
        existingMonth.montoDV += row.montoDV || 0;
      } else {
        grouped[normVendedor].months[row.mes] = {
          cajas: row.cajas,
          monto: row.montoNeto,
          kgs: row.kgs,
          montoFA: row.montoFA || 0,
          montoDV: row.montoDV || 0,
        };
      }

      grouped[normVendedor].totalCajas += row.cajas;
      grouped[normVendedor].totalMonto += row.montoNeto;
      grouped[normVendedor].totalKgs += row.kgs;
    });

    let list = Object.values(grouped);

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.vendedor.toLowerCase().includes(term) ||
          s.supervisor.toLowerCase().includes(term) ||
          s.zona.toLowerCase().includes(term)
      );
    }

    // Apply supervisor filter
    if (supervisorFilter !== 'ALL') {
      list = list.filter((s) => s.supervisor === supervisorFilter);
    }

    // Apply seller multiselect filter
    if (selectedSellers.length === 1 && selectedSellers[0] === '__NONE__') {
      list = [];
    } else if (selectedSellers.length > 0) {
      list = list.filter((s) => selectedSellers.includes(s.vendedor));
    }

    // Sort by current selected comparison month or total selected descending
    list.sort((a, b) => {
      const activeMonth = comparisonInfo.currMonth || sortedSelectedMonths[sortedSelectedMonths.length - 1];
      const valA = activeMonth && a.months[activeMonth] ? getMetricValue(a.months[activeMonth], metric) : a.totalCajas;
      const valB = activeMonth && b.months[activeMonth] ? getMetricValue(b.months[activeMonth], metric) : b.totalCajas;
      return valB - valA;
    });

    return list;
  }, [data, searchTerm, supervisorFilter, selectedSellers, metric, comparisonInfo.currMonth, sortedSelectedMonths]);

  // Consolidated by Supervisor
  const supervisorRows = useMemo(() => {
    const grouped: Record<
      string,
      {
        supervisor: string;
        region: string;
        sellersCount: number;
        sellers: typeof sellerRows;
        months: Record<string, { cajas: number; monto: number; kgs: number }>;
        totalCajas: number;
        totalMonto: number;
        totalKgs: number;
      }
    > = {};

    sellerRows.forEach((s) => {
      if (!grouped[s.supervisor]) {
        grouped[s.supervisor] = {
          supervisor: s.supervisor,
          region: s.region,
          sellersCount: 0,
          sellers: [],
          months: {},
          totalCajas: 0,
          totalMonto: 0,
          totalKgs: 0,
        };
      }
      grouped[s.supervisor].sellersCount += 1;
      grouped[s.supervisor].sellers.push(s);
      grouped[s.supervisor].totalCajas += s.totalCajas;
      grouped[s.supervisor].totalMonto += s.totalMonto;
      grouped[s.supervisor].totalKgs += s.totalKgs;

      sortedMonths.forEach((m) => {
        if (!grouped[s.supervisor].months[m]) {
          grouped[s.supervisor].months[m] = { cajas: 0, monto: 0, kgs: 0 };
        }
        const mData = s.months[m];
        if (mData) {
          grouped[s.supervisor].months[m].cajas += mData.cajas;
          grouped[s.supervisor].months[m].monto += mData.monto;
          grouped[s.supervisor].months[m].kgs += mData.kgs;
        }
      });
    });

    return Object.values(grouped).sort((a, b) => {
      const activeMonth = comparisonInfo.currMonth || sortedSelectedMonths[sortedSelectedMonths.length - 1];
      const valA = activeMonth && a.months[activeMonth] ? getMetricValue(a.months[activeMonth], metric) : a.totalCajas;
      const valB = activeMonth && b.months[activeMonth] ? getMetricValue(b.months[activeMonth], metric) : b.totalCajas;
      return valB - valA;
    });
  }, [sellerRows, sortedMonths, metric, comparisonInfo.currMonth, sortedSelectedMonths]);

  // Consolidated by Region
  const regionRows = useMemo(() => {
    const grouped: Record<
      string,
      {
        region: string;
        supervisorsCount: number;
        sellersCount: number;
        months: Record<string, { cajas: number; monto: number; kgs: number }>;
        totalCajas: number;
        totalMonto: number;
        totalKgs: number;
      }
    > = {};

    const supervisorsPerRegion: Record<string, Set<string>> = {};

    sellerRows.forEach((s) => {
      if (!grouped[s.region]) {
        grouped[s.region] = {
          region: s.region,
          supervisorsCount: 0,
          sellersCount: 0,
          months: {},
          totalCajas: 0,
          totalMonto: 0,
          totalKgs: 0,
        };
        supervisorsPerRegion[s.region] = new Set();
      }

      supervisorsPerRegion[s.region].add(s.supervisor);
      grouped[s.region].sellersCount += 1;
      grouped[s.region].totalCajas += s.totalCajas;
      grouped[s.region].totalMonto += s.totalMonto;
      grouped[s.region].totalKgs += s.totalKgs;

      sortedMonths.forEach((m) => {
        if (!grouped[s.region].months[m]) {
          grouped[s.region].months[m] = { cajas: 0, monto: 0, kgs: 0 };
        }
        const mData = s.months[m];
        if (mData) {
          grouped[s.region].months[m].cajas += mData.cajas;
          grouped[s.region].months[m].monto += mData.monto;
          grouped[s.region].months[m].kgs += mData.kgs;
        }
      });
    });

    Object.keys(grouped).forEach((r) => {
      grouped[r].supervisorsCount = supervisorsPerRegion[r]?.size || 0;
    });

    return Object.values(grouped).sort((a, b) => {
      const activeMonth = comparisonInfo.currMonth || sortedSelectedMonths[sortedSelectedMonths.length - 1];
      const valA = activeMonth && a.months[activeMonth] ? getMetricValue(a.months[activeMonth], metric) : a.totalCajas;
      const valB = activeMonth && b.months[activeMonth] ? getMetricValue(b.months[activeMonth], metric) : b.totalCajas;
      return valB - valA;
    });
  }, [sellerRows, sortedMonths, metric, comparisonInfo.currMonth, sortedSelectedMonths]);

  // Overall footer calculations for filtered rows and selected months
  const footerTotals = useMemo(() => {
    const monthTotals: Record<string, number> = {};
    sortedSelectedMonths.forEach((m) => {
      monthTotals[m] = 0;
    });

    sellerRows.forEach((row) => {
      sortedSelectedMonths.forEach((m) => {
        const item = row.months[m];
        if (item) {
          monthTotals[m] += getMetricValue(item, metric);
        }
      });
    });

    let diff = 0;
    let pct = 0;
    let isNew = false;

    if (comparisonInfo.hasComparison && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
      const currTotal = monthTotals[comparisonInfo.currMonth] || 0;
      const prevTotal = monthTotals[comparisonInfo.prevMonth] || 0;
      diff = currTotal - prevTotal;
      if (prevTotal === 0 && currTotal > 0) {
        pct = 100;
        isNew = true;
      } else if (prevTotal > 0) {
        pct = ((currTotal - prevTotal) / prevTotal) * 100;
      }
    }

    return {
      monthTotals,
      diff,
      pct,
      isNew,
    };
  }, [sellerRows, sortedSelectedMonths, metric, comparisonInfo]);

  // Export PDF
  const handleExportPDF = async () => {
    if (!data || isExportingPDF) return;
    try {
      setIsExportingPDF(true);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const monthsToExport = sortedSelectedMonths.length > 0 ? sortedSelectedMonths : sortedMonths;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const metricLabel = metric === 'cajas' ? 'Bultos (Cajas)' : metric === 'kgs' ? 'Kilos (Kg)' : 'Ventas Netas ($ USD)';
      const viewLabel = viewLevel === 'vendedor' ? 'Detalle por Vendedor' : viewLevel === 'supervisores' ? 'Consolidado por Supervisor' : 'Consolidado por Región';
      const supervisorText = supervisorFilter !== 'ALL' ? `Supervisor: ${supervisorFilter}` : 'Todos los Supervisores';
      const sellersFilterText =
        selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__'
          ? ` | Vendedores (${selectedSellers.length}): ${selectedSellers.slice(0, 3).join(', ')}${selectedSellers.length > 3 ? '...' : ''}`
          : '';
      const searchFilterText = searchTerm.trim() ? ` | Búsqueda: "${searchTerm.trim()}"` : '';
      const fechaHora = new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });

      // Header Banner Codizulca
      doc.setFillColor(220, 38, 38);
      doc.rect(14, 10, 3.5, 13, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text('CODIZULCA - REPORTE DE VENTAS POR VOLUMEN', 21, 15.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Año: ${data?.ano || 2026}  |  Métrica: ${metricLabel}  |  Vista: ${viewLabel}  |  ${supervisorText}${sellersFilterText}${searchFilterText}`,
        21,
        21
      );

      doc.setFontSize(7.5);
      doc.text(`Generado: ${fechaHora}`, doc.internal.pageSize.width - 14, 15.5, { align: 'right' });
      if (comparisonInfo.hasComparison && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
        doc.text(`Comparativa: ${comparisonInfo.currMonth} vs ${comparisonInfo.prevMonth}`, doc.internal.pageSize.width - 14, 21, { align: 'right' });
      }

      const hasComp = Boolean(comparisonInfo.hasComparison && comparisonInfo.currMonth && comparisonInfo.prevMonth);
      const showTotalCol = !hasComp || monthsToExport.length > 2;

      // Table Headers
      const headRow: string[] = [];
      if (viewLevel === 'vendedor') {
        headRow.push('VENDEDOR', 'SUPERVISOR', 'ZONA');
      } else if (viewLevel === 'supervisores') {
        headRow.push('SUPERVISOR / VENDEDOR', 'REGIÓN / ZONA', 'VEND.');
      } else {
        headRow.push('REGIÓN', 'SUPERV.', 'VEND.');
      }

      monthsToExport.forEach((m) => {
        headRow.push(SHORT_MONTHS[m] || m.toUpperCase());
      });

      if (hasComp) {
        headRow.push(`DIF. (${comparisonInfo.currMonth?.slice(0, 3)} vs ${comparisonInfo.prevMonth?.slice(0, 3)})`, 'VAR %');
      }
      if (showTotalCol) {
        headRow.push('TOTAL PERÍODO');
      }

      // Helper number formatter
      const formatVal = (val: number) => {
        if (metric === 'monto') {
          return '$' + Math.round(val).toLocaleString('es-VE');
        }
        return Math.round(val).toLocaleString('es-VE');
      };

      // Table Body
      const bodyRows: any[][] = [];

      if (viewLevel === 'vendedor') {
        sellerRows.forEach((s) => {
          const row: any[] = [s.vendedor, s.supervisor, s.zona];
          monthsToExport.forEach((m) => {
            const item = s.months[m];
            row.push(item ? formatVal(getMetricValue(item, metric)) : '0');
          });

          if (hasComp && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
            const valPrev = s.months[comparisonInfo.prevMonth] ? getMetricValue(s.months[comparisonInfo.prevMonth], metric) : 0;
            const valCurr = s.months[comparisonInfo.currMonth] ? getMetricValue(s.months[comparisonInfo.currMonth], metric) : 0;
            const d = valCurr - valPrev;
            const p = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : (valCurr > 0 ? 100 : 0);
            row.push((d > 0 ? '+' : '') + formatVal(d), (p > 0 ? '+' : '') + p.toFixed(1) + '%');
          }
          if (showTotalCol) {
            const total = monthsToExport.reduce((acc, m) => acc + (s.months[m] ? getMetricValue(s.months[m], metric) : 0), 0);
            row.push(formatVal(total));
          }
          bodyRows.push(row);
        });
      } else if (viewLevel === 'supervisores') {
        supervisorRows.forEach((s) => {
          const row: any[] = [s.supervisor, s.region || '-', s.sellersCount];
          monthsToExport.forEach((m) => {
            const item = s.months[m];
            row.push(item ? formatVal(getMetricValue(item, metric)) : '0');
          });

          if (hasComp && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
            const valPrev = s.months[comparisonInfo.prevMonth] ? getMetricValue(s.months[comparisonInfo.prevMonth], metric) : 0;
            const valCurr = s.months[comparisonInfo.currMonth] ? getMetricValue(s.months[comparisonInfo.currMonth], metric) : 0;
            const d = valCurr - valPrev;
            const p = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : (valCurr > 0 ? 100 : 0);
            row.push((d > 0 ? '+' : '') + formatVal(d), (p > 0 ? '+' : '') + p.toFixed(1) + '%');
          }
          if (showTotalCol) {
            const total = monthsToExport.reduce((acc, m) => acc + (s.months[m] ? getMetricValue(s.months[m], metric) : 0), 0);
            row.push(formatVal(total));
          }
          bodyRows.push(row);

          const includeSellers =
            expandedSupervisors.has(s.supervisor) ||
            supervisorFilter !== 'ALL' ||
            selectedSellers.length > 0 ||
            searchTerm.trim().length > 0;

          if (includeSellers && s.sellers && s.sellers.length > 0) {
            s.sellers.forEach((seller, sIdx) => {
              const sRow: any[] = [`   -> ${seller.vendedor}`, seller.zona || '-', `#${sIdx + 1}`];
              monthsToExport.forEach((m) => {
                const item = seller.months[m];
                sRow.push(item ? formatVal(getMetricValue(item, metric)) : '0');
              });

              if (hasComp && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
                const valPrev = seller.months[comparisonInfo.prevMonth]
                  ? getMetricValue(seller.months[comparisonInfo.prevMonth], metric)
                  : 0;
                const valCurr = seller.months[comparisonInfo.currMonth]
                  ? getMetricValue(seller.months[comparisonInfo.currMonth], metric)
                  : 0;
                const d = valCurr - valPrev;
                const p = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : valCurr > 0 ? 100 : 0;
                sRow.push((d > 0 ? '+' : '') + formatVal(d), (p > 0 ? '+' : '') + p.toFixed(1) + '%');
              }
              if (showTotalCol) {
                const total = monthsToExport.reduce(
                  (acc, m) => acc + (seller.months[m] ? getMetricValue(seller.months[m], metric) : 0),
                  0
                );
                sRow.push(formatVal(total));
              }
              bodyRows.push(sRow);
            });
          }
        });
      } else {
        regionRows.forEach((r) => {
          const row: any[] = [r.region || 'Sin Región', r.supervisorsCount, r.sellersCount];
          monthsToExport.forEach((m) => {
            const item = r.months[m];
            row.push(item ? formatVal(getMetricValue(item, metric)) : '0');
          });

          if (hasComp && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
            const valPrev = r.months[comparisonInfo.prevMonth] ? getMetricValue(r.months[comparisonInfo.prevMonth], metric) : 0;
            const valCurr = r.months[comparisonInfo.currMonth] ? getMetricValue(r.months[comparisonInfo.currMonth], metric) : 0;
            const d = valCurr - valPrev;
            const p = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : (valCurr > 0 ? 100 : 0);
            row.push((d > 0 ? '+' : '') + formatVal(d), (p > 0 ? '+' : '') + p.toFixed(1) + '%');
          }
          if (showTotalCol) {
            const total = monthsToExport.reduce((acc, m) => acc + (r.months[m] ? getMetricValue(r.months[m], metric) : 0), 0);
            row.push(formatVal(total));
          }
          bodyRows.push(row);
        });
      }

      // Footer row
      const footRow: any[] = ['TOTAL GENERAL', '', ''];
      monthsToExport.forEach((m) => {
        const tot = footerTotals.monthTotals[m] || 0;
        footRow.push(formatVal(tot));
      });
      if (hasComp) {
        const d = footerTotals.diff;
        const p = footerTotals.pct;
        footRow.push((d > 0 ? '+' : '') + formatVal(d), (p > 0 ? '+' : '') + p.toFixed(1) + '%');
      }
      if (showTotalCol) {
        const overall = monthsToExport.reduce((acc, m) => acc + (footerTotals.monthTotals[m] || 0), 0);
        footRow.push(formatVal(overall));
      }

      // Column alignment configuration
      const columnStyles: Record<number, any> = {
        0: { halign: 'left', fontStyle: 'bold' },
        1: { halign: 'left' },
        2: { halign: viewLevel === 'vendedor' ? 'left' : 'center' },
      };
      for (let i = 3; i < headRow.length; i++) {
        columnStyles[i] = { halign: 'right' };
      }

      autoTable(doc, {
        startY: 25,
        head: [headRow],
        body: bodyRows,
        foot: [footRow],
        theme: 'grid',
        styles: {
          fontSize: monthsToExport.length > 6 ? 6.5 : 7.5,
          cellPadding: 1.5,
          overflow: 'linebreak',
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: monthsToExport.length > 6 ? 6.5 : 7.5,
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: monthsToExport.length > 6 ? 7 : 8,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles,
        didParseCell: (dataCell) => {
          if (dataCell.section === 'body' && viewLevel === 'supervisores') {
            const firstCell = String((dataCell.row.raw as any[])?.[0] || '');
            if (!firstCell.startsWith('   ->')) {
              dataCell.cell.styles.fillColor = [226, 232, 240];
              dataCell.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: (dataInfo) => {
          const str = `Página ${dataInfo.pageNumber} de ${doc.getNumberOfPages()}`;
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text('Codizulca C.A. - Documento Confidencial de Gestión Comercial', 14, doc.internal.pageSize.height - 7);
          doc.text(str, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 7, { align: 'right' });
        },
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`Codizulca_Ventas_Volumen_${metric.toUpperCase()}_${viewLevel}_${dateStr}.pdf`);
    } catch (err) {
      console.error('Error generando PDF:', err);
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

  // Export CSV
  const handleExportCSV = () => {
    if (!data) return;
    const monthsToExport = sortedSelectedMonths.length > 0 ? sortedSelectedMonths : sortedMonths;
    let csv = `VENDEDOR,SUPERVISOR,ZONA,REGION,METRICA,${monthsToExport.join(',')}`;
    if (comparisonInfo.hasComparison && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
      csv += `,DIFERENCIA (${comparisonInfo.currMonth} vs ${comparisonInfo.prevMonth}),VARIACION %\n`;
    } else {
      csv += `,TOTAL PERIODO\n`;
    }

    sellerRows.forEach((s) => {
      const monthValues = monthsToExport.map((m) => {
        const item = s.months[m];
        return item ? Math.round(getMetricValue(item, metric)) : 0;
      });

      let extraCols = '';
      if (comparisonInfo.hasComparison && comparisonInfo.currMonth && comparisonInfo.prevMonth) {
        const valPrev = s.months[comparisonInfo.prevMonth] ? getMetricValue(s.months[comparisonInfo.prevMonth], metric) : 0;
        const valCurr = s.months[comparisonInfo.currMonth] ? getMetricValue(s.months[comparisonInfo.currMonth], metric) : 0;
        const d = valCurr - valPrev;
        const p = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : 0;
        extraCols = `,${Math.round(d)},${p.toFixed(1)}%`;
      } else {
        const total = monthsToExport.reduce((acc, m) => acc + (s.months[m] ? getMetricValue(s.months[m], metric) : 0), 0);
        extraCols = `,${Math.round(total)}`;
      }

      csv += `"${s.vendedor}","${s.supervisor}","${s.zona}","${s.region}","${metric.toUpperCase()}",${monthValues.join(',')}${extraCols}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ventas_Volumen_${metric.toUpperCase()}_Comparativa_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* 1. HEADER COMPACTO: Título y Sincronización Supabase */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950/70 border border-white/10 rounded-xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-600/10 border border-red-500/20 text-red-500">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <span>Ventas por Volumen por Mes</span>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-zinc-300 font-mono">
                Año {data?.ano || 2026}
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
              <span>{comparisonInfo.label}</span>
              {comparisonInfo.hasComparison && (
                <span className="text-zinc-500">• Variación vs mes anterior calculada automáticamente</span>
              )}
            </p>
          </div>
        </div>

        {/* Supabase status and Sync button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenSkuVolume && (
            <button
              type="button"
              onClick={onOpenSkuVolume}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-black shadow-md transition-all cursor-pointer"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Ver Volumen por SKU (Todos los Productos)</span>
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono">{data?.totalSourceRows?.toLocaleString() || '280,000'}</span>
            <span className="text-zinc-500">transacciones (Supabase + Sheets)</span>
          </div>

          <button
            type="button"
            onClick={handleSyncWithSupabase}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-zinc-200 transition-all active:scale-95 disabled:opacity-50"
            title="Sincronizar historial con Supabase y Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-red-500' : 'text-zinc-400'}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Datos'}</span>
          </button>
        </div>
      </div>

      {/* Sync Status Toast Banner */}
      {syncMessage && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3 flex items-center gap-2 text-xs text-emerald-300 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* 2. ANÁLISIS COMPARATIVO LADO A LADO Y MÉTRICAS DE VOLUMEN (CONSOLIDADO DE SUPERVISORES) */}
      <SupervisorVolumeComparativeAnalysis
        sellerRows={sellerRows}
        supervisorRows={supervisorRows}
        metric={metric}
        selectedMonth={comparisonInfo.currMonth || 'OCTUBRE'}
        diasLaborables={diasLaborables}
        diasTranscurridos={diasTranscurridos}
        rawSellerMonthlyData={data?.sellerMonthlyData || []}
        availableMonths={sortedMonths}
        onOpenSellerHistory={(sellerName) => setHistoryModalSeller(sellerName)}
      />

      {/* 3. FILTRO MULTISELECCIÓN DE MESES DEL AÑO */}
      <div className="bg-zinc-950/80 border border-white/10 rounded-xl p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Filtro de Meses del Año (Multiselección):
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-600/20 text-red-400 font-bold border border-red-500/20">
              {selectedMonths.length} {selectedMonths.length === 1 ? 'mes seleccionado' : 'meses seleccionados'}
            </span>
          </div>

          {/* Quick Filter Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-zinc-500 text-[11px] hidden sm:inline mr-1">Preajustes:</span>
            <button
              type="button"
              onClick={handleSelectLastTwo}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                selectedMonths.length === 2 &&
                sortedMonths.length >= 2 &&
                selectedMonths.includes(sortedMonths[sortedMonths.length - 1]) &&
                selectedMonths.includes(sortedMonths[sortedMonths.length - 2])
                  ? 'bg-red-600 text-white shadow'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10'
              }`}
            >
              Comparar últimos 2 meses
            </button>
            <button
              type="button"
              onClick={handleSelectLatest}
              className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs font-medium transition-all"
            >
              Último mes
            </button>
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs font-medium transition-all"
            >
              Todo el año
            </button>
          </div>
        </div>

        {/* Meses en botones toggle multiselección */}
        <div className="flex flex-wrap gap-2 pt-1">
          {MONTH_ORDER.map((month) => {
            const hasData = sortedMonths.includes(month);
            const isSelected = selectedMonths.includes(month);

            if (!hasData) {
              return (
                <div
                  key={month}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-zinc-600 bg-zinc-950/40 border border-white/5 opacity-40 cursor-not-allowed select-none"
                  title={`${month}: Sin transacciones aún en ${data?.ano || 2026}`}
                >
                  {SHORT_MONTHS[month] || month}
                </div>
              );
            }

            return (
              <button
                key={month}
                type="button"
                onClick={() => handleToggleMonth(month)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 active:scale-95 ${
                  isSelected
                    ? 'bg-red-600 text-white shadow-lg shadow-red-950/50 border border-red-400 ring-1 ring-white/20'
                    : 'bg-zinc-900/90 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/10'
                }`}
                title={`Click para ${isSelected ? 'quitar' : 'agregar'} ${month}`}
              >
                {isSelected ? (
                  <Check className="w-3.5 h-3.5 text-white" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                )}
                <span>{SHORT_MONTHS[month] || month}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. BARRA DE HERRAMIENTAS: Métrica, Búsqueda, Filtro Supervisor y Exportar */}
      <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        {/* Selector de Métrica */}
        <div className="inline-flex items-center p-1 bg-black/60 border border-white/10 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setMetric('cajas')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
              metric === 'cajas' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Cajas (cj)</span>
          </button>
          <button
            type="button"
            onClick={() => setMetric('monto')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
              metric === 'monto' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Monto ($)</span>
          </button>
          <button
            type="button"
            onClick={() => setMetric('kgs')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
              metric === 'kgs' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Kgs / Lts</span>
          </button>
        </div>

        {/* Búsqueda, Filtro Supervisor y Exportación */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px] max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar vendedor, supervisor o zona..."
              className="w-full bg-black/60 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
            />
          </div>

          <select
            value={supervisorFilter}
            onChange={(e) => {
              const val = e.target.value;
              setSupervisorFilter(val);
              if (val !== 'ALL') {
                setExpandedSupervisors(new Set([val]));
              }
            }}
            className="bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="ALL">Todos los Supervisores</option>
            {supervisorsList.map((sup) => (
              <option key={sup} value={sup}>
                {sup}
              </option>
            ))}
          </select>

          {/* Menú de Vendedores Multiselección Automático */}
          <SellerMultiSelect
            sellers={availableSellers}
            selectedSellers={selectedSellers}
            onChange={setSelectedSellers}
            supervisorLabel={supervisorFilter !== 'ALL' ? supervisorFilter : undefined}
          />

          <div className="flex items-center gap-1 shrink-0">
            {viewLevel === 'supervisores' && supervisorRows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (expandedSupervisors.size === supervisorRows.length) {
                    setExpandedSupervisors(new Set());
                  } else {
                    setExpandedSupervisors(new Set(supervisorRows.map((s) => s.supervisor)));
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
                title="Expandir o contraer todos los supervisores"
              >
                <ChevronsUpDown className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">
                  {expandedSupervisors.size === supervisorRows.length ? 'Contraer Todos' : 'Desplegar Todos'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExportingPDF || !data}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg text-xs font-medium text-zinc-200 transition-colors shrink-0 shadow-sm hover:border-red-500/40 disabled:opacity-50"
              title="Emitir reporte oficial en PDF"
            >
              <Download className={`w-3.5 h-3.5 text-red-500 ${isExportingPDF ? 'animate-bounce' : ''}`} />
              <span className="hidden sm:inline">{isExportingPDF ? 'Generando PDF...' : 'Exportar PDF'}</span>
              <span className="sm:hidden">{isExportingPDF ? 'PDF...' : 'Exportar'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!data}
              className="px-2 py-1.5 bg-zinc-900/60 hover:bg-zinc-800 border border-white/10 rounded-lg text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              title="Exportar datos a CSV / Excel"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* 4. TABLA DETALLADA CON FILTRO DE MESES Y COMPARATIVA VS MES ANTERIOR */}
      <div className="bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            {/* Encabezados */}
            <thead>
              <tr className="bg-zinc-900/90 text-white border-b border-white/10 text-xs">
                {viewLevel === 'vendedor' && (
                  <>
                    <th className="p-3 font-bold uppercase tracking-wider border-r border-white/10 bg-zinc-900/95 min-w-[190px]">
                      Vendedor
                    </th>
                    <th className="p-3 font-bold uppercase tracking-wider border-r border-white/10 bg-zinc-900/95 min-w-[160px]">
                      Supervisor
                    </th>
                  </>
                )}

                {viewLevel === 'supervisores' && (
                  <>
                    <th className="p-3 font-bold uppercase tracking-wider border-r border-white/10 bg-zinc-900/95 min-w-[220px]">
                      Supervisor
                    </th>
                    <th className="p-3 text-center font-bold uppercase tracking-wider border-r border-white/10 bg-zinc-900/95 min-w-[100px]">
                      Vendedores
                    </th>
                  </>
                )}

                {viewLevel === 'gerente' && (
                  <>
                    <th className="p-3 font-bold uppercase tracking-wider border-r border-white/10 bg-zinc-900/95 min-w-[200px]">
                      Región
                    </th>
                    <th className="p-3 text-center font-bold uppercase tracking-wider border-r border-white/10 bg-zinc-900/95 min-w-[110px]">
                      Supervisores
                    </th>
                  </>
                )}

                {/* Columnas de los Meses Filtrados (Multiselección) */}
                {sortedSelectedMonths.map((m) => (
                  <th
                    key={m}
                    className="p-2.5 text-center font-bold uppercase tracking-wider border-r border-white/10 bg-zinc-900/80 min-w-[100px]"
                  >
                    <div className="flex flex-col items-center">
                      <span>{SHORT_MONTHS[m] || m}</span>
                      <span className="text-[9px] text-zinc-500 font-normal">2026</span>
                    </div>
                  </th>
                ))}

                {/* Si hay 2 o más meses seleccionados, mostrar columnas de comparativa */}
                {comparisonInfo.hasComparison && comparisonInfo.currMonth && comparisonInfo.prevMonth && (
                  <>
                    <th className="p-2.5 text-center font-bold uppercase tracking-wider border-r border-white/10 bg-blue-950/30 text-blue-300 min-w-[115px]">
                      <div className="flex flex-col items-center">
                        <span>Dif (Δ)</span>
                        <span className="text-[9px] text-blue-400 font-normal">
                          {SHORT_MONTHS[comparisonInfo.currMonth]} vs {SHORT_MONTHS[comparisonInfo.prevMonth]}
                        </span>
                      </div>
                    </th>
                    <th className="p-2.5 text-center font-bold uppercase tracking-wider border-r border-white/10 bg-emerald-950/30 text-emerald-300 min-w-[110px]">
                      <div className="flex flex-col items-center">
                        <span>Variación %</span>
                        <span className="text-[9px] text-emerald-400 font-normal">Crecimiento</span>
                      </div>
                    </th>
                  </>
                )}

                {/* Si seleccionó 3 o más meses, agregar columna de Total Período */}
                {sortedSelectedMonths.length > 2 && (
                  <th className="p-2.5 text-center font-bold uppercase tracking-wider bg-red-950/30 text-red-400 min-w-[115px]">
                    Total Período
                  </th>
                )}
              </tr>
            </thead>

            {/* Cuerpo de la tabla */}
            <tbody className="divide-y divide-white/5 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={sortedSelectedMonths.length + 5} className="p-8 text-center text-zinc-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-500" />
                    <span>Cargando datos sincronizados desde Supabase...</span>
                  </td>
                </tr>
              ) : null}

              {/* VISTA 1: POR VENDEDOR */}
              {!isLoading &&
                viewLevel === 'vendedor' &&
                sellerRows.map((row) => {
                  let valPrev = 0;
                  let valCurr = 0;
                  if (comparisonInfo.hasComparison && comparisonInfo.prevMonth && comparisonInfo.currMonth) {
                    valPrev = row.months[comparisonInfo.prevMonth]
                      ? getMetricValue(row.months[comparisonInfo.prevMonth], metric)
                      : 0;
                    valCurr = row.months[comparisonInfo.currMonth]
                      ? getMetricValue(row.months[comparisonInfo.currMonth], metric)
                      : 0;
                  }
                  const diff = valCurr - valPrev;
                  const isNew = valPrev === 0 && valCurr > 0;
                  const pct = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : isNew ? 100 : 0;

                  const periodTotal = sortedSelectedMonths.reduce((acc, m) => {
                    const item = row.months[m];
                    return acc + (item ? getMetricValue(item, metric) : 0);
                  }, 0);

                  return (
                    <tr
                      key={row.vendedor}
                      className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                      onClick={() =>
                        setSelectedSeller(selectedSeller === row.vendedor ? null : row.vendedor)
                      }
                    >
                      <td className="p-3 border-r border-white/10 font-bold text-zinc-200">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span>{row.vendedor}</span>
                            <ChevronRight
                              className={`w-3 h-3 text-zinc-600 transition-transform ${
                                selectedSeller === row.vendedor ? 'rotate-90 text-red-500' : ''
                              }`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHistoryModalSeller(row.vendedor);
                            }}
                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-all text-[10px] font-bold inline-flex items-center gap-1 shadow-sm shrink-0"
                            title={`Ver historial completo de volumen de ${row.vendedor}`}
                          >
                            <TrendingUp className="w-2.5 h-2.5 text-red-400" />
                            <span>Historial</span>
                          </button>
                        </div>
                      </td>

                      <td className="p-3 border-r border-white/10 text-zinc-400 font-medium">
                        {row.supervisor}
                      </td>

                      {/* Celda por cada mes seleccionado */}
                      {sortedSelectedMonths.map((m) => {
                        const mData = row.months[m];
                        const val = mData ? getMetricValue(mData, metric) : 0;
                        return (
                          <td
                            key={m}
                            className="p-2.5 text-center font-mono border-r border-white/5 text-zinc-300 group-hover:text-white"
                          >
                            {val ? formatValue(val) : <span className="text-zinc-700">-</span>}
                          </td>
                        );
                      })}

                      {/* Columnas de Comparativa vs Mes Anterior */}
                      {comparisonInfo.hasComparison && (
                        <>
                          <td
                            className={`p-2.5 text-center font-mono font-semibold border-r border-white/10 bg-blue-950/10 ${
                              diff > 0
                                ? 'text-emerald-400'
                                : diff < 0
                                ? 'text-rose-400'
                                : 'text-zinc-500'
                            }`}
                          >
                            {formatDiff(diff)}
                          </td>
                          <td className="p-2.5 text-center border-r border-white/10 bg-emerald-950/10">
                            {renderPctBadge(pct, isNew)}
                          </td>
                        </>
                      )}

                      {/* Total del período seleccionado si > 2 meses */}
                      {sortedSelectedMonths.length > 2 && (
                        <td className="p-2.5 text-center font-mono font-bold text-red-400 bg-red-950/20">
                          {formatValue(periodTotal)}
                        </td>
                      )}
                    </tr>
                  );
                })}

              {/* VISTA 2: CONSOLIDADO POR SUPERVISOR */}
              {!isLoading &&
                viewLevel === 'supervisores' &&
                supervisorRows.map((row) => {
                  let valPrev = 0;
                  let valCurr = 0;
                  if (comparisonInfo.hasComparison && comparisonInfo.prevMonth && comparisonInfo.currMonth) {
                    valPrev = row.months[comparisonInfo.prevMonth]
                      ? getMetricValue(row.months[comparisonInfo.prevMonth], metric)
                      : 0;
                    valCurr = row.months[comparisonInfo.currMonth]
                      ? getMetricValue(row.months[comparisonInfo.currMonth], metric)
                      : 0;
                  }
                  const diff = valCurr - valPrev;
                  const isNew = valPrev === 0 && valCurr > 0;
                  const pct = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : isNew ? 100 : 0;

                  const periodTotal = sortedSelectedMonths.reduce((acc, m) => {
                    const item = row.months[m];
                    return acc + (item ? getMetricValue(item, metric) : 0);
                  }, 0);

                  const isExpanded = expandedSupervisors.has(row.supervisor);

                  return (
                    <React.Fragment key={row.supervisor}>
                      <tr
                        onClick={() => toggleSupervisorExpand(row.supervisor)}
                        className={`cursor-pointer transition-colors border-b border-white/5 select-none ${
                          isExpanded
                            ? 'bg-zinc-900/90 hover:bg-zinc-850/80 border-l-4 border-l-red-500'
                            : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <td className="p-3 border-r border-white/10 font-bold text-zinc-200">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSupervisorExpand(row.supervisor);
                              }}
                              className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
                                isExpanded
                                  ? 'bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                              }`}
                              title={isExpanded ? 'Contraer vendedores' : 'Desplegar vendedores asignados'}
                            >
                              <ChevronRight
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                              />
                            </button>

                            <div className="flex flex-col">
                              <span className="font-bold text-white text-sm flex items-center gap-2">
                                {row.supervisor}
                                <span className="text-[10px] font-normal text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                                  {isExpanded ? 'Desplegado' : 'Clic para desplegar'}
                                </span>
                              </span>
                              <span className="text-[10px] text-zinc-400 font-normal">
                                {row.region}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 text-center font-mono border-r border-white/10">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                              isExpanded
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : 'bg-zinc-800/80 text-zinc-300 border border-white/10'
                            }`}
                          >
                            <Users className="w-3 h-3" />
                            {row.sellersCount}
                          </span>
                        </td>

                        {/* Celdas mensuales */}
                        {sortedSelectedMonths.map((m) => {
                          const mData = row.months[m];
                          const val = mData ? getMetricValue(mData, metric) : 0;
                          return (
                            <td
                              key={m}
                              className="p-2.5 text-center font-mono border-r border-white/5 text-zinc-200 font-bold"
                            >
                              {val ? formatValue(val) : <span className="text-zinc-700">-</span>}
                            </td>
                          );
                        })}

                        {/* Comparativa */}
                        {comparisonInfo.hasComparison && (
                          <>
                            <td
                              className={`p-2.5 text-center font-mono font-bold border-r border-white/10 bg-blue-950/10 ${
                                diff > 0
                                  ? 'text-emerald-400'
                                  : diff < 0
                                  ? 'text-rose-400'
                                  : 'text-zinc-500'
                              }`}
                            >
                              {formatDiff(diff)}
                            </td>
                            <td className="p-2.5 text-center border-r border-white/10 bg-emerald-950/10 font-bold">
                              {renderPctBadge(pct, isNew)}
                            </td>
                          </>
                        )}

                        {sortedSelectedMonths.length > 2 && (
                          <td className="p-2.5 text-center font-mono font-black text-red-400 bg-red-950/20">
                            {formatValue(periodTotal)}
                          </td>
                        )}
                      </tr>

                      {/* Desglose de Vendedores Asignados al Supervisor */}
                      {isExpanded &&
                        row.sellers.map((seller, sIdx) => {
                          let sValPrev = 0;
                          let sValCurr = 0;
                          if (comparisonInfo.hasComparison && comparisonInfo.prevMonth && comparisonInfo.currMonth) {
                            sValPrev = seller.months[comparisonInfo.prevMonth]
                              ? getMetricValue(seller.months[comparisonInfo.prevMonth], metric)
                              : 0;
                            sValCurr = seller.months[comparisonInfo.currMonth]
                              ? getMetricValue(seller.months[comparisonInfo.currMonth], metric)
                              : 0;
                          }
                          const sDiff = sValCurr - sValPrev;
                          const sIsNew = sValPrev === 0 && sValCurr > 0;
                          const sPct = sValPrev > 0 ? ((sValCurr - sValPrev) / sValPrev) * 100 : sIsNew ? 100 : 0;
                          const sPeriodTotal = sortedSelectedMonths.reduce((acc, m) => {
                            const item = seller.months[m];
                            return acc + (item ? getMetricValue(item, metric) : 0);
                          }, 0);

                          return (
                            <tr
                              key={seller.vendedor}
                              className="bg-zinc-950/85 hover:bg-zinc-900/60 transition-colors border-b border-white/5 text-xs"
                            >
                              <td className="py-2.5 pl-10 pr-3 border-r border-white/10">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-red-400 font-mono text-xs select-none">
                                      ↳
                                    </span>
                                    <span className="font-semibold text-zinc-200">
                                      {seller.vendedor}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHistoryModalSeller(seller.vendedor);
                                    }}
                                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-all text-[10px] font-bold inline-flex items-center gap-1 shadow-sm shrink-0"
                                    title={`Ver historial completo de volumen de ${seller.vendedor}`}
                                  >
                                    <TrendingUp className="w-2.5 h-2.5 text-red-400" />
                                    <span>Historial</span>
                                  </button>
                                </div>
                              </td>

                              <td className="py-2.5 px-2 border-r border-white/10 text-center font-mono text-zinc-400 text-[11px]">
                                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/5 text-zinc-400">
                                  #{sIdx + 1}
                                </span>
                              </td>

                              {sortedSelectedMonths.map((m) => {
                                const mData = seller.months[m];
                                const val = mData ? getMetricValue(mData, metric) : 0;
                                return (
                                  <td
                                    key={m}
                                    className="p-2 text-center font-mono border-r border-white/5 text-zinc-300 text-xs"
                                  >
                                    {val ? formatValue(val) : <span className="text-zinc-700">-</span>}
                                  </td>
                                );
                              })}

                              {comparisonInfo.hasComparison && (
                                <>
                                  <td
                                    className={`p-2 text-center font-mono text-xs border-r border-white/10 bg-blue-950/5 ${
                                      sDiff > 0
                                        ? 'text-emerald-400'
                                        : sDiff < 0
                                        ? 'text-rose-400'
                                        : 'text-zinc-500'
                                    }`}
                                  >
                                    {formatDiff(sDiff)}
                                  </td>
                                  <td className="p-2 text-center border-r border-white/10 bg-emerald-950/5 text-xs">
                                    {renderPctBadge(sPct, sIsNew)}
                                  </td>
                                </>
                              )}

                              {sortedSelectedMonths.length > 2 && (
                                <td className="p-2 text-center font-mono font-bold text-red-300 bg-red-950/10 text-xs">
                                  {formatValue(sPeriodTotal)}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}

              {/* VISTA 3: GERENTE REGIONAL */}
              {!isLoading &&
                viewLevel === 'gerente' &&
                regionRows.map((row) => {
                  let valPrev = 0;
                  let valCurr = 0;
                  if (comparisonInfo.hasComparison && comparisonInfo.prevMonth && comparisonInfo.currMonth) {
                    valPrev = row.months[comparisonInfo.prevMonth]
                      ? getMetricValue(row.months[comparisonInfo.prevMonth], metric)
                      : 0;
                    valCurr = row.months[comparisonInfo.currMonth]
                      ? getMetricValue(row.months[comparisonInfo.currMonth], metric)
                      : 0;
                  }
                  const diff = valCurr - valPrev;
                  const isNew = valPrev === 0 && valCurr > 0;
                  const pct = valPrev > 0 ? ((valCurr - valPrev) / valPrev) * 100 : isNew ? 100 : 0;

                  const periodTotal = sortedSelectedMonths.reduce((acc, m) => {
                    const item = row.months[m];
                    return acc + (item ? getMetricValue(item, metric) : 0);
                  }, 0);

                  return (
                    <tr
                      key={row.region}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="p-3 border-r border-white/10 font-bold text-zinc-200">
                        {row.region}
                      </td>

                      <td className="p-3 text-center font-mono text-zinc-400 border-r border-white/10">
                        {row.supervisorsCount}
                      </td>

                      {sortedSelectedMonths.map((m) => {
                        const mData = row.months[m];
                        const val = mData ? getMetricValue(mData, metric) : 0;
                        return (
                          <td
                            key={m}
                            className="p-2.5 text-center font-mono border-r border-white/5 text-zinc-300"
                          >
                            {val ? formatValue(val) : <span className="text-zinc-700">-</span>}
                          </td>
                        );
                      })}

                      {comparisonInfo.hasComparison && (
                        <>
                          <td
                            className={`p-2.5 text-center font-mono font-semibold border-r border-white/10 bg-blue-950/10 ${
                              diff > 0
                                ? 'text-emerald-400'
                                : diff < 0
                                ? 'text-rose-400'
                                : 'text-zinc-500'
                            }`}
                          >
                            {formatDiff(diff)}
                          </td>
                          <td className="p-2.5 text-center border-r border-white/10 bg-emerald-950/10">
                            {renderPctBadge(pct, isNew)}
                          </td>
                        </>
                      )}

                      {sortedSelectedMonths.length > 2 && (
                        <td className="p-2.5 text-center font-mono font-bold text-red-400 bg-red-950/20">
                          {formatValue(periodTotal)}
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>

            {/* Footer: Totales Generales de los meses seleccionados y Variación Total */}
            <tfoot>
              <tr className="bg-zinc-900 border-t-2 border-white/20 font-bold text-xs text-white">
                <td
                  colSpan={2}
                  className="p-3 text-right uppercase tracking-wider border-r border-white/10 text-zinc-300 bg-zinc-900/90"
                >
                  TOTAL GENERAL ({sortedSelectedMonths.length} {sortedSelectedMonths.length === 1 ? 'MES' : 'MESES'})
                </td>

                {/* Total por mes seleccionado */}
                {sortedSelectedMonths.map((m) => {
                  const mVal = footerTotals.monthTotals[m] || 0;
                  return (
                    <td
                      key={`total-${m}`}
                      className="p-2.5 text-center font-mono font-bold border-r border-white/5 bg-zinc-900/80 text-white"
                    >
                      {formatValue(mVal)}
                    </td>
                  );
                })}

                {/* Total Diferencia y Variación % */}
                {comparisonInfo.hasComparison && (
                  <>
                    <td
                      className={`p-2.5 text-center font-mono font-black border-r border-white/10 bg-blue-950/30 ${
                        footerTotals.diff > 0
                          ? 'text-emerald-400'
                          : footerTotals.diff < 0
                          ? 'text-rose-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {formatDiff(footerTotals.diff)}
                    </td>
                    <td className="p-2.5 text-center border-r border-white/10 bg-emerald-950/30">
                      {renderPctBadge(footerTotals.pct, footerTotals.isNew)}
                    </td>
                  </>
                )}

                {/* Total Período si > 2 meses */}
                {sortedSelectedMonths.length > 2 && (
                  <td className="p-2.5 text-center font-mono font-black text-red-400 bg-red-950/40">
                    {formatValue(
                      (Object.values(footerTotals.monthTotals) as number[]).reduce((a: number, b: number) => a + b, 0)
                    )}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal de Historial Completo de Mercancía del Vendedor */}
      <SellerVolumeHistoryModal
        sellerName={historyModalSeller}
        isOpen={!!historyModalSeller}
        onClose={() => setHistoryModalSeller(null)}
        rawSellerMonthlyData={data?.sellerMonthlyData || []}
        currentMetric={metric}
      />
    </div>
  );
};
