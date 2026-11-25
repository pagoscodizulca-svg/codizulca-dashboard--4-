import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const MONTHS_2026 = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
];

const OFFICIAL_SELLERS_LIST = [
  'MARIA BRICEÑO',
  'CUENTAS CLAVES 1 - MC',
  'MIKELANGELO DIAZ',
  'HERNAN PAZ',
  'OSWALDO CHURION',
  'CARLOS FUENMAYOR',
  'SARAH REYES',
  'J PABLO ARAUJO - CAB/OJE',
  'JOSE G. GONZALEZ',
  'ANGELICA MORENO',
  'ADEL JARABA',
  'JUAN HERNANDEZ',
  'YOLEIDA LUGO',
  'CUENTAS CLAVES 2 - SV',
  'ELISA SOLER',
  'ANGEL NAVARRO',
  'MARIANGEL GONZALEZ',
  'VICTOR CAMPOS',
  'J PABLO ARAUJO',
  'EDUARDO PIÑA',
  'LEONARDO RIOS',
  'MARYERY GARCIA',
  'VICTORIA VARGAS',
  'PEDRO ABREU',
  'OSCAR ORTIZ',
];

const VALID_VOLUME_SELLERS = new Set(OFFICIAL_SELLERS_LIST);

function normalizeSellerName(name = '') {
  let n = String(name || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/MARÍA\b/, 'MARIA')
    .replace(/BRICENO\b/, 'BRICEÑO')
    .replace(/BRICEO\b/, 'BRICEÑO')
    .replace(/PINA\b/, 'PIÑA')
    .replace(/PIA\b/, 'PIÑA')
    .replace(/CHACÍN\b/, 'CHACIN')
    .replace(/PÉREZ\b/, 'PEREZ')
    .replace(/ALÍ\b/, 'ALI')
    .replace(/HERNÁNDEZ\b/, 'HERNANDEZ')
    .replace(/HERNÁN\b/, 'HERNAN')
    .replace(/GONZÁLEZ\b/, 'GONZALEZ')
    .replace(/GARCÍA\b/, 'GARCIA')
    .replace(/RÍOS\b/, 'RIOS')
    .replace(/ANGÉLICA\b/, 'ANGELICA')
    .replace(/VÍCTOR\b/, 'VICTOR')
    .replace(/JOSÉ\b/, 'JOSE');

  if (n.includes('CUENTAS CLAVES 1')) return 'CUENTAS CLAVES 1 - MC';
  if (n.includes('CUENTAS CLAVES 2')) return 'CUENTAS CLAVES 2 - SV';
  if (n.includes('CAB/OJE') || n.includes('CABIMAS') || n.includes('OJEDA')) {
    if (n.includes('ARAUJO') || n.includes('PABLO')) return 'J PABLO ARAUJO - CAB/OJE';
  }
  if (n === 'MIKELANGELO DIAZ1' || n.includes('MIKELANGELO DIAZ')) return 'MIKELANGELO DIAZ';
  if (n === 'ALI PEREZ' || n === 'ANGEL NAVARRO') return 'ANGEL NAVARRO';
  if (
    n === 'VICTORIA VARGAS' ||
    n === 'LUIS GUANIPA' ||
    n === 'GUANIPA' ||
    n.includes('LUIS GUANIPA') ||
    n.includes('VICTORIA VARGAS')
  ) {
    return 'VICTORIA VARGAS';
  }
  if (n.startsWith('OSCAR ORTIZ')) return 'OSCAR ORTIZ';
  return n;
}

const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

