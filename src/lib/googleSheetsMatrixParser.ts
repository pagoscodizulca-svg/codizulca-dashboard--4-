import Papa from 'papaparse';
import { z } from 'zod';
import {
  EXCLUDED_VOLUME_SELLERS,
  getSellerMetadata,
  isValidVolumeSeller,
  normalizeSellerName,
} from '../components/cuotas/sellerSupervisorMap';
import { ACTIVATION_CATEGORY_SKU_GROUPS, type RubroClienteCodigo } from '../components/cuotas/cuotasData';

export const NOVEMBER_STRICT_CUTOFF_DATE = '2026-11-01';

/**
 * REGLA 2 DE SEGURIDAD Y GOBERNANZA (Data Minimization):
 * Lista blanca estricta y cerrada de las 6 pestañas analíticas autorizadas.
 * Queda terminantemente prohibido consultar, cachear, registrar o exponer
 * cualquier otra pestaña del documento (ej. Usuarios, Inventario, etc.).
 */
export const ALLOWED_GOOGLE_SHEET_TABS = [
  'Ventas',
  'Cuotas Volumen',
  'Cuotas de Activacion',
  'Productos',
  'Clientes',
  'Supervisores',
] as const;

export type GoogleSheetTabName = (typeof ALLOWED_GOOGLE_SHEET_TABS)[number];

export const GOOGLE_SHEET_TAB_GIDS: Record<GoogleSheetTabName, string> = {
  Ventas: '1176024108',
  'Cuotas Volumen': '1575247832',
  'Cuotas de Activacion': '1956715436',
  Productos: '1163463775',
  Clientes: '765796985',
  Supervisores: '1921442451',
};

export class DisallowedSheetTabError extends Error {
  public readonly statusCode = 403;
  public readonly requestedTab: string;

  constructor(requestedTab: string) {
    super(
      `Acceso denegado: La pestaña solicitada no pertenece a la allowlist analítica autorizada (${ALLOWED_GOOGLE_SHEET_TABS.join(', ')}).`
    );
    this.name = 'DisallowedSheetTabError';
    this.requestedTab = requestedTab;
  }
}

export class MissingGoogleSheetConfigError extends Error {
  public readonly statusCode = 500;

  constructor() {
    super(
      'Configuración faltante en servidor: La variable de entorno process.env.GOOGLE_SHEET_ID es obligatoria.'
    );
    this.name = 'MissingGoogleSheetConfigError';
  }
}

/**
 * Valida que el nombre de pestaña pertenezca exclusivamente a la allowlist de 6 pestañas.
 */
export function isAllowedGoogleSheetTab(tabName: unknown): tabName is GoogleSheetTabName {
  if (typeof tabName !== 'string') return false;
  const clean = tabName.trim();
  return (ALLOWED_GOOGLE_SHEET_TABS as readonly string[]).includes(clean);
}

export function assertAllowedSheetTab(tabName: unknown): GoogleSheetTabName {
  const clean = typeof tabName === 'string' ? tabName.trim() : '';
  if (!isAllowedGoogleSheetTab(clean)) {
    throw new DisallowedSheetTabError(clean || '<empty>');
  }
  return clean;
}

const SPANISH_MONTH_NAMES = [
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
  'NOVIEMBRE',
  'DICIEMBRE',
] as const;

/**
 * REGLA 1 DE SEGURIDAD Y GOBERNANZA:
 * Obtiene el ID del documento Google Sheet exclusivamente desde `process.env.GOOGLE_SHEET_ID`
 * en entorno servidor (o `envOverride.GOOGLE_SHEET_ID` en pruebas unitarias).
 * Prohibido leer `VITE_*`, `NEXT_PUBLIC_*` o usar IDs hardcodeados en código.
 */
export function getConfiguredGoogleSheetId(
  envOverride?: Record<string, string | undefined>
): string {
  const nodeEnv = (typeof process !== 'undefined' && process?.env) || {};
  const configured = envOverride?.GOOGLE_SHEET_ID ?? nodeEnv.GOOGLE_SHEET_ID ?? '';
  return String(configured).trim();
}

/**
 * Construye la URL de exportación CSV para una pestaña autorizada.
 * - Valida estrictamente la allowlist de 6 pestañas (`assertAllowedSheetTab`).
 * - En el servidor (con `sheetId` o `process.env.GOOGLE_SHEET_ID`), genera el endpoint CSV de Google Sheets.
 * - Si no hay `sheetId` disponible (ej. navegador), retorna la ruta proxy segura del backend `/api/sheets`.
 */
export function buildGoogleSheetRawExportUrl(
  tabName: GoogleSheetTabName | string,
  sheetId?: string
): string {
  const allowedTab = assertAllowedSheetTab(tabName || 'Ventas');
  const resolvedSheetId = (sheetId ?? getConfiguredGoogleSheetId()).trim();

  if (!resolvedSheetId) {
    return `/api/sheets?raw=true&sheet=${encodeURIComponent(allowedTab)}`;
  }

  const gid = GOOGLE_SHEET_TAB_GIDS[allowedTab];
  return `https://docs.google.com/spreadsheets/d/${resolvedSheetId}/export?format=csv&gid=${gid}`;
}

/**
 * REGLA 3 DE SEGURIDAD:
 * Sanitiza celdas de texto para prevenir XSS y CSV/Formula Injection (`=`, `+`, `@`, etc.).
 */
export function sanitizeSheetCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .trim();

  // Neutralizar prefijos de inyección de fórmulas (=, +, @) cuando no son números válidos
  if (/^[=+@]/.test(str) && !/^\+\d+(\.\d+)?$/.test(str)) {
    str = str.replace(/^[=+@]+/, '').trim();
  }
  return str;
}

/**
 * Normaliza llaves de catálogos y nombres comerciales:
 * - sanitiza contra XSS/CSV Injection
 * - aplica .trim() y .toUpperCase()
 * - colapsa espacios múltiples ("OSCAR ORTIZ-  LA COSTA" -> "OSCAR ORTIZ- LA COSTA")
 */
