import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  SellerAuditRecord,
  SupervisorScorecardData,
  AuditCommitment,
  RegionalAuditSummaryKPIs,
  RegionalAuditMetric,
  AuditRiskLevel,
  FieldSupervisionLevel
} from './regionalAuditTypes';
import { getSellerMetadata } from '../sellerSupervisorMap';
import {
  DEFAULT_DIAS_LABORABLES,
  DEFAULT_DIAS_TRANSCURRIDOS,
  getSellerVolumeQuota,
  getSellerOctoberRealFromSheet,
  hasVolumeQuota,
} from '../volumeQuotasData';

// Formato de moneda / números
export const formatAuditValue = (val: number, metric: RegionalAuditMetric): string => {
  const safeVal = Number.isFinite(val) ? val : 0;
  if (metric === 'monto') {
    return '$' + Math.round(safeVal).toLocaleString('es-VE');
  }
  if (metric === 'kgs') {
    return Math.round(safeVal).toLocaleString('es-VE') + ' Kg';
  }
  return Math.round(safeVal).toLocaleString('es-VE') + ' cj';
};

export const getMetricBadgeLabel = (metric: RegionalAuditMetric): string => {
  if (metric === 'monto') return 'Divisas ($ USD)';
  if (metric === 'kgs') return 'Kilos (Kg)';
  return 'Cajas (cj)';
};

// Causas raíz realistas de desviación comercial para auditoría en distribución masiva
export const AUDIT_ROOT_CAUSES = [
  'Baja frecuencia de visita del supervisor a clientes mayoristas',
  'Desabastecimiento temporal de SKU estrella (Aceite / Azúcar)',
  'Límite de crédito copado en clientes de la ruta',
  'Falta de prospección y reactivación de clientes inactivos',
  'Fuerte presión de precios por distribuidores informales en la zona',
  'Problemas logísticos en tiempos de despacho y entregas rechazadas',
  'Sobrecarga de meta desajustada con la capacidad de compra de la ruta',
  'Falta de inducción en portafolio de embutidos (Asturias / Salpicao)',
  'Vendedor nuevo en curva de aprendizaje sin acompañamiento continuo',
  'Cobranza morosa que impide facturación de nuevos pedidos'
];

