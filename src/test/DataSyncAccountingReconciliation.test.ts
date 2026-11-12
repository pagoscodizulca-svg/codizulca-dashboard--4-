import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  ALLOWED_GOOGLE_SHEET_TABS,
  DisallowedSheetTabError,
  NOVEMBER_STRICT_CUTOFF_DATE,
  assertAllowedSheetTab,
  buildGoogleSheetRawExportUrl,
  forwardFillRow,
  getConfiguredGoogleSheetId,
  normalizeCatalogKey,
  normalizeSheetSellerOrSupervisorKey,
  parseCaracasLocalDate,
  parseClientesCatalogCsv,
  parseCuotasActivacionSheetMatrix,
  parseCuotasVolumenSheetMatrix,
  parseProductosCatalogCsv,
  parseSheetDate,
  parseSheetNumber,
  parseStrictAccountingNumber,
  parseSupervisoresCatalogCsv,
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
  calculateOctober2026SummaryFromRows,
  fetchAllHistorySalesPaginatedFromSupabase,
  fetchHistorialOctubre2026,
  filterStrictNovember2026Rows,
  isGarbageHistorySalesRow,
  isStrictNovember2026Date,
  loadDetailedHistorySalesJanToOct2026,
} from '../lib/supabaseHistoryLoader';
import {
  OCTOBER_2026_CONTROL_TOTALS,
  cleanNumericValue,
  parseMonthlySalesCsvContent,
  uploadMonthlySalesToSupabaseInBatches,
  validateMonthlyCsvControlTotals,
} from '../lib/monthlySalesCsvImporter';

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

    it('reads Google Sheet ID exclusively from server GOOGLE_SHEET_ID and builds raw export URLs by tab GID', () => {
      const id = getConfiguredGoogleSheetId({ GOOGLE_SHEET_ID: 'TEST_SHEET_ID_123' });
      expect(id).toBe('TEST_SHEET_ID_123');
      // Must ignore VITE_GOOGLE_SHEET_ID
      expect(getConfiguredGoogleSheetId({ VITE_GOOGLE_SHEET_ID: 'FORBIDDEN_CLIENT_ID' })).toBe('');
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

    it('enforces the strict 6-tab allowlist and blocks administrative tabs like Usuarios and Inventario', () => {
      expect(ALLOWED_GOOGLE_SHEET_TABS).toEqual([
        'Ventas',
        'Cuotas Volumen',
        'Cuotas de Activacion',
        'Productos',
        'Clientes',
        'Supervisores',
      ]);
      expect(() => assertAllowedSheetTab('Usuarios')).toThrow(DisallowedSheetTabError);
      expect(() => assertAllowedSheetTab('Inventario')).toThrow(DisallowedSheetTabError);
      expect(() => buildGoogleSheetRawExportUrl('Usuarios', 'TEST_SHEET_ID_123')).toThrow(
        DisallowedSheetTabError
      );
    });

    it('parses Productos, Clientes, and Supervisores catalogs with trimmed headers and normalized keys', () => {
      const prodCsv = 'Cód. Producto,Producto,"Categoria "\n005,CHORIZO DE TERNERA X 3KG,EMBUTIDOS\n';
      const prodCatalog = parseProductosCatalogCsv(prodCsv);
      expect(prodCatalog.byCode.get('5')?.categoria).toBe('EMBUTIDOS');

      const cliCsv = 'Id Cliente,Cliente\nJ070133805,SUPERMERCADO NASA\n';
      const cliCatalog = parseClientesCatalogCsv(cliCsv);
      expect(cliCatalog.byCode.get('J070133805')?.cliente).toBe('SUPERMERCADO NASA');

      const supCsv = 'Vendedor,Supervisor\nOSCAR ORTIZ-  LA COSTA,CARLOS FUENMAYOR\n';
      const supCatalog = parseSupervisoresCatalogCsv(supCsv);
      expect(supCatalog.bySeller.get('OSCAR ORTIZ- LA COSTA')).toBe('CARLOS FUENMAYOR');
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

    it('strictly isolates Noviembre 2026 (2026-11-01..2026-11-30) and computes exact Octubre 2026 closing via fetchHistorialOctubre2026', async () => {
      // 1. Validate strict November 2026 date normalization and filtering
      expect(isStrictNovember2026Date('2026-11-01')).toBe(true);
      expect(isStrictNovember2026Date('2026-11-02 0:00:00')).toBe(true);
      expect(isStrictNovember2026Date('15/11/2026')).toBe(true);
      expect(isStrictNovember2026Date('2026-10-31')).toBe(false);
      expect(isStrictNovember2026Date('31/10/2026')).toBe(false);

      const mixedRows = [
        { fecha: '2026-10-31', monto: 5000 },
        { fecha: '02/11/2026', monto: 1200 },
        { fecha: '2026-11-03 0:00:00', monto: 800 },
      ];
      const novOnly = filterStrictNovember2026Rows(mixedRows);
      expect(novOnly).toHaveLength(2);
      expect(novOnly.map((r) => r.fecha)).toEqual(['2026-11-02', '2026-11-03']);

      // 2. Validate calculateOctober2026SummaryFromRows & fetchHistorialOctubre2026
      const sampleHistoryRows: any[] = [
        {
          id: 1,
          tipo_doc: 'FA',
          fecha: '2026-10-10',
          mes: 'OCTUBRE',
          ano: 2026,
          id_cliente: '100',
          cliente: 'CLIENTE A',
          vendedor: 'ELISA SOLER',
          id_articulo: '1478',
          articulo: 'MORTADELA ESPECIAL TAPARA 1KG',
          cajas: 100,
          unidades: 1000,
          kgs_lts: 1000,
          monto: 2000,
          costo: 1500,
          utilidad: 500,
          pct_utilidad: 25,
          source: 'supabase_history_sales',
        },
        {
          id: 2,
          tipo_doc: 'DV',
          fecha: '2026-10-15',
          mes: 'OCTUBRE',
          ano: 2026,
          id_cliente: '101',
          cliente: 'CLIENTE B',
          vendedor: 'ELISA SOLER',
          id_articulo: '28',
          articulo: 'HUEVOS',
          cajas: -10,
          unidades: -120,
          kgs_lts: -200,
          monto: -400,
          costo: -300,
          utilidad: -100,
          pct_utilidad: 25,
          source: 'supabase_history_sales',
        },
        {
          id: 3,
          tipo_doc: 'FA',
          fecha: '2026-11-02',
          mes: 'NOVIEMBRE',
          ano: 2026,
          id_cliente: '186',
          cliente: 'CLIENTE C',
          vendedor: 'ELISA SOLER',
          id_articulo: '28',
          articulo: 'HUEVOS',
          cajas: 50,
          unidades: 600,
          kgs_lts: 1140,
          monto: 3000,
          costo: 2802.03,
          utilidad: 197.97,
          pct_utilidad: 7.07,
          source: 'google_sheets_november',
        },
      ];

      const summary = calculateOctober2026SummaryFromRows([
        ...sampleHistoryRows,
        // Duplicate of row 1 (should be deduplicated)
        { ...sampleHistoryRows[0], id: 999 },
        // Garbage row: TOTAL summary row (should be excluded)
        {
          id: 1000,
          tipo_doc: 'FA',
          fecha: '2026-10-31',
          mes: 'OCTUBRE',
          ano: 2026,
          id_cliente: 'TOTAL',
          cliente: 'TOTAL GENERAL OCTUBRE',
          vendedor: 'ELISA SOLER',
          id_articulo: '1478',
          articulo: 'SUBTOTAL ARTICULO',
          cajas: 5000,
          unidades: 50000,
          kgs_lts: 50000,
          monto: 3014509.07,
          costo: 2000000,
          utilidad: 1014509.07,
          pct_utilidad: 33.65,
          source: 'supabase_history_sales',
        },
        // Garbage row: empty seller/article (should be excluded)
        {
          id: 1001,
          tipo_doc: 'FA',
          fecha: '2026-10-20',
          mes: 'OCTUBRE',
          ano: 2026,
          id_cliente: '',
          cliente: '',
          vendedor: '',
          id_articulo: '',
          articulo: '',
          cajas: 10,
          unidades: 10,
          kgs_lts: 100,
          monto: 50000,
          costo: 40000,
          utilidad: 10000,
          pct_utilidad: 20,
          source: 'supabase_history_sales',
        },
      ]);

      expect(isGarbageHistorySalesRow({ id_cliente: 'TOTAL', vendedor: 'V1', id_articulo: '1' })).toBe(true);
      expect(isGarbageHistorySalesRow({ cliente: 'SUBTOTAL MES', vendedor: 'V1', id_articulo: '1' })).toBe(true);
      expect(isGarbageHistorySalesRow({ id_cliente: '', cliente: '', vendedor: 'V1', id_articulo: '1' })).toBe(true);
      expect(isGarbageHistorySalesRow(sampleHistoryRows[0])).toBe(false);

      expect(summary.periodo).toBe('2026-10');
      expect(summary.sourceLabel).toBe('Modo Consulta Histórica: Octubre 2026 (Fuente: Supabase)');
      expect(summary.sourceTable).toBe('history_sales');
      expect(summary.auditBadgeText).toBe('Fuente: Tabla history_sales en Supabase • 2 registros válidos procesados');
      expect(summary.totalRegistros).toBe(2); // Excludes 2026-11-02 row, duplicate row, and 2 garbage rows
      expect(summary.garbageRowsFiltered).toBe(2);
      expect(summary.duplicateRowsRemoved).toBe(1);
      expect(summary.facturacionTotal).toBe(1600);
      expect(summary.utilidadBruta).toBe(400);
      expect(summary.porcentajeUtilidad).toBeCloseTo(25, 2);
      expect(summary.cajasDespachadas).toBe(90);
      expect(summary.totalKilogramos).toBe(800);
      expect(summary.tendenciaDiaria).toHaveLength(2);
      expect(summary.tendenciaDiaria.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-15']);
    });
  });

  describe('5. Monthly Sales CSV Importer (data octubre .csv 4 Root Causes & Post-Load Validator)', () => {
    it('fixes Cause 1 & Cause 2: cleanNumericValue, UTF-8 BOM (\\ufeffAño), quoted semicolons ("COMERCIALIZADORA YUSI 600; C.A."), and .trim()', () => {
      // Cause 1: Thousand separator comma + decimal point + negative returns
      expect(cleanNumericValue('-1,200.00')).toBe(-1200);
      expect(cleanNumericValue('32,700.00')).toBe(32700);
      expect(cleanNumericValue('1,546.50')).toBe(1546.5);
      expect(cleanNumericValue('-86.15')).toBe(-86.15);

      // Cause 2: UTF-8 BOM \ufeffAño + semicolon inside quotes + trailing spaces + multiple lines sharing same Numero
      const sampleOctubreCsv = [
        '\ufeffAño;Mes;Fecha;Tipo Doc;Numero;Id Cliente;Cliente;Id Vendedor;Vendedor;Id Articulo;Articulo;Cajas;Unidades;Kgs/Lts;Monto;Costo;Utilidad;% Utilidad',
        '2026;OCTUBRE;15/10/2026;FA;00448777 ;007856 ;"COMERCIALIZADORA YUSI 600; C.A.";03 ;OSCAR ORTIZ- CORO ;0028 ;HUEVOS CONSUMO 360 UNID ;10.00;0.00;228.00;32,700.00;25,000.00;7,700.00;30.80',
        '2026;OCTUBRE;15/10/2026;FA;00448777 ;007856 ;"COMERCIALIZADORA YUSI 600; C.A.";03 ;OSCAR ORTIZ- CORO ;1478 ;MORTADELA ESPECIAL TAPARA 1KG ;5.00;50.00;50.00;1,300.00;1,000.00;300.00;30.00',
        '2026;OCTUBRE;16/10/2026;DV;00091234 ;007856 ;"COMERCIALIZADORA YUSI 600; C.A.";03 ;OSCAR ORTIZ- CORO ;0028 ;HUEVOS CONSUMO 360 UNID ;-1.00;0.00;-22.80;-1,200.00;-900.00;-300.00;33.33',
      ].join('\n');

      const parsed = parseMonthlySalesCsvContent(sampleOctubreCsv);
      expect(parsed.metrics.validRows).toBe(3);
      expect(parsed.metrics.faRows).toBe(2);
      expect(parsed.metrics.dvRows).toBe(1);

      // Verify quoted semicolon did not shift columns into 19 fields
      expect(parsed.rows[0].ano).toBe(2026);
      expect(parsed.rows[0].mes).toBe('OCTUBRE');
      expect(parsed.rows[0].fecha).toBe('2026-10-15');
      expect(parsed.rows[0].numero).toBe('00448777');
      expect(parsed.rows[0].id_cliente).toBe('007856');
      expect(parsed.rows[0].cliente).toBe('COMERCIALIZADORA YUSI 600; C.A.');
      expect(parsed.rows[0].id_vendedor).toBe('03');
      expect(parsed.rows[0].vendedor).toBe('OSCAR ORTIZ- CORO');
      expect(parsed.rows[0].id_articulo).toBe('0028');
      expect(parsed.rows[0].articulo).toBe('HUEVOS CONSUMO 360 UNID');
      expect(parsed.rows[0].monto).toBe(32700);
      expect(parsed.rows[0].costo).toBe(25000);
      expect(parsed.rows[0].utilidad).toBe(7700);

      // Cause 3: Same invoice number (00448777) across multiple lines must produce distinct composite_row_key
      expect(parsed.rows[0].composite_row_key).not.toBe(parsed.rows[1].composite_row_key);
      expect(parsed.rows[0].numero_fila).toBe(1);
      expect(parsed.rows[1].numero_fila).toBe(2);

      // Verify net & FA/DV metrics
      expect(parsed.metrics.montoFA).toBe(34000);
      expect(parsed.metrics.montoDV).toBe(-1200);
      expect(parsed.metrics.montoNeto).toBe(32800);
      expect(parsed.metrics.costoNeto).toBe(25100);
      expect(parsed.metrics.utilidadNeta).toBe(7700);
      expect(parsed.metrics.kgsNeto).toBe(255.2);
      expect(parsed.metrics.kgsBrutoAbsoluto).toBe(300.8);
    });

    it('fixes Cause 3 & Cause 4: uploads in 1,000-row batches without Numero upsert collision and validates October 2026 control totals', async () => {
      // Verify exact audited control totals for data octubre .csv (29,722 valid rows)
      expect(OCTOBER_2026_CONTROL_TOTALS.totalLines).toBe(29723);
      expect(OCTOBER_2026_CONTROL_TOTALS.validRows).toBe(29722);
      expect(OCTOBER_2026_CONTROL_TOTALS.faRows).toBe(25336);
      expect(OCTOBER_2026_CONTROL_TOTALS.dvRows).toBe(4386);
      expect(OCTOBER_2026_CONTROL_TOTALS.uniqueInvoiceNumbers).toBe(13588);
      expect(OCTOBER_2026_CONTROL_TOTALS.montoNeto).toBe(5572634.4);
      expect(OCTOBER_2026_CONTROL_TOTALS.montoFA).toBe(7792442.94);
      expect(OCTOBER_2026_CONTROL_TOTALS.montoDV).toBe(-2219808.54);
      expect(OCTOBER_2026_CONTROL_TOTALS.costoNeto).toBe(4253272.24);
      expect(OCTOBER_2026_CONTROL_TOTALS.utilidadNeta).toBe(1319362.16);
      expect(OCTOBER_2026_CONTROL_TOTALS.kgsNeto).toBe(2166435.83);
      expect(OCTOBER_2026_CONTROL_TOTALS.kgsBrutoAbsoluto).toBe(4045516.87);
      expect(OCTOBER_2026_CONTROL_TOTALS.unidadesNeto).toBe(2088953.0);
      expect(OCTOBER_2026_CONTROL_TOTALS.cajasNeto).toBe(727486.41);

      const validation = validateMonthlyCsvControlTotals(
        OCTOBER_2026_CONTROL_TOTALS,
        OCTOBER_2026_CONTROL_TOTALS
      );
      expect(validation.isExactMatch).toBe(true);
      expect(validation.discrepancies).toHaveLength(0);
      expect(validation.supabaseCount).toBe(29722);
      expect(validation.supabaseMontoNeto).toBe(5572634.4);

      // Test 1,000-row batch uploader with simulated 2,100 rows (3 batches: 1000, 1000, 100)
      const simulatedRows = Array.from({ length: 2100 }, (_, idx) => ({
        id: 20261000001 + idx,
        ano: 2026,
        mes: 'OCTUBRE',
        mes_num: 10,
        fecha: '2026-10-20',
        tipo_doc: 'FA' as const,
        numero: '00448777', // Same Numero across all rows to prove no collision!
        id_cliente: '007856',
        cliente: 'COMERCIALIZADORA YUSI 600; C.A.',
        id_vendedor: '03',
        vendedor: 'OSCAR ORTIZ- CORO',
        id_articulo: String(idx + 1),
        articulo: `ARTICULO ${idx + 1}`,
        cajas: 1,
        unidades: 10,
        kgs_lts: 10,
        monto: 100,
        costo: 80,
        utilidad: 20,
        porcentaje_utilidad: 25,
        numero_fila: idx + 1,
        composite_row_key: `2026|OCTUBRE|FA|00448777|${idx + 1}|${idx + 1}`,
      }));

      const insertedBatches: number[] = [];
      let deleteCalled = false;

      const mockSupabase = {
        from: vi.fn(() => {
          const builder: any = {
            delete: vi.fn(() => builder),
            gte: vi.fn(() => builder),
            lte: vi.fn(async () => {
              deleteCalled = true;
              return { error: null };
            }),
            eq: vi.fn((col: string) => {
              if (col === 'mes') {
                deleteCalled = true;
                return Promise.resolve({ error: null });
              }
              return builder;
            }),
            insert: vi.fn(async (batch: any[]) => {
              insertedBatches.push(batch.length);
              return { error: null };
            }),
          };
          return builder;
        }),
      };

      const uploadRes = await uploadMonthlySalesToSupabaseInBatches(simulatedRows, {
        supabaseClient: mockSupabase as any,
        batchSize: 1000,
      });

      expect(deleteCalled).toBe(true);
      expect(uploadRes.totalBatches).toBe(3);
      expect(uploadRes.insertedRows).toBe(2100);
      expect(insertedBatches).toEqual([1000, 1000, 100]);
    });
  });
});
