import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  LOGICAL_INACTIVE_VENDOR_PREFIX,
  type MaestraExternalLookupMaps,
  buildRouteClientKey,
  chunkForBatchUpsert,
  compareMaestraAgainstDatabase,
  extractCleanVendorRoute,
  isActivationRecordLogicallyInactive,
  normalizeBusinessNameForLookup,
  normalizeClientId,
  sanitizeMaestraText,
} from '../lib/maestraActivaEngine';
import {
  OFFICIAL_MASTER_VENDEDORES_SEED,
  getRuntimeSellerCatalog,
} from '../lib/maestraCatalogSanitizer';
import {
  ACTIVATION_CATEGORY_SKU_GROUPS,
  RUBROS_ACTIVACION_CLIENTES,
} from '../components/cuotas/cuotasData';
import {
  type ClientRubroSalesSummary,
  buildClientRubroSalesIndex,
  normalizeClientCode,
} from '../lib/clientRubroActivationSync';
import type {
  ExistingActivationRecordLike,
  ExistingCarteraRecordLike,
  MaestraAuditReport,
  MaestraBatchSyncResponse,
  MaestraParseResult,
  MaestraSanitizedClient,
} from '../lib/maestraActivaTypes';

export interface EnrichedClientActivationPayload {
  /** Llave compuesta única `${vendedorNombre}::${id}` para preservar clientes con Id compartido (ej. Id=8377) */
  assignmentKey: string;
  id: string;
  cliente: string;
  idVendedorErp: string;
  vendedorId: string;
  vendedorNombre: string;
  rif: string;
  tipoCliente: string;
  activo: boolean;
  status: string;
  cajas: {
    AZUCAR: number;
    LECHE_VENCAMPO: number;
    POLLO: number;
    ESTANDAR_SUPERIOR_ASTURIAS: number;
    MORTADELA_SALPICAO_ASTURIAS: number;
    JAMON_ASTURIAS?: number;
    MORTADELA_ASTURIAS?: number;
    SALPICAO?: number;
  };
  cats: {
    AZUCAR: boolean;
    LECHE_VENCAMPO: boolean;
    POLLO: boolean;
    ESTANDAR_SUPERIOR_ASTURIAS: boolean;
    MORTADELA_SALPICAO_ASTURIAS: boolean;
    JAMON_ASTURIAS?: boolean;
    MORTADELA_ASTURIAS?: boolean;
    SALPICAO?: boolean;
  };
}

export interface SyncMaestraOptions {
  supabaseUrl: string;
  supabaseKey: string;
  rootDir?: string;
  periodo?: string;
  batchSize?: number;
}