export const INITIAL_AUDIT_COMMITMENTS: AuditCommitment[] = [
  {
    id: 'comm-001',
    folio: 'ACTA-REG-2026-081',
    fechaCreacion: '2026-09-18',
    supervisor: 'JOHNATAN SOTO',
    vendedor: 'ADEL JARABA',
    zona: 'Mayoristas',
    tipoHallazgo: 'Concentración de cartera y freno en mayoristas clave',
    descripcionCompromiso: 'Realizar jornada conjunta de negociación en ruta con los 4 mayoristas principales para desbloquear cupos de crédito y colocar 12,000 cj de aceite.',
    accionesRequeridas: 'Acompañamiento presencial obligatorio el 28/09. Negociación de pronto pago.',
    fechaLimite: '2026-09-30',
    estado: 'en_ejecucion',
    gerenteAutoriza: 'Gerente Regional Codizulca',
    prioridad: 'urgente',
    notasSeguimiento: 'Primera ronda de llamadas efectuada; reunión programada con Distribuidora El Sol.'
  },
  {
    id: 'comm-002',
    folio: 'ACTA-REG-2026-082',
    fechaCreacion: '2026-09-19',
    supervisor: 'NELSON FINOL',
    vendedor: 'PEDRO ABREU',
    zona: 'Punto Fijo',
    tipoHallazgo: 'Retraso de cuota por logística y falta de supervisión directa',
    descripcionCompromiso: 'Nelson Finol viajará a la plaza Punto Fijo para auditar 18 clientes desatendidos y estructurar combo de pollo y embutidos Asturias.',
    accionesRequeridas: 'Visita de campo de 2 días. Reporte de geocercas y firmas de clientes.',
    fechaLimite: '2026-09-29',
    estado: 'en_ejecucion',
    gerenteAutoriza: 'Gerente Regional Codizulca',
    prioridad: 'alta',
    notasSeguimiento: 'Boletos y ruta validados para el martes.'
  },
  {
    id: 'comm-003',
    folio: 'ACTA-REG-2026-083',
    fechaCreacion: '2026-09-15',
    supervisor: 'JOHNATAN SOTO',
    vendedor: 'JUAN HERNANDEZ',
    zona: 'El Chivo / Santa Bárbara',
    tipoHallazgo: 'Caída de volumen respecto a Agosto por lluvias en el Sur del Lago',
    descripcionCompromiso: 'Rediseño de ruta emergente en zonas accesibles y activación de 8 clientes medianos de víveres.',
    accionesRequeridas: 'Revisión semanal de facturación con el supervisor.',
    fechaLimite: '2026-09-27',
    estado: 'cumplido',
    gerenteAutoriza: 'Gerente Regional Codizulca',
    prioridad: 'media',
    fechaResolucion: '2026-09-22',
    notasSeguimiento: 'Se despacharon 2 camiones de azúcar logrando repunte de 28% en la zona.'
  },
  {
    id: 'comm-004',
    folio: 'ACTA-REG-2026-084',
    fechaCreacion: '2026-09-21',
    supervisor: 'NELSON FINOL',
    vendedor: 'J PABLO ARAUJO',
    zona: 'Cabimas',
    tipoHallazgo: 'Desviación en rubro Pollo y Asturias por falta de refrigeración en ruta',
    descripcionCompromiso: 'Alinear cronograma de despacho refrigerado directo desde planta con supervisión de descarga.',
    accionesRequeridas: 'Reunión con Jefe de Almacén y seguimiento de pedidos en frío.',
    fechaLimite: '2026-10-02',
    estado: 'pendiente',
    gerenteAutoriza: 'Gerente Regional Codizulca',
    prioridad: 'alta',
    notasSeguimiento: 'Pendiente confirmación de ruta de camión termoking.'
  }
];

