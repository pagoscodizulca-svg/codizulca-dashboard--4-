import Papa from 'papaparse';
import { normalizeSellerName } from '../components/cuotas/sellerSupervisorMap';

export const DEFAULT_GOOGLE_SHEET_ID = '16pU4iEcNU_1j6sB7rZbshu2PM8OyH5hI7a24-vYO7P0';
export const NOVEMBER_STRICT_CUTOFF_DATE = '2026-11-01';

export type GoogleSheetTabName =
  | 'Ventas'
  | 'Cuotas Volumen'
  | 'Cuotas de Activacion'
  | 'Inventario'
  | 'Productos'
  | 'Clientes'
  | 'Supervisores'
  | 'Usuarios';

export const GOOGLE_SHEET_TAB_GIDS: Record<GoogleSheetTabName, string> = {
  Ventas: '1176024108',
  'Cuotas Volumen': '1575247832',
  'Cuotas de Activacion': '1956715436',
  Inventario: '776651974',
  Productos: '1163463775',
  Clientes: '765796985',
  Supervisores: '1921442451',
  Usuarios: '228804341',
};

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
 * Obtiene el ID del documento Google Sheet desde las variables de entorno o el valor oficial por defecto.
 */
export function getConfiguredGoogleSheetId(
  envOverride?: Record<string, string | undefined>
): string {
  const viteEnv =
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
  const nodeEnv = (typeof process !== 'undefined' && process?.env) || {};

  const configured =
    envOverride?.VITE_GOOGLE_SHEET_ID ||
    envOverride?.GOOGLE_SHEET_ID ||
    viteEnv.VITE_GOOGLE_SHEET_ID ||
    viteEnv.VITE_DATA_DASHBOARD_SHEET_ID ||
    nodeEnv.GOOGLE_SHEET_ID ||
    nodeEnv.VITE_GOOGLE_SHEET_ID ||
    DEFAULT_GOOGLE_SHEET_ID;

  return String(configured).trim() || DEFAULT_GOOGLE_SHEET_ID;
}

/**
 * Construye la URL de exportación CSV cruda (/export?format=csv&gid=...) que preserva
 * intactos los encabezados dobles (Fila 1 y Fila 2) y los códigos alfanuméricos sin coerción de tipos.
 */