export async function fetchAllSupabaseActivacionRows(
  fdvSupabase: SupabaseClient,
  periodo = '2026-11'
): Promise<ExistingActivationRecordLike[]> {
  const fetchForPeriod = async (targetPeriod: string): Promise<ExistingActivationRecordLike[]> => {
    const rows: ExistingActivationRecordLike[] = [];
    let from = 0;
    const pageSize = 1000;
    while (from < 25000) {
      const { data, error } = await fdvSupabase
        .from('activacion_clientes')
        .select('*')
        .eq('periodo', targetPeriod)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        throw new Error(`Error consultando public.activacion_clientes: ${error.message}`);
      }
      if (!data || data.length === 0) break;
      rows.push(...(data as ExistingActivationRecordLike[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  };

  let rows = await fetchForPeriod(periodo);
  if (rows.length === 0 && periodo !== '2026-11') {
    rows = await fetchForPeriod('2026-11');
  }
  if (rows.length === 0 && periodo !== '2026-10') {
    rows = await fetchForPeriod('2026-10');
  }
  return rows;
}

export function loadLocalCarteraRows(rootDir = process.cwd()): ExistingCarteraRecordLike[] {
  const carteraPath = path.join(rootDir, 'src', 'data', 'carteraClientes.json');
  if (!fs.existsSync(carteraPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(carteraPath, 'utf8'));
    return Array.isArray(parsed) ? (parsed as ExistingCarteraRecordLike[]) : [];
  } catch {
    return [];
  }
}

export function loadMaestraAuditSnapshot(rootDir = process.cwd()): MaestraAuditReport | null {
  const snapPath = path.join(rootDir, 'src', 'data', 'maestraActivaAuditSnapshot.json');
  if (!fs.existsSync(snapPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(snapPath, 'utf8')) as MaestraAuditReport;
  } catch {
    return null;
  }
}

/**
 * Construye mapas de resolución de RIF y Tipo de Cliente desde carteraClientes.json
 * para enriquecer archivos CSV/Excel que no incluyan las hojas secundarias TIPO o RIF.
 */
export function buildExternalLookupMapsFromLocalData(
  rootDir = process.cwd()
): MaestraExternalLookupMaps {
  const tipoById = new Map<string, string>();
  const tipoByName = new Map<string, string>();
  const rifById = new Map<string, string>();
  const rifByName = new Map<string, string>();

  const carteraRows = loadLocalCarteraRows(rootDir);
  for (const c of carteraRows) {
    const cid = normalizeClientId(c.id);
    const bName = normalizeBusinessNameForLookup(c.nombre);
    const canal = sanitizeMaestraText(c.canal).toUpperCase();
    const rif = sanitizeMaestraText(c.rif).toUpperCase();

    if (canal && canal !== 'POR CLASIFICAR') {
      if (cid) tipoById.set(cid, canal);
      if (bName) tipoByName.set(bName, canal);
    }
    if (rif && rif !== 'PENDIENTE' && rif !== '#N/D' && rif !== '#N/A') {
      if (cid) rifById.set(cid, rif);
      if (bName) rifByName.set(bName, rif);
    }
  }

  return { tipoById, tipoByName, rifById, rifByName };
}

/**
 * Construye un índice de metadatos enriquecidos (idVendedor, RIF, Tipo de cliente, activo)
 * a partir de carteraClientes.json y maestraActivaAuditSnapshot.json para enriquecer lecturas en vivo desde Supabase.
 */
export function buildLocalMaestraMetadataMap(rootDir = process.cwd()): Map<
  string,
  { idVendedorErp: string; rif: string; tipoCliente: string; activo: boolean }
> {
  const metaMap = new Map<
    string,
    { idVendedorErp: string; rif: string; tipoCliente: string; activo: boolean }
  >();

  // 1. Desde carteraClientes.json
  const carteraRows = loadLocalCarteraRows(rootDir);
  for (const c of carteraRows) {
    const cid = normalizeClientId(c.id);
    if (!cid) continue;
    const route = sanitizeMaestraText(c.rutaVendedor || c.vendedor).toUpperCase();
    const entry = {
      idVendedorErp: sanitizeMaestraText(c.idVendedor),
      rif: sanitizeMaestraText(c.rif) || 'PENDIENTE',
      tipoCliente: sanitizeMaestraText(c.canal) || 'POR CLASIFICAR',
      activo: c.activo !== false,
    };
    if (route) {
      metaMap.set(buildRouteClientKey(route, cid), entry);
    }
    if (!metaMap.has(`ID_ONLY::${cid}`)) {
      metaMap.set(`ID_ONLY::${cid}`, entry);
    }
  }

  // 2. Reforzar los 44 pendientes desde maestraActivaAuditSnapshot.json si existe
  const snap = loadMaestraAuditSnapshot(rootDir);
  if (snap && Array.isArray(snap.pendingList)) {
    for (const p of snap.pendingList) {
      metaMap.set(buildRouteClientKey(p.vendedor, p.idCliente), {
        idVendedorErp: p.idVendedor,
        rif: p.rif,
        tipoCliente: p.tipoCliente,
        activo: true,
      });
    }
  }

  return metaMap;
}

let cachedSalesIndexState: {
  rootDir: string;
  octMtimeMs: number;
  index: Map<string, ClientRubroSalesSummary>;
} | null = null;

/**
 * Construye y cachea en memoria el índice relacional Cliente -> Venta -> Producto -> Rubro
 * leyendo `october_sales_rows.json` y los archivos de `cache_product_clients/*.json` de los 5 rubros foco.
 */
export function getLocalClientRubroSalesIndex(
  rootDir = process.cwd()
): Map<string, ClientRubroSalesSummary> {
  const octPath = path.join(rootDir, 'october_sales_rows.json');
  let octMtimeMs = 0;
  try {
    if (fs.existsSync(octPath)) {
      octMtimeMs = fs.statSync(octPath).mtimeMs;
    }
  } catch {
    octMtimeMs = 0;
  }

  if (
    cachedSalesIndexState &&
    cachedSalesIndexState.rootDir === rootDir &&
    cachedSalesIndexState.octMtimeMs === octMtimeMs
  ) {
    return cachedSalesIndexState.index;
  }

  let salesRows: any[] = [];
  try {
    if (fs.existsSync(octPath)) {
      const parsed = JSON.parse(fs.readFileSync(octPath, 'utf8'));
      if (Array.isArray(parsed)) {
        salesRows = parsed;
      }
    }
  } catch {
    salesRows = [];
  }

  const productClientCaches: Array<{ id_articulo?: unknown; articulo?: unknown; clients?: any[] }> = [];
  try {
    const cacheDir = path.join(rootDir, 'cache_product_clients');
    if (fs.existsSync(cacheDir)) {
      const focusSkus = new Set<string>();
      for (const rubro of RUBROS_ACTIVACION_CLIENTES) {
        for (const sku of ACTIVATION_CATEGORY_SKU_GROUPS[rubro] || []) {
          focusSkus.add(String(sku).trim());
        }
      }
      for (const sku of focusSkus) {
        const skuFile = path.join(cacheDir, `${sku}.json`);
        if (fs.existsSync(skuFile)) {
          const parsedCache = JSON.parse(fs.readFileSync(skuFile, 'utf8'));
          if (parsedCache && typeof parsedCache === 'object') {
            productClientCaches.push(parsedCache);
          }
        }
      }
    }
  } catch {
    // Continuar con salesRows si no existe cache_product_clients
  }

  const index = buildClientRubroSalesIndex(salesRows, productClientCaches);
  cachedSalesIndexState = {
    rootDir,
    octMtimeMs,
    index,
  };
  return index;
}

/**
 * Mapea filas crudas de Supabase public.activacion_clientes a objetos tipados del Módulo de Cuotas,
 * respetando llave compuesta por ruta + cliente y filtrando bajas lógicas (status = 'BAJA_MAESTRA') por defecto.
 */
export function mapSupabaseRowsToClientActivationList(
  supaRows: ExistingActivationRecordLike[],
  rootDir = process.cwd(),
  includeInactive = false
): EnrichedClientActivationPayload[] {
  const metaMap = buildLocalMaestraMetadataMap(rootDir);
  const salesIndex = getLocalClientRubroSalesIndex(rootDir);
  const byCompositeMap = new Map<string, EnrichedClientActivationPayload>();

  for (const r of supaRows) {
    const cid = normalizeClientId(r.cliente_codigo);
    if (!cid) continue;

    const rawStatus = sanitizeMaestraText(r.status).toUpperCase();
    const isBajaMaestra = isActivationRecordLogicallyInactive(r);
    if (isBajaMaestra && !includeInactive) {
      continue;
    }

    const vNombre = extractCleanVendorRoute(r);
    const vId = sanitizeMaestraText(r.vendedor_id || vNombre);
    const baseCompKey = buildRouteClientKey(vNombre, cid);
    const mapKey = isBajaMaestra ? `INACTIVO::${baseCompKey}` : baseCompKey;

    const salesSummary = !isBajaMaestra ? salesIndex.get(normalizeClientCode(cid)) : undefined;

    const cajasAzucar = Math.max(
      Number(r.cajas_azucar) || 0,
      salesSummary?.rubroNetVolume.AZUCAR || 0
    );
    const cajasLeche = Math.max(
      Number(r.cajas_leche_vencampo ?? r.cajas_aceite) || 0,
      salesSummary?.rubroNetVolume.LECHE_VENCAMPO || 0
    );
    const cajasPollo = Math.max(
      Number(r.cajas_pollo) || 0,
      salesSummary?.rubroNetVolume.POLLO || 0
    );
    const cajasEstandarSuperior = Math.max(
      Number(
        r.cajas_estandar_superior_asturias ?? r.cajas_estandar_asturias ?? r.cajas_jamon_asturias
      ) || 0,
      salesSummary?.rubroNetVolume.ESTANDAR_SUPERIOR_ASTURIAS || 0
    );
    const cajasMortadelaSalpicao = Math.max(
      Number(
        r.cajas_mortadela_salpicao_asturias ??
          r.cajas_mortadela_salpicao ??
          r.cajas_mortadela_asturias ??
          r.cajas_salpicao
      ) || 0,
      salesSummary?.rubroNetVolume.MORTADELA_SALPICAO_ASTURIAS || 0
    );

    const hasAzucar =
      Boolean(r.has_azucar) ||
      Boolean(salesSummary?.activeRubros.has('AZUCAR')) ||
      cajasAzucar > 0;
    const hasLecheVencampo =
      Boolean(r.has_leche_vencampo) ||
      Boolean(r.has_aceite) ||
      Boolean(salesSummary?.activeRubros.has('LECHE_VENCAMPO')) ||
      cajasLeche > 0;
    const hasPollo =
      Boolean(r.has_pollo) ||
      Boolean(salesSummary?.activeRubros.has('POLLO')) ||
      cajasPollo > 0;
    const hasEstandarSuperior =
      Boolean(r.has_estandar_superior_asturias) ||
      Boolean(r.has_estandar_asturias) ||
      Boolean(r.has_jamon_asturias) ||
      Boolean(salesSummary?.activeRubros.has('ESTANDAR_SUPERIOR_ASTURIAS')) ||
      cajasEstandarSuperior > 0;
    const hasMortadelaSalpicao =
      Boolean(r.has_mortadela_salpicao_asturias) ||
      Boolean(r.has_mortadela_salpicao) ||
      Boolean(r.has_mortadela_asturias) ||
      Boolean(r.has_salpicao) ||
      Boolean(salesSummary?.activeRubros.has('MORTADELA_SALPICAO_ASTURIAS')) ||
      cajasMortadelaSalpicao > 0;

    const meta = metaMap.get(baseCompKey) || metaMap.get(`ID_ONLY::${cid}`);
    const hasAnySales = Boolean(
      salesSummary && (salesSummary.totalNetVolume > 0 || salesSummary.totalNetAmount > 0)
    );
    const effectiveStatus = isBajaMaestra
      ? 'BAJA_MAESTRA'
      : hasAzucar ||
        hasLecheVencampo ||
        hasPollo ||
        hasEstandarSuperior ||
        hasMortadelaSalpicao ||
        hasAnySales ||
        rawStatus === 'ACTIVO'
      ? 'ACTIVO'
      : 'INACTIVO';

    if (!byCompositeMap.has(mapKey)) {
      byCompositeMap.set(mapKey, {
        assignmentKey: mapKey,
        id: cid,
        cliente: sanitizeMaestraText(r.cliente_nombre),
        idVendedorErp: sanitizeMaestraText(r.idVendedorErp) || meta?.idVendedorErp || '',
        vendedorId: vId,
        vendedorNombre: vNombre,
        rif: sanitizeMaestraText(r.rif) || meta?.rif || 'PENDIENTE',
        tipoCliente: sanitizeMaestraText(r.tipoCliente) || meta?.tipoCliente || 'POR CLASIFICAR',
        activo: !isBajaMaestra,
        status: effectiveStatus,
        cajas: {
          AZUCAR: cajasAzucar,
          LECHE_VENCAMPO: cajasLeche,
          POLLO: cajasPollo,
          ESTANDAR_SUPERIOR_ASTURIAS: cajasEstandarSuperior,
          MORTADELA_SALPICAO_ASTURIAS: cajasMortadelaSalpicao,
          JAMON_ASTURIAS: cajasEstandarSuperior,
          MORTADELA_ASTURIAS: cajasMortadelaSalpicao,
          SALPICAO: cajasMortadelaSalpicao,
        },
        cats: {
          AZUCAR: hasAzucar,
          LECHE_VENCAMPO: hasLecheVencampo,
          POLLO: hasPollo,
          ESTANDAR_SUPERIOR_ASTURIAS: hasEstandarSuperior,
          MORTADELA_SALPICAO_ASTURIAS: hasMortadelaSalpicao,
          JAMON_ASTURIAS: hasEstandarSuperior,
          MORTADELA_ASTURIAS: hasMortadelaSalpicao,
          SALPICAO: hasMortadelaSalpicao,
        },
      });
    } else {
      const prev = byCompositeMap.get(mapKey)!;
      prev.cats.AZUCAR = prev.cats.AZUCAR || hasAzucar;
      prev.cats.LECHE_VENCAMPO = prev.cats.LECHE_VENCAMPO || hasLecheVencampo;
      prev.cats.POLLO = prev.cats.POLLO || hasPollo;
      prev.cats.ESTANDAR_SUPERIOR_ASTURIAS =
        prev.cats.ESTANDAR_SUPERIOR_ASTURIAS || hasEstandarSuperior;
      prev.cats.MORTADELA_SALPICAO_ASTURIAS =
        prev.cats.MORTADELA_SALPICAO_ASTURIAS || hasMortadelaSalpicao;
      prev.cats.JAMON_ASTURIAS = prev.cats.ESTANDAR_SUPERIOR_ASTURIAS;
      prev.cats.MORTADELA_ASTURIAS = prev.cats.MORTADELA_SALPICAO_ASTURIAS;
      prev.cats.SALPICAO = prev.cats.MORTADELA_SALPICAO_ASTURIAS;

      prev.cajas.AZUCAR = Math.max(prev.cajas.AZUCAR, cajasAzucar);
      prev.cajas.LECHE_VENCAMPO = Math.max(prev.cajas.LECHE_VENCAMPO, cajasLeche);
      prev.cajas.POLLO = Math.max(prev.cajas.POLLO, cajasPollo);
      prev.cajas.ESTANDAR_SUPERIOR_ASTURIAS = Math.max(
        prev.cajas.ESTANDAR_SUPERIOR_ASTURIAS,
        cajasEstandarSuperior
      );
      prev.cajas.MORTADELA_SALPICAO_ASTURIAS = Math.max(
        prev.cajas.MORTADELA_SALPICAO_ASTURIAS,
        cajasMortadelaSalpicao
      );
      prev.cajas.JAMON_ASTURIAS = prev.cajas.ESTANDAR_SUPERIOR_ASTURIAS;
      prev.cajas.MORTADELA_ASTURIAS = prev.cajas.MORTADELA_SALPICAO_ASTURIAS;
      prev.cajas.SALPICAO = prev.cajas.MORTADELA_SALPICAO_ASTURIAS;
      if (
        !isBajaMaestra &&
        (prev.cats.AZUCAR ||
          prev.cats.LECHE_VENCAMPO ||
          prev.cats.POLLO ||
          prev.cats.ESTANDAR_SUPERIOR_ASTURIAS ||
          prev.cats.MORTADELA_SALPICAO_ASTURIAS)
      ) {
        prev.status = 'ACTIVO';
      }
    }
  }

  return Array.from(byCompositeMap.values());
}

/**
 * Ejecuta la sincronización transaccional por lotes (batch upsert + borrado lógico activo=false)
 * contra Supabase public.activacion_clientes y actualiza los catálogos sincronizados del proyecto.
 */
export async function executeMaestraActivaBatchSync(
  parsed: MaestraParseResult,
  options: SyncMaestraOptions
): Promise<{
  response: MaestraBatchSyncResponse;
  activeSeedPayload: EnrichedClientActivationPayload[];
}> {
  const rootDir = options.rootDir || process.cwd();
  const periodo = options.periodo || '2026-11';
  const batchSize = options.batchSize || 250;

  const fdvSupabase = createClient(
    options.supabaseUrl.replace('/rest/v1/', ''),
    options.supabaseKey,
    { auth: { persistSession: false } }
  );

  // 1. Leer estado actual de Supabase y Cartera Local
  const existingSupaRows = await fetchAllSupabaseActivacionRows(fdvSupabase, periodo);
  const existingCarteraRows = loadLocalCarteraRows(rootDir);

  // Si ya se había sincronizado antes y no hay diferencias nuevas en la corrida actual,
  // conservar el snapshot histórico de diagnóstico si la corrida actual es una re-ejecución idempotente,
  // o generar el nuevo reporte comparativo completo.
  const syncedAt = new Date().toISOString();
  const liveAuditReport = compareMaestraAgainstDatabase(
    parsed,
    existingSupaRows,
    existingCarteraRows,
    periodo,
    syncedAt
  );

  // Indexar filas existentes en Supabase (incluyendo eventuales BAJA_MAESTRA para reactivación limpia sin duplicar PKs)
  const supaByRouteClient = new Map<string, ExistingActivationRecordLike>();
  const supaByClient = new Map<string, ExistingActivationRecordLike[]>();

  for (const row of existingSupaRows) {
    const cid = normalizeClientId(row.cliente_codigo);
    const route = extractCleanVendorRoute(row);
    if (!cid) continue;
    const rcKey = buildRouteClientKey(route, cid);
    if (!supaByRouteClient.has(rcKey)) {
      supaByRouteClient.set(rcKey, row);
    }
    if (!supaByClient.has(cid)) {
      supaByClient.set(cid, []);
    }
    supaByClient.get(cid)!.push(row);
  }

  const salesIndex = getLocalClientRubroSalesIndex(rootDir);
  const usedDbRowIds = new Set<number>();
  const rowsToUpsertById: Array<Record<string, unknown>> = [];
  const rowsToInsertNew: Array<{ rec: MaestraSanitizedClient; payload: Record<string, unknown> }> = [];

  for (const rec of parsed.records) {
    let matchedRow = supaByRouteClient.get(rec.routeAssignmentKey);

    // Si no coincidió por ruta+cliente y NO es un Id compartido, buscar si el cliente cambió de vendedor
    if (!matchedRow && !rec.isSharedClientId) {
      const candidates = (supaByClient.get(rec.idCliente) || []).filter(
        (r) => typeof r.id === 'number' && !usedDbRowIds.has(Number(r.id))
      );
      if (candidates.length === 1) {
        matchedRow = candidates[0];
      }
    }

    const salesSummary = salesIndex.get(normalizeClientCode(rec.idCliente));
    const salesCajasAzucar = salesSummary?.rubroNetVolume.AZUCAR || 0;
    const salesCajasLeche = salesSummary?.rubroNetVolume.LECHE_VENCAMPO || 0;
    const salesCajasPollo = salesSummary?.rubroNetVolume.POLLO || 0;
    const salesCajasEstandar = salesSummary?.rubroNetVolume.ESTANDAR_SUPERIOR_ASTURIAS || 0;
    const salesCajasMortadela = salesSummary?.rubroNetVolume.MORTADELA_SALPICAO_ASTURIAS || 0;
    const hasSalesActivity = Boolean(
      salesSummary &&
        (salesSummary.totalNetVolume > 0 ||
          salesSummary.totalNetAmount > 0 ||
          salesSummary.activeRubros.size > 0)
    );

    if (matchedRow && typeof matchedRow.id === 'number' && !usedDbRowIds.has(Number(matchedRow.id))) {
      const rowId = Number(matchedRow.id);
      usedDbRowIds.add(rowId);

      const mergedCajasLeche = Math.max(
        Number(matchedRow.cajas_leche_vencampo ?? matchedRow.cajas_aceite) || 0,
        salesCajasLeche
      );
      const mergedCajasAzucar = Math.max(Number(matchedRow.cajas_azucar) || 0, salesCajasAzucar);
      const mergedCajasPollo = Math.max(Number(matchedRow.cajas_pollo) || 0, salesCajasPollo);
      const mergedCajasEstandar = Math.max(
        Number(
          matchedRow.cajas_estandar_superior_asturias ??
            matchedRow.cajas_estandar_asturias ??
            matchedRow.cajas_jamon_asturias
        ) || 0,
        salesCajasEstandar
      );
      const mergedCajasMortadela = Math.max(
        Number(
          matchedRow.cajas_mortadela_salpicao_asturias ??
            matchedRow.cajas_mortadela_salpicao ??
            matchedRow.cajas_mortadela_asturias
        ) || 0,
        salesCajasMortadela
      );

      const mergedHasLeche =
        Boolean(matchedRow.has_leche_vencampo) ||
        Boolean(matchedRow.has_aceite) ||
        Boolean(salesSummary?.activeRubros.has('LECHE_VENCAMPO')) ||
        mergedCajasLeche > 0;
      const mergedHasAzucar =
        Boolean(matchedRow.has_azucar) ||
        Boolean(salesSummary?.activeRubros.has('AZUCAR')) ||
        mergedCajasAzucar > 0;
      const mergedHasPollo =
        Boolean(matchedRow.has_pollo) ||
        Boolean(salesSummary?.activeRubros.has('POLLO')) ||
        mergedCajasPollo > 0;
      const mergedHasEstandar =
        Boolean(matchedRow.has_estandar_superior_asturias) ||
        Boolean(matchedRow.has_estandar_asturias) ||
        Boolean(matchedRow.has_jamon_asturias) ||
        Boolean(salesSummary?.activeRubros.has('ESTANDAR_SUPERIOR_ASTURIAS')) ||
        mergedCajasEstandar > 0;
      const mergedHasMortadela =
        Boolean(matchedRow.has_mortadela_salpicao_asturias) ||
        Boolean(matchedRow.has_mortadela_salpicao) ||
        Boolean(matchedRow.has_mortadela_asturias) ||
        Boolean(salesSummary?.activeRubros.has('MORTADELA_SALPICAO_ASTURIAS')) ||
        mergedCajasMortadela > 0;

      const hasPurchases =
        mergedHasLeche ||
        mergedHasAzucar ||
        mergedHasPollo ||
        mergedHasEstandar ||
        mergedHasMortadela ||
        hasSalesActivity;

      const currentStatus = sanitizeMaestraText(matchedRow.status).toUpperCase();
      const wasLogicallyInactive = isActivationRecordLogicallyInactive(matchedRow);
      const restoredStatus =
        hasPurchases || (!wasLogicallyInactive && currentStatus === 'ACTIVO')
          ? 'ACTIVO'
          : 'INACTIVO';

      const needsUpdate =
        wasLogicallyInactive ||
        String(matchedRow.cliente_nombre || '') !== rec.razonSocial ||
        sanitizeMaestraText(matchedRow.vendedor_nombre).toUpperCase() !== rec.vendedor ||
        sanitizeMaestraText(matchedRow.vendedor_id).toUpperCase() !== rec.vendedor ||
        currentStatus !== restoredStatus ||
        Boolean(matchedRow.has_aceite) !== mergedHasLeche ||
        Boolean(matchedRow.has_azucar) !== mergedHasAzucar ||
        Boolean(matchedRow.has_pollo) !== mergedHasPollo ||
        Boolean(matchedRow.has_estandar_asturias) !== mergedHasEstandar ||
        Boolean(matchedRow.has_mortadela_salpicao) !== mergedHasMortadela;

      if (needsUpdate) {
        rowsToUpsertById.push({
          id: rowId,
          periodo,
          cliente_codigo: String(matchedRow.cliente_codigo || rec.idCliente),
          cliente_nombre: rec.razonSocial,
          vendedor_id: rec.vendedor,
          vendedor_nombre: rec.vendedor,
          status: restoredStatus,
          cajas_aceite: mergedCajasLeche,
          cajas_azucar: mergedCajasAzucar,
          cajas_pollo: mergedCajasPollo,
          cajas_estandar_asturias: mergedCajasEstandar,
          cajas_mortadela_salpicao: mergedCajasMortadela,
          has_aceite: mergedHasLeche,
          has_azucar: mergedHasAzucar,
          has_pollo: mergedHasPollo,
          has_estandar_asturias: mergedHasEstandar,
          has_mortadela_salpicao: mergedHasMortadela,
        });
      }
    } else {
      // Nueva alta (ej. Id = 8377 bajo LUIS GUANIPA o clientes nuevos) enriquecida con ventas reales
      const newHasLeche =
        Boolean(salesSummary?.activeRubros.has('LECHE_VENCAMPO')) || salesCajasLeche > 0;
      const newHasAzucar =
        Boolean(salesSummary?.activeRubros.has('AZUCAR')) || salesCajasAzucar > 0;
      const newHasPollo =
        Boolean(salesSummary?.activeRubros.has('POLLO')) || salesCajasPollo > 0;
      const newHasEstandar =
        Boolean(salesSummary?.activeRubros.has('ESTANDAR_SUPERIOR_ASTURIAS')) ||
        salesCajasEstandar > 0;
      const newHasMortadela =
        Boolean(salesSummary?.activeRubros.has('MORTADELA_SALPICAO_ASTURIAS')) ||
        salesCajasMortadela > 0;
      const newStatus =
        newHasLeche ||
        newHasAzucar ||
        newHasPollo ||
        newHasEstandar ||
        newHasMortadela ||
        hasSalesActivity
          ? 'ACTIVO'
          : 'INACTIVO';

      rowsToInsertNew.push({
        rec,
        payload: {
          periodo,
          cliente_codigo: rec.idCliente,
          cliente_nombre: rec.razonSocial,
          vendedor_id: rec.vendedor,
          vendedor_nombre: rec.vendedor,
          status: newStatus,
          cajas_aceite: salesCajasLeche,
          cajas_azucar: salesCajasAzucar,
          cajas_pollo: salesCajasPollo,
          cajas_estandar_asturias: salesCajasEstandar,
          cajas_mortadela_salpicao: salesCajasMortadela,
          has_aceite: newHasLeche,
          has_azucar: newHasAzucar,
          has_pollo: newHasPollo,
          has_estandar_asturias: newHasEstandar,
          has_mortadela_salpicao: newHasMortadela,
        },
      });
    }
  }

  // 2. Identificar filas en Supabase que NO están en la Maestra para aplicar Borrado Lógico (activo = false, preservando CHECK status IN ('ACTIVO','INACTIVO'))
  let logicalDeactivatedCount = 0;
  for (const row of existingSupaRows) {
    if (typeof row.id !== 'number') continue;
    const rowId = Number(row.id);
    if (usedDbRowIds.has(rowId)) continue;

    if (!isActivationRecordLogicallyInactive(row)) {
      logicalDeactivatedCount++;
      const cleanVendor = extractCleanVendorRoute(row);
      rowsToUpsertById.push({
        id: rowId,
        periodo,
        cliente_codigo: String(row.cliente_codigo || ''),
        cliente_nombre: sanitizeMaestraText(row.cliente_nombre),
        vendedor_id: `${LOGICAL_INACTIVE_VENDOR_PREFIX}${cleanVendor}`,
        vendedor_nombre: cleanVendor,
        status: 'INACTIVO',
        cajas_aceite: Number(row.cajas_leche_vencampo ?? row.cajas_aceite) || 0,
        cajas_azucar: Number(row.cajas_azucar) || 0,
        cajas_pollo: Number(row.cajas_pollo) || 0,
        cajas_estandar_asturias:
          Number(
            row.cajas_estandar_superior_asturias ??
              row.cajas_estandar_asturias ??
              row.cajas_jamon_asturias
          ) || 0,
        cajas_mortadela_salpicao:
          Number(
            row.cajas_mortadela_salpicao_asturias ??
              row.cajas_mortadela_salpicao ??
              row.cajas_mortadela_asturias
          ) || 0,
        has_aceite: Boolean(row.has_leche_vencampo ?? row.has_aceite),
        has_azucar: Boolean(row.has_azucar),
        has_pollo: Boolean(row.has_pollo),
        has_estandar_asturias: Boolean(
          row.has_estandar_superior_asturias ??
            row.has_estandar_asturias ??
            row.has_jamon_asturias
        ),
        has_mortadela_salpicao: Boolean(
          row.has_mortadela_salpicao_asturias ??
            row.has_mortadela_salpicao ??
            row.has_mortadela_asturias
        ),
      });
    }
  }

  let batchesProcessed = 0;
  let upsertedCount = 0;
  let insertedCount = 0;

  // 3. Ejecutar Batch Upsert en lotes deduplicados por PK `id`
  const upsertChunks = chunkForBatchUpsert(
    rowsToUpsertById,
    (item) => String(item.id),
    batchSize
  );

  for (const chunk of upsertChunks) {
    const { error } = await fdvSupabase
      .from('activacion_clientes')
      .upsert(chunk, { onConflict: 'id' });
    if (error) {
      throw new Error(`Fallo en batch upsert de activacion_clientes: ${error.message}`);
    }
    batchesProcessed++;
    upsertedCount += chunk.length;
  }

  // 4. Ejecutar inserción por lotes de nuevas asignaciones (manejando posible índice único sobre cliente_codigo)
  const insertChunks = chunkForBatchUpsert(
    rowsToInsertNew,
    (item) => item.rec.assignmentKey,
    batchSize
  );

  for (const chunk of insertChunks) {
    const payloads = chunk.map((c) => c.payload);
    const { error } = await fdvSupabase.from('activacion_clientes').insert(payloads);
    if (!error) {
      batchesProcessed++;
      insertedCount += payloads.length;
    } else {
      // Fallback individual con llave compuesta en cliente_codigo si existe restricción UNIQUE(periodo, cliente_codigo)
      for (const item of chunk) {
        const singleRes = await fdvSupabase.from('activacion_clientes').insert(item.payload);
        if (!singleRes.error) {
          insertedCount++;
        } else {
          const fallbackPayload = {
            ...item.payload,
            cliente_codigo: `${item.rec.idCliente}#${item.rec.idVendedor}`,
          };
          const retryRes = await fdvSupabase.from('activacion_clientes').insert(fallbackPayload);
          if (retryRes.error) {
            throw new Error(
              `Fallo insertando asignación compuesta ${item.rec.assignmentKey}: ${retryRes.error.message}`
            );
          }
          insertedCount++;
        }
      }
      batchesProcessed++;
    }
  }

  // 5. Actualizar carteraClientes.json (preservando bajas previas con activo: false)
  const excelRouteKeys = new Set(parsed.records.map((r) => r.routeAssignmentKey));
  const excelIds = new Set(parsed.records.map((r) => r.idCliente));

  const nextCarteraActive: ExistingCarteraRecordLike[] = parsed.records.map((rec) => ({
    id: rec.idCliente,
    nombre: rec.razonSocial,
    rif: rec.rif,
    vendedor: rec.canonicalSeller,
    rutaVendedor: rec.vendedor,
    idVendedor: rec.idVendedor,
    supervisor: rec.supervisor,
    canal: rec.tipoCliente,
    zona: rec.zona,
    region: 'OCCIDENTE',
    activo: true,
  }));

  const deactivatedCarteraHistory: ExistingCarteraRecordLike[] = [];
  for (const oldC of existingCarteraRows) {
    const cid = normalizeClientId(oldC.id);
    const oldRoute = sanitizeMaestraText(oldC.rutaVendedor || oldC.vendedor).toUpperCase();
    const rcKey = buildRouteClientKey(oldRoute, cid);
    if (!excelIds.has(cid) && !excelRouteKeys.has(rcKey)) {
      deactivatedCarteraHistory.push({
        ...oldC,
        id: cid,
        activo: false,
      });
    }
  }

  const finalCartera = [...nextCarteraActive, ...deactivatedCarteraHistory];
  const carteraPath = path.join(rootDir, 'src', 'data', 'carteraClientes.json');
  fs.writeFileSync(carteraPath, JSON.stringify(finalCartera, null, 2), 'utf8');

  // 5b. Intentar sincronizar también vendedores_maestro, clientes_maestro y catalog_sync_meta en Supabase (no bloqueante si la migración 007 aún no está aplicada)
  try {
    const sellersPayload = getRuntimeSellerCatalog().map((s) => ({
      vendedor_id: s.vendedor_id,
      codigo_erp: s.codigo_erp,
      nombre_canonico: s.nombre_canonico,
      display_name: s.display_name,
      ruta_oficial: s.ruta_oficial,
      aliases: s.aliases,
      supervisor: s.supervisor,
      zona: s.zona,
      region: s.region,
      role: s.role,
      is_supervisor_route: s.is_supervisor_route,
      incluir_en_volumen: s.incluir_en_volumen,
      meta_activacion: s.meta_activacion,
      meta_volumen: s.meta_volumen,
      email: s.email || null,
      activo: s.activo,
      updated_at: syncedAt,
    }));
    await fdvSupabase.from('vendedores_maestro').upsert(sellersPayload, { onConflict: 'nombre_canonico' });

    const masterClientsChunks = chunkForBatchUpsert(
      parsed.records.map((rec) => ({
        composite_key: rec.routeAssignmentKey,
        cliente_codigo: rec.idCliente,
        razon_social: rec.razonSocial,
        rif: rec.rif,
        sucursal: 'PRINCIPAL',
        direccion: '',
        tipo_cliente: rec.tipoCliente,
        vendedor_id: rec.idVendedor,
        vendedor_nombre: rec.vendedor,
        vendedor_canonico: rec.canonicalSeller,
        supervisor: rec.supervisor,
        zona: rec.zona,
        region: 'OCCIDENTE',
        estatus: 'ACTIVO',
        activo: true,
        updated_at: syncedAt,
      })),
      (x) => x.composite_key,
      batchSize
    );
    for (const mChunk of masterClientsChunks) {
      await fdvSupabase.from('clientes_maestro').upsert(mChunk, { onConflict: 'composite_key' });
    }
    await fdvSupabase.from('catalog_sync_meta').upsert(
      {
        id: 'GLOBAL_MASTER_SYNC',
        last_synced_at: syncedAt,
        source_filename: parsed.sourceFilename,
        periodo,
        active_clients_count: parsed.validActiveCount,
        active_sellers_count: OFFICIAL_MASTER_VENDEDORES_SEED.filter((s) => s.activo && !s.is_supervisor_route).length,
      },
      { onConflict: 'id' }
    );
  } catch {
    // Tablas opcionales de migración 007
  }

  // 6. Guardar Snapshot de Auditoría (si es la primera sincronización con deltas reales o si este archivo trajo cambios, persistirlo)
  const previousSnap = loadMaestraAuditSnapshot(rootDir);
  const hasRealChangesInThisRun =
    liveAuditReport.auditTotals.altasSupabaseCount > 0 ||
    liveAuditReport.auditTotals.altasCarteraCount > 0 ||
    liveAuditReport.auditTotals.cambiosVendedorRutaCount > 0 ||
    liveAuditReport.auditTotals.cambiosTipoClienteCount > 0 ||
    liveAuditReport.auditTotals.saneamientosTextoCount > 0 ||
    liveAuditReport.auditTotals.bajasLogicasCount > 0;

  const reportToPersist: MaestraAuditReport =
    hasRealChangesInThisRun ||
    !previousSnap ||
    previousSnap.parseMetrics.validActiveCount !== parsed.validActiveCount
      ? liveAuditReport
      : {
          ...previousSnap,
          syncedAt,
        };

  const snapPath = path.join(rootDir, 'src', 'data', 'maestraActivaAuditSnapshot.json');
  fs.writeFileSync(snapPath, JSON.stringify(reportToPersist, null, 2), 'utf8');

  // 7. Re-consultar Supabase actualizado para construir activacionClientesSeed.json 100% consistente
  const updatedSupaRows = await fetchAllSupabaseActivacionRows(fdvSupabase, periodo);
  const fullSeedWithHistory = mapSupabaseRowsToClientActivationList(updatedSupaRows, rootDir, true);
  const activeSeedPayload = fullSeedWithHistory.filter((r) => r.activo !== false);

  const seedPath = path.join(rootDir, 'src', 'data', 'activacionClientesSeed.json');
  fs.writeFileSync(seedPath, JSON.stringify(fullSeedWithHistory, null, 2), 'utf8');

  return {
    response: {
      success: true,
      syncedAt,
      periodo,
      batchesProcessed,
      upsertedCount,
      insertedCount,
      logicalDeactivatedCount,
      activePortfolioTotal: activeSeedPayload.length,
      sellersTotal: parsed.sellersCount,
      auditReport: reportToPersist,
    },
    activeSeedPayload,
  };
}
