export interface DashboardDailyTrendPoint {
  date: string;
  ventas: number;
  kg: number;
  kgFacturado: number;
  kgDespachado: number;
  cajas?: number;
  utilidad?: number;
}

export interface DashboardProductDailyPoint {
  idArt: string;
  baseName: string;
  facturado: number;
  montoFA: number;
  montoDV: number;
  despachado: number;
  kgFacturado: number;
  cajas: number;
  utilidad?: number;
  date: string;
}

export interface DashboardMonthlyProductRow {
  period: string; // YYYY-MM
  ano: number;
  mes: string;
  id_articulo: string;
  articulo: string;
  monto: number;
  montoFA: number;
  montoDV: number;
  cajas: number;
  kgs_lts: number;
  costo: number;
  utilidad: number;
}

export interface DashboardMonthlyTotalEntry {
  period: string; // YYYY-MM
  ano: number;
  mes: string;
  label: string;
  validRows: number;
  faRows: number;
  dvRows: number;
  totalFA: number;
  totalDV: number;
  totalNeto: number;
  totalCosto: number;
  totalUtilidad: number;
  hasExactUtilidad: boolean;
  totalCajas: number;
  totalKgs: number;
  kgsBruto: number;
  source: 'supabase_history_sales' | 'google_sheets_current';
  sourceTable: string;
  auditBadgeText: string;
}

export interface DashboardSellerMonthlyEntry {
  monthKey: string;
  vendedor: string;
  supervisor: string;
  montoNeto: number;
  cajas: number;
  kgs: number;
  facturasCount: number;
}

export interface DashboardFacturacionDetailRow {
  fecha: string;
  idCliente: string;
  cliente?: string;
  idArt: string;
  articulo?: string;
  vendedor: string;
  supervisor?: string;
  categoria?: string;
  cajas: number;
  unidades: number;
  kg: number;
  monto: number;
  costo: number;
  utilidad: number;
  source?: 'supabase_history_sales' | 'google_sheets_november';
}

export interface DashboardOverviewBootstrapPayload {
  freshness: 'live' | 'revalidating' | 'disk-fallback';
  generatedAt: string;
  sheetsUpdatedAt: string | null;
  currentPeriod: string; // '2026-11'
  november: {
    summary: {
      facturacionTotal: number;
      utilidadBruta: number;
      porcentajeUtilidad: number;
      cajasDespachadas: number;
      totalKilogramos: number;
      tendenciaDiaria: DashboardDailyTrendPoint[];
      validRowsCount: number;
    };
    productDaily: DashboardProductDailyPoint[];
    productMonthly: DashboardMonthlyProductRow[];
    availableVendors: string[];
    availableSupervisors: string[];
  };
  historical: {
    sourceTable: string;
    monthlyTotals: Record<string, DashboardMonthlyTotalEntry>;
    products: DashboardMonthlyProductRow[];
    dailyTrends: Record<string, DashboardDailyTrendPoint[]>;
    sellerMonthlyHistory: DashboardSellerMonthlyEntry[];
    octoberSummary: {
      periodo: '2026-10';
      label: string;
      sourceLabel: string;
      sourceTable: string;
      auditBadgeText: string;
      facturacionTotal: number;
      montoFA: number;
      montoDV: number;
      costoTotal: number;
      costoFA: number;
      costoDV: number;
      utilidadBruta: number;
      utilidadFA: number;
      utilidadDV: number;
      porcentajeUtilidad: number;
      cajasDespachadas: number;
      cajasFA: number;
      cajasDV: number;
      unidadesNeto: number;
      unidadesFA: number;
      unidadesDV: number;
      totalKilogramos: number;
      kgsFA: number;
      kgsDV: number;
      kgsBrutoAbsoluto: number;
      tendenciaDiaria: DashboardDailyTrendPoint[];
      totalRegistros: number;
      faRows: number;
      dvRows: number;
      rawRowsCount: number;
      garbageRowsFiltered: number;
      duplicateRowsRemoved: number;
    } | null;
  };
  productCatalog: Record<string, string>;
}

const SESSION_CACHE_KEY = 'codizulca_overview_bootstrap_v1';
const SESSION_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

let memoryBootstrapCache: { payload: DashboardOverviewBootstrapPayload; ts: number } | null = null;
let inFlightBootstrapPromise: Promise<DashboardOverviewBootstrapPayload | null> | null = null;

