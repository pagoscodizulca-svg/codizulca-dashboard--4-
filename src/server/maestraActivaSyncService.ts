import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  LOGICAL_INACTIVE_VENDOR_PREFIX,
  buildRouteClientKey,
  chunkForBatchUpsert,
  compareMaestraAgainstDatabase,
  extractCleanVendorRoute,
  isActivationRecordLogicallyInactive,
  normalizeClientId,
  sanitizeMaestraText,
} from '../lib/maestraActivaEngine';
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
    ACEITE: number;
    AZUCAR: number;
    POLLO: number;
    ESTANDAR_ASTURIAS: number;
    MORTADELA_SALPICAO: number;
  };
  cats: {
    ACEITE: boolean;
    AZUCAR: boolean;
    POLLO: boolean;
    ESTANDAR_ASTURIAS: boolean;
    MORTADELA_SALPICAO: boolean;
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
  periodo = '2026-10'
): Promise<ExistingActivationRecordLike[]> {
  const rows: ExistingActivationRecordLike[] = [];
  let from = 0;
  const pageSize = 1000;
  while (from < 25000) {
    const { data, error } = await fdvSupabase
      .from('activacion_clientes')
      .select('*')
      .eq('periodo', periodo)
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

    const hasAceite = Boolean(r.has_aceite) || (Number(r.cajas_aceite) || 0) > 0;
    const hasAzucar = Boolean(r.has_azucar) || (Number(r.cajas_azucar) || 0) > 0;
    const hasPollo = Boolean(r.has_pollo) || (Number(r.cajas_pollo) || 0) > 0;
    const hasAsturias = Boolean(r.has_estandar_asturias) || (Number(r.cajas_estandar_asturias) || 0) > 0;
    const hasSalpicao = Boolean(r.has_mortadela_salpicao) || (Number(r.cajas_mortadela_salpicao) || 0) > 0;

    const meta = metaMap.get(baseCompKey) || metaMap.get(`ID_ONLY::${cid}`);
    const effectiveStatus = isBajaMaestra
      ? 'BAJA_MAESTRA'
      : hasAceite || hasAzucar || hasPollo || hasAsturias || hasSalpicao || rawStatus === 'ACTIVO'
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
          ACEITE: Number(r.cajas_aceite) || 0,
          AZUCAR: Number(r.cajas_azucar) || 0,
          POLLO: Number(r.cajas_pollo) || 0,
          ESTANDAR_ASTURIAS: Number(r.cajas_estandar_asturias) || 0,
          MORTADELA_SALPICAO: Number(r.cajas_mortadela_salpicao) || 0,
        },
        cats: {
          ACEITE: hasAceite,
          AZUCAR: hasAzucar,
          POLLO: hasPollo,
          ESTANDAR_ASTURIAS: hasAsturias,
          MORTADELA_SALPICAO: hasSalpicao,
        },
      });
    } else {
      const prev = byCompositeMap.get(mapKey)!;
      prev.cats.ACEITE = prev.cats.ACEITE || hasAceite;
      prev.cats.AZUCAR = prev.cats.AZUCAR || hasAzucar;
      prev.cats.POLLO = prev.cats.POLLO || hasPollo;
      prev.cats.ESTANDAR_ASTURIAS = prev.cats.ESTANDAR_ASTURIAS || hasAsturias;
      prev.cats.MORTADELA_SALPICAO = prev.cats.MORTADELA_SALPICAO || hasSalpicao;
      prev.cajas.ACEITE = Math.max(prev.cajas.ACEITE, Number(r.cajas_aceite) || 0);
      prev.cajas.AZUCAR = Math.max(prev.cajas.AZUCAR, Number(r.cajas_azucar) || 0);
      prev.cajas.POLLO = Math.max(prev.cajas.POLLO, Number(r.cajas_pollo) || 0);
      prev.cajas.ESTANDAR_ASTURIAS = Math.max(
        prev.cajas.ESTANDAR_ASTURIAS,
        Number(r.cajas_estandar_asturias) || 0
      );
      prev.cajas.MORTADELA_SALPICAO = Math.max(
        prev.cajas.MORTADELA_SALPICAO,
        Number(r.cajas_mortadela_salpicao) || 0
      );
      if (
        !isBajaMaestra &&
        (prev.cats.ACEITE ||
          prev.cats.AZUCAR ||
          prev.cats.POLLO ||
          prev.cats.ESTANDAR_ASTURIAS ||
          prev.cats.MORTADELA_SALPICAO)
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
  const periodo = options.periodo || '2026-10';
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

    if (matchedRow && typeof matchedRow.id === 'number' && !usedDbRowIds.has(Number(matchedRow.id))) {
      const rowId = Number(matchedRow.id);
      usedDbRowIds.add(rowId);

      const hasPurchases =
        Boolean(matchedRow.has_aceite) ||
        Boolean(matchedRow.has_azucar) ||
        Boolean(matchedRow.has_pollo) ||
        Boolean(matchedRow.has_estandar_asturias) ||
        Boolean(matchedRow.has_mortadela_salpicao) ||
        (Number(matchedRow.cajas_aceite) || 0) > 0 ||
        (Number(matchedRow.cajas_azucar) || 0) > 0 ||
        (Number(matchedRow.cajas_pollo) || 0) > 0 ||
        (Number(matchedRow.cajas_estandar_asturias) || 0) > 0 ||
        (Number(matchedRow.cajas_mortadela_salpicao) || 0) > 0;

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
        currentStatus !== restoredStatus;

      if (needsUpdate) {
        rowsToUpsertById.push({
          id: rowId,
          periodo,
          cliente_codigo: String(matchedRow.cliente_codigo || rec.idCliente),
          cliente_nombre: rec.razonSocial,
          vendedor_id: rec.vendedor,
          vendedor_nombre: rec.vendedor,
          status: restoredStatus,
          cajas_aceite: Number(matchedRow.cajas_aceite) || 0,
          cajas_azucar: Number(matchedRow.cajas_azucar) || 0,
          cajas_pollo: Number(matchedRow.cajas_pollo) || 0,
          cajas_estandar_asturias: Number(matchedRow.cajas_estandar_asturias) || 0,
          cajas_mortadela_salpicao: Number(matchedRow.cajas_mortadela_salpicao) || 0,
          has_aceite: Boolean(matchedRow.has_aceite),
          has_azucar: Boolean(matchedRow.has_azucar),
          has_pollo: Boolean(matchedRow.has_pollo),
          has_estandar_asturias: Boolean(matchedRow.has_estandar_asturias),
          has_mortadela_salpicao: Boolean(matchedRow.has_mortadela_salpicao),
        });
      }
    } else {
      // Nueva alta (ej. Id = 8377 bajo LUIS GUANIPA o clientes nuevos)
      rowsToInsertNew.push({
        rec,
        payload: {
          periodo,
          cliente_codigo: rec.idCliente,
          cliente_nombre: rec.razonSocial,
          vendedor_id: rec.vendedor,
          vendedor_nombre: rec.vendedor,
          status: 'INACTIVO',
          cajas_aceite: 0,
          cajas_azucar: 0,
          cajas_pollo: 0,
          cajas_estandar_asturias: 0,
          cajas_mortadela_salpicao: 0,
          has_aceite: false,
          has_azucar: false,
          has_pollo: false,
          has_estandar_asturias: false,
          has_mortadela_salpicao: false,
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
        cajas_aceite: Number(row.cajas_aceite) || 0,
        cajas_azucar: Number(row.cajas_azucar) || 0,
        cajas_pollo: Number(row.cajas_pollo) || 0,
        cajas_estandar_asturias: Number(row.cajas_estandar_asturias) || 0,
        cajas_mortadela_salpicao: Number(row.cajas_mortadela_salpicao) || 0,
        has_aceite: Boolean(row.has_aceite),
        has_azucar: Boolean(row.has_azucar),
        has_pollo: Boolean(row.has_pollo),
        has_estandar_asturias: Boolean(row.has_estandar_asturias),
        has_mortadela_salpicao: Boolean(row.has_mortadela_salpicao),
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
