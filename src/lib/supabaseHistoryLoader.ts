import { supabase } from './supabase';
import {
  clearCachedHistorySalesRows,
  DEFAULT_HISTORY_CACHE_KEY,
  getCachedHistorySalesRows,
  HistorySalesDetailRecord,
  saveCachedHistorySalesRows,
} from './indexedDbSalesCache';
import {
  getPeriodMetadataFromIsoDate,
  normalizeCatalogKey,
  normalizeSheetSellerOrSupervisorKey,
  parseCaracasLocalDate,
  parseStrictAccountingNumber,
  SheetVentasDetailRow,
} from './googleSheetsMatrixParser';
import { getSellerMetadata, normalizeSellerName } from '../components/cuotas/sellerSupervisorMap';
import { resolveCatalogProductName } from '../data/productCatalog';

export const HISTORY_SALES_TABLE = 'history_sales';
export const HISTORY_SALES_START_DATE = '2026-01-01';
export const HISTORY_SALES_END_DATE = '2026-10-31';
export const POSTGREST_PAGE_SIZE = 1000;
export const CONCURRENT_BATCH_LIMIT = 5;

const SPANISH_MONTH_TO_NUM: Record<string, string> = {
  ENERO: '01',
  FEBRERO: '02',
  MARZO: '03',
  ABRIL: '04',
  MAYO: '05',
  JUNIO: '06',
  JULIO: '07',
  AGOSTO: '08',
  SEPTIEMBRE: '09',
  OCTUBRE: '10',
  NOVIEMBRE: '11',
  DICIEMBRE: '12',
};

export interface HistoryLoaderProgress {
  loadedRows: number;
  totalRows: number;
  completedPages: number;
  totalPages: number;
  source: 'indexeddb' | 'supabase_direct' | 'server_proxy';
}

export interface FetchHistorySalesOptions {
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  concurrency?: number;
  forceRefresh?: boolean;
  supabaseClient?: any;
  onProgress?: (progress: HistoryLoaderProgress) => void;
}

/**
 * Normaliza una fila cruda de `public.history_sales` (16 columnas oficiales de Supabase)
 * al contrato unificado de detalle fila por fila `HistorySalesDetailRecord`.
 */
export function mapRawSupabaseHistoryRowToDetail(
  raw: Record<string, any>,
  fallbackIndex: number = 0
): HistorySalesDetailRecord | null {
  const rawMes = normalizeCatalogKey(raw.mes);
  const rawAno = Number(raw.ano) || 2026;

  let isoFecha = parseCaracasLocalDate(raw.fecha);
  if (!isoFecha && rawMes && SPANISH_MONTH_TO_NUM[rawMes]) {
    isoFecha = `${rawAno}-${SPANISH_MONTH_TO_NUM[rawMes]}-01`;
  }
  if (!isoFecha) return null;

  const { ano, mes } = getPeriodMetadataFromIsoDate(isoFecha);
  const effectiveMes = rawMes && SPANISH_MONTH_TO_NUM[rawMes] ? rawMes : mes;
  const effectiveAno = rawAno || ano;

  const cajas = parseStrictAccountingNumber(raw.cajas);
  const unidades = parseStrictAccountingNumber(raw.unidades);
  const kgs_lts = parseStrictAccountingNumber(raw.kgs_lts ?? raw.kg);
  const monto = parseStrictAccountingNumber(raw.monto);
  const costo = parseStrictAccountingNumber(raw.costo);
  const utilidad = parseStrictAccountingNumber(raw.utilidad);
  const pct_utilidad =
    costo > 0
      ? Math.round(((utilidad / costo) * 100) * 100) / 100
      : monto > 0 && utilidad !== 0
      ? Math.round(((utilidad / monto) * 100) * 100) / 100
      : 0;

  const rawVendedor = normalizeSheetSellerOrSupervisorKey(raw.vendedor);
  const vendedor = rawVendedor.startsWith('OSCAR ORTIZ-')
    ? rawVendedor
    : normalizeSellerName(rawVendedor) || rawVendedor || 'SIN VENDEDOR';
  const supervisor =
    normalizeSheetSellerOrSupervisorKey(raw.supervisor) ||
    getSellerMetadata(vendedor).supervisor;

  const id_articulo = normalizeCatalogKey(raw.id_articulo);
  const articulo =
    resolveCatalogProductName(id_articulo, raw.articulo) ||
    normalizeCatalogKey(raw.articulo) ||
    `ARTICULO #${id_articulo}`;

  const id_cliente = normalizeCatalogKey(raw.id_cliente);
  const cliente = normalizeCatalogKey(raw.cliente) || (id_cliente ? `CLIENTE #${id_cliente}` : 'CLIENTE GENERAL');

  const rawTipoDoc = normalizeCatalogKey(raw.tipo_doc);
  const tipo_doc: 'FA' | 'DV' =
    rawTipoDoc === 'DV' || monto < 0 || cajas < 0 || kgs_lts < 0 ? 'DV' : 'FA';

  return {
    id: Number(raw.id) || fallbackIndex + 1,
    numero: raw.numero !== undefined ? Number(raw.numero) : undefined,
    tipo_doc,
    fecha: isoFecha,
    mes: effectiveMes,
    ano: effectiveAno,
    id_cliente,
    cliente,
    id_vendedor: raw.id_vendedor !== undefined ? Number(raw.id_vendedor) : undefined,
    vendedor,
    supervisor,
    id_articulo,
    articulo,
    cajas,
    unidades,
    kgs_lts,
    monto,
    costo,
    utilidad,
    pct_utilidad,
    source: 'supabase_history_sales',
  };
}