async function fetchAllHistoryRowsByKeysetId(supabase) {
  const [minRes, maxRes] = await Promise.all([
    supabase.from('history_sales').select('id').order('id', { ascending: true }).limit(1),
    supabase.from('history_sales').select('id').order('id', { ascending: false }).limit(1),
  ]);
  if (minRes.error) throw new Error(`minId: ${minRes.error.message}`);
  if (maxRes.error) throw new Error(`maxId: ${maxRes.error.message}`);

  const minId = Number(minRes.data?.[0]?.id) || 1;
  const maxId = Number(maxRes.data?.[0]?.id) || 0;
  if (maxId <= 0) return new Map();

  const ranges = [];
  for (let lo = minId; lo <= maxId; lo += 1000) {
    ranges.push([lo, Math.min(lo + 999, maxId)]);
  }

  const byMonth = new Map();
  for (const m of MONTHS_2026) byMonth.set(m, []);

  const CONCURRENCY = 10;
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ([lo, hi]) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await supabase
            .from('history_sales')
            .select('id,ano,mes,fecha,tipo_doc,vendedor,id_articulo,articulo,cajas,unidades,kgs_lts,monto,costo,utilidad')
            .gte('id', lo)
            .lte('id', hi)
            .limit(1000);
          if (!error && Array.isArray(data)) return data;
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
        throw new Error(`Failed keyset range ${lo}-${hi}`);
      })
    );
    for (const chunk of results) {
      for (const row of chunk) {
        if (Number(row.ano) !== 2026) continue;
        const mes = String(row.mes || '').trim().toUpperCase();
        if (byMonth.has(mes)) {
          byMonth.get(mes).push(row);
        }
      }
    }
  }
  return byMonth;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE key in environment.');
  }

  const supabase = createClient(url.replace('/rest/v1/', ''), key);
  const tStart = Date.now();

  const exactMonthlyTotals = {};
  const productAggRows = [];
  const dailyTrendsByMonth = {};
  const sellerMonthMap = new Map();
  let totalSourceRows = 0;

  const rowsByMonth = await fetchAllHistoryRowsByKeysetId(supabase);

  for (let idx = 0; idx < MONTHS_2026.length; idx++) {
    const mes = MONTHS_2026[idx];
    const ym = `2026-${String(idx + 1).padStart(2, '0')}`;
    const tm = Date.now();
    const rows = rowsByMonth.get(mes) || [];
    totalSourceRows += rows.length;

    let faRows = 0;
    let dvRows = 0;
    let totalFA = 0;
    let totalDV = 0;
    let totalNeto = 0;
    let costoFA = 0;
    let costoDV = 0;
    let totalCosto = 0;
    let utilidadFA = 0;
    let utilidadDV = 0;
    let totalUtilidad = 0;
    let cajasFA = 0;
    let cajasDV = 0;
    let totalCajas = 0;
    let unidadesFA = 0;
    let unidadesDV = 0;
    let totalUnidades = 0;
    let kgsFA = 0;
    let kgsDV = 0;
    let totalKgs = 0;
    let kgsBruto = 0;

    const prodMap = new Map();
    const dailyMap = new Map();

    for (const r of rows) {
      const monto = Number(r.monto) || 0;
      const costo = Number(r.costo) || 0;
      const utilidad = Number(r.utilidad) || 0;
      const cajas = Number(r.cajas) || 0;
      const unidades = Number(r.unidades) || 0;
      const kgs = Number(r.kgs_lts) || 0;
      const isDV = String(r.tipo_doc || '').trim().toUpperCase() === 'DV' || monto < 0;

      totalNeto += monto;
      totalCosto += costo;
      totalUtilidad += utilidad;
      totalCajas += cajas;
      totalUnidades += unidades;
      totalKgs += kgs;
      kgsBruto += Math.abs(kgs);

      if (isDV) {
        dvRows++;
        totalDV += monto;
        costoDV += costo;
        utilidadDV += utilidad;
        cajasDV += cajas;
        unidadesDV += unidades;
        kgsDV += kgs;
      } else {
        faRows++;
        totalFA += monto;
        costoFA += costo;
        utilidadFA += utilidad;
        cajasFA += cajas;
        unidadesFA += unidades;
        kgsFA += kgs;
      }

      const artId = Number(r.id_articulo) || 0;
      const artName = String(r.articulo || '').trim();
      if (!prodMap.has(artId)) {
        prodMap.set(artId, {
          id_articulo: artId,
          articulo: artName,
          ano: 2026,
          mes,
          monto: 0,
          montoFA: 0,
          montoDV: 0,
          cajas: 0,
          kgs_lts: 0,
          costo: 0,
          utilidad: 0,
        });
      }
      const p = prodMap.get(artId);
      if (!p.articulo && artName) p.articulo = artName;
      p.monto += monto;
      if (isDV) p.montoDV += monto;
      else p.montoFA += monto;
      p.cajas += cajas;
      p.kgs_lts += kgs;
      p.costo += costo;
      p.utilidad += utilidad;

      const rawFecha = String(r.fecha || '').trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawFecha) && rawFecha.startsWith(ym)) {
        if (!dailyMap.has(rawFecha)) {
          dailyMap.set(rawFecha, {
            date: rawFecha,
            ventas: 0,
            kg: 0,
            kgFacturado: 0,
            kgDespachado: 0,
            cajas: 0,
            utilidad: 0,
          });
        }
        const d = dailyMap.get(rawFecha);
        d.ventas += monto;
        d.kg += kgs;
        d.kgFacturado += kgs;
        d.kgDespachado += kgs;
        d.cajas += cajas;
        d.utilidad += utilidad;
      }

      const normSeller = normalizeSellerName(r.vendedor || '');
      if (VALID_VOLUME_SELLERS.has(normSeller)) {
        const sKey = `${normSeller}|||${mes}`;
        if (!sellerMonthMap.has(sKey)) {
          sellerMonthMap.set(sKey, {
            vendedor: normSeller,
            mes,
            ano: 2026,
            cajas: 0,
            kgs: 0,
            montoNeto: 0,
            montoFA: 0,
            montoDV: 0,
            cajasFA: 0,
            cajasDV: 0,
            facturasCount: 0,
          });
        }
        const s = sellerMonthMap.get(sKey);
        s.cajas += cajas;
        s.kgs += kgs;
        s.montoNeto += monto;
        if (isDV) {
          s.montoDV += monto;
          s.cajasDV += cajas;
        } else {
          s.montoFA += monto;
          s.cajasFA += cajas;
        }
        s.facturasCount++;
      }
    }

    exactMonthlyTotals[`2026 ${mes}`] = {
      ano: 2026,
      mes,
      totalRows: rows.length,
      validRows: rows.length,
      faRows,
      dvRows,
      totalFA: r2(totalFA),
      totalDV: r2(totalDV),
      totalNeto: r2(totalNeto),
      costoFA: r2(costoFA),
      costoDV: r2(costoDV),
      totalCosto: r2(totalCosto),
      utilidadFA: r2(utilidadFA),
      utilidadDV: r2(utilidadDV),
      totalUtilidad: r2(totalUtilidad),
      kgsFA: r2(kgsFA),
      kgsDV: r2(kgsDV),
      totalKgs: r2(totalKgs),
      kgsBruto: r2(kgsBruto),
      unidadesFA: r2(unidadesFA),
      unidadesDV: r2(unidadesDV),
      totalUnidades: r2(totalUnidades),
      cajasFA: r2(cajasFA),
      cajasDV: r2(cajasDV),
      totalCajas: r2(totalCajas),
    };

    for (const p of prodMap.values()) {
      productAggRows.push({
        ...p,
        monto: r2(p.monto),
        montoFA: r2(p.montoFA),
        montoDV: r2(p.montoDV),
        cajas: r2(p.cajas),
        kgs_lts: r2(p.kgs_lts),
        costo: r2(p.costo),
        utilidad: r2(p.utilidad),
      });
    }

    if (dailyMap.size > 0) {
      dailyTrendsByMonth[ym] = Array.from(dailyMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: d.date,
          ventas: r2(d.ventas),
          kg: r2(d.kg),
          kgFacturado: r2(d.kgFacturado),
          kgDespachado: r2(d.kgDespachado),
          cajas: r2(d.cajas),
          utilidad: r2(d.utilidad),
        }));
    }

    console.log(
      `[Supabase Sync] ${ym} (${mes}): ${rows.length} filas | Neto: $${r2(totalNeto).toLocaleString('en-US')} | Cajas: ${r2(totalCajas)} | Kg: ${r2(totalKgs)} | Utilidad: $${r2(totalUtilidad)} | Días: ${dailyMap.size} (${Date.now() - tm}ms)`
    );
  }

  const cwd = process.cwd();
  fs.writeFileSync(path.join(cwd, 'exact_monthly_totals.json'), JSON.stringify(exactMonthlyTotals, null, 2));
  fs.writeFileSync(path.join(cwd, 'historical_sales_aggregated.json'), JSON.stringify(productAggRows, null, 2));
  fs.writeFileSync(path.join(cwd, 'exact_historical_sales_aggregated.json'), JSON.stringify(productAggRows, null, 2));
  fs.writeFileSync(path.join(cwd, 'historical_daily_trends.json'), JSON.stringify(dailyTrendsByMonth, null, 2));

  // Preserve NOVIEMBRE rows in sellers_monthly_volume_cache.json while updating Ene-Oct from Supabase
  const sellersVolPath = path.join(cwd, 'sellers_monthly_volume_cache.json');
  let existingNovSellers = [];
  if (fs.existsSync(sellersVolPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(sellersVolPath, 'utf8'));
      if (Array.isArray(existing.sellerMonthlyData)) {
        existingNovSellers = existing.sellerMonthlyData.filter(
          (s) => String(s?.mes || '').trim().toUpperCase() === 'NOVIEMBRE'
        );
      }
    } catch {
      // ignore
    }
  }

  const sellerMonthlyData = [
    ...Array.from(sellerMonthMap.values()).map((s) => ({
      ...s,
      cajas: r2(s.cajas),
      kgs: r2(s.kgs),
      montoNeto: r2(s.montoNeto),
      montoFA: r2(s.montoFA),
      montoDV: r2(s.montoDV),
      cajasFA: r2(s.cajasFA),
      cajasDV: r2(s.cajasDV),
    })),
    ...existingNovSellers,
  ];

  const monthlyTotalsSummary = new Map();
  for (const s of sellerMonthlyData) {
    if (!monthlyTotalsSummary.has(s.mes)) {
      monthlyTotalsSummary.set(s.mes, {
        mes: s.mes,
        ano: s.ano || 2026,
        cajas: 0,
        kgs: 0,
        montoNeto: 0,
        montoFA: 0,
        montoDV: 0,
        vendedoresSet: new Set(),
        facturasCount: 0,
      });
    }
    const mt = monthlyTotalsSummary.get(s.mes);
    mt.cajas += Number(s.cajas) || 0;
    mt.kgs += Number(s.kgs) || 0;
    mt.montoNeto += Number(s.montoNeto) || 0;
    mt.montoFA += Number(s.montoFA) || 0;
    mt.montoDV += Number(s.montoDV) || 0;
    mt.vendedoresSet.add(s.vendedor);
    mt.facturasCount += Number(s.facturasCount) || 0;
  }

  const orderMonths = [...MONTHS_2026, 'NOVIEMBRE'];
  const monthlyTotalsArr = orderMonths
    .filter((m) => monthlyTotalsSummary.has(m))
    .map((m) => {
      const mt = monthlyTotalsSummary.get(m);
      return {
        mes: mt.mes,
        ano: mt.ano,
        cajas: r2(mt.cajas),
        kgs: r2(mt.kgs),
        montoNeto: r2(mt.montoNeto),
        montoFA: r2(mt.montoFA),
        montoDV: r2(mt.montoDV),
        vendedoresCount: mt.vendedoresSet.size,
        facturasCount: mt.facturasCount,
      };
    });

  fs.writeFileSync(
    sellersVolPath,
    JSON.stringify(
      {
        ano: 2026,
        lastSync: new Date().toISOString(),
        totalSourceRows,
        monthlyTotals: monthlyTotalsArr,
        sellerMonthlyData,
      },
      null,
      2
    )
  );

  console.log(
    `[Supabase Sync] Completado en ${((Date.now() - tStart) / 1000).toFixed(2)}s. Total filas Supabase (Ene-Oct): ${totalSourceRows}. Productos agregados: ${productAggRows.length}.`
  );
}

main().catch((err) => {
  console.error('[Supabase Sync] Error:', err);
  process.exit(1);
});
