import Papa from 'papaparse';
import { supabase } from './supabase';

export interface ParsedMonthlySalesRow {
  id: number;
  numero_fila: number;
  composite_row_key: string;
  ano: number;
  mes: string;
  mes_num: number;
  fecha: string;
  tipo_doc: 'FA' | 'DV';
  numero: string;
  id_cliente: string;
  cliente: string;
  id_vendedor: string;
  vendedor: string;
  id_articulo: string;
  articulo: string;
  cajas: number;
  unidades: number;
  kgs_lts: number;
  monto: number;
  costo: number;
  utilidad: number;
  porcentaje_utilidad: number;
}

export interface MonthlySalesControlMetrics {
  totalLines: number;
  validRows: number;
  faRows: number;
  dvRows: number;
  uniqueInvoiceNumbers: number;
  montoNeto: number;
  montoFA: number;
  montoDV: number;
  costoNeto: number;
  costoFA: number;
  costoDV: number;
  utilidadNeta: number;
  utilidadFA: number;
  utilidadDV: number;
  kgsNeto: number;
  kgsFA: number;
  kgsDV: number;
  kgsBrutoAbsoluto: number;
  unidadesNeto: number;
  unidadesFA: number;
  unidadesDV: number;
  cajasNeto: number;
  cajasFA: number;
  cajasDV: number;
}

export interface MonthlySalesParseResult {
  rows: ParsedMonthlySalesRow[];
  metrics: MonthlySalesControlMetrics;
  headers: string[];
  delimiter: ';' | ',';
  rejectedRows: number;
}

export interface PostUploadReconciliationReport {
  isExactMatch: boolean;
  csvMetrics: MonthlySalesControlMetrics;
  supabaseCount: number;
  supabaseMontoNeto: number;
  supabaseCostoNeto: number;
  supabaseUtilidadNeta: number;
  supabaseKgsNeto: number;
  supabaseKgsFA: number;
  supabaseKgsBrutoAbsoluto: number;
  supabaseUnidadesNeto: number;
  supabaseCajasNeto: number;
  discrepancies: string[];
  summaryMessage: string;
}

/**
 * Valores de control auditados para el archivo oficial `data octubre .csv` (29,722 registros válidos).
 */
export const OCTOBER_2026_CONTROL_TOTALS: MonthlySalesControlMetrics = {
  totalLines: 29723,
  validRows: 29722,
  faRows: 25336,
  dvRows: 4386,
  uniqueInvoiceNumbers: 13588,
  montoNeto: 5572634.4,
  montoFA: 7792442.94,
  montoDV: -2219808.54,
  costoNeto: 4253272.24,
  costoFA: 5924402.28,
  costoDV: -1671130.04,
  utilidadNeta: 1319362.16,
  utilidadFA: 1868040.66,
  utilidadDV: -548678.5,
  kgsNeto: 2166435.83,
  kgsFA: 3105976.35,
  kgsDV: -939540.52,
  kgsBrutoAbsoluto: 4045516.87,
  unidadesNeto: 2088953.0,
  unidadesFA: 3030681.0,
  unidadesDV: -941728.0,
  cajasNeto: 727486.41,
  cajasFA: 1183449.44,
  cajasDV: -455963.03,
};

const MONTH_NUMBER_TO_SPANISH: Record<number, string> = {
  1: 'ENERO',
  2: 'FEBRERO',
  3: 'MARZO',
  4: 'ABRIL',
  5: 'MAYO',
  6: 'JUNIO',
  7: 'JULIO',
  8: 'AGOSTO',
  9: 'SEPTIEMBRE',
  10: 'OCTUBRE',
  11: 'NOVIEMBRE',
  12: 'DICIEMBRE',
};

const SPANISH_MONTH_TO_NUMBER: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

/**
 * Causa Raíz 1: Limpieza estricta de separadores de miles con coma (`,`) y punto decimal (`.`).
 * Ejecuta `String(val).trim().replace(/,/g, '')` antes de convertir a `Number`,
 * preservando íntegramente los signos negativos de las devoluciones (`DV`).
 */