/**
 * Ejecuta el paginador por lotes concurrentes (5 lotes en paralelo de 1.000 filas cada uno)
 * usando `.select('*', { count: 'exact' })`, `.order('id', { ascending: true })` y `.range(from, to)`
 * sobre la tabla `history_sales` en el rango `2026-01-01` .. `2026-10-31`.
 */
export async function fetchAllHistorySalesPaginatedFromSupabase(
  options: FetchHistorySalesOptions = {}
): Promise<HistorySalesDetailRecord[]> {
  const startDate = options.startDate || HISTORY_SALES_START_DATE;
  const endDate = options.endDate || HISTORY_SALES_END_DATE;
  const pageSize = options.pageSize || POSTGREST_PAGE_SIZE;
  const concurrency = options.concurrency || CONCURRENT_BATCH_LIMIT;
  const client = options.supabaseClient || supabase;

  // 1. Obtener conteo exacto con .select('*', { count: 'exact', head: true })
  const countResponse = await client
    .from('history_sales')
    .select('*', { count: 'exact', head: true })
    .gte('fecha', startDate)
    .lte('fecha', endDate);

  if (countResponse.error) {
    throw countResponse.error;
  }

  const totalCount = Number(countResponse.count) || 0;
  if (totalCount === 0) {
    return [];
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const allDetailedRows: HistorySalesDetailRecord[] = [];
  let completedPages = 0;

  // 2. Iterar en ventanas de `concurrency` (5 lotes en paralelo) con orden determinístico .order('id', { ascending: true })
  for (let pageStart = 0; pageStart < totalPages; pageStart += concurrency) {
    const batchPageIndices: number[] = [];
    for (
      let offset = 0;
      offset < concurrency && pageStart + offset < totalPages;
      offset++
    ) {
      batchPageIndices.push(pageStart + offset);
    }

    const batchResults = await Promise.all(
      batchPageIndices.map(async (pageIndex) => {
        const from = pageIndex * pageSize;
        const to = from + pageSize - 1;

        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await client
            .from('history_sales')
            .select('*')
            .gte('fecha', startDate)
            .lte('fecha', endDate)
            .order('id', { ascending: true })
            .range(from, to);

          if (!error && Array.isArray(data)) {
            return { pageIndex, data };
          }
          lastError = error;
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        }
        throw lastError || new Error(`Error descargando lote ${pageIndex} (${from}-${to})`);
      })
    );

    // Ordenar los resultados del lote por pageIndex para preservar el orden determinístico exacto
    batchResults.sort((a, b) => a.pageIndex - b.pageIndex);

    for (const chunk of batchResults) {
      completedPages++;
      for (let i = 0; i < chunk.data.length; i++) {
        const rawRow = chunk.data[i];
        const mapped = mapRawSupabaseHistoryRowToDetail(
          rawRow,
          chunk.pageIndex * pageSize + i
        );
        if (
          mapped &&
          mapped.fecha >= startDate &&
          mapped.fecha <= endDate
        ) {
          allDetailedRows.push(mapped);
        }
      }
    }

    if (options.onProgress) {
      options.onProgress({
        loadedRows: allDetailedRows.length,
        totalRows: totalCount,
        completedPages,
        totalPages,
        source: 'supabase_direct',
      });
    }
  }

  return allDetailedRows;
}

