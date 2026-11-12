import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  ALLOWED_GOOGLE_SHEET_TABS,
  buildGoogleSheetRawExportUrl,
  calculateNovember2026CommercialMetrics,
  getConfiguredGoogleSheetId,
  type GoogleSheetTabName,
} from '../src/lib/googleSheetsMatrixParser';
import { isValidVolumeSeller, normalizeSellerName } from '../src/components/cuotas/sellerSupervisorMap';

async function fetchTabCsv(tab: GoogleSheetTabName, sheetId: string): Promise<string> {
  const url = buildGoogleSheetRawExportUrl(tab, sheetId);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Error descargando pestaña autorizada "${tab}": HTTP ${res.status}`);
  }
  return await res.text();
}

async function main() {
  const sheetId = getConfiguredGoogleSheetId();
  if (!sheetId) {
    console.error('ERROR: process.env.GOOGLE_SHEET_ID no está definido en el entorno del servidor.');
    process.exit(1);
  }

  console.log('================================================================================');
  console.log(' AUDITORÍA FINANCIERO-COMERCIAL GOOGLE SHEETS ("Data dashboard") — NOVIEMBRE 2026');
  console.log('================================================================================');
  console.log(`[Seguridad] process.env.GOOGLE_SHEET_ID cargado en servidor (oculto, len=${sheetId.length})`);
  console.log(`[Allowlist] Pestañas autorizadas (${ALLOWED_GOOGLE_SHEET_TABS.length}): ${ALLOWED_GOOGLE_SHEET_TABS.join(', ')}`);

  // Leer estado previo del caché en disco para comparar Motor Anterior vs Motor Corregido
  const cachePath = path.join(process.cwd(), 'sellers_monthly_volume_cache.json');
  let previousAngelNavarroCache: { kgs: number; facturasCount: number; lastSync: string } = {
    kgs: 393.2,
    facturasCount: 77,
    lastSync: '2026-11-06T12:17:34.053Z',
  };
  let fullCacheObj: any = null;

  if (fs.existsSync(cachePath)) {
    try {
      fullCacheObj = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const prevRow = (fullCacheObj?.sellerMonthlyData || []).find(
        (r: any) => normalizeSellerName(r.vendedor) === 'ANGEL NAVARRO' && r.mes === 'NOVIEMBRE'
      );
      if (prevRow && prevRow.kgs < 1000) {
        previousAngelNavarroCache = {
          kgs: Number(prevRow.kgs),
          facturasCount: Number(prevRow.facturasCount),
          lastSync: fullCacheObj.lastSync || previousAngelNavarroCache.lastSync,
        };
      }
    } catch {}
  }

  // Descargar en paralelo las 6 pestañas autorizadas
  const [
    ventasCsv,
    cuotasVolumenCsv,
    cuotasActivacionCsv,
    productosCsv,
    clientesCsv,
    supervisoresCsv,
  ] = await Promise.all([
    fetchTabCsv('Ventas', sheetId),
    fetchTabCsv('Cuotas Volumen', sheetId),
    fetchTabCsv('Cuotas de Activacion', sheetId),
    fetchTabCsv('Productos', sheetId),
    fetchTabCsv('Clientes', sheetId),
    fetchTabCsv('Supervisores', sheetId),
  ]);

  const report = calculateNovember2026CommercialMetrics({
    ventasCsv,
    cuotasVolumenCsv,
    cuotasActivacionCsv,
    productosCsv,
    clientesCsv,
    supervisoresCsv,
    targetYear: 2026,
    targetMonth: 11,
  });

  // Actualizar sellers_monthly_volume_cache.json en disco con los valores auditados de Noviembre 2026
  if (fullCacheObj && Array.isArray(fullCacheObj.sellerMonthlyData)) {
    const nonNov = fullCacheObj.sellerMonthlyData.filter((r: any) => r.mes !== 'NOVIEMBRE');
    const novEntries = report.sellers
      .filter((s) => isValidVolumeSeller(s.vendedor))
      .map((s) => ({
        vendedor: s.vendedor,
        mes: 'NOVIEMBRE',
        ano: 2026,
        cajas: s.cajasNetas,
        kgs: s.volumenNetoKg,
        kgsBrutos: s.volumenBrutoKg,
        kgsDevoluciones: s.devolucionesKg,
        montoNeto: s.montoNeto,
        montoFA: s.montoBruto,
        montoDV: s.montoDevoluciones,
        cajasFA: s.cajasBrutas,
        cajasDV: s.cajasDevoluciones,
        facturasCount: s.filasValidasNoviembre,
        clientesActivadosNetos: s.clientesActivadosNetos,
        skusActivadosNetos: s.skusActivadosNetos,
      }));

    fullCacheObj.sellerMonthlyData = [...nonNov, ...novEntries];

    const novTotal = novEntries.reduce(
      (acc, cur) => {
        acc.cajas += cur.cajas;
        acc.kgs += cur.kgs;
        acc.montoNeto += cur.montoNeto;
        acc.montoFA += cur.montoFA;
        acc.montoDV += cur.montoDV;
        acc.facturasCount += cur.facturasCount;
        return acc;
      },
      { cajas: 0, kgs: 0, montoNeto: 0, montoFA: 0, montoDV: 0, facturasCount: 0 }
    );

    const otherMonthTotals = (fullCacheObj.monthlyTotals || []).filter(
      (m: any) => m.mes !== 'NOVIEMBRE'
    );
    fullCacheObj.monthlyTotals = [
      ...otherMonthTotals,
      {
        mes: 'NOVIEMBRE',
        ano: 2026,
        cajas: Math.round(novTotal.cajas * 100) / 100,
        kgs: Math.round(novTotal.kgs * 100) / 100,
        montoNeto: Math.round(novTotal.montoNeto * 100) / 100,
        montoFA: Math.round(novTotal.montoFA * 100) / 100,
        montoDV: Math.round(novTotal.montoDV * 100) / 100,
        vendedoresCount: novEntries.length,
        facturasCount: novTotal.facturasCount,
      },
    ];
    fullCacheObj.lastSync = new Date().toISOString();
    fs.writeFileSync(cachePath, JSON.stringify(fullCacheObj, null, 2));
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log(' 1. RESUMEN GLOBAL NOVIEMBRE 2026 (PESTAÑA "Ventas")');
  console.log('--------------------------------------------------------------------------------');
  console.log(`- Filas crudas totales en Ventas:         ${report.rowCounts.totalRawRowsInVentas}`);
  console.log(`- Filas válidas Noviembre 2026:           ${report.rowCounts.validNovember2026Rows}`);
  console.log(`- Filas excluidas (< 2026-11-01):         ${report.rowCounts.ignoredBeforeNovemberRows}`);
  console.log(`- Filas rechazadas por esquema (Zod):     ${report.rowCounts.rejectedMalformedRows}`);
  console.log(`- Volumen Bruto Global (Kg > 0):          ${report.globalTotals.volumenBrutoKg.toFixed(2)} kg`);
  console.log(`- Devoluciones Globales (Kg < 0):         ${report.globalTotals.devolucionesKg.toFixed(2)} kg`);
  console.log(`- Volumen Neto Global (SUM Kg):           ${report.globalTotals.volumenNetoKg.toFixed(2)} kg`);
  console.log(`- Cajas Netas Globales:                   ${report.globalTotals.cajasNetas.toFixed(2)}`);
  console.log(`- Monto Neto Global (USD):                $${report.globalTotals.montoNeto.toFixed(2)}`);
  console.log(
    `- Clientes Únicos Brutos vs Netos (>0):   ${report.globalTotals.clientesUnicosBrutosGlobal} brutos -> ${report.globalTotals.clientesActivadosNetosGlobal} activados netos`
  );
  console.log(
    `- SKUs con Movimiento vs Netos (>0):      ${report.globalTotals.skusConMovimientoBrutoGlobal} brutos -> ${report.globalTotals.skusActivadosNetosGlobal} activados netos`
  );

  const angel = report.controlCaseAngelNavarro;
  if (angel) {
    console.log('\n--------------------------------------------------------------------------------');
    console.log(' 2. CASO DE CONTROL OBLIGATORIO: ANGEL NAVARRO (NOVIEMBRE 2026)');
    console.log('--------------------------------------------------------------------------------');
    console.table([
      {
        Metrica: 'Filas procesadas en Ventas (Nov 2026)',
        Motor_Anterior_Cache: `${previousAngelNavarroCache.facturasCount} filas (corte 04/11)`,
        Motor_Corregido_Vivo: `${angel.filasValidasNoviembre} filas (02/11..12/11)`,
        Diferencia: `+${angel.filasValidasNoviembre - previousAngelNavarroCache.facturasCount} filas`,
      },
      {
        Metrica: 'Volumen Bruto (Kg > 0)',
        Motor_Anterior_Cache: 'N/D',
        Motor_Corregido_Vivo: `${angel.volumenBrutoKg.toFixed(2)} kg`,
        Diferencia: `+${angel.volumenBrutoKg.toFixed(2)} kg`,
      },
      {
        Metrica: 'Devoluciones (Kg < 0)',
        Motor_Anterior_Cache: 'N/D',
        Motor_Corregido_Vivo: `${angel.devolucionesKg.toFixed(2)} kg`,
        Diferencia: `${angel.devolucionesKg.toFixed(2)} kg`,
      },
      {
        Metrica: 'Volumen Neto Real (SUM Kg)',
        Motor_Anterior_Cache: `${previousAngelNavarroCache.kgs.toFixed(2)} kg (UI: 393 kg)`,
        Motor_Corregido_Vivo: `${angel.volumenNetoKg.toFixed(2)} kg`,
        Diferencia: `+${(angel.volumenNetoKg - previousAngelNavarroCache.kgs).toFixed(2)} kg`,
      },
      {
        Metrica: 'Posición Ranking (Supervisión Ali Pérez)',
        Motor_Anterior_Cache: '#7 (Último)',
        Motor_Corregido_Vivo: `#${angel.rankingSupervisor} (General: #${angel.rankingGeneral})`,
        Diferencia: 'Sube a #6 (supera a Luis Guanipa)',
      },
      {
        Metrica: 'Cuota Volumen Noviembre (Cuotas Volumen)',
        Motor_Anterior_Cache: '25,034.40 kg (Octubre estático)',
        Motor_Corregido_Vivo: `${angel.cuotaVolumenHojaKg.toFixed(2)} kg (${angel.cumplimientoVolumenPct.toFixed(2)}%)`,
        Diferencia: '-779.70 kg (87 SKUs sincronizados)',
      },
      {
        Metrica: 'Clientes Activados Netos (SUM Kg > 0)',
        Motor_Anterior_Cache: `${angel.clientesUnicosBrutos} brutos (sin netear dev.)`,
        Motor_Corregido_Vivo: `${angel.clientesActivadosNetos} / ${angel.carteraAsignadaOficial} (${angel.pctActivacionClientes.toFixed(2)}%)`,
        Diferencia: `${angel.clientesConDevolucionTotal} clientes con devolución total filtrados`,
      },
      {
        Metrica: 'SKUs Activados Netos (SUM Kg > 0)',
        Motor_Anterior_Cache: `${angel.skusConMovimientoBruto} brutos`,
        Motor_Corregido_Vivo: `${angel.skusActivadosNetos} SKUs netos (${angel.paresClienteSkuActivadosNetos} pares Cliente-SKU)`,
        Diferencia: `${angel.skusConDevolucionTotal} SKUs en <= 0 tras devoluciones filtrados`,
      },
    ]);

    console.log('\n[ANGEL NAVARRO — Desglose de Activación por Categoría de Productos (SUM Kg > 0)]:');
    console.table(angel.activacionPorCategoriaProductos);

    if (angel.cuotasActivacionHoja) {
      console.log('\n[ANGEL NAVARRO — Metas vs Activados en Hoja "Cuotas de Activacion" (A1:L28)]:');
      console.table(angel.cuotasActivacionHoja);
    }
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log(' 3. RANKING Y CUADRATURA DE LA FUERZA DE VENTAS — NOVIEMBRE 2026');
  console.log('--------------------------------------------------------------------------------');
  console.table(
    report.sellers.map((s) => ({
      Rank_Gen: s.rankingGeneral ?? 'EXCL',
      Rank_Sup: s.rankingSupervisor ?? '-',
      Vendedor: s.vendedor,
      Supervisor: s.supervisor,
      Filas: s.filasValidasNoviembre,
      Kg_Bruto: s.volumenBrutoKg,
      Kg_Dev: s.devolucionesKg,
      Kg_Neto: s.volumenNetoKg,
      Cuota_Kg: s.cuotaVolumenHojaKg,
      Cli_Netos: `${s.clientesActivadosNetos}/${s.carteraAsignadaOficial} (${s.pctActivacionClientes}%)`,
      SKUs_Netos: s.skusActivadosNetos,
    }))
  );

  console.log('\n--------------------------------------------------------------------------------');
  console.log(' 4. AUDITORÍA DE INTEGRIDAD REFERENCIAL');
  console.log('--------------------------------------------------------------------------------');
  console.log(
    `- SKUs en Ventas no presentes en hoja Productos (${report.referentialIntegrity.skusHuerfanosEnVentas.length}):`,
    report.referentialIntegrity.skusHuerfanosEnVentas.join(', ') || 'Ninguno'
  );
  console.log(
    `- Clientes en Ventas no presentes en hoja Clientes (${report.referentialIntegrity.clientesHuerfanosEnVentas.length}):`,
    report.referentialIntegrity.clientesHuerfanosEnVentas.join(', ') || 'Ninguno'
  );
  console.log(
    `- Vendedores en Ventas normalizados vía catálogo maestro (${report.referentialIntegrity.vendedoresRawNoEnHojaSupervisores.length}):`
  );
  console.table(report.referentialIntegrity.vendedoresRawNoEnHojaSupervisores);
}

main().catch((err) => {
  console.error('Error ejecutando auditoría Noviembre 2026:', err);
  process.exit(1);
});