export function normalizeCatalogKey(raw: unknown): string {
  const clean = sanitizeSheetCell(raw);
  if (!clean) return '';
  return clean.toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Normaliza un nombre de vendedor o supervisor para cruces contables,
 * colapsando espacios dobles y respetando las reglas oficiales del proyecto.
 */
export function normalizeSheetSellerOrSupervisorKey(raw: unknown): string {
  const base = normalizeCatalogKey(raw)
    .replace(/JOHNATAN\s+GARCIA/g, 'JOHNATAN SOTO')
    .replace(/JONATHAN\s+GARCIA/g, 'JOHNATAN SOTO')
    .replace(/JONATHAN\s+SOTO/g, 'JOHNATAN SOTO');
  return base;
}

/**
 * Parser numérico contable estricto (`parseSheetNumber` / `parseStrictAccountingNumber`):
 * - Limpia comas de miles ("1,140.00" -> 1140, "2,760.00" -> 2760)
 * - Limpia porcentajes ("82.50%" -> 82.5)
 * - Convierte guiones ("-", "--"), vacíos, null y errores ("#DIV/0!", "#N/A") en 0
 * - Respeta estrictamente los signos negativos ("-4" -> -4, "-13.20" -> -13.2, "-104.00" -> -104)
 */
export function parseSheetNumber(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }

  let s = String(raw)
    .replace(/^["']+|["']+$/g, '')
    .trim();

  if (
    !s ||
    s === '-' ||
    s === '--' ||
    s === '—' ||
    s.toUpperCase() === '#DIV/0!' ||
    s.toUpperCase() === '#N/A' ||
    s.toUpperCase() === '#VALUE!' ||
    s.toUpperCase() === '#REF!' ||
    s.toUpperCase() === 'NULL' ||
    s.toUpperCase() === 'NAN'
  ) {
    return 0;
  }

  // Detectar formato contable entre paréntesis: "(104.00)" -> -104.00
  let isNegative = false;
  if (/^\(.*\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }

  // Limpiar símbolos de moneda, espacios y %
  s = s.replace(/[$%\s]/g, '').replace(/USD/gi, '');

  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  if (!s || s === '-') return 0;

  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length > 2) {
      s = s.replace(/,/g, '');
    } else if (parts[1] && parts[1].length === 3 && /^\d+$/.test(parts[0])) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }

  const parsed = Number(s);
  if (!Number.isFinite(parsed) || parsed === 0) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

export const parseStrictAccountingNumber = parseSheetNumber;

export interface ParsedSheetDate {
  isoDate: string; // YYYY-MM-DD (America/Caracas)
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Parser de fechas determinístico en `America/Caracas` (`UTC-04:00`):
 * Soporta:
 * 1. Timestamps ISO (`2026-11-02 0:00:00`, `2026-11-02T00:00:00`)
 * 2. Cadenas latinas `DD/MM/YYYY` (`02/11/2026`, `2/11/2026`)
 * 3. Números seriales de Lotus / Google Sheets (base `1899-12-30`, ej. `46328` -> `2026-11-02`)
 */
export function parseSheetDate(raw: unknown): ParsedSheetDate | null {
  if (raw === null || raw === undefined) return null;

  // Caso 3: Número serial de Lotus / Google Sheets (ej. 46328 -> 2026-11-02)
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const serialDays = Math.floor(raw);
    if (serialDays >= 36526 && serialDays <= 73050) {
      const utcMs = Date.UTC(1899, 11, 30) + serialDays * 86_400_000;
      const d = new Date(utcMs);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return {
        isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        year,
        month,
        day,
      };
    }
    return null;
  }

  const clean = String(raw)
    .replace(/^["']+|["']+$/g, '')
    .trim();
  if (!clean) return null;

  // Verificar si es un serial numérico en string (ej. "46328" o "46328.0")
  if (/^\d{5}(\.\d+)?$/.test(clean)) {
    const serialNum = Number(clean);
    if (serialNum >= 36526 && serialNum <= 73050) {
      return parseSheetDate(serialNum);
    }
  }

  // Extraer solo la porción de fecha antes de cualquier espacio o 'T'
  const dateToken = clean.split(/[\sT]/)[0].trim();

  // Caso 1: YYYY-M-D o YYYY/M/D
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(dateToken);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        year,
        month,
        day,
      };
    }
  }

  // Caso 2: DD/MM/YYYY o DD-MM-YYYY (Formato local Venezuela)
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(dateToken);
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const day = p2 > 12 ? p2 : p1;
    const month = p2 > 12 ? p1 : p2;
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        year,
        month,
        day,
      };
    }
  }

  return null;
}

/**
 * Parsea cualquier cadena o serial de fecha del Google Sheet o Supabase a formato canónico `YYYY-MM-DD`
 * en zona horaria local (`America/Caracas` UTC-04:00).
 */
export function parseCaracasLocalDate(raw: unknown): string | null {
  const parsed = parseSheetDate(raw);
  return parsed ? parsed.isoDate : null;
}

/**
 * Forward-fill para encabezados matriciales con celdas combinadas (merged cells):
 * cuando la API exporta `['VENDEDOR_A', '', '', 'VENDEDOR_B', '', '']`, propaga el último
 * valor no vacío hacia la derecha: `['VENDEDOR_A', 'VENDEDOR_A', 'VENDEDOR_A', 'VENDEDOR_B', 'VENDEDOR_B', 'VENDEDOR_B']`.
 */
export function forwardFillRow(row: unknown[]): string[] {
  let current = '';
  return (row || []).map((cell) => {
    const val = sanitizeSheetCell(cell);
    if (val !== '') current = val;
    return current;
  });
}

export function getPeriodMetadataFromIsoDate(isoDate: string): {
  ano: number;
  mes: string;
  monthIndex: number;
} {
  const parts = (isoDate || '').split('-');
  const ano = Number(parts[0]) || 2026;
  const mNum = Number(parts[1]) || 1;
  const monthIndex = Math.max(0, Math.min(11, mNum - 1));
  return {
    ano,
    mes: SPANISH_MONTH_NAMES[monthIndex],
    monthIndex,
  };
}

// ============================================================================
// ESQUEMAS ZOD DE VALIDACIÓN ESTRICTA DE FILAS ENTRANTES
// ============================================================================

export const SheetVentasRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ano: z.number().int().min(2000).max(2100),
  mes: z.string().min(1),
  idCliente: z.string().min(1),
  idArticulo: z.string().min(1),
  vendedorRaw: z.string().min(1),
  vendedor: z.string().min(1),
  canonicalVendedor: z.string().min(1),
  cajas: z.number().finite(),
  unidades: z.number().finite(),
  kg: z.number().finite(),
  monto: z.number().finite(),
  costo: z.number().finite(),
  utilidad: z.number().finite(),
  pctUtilidad: z.number().finite(),
  tipoDoc: z.enum(['FA', 'DV']),
});

export const ProductoCatalogRowSchema = z.object({
  codProducto: z.string().min(1),
  producto: z.string().min(1),
  categoria: z.string().min(1),
});

export const ClienteCatalogRowSchema = z.object({
  codCliente: z.string().min(1),
  cliente: z.string().min(1),
  vendedorRaw: z.string(),
  vendedor: z.string(),
  region: z.string(),
  categoria: z.string(),
});

export const SupervisorCatalogRowSchema = z.object({
  vendedorRaw: z.string().min(1),
  vendedor: z.string().min(1),
  supervisor: z.string().min(1),
});

// ============================================================================
// 1. PESTAÑA "Ventas" (A1:K...) CON REGLA DE CORTE ESTRICTA (Fecha >= '2026-11-01')
// ============================================================================

export interface SheetVentasDetailRow {
  rowNumber: number;
  fecha: string; // YYYY-MM-DD (America/Caracas)
  ano: number;
  mes: string;
  idCliente: string;
  idArticulo: string;
  vendedorRaw: string;
  vendedor: string;
  canonicalVendedor?: string;
  cajas: number;
  unidades: number;
  kg: number;
  monto: number;
  costo: number;
  utilidad: number;
  pctUtilidad: number;
  tipoDoc: 'FA' | 'DV';
}

export interface SheetVentasParseResult {
  rows: SheetVentasDetailRow[];
  totalRawDataRows: number;
  ignoredBeforeCutoffCount: number;
  acceptedFromCutoffCount: number;
  rejectedMalformedCount?: number;
  cutoffDate: string;
}

/**
 * Parsea la pestaña `Ventas` (A1:K...) aplicando:
 * - `.trim()` a todos los encabezados (ej. `"% de utilidad "` -> `"% de utilidad"`)
 * - Parseo de fecha determinístico `America/Caracas` (`YYYY-MM-DD`) vía `parseSheetDate`
 * - REGLA DE CORTE ESTRICTA: ignora absolutamente cualquier fila con `Fecha < cutoffDate` (`'2026-11-01'`)
 * - Limpieza numérica preservando signos negativos en devoluciones (`Cajas`, `Unidades`, `Kg`, `Monto`, `Costo`, `Utilidad`)
 * - Validación de esquema `Zod` por cada fila
 */
