import Papa from 'papaparse';
import { normalizeSellerName } from './sellerSupervisorMap';

export interface SkuQuotaRealPair {
  q: number;
  r: number;
}

export interface SellerVolumeQuota {
  kgs: number;
  realKgsOct: number;
  cajas: number;
  monto: number;
  byCat?: {
    aceite: SkuQuotaRealPair;
    azucar: SkuQuotaRealPair;
    pollo: SkuQuotaRealPair;
    estandarAsturias: SkuQuotaRealPair;
    mortadelaSalpicaoAsturias: SkuQuotaRealPair;
  };
}

// Metas y ejecución oficial de volumen mensual sincronizadas exactamente con la pestaña "Cuotas Volumen" del Google Sheet (process.env.GOOGLE_SHEET_ID)
export const SELLER_VOLUME_QUOTAS: Record<string, SellerVolumeQuota> = {
  // ==========================================
  // SUPERVISOR: NELSON FINOL (12 Carteras de Vendedores)
  // ==========================================
  'CARLOS FUENMAYOR': {
    kgs: 135530.30,
    realKgsOct: 69251.50,
    cajas: 18762,
    monto: 255687,
    byCat: {
      aceite: { q: 11330.70, r: 1728.90 },
      azucar: { q: 20564.70, r: 25480.00 },
      pollo: { q: 15619.70, r: 6412.30 },
      estandarAsturias: { q: 2075.40, r: 674.50 },
      mortadelaSalpicaoAsturias: { q: 3585.40, r: 1662.40 },
    },
  },
  'EDUARDO PIÑA': {
    kgs: 90851.30,
    realKgsOct: 33717.30,
    cajas: 17030,
    monto: 269533,
    byCat: {
      aceite: { q: 1960.00, r: 755.10 },
      azucar: { q: 9462.30, r: 4500.00 },
      pollo: { q: 14526.90, r: 4222.30 },
      estandarAsturias: { q: 780.20, r: 326.30 },
      mortadelaSalpicaoAsturias: { q: 4224.70, r: 1759.00 },
    },
  },
  'J PABLO ARAUJO': {
    kgs: 167407.40,
    realKgsOct: 73838.10,
    cajas: 75372,
    monto: 513755,
    byCat: {
      aceite: { q: 6385.50, r: 1171.60 },
      azucar: { q: 11618.90, r: 1059.00 },
      pollo: { q: 67220.60, r: 31049.80 },
      estandarAsturias: { q: 731.20, r: 309.20 },
      mortadelaSalpicaoAsturias: { q: 4277.50, r: 1182.70 },
    },
  },
  'J PABLO ARAUJO - CAB/OJE': {
    kgs: 69456.60,
    realKgsOct: 27761.40,
    cajas: 21697,
    monto: 201275,
    byCat: {
      aceite: { q: 2470.70, r: 49.70 },
      azucar: { q: 5555.70, r: 4100.00 },
      pollo: { q: 16066.70, r: 6911.10 },
      estandarAsturias: { q: 241.70, r: 182.60 },
      mortadelaSalpicaoAsturias: { q: 9407.60, r: 730.50 },
    },
  },
  'JOSE G. GONZALEZ': {
    kgs: 101468.30,
    realKgsOct: 35174.30,
    cajas: 69241,
    monto: 306952,
    byCat: {
      aceite: { q: 13777.60, r: 864.40 },
      azucar: { q: 15188.80, r: 2899.00 },
      pollo: { q: 34451.00, r: 23344.80 },
      estandarAsturias: { q: 322.80, r: 222.60 },
      mortadelaSalpicaoAsturias: { q: 5664.70, r: 1236.10 },
    },
  },
  'MARIA BRICEÑO': {
    kgs: 102146.20,
    realKgsOct: 32454.70,
    cajas: 41314,
    monto: 345138,
    byCat: {
      aceite: { q: 2826.60, r: 725.30 },
      azucar: { q: 11954.10, r: 3980.00 },
      pollo: { q: 26773.70, r: 9418.00 },
      estandarAsturias: { q: 2431.70, r: 1377.30 },
      mortadelaSalpicaoAsturias: { q: 6248.50, r: 4986.00 },
    },
  },
  'CUENTAS CLAVES 1 - MC': {
    kgs: 91100.20,
    realKgsOct: 55588.80,
    cajas: 13452,
    monto: 191272,
    byCat: {
      aceite: { q: 9448.00, r: 6657.10 },
      azucar: { q: 25401.80, r: 24520.00 },
      pollo: { q: 16207.30, r: 3425.80 },
      estandarAsturias: { q: 817.70, r: 633.60 },
      mortadelaSalpicaoAsturias: { q: 4863.40, r: 2677.80 },
    },
  },
  'CUENTAS CLAVES 2 - SV': {
    kgs: 312852.50,
    realKgsOct: 127331.60,
    cajas: 49506,
    monto: 572246,
    byCat: {
      aceite: { q: 54022.00, r: 9122.10 },
      azucar: { q: 97438.10, r: 65360.00 },
      pollo: { q: 16152.60, r: 15278.40 },
      estandarAsturias: { q: 0.00, r: 0.00 },
      mortadelaSalpicaoAsturias: { q: 22670.50, r: 11216.10 },
    },
  },
  'MARYERY GARCIA': {
    kgs: 198346.65,
    realKgsOct: 79710.90,
    cajas: 82063,
    monto: 516468,
    byCat: {
      aceite: { q: 5082.10, r: 2166.10 },
      azucar: { q: 30154.50, r: 11019.00 },
      pollo: { q: 54664.80, r: 26808.40 },
      estandarAsturias: { q: 1084.95, r: 531.30 },
      mortadelaSalpicaoAsturias: { q: 9416.50, r: 4050.90 },
    },
  },
  'PEDRO ABREU': {
    kgs: 57593.81,
    realKgsOct: 28200.40,
    cajas: 12339,
    monto: 104602,
    byCat: {
      aceite: { q: 14046.80, r: 993.60 },
      azucar: { q: 14090.60, r: 13039.00 },
      pollo: { q: 7034.10, r: 4149.70 },
      estandarAsturias: { q: 199.50, r: 188.60 },
      mortadelaSalpicaoAsturias: { q: 9768.91, r: 3446.90 },
    },
  },
  'SARAH REYES': {
    kgs: 99731.20,
    realKgsOct: 47560.00,
    cajas: 21526,
    monto: 302845,
    byCat: {
      aceite: { q: 5135.30, r: 844.60 },
      azucar: { q: 25864.90, r: 3779.00 },
      pollo: { q: 17539.30, r: 7857.60 },
      estandarAsturias: { q: 1077.30, r: 576.10 },
      mortadelaSalpicaoAsturias: { q: 4159.70, r: 3422.90 },
    },
  },
  'YOLEIDA LUGO': {
    kgs: 125500.85,
    realKgsOct: 50083.10,
    cajas: 42432,
    monto: 303464,
    byCat: {
      aceite: { q: 5405.90, r: 884.30 },
      azucar: { q: 26877.20, r: 11417.00 },
      pollo: { q: 43425.30, r: 14849.10 },
      estandarAsturias: { q: 905.95, r: 433.40 },
      mortadelaSalpicaoAsturias: { q: 9859.30, r: 4823.90 },
    },
  },

  // ==========================================
  // SUPERVISOR: JOHNATAN SOTO (6 Carteras de Vendedores — Clientes de Johnatan pasaron a Mikelangelo Diaz)
  // ==========================================
  'MIKELANGELO DIAZ': {
    kgs: 282702.65,
    realKgsOct: 39428.00,
    cajas: 113157,
    monto: 732062,
    byCat: {
      aceite: { q: 2882.80, r: 943.10 },
      azucar: { q: 90853.80, r: 4060.00 },
      pollo: { q: 78162.65, r: 18709.10 },
      estandarAsturias: { q: 1549.60, r: 1336.70 },
      mortadelaSalpicaoAsturias: { q: 9575.90, r: 5437.40 },
    },
  },
  'ADEL JARABA': {
    kgs: 116107.40,
    realKgsOct: 28707.90,
    cajas: 20968,
    monto: 204782,
    byCat: {
      aceite: { q: 4560.40, r: 586.20 },
      azucar: { q: 33162.40, r: 13180.00 },
      pollo: { q: 11432.80, r: 3693.50 },
      estandarAsturias: { q: 1195.70, r: 182.30 },
      mortadelaSalpicaoAsturias: { q: 6394.70, r: 1289.60 },
    },
  },
  'ANGELICA MORENO': {
    kgs: 114477.20,
    realKgsOct: 38710.00,
    cajas: 46454,
    monto: 255853,
    byCat: {
      aceite: { q: 2332.10, r: 586.20 },
      azucar: { q: 25382.50, r: 3060.00 },
      pollo: { q: 37308.50, r: 15024.20 },
      estandarAsturias: { q: 786.60, r: 491.40 },
      mortadelaSalpicaoAsturias: { q: 3940.30, r: 1118.90 },
    },
  },
  'HERNAN PAZ': {
    kgs: 63343.48,
    realKgsOct: 29184.60,
    cajas: 16469,
    monto: 232008,
    byCat: {
      aceite: { q: 2954.79, r: 367.60 },
      azucar: { q: 5474.40, r: 2798.00 },
      pollo: { q: 12531.00, r: 3554.80 },
      estandarAsturias: { q: 1860.40, r: 393.30 },
      mortadelaSalpicaoAsturias: { q: 9468.90, r: 6100.40 },
    },
  },
  'JUAN HERNANDEZ': {
    kgs: 95328.85,
    realKgsOct: 43346.20,
    cajas: 19493,
    monto: 266033,
    byCat: {
      aceite: { q: 4719.10, r: 3020.50 },
      azucar: { q: 21739.50, r: 2339.00 },
      pollo: { q: 17348.73, r: 8689.20 },
      estandarAsturias: { q: 2053.50, r: 997.10 },
      mortadelaSalpicaoAsturias: { q: 3977.80, r: 2019.30 },
    },
  },
  'OSWALDO CHURION': {
    kgs: 103001.08,
    realKgsOct: 34991.90,
    cajas: 44900,
    monto: 386332,
    byCat: {
      aceite: { q: 3494.60, r: 616.00 },
      azucar: { q: 15872.90, r: 2580.00 },
      pollo: { q: 20831.80, r: 7493.50 },
      estandarAsturias: { q: 1072.30, r: 582.70 },
      mortadelaSalpicaoAsturias: { q: 5768.90, r: 3284.60 },
    },
  },

  // ==========================================
  // SUPERVISOR: ALI PEREZ (7 Carteras de Vendedores — Clientes de Ali Perez pasaron a Angel Navarro, Mariangel Gonzalez y Victor Campos)
  // ==========================================
  'ANGEL NAVARRO': {
    kgs: 24254.70,
    realKgsOct: 6537.70,
    cajas: 7581,
    monto: 56860,
    byCat: {
      aceite: { q: 1631.10, r: 198.70 },
      azucar: { q: 8013.60, r: 500.00 },
      pollo: { q: 8911.40, r: 2930.50 },
      estandarAsturias: { q: 112.00, r: 45.70 },
      mortadelaSalpicaoAsturias: { q: 1466.10, r: 815.50 },
    },
  },
  'MARIANGEL GONZALEZ': {
    kgs: 50976.60,
    realKgsOct: 21947.00,
    cajas: 26752,
    monto: 200638,
    byCat: {
      aceite: { q: 2484.60, r: 645.00 },
      azucar: { q: 11172.00, r: 3860.00 },
      pollo: { q: 21734.10, r: 10467.50 },
      estandarAsturias: { q: 190.90, r: 68.50 },
      mortadelaSalpicaoAsturias: { q: 2248.70, r: 1401.50 },
    },
  },
  'VICTOR CAMPOS': {
    kgs: 110884.60,
    realKgsOct: 53578.90,
    cajas: 25767,
    monto: 193252,
    byCat: {
      aceite: { q: 25303.70, r: 8909.10 },
      azucar: { q: 26461.20, r: 4260.00 },
      pollo: { q: 31583.40, r: 17045.80 },
      estandarAsturias: { q: 230.00, r: 142.80 },
      mortadelaSalpicaoAsturias: { q: 4315.50, r: 3808.40 },
    },
  },
  'ELISA SOLER': {
    kgs: 217504.70,
    realKgsOct: 135256.10,
    cajas: 70118,
    monto: 537101,
    byCat: {
      aceite: { q: 24880.50, r: 7034.70 },
      azucar: { q: 47203.60, r: 53516.00 },
      pollo: { q: 49727.10, r: 30987.00 },
      estandarAsturias: { q: 1117.50, r: 749.60 },
      mortadelaSalpicaoAsturias: { q: 8513.50, r: 4910.10 },
    },
  },
  'LEONARDO RIOS': {
    kgs: 116984.97,
    realKgsOct: 34251.50,
    cajas: 46854,
    monto: 326999,
    byCat: {
      aceite: { q: 30828.45, r: 1758.70 },
      azucar: { q: 13288.30, r: 6000.00 },
      pollo: { q: 20480.90, r: 10660.10 },
      estandarAsturias: { q: 427.20, r: 536.40 },
      mortadelaSalpicaoAsturias: { q: 5323.32, r: 1707.40 },
    },
  },
  'LUIS GUANIPA': {
    kgs: 24017.07,
    realKgsOct: 6680.80,
    cajas: 8704,
    monto: 101299,
    byCat: {
      aceite: { q: 2502.30, r: 318.00 },
      azucar: { q: 3872.40, r: 1020.00 },
      pollo: { q: 6100.57, r: 965.20 },
      estandarAsturias: { q: 392.40, r: 57.10 },
      mortadelaSalpicaoAsturias: { q: 2350.10, r: 599.70 },
    },
  },
  'OSCAR ORTIZ': {
    kgs: 23666.38,
    realKgsOct: 10284.10,
    cajas: 7477,
    monto: 70066,
    byCat: {
      aceite: { q: 1548.30, r: 168.90 },
      azucar: { q: 2593.90, r: 1220.00 },
      pollo: { q: 1333.10, r: 2145.10 },
      estandarAsturias: { q: 306.50, r: 85.40 },
      mortadelaSalpicaoAsturias: { q: 10521.40, r: 871.10 },
    },
  },
};

