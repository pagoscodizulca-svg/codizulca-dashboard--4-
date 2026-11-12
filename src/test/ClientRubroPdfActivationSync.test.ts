import { describe, expect, it } from 'vitest';
import {
  buildClientRubroSalesIndex,
  buildPdfClientRowCells,
  classifyProductRubro,
  enrichClientActivationsWithSales,
  isClientRubroActive,
  normalizeClientCode,
  normalizeRubroText,
  normalizeSkuCode,
  sanitizePdfCellText,
} from '../lib/clientRubroActivationSync';
import { mapSupabaseRowsToClientActivationList } from '../server/maestraActivaSyncService';

describe('Sincronización de Catálogo, Cruce Relacional (Cliente -> Venta -> Producto -> Rubro) y PDF', () => {
  it('normaliza llaves de productos y clientes con ceros a la izquierda, espacios, prefijos y sufijos', () => {
    expect(normalizeSkuCode('001543')).toBe('1543');
    expect(normalizeSkuCode('  #001622  ')).toBe('1622');
    expect(normalizeSkuCode(1574)).toBe('1574');
    expect(normalizeSkuCode(null)).toBe('');

    expect(normalizeClientCode('000329')).toBe('329');
    expect(normalizeClientCode(' #000329#14 ')).toBe('329');
    expect(normalizeClientCode('8377#40')).toBe('8377');
    expect(normalizeClientCode(undefined)).toBe('');

    expect(normalizeRubroText('  Azúcar   Blanca Vencampo  ')).toBe('AZUCAR BLANCA VENCAMPO');
    expect(normalizeRubroText('Mortadela Estándar Asturias')).toBe('MORTADELA ESTANDAR ASTURIAS');
  });

  it('clasifica correctamente SKUs de los 5 rubros foco y maneja productos huérfanos sin fallar', () => {
    // 1. Azúcar
    expect(classifyProductRubro('001543')).toBe('AZUCAR');
    expect(classifyProductRubro('1571')).toBe('AZUCAR');

    // 2. Leche Vencampo (incluyendo presentación 125gr SKU 1622 y 400gr SKU 1574)
    expect(classifyProductRubro('001622')).toBe('LECHE_VENCAMPO');
    expect(classifyProductRubro('001574')).toBe('LECHE_VENCAMPO');
    expect(classifyProductRubro('1556')).toBe('LECHE_VENCAMPO');

    // 3. Pollo
    expect(classifyProductRubro('001568')).toBe('POLLO');
    expect(classifyProductRubro('001478')).toBe('POLLO');

    // 4. Estándar y Superior Asturias
    expect(classifyProductRubro('001461')).toBe('ESTANDAR_SUPERIOR_ASTURIAS');
    expect(classifyProductRubro('001463')).toBe('ESTANDAR_SUPERIOR_ASTURIAS');

    // 5. Mortadela Salpicao y Asturias
    expect(classifyProductRubro('001496')).toBe('MORTADELA_SALPICAO_ASTURIAS');
    expect(classifyProductRubro('001519')).toBe('MORTADELA_SALPICAO_ASTURIAS');

    // 6. Productos huérfanos (otros rubros o códigos inexistentes) -> null seguro
    expect(classifyProductRubro('000245', 'CAFE MOLIDO ENMA 500G')).toBeNull();
    expect(classifyProductRubro('999999', 'PRODUCTO HUERFANO FUERA DE CATALOGO')).toBeNull();
    expect(classifyProductRubro(null, undefined)).toBeNull();
  });

  it('cruza transacciones simuladas (FA y DV) y marca con "SI" los clientes activos por rubro en el dataset del PDF', () => {
    const mockClients = [
      {
        id: '90001',
        nombre: 'COMERCIAL MOCK UNO, C.A.',
        rif: 'J-000000010',
        vendedorNombre: 'VENDEDOR RUTA A',
        status: 'INACTIVO',
        activo: true,
        cats: {
          AZUCAR: false,
          LECHE_VENCAMPO: false,
          POLLO: false,
          ESTANDAR_SUPERIOR_ASTURIAS: false,
          MORTADELA_SALPICAO_ASTURIAS: false,
        },
        cajas: {
          AZUCAR: 0,
          LECHE_VENCAMPO: 0,
          POLLO: 0,
          ESTANDAR_SUPERIOR_ASTURIAS: 0,
          MORTADELA_SALPICAO_ASTURIAS: 0,
        },
      },
      {
        id: '90002',
        nombre: 'DISTRIBUIDORA MOCK DOS, C.A.',
        rif: 'J-000000020',
        vendedorNombre: 'VENDEDOR RUTA B',
        status: 'INACTIVO',
        activo: true,
        cats: {
          AZUCAR: false,
          LECHE_VENCAMPO: false,
          POLLO: false,
          ESTANDAR_SUPERIOR_ASTURIAS: false,
          MORTADELA_SALPICAO_ASTURIAS: false,
        },
        cajas: {
          AZUCAR: 0,
          LECHE_VENCAMPO: 0,
          POLLO: 0,
          ESTANDAR_SUPERIOR_ASTURIAS: 0,
          MORTADELA_SALPICAO_ASTURIAS: 0,
        },
      },
    ];

    const mockSalesRows = [
      // Cliente 90001 (con ceros a la izquierda en la factura) compra Azúcar (001543), Leche Vencampo 125gr (001622) y Mortadela (001496)
      {
        id_cliente: '0090001',
        id_articulo: '001543',
        articulo: 'AZUCAR BLANCA VENCAMPO 1X20ND',
        tipo_doc: 'FA',
        cajas: 15,
        monto: 300,
      },
      {
        id_cliente: '0090001',
        id_articulo: '001622',
        articulo: 'LECHE EN POLVO VENCAMPO 24X125GR',
        tipo_doc: 'FA',
        cajas: 4,
        monto: 120,
      },
      {
        id_cliente: '0090001',
        id_articulo: '001496',
        articulo: 'MORTADELA ESP D/POLLO ASTURIAS 10UNDX900GR',
        tipo_doc: 'FA',
        cajas: 6,
        monto: 95,
      },
      // Cliente 90001 también tiene una factura de Pollo (001568) pero la devuelve por completo (DV = -10) -> neto 0
      {
        id_cliente: '0090001',
        id_articulo: '001568',
        articulo: 'POLLO VENCAMPO POR KG',
        tipo_doc: 'FA',
        cajas: 10,
        monto: 150,
      },
      {
        id_cliente: '0090001',
        id_articulo: '001568',
        articulo: 'POLLO VENCAMPO POR KG',
        tipo_doc: 'DV',
        cajas: -10,
        monto: -150,
      },
      // Cliente 90002 solo compra un "producto huérfano" fuera de los 5 rubros foco
      {
        id_cliente: '0090002',
        id_articulo: '999888',
        articulo: 'PRODUCTO HUERFANO FUERA DE FOCO',
        tipo_doc: 'FA',
        cajas: 8,
        monto: 80,
      },
    ];

    const salesIndex = buildClientRubroSalesIndex(mockSalesRows);
    const enriched = enrichClientActivationsWithSales(mockClients, salesIndex);

    // Verificar Cliente 90001: 3 rubros activos (AZUCAR, LECHE_VENCAMPO, MORTADELA_SALPICAO_ASTURIAS), POLLO en false por devolución total
    const c1 = enriched.find((c) => c.id === '90001')!;
    expect(c1.status).toBe('ACTIVO');
    expect(isClientRubroActive(c1, 'AZUCAR')).toBe(true);
    expect(isClientRubroActive(c1, 'LECHE_VENCAMPO')).toBe(true);
    expect(isClientRubroActive(c1, 'POLLO')).toBe(false);
    expect(isClientRubroActive(c1, 'ESTANDAR_SUPERIOR_ASTURIAS')).toBe(false);
    expect(isClientRubroActive(c1, 'MORTADELA_SALPICAO_ASTURIAS')).toBe(true);
    expect(c1.cajas.AZUCAR).toBe(15);
    expect(c1.cajas.LECHE_VENCAMPO).toBe(4);
    expect(c1.cajas.MORTADELA_SALPICAO_ASTURIAS).toBe(6);

    // Verificar fila generada para el PDF del Cliente 90001
    const pdfRow1 = buildPdfClientRowCells(c1, 0);
    expect(pdfRow1).toEqual([
      '1',
      '#90001',
      'COMERCIAL MOCK UNO, C.A.',
      'J-000000010',
      'VENDEDOR RUTA A',
      'ACTIVO',
      'SI', // AZUCAR
      'SI', // LECHE_VENCAMPO
      '-',  // POLLO (devuelto)
      '-',  // ESTANDAR_SUPERIOR_ASTURIAS
      'SI', // MORTADELA_SALPICAO_ASTURIAS
      '3/5',
    ]);

    // Verificar Cliente 90002: compró producto huérfano -> estatus general ACTIVO pero 0/5 rubros foco sin romper el PDF
    const c2 = enriched.find((c) => c.id === '90002')!;
    expect(c2.status).toBe('ACTIVO');
    const pdfRow2 = buildPdfClientRowCells(c2, 1);
    expect(pdfRow2).toEqual([
      '2',
      '#90002',
      'DISTRIBUIDORA MOCK DOS, C.A.',
      'J-000000020',
      'VENDEDOR RUTA B',
      'ACTIVO',
      '-',
      '-',
      '-',
      '-',
      '-',
      '0/5',
    ]);
  });

  it('sanitiza caracteres tipográficos especiales para evitar glifos corruptos en jsPDF', () => {
    expect(sanitizePdfCellText('INVERSIONES “EL ÉXITO” — SUCURSAL 1')).toBe(
      'INVERSIONES "EL ÉXITO" - SUCURSAL 1'
    );
  });

  it('enriquece filas de Supabase en mapSupabaseRowsToClientActivationList cruzando contra el índice de ventas', () => {
    const mapped = mapSupabaseRowsToClientActivationList([
      {
        id: 1,
        cliente_codigo: '329',
        cliente_nombre: 'CLIENTE PRUEBA SINCRONIZADA C.A.',
        vendedor_id: 'MARIA BRICEÑO',
        vendedor_nombre: 'MARIA BRICEÑO',
        status: 'INACTIVO',
        cajas_aceite: 0,
        cajas_azucar: 0,
        cajas_pollo: 0,
        cajas_estandar_asturias: 0,
        cajas_mortadela_salpicao: 0,
        has_aceite: false,
        has_azucar: false,
        has_pollo: false,
        has_estandar_asturias: false,
        has_mortadela_salpicao: false,
      },
    ]);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].status).toBe('ACTIVO');
    const hasAnyRubro = Object.values(mapped[0].cats).some(Boolean);
    expect(hasAnyRubro).toBe(true);
  });
});