export function parseVentasSheetCsv(
  csvText: string,
  cutoffDate: string = NOVEMBER_STRICT_CUTOFF_DATE
): SheetVentasParseResult {
  if (!csvText || !csvText.trim()) {
    return {
      rows: [],
      totalRawDataRows: 0,
      ignoredBeforeCutoffCount: 0,
      acceptedFromCutoffCount: 0,
      rejectedMalformedCount: 0,
      cutoffDate,
    };
  }

  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  const matrix = parsed.data || [];
  if (matrix.length < 2) {
    return {
      rows: [],
      totalRawDataRows: 0,
      ignoredBeforeCutoffCount: 0,
      acceptedFromCutoffCount: 0,
      rejectedMalformedCount: 0,
      cutoffDate,
    };
  }

  const rawHeaders = matrix[0].map((h) =>
    sanitizeSheetCell(h)
      .toLowerCase()
  );

  const findColIdx = (candidates: string[], fallbackIdx: number): number => {
    for (const cand of candidates) {
      const idx = rawHeaders.findIndex((h) => h === cand || h.startsWith(cand));
      if (idx !== -1) return idx;
    }
    return fallbackIdx;
  };

  const idxFecha = findColIdx(['fecha'], 0);
  const idxCliente = findColIdx(['id cliente', 'id_cliente', 'cliente'], 1);
  const idxArticulo = findColIdx(['id articulo', 'id_articulo', 'articulo'], 2);
  const idxVendedor = findColIdx(['vendedor'], 3);
  const idxCajas = findColIdx(['cajas'], 4);
  const idxUnidades = findColIdx(['unidades'], 5);
  const idxKg = findColIdx(['kg', 'kgs', 'kilos'], 6);
  const idxMonto = findColIdx(['monto'], 7);
  const idxCosto = findColIdx(['costo'], 8);
  const idxUtilidad = findColIdx(['utilidad'], 9);
  const idxPctUtilidad = findColIdx(['% de utilidad', '% utilidad', 'porcentaje'], 10);

  const rows: SheetVentasDetailRow[] = [];
  let totalRawDataRows = 0;
  let ignoredBeforeCutoffCount = 0;
  let rejectedMalformedCount = 0;

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line || line.length === 0) continue;

    const rawFechaCell = line[idxFecha];
    const parsedDate = parseSheetDate(rawFechaCell);
    if (!parsedDate) continue;

    const { isoDate } = parsedDate;
    totalRawDataRows++;

    if (isoDate < cutoffDate) {
      ignoredBeforeCutoffCount++;
      continue;
    }

    const idCliente = normalizeCatalogKey(line[idxCliente]);
    const idArticulo = normalizeCatalogKey(line[idxArticulo]);
    const vendedorRaw = normalizeSheetSellerOrSupervisorKey(line[idxVendedor]);
    const canonicalVendedor = normalizeSellerName(vendedorRaw) || vendedorRaw;
    const vendedor = vendedorRaw.startsWith('OSCAR ORTIZ-')
      ? vendedorRaw
      : canonicalVendedor;

    const cajas = parseSheetNumber(line[idxCajas]);
    const unidades = parseSheetNumber(line[idxUnidades]);
    const kg = parseSheetNumber(line[idxKg]);
    const monto = parseSheetNumber(line[idxMonto]);
    const costo = parseSheetNumber(line[idxCosto]);
    const utilidad = parseSheetNumber(line[idxUtilidad]);
    const pctUtilidad = parseSheetNumber(line[idxPctUtilidad]);

    const { ano, mes } = getPeriodMetadataFromIsoDate(isoDate);
    const tipoDoc: 'FA' | 'DV' = monto < 0 || cajas < 0 || kg < 0 ? 'DV' : 'FA';

    const candidate: SheetVentasDetailRow = {
      rowNumber: r + 1,
      fecha: isoDate,
      ano,
      mes,
      idCliente,
      idArticulo,
      vendedorRaw,
      vendedor,
      canonicalVendedor,
      cajas,
      unidades,
      kg,
      monto,
      costo,
      utilidad,
      pctUtilidad,
      tipoDoc,
    };

    const validation = SheetVentasRowSchema.safeParse(candidate);
    if (!validation.success) {
      rejectedMalformedCount++;
      continue;
    }

    rows.push(candidate);
  }

  return {
    rows,
    totalRawDataRows,
    ignoredBeforeCutoffCount,
    acceptedFromCutoffCount: rows.length,
    rejectedMalformedCount,
    cutoffDate,
  };
}

// ============================================================================
// 2. PESTAÑA "Cuotas Volumen" (A1:CN89) — DOBLE ENCABEZADO CON FORWARD-FILL
// ============================================================================

export interface CuotasVolumenSellerMetricCell {
  rawSellerHeader: string;
  canonicalSeller: string;
  cuotaKg: number;
  ventaKg: number;
  cumplimientoPct: number;
}

export interface CuotasVolumenMatrixRow {
  rowIndex: number;
  cod: string;
  articulo: string;
  bySellerHeader: Record<string, CuotasVolumenSellerMetricCell>;
  byCanonicalSeller: Record<
    string,
    { cuotaKg: number; ventaKg: number; cumplimientoPct: number }
  >;
}

export interface CuotasVolumenMatrixParseResult {
  sellersOrder: string[];
  forwardFilledRow1: string[];
  row2Subheaders: string[];
  items: CuotasVolumenMatrixRow[];
}

/**
 * Parsea la matriz `Cuotas Volumen` (A1:CN89) aplicando `forwardFillRow` sobre la Fila 1:
 * - Fila 1 tiene el nombre del Vendedor combinado cada 3 columnas desde la columna C (índice 2).
 * - Fila 2 repite `CUOTA` (o `CUOTA KG`), `KG` (o `VENTA KG`) y `%`.
 * - Columnas A y B son `Cod` y `Articulo`.
 */
