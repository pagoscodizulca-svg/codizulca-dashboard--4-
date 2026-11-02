import {
  InvoiceDocumentStatus,
  InvoiceStatusFilter,
  QuantityFilterScope,
  SalesItem,
  SalesTransaction,
} from './types';
import { getSellerMetadata, normalizeSellerName } from '../cuotas/sellerSupervisorMap';

export interface InvoiceSkuMatchInfo {
  hasMatch: boolean;
  matchedItems: SalesItem[];
  primarySkuCode: string;
  primarySkuName: string;
  skuQuantityBoxes: number;
  skuQuantityKgs: number;
  skuEffectiveQuantity: number;
  skuTotalAmount: number;
  badgeText: string;
}

export interface InvoiceAdvancedFilterParams {
  statusFilter: InvoiceStatusFilter;
  skuQuery: string;
  minQuantity: string | number;
  maxQuantity: string | number;
  quantityScope: QuantityFilterScope;
  searchTerm?: string;
  selectedSupervisor?: string;
  selectedSeller?: string;
  selectedMonths?: string[];
}

export interface FilteredInvoicesReactiveKPIs {
  issuedInvoicesCount: number;
  totalDocumentsCount: number;
  dvCount: number;
  voidedCount: number;
  totalInvoiceUnits: number;
  totalInvoiceKgs: number;
  totalInvoiceAmount: number;
  totalFA: number;
  totalDV: number;
  netTotal: number;
  returnRate: number;
  hasActiveSkuFilter: boolean;
  hasActiveQuantityFilter: boolean;
  skuUnitsTotal: number;
  skuBoxesTotal: number;
  skuKgsTotal: number;
  skuAmountTotal: number;
  matchedPrimarySkuLabel: string;
}

export interface FilteredInvoiceRowResult {
  transaction: SalesTransaction;
  status: InvoiceDocumentStatus;
  totalQuantity: number;
  skuMatch: InvoiceSkuMatchInfo | null;
}

/**
 * Normaliza texto de búsqueda o código SKU:
 * - Convierte a minúsculas
 * - Elimina tildes / diacríticos
 * - Recorta y colapsa espacios múltiples
 */
export function normalizeSkuSearchText(input?: string | number | null): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Parsea un límite numérico de cantidad (soporta enteros y decimales con punto o coma).
 * Devuelve null si está vacío o no es un número válido.
 */
export function parseQuantityBound(raw?: string | number | null): number | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim().replace(',', '.');
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Formatea el código SKU canónico de un renglón (ej. "SKU-28")
 */
export function formatItemSkuCode(item: Pick<SalesItem, 'id_articulo' | 'sku'>): string {
  if (item.sku && String(item.sku).trim()) {
    const clean = String(item.sku).trim().toUpperCase();
    return clean.startsWith('SKU-') ? clean : `SKU-${clean.replace(/^SKU\s*/i, '')}`;
  }
  if (item.id_articulo !== undefined && item.id_articulo !== null && Number(item.id_articulo) > 0) {
    return `SKU-${Number(item.id_articulo)}`;
  }
  return '';
}

/**
 * Obtiene la cantidad efectiva de un renglón de producto.
 * Prioriza cajas/unidades (`cajas`) y utiliza `kgs_lts` cuando el producto se factura exclusivamente por peso (`cajas === 0`).
 */
export function getItemEffectiveQuantity(item: Pick<SalesItem, 'cajas' | 'kgs_lts'>): number {
  const boxes = Math.abs(Number(item.cajas) || 0);
  if (boxes > 0) return Math.round(boxes * 100) / 100;
  const kgs = Math.abs(Number(item.kgs_lts) || 0);
  return Math.round(kgs * 100) / 100;
}

/**
 * Obtiene la cantidad total de productos de una factura completa.
 */
export function getInvoiceTotalQuantity(tx: Pick<SalesTransaction, 'boxes' | 'kgs_lts' | 'items'>): number {
  const boxes = Math.abs(Number(tx.boxes) || 0);
  if (boxes > 0) return Math.round(boxes * 100) / 100;
  if (Array.isArray(tx.items) && tx.items.length > 0) {
    const sumItems = tx.items.reduce((acc, it) => acc + getItemEffectiveQuantity(it), 0);
    if (sumItems > 0) return Math.round(sumItems * 100) / 100;
  }
  const kgs = Math.abs(Number(tx.kgs_lts) || 0);
  return Math.round(kgs * 100) / 100;
}

