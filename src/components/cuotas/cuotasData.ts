import {
  getSellerMetadata,
  isExcludedActivationSeller,
  normalizeSellerComparisonKey,
} from './sellerSupervisorMap';

export { isExcludedActivationSeller, normalizeSellerComparisonKey };

export interface RubroActivationData {
  meta: number;
  activados: number;
}

/**
 * Constante única centralizada con los 5 encabezados oficiales de productos
 * foco de activación del mes para Tarjetas de Métrica y Tablas Generales.
 */
export const ACTIVATION_PRODUCT_HEADERS = {
  AZUCAR: 'AZUCAR',
  LECHE_VENCAMPO: 'LECHE VENCAMPO',
  POLLO: 'POLLO',
  ESTANDAR_SUPERIOR_ASTURIAS: 'ESTANDAR Y SUPERIOR ASTURIAS',
  MORTADELA_SALPICAO_ASTURIAS: 'MORTADELA SALPICAO Y ASTURIAS',
} as const;

export const RUBROS_ACTIVACION_CLIENTES = [
  'AZUCAR',
  'LECHE_VENCAMPO',
  'POLLO',
  'ESTANDAR_SUPERIOR_ASTURIAS',
  'MORTADELA_SALPICAO_ASTURIAS',
] as const;

export type RubroClienteCodigo = typeof RUBROS_ACTIVACION_CLIENTES[number];

export const RUBRO_CLIENTE_LABEL: Record<RubroClienteCodigo, string> = {
  AZUCAR: ACTIVATION_PRODUCT_HEADERS.AZUCAR,
  LECHE_VENCAMPO: ACTIVATION_PRODUCT_HEADERS.LECHE_VENCAMPO,
  POLLO: ACTIVATION_PRODUCT_HEADERS.POLLO,
  ESTANDAR_SUPERIOR_ASTURIAS: ACTIVATION_PRODUCT_HEADERS.ESTANDAR_SUPERIOR_ASTURIAS,
  MORTADELA_SALPICAO_ASTURIAS: ACTIVATION_PRODUCT_HEADERS.MORTADELA_SALPICAO_ASTURIAS,
};

/**
 * Agrupación oficial de códigos Id Articulo de la hoja "Ventas" (gid=1176024108)
 * que alimentan cada una de las 5 categorías foco de activación del mes.
 */
export const ACTIVATION_CATEGORY_SKU_GROUPS: Record<RubroClienteCodigo, readonly string[]> = {
  AZUCAR: ['1543', '1550', '1571', '1248', '1438', '1489', '1502', '1507', '1095'],
  LECHE_VENCAMPO: ['1574', '1556', '1622', '1536', '1544', '1555', '1579'],
  POLLO: ['1568', '1478', '1142'],
  ESTANDAR_SUPERIOR_ASTURIAS: ['1461', '1463', '1467', '1472'],
  MORTADELA_SALPICAO_ASTURIAS: [
    '1496',
    '1624',
    '1625',
    '1519',
    '1462',
    '1464',
    '1468',
    '1471',
    '1511',
    '1512',
    '1521',
    '1522',
    '1561',
    '1562',
    '1563',
    '1564',
    '1599',
  ],
};

export const RUBROS_CONFIG = [
  {
    key: 'azucar',
    clientCode: 'AZUCAR' as RubroClienteCodigo,
    label: ACTIVATION_PRODUCT_HEADERS.AZUCAR,
    shortLabel: ACTIVATION_PRODUCT_HEADERS.AZUCAR,
  },
  {
    key: 'lecheVencampo',
    clientCode: 'LECHE_VENCAMPO' as RubroClienteCodigo,
    label: ACTIVATION_PRODUCT_HEADERS.LECHE_VENCAMPO,
    shortLabel: ACTIVATION_PRODUCT_HEADERS.LECHE_VENCAMPO,
  },
  {
    key: 'pollo',
    clientCode: 'POLLO' as RubroClienteCodigo,
    label: ACTIVATION_PRODUCT_HEADERS.POLLO,
    shortLabel: ACTIVATION_PRODUCT_HEADERS.POLLO,
  },
  {
    key: 'estandarSuperiorAsturias',
    clientCode: 'ESTANDAR_SUPERIOR_ASTURIAS' as RubroClienteCodigo,
    label: ACTIVATION_PRODUCT_HEADERS.ESTANDAR_SUPERIOR_ASTURIAS,
    shortLabel: ACTIVATION_PRODUCT_HEADERS.ESTANDAR_SUPERIOR_ASTURIAS,
  },
  {
    key: 'mortadelaSalpicaoAsturias',
    clientCode: 'MORTADELA_SALPICAO_ASTURIAS' as RubroClienteCodigo,
    label: ACTIVATION_PRODUCT_HEADERS.MORTADELA_SALPICAO_ASTURIAS,
    shortLabel: ACTIVATION_PRODUCT_HEADERS.MORTADELA_SALPICAO_ASTURIAS,
  },
] as const;

export type RubroKey = typeof RUBROS_CONFIG[number]['key'];

export interface SellerActivationRow {
  id: string;
  vendedor: string;
  cartera?: number;
  supervisor: string;
  zona: string;
  region: string;
  rubros: {
    azucar: RubroActivationData;
    lecheVencampo: RubroActivationData;
    pollo: RubroActivationData;
    estandarSuperiorAsturias: RubroActivationData;
    mortadelaSalpicaoAsturias: RubroActivationData;
  };
}