export function getCachedDashboardBootstrap(): DashboardOverviewBootstrapPayload | null {
  if (memoryBootstrapCache && Date.now() - memoryBootstrapCache.ts < SESSION_CACHE_MAX_AGE_MS) {
    return memoryBootstrapCache.payload;
  }
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.payload &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < SESSION_CACHE_MAX_AGE_MS &&
      parsed.payload.historical?.monthlyTotals
    ) {
      memoryBootstrapCache = { payload: parsed.payload, ts: parsed.ts };
      return parsed.payload as DashboardOverviewBootstrapPayload;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function saveCachedDashboardBootstrap(payload: DashboardOverviewBootstrapPayload): void {
  const ts = Date.now();
  memoryBootstrapCache = { payload, ts };
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ts, payload }));
  } catch {
    // quota exceeded or disabled storage; memory cache still works
  }
}

export async function fetchDashboardOverviewBootstrap(options?: {
  forceRefresh?: boolean;
  waitLive?: boolean;
}): Promise<DashboardOverviewBootstrapPayload | null> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const waitLive = Boolean(options?.waitLive);

  if (!forceRefresh && !waitLive && inFlightBootstrapPromise) {
    return inFlightBootstrapPromise;
  }

  const qs = new URLSearchParams();
  if (forceRefresh) qs.set('refresh', 'true');
  if (waitLive) qs.set('waitLive', 'true');
  if (forceRefresh || waitLive) qs.set('_t', String(Date.now()));
  const url = `/api/dashboard/overview-bootstrap${qs.toString() ? `?${qs.toString()}` : ''}`;

  const promise = (async (): Promise<DashboardOverviewBootstrapPayload | null> => {
    const controller = new AbortController();
    const timeoutMs = forceRefresh || waitLive ? 16000 : 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const data = (await res.json()) as DashboardOverviewBootstrapPayload;
      if (data && data.november && data.historical) {
        saveCachedDashboardBootstrap(data);
        return data;
      }
      return null;
    } catch {
      clearTimeout(timeoutId);
      return null;
    } finally {
      if (!forceRefresh && !waitLive) {
        inFlightBootstrapPromise = null;
      }
    }
  })();

  if (!forceRefresh && !waitLive) {
    inFlightBootstrapPromise = promise;
  }
  return promise;
}

/**
 * Dispara la precarga del bootstrap del primer módulo en paralelo con la descarga del chunk JS,
 * reduciendo el tiempo de carga inicial a una sola ida y vuelta de red (<150ms en caché caliente).
 */
export function prefetchDashboardOverviewBootstrap(): void {
  if (typeof window === 'undefined') return;
  try {
    const pathname = window.location.pathname || '/';
    const isOverviewPath = pathname === '/' || pathname === '/dashboard' || pathname === '/dashboard/';
    const hasProfile = Boolean(localStorage.getItem('codizulca_dashboard_profile'));
    if (isOverviewPath && hasProfile && !inFlightBootstrapPromise) {
      void fetchDashboardOverviewBootstrap({ forceRefresh: false });
    }
  } catch {
    // ignore
  }
}

let inFlightNovemberDetail: Promise<DashboardFacturacionDetailRow[]> | null = null;
let cachedNovemberDetail: { rows: DashboardFacturacionDetailRow[]; ts: number } | null = null;

export async function fetchNovemberDetailRows(forceRefresh = false): Promise<DashboardFacturacionDetailRow[]> {
  if (!forceRefresh && cachedNovemberDetail && Date.now() - cachedNovemberDetail.ts < 60_000) {
    return cachedNovemberDetail.rows;
  }
  if (!forceRefresh && inFlightNovemberDetail) {
    return inFlightNovemberDetail;
  }

  const p = (async () => {
    try {
      const qs = forceRefresh ? `?refresh=true&_t=${Date.now()}` : '';
      const res = await fetch(`/api/dashboard/november-detail${qs}`, { cache: 'no-store' });
      if (!res.ok) return cachedNovemberDetail?.rows || [];
      const json = await res.json();
      const rows = Array.isArray(json?.rows) ? (json.rows as DashboardFacturacionDetailRow[]) : [];
      if (rows.length > 0) {
        cachedNovemberDetail = { rows, ts: Date.now() };
      }
      return rows;
    } catch {
      return cachedNovemberDetail?.rows || [];
    } finally {
      inFlightNovemberDetail = null;
    }
  })();

  inFlightNovemberDetail = p;
  return p;
}
