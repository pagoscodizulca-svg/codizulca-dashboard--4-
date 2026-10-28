import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DegustacionItem,
  normalizeDateToDMY,
  parseDateDMY,
  getWeekInfo
} from '../../lib/degustacionesService';
import {
  OFFICIAL_SELLERS_LIST,
  getSellerMetadata
} from '../cuotas/sellerSupervisorMap';

export type GeneralReportScope = 'all' | 'archived_only';

export interface PlanningWeekColumn {
  key: string;
  year: number;
  monthIndex: number;
  monthName: string;
  weekNumber: number;
  weekLabel: string;
  shortHeader: string;
  rangeLabel: string;
  totalCount: number;
  archivedCount: number;
  activeCount: number;
  totalDelivered: number;
  totalTarget: number;
  avgAcceptance: number;
  sellersCount: number;
  sellerBreakdownLabel: string;
}

export interface ReportDegustacionEntry {
  item: DegustacionItem;
  vendedorCanonical: string;
  supervisor: string;
  isArchived: boolean;
  archiveConditionLabel: string;
  statusLabel: string;
  weekKey: string;
  weekNumber: number;
  weekLabel: string;
  rangeLabel: string;
  dateFormatted: string;
  dateTimestamp: number;
}

export interface SellerWeekStats {
  total: number;
  archived: number;
  active: number;
  delivered: number;
  target: number;
}

export interface SellerGeneralReportGroup {
  sellerKey: string;
  vendedor: string;
  supervisor: string;
  zona: string;
  totalCount: number;
  archivedCount: number;
  completedCount: number;
  cancelledCount: number;
  activeCount: number;
  totalDelivered: number;
  totalTarget: number;
  fulfillmentPct: number;
  avgAcceptance: number;
  weeksCoveredCount: number;
  byWeek: Record<string, SellerWeekStats>;
  entries: ReportDegustacionEntry[];
  entriesByWeek: Array<{
    week: PlanningWeekColumn;
    entries: ReportDegustacionEntry[];
  }>;
}

export interface TradeGeneralReportOptions {
  scope?: GeneralReportScope;
  selectedSeller?: string; // 'todos' o nombre del vendedor
  selectedWeekKey?: string; // 'todas' o key de semana
  includeInactiveSellers?: boolean;
  referenceDate?: Date;
}

export interface TradeGeneralReportData {
  generatedAt: string;
  scope: GeneralReportScope;
  planningWeeks: PlanningWeekColumn[];
  sellers: SellerGeneralReportGroup[];
  inactiveOfficialSellers: string[];
  totals: {
    totalActivities: number;
    totalArchived: number;
    totalCompleted: number;
    totalCancelled: number;
    totalActive: number;
    totalSellersWithActivity: number;
    totalPlanningWeeks: number;
    totalWeeksWithActivity: number;
    totalDelivered: number;
    totalTarget: number;
    fulfillmentPct: number;
    avgAcceptance: number;
  };
}

const REPORT_MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const PREFERRED_SELLER_DISPLAY_NAMES: Record<string, string> = {
  'MARIA BRICENO': 'MARÍA BRICEÑO',
  'MARIANA CHACIN': 'MARIANA CHACÍN',
  'HERNAN PAZ': 'HERNÁN PAZ',
  'OSWALDO CHURION': 'OSWALDO CHURIÓN',
  'CARLOS FUENMAYOR': 'CARLOS FUENMAYOR',
  'SARAH REYES': 'SARAH REYES',
  'J PABLO ARAUJO - CAB/OJE': 'J PABLO ARAUJO - CAB/OJE',
  'JOSE G. GONZALEZ': 'JOSE G. GONZALEZ',
  'ANGELICA MORENO': 'ANGELICA MORENO',
  'ADEL JARABA': 'ADEL JARABA',
  'JUAN HERNANDEZ': 'JUAN HERNÁNDEZ',
  'YOLEIDA LUGO': 'YOLEIDA LUGO',
  'SAIRU VALLES': 'SAIRÚ VALLES',
  'ELISA SOLER': 'ELISA SOLER',
  'ANGEL NAVARRO': 'ANGEL NAVARRO',
  'MARIANGEL GONZALEZ': 'MARIANGEL GONZALEZ',
  'VICTOR CAMPOS': 'VICTOR CAMPOS',
  'J PABLO ARAUJO': 'J PABLO ARAUJO',
  'EDUARDO PINA': 'EDUARDO PIÑA',
  'LEONARDO RIOS': 'LEONARDO RIOS',
  'MARYERY GARCIA': 'MARYERY GARCIA',
  'LUIS GUANIPA': 'LUIS GUANIPA',
  'PEDRO ABREU': 'PEDRO ABREU',
  'OSCAR ORTIZ': 'OSCAR ORTIZ',
  'MIKELANGELO DIAZ': 'MIKELANGELO DIAZ'
};

/**
 * Llave canónica insensible a mayúsculas, acentos y espacios múltiples para agrupar vendedores sin duplicados.
 */