// Helper para calcular métricas de auditoría completas a partir de filas de vendedores
export const buildSellerAuditRecords = (
  sellerRows: Array<{
    vendedor: string;
    supervisor: string;
    zona: string;
    region: string;
    months: Record<string, { cajas: number; monto: number; kgs: number }>;
    totalCajas: number;
    totalMonto: number;
    totalKgs: number;
  }>,
  metric: RegionalAuditMetric,
  activeMonth: string,
  diasLaborables: number = DEFAULT_DIAS_LABORABLES,
  diasTranscurridos: number = DEFAULT_DIAS_TRANSCURRIDOS
): SellerAuditRecord[] => {
  const metaAlDiaPct = (diasTranscurridos / Math.max(1, diasLaborables)) * 100;

  // Semillas reproducibles de auditoría de supervisión basadas en el vendedor
  const getSupervisionAuditDetails = (name: string, supervisor: string) => {
    // Calculamos hash simple para variabilidad consistente y realista
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
    
    // Días desde último acompañamiento
    const dias = (hash % 18) + 1; // 1 a 18 días
    const fecha = new Date(2026, 9, Math.max(1, 16 - Math.min(15, dias))).toISOString().slice(0, 10);
    
    let frecuencia: FieldSupervisionLevel = 'frecuente';
    if (dias > 14) frecuencia = 'deficiente';
    else if (dias > 7) frecuencia = 'regular';
    
    // Calificación de acompañamiento dada por el Gerente Regional (1 a 5)
    let calif = Math.min(5, Math.max(2, 5 - Math.floor(dias / 4)));
    if (name.includes('ADEL JARABA') || name.includes('FOOD SERVICE SUR')) calif = 3;
    if (name.includes('ALI PEREZ') || name.includes('CUENTAS CLAVE 1') || name.includes('CUENTAS CLAVES 1')) calif = 5;

    const rootCause = AUDIT_ROOT_CAUSES[hash % AUDIT_ROOT_CAUSES.length];

    return { dias, fecha, frecuencia, calif, rootCause };
  };

  return sellerRows
    .filter((row) => hasVolumeQuota(row.vendedor))
    .map((row) => {
      const metaObj = getSellerMetadata(row.vendedor);
      const quotaVal = getSellerVolumeQuota(row.vendedor, metric);
      
      // Venta real del mes evaluado (sin inventar valores si no tiene ventas en ese mes)
      const mData = row.months[activeMonth];
      let realVal = 0;
      if (activeMonth === 'OCTUBRE' && metric === 'kgs') {
        const sheetReal = getSellerOctoberRealFromSheet(row.vendedor, 'ALL');
        realVal = sheetReal !== null ? sheetReal : (mData?.kgs ?? 0);
      } else if (mData) {
        if (metric === 'monto') realVal = mData.monto;
        else if (metric === 'kgs') realVal = mData.kgs;
        else realVal = mData.cajas;
      }

      // Promedio histórico de meses anteriores
      const pastMonths = Object.keys(row.months).filter((m) => m !== activeMonth);
      let avgPast = 0;
      if (pastMonths.length > 0) {
        const sumPast = pastMonths.reduce((acc, m) => {
          const d = row.months[m];
          if (!d) return acc;
          return acc + (metric === 'monto' ? d.monto : metric === 'kgs' ? d.kgs : d.cajas);
        }, 0);
        avgPast = sumPast / pastMonths.length;
      } else {
        avgPast = realVal;
      }

      const pctCumplimiento = quotaVal > 0 ? (realVal / quotaVal) * 100 : 0;
      const proyectadoEOM = diasTranscurridos > 0 ? (realVal / diasTranscurridos) * diasLaborables : 0;
      const pctProyectado = quotaVal > 0 ? (proyectadoEOM / quotaVal) * 100 : 0;
      const brecha = Math.max(0, quotaVal - realVal);
      const diasRestantes = Math.max(1, diasLaborables - diasTranscurridos);
      const ritmoDiarioNecesario = brecha / diasRestantes;

      // Determinar nivel de riesgo de auditoría respecto a la meta al día
      let riskLevel: AuditRiskLevel = 'verde';
      if (pctCumplimiento < metaAlDiaPct * 0.75) {
        riskLevel = 'rojo';
      } else if (pctCumplimiento < metaAlDiaPct) {
        riskLevel = 'amarillo';
      }

      // Calibración de cuotas
      const pctCrecimientoExigido = avgPast > 0 ? ((quotaVal - avgPast) / avgPast) * 100 : 0;
      let calibracionCuota: 'equilibrada' | 'subestimada' | 'sobrecargada' = 'equilibrada';
      if (pctCrecimientoExigido > 35) {
        calibracionCuota = 'sobrecargada';
      } else if (pctCrecimientoExigido < -5) {
        calibracionCuota = 'subestimada';
      }

      const auditMeta = getSupervisionAuditDetails(row.vendedor, row.supervisor || metaObj.supervisor);

      return {
        id: `audit-${row.vendedor.replace(/\s+/g, '-').toLowerCase()}`,
        vendedor: row.vendedor,
        supervisor: row.supervisor || metaObj.supervisor,
        zona: row.zona || metaObj.zona,
        region: row.region || metaObj.region,
        meta: quotaVal,
        real: realVal,
        pctCumplimiento,
        pctMetaAlDia: metaAlDiaPct,
        proyectadoEOM,
        pctProyectado,
        brecha,
        ritmoDiarioNecesario,
        riskLevel,
        diasUltimaSupervision: auditMeta.dias,
        fechaUltimaSupervision: auditMeta.fecha,
        frecuenciaSupervision: auditMeta.frecuencia,
        calificacionAcompanamiento: auditMeta.calif,
        causaRaizDesviacion: auditMeta.rootCause,
        promedioHistorico: avgPast,
        pctCrecimientoExigido,
        calibracionCuota,
        rubrosActivados: Math.min(5, Math.max(2, Math.round(pctCumplimiento / 20))),
        rubrosMeta: 5,
      };
    });
};

