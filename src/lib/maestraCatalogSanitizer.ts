/**
 * CAPA UNIFICADA DE SANITIZACIÓN Y NORMALIZACIÓN DE DATA MAESTRA (CLIENTES Y VENDEDORES)
 * Compartida entre:
 *  1. Dashboard de Gerencia (codizulca-dashboard (4))
 *  2. Dashboard de Ventas / Planificador de Vendedores (dashboard-fdv---planificador)
 */

export interface MasterSellerRecord {
  vendedor_id: string;
  codigo_erp: string;
  nombre_canonico: string;
  display_name: string;
  ruta_oficial: string;
  aliases: string[];
  supervisor: 'JOHNATAN SOTO' | 'ALI PEREZ' | 'NELSON FINOL' | string;
  zona: string;
  region: string;
  role: 'VENDEDOR' | 'SUPERVISOR' | 'ADMIN';
  is_supervisor_route: boolean;
  incluir_en_volumen: boolean;
  meta_activacion: number;
  meta_volumen: number;
  email?: string;
  activo: boolean;
}

export interface MasterClientRecord {
  composite_key: string;
  cliente_codigo: string;
  razon_social: string;
  rif: string;
  sucursal: string;
  direccion: string;
  tipo_cliente: string;
  vendedor_id: string;
  vendedor_nombre: string;
  vendedor_canonico: string;
  supervisor: string;
  zona: string;
  region: string;
  latitud?: number | null;
  longitud?: number | null;
  frecuencia_visita?: string;
  dia_visita?: string;
  estatus: 'ACTIVO' | 'INACTIVO' | 'BAJA_MAESTRA' | string;
  activo: boolean;
}

/**
 * Limpia espacios periféricos, dobles espacios y caracteres invisibles / UTF-8 BOM.
 */
export function sanitizeCatalogText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/Ã‘|Ã±/g, 'Ñ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Estandariza a MAYÚSCULAS limpias reparando tildes comunes en nombres propios comerciales.
 */
export function sanitizeCatalogUpper(val: unknown): string {
  return sanitizeCatalogText(val).toUpperCase();
}

/**
 * Clave ASCII sin acentos ni signos para cruces tolerantes.
 */