/**
 * Carga el historial completo de Enero a Octubre 2026 (`2026-01-01` .. `2026-10-31`) con:
 * 1. Hidratación instantánea desde `IndexedDB` si existe caché válido.
 * 2. Descarga paginada concurrente (5 lotes en paralelo) desde `history_sales` en Supabase.
 * 3. Fallback transparente al endpoint del servidor (`/api/history-sales/detailed`) cuando RLS bloquea la llave `anon`.
 * 4. Almacenamiento automático en `IndexedDB` para que las visitas subsecuentes carguen al instante.
 */
export async function loadDetailedHistorySalesJanToOct2026(
  options: FetchHistorySalesOptions = {}
): Promise<{
  rows: HistorySalesDetailRecord[];
  fromCache: boolean;
  source: 'indexeddb' | 'supabase_direct' | 'server_proxy';
}> {
  const startDate = options.startDate || HISTORY_SALES_START_DATE;
  const endDate = options.endDate || HISTORY_SALES_END_DATE;
  const cacheKey =
    startDate === HISTORY_SALES_START_DATE && endDate === HISTORY_SALES_END_DATE
      ? DEFAULT_HISTORY_CACHE_KEY
      : `${DEFAULT_HISTORY_CACHE_KEY}_${startDate}_${endDate}`;

  if (options.forceRefresh) {
    await clearCachedHistorySalesRows(cacheKey);
  } else {
    const cached = await getCachedHistorySalesRows(cacheKey);
    if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {
      if (options.onProgress) {
        options.onProgress({
          loadedRows: cached.rows.length,
          totalRows: cached.rows.length,
          completedPages: 1,
          totalPages: 1,
          source: 'indexeddb',
        });
      }
      return {
        rows: cached.rows,
        fromCache: true,
        source: 'indexeddb',
      };
    }
  }

  // Intentar primero mediante el cargador paginado directo contra Supabase (5 lotes concurrentes)
  try {
    const directRows = await fetchAllHistorySalesPaginatedFromSupabase({
      ...options,
      startDate,
      endDate,
    });
    if (directRows.length > 0) {
      await saveCachedHistorySalesRows(directRows, cacheKey, startDate, endDate);
      return {
        rows: directRows,
        fromCache: false,
        source: 'supabase_direct',
      };
    }
  } catch (err) {
    console.warn('[HistorySalesLoader] Consulta directa a Supabase falló, usando proxy del servidor:', err);
  }

  // Fallback transparente: si RLS devuelve 0 filas con la llave anon en el navegador,
  // consultar por lotes de 5 en 5 al proxy del servidor `/api/history-sales/detailed-page`
  const proxyRows = await fetchHistorySalesViaServerProxy({
    ...options,
    startDate,
    endDate,
  });

  if (proxyRows.length > 0) {
    await saveCachedHistorySalesRows(proxyRows, cacheKey, startDate, endDate);
  }

  return {
    rows: proxyRows,
    fromCache: false,
    source: 'server_proxy',
  };
}

