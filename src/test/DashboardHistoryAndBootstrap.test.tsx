import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { GapAnalysisPanel } from '../components/dashboard/GapAnalysisPanel';
import type {
  DashboardMonthlyProductRow,
  DashboardMonthlyTotalEntry,
} from '../lib/dashboardOverviewBootstrap';

describe('Dashboard Gerencia: Historial Supabase (Ene-Oct) + Noviembre (Google Sheets) & Rendimiento', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. verifica que exact_monthly_totals.json, historical_sales_aggregated.json y historical_daily_trends.json reflejen los 10 meses auditados de Supabase', () => {
    const cwd = process.cwd();
    const totals = JSON.parse(fs.readFileSync(path.join(cwd, 'exact_monthly_totals.json'), 'utf8'));
    const products = JSON.parse(fs.readFileSync(path.join(cwd, 'historical_sales_aggregated.json'), 'utf8'));
    const dailyTrends = JSON.parse(fs.readFileSync(path.join(cwd, 'historical_daily_trends.json'), 'utf8'));

    const expectedMonths = [
      '2026 ENERO',
      '2026 FEBRERO',
      '2026 MARZO',
      '2026 ABRIL',
      '2026 MAYO',
      '2026 JUNIO',
      '2026 JULIO',
      '2026 AGOSTO',
      '2026 SEPTIEMBRE',
      '2026 OCTUBRE',
    ];

    for (const m of expectedMonths) {
      expect(totals[m], `Debe existir total para ${m}`).toBeDefined();
      expect(totals[m].totalNeto).toBeGreaterThan(0);
      expect(totals[m].validRows ?? totals[m].totalRows).toBeGreaterThan(20000);
    }

    // Septiembre sincronizado completo (28,544 registros reales de Supabase, no 22,078 parciales)
    expect(totals['2026 SEPTIEMBRE'].validRows).toBe(28544);
    expect(totals['2026 SEPTIEMBRE'].totalNeto).toBeCloseTo(5558109.87, 2);

    // Octubre cierre exacto auditado (29,722 registros)
    expect(totals['2026 OCTUBRE'].validRows).toBe(29722);
    expect(totals['2026 OCTUBRE'].totalNeto).toBeCloseTo(5572634.4, 2);
    expect(totals['2026 OCTUBRE'].totalUtilidad).toBeCloseTo(1319362.16, 2);

    // Productos agregados presentes para todos los 10 meses
    const prodMonths = new Set(products.map((p: any) => `${p.ano} ${String(p.mes).toUpperCase()}`));
    for (const m of expectedMonths) {
      expect(prodMonths.has(m), `Debe haber productos agregados para ${m}`).toBe(true);
    }

    // Tendencias diarias disponibles para Septiembre (29 días) y Octubre (28 días)
    expect(Array.isArray(dailyTrends['2026-09'])).toBe(true);
    expect(dailyTrends['2026-09'].length).toBeGreaterThanOrEqual(25);
    expect(Array.isArray(dailyTrends['2026-10'])).toBe(true);
    expect(dailyTrends['2026-10'].length).toBeGreaterThanOrEqual(25);
  });

  it('2. GapAnalysisPanel renderiza al instante los 11 meses sin $0.00 en Ene-Sep y sin disparar peticiones redundantes', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const historicalMonthlyTotals: Record<string, DashboardMonthlyTotalEntry> = {
      '2026-10': {
        period: '2026-10', ano: 2026, mes: 'OCTUBRE', label: 'Octubre 2026',
        validRows: 29722, faRows: 25336, dvRows: 4386,
        totalFA: 7792442.94, totalDV: -2219808.54, totalNeto: 5572634.4,
        totalCosto: 4253272.24, totalUtilidad: 1319362.16, hasExactUtilidad: true,
        totalCajas: 727486.41, totalKgs: 2166435.83, kgsBruto: 4045516.87,
        source: 'supabase_history_sales', sourceTable: 'history_sales',
        auditBadgeText: 'Fuente: Tabla history_sales en Supabase • 29722 registros válidos procesados',
      },
      '2026-09': {
        period: '2026-09', ano: 2026, mes: 'SEPTIEMBRE', label: 'Septiembre 2026',
        validRows: 28544, faRows: 25000, dvRows: 3544,
        totalFA: 10902518.53, totalDV: -5344408.66, totalNeto: 5558109.87,
        totalCosto: 0, totalUtilidad: 0, hasExactUtilidad: false,
        totalCajas: 849946.38, totalKgs: 1987077.98, kgsBruto: 1987077.98,
        source: 'supabase_history_sales', sourceTable: 'history_sales',
        auditBadgeText: 'Fuente: Tabla history_sales en Supabase • 28544 registros válidos procesados',
      },
      '2026-08': {
        period: '2026-08', ano: 2026, mes: 'AGOSTO', label: 'Agosto 2026',
        validRows: 29352, faRows: 25436, dvRows: 3916,
        totalFA: 27196061.8, totalDV: -20743829.9, totalNeto: 6452231.9,
        totalCosto: 0, totalUtilidad: 0, hasExactUtilidad: false,
        totalCajas: 931257.6, totalKgs: 2835278.7, kgsBruto: 2835278.7,
        source: 'supabase_history_sales', sourceTable: 'history_sales',
        auditBadgeText: 'Fuente: Tabla history_sales en Supabase • 29352 registros válidos procesados',
      },
    };

    const historicalProducts: DashboardMonthlyProductRow[] = [
      { period: '2026-10', ano: 2026, mes: 'OCTUBRE', id_articulo: '1478', articulo: 'MORTADELA ESPECIAL TAPARA 1KG', monto: 500000, montoFA: 520000, montoDV: -20000, cajas: 15000, kgs_lts: 150000, costo: 380000, utilidad: 120000 },
      { period: '2026-09', ano: 2026, mes: 'SEPTIEMBRE', id_articulo: '1478', articulo: 'MORTADELA ESPECIAL TAPARA 1KG', monto: 420000, montoFA: 430000, montoDV: -10000, cajas: 12000, kgs_lts: 120000, costo: 0, utilidad: 0 },
      { period: '2026-08', ano: 2026, mes: 'AGOSTO', id_articulo: '1478', articulo: 'MORTADELA ESPECIAL TAPARA 1KG', monto: 610000, montoFA: 620000, montoDV: -10000, cajas: 18000, kgs_lts: 180000, costo: 0, utilidad: 0 },
    ];

    const novemberProductRows: DashboardMonthlyProductRow[] = [
      { period: '2026-11', ano: 2026, mes: 'NOVIEMBRE', id_articulo: '1478', articulo: 'MORTADELA ESPECIAL TAPARA 1KG', monto: 480000, montoFA: 490000, montoDV: -10000, cajas: 14000, kgs_lts: 140000, costo: 370000, utilidad: 110000 },
    ];

    const onSelectPeriod = vi.fn();

    render(
      <GapAnalysisPanel
        kpiId="facturacion"
        kpiLabel="FACTURACIÓN TOTAL"
        novemberKpis={{ facturacion: 4905681.26, utilidad: 950000, cajas: 597043.82, kg: 1901619.42 }}
        octoberKpis={{ facturacion: 5572634.4, utilidad: 1319362.16, cajas: 727486.41, kg: 2166435.83 }}
        historicalMonthlyTotals={historicalMonthlyTotals}
        historicalProducts={historicalProducts}
        novemberProductRows={novemberProductRows}
        activePeriod="2026-11"
        onSelectPeriod={onSelectPeriod}
      />
    );

    // 0 peticiones de red redundantes porque los datos vienen pre-hidratados desde DashboardOverview
    expect(fetchSpy).not.toHaveBeenCalled();

    // Verifica que Septiembre, Agosto y Octubre muestren sus montos reales de Supabase (NO $0.00)
    expect(screen.getByText('$5,572,634.40')).toBeInTheDocument();
    expect(screen.getByText('$5,558,109.87')).toBeInTheDocument();
    expect(screen.getByText('$6,452,231.90')).toBeInTheDocument();
    expect(screen.getByText('$4,905,681.26')).toBeInTheDocument();

    // Verifica etiquetas claras de fuente: Google Sheets para Noviembre y Supabase para meses anteriores
    expect(screen.getByText('Google Sheets • Mes Actual')).toBeInTheDocument();
    expect(screen.getByText(/28[.,]544 reg\./)).toBeInTheDocument();

    // Botón "Consultar" en Septiembre 2026 dispara onSelectPeriod('2026-09')
    const consultButtons = screen.getAllByRole('button', { name: /^Consultar$/i });
    fireEvent.click(consultButtons[1]); // 0=Octubre, 1=Septiembre (Noviembre dice "Activo")
    expect(onSelectPeriod).toHaveBeenCalledWith('2026-09');
  });
});