export function normalizeCatalogAsciiKey(val: unknown): string {
  return sanitizeCatalogUpper(val)
    .replace(/Ñ/g, 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Normaliza un código de cliente eliminando prefijos '#', sufijos '.0' de Excel o llaves compuestas.
 */
export function sanitizeClientCode(val: unknown): string {
  let clean = sanitizeCatalogText(val)
    .replace(/^[#\s]+/, '')
    .replace(/\.0+$/, '')
    .trim();
  if (!clean) return '';
  const dblColon = clean.indexOf('::');
  if (dblColon > 0) {
    clean = clean.slice(dblColon + 2).trim();
  }
  const hashIdx = clean.indexOf('#');
  if (hashIdx > 0) {
    clean = clean.slice(0, hashIdx).trim();
  }
  const upper = clean.toUpperCase();
  if (
    upper === '#N/A' ||
    upper === '#N/D' ||
    upper === 'N/A' ||
    upper === 'NULL' ||
    upper === 'UNDEFINED' ||
    upper === 'ID' ||
    upper === 'CODIGO'
  ) {
    return '';
  }
  return clean;
}

/**
 * Normaliza el RIF / Cédula a formato estándar en mayúsculas o 'PENDIENTE'.
 */
export function sanitizeRif(val: unknown): string {
  const raw = sanitizeCatalogUpper(val).replace(/^["']+|["']+$/g, '').trim();
  if (
    !raw ||
    raw === '#N/A' ||
    raw === '#N/D' ||
    raw === 'N/A' ||
    raw === 'NULL' ||
    raw === 'UNDEFINED' ||
    raw === 'SIN RIF' ||
    raw === 'PENDIENTE'
  ) {
    return 'PENDIENTE';
  }
  const alnum = raw.replace(/[^A-Z0-9]/g, '');
  if (/^[JVEGPC]\d{8,9}$/.test(alnum)) {
    return `${alnum[0]}-${alnum.slice(1)}`;
  }
  return raw;
}

/**
 * Construye llave compuesta determinística por ruta + código de cliente.
 */
export function buildMasterCompositeClientKey(vendedorRoute: string, clienteCodigo: string): string {
  const cleanRoute = sanitizeCatalogUpper(vendedorRoute).replace(/\s*-\s*/g, ' - ');
  const cleanCode = sanitizeClientCode(clienteCodigo);
  return `${cleanRoute}::${cleanCode}`;
}

/**
 * CATÁLOGO MAESTRO UNIFICADO DE VENDEDORES Y SUPERVISORES (25 CARTERAS ACTIVAS + RUTAS ESPECIALES + 3 SUPERVISORES)
 * Sincronizado 1:1 entre Dashboard de Gerencia y Dashboard de Ventas / Planificador.
 */
export const OFFICIAL_MASTER_VENDEDORES_SEED: MasterSellerRecord[] = [
  // =========================================================================
  // SUPERVISOR: JOHNATAN SOTO (6 Vendedores Comerciales Activos)
  // =========================================================================
  {
    vendedor_id: '3',
    codigo_erp: '3',
    nombre_canonico: 'MIKELANGELO DIAZ',
    display_name: 'Mikelangelo Diaz',
    ruta_oficial: 'MIKELANGELO DIAZ',
    aliases: [
      'MIKELANGELO DIAZ',
      'MIKELANGELO DIAZ1',
      'MIKELANGELO',
      'MIKELANGELO DIAZ - VILLA DEL ROS',
      'MIKELANGELO DIAZ VILLA DEL ROS',
      'MIKELANGELO VILLA DEL ROS',
      'JOHNATAN SOTO',
      'JOHNATAN SOTO VILLA DEL ROS',
      'JOHNATAN SOTO - VILLA DEL ROS',
      'MIKELANGELODIAZ@GMAIL.COM',
    ],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Machiques / Villa del Rosario / Perijá',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 69,
    meta_volumen: 0,
    email: 'Mikelangelodiaz@gmail.com',
    activo: true,
  },
  {
    vendedor_id: '4',
    codigo_erp: '4',
    nombre_canonico: 'HERNAN PAZ',
    display_name: 'Hernán Paz',
    ruta_oficial: 'HERNAN PAZ',
    aliases: ['HERNAN PAZ', 'HERNÁN PAZ'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Maracaibo / Perijá',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 49,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '7',
    codigo_erp: '7',
    nombre_canonico: 'OSWALDO CHURION',
    display_name: 'Oswaldo Churión',
    ruta_oficial: 'OSWALDO CHURION',
    aliases: ['OSWALDO CHURION', 'OSWALDO CHURIÓN'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Maracaibo / Sur',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 45,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '21',
    codigo_erp: '21',
    nombre_canonico: 'ANGELICA MORENO',
    display_name: 'Angélica Moreno',
    ruta_oficial: 'ANGELICA MORENO',
    aliases: ['ANGELICA MORENO', 'ANGÉLICA MORENO'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Maracaibo / Norte',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 62,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '22',
    codigo_erp: '22',
    nombre_canonico: 'ADEL JARABA',
    display_name: 'Adel Jaraba',
    ruta_oficial: 'ADEL JARABA',
    aliases: ['ADEL JARABA'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Mayoristas / Maracaibo',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 40,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '24',
    codigo_erp: '24',
    nombre_canonico: 'JUAN HERNANDEZ',
    display_name: 'Juan Hernández',
    ruta_oficial: 'JUAN HERNANDEZ',
    aliases: ['JUAN HERNANDEZ', 'JUAN HERNÁNDEZ'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Sur del Lago / El Chivo',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 39,
    meta_volumen: 0,
    activo: true,
  },

  // =========================================================================
  // SUPERVISOR: ALI PEREZ (7 Vendedores Comerciales Activos en Falcón)
  // =========================================================================
  {
    vendedor_id: '29',
    codigo_erp: '29',
    nombre_canonico: 'ANGEL NAVARRO',
    display_name: 'Ángel Navarro',
    ruta_oficial: 'ANGEL NAVARRO',
    aliases: ['ANGEL NAVARRO', 'ÁNGEL NAVARRO'],
    supervisor: 'ALI PEREZ',
    zona: 'Punto Fijo / Paraguaná',
    region: 'Supervisión Ali Perez',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 25,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '47',
    codigo_erp: '47',
    nombre_canonico: 'MARIANGEL GONZALEZ',
    display_name: 'Mariangel González',
    ruta_oficial: 'MARIANGEL GONZALEZ',
    aliases: ['MARIANGEL GONZALEZ', 'MARIANGEL GONZÁLEZ', 'MARIANGEL'],
    supervisor: 'ALI PEREZ',
    zona: 'Punto Fijo / Paraguaná',
    region: 'Supervisión Ali Perez',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 19,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '48',
    codigo_erp: '48',
    nombre_canonico: 'VICTOR CAMPOS',
    display_name: 'Víctor Campos',
    ruta_oficial: 'VICTOR CAMPOS',
    aliases: ['VICTOR CAMPOS', 'VÍCTOR CAMPOS'],
    supervisor: 'ALI PEREZ',
    zona: 'Punto Fijo / Paraguaná',
    region: 'Supervisión Ali Perez',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 20,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '28',
    codigo_erp: '28',
    nombre_canonico: 'ELISA SOLER',
    display_name: 'Elisa Soler',
    ruta_oficial: 'ELISA SOLER',
    aliases: ['ELISA SOLER'],
    supervisor: 'ALI PEREZ',
    zona: 'Punto Fijo / Paraguaná',
    region: 'Supervisión Ali Perez',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 59,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '38',
    codigo_erp: '38',
    nombre_canonico: 'LEONARDO RIOS',
    display_name: 'Leonardo Ríos',
    ruta_oficial: 'LEONARDO RIOS',
    aliases: ['LEONARDO RIOS', 'LEONARDO RÍOS'],
    supervisor: 'ALI PEREZ',
    zona: 'Punto Fijo / Paraguaná',
    region: 'Supervisión Ali Perez',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 49,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '40',
    codigo_erp: '40',
    nombre_canonico: 'LUIS GUANIPA',
    display_name: 'Luis Guanipa',
    ruta_oficial: 'LUIS GUANIPA',
    aliases: ['LUIS GUANIPA'],
    supervisor: 'ALI PEREZ',
    zona: 'Coro / Falcón',
    region: 'Supervisión Ali Perez',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 57,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '46',
    codigo_erp: '46',
    nombre_canonico: 'OSCAR ORTIZ',
    display_name: 'Óscar Ortiz',
    ruta_oficial: 'OSCAR ORTIZ',
    aliases: [
      'OSCAR ORTIZ',
      'OSCAR ORTIZ - CORO',
      'OSCAR ORTIZ- CORO',
      'OSCAR ORTIZ - LA COSTA',
      'OSCAR ORTIZ- LA COSTA',
      'OSCAR ORTIZ-  LA COSTA',
    ],
    supervisor: 'ALI PEREZ',
    zona: 'Coro / La Costa',
    region: 'Supervisión Ali Perez',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 96,
    meta_volumen: 0,
    activo: true,
  },

  // =========================================================================
  // SUPERVISOR: NELSON FINOL (12 Carteras de Fuerza de Ventas y Cuentas Clave)
  // =========================================================================
  {
    vendedor_id: '1',
    codigo_erp: '1',
    nombre_canonico: 'MARIA BRICEÑO',
    display_name: 'María Briceño',
    ruta_oficial: 'MARIA BRICEÑO',
    aliases: ['MARIA BRICEÑO', 'MARIA BRICENO', 'MARÍA BRICEÑO', 'MARIA BRICEO'],
    supervisor: 'NELSON FINOL',
    zona: 'Maracaibo',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 59,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '55',
    codigo_erp: '55',
    nombre_canonico: 'MARIANA CHACIN',
    display_name: 'Mariana Chacín (Cuentas Clave 1)',
    ruta_oficial: 'CUENTAS CLAVE 1 - MC',
    aliases: ['MARIANA CHACIN', 'MARIANA CHACÍN', 'CUENTAS CLAVE 1', 'CUENTAS CLAVE 1 - MC', 'CUENTAS CLAVE 1 - MC (MARIANA CHACIN)'],
    supervisor: 'NELSON FINOL',
    zona: 'Cuentas Clave 1',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 39,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '12',
    codigo_erp: '12',
    nombre_canonico: 'CARLOS FUENMAYOR',
    display_name: 'Carlos Fuenmayor',
    ruta_oficial: 'CARLOS FUENMAYOR',
    aliases: ['CARLOS FUENMAYOR'],
    supervisor: 'NELSON FINOL',
    zona: 'Maracaibo',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 31,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '14',
    codigo_erp: '14',
    nombre_canonico: 'SARAH REYES',
    display_name: 'Sarah Reyes',
    ruta_oficial: 'SARAH REYES',
    aliases: ['SARAH REYES'],
    supervisor: 'NELSON FINOL',
    zona: 'Maracaibo / San Francisco',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 49,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '15',
    codigo_erp: '15',
    nombre_canonico: 'J PABLO ARAUJO - CAB/OJE',
    display_name: 'J Pablo Araujo (Cabimas / Ojeda)',
    ruta_oficial: 'J PABLO ARAUJO - CAB/OJE',
    aliases: ['J PABLO ARAUJO - CAB/OJE', 'J PABLO ARAUJO- CAB/OJE', 'J PABLO ARAUJO - CAB'],
    supervisor: 'NELSON FINOL',
    zona: 'Cabimas / Ciudad Ojeda',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 36,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '16',
    codigo_erp: '16',
    nombre_canonico: 'JOSE G. GONZALEZ',
    display_name: 'José G. González',
    ruta_oficial: 'JOSE G. GONZALEZ',
    aliases: ['JOSE G. GONZALEZ', 'JOSE GONZALEZ', 'JOSÉ G. GONZÁLEZ'],
    supervisor: 'NELSON FINOL',
    zona: 'Maracaibo',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 59,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '25',
    codigo_erp: '25',
    nombre_canonico: 'YOLEIDA LUGO',
    display_name: 'Yoleida Lugo',
    ruta_oficial: 'YOLEIDA LUGO',
    aliases: ['YOLEIDA LUGO'],
    supervisor: 'NELSON FINOL',
    zona: 'Maracaibo',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 44,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '56',
    codigo_erp: '56',
    nombre_canonico: 'SAIRU VALLES',
    display_name: 'Sairú Valles (Cuentas Clave 2)',
    ruta_oficial: 'CUENTAS CLAVE 2 - SV',
    aliases: ['SAIRU VALLES', 'SAIRÚ VALLES', 'CUENTAS CLAVE 2', 'CUENTAS CLAVE 2 - SV', 'CUENTAS CLAVE 2 - SV (SAIRU VALLES)'],
    supervisor: 'NELSON FINOL',
    zona: 'Cuentas Clave 2',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 36,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '31',
    codigo_erp: '31',
    nombre_canonico: 'J PABLO ARAUJO',
    display_name: 'J Pablo Araujo',
    ruta_oficial: 'J PABLO ARAUJO',
    aliases: ['J PABLO ARAUJO'],
    supervisor: 'NELSON FINOL',
    zona: 'Costa Oriental del Lago',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 41,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '33',
    codigo_erp: '33',
    nombre_canonico: 'EDUARDO PIÑA',
    display_name: 'Eduardo Piña',
    ruta_oficial: 'EDUARDO PIÑA',
    aliases: ['EDUARDO PIÑA', 'EDUARDO PINA', 'EDUARDO PIA'],
    supervisor: 'NELSON FINOL',
    zona: 'Maracaibo',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 59,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '39',
    codigo_erp: '39',
    nombre_canonico: 'MARYERY GARCIA',
    display_name: 'Maryery García',
    ruta_oficial: 'MARYERY GARCIA',
    aliases: ['MARYERY GARCIA', 'MARYERY GARCÍA'],
    supervisor: 'NELSON FINOL',
    zona: 'Ciudad Ojeda / COL',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 39,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '45',
    codigo_erp: '45',
    nombre_canonico: 'PEDRO ABREU',
    display_name: 'Pedro Abreu',
    ruta_oficial: 'PEDRO ABREU',
    aliases: ['PEDRO ABREU'],
    supervisor: 'NELSON FINOL',
    zona: 'Punto Fijo / Paraguaná',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: true,
    meta_activacion: 53,
    meta_volumen: 0,
    activo: true,
  },

  // =========================================================================
  // RUTAS ESPECIALES DE FOOD SERVICE (Excluidas de Ranking de Volumen FDV)
  // =========================================================================
  {
    vendedor_id: '19',
    codigo_erp: '19',
    nombre_canonico: 'FOOD SERVICE SUR',
    display_name: 'Food Service Sur',
    ruta_oficial: 'FOOD SERVICE SUR',
    aliases: ['FOOD SERVICE SUR'],
    supervisor: 'NELSON FINOL',
    zona: 'Food Service Sur',
    region: 'Supervisión Nelson Finol',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: false,
    meta_activacion: 39,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '20',
    codigo_erp: '20',
    nombre_canonico: 'JAIDER MEDINA - FOOD SERVICE NORTE',
    display_name: 'Jaider Medina (Food Service Norte)',
    ruta_oficial: 'JAIDER MEDINA - FOOD SERVICE NORTE',
    aliases: ['JAIDER MEDINA - FOOD SERVICE NORTE', 'JAIDER MEDINA', 'FOOD SERVICE NORTE'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Food Service Norte',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: false,
    meta_activacion: 30,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: '57',
    codigo_erp: '57',
    nombre_canonico: 'FOOD SERVICE SENIOR - JUAN HERNANDEZ',
    display_name: 'Food Service Senior (Juan Hernández)',
    ruta_oficial: 'FOOD SERVICE SENIOR - JUAN HERNANDEZ',
    aliases: ['FOOD SERVICE SENIOR - JUAN HERNANDEZ', 'FOOD SERVICE SENIOR'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Food Service Senior',
    region: 'Supervisión Johnatan Soto',
    role: 'VENDEDOR',
    is_supervisor_route: false,
    incluir_en_volumen: false,
    meta_activacion: 58,
    meta_volumen: 0,
    activo: true,
  },

  // =========================================================================
  // PERFILES DE LOS 3 SUPERVISORES COMERCIALES OFICIALES
  // =========================================================================
  {
    vendedor_id: 'SUPERVISOR_JOHNATAN_SOTO',
    codigo_erp: 'SUP-01',
    nombre_canonico: 'JOHNATAN SOTO',
    display_name: 'Johnatan Soto (Supervisor)',
    ruta_oficial: 'SUPERVISOR JOHNATAN SOTO',
    aliases: ['SUPERVISOR:JOHNATAN SOTO'],
    supervisor: 'JOHNATAN SOTO',
    zona: 'Occidente / Perijá / Maracaibo',
    region: 'Supervisión Johnatan Soto',
    role: 'SUPERVISOR',
    is_supervisor_route: true,
    incluir_en_volumen: false,
    meta_activacion: 0,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: 'SUPERVISOR_ALI_PEREZ',
    codigo_erp: 'SUP-02',
    nombre_canonico: 'ALI PEREZ',
    display_name: 'Alí Pérez (Supervisor)',
    ruta_oficial: 'SUPERVISOR ALI PEREZ',
    aliases: ['SUPERVISOR:ALI PEREZ', 'ALÍ PÉREZ'],
    supervisor: 'ALI PEREZ',
    zona: 'Falcón / Punto Fijo / Coro',
    region: 'Supervisión Ali Perez',
    role: 'SUPERVISOR',
    is_supervisor_route: true,
    incluir_en_volumen: false,
    meta_activacion: 0,
    meta_volumen: 0,
    activo: true,
  },
  {
    vendedor_id: 'SUPERVISOR_NELSON_FINOL',
    codigo_erp: 'SUP-03',
    nombre_canonico: 'NELSON FINOL',
    display_name: 'Nelson Finol (Supervisor)',
    ruta_oficial: 'SUPERVISOR NELSON FINOL',
    aliases: ['SUPERVISOR:NELSON FINOL'],
    supervisor: 'NELSON FINOL',
    zona: 'Maracaibo / COL / Cuentas Clave',
    region: 'Supervisión Nelson Finol',
    role: 'SUPERVISOR',
    is_supervisor_route: true,
    incluir_en_volumen: false,
    meta_activacion: 0,
    meta_volumen: 0,
    activo: true,
  },
];

// ============================================================================
// REGISTRO DINÁMICO EN MEMORIA (HIDRATABLE EN VIVO DESDE SUPABASE)
// ============================================================================

let runtimeSellerCatalog: MasterSellerRecord[] = [...OFFICIAL_MASTER_VENDEDORES_SEED];
const runtimeAliasLookup = new Map<string, MasterSellerRecord>();

function rebuildRuntimeAliasIndex(): void {
  runtimeAliasLookup.clear();
  for (const s of runtimeSellerCatalog) {
    // No indexar el registro del supervisor homónimo sobre los alias de vendedores reasignados
    // (ej. JOHNATAN SOTO como ruta de cliente pasa a MIKELANGELO DIAZ, ALI PEREZ como ruta pasa a ANGEL NAVARRO)
    if (!s.is_supervisor_route) {
      runtimeAliasLookup.set(normalizeCatalogAsciiKey(s.nombre_canonico), s);
      runtimeAliasLookup.set(normalizeCatalogAsciiKey(s.ruta_oficial), s);
      runtimeAliasLookup.set(normalizeCatalogAsciiKey(s.display_name), s);
      for (const alias of s.aliases || []) {
        runtimeAliasLookup.set(normalizeCatalogAsciiKey(alias), s);
      }
    }
  }
}

rebuildRuntimeAliasIndex();

/**
 * Hidrata el catálogo dinámico de vendedores en memoria con registros provenientes de Supabase
 * (`public.vendedores_maestro`), preservando los alias y semillas oficiales.
 */
export function hydrateRuntimeSellerCatalog(rows: Array<Partial<MasterSellerRecord>>): MasterSellerRecord[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    return runtimeSellerCatalog;
  }

  const byCanonical = new Map<string, MasterSellerRecord>();
  for (const seed of OFFICIAL_MASTER_VENDEDORES_SEED) {
    byCanonical.set(
      `${seed.is_supervisor_route ? 'SUP::' : 'VEN::'}${sanitizeCatalogUpper(seed.nombre_canonico)}`,
      { ...seed, aliases: [...seed.aliases] }
    );
  }

  for (const raw of rows) {
    const canon = sanitizeCatalogUpper(raw.nombre_canonico || raw.ruta_oficial || raw.display_name);
    if (!canon) continue;
    const isSup = Boolean(raw.is_supervisor_route) || sanitizeCatalogUpper(raw.role) === 'SUPERVISOR';
    const key = `${isSup ? 'SUP::' : 'VEN::'}${canon}`;
    const existing = byCanonical.get(key);
    const rawAliases = Array.isArray(raw.aliases)
      ? raw.aliases.map((a) => sanitizeCatalogUpper(a)).filter(Boolean)
      : [];

    if (existing) {
      const mergedAliases = Array.from(new Set([...existing.aliases, ...rawAliases, canon]));
      byCanonical.set(key, {
        ...existing,
        vendedor_id: sanitizeCatalogText(raw.vendedor_id) || existing.vendedor_id,
        codigo_erp: sanitizeCatalogText(raw.codigo_erp) || existing.codigo_erp,
        nombre_canonico: canon,
        display_name: sanitizeCatalogText(raw.display_name) || existing.display_name,
        ruta_oficial: sanitizeCatalogUpper(raw.ruta_oficial) || existing.ruta_oficial,
        aliases: mergedAliases,
        supervisor: sanitizeCatalogUpper(raw.supervisor) || existing.supervisor,
        zona: sanitizeCatalogText(raw.zona) || existing.zona,
        region: sanitizeCatalogText(raw.region) || existing.region,
        role: (sanitizeCatalogUpper(raw.role) as MasterSellerRecord['role']) || existing.role,
        is_supervisor_route: isSup,
        incluir_en_volumen:
          typeof raw.incluir_en_volumen === 'boolean'
            ? raw.incluir_en_volumen
            : existing.incluir_en_volumen,
        meta_activacion:
          Number(raw.meta_activacion) > 0 ? Number(raw.meta_activacion) : existing.meta_activacion,
        meta_volumen:
          Number(raw.meta_volumen) > 0 ? Number(raw.meta_volumen) : existing.meta_volumen,
        email: sanitizeCatalogText(raw.email) || existing.email,
        activo: typeof raw.activo === 'boolean' ? raw.activo : existing.activo,
      });
    } else {
      byCanonical.set(key, {
        vendedor_id: sanitizeCatalogText(raw.vendedor_id) || canon,
        codigo_erp: sanitizeCatalogText(raw.codigo_erp) || '',
        nombre_canonico: canon,
        display_name: sanitizeCatalogText(raw.display_name) || canon,
        ruta_oficial: sanitizeCatalogUpper(raw.ruta_oficial) || canon,
        aliases: Array.from(new Set([canon, ...rawAliases])),
        supervisor: sanitizeCatalogUpper(raw.supervisor) || 'NELSON FINOL',
        zona: sanitizeCatalogText(raw.zona) || 'Maracaibo',
        region: sanitizeCatalogText(raw.region) || 'OCCIDENTE',
        role: isSup ? 'SUPERVISOR' : 'VENDEDOR',
        is_supervisor_route: isSup,
        incluir_en_volumen: typeof raw.incluir_en_volumen === 'boolean' ? raw.incluir_en_volumen : !isSup,
        meta_activacion: Number(raw.meta_activacion) || 0,
        meta_volumen: Number(raw.meta_volumen) || 0,
        email: sanitizeCatalogText(raw.email) || undefined,
        activo: typeof raw.activo === 'boolean' ? raw.activo : true,
      });
    }
  }

  runtimeSellerCatalog = Array.from(byCanonical.values());
  rebuildRuntimeAliasIndex();
  return runtimeSellerCatalog;
}

export function getRuntimeSellerCatalog(): MasterSellerRecord[] {
  return runtimeSellerCatalog;
}

/**
 * Resuelve cualquier variante de nombre de ruta o vendedor contra el catálogo maestro unificado.
 */
export function resolveSellerFromMasterCatalog(rawVendedor: unknown): {
  record: MasterSellerRecord | null;
  vendedorRuta: string;
  canonicalSeller: string;
  supervisor: string;
  zona: string;
  region: string;
  incluirEnVolumen: boolean;
  activo: boolean;
} {
  const clean = sanitizeCatalogUpper(rawVendedor).replace(/^BAJA_MAESTRA::/i, '').trim();
  const ascii = normalizeCatalogAsciiKey(clean);

  if (!clean) {
    return {
      record: null,
      vendedorRuta: 'SIN ASIGNAR',
      canonicalSeller: 'SIN ASIGNAR',
      supervisor: 'NELSON FINOL',
      zona: 'Zulia',
      region: 'Supervisión Nelson Finol',
      incluirEnVolumen: false,
      activo: false,
    };
  }

  const matched = runtimeAliasLookup.get(ascii);
  if (matched) {
    // Preservar sub-ruta específica en vendedorRuta cuando el vendedor tiene múltiples rutas (ej. OSCAR ORTIZ - LA COSTA, MIKELANGELO DIAZ - VILLA DEL ROS)
    let routeLabel = matched.ruta_oficial;
    if (clean.includes('LA COSTA')) routeLabel = 'OSCAR ORTIZ- LA COSTA';
    else if (clean.includes('CORO') && matched.nombre_canonico === 'OSCAR ORTIZ') routeLabel = 'OSCAR ORTIZ- CORO';
    else if (clean.includes('VILLA') && matched.nombre_canonico === 'MIKELANGELO DIAZ') {
      routeLabel = clean.includes('JOHNATAN') ? 'JOHNATAN SOTO VILLA DEL ROS' : 'MIKELANGELO DIAZ - VILLA DEL ROS';
    } else if (clean) {
      routeLabel = clean;
    }

    return {
      record: matched,
      vendedorRuta: routeLabel,
      canonicalSeller: matched.nombre_canonico,
      supervisor: matched.supervisor,
      zona: matched.zona,
      region: matched.region,
      incluirEnVolumen: matched.incluir_en_volumen,
      activo: matched.activo,
    };
  }

  return {
    record: null,
    vendedorRuta: clean,
    canonicalSeller: clean,
    supervisor: 'NELSON FINOL',
    zona: 'Zulia',
    region: 'Supervisión Nelson Finol',
    incluirEnVolumen: false,
    activo: true,
  };
}

/**
 * Sanitiza y normaliza un registro crudo de cliente proveniente de Excel, CSV, Google Sheet o API
 * para que pueda insertarse/actualizarse mediante UPSERT en `public.clientes_maestro` y `public.activacion_clientes`.
 */
export function sanitizeAndNormalizeClientRecord(
  raw: Record<string, unknown>
): MasterClientRecord | null {
  const clienteCodigo = sanitizeClientCode(
    raw.cliente_codigo ?? raw.idCliente ?? raw.id_cliente ?? raw.id ?? raw.codigo ?? raw.code
  );
  if (!clienteCodigo) return null;

  const razonSocial = sanitizeCatalogUpper(
    raw.razon_social ?? raw.razonSocial ?? raw.cliente_nombre ?? raw.cliente ?? raw.nombre ?? raw.name
  ).replace(/^["']+|["']+$/g, '').trim();
  if (!razonSocial || razonSocial === '#N/A' || razonSocial === '#N/D') return null;

  const rawVendedor = sanitizeCatalogUpper(
    raw.vendedor_nombre ?? raw.rutaVendedor ?? raw.vendedor ?? raw.vendedor_id ?? raw.route_name
  );
  if (!rawVendedor || rawVendedor === '#N/A' || rawVendedor === '#N/D') return null;

  const resolved = resolveSellerFromMasterCatalog(rawVendedor);
  const vendedorNombre = resolved.vendedorRuta;
  const vendedorCanonico = resolved.canonicalSeller;
  const vendedorId = sanitizeCatalogText(
    raw.vendedor_id ?? raw.idVendedor ?? raw.id_vendedor ?? resolved.record?.vendedor_id ?? vendedorNombre
  );

  const rif = sanitizeRif(raw.rif ?? raw.rifCedula ?? raw.ruc);
  const sucursal = sanitizeCatalogUpper(raw.sucursal) || 'PRINCIPAL';
  const direccion = sanitizeCatalogText(raw.direccion ?? raw.address);
  const tipoCliente =
    sanitizeCatalogUpper(raw.tipo_cliente ?? raw.tipoCliente ?? raw.canal ?? raw.categoria) ||
    'POR CLASIFICAR';

  const lat = Number(raw.latitud ?? raw.latitude);
  const lng = Number(raw.longitud ?? raw.longitude);
  const latitud = Number.isFinite(lat) && lat !== 0 ? lat : null;
  const longitud = Number.isFinite(lng) && lng !== 0 ? lng : null;

  const isActivo = raw.activo !== undefined ? Boolean(raw.activo) : raw.estatus !== 'BAJA_MAESTRA';
  const estatus = !isActivo
    ? 'BAJA_MAESTRA'
    : sanitizeCatalogUpper(raw.estatus ?? raw.status) || 'ACTIVO';

  return {
    composite_key: buildMasterCompositeClientKey(vendedorNombre, clienteCodigo),
    cliente_codigo: clienteCodigo,
    razon_social: razonSocial,
    rif,
    sucursal,
    direccion,
    tipo_cliente: tipoCliente === '#N/A' || tipoCliente === '#N/D' ? 'POR CLASIFICAR' : tipoCliente,
    vendedor_id: vendedorId,
    vendedor_nombre: vendedorNombre,
    vendedor_canonico: vendedorCanonico,
    supervisor: sanitizeCatalogUpper(raw.supervisor) || resolved.supervisor,
    zona: sanitizeCatalogText(raw.zona) || resolved.zona,
    region: sanitizeCatalogUpper(raw.region) || 'OCCIDENTE',
    latitud,
    longitud,
    frecuencia_visita: sanitizeCatalogUpper(raw.frecuencia_visita) || 'SEMANAL',
    dia_visita: sanitizeCatalogUpper(raw.dia_visita) || '',
    estatus,
    activo: isActivo,
  };
}