/**
 * Descarga paginada por lotes de 5 en paralelo contra el proxy `/api/history-sales/detailed-page`
 * del servidor Express cuando RLS restringe el acceso directo del cliente `anon`.
 */
async function fetchHistorySalesViaServerProxy(
  options: FetchHistorySalesOptions
): Promise<HistorySalesDetailRecord[]> {
  const startDate = options.startDate || HISTORY_SALES_START_DATE;
  const endDate = options.endDate || HISTORY_SALES_END_DATE;
  const pageSize = options.pageSize || POSTGREST_PAGE_SIZE;
  const concurrency = options.concurrency || CONCURRENT_BATCH_LIMIT;

  try {
    const countRes = await fetch(
      `/api/history-sales/detailed-page?head=true&startDate=${encodeURIComponent(
        startDate
      )}&endDate=${encodeURIComponent(endDate)}`
    );
    if (!countRes.ok) return [];
    const countJson = await countRes.json();
    const totalCount = Number(countJson.totalCount) || 0;
    if (totalCount === 0) return [];

    const totalPages = Math.ceil(totalCount / pageSize);
    const allRows: HistorySalesDetailRecord[] = [];
    let completedPages = 0;

    for (let pageStart = 0; pageStart < totalPages; pageStart += concurrency) {
      const batchIndices: number[] = [];
      for (
        let offset = 0;
        offset < concurrency && pageStart + offset < totalPages;
        offset++
      ) {
        batchIndices.push(pageStart + offset);
      }

      const chunks = await Promise.all(
        batchIndices.map(async (pageIdx) => {
          const from = pageIdx * pageSize;
          const to = from + pageSize - 1;
          const r = await fetch(
            `/api/history-sales/detailed-page?from=${from}&to=${to}&startDate=${encodeURIComponent(
              startDate
            )}&endDate=${encodeURIComponent(endDate)}`
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const json = await r.json();
          return { pageIdx, rows: Array.isArray(json.rows) ? json.rows : [] };
        })
      );

      chunks.sort((a, b) => a.pageIdx - b.pageIdx);
      for (const chunk of chunks) {
        completedPages++;
        for (let i = 0; i < chunk.rows.length; i++) {
          const mapped = mapRawSupabaseHistoryRowToDetail(
            chunk.rows[i],
            chunk.pageIdx * pageSize + i
          );
          if (mapped && mapped.fecha >= startDate && mapped.fecha <= endDate) {
            allRows.push(mapped);
          }
        }
      }

      if (options.onProgress) {
        options.onProgress({
          loadedRows: allRows.length,
          totalRows: totalCount,
          completedPages,
          totalPages,
          source: 'server_proxy',
        });
      }
    }

    return allRows;
  } catch (err) {
    console.warn('[HistorySalesLoader] Error en proxy de servidor:', err);
    return [];
  }
}

/**
 * Verifica estrictamente si una fecha (en formato `DD/MM/YYYY`, `YYYY-MM-DD` o timestamp)
 * pertenece a Noviembre 2026 (`2026-11-01` al `2026-11-30`, `año === 2026 && mes === 11`),
 * excluyendo rotundamente cualquier registro de Octubre (`2026-10-XX`) o meses previos.
 */
export function isStrictNovember2026Date(rawDate: unknown): boolean {
  const iso = parseCaracasLocalDate(rawDate);
  if (!iso) return false;
  const parts = iso.split('-');
  if (parts.length !== 3) return false;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return year === 2026 && month === 11 && day >= 1 && day <= 30;
}

/**
 * Filtra una colección de registros dejando únicamente aquellos cuya `fecha` normalizada
 * pertenece estrictamente a Noviembre 2026 (`2026-11-01` a `2026-11-30`).
 */
export function filterStrictNovember2026Rows<T extends { fecha?: unknown }>(rows: T[]): T[] {
  if (!Array.isArray(rows)) return [];
  const result: T[] = [];
  for (const row of rows) {
    const iso = parseCaracasLocalDate(row.fecha);
    if (iso && isStrictNovember2026Date(iso)) {
      result.push({
        ...row,
        fecha: iso,
      });
    }
  }
  return result;
}

export interface HistorialOctubre2026DailyPoint {
  date: string;
  ventas: number;
  kg: number;
  kgFacturado: number;
  kgDespachado: number;
  cajas: number;
  utilidad: number;
}

export interface HistorialOctubre2026Summary {
  periodo: '2026-10';
  label: string;
  sourceLabel: string;
  facturacionTotal: number;
  utilidadBruta: number;
  porcentajeUtilidad: number;
  cajasDespachadas: number;
  totalKilogramos: number;
  tendenciaDiaria: HistorialOctubre2026DailyPoint[];
  rows: HistorySalesDetailRecord[];
  totalRegistros: number;
}

/**
 * Calcula con precisión contable los KPIs y la serie diaria del cierre de Octubre 2026
 * a partir de los registros de `history_sales` en Supabase (`2026-10-01` a `2026-10-31`).
 */
export function calculateOctober2026SummaryFromRows(
  inputRows: HistorySalesDetailRecord[]
): HistorialOctubre2026Summary {
  const octoberRows = (inputRows || []).filter((r) => {
    const iso = parseCaracasLocalDate(r.fecha) || r.fecha;
    return (
      (iso >= '2026-10-01' && iso <= '2026-10-31') ||
      (String(r.mes || '').toUpperCase() === 'OCTUBRE' && Number(r.ano) === 2026)
    );
  });

  let facturacionTotal = 0;
  let utilidadBruta = 0;
  let cajasDespachadas = 0;
  let totalKilogramos = 0;

  const dailyMap = new Map<string, HistorialOctubre2026DailyPoint>();

  for (const r of octoberRows) {
    const monto = Number(r.monto) || 0;
    const utilidad = Number(r.utilidad) || 0;
    const cajas = Number(r.cajas) || 0;
    const kg = Number(r.kgs_lts) || 0;

    facturacionTotal += monto;
    utilidadBruta += utilidad;
    cajasDespachadas += cajas;
    totalKilogramos += kg;

    const isoDate = parseCaracasLocalDate(r.fecha) || r.fecha;
    if (isoDate && isoDate >= '2026-10-01' && isoDate <= '2026-10-31') {
      if (!dailyMap.has(isoDate)) {
        dailyMap.set(isoDate, {
          date: isoDate,
          ventas: 0,
          kg: 0,
          kgFacturado: 0,
          kgDespachado: 0,
          cajas: 0,
          utilidad: 0,
        });
      }
      const d = dailyMap.get(isoDate)!;
      d.ventas += monto;
      d.kg += kg;
      d.kgFacturado += kg;
      d.kgDespachado += kg;
      d.cajas += cajas;
      d.utilidad += utilidad;
    }
  }

  facturacionTotal = Math.round(facturacionTotal * 100) / 100;
  utilidadBruta = Math.round(utilidadBruta * 100) / 100;
  cajasDespachadas = Math.round(cajasDespachadas * 100) / 100;
  totalKilogramos = Math.round(totalKilogramos * 100) / 100;
  const porcentajeUtilidad =
    facturacionTotal > 0 ? (utilidadBruta / facturacionTotal) * 100 : 0;

  const tendenciaDiaria = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    periodo: '2026-10',
    label: 'Octubre 2026',
    sourceLabel: 'Modo Consulta Histórica: Octubre 2026 (Fuente: Supabase)',
    facturacionTotal,
    utilidadBruta,
    porcentajeUtilidad,
    cajasDespachadas,
    totalKilogramos,
    tendenciaDiaria,
    rows: octoberRows,
    totalRegistros: octoberRows.length,
  };
}

