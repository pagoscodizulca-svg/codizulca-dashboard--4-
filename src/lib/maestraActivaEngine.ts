import * as XLSX from 'xlsx';
import type {
  ExistingActivationRecordLike,
  ExistingCarteraRecordLike,
  MaestraAuditReport,
  MaestraBajaRecord,
  MaestraDiffChangeType,
  MaestraDiffRecord,
  MaestraDuplicateIdGroup,
  MaestraParseResult,
  MaestraSanitizedClient,
  MaestraSellerAuditRow,
  MaestraSellerSummary,
  MaestraTipoSummary,
  RifResolutionSource,
  TipoResolutionSource,
} from './maestraActivaTypes';

/**
 * Sanitiza cualquier celda de texto aplicando trim() y colapsando espacios múltiples.
 * Elimina los espacios en blanco al final presentes en el ERP (ej. "SUPERMERCADOS                ").
 */
export function sanitizeMaestraText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza un código de cliente eliminando prefijos "#" o espacios, preservando el código numérico/texto.
 * Si un código compuesto fue almacenado con sufijo "#idVendedor", extrae el Id original del cliente.
 */
export function normalizeClientId(val: unknown): string {
  const clean = sanitizeMaestraText(val).replace(/^[#\s]+/, '');
  if (!clean) return '';
  const hashIdx = clean.indexOf('::');
  if (hashIdx > 0) return clean.slice(hashIdx + 2).trim();
  const suffixIdx = clean.indexOf('#');
  if (suffixIdx > 0) return clean.slice(0, suffixIdx).trim();
  return clean;
}

/**
 * Normaliza una Razón Social para cruce tolerante a tildes y signos de puntuación contra hojas RIF / TIPO.
 */
export function normalizeBusinessNameForLookup(val: unknown): string {
  return sanitizeMaestraText(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,;"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detecta valores inválidos o errores de fórmulas VLOOKUP (#N/A, vacío, #REF!, #VALUE!).
 */
export function isMissingExcelLookupValue(val: unknown): boolean {
  const s = sanitizeMaestraText(val).toUpperCase();
  return (
    !s ||
    s === '#N/A' ||
    s === 'N/A' ||
    s === '#N/D' ||
    s === '#VALUE!' ||
    s === '#VALOR!' ||
    s === '#REF!' ||
    s === '#NAME?' ||
    s === 'NAN' ||
    s === 'NULL' ||
    s === 'UNDEFINED'
  );
}

/**
 * Resuelve la jerarquía comercial (Vendedor Canónico de Cuotas, Supervisor y Zona)
 * para cualquiera de las 30 rutas activas de la Maestra Octubre 2026.
 */
export function resolveMaestraSellerHierarchy(rawVendedor: string): {
  vendedor: string;
  canonicalSeller: string;
  supervisor: string;
  zona: string;
} {
  const clean = sanitizeMaestraText(rawVendedor).toUpperCase();
  const ascii = clean
    .replace(/Ã‘|Ã±/g, 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (ascii.includes('CUENTAS CLAVE 1') || ascii.includes('MARIANA CHACIN')) {
    return {
      vendedor: clean || 'CUENTAS CLAVE 1 - MC',
      canonicalSeller: 'MARIANA CHACIN',
      supervisor: 'NELSON FINOL',
      zona: 'Cuentas Clave 1',
    };
  }
  if (ascii.includes('CUENTAS CLAVE 2') || ascii.includes('SAIRU VALLES')) {
    return {
      vendedor: clean || 'CUENTAS CLAVE 2 - SV',
      canonicalSeller: 'SAIRU VALLES',
      supervisor: 'NELSON FINOL',
      zona: 'Cuentas Clave 2',
    };
  }
  if (ascii.includes('FOOD SERVICE SENIOR')) {
    return {
      vendedor: clean || 'FOOD SERVICE SENIOR - JUAN HERNANDEZ',
      canonicalSeller: 'FOOD SERVICE SENIOR - JUAN HERNANDEZ',
      supervisor: 'JOHNATAN SOTO',
      zona: 'Food Service Senior',
    };
  }
  if (ascii.includes('JAIDER MEDINA') || ascii.includes('FOOD SERVICE NORTE')) {
    return {
      vendedor: clean || 'JAIDER MEDINA - FOOD SERVICE NORTE',
      canonicalSeller: 'JAIDER MEDINA - FOOD SERVICE NORTE',
      supervisor: 'NELSON FINOL',
      zona: 'Food Service Norte',
    };
  }
  if (ascii.includes('FOOD SERVICE SUR')) {
    return {
      vendedor: clean || 'FOOD SERVICE SUR',
      canonicalSeller: 'FOOD SERVICE SUR',
      supervisor: 'NELSON FINOL',
      zona: 'Food Service Sur',
    };
  }
  if (ascii.includes('MIKELANGELO') || ascii.includes('JOHNATAN')) {
    const isVilla = ascii.includes('VILLA');
    return {
      vendedor: clean,
      canonicalSeller: 'MIKELANGELO DIAZ',
      supervisor: 'JOHNATAN SOTO',
      zona: isVilla ? 'Villa del Rosario / Perijá' : 'Machiques / Perijá',
    };
  }
  if (ascii.includes('OSCAR ORTIZ')) {
    const isCosta = ascii.includes('COSTA');
    return {
      vendedor: clean,
      canonicalSeller: 'OSCAR ORTIZ',
      supervisor: 'ALI PEREZ',
      zona: isCosta ? 'La Costa / Falcón' : 'Coro / Falcón',
    };
  }
  if (ascii.includes('J PABLO ARAUJO')) {
    const isCabOje = ascii.includes('CAB') || ascii.includes('OJE');
    return {
      vendedor: clean,
      canonicalSeller: isCabOje ? 'J PABLO ARAUJO - CAB/OJE' : 'J PABLO ARAUJO',
      supervisor: 'NELSON FINOL',
      zona: isCabOje ? 'Cabimas / Ciudad Ojeda' : 'Costa Oriental del Lago',
    };
  }
  if (ascii.includes('MARIA BRICENO')) {
    return { vendedor: 'MARIA BRICEÑO', canonicalSeller: 'MARIA BRICEÑO', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (ascii.includes('EDUARDO PINA')) {
    return { vendedor: 'EDUARDO PIÑA', canonicalSeller: 'EDUARDO PIÑA', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (ascii.includes('HERNAN PAZ')) {
    return { vendedor: clean, canonicalSeller: 'HERNAN PAZ', supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Perijá' };
  }
  if (ascii.includes('OSWALDO CHURION')) {
    return { vendedor: clean, canonicalSeller: 'OSWALDO CHURION', supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Sur' };
  }
  if (ascii.includes('ANGELICA MORENO')) {
    return { vendedor: clean, canonicalSeller: 'ANGELICA MORENO', supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Norte' };
  }
  if (ascii.includes('ADEL JARABA')) {
    return { vendedor: clean, canonicalSeller: 'ADEL JARABA', supervisor: 'JOHNATAN SOTO', zona: 'Mayoristas / Maracaibo' };
  }
  if (ascii.includes('JUAN HERNANDEZ')) {
    return { vendedor: clean, canonicalSeller: 'JUAN HERNANDEZ', supervisor: 'JOHNATAN SOTO', zona: 'Sur del Lago / El Chivo' };
  }
  if (ascii.includes('ANGEL NAVARRO') || ascii === 'ALI PEREZ') {
    return { vendedor: 'ANGEL NAVARRO', canonicalSeller: 'ANGEL NAVARRO', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (ascii.includes('MARIANGEL GONZALEZ')) {
    return { vendedor: clean, canonicalSeller: 'MARIANGEL GONZALEZ', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (ascii.includes('VICTOR CAMPOS')) {
    return { vendedor: clean, canonicalSeller: 'VICTOR CAMPOS', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (ascii.includes('ELISA SOLER')) {
    return { vendedor: clean, canonicalSeller: 'ELISA SOLER', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (ascii.includes('LEONARDO RIOS')) {
    return { vendedor: clean, canonicalSeller: 'LEONARDO RIOS', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (ascii.includes('LUIS GUANIPA')) {
    return { vendedor: clean, canonicalSeller: 'LUIS GUANIPA', supervisor: 'ALI PEREZ', zona: 'Coro / Falcón' };
  }
  if (ascii.includes('CARLOS FUENMAYOR')) {
    return { vendedor: clean, canonicalSeller: 'CARLOS FUENMAYOR', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (ascii.includes('SARAH REYES')) {
    return { vendedor: clean, canonicalSeller: 'SARAH REYES', supervisor: 'NELSON FINOL', zona: 'Maracaibo / San Francisco' };
  }
  if (ascii.includes('JOSE G. GONZALEZ') || ascii.includes('JOSE GONZALEZ')) {
    return { vendedor: 'JOSE G. GONZALEZ', canonicalSeller: 'JOSE G. GONZALEZ', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (ascii.includes('YOLEIDA LUGO')) {
    return { vendedor: clean, canonicalSeller: 'YOLEIDA LUGO', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (ascii.includes('MARYERY GARCIA')) {
    return { vendedor: clean, canonicalSeller: 'MARYERY GARCIA', supervisor: 'NELSON FINOL', zona: 'Ciudad Ojeda / COL' };
  }
  if (ascii.includes('PEDRO ABREU')) {
    return { vendedor: clean, canonicalSeller: 'PEDRO ABREU', supervisor: 'NELSON FINOL', zona: 'Punto Fijo / Paraguaná' };
  }

  return {
    vendedor: clean || 'SIN ASIGNAR',
    canonicalSeller: clean || 'SIN ASIGNAR',
    supervisor: 'NELSON FINOL',
    zona: 'Occidente',
  };
}

/**
 * Construye llave compuesta determinística por ruta + cliente para manejar IDs compartidos (ej. Id = 8377).
 */
export function buildRouteClientKey(vendedorRoute: string, idCliente: string): string {
  const cleanRoute = sanitizeMaestraText(vendedorRoute).toUpperCase();
  const cleanClient = normalizeClientId(idCliente);
  return `${cleanRoute}::${cleanClient}`;
}

/**
 * Parsea y valida un libro Excel con estructura MAESTRA ACTIVA (hojas DATA, TIPO, RIF).
 */
export function parseMaestraActivaWorkbook(
  workbook: XLSX.WorkBook,
  sourceFilename = 'MAESTRA ACTIVA (7).xlsx'
): MaestraParseResult {
  const dataSheetName =
    workbook.SheetNames.find((n) => sanitizeMaestraText(n).toUpperCase() === 'DATA') ||
    workbook.SheetNames[0];
  if (!dataSheetName || !workbook.Sheets[dataSheetName]) {
    throw new Error('El archivo Excel no contiene la hoja requerida "DATA".');
  }

  const tipoSheetName = workbook.SheetNames.find(
    (n) => sanitizeMaestraText(n).toUpperCase() === 'TIPO'
  );
  const rifSheetName = workbook.SheetNames.find(
    (n) => sanitizeMaestraText(n).toUpperCase() === 'RIF'
  );

  // 1. Índices O(1) de respaldo desde las hojas TIPO y RIF (por Id y por Razón Social normalizada)
  const tipoById = new Map<string, string>();
  const tipoByName = new Map<string, string>();
  if (tipoSheetName && workbook.Sheets[tipoSheetName]) {
    const tipoRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[tipoSheetName], {
      header: 1,
      defval: null,
      raw: false,
    });
    for (let i = 1; i < tipoRows.length; i++) {
      const r = tipoRows[i] || [];
      const id = normalizeClientId(r[0]);
      const name = normalizeBusinessNameForLookup(r[1]);
      const tipo = sanitizeMaestraText(r[2]).toUpperCase();
      if (!isMissingExcelLookupValue(tipo)) {
        if (id) tipoById.set(id, tipo);
        if (name) tipoByName.set(name, tipo);
      }
    }
  }

  const rifById = new Map<string, string>();
  const rifByName = new Map<string, string>();
  if (rifSheetName && workbook.Sheets[rifSheetName]) {
    const rifRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[rifSheetName], {
      header: 1,
      defval: null,
      raw: false,
    });
    for (let i = 1; i < rifRows.length; i++) {
      const r = rifRows[i] || [];
      const id = normalizeClientId(r[0]);
      const name = normalizeBusinessNameForLookup(r[1]);
      const rif = sanitizeMaestraText(r[2]).toUpperCase();
      if (!isMissingExcelLookupValue(rif)) {
        if (id) rifById.set(id, rif);
        if (name) rifByName.set(name, rif);
      }
    }
  }

  // 2. Lectura de hoja DATA: Fila 1 = Título general, Fila 2 = Encabezados reales
  const dataRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[dataSheetName], {
    header: 1,
    defval: null,
    raw: false,
  });

  if (dataRows.length < 3) {
    throw new Error('La hoja "DATA" no contiene registros debajo de la fila de encabezados.');
  }

  const titleRow = dataRows[0] || [];
  const title =
    titleRow.map((c) => sanitizeMaestraText(c)).find((c) => c.length > 0) ||
    'MAESTRA CLIENTES ACTIVOS';

  // Detectar si los encabezados están en Fila 2 (índice 1) o Fila 1 (índice 0)
  let headerRowIdx = 1;
  const row0Upper = (dataRows[0] || []).map((c) => sanitizeMaestraText(c).toUpperCase());
  const row1Upper = (dataRows[1] || []).map((c) => sanitizeMaestraText(c).toUpperCase());
  if (row0Upper.includes('ID VENDEDOR') && !row1Upper.includes('ID VENDEDOR')) {
    headerRowIdx = 0;
  }

  const rowsBelowHeader = dataRows.slice(headerRowIdx + 1);
  let emptyRowsIgnored = 0;
  const rawParsed: MaestraSanitizedClient[] = [];

  for (let i = 0; i < rowsBelowHeader.length; i++) {
    const row = rowsBelowHeader[i] || [];
    const isCompletelyEmpty = row.every((cell) => sanitizeMaestraText(cell) === '');
    if (isCompletelyEmpty) {
      emptyRowsIgnored++;
      continue;
    }

    const idVendedor = sanitizeMaestraText(row[0]);
    const rawVendedor = sanitizeMaestraText(row[1]);
    const idCliente = normalizeClientId(row[2]);
    const razonSocial = sanitizeMaestraText(row[3]);
    const rawRif = sanitizeMaestraText(row[4]);
    const rawTipoCliente = sanitizeMaestraText(row[5]);

    // Ignorar eventuales filas de repetición de encabezado
    if (
      idVendedor.toUpperCase() === 'ID VENDEDOR' ||
      (!idCliente && !razonSocial)
    ) {
      emptyRowsIgnored++;
      continue;
    }

    const hierarchy = resolveMaestraSellerHierarchy(rawVendedor);
    const normBizName = normalizeBusinessNameForLookup(razonSocial);

    // Resolución obligatoria de RIF: DATA -> hoja RIF por Id -> hoja RIF por Razón Social -> "PENDIENTE"
    let rif = '';
    let rifSource: RifResolutionSource = 'DATA';
    if (!isMissingExcelLookupValue(rawRif)) {
      rif = rawRif.toUpperCase();
      rifSource = 'DATA';
    } else if (idCliente && rifById.has(idCliente)) {
      rif = rifById.get(idCliente)!;
      rifSource = 'RIF_BY_ID';
    } else if (normBizName && rifByName.has(normBizName)) {
      rif = rifByName.get(normBizName)!;
      rifSource = 'RIF_BY_NAME';
    } else {
      rif = 'PENDIENTE';
      rifSource = 'FALLBACK_PENDIENTE';
    }

    // Resolución obligatoria de Tipo de cliente: DATA -> hoja TIPO por Id -> hoja TIPO por Razón Social -> "POR CLASIFICAR"
    let tipoCliente = '';
    let tipoSource: TipoResolutionSource = 'DATA';
    if (!isMissingExcelLookupValue(rawTipoCliente)) {
      tipoCliente = rawTipoCliente.toUpperCase();
      tipoSource = 'DATA';
    } else if (idCliente && tipoById.has(idCliente)) {
      tipoCliente = tipoById.get(idCliente)!;
      tipoSource = 'TIPO_BY_ID';
    } else if (normBizName && tipoByName.has(normBizName)) {
      tipoCliente = tipoByName.get(normBizName)!;
      tipoSource = 'TIPO_BY_NAME';
    } else {
      tipoCliente = 'POR CLASIFICAR';
      tipoSource = 'FALLBACK_POR_CLASIFICAR';
    }

    const excelRowNumber = headerRowIdx + 2 + i;
    const effectiveVendorLabel = rawVendedor.toUpperCase() || hierarchy.vendedor;

    rawParsed.push({
      assignmentKey: `${idVendedor || effectiveVendorLabel}::${idCliente}`,
      routeAssignmentKey: buildRouteClientKey(effectiveVendorLabel, idCliente),
      excelRowNumber,
      idVendedor,
      vendedor: effectiveVendorLabel,
      canonicalSeller: hierarchy.canonicalSeller,
      supervisor: hierarchy.supervisor,
      zona: hierarchy.zona,
      idCliente,
      razonSocial,
      rawRif,
      rawTipoCliente,
      rif,
      tipoCliente,
      rifSource,
      tipoSource,
      isPendingClassification: rif === 'PENDIENTE' || tipoCliente === 'POR CLASIFICAR',
      isSharedClientId: false,
      activo: true,
    });
  }

  // 3. Detección de duplicados por Id de cliente (ej. Id = 8377 compartido entre ID VENDEDOR 9 y 40)
  const byClientId = new Map<string, MaestraSanitizedClient[]>();
  for (const rec of rawParsed) {
    if (!byClientId.has(rec.idCliente)) {
      byClientId.set(rec.idCliente, []);
    }
    byClientId.get(rec.idCliente)!.push(rec);
  }

  const duplicateIdGroups: MaestraDuplicateIdGroup[] = [];
  for (const [idCliente, group] of byClientId.entries()) {
    if (group.length > 1) {
      group.forEach((g) => {
        g.isSharedClientId = true;
      });
      duplicateIdGroups.push({
        idCliente,
        razonSocial: group[0].razonSocial,
        occurrencesCount: group.length,
        assignments: group.map((g) => ({
          excelRowNumber: g.excelRowNumber,
          idVendedor: g.idVendedor,
          vendedor: g.vendedor,
          supervisor: g.supervisor,
          rif: g.rif,
          tipoCliente: g.tipoCliente,
          assignmentKey: g.assignmentKey,
        })),
      });
    }
  }

  // 4. Resumen por los 30 vendedores/rutas y por los 27 Tipos de cliente
  const sellerMap = new Map<string, MaestraSellerSummary>();
  const tipoMap = new Map<string, { count: number; sellers: Set<string> }>();

  for (const rec of rawParsed) {
    const sKey = `${rec.idVendedor}|||${rec.vendedor}`;
    if (!sellerMap.has(sKey)) {
      sellerMap.set(sKey, {
        idVendedor: rec.idVendedor,
        vendedor: rec.vendedor,
        canonicalSeller: rec.canonicalSeller,
        supervisor: rec.supervisor,
        zona: rec.zona,
        activeCount: 0,
        pendingCount: 0,
        sharedIdsCount: 0,
        tiposBreakdown: {},
      });
    }
    const s = sellerMap.get(sKey)!;
    s.activeCount++;
    if (rec.isPendingClassification) s.pendingCount++;
    if (rec.isSharedClientId) s.sharedIdsCount++;
    s.tiposBreakdown[rec.tipoCliente] = (s.tiposBreakdown[rec.tipoCliente] || 0) + 1;

    if (!tipoMap.has(rec.tipoCliente)) {
      tipoMap.set(rec.tipoCliente, { count: 0, sellers: new Set() });
    }
    const t = tipoMap.get(rec.tipoCliente)!;
    t.count++;
    t.sellers.add(sKey);
  }

  const sellerSummaries = Array.from(sellerMap.values()).sort((a, b) => {
    const na = parseInt(a.idVendedor, 10);
    const nb = parseInt(b.idVendedor, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.vendedor.localeCompare(b.vendedor);
  });

  const totalValid = rawParsed.length;
  const tipoClienteSummaries: MaestraTipoSummary[] = Array.from(tipoMap.entries())
    .map(([tipoCliente, info]) => ({
      tipoCliente,
      activeCount: info.count,
      sharePct: totalValid > 0 ? Number(((info.count / totalValid) * 100).toFixed(2)) : 0,
      sellersCount: info.sellers.size,
      isPendingBucket: tipoCliente === 'POR CLASIFICAR',
    }))
    .sort((a, b) => b.activeCount - a.activeCount || a.tipoCliente.localeCompare(b.tipoCliente));

  const pendingRecords = rawParsed.filter((r) => r.isPendingClassification);

  return {
    title,
    sourceFilename,
    totalRowsBelowHeader: rowsBelowHeader.length,
    emptyRowsIgnored,
    validActiveCount: rawParsed.length,
    distinctClientIdsCount: byClientId.size,
    sellersCount: sellerSummaries.length,
    records: rawParsed,
    pendingRecords,
    duplicateIdGroups,
    sellerSummaries,
    tipoClienteSummaries,
  };
}

/**
 * Parsea directamente un ArrayBuffer / Uint8Array / Buffer de Excel.
 */
export function parseMaestraActivaBuffer(
  data: ArrayBuffer | Uint8Array,
  sourceFilename = 'MAESTRA ACTIVA (7).xlsx'
): MaestraParseResult {
  const wb = XLSX.read(data, { type: 'array', raw: false });
  return parseMaestraActivaWorkbook(wb, sourceFilename);
}

export const LOGICAL_INACTIVE_VENDOR_PREFIX = 'INACTIVO_MAESTRA::';

/**
 * Determina si una fila de public.activacion_clientes o cartera fue marcada con borrado lógico (activo = false).
 */
export function isActivationRecordLogicallyInactive(r: ExistingActivationRecordLike): boolean {
  if (r.activo === false) return true;
  const st = sanitizeMaestraText(r.status).toUpperCase();
  if (st === 'BAJA_MAESTRA') return true;
  const vid = sanitizeMaestraText(r.vendedor_id).toUpperCase();
  return vid.startsWith(LOGICAL_INACTIVE_VENDOR_PREFIX);
}

/**
 * Extrae el nombre limpio de la ruta/vendedor removiendo el prefijo de borrado lógico si existe.
 */
export function extractCleanVendorRoute(r: ExistingActivationRecordLike): string {
  const vNom = sanitizeMaestraText(r.vendedor_nombre).toUpperCase();
  if (vNom && !vNom.startsWith(LOGICAL_INACTIVE_VENDOR_PREFIX)) return vNom;
  const vId = sanitizeMaestraText(r.vendedor_id).toUpperCase();
  return vId.replace(/^INACTIVO_MAESTRA::/, '').trim();
}

/**
 * Ejecuta la auditoría comparativa completa entre el resultado del Excel y los registros actuales
 * en Supabase (public.activacion_clientes) y Cartera Local (carteraClientes.json).
 */
export function compareMaestraAgainstDatabase(
  parsed: MaestraParseResult,
  existingSupabaseRows: ExistingActivationRecordLike[],
  existingCarteraRows: ExistingCarteraRecordLike[] = [],
  periodo = '2026-10',
  syncedAt: string | null = null
): MaestraAuditReport {
  // Filtrar registros previamente activos en Supabase (excluyendo los ya marcados con borrado lógico activo = false)
  const activeSupabaseRows = existingSupabaseRows.filter(
    (r) => !isActivationRecordLogicallyInactive(r)
  );
  const activeCarteraRows = existingCarteraRows.filter((r) => r.activo !== false);

  // Índices sobre Supabase actual
  const supaByRouteClient = new Map<string, ExistingActivationRecordLike>();
  const supaByClient = new Map<string, ExistingActivationRecordLike[]>();
  const supaCountByVendorRoute = new Map<string, number>();
  const supaPurchasedCountByVendorRoute = new Map<string, number>();

  for (const r of activeSupabaseRows) {
    const cid = normalizeClientId(r.cliente_codigo);
    const vRoute = extractCleanVendorRoute(r);
    if (!cid) continue;

    const rcKey = buildRouteClientKey(vRoute, cid);
    supaByRouteClient.set(rcKey, r);

    if (!supaByClient.has(cid)) supaByClient.set(cid, []);
    supaByClient.get(cid)!.push(r);

    supaCountByVendorRoute.set(vRoute, (supaCountByVendorRoute.get(vRoute) || 0) + 1);

    const hasPurchase =
      Boolean(r.has_aceite) ||
      Boolean(r.has_azucar) ||
      Boolean(r.has_pollo) ||
      Boolean(r.has_estandar_asturias) ||
      Boolean(r.has_mortadela_salpicao) ||
      (Number(r.cajas_aceite) || 0) > 0 ||
      (Number(r.cajas_azucar) || 0) > 0 ||
      (Number(r.cajas_pollo) || 0) > 0 ||
      (Number(r.cajas_estandar_asturias) || 0) > 0 ||
      (Number(r.cajas_mortadela_salpicao) || 0) > 0 ||
      sanitizeMaestraText(r.status).toUpperCase() === 'ACTIVO';

    if (hasPurchase) {
      supaPurchasedCountByVendorRoute.set(
        vRoute,
        (supaPurchasedCountByVendorRoute.get(vRoute) || 0) + 1
      );
    }
  }

  // Índices sobre Cartera JSON actual
  const carteraByRouteClient = new Map<string, ExistingCarteraRecordLike>();
  const carteraByClient = new Map<string, ExistingCarteraRecordLike[]>();
  const carteraCountByRouteOrCanonical = new Map<string, number>();

  for (const c of activeCarteraRows) {
    const cid = normalizeClientId(c.id);
    if (!cid) continue;
    const vRaw = sanitizeMaestraText(c.rutaVendedor || c.vendedor).toUpperCase();
    carteraByRouteClient.set(buildRouteClientKey(vRaw, cid), c);
    if (!carteraByClient.has(cid)) carteraByClient.set(cid, []);
    carteraByClient.get(cid)!.push(c);
    carteraCountByRouteOrCanonical.set(
      vRaw,
      (carteraCountByRouteOrCanonical.get(vRaw) || 0) + 1
    );
  }

  const altasList: MaestraDiffRecord[] = [];
  const cambiosList: MaestraDiffRecord[] = [];

  let altasSupabaseCount = 0;
  let altasCarteraCount = 0;
  let cambiosVendedorRutaCount = 0;
  let cambiosTipoClienteCount = 0;
  let saneamientosTextoCount = 0;

  const matchedSupaKeys = new Set<string>();

  for (const rec of parsed.records) {
    const changeTypes: MaestraDiffChangeType[] = [];
    let previousVendedor: string | undefined;
    let previousTipoCliente: string | undefined;
    let previousRif: string | undefined;
    let previousRazonSocial: string | undefined;

    const exactSupa = supaByRouteClient.get(rec.routeAssignmentKey);
    const sameIdSupaList = supaByClient.get(rec.idCliente) || [];

    if (exactSupa) {
      matchedSupaKeys.add(rec.routeAssignmentKey);
      const rawDbName = String(exactSupa.cliente_nombre || '');
      if (rawDbName !== rec.razonSocial) {
        changeTypes.push('SANEAMIENTO_TEXTO');
        previousRazonSocial = rawDbName;
        saneamientosTextoCount++;
      }
    } else if (!rec.isSharedClientId && sameIdSupaList.length === 1) {
      // Cliente existente que cambió de vendedor/ruta en Supabase
      const prevRow = sameIdSupaList[0];
      const prevRoute = sanitizeMaestraText(prevRow.vendedor_nombre || prevRow.vendedor_id).toUpperCase();
      matchedSupaKeys.add(buildRouteClientKey(prevRoute, rec.idCliente));
      changeTypes.push('CAMBIO_VENDEDOR_RUTA');
      previousVendedor = prevRoute;
      cambiosVendedorRutaCount++;
    } else {
      // Alta nueva de asignación/cliente en Supabase (ej. Id=8377 en LUIS GUANIPA o cliente 100% nuevo)
      changeTypes.push('ALTA_SUPABASE');
      altasSupabaseCount++;
    }

    // Comparación complementaria contra Cartera de Clientes (RIF y Tipo de cliente / Canal)
    const exactCartera = carteraByRouteClient.get(rec.routeAssignmentKey);
    const sameIdCarteraList = carteraByClient.get(rec.idCliente) || [];
    const refCartera =
      exactCartera ||
      sameIdCarteraList.find(
        (x) =>
          sanitizeMaestraText(x.vendedor).toUpperCase() === rec.canonicalSeller ||
          sanitizeMaestraText(x.vendedor).toUpperCase() === rec.vendedor
      ) ||
      (!rec.isSharedClientId ? sameIdCarteraList[0] : undefined);

    if (!refCartera) {
      changeTypes.push('ALTA_CARTERA');
      altasCarteraCount++;
    } else {
      const oldCanal = sanitizeMaestraText(refCartera.canal).toUpperCase();
      const oldRif = sanitizeMaestraText(refCartera.rif).toUpperCase();
      const oldVend = sanitizeMaestraText(refCartera.rutaVendedor || refCartera.vendedor).toUpperCase();

      if (
        oldVend &&
        oldVend !== rec.vendedor &&
        oldVend !== rec.canonicalSeller &&
        !changeTypes.includes('CAMBIO_VENDEDOR_RUTA')
      ) {
        changeTypes.push('CAMBIO_VENDEDOR_RUTA');
        previousVendedor = oldVend;
        cambiosVendedorRutaCount++;
      }
      if (oldCanal !== rec.tipoCliente) {
        changeTypes.push('CAMBIO_TIPO_CLIENTE');
        previousTipoCliente = oldCanal || '(VACÍO)';
        cambiosTipoClienteCount++;
      }
      if (oldRif !== rec.rif) {
        changeTypes.push('CAMBIO_RIF');
        previousRif = oldRif || '(VACÍO)';
      }
    }

    if (changeTypes.includes('ALTA_SUPABASE') || changeTypes.includes('ALTA_CARTERA')) {
      altasList.push({
        assignmentKey: rec.assignmentKey,
        idCliente: rec.idCliente,
        razonSocial: rec.razonSocial,
        idVendedor: rec.idVendedor,
        vendedor: rec.vendedor,
        supervisor: rec.supervisor,
        rif: rec.rif,
        tipoCliente: rec.tipoCliente,
        changeTypes,
        previousVendedor,
        previousTipoCliente,
        previousRif,
        previousRazonSocial,
      });
    } else if (changeTypes.length > 0) {
      cambiosList.push({
        assignmentKey: rec.assignmentKey,
        idCliente: rec.idCliente,
        razonSocial: rec.razonSocial,
        idVendedor: rec.idVendedor,
        vendedor: rec.vendedor,
        supervisor: rec.supervisor,
        rif: rec.rif,
        tipoCliente: rec.tipoCliente,
        changeTypes,
        previousVendedor,
        previousTipoCliente,
        previousRif,
        previousRazonSocial,
      });
    }
  }

  // Bajas lógicas: registros que estaban activos en Supabase y ya NO aparecen en la Maestra Excel
  const excelRouteClientSet = new Set(parsed.records.map((r) => r.routeAssignmentKey));
  const bajasLogicasList: MaestraBajaRecord[] = [];

  for (const r of activeSupabaseRows) {
    const cid = normalizeClientId(r.cliente_codigo);
    const vRoute = sanitizeMaestraText(r.vendedor_nombre || r.vendedor_id).toUpperCase();
    if (!cid) continue;
    const rcKey = buildRouteClientKey(vRoute, cid);
    if (!excelRouteClientSet.has(rcKey) && !matchedSupaKeys.has(rcKey)) {
      const hierarchy = resolveMaestraSellerHierarchy(vRoute);
      const hadPurchases =
        Boolean(r.has_aceite) ||
        Boolean(r.has_azucar) ||
        Boolean(r.has_pollo) ||
        Boolean(r.has_estandar_asturias) ||
        Boolean(r.has_mortadela_salpicao) ||
        (Number(r.cajas_aceite) || 0) > 0 ||
        (Number(r.cajas_azucar) || 0) > 0 ||
        (Number(r.cajas_pollo) || 0) > 0 ||
        (Number(r.cajas_estandar_asturias) || 0) > 0 ||
        (Number(r.cajas_mortadela_salpicao) || 0) > 0;

      bajasLogicasList.push({
        dbRowId: r.id,
        idCliente: cid,
        razonSocial: sanitizeMaestraText(r.cliente_nombre),
        previousVendedor: vRoute,
        supervisor: hierarchy.supervisor,
        previousStatus: sanitizeMaestraText(r.status) || 'INACTIVO',
        hadPurchasesInPeriod: hadPurchases,
        activo: false,
      });
    }
  }

  // Construir filas detalladas para los 30 vendedores/rutas
  const sellerAuditRows: MaestraSellerAuditRow[] = parsed.sellerSummaries.map((s) => {
    const prevSupa = supaCountByVendorRoute.get(s.vendedor) || 0;
    const prevCarteraDirect = carteraCountByRouteOrCanonical.get(s.vendedor);
    const prevCartera =
      prevCarteraDirect !== undefined
        ? prevCarteraDirect
        : s.vendedor === s.canonicalSeller
        ? carteraCountByRouteOrCanonical.get(s.canonicalSeller) || 0
        : 0;

    const activadosConCompra = supaPurchasedCountByVendorRoute.get(s.vendedor) || 0;
    const pctActivacion =
      s.activeCount > 0
        ? Number(((Math.min(s.activeCount, activadosConCompra) / s.activeCount) * 100).toFixed(1))
        : 0;

    const topTipos = Object.entries(s.tiposBreakdown)
      .map(([tipo, count]) => ({ tipo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      idVendedor: s.idVendedor,
      vendedor: s.vendedor,
      canonicalSeller: s.canonicalSeller,
      supervisor: s.supervisor,
      zona: s.zona,
      previousSupabaseCount: prevSupa,
      previousCarteraCount: prevCartera,
      excelActiveCount: s.activeCount,
      deltaSupabase: s.activeCount - prevSupa,
      deltaCartera: s.activeCount - prevCartera,
      activadosConCompra,
      pctActivacion,
      pendingCount: s.pendingCount,
      sharedIdsCount: s.sharedIdsCount,
      topTipos,
      tiposBreakdown: s.tiposBreakdown,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    syncedAt,
    sourceFilename: parsed.sourceFilename,
    periodo,
    parseMetrics: {
      title: parsed.title,
      totalRowsBelowHeader: parsed.totalRowsBelowHeader,
      emptyRowsIgnored: parsed.emptyRowsIgnored,
      validActiveCount: parsed.validActiveCount,
      distinctClientIdsCount: parsed.distinctClientIdsCount,
      sellersCount: parsed.sellersCount,
      pendingCount: parsed.pendingRecords.length,
      duplicateIdsCount: parsed.duplicateIdGroups.length,
    },
    auditTotals: {
      previousSupabaseActiveCount: activeSupabaseRows.length,
      previousCarteraActiveCount: activeCarteraRows.length,
      newExcelActiveCount: parsed.validActiveCount,
      altasSupabaseCount,
      altasCarteraCount,
      cambiosVendedorRutaCount,
      cambiosTipoClienteCount,
      saneamientosTextoCount,
      bajasLogicasCount: bajasLogicasList.length,
      pendingRifTipoCount: parsed.pendingRecords.length,
      duplicateClientIdsCount: parsed.duplicateIdGroups.length,
    },
    sellerAuditRows,
    tipoAuditRows: parsed.tipoClienteSummaries,
    altasList,
    cambiosList,
    bajasLogicasList,
    pendingList: parsed.pendingRecords,
    duplicateIdGroups: parsed.duplicateIdGroups,
  };
}

/**
 * Divide un arreglo en lotes seguros para batch upsert en Supabase, deduplicando por llave
 * dentro de cada lote para prevenir errores Postgres "ON CONFLICT DO UPDATE cannot affect row a second time".
 */
export function chunkForBatchUpsert<T>(
  items: T[],
  keySelector: (item: T) => string,
  batchSize = 250
): T[][] {
  const safeSize = Math.max(1, batchSize);
  const deduplicatedMap = new Map<string, T>();
  for (const item of items) {
    deduplicatedMap.set(keySelector(item), item);
  }
  const uniqueItems = Array.from(deduplicatedMap.values());
  const chunks: T[][] = [];
  for (let i = 0; i < uniqueItems.length; i += safeSize) {
    chunks.push(uniqueItems.slice(i, i + safeSize));
  }
  return chunks;
}
