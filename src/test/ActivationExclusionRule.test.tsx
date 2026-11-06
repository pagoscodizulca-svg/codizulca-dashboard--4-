import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import {
  OFFICIAL_SELLERS_LIST,
  isExcludedActivationSeller,
  isExcludedVolumeSeller,
  isValidVolumeSeller,
  normalizeSellerComparisonKey,
} from '../components/cuotas/sellerSupervisorMap';
import {
  ACTIVATION_PRODUCT_HEADERS,
  INITIAL_SELLERS_ACTIVATION,
  RUBROS_CONFIG,
  SellerActivationRow,
  filterActivationSellers,
} from '../components/cuotas/cuotasData';
import {
  SELLER_VOLUME_QUOTAS,
  getSellerVolumeQuota,
  hasVolumeQuota,
} from '../components/cuotas/volumeQuotasData';
import { RubrosActivationTable } from '../components/cuotas/RubrosActivationTable';
import { MonthlyVolumeHistoryTable } from '../components/cuotas/MonthlyVolumeHistoryTable';

describe('Regla de Negocio: Exclusión de Cuentas Claves 1 y 2 en Activación e Inclusión en Volumen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Normalización de nombres de vendedoras (normalizeSellerComparisonKey & isExcludedActivationSeller)', () => {
    it('normaliza a minúsculas, elimina acentos y quita todos los espacios alrededor de guiones y palabras', () => {
      expect(normalizeSellerComparisonKey('cuentas claves 1 - MC')).toBe('cuentasclaves1-mc');
      expect(normalizeSellerComparisonKey('CUENTAS CLAVES 1 - MC')).toBe('cuentasclaves1-mc');
      expect(normalizeSellerComparisonKey('cuentas claves 1- MC')).toBe('cuentasclaves1-mc');
      expect(normalizeSellerComparisonKey('cuentas claves 2- SV')).toBe('cuentasclaves2-sv');
      expect(normalizeSellerComparisonKey('cuentas claves 2 - SV')).toBe('cuentasclaves2-sv');
      expect(normalizeSellerComparisonKey('  Cúentas   Cláves 2 -  sv  ')).toBe('cuentasclaves2-sv');
    });

    it('identifica correctamente todas las variaciones de "cuentas claves 1 - MC" y "cuentas claves 2- SV" para exclusión en Activación', () => {
      const excludedVariants = [
        'cuentas claves 1 - MC',
        'CUENTAS CLAVES 1 - MC',
        'cuentas claves 1- MC',
        'cuentas claves 1 -MC',
        'Cuentas Claves 1-mc',
        'cuentas clave 1 - MC',
        'cuentas claves 2- SV',
        'cuentas claves 2 - SV',
        'CUENTAS CLAVES 2 - SV',
        'cuentas claves 2 -SV',
        'Cuentas Claves 2-sv',
        'cuentas clave 2- SV',
      ];

      for (const variant of excludedVariants) {
        expect(isExcludedActivationSeller(variant)).toBe(true);
      }

      const allowedSellers = [
        'MARIA BRICEÑO',
        'ELISA SOLER',
        'J PABLO ARAUJO - CAB/OJE',
        'OSCAR ORTIZ - LA COSTA',
        'MIKELANGELO DIAZ',
        'PEDRO ABREU',
      ];

      for (const seller of allowedSellers) {
        expect(isExcludedActivationSeller(seller)).toBe(false);
      }
    });
  });

  describe('2. Pestaña de "Activación": Exclusión en tabla de detalle, supervisores y KPIs/totales', () => {
    it('no muta INITIAL_SELLERS_ACTIVATION pero filterActivationSellers excluye ambas vendedoras con cualquier formato de guiones/espacios', () => {
      // El arreglo base se mantiene intacto con las 25 filas originales
      expect(INITIAL_SELLERS_ACTIVATION).toHaveLength(25);

      const customRows: SellerActivationRow[] = [
        ...INITIAL_SELLERS_ACTIVATION.map((row) => {
          if (row.vendedor === 'CUENTAS CLAVES 1 - MC') {
            return { ...row, vendedor: 'cuentas claves 1 - MC' };
          }
          if (row.vendedor === 'CUENTAS CLAVES 2 - SV') {
            return { ...row, vendedor: 'cuentas claves 2- SV' };
          }
          return row;
        }),
      ];

      const filtered = filterActivationSellers(customRows);
      expect(filtered).toHaveLength(23);
      expect(filtered.some((r) => isExcludedActivationSeller(r.vendedor))).toBe(false);
    });

    it('excluye a "cuentas claves 1 - MC" y "cuentas claves 2- SV" de la tabla de detalle y de los KPIs/totales de Activación', () => {
      const rowsWithRawVariants: SellerActivationRow[] = INITIAL_SELLERS_ACTIVATION.map((r) => {
        if (r.vendedor === 'CUENTAS CLAVES 1 - MC') {
          return { ...r, vendedor: 'cuentas claves 1 - MC' };
        }
        if (r.vendedor === 'CUENTAS CLAVES 2 - SV') {
          return { ...r, vendedor: 'cuentas claves 2- SV' };
        }
        return r;
      });

      const { container } = render(
        <RubrosActivationTable sellers={rowsWithRawVariants} viewLevel="vendedor" />
      );

      // 1. No aparecen en la tabla de detalle ni en el contador de vendedores ni en el selector (23)
      expect(screen.getByText('23 Vendedores')).toBeTruthy();
      expect(screen.getByText('Todos los Vendedores (23)')).toBeTruthy();
      expect(screen.queryByText(/cuentas claves 1/i)).toBeNull();
      expect(screen.queryByText(/cuentas claves 2/i)).toBeNull();

      // 2. Verificación matemática de totales sincronizados sin Cuentas Claves 1 ni Cuentas Claves 2
      const expectedRows = INITIAL_SELLERS_ACTIVATION.filter(
        (r) => r.vendedor !== 'CUENTAS CLAVES 1 - MC' && r.vendedor !== 'CUENTAS CLAVES 2 - SV'
      );
      const expectedCartera = expectedRows.reduce((acc, r) => acc + (r.cartera || 0), 0);
      expect(expectedCartera).toBe(2231);

      const tfoot = container.querySelector('tfoot');
      expect(tfoot).not.toBeNull();
      expect(within(tfoot!).getByText(expectedCartera.toLocaleString('es-VE'))).toBeTruthy();

      // 3. Verificar los 5 encabezados centralizados de productos de activación del mes y sus totales sincronizados del Google Sheet
      expect(Object.values(ACTIVATION_PRODUCT_HEADERS)).toEqual([
        'AZUCAR',
        'LECHE VENCAMPO',
        'POLLO',
        'ESTANDAR Y SUPERIOR ASTURIAS',
        'MORTADELA SALPICAO Y ASTURIAS',
      ]);
      expect(RUBROS_CONFIG.map((r) => r.label)).toEqual(Object.values(ACTIVATION_PRODUCT_HEADERS));

      const expectedSyncedTotals: Record<string, { act: number; meta: number }> = {
        azucar: { act: 382, meta: 1301 },
        lecheVencampo: { act: 279, meta: 600 },
        pollo: { act: 247, meta: 840 },
        estandarSuperiorAsturias: { act: 189, meta: 855 },
        mortadelaSalpicaoAsturias: { act: 166, meta: 917 },
      };

      for (const rubro of RUBROS_CONFIG) {
        const expectedMeta = expectedRows.reduce((acc, r) => acc + r.rubros[rubro.key].meta, 0);
        const expectedAct = expectedRows.reduce((acc, r) => acc + r.rubros[rubro.key].activados, 0);

        expect(expectedAct).toBe(expectedSyncedTotals[rubro.key].act);
        expect(expectedMeta).toBe(expectedSyncedTotals[rubro.key].meta);

        const kpiButton = screen.getByTitle(`Filtrar por ${rubro.label}`);
        expect(within(kpiButton).getByText(rubro.label)).toBeTruthy();
        expect(within(kpiButton).getByText(String(expectedAct))).toBeTruthy();
        expect(within(kpiButton).getByText(String(expectedMeta))).toBeTruthy();
      }
    });

    it('excluye ambas cuentas claves del consolidado por supervisor en Activación', () => {
      const { container } = render(
        <RubrosActivationTable sellers={INITIAL_SELLERS_ACTIVATION} viewLevel="supervisores" />
      );

      const tbody = container.querySelector('tbody');
      expect(tbody).not.toBeNull();
      const nelsonRow = within(tbody!).getByText('NELSON FINOL').closest('tr');
      expect(nelsonRow).not.toBeNull();

      const expectedNelsonSellers = INITIAL_SELLERS_ACTIVATION.filter(
        (r) =>
          r.supervisor === 'NELSON FINOL' &&
          r.vendedor !== 'CUENTAS CLAVES 1 - MC' &&
          r.vendedor !== 'CUENTAS CLAVES 2 - SV'
      );
      const expectedNelsonCartera = expectedNelsonSellers.reduce(
        (acc, r) => acc + (r.cartera || 0),
        0
      );

      expect(within(nelsonRow!).getByText(String(expectedNelsonSellers.length))).toBeTruthy();
      expect(
        within(nelsonRow!).getByText(expectedNelsonCartera.toLocaleString('es-VE'))
      ).toBeTruthy();
    });
  });

  describe('3. Pestaña de "Volumen": Preservación intacta de "cuentas claves 1 - MC" y "cuentas claves 2- SV"', () => {
    it('mantiene a ambas vendedoras en OFFICIAL_SELLERS_LIST, isValidVolumeSeller y SELLER_VOLUME_QUOTAS', () => {
      expect(OFFICIAL_SELLERS_LIST).toContain('CUENTAS CLAVES 1 - MC');
      expect(OFFICIAL_SELLERS_LIST).toContain('CUENTAS CLAVES 2 - SV');

      expect(isValidVolumeSeller('cuentas claves 1 - MC')).toBe(true);
      expect(isValidVolumeSeller('cuentas claves 2- SV')).toBe(true);
      expect(isValidVolumeSeller('cuentas claves 2 - SV')).toBe(true);

      expect(isExcludedVolumeSeller('cuentas claves 1 - MC')).toBe(false);
      expect(isExcludedVolumeSeller('cuentas claves 2- SV')).toBe(false);

      expect(hasVolumeQuota('cuentas claves 1 - MC')).toBe(true);
      expect(hasVolumeQuota('cuentas claves 2- SV')).toBe(true);

      expect(getSellerVolumeQuota('cuentas claves 1 - MC', 'kgs')).toBe(
        SELLER_VOLUME_QUOTAS['CUENTAS CLAVES 1 - MC'].kgs
      );
      expect(getSellerVolumeQuota('cuentas claves 2- SV', 'kgs')).toBe(
        SELLER_VOLUME_QUOTAS['CUENTAS CLAVES 2 - SV'].kgs
      );
      expect(getSellerVolumeQuota('cuentas claves 1 - MC', 'kgs')).toBeGreaterThan(0);
      expect(getSellerVolumeQuota('cuentas claves 2- SV', 'kgs')).toBeGreaterThan(0);
    });

    it('renderiza y suma normalmente a "CUENTAS CLAVES 1 - MC" y "CUENTAS CLAVES 2 - SV" en la pestaña de Volumen (MonthlyVolumeHistoryTable)', async () => {
      const mockVolumePayload = {
        monthsAvailable: ['SEPTIEMBRE'],
        monthlyTotals: [
          {
            mes: 'SEPTIEMBRE',
            cajas: 350,
            montoNeto: 15000,
            kgs: 4500,
            transacciones: 20,
            vendedoresActivos: 3,
          },
        ],
        sellerMonthlyData: [
          {
            vendedor: 'cuentas claves 1 - MC',
            mes: 'SEPTIEMBRE',
            cajas: 100,
            montoNeto: 5000,
            kgs: 1500,
            clientesAtendidos: 8,
            facturas: 8,
          },
          {
            vendedor: 'cuentas claves 2- SV',
            mes: 'SEPTIEMBRE',
            cajas: 200,
            montoNeto: 8000,
            kgs: 2500,
            clientesAtendidos: 10,
            facturas: 10,
          },
          {
            vendedor: 'MARIA BRICEÑO',
            mes: 'SEPTIEMBRE',
            cajas: 50,
            montoNeto: 2000,
            kgs: 500,
            clientesAtendidos: 5,
            facturas: 5,
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/sellers-monthly-volume')) {
          return new Response(JSON.stringify(mockVolumePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('', { status: 404 });
      });

      const { container } = render(
        <MonthlyVolumeHistoryTable
          viewLevel="vendedor"
          diasLaborables={24}
          diasTranscurridos={12}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('CUENTAS CLAVES 1 - MC')).toBeTruthy();
        expect(screen.getByText('CUENTAS CLAVES 2 - SV')).toBeTruthy();
        expect(screen.getByText(/TOTAL GENERAL \(1 MES\)/i)).toBeTruthy();
      });

      // Verificar que las 25 vendedoras oficiales (incluyendo Cuentas Claves 1 y 2) siguen en la tabla principal de Volumen
      const tables = container.querySelectorAll('table');
      expect(tables.length).toBeGreaterThanOrEqual(2);
      const sellerTable = tables[1];
      const sellerRows = sellerTable.querySelectorAll('tbody tr');
      expect(sellerRows.length).toBe(25);
      expect(screen.getAllByText('Todos los Vendedores (25)').length).toBeGreaterThan(0);

      // Verificar que los volúmenes de Cuentas Claves 1 (1.500 Kg) y Cuentas Claves 2 (2.500 Kg) + Maria Briceño (500 Kg) suman 4.500 Kg en el pie de tabla de Volumen
      const sellerTableFoot = sellerTable.querySelector('tfoot');
      expect(sellerTableFoot).not.toBeNull();
      expect(within(sellerTableFoot!).getAllByText(/4[.,]500/).length).toBeGreaterThan(0);
    });
  });
});
