import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Download,
  FileText,
  ChevronRight,
  ArrowDownLeft,
  Filter,
  RefreshCw,
  Building,
  User,
  Package,
  Layers,
  CheckCircle2,
  X,
  Tag,
  SlidersHorizontal,
  RotateCcw,
  DollarSign,
  Hash,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  InvoiceStatusFilter,
  QuantityFilterScope,
  SalesSummaryKPIs,
  SalesTransaction,
} from '../components/ventas/types';
import { VentasKPIHeader } from '../components/ventas/VentasKPIHeader';
import { InvoiceDetailModal } from '../components/ventas/InvoiceDetailModal';
import { ClientPurchaseHistoryModal } from '../components/ventas/ClientPurchaseHistoryModal';
import { MultiMonthSelector } from '../components/ventas/MultiMonthSelector';
import { getSellerMetadata, OFFICIAL_SUPERVISORS } from '../components/cuotas/sellerSupervisorMap';
import {
  filterAndSummarizeInvoices,
  formatItemSkuCode,
} from '../components/ventas/invoiceFilterUtils';

interface SkuCatalogEntry {
  id_articulo: number;
  sku: string;
  articulo: string;
}

const PAGE_SIZE = 35;

export const Ventas: React.FC = () => {
  // Estados de datos base del período seleccionado
  const [allPeriodTransactions, setAllPeriodTransactions] = useState<SalesTransaction[]>([]);
  const [serverSummary, setServerSummary] = useState<SalesSummaryKPIs | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [months, setMonths] = useState<string[]>([
    'OCTUBRE',
    'SEPTIEMBRE',
    'AGOSTO',
    'JULIO',
    'JUNIO',
    'MAYO',
    'ABRIL',
    'MARZO',
    'FEBRERO',
    'ENERO',
  ]);
  const [sellers, setSellers] = useState<string[]>([]);
  const [skuCatalog, setSkuCatalog] = useState<SkuCatalogEntry[]>([]);

  // 1. Filtro de Estado (Facturas Emitidas activo por defecto)
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('EMITIDAS');

  // 2. Filtro por SKU con Debounce (300ms)
  const [skuInput, setSkuInput] = useState<string>('');
  const [debouncedSkuQuery, setDebouncedSkuQuery] = useState<string>('');

  // 3. Filtro por Cantidad de Productos (Granular por SKU y Total de Factura)
  const [minQuantity, setMinQuantity] = useState<string>('');
  const [maxQuantity, setMaxQuantity] = useState<string>('');
  const [quantityScope, setQuantityScope] = useState<QuantityFilterScope>('sku');

  // Filtros Generales (Búsqueda libre, Supervisor, Vendedor, Meses)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('ALL');
  const [selectedSeller, setSelectedSeller] = useState<string>('ALL');
  const [selectedMonths, setSelectedMonths] = useState<string[]>(['OCTUBRE']);
  const [page, setPage] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Modales
  const [selectedInvoice, setSelectedInvoice] = useState<SalesTransaction | null>(null);
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<string | null>(null);

  // Debounce 300ms para el Filtro por SKU (Requerimiento 2)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = skuInput.trim();
      setDebouncedSkuQuery(trimmed);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [skuInput]);

  // Debounce 300ms para búsqueda libre general
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Vendedores filtrados según supervisor seleccionado
  const filteredSellers = useMemo(() => {
    if (selectedSupervisor === 'ALL') return sellers;
    return sellers.filter((s) => getSellerMetadata(s).supervisor === selectedSupervisor);
  }, [sellers, selectedSupervisor]);

  // Cargar metadatos (vendedores, meses y catálogo oficial de 297 SKUs)
  useEffect(() => {
    fetch('/api/sales/meta')
      .then((res) => res.json())
      .then((meta) => {
        if (meta.months) setMonths(meta.months);
        if (meta.sellers) setSellers(meta.sellers);
        if (meta.skus) setSkuCatalog(meta.skus);
        if (meta.latestMonth) setSelectedMonths([meta.latestMonth]);
      })
      .catch((err) => console.error('Error fetching sales meta:', err));
  }, []);

  // Cargar la totalidad de documentos agrupados del período seleccionado para filtrado reactivo en memoria
  const fetchTransactions = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (selectedMonths.length > 0 && selectedMonths.length < months.length) {
      params.append('mes', selectedMonths.join(','));
    } else {
      params.append('mes', 'ALL');
    }
    params.append('tipo_doc', 'ALL');
    params.append('estado_factura', 'ALL');
    params.append('all', 'true');

    fetch(`/api/sales/transactions?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.documents) {
          setAllPeriodTransactions(json.documents);
          setServerSummary(json.summary || null);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching sales transactions:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchTransactions();
  }, [selectedMonths]);

  // Motor de Filtrado Reactivo en Memoria (useMemo)
  const filteredAnalysis = useMemo(() => {
    return filterAndSummarizeInvoices(allPeriodTransactions, {
      statusFilter,
      skuQuery: debouncedSkuQuery,
      minQuantity,
      maxQuantity,
      quantityScope,
      searchTerm: debouncedSearchTerm,
      selectedSupervisor,
      selectedSeller,
      selectedMonths,
    });
  }, [
    allPeriodTransactions,
    statusFilter,
    debouncedSkuQuery,
    minQuantity,
    maxQuantity,
    quantityScope,
    debouncedSearchTerm,
    selectedSupervisor,
    selectedSeller,
    selectedMonths,
  ]);

  const { rows: filteredRows, kpis: reactiveKPIs } = filteredAnalysis;

  // Resumen superior sincronizado
  const effectiveHeaderSummary: SalesSummaryKPIs | null = useMemo(() => {
    if (allPeriodTransactions.length === 0 && serverSummary) {
      return serverSummary;
    }
    // Calcular el resumen global FA vs DV sobre el universo filtrado por mes/supervisor/vendedor/SKU/cantidad
    const allStatusMatch = filterAndSummarizeInvoices(allPeriodTransactions, {
      statusFilter: 'ALL',
      skuQuery: debouncedSkuQuery,
      minQuantity,
      maxQuantity,
      quantityScope,
      searchTerm: debouncedSearchTerm,
      selectedSupervisor,
      selectedSeller,
      selectedMonths,
    });
    const isolateBySku = Boolean(debouncedSkuQuery.trim()) && quantityScope === 'sku';
    if (isolateBySku) {
      let skuFA = 0;
      let skuDV = 0;
      for (const r of allStatusMatch.rows) {
        const amt = r.skuMatch?.skuTotalAmount ?? 0;
        if (r.status === 'DEVOLUCION' || amt < 0) {
          skuDV += Math.abs(amt);
        } else if (r.status === 'EMITIDA') {
          skuFA += amt;
        }
      }
      const skuNet = skuFA - skuDV;
      const skuReturnRate = skuFA > 0 ? (skuDV / skuFA) * 100 : 0;
      return {
        totalFA: Math.round(skuFA * 100) / 100,
        totalDV: Math.round(skuDV * 100) / 100,
        netTotal: Math.round(skuNet * 100) / 100,
        faCount: allStatusMatch.kpis.issuedInvoicesCount,
        dvCount: allStatusMatch.kpis.dvCount,
        totalBoxes: allStatusMatch.kpis.skuUnitsTotal,
        totalKgs: allStatusMatch.kpis.skuKgsTotal,
        returnRate: Math.round(skuReturnRate * 100) / 100,
      };
    }
    return {
      totalFA: allStatusMatch.kpis.totalFA,
      totalDV: allStatusMatch.kpis.totalDV,
      netTotal: allStatusMatch.kpis.netTotal,
      faCount: allStatusMatch.kpis.issuedInvoicesCount,
      dvCount: allStatusMatch.kpis.dvCount,
      totalBoxes: allStatusMatch.kpis.totalInvoiceUnits,
      totalKgs: allStatusMatch.kpis.totalInvoiceKgs,
      returnRate: allStatusMatch.kpis.returnRate,
    };
  }, [
    allPeriodTransactions,
    serverSummary,
    debouncedSkuQuery,
    minQuantity,
    maxQuantity,
    quantityScope,
    debouncedSearchTerm,
    selectedSupervisor,
    selectedSeller,
    selectedMonths,
  ]);

  // Paginación en cliente sobre las filas filtradas
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const hasActiveAdvancedFilters = Boolean(
    skuInput.trim() ||
      debouncedSkuQuery.trim() ||
      minQuantity.trim() ||
      maxQuantity.trim() ||
      searchTerm.trim() ||
      selectedSupervisor !== 'ALL' ||
      selectedSeller !== 'ALL' ||
      statusFilter !== 'EMITIDAS'
  );

  // Restablecer todos los filtros de inmediato
  const handleClearFilters = () => {
    setStatusFilter('EMITIDAS');
    setSkuInput('');
    setDebouncedSkuQuery('');
    setMinQuantity('');
    setMaxQuantity('');
    setQuantityScope('sku');
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedSupervisor('ALL');
    setSelectedSeller('ALL');
    setPage(1);
  };

  const formatCurrency = (val: number) => {
    return (
      (val < 0 ? '-$' : '$') +
      Math.abs(val).toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  // Subtítulo del período seleccionado
  const getPeriodSubtitle = () => {
    if (selectedMonths.length === 0 || selectedMonths.length === months.length) {
      return 'todos los meses de 2026';
    }
    if (selectedMonths.length === 1) {
      return `${selectedMonths[0]} 2026`;
    }
    return `${selectedMonths.join(', ')} 2026 (${selectedMonths.length} meses seleccionados)`;
  };

  // Exportar selección filtrada actual a Excel (.xlsx)
  const handleExportToExcel = () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      const periodLabel =
        selectedMonths.length === 0 || selectedMonths.length === months.length
          ? 'Todos los Meses 2026'
          : `${selectedMonths.join(' - ')} 2026`;

      // Hoja de Resumen Reactivo
      const summaryRows = [
        { Concepto: 'Módulo', Valor: 'Ventas y Facturación Oficial (Auditoría SKU & Cantidad)' },
        { Concepto: 'Fuente de Datos', Valor: 'Supabase history_sales (Transacciones Reales)' },
        { Concepto: 'Período', Valor: periodLabel },
        {
          Concepto: 'Filtro Estado Documento',
          Valor:
            statusFilter === 'EMITIDAS'
              ? 'Facturas Emitidas (FA Válidas)'
              : statusFilter === 'DV'
              ? 'Devoluciones (DV)'
              : 'Todos (FA + DV)',
        },
        { Concepto: 'Filtro SKU Activo', Valor: debouncedSkuQuery || 'Todos los SKUs' },
        {
          Concepto: 'Filtro Rango de Cantidad',
          Valor:
            minQuantity || maxQuantity
              ? `Mín: ${minQuantity || '0'} | Máx: ${maxQuantity || 'Sin límite'} (${
                  quantityScope === 'sku' ? 'Cantidad del SKU' : 'Cantidad Total Factura'
                })`
              : 'Sin restricción de cantidad',
        },
        { Concepto: 'Total Facturas Emitidas Encontradas', Valor: reactiveKPIs.issuedInvoicesCount },
        { Concepto: 'Total Unidades / Cajas de la Selección', Valor: reactiveKPIs.totalInvoiceUnits },
        ...(reactiveKPIs.hasActiveSkuFilter
          ? [
              {
                Concepto: `Unidades Vendidas del SKU (${reactiveKPIs.matchedPrimarySkuLabel || debouncedSkuQuery})`,
                Valor: reactiveKPIs.skuUnitsTotal,
              },
              {
                Concepto: `Monto Facturado del SKU ($)`,
                Valor: reactiveKPIs.skuAmountTotal,
              },
            ]
          : []),
        { Concepto: 'Monto Total Facturado de la Selección ($)', Valor: reactiveKPIs.totalInvoiceAmount },
        { Concepto: 'Fecha de Generación', Valor: new Date().toLocaleString('es-VE') },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Filtrado');

      // Hoja de Facturas Filtradas
      const docRows = filteredRows.map(({ transaction: t, status, skuMatch }) => ({
        Documento: t.invoice,
        Estado: status,
        Tipo: t.tipo_doc === 'FA' ? 'Factura Emitida' : 'Devolución',
        Número: t.numero,
        Período: t.date,
        Vendedor: t.seller,
        Cliente: t.client,
        SKU_Principal: t.topProductSku || (t.items[0] ? formatItemSkuCode(t.items[0]) : ''),
        Producto_Top: t.topProduct,
        ...(reactiveKPIs.hasActiveSkuFilter
          ? {
              SKU_Filtrado: skuMatch?.primarySkuCode || '',
              Producto_SKU_Filtrado: skuMatch?.primarySkuName || '',
              Unidades_SKU_Filtrado: skuMatch?.skuEffectiveQuantity || 0,
              Monto_SKU_Filtrado_USD: skuMatch?.skuTotalAmount || 0,
            }
          : {}),
        Renglones: t.itemsCount,
        Cajas_Totales_Factura: t.boxes,
        Kgs_Lts_Totales: t.kgs_lts,
        Total_Factura_USD: t.total,
      }));
      const wsDocs = XLSX.utils.json_to_sheet(docRows);
      XLSX.utils.book_append_sheet(wb, wsDocs, 'Facturas Emitidas');

      const fileNameMonthSuffix =
        selectedMonths.length === 0 || selectedMonths.length === months.length
          ? 'Todos_Meses'
          : selectedMonths.join('_');
      XLSX.writeFile(wb, `Ventas_Facturacion_${fileNameMonthSuffix}_2026_Codizulca.xlsx`);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in-50 duration-500 font-sans text-zinc-100 max-w-[1600px] mx-auto pb-10">
      {/* 1. Header Oficial de Ventas y Facturación */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30">
              SUPABASE OFICIAL
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              267,148 Transacciones Conectadas • 297 SKUs Oficiales
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] mt-1">
            VENTAS & FACTURACIÓN
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Auditoría inteligente de facturas emitidas (FA), SKUs y volúmenes por factura en{' '}
            <strong className="text-zinc-200">{getPeriodSubtitle()}</strong>.
          </p>
        </div>

        {/* Status Badge & Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-red-500" />
            <span>Datos en Vivo Supabase</span>
          </div>

          <button
            type="button"
            onClick={fetchTransactions}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-zinc-200 transition-colors"
            title="Recargar datos de Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-red-500' : 'text-zinc-400'}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* 2. Tarjetas KPI de Resumen de Facturación y Devoluciones */}
      <VentasKPIHeader summary={effectiveHeaderSummary} selectedMonths={selectedMonths} />

      {/* 3. Panel Ejecutivo de Filtrado Avanzado (Estado, SKU y Cantidad de Productos) */}
      <div className="bg-zinc-950/95 border border-white/10 rounded-xl p-4 shadow-2xl space-y-4">
        {/* Fila 1: Búsqueda General, Selector de Estado (Facturas Emitidas por defecto), Meses, Supervisor, Vendedor y Exportar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Input de Búsqueda General */}
          <div className="relative flex-1 min-w-[230px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar por cliente, N° factura (FA), vendedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                title="Limpiar búsqueda general"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Controles Rápidos Superiores */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Filtro de Estado de Documento (Facturas Emitidas por defecto) */}
            <div
              className="inline-flex rounded-lg p-0.5 bg-zinc-900 border border-white/10 text-xs"
              role="group"
              aria-label="Filtro de estado de facturas"
            >
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('EMITIDAS');
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all ${
                  statusFilter === 'EMITIDAS'
                    ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.45)]'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-white" />
                <span>Facturas Emitidas (FA)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('ALL');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-zinc-800 text-white border border-white/20 shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Todos (FA + DV)
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('DV');
                  setPage(1);
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-bold transition-all ${
                  statusFilter === 'DV'
                    ? 'bg-zinc-800 text-white border border-white/20 shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-red-400" />
                <span>Devoluciones (DV)</span>
              </button>
            </div>

            {/* Filtro Mes Multiselección */}
            <MultiMonthSelector
              availableMonths={months}
              selectedMonths={selectedMonths}
              onChange={(newMonths) => {
                setSelectedMonths(newMonths);
                setPage(1);
              }}
              year={2026}
            />

            {/* Filtro Supervisor */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 border border-white/10 rounded-lg text-xs">
              <Building className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <select
                value={selectedSupervisor}
                onChange={(e) => {
                  setSelectedSupervisor(e.target.value);
                  setSelectedSeller('ALL');
                  setPage(1);
                }}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer py-1 max-w-[160px] truncate"
              >
                <option value="ALL" className="bg-zinc-900">
                  Todos los Supervisores
                </option>
                {OFFICIAL_SUPERVISORS.map((sup) => (
                  <option key={sup} value={sup} className="bg-zinc-900">
                    Sup: {sup}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro Vendedor */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 border border-white/10 rounded-lg text-xs">
              <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={selectedSeller}
                onChange={(e) => {
                  setSelectedSeller(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer py-1 max-w-[160px] truncate"
              >
                <option value="ALL" className="bg-zinc-900">
                  Todos los Vendedores ({filteredSellers.length})
                </option>
                {filteredSellers.map((s) => (
                  <option key={s} value={s} className="bg-zinc-900">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Botón Exportar a Excel */}
            <button
              type="button"
              onClick={handleExportToExcel}
              disabled={isExporting || filteredRows.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-zinc-200 transition-colors disabled:opacity-50"
              title="Descargar selección filtrada a Excel"
            >
              <Download className="h-3.5 w-3.5 text-red-500" />
              <span>{isExporting ? 'Exportando...' : 'Exportar a Excel'}</span>
            </button>
          </div>
        </div>

        {/* Fila 2: Filtro Inteligente por SKU + Filtro por Cantidad de Productos (Granular / Total) + Limpiar Filtros */}
        <div className="pt-3 border-t border-white/10 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          {/* 2. Filtro por SKU (Búsqueda Inteligente con Debounce 300ms y autocompletado de 297 SKUs) */}
          <div className="lg:col-span-4 space-y-1">
            <label
              htmlFor="ventas-sku-filter-input"
              className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-zinc-400"
            >
              <span className="flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-red-500" />
                Filtro por SKU / Producto (Debounce 300ms)
              </span>
              {debouncedSkuQuery && (
                <span className="text-red-400 font-mono">
                  Activo: {debouncedSkuQuery.toUpperCase()}
                </span>
              )}
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-red-500" />
              <input
                id="ventas-sku-filter-input"
                type="text"
                list="ventas-sku-catalog"
                placeholder="Ej: SKU-28, 28, 1464, HUEVOS, MORTADELA..."
                value={skuInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSkuInput(val);
                  // Por defecto, cuando hay un SKU escrito, activar modo 'sku' ("Cantidad del SKU filtrado")
                  if (val.trim() && !skuInput.trim()) {
                    setQuantityScope('sku');
                  }
                }}
                className={`w-full bg-zinc-900 border rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors font-medium ${
                  debouncedSkuQuery
                    ? 'border-red-500/70 ring-1 ring-red-500/30 bg-red-950/10'
                    : 'border-white/10 focus:border-red-500'
                }`}
              />
              {skuInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSkuInput('');
                    setDebouncedSkuQuery('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  title="Quitar filtro de SKU"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <datalist id="ventas-sku-catalog">
                {skuCatalog.map((item) => (
                  <option key={item.id_articulo} value={item.sku}>
                    {item.sku} — {item.articulo}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          {/* 3. Controles Numéricos de Cantidad Mínima (>=) y Cantidad Máxima (<=) */}
          <div className="lg:col-span-3 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label
                htmlFor="ventas-min-qty-input"
                className="block text-[10px] font-black uppercase tracking-wider text-zinc-400"
              >
                Cantidad Mínima (&ge;)
              </label>
              <input
                id="ventas-min-qty-input"
                type="number"
                step="any"
                min="0"
                placeholder="Mín (ej. 10)"
                value={minQuantity}
                onChange={(e) => {
                  setMinQuantity(e.target.value);
                  setPage(1);
                }}
                className={`w-full bg-zinc-900 border rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-zinc-500 focus:outline-none transition-colors ${
                  minQuantity.trim()
                    ? 'border-red-500/70 bg-red-950/10'
                    : 'border-white/10 focus:border-red-500'
                }`}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ventas-max-qty-input"
                className="block text-[10px] font-black uppercase tracking-wider text-zinc-400"
              >
                Cantidad Máxima (&le;)
              </label>
              <input
                id="ventas-max-qty-input"
                type="number"
                step="any"
                min="0"
                placeholder="Máx (ej. 500)"
                value={maxQuantity}
                onChange={(e) => {
                  setMaxQuantity(e.target.value);
                  setPage(1);
                }}
                className={`w-full bg-zinc-900 border rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-zinc-500 focus:outline-none transition-colors ${
                  maxQuantity.trim()
                    ? 'border-red-500/70 bg-red-950/10'
                    : 'border-white/10 focus:border-red-500'
                }`}
              />
            </div>
          </div>

          {/* Selector de Alcance de Cantidad ("Cantidad del SKU filtrado" vs "Cantidad total de la factura") */}
          <div className="lg:col-span-3 space-y-1">
            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
              <SlidersHorizontal className="w-3 h-3 text-red-500" />
              Alcance del Filtro de Cantidad
            </label>
            <div className="grid grid-cols-2 rounded-lg p-0.5 bg-zinc-900 border border-white/10 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setQuantityScope('sku');
                  setPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-md font-bold transition-all truncate ${
                  quantityScope === 'sku'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Evalúa que la cantidad facturada específicamente del SKU filtrado esté dentro del rango [Mínimo, Máximo]"
              >
                Cantidad del SKU filtrado
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuantityScope('total');
                  setPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-md font-bold transition-all truncate ${
                  quantityScope === 'total'
                    ? 'bg-zinc-800 text-white border border-white/20 shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Evalúa que la suma total de unidades/productos de toda la factura esté dentro del rango [Mínimo, Máximo]"
              >
                Cantidad total factura
              </button>
            </div>
          </div>

          {/* Botón Limpiar Filtros */}
          <div className="lg:col-span-2 flex items-center justify-end">
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveAdvancedFilters}
              className={`w-full flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-black uppercase tracking-wider transition-all ${
                hasActiveAdvancedFilters
                  ? 'bg-red-950/60 hover:bg-red-900/70 text-white border-red-500/50 shadow-lg cursor-pointer'
                  : 'bg-zinc-900/50 text-zinc-600 border-white/5 cursor-not-allowed'
              }`}
              title="Restablecer todos los filtros de inmediato"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-400" />
              <span>Limpiar filtros</span>
            </button>
          </div>
        </div>

        {/* Chips de Meses Activos cuando no están todos seleccionados */}
        {selectedMonths.length > 0 && selectedMonths.length < months.length && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5 text-[11px]">
            <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
              Meses Filtrados:
            </span>
            {selectedMonths.map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-950/50 border border-red-500/30 text-red-300 font-bold shadow-sm"
              >
                <span>{m}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = selectedMonths.filter((x) => x !== m);
                    setSelectedMonths(next.length === 0 ? ['OCTUBRE'] : next);
                    setPage(1);
                  }}
                  className="hover:text-white transition-colors"
                  title={`Quitar filtro de ${m}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setSelectedMonths([...months]);
                setPage(1);
              }}
              className="text-zinc-400 hover:text-white underline text-[10px] ml-1.5 transition-colors font-medium"
            >
              Seleccionar todos los meses ({months.length})
            </button>
          </div>
        )}
      </div>

      {/* 4. Barra Reactiva de KPIs del Subconjunto Filtrado (En Tiempo Real sobre la Tabla) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* KPI Reactivo 1: Total de Facturas Emitidas Encontradas */}
        <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Total de Facturas Emitidas Encontradas
              </span>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span
                data-testid="reactive-kpi-issued-count"
                className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight"
              >
                {reactiveKPIs.issuedInvoicesCount.toLocaleString('es-VE')}
              </span>
              <span className="text-xs font-bold text-red-400 uppercase">
                Facturas (FA)
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              {statusFilter === 'EMITIDAS'
                ? 'Solo documentos emitidos válidos (excluye anuladas y borradores)'
                : `Mostrando ${reactiveKPIs.totalDocumentsCount.toLocaleString('es-VE')} docs (${reactiveKPIs.issuedInvoicesCount} FA / ${reactiveKPIs.dvCount} DV)`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-red-600/10 border border-red-500/20 text-red-500 shrink-0">
            <Hash className="w-6 h-6" />
          </div>
        </div>

        {/* KPI Reactivo 2: Total de Unidades / Productos (con desglose exacto cuando hay un SKU activo) */}
        <div
          className={`bg-zinc-950 border rounded-xl p-4 shadow-lg flex items-center justify-between ${
            reactiveKPIs.hasActiveSkuFilter
              ? 'border-red-500/50 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20'
              : 'border-white/10'
          }`}
        >
          <div className="space-y-1 min-w-0 pr-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                {reactiveKPIs.hasActiveSkuFilter
                  ? 'Unidades Vendidas del SKU Filtrado'
                  : 'Total de Unidades / Productos'}
              </span>
            </div>
            {reactiveKPIs.hasActiveSkuFilter ? (
              <>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    data-testid="reactive-kpi-sku-units"
                    className="text-2xl sm:text-3xl font-black font-mono text-red-400 tracking-tight"
                  >
                    {reactiveKPIs.skuUnitsTotal.toLocaleString('es-VE', {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-xs font-bold text-white uppercase">
                    unds del SKU ({reactiveKPIs.skuKgsTotal.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Kg)
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate" title={reactiveKPIs.matchedPrimarySkuLabel}>
                  Total general en esas facturas:{' '}
                  <strong className="text-white font-mono">
                    {reactiveKPIs.totalInvoiceUnits.toLocaleString('es-VE', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    unds
                  </strong>
                </p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span
                    data-testid="reactive-kpi-total-units"
                    className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight"
                  >
                    {reactiveKPIs.totalInvoiceUnits.toLocaleString('es-VE', {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-xs font-bold text-zinc-300 uppercase">
                    cajas / unds
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 font-mono">
                  Volumen físico: {reactiveKPIs.totalInvoiceKgs.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Kg/Lts
                </p>
              </>
            )}
          </div>
          <div className="p-3 rounded-xl bg-red-600/10 border border-red-500/20 text-red-500 shrink-0">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* KPI Reactivo 3: Monto Total Facturado de la Selección */}
        <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
              Monto Total Facturado de la Selección
            </span>
            <div className="flex items-baseline gap-2">
              <span
                data-testid="reactive-kpi-total-amount"
                className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight"
              >
                {formatCurrency(reactiveKPIs.totalInvoiceAmount)}
              </span>
            </div>
            {reactiveKPIs.hasActiveSkuFilter ? (
              <p className="text-[11px] text-zinc-400">
                Facturación exclusiva del SKU:{' '}
                <strong className="text-red-400 font-mono">
                  {formatCurrency(reactiveKPIs.skuAmountTotal)}
                </strong>
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500">
                Suma exacta en USD de los documentos filtrados
              </p>
            )}
          </div>
          <div className="p-3 rounded-xl bg-red-600/10 border border-red-500/20 text-red-500 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 5. Tabla de Resultados de Facturas Emitidas */}
      <div className="bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1150px] text-xs">
            <thead>
              <tr className="bg-zinc-900/90 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[11px] select-none">
                <th className="p-3.5 border-r border-white/10 min-w-[155px]">Factura / Estado</th>
                <th className="p-3.5 border-r border-white/10 min-w-[105px]">Período</th>
                <th className="p-3.5 border-r border-white/10 min-w-[155px]">Vendedor</th>
                <th className="p-3.5 border-r border-white/10 min-w-[250px]">
                  Cliente (Click para Historial 360°)
                </th>
                <th className="p-3.5 border-r border-white/10 min-w-[250px]">
                  {reactiveKPIs.hasActiveSkuFilter
                    ? 'SKU Filtrado & Unidades en Factura'
                    : 'Producto Principal (SKU Top)'}
                </th>
                <th className="p-3.5 text-right border-r border-white/10 min-w-[95px]">
                  {reactiveKPIs.hasActiveSkuFilter ? 'Cajas Totales' : 'Cajas / Unds'}
                </th>
                <th className="p-3.5 text-right border-r border-white/10 min-w-[115px]">Total ($)</th>
                <th className="p-3.5 text-center min-w-[75px]">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-16 text-center text-zinc-400 space-y-3">
                    <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="font-bold">Cargando facturas emitidas de Supabase...</p>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-16 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
                      <Filter className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-white">
                        No se encontraron facturas emitidas con ese SKU y rango de cantidad
                      </p>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto">
                        Verifica el código SKU ingresado o amplía el rango de Cantidad Mínima / Máxima para visualizar más documentos emitidos.
                      </p>
                    </div>
                    {hasActiveAdvancedFilters && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Limpiar filtros ahora</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedRows.map(({ transaction: row, status, skuMatch }) => {
                  const isDV = row.tipo_doc === 'DV';
                  const hasSkuHighlight = Boolean(skuMatch && skuMatch.hasMatch);
                  const topSkuBadge =
                    row.topProductSku || (row.items[0] ? formatItemSkuCode(row.items[0]) : '');

                  return (
                    <tr
                      key={row.invoice}
                      className={`transition-colors group ${
                        hasSkuHighlight
                          ? 'bg-red-950/15 hover:bg-red-950/30 border-l-2 border-l-red-500'
                          : isDV
                          ? 'bg-red-950/10 hover:bg-white/[0.03]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      {/* Documento (FA / DV) + Estado Emitida */}
                      <td className="p-3.5 border-r border-white/10">
                        <div
                          onClick={() => setSelectedInvoice(row)}
                          className="flex items-center gap-2 cursor-pointer hover:opacity-80"
                        >
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                              isDV
                                ? 'bg-zinc-900 text-zinc-300 border border-white/20'
                                : 'bg-red-950/80 text-white border border-red-600/60'
                            }`}
                          >
                            {row.tipo_doc}
                          </span>
                          <span className="font-mono font-bold text-white tracking-wider text-xs">
                            {row.invoice}
                          </span>
                          {status === 'EMITIDA' && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-[9px] font-black text-emerald-300 uppercase tracking-wider">
                              Emitida
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Fecha / Período */}
                      <td className="p-3.5 font-mono text-zinc-400 border-r border-white/10">
                        {row.date}
                      </td>

                      {/* Vendedor */}
                      <td className="p-3.5 font-bold text-zinc-300 border-r border-white/10">
                        {row.seller}
                      </td>

                      {/* Cliente (Interactivo para Historial 360°) */}
                      <td className="p-3.5 border-r border-white/10">
                        <button
                          type="button"
                          onClick={() => setSelectedClientForHistory(row.client)}
                          className="text-left font-bold text-zinc-200 hover:text-red-400 hover:underline transition-colors block leading-snug"
                          title="Haga clic para ver el historial completo de compras y devoluciones de este cliente"
                        >
                          {row.client}
                        </button>
                      </td>

                      {/* Producto Top / Badge de SKU Filtrado */}
                      <td className="p-3.5 border-r border-white/10">
                        {hasSkuHighlight && skuMatch ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                data-testid={`sku-row-badge-${row.invoice}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600 text-white font-mono text-[11px] font-black tracking-wide shadow-sm"
                              >
                                <Tag className="w-3 h-3" />
                                {skuMatch.badgeText}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-red-300">
                                ({formatCurrency(skuMatch.skuTotalAmount)})
                              </span>
                            </div>
                            <span
                              className="text-white font-semibold truncate max-w-[250px] text-[11px]"
                              title={skuMatch.primarySkuName}
                            >
                              {skuMatch.primarySkuName}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {topSkuBadge && (
                                <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 font-mono text-[10px] font-bold text-zinc-400">
                                  {topSkuBadge}
                                </span>
                              )}
                              <span
                                className="text-zinc-300 truncate max-w-[200px]"
                                title={row.topProduct}
                              >
                                {row.topProduct}
                              </span>
                            </div>
                            {row.itemsCount > 1 && (
                              <span className="text-[10px] text-zinc-500">
                                +{row.itemsCount - 1}{' '}
                                {row.itemsCount === 2 ? 'producto más' : 'productos más'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Cajas */}
                      <td className="p-3.5 text-right font-mono font-bold text-white border-r border-white/10">
                        {(skuMatch && skuMatch.hasMatch && quantityScope === 'sku'
                          ? skuMatch.skuEffectiveQuantity
                          : row.boxes
                        ).toLocaleString('es-VE')}
                      </td>

                      {/* Total */}
                      <td
                        className={`p-3.5 text-right font-mono font-black border-r border-white/10 ${
                          isDV ? 'text-zinc-300' : 'text-white'
                        }`}
                      >
                        {formatCurrency(
                          skuMatch && skuMatch.hasMatch && quantityScope === 'sku'
                            ? skuMatch.skuTotalAmount
                            : row.total
                        )}
                      </td>

                      {/* Acción */}
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(row)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                          title="Ver renglones y SKU de la factura"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="p-4 border-t border-white/10 bg-zinc-950 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-zinc-400 font-mono">
            Página <strong className="text-white">{safePage}</strong> de{' '}
            <strong className="text-white">{totalPages}</strong> • Mostrando{' '}
            <strong className="text-white">{paginatedRows.length}</strong> de{' '}
            <strong className="text-red-400">{filteredRows.length.toLocaleString('es-VE')}</strong>{' '}
            documentos filtrados
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 font-bold text-zinc-300 hover:text-white disabled:opacity-40 transition-colors"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 font-bold text-zinc-300 hover:text-white disabled:opacity-40 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Modal 1: Detalle de Factura / Devolución con Resaltado del SKU Filtrado */}
      <InvoiceDetailModal
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        transaction={selectedInvoice}
        onOpenClientHistory={(client) => setSelectedClientForHistory(client)}
        highlightedSkuQuery={debouncedSkuQuery}
      />

      {/* Modal 2: Historial de Compras y Devoluciones del Cliente (360°) */}
      <ClientPurchaseHistoryModal
        isOpen={Boolean(selectedClientForHistory)}
        onClose={() => setSelectedClientForHistory(null)}
        clientName={selectedClientForHistory}
        onSelectTransaction={(tx) => setSelectedInvoice(tx)}
      />
    </div>
  );
};
