import {
  hydrateRuntimeSellerCatalog,
  resolveSellerFromMasterCatalog,
  type MasterSellerRecord,
} from '../../lib/maestraCatalogSanitizer';

export interface SellerMetadata {
  vendedor: string;
  supervisor: string;
  zona: string;
  region: string;
  isSupervisorRoute?: boolean;
}

// Lista oficial exacta de las 25 carteras activas de la Fuerza de Ventas (Noviembre 2026)
// Nota: Johnatan Soto, Ali Perez y Nelson Finol son exclusivamente Supervisores Comerciales sin cartera propia; los clientes de Johnatan Soto pasaron a Mikelangelo Diaz y los clientes de Ali Perez pasaron a Angel Navarro, Mariangel Gonzalez y Victor Campos.
export const OFFICIAL_SELLERS_LIST = [
  'MARIA BRICEÑO',
  'CUENTAS CLAVES 1 - MC',
  'MIKELANGELO DIAZ',
  'HERNAN PAZ',
  'OSWALDO CHURION',
  'CARLOS FUENMAYOR',
  'SARAH REYES',
  'J PABLO ARAUJO - CAB/OJE',
  'JOSE G. GONZALEZ',
  'ANGELICA MORENO',
  'ADEL JARABA',
  'JUAN HERNANDEZ',
  'YOLEIDA LUGO',
  'CUENTAS CLAVES 2 - SV',
  'ELISA SOLER',
  'ANGEL NAVARRO',
  'MARIANGEL GONZALEZ',
  'VICTOR CAMPOS',
  'J PABLO ARAUJO',
  'EDUARDO PIÑA',
  'LEONARDO RIOS',
  'MARYERY GARCIA',
  'LUIS GUANIPA',
  'PEDRO ABREU',
  'OSCAR ORTIZ',
] as const;

// Vendedores comerciales activos sincronizados exactamente con la Maestra de Clientes Octubre 2026 (25 carteras activas)
export const VALID_VOLUME_SELLERS = new Set<string>(OFFICIAL_SELLERS_LIST);

// Los 3 Supervisores Comerciales Oficiales de Codizulca
export const OFFICIAL_SUPERVISORS = ['JOHNATAN SOTO', 'ALI PEREZ', 'NELSON FINOL'] as const;

