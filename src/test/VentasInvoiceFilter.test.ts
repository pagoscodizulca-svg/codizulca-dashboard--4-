import { describe, expect, it } from 'vitest';
import {
  doesItemMatchSkuQuery,
  filterAndSummarizeInvoices,
  formatItemSkuCode,
  getInvoiceSkuMatchSummary,
  normalizeSkuSearchText,
  parseQuantityBound,
  resolveInvoiceStatus,
} from '../components/ventas/invoiceFilterUtils';
import { SalesTransaction } from '../components/ventas/types';

const mockTransactions: SalesTransaction[] = [
  {
    invoice: 'FA-291500',
    tipo_doc: 'FA',
    numero: 291500,
    date: 'OCTUBRE 2026',
    mes: 'OCTUBRE',
    ano: 2026,
    client: 'SUPERMERCADO EL SOL C.A.',
    seller: 'MARIA BRICEÑO',
    topProduct: 'CAJA DE HUEVOS 360 UNDS',
    topProductSku: 'SKU-28',
    itemsCount: 2,
    boxes: 55,
    kgs_lts: 750,
    total: 2450.5,
    items: [
      {
        id_articulo: 28,
        sku: 'SKU-28',
        articulo: 'CAJA DE HUEVOS 360 UNDS',
        cajas: 40,
        kgs_lts: 600,
        monto: 2000,
      },
      {
        id_articulo: 1464,
        sku: 'SKU-1464',
        articulo: 'MORTADELA ALIBAL ESPECIAL 1KG',
        cajas: 15,
        kgs_lts: 150,
        monto: 450.5,
      },
    ],
  },
  {
    invoice: 'FA-291501',
    tipo_doc: 'FA',
    numero: 291501,
    date: 'OCTUBRE 2026',
    mes: 'OCTUBRE',
    ano: 2026,
    client: 'PANADERIA LA ESTRELLA C.A.',
    seller: 'EDUARDO PIÑA',
    topProduct: 'JAMÓN DE PIERNA PLUMROSE',
    topProductSku: 'SKU-85',
    itemsCount: 2,
    boxes: 112.5,
    kgs_lts: 1125,
    total: 5120,
    items: [
      {
        id_articulo: 28,
        sku: 'SKU-28',
        articulo: 'CAJA DE HUEVOS 360 UNDS',
        cajas: 12.5,
        kgs_lts: 187.5,
        monto: 625,
      },
      {
        id_articulo: 85,
        sku: 'SKU-85',
        articulo: 'JAMÓN DE PIERNA PLUMROSE',
        cajas: 100,
        kgs_lts: 937.5,
        monto: 4495,
      },
    ],
  },
  {
    invoice: 'FA-291646',
    tipo_doc: 'FA',
    numero: 291646,
    date: 'OCTUBRE 2026',
    mes: 'OCTUBRE',
    ano: 2026,
    client: 'CLIENTE FACTURA ANULADA C.A.',
    seller: 'MARIA BRICEÑO',
    topProduct: 'CAJA DE HUEVOS 360 UNDS',
    topProductSku: 'SKU-28',
    itemsCount: 1,
    boxes: 0,
    kgs_lts: 0,
    total: 0,
    items: [
      {
        id_articulo: 28,
        sku: 'SKU-28',
        articulo: 'CAJA DE HUEVOS 360 UNDS',
        cajas: 0,
        kgs_lts: 0,
        monto: 0,
      },
    ],
  },
  {
    invoice: 'DV-021800',
    tipo_doc: 'DV',
    numero: 21800,
    date: 'OCTUBRE 2026',
    mes: 'OCTUBRE',
    ano: 2026,
    client: 'SUPERMERCADO EL SOL C.A.',
    seller: 'MARIA BRICEÑO',
    topProduct: 'CAJA DE HUEVOS 360 UNDS',
    topProductSku: 'SKU-28',
    itemsCount: 1,
    boxes: -5,
    kgs_lts: -75,
    total: -250,
    items: [
      {
        id_articulo: 28,
        sku: 'SKU-28',
        articulo: 'CAJA DE HUEVOS 360 UNDS',
        cajas: -5,
        kgs_lts: -75,
        monto: -250,
      },
    ],
  },
];