/**
 * Función dedicada que obtiene desde Supabase (`history_sales`) el 100% de los registros
 * del cierre de Octubre 2026 (`fecha >= '2026-10-01'` y `fecha <= '2026-10-31'`)
 * mediante paginación automática por bloques (`.range(from, to)`), sin truncar jamás en 1.000 filas.
 */
export async function fetchHistorialOctubre2026(
  options: FetchHistorySalesOptions = {}
): Promise<HistorialOctubre2026Summary> {
  const octStart = '2026-10-01';
  const octEnd = '2026-10-31';

  // Si ya existe en IndexedDB el historial completo Enero-Octubre verificado y no se pide forceRefresh,
  // extraer de inmediato las filas de Octubre 2026 si están completas (> 1,000 filas).
  if (!options.forceRefresh) {
    try {
      const cachedAll = await getCachedHistorySalesRows(DEFAULT_HISTORY_CACHE_KEY);
      if (cachedAll && Array.isArray(cachedAll.rows) && cachedAll.rows.length > 1000) {
        const octCached = cachedAll.rows.filter(
          (r) => r.fecha >= octStart && r.fecha <= octEnd
        );
        if (octCached.length > 1000) {
          return calculateOctober2026SummaryFromRows(octCached);
        }
      }
    } catch {
      // continuar con la carga paginada dedicada
    }
  }

  const loaded = await loadDetailedHistorySalesJanToOct2026({
    ...options,
    startDate: octStart,
    endDate: octEnd,
  });

  return calculateOctober2026SummaryFromRows(loaded.rows);
}