// Datos oficiales sincronizados de la pestaña "Cuotas de Activacion" (gid=1956715436) del Google Sheet (process.env.GOOGLE_SHEET_ID)
// Orden de metas y act: [azucar, lecheVencampo, pollo, estandarSuperiorAsturias, mortadelaSalpicaoAsturias]
const SHEET_ACTIVATION_SELLERS: Array<{
  name: string;
  cartera: number;
  metas: [number, number, number, number, number];
  act: [number, number, number, number, number];
}> = [
  { name: 'MARIA BRICEÑO', cartera: 125, metas: [70, 28, 40, 70, 40], act: [42, 34, 26, 31, 23] },
  { name: 'CUENTAS CLAVES 1 - MC', cartera: 37, metas: [23, 15, 20, 15, 23], act: [3, 0, 1, 1, 2] },
  { name: 'MIKELANGELO DIAZ', cartera: 90, metas: [61, 20, 45, 48, 63], act: [31, 34, 20, 29, 37] },
  { name: 'HERNAN PAZ', cartera: 65, metas: [40, 15, 12, 40, 32], act: [7, 6, 7, 12, 5] },
  { name: 'OSWALDO CHURION', cartera: 65, metas: [39, 15, 15, 35, 35], act: [11, 11, 2, 6, 9] },
  { name: 'OSCAR ORTIZ', cartera: 86, metas: [38, 20, 24, 16, 20], act: [19, 8, 14, 3, 8] },
  { name: 'CARLOS FUENMAYOR', cartera: 95, metas: [53, 30, 27, 38, 35], act: [14, 9, 10, 10, 8] },
  { name: 'SARAH REYES', cartera: 130, metas: [78, 25, 32, 50, 52], act: [29, 19, 8, 19, 15] },
  { name: 'J PABLO ARAUJO - CAB/OJE', cartera: 55, metas: [30, 15, 18, 20, 19], act: [19, 11, 8, 9, 9] },
  { name: 'JOSE G. GONZALEZ', cartera: 133, metas: [60, 28, 60, 40, 42], act: [23, 19, 27, 20, 22] },
  { name: 'ANGELICA MORENO', cartera: 87, metas: [52, 16, 62, 45, 57], act: [24, 13, 30, 11, 18] },
  { name: 'ADEL JARABA', cartera: 84, metas: [55, 15, 42, 35, 62], act: [25, 12, 14, 13, 21] },
  { name: 'JUAN HERNANDEZ', cartera: 104, metas: [55, 25, 12, 50, 30], act: [21, 15, 7, 17, 15] },
  { name: 'YOLEIDA LUGO', cartera: 94, metas: [58, 50, 47, 35, 43], act: [25, 32, 13, 16, 6] },
  { name: 'CUENTAS CLAVES 2 - SV', cartera: 36, metas: [20, 18, 16, 16, 20], act: [0, 0, 0, 0, 0] },
  { name: 'ELISA SOLER', cartera: 158, metas: [100, 53, 94, 70, 60], act: [70, 52, 45, 39, 17] },
  { name: 'ANGEL NAVARRO', cartera: 58, metas: [40, 27, 20, 15, 15], act: [12, 11, 7, 5, 10] },
  { name: 'J PABLO ARAUJO', cartera: 150, metas: [90, 56, 75, 55, 55], act: [72, 46, 43, 33, 18] },
  { name: 'EDUARDO PIÑA', cartera: 174, metas: [80, 41, 25, 30, 32], act: [38, 21, 6, 10, 14] },
  { name: 'LEONARDO RIOS', cartera: 80, metas: [52, 15, 30, 28, 30], act: [20, 14, 6, 11, 14] },
  { name: 'MARYERY GARCIA', cartera: 148, metas: [95, 51, 65, 60, 70], act: [58, 48, 37, 32, 30] },
  { name: 'LUIS GUANIPA', cartera: 52, metas: [35, 10, 12, 20, 25], act: [14, 11, 2, 5, 5] },
  { name: 'PEDRO ABREU', cartera: 57, metas: [35, 15, 18, 20, 30], act: [18, 16, 5, 10, 18] },
  { name: 'MARIANGEL GONZALEZ', cartera: 70, metas: [42, 15, 40, 15, 35], act: [30, 25, 18, 8, 9] },
  { name: 'VICTOR CAMPOS', cartera: 71, metas: [43, 15, 25, 20, 35], act: [22, 22, 9, 13, 7] },
];

export const INITIAL_SELLERS_ACTIVATION: SellerActivationRow[] = SHEET_ACTIVATION_SELLERS.map((s, idx) => {
  const meta = getSellerMetadata(s.name);
  return {
    id: `seller-${idx + 1}`,
    vendedor: s.name,
    cartera: s.cartera,
    supervisor: meta.supervisor,
    zona: meta.zona,
    region: meta.region,
    rubros: {
      azucar: { meta: s.metas[0], activados: s.act[0] },
      lecheVencampo: { meta: s.metas[1], activados: s.act[1] },
      pollo: { meta: s.metas[2], activados: s.act[2] },
      estandarSuperiorAsturias: { meta: s.metas[3], activados: s.act[3] },
      mortadelaSalpicaoAsturias: { meta: s.metas[4], activados: s.act[4] },
    },
  };
});

/**
 * Filtra únicamente las filas de la pestaña de "Activación" excluyendo
 * "cuentas claves 1 - MC" y "cuentas claves 2- SV" sin mutar el arreglo original.
 */
export const filterActivationSellers = (
  rows: SellerActivationRow[]
): SellerActivationRow[] => {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => !isExcludedActivationSeller(row.vendedor));
};
