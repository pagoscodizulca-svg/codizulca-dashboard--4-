import {
  ACTIVATION_CATEGORY_SKU_GROUPS,
  RUBROS_ACTIVACION_CLIENTES,
  RubroClienteCodigo,
} from '../components/cuotas/cuotasData';
import { PRODUCT_CATALOG_BY_SKU } from '../data/productCatalog';

export interface ClientRubroSalesSummary {
  clientCode: string;
  totalNetVolume: number;
  totalNetAmount: number;
  rubroNetVolume: Record<RubroClienteCodigo, number>;
  activeRubros: Set<RubroClienteCodigo>;
  orphanSkuCount: number;
}

export interface ClientActivationLike {
  id: string;
  nombre?: string;
  rif?: string;
  vendedor?: string;
  vendedorNombre?: string;
  supervisor?: string;
  rutaCodigo?: string;
  canal?: string;
  status?: 'ACTIVO' | 'INACTIVO' | 'BAJA_MAESTRA' | string;
  activo?: boolean;
  totalCajas?: number;
  cats?: Record<RubroClienteCodigo, boolean>;
  cajas?: Record<RubroClienteCodigo, number>;
}

/**
 * Normaliza un código de producto/SKU eliminando espacios, prefijos '#'
 * y ceros a la izquierda ('001543' -> '1543').
 */
