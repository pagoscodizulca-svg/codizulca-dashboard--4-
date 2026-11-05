import { getSellerMetadata } from './sellerSupervisorMap';

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

// Datos oficiales sincronizados de las 25 carteras activas de la Fuerza de Ventas (Maestra Clientes Activos Octubre 2026: 2,559 clientes)
const SHEET_ACTIVATION_SELLERS: Array<{
  name: string;
  cartera: number;
  metas: [number, number, number, number, number];
  act: [number, number, number, number, number];
}> = [
  { name: 'MARIA BRICEÑO', cartera: 130, metas: [77, 77, 40, 64, 35], act: [45, 45, 25, 58, 36] },
  { name: 'MARIANA CHACIN', cartera: 38, metas: [23, 23, 15, 20, 15], act: [14, 18, 12, 11, 10] },
  { name: 'MIKELANGELO DIAZ', cartera: 98, metas: [62, 62, 35, 42, 53], act: [43, 33, 24, 30, 47] },
  { name: 'HERNAN PAZ', cartera: 70, metas: [40, 40, 10, 32, 25], act: [18, 14, 1, 17, 15] },
  { name: 'OSWALDO CHURION', cartera: 75, metas: [37, 37, 15, 25, 35], act: [14, 20, 5, 20, 15] },
  { name: 'CARLOS FUENMAYOR', cartera: 114, metas: [53, 53, 25, 29, 30], act: [11, 13, 7, 16, 14] },
  { name: 'SARAH REYES', cartera: 148, metas: [97, 97, 30, 50, 52], act: [30, 33, 11, 29, 39] },
  { name: 'J PABLO ARAUJO - CAB/OJE', cartera: 57, metas: [32, 32, 18, 20, 15], act: [4, 4, 10, 17, 10] },
  { name: 'JOSE G. GONZALEZ', cartera: 147, metas: [74, 74, 45, 30, 42], act: [8, 21, 37, 24, 17] },
  { name: 'ANGELICA MORENO', cartera: 95, metas: [53, 53, 60, 45, 55], act: [25, 21, 40, 31, 27] },
  { name: 'ADEL JARABA', cartera: 93, metas: [59, 59, 40, 30, 60], act: [32, 24, 21, 15, 25] },
  { name: 'JUAN HERNANDEZ', cartera: 123, metas: [71, 71, 10, 50, 26], act: [22, 22, 5, 24, 17] },
  { name: 'YOLEIDA LUGO', cartera: 101, metas: [57, 57, 43, 33, 40], act: [39, 48, 34, 30, 41] },
  { name: 'SAIRU VALLES', cartera: 36, metas: [20, 20, 18, 16, 16], act: [12, 15, 14, 11, 12] },
  { name: 'ELISA SOLER', cartera: 166, metas: [109, 96, 90, 65, 55], act: [112, 99, 72, 61, 59] },
  { name: 'ANGEL NAVARRO', cartera: 37, metas: [22, 22, 15, 15, 15], act: [5, 9, 8, 2, 9] },
  { name: 'MARIANGEL GONZALEZ', cartera: 67, metas: [40, 40, 30, 15, 35], act: [22, 21, 29, 9, 28] },
  { name: 'VICTOR CAMPOS', cartera: 81, metas: [45, 45, 35, 20, 40], act: [13, 20, 14, 12, 25] },
  { name: 'J PABLO ARAUJO', cartera: 164, metas: [98, 98, 75, 48, 50], act: [47, 23, 58, 27, 24] },
  { name: 'EDUARDO PIÑA', cartera: 185, metas: [70, 80, 25, 30, 32], act: [29, 33, 10, 10, 20] },
  { name: 'LEONARDO RIOS', cartera: 101, metas: [52, 52, 23, 25, 25], act: [19, 24, 17, 21, 19] },
  { name: 'MARYERY GARCIA', cartera: 162, metas: [99, 99, 60, 65, 70], act: [48, 49, 45, 27, 43] },
  { name: 'LUIS GUANIPA', cartera: 55, metas: [31, 31, 10, 20, 25], act: [11, 16, 4, 9, 10] },
  { name: 'PEDRO ABREU', cartera: 80, metas: [33, 33, 15, 20, 30], act: [11, 14, 10, 8, 15] },
  { name: 'OSCAR ORTIZ', cartera: 136, metas: [39, 39, 16, 9, 17], act: [14, 20, 10, 9, 18] },
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
      azucar: { meta: s.metas[1], activados: s.act[1] },
      lecheVencampo: { meta: s.metas[2], activados: s.act[2] },
      jamonAsturias: { meta: s.metas[3], activados: s.act[3] },
      mortadelaAsturias: { meta: s.metas[4], activados: s.act[4] },
      salpicao: { meta: s.metas[0], activados: s.act[0] },
    },
  };
});