export function parseCuotasVolumenSheetMatrix(
  csvText: string
): CuotasVolumenMatrixParseResult {
  const parsed = Papa.parse<string[]>(csvText || '', {
    header: false,
    skipEmptyLines: false,
  });
  const rawMatrix = (parsed.data || []).filter((row) =>
    row.some((cell) => String(cell || '').trim() !== '')
  );

  if (rawMatrix.length < 2) {
    return {
      sellersOrder: [],
      forwardFilledRow1: [],
      row2Subheaders: [],
      items: [],
    };
  }

  const row0 = rawMatrix[0].map((c) => sanitizeSheetCell(c));
  const row1 = rawMatrix[1].map((c) => sanitizeSheetCell(c));

  const isDoubleHeader =
    normalizeCatalogKey(row1[0]) === 'COD' ||
    normalizeCatalogKey(row1[1]).startsWith('ARTICULO');

  const maxCols = Math.max(row0.length, row1.length);
  const forwardFilledRow1: string[] = new Array(maxCols).fill('');
  const row2Subheaders: string[] = new Array(maxCols).fill('');
  const dataStartRowIdx = isDoubleHeader ? 2 : 1;

  if (isDoubleHeader) {
    const cleanedRow0 = new Array(maxCols).fill('');
    for (let c = 0; c < maxCols; c++) {
      cleanedRow0[c] =
        c < 2
          ? normalizeSheetSellerOrSupervisorKey(row0[c])
          : normalizeSheetSellerOrSupervisorKey(row0[c])
              .replace(/\s+CUOTA(\s+KG)?$/i, '')
              .trim();
      row2Subheaders[c] = normalizeCatalogKey(row1[c]);
    }
    const ffilled = forwardFillRow(cleanedRow0.slice(2));
    forwardFilledRow1[0] = cleanedRow0[0];
    forwardFilledRow1[1] = cleanedRow0[1];
    for (let c = 2; c < maxCols; c++) {
      forwardFilledRow1[c] = ffilled[c - 2] || '';
    }
  } else {
    let currentSeller = '';
    for (let c = 0; c < maxCols; c++) {
      const cell = normalizeCatalogKey(row0[c]);
      if (c < 2) {
        forwardFilledRow1[c] = '';
        row2Subheaders[c] = cell;
        continue;
      }
      const offsetInTriplet = (c - 2) % 3;
      if (offsetInTriplet === 0) {
        currentSeller = normalizeSheetSellerOrSupervisorKey(cell)
          .replace(/\s+CUOTA(\s+KG)?$/i, '')
          .replace(/\s+VENTA(\s+KG)?$/i, '')
          .trim();
        row2Subheaders[c] = 'CUOTA';
      } else if (offsetInTriplet === 1) {
        row2Subheaders[c] = cell || 'KG';
      } else {
        row2Subheaders[c] = cell || '%';
      }
      forwardFilledRow1[c] = currentSeller;
    }
  }

  const sellerBlocks: Array<{
    sellerHeader: string;
    canonicalSeller: string;
    cuotaCol: number;
    kgCol: number;
    pctCol: number;
  }> = [];
  const sellersOrder: string[] = [];

  for (let c = 2; c < maxCols; c += 3) {
    const sellerHeader = forwardFilledRow1[c];
    if (!sellerHeader) continue;
    const isSupervisorSummaryCol =
      sellerHeader === 'ALI PEREZ' ||
      sellerHeader === 'JOHNATAN SOTO' ||
      sellerHeader === 'NELSON FINOL';
    const canonicalSeller = isSupervisorSummaryCol
      ? sellerHeader
      : normalizeSellerName(sellerHeader) || sellerHeader;
    if (!sellersOrder.includes(sellerHeader)) {
      sellersOrder.push(sellerHeader);
    }
    sellerBlocks.push({
      sellerHeader,
      canonicalSeller,
      cuotaCol: c,
      kgCol: c + 1,
      pctCol: c + 2,
    });
  }

  const items: CuotasVolumenMatrixRow[] = [];

  for (let r = dataStartRowIdx; r < rawMatrix.length; r++) {
    const line = rawMatrix[r];
    if (!line) continue;

    const cod = normalizeCatalogKey(line[0]);
    const articulo = normalizeCatalogKey(line[1]);

    if (!cod && !articulo) continue;

    const bySellerHeader: Record<string, CuotasVolumenSellerMetricCell> = {};
    const byCanonicalSeller: Record<
      string,
      { cuotaKg: number; ventaKg: number; cumplimientoPct: number }
    > = {};

    for (const block of sellerBlocks) {
      const cuotaKg = parseSheetNumber(line[block.cuotaCol]);
      const ventaKg = parseSheetNumber(line[block.kgCol]);
      const cumplimientoPct = parseSheetNumber(line[block.pctCol]);

      bySellerHeader[block.sellerHeader] = {
        rawSellerHeader: block.sellerHeader,
        canonicalSeller: block.canonicalSeller,
        cuotaKg,
        ventaKg,
        cumplimientoPct,
      };

      if (!byCanonicalSeller[block.canonicalSeller]) {
        byCanonicalSeller[block.canonicalSeller] = {
          cuotaKg: 0,
          ventaKg: 0,
          cumplimientoPct: 0,
        };
      }
      const agg = byCanonicalSeller[block.canonicalSeller];
      agg.cuotaKg = Math.round((agg.cuotaKg + cuotaKg) * 100) / 100;
      agg.ventaKg = Math.round((agg.ventaKg + ventaKg) * 100) / 100;
      agg.cumplimientoPct =
        agg.cuotaKg > 0
          ? Math.round(((agg.ventaKg / agg.cuotaKg) * 100) * 100) / 100
          : cumplimientoPct;
    }

    items.push({
      rowIndex: r + 1,
      cod,
      articulo,
      bySellerHeader,
      byCanonicalSeller,
    });
  }

  return {
    sellersOrder,
    forwardFilledRow1,
    row2Subheaders,
    items,
  };
}

// ============================================================================
// 3. PESTAÑA "Cuotas de Activacion" (A1:L28) — DOBLE ENCABEZADO CON FORWARD-FILL
// ============================================================================

export interface CuotasActivacionMatrixRow {
  rowIndex: number;
  vendedorRaw: string;
  vendedor: string;
  cartera: number;
  categorias: {
    azucar: { meta: number; activados: number };
    lecheVencampo: { meta: number; activados: number };
    pollo: { meta: number; activados: number };
    estandarSuperiorAsturias: { meta: number; activados: number };
    mortadelaSalpicaoAsturias: { meta: number; activados: number };
    // Backward-compatible aliases
    aceite: { meta: number; activados: number };
    estandarAsturias: { meta: number; activados: number };
    jamonAsturias: { meta: number; activados: number };
    mortadelaAsturias: { meta: number; activados: number };
    salpicao: { meta: number; activados: number };
  };
}

export interface CuotasActivacionMatrixParseResult {
  categoriesRow1: string[];
  subheadersRow2: string[];
  rows: CuotasActivacionMatrixRow[];
}

/**
 * Parsea la pestaña `Cuotas de Activacion` (A1:L28) aplicando `forwardFillRow` sobre la Fila 1:
 * - Fila 1 tiene las 5 categorías combinadas cada 2 columnas desde C hasta L:
 *   `AZUCAR`, `LECHE VENCAMPO`, `POLLO`, `ESTANDAR Y SUPERIOR ASTURIAS`, `MORTADELA SALPICAO Y ASTURIAS`
 * - Fila 2 tiene `Vendedor` (A), `CARTERA` (B) y pares `Meta ...` / `Activados` (C a L).
 */
export function parseCuotasActivacionSheetMatrix(
  csvText: string
): CuotasActivacionMatrixParseResult {
  const parsed = Papa.parse<string[]>(csvText || '', {
    header: false,
    skipEmptyLines: true,
  });
  const matrix = parsed.data || [];
  if (matrix.length < 2) {
    return { categoriesRow1: [], subheadersRow2: [], rows: [] };
  }

  const row0 = matrix[0].map((c) => normalizeCatalogKey(c));
  const row1 = matrix[1].map((c) => normalizeCatalogKey(c));

  const isDoubleHeader =
    row1[0] === 'VENDEDOR' || row1[1] === 'CARTERA' || row0[0] === '';

  const maxCols = Math.max(12, row0.length, row1.length);
  const categoriesRow1: string[] = new Array(maxCols).fill('');
  const subheadersRow2: string[] = new Array(maxCols).fill('');

  if (isDoubleHeader) {
    const ffilled = forwardFillRow(row0.slice(2));
    for (let c = 0; c < maxCols; c++) {
      categoriesRow1[c] = c < 2 ? '' : (ffilled[c - 2] || '');
      subheadersRow2[c] = row1[c] || '';
    }
  } else {
    let curCat = '';
    for (let c = 0; c < maxCols; c++) {
      if (c >= 2 && c % 2 === 0 && row0[c]) {
        curCat = row0[c].replace(/\s*META.*$/i, '').trim();
      }
      categoriesRow1[c] = c < 2 ? '' : curCat;
      subheadersRow2[c] = row0[c] || '';
    }
  }

  // Priorizar el encabezado superior (Fila 1, columna C / índice 2) para evitar falsos positivos con subheaders antiguos en Fila 2
  const primaryColHeader = (categoriesRow1[2] || subheadersRow2[2] || '').toUpperCase();
  const isNewOrderLayout = primaryColHeader.includes('AZUCAR');

  const dataStartIdx = isDoubleHeader ? 2 : 1;
  const rows: CuotasActivacionMatrixRow[] = [];

  for (let r = dataStartIdx; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line) continue;
    const vendedorRaw = normalizeSheetSellerOrSupervisorKey(line[0]);
    if (
      !vendedorRaw ||
      vendedorRaw === 'VENDEDOR' ||
      vendedorRaw.includes('TOTAL')
    ) {
      continue;
    }

    const vendedor = normalizeSellerName(vendedorRaw) || vendedorRaw;
    const pair0 = {
      meta: parseSheetNumber(line[2]),
      activados: parseSheetNumber(line[3]),
    };
    const pair1 = {
      meta: parseSheetNumber(line[4]),
      activados: parseSheetNumber(line[5]),
    };
    const pair2 = {
      meta: parseSheetNumber(line[6]),
      activados: parseSheetNumber(line[7]),
    };
    const pair3 = {
      meta: parseSheetNumber(line[8]),
      activados: parseSheetNumber(line[9]),
    };
    const pair4 = {
      meta: parseSheetNumber(line[10]),
      activados: parseSheetNumber(line[11]),
    };

    const azucar = isNewOrderLayout ? pair0 : pair1;
    const lecheVencampo = isNewOrderLayout ? pair1 : pair0;
    const pollo = pair2;
    const estandarSuperiorAsturias = pair3;
    const mortadelaSalpicaoAsturias = pair4;
    const aceite = isNewOrderLayout ? pair4 : pair0;

    rows.push({
      rowIndex: r + 1,
      vendedorRaw,
      vendedor,
      cartera: parseSheetNumber(line[1]),
      categorias: {
        azucar,
        lecheVencampo,
        pollo,
        estandarSuperiorAsturias,
        mortadelaSalpicaoAsturias,
        aceite,
        estandarAsturias: estandarSuperiorAsturias,
        jamonAsturias: estandarSuperiorAsturias,
        mortadelaAsturias: mortadelaSalpicaoAsturias,
        salpicao: mortadelaSalpicaoAsturias,
      },
    });
  }

  return {
    categoriesRow1,
    subheadersRow2,
    rows,
  };
}