export function normalizeSkuCode(rawSku: unknown): string {
  if (rawSku === null || rawSku === undefined) return '';
  const cleaned = String(rawSku)
    .trim()
    .replace(/^[#\s]+/, '')
    .split('#')[0]
    .trim();
  if (!cleaned) return '';
  const stripped = cleaned.replace(/^0+(?=\d)/, '');
  return stripped.toUpperCase();
}

/**
 * Normaliza un código de cliente eliminando espacios, prefijos '#',
 * sufijos compuestos '#vendedor' y ceros a la izquierda ('#000329#12' -> '329').
 */
export function normalizeClientCode(rawClient: unknown): string {
  if (rawClient === null || rawClient === undefined) return '';
  const cleaned = String(rawClient)
    .trim()
    .replace(/^[#\s]+/, '')
    .split('#')[0]
    .trim();
  if (!cleaned) return '';
  const stripped = cleaned.replace(/^0+(?=\d)/, '');
  return stripped.toUpperCase();
}

/**
 * Normaliza texto eliminando acentos/diacríticos, espacios múltiples y pasando a mayúsculas.
 */
export function normalizeRubroText(rawText: unknown): string {
  if (rawText === null || rawText === undefined) return '';
  return String(rawText)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Clasifica semánticamente la descripción de un artículo hacia uno de los 5 rubros foco,
 * o devuelve null si pertenece a otra categoría (ej. café, caraotas, papel, aceite, etc.).
 */
function classifyDescriptionSemantic(rawDescription: unknown): RubroClienteCodigo | null {
  const desc = normalizeRubroText(rawDescription);
  if (!desc) return null;

  // 1. AZUCAR
  if (desc.includes('AZUCAR')) {
    return 'AZUCAR';
  }

  // 2. LECHE VENCAMPO (exclusivamente leche en polvo de la marca Vencampo)
  if (desc.includes('LECHE') && desc.includes('VENCAMPO')) {
    return 'LECHE_VENCAMPO';
  }

  // 3. ESTANDAR Y SUPERIOR ASTURIAS (Mortadela Estándar o Superior marca Asturias)
  if (
    desc.includes('ASTURIAS') &&
    (desc.includes('ESTANDAR') || desc.includes('SUPERIOR')) &&
    (desc.includes('MORT') || desc.includes('JAMON'))
  ) {
    return 'ESTANDAR_SUPERIOR_ASTURIAS';
  }

  // 4. MORTADELA SALPICAO Y ASTURIAS (Resto de mortadelas Asturias o Salpicao)
  if (
    (desc.includes('MORTADELA') || desc.includes('MORT.') || desc.includes('MORT ')) &&
    (desc.includes('ASTURIAS') || desc.includes('SALPICAO'))
  ) {
    return 'MORTADELA_SALPICAO_ASTURIAS';
  }

  // 5. POLLO entero congelado (Pollo Vencampo / Pollo Llanerito, excluyendo mortadelas/despresados fuera de foco)
  if (
    desc.includes('POLLO VENCAMPO') ||
    desc.includes('POLLO LLANERITO')
  ) {
    return 'POLLO';
  }

  return null;
}

/**
 * Índice maestro en memoria O(1): SKU normalizado -> RubroClienteCodigo
 */
const SKU_TO_RUBRO_MAP: Map<string, RubroClienteCodigo> = (() => {
  const map = new Map<string, RubroClienteCodigo>();

  // 1. Cargar grupos explícitos de ACTIVATION_CATEGORY_SKU_GROUPS
  for (const rubro of RUBROS_ACTIVACION_CLIENTES) {
    const skus = ACTIVATION_CATEGORY_SKU_GROUPS[rubro] || [];
    for (const rawSku of skus) {
      const norm = normalizeSkuCode(rawSku);
      if (norm) {
        map.set(norm, rubro);
      }
    }
  }

  // 2. Clasificar también cualquier SKU del catálogo maestro cuya descripción pertenezca al rubro
  for (const [rawSku, description] of Object.entries(PRODUCT_CATALOG_BY_SKU)) {
    const norm = normalizeSkuCode(rawSku);
    if (!norm || map.has(norm)) continue;
    const semanticRubro = classifyDescriptionSemantic(description);
    if (semanticRubro) {
      map.set(norm, semanticRubro);
    }
  }

  return map;
})();

/**
 * Clasifica un producto (por código SKU y/o descripción) dentro de uno de los 5 rubros foco.
 * Si el producto es un "producto huérfano" (no existe en el catálogo o pertenece a otro rubro),
 * retorna `null` de forma segura sin arrojar excepciones.
 */
export function classifyProductRubro(
  rawSku: unknown,
  rawDescription?: unknown
): RubroClienteCodigo | null {
  const normSku = normalizeSkuCode(rawSku);
  if (normSku) {
    const bySku = SKU_TO_RUBRO_MAP.get(normSku);
    if (bySku) return bySku;

    const catalogDesc = PRODUCT_CATALOG_BY_SKU[normSku];
    if (catalogDesc) {
      const byCatalogDesc = classifyDescriptionSemantic(catalogDesc);
      if (byCatalogDesc) return byCatalogDesc;
    }
  }

  if (rawDescription) {
    // Permitir coincidencia directa por código o etiqueta de rubro
    const normDesc = normalizeRubroText(rawDescription);
    if (normDesc === 'AZUCAR') return 'AZUCAR';
    if (normDesc === 'LECHE_VENCAMPO' || normDesc === 'LECHE VENCAMPO') return 'LECHE_VENCAMPO';
    if (normDesc === 'POLLO') return 'POLLO';
    if (
      normDesc === 'ESTANDAR_SUPERIOR_ASTURIAS' ||
      normDesc === 'ESTANDAR Y SUPERIOR ASTURIAS'
    ) {
      return 'ESTANDAR_SUPERIOR_ASTURIAS';
    }
    if (
      normDesc === 'MORTADELA_SALPICAO_ASTURIAS' ||
      normDesc === 'MORTADELA SALPICAO Y ASTURIAS'
    ) {
      return 'MORTADELA_SALPICAO_ASTURIAS';
    }

    return classifyDescriptionSemantic(rawDescription);
  }

  return null;
}

function createEmptyRubroVolumeMap(): Record<RubroClienteCodigo, number> {
  return {
    AZUCAR: 0,
    LECHE_VENCAMPO: 0,
    POLLO: 0,
    ESTANDAR_SUPERIOR_ASTURIAS: 0,
    MORTADELA_SALPICAO_ASTURIAS: 0,
  };
}

function extractSignedRowVolume(row: any): { volume: number; amount: number } {
  if (!row || typeof row !== 'object') return { volume: 0, amount: 0 };

  const rawTipoDoc = normalizeRubroText(row.tipo_doc || row.tipoDoc || '');
  const isReturn = rawTipoDoc === 'DV' || rawTipoDoc === 'NC' || rawTipoDoc.includes('DEV');

  const rawCajas = Number(row.cajas ?? row.total_cajas ?? 0);
  const rawKgs = Number(row.kgs_lts ?? row.kgs ?? 0);
  const rawUnidades = Number(row.unidades ?? row.cantidad ?? 0);
  const rawMonto = Number(row.monto ?? row.monto_neto ?? row.total_renglon ?? 0);

  let baseVol = 0;
  if (Number.isFinite(rawCajas) && rawCajas !== 0) {
    baseVol = rawCajas;
  } else if (Number.isFinite(rawKgs) && rawKgs !== 0) {
    baseVol = rawKgs;
  } else if (Number.isFinite(rawUnidades) && rawUnidades !== 0) {
    baseVol = rawUnidades;
  } else if (Number.isFinite(rawMonto) && rawMonto !== 0) {
    baseVol = rawMonto;
  }

  let baseAmt = Number.isFinite(rawMonto) ? rawMonto : 0;

  // Si el documento es devolución y el número venía positivo, aplicar signo negativo
  if (isReturn && baseVol > 0) baseVol = -baseVol;
  if (isReturn && baseAmt > 0) baseAmt = -baseAmt;

  return { volume: baseVol, amount: baseAmt };
}

/**
 * Construye un índice relacional O(1) por código de cliente normalizado a partir de:
 * 1) Filas de transacciones (`october_sales_rows.json` o `history_sales`), y
 * 2) Cachés históricos por artículo (`cache_product_clients/*.json`) como respaldo complementario.
 */
export function buildClientRubroSalesIndex(
  salesRows: any[] = [],
  productClientCaches: Array<{ id_articulo?: unknown; articulo?: unknown; clients?: any[] }> = []
): Map<string, ClientRubroSalesSummary> {
  const index = new Map<string, ClientRubroSalesSummary>();

  const ensureEntry = (clientCode: string): ClientRubroSalesSummary => {
    let entry = index.get(clientCode);
    if (!entry) {
      entry = {
        clientCode,
        totalNetVolume: 0,
        totalNetAmount: 0,
        rubroNetVolume: createEmptyRubroVolumeMap(),
        activeRubros: new Set<RubroClienteCodigo>(),
        orphanSkuCount: 0,
      };
      index.set(clientCode, entry);
    }
    return entry;
  };

  // 1. Procesar transacciones directas (FA / DV) con neteo por cliente y rubro
  if (Array.isArray(salesRows)) {
    for (const row of salesRows) {
      if (!row || typeof row !== 'object') continue;
      const clientCode = normalizeClientCode(
        row.id_cliente ?? row.cliente_codigo ?? row.cod_cliente ?? row.id
      );
      if (!clientCode) continue;

      const { volume, amount } = extractSignedRowVolume(row);
      if (volume === 0 && amount === 0) continue;

      const entry = ensureEntry(clientCode);
      entry.totalNetVolume += volume;
      entry.totalNetAmount += amount;

      const rubro = classifyProductRubro(
        row.id_articulo ?? row.sku ?? row.codigo_articulo ?? row.codigo,
        row.articulo ?? row.descripcion ?? row.producto ?? row.rubro
      );

      if (rubro) {
        entry.rubroNetVolume[rubro] += volume !== 0 ? volume : amount;
      } else {
        entry.orphanSkuCount += 1;
      }
    }
  }

  // 2. Procesar cachés por producto (`cache_product_clients/*.json`) como respaldo
  if (Array.isArray(productClientCaches)) {
    for (const prodCache of productClientCaches) {
      if (!prodCache || typeof prodCache !== 'object') continue;
      const rubro = classifyProductRubro(prodCache.id_articulo, prodCache.articulo);
      if (!rubro || !Array.isArray(prodCache.clients)) continue;

      for (const cl of prodCache.clients) {
        if (!cl || typeof cl !== 'object') continue;
        const clientCode = normalizeClientCode(cl.id_cliente ?? cl.id);
        if (!clientCode) continue;

        const oct = cl.months?.OCTUBRE;
        const rawVol = oct
          ? Number(oct.cajas || oct.kgs || oct.monto || 0)
          : Number(cl.cajas || cl.kgs || cl.monto || 0);

        if (!Number.isFinite(rawVol) || rawVol <= 0) continue;

        const entry = ensureEntry(clientCode);
        if (entry.rubroNetVolume[rubro] <= 0) {
          entry.rubroNetVolume[rubro] = rawVol;
        }
        if (entry.totalNetVolume <= 0) {
          entry.totalNetVolume += rawVol;
        }
      }
    }
  }

  // 3. Consolidar activeRubros únicamente donde el balance neto sea estrictamente > 0
  for (const entry of index.values()) {
    entry.totalNetVolume = Number(entry.totalNetVolume.toFixed(2));
    entry.totalNetAmount = Number(entry.totalNetAmount.toFixed(2));
    for (const rubro of RUBROS_ACTIVACION_CLIENTES) {
      const net = Number((entry.rubroNetVolume[rubro] || 0).toFixed(2));
      entry.rubroNetVolume[rubro] = net > 0 ? net : 0;
      if (net > 0) {
        entry.activeRubros.add(rubro);
      } else {
        entry.activeRubros.delete(rubro);
      }
    }
  }

  return index;
}

/**
 * Evalúa de forma resiliente si un cliente tiene activado un rubro específico,
 * verificando tanto la bandera booleana `cats[rubro]` como el volumen `cajas[rubro] > 0`.
 */
export function isClientRubroActive(
  client:
    | {
        cats?: Partial<Record<RubroClienteCodigo, boolean>> | null;
        cajas?: Partial<Record<RubroClienteCodigo, number>> | null;
      }
    | null
    | undefined,
  rubro: RubroClienteCodigo
): boolean {
  if (!client) return false;
  if (Boolean(client.cats?.[rubro])) return true;
  const cajas = Number(client.cajas?.[rubro] ?? 0);
  return Number.isFinite(cajas) && cajas > 0;
}

/**
 * Cruza de manera inmutable la cartera de clientes contra el índice de ventas normalizado,
 * sincronizando `cats`, `cajas`, `totalCajas` y `status`.
 */
export function enrichClientActivationsWithSales<T extends ClientActivationLike>(
  clients: T[],
  salesIndex: Map<string, ClientRubroSalesSummary>
): T[] {
  if (!Array.isArray(clients) || clients.length === 0) return [];

  return clients.map((client) => {
    const clientCode = normalizeClientCode(client.id);
    const salesSummary = clientCode ? salesIndex.get(clientCode) : undefined;
    const isBaja = client.status === 'BAJA_MAESTRA' || client.activo === false;

    const nextCats: Record<string, boolean> = {
      ...(client.cats || {}),
      AZUCAR: isClientRubroActive(client, 'AZUCAR'),
      LECHE_VENCAMPO: isClientRubroActive(client, 'LECHE_VENCAMPO'),
      POLLO: isClientRubroActive(client, 'POLLO'),
      ESTANDAR_SUPERIOR_ASTURIAS: isClientRubroActive(client, 'ESTANDAR_SUPERIOR_ASTURIAS'),
      MORTADELA_SALPICAO_ASTURIAS: isClientRubroActive(client, 'MORTADELA_SALPICAO_ASTURIAS'),
    };

    const nextCajas: Record<string, number> = {
      ...(client.cajas || {}),
      AZUCAR: Math.max(0, Number(client.cajas?.AZUCAR || 0)),
      LECHE_VENCAMPO: Math.max(0, Number(client.cajas?.LECHE_VENCAMPO || 0)),
      POLLO: Math.max(0, Number(client.cajas?.POLLO || 0)),
      ESTANDAR_SUPERIOR_ASTURIAS: Math.max(
        0,
        Number(client.cajas?.ESTANDAR_SUPERIOR_ASTURIAS || 0)
      ),
      MORTADELA_SALPICAO_ASTURIAS: Math.max(
        0,
        Number(client.cajas?.MORTADELA_SALPICAO_ASTURIAS || 0)
      ),
    };

    if (!isBaja && salesSummary) {
      for (const rubro of RUBROS_ACTIVACION_CLIENTES) {
        const salesVol = salesSummary.rubroNetVolume[rubro] || 0;
        if (salesSummary.activeRubros.has(rubro) || salesVol > 0) {
          nextCats[rubro] = true;
          nextCajas[rubro] = Number(Math.max(nextCajas[rubro], salesVol).toFixed(2));
        }
      }
    }

    if ('JAMON_ASTURIAS' in nextCats) {
      nextCats.JAMON_ASTURIAS = nextCats.ESTANDAR_SUPERIOR_ASTURIAS;
    }
    if ('MORTADELA_ASTURIAS' in nextCats) {
      nextCats.MORTADELA_ASTURIAS = nextCats.MORTADELA_SALPICAO_ASTURIAS;
    }
    if ('SALPICAO' in nextCats) {
      nextCats.SALPICAO = nextCats.MORTADELA_SALPICAO_ASTURIAS;
    }
    if ('JAMON_ASTURIAS' in nextCajas) {
      nextCajas.JAMON_ASTURIAS = nextCajas.ESTANDAR_SUPERIOR_ASTURIAS;
    }
    if ('MORTADELA_ASTURIAS' in nextCajas) {
      nextCajas.MORTADELA_ASTURIAS = nextCajas.MORTADELA_SALPICAO_ASTURIAS;
    }
    if ('SALPICAO' in nextCajas) {
      nextCajas.SALPICAO = nextCajas.MORTADELA_SALPICAO_ASTURIAS;
    }

    const sumRubroCajas = RUBROS_ACTIVACION_CLIENTES.reduce(
      (acc, r) => acc + (nextCajas[r] || 0),
      0
    );
    const hasAnyActiveRubro = RUBROS_ACTIVACION_CLIENTES.some((r) => nextCats[r]);
    const hasPositiveSales =
      Boolean(salesSummary && (salesSummary.totalNetVolume > 0 || salesSummary.totalNetAmount > 0));

    const prevTotalCajas = Math.max(0, Number(client.totalCajas || 0));
    const nextTotalCajas = Number(
      Math.max(
        prevTotalCajas,
        sumRubroCajas,
        salesSummary?.totalNetVolume && salesSummary.totalNetVolume > 0
          ? salesSummary.totalNetVolume
          : 0
      ).toFixed(2)
    );

    const nextStatus = isBaja
      ? 'BAJA_MAESTRA'
      : client.status === 'ACTIVO' || hasAnyActiveRubro || hasPositiveSales || nextTotalCajas > 0
        ? 'ACTIVO'
        : 'INACTIVO';

    return {
      ...client,
      status: nextStatus,
      totalCajas: nextTotalCajas,
      cats: nextCats as Record<RubroClienteCodigo, boolean>,
      cajas: nextCajas as Record<RubroClienteCodigo, number>,
    };
  });
}

/**
 * Sanitiza texto para celdas de jsPDF / autoTable evitando glifos corruptos.
 */
export function sanitizePdfCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construye la fila exacta de celdas para la tabla del reporte PDF de Activación de Clientes.
 */
export function buildPdfClientRowCells(client: ClientActivationLike, index: number): string[] {
  const rubroMarks = RUBROS_ACTIVACION_CLIENTES.map((code) =>
    isClientRubroActive(client, code) ? 'SI' : '-'
  );
  const activeCount = rubroMarks.filter((v) => v === 'SI').length;
  const isClientActive =
    client.status === 'ACTIVO' || activeCount > 0 || Number(client.totalCajas || 0) > 0;

  return [
    String(index + 1),
    sanitizePdfCellText(client.id ? `#${String(client.id).replace(/^#/, '')}` : '-'),
    sanitizePdfCellText(client.nombre || '-'),
    sanitizePdfCellText(client.rif || '-'),
    sanitizePdfCellText(client.vendedorNombre || client.vendedor || '-'),
    isClientActive ? 'ACTIVO' : 'SIN COMPRA',
    ...rubroMarks,
    `${activeCount}/5`,
  ];
}