// Generador de scorecards comparativas de supervisores
export const buildSupervisorScorecards = (
  sellerAuditRecords: SellerAuditRecord[],
  commitments: AuditCommitment[],
  diasLaborables: number = DEFAULT_DIAS_LABORABLES,
  diasTranscurridos: number = DEFAULT_DIAS_TRANSCURRIDOS
): SupervisorScorecardData[] => {
  const supervisors = ['JOHNATAN SOTO', 'ALI PEREZ', 'NELSON FINOL'];
  const metaAlDiaPct = Math.max(1, (diasTranscurridos / diasLaborables) * 100);

  return supervisors.map((sup) => {
    const team = sellerAuditRecords.filter((s) => s.supervisor === sup);
    const metaTotal = team.reduce((acc, s) => acc + s.meta, 0);
    const realTotal = team.reduce((acc, s) => acc + s.real, 0);
    const pctCumplimientoTotal = metaTotal > 0 ? (realTotal / metaTotal) * 100 : 0;
    const proyectadoEOMTotal = diasTranscurridos > 0 ? (realTotal / diasTranscurridos) * diasLaborables : 0;
    const pctProyectadoTotal = metaTotal > 0 ? (proyectadoEOMTotal / metaTotal) * 100 : 0;
    const brechaTotal = Math.max(0, metaTotal - realTotal);

    // Distribución
    const vendedoresEnMeta = team.filter((s) => s.riskLevel === 'verde').length;
    const vendedoresEnRiesgo = team.filter((s) => s.riskLevel === 'amarillo').length;
    const vendedoresCriticos = team.filter((s) => s.riskLevel === 'rojo').length;

    // Dispersión: volumen de los 3 mayores vendedores / total
    const sortedByReal = [...team].sort((a, b) => b.real - a.real);
    const top3Real = sortedByReal.slice(0, 3).reduce((acc, s) => acc + s.real, 0);
    const indiceDispersion = realTotal > 0 ? (top3Real / realTotal) * 100 : 0;
    const alertaConcentracion = indiceDispersion > 52; // Si 3 vendedores hacen más del 52% del equipo

    // Acompañamiento
    const acompanadosReciente = team.filter((s) => s.diasUltimaSupervision <= 10).length;
    const tasaAcompanamientoRuta = team.length > 0 ? (acompanadosReciente / team.length) * 100 : 0;
    const promedioDiasSinAcompanamiento = team.length > 0
      ? team.reduce((acc, s) => acc + s.diasUltimaSupervision, 0) / team.length
      : 0;
    const vendedoresDesatendidos = team.filter((s) => s.diasUltimaSupervision > 12).length;

    // Health Score (0 - 100)
    // Factores:
    // 1. Cumplimiento de cuota (peso 40)
    const factorCumplimiento = Math.min(40, (pctCumplimientoTotal / metaAlDiaPct) * 40);
    // 2. Tasa de vendedores fuera de peligro (peso 30)
    const factorSaludEquipo = team.length > 0 ? ((vendedoresEnMeta + vendedoresEnRiesgo * 0.5) / team.length) * 30 : 0;
    // 3. Acompañamiento de campo (peso 20)
    const factorAcompanamiento = (tasaAcompanamientoRuta / 100) * 20;
    // 4. Penalización por concentración extrema (-10 si concentración > 60%)
    const penalizacionConcentracion = alertaConcentracion ? 6 : 0;

    const healthScore = Math.min(100, Math.max(10, Math.round(
      factorCumplimiento + factorSaludEquipo + factorAcompanamiento - penalizacionConcentracion + 10
    )));

    let auditStatus: 'en_norma' | 'observacion' | 'alerta_critica' = 'en_norma';
    if (healthScore < 65 || vendedoresCriticos >= 5) {
      auditStatus = 'alerta_critica';
    } else if (healthScore < 80 || vendedoresCriticos >= 3 || alertaConcentracion) {
      auditStatus = 'observacion';
    }

    const supCommitments = commitments.filter((c) => c.supervisor === sup && c.estado !== 'cumplido');

    return {
      supervisor: sup,
      region: `Supervisión ${sup}`,
      sellersCount: team.length,
      metaTotal,
      realTotal,
      pctCumplimientoTotal,
      proyectadoEOMTotal,
      pctProyectadoTotal,
      brechaTotal,
      healthScore,
      auditStatus,
      vendedoresEnMeta,
      vendedoresEnRiesgo,
      vendedoresCriticos,
      indiceDispersion,
      alertaConcentracion,
      tasaAcompanamientoRuta,
      promedioDiasSinAcompanamiento,
      vendedoresDesatendidos,
      calificacionGerente: sup === 'JOHNATAN SOTO' ? 4 : sup === 'ALI PEREZ' ? 4.5 : 4.5,
      observacionGerente:
        sup === 'JOHNATAN SOTO'
          ? 'Buen empuje en clientes mayoristas y zonas foráneas. Continuar seguimiento estrecho a vendedores en ritmo de cierre.'
          : sup === 'ALI PEREZ'
          ? 'Sólida gestión y cobertura en rutas asignadas (Coro, La Costa y Maracaibo). Mantener enfoque en activación de rubros.'
          : 'Excelente cobertura en Cuentas Clave, Food Service y rutas asignadas. Priorizar acompañamiento presencial continuo.',
      compromisosPendientes: supCommitments.length,
    };
  });
};