// Feriados regionales/nacionales no laborables por mes (YYYY-MM -> días del mes sin despacho)
// En Octubre 2026 en Zulia: Sábado 24 de Octubre (Natalicio de Rafael Urdaneta) -> 27 L-S menos 1 = 26 días laborables
const NON_WORKING_HOLIDAYS_BY_PERIOD: Record<string, number[]> = {
  '2026-10': [24],
};

export interface MonthWorkingProgress {
  year: number;
  month: number; // 1-12
  dayOfMonth: number;
  monthName: string;
  cutoffDateLabel: string;
  diasLaborables: number;
  diasTranscurridos: number;
  diasRestantes: number;
  recorridoPct: number;
}

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const calculateMonthWorkingProgress = (referenceDate: Date = new Date()): MonthWorkingProgress => {
  let year = referenceDate.getFullYear();
  let month = referenceDate.getMonth() + 1;
  let dayOfMonth = referenceDate.getDate();

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(referenceDate);
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    if (y && m && d) {
      year = y;
      month = m;
      dayOfMonth = d;
    }
  } catch {
    // Fallback a hora local del navegador
  }

  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const holidays = new Set(NON_WORKING_HOLIDAYS_BY_PERIOD[periodKey] || []);
  const daysInMonth = new Date(year, month, 0).getDate();

  let diasLaborables = 0;
  let diasTranscurridos = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0 = Domingo, 1..6 = Lunes..Sábado
    const isWorkingDay = dow !== 0 && !holidays.has(d);
    if (isWorkingDay) {
      diasLaborables++;
      if (d <= dayOfMonth) {
        diasTranscurridos++;
      }
    }
  }

  diasLaborables = Math.max(1, diasLaborables);
  diasTranscurridos = Math.min(diasLaborables, Math.max(1, diasTranscurridos));
  const diasRestantes = Math.max(0, diasLaborables - diasTranscurridos);
  const recorridoPct = Number(((diasTranscurridos / diasLaborables) * 100).toFixed(1));
  const monthName = MONTH_NAMES_ES[month - 1] || 'Octubre';
  const cutoffDateLabel = `${String(dayOfMonth).padStart(2, '0')} ${monthName.slice(0, 3)} ${year}`;

  return {
    year,
    month,
    dayOfMonth,
    monthName,
    cutoffDateLabel,
    diasLaborables,
    diasTranscurridos,
    diasRestantes,
    recorridoPct,
  };
};

