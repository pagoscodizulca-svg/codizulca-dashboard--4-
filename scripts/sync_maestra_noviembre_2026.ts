import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import {
  isMissingExcelLookupValue,
  normalizeBusinessNameForLookup,
  normalizeClientId,
  parseMaestraCsvContent,
  sanitizeMaestraText,
} from '../src/lib/maestraActivaEngine';
import {
  buildExternalLookupMapsFromLocalData,
  executeMaestraActivaBatchSync,
} from '../src/server/maestraActivaSyncService';

const SUPABASE_URL = 'https://nudltbgyewyiklqdyujk.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx0Ymd5ZXd5aWtscWR5dWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgzMDA3OCwiZXhwIjoyMTA3NDA2MDc4fQ.k92vdZiuVkTzAWNK8Fq71m1Xi_MoWtpx_eRQcZTw1cA';

const GERENCIA_ROOT = 'c:/Users/JAVIER CASTELLANOS/Downloads/codizulca-dashboard (4)';
const PLANIFICADOR_ROOT = 'c:/Users/JAVIER CASTELLANOS/Downloads/dashboard-fdv---planificador';
const CSV_PATH = path.join(GERENCIA_ROOT, 'src', 'data', 'maestra_clientes_activos_noviembre_2026.csv');
const LEGACY_XLSX_LOOKUP_PATH =
  'C:/Users/JAVIER CASTELLANOS/.gemini/antigravity/brain/436de5ef-5c42-4d81-8277-a4a5132cc05d/.user_uploaded/media_1792525962922_e8ff7148.xlsx';