// Asignación oficial de supervisores (Johnatan Soto, Ali Perez y Nelson Finol) para la Fuerza de Ventas
export const SELLER_METADATA_MAP: Record<string, { supervisor: string; zona: string; region: string; isSupervisorRoute?: boolean }> = {
  // ==========================================
  // SUPERVISOR: JOHNATAN SOTO (6 Vendedores — Clientes de Johnatan pasaron a Mikelangelo Diaz)
  // ==========================================
  'MIKELANGELO DIAZ': { supervisor: 'JOHNATAN SOTO', zona: 'Machiques / Villa del Rosario / Perijá', region: 'Supervisión Johnatan Soto' },
  'HERNAN PAZ': { supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Perijá', region: 'Supervisión Johnatan Soto' },
  'OSWALDO CHURION': { supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Sur', region: 'Supervisión Johnatan Soto' },
  'ANGELICA MORENO': { supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Norte', region: 'Supervisión Johnatan Soto' },
  'ADEL JARABA': { supervisor: 'JOHNATAN SOTO', zona: 'Mayoristas / Maracaibo', region: 'Supervisión Johnatan Soto' },
  'JUAN HERNANDEZ': { supervisor: 'JOHNATAN SOTO', zona: 'Sur del Lago / El Chivo', region: 'Supervisión Johnatan Soto' },
  'JAIDER MEDINA - FOOD SERVICE NORTE': { supervisor: 'JOHNATAN SOTO', zona: 'Food Service Norte', region: 'Supervisión Johnatan Soto' },
  'FOOD SERVICE SENIOR - JUAN HERNANDEZ': { supervisor: 'JOHNATAN SOTO', zona: 'Food Service Senior', region: 'Supervisión Johnatan Soto' },
  'JOHNATAN SOTO': { supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Supervisión', region: 'Supervisión Johnatan Soto', isSupervisorRoute: true },
  'JOHNATAN SOTO VILLA DEL ROS': { supervisor: 'JOHNATAN SOTO', zona: 'La Villa del Rosario / Perijá', region: 'Supervisión Johnatan Soto', isSupervisorRoute: true },

  // ==========================================
  // SUPERVISOR: ALI PEREZ (7 Vendedores — Clientes de Ali Perez pasaron a Angel Navarro, Mariangel Gonzalez y Victor Campos)
  // ==========================================
  'ALI PEREZ': { supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Supervisión', region: 'Supervisión Ali Perez', isSupervisorRoute: true },
  'ANGEL NAVARRO': { supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná', region: 'Supervisión Ali Perez' },
  'MARIANGEL GONZALEZ': { supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná', region: 'Supervisión Ali Perez' },
  'VICTOR CAMPOS': { supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná', region: 'Supervisión Ali Perez' },
  'ELISA SOLER': { supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná', region: 'Supervisión Ali Perez' },
  'LEONARDO RIOS': { supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná', region: 'Supervisión Ali Perez' },
  'LUIS GUANIPA': { supervisor: 'ALI PEREZ', zona: 'Coro / Falcón', region: 'Supervisión Ali Perez' },
  'OSCAR ORTIZ': { supervisor: 'ALI PEREZ', zona: 'Coro / La Costa', region: 'Supervisión Ali Perez' },

  // ==========================================
  // SUPERVISOR: NELSON FINOL (12 Carteras de Fuerza de Ventas y Cuentas Clave)
  // ==========================================
  'MARIA BRICEÑO': { supervisor: 'NELSON FINOL', zona: 'Maracaibo', region: 'Supervisión Nelson Finol' },
  'CUENTAS CLAVES 1 - MC': { supervisor: 'NELSON FINOL', zona: 'Cuentas Claves 1 - MC', region: 'Supervisión Nelson Finol' },
  'CUENTAS CLAVE 1 - MC': { supervisor: 'NELSON FINOL', zona: 'Cuentas Claves 1 - MC', region: 'Supervisión Nelson Finol' },
  'MARIANA CHACIN': { supervisor: 'NELSON FINOL', zona: 'Cuentas Claves 1 - MC', region: 'Supervisión Nelson Finol' },
  'CARLOS FUENMAYOR': { supervisor: 'NELSON FINOL', zona: 'Maracaibo', region: 'Supervisión Nelson Finol' },
  'SARAH REYES': { supervisor: 'NELSON FINOL', zona: 'Maracaibo / San Francisco', region: 'Supervisión Nelson Finol' },
  'J PABLO ARAUJO - CAB/OJE': { supervisor: 'NELSON FINOL', zona: 'Cabimas / Ciudad Ojeda', region: 'Supervisión Nelson Finol' },
  'JOSE G. GONZALEZ': { supervisor: 'NELSON FINOL', zona: 'Maracaibo', region: 'Supervisión Nelson Finol' },
  'YOLEIDA LUGO': { supervisor: 'NELSON FINOL', zona: 'Maracaibo', region: 'Supervisión Nelson Finol' },
  'CUENTAS CLAVES 2 - SV': { supervisor: 'NELSON FINOL', zona: 'Cuentas Claves 2 - SV', region: 'Supervisión Nelson Finol' },
  'CUENTAS CLAVE 2 - SV': { supervisor: 'NELSON FINOL', zona: 'Cuentas Claves 2 - SV', region: 'Supervisión Nelson Finol' },
  'SAIRU VALLES': { supervisor: 'NELSON FINOL', zona: 'Cuentas Claves 2 - SV', region: 'Supervisión Nelson Finol' },
  'J PABLO ARAUJO': { supervisor: 'NELSON FINOL', zona: 'Costa Oriental del Lago', region: 'Supervisión Nelson Finol' },
  'EDUARDO PIÑA': { supervisor: 'NELSON FINOL', zona: 'Maracaibo', region: 'Supervisión Nelson Finol' },
  'MARYERY GARCIA': { supervisor: 'NELSON FINOL', zona: 'Ciudad Ojeda / COL', region: 'Supervisión Nelson Finol' },
  'PEDRO ABREU': { supervisor: 'NELSON FINOL', zona: 'Punto Fijo / Paraguaná', region: 'Supervisión Nelson Finol' },
  'FOOD SERVICE SUR': { supervisor: 'NELSON FINOL', zona: 'Food Service Sur', region: 'Supervisión Nelson Finol' },
};

/**
 * Permite hidratar en vivo el mapa de vendedores/supervisores desde Supabase (`public.vendedores_maestro`).
 */
export function hydrateSellerMetadataFromSupabase(rows: Array<Partial<MasterSellerRecord>>): void {
  const hydrated = hydrateRuntimeSellerCatalog(rows);
  for (const r of hydrated) {
    if (!r.nombre_canonico) continue;
    SELLER_METADATA_MAP[r.nombre_canonico] = {
      supervisor: r.supervisor,
      zona: r.zona,
      region: r.region,
      isSupervisorRoute: r.is_supervisor_route,
    };
    if (r.incluir_en_volumen && r.activo) {
      VALID_VOLUME_SELLERS.add(r.nombre_canonico);
    }
  }
}

// Vendedores e identificadores a excluir permanentemente (gerencia, oficina, inactivos)
export const EXCLUDED_VOLUME_SELLERS = new Set<string>([
  'OFICINA',
  'OFICINA - GERENCIA',
  'GERENCIA LC',
  'GERENCIA',
  'OFICINA - AMERICO ALFONZO',
  'OFICINA - JUAN URDANETA',
  'OFICINA - MARIA URDANETA',
  'OFICINA EMPLEADOS',
  'EMPLEADOS STZ',
  'HECGRIS PEREZ',
  'SORAYA LARREAL',
  'CARLOS MACHADO',
  'JOSE G. ESPINOZA',
  'LUIS F. SIMOSA',
  'GELSON CASTILLO',
  'JAIDER MEDINA - FOOD SERVICE NORTE',
  'FOOD SERVICE NORTE',
  'FOOD SERVICE SUR',
  'FOOD SERVICE SENIOR',
  'FOOD SERVICE SENIOR - JUAN HERNANDEZ',
  'VACANTE - CORO',
  'VACANTE - LA COSTA',
  'VACANTE - NELSON FINOL',
  'ZONA BAJA DE TRUJILLO',
  'SIN ASIGNAR',
]);

export const normalizeSellerName = (vendedorName: string): string => {
  if (!vendedorName) return '';
  let n = vendedorName
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/MARÍA\b/, 'MARIA')
    .replace(/BRICENO\b/, 'BRICEÑO')
    .replace(/BRICEO\b/, 'BRICEÑO')
    .replace(/PINA\b/, 'PIÑA')
    .replace(/PIA\b/, 'PIÑA')
    .replace(/CHACÍN\b/, 'CHACIN')
    .replace(/PÉREZ\b/, 'PEREZ')
    .replace(/ALÍ\b/, 'ALI')
    .replace(/HERNÁNDEZ\b/, 'HERNANDEZ')
    .replace(/HERNÁN\b/, 'HERNAN')
    .replace(/GONZÁLEZ\b/, 'GONZALEZ')
    .replace(/GARCÍA\b/, 'GARCIA')
    .replace(/RÍOS\b/, 'RIOS')
    .replace(/ANGÉLICA\b/, 'ANGELICA')
    .replace(/VÍCTOR\b/, 'VICTOR')
    .replace(/JOSÉ\b/, 'JOSE');

  if (
    n === 'CUENTAS CLAVE 1' ||
    n === 'CUENTAS CLAVES 1' ||
    n === 'CUENTAS CLAVE 1 - MC' ||
    n === 'CUENTAS CLAVES 1 - MC' ||
    n === 'MARIANA CHACIN' ||
    n === 'CUENTAS CLAVE 1 - MC (MARIANA CHACIN)' ||
    n === 'CUENTAS CLAVES 1 - MC (MARIANA CHACIN)' ||
    n.includes('CUENTAS CLAVE 1') ||
    n.includes('CUENTAS CLAVES 1') ||
    n.includes('MARIANA CHACIN')
  ) {
    return 'CUENTAS CLAVES 1 - MC';
  }
  if (
    n === 'CUENTAS CLAVE 2' ||
    n === 'CUENTAS CLAVES 2' ||
    n === 'CUENTAS CLAVE 2 - SV' ||
    n === 'CUENTAS CLAVES 2 - SV' ||
    n === 'SAIRU VALLES' ||
    n === 'CUENTAS CLAVE 2 - SV (SAIRU VALLES)' ||
    n === 'CUENTAS CLAVES 2 - SV (SAIRU VALLES)' ||
    n.includes('CUENTAS CLAVE 2') ||
    n.includes('CUENTAS CLAVES 2') ||
    n.includes('SAIRU VALLES')
  ) {
    return 'CUENTAS CLAVES 2 - SV';
  }
  // Johnatan Soto pasó a Supervisor; todas sus rutas anteriores y las de Villa del Rosario pasan a Mikelangelo Diaz
  if (
    n === 'MIKELANGELO DIAZ' ||
    n === 'MIKELANGELO DIAZ1' ||
    n === 'MIKELANGELO DIAZ - VILLA DEL ROS' ||
    n === 'MIKELANGELO DIAZ VILLA DEL ROS' ||
    n === 'JOHNATAN SOTO' ||
    n === 'JOHNATAN SOTO VILLA DEL ROS' ||
    n === 'JOHNATAN SOTO - VILLA DEL ROS'
  ) {
    return 'MIKELANGELO DIAZ';
  }
  // Ali Perez pasó exclusivamente a Supervisor; su código de ruta 29 anterior pasa a Angel Navarro
  if (n === 'ALI PEREZ' || n === 'ANGEL NAVARRO') {
    return 'ANGEL NAVARRO';
  }
  if (
    n === 'OSCAR ORTIZ' ||
    n === 'OSCAR ORTIZ - CORO' ||
    n === 'OSCAR ORTIZ- CORO' ||
    n === 'OSCAR ORTIZ - LA COSTA' ||
    n === 'OSCAR ORTIZ- LA COSTA' ||
    n === 'OSCAR ORTIZ-  LA COSTA'
  ) {
    return 'OSCAR ORTIZ';
  }
  return n;
};

export const isValidVolumeSeller = (vendedorName: string): boolean => {
  if (!vendedorName) return false;
  const normalized = normalizeSellerName(vendedorName);
  
  if (
    normalized.includes('OFICINA') ||
    normalized.includes('GERENCIA') ||
    normalized.includes('EMPLEADOS') ||
    normalized.includes('VACANTE') ||
    normalized.includes('SIN ASIGNAR') ||
    EXCLUDED_VOLUME_SELLERS.has(normalized)
  ) {
    return false;
  }

  return VALID_VOLUME_SELLERS.has(normalized);
};

export const isExcludedVolumeSeller = (vendedorName: string): boolean => {
  return !isValidVolumeSeller(vendedorName);
};

export const getSellerMetadata = (vendedorName: string): SellerMetadata => {
  if (!vendedorName) {
    return {
      vendedor: '',
      supervisor: 'NELSON FINOL',
      zona: '',
      region: 'Supervisión Nelson Finol',
    };
  }
  const normalized = normalizeSellerName(vendedorName);
  if (SELLER_METADATA_MAP[normalized]) {
    return {
      vendedor: normalized,
      ...SELLER_METADATA_MAP[normalized],
    };
  }
  const withSpacedHyphen = normalized.replace(/\s*-\s*/g, ' - ');
  if (SELLER_METADATA_MAP[withSpacedHyphen]) {
    return {
      vendedor: normalized,
      ...SELLER_METADATA_MAP[withSpacedHyphen],
    };
  }
  const withoutSpacedHyphen = normalized.replace(/\s*-\s*/g, '-');
  if (SELLER_METADATA_MAP[withoutSpacedHyphen]) {
    return {
      vendedor: normalized,
      ...SELLER_METADATA_MAP[withoutSpacedHyphen],
    };
  }
  const fromCatalog = resolveSellerFromMasterCatalog(vendedorName);
  if (fromCatalog.record) {
    return {
      vendedor: fromCatalog.canonicalSeller,
      supervisor: fromCatalog.supervisor,
      zona: fromCatalog.zona,
      region: fromCatalog.region,
      isSupervisorRoute: fromCatalog.record.is_supervisor_route,
    };
  }
  return {
    vendedor: normalized,
    supervisor: 'NELSON FINOL',
    zona: '',
    region: 'Supervisión Nelson Finol',
  };
};