/**
 * Determina el estado oficial del documento:
 * - 'EMITIDA': Factura (tipo_doc === 'FA') con monto > 0 y cantidad > 0 (excluye facturas anuladas o en cero).
 * - 'ANULADA': Factura (tipo_doc === 'FA') con monto <= 0 o sin unidades facturadas.
 * - 'DEVOLUCION': Nota de devolución (tipo_doc === 'DV').
 */
export function resolveInvoiceStatus(
  tx: Pick<SalesTransaction, 'tipo_doc' | 'total' | 'boxes' | 'kgs_lts' | 'status'>
): InvoiceDocumentStatus {
  if (tx.status) return tx.status;
  if (tx.tipo_doc === 'DV') return 'DEVOLUCION';
  const total = Number(tx.total) || 0;
  const boxes = Number(tx.boxes) || 0;
  const kgs = Number(tx.kgs_lts) || 0;
  if (tx.tipo_doc === 'FA' && total > 0 && (boxes > 0 || kgs > 0)) {
    return 'EMITIDA';
  }
  return 'ANULADA';
}

/**
 * Evalúa si un renglón (`SalesItem`) coincide con la búsqueda de SKU (código SKU o descripción del producto).
 */
export function doesItemMatchSkuQuery(item: SalesItem, rawSkuQuery: string): boolean {
  const qNorm = normalizeSkuSearchText(rawSkuQuery);
  if (!qNorm) return true;

  // Ignorar renglones anulados en cero (0 cajas, 0 kgs y $0 monto)
  const hasVolumeOrAmount =
    Math.abs(Number(item.cajas) || 0) > 0 ||
    Math.abs(Number(item.kgs_lts) || 0) > 0 ||
    Math.abs(Number(item.monto) || 0) > 0;
  if (!hasVolumeOrAmount) return false;

  const skuCode = formatItemSkuCode(item);
  const skuNorm = normalizeSkuSearchText(skuCode); // ej. "sku-28"
  const idStr = item.id_articulo !== undefined && item.id_articulo !== null ? String(item.id_articulo).trim() : '';
  const articuloNorm = normalizeSkuSearchText(item.articulo);

  // Caso 1: El usuario escribió explícitamente el prefijo "sku-" o "sku " (ej. "sku-28", "sku 28", "sku28")
  const explicitSkuMatch = /^sku[-\s]*(\d+)$/i.exec(qNorm);
  if (explicitSkuMatch) {
    const targetId = explicitSkuMatch[1];
    return idStr === targetId || skuNorm === `sku-${targetId}`;
  }

  // Caso 2: El usuario escribió un número puro (ej. "28" o "1464")
  if (/^\d+$/.test(qNorm)) {
    if (idStr === qNorm || skuNorm === `sku-${qNorm}`) return true;
    if (idStr.includes(qNorm)) return true;
    return articuloNorm.includes(qNorm);
  }

  // Caso 3: Búsqueda inteligente por código parcial o múltiples tokens de la descripción del producto
  if (skuNorm.includes(qNorm) || articuloNorm.includes(qNorm)) {
    return true;
  }

  const tokens = qNorm.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const combined = `${skuNorm} ${articuloNorm}`;
    return tokens.every((tk) => combined.includes(tk));
  }

  return false;
}

/**
 * Calcula el resumen de coincidencia de un SKU dentro de una factura específica.
 */
export function getInvoiceSkuMatchSummary(
  tx: SalesTransaction,
  rawSkuQuery: string
): InvoiceSkuMatchInfo | null {
  const qNorm = normalizeSkuSearchText(rawSkuQuery);
  if (!qNorm) return null;

  const matchedItems = (tx.items || []).filter((item) => doesItemMatchSkuQuery(item, qNorm));
  if (matchedItems.length === 0) {
    return {
      hasMatch: false,
      matchedItems: [],
      primarySkuCode: '',
      primarySkuName: '',
      skuQuantityBoxes: 0,
      skuQuantityKgs: 0,
      skuEffectiveQuantity: 0,
      skuTotalAmount: 0,
      badgeText: '',
    };
  }

  let skuQuantityBoxes = 0;
  let skuQuantityKgs = 0;
  let skuEffectiveQuantity = 0;
  let skuTotalAmount = 0;

  for (const item of matchedItems) {
    skuQuantityBoxes += Math.abs(Number(item.cajas) || 0);
    skuQuantityKgs += Math.abs(Number(item.kgs_lts) || 0);
    skuEffectiveQuantity += getItemEffectiveQuantity(item);
    skuTotalAmount += Number(item.monto) || 0;
  }

  skuQuantityBoxes = Math.round(skuQuantityBoxes * 100) / 100;
  skuQuantityKgs = Math.round(skuQuantityKgs * 100) / 100;
  skuEffectiveQuantity = Math.round(skuEffectiveQuantity * 100) / 100;
  skuTotalAmount = Math.round(skuTotalAmount * 100) / 100;

  const first = matchedItems[0];
  const primarySkuCode = formatItemSkuCode(first) || 'SKU';
  const primarySkuName = first.articulo || tx.topProduct;
  const qtyFormatted = skuEffectiveQuantity.toLocaleString('es-VE', {
    maximumFractionDigits: 2,
  });

  return {
    hasMatch: true,
    matchedItems,
    primarySkuCode,
    primarySkuName,
    skuQuantityBoxes,
    skuQuantityKgs,
    skuEffectiveQuantity,
    skuTotalAmount,
    badgeText: `${primarySkuCode}: ${qtyFormatted} unds`,
  };
}

