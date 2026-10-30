import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  LOGICAL_INACTIVE_VENDOR_PREFIX,
  chunkForBatchUpsert,
  compareMaestraAgainstDatabase,
  extractCleanVendorRoute,
  isActivationRecordLogicallyInactive,
  parseMaestraActivaWorkbook,
  sanitizeMaestraText,
} from '../lib/maestraActivaEngine';
import auditSnapshot from '../data/maestraActivaAuditSnapshot.json';
import activacionSeed from '../data/activacionClientesSeed.json';
import carteraSeed from '../data/carteraClientes.json';

describe('Maestra Activa (Octubre 2026) — ETL, Auditoría Comparativa y Sincronización de Cuotas', () => {
  it('sanitiza espacios múltiples y padding final del ERP con .trim()', () => {
    expect(sanitizeMaestraText('SUPERMERCADOS                                ')).toBe(
      'SUPERMERCADOS'
    );
    expect(sanitizeMaestraText('  MARIA   BRICEÑO   ')).toBe('MARIA BRICEÑO');
  });

  it('procesa correctamente Fila 1 título, Fila 2 encabezados, filas vacías, #N/A (8347-8391) e Id duplicado 8377', () => {
    const wb = XLSX.utils.book_new();

    const dataRows = [
      ['MAESTRA CLIENTES ACTIVOS OCTUBRE 2026', '', '', '', '', ''],
      ['ID VENDEDOR', 'Vendedor', 'Id', 'Razón Social', 'RIF', 'Tipo de cliente'],
      [1, 'MARIA BRICEÑO       ', 1001, 'INVERSIONES ZULIA C.A.      ', 'J123456789   ', 'SUPERMERCADOS                 '],
      ['', '', '', '', '', ''], // Separador vacío que debe ignorarse
      [9, 'OSCAR ORTIZ - LA COSTA  ', 8377, 'HUSSEIN ATTA ABDUL KAREEM (FIT FOOT 1 DE HUSSEIN ATTA, F.P)   ', '#N/A', '#N/A'],
      [40, 'LUIS GUANIPA   ', 8377, 'HUSSEIN ATTA ABDUL KAREEM (FIT FOOT 1 DE HUSSEIN ATTA, F.P)', '', ''],
      [40, 'LUIS GUANIPA', 8348, 'COMERCIAL RESCATADO POR HOJA AUXILIAR C.A.', '#N/A', '#N/A'],
    ];

    const tipoRows = [
      ['Id', 'Razón Social', 'Tipo de cliente'],
      [1001, 'INVERSIONES ZULIA C.A.', 'SUPERMERCADOS'],
      [8348, 'COMERCIAL RESCATADO POR HOJA AUXILIAR C.A.', 'MINIMARKET          '],
    ];

    const rifRows = [
      ['Id', 'Razón Social', 'RIF'],
      [1001, 'INVERSIONES ZULIA C.A.', 'J123456789'],
      [8348, 'COMERCIAL RESCATADO POR HOJA AUXILIAR C.A.', 'J998877665   '],
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'DATA');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tipoRows), 'TIPO');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rifRows), 'RIF');

    const parsed = parseMaestraActivaWorkbook(wb, 'MAESTRA_TEST.xlsx');

    expect(parsed.title).toBe('MAESTRA CLIENTES ACTIVOS OCTUBRE 2026');
    expect(parsed.totalRowsBelowHeader).toBe(5);
    expect(parsed.emptyRowsIgnored).toBe(1);
    expect(parsed.validActiveCount).toBe(4);
    expect(parsed.distinctClientIdsCount).toBe(3);
    expect(parsed.sellersCount).toBe(3);

    // 1. Cliente normal sanitizado
    const c1001 = parsed.records.find((r) => r.idCliente === '1001')!;
    expect(c1001.tipoCliente).toBe('SUPERMERCADOS');
    expect(c1001.rif).toBe('J123456789');
    expect(c1001.vendedor).toBe('MARIA BRICEÑO');

    // 2. Cliente 8348 con #N/A en DATA pero rescatado por cruce contra hojas RIF/TIPO
    const c8348 = parsed.records.find((r) => r.idCliente === '8348')!;
    expect(c8348.rif).toBe('J998877665');
    expect(c8348.tipoCliente).toBe('MINIMARKET');
    expect(c8348.isPendingClassification).toBe(false);

    // 3. Cliente 8377 ausente en RIF/TIPO y compartido entre rutas 9 y 40 -> PENDIENTE / POR CLASIFICAR + llave compuesta
    const shared8377 = parsed.records.filter((r) => r.idCliente === '8377');
    expect(shared8377).toHaveLength(2);
    expect(shared8377.map((r) => r.assignmentKey).sort()).toEqual(['40::8377', '9::8377']);
    expect(shared8377.every((r) => r.rif === 'PENDIENTE' && r.tipoCliente === 'POR CLASIFICAR')).toBe(
      true
    );
    expect(parsed.duplicateIdGroups).toHaveLength(1);
    expect(parsed.duplicateIdGroups[0].idCliente).toBe('8377');

    // 4. Auditoría comparativa y detección de bajas lógicas
    const audit = compareMaestraAgainstDatabase(
      parsed,
      [
        {
          id: 1,
          cliente_codigo: '1001',
          cliente_nombre: 'INVERSIONES ZULIA C.A.   ',
          vendedor_id: 'MARIA BRICEÑO',
          vendedor_nombre: 'MARIA BRICEÑO',
          status: 'ACTIVO',
          has_aceite: true,
        },
        {
          id: 2,
          cliente_codigo: '8377',
          cliente_nombre: 'HUSSEIN ATTA ABDUL KAREEM (FIT FOOT 1 DE HUSSEIN ATTA, F.P)',
          vendedor_id: 'OSCAR ORTIZ - LA COSTA',
          vendedor_nombre: 'OSCAR ORTIZ - LA COSTA',
          status: 'INACTIVO',
        },
        {
          id: 3,
          cliente_codigo: '9999',
          cliente_nombre: 'CLIENTE RETIRADO DE MAESTRA C.A.',
          vendedor_id: 'JAIDER MEDINA - FOOD SERVICE NORTE',
          vendedor_nombre: 'JAIDER MEDINA - FOOD SERVICE NORTE',
          status: 'INACTIVO',
        },
      ],
      [],
      '2026-10'
    );

    expect(audit.auditTotals.altasSupabaseCount).toBe(2); // 8377 en Ruta 40 + 8348 en Ruta 40
    expect(audit.auditTotals.saneamientosTextoCount).toBe(1); // 1001 con espacios al final
    expect(audit.auditTotals.bajasLogicasCount).toBe(1); // 9999 baja lógica
    expect(audit.bajasLogicasList[0].idCliente).toBe('9999');
  });

  it('deduplica llaves dentro de cada lote de batch upsert y maneja el marcador de baja lógica compatible con Postgres CHECK', () => {
    const chunks = chunkForBatchUpsert(
      [
        { key: '9::8377', val: 'v1' },
        { key: '40::8377', val: 'v1' },
        { key: '9::8377', val: 'v2' },
      ],
      (x) => x.key,
      10
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
    expect(chunks[0].find((x) => x.key === '9::8377')?.val).toBe('v2');

    const deactivatedRow = {
      cliente_codigo: '5000',
      vendedor_id: `${LOGICAL_INACTIVE_VENDOR_PREFIX}JAIDER MEDINA - FOOD SERVICE NORTE`,
      vendedor_nombre: 'JAIDER MEDINA - FOOD SERVICE NORTE',
      status: 'INACTIVO',
    };
    expect(isActivationRecordLogicallyInactive(deactivatedRow)).toBe(true);
    expect(extractCleanVendorRoute(deactivatedRow)).toBe('JAIDER MEDINA - FOOD SERVICE NORTE');
  });

  it('verifica la integridad matemática 100% de la Maestra Octubre 2026 sincronizada (2.676 activos, 30 rutas, 44 pendientes, Id 8377 y 94 bajas lógicas)', () => {
    expect(auditSnapshot.parseMetrics.totalRowsBelowHeader).toBe(2855);
    expect(auditSnapshot.parseMetrics.emptyRowsIgnored).toBe(179);
    expect(auditSnapshot.parseMetrics.validActiveCount).toBe(2676);
    expect(auditSnapshot.parseMetrics.distinctClientIdsCount).toBe(2675);
    expect(auditSnapshot.parseMetrics.sellersCount).toBe(30);
    expect(auditSnapshot.parseMetrics.pendingCount).toBe(44);
    expect(auditSnapshot.parseMetrics.duplicateIdsCount).toBe(1);

    // Verificar seed de activacion_clientes (2.676 activos + 94 bajas lógicas con activo = false)
    const activeSeed = (activacionSeed as any[]).filter((r) => r.activo !== false);
    const inactiveSeed = (activacionSeed as any[]).filter((r) => r.activo === false);
    expect(activeSeed).toHaveLength(2676);
    expect(inactiveSeed).toHaveLength(94);

    // Verificar cliente compartido Id = 8377 en ambas rutas (9 y 40)
    const rows8377 = activeSeed.filter((r) => String(r.id) === '8377');
    expect(rows8377).toHaveLength(2);
    expect(rows8377.map((r) => r.vendedorNombre).sort()).toEqual([
      'LUIS GUANIPA',
      'OSCAR ORTIZ - LA COSTA',
    ]);

    // Verificar conteos exactos de rutas críticas actualizadas
    const countByVendor = new Map<string, number>();
    for (const r of activeSeed) {
      countByVendor.set(r.vendedorNombre, (countByVendor.get(r.vendedorNombre) || 0) + 1);
    }
    expect(countByVendor.size).toBe(30);
    expect(countByVendor.get('JAIDER MEDINA - FOOD SERVICE NORTE')).toBe(27);
    expect(countByVendor.get('LUIS GUANIPA')).toBe(55);
    expect(countByVendor.get('OSCAR ORTIZ - LA COSTA')).toBe(32);
    expect(countByVendor.get('FOOD SERVICE SENIOR - JUAN HERNANDEZ')).toBe(58);
    expect(countByVendor.get('JUAN HERNANDEZ')).toBe(123);

    // Verificar carteraClientes.json: 2.676 activos, 44 POR CLASIFICAR, 0 errores #N/A
    const activeCartera = (carteraSeed as any[]).filter((c) => c.activo !== false);
    expect(activeCartera).toHaveLength(2676);
    const porClasificar = activeCartera.filter((c) => c.canal === 'POR CLASIFICAR');
    expect(porClasificar).toHaveLength(44);
    const literalNA = activeCartera.filter((c) => c.rif === '#N/A' || c.canal === '#N/A');
    expect(literalNA).toHaveLength(0);
  });
});
