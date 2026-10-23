import React, { useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { GapAnalysisPanel } from '../components/dashboard/GapAnalysisPanel';
import {
  PRODUCT_CATALOG_BY_SKU,
  isGenericProductLabel,
  resolveCatalogProductName,
} from '../data/productCatalog';
import { supabase } from '../lib/supabase';
import { 
  DollarSign, 
  TrendingUp,
  TrendingDown,
  Percent, 
  Package, 
  Settings, 
  Search, 
  Calendar as CalendarIcon,
  Filter,
  X,
  Play,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Table,
  Info,
  Scale,
  FileText,
  HelpCircle,
  CheckCircle2,
  Layers,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart,
  Line,
  ComposedChart,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import Papa from 'papaparse';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#09090b] border border-zinc-800 p-3 rounded-md shadow-xl min-w-[200px]">
        <p className="text-zinc-300 font-bold mb-3 border-b border-zinc-800 pb-2">{label}</p>
        <div className="space-y-2">
          {payload.map((entry: any, index: number) => {
            const isVentas = entry.name === 'ventas';
            const valStr = isVentas 
              ? 'USD ' + entry.value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : entry.value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
            const nameStr = isVentas ? 'Ventas' : 'Kilogramos Total';
            const colorClass = isVentas ? 'text-[#3b82f6]' : 'text-[#dc2626]';
            
            return (
              <div key={index} className="flex items-center justify-between gap-4">
                <span className={`text-xs font-medium uppercase ${colorClass}`}>{nameStr}</span>
                <span className={`text-sm font-bold ${colorClass}`}>{valStr}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

const ProductTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const displayName = data.fullName || data.originalName || label;
    const isComparative = data.m1Facturado !== undefined && data.m2Facturado !== undefined;

    if (isComparative) {
      const isPosFact = data.diffFacturado >= 0;
      const isPosKg = data.diffKg >= 0;
      return (
        <div className="bg-[#09090b] border border-zinc-700/80 p-3.5 rounded-xl shadow-2xl min-w-[280px] max-w-[360px] text-zinc-200">
          <p className="text-white font-bold text-xs leading-snug break-words mb-1">{displayName}</p>
          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2.5 border-b border-zinc-800 pb-2">
            <span className="text-red-400 font-semibold">{data.date ? `Comparativa (${data.date})` : 'Comparativa de Periodos'}</span>
            {data.idArt && <span className="font-mono text-zinc-400">SKU: {data.idArt}</span>}
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Facturado comparison */}
            <div className="bg-zinc-900/70 p-2 rounded-lg border border-white/5">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Facturación ($ USD)</span>
                <span className={`font-mono font-bold ${isPosFact ? 'text-white' : 'text-red-500'}`}>
                  {isPosFact ? '+' : ''}{data.pctFacturado.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-zinc-300 font-mono text-[11px]">
                <span className="text-zinc-400">USD {data.m1Facturado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-zinc-600">→</span>
                <span className="text-white font-bold">USD {data.m2Facturado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className={`text-[10px] font-mono mt-0.5 text-right font-semibold ${isPosFact ? 'text-white' : 'text-red-400'}`}>
                {isPosFact ? '+' : ''}USD {data.diffFacturado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Despachado comparison */}
            <div className="bg-zinc-900/70 p-2 rounded-lg border border-white/5">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Despacho Físico (KG)</span>
                <span className={`font-mono font-bold ${isPosKg ? 'text-white' : 'text-red-500'}`}>
                  {isPosKg ? '+' : ''}{data.pctKg.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-zinc-300 font-mono text-[11px]">
                <span className="text-zinc-400">{data.m1Kg.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg</span>
                <span className="text-zinc-600">→</span>
                <span className="text-white font-bold">{data.m2Kg.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg</span>
              </div>
              <div className={`text-[10px] font-mono mt-0.5 text-right font-semibold ${isPosKg ? 'text-white' : 'text-red-400'}`}>
                {isPosKg ? '+' : ''}{data.diffKg.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg
              </div>
            </div>

            {/* $/kg ratio */}
            {data.m2Kg > 0 && data.m2Facturado > 0 && (
              <div className="flex justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-800">
                <span>Precio Promedio M2:</span>
                <span className="font-mono text-zinc-200 font-semibold">
                  USD {(data.m2Facturado / data.m2Kg).toFixed(2)} / kg
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#09090b] border border-zinc-800 p-3.5 rounded-lg shadow-2xl min-w-[250px] max-w-[340px]">
        <p className="text-zinc-200 font-bold mb-0.5 text-xs leading-snug break-words">{displayName}</p>
        <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-2.5 border-b border-zinc-800 pb-2">
          <span>{data.date}</span>
          {data.idArt && <span className="font-mono text-zinc-400">SKU: {data.idArt}</span>}
        </div>
        <div className="space-y-2">
          {payload.map((entry: any, index: number) => {
            let nameStr = entry.name;
            let valStr = entry.value;
            let colorClass = 'text-white';
            
            if (entry.name === 'facturado') {
              nameStr = 'Facturado (USD)';
              colorClass = 'text-[#dc2626]';
              const actualUsd = data.rawFacturado !== undefined ? data.rawFacturado : (entry.value * 1000);
              valStr = 'USD ' + actualUsd.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (entry.name === 'despachado') {
              nameStr = 'Despachado (KG)';
              colorClass = 'text-[#3b82f6]';
              const actualKg = data.kgFacturado !== undefined ? data.kgFacturado : (entry.value * 1000);
              valStr = actualKg.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
            } else if (entry.name === 'total') {
              return null;
            }

            return (
              <div key={index} className="flex items-center justify-between py-0.5 gap-4">
                <span className={`text-xs font-medium uppercase ${colorClass}`}>{nameStr}</span>
                <span className={`text-sm font-bold ${colorClass}`}>{valStr}</span>
              </div>
            );
          })}
          {data.kgFacturado > 0 && data.rawFacturado > 0 && (
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400">
              <span>Precio Promedio:</span>
              <span className="font-mono text-zinc-300 font-semibold">
                USD {(data.rawFacturado / data.kgFacturado).toFixed(2)} / kg
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const DashboardOverview: React.FC = () => {
  const [selectedKpi, setSelectedKpi] = useState<{ id: string, label: string } | null>(null);
  const [kpiData, setKpiData] = useState(() => {
    try {
      const saved = localStorage.getItem('app_kpi_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, isLoading: false };
      }
    } catch {
      // ignore
    }
    return {
      facturacion: 0,
      utilidad: 0,
      cajas: 0,
      kg: 0,
      isLoading: true
    };
  });
  const [trendData, setTrendData] = useState<any[]>([]);
  const [rawProductData, setRawProductData] = useState<any[]>([]);
  
  const [skuFilter, setSkuFilter] = useState('');
  const [showTop5, setShowTop5] = useState(true);
  const [timeView, setTimeView] = useState<'day'|'month'>('day');
  
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [lastSheetSync, setLastSheetSync] = useState<string | null>(() => {
    try {
      return localStorage.getItem('app_last_sheets_sync') || null;
    } catch {
      return null;
    }
  });
  const [sheetSyncSuccessMessage, setSheetSyncSuccessMessage] = useState<string | null>(null);
  
  const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);
  const [historicalData, setHistoricalData] = useState<any[]>(() => {
    try {
      localStorage.removeItem('app_historical_sales_cache'); // Purge stale un-ordered cache
      localStorage.removeItem('app_historical_sales_cache_v3'); // Purge pre-September sync cache
      const cached = localStorage.getItem('app_historical_sales_cache_v4');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p: any) => ({
            ...p,
            baseName: resolveCatalogProductName(p.idArt, p.baseName),
          }));
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTimeGroups, setSelectedTimeGroups] = useState<string[]>([]);
  const [showFullComparisonTable, setShowFullComparisonTable] = useState(false);
  const [productSortMetric, setProductSortMetric] = useState<'facturado' | 'despachado'>('facturado');
  const [comparisonChartMode, setComparisonChartMode] = useState<'facturado' | 'despachado' | 'ambos'>('facturado');
  const datePickerRef = React.useRef<HTMLDivElement>(null);

  // Top Bar Filters State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterVendor, setFilterVendor] = useState('ALL');
  const [filterClient, setFilterClient] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterZone, setFilterZone] = useState('ALL');

  const [appliedFilters, setAppliedFilters] = useState<{
    startDate: string;
    endDate: string;
    vendor: string;
    client: string;
    search: string;
    zone: string;
  }>({
    startDate: '',
    endDate: '',
    vendor: 'ALL',
    client: '',
    search: '',
    zone: 'ALL'
  });

  const [rawFacturacionRows, setRawFacturacionRows] = useState<Array<{
    fecha: string;
    idCliente: string;
    idArt: string;
    vendedor: string;
    cajas: number;
    unidades: number;
    kg: number;
    monto: number;
    costo: number;
    utilidad: number;
  }>>([]);

  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [showSkuPicker, setShowSkuPicker] = useState(false);
  const skuPickerRef = React.useRef<HTMLDivElement>(null);
  
  const [topProductsMonthFilters, setTopProductsMonthFilters] = useState<string[]>([]);
  const [showTopProductsPicker, setShowTopProductsPicker] = useState(false);
  const topProductsPickerRef = React.useRef<HTMLDivElement>(null);

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const availableVendors = React.useMemo(() => {
    const s = new Set<string>();
    rawFacturacionRows.forEach(r => {
      if (r.vendedor) s.add(r.vendedor);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rawFacturacionRows]);

  const handleExecuteFilters = () => {
    setAppliedFilters({
      startDate: filterStartDate,
      endDate: filterEndDate,
      vendor: filterVendor,
      client: filterClient,
      search: filterSearch,
      zone: filterZone
    });
  };

  const handleClearFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterVendor('ALL');
    setFilterClient('');
    setFilterSearch('');
    setFilterZone('ALL');
    setAppliedFilters({
      startDate: '',
      endDate: '',
      vendor: 'ALL',
      client: '',
      search: '',
      zone: 'ALL'
    });
    setSelectedTimeGroups([]);
  };

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
      if (skuPickerRef.current && !skuPickerRef.current.contains(event.target as Node)) {
        setShowSkuPicker(false);
      }
      if (topProductsPickerRef.current && !topProductsPickerRef.current.contains(event.target as Node)) {
        setShowTopProductsPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const combinedProductData = React.useMemo(() => {
    const histWithoutDuplicateOct = rawProductData.length > 0
      ? historicalData.filter(h => !String(h.date || '').startsWith('2026-10'))
      : historicalData;
    return [...rawProductData, ...histWithoutDuplicateOct];
  }, [rawProductData, historicalData]);

  const availableSkus = React.useMemo(() => {
    const pMap = new Map<string, string>();
    combinedProductData.forEach(p => {
        if (p.idArt && p.baseName) pMap.set(p.idArt, p.baseName);
    });
    return Array.from(pMap.entries()).sort((a, b) => a[1].localeCompare(b[1])); // [id, name][]
  }, [combinedProductData]);

  const toggleSku = (id: string) => {
      setSelectedSkus(prev => {
          const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
          if (next.length > 0) {
              setShowTop5(false);
          }
          return next;
      });
  };

  const availableGroups = React.useMemo(() => {
    const groups = new Set<string>();
    if (timeView === 'day') {
      rawProductData.forEach(p => {
        if (p.date && p.date !== 'Sin Fecha' && p.date.split('-').length === 3) {
          groups.add(p.date);
        }
      });
      if (groups.size === 0) {
        historicalData.forEach(p => {
          if (p.date && p.date.split('-').length === 3) groups.add(p.date);
        });
      }
    } else {
      combinedProductData.forEach(p => {
        let groupDate = p.date;
        const dateParts = p.date.split('-');
        if (dateParts.length >= 2) {
          groupDate = `${dateParts[0]}-${dateParts[1]}`;
          groups.add(groupDate);
        }
      });
    }
    
    return Array.from(groups).sort((a, b) => b.localeCompare(a));
  }, [rawProductData, historicalData, combinedProductData, timeView]);

  React.useEffect(() => {
     setSelectedTimeGroups([]);
  }, [timeView]);

  React.useEffect(() => {
      // Fetch all historical data from Supabase via backend API
      let isMounted = true;
      const fetchAllHistorical = async () => {
          setIsHistoricalLoading(true);
          try {
              const res = await fetch('/api/historical-sales');
              if (res.ok && isMounted) {
                  const fetchedData = await res.json();
                  const MONTH_NAMES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
                  const parsed = (fetchedData as any[]).map((row: any) => {
                      const rawMes = String(row.mes || '').trim().toUpperCase();
                      const monthIndex = MONTH_NAMES.indexOf(rawMes);
                      if (monthIndex === -1) return null;
                      const gDate = `${row.ano}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                      return {
                          idArt: String(row.id_articulo),
                          baseName: resolveCatalogProductName(row.id_articulo, row.articulo),
                          facturado: Number(row.monto) || 0,
                          montoFA: Number(row.montoFA) || Number(row.monto) || 0,
                          montoDV: Number(row.montoDV) || 0,
                          despachado: Number(row.kgs_lts) || 0,
                          kgFacturado: Number(row.kgs_lts) || 0,
                          cajas: Number(row.cajas) || 0,
                          date: gDate + '-01'
                      };
                  }).filter(Boolean);
                  
                  if (parsed.length > 0) {
                      setHistoricalData(parsed);
                      try {
                        localStorage.setItem('app_historical_sales_cache_v4', JSON.stringify(parsed));
                      } catch {
                        // ignore
                      }
                  }
              }
          } catch (e) {
              console.error("Failed to fetch all historical data", e);
          } finally {
              if (isMounted) setIsHistoricalLoading(false);
          }
      };
      fetchAllHistorical();
      return () => { isMounted = false; };
  }, []);

  const toggleTimeGroup = (g: string) => {
      setSelectedTimeGroups(prev => 
          prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
      );
  };

  const fetchKpis = React.useCallback(async (forceRefresh = false) => {
    setKpiData(prev => ({ ...prev, isLoading: true }));
    try {
      if (forceRefresh) {
        try {
          await fetch('/api/sync-sheets', { method: 'POST' });
        } catch (e) {
          console.warn('[Sync] /api/sync-sheets post request failed:', e);
        }
      }

      const refreshParam = forceRefresh ? '?refresh=true' : '';
      let text = '';
      try {
        const res = await fetch(`/api/sheets${refreshParam}`);
        if (res.ok) {
          text = await res.text();
        }
      } catch {
        // Fallback to direct URL if needed
      }

      if (!text) {
        try {
          const res = await fetch('https://docs.google.com/spreadsheets/d/16pU4iEcNU_1j6sB7rZbshu2PM8OyH5hI7a24-vYO7P0/gviz/tq?tqx=out:csv');
          if (res.ok) {
            text = await res.text();
          }
        } catch {
          // direct fetch failed
        }
      }

      if (!text) {
        setKpiData(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      
      // Fetch product mapping first (including full 332-SKU catalog & cached historical names)
      let productMap = new Map<string, string>(Object.entries(PRODUCT_CATALOG_BY_SKU));
      try {
        const cachedMap = localStorage.getItem('app_product_map_cache');
        if (cachedMap) {
          const parsedCache = JSON.parse(cachedMap);
          if (parsedCache && typeof parsedCache === 'object') {
            Object.entries(parsedCache).forEach(([k, v]) => {
              const val = String(v || '').trim();
              if (k && val && !isGenericProductLabel(val)) {
                productMap.set(k, val);
                productMap.set(k.replace(/^0+/, ''), val);
              }
            });
          }
        }
      } catch {}
      try {
        let pText = '';
        const pRes = await fetch(`/api/sheets?sheet=Productos${forceRefresh ? '&refresh=true' : ''}`);
        if (pRes.ok) pText = await pRes.text();
        if (!pText) {
           const pRes2 = await fetch('https://docs.google.com/spreadsheets/d/16pU4iEcNU_1j6sB7rZbshu2PM8OyH5hI7a24-vYO7P0/gviz/tq?tqx=out:csv&sheet=Productos');
           if (pRes2.ok) pText = await pRes2.text();
        }
        if (pText) {
            const pResult = Papa.parse(pText, { header: true, skipEmptyLines: true });
            pResult.data.forEach((row: any) => {
                let cod = row['Cód. Producto'] || '';
                cod = cod.replace(/^["']|["']$/g, '').trim();
                let name = row['Producto'] || '';
                name = name.replace(/^["']|["']$/g, '').trim();
                if (cod && name) {
                    productMap.set(cod, name);
                    productMap.set(cod.replace(/^0+/, ''), name);
                }
            });
        }
      } catch (e) {
        console.warn("Notice: Using product mapping cache:", e);
      }

      let facturacion = 0;
      let utilidad = 0;
      let cajas = 0;
      let kg = 0;
        
        const trends = new Map<string, { date: string, ventas: number, kg: number, kgFacturado: number, kgDespachado: number }>();
        const prodAgg = new Map<string, { idArt: string, date: string, facturado: number, montoFA: number, montoDV: number, despachado: number, kgFacturado: number, kgDespachado: number }>();
        const factRows: Array<{
          fecha: string;
          idCliente: string;
          idArt: string;
          vendedor: string;
          cajas: number;
          unidades: number;
          kg: number;
          monto: number;
          costo: number;
          utilidad: number;
        }> = [];

        result.data.forEach((row: any) => {
          const mStr = row['Monto'] || '';
          const uStr = row['Utilidad'] || '';
          const cStr = row['Cajas'] || '';
          const kStr = row['Kg'] || '';
          
          let fStr = row['Fecha'] || '';
          fStr = fStr.replace(/^["']|["']$/g, '').trim();
          const dateOnly = fStr.split(' ')[0] || 'Sin Fecha';
          
          const idArt = String(row['Id Articulo'] || '').replace(/^["']|["']$/g, '').trim();
          const idCliente = String(row['Id Cliente'] || row['Cliente'] || '').replace(/^["']|["']$/g, '').trim();
          let vendedor = String(row['Vendedor'] || '').replace(/^["']|["']$/g, '').trim();
          if (
            vendedor === 'CUENTAS CLAVE 1' ||
            vendedor === 'CUENTAS CLAVE 1 - MC' ||
            vendedor === 'MARIANA CHACIN' ||
            vendedor === 'CUENTAS CLAVE 1 - MC (MARIANA CHACIN)'
          ) {
            vendedor = 'CUENTAS CLAVE 1 - MC';
          }
          if (
            vendedor === 'CUENTAS CLAVE 2' ||
            vendedor === 'CUENTAS CLAVE 2 - SV' ||
            vendedor === 'SAIRU VALLES' ||
            vendedor === 'CUENTAS CLAVE 2 - SV (SAIRU VALLES)'
          ) {
            vendedor = 'CUENTAS CLAVE 2 - SV';
          }
          if (vendedor === 'FOOD SERVICE NORTE') {
            vendedor = 'JAIDER MEDINA - FOOD SERVICE NORTE';
          }
          if (vendedor === 'FOOD SERVICE SENIOR') {
            vendedor = 'FOOD SERVICE SENIOR - JUAN HERNANDEZ';
          }

          const m = parseFloat(mStr.replace(/["',]/g, '')) || 0;
          const u = parseFloat(uStr.replace(/["',]/g, '')) || 0;
          const c = parseFloat(cStr.replace(/["',]/g, '')) || 0;
          const k = parseFloat(kStr.replace(/["',]/g, '')) || 0;
          
          if (!isNaN(m)) facturacion += m;
          if (!isNaN(u)) utilidad += u;
          if (!isNaN(c)) cajas += c;
          if (!isNaN(k)) kg += k;

          if (dateOnly !== 'Sin Fecha') {
            factRows.push({
              fecha: dateOnly,
              idCliente,
              idArt,
              vendedor,
              cajas: c,
              unidades: 0,
              kg: k,
              monto: m,
              costo: 0,
              utilidad: u
            });
          }
          
          if (dateOnly !== 'Sin Fecha') {
            if (!trends.has(dateOnly)) {
              trends.set(dateOnly, { date: dateOnly, ventas: 0, kg: 0, kgFacturado: 0, kgDespachado: 0 });
            }
            const t = trends.get(dateOnly)!;
            if (!isNaN(m)) t.ventas += m;
            if (!isNaN(k)) {
               t.kg += k;
               t.kgFacturado += k;
               t.kgDespachado += k; // Kg is used for despachado visually
            }
          }

          if (idArt && dateOnly !== 'Sin Fecha') {
            const aggKey = `${idArt}|${dateOnly}`;
            if (!prodAgg.has(aggKey)) {
              prodAgg.set(aggKey, { idArt, date: dateOnly, facturado: 0, montoFA: 0, montoDV: 0, despachado: 0, kgFacturado: 0, kgDespachado: 0 });
            }
            const p = prodAgg.get(aggKey)!;
            
            if (!isNaN(m)) {
               p.facturado += m;
               if (m < 0) p.montoDV += m;
               else p.montoFA += m;
            }
            if (!isNaN(k)) {
               p.kgFacturado += k;
               p.kgDespachado += k; 
            }
          }
        });

        const freshData = { facturacion, utilidad, cajas, kg, isLoading: false };
        setKpiData(freshData);
        setRawFacturacionRows(factRows);
        
        const sortedTrends = Array.from(trends.values()).sort((a, b) => a.date.localeCompare(b.date));
        setTrendData(sortedTrends);

        const pArr = Array.from(prodAgg.values())
          .map((p) => {
            const baseName = resolveCatalogProductName(p.idArt, undefined, productMap);
            return {
                idArt: p.idArt,
                baseName,
                facturado: p.facturado,
                montoFA: p.montoFA,
                montoDV: p.montoDV,
                despachado: p.kgDespachado,
                kgFacturado: p.kgFacturado,
                date: p.date
            };
          });

        setRawProductData(pArr);
        
        try {
          localStorage.setItem('app_kpi_cache', JSON.stringify({ facturacion, utilidad, cajas, kg }));
        } catch {
          // ignore
        }

        if (forceRefresh) {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setLastSheetSync(nowStr);
          try {
            localStorage.setItem('app_last_sheets_sync', nowStr);
          } catch {}
          setSheetSyncSuccessMessage('Google Sheets sincronizado exitosamente con el dashboard.');
          setTimeout(() => setSheetSyncSuccessMessage(null), 4000);
        }
      } catch (e) {
        console.warn("Notice: Using cached KPIs data:", e);
        setKpiData(prev => ({ ...prev, isLoading: false }));
      }
    },
    []
  );

  React.useEffect(() => {
    fetchKpis(false);
  }, [fetchKpis]);

  const handleManualSyncSheets = async () => {
    if (isSyncingSheets) return;
    setIsSyncingSheets(true);
    try {
      await fetchKpis(true);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const productData = React.useMemo(() => {
    let filtered = combinedProductData;
    
    // Apply top date range filter if active
    if (appliedFilters.startDate) {
      filtered = filtered.filter(p => p.date >= appliedFilters.startDate);
    }
    if (appliedFilters.endDate) {
      filtered = filtered.filter(p => p.date <= appliedFilters.endDate);
    }

    if (selectedSkus.length > 0) {
      filtered = filtered.filter(p => selectedSkus.includes(p.idArt));
    } else if (skuFilter) {
      const lowerFilter = skuFilter.toLowerCase();
      filtered = filtered.filter(p => 
        p.idArt.toLowerCase().includes(lowerFilter) || 
        p.baseName.toLowerCase().includes(lowerFilter)
      );
    }
    
    const mapGroupDate = (date: string) => {
      if (!date) return 'Sin Fecha';
      if (timeView === 'month' && date.split('-').length === 3) {
        return date.split('-').slice(0, 2).join('-');
      }
      return date.split(' ')[0];
    };

    const mapDisplayDate = (date: string) => {
      if (!date) return 'Sin Fecha';
      const parts = date.split('-');
      if (parts.length === 3) {
        if (timeView === 'month') return `${parts[1]}/${parts[0]}`;
        return `${parts[2]}/${parts[1]}`;
      }
      return date;
    };

    // If 2 periods are selected: Specialized Comparative Dual-Period Data Structure
    if (selectedTimeGroups.length === 2) {
      const [m1, m2] = [...selectedTimeGroups].sort((a, b) => a.localeCompare(b));
      
      const productMap = new Map<string, {
        idArt: string;
        baseName: string;
        m1Facturado: number;
        m2Facturado: number;
        m1Kg: number;
        m2Kg: number;
        m1FA: number;
        m1DV: number;
        m2FA: number;
        m2DV: number;
      }>();

      filtered.forEach(p => {
        const gd = mapGroupDate(p.date);
        if (gd !== m1 && gd !== m2) return;
        if (!productMap.has(p.idArt)) {
          productMap.set(p.idArt, {
            idArt: p.idArt,
            baseName: p.baseName,
            m1Facturado: 0,
            m2Facturado: 0,
            m1Kg: 0,
            m2Kg: 0,
            m1FA: 0,
            m1DV: 0,
            m2FA: 0,
            m2DV: 0,
          });
        }
        const item = productMap.get(p.idArt)!;
        const amt = Number(p.facturado) || 0;
        const kg = Number(p.despachado) || Number(p.kgFacturado) || 0;
        const fa = Number(p.montoFA) || amt;
        const dv = Number(p.montoDV) || 0;

        if (gd === m1) {
          item.m1Facturado += amt;
          item.m1Kg += kg;
          item.m1FA += fa;
          item.m1DV += dv;
        } else if (gd === m2) {
          item.m2Facturado += amt;
          item.m2Kg += kg;
          item.m2FA += fa;
          item.m2DV += dv;
        }
      });

      let list = Array.from(productMap.values());

      // Sort strictly based on user's selected metric:
      if (productSortMetric === 'facturado') {
        list.sort((a, b) => Math.max(b.m1Facturado, b.m2Facturado) - Math.max(a.m1Facturado, a.m2Facturado));
      } else {
        list.sort((a, b) => Math.max(b.m1Kg, b.m2Kg) - Math.max(a.m1Kg, a.m2Kg));
      }

      if (showTop5 && selectedSkus.length === 0) {
        list = list.slice(0, 5);
      } else if (selectedSkus.length === 0) {
        list = list.slice(0, 25);
      }

      return list.map(p => {
        let shortName = p.baseName;
        if (shortName.length > 20) shortName = shortName.substring(0, 18) + '...';

        const diffFact = p.m2Facturado - p.m1Facturado;
        const pctFact = p.m1Facturado > 0 ? (diffFact / p.m1Facturado) * 100 : (p.m2Facturado > 0 ? 100 : 0);
        const diffKg = p.m2Kg - p.m1Kg;
        const pctKg = p.m1Kg > 0 ? (diffKg / p.m1Kg) * 100 : (p.m2Kg > 0 ? 100 : 0);

        return {
          idArt: p.idArt,
          name: shortName,
          fullName: p.baseName,
          originalName: p.baseName,
          // In thousands for charts ($k and k kg)
          m1FacturadoK: Number((p.m1Facturado / 1000).toFixed(2)),
          m2FacturadoK: Number((p.m2Facturado / 1000).toFixed(2)),
          m1KgK: Number((p.m1Kg / 1000).toFixed(2)),
          m2KgK: Number((p.m2Kg / 1000).toFixed(2)),
          // Exact amounts
          m1Facturado: p.m1Facturado,
          m2Facturado: p.m2Facturado,
          m1Kg: p.m1Kg,
          m2Kg: p.m2Kg,
          diffFacturado: diffFact,
          pctFacturado: pctFact,
          diffKg: diffKg,
          pctKg: pctKg,
          // Fallbacks for standard axis/tooltips
          facturado: Number(((p.m2Facturado || p.m1Facturado) / 1000).toFixed(2)),
          despachado: Number(((p.m2Kg || p.m1Kg) / 1000).toFixed(2)),
          rawFacturado: p.m2Facturado || p.m1Facturado,
          kgFacturado: p.m2Kg || p.m1Kg,
          date: `${m1} vs ${m2}`
        };
      });
    }

    // Standard View: Single month or Consolidated
    let groupsToShow = selectedTimeGroups;
    if (groupsToShow.length === 0 && availableGroups.length > 0) {
      groupsToShow = [availableGroups[0]];
    }

    if (groupsToShow.length > 0) {
      filtered = filtered.filter(p => groupsToShow.includes(mapGroupDate(p.date)));
    }

    let allowedIdArts: Set<string> | null = null;
    if (showTop5 && selectedSkus.length === 0) {
      const byDate = new Map<string, Map<string, { facturado: number; kg: number }>>();
      filtered.forEach(p => {
        const gd = mapGroupDate(p.date);
        if (!byDate.has(gd)) byDate.set(gd, new Map());
        const dMap = byDate.get(gd)!;
        if (!dMap.has(p.idArt)) dMap.set(p.idArt, { facturado: 0, kg: 0 });
        const cur = dMap.get(p.idArt)!;
        cur.facturado += (Number(p.facturado) || 0);
        cur.kg += (Number(p.despachado) || Number(p.kgFacturado) || 0);
      });
      
      allowedIdArts = new Set();
      byDate.forEach((dMap, gd) => {
        const sorted = Array.from(dMap.entries()).sort((a, b) => {
          if (productSortMetric === 'despachado') {
            return b[1].kg - a[1].kg;
          }
          return b[1].facturado - a[1].facturado;
        });
        sorted.slice(0, 5).forEach(x => allowedIdArts!.add(`${x[0]}|${gd}`));
      });
    }

    const grouped = new Map<string, any>();
    filtered.forEach(p => {
      let groupDate = mapGroupDate(p.date);
      let displayDate = mapDisplayDate(p.date);
      
      if (allowedIdArts && !allowedIdArts.has(`${p.idArt}|${groupDate}`)) return;
      
      const aggKey = `${p.idArt}|${groupDate}`;
      if (!grouped.has(aggKey)) {
        let name = p.baseName;
        if (name.length > 20) name = name.substring(0, 17) + '...';
        
        if (groupsToShow.length > 1) {
          name = `${name} (${displayDate})`;
        }
        
        grouped.set(aggKey, {
          idArt: p.idArt,
          groupDate,
          name,
          fullName: p.baseName,
          originalName: p.baseName,
          facturado: 0,
          despachado: 0,
          kgFacturado: 0,
          rawFacturado: 0,
          date: groupDate
        });
      }
      
      const g = grouped.get(aggKey)!;
      const amt = Number(p.facturado) || 0;
      const kg = Number(p.despachado) || Number(p.kgFacturado) || 0;
      g.facturado += (amt / 1000);
      g.despachado += (kg / 1000);
      g.kgFacturado += kg;
      g.rawFacturado += amt;
    });
    
    let result = Array.from(grouped.values());
    
    result.sort((a, b) => {
      if (productSortMetric === 'despachado') {
        return b.kgFacturado - a.kgFacturado;
      }
      return b.rawFacturado - a.rawFacturado;
    });

    if (!showTop5 && selectedSkus.length === 0) {
      result = result.slice(0, 35);
    }
    
    return result;
  }, [combinedProductData, skuFilter, showTop5, timeView, selectedTimeGroups, availableGroups, selectedSkus, productSortMetric, appliedFilters]);

  // Dynamically filtered KPIs reflecting active filters (dates, vendor, client/search, time groups)
  const activeKpis = React.useMemo(() => {
    let filtered = rawFacturacionRows;

    const hasDateRange = Boolean(appliedFilters.startDate || appliedFilters.endDate);
    const hasVendor = Boolean(appliedFilters.vendor && appliedFilters.vendor !== 'ALL');
    const hasSearch = Boolean(appliedFilters.search.trim());
    const hasTimeGroups = selectedTimeGroups.length > 0;

    if (hasDateRange) {
      if (appliedFilters.startDate) {
        filtered = filtered.filter(r => r.fecha >= appliedFilters.startDate);
      }
      if (appliedFilters.endDate) {
        filtered = filtered.filter(r => r.fecha <= appliedFilters.endDate);
      }
    } else if (hasTimeGroups) {
      if (timeView === 'day') {
        filtered = filtered.filter(r => selectedTimeGroups.includes(r.fecha));
      } else {
        filtered = filtered.filter(r => selectedTimeGroups.includes(r.fecha.slice(0, 7)));
      }
    }

    if (hasVendor) {
      filtered = filtered.filter(r => r.vendedor === appliedFilters.vendor);
    }

    if (hasSearch) {
      const q = appliedFilters.search.toLowerCase();
      filtered = filtered.filter(r =>
        r.idCliente.toLowerCase().includes(q) ||
        r.vendedor.toLowerCase().includes(q) ||
        r.idArt.toLowerCase().includes(q)
      );
    }

    const isFiltered = hasDateRange || hasVendor || hasSearch || hasTimeGroups;

    if (!isFiltered) {
      return {
        facturacion: kpiData.facturacion,
        utilidad: kpiData.utilidad,
        cajas: kpiData.cajas,
        kg: kpiData.kg,
        isFiltered: false,
        count: rawFacturacionRows.length,
        isLoading: kpiData.isLoading
      };
    }

    let facturacion = 0;
    let utilidad = 0;
    let cajas = 0;
    let kg = 0;

    filtered.forEach(r => {
      facturacion += r.monto;
      utilidad += r.utilidad;
      cajas += r.cajas;
      kg += r.kg;
    });

    return {
      facturacion,
      utilidad,
      cajas,
      kg,
      isFiltered: true,
      count: filtered.length,
      isLoading: kpiData.isLoading
    };
  }, [rawFacturacionRows, appliedFilters, selectedTimeGroups, timeView, kpiData]);

  // Dynamically filtered trend chart data
  const activeTrendData = React.useMemo(() => {
    let list = trendData;
    if (appliedFilters.startDate || appliedFilters.endDate) {
      list = list.filter(t => {
        if (appliedFilters.startDate && t.date < appliedFilters.startDate) return false;
        if (appliedFilters.endDate && t.date > appliedFilters.endDate) return false;
        return true;
      });
    } else if (selectedTimeGroups.length > 0 && timeView === 'day') {
      list = list.filter(t => selectedTimeGroups.includes(t.date));
    }
    return list;
  }, [trendData, appliedFilters, selectedTimeGroups, timeView]);
  
  const monthComparisonData = React.useMemo(() => {
    if (selectedTimeGroups.length !== 2) return null;
    
    // m1 is base period (older), m2 is target period (newer)
    const [m1, m2] = [...selectedTimeGroups].sort((a, b) => a.localeCompare(b));
    
    const allData = combinedProductData;
    
    const mapGroupDate = (date: string) => {
      if (!date) return '';
      if (timeView === 'month' && date.split('-').length === 3) {
        return date.split('-').slice(0, 2).join('-');
      }
      return date.split(' ')[0];
    };
    
    // 1. Calculate overall company totals for both months
    let totalM1 = 0;
    let totalM2 = 0;
    let totalKgM1 = 0;
    let totalKgM2 = 0;
    let totalFAM1 = 0;
    let totalFAM2 = 0;
    let totalDVM1 = 0;
    let totalDVM2 = 0;
    
    allData.forEach(p => {
      const gDate = mapGroupDate(p.date);
      const amt = Number(p.facturado) || 0;
      const kg = Number(p.despachado) || Number(p.kgFacturado) || 0;
      const fa = Number(p.montoFA) || amt;
      const dv = Number(p.montoDV) || 0;

      if (gDate === m1) {
        totalM1 += amt;
        totalKgM1 += kg;
        totalFAM1 += fa;
        totalDVM1 += dv;
      } else if (gDate === m2) {
        totalM2 += amt;
        totalKgM2 += kg;
        totalFAM2 += fa;
        totalDVM2 += dv;
      }
    });
    
    const diffTotal = totalM2 - totalM1;
    const pctTotal = totalM1 > 0 ? (diffTotal / totalM1) * 100 : (totalM2 > 0 ? 100 : 0);
    const diffKgTotal = totalKgM2 - totalKgM1;
    const pctKgTotal = totalKgM1 > 0 ? (diffKgTotal / totalKgM1) * 100 : (totalKgM2 > 0 ? 100 : 0);
    
    // Price per kg metrics
    const avgPriceM1 = totalKgM1 > 0 ? totalM1 / totalKgM1 : 0;
    const avgPriceM2 = totalKgM2 > 0 ? totalM2 / totalKgM2 : 0;
    const diffPriceKg = avgPriceM2 - avgPriceM1;
    const pctPriceKg = avgPriceM1 > 0 ? (diffPriceKg / avgPriceM1) * 100 : 0;

    // Variance Analysis (Efecto Volumen vs Efecto Precio/Mix)
    const efectoVolumenUSD = diffKgTotal * avgPriceM1;
    const efectoPrecioMixUSD = diffTotal - efectoVolumenUSD;
    const volumenDominante = Math.abs(efectoVolumenUSD) >= Math.abs(efectoPrecioMixUSD);

    // 2. Extract products shown in chart or relevant to comparison
    const graphedMap = new Map<string, { idArt: string; name: string }>();
    productData.forEach(p => {
      if (p.idArt && !graphedMap.has(p.idArt)) {
        graphedMap.set(p.idArt, {
          idArt: p.idArt,
          name: p.fullName || p.originalName || p.name
        });
      }
    });
    
    // 3. For each graphed product, accumulate exact values for m1 and m2
    const productStats = new Map<string, {
      idArt: string;
      name: string;
      m1Facturado: number;
      m2Facturado: number;
      m1Kg: number;
      m2Kg: number;
      m1FA: number;
      m1DV: number;
      m2FA: number;
      m2DV: number;
    }>();
    
    graphedMap.forEach((info, idArt) => {
      productStats.set(idArt, {
        idArt,
        name: info.name,
        m1Facturado: 0,
        m2Facturado: 0,
        m1Kg: 0,
        m2Kg: 0,
        m1FA: 0,
        m1DV: 0,
        m2FA: 0,
        m2DV: 0
      });
    });
    
    allData.forEach(p => {
      const gDate = mapGroupDate(p.date);
      if (gDate !== m1 && gDate !== m2) return;
      if (!productStats.has(p.idArt)) return;
      
      const stat = productStats.get(p.idArt)!;
      const amt = Number(p.facturado) || 0;
      const kg = Number(p.despachado) || Number(p.kgFacturado) || 0;
      const fa = Number(p.montoFA) || amt;
      const dv = Number(p.montoDV) || 0;
      
      if (gDate === m1) {
        stat.m1Facturado += amt;
        stat.m1Kg += kg;
        stat.m1FA += fa;
        stat.m1DV += dv;
      } else if (gDate === m2) {
        stat.m2Facturado += amt;
        stat.m2Kg += kg;
        stat.m2FA += fa;
        stat.m2DV += dv;
      }
    });
    
    const products = Array.from(productStats.values()).map(p => {
      const diff = p.m2Facturado - p.m1Facturado;
      const pct = p.m1Facturado > 0 
        ? (diff / p.m1Facturado) * 100 
        : (p.m2Facturado > 0 ? 100 : 0);
      const diffKg = p.m2Kg - p.m1Kg;
      const pctKg = p.m1Kg > 0 
        ? (diffKg / p.m1Kg) * 100 
        : (p.m2Kg > 0 ? 100 : 0);

      // Causal detection flags
      const isReturnAnomaly = p.m2Facturado < 0 || (p.m2FA > 0 && p.m2DV < 0 && Math.abs(p.m2DV) >= p.m2FA * 0.5);
      const isSkuSubstitution = p.name.includes('AZUCAR BLANCA') || (diff < -50000 && p.m2Facturado < 1000);
      
      let causeLabel = '';
      if (isReturnAnomaly) {
        causeLabel = 'Ajuste contable por notas de crédito / devoluciones de periodos previos';
      } else if (isSkuSubstitution) {
        causeLabel = 'Sustitución de presentación (migración hacia nuevo SKU)';
      } else if (Math.abs(diffKg) > 1000 && (diff > 0 === diffKg > 0)) {
        causeLabel = diffKg > 0 
          ? `Mayor volumen físico entregado (+${diffKg.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg)`
          : `Menor despacho de volumen físico (${diffKg.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg)`;
      } else {
        causeLabel = 'Variación en mezcla comercial y precio promedio';
      }
          
      return {
        ...p,
        diff,
        pct,
        diffKg,
        pctKg,
        isReturnAnomaly,
        isSkuSubstitution,
        causeLabel
      };
    });
    
    const byGrowth = [...products]
      .filter(p => p.diff > 0)
      .sort((a, b) => b.diff - a.diff);
        
    const byDrop = [...products]
      .filter(p => p.diff < 0)
      .sort((a, b) => a.diff - b.diff);
        
    const allProducts = [...products].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    
    const formatPeriodName = (mStr: string) => {
      const parts = mStr.split('-');
      const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      if (parts.length === 3) {
        const mes = MONTH_NAMES[parseInt(parts[1]) - 1] || parts[1];
        return `${parseInt(parts[2])} de ${mes} ${parts[0]}`;
      }
      if (parts.length === 2) {
        const mes = MONTH_NAMES[parseInt(parts[1]) - 1] || parts[1];
        return `${mes} ${parts[0]}`;
      }
      return mStr;
    };

    const formatPeriodShort = (mStr: string) => {
      const parts = mStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      if (parts.length === 2) {
        const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const mes = MONTH_NAMES[parseInt(parts[1]) - 1] || parts[1];
        return `${mes} ${parts[0]}`;
      }
      return mStr;
    };
    
    const m1Label = formatPeriodName(m1);
    const m2Label = formatPeriodName(m2);
    const m1LabelShort = formatPeriodShort(m1);
    const m2LabelShort = formatPeriodShort(m2);

    return {
      m1,
      m2,
      m1Label,
      m2Label,
      m1LabelShort,
      m2LabelShort,
      totalM1,
      totalM2,
      totalKgM1,
      totalKgM2,
      totalFAM1,
      totalFAM2,
      totalDVM1,
      totalDVM2,
      diffTotal,
      pctTotal,
      diffKgTotal,
      pctKgTotal,
      avgPriceM1,
      avgPriceM2,
      diffPriceKg,
      pctPriceKg,
      efectoVolumenUSD,
      efectoPrecioMixUSD,
      volumenDominante,
      byGrowth,
      byDrop,
      allProducts,
      evaluatedCount: products.length
    };
  }, [selectedTimeGroups, timeView, productData, combinedProductData]);

  const topProductsAvailableMonths = React.useMemo(() => {
    const months = new Set<string>();
    
    // Include all months present in historicalData or rawProductData
    combinedProductData.forEach(p => {
      if (p.date) {
        const parts = p.date.split('-');
        if (parts.length >= 2) {
          months.add(`${parts[0]}-${parts[1]}`);
        }
      }
    });

    // Always include current year up to current month to show all options
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    for (let i = currentMonth; i >= 1; i--) {
        months.add(`${currentYear}-${i.toString().padStart(2, '0')}`);
    }

    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [combinedProductData]);

  const MONTH_NAMES_SPANISH: Record<string, string> = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
  };

  const getMonthFullLabel = (key: string) => {
    if (key === 'ALL') return 'Consolidado General (Todos los Meses)';
    const parts = key.split('-');
    if (parts.length === 2) {
      const mName = MONTH_NAMES_SPANISH[parts[1]] || parts[1];
      return `${mName} ${parts[0]}`;
    }
    return key;
  };

  const monthChartsData = React.useMemo(() => {
    const allData = combinedProductData;
    const PIE_COLORS = ['#dc2626', '#991b1b', '#ffffff'];

    // If specific months are selected, show one chart for each selected month (newest to oldest)
    // If "Todos" is selected (empty array), show one consolidated chart
    let targetKeys: string[] = [];
    if (topProductsMonthFilters.length > 0) {
      targetKeys = [...topProductsMonthFilters].sort((a, b) => b.localeCompare(a));
    } else {
      targetKeys = ['ALL'];
    }

    return targetKeys.map(mKey => {
      const productMap = new Map<string, { name: string; value: number }>();
      let totalMonthSales = 0;
      let totalMonthFA = 0;
      let totalMonthDV = 0;

      allData.forEach(p => {
        let groupDate = p.date;
        const dateParts = p.date.split('-');
        if (dateParts.length >= 2) {
          groupDate = `${dateParts[0]}-${dateParts[1]}`;
        }

        if (mKey !== 'ALL' && groupDate !== mKey) {
          return;
        }

        const amt = p.facturado || 0;
        totalMonthSales += amt;
        totalMonthFA += (p.montoFA || amt);
        totalMonthDV += (p.montoDV || 0);

        if (!productMap.has(p.idArt)) {
          productMap.set(p.idArt, { name: p.baseName, value: 0 });
        }
        productMap.get(p.idArt)!.value += amt;
      });

      const sorted = Array.from(productMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

      const products = sorted.map((p, i) => ({
        ...p,
        color: PIE_COLORS[i % PIE_COLORS.length],
        percentage: totalMonthSales > 0 ? (p.value / totalMonthSales) * 100 : 0
      }));

      return {
        monthKey: mKey,
        monthLabel: getMonthFullLabel(mKey),
        totalMonthSales,
        totalMonthFA,
        totalMonthDV,
        products
      };
    });
  }, [topProductsMonthFilters, combinedProductData]);

  const topProductsPieData = React.useMemo(() => {
    return monthChartsData.length > 0 ? monthChartsData[0].products : [];
  }, [monthChartsData]);

  const formatUSD = (val: number) => {
    return 'USD ' + val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  
  const formatNum = (val: number) => {
    return val.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  };

  const generateAIAnalysis = async () => {
    if (monthChartsData.length === 0) return;
    setIsAnalyzing(true);
    setAiAnalysis(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const payloadData = monthChartsData.map(m => ({
        mes: m.monthLabel,
        totalVentasMesUSD: m.totalMonthSales,
        topProductos: m.products.map(p => ({
          producto: p.name,
          montoUSD: p.value,
          participacion: p.percentage.toFixed(1) + '%'
        }))
      }));

      const res = await fetch('/api/analyze-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          salesData: payloadData,
          months: monthChartsData.map(m => m.monthLabel)
        })
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data.analysis);
      } else {
        const errData = await res.json().catch(() => ({}));
        setAiAnalysis(errData.error || 'El servicio de análisis IA está ocupado temporalmente. Por favor intenta de nuevo en unos momentos.');
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error(e);
      if (e.name === 'AbortError') {
        setAiAnalysis('El tiempo de espera expiró. Puedes reintentar el análisis haciendo clic en "Re-analizar".');
      } else {
        setAiAnalysis('No se pudo completar el análisis en este momento. Intenta nuevamente.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pctUtilidad = kpiData.facturacion > 0 ? (kpiData.utilidad / kpiData.facturacion) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 font-sans text-zinc-100 max-w-[1600px] mx-auto pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] flex flex-wrap items-center gap-1.5 md:gap-2">
            <span className="text-white">DASHBOARD</span>
            <span className="text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]">GERENCIA</span>
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Dashboard consolidado de métricas operativas y de ventas sincronizado con Google Sheets.
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualSyncSheets}
          disabled={isSyncingSheets}
          className="inline-flex items-center gap-2 self-start sm:self-auto px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          title="Actualizar datos desde Google Sheets en tiempo real"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-red-500 ${isSyncingSheets ? 'animate-spin' : ''}`} />
          <span>{isSyncingSheets ? 'Sincronizando...' : 'Sincronizar Google Sheets'}</span>
          {lastSheetSync && (
            <span className="text-[10px] text-zinc-400 font-normal ml-1">
              ({lastSheetSync})
            </span>
          )}
        </button>
      </div>

      {/* Sync Notification Banner */}
      {sheetSyncSuccessMessage && (
        <div className="bg-zinc-900 border border-white/20 rounded-lg p-3 flex items-center gap-2 text-xs text-white animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-red-500 shrink-0" />
          <span>{sheetSyncSuccessMessage}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-zinc-950/40 border border-white/5 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative w-full lg:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input 
              type="text" 
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Buscar por cliente, SKU o vendedor..." 
              className="w-full bg-black/50 border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:flex items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full">
              <input 
                type="date" 
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                placeholder="Desde" 
                title="Fecha inicio"
                className="bg-black/50 border border-white/10 rounded-md px-2.5 py-2 text-xs sm:text-sm text-zinc-200 w-full lg:w-36 focus:outline-none focus:border-red-500 text-center [color-scheme:dark]" 
              />
            </div>
            <div className="relative w-full">
              <input 
                type="date" 
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                placeholder="Hasta" 
                title="Fecha fin"
                className="bg-black/50 border border-white/10 rounded-md px-2.5 py-2 text-xs sm:text-sm text-zinc-200 w-full lg:w-36 focus:outline-none focus:border-red-500 text-center [color-scheme:dark]" 
              />
            </div>
            <select 
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="col-span-2 sm:col-span-1 bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-red-500 appearance-none w-full lg:min-w-[160px]"
            >
              <option value="ALL">Vendedor: Todos</option>
              {availableVendors.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select 
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
              className="col-span-2 sm:col-span-1 md:col-span-1 bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-red-500 appearance-none w-full lg:min-w-[140px]"
            >
              <option value="ALL">Zona: Todas</option>
              <option value="NORTE">Zona Norte</option>
              <option value="SUR">Zona Sur</option>
              <option value="CENTRO">Zona Centro</option>
              <option value="OCCIDENTE">Zona Occidente</option>
              <option value="ORIENTE">Zona Oriente</option>
            </select>
          </div>
        </div>
        
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-white/5 pt-4">
          <div className="text-xs text-zinc-400">
            {activeKpis.isFiltered ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                Filtro activo ({activeKpis.count} operaciones evaluadas)
              </span>
            ) : (
              <span className="text-zinc-500">Mostrando consolidado general de operaciones</span>
            )}
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={handleClearFilters}
              type="button"
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 rounded-md bg-zinc-900 border border-white/10 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
              Limpiar Filtros
            </button>
            <button 
              onClick={handleExecuteFilters}
              type="button"
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2 rounded-md bg-red-600 hover:bg-red-700 text-sm font-bold text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              Ejecutar
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
        {[
          { id: 'facturacion', label: 'FACTURACIÓN TOTAL', value: activeKpis.isLoading ? 'Cargando...' : formatUSD(activeKpis.facturacion), icon: DollarSign, color: 'text-red-500' },
          { id: 'utilidad', label: 'UTILIDAD BRUTA', value: activeKpis.isLoading ? 'Cargando...' : formatUSD(activeKpis.utilidad), icon: TrendingUp, color: 'text-zinc-400' },
          { id: 'margen', label: '% UTILIDAD', value: activeKpis.isLoading ? 'Cargando...' : formatNum(activeKpis.facturacion > 0 ? (activeKpis.utilidad / activeKpis.facturacion) * 100 : 0) + '%', icon: Percent, color: 'text-zinc-400' },
          { id: 'cajas', label: 'CAJAS DESPACHADAS', value: activeKpis.isLoading ? 'Cargando...' : formatNum(activeKpis.cajas), icon: Package, color: 'text-zinc-400' },
          { id: 'kilogramos', label: 'TOTAL KILOGRAMOS', value: activeKpis.isLoading ? 'Cargando...' : formatNum(activeKpis.kg), icon: Settings, color: 'text-red-500' }, 
        ].map((kpi, i) => {
          const isSelected = selectedKpi?.id === kpi.id;
          return (
            <div 
              key={i} 
              onClick={() => setSelectedKpi(isSelected ? null : { id: kpi.id, label: kpi.label })}
              className={`bg-zinc-950/60 border rounded-xl p-3 sm:p-4 lg:p-5 flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgba(0,0,0,0.5)] cursor-pointer transition-all ${
                isSelected ? 'border-red-500 bg-red-950/20 shadow-[0_0_25px_rgba(220,38,38,0.2)]' : 'border-white/5 hover:border-white/20 hover:bg-zinc-900'
              }`}
            >
              <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-white/5 flex items-center justify-center mb-1.5 sm:mb-3 ${kpi.color}`}>
                <kpi.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold tracking-widest text-zinc-500 mb-0.5 sm:mb-1 line-clamp-1">{kpi.label}</p>
              <p className="text-lg sm:text-xl lg:text-2xl font-black text-white tracking-wide">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Gap Analysis Panel */}
      {selectedKpi && (
        <GapAnalysisPanel
          kpiId={selectedKpi.id}
          kpiLabel={selectedKpi.label}
          octoberKpis={{
            facturacion: kpiData.facturacion,
            utilidad: kpiData.utilidad,
            cajas: kpiData.cajas,
            kg: kpiData.kg,
          }}
          syncKey={lastSheetSync}
        />
      )}

      {/* Chart 1: Tendencia por Fecha */}
      <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">
          Tendencia por Fecha (Ventas vs Kilogramos)
        </h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={activeTrendData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
              <YAxis yAxisId="left" tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={10} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="left" dataKey="ventas" fill="url(#colorVentas)" barSize={30} radius={[6, 6, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="kg" stroke="#dc2626" strokeWidth={3} dot={{ r: 4, fill: '#dc2626', strokeWidth: 2, stroke: '#000' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span className="text-xs font-medium text-zinc-400">Kilogramos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-white"></div>
            <span className="text-xs font-medium text-zinc-400">Ventas</span>
          </div>
        </div>
      </div>

      {/* Chart 2: Facturado vs Despachado */}
      <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.5)] relative">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Facturado vs Despachado
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/10">
                {selectedSkus.length > 0 ? `${selectedSkus.length} SKUs` : showTop5 ? 'Top 5' : 'Todos'}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                productSortMetric === 'facturado' 
                  ? 'bg-red-950/40 border-red-500/30 text-red-400' 
                  : 'bg-zinc-900 border-white/20 text-white'
              }`}>
                {productSortMetric === 'facturado' ? 'Orden: Mayor Facturación ($)' : 'Orden: Mayor Despacho (KG)'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Evidencia de productos clave según los meses seleccionados y análisis de volumen vs valor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Control: Ordenar por Facturado vs Despachado */}
            <div className="flex bg-black/60 border border-white/10 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setProductSortMetric('facturado')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                  productSortMetric === 'facturado' 
                    ? 'bg-red-600 text-white shadow' 
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Ordenar por productos con mayor facturación en dólares"
              >
                <DollarSign className="w-3 h-3" />
                <span>Más Facturados ($)</span>
              </button>
              <button
                type="button"
                onClick={() => setProductSortMetric('despachado')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                  productSortMetric === 'despachado' 
                    ? 'bg-zinc-800 text-white border border-white/20 shadow' 
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Ordenar por productos con mayor volumen de kilogramos despachados"
              >
                <Scale className="w-3 h-3" />
                <span>Más Despachados (KG)</span>
              </button>
            </div>
            
            {/* Multi-select de SKUs */}
            <div className="relative" ref={skuPickerRef}>
              <button 
                onClick={() => setShowSkuPicker(!showSkuPicker)}
                className={`flex items-center gap-1 bg-black/50 border ${selectedSkus.length > 0 ? 'border-red-500/50' : 'border-white/10'} rounded-md px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900 transition-colors h-[26px]`}
              >
                <Filter className="w-3 h-3 text-zinc-400" />
                {selectedSkus.length === 0 ? 'Filtrar SKUs' : `${selectedSkus.length} Productos`}
              </button>
              
              {showSkuPicker && (
                <div className="absolute right-0 lg:left-0 top-full mt-2 w-72 bg-zinc-950 border border-white/10 rounded-lg p-3 shadow-2xl z-50 flex flex-col gap-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-white">Seleccionar Productos</span>
                    {selectedSkus.length > 0 && (
                      <button onClick={() => { setSelectedSkus([]); setShowTop5(true); }} className="text-[10px] text-zinc-400 hover:text-white">
                        Limpiar
                      </button>
                    )}
                  </div>
                  
                  <input 
                      type="text" 
                      placeholder="Buscar producto..." 
                      value={skuFilter}
                      onChange={(e) => setSkuFilter(e.target.value)}
                      className="bg-black/50 border border-white/10 rounded-md px-2 py-1 text-xs text-zinc-300 w-full focus:outline-none focus:border-red-500 mb-2"
                  />

                  <div className="max-h-48 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    {availableSkus
                      .filter(sku => !skuFilter || sku[1].toLowerCase().includes(skuFilter.toLowerCase()) || sku[0].toLowerCase().includes(skuFilter.toLowerCase()))
                      .map(sku => (
                      <label key={sku[0]} className="flex items-center gap-2 text-[10px] text-zinc-300 hover:bg-white/5 p-1.5 rounded cursor-pointer transition-colors leading-tight">
                        <input 
                          type="checkbox" 
                          checked={selectedSkus.includes(sku[0])}
                          onChange={() => toggleSku(sku[0])}
                          className="rounded bg-black/50 border-white/10 text-red-600 focus:ring-red-500/20 w-3 h-3 flex-shrink-0"
                        />
                        <span className="truncate" title={sku[1]}>
                          {sku[1]}
                        </span>
                      </label>
                    ))}
                    {availableSkus.length === 0 && <div className="text-xs text-zinc-500 py-2">No hay productos</div>}
                  </div>
                </div>
              )}
            </div>

            <div className="flex bg-black/50 border border-white/10 rounded-md p-0.5">
              <button 
                onClick={() => setTimeView('day')}
                className={`px-3 py-1 text-xs font-bold rounded shadow transition-colors ${timeView === 'day' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>Día</button>
              <button 
                onClick={() => setTimeView('month')}
                className={`px-3 py-1 text-xs font-bold rounded shadow transition-colors ${timeView === 'month' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>Mes</button>
            </div>

            <div className="relative" ref={datePickerRef}>
              <button 
                onClick={() => setShowDatePicker(!showDatePicker)}
                className={`flex items-center gap-1 bg-black/50 border ${selectedTimeGroups.length > 0 ? 'border-red-500/50' : 'border-white/10'} rounded-md px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900 transition-colors h-[26px]`}
              >
                <CalendarIcon className="w-3 h-3 text-red-500" />
                {selectedTimeGroups.length === 0 ? 'Fechas (Todas)' : `${selectedTimeGroups.length} sel.`}
              </button>
              
              {showDatePicker && (
                <div className="absolute right-0 lg:left-0 top-full mt-2 w-64 bg-zinc-950 border border-white/10 rounded-lg p-3 shadow-2xl z-50 flex flex-col gap-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-white">Seleccionar {timeView === 'day' ? 'Días' : 'Meses'}</span>
                    {selectedTimeGroups.length > 0 && (
                      <button onClick={() => setSelectedTimeGroups([])} className="text-[10px] text-zinc-400 hover:text-white">
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    {availableGroups.length === 0 ? (
                      <div className="text-xs text-zinc-500 py-2">No hay datos</div>
                    ) : (
                      availableGroups.map(g => (
                        <label key={g} className="flex items-center gap-2 text-xs text-zinc-300 hover:bg-white/5 p-1.5 rounded cursor-pointer transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedTimeGroups.includes(g)}
                            onChange={() => toggleTimeGroup(g)}
                            className="rounded bg-black/50 border-white/10 text-red-600 focus:ring-red-500/20 w-3 h-3"
                          />
                          <span>
                            {timeView === 'month' ? (g.split('-').length === 2 ? `${g.split('-')[1]}/${g.split('-')[0]}` : g) : (g.split('-').length === 3 ? `${g.split('-')[2]}/${g.split('-')[1]}/${g.split('-')[0]}` : g)}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedSkus.length === 0 && (
              <div className="flex bg-black/50 border border-white/10 rounded-md p-0.5">
                <button 
                  onClick={() => setShowTop5(true)}
                  className={`px-3 py-1 text-xs font-bold rounded shadow transition-colors ${showTop5 ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}>Top 5</button>
                <button 
                  onClick={() => setShowTop5(false)}
                  className={`px-3 py-1 text-xs font-bold rounded shadow transition-colors ${!showTop5 ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}>Todos</button>
              </div>
            )}
          </div>
        </div>
        
        {monthComparisonData && (
          <div className="mt-6 mb-6 bg-zinc-950/90 border border-white/10 rounded-xl p-5 sm:p-6 shadow-2xl">
            {/* Header: Period Titles & Scope Indicator */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-5 mb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded flex items-center gap-1.5">
                    <FileText className="w-3 h-3 text-red-400" />
                    Diagnóstico Causal Comparativo
                  </span>
                  <span className="text-xs text-zinc-400 font-medium">
                    Evaluando los {monthComparisonData.evaluatedCount} productos líderes
                  </span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span className="text-zinc-300">{monthComparisonData.m1Label}</span>
                  <span className="text-zinc-500 font-normal text-sm">comparado con</span>
                  <span className="text-red-400">{monthComparisonData.m2Label}</span>
                </div>
              </div>

              {/* Action Button: View Full Comparison Table */}
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowFullComparisonTable(!showFullComparisonTable)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 font-medium transition-colors"
                >
                  <Table className="w-3.5 h-3.5 text-red-500" />
                  <span>{showFullComparisonTable ? 'Ocultar Auditoría Detallada' : `Ver Auditoría (${monthComparisonData.evaluatedCount} SKUs)`}</span>
                  {showFullComparisonTable ? <ChevronUp className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
                </button>
              </div>
            </div>

            {/* General Period KPIs Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3.5">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Total {monthComparisonData.m1LabelShort} (Base)
                </div>
                <div className="text-lg font-bold text-white font-mono">
                  {formatUSD(monthComparisonData.totalM1)}
                </div>
                <div className="text-xs text-zinc-400 mt-1 flex items-center justify-between">
                  <span>{formatNum(monthComparisonData.totalKgM1)} kg despachados</span>
                  <span className="font-mono text-zinc-500">${monthComparisonData.avgPriceM1.toFixed(2)}/kg</span>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3.5">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Total {monthComparisonData.m2LabelShort} (Comparado)
                </div>
                <div className="text-lg font-bold text-white font-mono">
                  {formatUSD(monthComparisonData.totalM2)}
                </div>
                <div className="text-xs text-zinc-400 mt-1 flex items-center justify-between">
                  <span>{formatNum(monthComparisonData.totalKgM2)} kg despachados</span>
                  <span className="font-mono text-zinc-500">${monthComparisonData.avgPriceM2.toFixed(2)}/kg</span>
                </div>
              </div>

              <div className={`border rounded-lg p-3.5 ${
                monthComparisonData.diffTotal >= 0 
                  ? 'bg-zinc-900 border-white/20' 
                  : 'bg-red-950/20 border-red-500/20'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Variación Neta Periodo
                  </span>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                    monthComparisonData.pctTotal >= 0 ? 'bg-zinc-800 text-white' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {monthComparisonData.pctTotal >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {monthComparisonData.pctTotal >= 0 ? '+' : ''}{monthComparisonData.pctTotal.toFixed(1)}%
                  </span>
                </div>
                <div className={`text-lg font-black font-mono ${monthComparisonData.diffTotal >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {monthComparisonData.diffTotal >= 0 ? '+' : '-'}{formatUSD(Math.abs(monthComparisonData.diffTotal))}
                </div>
                <div className="text-xs text-zinc-400 mt-1 flex items-center justify-between">
                  <span>Volumen: {monthComparisonData.diffKgTotal >= 0 ? '+' : ''}{formatNum(monthComparisonData.diffKgTotal)} kg</span>
                  <span className="font-semibold text-zinc-300">({monthComparisonData.pctKgTotal >= 0 ? '+' : ''}{monthComparisonData.pctKgTotal.toFixed(1)}%)</span>
                </div>
              </div>
            </div>

            {/* SECCIÓN EXPLICATIVA CAUSAL: ¿POR QUÉ SE VENDIÓ MÁS O MENOS? */}
            <div className="mb-6 bg-black/50 border border-white/10 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4 text-red-500" />
                <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  ¿Por qué {monthComparisonData.diffTotal >= 0 ? 'se vendió más' : 'se vendió menos'} en {monthComparisonData.m2LabelShort} respecto a {monthComparisonData.m1LabelShort}?
                </h4>
              </div>

              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mb-4">
                {monthComparisonData.diffTotal < 0 ? (
                  <>
                    La venta total presentó una contracción de <span className="text-red-400 font-bold font-mono">-{formatUSD(Math.abs(monthComparisonData.diffTotal))} ({monthComparisonData.pctTotal.toFixed(1)}%)</span>. 
                    El factor determinante fue <span className="text-white font-semibold">{monthComparisonData.volumenDominante ? 'la caída en el volumen físico despachado' : 'la variación en precios y composición de pedidos'}</span>, 
                    con una reducción de <span className="text-red-400 font-mono font-semibold">{formatNum(Math.abs(monthComparisonData.diffKgTotal))} kg ({monthComparisonData.pctKgTotal.toFixed(1)}%)</span> entregados.
                  </>
                ) : (
                  <>
                    La venta total presentó una expansión de <span className="text-white font-bold font-mono">+{formatUSD(monthComparisonData.diffTotal)} (+{monthComparisonData.pctTotal.toFixed(1)}%)</span>. 
                    El factor determinante fue <span className="text-white font-semibold">{monthComparisonData.volumenDominante ? 'el aumento sustancial de volumen físico despachado' : 'la mejora en precio promedio por kilo y mezcla de productos'}</span>, 
                    con <span className="text-white font-mono font-semibold">+{formatNum(monthComparisonData.diffKgTotal)} kg (+{monthComparisonData.pctKgTotal.toFixed(1)}%)</span> entregados.
                  </>
                )}
              </p>

              {/* Descomposición Efecto Volumen vs Efecto Precio */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="bg-zinc-900/80 border border-white/5 rounded-lg p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-zinc-300" />
                      1. Efecto Volumen Físico
                    </span>
                    <span className={`font-mono text-xs font-bold ${monthComparisonData.efectoVolumenUSD >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {monthComparisonData.efectoVolumenUSD >= 0 ? '+' : ''}{formatUSD(monthComparisonData.efectoVolumenUSD)}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    {monthComparisonData.diffKgTotal >= 0
                      ? `El incremento de +${formatNum(monthComparisonData.diffKgTotal)} kg despachados aportó directamente +${formatUSD(monthComparisonData.efectoVolumenUSD)} al valor base del negocio.`
                      : `La disminución de ${formatNum(monthComparisonData.diffKgTotal)} kg despachados le restó ${formatUSD(Math.abs(monthComparisonData.efectoVolumenUSD))} al negocio calculado al precio base.`}
                  </p>
                </div>

                <div className="bg-zinc-900/80 border border-white/5 rounded-lg p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-red-500" />
                      2. Efecto Precio Medio & Mix
                    </span>
                    <span className={`font-mono text-xs font-bold ${monthComparisonData.efectoPrecioMixUSD >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {monthComparisonData.efectoPrecioMixUSD >= 0 ? '+' : ''}{formatUSD(monthComparisonData.efectoPrecioMixUSD)}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    {monthComparisonData.diffPriceKg >= 0
                      ? `El precio promedio por kilo aumentó de $${monthComparisonData.avgPriceM1.toFixed(2)} a $${monthComparisonData.avgPriceM2.toFixed(2)} (+${monthComparisonData.pctPriceKg.toFixed(1)}%), amortiguando favorablemente la facturación en +${formatUSD(monthComparisonData.efectoPrecioMixUSD)}.`
                      : `El precio promedio por kilo varió de $${monthComparisonData.avgPriceM1.toFixed(2)} a $${monthComparisonData.avgPriceM2.toFixed(2)} (${monthComparisonData.pctPriceKg.toFixed(1)}%), ajustando la recaudación en ${formatUSD(monthComparisonData.efectoPrecioMixUSD)}.`}
                  </p>
                </div>
              </div>

              {/* Aclaraciones Específicas de Auditoría (Anomalías y Sustituciones) */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Ajuste Contable por Devoluciones:</strong> En productos como <em>AZUCAR BLANCA</em>, durante {monthComparisonData.m2LabelShort} se liquidaron notas de crédito y devoluciones de despachos pasados que superaron la facturación corriente, arrojando saldo neto negativo.
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <Layers className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Sustitución de Presentaciones:</strong> Se evidencia rotación de catálogo donde la contracción de referencias históricas fue absorbida por nuevos SKUs (ej: migración hacia <em>AZUCAR VENCAMPO</em>), reteniendo volumen dentro de la misma categoría.
                  </span>
                </div>
              </div>
            </div>

            {/* Growth and Drop Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Mayor Crecimiento */}
              <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-zinc-800 text-white">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Productos con Mayor Crecimiento
                      </h4>
                      <span className="text-[10px] text-zinc-500">
                        {monthComparisonData.byGrowth.length} de {monthComparisonData.evaluatedCount} productos aumentaron
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {monthComparisonData.byGrowth.length > 0 ? (
                    monthComparisonData.byGrowth.slice(0, 4).map((p, i) => (
                      <div key={p.idArt || i} className="bg-black/50 border border-white/10 hover:border-white/30 transition-colors rounded-lg p-3">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <span className="text-xs font-bold text-zinc-100 line-clamp-1" title={p.name}>
                            {p.name}
                          </span>
                          <span className="text-xs font-black text-white whitespace-nowrap font-mono">
                            +{formatUSD(p.diff)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span className="text-zinc-500 font-mono">
                            {formatUSD(p.m1Facturado)} → {formatUSD(p.m2Facturado)}
                          </span>
                          <span className="font-semibold text-white bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">
                            +{p.pct.toFixed(1)}%
                          </span>
                        </div>
                        {(p.m1Kg > 0 || p.m2Kg > 0) && (
                          <div className="text-[10px] text-zinc-400 mt-1.5 flex items-center justify-between">
                            <span>Kilos: {formatNum(p.m1Kg)} → {formatNum(p.m2Kg)} kg</span>
                            <span className="font-mono text-zinc-200 font-semibold">{p.diffKg >= 0 ? '+' : ''}{formatNum(p.diffKg)} kg</span>
                          </div>
                        )}
                        <div className="mt-1.5 text-[10px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                          <span className="text-zinc-500">Motivo:</span>
                          <span className="text-zinc-300">{p.causeLabel}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-zinc-500 italic py-4 text-center">
                      Ningún producto registró crecimiento entre estos dos meses.
                    </div>
                  )}
                </div>
              </div>

              {/* Mayor Caída */}
              <div className="bg-zinc-900/60 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-red-950/40 text-red-500">
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider">
                        Productos con Mayor Caída
                      </h4>
                      <span className="text-[10px] text-zinc-500">
                        {monthComparisonData.byDrop.length} de {monthComparisonData.evaluatedCount} productos disminuyeron
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {monthComparisonData.byDrop.length > 0 ? (
                    monthComparisonData.byDrop.slice(0, 4).map((p, i) => (
                      <div key={p.idArt || i} className="bg-black/50 border border-red-500/20 hover:border-red-500/40 transition-colors rounded-lg p-3">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <span className="text-xs font-bold text-zinc-100 line-clamp-1" title={p.name}>
                            {p.name}
                          </span>
                          <span className="text-xs font-black text-red-400 whitespace-nowrap font-mono">
                            -{formatUSD(Math.abs(p.diff))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span className="text-zinc-500 font-mono">
                            {formatUSD(p.m1Facturado)} → {formatUSD(p.m2Facturado)}
                          </span>
                          <span className="font-semibold text-red-400 bg-red-950/40 px-1.5 py-0.5 rounded text-[10px]">
                            {p.pct.toFixed(1)}%
                          </span>
                        </div>
                        {(p.m1Kg > 0 || p.m2Kg > 0) && (
                          <div className="text-[10px] text-zinc-400 mt-1.5 flex items-center justify-between">
                            <span>Kilos: {formatNum(p.m1Kg)} → {formatNum(p.m2Kg)} kg</span>
                            <span className="font-mono text-red-400 font-semibold">{p.diffKg >= 0 ? '+' : ''}{formatNum(p.diffKg)} kg</span>
                          </div>
                        )}
                        <div className="mt-1.5 text-[10px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                          <span className="text-zinc-500">Motivo:</span>
                          <span className="text-zinc-300">{p.causeLabel}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-zinc-500 italic py-4 text-center">
                      Ningún producto registró caída entre estos dos meses.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Collapsible Complete Audit Table */}
            {showFullComparisonTable && (
              <div className="mt-6 border border-white/10 rounded-xl overflow-hidden bg-black/60 shadow-xl">
                <div className="px-4 py-3 bg-zinc-900/90 border-b border-white/10 flex items-center justify-between">
                  <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Table className="w-3.5 h-3.5 text-red-500" />
                    Auditoría Comparativa Detallada ({monthComparisonData.evaluatedCount} SKUs)
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    Base ({monthComparisonData.m1LabelShort}) vs Comparado ({monthComparisonData.m2LabelShort})
                  </span>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-900 text-zinc-400 border-b border-white/5 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 text-zinc-300 font-semibold">Producto / SKU</th>
                        <th className="px-3 py-2.5 text-right text-zinc-300 font-semibold">{monthComparisonData.m1LabelShort} ($)</th>
                        <th className="px-3 py-2.5 text-right text-zinc-300 font-semibold">{monthComparisonData.m2LabelShort} ($)</th>
                        <th className="px-3 py-2.5 text-right text-zinc-300 font-semibold">Diferencia ($)</th>
                        <th className="px-3 py-2.5 text-right text-zinc-300 font-semibold">Var %</th>
                        <th className="px-3 py-2.5 text-right text-zinc-300 font-semibold">Kilos ({monthComparisonData.m1LabelShort} → {monthComparisonData.m2LabelShort})</th>
                        <th className="px-3 py-2.5 text-left text-zinc-300 font-semibold">Diagnóstico Causal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {monthComparisonData.allProducts.map((p, idx) => {
                        const isPos = p.diff >= 0;
                        return (
                          <tr key={p.idArt || idx} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-2 font-medium text-zinc-200">
                              <div className="line-clamp-1" title={p.name}>{p.name}</div>
                              {p.idArt && <div className="text-[10px] font-mono text-zinc-500">SKU: {p.idArt}</div>}
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-400 font-mono text-[11px]">
                              {formatUSD(p.m1Facturado)}
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-200 font-mono text-[11px] font-bold">
                              {formatUSD(p.m2Facturado)}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono text-[11px] font-bold ${isPos ? 'text-white' : 'text-red-400'}`}>
                              {isPos ? '+' : ''}{formatUSD(p.diff)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-[11px]">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isPos ? 'bg-zinc-800 text-white' : 'bg-red-500/20 text-red-400'
                              }`}>
                                {isPos ? '+' : ''}{p.pct.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-400 font-mono text-[11px]">
                              {formatNum(p.m1Kg)} → {formatNum(p.m2Kg)} kg
                              <span className={`ml-1 text-[10px] ${p.diffKg >= 0 ? 'text-zinc-200' : 'text-red-400'}`}>
                                ({p.diffKg >= 0 ? '+' : ''}{formatNum(p.diffKg)})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-left text-zinc-300 text-[10px]">
                              <span className="line-clamp-1" title={p.causeLabel}>{p.causeLabel}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONTROLES DE LA GRÁFICA COMPARATIVA (CUANDO HAY 2 MESES) */}
        {selectedTimeGroups.length === 2 && monthComparisonData && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-medium">Comparar en la gráfica:</span>
              <div className="flex bg-black/60 border border-white/10 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setComparisonChartMode('facturado')}
                  className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                    comparisonChartMode === 'facturado' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Facturación ($ USD)
                </button>
                <button
                  type="button"
                  onClick={() => setComparisonChartMode('despachado')}
                  className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                    comparisonChartMode === 'despachado' ? 'bg-zinc-800 text-white border border-white/20' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Despacho (KG)
                </button>
                <button
                  type="button"
                  onClick={() => setComparisonChartMode('ambos')}
                  className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                    comparisonChartMode === 'ambos' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Ambos
                </button>
              </div>
            </div>
            <span className="text-[11px] text-zinc-500">
              Barra oscura: {monthComparisonData.m1LabelShort} • Barra clara: {monthComparisonData.m2LabelShort}
            </span>
          </div>
        )}

        {/* GRÁFICA PRINCIPAL */}
        <div className="h-[400px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={productData} margin={{ top: 20, right: 20, bottom: 90, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
              <XAxis 
                dataKey="name" 
                interval={0} 
                angle={-45}
                textAnchor="end"
                height={85}
                tick={{ fill: '#71717a', fontSize: 10 }} 
                axisLine={false} 
                tickLine={false} 
                dy={10} 
              />
              
              {selectedTimeGroups.length === 2 && monthComparisonData ? (
                comparisonChartMode === 'facturado' ? (
                  <>
                    <YAxis yAxisId="left" tickFormatter={(v) => `$${v}k`} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                    <Tooltip content={<ProductTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                    <Bar yAxisId="left" dataKey="m1FacturadoK" name={`${monthComparisonData.m1LabelShort} ($k USD)`} fill="#991b1b" barSize={16} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="m2FacturadoK" name={`${monthComparisonData.m2LabelShort} ($k USD)`} fill="#ef4444" barSize={16} radius={[2, 2, 0, 0]} />
                  </>
                ) : comparisonChartMode === 'despachado' ? (
                  <>
                    <YAxis yAxisId="left" tickFormatter={(v) => `${v}k kg`} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                    <Tooltip content={<ProductTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                    <Bar yAxisId="left" dataKey="m1KgK" name={`${monthComparisonData.m1LabelShort} (k kg)`} fill="#0369a1" barSize={16} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="m2KgK" name={`${monthComparisonData.m2LabelShort} (k kg)`} fill="#38bdf8" barSize={16} radius={[2, 2, 0, 0]} />
                  </>
                ) : (
                  <>
                    <YAxis yAxisId="left" tickFormatter={(v) => `$${v}k`} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}k kg`} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={10} />
                    <Tooltip content={<ProductTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                    <Bar yAxisId="left" dataKey="m1FacturadoK" name={`${monthComparisonData.m1LabelShort} ($k)`} fill="#991b1b" barSize={12} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="m2FacturadoK" name={`${monthComparisonData.m2LabelShort} ($k)`} fill="#ef4444" barSize={12} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="right" dataKey="m1KgK" name={`${monthComparisonData.m1LabelShort} (kg)`} fill="#0369a1" barSize={12} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="right" dataKey="m2KgK" name={`${monthComparisonData.m2LabelShort} (kg)`} fill="#38bdf8" barSize={12} radius={[2, 2, 0, 0]} />
                  </>
                )
              ) : (
                <>
                  <YAxis yAxisId="left" tickFormatter={(v) => `$${v}k`} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}k kg`} tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} dx={10} />
                  <Tooltip content={<ProductTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                  <Bar yAxisId="left" dataKey="facturado" fill="#dc2626" barSize={20} radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="right" dataKey="despachado" fill="#3b82f6" barSize={20} radius={[2, 2, 0, 0]} />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* LEYENDA DINÁMICA DE LA GRÁFICA */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-3 pt-3 border-t border-white/5">
          {selectedTimeGroups.length === 2 && monthComparisonData ? (
            comparisonChartMode === 'facturado' ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#991b1b]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m1LabelShort} Facturado (USD)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#ef4444]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m2LabelShort} Facturado (USD)</span>
                </div>
              </>
            ) : comparisonChartMode === 'despachado' ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#0369a1]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m1LabelShort} Despacho (KG)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#38bdf8]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m2LabelShort} Despacho (KG)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#991b1b]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m1LabelShort} Facturado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#ef4444]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m2LabelShort} Facturado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#0369a1]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m1LabelShort} KG</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#38bdf8]"></div>
                  <span className="text-xs font-medium text-zinc-300">{monthComparisonData.m2LabelShort} KG</span>
                </div>
              </>
            )
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#dc2626]"></div>
                <span className="text-xs font-medium text-zinc-400">Facturado (USD)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#3b82f6]"></div>
                <span className="text-xs font-medium text-zinc-400">Despachado (KG)</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Section - Top Productos */}
      <div className="w-full">
        {/* Top Productos */}
        <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  TOP PRODUCTOS (VENTAS)
                </h3>
                {topProductsMonthFilters.length > 0 && (
                  <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                    {topProductsMonthFilters.length} {topProductsMonthFilters.length === 1 ? 'Mes' : 'Meses'}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {topProductsMonthFilters.length > 1 
                  ? `Gráficas individuales de los ${topProductsMonthFilters.length} meses seleccionados` 
                  : topProductsMonthFilters.length === 1 
                    ? 'Productos más vendidos en el mes seleccionado' 
                    : 'Consolidado acumulado de todos los meses'}
              </p>
            </div>
            <div className="relative" ref={topProductsPickerRef}>
              <button
                onClick={() => setShowTopProductsPicker(!showTopProductsPicker)}
                className={`flex items-center gap-2 bg-black/50 border ${topProductsMonthFilters.length > 0 ? 'border-red-500/50' : 'border-white/10'} rounded-md px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900 transition-colors h-[26px]`}
              >
                <CalendarIcon className="w-3 h-3 text-red-500" />
                {topProductsMonthFilters.length === 0 ? 'Todos' : `${topProductsMonthFilters.length} sel.`}
              </button>
              
              {showTopProductsPicker && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-950 border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col">
                  <div className="flex justify-between items-center px-4 py-2 border-b border-white/5">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Meses</span>
                    {topProductsMonthFilters.length > 0 && (
                      <button onClick={() => { setTopProductsMonthFilters([]); setAiAnalysis(null); }} className="text-[10px] text-red-400 hover:text-red-300">Limpiar</button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent flex flex-col p-1">
                    <button
                      onClick={() => { setTopProductsMonthFilters([]); setAiAnalysis(null); }}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${topProductsMonthFilters.length === 0 ? 'text-white bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-800/50'}`}
                    >
                      Todos
                    </button>
                    {topProductsAvailableMonths.map(g => {
                      const parts = g.split('-');
                      const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                      const label = `${MONTH_NAMES[parseInt(parts[1]) - 1]} ${parts[0]}`;
                      const isSelected = topProductsMonthFilters.includes(g);
                      return (
                        <button
                          key={g}
                          onClick={() => { 
                             setTopProductsMonthFilters(prev => 
                               prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
                             );
                             setAiAnalysis(null);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded transition-colors mt-0.5 ${isSelected ? 'text-white bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-800/50'}`}
                        >
                          <span>{label}</span>
                          {isSelected && <span className="text-red-500 font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Dynamic Month Charts Grid */}
          <div className={`grid gap-4 sm:gap-5 ${
            monthChartsData.length === 1 
              ? 'grid-cols-1' 
              : monthChartsData.length === 2 
                ? 'grid-cols-1 lg:grid-cols-2' 
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          }`}>
            {monthChartsData.map((m) => {
              const isMultiMonth = monthChartsData.length > 1;
              const isThreePlus = monthChartsData.length >= 3;

              return (
                <div 
                  key={m.monthKey} 
                  className="bg-zinc-950/70 border border-white/10 rounded-xl p-4 sm:p-5 hover:border-red-500/30 transition-all flex flex-col justify-between overflow-hidden shadow-xl"
                >
                  {/* Month Card Header */}
                  <div className="pb-3 mb-3 border-b border-white/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] shrink-0" />
                      <h4 
                        className="text-xs sm:text-sm font-bold text-white uppercase tracking-normal sm:tracking-wider truncate whitespace-nowrap"
                        title={m.monthLabel}
                      >
                        {m.monthLabel}
                      </h4>
                    </div>
                  </div>

                  {/* Chart & Top 3 List */}
                  <div className="flex items-center gap-3 sm:gap-4 my-auto min-w-0">
                    <div className={`${
                      isThreePlus 
                        ? 'h-28 w-28 sm:h-32 sm:w-32' 
                        : isMultiMonth 
                          ? 'h-32 w-32 sm:h-36 sm:w-36' 
                          : 'h-40 w-40 sm:h-44 sm:w-44'
                    } shrink-0 relative flex items-center justify-center`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={m.products}
                            innerRadius={isThreePlus ? 30 : isMultiMonth ? 36 : 50}
                            outerRadius={isThreePlus ? 44 : isMultiMonth ? 52 : 70}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {m.products.map((entry, index) => (
                              <Cell key={`cell-${m.monthKey}-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#09090b', 
                              borderColor: '#27272a', 
                              color: '#f4f4f5', 
                              borderRadius: '8px', 
                              fontSize: '11px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                            }} 
                            formatter={(val: any) => [formatUSD(Number(val)), 'Facturado']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex-1 min-w-0 space-y-2 sm:space-y-2.5">
                      {m.products.length > 0 ? (
                        m.products.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 min-w-0 group">
                            <div 
                              className="w-2 h-2 rounded-full mt-1.5 shrink-0" 
                              style={{ backgroundColor: item.color }} 
                            />
                            <div className="flex-1 min-w-0">
                              <p 
                                className="text-[11px] sm:text-xs font-semibold text-zinc-200 truncate leading-snug" 
                                title={item.name}
                              >
                                {item.name}
                              </p>
                              <div className="flex items-center justify-between gap-1.5 mt-0.5">
                                <span className="text-[11px] sm:text-xs font-bold text-red-500 font-mono whitespace-nowrap">
                                  {formatUSD(item.value)}
                                </span>
                                <span className="text-[10px] font-semibold text-zinc-400 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {item.percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (isHistoricalLoading || historicalData.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center text-zinc-400">
                          <Loader2 className="w-5 h-5 text-red-500 animate-spin mb-2" />
                          <span className="text-xs">Cargando datos históricos de Supabase...</span>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 py-6 text-center">
                          No hay ventas registradas para este mes.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI Analysis Box */}
          <div className="mt-6 bg-zinc-900/30 border border-white/5 rounded-xl p-5 relative overflow-hidden">
            {!aiAnalysis && !isAnalyzing ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Análisis Comparativo con Inteligencia Artificial
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {topProductsMonthFilters.length > 1
                        ? `Analiza y compara el comportamiento de los productos líderes entre los ${topProductsMonthFilters.length} meses seleccionados.`
                        : `Evalúa las tendencias de ventas de los productos más demandados y genera recomendaciones estratégicas.`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={generateAIAnalysis}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Analizar con IA
                </button>
              </div>
            ) : isAnalyzing ? (
              <div className="flex flex-col items-center justify-center text-center space-y-3 py-6">
                <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
                <p className="text-xs text-zinc-400 animate-pulse">
                  Analizando y comparando métricas con IA...
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-red-500" />
                    <h4 className="text-xs font-bold text-white tracking-wider uppercase">
                      Análisis Inteligente {topProductsMonthFilters.length > 1 ? 'Comparativo' : ''}
                    </h4>
                  </div>
                  <button
                    onClick={generateAIAnalysis}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Re-analizar
                  </button>
                </div>
                <div className="space-y-2.5 pt-1">
                  {aiAnalysis?.split('\n').map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-1" />;
                    if (trimmed.startsWith('📊') || trimmed.startsWith('##') || /^\d+\./.test(trimmed)) {
                      return (
                        <div key={idx} className="text-xs font-bold text-white tracking-wide pt-1 pb-0.5 border-b border-white/5 flex items-center gap-1.5">
                          <span className="text-red-500 font-mono">▸</span>
                          {trimmed.replace(/^##\s*/, '')}
                        </div>
                      );
                    }
                    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                      return (
                        <div key={idx} className="text-xs text-zinc-300 leading-relaxed pl-3 flex items-start gap-2">
                          <span className="text-red-500 mt-0.5 text-[10px] shrink-0">●</span>
                          <span>{trimmed.replace(/^[•\-\*]\s*/, '')}</span>
                        </div>
                      );
                    }
                    return (
                      <p key={idx} className="text-xs text-zinc-300 leading-relaxed">
                        {trimmed}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