export function canonicalizeSellerKey(raw: string): string {
  const cleaned = (raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return cleaned || 'SIN VENDEDOR ASIGNADO';
}

/**
 * Normaliza acentos vocálicos conservando la letra Ñ para consultar el mapa oficial de supervisores.
 */
function normalizeForSupervisorLookup(raw: string): string {
  return (raw || '')
    .trim()
    .toUpperCase()
    .replace(/Á/g, 'A')
    .replace(/É/g, 'E')
    .replace(/Í/g, 'I')
    .replace(/Ó/g, 'O')
    .replace(/Ú/g, 'U')
    .replace(/Ü/g, 'U')
    .replace(/\s+/g, ' ');
}

export function resolveSellerReportProfile(rawSellerName: string, fallbackZone?: string): {
  sellerKey: string;
  displayName: string;
  supervisor: string;
  zona: string;
} {
  const sellerKey = canonicalizeSellerKey(rawSellerName);
  const displayName =
    PREFERRED_SELLER_DISPLAY_NAMES[sellerKey] ||
    (rawSellerName || '').trim().toUpperCase() ||
    'SIN VENDEDOR ASIGNADO';

  if (sellerKey === 'SIN VENDEDOR ASIGNADO') {
    return {
      sellerKey,
      displayName,
      supervisor: 'COORDINACIÓN TRADE',
      zona: fallbackZone || 'Ruta General'
    };
  }

  const lookupName = normalizeForSupervisorLookup(displayName);
  const meta = getSellerMetadata(lookupName);

  return {
    sellerKey,
    displayName,
    supervisor: meta.supervisor || 'NELSON FINOL',
    zona: meta.zona || fallbackZone || 'Ruta Comercial'
  };
}

/**
 * Determina si una degustación está archivada en el Historial (completada o cancelada).
 */
export function isArchivedDegustacion(item: Pick<DegustacionItem, 'status'>): boolean {
  return item.status !== 'scheduled' && item.status !== 'in_progress';
}

export function getArchiveConditionLabel(status: DegustacionItem['status']): string {
  if (status === 'completed') return 'ARCHIVADA (COMPLETADA)';
  if (status === 'cancelled') return 'ARCHIVADA (CANCELADA)';
  if (status === 'in_progress') return 'ACTIVA (EN CURSO)';
  return 'ACTIVA (PROGRAMADA)';
}

export function getSpanishStatusLabel(status: DegustacionItem['status']): string {
  if (status === 'completed') return 'Completada';
  if (status === 'cancelled') return 'Cancelada';
  if (status === 'in_progress') return 'En Curso';
  return 'Programada';
}

function buildMonthPlanningWeeks(
  year: number,
  monthIndex: number,
  isMultiMonth: boolean
): Omit<
  PlanningWeekColumn,
  | 'totalCount'
  | 'archivedCount'
  | 'activeCount'
  | 'totalDelivered'
  | 'totalTarget'
  | 'avgAcceptance'
  | 'sellersCount'
  | 'sellerBreakdownLabel'
>[] {
  const mName = REPORT_MONTH_NAMES[monthIndex] || 'Oct';
  const mm = String(monthIndex + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const suffix = isMultiMonth ? ` (${mName} ${year})` : '';

  const defs = [
    { weekNumber: 1, start: '01', end: '04' },
    { weekNumber: 2, start: '05', end: '11' },
    { weekNumber: 3, start: '12', end: '18' },
    { weekNumber: 4, start: '19', end: '25' },
    { weekNumber: 5, start: '26', end: String(lastDay).padStart(2, '0') }
  ];

  return defs.map((d) => ({
    key: `${year}-${mm}-W${d.weekNumber}`,
    year,
    monthIndex,
    monthName: mName,
    weekNumber: d.weekNumber,
    weekLabel: `Semana ${d.weekNumber}${suffix}`,
    shortHeader: isMultiMonth
      ? `${mName} S${d.weekNumber} (${d.start}-${d.end})`
      : `Sem ${d.weekNumber} (${d.start}-${d.end} ${mName})`,
    rangeLabel: `${d.start} ${mName} - ${d.end} ${mName} ${year}`
  }));
}

function resolveItemYearMonthWeek(
  dateStr: string,
  fallbackDate: Date
): { year: number; monthIndex: number; weekNumber: number; weekKey: string; dateFormatted: string; timestamp: number } {
  const normalized = normalizeDateToDMY(dateStr);
  const parts = normalized.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(monthIndex) && !isNaN(year) && monthIndex >= 0 && monthIndex <= 11) {
      const info = getWeekInfo(normalized);
      const mm = String(monthIndex + 1).padStart(2, '0');
      const parsed = new Date(year, monthIndex, day, 0, 0, 0, 0);
      return {
        year,
        monthIndex,
        weekNumber: info.weekNumber,
        weekKey: `${year}-${mm}-W${info.weekNumber}`,
        dateFormatted: normalized,
        timestamp: parsed.getTime()
      };
    }
  }

  const fbYear = fallbackDate.getFullYear();
  const fbMonth = fallbackDate.getMonth();
  const fbDay = fallbackDate.getDate();
  const fbStr = `${String(fbDay).padStart(2, '0')}/${String(fbMonth + 1).padStart(2, '0')}/${fbYear}`;
  const info = getWeekInfo(fbStr);
  return {
    year: fbYear,
    monthIndex: fbMonth,
    weekNumber: info.weekNumber,
    weekKey: `${fbYear}-${String(fbMonth + 1).padStart(2, '0')}-W${info.weekNumber}`,
    dateFormatted: normalized || fbStr,
    timestamp: parseDateDMY(fbStr).getTime()
  };
}

/**
 * Construye toda la estructura consolidada del Informe General de Trade Marketing:
 * - Todas las semanas de planificación (Semana 1 a Semana 5 de cada mes involucrado)
 * - Degustaciones archivadas y en planificación
 * - Agrupación y métricas organizadas por Vendedor
 */