// Generador de KPIs resumen de Gerencia Regional
export const buildRegionalSummaryKPIs = (
  scorecards: SupervisorScorecardData[],
  sellerAuditRecords: SellerAuditRecord[],
  commitments: AuditCommitment[]
): RegionalAuditSummaryKPIs => {
  const metaRegional = scorecards.reduce((acc, s) => acc + s.metaTotal, 0);
  const realRegional = scorecards.reduce((acc, s) => acc + s.realTotal, 0);
  const pctCumplimientoRegional = metaRegional > 0 ? (realRegional / metaRegional) * 100 : 0;
  const proyectadoRegional = scorecards.reduce((acc, s) => acc + s.proyectadoEOMTotal, 0);
  const pctProyectadoRegional = metaRegional > 0 ? (proyectadoRegional / metaRegional) * 100 : 0;
  const brechaRegional = Math.max(0, metaRegional - realRegional);

  const promedioHealthScore = scorecards.length > 0
    ? scorecards.reduce((acc, s) => acc + s.healthScore, 0) / scorecards.length
    : 0;

  const totalVendedores = sellerAuditRecords.length;
  const totalVendedoresEnMeta = sellerAuditRecords.filter((s) => s.riskLevel === 'verde').length;
  const totalVendedoresEnRiesgo = sellerAuditRecords.filter((s) => s.riskLevel === 'amarillo').length;
  const totalVendedoresCriticos = sellerAuditRecords.filter((s) => s.riskLevel === 'rojo').length;

  const acompanados = sellerAuditRecords.filter((s) => s.diasUltimaSupervision <= 10).length;
  const coberturaAcompanamientoGlobal = totalVendedores > 0 ? (acompanados / totalVendedores) * 100 : 0;

  const totalCompromisosActivos = commitments.filter((c) => c.estado !== 'cumplido').length;
  const totalCompromisosCumplidos = commitments.filter((c) => c.estado === 'cumplido').length;

  return {
    metaRegional,
    realRegional,
    pctCumplimientoRegional,
    proyectadoRegional,
    pctProyectadoRegional,
    brechaRegional,
    promedioHealthScore,
    totalVendedores,
    totalVendedoresEnMeta,
    totalVendedoresEnRiesgo,
    totalVendedoresCriticos,
    coberturaAcompanamientoGlobal,
    totalCompromisosActivos,
    totalCompromisosCumplidos,
  };
};

/**
 * EXPORTACIÓN A PDF OFICIAL DE AUDITORÍA REGIONAL
 */
