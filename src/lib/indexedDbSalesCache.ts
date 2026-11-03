export interface HistorySalesDetailRecord {
  id: number;
  numero?: number;
  numero_fila?: number;
  composite_row_key?: string;
  tipo_doc: 'FA' | 'DV';
  fecha: string; // YYYY-MM-DD (America/Caracas)
  mes: string; // ENERO .. OCTUBRE
  ano: number; // 2026
  id_cliente: string;
  cliente: string;
  id_vendedor?: number;
  vendedor: string;
  supervisor?: string;
  id_articulo: string;
  articulo: string;
  cajas: number;
  unidades: number;
  kgs_lts: number;
  monto: number;
  costo: number;
  utilidad: number;
  pct_utilidad: number;
  source: 'supabase_history_sales' | 'google_sheets_november';
}

export interface IndexedDbHistoryCachePayload {
  cacheKey: string;
  rangeStart: string;
  rangeEnd: string;
  totalRows: number;
  savedAt: string;
  rows: HistorySalesDetailRecord[];
}

const DB_NAME = 'codizulca_gerencia_sync_db';
const DB_VERSION = 1;
const STORE_NAME = 'history_sales_cache_v1';
export const DEFAULT_HISTORY_CACHE_KEY = 'history_sales_2026_01_01_to_2026_10_31_v3_oct29722';

// Fallback en memoria para entornos sin IndexedDB (ej. SSR / Node / Vitest)
const memoryFallbackStore = new Map<string, IndexedDbHistoryCachePayload>();

function isIndexedDbSupported(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openSyncDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('IndexedDB no disponible en este entorno'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error abriendo IndexedDB'));
  });
}

/**
 * Lee del caché local (`IndexedDB`) el historial detallado de Enero a Octubre 2026.
 */
export async function getCachedHistorySalesRows(
  cacheKey: string = DEFAULT_HISTORY_CACHE_KEY
): Promise<IndexedDbHistoryCachePayload | null> {
  if (memoryFallbackStore.has(cacheKey)) {
    return memoryFallbackStore.get(cacheKey) || null;
  }

  if (!isIndexedDbSupported()) {
    return null;
  }

  try {
    const db = await openSyncDatabase();
    return await new Promise<IndexedDbHistoryCachePayload | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const result = (req.result as IndexedDbHistoryCachePayload | undefined) || null;
        if (result && Array.isArray(result.rows) && result.rows.length > 0) {
          memoryFallbackStore.set(cacheKey, result);
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('[IndexedDB Cache] No se pudo leer el caché local:', err);
    return null;
  }
}

/**
 * Guarda en `IndexedDB` el historial detallado de Enero a Octubre 2026 para carga instantánea.
 */
export async function saveCachedHistorySalesRows(
  rows: HistorySalesDetailRecord[],
  cacheKey: string = DEFAULT_HISTORY_CACHE_KEY,
  rangeStart: string = '2026-01-01',
  rangeEnd: string = '2026-10-31'
): Promise<void> {
  const payload: IndexedDbHistoryCachePayload = {
    cacheKey,
    rangeStart,
    rangeEnd,
    totalRows: rows.length,
    savedAt: new Date().toISOString(),
    rows,
  };

  memoryFallbackStore.set(cacheKey, payload);

  if (!isIndexedDbSupported()) {
    return;
  }

  try {
    const db = await openSyncDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(payload);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('[IndexedDB Cache] No se pudo persistir el caché en IndexedDB:', err);
  }
}

/**
 * Limpia el caché de `IndexedDB` (cuando el usuario solicita re-sincronización forzada).
 */
export async function clearCachedHistorySalesRows(
  cacheKey: string = DEFAULT_HISTORY_CACHE_KEY
): Promise<void> {
  memoryFallbackStore.delete(cacheKey);
  if (!isIndexedDbSupported()) return;

  try {
    const db = await openSyncDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(cacheKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('[IndexedDB Cache] Error al limpiar caché:', err);
  }
}