export function buildTradeGeneralReportData(
  degustaciones: DegustacionItem[],
  options: TradeGeneralReportOptions = {}
): TradeGeneralReportData {
  const {
    scope = 'all',
    selectedSeller = 'todos',
    selectedWeekKey = 'todas',
    includeInactiveSellers = false,
    referenceDate = new Date()
  } = options;

  // 1. Identificar todos los meses presentes en el universo completo de degustaciones para generar TODAS sus semanas de planificación (Semana 1..5)
  const monthPairsMap = new Map<string, { year: number; monthIndex: number }>();
  (degustaciones || []).forEach((item) => {
    const resolved = resolveItemYearMonthWeek(item.date, referenceDate);
    const ymKey = `${resolved.year}-${String(resolved.monthIndex + 1).padStart(2, '0')}`;
    if (!monthPairsMap.has(ymKey)) {
      monthPairsMap.set(ymKey, { year: resolved.year, monthIndex: resolved.monthIndex });
    }
  });

  if (monthPairsMap.size === 0) {
    const y = referenceDate.getFullYear();
    const m = referenceDate.getMonth();
    monthPairsMap.set(`${y}-${String(m + 1).padStart(2, '0')}`, { year: y, monthIndex: m });
  }

  const sortedMonths = Array.from(monthPairsMap.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex
  );
  const isMultiMonth = sortedMonths.length > 1;

  const baseWeeks = sortedMonths.flatMap((ym) =>
    buildMonthPlanningWeeks(ym.year, ym.monthIndex, isMultiMonth)
  );

  const weekMetaByKey = new Map<string, typeof baseWeeks[number]>();
  baseWeeks.forEach((w) => weekMetaByKey.set(w.key, w));

  // 2. Filtrar items según alcance (Todas vs Solo Archivadas), Vendedor y Semana seleccionada
  const selectedSellerKey =
    selectedSeller && selectedSeller !== 'todos' ? canonicalizeSellerKey(selectedSeller) : null;

  const filteredEntries: ReportDegustacionEntry[] = [];

  (degustaciones || []).forEach((item) => {
    const archived = isArchivedDegustacion(item);
    if (scope === 'archived_only' && !archived) {
      return;
    }

    const sellerProfile = resolveSellerReportProfile(item.vendedor, item.zone);
    if (selectedSellerKey && sellerProfile.sellerKey !== selectedSellerKey) {
      return;
    }

    const resolvedDate = resolveItemYearMonthWeek(item.date, referenceDate);
    if (selectedWeekKey && selectedWeekKey !== 'todas' && resolvedDate.weekKey !== selectedWeekKey) {
      return;
    }

    const weekDef = weekMetaByKey.get(resolvedDate.weekKey);
    const fallbackWeekInfo = getWeekInfo(resolvedDate.dateFormatted);

    filteredEntries.push({
      item,
      vendedorCanonical: sellerProfile.displayName,
      supervisor: sellerProfile.supervisor,
      isArchived: archived,
      archiveConditionLabel: getArchiveConditionLabel(item.status),
      statusLabel: getSpanishStatusLabel(item.status),
      weekKey: resolvedDate.weekKey,
      weekNumber: weekDef ? weekDef.weekNumber : fallbackWeekInfo.weekNumber,
      weekLabel: weekDef ? weekDef.weekLabel : fallbackWeekInfo.weekLabel,
      rangeLabel: weekDef ? weekDef.rangeLabel : fallbackWeekInfo.rangeLabel,
      dateFormatted: resolvedDate.dateFormatted,
      dateTimestamp: resolvedDate.timestamp
    });
  });

  // 3. Construir columnas de Semanas de Planificación (respetando filtro de semana si aplica, o mostrando todas las semanas de planificación)
  const visibleBaseWeeks =
    selectedWeekKey && selectedWeekKey !== 'todas'
      ? baseWeeks.filter((w) => w.key === selectedWeekKey)
      : baseWeeks;

  const planningWeeks: PlanningWeekColumn[] = visibleBaseWeeks.map((w) => {
    const weekEntries = filteredEntries.filter((e) => e.weekKey === w.key);
    const archivedCount = weekEntries.filter((e) => e.isArchived).length;
    const activeCount = weekEntries.length - archivedCount;
    const totalDelivered = weekEntries.reduce((acc, e) => acc + (Number(e.item.delivered) || 0), 0);
    const totalTarget = weekEntries.reduce((acc, e) => acc + (Number(e.item.target) || 0), 0);
    const withAcc = weekEntries.filter((e) => (Number(e.item.acceptanceRate) || 0) > 0);
    const avgAcceptance =
      withAcc.length > 0
        ? Math.round(
            withAcc.reduce((acc, e) => acc + (Number(e.item.acceptanceRate) || 0), 0) / withAcc.length
          )
        : 0;

    const perSellerCounts = new Map<string, number>();
    weekEntries.forEach((e) => {
      perSellerCounts.set(e.vendedorCanonical, (perSellerCounts.get(e.vendedorCanonical) || 0) + 1);
    });
    const sellerBreakdownLabel = Array.from(perSellerCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .map(([name, count]) => `${name} (${count})`)
      .join(', ');

    return {
      ...w,
      totalCount: weekEntries.length,
      archivedCount,
      activeCount,
      totalDelivered,
      totalTarget,
      avgAcceptance,
      sellersCount: perSellerCounts.size,
      sellerBreakdownLabel: sellerBreakdownLabel || 'Sin actividades registradas'
    };
  });

  // 4. Agrupar y organizar por Vendedor
  const sellerGroupsMap = new Map<
    string,
    {
      sellerKey: string;
      vendedor: string;
      supervisor: string;
      zona: string;
      entries: ReportDegustacionEntry[];
    }
  >();

  filteredEntries.forEach((entry) => {
    const profile = resolveSellerReportProfile(entry.item.vendedor, entry.item.zone);
    if (!sellerGroupsMap.has(profile.sellerKey)) {
      sellerGroupsMap.set(profile.sellerKey, {
        sellerKey: profile.sellerKey,
        vendedor: profile.displayName,
        supervisor: profile.supervisor,
        zona: profile.zona,
        entries: []
      });
    }
    sellerGroupsMap.get(profile.sellerKey)!.entries.push(entry);
  });

  // Identificar vendedores oficiales sin degustaciones en el período
  const inactiveOfficialSellers: string[] = [];
  OFFICIAL_SELLERS_LIST.forEach((officialRaw) => {
    const profile = resolveSellerReportProfile(officialRaw);
    if (!sellerGroupsMap.has(profile.sellerKey)) {
      inactiveOfficialSellers.push(profile.displayName);
      if (
        includeInactiveSellers &&
        (!selectedSellerKey || selectedSellerKey === profile.sellerKey)
      ) {
        sellerGroupsMap.set(profile.sellerKey, {
          sellerKey: profile.sellerKey,
          vendedor: profile.displayName,
          supervisor: profile.supervisor,
          zona: profile.zona,
          entries: []
        });
      }
    }
  });

  const sellers: SellerGeneralReportGroup[] = Array.from(sellerGroupsMap.values())
    .map((grp) => {
      // Ordenar cronológicamente por fecha ascendente (Semana 1 -> Semana 5) y luego por horario/cliente
      const sortedEntries = [...grp.entries].sort((a, b) => {
        if (a.dateTimestamp !== b.dateTimestamp) {
          return a.dateTimestamp - b.dateTimestamp;
        }
        return (a.item.time || '').localeCompare(b.item.time || '', 'es');
      });

      const byWeek: Record<string, SellerWeekStats> = {};
      planningWeeks.forEach((w) => {
        byWeek[w.key] = { total: 0, archived: 0, active: 0, delivered: 0, target: 0 };
      });

      let archivedCount = 0;
      let completedCount = 0;
      let cancelledCount = 0;
      let activeCount = 0;
      let totalDelivered = 0;
      let totalTarget = 0;

      sortedEntries.forEach((e) => {
        if (!byWeek[e.weekKey]) {
          byWeek[e.weekKey] = { total: 0, archived: 0, active: 0, delivered: 0, target: 0 };
        }
        const deliv = Number(e.item.delivered) || 0;
        const targ = Number(e.item.target) || 0;

        byWeek[e.weekKey].total += 1;
        byWeek[e.weekKey].delivered += deliv;
        byWeek[e.weekKey].target += targ;

        if (e.isArchived) {
          archivedCount += 1;
          byWeek[e.weekKey].archived += 1;
          if (e.item.status === 'completed') completedCount += 1;
          else if (e.item.status === 'cancelled') cancelledCount += 1;
        } else {
          activeCount += 1;
          byWeek[e.weekKey].active += 1;
        }

        totalDelivered += deliv;
        totalTarget += targ;
      });

      const withAcc = sortedEntries.filter((e) => (Number(e.item.acceptanceRate) || 0) > 0);
      const avgAcceptance =
        withAcc.length > 0
          ? Math.round(
              withAcc.reduce((acc, e) => acc + (Number(e.item.acceptanceRate) || 0), 0) /
                withAcc.length
            )
          : 0;

      const weeksCoveredCount = planningWeeks.filter((w) => (byWeek[w.key]?.total || 0) > 0).length;
      const fulfillmentPct = totalTarget > 0 ? Math.round((totalDelivered / totalTarget) * 100) : 0;

      const entriesByWeek = planningWeeks
        .map((week) => ({
          week,
          entries: sortedEntries.filter((e) => e.weekKey === week.key)
        }))
        .filter((wb) => wb.entries.length > 0);

      return {
        sellerKey: grp.sellerKey,
        vendedor: grp.vendedor,
        supervisor: grp.supervisor,
        zona: grp.zona,
        totalCount: sortedEntries.length,
        archivedCount,
        completedCount,
        cancelledCount,
        activeCount,
        totalDelivered,
        totalTarget,
        fulfillmentPct,
        avgAcceptance,
        weeksCoveredCount,
        byWeek,
        entries: sortedEntries,
        entriesByWeek
      };
    })
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      if (b.archivedCount !== a.archivedCount) return b.archivedCount - a.archivedCount;
      return a.vendedor.localeCompare(b.vendedor, 'es');
    });

  // 5. Totales globales del informe
  const totalActivities = filteredEntries.length;
  const totalArchived = filteredEntries.filter((e) => e.isArchived).length;
  const totalCompleted = filteredEntries.filter((e) => e.item.status === 'completed').length;
  const totalCancelled = filteredEntries.filter((e) => e.item.status === 'cancelled').length;
  const totalActive = totalActivities - totalArchived;
  const totalSellersWithActivity = sellers.filter((s) => s.totalCount > 0).length;
  const totalPlanningWeeks = planningWeeks.length;
  const totalWeeksWithActivity = planningWeeks.filter((w) => w.totalCount > 0).length;
  const totalDelivered = filteredEntries.reduce((acc, e) => acc + (Number(e.item.delivered) || 0), 0);
  const totalTarget = filteredEntries.reduce((acc, e) => acc + (Number(e.item.target) || 0), 0);
  const fulfillmentPct = totalTarget > 0 ? Math.round((totalDelivered / totalTarget) * 100) : 0;
  const entriesWithAcc = filteredEntries.filter((e) => (Number(e.item.acceptanceRate) || 0) > 0);
  const avgAcceptance =
    entriesWithAcc.length > 0
      ? Math.round(
          entriesWithAcc.reduce((acc, e) => acc + (Number(e.item.acceptanceRate) || 0), 0) /
            entriesWithAcc.length
        )
      : 0;

  return {
    generatedAt: new Date().toLocaleString('es-VE', {
      dateStyle: 'short',
      timeStyle: 'short'
    }),
    scope,
    planningWeeks,
    sellers,
    inactiveOfficialSellers: inactiveOfficialSellers.sort((a, b) => a.localeCompare(b, 'es')),
    totals: {
      totalActivities,
      totalArchived,
      totalCompleted,
      totalCancelled,
      totalActive,
      totalSellersWithActivity,
      totalPlanningWeeks,
      totalWeeksWithActivity,
      totalDelivered,
      totalTarget,
      fulfillmentPct,
      avgAcceptance
    }
  };
}

