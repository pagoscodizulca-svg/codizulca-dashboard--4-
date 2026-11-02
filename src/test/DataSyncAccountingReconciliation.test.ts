import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  NOVEMBER_STRICT_CUTOFF_DATE,
  buildGoogleSheetRawExportUrl,
  getConfiguredGoogleSheetId,
  normalizeCatalogKey,
  normalizeSheetSellerOrSupervisorKey,
  parseCaracasLocalDate,
  parseClientesCatalogCsv,
  parseCuotasActivacionSheetMatrix,
  parseCuotasVolumenSheetMatrix,
  parseInventarioSheetMatrix,
  parseProductosCatalogCsv,
  parseStrictAccountingNumber,
  parseSupervisoresCatalogCsv,
  parseUsuariosCatalogCsv,
  parseVentasSheetCsv,
} from '../lib/googleSheetsMatrixParser';
import {
  clearCachedHistorySalesRows,
  getCachedHistorySalesRows,
  saveCachedHistorySalesRows,
} from '../lib/indexedDbSalesCache';
import {
  CONCURRENT_BATCH_LIMIT,
  HISTORY_SALES_END_DATE,
  HISTORY_SALES_START_DATE,
  HISTORY_SALES_TABLE,
  POSTGREST_PAGE_SIZE,
  fetchAllHistorySalesPaginatedFromSupabase,
  loadDetailedHistorySalesJanToOct2026,
} from '../lib/supabaseHistoryLoader';