// ============================================================================
// 4. CATÁLOGOS PERMITIDOS ("Productos", "Clientes", "Supervisores")
// ============================================================================

export interface ProductoCatalogRow {
  codProducto: string;
  producto: string;
  categoria: string;
}

export interface ClienteCatalogRow {
  codCliente: string;
  cliente: string;
  vendedorRaw: string;
  vendedor: string;
  region: string;
  categoria: string;
}

export interface SupervisorCatalogRow {
  vendedorRaw: string;
  vendedor: string;
  supervisor: string;
}

export function parseProductosCatalogCsv(csvText: string): {
  rows: ProductoCatalogRow[];
  byCode: Map<string, ProductoCatalogRow>;
} {
  const parsed = Papa.parse<string[]>(csvText || '', {
    header: false,
    skipEmptyLines: true,
  });
  const matrix = parsed.data || [];
  const rows: ProductoCatalogRow[] = [];
  const byCode = new Map<string, ProductoCatalogRow>();

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line) continue;
    const rawCode = normalizeCatalogKey(line[0]);
    const codProducto = rawCode.replace(/^0+/, '') || rawCode;
    const producto = normalizeCatalogKey(line[1]);
    const categoria = normalizeCatalogKey(line[2]) || 'GENERAL';
    if (!codProducto && !producto) continue;

    const candidate: ProductoCatalogRow = {
      codProducto: codProducto || producto,
      producto: producto || codProducto,
      categoria,
    };
    const valid = ProductoCatalogRowSchema.safeParse(candidate);
    if (!valid.success) continue;

    rows.push(candidate);
    if (codProducto) {
      byCode.set(codProducto, candidate);
      byCode.set(rawCode, candidate);
    }
  }

  return { rows, byCode };
}

export function parseClientesCatalogCsv(csvText: string): {
  rows: ClienteCatalogRow[];
  byCode: Map<string, ClienteCatalogRow>;
} {
  const parsed = Papa.parse<string[]>(csvText || '', {
    header: false,
    skipEmptyLines: true,
  });
  const matrix = parsed.data || [];
  const rows: ClienteCatalogRow[] = [];
  const byCode = new Map<string, ClienteCatalogRow>();

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line) continue;
    const rawCode = normalizeCatalogKey(line[0]);
    const codCliente = rawCode.replace(/^0+/, '') || rawCode;
    const cliente = normalizeCatalogKey(line[1]);
    const vendedorRaw = normalizeSheetSellerOrSupervisorKey(line[2]);
    const vendedor = normalizeSellerName(vendedorRaw) || vendedorRaw;
    const region = normalizeCatalogKey(line[3]);
    const categoria = normalizeCatalogKey(line[4]);
    if (!codCliente && !cliente) continue;

    const candidate: ClienteCatalogRow = {
      codCliente: codCliente || cliente,
      cliente: cliente || codCliente,
      vendedorRaw,
      vendedor,
      region,
      categoria,
    };
    const valid = ClienteCatalogRowSchema.safeParse(candidate);
    if (!valid.success) continue;

    rows.push(candidate);
    if (codCliente) {
      byCode.set(codCliente, candidate);
      byCode.set(rawCode, candidate);
    }
  }

  return { rows, byCode };
}

export function parseSupervisoresCatalogCsv(csvText: string): {
  rows: SupervisorCatalogRow[];
  bySeller: Map<string, string>;
} {
  const parsed = Papa.parse<string[]>(csvText || '', {
    header: false,
    skipEmptyLines: true,
  });
  const matrix = parsed.data || [];
  const rows: SupervisorCatalogRow[] = [];
  const bySeller = new Map<string, string>();

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line) continue;
    const vendedorRaw = normalizeSheetSellerOrSupervisorKey(line[0]);
    const supervisor = normalizeSheetSellerOrSupervisorKey(line[1]);
    if (!vendedorRaw || vendedorRaw === 'VENDEDOR' || !supervisor) continue;

    const vendedor = normalizeSellerName(vendedorRaw) || vendedorRaw;
    const candidate: SupervisorCatalogRow = {
      vendedorRaw,
      vendedor,
      supervisor,
    };
    const valid = SupervisorCatalogRowSchema.safeParse(candidate);
    if (!valid.success) continue;

    rows.push(candidate);
    bySeller.set(vendedorRaw, supervisor);
    bySeller.set(vendedor, supervisor);
  }

  return { rows, bySeller };
}

// ============================================================================
// 5. MOTOR MATEMÁTICO Y DE NEGOCIO PARA NOVIEMBRE 2026 (CUADRATURA COMERCIAL)
// ============================================================================

export interface SellerCommercialMetricsNov2026 {
  vendedor: string;
  vendedoresRawIncluidos: string[];
  supervisor: string;
  isExcludedInstitutional: boolean;
  filasValidasNoviembre: number;
  // 1. Volumen (Kg, Cajas, Monto)
  volumenBrutoKg: number;
  devolucionesKg: number;
  volumenNetoKg: number;
  cajasBrutas: number;
  cajasDevoluciones: number;
  cajasNetas: number;
  montoBruto: number;
  montoDevoluciones: number;
  montoNeto: number;
  cuotaVolumenHojaKg: number;
  ventaVolumenHojaKg: number;
  cumplimientoVolumenPct: number;
  rankingGeneral: number | null;
  rankingSupervisor: number | null;
  // 2. Activación por Clientes
  carteraClientesHoja: number;
  carteraCuotasActivacion: number;
  carteraAsignadaOficial: number;
  clientesUnicosBrutos: number;
  clientesActivadosNetos: number; // SUM(Kg) > 0 o SUM(Monto) > 0
  clientesConDevolucionTotal: number;
  pctActivacionClientes: number;
  // 3. Activación por SKU (General y por Rubro)
  skusConMovimientoBruto: number;
  skusActivadosNetos: number; // SUM(Kg) > 0
  skusConDevolucionTotal: number;
  paresClienteSkuActivadosNetos: number;
  activacionPorCategoriaProductos: Record<string, { skusActivados: number; clientesActivados: number; kgNeto: number }>;
  activacionPorRubroFocoVentas: Record<RubroClienteCodigo, { skusActivados: number; clientesActivados: number; kgNeto: number }>;
  cuotasActivacionHoja?: {
    azucar: { meta: number; activados: number };
    lecheVencampo: { meta: number; activados: number };
    pollo: { meta: number; activados: number };
    estandarSuperiorAsturias: { meta: number; activados: number };
    mortadelaSalpicaoAsturias: { meta: number; activados: number };
  };
}