/**
 * Convierte las filas aceptadas de la pestaña `Ventas` (`Fecha >= '2026-11-01'`)
 * al mismo contrato `HistorySalesDetailRecord`, cruzando con los catálogos de Productos, Clientes y Supervisores.
 */
export function convertSheetVentasRowsToDetailRecords(
  sheetRows: SheetVentasDetailRow[],
  catalogs?: {
    productByCode?: Map<string, { producto: string; categoria?: string }>;
    clientByCode?: Map<string, { cliente: string; vendedor?: string }>;
    supervisorBySeller?: Map<string, string>;
  }
): HistorySalesDetailRecord[] {
  return sheetRows
    .filter((r) => isStrictNovember2026Date(r.fecha))
    .map((r, idx) => {
      const isoFecha = parseCaracasLocalDate(r.fecha) || r.fecha;
      const prodEntry =
        catalogs?.productByCode?.get(r.idArticulo) ||
        catalogs?.productByCode?.get(r.idArticulo.replace(/^0+/, ''));
      const articulo =
        prodEntry?.producto ||
        resolveCatalogProductName(r.idArticulo) ||
        `ARTICULO #${r.idArticulo}`;

      const clientEntry =
        catalogs?.clientByCode?.get(r.idCliente) ||
        catalogs?.clientByCode?.get(r.idCliente.replace(/^0+/, ''));
      const cliente =
        clientEntry?.cliente ||
        (r.idCliente ? `CLIENTE #${r.idCliente}` : 'CLIENTE GENERAL');

      const supervisor =
        catalogs?.supervisorBySeller?.get(r.vendedor) ||
        catalogs?.supervisorBySeller?.get(r.vendedorRaw) ||
        getSellerMetadata(r.vendedor).supervisor;

      return {
        id: 9000000 + idx + 1,
        numero: r.rowNumber,
        tipo_doc: r.tipoDoc,
        fecha: isoFecha,
        mes: 'NOVIEMBRE',
        ano: 2026,
        id_cliente: r.idCliente,
        cliente,
        vendedor: r.vendedor,
        supervisor,
        id_articulo: r.idArticulo,
        articulo,
        cajas: r.cajas,
        unidades: r.unidades,
        kgs_lts: r.kg,
        monto: r.monto,
        costo: r.costo,
        utilidad: r.utilidad,
        pct_utilidad: r.pctUtilidad,
        source: 'google_sheets_november',
      };
    });
}