/**
 * Verifica si un valor numérico cumple el rango [min, max] (ambos inclusivos).
 */
export function isQuantityWithinBounds(
  value: number,
  minBound: number | null,
  maxBound: number | null
): boolean {
  if (minBound !== null && value < minBound) return false;
  if (maxBound !== null && value > maxBound) return false;
  return true;
}

/**
 * Motor principal de filtrado reactivo de Facturas Emitidas por Estado, SKU y Cantidad de Productos.
 */
export function filterAndSummarizeInvoices(
  transactions: SalesTransaction[],
  params: InvoiceAdvancedFilterParams
): {
  rows: FilteredInvoiceRowResult[];
  kpis: FilteredInvoicesReactiveKPIs;
} {
  const statusFilter = params.statusFilter || 'EMITIDAS';
  const normSku = normalizeSkuSearchText(params.skuQuery);
  const normSearch = normalizeSkuSearchText(params.searchTerm);
  const minBound = parseQuantityBound(params.minQuantity);
  const maxBound = parseQuantityBound(params.maxQuantity);
  const hasSkuFilter = Boolean(normSku);
  const hasQuantityFilter = minBound !== null || maxBound !== null;
  const quantityScope: QuantityFilterScope = params.quantityScope || 'sku';

  const supervisorFilter =
    params.selectedSupervisor && params.selectedSupervisor !== 'ALL'
      ? params.selectedSupervisor
      : null;
  const sellerFilter =
    params.selectedSeller && params.selectedSeller !== 'ALL'
      ? normalizeSellerName(params.selectedSeller)
      : null;
  const monthsSet =
    params.selectedMonths && params.selectedMonths.length > 0
      ? new Set(params.selectedMonths.map((m) => m.trim().toUpperCase()))
      : null;

  const matchedRows: FilteredInvoiceRowResult[] = [];

  let issuedInvoicesCount = 0;
  let dvCount = 0;
  let voidedCount = 0;
  let totalInvoiceUnits = 0;
  let totalInvoiceKgs = 0;
  let totalInvoiceAmount = 0;
  let totalFA = 0;
  let totalDV = 0;
  let skuUnitsTotal = 0;
  let skuBoxesTotal = 0;
  let skuKgsTotal = 0;
  let skuAmountTotal = 0;
  let matchedPrimarySkuLabel = '';

  for (const tx of transactions) {
    const docStatus = resolveInvoiceStatus(tx);

    // 1. Filtro de Estado (Por defecto: solo Facturas Emitidas válidas)
    if (statusFilter === 'EMITIDAS' && docStatus !== 'EMITIDA') continue;
    if (statusFilter === 'DV' && docStatus !== 'DEVOLUCION') continue;
    if (statusFilter === 'ANULADAS' && docStatus !== 'ANULADA') continue;
    if (statusFilter === 'ALL' && docStatus === 'ANULADA') continue;

    // 2. Filtro de Meses
    if (monthsSet && tx.mes && !monthsSet.has(tx.mes.trim().toUpperCase())) {
      continue;
    }

    // 3. Filtro de Supervisor y Vendedor
    const cleanSeller = normalizeSellerName(tx.seller || '');
    if (sellerFilter && cleanSeller !== sellerFilter) {
      continue;
    }
    if (supervisorFilter && getSellerMetadata(cleanSeller).supervisor !== supervisorFilter) {
      continue;
    }

    // 4. Búsqueda general por cliente, N° factura, vendedor o producto
    if (normSearch) {
      const invMatch = normalizeSkuSearchText(tx.invoice).includes(normSearch);
      const numMatch = String(tx.numero || '').includes(normSearch);
      const clientMatch = normalizeSkuSearchText(tx.client).includes(normSearch);
      const sellerMatch = normalizeSkuSearchText(tx.seller).includes(normSearch);
      const itemMatch = (tx.items || []).some(
        (it) =>
          normalizeSkuSearchText(it.articulo).includes(normSearch) ||
          normalizeSkuSearchText(formatItemSkuCode(it)).includes(normSearch)
      );
      if (!invMatch && !numMatch && !clientMatch && !sellerMatch && !itemMatch) {
        continue;
      }
    }

    // 5. Filtro por SKU
    const skuMatch = hasSkuFilter ? getInvoiceSkuMatchSummary(tx, normSku) : null;
    if (hasSkuFilter && (!skuMatch || !skuMatch.hasMatch)) {
      continue;
    }

    // 6. Filtro por Cantidad de Productos (Granular por SKU vs. Total de la Factura)
    const invoiceTotalQty = getInvoiceTotalQuantity(tx);
    if (hasQuantityFilter) {
      if (hasSkuFilter) {
        if (quantityScope === 'sku') {
          const skuQty = skuMatch ? skuMatch.skuEffectiveQuantity : 0;
          if (!isQuantityWithinBounds(skuQty, minBound, maxBound)) {
            continue;
          }
        } else {
          if (!isQuantityWithinBounds(invoiceTotalQty, minBound, maxBound)) {
            continue;
          }
        }
      } else {
        // Sin SKU escrito: si el modo es 'total' evalúa el total de la factura;
        // si el modo es 'sku' evalúa el total de la factura o que tenga algún renglón con esa cantidad.
        const totalMatches = isQuantityWithinBounds(invoiceTotalQty, minBound, maxBound);
        if (quantityScope === 'total') {
          if (!totalMatches) continue;
        } else {
          const anyItemMatches = (tx.items || []).some((it) => {
            const q = getItemEffectiveQuantity(it);
            return q > 0 && isQuantityWithinBounds(q, minBound, maxBound);
          });
          if (!totalMatches && !anyItemMatches) continue;
        }
      }
    }

    // Acumular KPIs reactivos de la selección filtrada
    matchedRows.push({
      transaction: tx,
      status: docStatus,
      totalQuantity: invoiceTotalQty,
      skuMatch,
    });

    if (docStatus === 'EMITIDA') {
      issuedInvoicesCount++;
      totalFA += Number(tx.total) || 0;
    } else if (docStatus === 'DEVOLUCION') {
      dvCount++;
      totalDV += Math.abs(Number(tx.total) || 0);
    } else {
      voidedCount++;
    }

    totalInvoiceUnits += invoiceTotalQty;
    totalInvoiceKgs += Number(tx.kgs_lts) || 0;
    totalInvoiceAmount += Number(tx.total) || 0;

    if (skuMatch && skuMatch.hasMatch) {
      skuUnitsTotal += skuMatch.skuEffectiveQuantity;
      skuBoxesTotal += skuMatch.skuQuantityBoxes;
      skuKgsTotal += skuMatch.skuQuantityKgs;
      skuAmountTotal += skuMatch.skuTotalAmount;
      if (!matchedPrimarySkuLabel && skuMatch.primarySkuCode) {
        matchedPrimarySkuLabel = `${skuMatch.primarySkuCode} — ${skuMatch.primarySkuName}`;
      }
    }
  }

  const netTotal = totalFA - totalDV;
  const returnRate = totalFA > 0 ? (totalDV / totalFA) * 100 : 0;

  return {
    rows: matchedRows,
    kpis: {
      issuedInvoicesCount,
      totalDocumentsCount: matchedRows.length,
      dvCount,
      voidedCount,
      totalInvoiceUnits: Math.round(totalInvoiceUnits * 100) / 100,
      totalInvoiceKgs: Math.round(totalInvoiceKgs * 100) / 100,
      totalInvoiceAmount: Math.round(totalInvoiceAmount * 100) / 100,
      totalFA: Math.round(totalFA * 100) / 100,
      totalDV: Math.round(totalDV * 100) / 100,
      netTotal: Math.round(netTotal * 100) / 100,
      returnRate: Math.round(returnRate * 100) / 100,
      hasActiveSkuFilter: hasSkuFilter,
      hasActiveQuantityFilter: hasQuantityFilter,
      skuUnitsTotal: Math.round(skuUnitsTotal * 100) / 100,
      skuBoxesTotal: Math.round(skuBoxesTotal * 100) / 100,
      skuKgsTotal: Math.round(skuKgsTotal * 100) / 100,
      skuAmountTotal: Math.round(skuAmountTotal * 100) / 100,
      matchedPrimarySkuLabel,
    },
  };
}
