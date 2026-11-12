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

// Datos oficiales sincronizados de la pestaña "Cuotas de Activacion" (gid=1956715436) del Google Sheet 16pU4iEcNU_1j6sB7rZbshu2PM8OyH5hI7a24-vYO7P0
// Orden de metas y act: [azucar, lecheVencampo, pollo, estandarSuperiorAsturias, mortadelaSalpicaoAsturias]
const SHEET_ACTIVATION_SELLERS: Array<{
  name: string;
  cartera: number;
  metas: [number, number, number, number, number];
  act: [number, number, number, number, number];
}> = [
  { name: 'MARIA BRICEÑO', cartera: 125, metas: [70, 28, 40, 70, 40], act: [24, 16, 20, 15, 13] },
  { name: 'CUENTAS CLAVES 1 - MC', cartera: 37, metas: [23, 15, 20, 15, 23], act: [3, 0, 1, 1, 2] },
  { name: 'MIKELANGELO DIAZ', cartera: 90, metas: [61, 20, 45, 48, 63], act: [17, 11, 12, 7, 11] },
  { name: 'HERNAN PAZ', cartera: 65, metas: [40, 15, 12, 40, 32], act: [3, 2, 2, 5, 1] },
  { name: 'OSWALDO CHURION', cartera: 65, metas: [39, 15, 15, 35, 35], act: [6, 2, 0, 3, 3] },
  { name: 'OSCAR ORTIZ', cartera: 86, metas: [38, 20, 24, 16, 20], act: [16, 4, 12, 3, 6] },
  { name: 'CARLOS FUENMAYOR', cartera: 95, metas: [53, 30, 27, 38, 35], act: [6, 3, 9, 5, 3] },
  { name: 'SARAH REYES', cartera: 130, metas: [78, 25, 32, 50, 52], act: [15, 12, 6, 12, 10] },
  { name: 'J PABLO ARAUJO - CAB/OJE', cartera: 55, metas: [30, 15, 18, 20, 19], act: [9, 9, 5, 2, 6] },
  { name: 'JOSE G. GONZALEZ', cartera: 133, metas: [60, 28, 60, 40, 42], act: [14, 17, 26, 12, 15] },
  { name: 'ANGELICA MORENO', cartera: 87, metas: [52, 16, 62, 45, 57], act: [10, 3, 11, 6, 5] },
  { name: 'ADEL JARABA', cartera: 84, metas: [55, 15, 42, 35, 62], act: [8, 0, 7, 2, 5] },
  { name: 'JUAN HERNANDEZ', cartera: 104, metas: [55, 25, 12, 50, 30], act: [12, 7, 5, 11, 10] },
  { name: 'YOLEIDA LUGO', cartera: 94, metas: [58, 50, 47, 35, 43], act: [16, 24, 8, 9, 6] },
  { name: 'CUENTAS CLAVES 2 - SV', cartera: 36, metas: [20, 18, 16, 16, 20], act: [0, 0, 0, 0, 0] },
  { name: 'ELISA SOLER', cartera: 158, metas: [100, 53, 94, 70, 60], act: [59, 42, 33, 31, 11] },
  { name: 'ANGEL NAVARRO', cartera: 58, metas: [40, 27, 20, 15, 15], act: [10, 10, 6, 3, 7] },
  { name: 'J PABLO ARAUJO', cartera: 150, metas: [90, 56, 75, 55, 55], act: [46, 37, 29, 21, 7] },
  { name: 'EDUARDO PIÑA', cartera: 174, metas: [80, 41, 25, 30, 32], act: [24, 8, 2, 5, 7] },
  { name: 'LEONARDO RIOS', cartera: 80, metas: [52, 15, 30, 28, 30], act: [14, 8, 5, 5, 10] },
  { name: 'MARYERY GARCIA', cartera: 148, metas: [95, 51, 65, 60, 70], act: [27, 22, 23, 17, 13] },
  { name: 'LUIS GUANIPA', cartera: 52, metas: [35, 10, 12, 20, 25], act: [12, 13, 2, 4, 5] },
  { name: 'PEDRO ABREU', cartera: 57, metas: [35, 15, 18, 20, 30], act: [1, 2, 3, 2, 1] },
  { name: 'MARIANGEL GONZALEZ', cartera: 70, metas: [42, 15, 40, 15, 35], act: [22, 11, 16, 3, 7] },
  { name: 'VICTOR CAMPOS', cartera: 71, metas: [43, 15, 25, 20, 35], act: [11, 16, 5, 6, 4] },
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