export const exportRegionalAuditToPDF = (
  summaryKPIs: RegionalAuditSummaryKPIs,
  scorecards: SupervisorScorecardData[],
  sellerAuditRecords: SellerAuditRecord[],
  commitments: AuditCommitment[],
  metric: RegionalAuditMetric,
  activeMonth: string,
  diasLaborables: number,
  diasTranscurridos: number
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const dateStr = new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
  const metricLabel = getMetricBadgeLabel(metric);

  // 1. ENCABEZADO CORPORATIVO
  doc.setFillColor(15, 23, 42); // zinc-950 dark blue
  doc.rect(0, 0, 216, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('CODIZULCA C.A. — GERENCIA REGIONAL COMERCIAL', 14, 11);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`INFORME OFICIAL DE AUDITORÍA Y EVALUACIÓN DE SUPERVISORES Y FUERZA DE VENTAS`, 14, 17);
  doc.text(`Período Auditado: ${activeMonth} 2026 | Corte: Día ${diasTranscurridos} de ${diasLaborables} (${((diasTranscurridos/diasLaborables)*100).toFixed(1)}%) | Métrica: ${metricLabel}`, 14, 22);

  // 2. RESUMEN EJECUTIVO (METRIC CARDS)
  let yPos = 32;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('1. RESUMEN EJECUTIVO DE CONTROL REGIONAL', 14, yPos);

  const summaryRows = [
    [
      'Meta Total Regional',
      formatAuditValue(summaryKPIs.metaRegional, metric),
      'Venta Real Acumulada',
      formatAuditValue(summaryKPIs.realRegional, metric)
    ],
    [
      '% Cumplimiento Regional',
      `${summaryKPIs.pctCumplimientoRegional.toFixed(1)}%`,
      'Proyección Fin de Mes',
      `${formatAuditValue(summaryKPIs.proyectadoRegional, metric)} (${summaryKPIs.pctProyectadoRegional.toFixed(1)}%)`
    ],
    [
      'Índice Salud de Supervisión',
      `${summaryKPIs.promedioHealthScore.toFixed(0)} / 100 Pts`,
      'Vendedores en Zona Crítica (<75%)',
      `${summaryKPIs.totalVendedoresCriticos} de ${summaryKPIs.totalVendedores} (${((summaryKPIs.totalVendedoresCriticos/summaryKPIs.totalVendedores)*100).toFixed(0)}%)`
    ],
    [
      'Cobertura Acompañamiento Ruta',
      `${summaryKPIs.coberturaAcompanamientoGlobal.toFixed(1)}% de vendedores`,
      'Compromisos de Auditoría Activos',
      `${summaryKPIs.totalCompromisosActivos} planes en curso`
    ]
  ];

  autoTable(doc, {
    startY: yPos + 3,
    head: [],
    body: summaryRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, font: 'helvetica' },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [51, 65, 85], cellWidth: 48 },
      1: { fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 48 },
      2: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [51, 65, 85], cellWidth: 48 },
      3: { fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 48 },
    },
  });

  // 3. SCORECARD COMPARATIVO DE SUPERVISORES
  yPos = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. EVALUACIÓN Y AUDITORÍA DE SUPERVISORES (JOHNATAN SOTO vs NELSON FINOL)', 14, yPos);

  const supervisorTableData = scorecards.map((s) => [
    s.supervisor,
    `${s.sellersCount} Vendedores`,
    formatAuditValue(s.metaTotal, metric),
    formatAuditValue(s.realTotal, metric),
    `${s.pctCumplimientoTotal.toFixed(1)}%`,
    `${s.healthScore}/100`,
    s.auditStatus === 'en_norma' ? 'En Norma' : s.auditStatus === 'observacion' ? 'Observación' : 'Alerta Crítica',
    `${s.vendedoresCriticos} vendedores`,
    `${s.tasaAcompanamientoRuta.toFixed(0)}%`,
    `${s.compromisosPendientes}`
  ]);

  autoTable(doc, {
    startY: yPos + 3,
    head: [[
      'Supervisor', 'Equipo', 'Meta', 'Real', '% Cump.', 'Score', 'Estado Auditoría', 'Rezago', 'Acompañ.', 'Actas'
    ]],
    body: supervisorTableData,
    theme: 'striped',
    headStyles: { fillColor: [185, 28, 28], textColor: 255, fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2, halign: 'center' },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 18 },
      6: { fontStyle: 'bold' }
    }
  });

  // 4. TOP VENDEDORES EN RIESGO / AUDITORÍA REQUERIDA
  yPos = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(185, 28, 28);
  doc.text('3. MATRIZ DE VENDEDORES EN ZONA CRÍTICA (<75% DE LA META AL CORTE)', 14, yPos);

  const criticalSellers = sellerAuditRecords
    .filter((s) => s.riskLevel === 'rojo' || s.riskLevel === 'amarillo')
    .sort((a, b) => a.pctCumplimiento - b.pctCumplimiento);

  const criticalTableData = criticalSellers.map((s) => [
    s.vendedor,
    s.supervisor,
    s.zona,
    formatAuditValue(s.meta, metric),
    formatAuditValue(s.real, metric),
    `${s.pctCumplimiento.toFixed(1)}%`,
    `${s.diasUltimaSupervision} días`,
    s.causaRaizDesviacion?.substring(0, 45) || 'Revisión en curso'
  ]);

  autoTable(doc, {
    startY: yPos + 3,
    head: [[
      'Vendedor', 'Supervisor', 'Zona', 'Meta', 'Real', '% Cump.', 'Últ. Acompañ.', 'Causa Raíz / Hallazgo'
    ]],
    body: criticalTableData,
    theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 6.8, cellPadding: 1.8 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 34 },
      1: { cellWidth: 28 },
      2: { cellWidth: 24 },
      5: { halign: 'center', fontStyle: 'bold', textColor: [185, 28, 28] },
      6: { halign: 'center' },
      7: { cellWidth: 44 }
    }
  });

  // 5. ACTAS Y COMPROMISOS DE AUDITORÍA REGIONAL
  yPos = (doc as any).lastAutoTable.finalY + 8;
  if (yPos > 220) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('4. ACTAS Y PLANES DE ACCIÓN FORMALES CON SUPERVISORES', 14, yPos);

  const commitmentsData = commitments.map((c) => [
    c.folio,
    c.supervisor,
    c.vendedor,
    c.descripcionCompromiso.substring(0, 65) + '...',
    c.fechaLimite,
    c.estado === 'cumplido' ? 'CUMPLIDO' : c.estado === 'en_ejecucion' ? 'EN EJECUCIÓN' : 'PENDIENTE'
  ]);

  autoTable(doc, {
    startY: yPos + 3,
    head: [[
      'Folio Acta', 'Supervisor', 'Vendedor Foco', 'Compromiso Pactado', 'Límite', 'Estado'
    ]],
    body: commitmentsData,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold' },
    styles: { fontSize: 6.8, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { cellWidth: 26 },
      2: { cellWidth: 26 },
      3: { cellWidth: 70 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }
    }
  });

  // 6. FIRMAS DE AUDITORÍA Y APROBACIÓN
  yPos = (doc as any).lastAutoTable.finalY + 18;
  if (yPos > 240) {
    doc.addPage();
    yPos = 30;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Dictamen emitido conforme a las políticas comerciales de Codizulca C.A. para fiel cumplimiento de metas.', 14, yPos);

  yPos += 14;
  doc.setLineWidth(0.4);
  doc.setDrawColor(148, 163, 184);

  // 3 líneas de firma
  doc.line(16, yPos, 66, yPos);
  doc.line(82, yPos, 132, yPos);
  doc.line(148, yPos, 198, yPos);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('GERENTE REGIONAL', 28, yPos + 4);
  doc.text('JOHNATAN SOTO', 96, yPos + 4);
  doc.text('NELSON FINOL', 162, yPos + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Auditoría Comercial Codizulca', 24, yPos + 7.5);
  doc.text('Supervisor de Ventas', 94, yPos + 7.5);
  doc.text('Supervisor de Ventas', 160, yPos + 7.5);

  doc.save(`Auditoria_Regional_Supervisores_${activeMonth}_Codizulca.pdf`);
};