// Días laborables y transcurridos calculados dinámicamente al día actual (Calendario Comercial Lunes a Sábado)
const INITIAL_MONTH_PROGRESS = calculateMonthWorkingProgress();
export const DEFAULT_DIAS_LABORABLES = INITIAL_MONTH_PROGRESS.diasLaborables;
export const DEFAULT_DIAS_TRANSCURRIDOS = INITIAL_MONTH_PROGRESS.diasTranscurridos;
export const META_AL_DIA_PCT = INITIAL_MONTH_PROGRESS.recorridoPct;

export const SKU_FILTER_OPTIONS = [
  { id: 'ALL', label: 'Todos los SKUs (Cuotas Volumen)' },
  { id: 'aceite', label: 'Aceite Comestible' },
  { id: 'azucar', label: 'Azúcar Refinada' },
  { id: 'pollo', label: 'Pollo Beneficiado' },
  { id: 'estandarAsturias', label: 'Estándar y Superior Asturias' },
  { id: 'mortadelaSalpicaoAsturias', label: 'Mortadela Salpicao y Asturias' },
];

export const hasVolumeQuota = (sellerName: string): boolean => {
  const norm = normalizeSellerName(sellerName);
  return Boolean(SELLER_VOLUME_QUOTAS[norm]);
};