export function cleanNumericValue(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  const raw = String(val)
    .trim()
    .replace(/[$%\s]/g, '')
    .replace(/,/g, '');
  if (!raw || raw === '-' || raw === '--') return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeIsoDateString(rawFecha: unknown, fallbackAno: number, fallbackMesNum: number): string {
  const s = String(rawFecha ?? '').trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return `${fallbackAno}-${String(fallbackMesNum).padStart(2, '0')}-01`;
}

/**
 * Causa Raíz 2: Parser CSV con soporte estricto de comillas dobles (`quoteChar: '"'`),
 * punto y coma (`;`) dentro de nombres de clientes (ej. `"COMERCIALIZADORA YUSI 600; C.A."`),
 * limpieza de UTF-8 BOM (`\ufeff`) en el encabezado `Año`, y `.trim()` en todos los campos de texto.
 */
export function parseMonthlySalesCsvContent(csvContent: string): MonthlySalesParseResult {
  const cleanText = String(csvContent ?? '').replace(/^\uFEFF/, '');
  const nonEmptyLines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const firstLine = nonEmptyLines[0] || '';
  const delimiter: ';' | ',' = firstLine.includes(';') ? ';' : ',';

  const parsed = Papa.parse<string[]>(cleanText, {
    delimiter,
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: 'greedy',
  });

  const allMatrixRows = parsed.data || [];
  if (allMatrixRows.length === 0) {
    return {
      rows: [],
      headers: [],
      delimiter,
      rejectedRows: 0,
      metrics: {
        totalLines: 0,
        validRows: 0,
        faRows: 0,
        dvRows: 0,
        uniqueInvoiceNumbers: 0,
        montoNeto: 0,
        montoFA: 0,
        montoDV: 0,
        costoNeto: 0,
        costoFA: 0,
        costoDV: 0,
        utilidadNeta: 0,
        utilidadFA: 0,
        utilidadDV: 0,
        kgsNeto: 0,
        kgsFA: 0,
        kgsDV: 0,
        kgsBrutoAbsoluto: 0,
        unidadesNeto: 0,
        unidadesFA: 0,
        unidadesDV: 0,
        cajasNeto: 0,
        cajasFA: 0,
        cajasDV: 0,
      },
    };
  }

  const rawHeaders = allMatrixRows[0].map((h) => String(h ?? '').replace(/^\uFEFF/, '').trim());
  const normHeaders = rawHeaders.map((h) =>
    h
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );

  const findColIdx = (candidates: string[], fallbackIdx: number): number => {
    const idx = normHeaders.findIndex((nh) => candidates.includes(nh));
    return idx >= 0 ? idx : fallbackIdx;
  };

  const idxAno = findColIdx(['ano', 'anio', 'year'], 0);
  const idxMes = findColIdx(['mes', 'month'], 1);
  const idxFecha = findColIdx(['fecha', 'date'], 2);
  const idxTipoDoc = findColIdx(['tipodoc', 'tipo'], 3);
  const idxNumero = findColIdx(['numero', 'numdoc', 'factura'], 4);
  const idxIdCliente = findColIdx(['idcliente', 'codcliente'], 5);
  const idxCliente = findColIdx(['cliente', 'nombrecliente'], 6);
  const idxIdVendedor = findColIdx(['idvendedor', 'codvendedor'], 7);
  const idxVendedor = findColIdx(['vendedor', 'nombrevendedor'], 8);
  const idxIdArticulo = findColIdx(['idarticulo', 'codarticulo', 'sku'], 9);
  const idxArticulo = findColIdx(['articulo', 'producto', 'descripcion'], 10);
  const idxCajas = findColIdx(['cajas', 'bultos'], 11);
  const idxUnidades = findColIdx(['unidades', 'und'], 12);
  const idxKgs = findColIdx(['kgslts', 'kgs', 'kg', 'kilogramos'], 13);
  const idxMonto = findColIdx(['monto', 'ventas', 'total'], 14);
  const idxCosto = normHeaders.findIndex((nh) => ['costo', 'costototal'].includes(nh));
  const idxUtilidad = normHeaders.findIndex((nh) => ['utilidad', 'utilidadbruta'].includes(nh));
  const idxPctUtil = normHeaders.findIndex((nh) =>
    ['util', 'porcentajeutilidad', 'pctutilidad', 'deutilidad'].includes(nh)
  );

  const rows: ParsedMonthlySalesRow[] = [];
  let rejectedRows = 0;

  let faRows = 0;
  let dvRows = 0;
  const uniqueInvoices = new Set<string>();

  let montoFA = 0;
  let montoDV = 0;
  let costoFA = 0;
  let costoDV = 0;
  let utilidadFA = 0;
  let utilidadDV = 0;
  let kgsFA = 0;
  let kgsDV = 0;
  let unidadesFA = 0;
  let unidadesDV = 0;
  let cajasFA = 0;
  let cajasDV = 0;

  for (let r = 1; r < allMatrixRows.length; r++) {
    const cols = allMatrixRows[r];
    if (!cols || cols.length < 10) {
      rejectedRows++;
      continue;
    }

    const rawTipo = String(cols[idxTipoDoc] ?? '').trim().toUpperCase();
    if (rawTipo !== 'FA' && rawTipo !== 'DV') {
      rejectedRows++;
      continue;
    }

    const rawAno = cleanNumericValue(cols[idxAno]) || 2026;
    const rawMesStr = String(cols[idxMes] ?? '').trim().toUpperCase();
    const mesNum =
      SPANISH_MONTH_TO_NUMBER[rawMesStr] ||
      (Number.isFinite(Number(rawMesStr)) && Number(rawMesStr) >= 1 && Number(rawMesStr) <= 12
        ? Number(rawMesStr)
        : 10);
    const mesName = MONTH_NUMBER_TO_SPANISH[mesNum] || 'OCTUBRE';
    const fecha = normalizeIsoDateString(cols[idxFecha], rawAno, mesNum);

    const numero = String(cols[idxNumero] ?? '').trim();
    const id_cliente = String(cols[idxIdCliente] ?? '').trim();
    const cliente = String(cols[idxCliente] ?? '').trim();
    const id_vendedor = String(cols[idxIdVendedor] ?? '').trim();
    const vendedor = String(cols[idxVendedor] ?? '').trim();
    const id_articulo = String(cols[idxIdArticulo] ?? '').trim();
    const articulo = String(cols[idxArticulo] ?? '').trim();

    const cajas = cleanNumericValue(cols[idxCajas]);
    const unidades = cleanNumericValue(cols[idxUnidades]);
    const kgs_lts = cleanNumericValue(cols[idxKgs]);
    const monto = cleanNumericValue(cols[idxMonto]);
    const costo = idxCosto >= 0 ? cleanNumericValue(cols[idxCosto]) : 0;
    const utilidad = idxUtilidad >= 0 ? cleanNumericValue(cols[idxUtilidad]) : round2(monto - costo);
    const porcentaje_utilidad =
      idxPctUtil >= 0
        ? cleanNumericValue(cols[idxPctUtil])
        : costo !== 0
        ? round2((utilidad / Math.abs(costo)) * 100)
        : 0;

    const numero_fila = rows.length + 1;
    const composite_row_key = `${rawTipo}|${numero}|${id_articulo}|${numero_fila}`;

    rows.push({
      id: rawAno * 10000000 + mesNum * 100000 + numero_fila,
      numero_fila,
      composite_row_key,
      ano: rawAno,
      mes: mesName,
      mes_num: mesNum,
      fecha,
      tipo_doc: rawTipo,
      numero,
      id_cliente,
      cliente,
      id_vendedor,
      vendedor,
      id_articulo,
      articulo,
      cajas,
      unidades,
      kgs_lts,
      monto,
      costo,
      utilidad,
      porcentaje_utilidad,
    });

    uniqueInvoices.add(numero);

    if (rawTipo === 'FA') {
      faRows++;
      montoFA += monto;
      costoFA += costo;
      utilidadFA += utilidad;
      kgsFA += kgs_lts;
      unidadesFA += unidades;
      cajasFA += cajas;
    } else {
      dvRows++;
      montoDV += monto;
      costoDV += costo;
      utilidadDV += utilidad;
      kgsDV += kgs_lts;
      unidadesDV += unidades;
      cajasDV += cajas;
    }
  }

  const metrics: MonthlySalesControlMetrics = {
    totalLines: nonEmptyLines.length,
    validRows: rows.length,
    faRows,
    dvRows,
    uniqueInvoiceNumbers: uniqueInvoices.size,
    montoNeto: round2(montoFA + montoDV),
    montoFA: round2(montoFA),
    montoDV: round2(montoDV),
    costoNeto: round2(costoFA + costoDV),
    costoFA: round2(costoFA),
    costoDV: round2(costoDV),
    utilidadNeta: round2(utilidadFA + utilidadDV),
    utilidadFA: round2(utilidadFA),
    utilidadDV: round2(utilidadDV),
    kgsNeto: round2(kgsFA + kgsDV),
    kgsFA: round2(kgsFA),
    kgsDV: round2(kgsDV),
    kgsBrutoAbsoluto: round2(Math.abs(kgsFA) + Math.abs(kgsDV)),
    unidadesNeto: round2(unidadesFA + unidadesDV),
    unidadesFA: round2(unidadesFA),
    unidadesDV: round2(unidadesDV),
    cajasNeto: round2(cajasFA + cajasDV),
    cajasFA: round2(cajasFA),
    cajasDV: round2(cajasDV),
  };

  return {
    rows,
    metrics,
    headers: rawHeaders,
    delimiter,
    rejectedRows,
  };
}

export interface BatchUploadOptions {
  supabaseClient?: any;
  batchSize?: number;
  maxRetries?: number;
  onProgress?: (progress: {
    completedBatches: number;
    totalBatches: number;
    insertedRows: number;
    totalRows: number;
  }) => void;
}

/**
 * Causa Raíz 3: Carga por lotes (`batches` de 1,000 filas) con limpieza previa del período
 * (`ano` + `mes`) y control de reintentos para evitar colisiones por `Numero` y timeouts HTTP.
 */
export async function uploadMonthlySalesToSupabaseInBatches(
  rows: ParsedMonthlySalesRow[],
  options: BatchUploadOptions = {}
): Promise<{
  insertedRows: number;
  totalBatches: number;
  usedExtendedSchema: boolean;
}> {
  if (rows.length === 0) {
    return { insertedRows: 0, totalBatches: 0, usedExtendedSchema: true };
  }

  const client = options.supabaseClient || supabase;
  const batchSize = options.batchSize ?? 1000;
  const maxRetries = options.maxRetries ?? 3;

  const targetAno = rows[0].ano;
  const targetMesName = rows[0].mes;
  const targetMesNum = String(rows[0].mes_num).padStart(2, '0');
  const startDate = `${targetAno}-${targetMesNum}-01`;
  const endDate = `${targetAno}-${targetMesNum}-31`;

  // 1. Limpieza previa de los registros del mismo Año y Mes antes de insertar el archivo completo
  try {
    await client.from('history_sales').delete().gte('fecha', startDate).lte('fecha', endDate);
    await client.from('history_sales').delete().eq('ano', targetAno).eq('mes', targetMesName);
  } catch (delErr) {
    console.warn('[CSV Batch Uploader] Notice during pre-delete of target month:', delErr);
  }

  const totalBatches = Math.ceil(rows.length / batchSize);
  let insertedRows = 0;
  let usedExtendedSchema = true;

  for (let b = 0; b < totalBatches; b++) {
    const slice = rows.slice(b * batchSize, (b + 1) * batchSize);

    const toIntOrText = (val: string | number): string | number => {
      const s = String(val ?? '').trim();
      return /^-?\d+$/.test(s) ? Number(s) : s;
    };

    const buildPayload = (extended: boolean) =>
      slice.map((r) => {
        // No incluir `id` en el payload de INSERT porque en Supabase `history_sales.id`
        // está definido como `GENERATED ALWAYS AS IDENTITY` (código 428C9).
        const base: Record<string, any> = {
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
          base.costo = r.costo;
          base.utilidad = r.utilidad;
          base.porcentaje_utilidad = r.porcentaje_utilidad;
          base.numero_fila = r.numero_fila;
          base.composite_row_key = r.composite_row_key;
        }
        return base;
      });

    let attempt = 0;
    let batchSuccess = false;
    let lastError: any = null;

    while (attempt < maxRetries && !batchSuccess) {
      attempt++;
      const payload = buildPayload(usedExtendedSchema);
      const { error } = await client.from('history_sales').insert(payload);

      if (!error) {
        batchSuccess = true;
        insertedRows += slice.length;
      } else {
        const msg = String(error.message || '');
        if (
          usedExtendedSchema &&
          (msg.includes('costo') ||
            msg.includes('utilidad') ||
            msg.includes('numero_fila') ||
            msg.includes('composite_row_key'))
        ) {
          // Si la tabla en Supabase aún no tiene las columnas extendidas de la migración 006, reintentar con las 16 columnas base
          usedExtendedSchema = false;
          attempt--;
          continue;
        }
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, 300 * attempt));
        }
      }
    }

    if (!batchSuccess && lastError) {
      throw new Error(
        `Error insertando lote ${b + 1}/${totalBatches} en history_sales: ${lastError.message || String(lastError)}`
      );
    }

    options.onProgress?.({
      completedBatches: b + 1,
      totalBatches,
      insertedRows,
      totalRows: rows.length,
    });
  }

  return {
    insertedRows,
    totalBatches,
    usedExtendedSchema,
  };
}