export function buildGoogleSheetRawExportUrl(
  tabName: GoogleSheetTabName | string,
  sheetId: string = getConfiguredGoogleSheetId()
): string {
  const cleanTab = String(tabName || 'Ventas').trim() as GoogleSheetTabName;
  const gid = GOOGLE_SHEET_TAB_GIDS[cleanTab];
  if (gid) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    cleanTab
  )}`;
}

/**
 * Normaliza llaves de catálogos y nombres comerciales:
 * - aplica .trim() y .toUpperCase()
 * - colapsa espacios múltiples ("OSCAR ORTIZ-  LA COSTA" -> "OSCAR ORTIZ- LA COSTA")
 */
export function normalizeCatalogKey(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
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
 * Parser numérico contable estricto:
 * - Limpia comas de miles ("2,760.00" -> 2760)
 * - Limpia porcentajes ("82.50%" -> 82.5)
 * - Convierte guiones ("-", "--") y errores de fórmula ("#DIV/0!", "#N/A") en 0
 * - Respeta estrictamente los signos negativos ("-4" -> -4, "-104.00" -> -104, "-17.85" -> -17.85)
 */
export function parseStrictAccountingNumber(raw: unknown): number {
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

  // Manejo de separadores de miles y decimales:
  // Si tiene coma y punto (ej. "2,760.00" o "1,234,567.89"), las comas son miles.
  // Si tiene múltiples comas (ej. "1,234,567"), son miles.
  // Si tiene una sola coma seguida de 3 dígitos exactos (ej. "2,760"), en formato US del Sheet es miles.
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
      s = s.replace(/,/g, '');
    } else {
      // Formato europeo eventual "2.760,50"
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length > 2) {
      s = s.replace(/,/g, '');
    } else if (parts[1] && parts[1].length === 3 && /^\d+$/.test(parts[0])) {
      // "2,760" -> 2760
      s = s.replace(/,/g, '');
    } else {
      // "17,85" -> 17.85
      s = s.replace(',', '.');
    }
  }

  const parsed = Number(s);
  if (!Number.isFinite(parsed) || parsed === 0) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

/**
 * Parsea cualquier cadena de fecha del Google Sheet o Supabase a formato canónico `YYYY-MM-DD`
 * en zona horaria local (`America/Caracas` UTC-04:00), evitando cualquier conversión `new Date(iso)`
 * en UTC que haría retroceder las `00:00:00` del día 1 al mes anterior.
 */
export function parseCaracasLocalDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const clean = String(raw)
    .replace(/^["']+|["']+$/g, '')
    .trim();
  if (!clean) return null;

  // Extraer solo la porción de fecha antes de cualquier espacio o 'T'
  // Ej: "2026-11-01 0:00:00" -> "2026-11-01"
  const dateToken = clean.split(/[\sT]/)[0].trim();

  // Caso 1: YYYY-M-D o YYYY/M/D
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(dateToken);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Caso 2: DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(dateToken);
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    // En Venezuela el formato local es DD/MM/YYYY; si p2 > 12 entonces es MM/DD/YYYY
    const day = p2 > 12 ? p2 : p1;
    const month = p2 > 12 ? p1 : p2;
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
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
  cutoffDate: string;
}

/**
 * Parsea la pestaña `Ventas` (A1:K...) aplicando:
 * - `.trim()` a todos los encabezados (ej. `"% de utilidad "` -> `"% de utilidad"`)
 * - Parseo de fecha local `America/Caracas` (`YYYY-MM-DD`)
 * - REGLA DE CORTE ESTRICTA: ignora absolutamente cualquier fila con `Fecha < cutoffDate` (`'2026-11-01'`)
 * - Limpieza numérica preservando signos negativos en devoluciones (`Cajas`, `Unidades`, `Kg`, `Monto`, `Costo`, `Utilidad`)
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
      cutoffDate,
    };
  }

  // Fila 1: Encabezados con .trim() obligatorio
  const rawHeaders = matrix[0].map((h) =>
    String(h || '')
      .replace(/^["']+|["']+$/g, '')
      .trim()
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

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line || line.length === 0) continue;

    const rawFechaCell = line[idxFecha];
    const isoDate = parseCaracasLocalDate(rawFechaCell);
    if (!isoDate) continue;

    totalRawDataRows++;

    // REGLA INNEGOCIABLE: Ignorar absolutamente cualquier fila con Fecha < '2026-11-01'
    if (isoDate < cutoffDate) {
      ignoredBeforeCutoffCount++;
      continue;
    }

    const idCliente = normalizeCatalogKey(line[idxCliente]);
    const idArticulo = normalizeCatalogKey(line[idxArticulo]);
    const vendedorRaw = normalizeSheetSellerOrSupervisorKey(line[idxVendedor]);
    const vendedor = vendedorRaw.startsWith('OSCAR ORTIZ-')
      ? vendedorRaw
      : normalizeSellerName(vendedorRaw) || vendedorRaw;

    const cajas = parseStrictAccountingNumber(line[idxCajas]);
    const unidades = parseStrictAccountingNumber(line[idxUnidades]);
    const kg = parseStrictAccountingNumber(line[idxKg]);
    const monto = parseStrictAccountingNumber(line[idxMonto]);
    const costo = parseStrictAccountingNumber(line[idxCosto]);
    const utilidad = parseStrictAccountingNumber(line[idxUtilidad]);
    const pctUtilidad = parseStrictAccountingNumber(line[idxPctUtilidad]);

    const { ano, mes } = getPeriodMetadataFromIsoDate(isoDate);
    const tipoDoc: 'FA' | 'DV' = monto < 0 || cajas < 0 || kg < 0 ? 'DV' : 'FA';

    rows.push({
      rowNumber: r + 1,
      fecha: isoDate,
      ano,
      mes,
      idCliente,
      idArticulo,
      vendedorRaw,
      vendedor,
      cajas,
      unidades,
      kg,
      monto,
      costo,
      utilidad,
      pctUtilidad,
      tipoDoc,
    });
  }

  return {
    rows,
    totalRawDataRows,
    ignoredBeforeCutoffCount,
    acceptedFromCutoffCount: rows.length,
    cutoffDate,
  };
}

// ============================================================================
// 2. PESTAÑA "Cuotas Volumen" (A1:CW52) — DOBLE ENCABEZADO CON FORWARD-FILL
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
 * Parsea la matriz `Cuotas Volumen` (A1:CW52) con soporte de:
 * - Encabezado doble real (`/export?format=csv&gid=1575247832`):
 *   * Fila 1 tiene el nombre del Vendedor combinado cada 3 columnas desde la columna C (índice 2).
 *   * Fila 2 repite `CUOTA` (o `CUOTA KG`), `KG` (o `VENTA KG`) y `%`.
 *   * Columnas A y B son `Cod` y `Articulo`.
 * - Fallback automático si el CSV proviene de `gviz` con las 2 filas fusionadas en la Fila 1.
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

  const row0 = rawMatrix[0].map((c) => String(c || '').trim());
  const row1 = rawMatrix[1].map((c) => String(c || '').trim());

  // Detectar si es encabezado doble real (Row 1 tiene "Cod" y "Articulo" en A2:B2)
  // o si es encabezado fusionado por gviz (Row 0 tiene "Cod" y "Articulo" en A1:B1)
  const isDoubleHeader =
    normalizeCatalogKey(row1[0]) === 'COD' ||
    normalizeCatalogKey(row1[1]).startsWith('ARTICULO');

  const maxCols = Math.max(row0.length, row1.length);
  const forwardFilledRow1: string[] = new Array(maxCols).fill('');
  const row2Subheaders: string[] = new Array(maxCols).fill('');
  const dataStartRowIdx = isDoubleHeader ? 2 : 1;

  if (isDoubleHeader) {
    // Forward-fill en Fila 1 desde la columna C (índice 2)
    let currentSeller = '';
    for (let c = 0; c < maxCols; c++) {
      const r0Cell = normalizeSheetSellerOrSupervisorKey(row0[c])
        .replace(/\s+CUOTA(\s+KG)?$/i, '')
        .trim();
      const r1Cell = normalizeCatalogKey(row1[c]);

      if (c < 2) {
        forwardFilledRow1[c] = r0Cell;
        row2Subheaders[c] = r1Cell;
        continue;
      }

      if (r0Cell) {
        currentSeller = r0Cell;
      }
      forwardFilledRow1[c] = currentSeller;
      row2Subheaders[c] = r1Cell;
    }
  } else {
    // Formato fusionado gviz: Row 0 tiene el nombre del vendedor cada 3 columnas ("CARLOS FUENMAYOR CUOTA", "KG", "%")
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

  // Construir definición de bloques de 3 columnas por vendedor desde columna C (índice 2)
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
    const canonicalSeller = normalizeSellerName(sellerHeader) || sellerHeader;
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

    // Ignorar fila final de sumatorias que no tiene ni Cod ni Articulo
    if (!cod && !articulo) continue;

    const bySellerHeader: Record<string, CuotasVolumenSellerMetricCell> = {};
    const byCanonicalSeller: Record<
      string,
      { cuotaKg: number; ventaKg: number; cumplimientoPct: number }
    > = {};

    for (const block of sellerBlocks) {
      const cuotaKg = parseStrictAccountingNumber(line[block.cuotaCol]);
      const ventaKg = parseStrictAccountingNumber(line[block.kgCol]);
      const cumplimientoPct = parseStrictAccountingNumber(line[block.pctCol]);

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
// 3. PESTAÑA "Cuotas de Activacion" (A1:L28) — DOBLE ENCABEZADO
// ============================================================================

export interface CuotasActivacionMatrixRow {
  rowIndex: number;
  vendedorRaw: string;
  vendedor: string;
  cartera: number;
  categorias: {
    azucar: { meta: number; activados: number };
    lecheVencampo: { meta: number; activados: number };
    jamonAsturias: { meta: number; activados: number };
    mortadelaAsturias: { meta: number; activados: number };
    salpicao: { meta: number; activados: number };
    // Backward-compatible aliases
    aceite: { meta: number; activados: number };
    pollo: { meta: number; activados: number };
    estandarAsturias: { meta: number; activados: number };
    mortadelaSalpicaoAsturias: { meta: number; activados: number };
  };
}

export interface CuotasActivacionMatrixParseResult {
  categoriesRow1: string[];
  subheadersRow2: string[];
  rows: CuotasActivacionMatrixRow[];
}

/**
 * Parsea la pestaña `Cuotas de Activacion` (A1:L28):
 * - Fila 1 tiene las 5 categorías combinadas cada 2 columnas desde C hasta L:
 *   `Azúcar`, `Leche en polvo Vencampo`, `Jamón estándar y superior Asturias`, `Mortadela Asturias`, `Salpicao`
 *   (o formato previo `ACEITE`, `AZUCAR`, `POLLO`, `ESTANDAR Y SUPERIOR ASTURIAS`, `MORTADELA SALPICAO Y ASTURIAS`)
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
    let curCat = '';
    for (let c = 0; c < maxCols; c++) {
      if (c >= 2 && row0[c]) {
        curCat = row0[c];
      }
      categoriesRow1[c] = c < 2 ? '' : curCat;
      subheadersRow2[c] = row1[c] || '';
    }
  } else {
    // Fallback gviz donde Fila 1 y Fila 2 vienen concatenadas en row0
    let curCat = '';
    for (let c = 0; c < maxCols; c++) {
      if (c >= 2 && c % 2 === 0 && row0[c]) {
        curCat = row0[c].replace(/\s*META.*$/i, '').trim();
      }
      categoriesRow1[c] = c < 2 ? '' : curCat;
      subheadersRow2[c] = row0[c] || '';
    }
  }

  // Detectar si el encabezado en columna C (índice 2) comienza con AZUCAR (nuevo orden 1..5) o ACEITE (orden legado)
  const firstCatHeader = `${categoriesRow1[2] || ''} ${subheadersRow2[2] || ''}`.toUpperCase();
  const isNewOrderLayout = firstCatHeader.includes('AZUCAR');

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
      meta: parseStrictAccountingNumber(line[2]),
      activados: parseStrictAccountingNumber(line[3]),
    };
    const pair1 = {
      meta: parseStrictAccountingNumber(line[4]),
      activados: parseStrictAccountingNumber(line[5]),
    };
    const pair2 = {
      meta: parseStrictAccountingNumber(line[6]),
      activados: parseStrictAccountingNumber(line[7]),
    };
    const pair3 = {
      meta: parseStrictAccountingNumber(line[8]),
      activados: parseStrictAccountingNumber(line[9]),
    };
    const pair4 = {
      meta: parseStrictAccountingNumber(line[10]),
      activados: parseStrictAccountingNumber(line[11]),
    };

    const azucar = isNewOrderLayout ? pair0 : pair1;
    const lecheVencampo = isNewOrderLayout ? pair1 : pair2;
    const jamonAsturias = isNewOrderLayout ? pair2 : pair3;
    const mortadelaAsturias = isNewOrderLayout ? pair3 : pair4;
    const salpicao = isNewOrderLayout ? pair4 : pair0;

    rows.push({
      rowIndex: r + 1,
      vendedorRaw,
      vendedor,
      cartera: parseStrictAccountingNumber(line[1]),
      categorias: {
        azucar,
        lecheVencampo,
        jamonAsturias,
        mortadelaAsturias,
        salpicao,
        aceite: salpicao,
        pollo: lecheVencampo,
        estandarAsturias: jamonAsturias,
        mortadelaSalpicaoAsturias: mortadelaAsturias,
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
// 4. PESTAÑA "Inventario" (A1:N83) — DOBLE ENCABEZADO
// ============================================================================

export interface InventarioSheetMatrixRow {
  rowIndex: number;
  fecha: string;
  sku: string;
  producto: string;
  minimo: number;
  inicial: { cajas: number; kg: number };
  compras: { cajas: number; kg: number };
  ajustes: { cajas: number; kg: number };
  ventas: { cajas: number; kg: number };
  cuota: { cajas: number; kg: number };
  stockFinalCajas: number;
  stockFinalKg: number;
}

export interface InventarioMatrixParseResult {
  blocksRow1: string[];
  unitsRow2: string[];
  rows: InventarioSheetMatrixRow[];
}

/**
 * Parsea la pestaña `Inventario` (A1:N83):
 * - Fila 1 tiene `INICIAL` (E:F), `COMPRAS` (G:H), `AJUSTES` (I:J), `VENTAS` (K:L), `CUOTA` (M:N)
 * - Fila 2 tiene `Cajas` y `Kg` para cada bloque, más `Fecha` (A), `SKU` (B), `Producto` (C), `Mínimo` (D).
 */
export function parseInventarioSheetMatrix(
  csvText: string
): InventarioMatrixParseResult {
  const parsed = Papa.parse<string[]>(csvText || '', {
    header: false,
    skipEmptyLines: true,
  });
  const matrix = parsed.data || [];
  if (matrix.length < 2) {
    return { blocksRow1: [], unitsRow2: [], rows: [] };
  }

  const row0 = matrix[0].map((c) => normalizeCatalogKey(c));
  const row1 = matrix[1].map((c) => normalizeCatalogKey(c));

  const isDoubleHeader =
    row1[4] === 'CAJAS' || row1[5] === 'KG' || row0[4] === 'INICIAL';

  const maxCols = Math.max(14, row0.length, row1.length);
  const blocksRow1: string[] = new Array(maxCols).fill('');
  const unitsRow2: string[] = new Array(maxCols).fill('');

  if (isDoubleHeader) {
    let curBlock = '';
    for (let c = 0; c < maxCols; c++) {
      if (c < 4) {
        blocksRow1[c] = row0[c] || row1[c] || '';
        unitsRow2[c] = row1[c] || row0[c] || '';
      } else {
        if (row0[c]) curBlock = row0[c];
        blocksRow1[c] = curBlock;
        unitsRow2[c] = row1[c] || (c % 2 === 0 ? 'CAJAS' : 'KG');
      }
    }
  } else {
    const defaultBlocks = ['INICIAL', 'COMPRAS', 'AJUSTES', 'VENTAS', 'CUOTA'];
    for (let c = 0; c < maxCols; c++) {
      if (c < 4) {
        blocksRow1[c] = row0[c] || '';
        unitsRow2[c] = row0[c] || '';
      } else {
        const bIdx = Math.floor((c - 4) / 2);
        blocksRow1[c] = defaultBlocks[bIdx] || '';
        unitsRow2[c] = c % 2 === 0 ? 'CAJAS' : 'KG';
      }
    }
  }

  const dataStartIdx = isDoubleHeader ? 2 : 1;
  const rows: InventarioSheetMatrixRow[] = [];

  for (let r = dataStartIdx; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line) continue;

    const sku = normalizeCatalogKey(line[1]);
    const producto = normalizeCatalogKey(line[2]);
    if (!sku && !producto) continue;

    const fecha = parseCaracasLocalDate(line[0]) || String(line[0] || '').trim();
    const minimo = parseStrictAccountingNumber(line[3]);

    const inicial = {
      cajas: parseStrictAccountingNumber(line[4]),
      kg: parseStrictAccountingNumber(line[5]),
    };
    const compras = {
      cajas: parseStrictAccountingNumber(line[6]),
      kg: parseStrictAccountingNumber(line[7]),
    };
    const ajustes = {
      cajas: parseStrictAccountingNumber(line[8]),
      kg: parseStrictAccountingNumber(line[9]),
    };
    const ventas = {
      cajas: parseStrictAccountingNumber(line[10]),
      kg: parseStrictAccountingNumber(line[11]),
    };
    const cuota = {
      cajas: parseStrictAccountingNumber(line[12]),
      kg: parseStrictAccountingNumber(line[13]),
    };

    const stockFinalCajas =
      Math.round((inicial.cajas + compras.cajas + ajustes.cajas - ventas.cajas) * 100) /
      100;
    const stockFinalKg =
      Math.round((inicial.kg + compras.kg + ajustes.kg - ventas.kg) * 100) / 100;

    rows.push({
      rowIndex: r + 1,
      fecha,
      sku,
      producto,
      minimo,
      inicial,
      compras,
      ajustes,
      ventas,
      cuota,
      stockFinalCajas,
      stockFinalKg,
    });
  }

  return {
    blocksRow1,
    unitsRow2,
    rows,
  };
}

// ============================================================================
// 5. CATÁLOGOS ("Productos", "Clientes", "Supervisores", "Usuarios")
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

export interface UsuarioCatalogRow {
  usuario: string;
  contrasena: string;
  rol: string;
  nombre: string;
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
    const codProducto = normalizeCatalogKey(line[0]).replace(/^0+/, '') || normalizeCatalogKey(line[0]);
    const producto = normalizeCatalogKey(line[1]);
    const categoria = normalizeCatalogKey(line[2]) || 'GENERAL';
    if (!codProducto && !producto) continue;

    const item: ProductoCatalogRow = { codProducto, producto, categoria };
    rows.push(item);
    if (codProducto) {
      byCode.set(codProducto, item);
      byCode.set(normalizeCatalogKey(line[0]), item);
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
    const codCliente = normalizeCatalogKey(line[0]).replace(/^0+/, '') || normalizeCatalogKey(line[0]);
    const cliente = normalizeCatalogKey(line[1]);
    const vendedorRaw = normalizeSheetSellerOrSupervisorKey(line[2]);
    const vendedor = normalizeSellerName(vendedorRaw) || vendedorRaw;
    const region = normalizeCatalogKey(line[3]);
    const categoria = normalizeCatalogKey(line[4]);
    if (!codCliente && !cliente) continue;

    const item: ClienteCatalogRow = {
      codCliente,
      cliente,
      vendedorRaw,
      vendedor,
      region,
      categoria,
    };
    rows.push(item);
    if (codCliente) {
      byCode.set(codCliente, item);
      byCode.set(normalizeCatalogKey(line[0]), item);
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
    if (!vendedorRaw || vendedorRaw === 'VENDEDOR') continue;

    const vendedor = normalizeSellerName(vendedorRaw) || vendedorRaw;
    const item: SupervisorCatalogRow = {
      vendedorRaw,
      vendedor,
      supervisor,
    };
    rows.push(item);
    bySeller.set(vendedorRaw, supervisor);
    bySeller.set(vendedor, supervisor);
  }

  return { rows, bySeller };
}

export function parseUsuariosCatalogCsv(csvText: string): {
  rows: UsuarioCatalogRow[];
  byUsername: Map<string, UsuarioCatalogRow>;
} {
  const parsed = Papa.parse<string[]>(csvText || '', {
    header: false,
    skipEmptyLines: true,
  });
  const matrix = parsed.data || [];
  const rows: UsuarioCatalogRow[] = [];
  const byUsername = new Map<string, UsuarioCatalogRow>();

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line) continue;
    const usuario = normalizeCatalogKey(line[0]);
    const contrasena = String(line[1] || '').trim();
    const rol = normalizeCatalogKey(line[2]);
    const nombre = normalizeSheetSellerOrSupervisorKey(line[3]);
    if (!usuario || usuario === 'USUARIO') continue;

    const item: UsuarioCatalogRow = {
      usuario,
      contrasena,
      rol,
      nombre,
    };
    rows.push(item);
    byUsername.set(usuario, item);
  }

  return { rows, byUsername };
}