export const getSellerVolumeQuota = (
  sellerName: string,
  metric: 'kgs' | 'cajas' | 'monto' = 'kgs',
  skuFilter: string = 'ALL'
): number => {
  const norm = normalizeSellerName(sellerName);
  const q = SELLER_VOLUME_QUOTAS[norm];
  if (!q) return 0;

  if (skuFilter && skuFilter !== 'ALL' && q.byCat) {
    const cat = q.byCat[skuFilter as keyof typeof q.byCat];
    if (cat) {
      if (metric === 'kgs') return cat.q;
      const ratio = q.kgs > 0 ? cat.q / q.kgs : 0;
      return Math.round(q[metric] * ratio);
    }
  }

  return q[metric];
};

export const getSellerOctoberRealFromSheet = (
  sellerName: string,
  skuFilter: string = 'ALL'
): number | null => {
  const norm = normalizeSellerName(sellerName);
  const q = SELLER_VOLUME_QUOTAS[norm];
  if (!q) return null;

  if (skuFilter && skuFilter !== 'ALL' && q.byCat) {
    const cat = q.byCat[skuFilter as keyof typeof q.byCat];
    if (cat) return cat.r;
  }

  return q.realKgsOct;
};

// Sincroniza en vivo las cuotas de volumen desde la pestaña "Cuotas Volumen" del Google Sheet (process.env.GOOGLE_SHEET_ID vía /api/sheets)
let volumeQuotasSynced = false;
export const syncVolumeQuotasFromGoogleSheet = async (force = false): Promise<boolean> => {
  if (volumeQuotasSynced && !force) return true;
  try {
    let csvText = '';
    const sheetParam = encodeURIComponent('Cuotas Volumen');
    try {
      const res = await fetch(`/api/sheets?raw=true&sheet=${sheetParam}${force ? '&refresh=true' : ''}`);
      if (res.ok) csvText = await res.text();
    } catch {
      // ignore network error and use static seed fallback
    }
    if (!csvText) return false;

    const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: true });
    const rows = parsed.data as string[][];
    if (!rows || rows.length < 2) return false;

    const header = rows[0];
    const parseNum = (v: any) => {
      if (!v || v === '-') return 0;
      const n = parseFloat(String(v).replace(/,/g, '').replace('%', '').trim());
      return isNaN(n) ? 0 : n;
    };

    const tempAccum = new Map<
      string,
      {
        kgs: number;
        realKgsOct: number;
        byCat: {
          aceite: SkuQuotaRealPair;
          azucar: SkuQuotaRealPair;
          pollo: SkuQuotaRealPair;
          estandarAsturias: SkuQuotaRealPair;
          mortadelaSalpicaoAsturias: SkuQuotaRealPair;
        };
      }
    >();

    const row0 = rows[0] || [];
    const row1 = rows[1] || [];
    const isDoubleHeader =
      (row1[0] || '').trim().toUpperCase() === 'COD' ||
      (row1[1] || '').trim().toUpperCase().startsWith('ARTICULO');
    const dataStartRow = isDoubleHeader ? 2 : 1;

    // Las últimas 3 ternas de columnas corresponden a los consolidados de los 3 supervisores; iteramos solo las columnas de vendedores
    const maxCol = Math.min(row0.length - 9, 2 + 30 * 3);
    for (let c = 2; c < maxCol; c += 3) {
      const rawHeader = (row0[c] || '')
        .toUpperCase()
        .replace(/\s*CUOTA(\s*KG)?$/i, '')
        .replace(/\s*VENTA(\s*KG)?$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (
        !rawHeader ||
        rawHeader === 'ALI PEREZ' ||
        rawHeader === 'ALÍ PÉREZ' ||
        rawHeader === 'JOHNATAN SOTO' ||
        rawHeader === 'NELSON FINOL'
      ) {
        continue;
      }
      const normSeller = normalizeSellerName(rawHeader);
      if (!SELLER_VOLUME_QUOTAS[normSeller]) continue;

      if (!tempAccum.has(normSeller)) {
        tempAccum.set(normSeller, {
          kgs: 0,
          realKgsOct: 0,
          byCat: {
            aceite: { q: 0, r: 0 },
            azucar: { q: 0, r: 0 },
            pollo: { q: 0, r: 0 },
            estandarAsturias: { q: 0, r: 0 },
            mortadelaSalpicaoAsturias: { q: 0, r: 0 },
          },
        });
      }
      const acc = tempAccum.get(normSeller)!;

      for (let r = dataStartRow; r < rows.length; r++) {
        const row = rows[r];
        const cod = (row[0] || '').trim();
        const art = (row[1] || '').trim().toUpperCase();
        if (!art) continue;

        const q = parseNum(row[c]);
        const real = parseNum(row[c + 1]);
        acc.kgs += q;
        acc.realKgsOct += real;

        if (art.includes('ACEITE')) {
          acc.byCat.aceite.q += q;
          acc.byCat.aceite.r += real;
        }
        if (art.includes('AZUCAR')) {
          acc.byCat.azucar.q += q;
          acc.byCat.azucar.r += real;
        }
        if (
          art.includes('POLLO') ||
          art.includes('FILET') ||
          art.includes('MUSLO') ||
          art.includes('ALAS') ||
          art.includes('MOLLEJA') ||
          art.includes('HIGADO')
        ) {
          if (!art.includes('MORT') && !art.includes('JAMON') && !art.includes('SALCHICHA')) {
            acc.byCat.pollo.q += q;
            acc.byCat.pollo.r += real;
          }
        }
        if (cod === '1461' || cod === '1463' || (art.includes('JAMON') && art.includes('ASTURIAS'))) {
          acc.byCat.estandarAsturias.q += q;
          acc.byCat.estandarAsturias.r += real;
        }
        if (
          art.includes('MORT') &&
          (art.includes('ASTURIAS') || art.includes('SALPICAO')) &&
          cod !== '1461' &&
          cod !== '1463'
        ) {
          acc.byCat.mortadelaSalpicaoAsturias.q += q;
          acc.byCat.mortadelaSalpicaoAsturias.r += real;
        }
      }
    }

    tempAccum.forEach((val, seller) => {
      if (SELLER_VOLUME_QUOTAS[seller] && val.kgs > 0) {
        const prev = SELLER_VOLUME_QUOTAS[seller];
        const ratio = prev.kgs > 0 ? val.kgs / prev.kgs : 1;
        SELLER_VOLUME_QUOTAS[seller] = {
          ...prev,
          kgs: Number(val.kgs.toFixed(2)),
          realKgsOct: prev.realKgsOct,
          cajas: Math.round(prev.cajas * ratio),
          monto: Math.round(prev.monto * ratio),
          byCat: {
            aceite: {
              q: Number(val.byCat.aceite.q.toFixed(2)),
              r: prev.byCat?.aceite.r ?? Number(val.byCat.aceite.r.toFixed(2)),
            },
            azucar: {
              q: Number(val.byCat.azucar.q.toFixed(2)),
              r: prev.byCat?.azucar.r ?? Number(val.byCat.azucar.r.toFixed(2)),
            },
            pollo: {
              q: Number(val.byCat.pollo.q.toFixed(2)),
              r: prev.byCat?.pollo.r ?? Number(val.byCat.pollo.r.toFixed(2)),
            },
            estandarAsturias: {
              q: Number(val.byCat.estandarAsturias.q.toFixed(2)),
              r: prev.byCat?.estandarAsturias.r ?? Number(val.byCat.estandarAsturias.r.toFixed(2)),
            },
            mortadelaSalpicaoAsturias: {
              q: Number(val.byCat.mortadelaSalpicaoAsturias.q.toFixed(2)),
              r: prev.byCat?.mortadelaSalpicaoAsturias.r ?? Number(val.byCat.mortadelaSalpicaoAsturias.r.toFixed(2)),
            },
          },
        };
      }
    });

    volumeQuotasSynced = true;
    return true;
  } catch (e) {
    console.warn('Fallback to static volume quotas:', e);
    return false;
  }
};