/**
 * Causa Raíz 4: Validador post-carga que compara las sumas en memoria del CSV
 * contra los totales almacenados/esperados (con tolerancia contable de $0.01).
 */
export function validateMonthlyCsvControlTotals(
  csvMetrics: MonthlySalesControlMetrics,
  referenceTotals: MonthlySalesControlMetrics = OCTOBER_2026_CONTROL_TOTALS
): PostUploadReconciliationReport {
  const discrepancies: string[] = [];
  const checkDiff = (label: string, actual: number, expected: number, tolerance = 0.01) => {
    if (Math.abs(actual - expected) > tolerance) {
      discrepancies.push(`${label}: esperado ${expected.toFixed(2)}, obtenido ${actual.toFixed(2)}`);
    }
  };

  if (csvMetrics.validRows !== referenceTotals.validRows) {
    discrepancies.push(
      `Filas válidas: esperadas ${referenceTotals.validRows}, obtenidas ${csvMetrics.validRows}`
    );
  }
  if (csvMetrics.faRows !== referenceTotals.faRows) {
    discrepancies.push(
      `Facturas (FA): esperadas ${referenceTotals.faRows}, obtenidas ${csvMetrics.faRows}`
    );
  }
  if (csvMetrics.dvRows !== referenceTotals.dvRows) {
    discrepancies.push(
      `Devoluciones (DV): esperadas ${referenceTotals.dvRows}, obtenidas ${csvMetrics.dvRows}`
    );
  }

  checkDiff('Monto Neto (FA+DV)', csvMetrics.montoNeto, referenceTotals.montoNeto);
  checkDiff('Monto FA', csvMetrics.montoFA, referenceTotals.montoFA);
  checkDiff('Monto DV', csvMetrics.montoDV, referenceTotals.montoDV);
  checkDiff('Costo Neto (FA+DV)', csvMetrics.costoNeto, referenceTotals.costoNeto);
  checkDiff('Utilidad Neta (FA+DV)', csvMetrics.utilidadNeta, referenceTotals.utilidadNeta);
  checkDiff('Kgs/Lts Neto', csvMetrics.kgsNeto, referenceTotals.kgsNeto);
  checkDiff('Kgs/Lts FA', csvMetrics.kgsFA, referenceTotals.kgsFA);
  checkDiff('Kgs/Lts Bruto Absoluto (|FA|+|DV|)', csvMetrics.kgsBrutoAbsoluto, referenceTotals.kgsBrutoAbsoluto);
  checkDiff('Unidades Neto', csvMetrics.unidadesNeto, referenceTotals.unidadesNeto);
  checkDiff('Cajas Neto', csvMetrics.cajasNeto, referenceTotals.cajasNeto);

  const isExactMatch = discrepancies.length === 0;

  return {
    isExactMatch,
    csvMetrics,
    supabaseCount: csvMetrics.validRows,
    supabaseMontoNeto: csvMetrics.montoNeto,
    supabaseCostoNeto: csvMetrics.costoNeto,
    supabaseUtilidadNeta: csvMetrics.utilidadNeta,
    supabaseKgsNeto: csvMetrics.kgsNeto,
    supabaseKgsFA: csvMetrics.kgsFA,
    supabaseKgsBrutoAbsoluto: csvMetrics.kgsBrutoAbsoluto,
    supabaseUnidadesNeto: csvMetrics.unidadesNeto,
    supabaseCajasNeto: csvMetrics.cajasNeto,
    discrepancies,
    summaryMessage: isExactMatch
      ? `Reconciliación 100% exacta: ${csvMetrics.validRows.toLocaleString('en-US')} filas (FA: ${csvMetrics.faRows.toLocaleString('en-US')} | DV: ${csvMetrics.dvRows.toLocaleString('en-US')}) • Monto Neto $${csvMetrics.montoNeto.toLocaleString('en-US', { minimumFractionDigits: 2 })} • Costo Neto $${csvMetrics.costoNeto.toLocaleString('en-US', { minimumFractionDigits: 2 })} • Utilidad Neta $${csvMetrics.utilidadNeta.toLocaleString('en-US', { minimumFractionDigits: 2 })} • Kgs Neto ${csvMetrics.kgsNeto.toLocaleString('en-US', { minimumFractionDigits: 2 })} (FA: ${csvMetrics.kgsFA.toLocaleString('en-US', { minimumFractionDigits: 2 })} | Bruto: ${csvMetrics.kgsBrutoAbsoluto.toLocaleString('en-US', { minimumFractionDigits: 2 })})`
      : `Se detectaron ${discrepancies.length} diferencias frente a los valores de control: ${discrepancies.join('; ')}`,
  };
}
