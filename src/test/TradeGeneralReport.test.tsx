import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { DEFAULT_DEGUSTACIONES, DegustacionItem } from '../lib/degustacionesService';
import {
  buildTradeGeneralReportData,
  canonicalizeSellerKey,
  resolveSellerReportProfile,
  createTradeGeneralReportWorkbook,
  createTradeGeneralReportPDFDoc
} from '../components/trade-marketing/tradeGeneralReportUtils';
import { TradeGeneralReportModal } from '../components/trade-marketing/TradeGeneralReportModal';

describe('Trade Marketing - Informe General por Semanas de Planificación y Vendedor', () => {
  const sampleDataset: DegustacionItem[] = [
    ...DEFAULT_DEGUSTACIONES,
    {
      id: 'DEG-W5-ACTIVE-001',
      date: '29/10/2026',
      time: '09:00 AM - 01:00 PM',
      activity: 'Degustación MORTADELA ESPECIAL - Semana 5',
      product: 'MORTADELA ESPECIAL',
      promoter: 'CARELIZ REYES',
      promoterRole: 'Impulsadora',
      client: 'ALKOSTO LA LIMPIA',
      zone: 'CUENTAS CLAVE 2',
      vendedor: 'SAIRU VALLES', // Sin acento para probar unificación con SAIRÚ VALLES
      source: 'vendedor_app',
      status: 'scheduled',
      delivered: 0,
      target: 150,
      acceptanceRate: 0,
      comments: 'Programada para cierre de mes'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('debe incluir todas las 5 semanas de planificación del mes y organizar degustaciones archivadas por vendedor', () => {
    const report = buildTradeGeneralReportData(sampleDataset, { scope: 'all' });

    // 5 semanas de planificación de Octubre 2026 (Semana 1 a Semana 5)
    expect(report.planningWeeks).toHaveLength(5);
    expect(report.planningWeeks.map((w) => w.weekLabel)).toEqual([
      'Semana 1',
      'Semana 2',
      'Semana 3',
      'Semana 4',
      'Semana 5'
    ]);

    // Total actividades = DEFAULT_DEGUSTACIONES (todas archivadas) + 1 programada en Semana 5
    expect(report.totals.totalArchived).toBe(DEFAULT_DEGUSTACIONES.length);
    expect(report.totals.totalActive).toBe(1);
    expect(report.totals.totalActivities).toBe(DEFAULT_DEGUSTACIONES.length + 1);

    // Verificar que SAIRÚ VALLES y SAIRU VALLES quedaron agrupados en un único vendedor con Supervisor NELSON FINOL
    const sairuGroups = report.sellers.filter(
      (s) => canonicalizeSellerKey(s.vendedor) === 'SAIRU VALLES'
    );
    expect(sairuGroups).toHaveLength(1);
    expect(sairuGroups[0].vendedor).toBe('SAIRÚ VALLES');
    expect(sairuGroups[0].supervisor).toBe('NELSON FINOL');
    expect(sairuGroups[0].activeCount).toBe(1);
    expect(sairuGroups[0].archivedCount).toBeGreaterThan(0);

    // Verificar resolución de supervisor para OSWALDO CHURIÓN (con acento en Ó)
    const oswaldoProfile = resolveSellerReportProfile('OSWALDO CHURIÓN');
    expect(oswaldoProfile.supervisor).toBe('JOHNATAN SOTO');
  });

  it('debe filtrar estrictamente solo degustaciones archivadas cuando scope es archived_only', () => {
    const report = buildTradeGeneralReportData(sampleDataset, { scope: 'archived_only' });

    expect(report.totals.totalActive).toBe(0);
    expect(report.totals.totalActivities).toBe(DEFAULT_DEGUSTACIONES.length);
    expect(report.totals.totalArchived).toBe(DEFAULT_DEGUSTACIONES.length);
    // Todas las 5 semanas de planificación siguen presentes en la estructura general
    expect(report.planningWeeks).toHaveLength(5);
    expect(report.planningWeeks[4].totalCount).toBe(0); // Semana 5 tenía solo la activa
  });

  it('debe soportar múltiples meses de planificación sin colisionar semanas', () => {
    const multiMonthItems: DegustacionItem[] = [
      DEFAULT_DEGUSTACIONES[0], // Octubre 2026
      {
        ...DEFAULT_DEGUSTACIONES[0],
        id: 'DEG-NOV-W1-001',
        date: '03/11/2026',
        status: 'scheduled'
      }
    ];

    const report = buildTradeGeneralReportData(multiMonthItems, { scope: 'all' });
    // 5 semanas de Octubre + 5 semanas de Noviembre = 10 semanas de planificación ordenadas
    expect(report.planningWeeks).toHaveLength(10);
    expect(report.planningWeeks[0].weekLabel).toContain('Oct 2026');
    expect(report.planningWeeks[5].weekLabel).toContain('Nov 2026');
  });

  it('debe construir el libro Excel Multi-Hoja (.xlsx) y el documento PDF del Informe General sin errores', () => {
    const report = buildTradeGeneralReportData(sampleDataset, { scope: 'all' });

    const workbook = createTradeGeneralReportWorkbook(report);
    expect(workbook.SheetNames).toEqual([
      'Matriz Semanas x Vendedor',
      'Organizado por Vendedor',
      'Semanas de Planificación',
      'Base General Detallada'
    ]);

    // Verificar filas de la hoja Base General Detallada y Semanas de Planificación
    const weeksJson = XLSX.utils.sheet_to_json<any>(workbook.Sheets['Semanas de Planificación']);
    expect(weeksJson).toHaveLength(5);

    const flatJson = XLSX.utils.sheet_to_json<any>(workbook.Sheets['Base General Detallada']);
    expect(flatJson).toHaveLength(sampleDataset.length);

    // Verificar que PDF también se genera con todas sus secciones y páginas válidas
    const pdfDoc = createTradeGeneralReportPDFDoc(report);
    expect(pdfDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('debe renderizar TradeGeneralReportModal mostrando semanas de planificación y bloques por vendedor', () => {
    const onClose = vi.fn();
    render(
      <TradeGeneralReportModal
        isOpen={true}
        onClose={onClose}
        degustaciones={sampleDataset}
      />
    );

    expect(
      screen.getByText('Informe General de Planificación Semanal por Vendedor')
    ).toBeInTheDocument();
    expect(screen.getByText('Descargar Informe PDF')).toBeInTheDocument();
    expect(screen.getByText('Descargar Excel (.xlsx)')).toBeInTheDocument();

    // Deben verse las 5 semanas de planificación en el encabezado de la matriz
    expect(screen.getAllByText('Semana 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Semana 5').length).toBeGreaterThan(0);

    // Deben verse vendedores reales organizados
    expect(screen.getAllByText('MARIANA CHACÍN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SAIRÚ VALLES').length).toBeGreaterThan(0);

    // Cambiar alcance a Solo Degustaciones Archivadas
    const scopeSelect = screen.getByLabelText('Alcance del informe');
    fireEvent.change(scopeSelect, { target: { value: 'archived_only' } });
    expect((scopeSelect as HTMLSelectElement).value).toBe('archived_only');
  });
});
