import fs from 'fs';
import path from 'path';
import { parseMaestraActivaBuffer } from '../src/lib/maestraActivaEngine';
import { executeMaestraActivaBatchSync } from '../src/server/maestraActivaSyncService';

const DEFAULT_EXCEL_PATH =
  'C:/Users/JAVIER CASTELLANOS/.gemini/antigravity/brain/c84a6892-3887-459d-8762-736ca7bbfe94/.user_uploaded/media_1793305847098_5a3290d1.xlsx';

const SUPA_FDV_URL =
  process.env.GERENCIA_SUPABASE_URL ||
  process.env.VITE_GERENCIA_SUPABASE_URL ||
  'https://nudltbgyewyiklqdyujk.supabase.co';
const SUPA_FDV_KEY =
  process.env.GERENCIA_SUPABASE_ANON_KEY ||
  process.env.VITE_GERENCIA_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx0Ymd5ZXd5aWtscWR5dWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgzMDA3OCwiZXhwIjoyMTA3NDA2MDc4fQ.k92vdZiuVkTzAWNK8Fq71m1Xi_MoWtpx_eRQcZTw1cA';

async function main() {
  const excelArg = process.argv[2] || DEFAULT_EXCEL_PATH;
  const resolvedExcel = path.resolve(excelArg);
  if (!fs.existsSync(resolvedExcel)) {
    throw new Error(`No se encontró el archivo Excel en: ${resolvedExcel}`);
  }

  const filename =
    resolvedExcel.includes('media_1793305847098') ? 'MAESTRA ACTIVA (7).xlsx' : path.basename(resolvedExcel);

  console.log(`[MaestraActivaSync] 1. Leyendo y validando "${filename}"...`);
  const buf = fs.readFileSync(resolvedExcel);
  const parsed = parseMaestraActivaBuffer(new Uint8Array(buf), filename);
  console.log('[MaestraActivaSync] Métricas ETL:', {
    title: parsed.title,
    totalRowsBelowHeader: parsed.totalRowsBelowHeader,
    emptyRowsIgnored: parsed.emptyRowsIgnored,
    validActiveCount: parsed.validActiveCount,
    distinctClientIdsCount: parsed.distinctClientIdsCount,
    sellersCount: parsed.sellersCount,
    pendingCount: parsed.pendingRecords.length,
    duplicateIdsCount: parsed.duplicateIdGroups.length,
  });

  console.log('[MaestraActivaSync] 2. Ejecutando sincronización por lotes en Supabase (public.activacion_clientes)...');
  const { response, activeSeedPayload } = await executeMaestraActivaBatchSync(parsed, {
    supabaseUrl: SUPA_FDV_URL,
    supabaseKey: SUPA_FDV_KEY,
    rootDir: process.cwd(),
    periodo: '2026-10',
    batchSize: 250,
  });

  console.log('[MaestraActivaSync] 3. Resultado de Sincronización en Vivo:', {
    success: response.success,
    syncedAt: response.syncedAt,
    batchesProcessed: response.batchesProcessed,
    upsertedCount: response.upsertedCount,
    insertedCount: response.insertedCount,
    logicalDeactivatedCount: response.logicalDeactivatedCount,
    activePortfolioTotal: response.activePortfolioTotal,
    sellersTotal: response.sellersTotal,
    auditTotals: response.auditReport.auditTotals,
  });

  const byVendor = new Map<string, number>();
  for (const r of activeSeedPayload) {
    byVendor.set(r.vendedorNombre, (byVendor.get(r.vendedorNombre) || 0) + 1);
  }
  console.log(`[MaestraActivaSync] 4. Verificación post-sync (${byVendor.size} rutas, ${activeSeedPayload.length} clientes activos):`);
  for (const [v, cnt] of Array.from(byVendor.entries()).sort()) {
    console.log(`  ${v.padEnd(38, ' ')} -> ${cnt}`);
  }
}

main().catch((err) => {
  console.error('[MaestraActivaSync] ERROR:', err);
  process.exit(1);
});