/**
 * Limpia caracteres fuera de Latin-1 (ej. emojis) para evitar glifos rotos en jsPDF Helvetica.
 */
function sanitizePdfText(input: string): string {
  return String(input || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[•·]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatWeekCellText(stats?: SellerWeekStats): string {
  if (!stats || stats.total === 0) return '-';
  if (stats.archived > 0 && stats.active > 0) {
    return `${stats.total} (${stats.archived} Arch / ${stats.active} Act)`;
  }
  if (stats.archived > 0) {
    return `${stats.archived} Arch.`;
  }
  return `${stats.active} Prog.`;
}

/**
 * Construye el libro Excel Multi-Hoja (.xlsx) del Informe General (sin escribir en disco, ideal para inspección/pruebas).
 */
export function createTradeGeneralReportWorkbook(
  report: TradeGeneralReportData
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // =========================================================================
  // HOJA 1: MATRIZ VENDEDORES X TODAS LAS SEMANAS DE PLANIFICACIÓN
  // =========================================================================
  const matrixAoA: (string | number)[][] = [
    ['CODIZULCA C.A. - INFORME GENERAL DE PLANIFICACIÓN DE TRADE MARKETING'],
    ['Consolidado de Todas las Semanas de Planificación y Degustaciones Archivadas Organizadas por Vendedor'],
    [
      'Fecha de Emisión:',
      report.generatedAt,
      'Alcance:',
      report.scope === 'archived_only'
        ? 'Solo Degustaciones Archivadas (Historial)'
        : 'Todas las Degustaciones (Archivadas + Cronograma Actual)'
    ],
    [
      'Total Degustaciones:',
      report.totals.totalActivities,
      'Degustaciones Archivadas:',
      report.totals.totalArchived,
      'En Cronograma Actual:',
      report.totals.totalActive,
      'Vendedores con Actividad:',
      report.totals.totalSellersWithActivity,
      'Muestras Entregadas:',
      report.totals.totalDelivered,
      'Aceptación Promedio:',
      `${report.totals.avgAcceptance}%`
    ],
    []
  ];

  const matrixHeaders: string[] = [
    '#',
    'Vendedor',
    'Supervisor',
    'Zona / Ruta Comercial',
    ...report.planningWeeks.map((w) => `${w.weekLabel} (${w.rangeLabel})`),
    'Degustaciones Archivadas',
    'En Cronograma Actual',
    'Total Actividades',
    'Semanas Cubiertas',
    'Muestras Entregadas',
    'Meta Muestras',
    '% Cumplimiento',
    '% Aceptación'
  ];
  matrixAoA.push(matrixHeaders);

  report.sellers.forEach((seller, idx) => {
    const weekCells = report.planningWeeks.map((w) => {
      const st = seller.byWeek[w.key];
      if (!st || st.total === 0) return 0;
      return st.total;
    });

    matrixAoA.push([
      idx + 1,
      seller.vendedor,
      seller.supervisor,
      seller.zona,
      ...weekCells,
      seller.archivedCount,
      seller.activeCount,
      seller.totalCount,
      `${seller.weeksCoveredCount} / ${report.planningWeeks.length}`,
      seller.totalDelivered,
      seller.totalTarget,
      `${seller.fulfillmentPct}%`,
      seller.avgAcceptance > 0 ? `${seller.avgAcceptance}%` : '-'
    ]);
  });

  // Fila de Totales de Matriz
  matrixAoA.push([
    'TOTAL',
    `${report.totals.totalSellersWithActivity} Vendedores Activos`,
    '',
    '',
    ...report.planningWeeks.map((w) => w.totalCount),
    report.totals.totalArchived,
    report.totals.totalActive,
    report.totals.totalActivities,
    `${report.totals.totalWeeksWithActivity} / ${report.totals.totalPlanningWeeks}`,
    report.totals.totalDelivered,
    report.totals.totalTarget,
    `${report.totals.fulfillmentPct}%`,
    report.totals.avgAcceptance > 0 ? `${report.totals.avgAcceptance}%` : '-'
  ]);

  if (report.inactiveOfficialSellers.length > 0) {
    matrixAoA.push([]);
    matrixAoA.push([
      'Vendedores sin solicitudes registradas en el período:',
      report.inactiveOfficialSellers.join(', ')
    ]);
  }

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixAoA);
  wsMatrix['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 20 },
    { wch: 26 },
    ...report.planningWeeks.map(() => ({ wch: 24 })),
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
    { wch: 15 }
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matriz Semanas x Vendedor');

  // =========================================================================
  // HOJA 2: DETALLE ORGANIZADO POR VENDEDOR (BLOQUES CON SUBTOTALES)
  // =========================================================================
  const bySellerAoA: (string | number)[][] = [
    ['DETALLE DE DEGUSTACIONES ARCHIVADAS Y PLANIFICADAS ORGANIZADO POR VENDEDOR'],
    [`Emitido: ${report.generatedAt} | Total Archivadas: ${report.totals.totalArchived} | Total General: ${report.totals.totalActivities}`],
    []
  ];

  const detailHeaders = [
    'Vendedor',
    'Supervisor',
    'Semana de Planificación',
    'Rango de Semana',
    'Condición de Archivo',
    'Estado',
    'Fecha',
    'Horario',
    'Cliente / Punto de Venta (PDV)',
    'Zona / Ruta',
    'Producto(s)',
    'Actividad',
    'Promotora Asignada',
    'Muestras Entregadas',
    'Meta Muestras',
    '% Aceptación',
    'Observaciones / Contacto en Tienda'
  ];

  report.sellers.forEach((seller) => {
    bySellerAoA.push([
      `>>> VENDEDOR: ${seller.vendedor}`,
      `Supervisor: ${seller.supervisor}`,
      `Zona: ${seller.zona}`,
      `Archivadas: ${seller.archivedCount}`,
      `En Cronograma: ${seller.activeCount}`,
      `Total: ${seller.totalCount}`,
      `Semanas Activas: ${seller.weeksCoveredCount}/${report.planningWeeks.length}`,
      `Muestras: ${seller.totalDelivered}/${seller.totalTarget}`,
      `Aceptación: ${seller.avgAcceptance}%`
    ]);
    bySellerAoA.push(detailHeaders);

    if (seller.entries.length === 0) {
      bySellerAoA.push([
        seller.vendedor,
        seller.supervisor,
        '-',
        '-',
        'SIN ACTIVIDADES',
        '-',
        '-',
        '-',
        'Sin degustaciones registradas en el período',
        seller.zona,
        '-',
        '-',
        '-',
        0,
        0,
        '-',
        ''
      ]);
    } else {
      seller.entries.forEach((entry) => {
        const d = entry.item;
        const cleanPromoter =
          d.promoter && !d.promoter.toUpperCase().includes('POR ASIGNAR')
            ? d.promoter
            : 'POR ASIGNAR (Trade Marketing)';
        bySellerAoA.push([
          seller.vendedor,
          seller.supervisor,
          entry.weekLabel,
          entry.rangeLabel,
          entry.archiveConditionLabel,
          entry.statusLabel,
          entry.dateFormatted,
          d.time,
          d.client,
          d.zone,
          d.product,
          d.activity,
          cleanPromoter,
          d.delivered,
          d.target,
          d.acceptanceRate > 0 ? `${d.acceptanceRate}%` : '-',
          d.comments || ''
        ]);
      });
    }

    bySellerAoA.push([
      `SUBTOTAL ${seller.vendedor}`,
      '',
      `${seller.weeksCoveredCount} semanas con actividad`,
      '',
      `${seller.archivedCount} Archivadas`,
      `${seller.activeCount} Activas`,
      '',
      '',
      `${seller.totalCount} degustaciones`,
      '',
      '',
      '',
      '',
      seller.totalDelivered,
      seller.totalTarget,
      seller.avgAcceptance > 0 ? `${seller.avgAcceptance}%` : '-',
      ''
    ]);
    bySellerAoA.push([]);
  });

  const wsBySeller = XLSX.utils.aoa_to_sheet(bySellerAoA);
  wsBySeller['!cols'] = [
    { wch: 26 },
    { wch: 18 },
    { wch: 20 },
    { wch: 22 },
    { wch: 25 },
    { wch: 14 },
    { wch: 13 },
    { wch: 20 },
    { wch: 36 },
    { wch: 20 },
    { wch: 26 },
    { wch: 42 },
    { wch: 28 },
    { wch: 18 },
    { wch: 15 },
    { wch: 14 },
    { wch: 48 }
  ];
  XLSX.utils.book_append_sheet(wb, wsBySeller, 'Organizado por Vendedor');

  // =========================================================================
  // HOJA 3: RESUMEN DE TODAS LAS SEMANAS DE PLANIFICACIÓN
  // =========================================================================
  const weeksRows = report.planningWeeks.map((w) => ({
    Semana_Planificacion: w.weekLabel,
    Rango_Fechas: w.rangeLabel,
    Condicion_Semana:
      w.totalCount === 0
        ? 'Sin Actividades Registradas'
        : w.activeCount > 0 && w.archivedCount > 0
        ? 'Mixta (Archivadas + En Curso)'
        : w.activeCount > 0
        ? 'En Planificación Activa'
        : 'Cierre Dominical Archivado',
    Degustaciones_Archivadas: w.archivedCount,
    En_Cronograma_Actual: w.activeCount,
    Total_Actividades: w.totalCount,
    Vendedores_Participantes: w.sellersCount,
    Desglose_Por_Vendedor: w.sellerBreakdownLabel,
    Muestras_Entregadas: w.totalDelivered,
    Meta_Muestras: w.totalTarget,
    Aceptacion_Promedio: w.avgAcceptance > 0 ? `${w.avgAcceptance}%` : '-'
  }));
  const wsWeeks = XLSX.utils.json_to_sheet(weeksRows);
  wsWeeks['!cols'] = [
    { wch: 20 },
    { wch: 24 },
    { wch: 28 },
    { wch: 24 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 58 },
    { wch: 20 },
    { wch: 16 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, wsWeeks, 'Semanas de Planificación');

  // =========================================================================
  // HOJA 4: BASE PLANA COMPLETA (PARA TABLAS DINÁMICAS)
  // =========================================================================
  const flatRows = report.sellers.flatMap((seller) =>
    seller.entries.map((entry) => {
      const d = entry.item;
      return {
        ID: d.id,
        Vendedor: seller.vendedor,
        Supervisor: seller.supervisor,
        Zona_Cartera: seller.zona,
        Semana_Numero: entry.weekNumber,
        Semana_Planificacion: entry.weekLabel,
        Rango_Semana: entry.rangeLabel,
        Archivada: entry.isArchived ? 'SÍ (HISTORIAL)' : 'NO (ACTIVA)',
        Condicion_Archivo: entry.archiveConditionLabel,
        Estado: entry.statusLabel,
        Fecha: entry.dateFormatted,
        Horario: d.time,
        Cliente_PDV: d.client,
        Zona_PDV: d.zone,
        Producto: d.product,
        Actividad: d.activity,
        Promotora_Asignada:
          d.promoter && !d.promoter.toUpperCase().includes('POR ASIGNAR')
            ? d.promoter
            : 'POR ASIGNAR (Trade Marketing)',
        Rol_Promotora: d.promoterRole,
        Muestras_Entregadas: d.delivered,
        Meta_Muestras: d.target,
        Aceptacion_Pct: d.acceptanceRate,
        Origen: d.source === 'vendedor_app' ? 'App Vendedor' : 'Coordinación Trade',
        Comentarios: d.comments || ''
      };
    })
  );
  const wsFlat = XLSX.utils.json_to_sheet(flatRows);
  wsFlat['!cols'] = [
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
    { wch: 22 },
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
    { wch: 18 },
    { wch: 25 },
    { wch: 14 },
    { wch: 13 },
    { wch: 20 },
    { wch: 34 },
    { wch: 20 },
    { wch: 24 },
    { wch: 40 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 46 }
  ];
  XLSX.utils.book_append_sheet(wb, wsFlat, 'Base General Detallada');

  return wb;
}

/**
 * EXPORTACIÓN A EXCEL MULTI-HOJA (.XLSX):
 * Informe General de Planificación Semanal y Degustaciones Archivadas Organizadas por Vendedor
 */
export function exportTradeGeneralReportToExcel(
  report: TradeGeneralReportData,
  fileDateSuffix?: string
): void {
  const wb = createTradeGeneralReportWorkbook(report);
  const dateStr = fileDateSuffix || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(
    wb,
    `Informe_General_TradeMarketing_Semanas_Por_Vendedor_${dateStr}.xlsx`
  );
}

/**
 * Construye el documento PDF Institucional del Informe General (sin descargar archivo).
 */
export function createTradeGeneralReportPDFDoc(
  report: TradeGeneralReportData
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Franja institucional Codizulca
  doc.setFillColor(220, 38, 38);
  doc.rect(14, 10, 3.5, 16, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text(
    'CODIZULCA C.A. - INFORME GENERAL DE PLANIFICACION DE TRADE MARKETING',
    21,
    15
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Consolidado de Todas las Semanas de Planificacion | Degustaciones Archivadas y Cronograma Organizado por Vendedor',
    21,
    20
  );

  const scopeText =
    report.scope === 'archived_only'
      ? 'Alcance: Solo Degustaciones Archivadas (Historial)'
      : 'Alcance: Todas las Semanas (Degustaciones Archivadas + En Planificacion)';
  doc.setFontSize(7.5);
  doc.text(scopeText, 21, 24.5);

  doc.text(`Emitido: ${sanitizePdfText(report.generatedAt)}`, pageWidth - 14, 15, {
    align: 'right'
  });
  doc.text(
    `Archivadas: ${report.totals.totalArchived} | Activas: ${report.totals.totalActive} | Total: ${report.totals.totalActivities}`,
    pageWidth - 14,
    20,
    { align: 'right' }
  );

  // =========================================================================
  // BANDA DE TARJETAS KPI EJECUTIVAS
  // =========================================================================
  const kpiCards = [
    {
      label: 'SEMANAS PLANIFICACION',
      value: `${report.totals.totalPlanningWeeks} Semanas`,
      sub: `${report.totals.totalWeeksWithActivity} con ejecucion`
    },
    {
      label: 'DEGUSTACIONES ARCHIVADAS',
      value: `${report.totals.totalArchived} Archivadas`,
      sub: `${report.totals.totalCompleted} completadas / ${report.totals.totalCancelled} canc.`
    },
    {
      label: 'EN CRONOGRAMA ACTUAL',
      value: `${report.totals.totalActive} Activas`,
      sub: `Total general: ${report.totals.totalActivities} eventos`
    },
    {
      label: 'VENDEDORES CON ACTIVIDAD',
      value: `${report.totals.totalSellersWithActivity} Vendedores`,
      sub: 'Organizados por cartera comercial'
    },
    {
      label: 'MUESTRAS Y ACEPTACION',
      value: `${report.totals.totalDelivered.toLocaleString('es-VE')} Muestras`,
      sub: `Meta: ${report.totals.totalTarget.toLocaleString('es-VE')} (${report.totals.avgAcceptance}% acept.)`
    }
  ];

  const cardGap = 3;
  const cardWidth = (pageWidth - 28 - cardGap * (kpiCards.length - 1)) / kpiCards.length;
  const kpiTop = 28;
  kpiCards.forEach((c, idx) => {
    const x = 14 + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiTop, cardWidth, 15, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + 2.5, kpiTop + 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(c.value), x + 2.5, kpiTop + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(sanitizePdfText(c.sub), x + 2.5, kpiTop + 13.3);
  });

  // =========================================================================
  // SECCIÓN 1: MATRIZ GENERAL DE SEMANAS DE PLANIFICACIÓN POR VENDEDOR
  // =========================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(
    '1. MATRIZ CONSOLIDADA DE TODAS LAS SEMANAS DE PLANIFICACION POR VENDEDOR',
    14,
    48.5
  );

  const matrixHead = [
    '#',
    'VENDEDOR',
    'SUPERVISOR',
    'ZONA / CARTERA',
    ...report.planningWeeks.map((w) => sanitizePdfText(w.shortHeader.toUpperCase())),
    'ARCHIVADAS',
    'ACTIVAS',
    'TOTAL',
    'MUESTRAS',
    '% ACEPT.'
  ];

  const matrixBody = report.sellers.map((s, idx) => [
    idx + 1,
    sanitizePdfText(s.vendedor),
    sanitizePdfText(s.supervisor),
    sanitizePdfText(s.zona),
    ...report.planningWeeks.map((w) => formatWeekCellText(s.byWeek[w.key])),
    s.archivedCount,
    s.activeCount,
    s.totalCount,
    `${s.totalDelivered}/${s.totalTarget}`,
    s.avgAcceptance > 0 ? `${s.avgAcceptance}%` : '-'
  ]);

  const matrixFoot = [
    [
      'TOT',
      `${report.totals.totalSellersWithActivity} Vendedores`,
      '',
      '',
      ...report.planningWeeks.map((w) =>
        w.totalCount === 0
          ? '-'
          : w.activeCount > 0 && w.archivedCount > 0
          ? `${w.totalCount} (${w.archivedCount}A/${w.activeCount}P)`
          : w.archivedCount > 0
          ? `${w.archivedCount} Arch.`
          : `${w.activeCount} Prog.`
      ),
      report.totals.totalArchived,
      report.totals.totalActive,
      report.totals.totalActivities,
      `${report.totals.totalDelivered}/${report.totals.totalTarget}`,
      report.totals.avgAcceptance > 0 ? `${report.totals.avgAcceptance}%` : '-'
    ]
  ];

  const weekCount = report.planningWeeks.length;
  const matrixColStyles: Record<number, any> = {
    0: { halign: 'center', fontStyle: 'bold', cellWidth: 8 },
    1: { halign: 'left', fontStyle: 'bold', cellWidth: 36 },
    2: { halign: 'left', cellWidth: 26 },
    3: { halign: 'left', cellWidth: 30 }
  };
  for (let i = 0; i < weekCount; i++) {
    matrixColStyles[4 + i] = { halign: 'center' };
  }
  matrixColStyles[4 + weekCount] = { halign: 'center', fontStyle: 'bold' };
  matrixColStyles[5 + weekCount] = { halign: 'center' };
  matrixColStyles[6 + weekCount] = { halign: 'center', fontStyle: 'bold' };
  matrixColStyles[7 + weekCount] = { halign: 'right' };
  matrixColStyles[8 + weekCount] = { halign: 'center', fontStyle: 'bold' };

  autoTable(doc, {
    startY: 51,
    margin: { left: 14, right: 14 },
    head: [matrixHead],
    body: matrixBody,
    foot: matrixFoot,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.5,
      textColor: [30, 41, 59]
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8
    },
    footStyles: {
      fillColor: [185, 28, 28],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: matrixColStyles
  });

  // =========================================================================
  // SECCIÓN 2: RESUMEN DE TODAS LAS SEMANAS DE PLANIFICACIÓN
  // =========================================================================
  let cursorY = ((doc as any).lastAutoTable?.finalY || 95) + 7;
  if (cursorY > pageHeight - 48) {
    doc.addPage();
    cursorY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('2. RESUMEN EJECUTIVO DE TODAS LAS SEMANAS DE PLANIFICACION', 14, cursorY);

  autoTable(doc, {
    startY: cursorY + 2.5,
    margin: { left: 14, right: 14 },
    head: [
      [
        'SEMANA PLANIF.',
        'RANGO DE FECHAS',
        'CONDICION DE SEMANA',
        'ARCHIVADAS',
        'ACTIVAS',
        'TOTAL',
        'VENDEDORES PARTICIPANTES Y DESGLOSE',
        'MUESTRAS',
        '% ACEPT.'
      ]
    ],
    body: report.planningWeeks.map((w) => [
      sanitizePdfText(w.weekLabel),
      sanitizePdfText(w.rangeLabel),
      w.totalCount === 0
        ? 'Sin Actividades Registradas'
        : w.activeCount > 0 && w.archivedCount > 0
        ? 'Mixta (Archivadas + Activas)'
        : w.activeCount > 0
        ? 'En Planificacion Activa'
        : 'Cierre Dominical Archivado',
      w.archivedCount,
      w.activeCount,
      w.totalCount,
      sanitizePdfText(w.sellerBreakdownLabel),
      `${w.totalDelivered} / ${w.totalTarget}`,
      w.avgAcceptance > 0 ? `${w.avgAcceptance}%` : '-'
    ]),
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: 1.5,
      textColor: [30, 41, 59]
    },
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 26 },
      1: { cellWidth: 32 },
      2: { cellWidth: 38 },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 15 },
      6: { cellWidth: 'auto' },
      7: { halign: 'right', cellWidth: 22 },
      8: { halign: 'center', fontStyle: 'bold', cellWidth: 14 }
    }
  });

  // =========================================================================
  // SECCIÓN 3: DETALLE COMPLETO DE DEGUSTACIONES ORGANIZADO POR VENDEDOR
  // =========================================================================
  cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 30) + 8;
  if (cursorY > pageHeight - 45) {
    doc.addPage();
    cursorY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(185, 28, 28);
  doc.text(
    '3. DETALLE DE DEGUSTACIONES ARCHIVADAS Y PLANIFICADAS ORGANIZADO POR VENDEDOR',
    14,
    cursorY
  );
  cursorY += 4;

  report.sellers.forEach((seller, sIdx) => {
    if (cursorY > pageHeight - 38) {
      doc.addPage();
      cursorY = 16;
    }

    // Banda de encabezado del Vendedor
    doc.setFillColor(24, 24, 27);
    doc.roundedRect(14, cursorY, pageWidth - 28, 8.5, 1.2, 1.2, 'F');
    doc.setFillColor(220, 38, 38);
    doc.rect(14, cursorY, 2.8, 8.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(
      sanitizePdfText(
        `${sIdx + 1}. VENDEDOR: ${seller.vendedor}  |  Supervisor: ${seller.supervisor}  |  Zona: ${seller.zona}`
      ),
      19,
      cursorY + 5.5
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(254, 202, 202);
    doc.text(
      sanitizePdfText(
        `Archivadas: ${seller.archivedCount}  |  Activas: ${seller.activeCount}  |  Total: ${seller.totalCount}  |  Semanas: ${seller.weeksCoveredCount}/${report.planningWeeks.length}  |  Muestras: ${seller.totalDelivered}/${seller.totalTarget} (${seller.avgAcceptance}% Acept.)`
      ),
      pageWidth - 17,
      cursorY + 5.5,
      { align: 'right' }
    );

    const sellerRows =
      seller.entries.length === 0
        ? [
            [
              '-',
              '-',
              'Sin degustaciones registradas en este periodo',
              sanitizePdfText(seller.zona),
              '-',
              '-',
              'SIN REGISTROS',
              '0 / 0',
              '-',
              '-'
            ]
          ]
        : seller.entries.map((entry) => {
            const d = entry.item;
            const promoterText =
              d.promoter && !d.promoter.toUpperCase().includes('POR ASIGNAR')
                ? d.promoter
                : 'POR ASIGNAR (Trade Mkt)';
            return [
              sanitizePdfText(`${entry.weekLabel}\n(${entry.rangeLabel})`),
              sanitizePdfText(`${entry.dateFormatted}\n${d.time}`),
              sanitizePdfText(d.client),
              sanitizePdfText(d.zone),
              sanitizePdfText(d.product),
              sanitizePdfText(promoterText),
              sanitizePdfText(entry.archiveConditionLabel),
              `${d.delivered} / ${d.target}`,
              d.acceptanceRate > 0 ? `${d.acceptanceRate}%` : '-',
              sanitizePdfText(d.comments || '')
            ];
          });

    autoTable(doc, {
      startY: cursorY + 9.5,
      margin: { left: 14, right: 14 },
      head: [
        [
          'SEMANA PLANIF.',
          'FECHA / HORARIO',
          'CLIENTE / PDV',
          'ZONA',
          'PRODUCTO',
          'PROMOTORA ASIGNADA',
          'CONDICION / ARCHIVO',
          'MUESTRAS',
          'ACEPT.',
          'OBSERVACIONES / CONTACTO PDV'
        ]
      ],
      body: sellerRows,
      theme: 'grid',
      styles: {
        fontSize: 6.4,
        cellPadding: 1.3,
        textColor: [30, 41, 59],
        valign: 'middle'
      },
      headStyles: {
        fillColor: [63, 63, 70],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.5
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251]
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 27 },
        1: { cellWidth: 25 },
        2: { fontStyle: 'bold', cellWidth: 42 },
        3: { cellWidth: 22 },
        4: { cellWidth: 25 },
        5: { cellWidth: 28 },
        6: { halign: 'center', fontStyle: 'bold', cellWidth: 27 },
        7: { halign: 'right', cellWidth: 16 },
        8: { halign: 'center', fontStyle: 'bold', cellWidth: 12 },
        9: { cellWidth: 'auto' }
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 6) {
          const val = String(hookData.cell.raw || '');
          if (val.includes('ARCHIVADA (COMPLETADA)')) {
            hookData.cell.styles.textColor = [6, 95, 70];
            hookData.cell.styles.fillColor = [236, 253, 245];
          } else if (val.includes('ARCHIVADA (CANCELADA)')) {
            hookData.cell.styles.textColor = [153, 27, 27];
            hookData.cell.styles.fillColor = [254, 242, 242];
          } else if (val.includes('ACTIVA')) {
            hookData.cell.styles.textColor = [30, 64, 175];
            hookData.cell.styles.fillColor = [239, 246, 255];
          }
        }
      }
    });

    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 25) + 6;
  });

  // Numeración de páginas y pie institucional en todo el documento
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Codizulca C.A. - Informe General de Planificacion Semanal y Degustaciones Archivadas por Vendedor (Trade Marketing)',
      14,
      pageHeight - 6.5
    );
    doc.text(`Pagina ${p} de ${totalPages}`, pageWidth - 14, pageHeight - 6.5, {
      align: 'right'
    });
  }

  return doc;
}

/**
 * EXPORTACIÓN A PDF INSTITUCIONAL:
 * Informe General con Todas las Semanas de Planificación y Degustaciones Archivadas Organizadas por Vendedor
 */
export function exportTradeGeneralReportToPDF(
  report: TradeGeneralReportData,
  fileDateSuffix?: string
): void {
  const doc = createTradeGeneralReportPDFDoc(report);
  const dateStr = fileDateSuffix || new Date().toISOString().slice(0, 10);
  doc.save(`Informe_General_TradeMarketing_Semanas_Por_Vendedor_${dateStr}.pdf`);
}
