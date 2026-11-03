import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://uterioexpfweghxfbvoa.supabase.co';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZXJpb2V4cGZ3ZWdoeGZidm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTg3ODYsImV4cCI6MjEwMzUzNDc4Nn0.bZnN4vrXUDlcoIaI7l39O-bU4GQp05SvJdio_cn6niI';

const supabase = createClient(supabaseUrl.replace('/rest/v1/', ''), supabaseKey);

const toIntOrText = (val) => {
  const s = String(val ?? '').trim();
  return /^-?\d+$/.test(s) ? Number(s) : s;
};

async function main() {
  const octPath = path.join(process.cwd(), 'october_sales_rows.json');
  if (!fs.existsSync(octPath)) {
    throw new Error('No se encontró october_sales_rows.json en el directorio del proyecto.');
  }

  const rows = JSON.parse(fs.readFileSync(octPath, 'utf8'));
  console.log(`[Sync Octubre 2026] Registros verificados en memoria: ${rows.length.toLocaleString('en-US')}`);

  // 1. Limpiar registros previos de Octubre 2026 en public.history_sales
  const { error: delErr } = await supabase
    .from('history_sales')
    .delete()
    .gte('fecha', '2026-10-01')
    .lte('fecha', '2026-10-31');

  if (delErr) {
    console.warn('[Sync Octubre 2026] Aviso en limpieza previa:', delErr.message);
  }

  // 2. Insertar en lotes de 1,000 filas (30 lotes para 29,722 filas)
  const batchSize = 1000;
  const totalBatches = Math.ceil(rows.length / batchSize);
  let inserted = 0;
  let useExtended = true;

  for (let b = 0; b < totalBatches; b++) {
    const slice = rows.slice(b * batchSize, (b + 1) * batchSize);

    const buildPayload = (extended) =>
      slice.map((r) => {
        const item = {
          ano: r.ano,
          mes: r.mes,
          fecha: r.fecha,
          tipo_doc: r.tipo_doc,
          numero: toIntOrText(r.numero),
          id_cliente: toIntOrText(r.id_cliente),
          cliente: r.cliente,
          id_vendedor: toIntOrText(r.id_vendedor),
          vendedor: r.vendedor,
          id_articulo: toIntOrText(r.id_articulo),
          articulo: r.articulo,
          cajas: r.cajas,
          unidades: r.unidades,
          kgs_lts: r.kgs_lts,
          monto: r.monto,
        };
        if (extended) {
          item.costo = r.costo;
          item.utilidad = r.utilidad;
          item.porcentaje_utilidad = r.porcentaje_utilidad;
          item.numero_fila = r.numero_fila;
          item.composite_row_key = r.composite_row_key;
        }
        return item;
      });

    let { error } = await supabase.from('history_sales').insert(buildPayload(useExtended));
    if (error && useExtended && /costo|utilidad|numero_fila|composite_row_key/i.test(error.message || '')) {
      useExtended = false;
      ({ error } = await supabase.from('history_sales').insert(buildPayload(false)));
    }

    if (error) {
      throw new Error(`Error en lote ${b + 1}/${totalBatches}: [${error.code}] ${error.message}`);
    }

    inserted += slice.length;
    console.log(`[Sync Octubre 2026] Lote ${b + 1}/${totalBatches} completado (${inserted.toLocaleString('en-US')}/${rows.length.toLocaleString('en-US')} filas)`);
  }

  // 3. Validar mediante la función RPC fn_resumen_mensual_history_sales
  const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_resumen_mensual_history_sales', {
    p_fecha_inicio: '2026-10-01',
    p_fecha_fin: '2026-10-31',
  });

  if (!rpcErr && rpcData) {
    console.log('[Sync Octubre 2026] Validación RPC exitosa:', rpcData);
  } else {
    const { count } = await supabase
      .from('history_sales')
      .select('*', { count: 'exact', head: true })
      .gte('fecha', '2026-10-01')
      .lte('fecha', '2026-10-31');
    console.log(`[Sync Octubre 2026] Conteo exacto en public.history_sales: ${count} filas`);
  }
}

main().catch((err) => {
  console.error('[Sync Octubre 2026] Error:', err.message);
  process.exit(1);
});
