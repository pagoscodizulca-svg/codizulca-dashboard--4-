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
    jamonAsturias: RubroActivationData;
    mortadelaAsturias: RubroActivationData;
    salpicao: RubroActivationData;
  };
}

export const RUBROS_CONFIG = [
  { key: 'azucar', label: 'Azúcar', shortLabel: 'Azúcar' },
  { key: 'lecheVencampo', label: 'Leche en polvo Vencampo', shortLabel: 'Leche en polvo Vencampo' },
  {
    key: 'jamonAsturias',
    label: 'Jamón estándar y superior Asturias',
    shortLabel: 'Jamón estándar y superior Asturias',
  },
  { key: 'mortadelaAsturias', label: 'Mortadela Asturias', shortLabel: 'Mortadela Asturias' },
  { key: 'salpicao', label: 'Salpicao', shortLabel: 'Salpicao' },
] as const;

export type RubroKey = typeof RUBROS_CONFIG[number]['key'];

// Datos oficiales sincronizados de las 25 carteras activas de la Fuerza de Ventas (Google Sheet 16pU4iEcNU_1j6sB7rZbshu2PM8OyH5hI7a24-vYO7P0 - Noviembre 2026)
// Orden de metas y act: [azucar, lecheVencampo, jamonAsturias, mortadelaAsturias, salpicao]
const SHEET_ACTIVATION_SELLERS: Array<{
  name: string;
  cartera: number;
  metas: [number, number, number, number, number];
  act: [number, number, number, number, number];
}> = [
  { name: 'MARIA BRICEÑO', cartera: 125, metas: [70, 28, 40, 70, 40], act: [24, 16, 20, 15, 13] },
  { name: 'CUENTAS CLAVES 1 - MC', cartera: 37, metas: [23, 15, 20, 15, 23], act: [6, 8, 5, 12, 4] },
  { name: 'MIKELANGELO DIAZ', cartera: 90, metas: [61, 20, 45, 48, 63], act: [17, 11, 12, 7, 11] },
  { name: 'HERNAN PAZ', cartera: 65, metas: [40, 15, 12, 40, 32], act: [3, 2, 2, 5, 1] },
  { name: 'OSWALDO CHURION', cartera: 65, metas: [39, 15, 15, 35, 35], act: [6, 2, 0, 3, 3] },
  { name: 'CARLOS FUENMAYOR', cartera: 95, metas: [53, 30, 27, 38, 35], act: [6, 3, 9, 5, 3] },
  { name: 'SARAH REYES', cartera: 130, metas: [78, 25, 32, 50, 52], act: [15, 12, 6, 12, 10] },
  { name: 'J PABLO ARAUJO - CAB/OJE', cartera: 55, metas: [30, 15, 18, 20, 19], act: [9, 9, 5, 2, 6] },
  { name: 'JOSE G. GONZALEZ', cartera: 133, metas: [60, 28, 60, 40, 42], act: [14, 13, 24, 10, 11] },
  { name: 'ANGELICA MORENO', cartera: 87, metas: [52, 16, 62, 45, 57], act: [10, 3, 11, 6, 5] },
  { name: 'ADEL JARABA', cartera: 84, metas: [55, 15, 42, 35, 62], act: [8, 0, 7, 2, 5] },
  { name: 'JUAN HERNANDEZ', cartera: 104, metas: [55, 25, 12, 50, 30], act: [12, 7, 5, 11, 10] },
  { name: 'YOLEIDA LUGO', cartera: 94, metas: [58, 50, 47, 35, 43], act: [16, 19, 3, 0, 0] },
  { name: 'CUENTAS CLAVES 2 - SV', cartera: 36, metas: [20, 18, 16, 16, 20], act: [1, 18, 0, 15, 0] },
  { name: 'ELISA SOLER', cartera: 158, metas: [100, 53, 94, 70, 60], act: [55, 33, 24, 21, 7] },
  { name: 'ANGEL NAVARRO', cartera: 58, metas: [40, 27, 20, 15, 15], act: [5, 6, 2, 2, 2] },
  { name: 'MARIANGEL GONZALEZ', cartera: 70, metas: [42, 15, 40, 15, 35], act: [11, 7, 9, 1, 4] },
  { name: 'VICTOR CAMPOS', cartera: 71, metas: [43, 15, 25, 20, 35], act: [3, 8, 3, 2, 2] },
  { name: 'J PABLO ARAUJO', cartera: 150, metas: [90, 56, 75, 55, 55], act: [46, 37, 29, 21, 7] },
  { name: 'EDUARDO PIÑA', cartera: 174, metas: [80, 41, 25, 30, 32], act: [24, 8, 2, 5, 7] },
  { name: 'LEONARDO RIOS', cartera: 80, metas: [52, 15, 30, 28, 30], act: [6, 3, 4, 4, 4] },
  { name: 'MARYERY GARCIA', cartera: 148, metas: [95, 51, 65, 60, 70], act: [27, 22, 23, 17, 13] },
  { name: 'LUIS GUANIPA', cartera: 52, metas: [35, 10, 12, 20, 25], act: [5, 6, 1, 3, 1] },
  { name: 'PEDRO ABREU', cartera: 57, metas: [35, 15, 18, 20, 30], act: [1, 2, 3, 2, 1] },
  { name: 'OSCAR ORTIZ', cartera: 86, metas: [38, 20, 24, 16, 20], act: [5, 0, 7, 1, 1] },
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
      jamonAsturias: { meta: s.metas[2], activados: s.act[2] },
      mortadelaAsturias: { meta: s.metas[3], activados: s.act[3] },
      salpicao: { meta: s.metas[4], activados: s.act[4] },
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