describe('Módulo de Ventas y Facturas — Motor de Filtrado por Estado, SKU y Cantidad', () => {
  it('1. clasifica correctamente facturas emitidas válidas y excluye anuladas en cero y devoluciones', () => {
    expect(resolveInvoiceStatus(mockTransactions[0])).toBe('EMITIDA');
    expect(resolveInvoiceStatus(mockTransactions[1])).toBe('EMITIDA');
    expect(resolveInvoiceStatus(mockTransactions[2])).toBe('ANULADA');
    expect(resolveInvoiceStatus(mockTransactions[3])).toBe('DEVOLUCION');

    const res = filterAndSummarizeInvoices(mockTransactions, {
      statusFilter: 'EMITIDAS',
      skuQuery: '',
      minQuantity: '',
      maxQuantity: '',
      quantityScope: 'sku',
    });

    expect(res.rows).toHaveLength(2);
    expect(res.kpis.issuedInvoicesCount).toBe(2);
    expect(res.rows.map((r) => r.transaction.invoice)).toEqual(['FA-291500', 'FA-291501']);
  });

  it('2. normaliza entrada de SKU ignorando mayúsculas, espacios extra y tildes', () => {
    expect(normalizeSkuSearchText('  SKU-28  ')).toBe('sku-28');
    expect(normalizeSkuSearchText('  Jamón   de   Pierna ')).toBe('jamon de pierna');
    expect(formatItemSkuCode({ id_articulo: 28 })).toBe('SKU-28');

    const itemJamon = mockTransactions[1].items[1];
    expect(doesItemMatchSkuQuery(itemJamon, '  JAMON PIERNA ')).toBe(true);
    expect(doesItemMatchSkuQuery(itemJamon, 'sku-85')).toBe(true);
    expect(doesItemMatchSkuQuery(itemJamon, '85')).toBe(true);
  });

  it('3. filtra por SKU y genera el badge exacto de unidades del SKU en la fila y los KPIs reactivos', () => {
    const res = filterAndSummarizeInvoices(mockTransactions, {
      statusFilter: 'EMITIDAS',
      skuQuery: '  sku-1464 ',
      minQuantity: '',
      maxQuantity: '',
      quantityScope: 'sku',
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].transaction.invoice).toBe('FA-291500');
    expect(res.rows[0].skuMatch?.badgeText).toBe('SKU-1464: 15 unds');
    expect(res.kpis.issuedInvoicesCount).toBe(1);
    expect(res.kpis.skuUnitsTotal).toBe(15);
    expect(res.kpis.totalInvoiceUnits).toBe(55);
    expect(res.kpis.skuAmountTotal).toBe(450.5);
    expect(res.kpis.totalInvoiceAmount).toBe(2450.5);
  });

  it('4. filtra por Cantidad del SKU filtrado (modo "sku") vs Cantidad total de la factura (modo "total") incluyendo decimales', () => {
    // Ambas facturas emitidas tienen SKU-28: FA-291500 tiene 40 unds de SKU-28 (55 total) y FA-291501 tiene 12.5 unds de SKU-28 (112.5 total)
    const skuScopeRes = filterAndSummarizeInvoices(mockTransactions, {
      statusFilter: 'EMITIDAS',
      skuQuery: 'SKU-28',
      minQuantity: '10',
      maxQuantity: '20',
      quantityScope: 'sku',
    });

    expect(skuScopeRes.rows).toHaveLength(1);
    expect(skuScopeRes.rows[0].transaction.invoice).toBe('FA-291501');
    expect(skuScopeRes.kpis.skuUnitsTotal).toBe(12.5);

    // Ahora evaluando Cantidad total de la factura con SKU-28 activo y rango [100, 150]
    const totalScopeRes = filterAndSummarizeInvoices(mockTransactions, {
      statusFilter: 'EMITIDAS',
      skuQuery: 'SKU-28',
      minQuantity: '100',
      maxQuantity: '150',
      quantityScope: 'total',
    });

    expect(totalScopeRes.rows).toHaveLength(1);
    expect(totalScopeRes.rows[0].transaction.invoice).toBe('FA-291501');
    expect(totalScopeRes.kpis.totalInvoiceUnits).toBe(112.5);
    expect(totalScopeRes.kpis.skuUnitsTotal).toBe(12.5);
  });

  it('5. filtra automáticamente por cantidad cuando no se ha escrito un SKU pero se ingresa un rango [Mín, Máx]', () => {
    const res = filterAndSummarizeInvoices(mockTransactions, {
      statusFilter: 'EMITIDAS',
      skuQuery: '',
      minQuantity: '50',
      maxQuantity: '60',
      quantityScope: 'sku',
    });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].transaction.invoice).toBe('FA-291500');
    expect(res.kpis.issuedInvoicesCount).toBe(1);
    expect(res.kpis.totalInvoiceUnits).toBe(55);
  });

  it('6. parseQuantityBound soporta enteros, decimales con punto o coma, el cero (0), y valores vacíos', () => {
    expect(parseQuantityBound('')).toBeNull();
    expect(parseQuantityBound('   ')).toBeNull();
    expect(parseQuantityBound('0')).toBe(0);
    expect(parseQuantityBound(0)).toBe(0);
    expect(parseQuantityBound('15')).toBe(15);
    expect(parseQuantityBound('12,5')).toBe(12.5);
    expect(parseQuantityBound('12.75')).toBe(12.75);
  });

  it('7. coincidencia exacta (===) para códigos numéricos/SKU- separados por comas y aislamiento estricto de renglones en modo "sku"', () => {
    const item28 = { id_articulo: 28, sku: 'SKU-28', articulo: 'HUEVOS DE CONSUMO', cajas: 10, kgs_lts: 150, monto: 500 };
    const item128 = { id_articulo: 128, sku: 'SKU-128', articulo: 'QUESO BLANCO LOTE 28', cajas: 5, kgs_lts: 50, monto: 250 };
    const item280 = { id_articulo: 280, sku: 'SKU-280', articulo: 'SALCHICHA POLACA', cajas: 8, kgs_lts: 80, monto: 300 };

    // Prohibido .includes() en códigos numéricos: "28" NO debe coincidir con 128 ni 280
    expect(doesItemMatchSkuQuery(item28, '28')).toBe(true);
    expect(doesItemMatchSkuQuery(item28, 'SKU-28')).toBe(true);
    expect(doesItemMatchSkuQuery(item128, '28')).toBe(false);
    expect(doesItemMatchSkuQuery(item280, '28')).toBe(false);

    // Múltiples tokens separados por coma
    expect(doesItemMatchSkuQuery(item28, 'SKU-28, 1464')).toBe(true);
    expect(doesItemMatchSkuQuery(item128, 'SKU-28, 1464')).toBe(false);
    expect(doesItemMatchSkuQuery(item128, 'SKU-28, QUESO')).toBe(true);

    // En modo 'sku', los renglones que no pertenecen al SKU filtrado se descartan de row.transaction.items
    const res = filterAndSummarizeInvoices(mockTransactions, {
      statusFilter: 'EMITIDAS',
      skuQuery: '28',
      minQuantity: '10',
      maxQuantity: '50',
      quantityScope: 'sku',
    });
    expect(res.rows).toHaveLength(2);
    for (const r of res.rows) {
      expect(r.transaction.items.every((it) => it.id_articulo === 28)).toBe(true);
    }
  });
});