async function main() {
  console.log('================================================================================');
  console.log(' SINCRONIZACIÓN MAESTRA UNIFICADA DE CLIENTES Y VENDEDORES — NOVIEMBRE 2026');
  console.log('================================================================================');

  // 1. Construir mapas de enriquecimiento (RIF y Tipo de Cliente) desde carteraClientes.json + Excel auxiliar TIPO/RIF
  const externalLookups = buildExternalLookupMapsFromLocalData(GERENCIA_ROOT);

  if (fs.existsSync(LEGACY_XLSX_LOOKUP_PATH)) {
    const wb = XLSX.read(fs.readFileSync(LEGACY_XLSX_LOOKUP_PATH), { type: 'buffer' });
    if (wb.Sheets['TIPO']) {
      const tipoRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['TIPO'], { header: 1, defval: '' });
      for (let i = 1; i < tipoRows.length; i++) {
        const r = tipoRows[i] || [];
        const cid = normalizeClientId(r[0]);
        const bName = normalizeBusinessNameForLookup(r[1]);
        const tipo = sanitizeMaestraText(r[2]).toUpperCase();
        if (!isMissingExcelLookupValue(tipo)) {
          if (cid) externalLookups.tipoById?.set(cid, tipo);
          if (bName) externalLookups.tipoByName?.set(bName, tipo);
        }
      }
    }
    if (wb.Sheets['RIF']) {
      const rifRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['RIF'], { header: 1, defval: '' });
      for (let i = 1; i < rifRows.length; i++) {
        const r = rifRows[i] || [];
        const cid = normalizeClientId(r[0]);
        const bName = normalizeBusinessNameForLookup(r[1]);
        const rif = sanitizeMaestraText(r[2]).toUpperCase();
        if (!isMissingExcelLookupValue(rif)) {
          if (cid) externalLookups.rifById?.set(cid, rif);
          if (bName) externalLookups.rifByName?.set(bName, rif);
        }
      }
    }
    console.log(
      `[1/5] Mapas de enriquecimiento cargados -> Tipos por ID: ${externalLookups.tipoById?.size}, RIFs por ID: ${externalLookups.rifById?.size}`
    );
  }

  // 2. Parsear y sanitizar MAESTRA CLIENTES ACTIVOS NOVIEMBRE 2026 (.csv)
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const parsed = parseMaestraCsvContent(
    csvContent,
    'MAESTRA_ACTIVA_ultima_version.csv',
    externalLookups
  );

  console.log(
    `[2/5] CSV Maestra Noviembre 2026 parseado -> Título: "${parsed.title}" | Filas activas válidas: ${parsed.validActiveCount} | IDs únicos: ${parsed.distinctClientIdsCount} | Rutas activas: ${parsed.sellersCount} | IDs compartidos: ${parsed.duplicateIdGroups.length}`
  );

  // 3. Ejecutar Batch Sync transaccional (UPSERT + Borrado Lógico sin DELETE masivo) en Supabase y Dashboard de Gerencia
  const { response, activeSeedPayload } = await executeMaestraActivaBatchSync(parsed, {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_SERVICE_KEY,
    rootDir: GERENCIA_ROOT,
    periodo: '2026-11',
    batchSize: 250,
  });

  console.log(
    `[3/5] Sincronización UPSERT en Supabase public.activacion_clientes completada:`
  );
  console.log(`      - Periodo: ${response.periodo}`);
  console.log(`      - Lotes procesados: ${response.batchesProcessed}`);
  console.log(`      - Registros actualizados (UPSERT): ${response.upsertedCount}`);
  console.log(`      - Nuevas altas insertadas: ${response.insertedCount}`);
  console.log(`      - Bajas lógicas aplicadas (activo=false): ${response.logicalDeactivatedCount}`);
  console.log(`      - Total cartera activa sincronizada: ${activeSeedPayload.length}`);

  // 4. Actualizar semilla maestra local del Dashboard de Ventas / Planificador (scripts/data_maestra_octubre_2026.json)
  const planificadorSeed = parsed.records.map((rec) => ({
    id_vendedor: rec.idVendedor,
    vendedor: rec.vendedor,
    vendedor_canonico: rec.canonicalSeller,
    supervisor: rec.supervisor,
    id: rec.idCliente,
    razon_social: rec.razonSocial,
    rif: rec.rif,
    tipo_cliente: rec.tipoCliente,
    zona: rec.zona,
    activo: true,
  }));

  const planificadorSeedPath = path.join(
    PLANIFICADOR_ROOT,
    'scripts',
    'data_maestra_octubre_2026.json'
  );
  fs.writeFileSync(planificadorSeedPath, JSON.stringify(planificadorSeed, null, 2), 'utf8');
  console.log(
    `[4/5] Semilla local de Planificador actualizada (${planificadorSeedPath}) -> ${planificadorSeed.length} registros activos.`
  );

  // 5. Sincronizar mediante UPSERT no destructivo la tabla public.usuarios en Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data: existingUsers, error: usrErr } = await supabase
    .from('usuarios')
    .select('*');

  if (!usrErr && Array.isArray(existingUsers)) {
    const byUsername = new Map<string, Record<string, unknown>>();
    for (const u of existingUsers) {
      byUsername.set(String(u.username || '').trim().toUpperCase(), u);
    }

    const desiredUsers = [
      // 3 Supervisores Comerciales Oficiales
      { username: 'ALI PEREZ', role: 'SUPERVISOR', vendor_id: 'SUP-02', defaultPass: '19117934' },
      { username: 'JOHNATAN SOTO', role: 'SUPERVISOR', vendor_id: 'SUP-01', defaultPass: '18395226' },
      { username: 'NELSON FINOL', role: 'SUPERVISOR', vendor_id: 'SUP-03', defaultPass: '12345678' },
      // Correcciones de vendor_id y rutas faltantes en usuarios
      { username: 'MIKELANGELO DIAZ', role: 'VENDEDOR', vendor_id: '3', defaultPass: '20863632' },
      { username: 'MARIANA CHACIN', role: 'VENDEDOR', vendor_id: '55', defaultPass: '15260049' },
      { username: 'SAIRU VALLES', role: 'VENDEDOR', vendor_id: '56', defaultPass: '18383237' },
      { username: 'JAIDER MEDINA - FOOD SERVICE NORTE', role: 'VENDEDOR', vendor_id: '20', defaultPass: '20202020' },
      { username: 'FOOD SERVICE SUR', role: 'VENDEDOR', vendor_id: '19', defaultPass: '19191919' },
      { username: 'FOOD SERVICE SENIOR - JUAN HERNANDEZ', role: 'VENDEDOR', vendor_id: '57', defaultPass: '14658122' },
    ];

    let usersUpserted = 0;
    for (const du of desiredUsers) {
      const existing = byUsername.get(du.username);
      if (existing) {
        const needsUpdate =
          existing.role !== du.role ||
          String(existing.vendor_id || '') !== du.vendor_id ||
          existing.activo !== true;
        if (needsUpdate) {
          const { error: uErr } = await supabase
            .from('usuarios')
            .update({
              role: du.role,
              vendor_id: du.vendor_id,
              activo: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (!uErr) usersUpserted++;
        }
      } else {
        const { error: iErr } = await supabase.from('usuarios').insert({
          username: du.username,
          password_hash: du.defaultPass,
          role: du.role,
          vendor_id: du.vendor_id,
          nombre_completo: du.username,
          activo: true,
        });
        if (!iErr) usersUpserted++;
      }
    }
    console.log(
      `[5/5] Tabla public.usuarios sincronizada mediante UPSERT -> ${usersUpserted} perfiles actualizados/insertados.`
    );
  }

  console.log('================================================================================');
  console.log(' RESUMEN POR RUTA / VENDEDOR EN NOVIEMBRE 2026 (30 RUTAS ACTIVAS)');
  console.log('================================================================================');
  for (const s of parsed.sellerSummaries) {
    console.log(
      `  ID ${s.idVendedor.padEnd(3)} | ${s.vendedor.padEnd(38)} | Sup: ${s.supervisor.padEnd(15)} | Clientes: ${s.activeCount}`
    );
  }
}

main().catch((err) => {
  console.error('Error fatal en sincronización:', err);
  process.exit(1);
});