export interface November2026CommercialAuditReport {
  period: { year: number; month: number; label: string };
  rowCounts: {
    totalRawRowsInVentas: number;
    validNovember2026Rows: number;
    ignoredBeforeNovemberRows: number;
    rejectedMalformedRows: number;
  };
  globalTotals: {
    volumenBrutoKg: number;
    devolucionesKg: number;
    volumenNetoKg: number;
    cajasNetas: number;
    montoNeto: number;
    clientesUnicosBrutosGlobal: number;
    clientesActivadosNetosGlobal: number;
    skusConMovimientoBrutoGlobal: number;
    skusActivadosNetosGlobal: number;
  };
  controlCaseAngelNavarro: SellerCommercialMetricsNov2026 | null;
  sellers: SellerCommercialMetricsNov2026[];
  referentialIntegrity: {
    skusHuerfanosEnVentas: string[];
    clientesHuerfanosEnVentas: string[];
    vendedoresRawNoEnHojaSupervisores: Array<{ vendedorRaw: string; canonicalSeller: string; resolvedSupervisor: string }>;
  };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Calcula de forma determinística la cuadratura comercial de Noviembre 2026
 * para toda la fuerza de ventas y el caso de control obligatorio `ANGEL NAVARRO`:
 * 1. Volumen (Kg Bruto, Devoluciones, Kg Neto, Cuota Hoja y Ranking)
 * 2. Activación por Clientes (Neteando devoluciones: un cliente activa sí y solo sí SUM(Kg) > 0 o SUM(Monto) > 0)
 * 3. Activación por SKU (General y por Rubro: un SKU activa sí y solo sí SUM(Kg) > 0)
 */
export function calculateNovember2026CommercialMetrics(params: {
  ventasCsv: string;
  cuotasVolumenCsv?: string;
  cuotasActivacionCsv?: string;
  productosCsv?: string;
  clientesCsv?: string;
  supervisoresCsv?: string;
  targetYear?: number;
  targetMonth?: number;
}): November2026CommercialAuditReport {
  const targetYear = params.targetYear ?? 2026;
  const targetMonth = params.targetMonth ?? 11;

  const parsedVentas = parseVentasSheetCsv(params.ventasCsv, NOVEMBER_STRICT_CUTOFF_DATE);
  const parsedVolumen = params.cuotasVolumenCsv
    ? parseCuotasVolumenSheetMatrix(params.cuotasVolumenCsv)
    : { sellersOrder: [], forwardFilledRow1: [], row2Subheaders: [], items: [] };
  const parsedActivacion = params.cuotasActivacionCsv
    ? parseCuotasActivacionSheetMatrix(params.cuotasActivacionCsv)
    : { categoriesRow1: [], subheadersRow2: [], rows: [] };
  const parsedProductos = params.productosCsv
    ? parseProductosCatalogCsv(params.productosCsv)
    : { rows: [], byCode: new Map<string, ProductoCatalogRow>() };
  const parsedClientes = params.clientesCsv
    ? parseClientesCatalogCsv(params.clientesCsv)
    : { rows: [], byCode: new Map<string, ClienteCatalogRow>() };
  const parsedSupervisores = params.supervisoresCsv
    ? parseSupervisoresCatalogCsv(params.supervisoresCsv)
    : { rows: [], bySeller: new Map<string, string>() };

  // Filtrar estrictamente al año y mes objetivo (Noviembre 2026: year=2026, month=11)
  const targetPrefix = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  const novRows = parsedVentas.rows.filter((r) => r.fecha.startsWith(targetPrefix));

  // Mapa de SKU -> Rubro Foco (5 rubros)
  const skuToFocusRubro = new Map<string, RubroClienteCodigo>();
  (Object.entries(ACTIVATION_CATEGORY_SKU_GROUPS) as Array<[RubroClienteCodigo, readonly string[]]>).forEach(
    ([rubroCode, skuList]) => {
      skuList.forEach((sku) => {
        const clean = sku.replace(/^0+/, '') || sku;
        skuToFocusRubro.set(clean, rubroCode);
        skuToFocusRubro.set(sku, rubroCode);
      });
    }
  );

  // Acumuladores de Cuotas Volumen por vendedor canónico
  const volumeQuotaBySeller = new Map<string, { cuotaKg: number; ventaKg: number }>();
  for (const item of parsedVolumen.items) {
    for (const [canonSeller, metrics] of Object.entries(item.byCanonicalSeller)) {
      const cur = volumeQuotaBySeller.get(canonSeller) || { cuotaKg: 0, ventaKg: 0 };
      cur.cuotaKg = round2(cur.cuotaKg + metrics.cuotaKg);
      cur.ventaKg = round2(cur.ventaKg + metrics.ventaKg);
      volumeQuotaBySeller.set(canonSeller, cur);
    }
  }

  // Acumuladores de Cuotas de Activacion por vendedor canónico
  const activationSheetBySeller = new Map<string, CuotasActivacionMatrixRow>();
  for (const row of parsedActivacion.rows) {
    const existing = activationSheetBySeller.get(row.vendedor);
    if (!existing) {
      activationSheetBySeller.set(row.vendedor, {
        ...row,
        categorias: {
          azucar: { ...row.categorias.azucar },
          lecheVencampo: { ...row.categorias.lecheVencampo },
          pollo: { ...row.categorias.pollo },
          estandarSuperiorAsturias: { ...row.categorias.estandarSuperiorAsturias },
          mortadelaSalpicaoAsturias: { ...row.categorias.mortadelaSalpicaoAsturias },
          aceite: { ...row.categorias.aceite },
          estandarAsturias: { ...row.categorias.estandarAsturias },
          jamonAsturias: { ...row.categorias.jamonAsturias },
          mortadelaAsturias: { ...row.categorias.mortadelaAsturias },
          salpicao: { ...row.categorias.salpicao },
        },
      });
    } else {
      existing.cartera += row.cartera;
      existing.categorias.azucar.meta += row.categorias.azucar.meta;
      existing.categorias.azucar.activados += row.categorias.azucar.activados;
      existing.categorias.lecheVencampo.meta += row.categorias.lecheVencampo.meta;
      existing.categorias.lecheVencampo.activados += row.categorias.lecheVencampo.activados;
      existing.categorias.pollo.meta += row.categorias.pollo.meta;
      existing.categorias.pollo.activados += row.categorias.pollo.activados;
      existing.categorias.estandarSuperiorAsturias.meta += row.categorias.estandarSuperiorAsturias.meta;
      existing.categorias.estandarSuperiorAsturias.activados += row.categorias.estandarSuperiorAsturias.activados;
      existing.categorias.mortadelaSalpicaoAsturias.meta += row.categorias.mortadelaSalpicaoAsturias.meta;
      existing.categorias.mortadelaSalpicaoAsturias.activados += row.categorias.mortadelaSalpicaoAsturias.activados;
    }
  }

  // Conteo de clientes en hoja Clientes por vendedorRaw (sin reasignar ALI PEREZ -> ANGEL NAVARRO para reflejar estado literal de Clientes)
  const clientesHojaByRawSeller = new Map<string, Set<string>>();
  for (const cli of parsedClientes.rows) {
    if (!clientesHojaByRawSeller.has(cli.vendedorRaw)) {
      clientesHojaByRawSeller.set(cli.vendedorRaw, new Set());
    }
    clientesHojaByRawSeller.get(cli.vendedorRaw)!.add(cli.codCliente);
  }

  // Acumuladores globales
  let globalBrutoKg = 0;
  let globalDevKg = 0;
  let globalNetoKg = 0;
  let globalCajasNetas = 0;
  let globalMontoNeto = 0;
  const globalClientAgg = new Map<string, { kg: number; monto: number }>();
  const globalSkuAgg = new Map<string, { kg: number; monto: number }>();

  const skusHuerfanosSet = new Set<string>();
  const clientesHuerfanosSet = new Set<string>();
  const vendedoresRawSeen = new Map<string, string>();

  interface SellerInternalAcc {
    canonicalSeller: string;
    rawNames: Set<string>;
    rowCount: number;
    brutoKg: number;
    devKg: number;
    netoKg: number;
    cajasBrutas: number;
    cajasDev: number;
    cajasNetas: number;
    montoBruto: number;
    montoDev: number;
    montoNeto: number;
    byClient: Map<string, { kg: number; monto: number }>;
    bySku: Map<string, { kg: number; monto: number; categoria: string }>;
    byClientSku: Map<string, { client: string; sku: string; kg: number; monto: number; categoria: string }>;
  }

  const sellerMap = new Map<string, SellerInternalAcc>();

  for (const r of novRows) {
    const canonSeller = r.canonicalVendedor || normalizeSellerName(r.vendedorRaw) || r.vendedorRaw;
    vendedoresRawSeen.set(r.vendedorRaw, canonSeller);

    const cleanSku = r.idArticulo.replace(/^0+/, '') || r.idArticulo;
    const cleanClient = r.idCliente.replace(/^0+/, '') || r.idCliente;

    if (parsedProductos.byCode.size > 0 && !parsedProductos.byCode.has(cleanSku) && !parsedProductos.byCode.has(r.idArticulo)) {
      skusHuerfanosSet.add(r.idArticulo);
    }
    if (parsedClientes.byCode.size > 0 && !parsedClientes.byCode.has(cleanClient) && !parsedClientes.byCode.has(r.idCliente)) {
      clientesHuerfanosSet.add(r.idCliente);
    }

    const prodInfo = parsedProductos.byCode.get(cleanSku) || parsedProductos.byCode.get(r.idArticulo);
    const categoria = prodInfo?.categoria || 'GENERAL';

    // Global totals
    if (r.kg > 0) globalBrutoKg += r.kg;
    else if (r.kg < 0) globalDevKg += r.kg;
    globalNetoKg += r.kg;
    globalCajasNetas += r.cajas;
    globalMontoNeto += r.monto;

    const gCli = globalClientAgg.get(cleanClient) || { kg: 0, monto: 0 };
    gCli.kg += r.kg;
    gCli.monto += r.monto;
    globalClientAgg.set(cleanClient, gCli);

    const gSku = globalSkuAgg.get(cleanSku) || { kg: 0, monto: 0 };
    gSku.kg += r.kg;
    gSku.monto += r.monto;
    globalSkuAgg.set(cleanSku, gSku);

    if (!sellerMap.has(canonSeller)) {
      sellerMap.set(canonSeller, {
        canonicalSeller: canonSeller,
        rawNames: new Set(),
        rowCount: 0,
        brutoKg: 0,
        devKg: 0,
        netoKg: 0,
        cajasBrutas: 0,
        cajasDev: 0,
        cajasNetas: 0,
        montoBruto: 0,
        montoDev: 0,
        montoNeto: 0,
        byClient: new Map(),
        bySku: new Map(),
        byClientSku: new Map(),
      });
    }

    const acc = sellerMap.get(canonSeller)!;
    acc.rawNames.add(r.vendedorRaw);
    acc.rowCount++;

    if (r.kg > 0) acc.brutoKg += r.kg;
    else if (r.kg < 0) acc.devKg += r.kg;
    acc.netoKg += r.kg;

    if (r.cajas > 0) acc.cajasBrutas += r.cajas;
    else if (r.cajas < 0) acc.cajasDev += r.cajas;
    acc.cajasNetas += r.cajas;

    if (r.monto > 0) acc.montoBruto += r.monto;
    else if (r.monto < 0) acc.montoDev += r.monto;
    acc.montoNeto += r.monto;

    const cAgg = acc.byClient.get(cleanClient) || { kg: 0, monto: 0 };
    cAgg.kg += r.kg;
    cAgg.monto += r.monto;
    acc.byClient.set(cleanClient, cAgg);

    const sAgg = acc.bySku.get(cleanSku) || { kg: 0, monto: 0, categoria };
    sAgg.kg += r.kg;
    sAgg.monto += r.monto;
    acc.bySku.set(cleanSku, sAgg);

    const csKey = `${cleanClient}|${cleanSku}`;
    const csAgg = acc.byClientSku.get(csKey) || {
      client: cleanClient,
      sku: cleanSku,
      kg: 0,
      monto: 0,
      categoria,
    };
    csAgg.kg += r.kg;
    csAgg.monto += r.monto;
    acc.byClientSku.set(csKey, csAgg);
  }

  // Construir métricas por vendedor
  const sellersMetrics: SellerCommercialMetricsNov2026[] = [];

  for (const acc of sellerMap.values()) {
    const metaInfo = getSellerMetadata(acc.canonicalSeller);
    const supervisor =
      metaInfo.supervisor ||
      parsedSupervisores.bySeller.get(acc.canonicalSeller) ||
      'SIN SUPERVISOR';
    const isExcludedInstitutional =
      !isValidVolumeSeller(acc.canonicalSeller) ||
      EXCLUDED_VOLUME_SELLERS.has(acc.canonicalSeller);

    // Clientes: Neto > 0 (SUM(Kg) > 0 o SUM(Monto Neto) > 0)
    const clientesUnicosBrutos = acc.byClient.size;
    let clientesActivadosNetos = 0;
    for (const cVal of acc.byClient.values()) {
      if (round2(cVal.kg) > 0 || round2(cVal.monto) > 0) {
        clientesActivadosNetos++;
      }
    }
    const clientesConDevolucionTotal = clientesUnicosBrutos - clientesActivadosNetos;

    // SKUs: Neto > 0
    const skusConMovimientoBruto = acc.bySku.size;
    let skusActivadosNetos = 0;
    const catSkusMap = new Map<string, Set<string>>();
    const catKgMap = new Map<string, number>();

    for (const [skuCode, sVal] of acc.bySku.entries()) {
      const netSkuKg = round2(sVal.kg);
      catKgMap.set(sVal.categoria, round2((catKgMap.get(sVal.categoria) || 0) + netSkuKg));
      if (netSkuKg > 0) {
        skusActivadosNetos++;
        if (!catSkusMap.has(sVal.categoria)) catSkusMap.set(sVal.categoria, new Set());
        catSkusMap.get(sVal.categoria)!.add(skuCode);
      }
    }
    const skusConDevolucionTotal = skusConMovimientoBruto - skusActivadosNetos;

    // Pares (Cliente, SKU) y (Cliente, Categoría/Rubro) con Neto > 0
    let paresClienteSkuActivadosNetos = 0;
    const catClientsNetMap = new Map<string, Map<string, number>>();
    const focusRubroClientsNetMap = new Map<RubroClienteCodigo, Map<string, number>>();
    const focusRubroSkusNetMap = new Map<RubroClienteCodigo, Map<string, number>>();

    const focusRubroKeys: RubroClienteCodigo[] = [
      'AZUCAR',
      'LECHE_VENCAMPO',
      'POLLO',
      'ESTANDAR_SUPERIOR_ASTURIAS',
      'MORTADELA_SALPICAO_ASTURIAS',
    ];
    focusRubroKeys.forEach((rk) => {
      focusRubroClientsNetMap.set(rk, new Map());
      focusRubroSkusNetMap.set(rk, new Map());
    });

    for (const csVal of acc.byClientSku.values()) {
      const netCsKg = round2(csVal.kg);
      if (netCsKg > 0) {
        paresClienteSkuActivadosNetos++;
      }
      if (!catClientsNetMap.has(csVal.categoria)) {
        catClientsNetMap.set(csVal.categoria, new Map());
      }
      const cMap = catClientsNetMap.get(csVal.categoria)!;
      cMap.set(csVal.client, round2((cMap.get(csVal.client) || 0) + csVal.kg));

      const focusRubro = skuToFocusRubro.get(csVal.sku);
      if (focusRubro) {
        const fcMap = focusRubroClientsNetMap.get(focusRubro)!;
        fcMap.set(csVal.client, round2((fcMap.get(csVal.client) || 0) + csVal.kg));
        const fsMap = focusRubroSkusNetMap.get(focusRubro)!;
        fsMap.set(csVal.sku, round2((fsMap.get(csVal.sku) || 0) + csVal.kg));
      }
    }

    const activacionPorCategoriaProductos: Record<
      string,
      { skusActivados: number; clientesActivados: number; kgNeto: number }
    > = {};
    const allCats = new Set<string>([...catKgMap.keys(), ...catClientsNetMap.keys()]);
    for (const cat of allCats) {
      let activeCatClients = 0;
      const cMap = catClientsNetMap.get(cat);
      if (cMap) {
        for (const kgVal of cMap.values()) {
          if (round2(kgVal) > 0) activeCatClients++;
        }
      }
      activacionPorCategoriaProductos[cat] = {
        skusActivados: catSkusMap.get(cat)?.size || 0,
        clientesActivados: activeCatClients,
        kgNeto: round2(catKgMap.get(cat) || 0),
      };
    }

    const activacionPorRubroFocoVentas = {} as Record<
      RubroClienteCodigo,
      { skusActivados: number; clientesActivados: number; kgNeto: number }
    >;
    for (const rk of focusRubroKeys) {
      let activeRubroClients = 0;
      let rubroKg = 0;
      const fcMap = focusRubroClientsNetMap.get(rk)!;
      for (const kgVal of fcMap.values()) {
        rubroKg += kgVal;
        if (round2(kgVal) > 0) activeRubroClients++;
      }
      let activeRubroSkus = 0;
      const fsMap = focusRubroSkusNetMap.get(rk)!;
      for (const kgVal of fsMap.values()) {
        if (round2(kgVal) > 0) activeRubroSkus++;
      }
      activacionPorRubroFocoVentas[rk] = {
        skusActivados: activeRubroSkus,
        clientesActivados: activeRubroClients,
        kgNeto: round2(rubroKg),
      };
    }

    // Cartera en Clientes vs Cuotas de Activacion
    let carteraClientesHoja = 0;
    for (const rawName of acc.rawNames) {
      carteraClientesHoja += clientesHojaByRawSeller.get(rawName)?.size || 0;
    }
    const actSheetRow = activationSheetBySeller.get(acc.canonicalSeller);
    const carteraCuotasActivacion = actSheetRow?.cartera || 0;
    const carteraAsignadaOficial =
      carteraCuotasActivacion > 0 ? carteraCuotasActivacion : carteraClientesHoja;
    const pctActivacionClientes =
      carteraAsignadaOficial > 0
        ? round2((clientesActivadosNetos / carteraAsignadaOficial) * 100)
        : 0;

    const volQuota = volumeQuotaBySeller.get(acc.canonicalSeller) || {
      cuotaKg: 0,
      ventaKg: 0,
    };
    const cumplimientoVolumenPct =
      volQuota.cuotaKg > 0
        ? round2((round2(acc.netoKg) / volQuota.cuotaKg) * 100)
        : 0;

    sellersMetrics.push({
      vendedor: acc.canonicalSeller,
      vendedoresRawIncluidos: Array.from(acc.rawNames).sort(),
      supervisor,
      isExcludedInstitutional,
      filasValidasNoviembre: acc.rowCount,
      volumenBrutoKg: round2(acc.brutoKg),
      devolucionesKg: round2(acc.devKg),
      volumenNetoKg: round2(acc.netoKg),
      cajasBrutas: round2(acc.cajasBrutas),
      cajasDevoluciones: round2(acc.cajasDev),
      cajasNetas: round2(acc.cajasNetas),
      montoBruto: round2(acc.montoBruto),
      montoDevoluciones: round2(acc.montoDev),
      montoNeto: round2(acc.montoNeto),
      cuotaVolumenHojaKg: volQuota.cuotaKg,
      ventaVolumenHojaKg: volQuota.ventaKg,
      cumplimientoVolumenPct,
      rankingGeneral: null,
      rankingSupervisor: null,
      carteraClientesHoja,
      carteraCuotasActivacion,
      carteraAsignadaOficial,
      clientesUnicosBrutos,
      clientesActivadosNetos,
      clientesConDevolucionTotal,
      pctActivacionClientes,
      skusConMovimientoBruto,
      skusActivadosNetos,
      skusConDevolucionTotal,
      paresClienteSkuActivadosNetos,
      activacionPorCategoriaProductos,
      activacionPorRubroFocoVentas,
      cuotasActivacionHoja: actSheetRow
        ? {
            azucar: actSheetRow.categorias.azucar,
            lecheVencampo: actSheetRow.categorias.lecheVencampo,
            pollo: actSheetRow.categorias.pollo,
            estandarSuperiorAsturias: actSheetRow.categorias.estandarSuperiorAsturias,
            mortadelaSalpicaoAsturias: actSheetRow.categorias.mortadelaSalpicaoAsturias,
          }
        : undefined,
    });
  }

  // Ordenar por volumenNetoKg descendente y asignar rankings (para vendedores activos de la fuerza de ventas)
  sellersMetrics.sort((a, b) => b.volumenNetoKg - a.volumenNetoKg);

  const activeSalesForce = sellersMetrics.filter((s) => !s.isExcludedInstitutional);
  activeSalesForce.forEach((s, idx) => {
    s.rankingGeneral = idx + 1;
  });

  const bySupervisorGroups = new Map<string, SellerCommercialMetricsNov2026[]>();
  activeSalesForce.forEach((s) => {
    if (!bySupervisorGroups.has(s.supervisor)) {
      bySupervisorGroups.set(s.supervisor, []);
    }
    bySupervisorGroups.get(s.supervisor)!.push(s);
  });
  bySupervisorGroups.forEach((group) => {
    group.sort((a, b) => b.volumenNetoKg - a.volumenNetoKg);
    group.forEach((s, idx) => {
      s.rankingSupervisor = idx + 1;
    });
  });

  // Totales globales de clientes y SKUs activados netos
  let globalActiveClientsNet = 0;
  for (const cVal of globalClientAgg.values()) {
    if (round2(cVal.kg) > 0 || round2(cVal.monto) > 0) {
      globalActiveClientsNet++;
    }
  }
  let globalActiveSkusNet = 0;
  for (const sVal of globalSkuAgg.values()) {
    if (round2(sVal.kg) > 0) {
      globalActiveSkusNet++;
    }
  }

  // Vendedores en Ventas que no aparecen literalmente en la pestaña Supervisores
  const vendedoresRawNoEnHojaSupervisores: Array<{
    vendedorRaw: string;
    canonicalSeller: string;
    resolvedSupervisor: string;
  }> = [];
  for (const [rawName, canonName] of vendedoresRawSeen.entries()) {
    if (
      parsedSupervisores.bySeller.size > 0 &&
      !parsedSupervisores.bySeller.has(rawName) &&
      !parsedSupervisores.bySeller.has(canonName)
    ) {
      vendedoresRawNoEnHojaSupervisores.push({
        vendedorRaw: rawName,
        canonicalSeller: canonName,
        resolvedSupervisor: getSellerMetadata(canonName).supervisor,
      });
    }
  }

  const controlCaseAngelNavarro =
    sellersMetrics.find((s) => s.vendedor === 'ANGEL NAVARRO') || null;

  return {
    period: {
      year: targetYear,
      month: targetMonth,
      label: `${SPANISH_MONTH_NAMES[targetMonth - 1] || 'NOVIEMBRE'} ${targetYear}`,
    },
    rowCounts: {
      totalRawRowsInVentas: parsedVentas.totalRawDataRows,
      validNovember2026Rows: novRows.length,
      ignoredBeforeNovemberRows: parsedVentas.ignoredBeforeCutoffCount,
      rejectedMalformedRows: parsedVentas.rejectedMalformedCount ?? 0,
    },
    globalTotals: {
      volumenBrutoKg: round2(globalBrutoKg),
      devolucionesKg: round2(globalDevKg),
      volumenNetoKg: round2(globalNetoKg),
      cajasNetas: round2(globalCajasNetas),
      montoNeto: round2(globalMontoNeto),
      clientesUnicosBrutosGlobal: globalClientAgg.size,
      clientesActivadosNetosGlobal: globalActiveClientsNet,
      skusConMovimientoBrutoGlobal: globalSkuAgg.size,
      skusActivadosNetosGlobal: globalActiveSkusNet,
    },
    controlCaseAngelNavarro,
    sellers: sellersMetrics,
    referentialIntegrity: {
      skusHuerfanosEnVentas: Array.from(skusHuerfanosSet).sort(),
      clientesHuerfanosEnVentas: Array.from(clientesHuerfanosSet).sort(),
      vendedoresRawNoEnHojaSupervisores,
    },
  };
}