describe('Data Sync & Accounting Reconciliation (Supabase history_sales + Google Sheets 8-Tab Matrix)', () => {
  beforeEach(async () => {
    await clearCachedHistorySalesRows();
  });

  describe('1. Numeric Cleaning & Caracas Local Date Parsing', () => {
    it('cleans thousand commas, percentages, dashes, and strictly preserves negative values (returns)', () => {
      expect(parseStrictAccountingNumber('2,760.00')).toBe(2760);
      expect(parseStrictAccountingNumber('82.50%')).toBe(82.5);
      expect(parseStrictAccountingNumber('-')).toBe(0);
      expect(parseStrictAccountingNumber(' - ')).toBe(0);
      expect(parseStrictAccountingNumber('')).toBe(0);
      expect(parseStrictAccountingNumber('-4')).toBe(-4);
      expect(parseStrictAccountingNumber('-104.00')).toBe(-104);
      expect(parseStrictAccountingNumber('-17.85')).toBe(-17.85);
      expect(parseStrictAccountingNumber('-1,250.75')).toBe(-1250.75);
      expect(parseStrictAccountingNumber('$-84.50')).toBe(-84.5);
    });

    it('parses YYYY-MM-DD in America/Caracas (UTC-04:00) without UTC day-1 rollback', () => {
      expect(parseCaracasLocalDate('2026-11-01 0:00:00')).toBe('2026-11-01');
      expect(parseCaracasLocalDate('2026-11-01T00:00:00')).toBe('2026-11-01');
      expect(parseCaracasLocalDate('2026-10-01 0:00:00')).toBe('2026-10-01');
      expect(parseCaracasLocalDate('01/11/2026')).toBe('2026-11-01');
    });

    it('normalizes catalog keys and collapses double spaces in seller/supervisor names', () => {
      expect(normalizeCatalogKey('  oscar ortiz-  la costa  ')).toBe('OSCAR ORTIZ- LA COSTA');
      expect(normalizeSheetSellerOrSupervisorKey('OSCAR ORTIZ-  LA COSTA')).toBe('OSCAR ORTIZ- LA COSTA');
      expect(normalizeSheetSellerOrSupervisorKey('JOHNATAN  GARCIA')).toBe('JOHNATAN SOTO');
    });

    it('reads Google Sheet ID from configuration and builds raw export URLs by tab GID', () => {
      const id = getConfiguredGoogleSheetId({ VITE_GOOGLE_SHEET_ID: 'TEST_SHEET_ID_123' });
      expect(id).toBe('TEST_SHEET_ID_123');
      const url = buildGoogleSheetRawExportUrl('Cuotas Volumen', 'TEST_SHEET_ID_123');
      expect(url).toBe('https://docs.google.com/spreadsheets/d/TEST_SHEET_ID_123/export?format=csv&gid=1575247832');
    });
  });

  describe('2. Strict Cutoff & Header Trimming on Pestaña Ventas (Noviembre 2026)', () => {
    it('strictly ignores any row with Fecha < 2026-11-01 and preserves negative returns and trimmed headers', () => {
      const sampleVentasCsv = [
        'Fecha,Id Cliente,Id Articulo,Vendedor,Cajas,Unidades,Kg,Monto,Costo,Utilidad,"% de utilidad "',
        '2026-10-01 0:00:00,J070133805,15,OSCAR ORTIZ- CORO,3,0,54.00,"2,760.00",2000.00,760.00,27.54%',
        '2026-10-31 0:00:00,J506684775,5,EDUARDO PIÑA,1,0,18.00,98.62,86.99,11.63,11.80%',
        '2026-11-01 0:00:00,J070133805,15,OSCAR ORTIZ-  LA COSTA,10,0,180.00,"2,760.00","2,200.00",560.00,20.29%',
        '2026-11-02 0:00:00,J309725407,5,MARIA BRICEÑO,-4,0,-72.00,-104.00,-86.15,-17.85,-17.16%',
      ].join('\n');

      const result = parseVentasSheetCsv(sampleVentasCsv, NOVEMBER_STRICT_CUTOFF_DATE);

      expect(result.totalRawDataRows).toBe(4);
      expect(result.ignoredBeforeCutoffCount).toBe(2);
      expect(result.acceptedFromCutoffCount).toBe(2);
      expect(result.rows).toHaveLength(2);

      const nov1 = result.rows[0];
      expect(nov1.fecha).toBe('2026-11-01');
      expect(nov1.vendedor).toBe('OSCAR ORTIZ- LA COSTA');
      expect(nov1.monto).toBe(2760);
      expect(nov1.costo).toBe(2200);
      expect(nov1.utilidad).toBe(560);
      expect(nov1.pctUtilidad).toBe(20.29);
      expect(nov1.tipoDoc).toBe('FA');

      const nov2Return = result.rows[1];
      expect(nov2Return.fecha).toBe('2026-11-02');
      expect(nov2Return.cajas).toBe(-4);
      expect(nov2Return.kg).toBe(-72);
      expect(nov2Return.monto).toBe(-104);
      expect(nov2Return.costo).toBe(-86.15);
      expect(nov2Return.utilidad).toBe(-17.85);
      expect(nov2Return.pctUtilidad).toBe(-17.16);
      expect(nov2Return.tipoDoc).toBe('DV');
    });
  });

  describe('3. Matrix Parsing of Double-Header & Catalog Tabs (8 Google Sheet Tabs)', () => {
    it('parses Cuotas Volumen (double header with forward-fill every 3 columns from C and preserves POLLO/AZUCAR/HUEVOS codes)', () => {
      const sampleCuotasVolumenCsv = [
        ',,ANGELICA MORENO,,,ADEL JARABA,,',
        'Cod,Articulo,CUOTA KG,VENTA KG,%,CUOTA,KG,%',
        '5,CHORIZO DE TERNERA X 3KG,65.24,"81.00",124.16%,47.20,72.00,152.53%',
        'POLLO,POLLO BENEFICIADO,88.68,-,0.00%,64.16,-,0.00%',
      ].join('\n');

      const parsed = parseCuotasVolumenSheetMatrix(sampleCuotasVolumenCsv);
      expect(parsed.sellersOrder).toEqual(['ANGELICA MORENO', 'ADEL JARABA']);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].cod).toBe('5');
      expect(parsed.items[0].byCanonicalSeller['ANGELICA MORENO']).toEqual({
        cuotaKg: 65.24,
        ventaKg: 81,
        cumplimientoPct: 124.16,
      });
      expect(parsed.items[1].cod).toBe('POLLO');
      expect(parsed.items[1].byCanonicalSeller['ADEL JARABA']).toEqual({
        cuotaKg: 64.16,
        ventaKg: 0,
        cumplimientoPct: 0,
      });
    });

    it('parses Cuotas de Activacion (double header with 5 categories in Row 1 and Meta/Activados pairs in Row 2)', () => {
      const sampleActivacionCsv = [
        ',,ACEITE,,AZUCAR,,POLLO,,ESTANDAR Y SUPERIOR ASTURIAS,,MORTADELA SALPICAO Y ASTURIAS,',
        'Vendedor,CARTERA,Meta Aceite,Activados,Meta Azucar,Activados,Meta Pollo,Activados,Meta Estandar y Superior,Activados,Meta Salpicao y Asturias,Activados',
        'OSCAR ORTIZ-  LA COSTA,34,10,8,10,5,17,3,17,12,24,19',
      ].join('\n');

      const parsed = parseCuotasActivacionSheetMatrix(sampleActivacionCsv);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].vendedorRaw).toBe('OSCAR ORTIZ- LA COSTA');
      expect(parsed.rows[0].cartera).toBe(34);
      expect(parsed.rows[0].categorias.aceite).toEqual({ meta: 10, activados: 8 });
      expect(parsed.rows[0].categorias.mortadelaSalpicaoAsturias).toEqual({ meta: 24, activados: 19 });
    });

    it('parses Inventario (double header with INICIAL, COMPRAS, AJUSTES, VENTAS, CUOTA blocks)', () => {
      const sampleInventarioCsv = [
        ',,,,INICIAL,,COMPRAS,,AJUSTES,,VENTAS,,CUOTA,',
        'Fecha,SKU,Producto,Mínimo,Cajas,Kg,Cajas,Kg,Cajas,Kg,Cajas,Kg,Cajas,Kg',
        '2026-10-01 0:00:00,5,CHORIZO DE TERNERA X 3KG,331.42,10,180.00,50,900.00,-2,-36.00,"1,546.50","2,835.50","2,209.49","4,050.00"',
      ].join('\n');

      const parsed = parseInventarioSheetMatrix(sampleInventarioCsv);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].fecha).toBe('2026-10-01');
      expect(parsed.rows[0].sku).toBe('5');
      expect(parsed.rows[0].minimo).toBe(331.42);
      expect(parsed.rows[0].inicial).toEqual({ cajas: 10, kg: 180 });
      expect(parsed.rows[0].ajustes).toEqual({ cajas: -2, kg: -36 });
      expect(parsed.rows[0].ventas).toEqual({ cajas: 1546.5, kg: 2835.5 });
      expect(parsed.rows[0].cuota).toEqual({ cajas: 2209.49, kg: 4050 });
    });

    it('parses Productos, Clientes, Supervisores, and Usuarios catalogs with trimmed headers and normalized keys', () => {
      const prodCsv = 'Cód. Producto,Producto,"Categoria "\n005,CHORIZO DE TERNERA X 3KG,EMBUTIDOS\n';
      const prodCatalog = parseProductosCatalogCsv(prodCsv);
      expect(prodCatalog.byCode.get('5')?.categoria).toBe('EMBUTIDOS');

      const cliCsv = 'Id Cliente,Cliente\nJ070133805,SUPERMERCADO NASA\n';
      const cliCatalog = parseClientesCatalogCsv(cliCsv);
      expect(cliCatalog.byCode.get('J070133805')?.cliente).toBe('SUPERMERCADO NASA');

      const supCsv = 'Vendedor,Supervisor\nOSCAR ORTIZ-  LA COSTA,CARLOS FUENMAYOR\n';
      const supCatalog = parseSupervisoresCatalogCsv(supCsv);
      expect(supCatalog.bySeller.get('OSCAR ORTIZ- LA COSTA')).toBe('CARLOS FUENMAYOR');

      const usrCsv = 'Usuario,Contraseña,Rol,Nombre\ngerencia@codizulca.com,1234,admin,GERENCIA\n';
      const usrCatalog = parseUsuariosCatalogCsv(usrCsv);
      expect(usrCatalog.rows).toHaveLength(1);
      expect(usrCatalog.rows[0].rol).toBe('ADMIN');
    });
  });

  describe('4. Supabase history_sales Concurrent Batched Paginated Loader & IndexedDB Cache', () => {
    it('fetches all rows from history_sales (2026-01-01..2026-10-31) using .select("*", { count: "exact" }) and .range(from, to) with 5 concurrent batches + IndexedDB cache', async () => {
      expect(HISTORY_SALES_TABLE).toBe('history_sales');
      expect(HISTORY_SALES_START_DATE).toBe('2026-01-01');
      expect(HISTORY_SALES_END_DATE).toBe('2026-10-31');
      expect(CONCURRENT_BATCH_LIMIT).toBe(5);
      expect(POSTGREST_PAGE_SIZE).toBe(1000);

      // Simulate 2,500 rows across 3 pages (0..999, 1000..1999, 2000..2499)
      const totalSimulatedRows = 2500;
      const allSimulatedRows = Array.from({ length: totalSimulatedRows }, (_, i) => ({
        id: i + 1,
        numero: i + 1,
        tipo_doc: 'FA',
        fecha: '2026-10-15',
        mes: 'OCTUBRE',
        ano: 2026,
        id_cliente: 'J070133805',
        cliente: 'CLIENTE DEMO',
        id_vendedor: 1,
        vendedor: 'OSCAR ORTIZ-  LA COSTA',
        id_articulo: '5',
        articulo: 'CHORIZO DE TERNERA X 3KG',
        cajas: 1,
        unidades: 0,
        kgs_lts: 18,
        monto: 100,
      }));

      const rangeCalls: Array<[number, number]> = [];
      const mockClient = {
        from: vi.fn((tableName: string) => {
          expect(tableName).toBe('history_sales');
          let isHeadCount = false;
          const builder: any = {
            select: vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.count === 'exact' && opts?.head === true) {
                isHeadCount = true;
              }
              return builder;
            }),
            gte: vi.fn((col: string, val: string) => {
              expect(col).toBe('fecha');
              expect(val).toBe('2026-01-01');
              return builder;
            }),
            lte: vi.fn((col: string, val: string) => {
              expect(col).toBe('fecha');
              expect(val).toBe('2026-10-31');
              if (isHeadCount) {
                return Promise.resolve({
                  data: null,
                  count: totalSimulatedRows,
                  error: null,
                });
              }
              return builder;
            }),
            order: vi.fn((col: string, opts: { ascending: boolean }) => {
              expect(col).toBe('id');
              expect(opts.ascending).toBe(true);
              return builder;
            }),
            range: vi.fn(async (from: number, to: number) => {
              rangeCalls.push([from, to]);
              return {
                data: allSimulatedRows.slice(from, to + 1),
                error: null,
              };
            }),
          };
          return builder;
        }),
      };

      const fetched = await fetchAllHistorySalesPaginatedFromSupabase({
        supabaseClient: mockClient as any,
        pageSize: 1000,
        concurrency: 5,
      });

      expect(fetched).toHaveLength(2500);
      expect(rangeCalls).toEqual([
        [0, 999],
        [1000, 1999],
        [2000, 2999],
      ]);
      expect(fetched[0].id).toBe(1);
      expect(fetched[2499].id).toBe(2500);

      // Save to IndexedDB cache and verify instant cache hit on subsequent load
      await saveCachedHistorySalesRows(fetched);
      const cachedPayload = await getCachedHistorySalesRows();
      expect(cachedPayload).not.toBeNull();
      expect(cachedPayload?.totalRows).toBe(2500);

      const loadedFromCache = await loadDetailedHistorySalesJanToOct2026({
        forceRefresh: false,
      });
      expect(loadedFromCache.fromCache).toBe(true);
      expect(loadedFromCache.source).toBe('indexeddb');
      expect(loadedFromCache.rows).toHaveLength(2500);
      expect(loadedFromCache.rows[0].vendedor).toBe('OSCAR ORTIZ- LA COSTA');
    });
  });
});
