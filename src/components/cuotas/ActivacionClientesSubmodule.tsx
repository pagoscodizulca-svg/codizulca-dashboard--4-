import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Search,
  Users,
  CalendarDays,
  Target,
  ShieldAlert,
  XCircle,
  CheckCircle2,
  TriangleAlert,
  User,
  LayoutList,
  FileText,
  Grip,
  Zap,
  Activity,
  CheckSquare,
  Square,
  X,
  Filter,
  Droplets,
  Flame,
  Drumstick,
  Award,
  Layers,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import activacionSeed from '../../data/activacionClientesSeed.json';
import { SellerMultiSelect, SellerOption } from './SellerMultiSelect';
import { ViewLevel } from './MonthProgressBar';
import { DEFAULT_DIAS_LABORABLES, DEFAULT_DIAS_TRANSCURRIDOS, calculateMonthWorkingProgress } from './volumeQuotasData';

export type RubroClienteCodigo =
  | 'ACEITE'
  | 'AZUCAR'
  | 'POLLO'
  | 'ESTANDAR_ASTURIAS'
  | 'MORTADELA_SALPICAO';

export const RUBROS_ACTIVACION_CLIENTES: RubroClienteCodigo[] = [
  'ACEITE',
  'AZUCAR',
  'POLLO',
  'ESTANDAR_ASTURIAS',
  'MORTADELA_SALPICAO',
];

export const RUBRO_CLIENTE_LABEL: Record<RubroClienteCodigo, string> = {
  ACEITE: 'Aceite',
  AZUCAR: 'Azúcar',
  POLLO: 'Pollo',
  ESTANDAR_ASTURIAS: 'Estándar y Superior Asturias',
  MORTADELA_SALPICAO: 'Mortadela Salpicao y Asturias',
};

const getRubroIconAndTheme = (rubro: RubroClienteCodigo) => {
  switch (rubro) {
    case 'ACEITE':
      return {
        icon: Droplets,
        badgeCls: 'bg-amber-950/60 text-amber-300 border-amber-600/60',
      };
    case 'AZUCAR':
      return {
        icon: Flame,
        badgeCls: 'bg-sky-950/60 text-sky-300 border-sky-600/60',
      };
    case 'POLLO':
      return {
        icon: Drumstick,
        badgeCls: 'bg-orange-950/60 text-orange-300 border-orange-600/60',
      };
    case 'ESTANDAR_ASTURIAS':
      return {
        icon: Award,
        badgeCls: 'bg-rose-950/60 text-rose-300 border-rose-600/60',
      };
    case 'MORTADELA_SALPICAO':
      return {
        icon: Layers,
        badgeCls: 'bg-emerald-950/60 text-emerald-300 border-emerald-600/60',
      };
  }
};

export interface RawClientActivationItem {
  id: string;
  cliente: string;
  vendedorId: string;
  vendedorNombre: string;
  status: string;
  cats?: {
    ACEITE?: boolean;
    AZUCAR?: boolean;
    AZÚCAR?: boolean;
    POLLO?: boolean;
    ESTANDAR_ASTURIAS?: boolean;
    MORTADELA_SALPICAO?: boolean;
  };
  cajas?: {
    ACEITE?: number;
    AZUCAR?: number;
    POLLO?: number;
    ESTANDAR_ASTURIAS?: number;
    MORTADELA_SALPICAO?: number;
  };
}

const normSearch = (val: string) =>
  String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normClientCode = (val: string) => normSearch(val).replace(/^[#0\s]+/, '');

const normUpperAscii = (val: string) =>
  String(val || '')
    .replace(/Ã‘|Ã±/g, 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Normaliza el nombre del vendedor de la tabla activacion_clientes al nombre canónico
 * usado en los filtros por Vendedor y Supervisor del módulo de Cuotas.
 */
export const resolveCanonicalSellerForClient = (rawVendor: string): {
  canonicalSeller: string;
  routeLabel: string;
  supervisor: string;
  zona: string;
} => {
  const u = normUpperAscii(rawVendor);

  if (u.includes('CUENTAS CLAVE 1') || u.includes('MARIANA CHACIN')) {
    return {
      canonicalSeller: 'MARIANA CHACIN',
      routeLabel: 'MARIANA CHACIN (Cuentas Clave 1 - MC)',
      supervisor: 'NELSON FINOL',
      zona: 'Cuentas Clave 1',
    };
  }
  if (u.includes('CUENTAS CLAVE 2') || u.includes('SAIRU VALLES')) {
    return {
      canonicalSeller: 'SAIRU VALLES',
      routeLabel: 'SAIRU VALLES (Cuentas Clave 2 - SV)',
      supervisor: 'NELSON FINOL',
      zona: 'Cuentas Clave 2',
    };
  }
  if (u.includes('MIKELANGELO') || u.includes('JOHNATAN')) {
    const isVilla = u.includes('VILLA');
    return {
      canonicalSeller: 'MIKELANGELO DIAZ',
      routeLabel: isVilla ? 'MIKELANGELO DIAZ - VILLA DEL ROS' : 'MIKELANGELO DIAZ',
      supervisor: 'JOHNATAN SOTO',
      zona: isVilla ? 'Villa del Rosario / Perijá' : 'Machiques / Perijá',
    };
  }
  if (u.includes('OSCAR ORTIZ')) {
    const isCosta = u.includes('COSTA');
    return {
      canonicalSeller: 'OSCAR ORTIZ',
      routeLabel: isCosta ? 'OSCAR ORTIZ - LA COSTA' : 'OSCAR ORTIZ - CORO',
      supervisor: 'ALI PEREZ',
      zona: isCosta ? 'La Costa / Falcón' : 'Coro / Falcón',
    };
  }
  if (u.includes('JUAN HERNANDEZ')) {
    const isFs = u.includes('FOOD SERVICE');
    return {
      canonicalSeller: 'JUAN HERNANDEZ',
      routeLabel: isFs ? 'FOOD SERVICE SENIOR - JUAN HERNANDEZ' : 'JUAN HERNANDEZ',
      supervisor: 'JOHNATAN SOTO',
      zona: isFs ? 'Food Service Senior' : 'Sur del Lago / El Chivo',
    };
  }
  if (u.includes('J PABLO ARAUJO')) {
    const isCabOje = u.includes('CAB') || u.includes('OJE');
    return {
      canonicalSeller: isCabOje ? 'J PABLO ARAUJO - CAB/OJE' : 'J PABLO ARAUJO',
      routeLabel: isCabOje ? 'J PABLO ARAUJO - CAB/OJE' : 'J PABLO ARAUJO',
      supervisor: 'NELSON FINOL',
      zona: isCabOje ? 'Cabimas / Ciudad Ojeda' : 'Costa Oriental del Lago',
    };
  }
  if (u.includes('JAIDER MEDINA') || u.includes('FOOD SERVICE NORTE')) {
    return {
      canonicalSeller: 'JAIDER MEDINA - FOOD SERVICE NORTE',
      routeLabel: 'JAIDER MEDINA - FOOD SERVICE NORTE',
      supervisor: 'NELSON FINOL',
      zona: 'Food Service Norte',
    };
  }
  if (u.includes('FOOD SERVICE SUR')) {
    return {
      canonicalSeller: 'FOOD SERVICE SUR',
      routeLabel: 'FOOD SERVICE SUR',
      supervisor: 'NELSON FINOL',
      zona: 'Food Service Sur',
    };
  }
  if (u.includes('MARIA BRICENO') || u.includes('MARIA BRICEÑO')) {
    return {
      canonicalSeller: 'MARIA BRICEÑO',
      routeLabel: 'MARIA BRICEÑO',
      supervisor: 'NELSON FINOL',
      zona: 'Maracaibo',
    };
  }
  if (u.includes('EDUARDO PINA') || u.includes('EDUARDO PIÑA')) {
    return {
      canonicalSeller: 'EDUARDO PIÑA',
      routeLabel: 'EDUARDO PIÑA',
      supervisor: 'NELSON FINOL',
      zona: 'Maracaibo',
    };
  }
  if (u.includes('HERNAN PAZ')) {
    return { canonicalSeller: 'HERNAN PAZ', routeLabel: 'HERNAN PAZ', supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Perijá' };
  }
  if (u.includes('OSWALDO CHURION')) {
    return { canonicalSeller: 'OSWALDO CHURION', routeLabel: 'OSWALDO CHURION', supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Sur' };
  }
  if (u.includes('ANGELICA MORENO')) {
    return { canonicalSeller: 'ANGELICA MORENO', routeLabel: 'ANGELICA MORENO', supervisor: 'JOHNATAN SOTO', zona: 'Maracaibo / Norte' };
  }
  if (u.includes('ADEL JARABA')) {
    return { canonicalSeller: 'ADEL JARABA', routeLabel: 'ADEL JARABA', supervisor: 'JOHNATAN SOTO', zona: 'Mayoristas / Maracaibo' };
  }
  if (u.includes('ANGEL NAVARRO') || u.includes('ALI PEREZ')) {
    return { canonicalSeller: 'ANGEL NAVARRO', routeLabel: 'ANGEL NAVARRO', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (u.includes('MARIANGEL GONZALEZ')) {
    return { canonicalSeller: 'MARIANGEL GONZALEZ', routeLabel: 'MARIANGEL GONZALEZ', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (u.includes('VICTOR CAMPOS')) {
    return { canonicalSeller: 'VICTOR CAMPOS', routeLabel: 'VICTOR CAMPOS', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (u.includes('ELISA SOLER')) {
    return { canonicalSeller: 'ELISA SOLER', routeLabel: 'ELISA SOLER', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (u.includes('LEONARDO RIOS')) {
    return { canonicalSeller: 'LEONARDO RIOS', routeLabel: 'LEONARDO RIOS', supervisor: 'ALI PEREZ', zona: 'Punto Fijo / Paraguaná' };
  }
  if (u.includes('LUIS GUANIPA')) {
    return { canonicalSeller: 'LUIS GUANIPA', routeLabel: 'LUIS GUANIPA', supervisor: 'ALI PEREZ', zona: 'Coro / Falcón' };
  }
  if (u.includes('CARLOS FUENMAYOR')) {
    return { canonicalSeller: 'CARLOS FUENMAYOR', routeLabel: 'CARLOS FUENMAYOR', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (u.includes('SARAH REYES')) {
    return { canonicalSeller: 'SARAH REYES', routeLabel: 'SARAH REYES', supervisor: 'NELSON FINOL', zona: 'Maracaibo / San Francisco' };
  }
  if (u.includes('JOSE G. GONZALEZ') || u.includes('JOSE GONZALEZ')) {
    return { canonicalSeller: 'JOSE G. GONZALEZ', routeLabel: 'JOSE G. GONZALEZ', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (u.includes('YOLEIDA LUGO')) {
    return { canonicalSeller: 'YOLEIDA LUGO', routeLabel: 'YOLEIDA LUGO', supervisor: 'NELSON FINOL', zona: 'Maracaibo' };
  }
  if (u.includes('MARYERY GARCIA')) {
    return { canonicalSeller: 'MARYERY GARCIA', routeLabel: 'MARYERY GARCIA', supervisor: 'NELSON FINOL', zona: 'Ciudad Ojeda / COL' };
  }
  if (u.includes('PEDRO ABREU')) {
    return { canonicalSeller: 'PEDRO ABREU', routeLabel: 'PEDRO ABREU', supervisor: 'NELSON FINOL', zona: 'Punto Fijo / Paraguaná' };
  }

  const clean = String(rawVendor || 'SIN ASIGNAR').trim().toUpperCase();
  return {
    canonicalSeller: clean,
    routeLabel: clean,
    supervisor: 'NELSON FINOL',
    zona: 'Occidente',
  };
};

const MANUAL_RUBROS_STORAGE_KEY = 'fdv_manual_rubros_v1';
type ManualRubrosMap = Record<string, Partial<Record<RubroClienteCodigo, boolean>>>;

const loadManualRubros = (): ManualRubrosMap => {
  try {
    const raw = localStorage.getItem(MANUAL_RUBROS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

interface ActivacionClientesSubmoduleProps {
  viewLevel?: ViewLevel;
  diasLaborables?: number;
  diasTranscurridos?: number;
}

export const ActivacionClientesSubmodule: React.FC<ActivacionClientesSubmoduleProps> = ({
  viewLevel = 'vendedor',
  diasLaborables = DEFAULT_DIAS_LABORABLES,
  diasTranscurridos = DEFAULT_DIAS_TRANSCURRIDOS,
}) => {
  const [rawActivacion, setRawActivacion] = useState<RawClientActivationItem[]>(
    () => (activacionSeed as RawClientActivationItem[]) || []
  );
  const [isSyncing, setIsSyncing] = useState(false);

  // Filtros de Vendedor, Ruta y Supervisor
  const [supervisorFilter, setSupervisorFilter] = useState<string>('ALL');
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [directVendorFilter, setDirectVendorFilter] = useState<string>('ALL');

  // Filtros de Cartera, Rubros y Búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'personal' | 'listado' | 'tarjetas'>('listado');
  const [selectedRubros, setSelectedRubros] = useState<RubroClienteCodigo[]>([]);
  const [rubroFilterMode, setRubroFilterMode] = useState<'ACTIVOS' | 'FALTANTES'>('ACTIVOS');
  const [statusFilter, setStatusFilter] = useState<
    'TODOS' | 'ACTIVOS' | 'FALTANTES' | 'FALTAN_RUBROS' | 'CINCO_RUBROS'
  >('TODOS');
  const [manualOverrides, setManualOverrides] = useState<ManualRubrosMap>(() => loadManualRubros());
  const [visibleLimit, setVisibleLimit] = useState<number>(350);

  const clientTableRef = useRef<HTMLDivElement | null>(null);

  const syncFromServer = useCallback(async (force = false) => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/cuotas/activacion-clientes${force ? '?refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setRawActivacion(data);
        }
      }
    } catch {
      // Mantiene datos semilla locales si no hay red
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    syncFromServer(false);
  }, [syncFromServer]);

  // Resetear límite de filas al cambiar filtros para respuesta inmediata
  useEffect(() => {
    setVisibleLimit(350);
  }, [supervisorFilter, selectedSellers, directVendorFilter, searchTerm, selectedRubros, rubroFilterMode, statusFilter, viewMode]);

  // Enriquecer cada registro con vendedor canónico, ruta y supervisor
  const enrichedRawList = useMemo(() => {
    return rawActivacion.map((item) => {
      const resolved = resolveCanonicalSellerForClient(item.vendedorNombre || item.vendedorId || '');
      return {
        ...item,
        canonicalSeller: resolved.canonicalSeller,
        routeLabel: resolved.routeLabel,
        supervisor: resolved.supervisor,
        zona: resolved.zona,
      };
    });
  }, [rawActivacion]);

  // Lista de Supervisores únicos
  const supervisorList = useMemo(() => {
    const order = ['JOHNATAN SOTO', 'ALI PEREZ', 'NELSON FINOL'];
    const set = new Set<string>();
    enrichedRawList.forEach((r) => {
      if (r.supervisor) set.add(r.supervisor);
    });
    return Array.from(set).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [enrichedRawList]);

  // Vendedores disponibles para el SellerMultiSelect (según supervisor activo)
  const availableSellers = useMemo<SellerOption[]>(() => {
    const filteredBySup =
      supervisorFilter === 'ALL'
        ? enrichedRawList
        : enrichedRawList.filter((r) => r.supervisor === supervisorFilter);

    const map = new Map<string, SellerOption>();
    filteredBySup.forEach((r) => {
      if (!map.has(r.canonicalSeller)) {
        map.set(r.canonicalSeller, {
          name: r.canonicalSeller,
          supervisor: r.supervisor,
          zona: r.zona,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [enrichedRawList, supervisorFilter]);

  // Opciones detalladas para el Selector Directo de Vendedor / Ruta (con conteo de clientes y rutas específicas)
  const directVendorDropdownOptions = useMemo(() => {
    const filteredBySup =
      supervisorFilter === 'ALL'
        ? enrichedRawList
        : enrichedRawList.filter((r) => r.supervisor === supervisorFilter);

    const sellerStats = new Map<
      string,
      {
        canonical: string;
        total: number;
        activos: number;
        routes: Map<string, { total: number; activos: number }>;
      }
    >();

    filteredBySup.forEach((r) => {
      const key = r.canonicalSeller;
      const cleanCod = String(r.id || '').replace(/^[#\s]+/, '').trim();
      const ov = manualOverrides[cleanCod];
      const hasAny =
        (ov?.ACEITE ?? Boolean(r.cats?.ACEITE || (r.cajas?.ACEITE || 0) > 0)) ||
        (ov?.AZUCAR ?? Boolean(r.cats?.AZUCAR || r.cats?.AZÚCAR || (r.cajas?.AZUCAR || 0) > 0)) ||
        (ov?.POLLO ?? Boolean(r.cats?.POLLO || (r.cajas?.POLLO || 0) > 0)) ||
        (ov?.ESTANDAR_ASTURIAS ?? Boolean(r.cats?.ESTANDAR_ASTURIAS || (r.cajas?.ESTANDAR_ASTURIAS || 0) > 0)) ||
        (ov?.MORTADELA_SALPICAO ?? Boolean(r.cats?.MORTADELA_SALPICAO || (r.cajas?.MORTADELA_SALPICAO || 0) > 0));

      if (!sellerStats.has(key)) {
        sellerStats.set(key, {
          canonical: key,
          total: 0,
          activos: 0,
          routes: new Map(),
        });
      }
      const st = sellerStats.get(key)!;
      st.total++;
      if (hasAny) st.activos++;

      const rLabel = r.routeLabel;
      if (!st.routes.has(rLabel)) {
        st.routes.set(rLabel, { total: 0, activos: 0 });
      }
      const rt = st.routes.get(rLabel)!;
      rt.total++;
      if (hasAny) rt.activos++;
    });

    const sortedSellers = Array.from(sellerStats.values()).sort((a, b) =>
      a.canonical.localeCompare(b.canonical)
    );

    const options: { value: string; label: string; total: number; activos: number; isSubRoute?: boolean }[] = [];
    sortedSellers.forEach((s) => {
      if (s.routes.size > 1) {
        options.push({
          value: `SELLER:${s.canonical}`,
          label: `${s.canonical} (Consolidado • ${s.activos}/${s.total} cli)`,
          total: s.total,
          activos: s.activos,
        });
        Array.from(s.routes.entries()).forEach(([rLabel, rStat]) => {
          options.push({
            value: `ROUTE:${rLabel}`,
            label: `   ↳ ${rLabel} (${rStat.activos}/${rStat.total} cli)`,
            total: rStat.total,
            activos: rStat.activos,
            isSubRoute: true,
          });
        });
      } else {
        options.push({
          value: `SELLER:${s.canonical}`,
          label: `${s.canonical} (${s.activos}/${s.total} cli)`,
          total: s.total,
          activos: s.activos,
        });
      }
    });

    return {
      options,
      sellerPills: sortedSellers,
    };
  }, [enrichedRawList, supervisorFilter, manualOverrides]);

  // Limpiar vendedores que no pertenezcan al supervisor cuando cambia supervisorFilter
  useEffect(() => {
    if (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
      const allowed = new Set(availableSellers.map((s) => s.name));
      const valid = selectedSellers.filter((name) => allowed.has(name));
      if (valid.length !== selectedSellers.length) {
        setSelectedSellers(valid);
      }
    }
    if (directVendorFilter !== 'ALL') {
      const stillValid = directVendorDropdownOptions.options.some((o) => o.value === directVendorFilter);
      if (!stillValid) {
        setDirectVendorFilter('ALL');
      }
    }
  }, [supervisorFilter, availableSellers, directVendorDropdownOptions.options, directVendorFilter, selectedSellers]);

  // Filtrar registros de activación según Supervisor, SellerMultiSelect y Selector Directo de Vendedor
  const filteredActivacionBySeller = useMemo(() => {
    return enrichedRawList.filter((item) => {
      if (supervisorFilter !== 'ALL' && item.supervisor !== supervisorFilter) {
        return false;
      }
      if (directVendorFilter !== 'ALL') {
        if (directVendorFilter.startsWith('SELLER:')) {
          const targetSeller = directVendorFilter.slice('SELLER:'.length);
          if (item.canonicalSeller !== targetSeller) return false;
        } else if (directVendorFilter.startsWith('ROUTE:')) {
          const targetRoute = directVendorFilter.slice('ROUTE:'.length);
          if (item.routeLabel !== targetRoute) return false;
        }
      }
      if (selectedSellers.length === 1 && selectedSellers[0] === '__NONE__') {
        return false;
      }
      if (selectedSellers.length > 0) {
        if (!selectedSellers.includes(item.canonicalSeller)) return false;
      }
      return true;
    });
  }, [enrichedRawList, supervisorFilter, directVendorFilter, selectedSellers]);

  // Etiqueta del vendedor o vista activa en el encabezado
  const activeVendedorTitle = useMemo(() => {
    if (directVendorFilter !== 'ALL') {
      return directVendorFilter.replace(/^(SELLER:|ROUTE:)/, '');
    }
    if (selectedSellers.length === 1 && selectedSellers[0] !== '__NONE__') {
      return selectedSellers[0];
    }
    if (selectedSellers.length > 1) {
      return `${selectedSellers.length} VENDEDORES SELECCIONADOS`;
    }
    if (supervisorFilter !== 'ALL') {
      return `SUPERVISIÓN ${supervisorFilter}`;
    }
    return 'GLOBAL (TODOS)';
  }, [directVendorFilter, selectedSellers, supervisorFilter]);

  const handleSelectMetricFilter = (
    nextStatus: 'TODOS' | 'ACTIVOS' | 'FALTANTES' | 'FALTAN_RUBROS' | 'CINCO_RUBROS',
    scrollToTable = true
  ) => {
    setSelectedRubros([]);
    setStatusFilter((prev) => {
      const target = prev === nextStatus && nextStatus !== 'TODOS' ? 'TODOS' : nextStatus;
      if (target === 'TODOS' && viewMode === 'personal') {
        setViewMode('listado');
      }
      if (scrollToTable && target !== 'TODOS') {
        setTimeout(() => {
          clientTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
      return target;
    });
  };

  const toggleRubroFilter = (rubro: RubroClienteCodigo) => {
    if (viewMode === 'personal') {
      setViewMode('listado');
    }
    setSelectedRubros((prev) => {
      const yaEsta = prev.includes(rubro);
      return (yaEsta ? prev.filter((r) => r !== rubro) : [...prev, rubro]).sort(
        (a, b) => RUBROS_ACTIVACION_CLIENTES.indexOf(a) - RUBROS_ACTIVACION_CLIENTES.indexOf(b)
      );
    });
  };

  const handleToggleClientRubro = (codigoRaw: string, rCode: RubroClienteCodigo, currentHas: boolean) => {
    const cleanCode = String(codigoRaw || '').replace(/^[#\s]+/, '').trim();
    if (!cleanCode) return;
    const nextActive = !currentHas;

    setManualOverrides((prev) => {
      const currentClientMap = prev[cleanCode] || {};
      const updated: ManualRubrosMap = {
        ...prev,
        [cleanCode]: {
          ...currentClientMap,
          [rCode]: nextActive,
        },
      };
      try {
        localStorage.setItem(MANUAL_RUBROS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    fetch('/api/cuotas/activacion-clientes/toggle-rubro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteCodigo: cleanCode, rubro: rCode, active: nextActive }),
    }).catch(() => {});
  };

  // Cálculos dinámicos basados en los clientes filtrados por vendedor/supervisor y sus 5 rubros
  const {
    totalClientes,
    activos,
    faltan,
    porcentaje,
    ritmoRequerido,
    proyeccionCierre,
    ritmoActual,
    diasTotales,
    diasTrans,
    diasRestantes,
    mesNombre,
    anioActual,
    avanceMesPorcentaje,
    faltantesPorActivar,
    sinNingunRubro,
    cienPorCientoActivados,
    saludCartera,
    clientList,
  } = useMemo(() => {
    const clientMap = new Map<
      string,
      {
        id: string;
        name: string;
        vendedor: string;
        routeLabel: string;
        supervisor: string;
        isActivo: boolean;
        rubrosComprados: Set<string>;
      }
    >();

    filteredActivacionBySeller.forEach((a) => {
      const key = a.id ? String(a.id).replace(/^[#\s]+/, '').trim() : String(a.cliente || '').trim();
      if (!key) return;
      const existing = clientMap.get(key);
      const rubros = existing ? existing.rubrosComprados : new Set<string>();

      const cAceite = Number(a.cajas?.ACEITE) || 0;
      const cAzucar = Number(a.cajas?.AZUCAR) || 0;
      const cPollo = Number(a.cajas?.POLLO) || 0;
      const cAsturias = Number(a.cajas?.ESTANDAR_ASTURIAS) || 0;
      const cSalpicao = Number(a.cajas?.MORTADELA_SALPICAO) || 0;

      if (a.cats?.ACEITE || cAceite > 0) rubros.add('ACEITE');
      if (a.cats?.AZUCAR || a.cats?.AZÚCAR || cAzucar > 0) rubros.add('AZÚCAR');
      if (a.cats?.POLLO || cPollo > 0) rubros.add('POLLO');
      if (a.cats?.ESTANDAR_ASTURIAS || cAsturias > 0) rubros.add('ESTANDAR Y SUPERIOR ASTURIAS');
      if (a.cats?.MORTADELA_SALPICAO || cSalpicao > 0) rubros.add('MORTADELA SALPICAO Y ASTURIAS');

      const ov = manualOverrides[key];
      if (ov) {
        if (ov.ACEITE === true) rubros.add('ACEITE');
        else if (ov.ACEITE === false) rubros.delete('ACEITE');

        if (ov.AZUCAR === true) rubros.add('AZÚCAR');
        else if (ov.AZUCAR === false) {
          rubros.delete('AZÚCAR');
          rubros.delete('AZUCAR');
        }

        if (ov.POLLO === true) rubros.add('POLLO');
        else if (ov.POLLO === false) rubros.delete('POLLO');

        if (ov.ESTANDAR_ASTURIAS === true) rubros.add('ESTANDAR Y SUPERIOR ASTURIAS');
        else if (ov.ESTANDAR_ASTURIAS === false) rubros.delete('ESTANDAR Y SUPERIOR ASTURIAS');

        if (ov.MORTADELA_SALPICAO === true) rubros.add('MORTADELA SALPICAO Y ASTURIAS');
        else if (ov.MORTADELA_SALPICAO === false) rubros.delete('MORTADELA SALPICAO Y ASTURIAS');
      }

      clientMap.set(key, {
        id: a.id ? String(a.id).replace(/^[#\s]+/, '').trim() : key,
        name: a.cliente || existing?.name || '',
        vendedor: a.canonicalSeller || existing?.vendedor || '',
        routeLabel: a.routeLabel || existing?.routeLabel || '',
        supervisor: a.supervisor || existing?.supervisor || '',
        isActivo: rubros.size > 0,
        rubrosComprados: rubros,
      });
    });

    const baseTotal = clientMap.size;
    const baseActivos = Array.from(clientMap.values()).filter(
      (c) => c.isActivo || c.rubrosComprados.size > 0
    ).length;

    const _faltan = Math.max(0, baseTotal - baseActivos);
    const _porcentaje = baseTotal > 0 ? (baseActivos / baseTotal) * 100 : 0;

    const autoProg = calculateMonthWorkingProgress();
    const safeLaborables = Math.max(1, diasLaborables || autoProg.diasLaborables);
    const safeTranscurridos = Math.min(safeLaborables, Math.max(1, diasTranscurridos || autoProg.diasTranscurridos));
    const safeRestantes = Math.max(0, safeLaborables - safeTranscurridos);
    const pctMes = Number(((safeTranscurridos / safeLaborables) * 100).toFixed(1));

    const _ritmoRequerido = safeRestantes > 0 ? _faltan / safeRestantes : 0;
    const _proyeccionCierre =
      safeTranscurridos > 0 ? Math.round((baseActivos / safeTranscurridos) * safeLaborables) : baseActivos;
    const _ritmoActual = safeTranscurridos > 0 ? baseActivos / safeTranscurridos : 0;

    let _faltantesPorActivar = 0;
    let _sinNingunRubro = 0;
    let _cienPorCientoActivados = 0;
    let totalRubrosComprados = 0;

    Array.from(clientMap.values()).forEach((c) => {
      const numRubros = Math.min(5, c.rubrosComprados.size);
      totalRubrosComprados += numRubros;

      if (numRubros === 0) _sinNingunRubro++;
      if (numRubros < 5) _faltantesPorActivar++;
      if (numRubros === 5) _cienPorCientoActivados++;
    });

    const _saludCartera = baseTotal > 0 ? totalRubrosComprados / baseTotal : 0;

    const list = Array.from(clientMap.entries()).map(([, data], idx) => {
      const hasAceite = data.rubrosComprados.has('ACEITE');
      const hasAzucar = data.rubrosComprados.has('AZÚCAR') || data.rubrosComprados.has('AZUCAR');
      const hasPollo = data.rubrosComprados.has('POLLO');
      const hasEstandarAsturias = data.rubrosComprados.has('ESTANDAR Y SUPERIOR ASTURIAS');
      const hasMortadelaSalpicao = data.rubrosComprados.has('MORTADELA SALPICAO Y ASTURIAS');

      const count = [
        hasAceite,
        hasAzucar,
        hasPollo,
        hasEstandarAsturias,
        hasMortadelaSalpicao,
      ].filter(Boolean).length;

      return {
        codigo: data.id ? (data.id.startsWith('#') ? data.id : `#${data.id}`) : `#${idx + 1}`,
        razonSocial: data.name,
        vendedor: data.vendedor,
        routeLabel: data.routeLabel,
        supervisor: data.supervisor,
        hasAceite,
        hasAzucar,
        hasPollo,
        hasEstandarAsturias,
        hasMortadelaSalpicao,
        cobertura: count,
      };
    });

    list.sort((a, b) => {
      const numA = parseInt(String(a.codigo).replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.codigo).replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return {
      totalClientes: baseTotal,
      activos: baseActivos,
      faltan: _faltan,
      porcentaje: _porcentaje,
      ritmoRequerido: _ritmoRequerido,
      proyeccionCierre: _proyeccionCierre,
      ritmoActual: _ritmoActual,
      diasTotales: safeLaborables,
      diasTrans: safeTranscurridos,
      diasRestantes: safeRestantes,
      mesNombre: autoProg.monthName,
      anioActual: autoProg.year,
      avanceMesPorcentaje: pctMes,
      faltantesPorActivar: _faltantesPorActivar,
      sinNingunRubro: _sinNingunRubro,
      cienPorCientoActivados: _cienPorCientoActivados,
      saludCartera: _saludCartera,
      clientList: list,
    };
  }, [filteredActivacionBySeller, manualOverrides, diasLaborables, diasTranscurridos]);

  const isEnRitmo = ritmoActual >= ritmoRequerido;
  const totalCartera = faltantesPorActivar + cienPorCientoActivados || totalClientes || 1;

  const clienteActivoEnRubro = (
    c: {
      hasAceite: boolean;
      hasAzucar: boolean;
      hasPollo: boolean;
      hasEstandarAsturias: boolean;
      hasMortadelaSalpicao: boolean;
    },
    rubro: RubroClienteCodigo
  ): boolean => {
    switch (rubro) {
      case 'ACEITE':
        return c.hasAceite;
      case 'AZUCAR':
        return c.hasAzucar;
      case 'POLLO':
        return c.hasPollo;
      case 'ESTANDAR_ASTURIAS':
        return c.hasEstandarAsturias;
      case 'MORTADELA_SALPICAO':
        return c.hasMortadelaSalpicao;
      default:
        return false;
    }
  };

  const rubroSelectionCounts = useMemo(() => {
    if (selectedRubros.length === 0) return { activos: 0, faltantes: 0 };
    let activosCount = 0;
    let faltantesCount = 0;
    clientList.forEach((c) => {
      if (selectedRubros.some((r) => clienteActivoEnRubro(c, r))) {
        activosCount++;
      }
      if (selectedRubros.some((r) => !clienteActivoEnRubro(c, r))) {
        faltantesCount++;
      }
    });
    return { activos: activosCount, faltantes: faltantesCount };
  }, [clientList, selectedRubros]);

  const displayedClients = useMemo(() => {
    const term = normSearch(searchTerm);
    const termCode = normClientCode(searchTerm);

    return clientList
      .filter((c) => {
        if (!term) return true;
        const nameMatch = normSearch(c.razonSocial || '').includes(term);
        const vendorMatch = normSearch(c.vendedor || '').includes(term) || normSearch(c.routeLabel || '').includes(term);
        const codeMatch =
          normSearch(c.codigo || '').includes(term) ||
          (termCode.length > 0 && normClientCode(c.codigo || '').includes(termCode));
        return nameMatch || codeMatch || vendorMatch;
      })
      .filter((c) => {
        if (selectedRubros.length > 0) {
          const matchesRubro =
            rubroFilterMode === 'FALTANTES'
              ? selectedRubros.some((r) => !clienteActivoEnRubro(c, r))
              : selectedRubros.some((r) => clienteActivoEnRubro(c, r));
          if (!matchesRubro) return false;
        }

        const effectiveStatus =
          viewMode === 'personal' && statusFilter === 'TODOS' ? 'FALTAN_RUBROS' : statusFilter;

        if (effectiveStatus === 'FALTANTES') {
          return c.cobertura === 0;
        }
        if (effectiveStatus === 'ACTIVOS') {
          return c.cobertura > 0;
        }
        if (effectiveStatus === 'FALTAN_RUBROS') {
          return c.cobertura < 5;
        }
        if (effectiveStatus === 'CINCO_RUBROS') {
          return c.cobertura === 5;
        }
        return true;
      });
  }, [clientList, searchTerm, viewMode, selectedRubros, rubroFilterMode, statusFilter]);

  const visibleClients = useMemo(() => {
    return displayedClients.slice(0, visibleLimit);
  }, [displayedClients, visibleLimit]);

  const generarPDF = useCallback(() => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const vendedorName =
      activeVendedorTitle === 'GLOBAL (TODOS)' ? 'TODOS LOS VENDEDORES' : activeVendedorTitle;
    const fechaEmision = new Date().toLocaleDateString('es-VE');
    const periodoLabel = `${(mesNombre || 'OCTUBRE').toUpperCase()} ${anioActual || 2026}`;

    doc.setFillColor(185, 0, 0);
    doc.rect(0, 0, 210, 22, 'F');

    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('CODIZULCA C.A. - GESTIÓN DE FUERZA DE VENTAS', 14, 10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`REPORTE OFICIAL DE ACTIVACIÓN POR CLIENTE - PERÍODO ${periodoLabel}`, 14, 17);

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Vendedor / Filtro: ${vendedorName}`, 14, 29);
    doc.setFont('helvetica', 'normal');
    doc.text(`Avance Mes: Día ${diasTrans}/${diasTotales} (${avanceMesPorcentaje}%)`, 105, 29);
    doc.text(`Emisión: ${fechaEmision}`, 160, 29);

    doc.setFillColor(245, 245, 245);
    doc.roundedRect(14, 33, 182, 27, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(14, 33, 182, 27, 2, 2, 'S');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('CARTERA TOTAL', 18, 38);
    doc.text('ACTIVADOS / %', 54, 38);
    doc.text('SIN COMPRA (0/5)', 92, 38);
    doc.text('PROY. CIERRE', 130, 38);
    doc.text('META DIARIA REQ.', 162, 38);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(`${totalClientes} cli`, 18, 44);
    doc.text(`${activos} cli (${porcentaje.toFixed(1)}%)`, 54, 44);
    doc.text(`${sinNingunRubro} cli`, 92, 44);
    doc.text(`${proyeccionCierre} cli`, 130, 44);
    doc.text(`${ritmoRequerido.toFixed(1)} cli/d`, 162, 44);

    const pctFaltantes = totalCartera > 0 ? Math.round((faltantesPorActivar / totalCartera) * 100) : 0;
    const pctSinRubro = totalCartera > 0 ? Math.round((sinNingunRubro / totalCartera) * 100) : 0;
    const pctCien = totalCartera > 0 ? Math.round((cienPorCientoActivados / totalCartera) * 100) : 0;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('SALUD CARTERA', 18, 51);
    doc.text('FALTAN (<5 RUBROS)', 54, 51);
    doc.text('SIN NINGÚN RUBRO', 92, 51);
    doc.text('100% ACTIVADOS (5/5)', 130, 51);
    doc.text('RITMO ACTUAL', 162, 51);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(`${saludCartera.toFixed(1)} / 5 rubros`, 18, 57);
    doc.text(`${faltantesPorActivar} (${pctFaltantes}%)`, 54, 57);
    doc.text(`${sinNingunRubro} (${pctSinRubro}%)`, 92, 57);
    doc.text(`${cienPorCientoActivados} (${pctCien}%)`, 130, 57);
    doc.text(`${ritmoActual.toFixed(1)} cli/d`, 162, 57);

    let tableStartY = 64;
    const isFiltered =
      selectedRubros.length > 0 ||
      searchTerm.trim().length > 0 ||
      viewMode === 'personal' ||
      statusFilter !== 'TODOS';
    if (isFiltered) {
      const rubrosTxt =
        selectedRubros.length > 0
          ? `Rubros: ${selectedRubros.map((r) => RUBRO_CLIENTE_LABEL[r]).join(', ')}`
          : statusFilter === 'FALTANTES'
          ? 'Clientes Faltantes por Vender (0/5)'
          : statusFilter === 'ACTIVOS'
          ? 'Clientes Activos (>= 1 rubro)'
          : statusFilter === 'FALTAN_RUBROS'
          ? 'Clientes con Rubros Faltantes (< 5 rubros)'
          : statusFilter === 'CINCO_RUBROS'
          ? 'Clientes 100% Activados (5/5)'
          : viewMode === 'personal'
          ? 'Vista Personal (< 5 rubros)'
          : '';
      const searchTxt = searchTerm.trim() ? `Búsqueda: "${searchTerm.trim()}"` : '';
      const filterDesc = [rubrosTxt, searchTxt].filter(Boolean).join(' | ');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(185, 0, 0);
      doc.text(
        `Filtro aplicado (${displayedClients.length} de ${totalClientes} clientes): ${filterDesc}`,
        14,
        65
      );
      tableStartY = 68;
    }

    const countAceite = displayedClients.filter((c) => c.hasAceite).length;
    const countAzucar = displayedClients.filter((c) => c.hasAzucar).length;
    const countPollo = displayedClients.filter((c) => c.hasPollo).length;
    const countAsturias = displayedClients.filter((c) => c.hasEstandarAsturias).length;
    const countSalpicao = displayedClients.filter((c) => c.hasMortadelaSalpicao).length;
    const countActivosMostrados = displayedClients.filter((c) => c.cobertura > 0).length;
    const countFaltantesMostrados = Math.max(0, displayedClients.length - countActivosMostrados);

    const tableData = displayedClients.map((client) => [
      client.codigo,
      client.razonSocial,
      client.cobertura > 0 ? 'ACTIVO' : 'FALTA VENDER',
      client.hasAceite ? 'SI' : '-',
      client.hasAzucar ? 'SI' : '-',
      client.hasPollo ? 'SI' : '-',
      client.hasEstandarAsturias ? 'SI' : '-',
      client.hasMortadelaSalpicao ? 'SI' : '-',
      `${client.cobertura}/5 (${client.cobertura * 20}%)`,
    ]);

    if (displayedClients.length > 0) {
      tableData.push([
        'TOTAL',
        `CARTERA LISTADA: ${displayedClients.length} CLI`,
        `Act: ${countActivosMostrados} | Falta: ${countFaltantesMostrados}`,
        `${countAceite}`,
        `${countAzucar}`,
        `${countPollo}`,
        `${countAsturias}`,
        `${countSalpicao}`,
        `${
          displayedClients.length > 0
            ? ((countActivosMostrados / displayedClients.length) * 100).toFixed(1)
            : '0.0'
        }%`,
      ]);
    }

    autoTable(doc, {
      startY: tableStartY,
      head: [
        [
          'Cód.',
          'Razón Social / Cliente',
          'Activ. General',
          'Aceite',
          'Azúcar',
          'Pollo',
          'Est. Asturias',
          'Mort. Salpicao',
          'Cobertura',
        ],
      ],
      body:
        tableData.length > 0
          ? tableData
          : [
              [
                '-',
                'Sin registros de clientes disponibles para el filtro actual',
                '-',
                '-',
                '-',
                '-',
                '-',
                '-',
                '-',
              ],
            ],
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 1.8,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [185, 0, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7,
      },
      columnStyles: {
        0: { cellWidth: 13, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 13, halign: 'center' },
        4: { cellWidth: 13, halign: 'center' },
        5: { cellWidth: 13, halign: 'center' },
        6: { cellWidth: 20, halign: 'center' },
        7: { cellWidth: 20, halign: 'center' },
        8: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const isTotalRow = displayedClients.length > 0 && data.row.index === tableData.length - 1;
          if (isTotalRow) {
            data.cell.styles.fillColor = [240, 240, 240];
            data.cell.styles.textColor = [20, 20, 20];
            data.cell.styles.fontStyle = 'bold';
          } else if (data.column.index === 2) {
            if (data.cell.raw === 'ACTIVO') {
              data.cell.styles.textColor = [16, 149, 79];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [211, 47, 47];
              data.cell.styles.fontStyle = 'bold';
            }
          } else if (data.column.index >= 3 && data.column.index <= 7) {
            if (data.cell.raw === 'SI') {
              data.cell.styles.textColor = [16, 149, 79];
              data.cell.styles.fontStyle = 'bold';
            } else if (data.cell.raw === '-') {
              data.cell.styles.textColor = [160, 160, 160];
            }
          }
        }
      },
      didDrawPage: (data) => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(`Página ${data.pageNumber} - Confidencial CODIZULCA C.A. | ${periodoLabel}`, 14, 290);
      },
    });

    doc.save(
      `Reporte_Activacion_Clientes_${vendedorName.replace(/\s+/g, '_')}_${periodoLabel.replace(
        /\s+/g,
        '_'
      )}.pdf`
    );
  }, [
    activeVendedorTitle,
    mesNombre,
    anioActual,
    diasTrans,
    diasTotales,
    avanceMesPorcentaje,
    totalClientes,
    activos,
    porcentaje,
    sinNingunRubro,
    proyeccionCierre,
    ritmoRequerido,
    totalCartera,
    faltantesPorActivar,
    cienPorCientoActivados,
    saludCartera,
    ritmoActual,
    selectedRubros,
    searchTerm,
    viewMode,
    statusFilter,
    displayedClients,
  ]);

  // Escuchar evento global de exportación PDF del botón superior en MonthProgressBar
  useEffect(() => {
    const handleExportPdf = () => generarPDF();
    window.addEventListener('cuotas-export-pdf', handleExportPdf);
    return () => window.removeEventListener('cuotas-export-pdf', handleExportPdf);
  }, [generarPDF]);

  const showSellerTagInRow =
    directVendorFilter === 'ALL' &&
    (selectedSellers.length === 0 || selectedSellers.length > 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Widget 1: Activación General Clientes */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-sans font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-red-500" /> Activación General Clientes
            </h3>
            <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-mono font-bold px-2 py-1 rounded">
              {porcentaje.toFixed(1)}%
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 gap-3">
            <div>
              <div className="text-3xl sm:text-4xl font-mono text-white font-bold tracking-tight">
                {activos}{' '}
                <span className="text-base sm:text-lg text-neutral-500 font-sans font-normal">
                  / {totalClientes} cli
                </span>
              </div>
              <div className="text-xs font-sans text-neutral-400 mt-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectMetricFilter('ACTIVOS')}
                  title="Clic para filtrar los clientes ya activados"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    statusFilter === 'ACTIVOS'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-600 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Activos: {activos}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMetricFilter('FALTANTES')}
                  title="Clic para filtrar los clientes que faltan por vender"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    statusFilter === 'FALTANTES'
                      ? 'bg-red-600 text-white shadow'
                      : 'bg-red-950/50 text-red-400 border border-red-800/60 hover:bg-red-600 hover:text-white'
                  }`}
                >
                  <XCircle className="w-3 h-3" />
                  <span>Faltan: {faltan} clientes</span>
                </button>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-[10px] font-sans text-neutral-500 uppercase tracking-wider">
                Proyección Cierre
              </div>
              <div className="text-xl font-mono text-amber-400 font-bold tracking-tight">
                {proyeccionCierre} <span className="text-sm font-sans">cli</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-neutral-800 mt-2">
            <div
              className="bg-red-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, porcentaje)}%` }}
            />
          </div>
        </div>

        {/* Widget 2: Meta Diaria Activación */}
        <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-xl p-5 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-900/10 rounded-full blur-2xl" />

          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-sm font-sans font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Meta Diaria Activación
            </h3>
            <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 text-xs font-mono font-bold px-3 py-1 rounded-full shrink-0">
              {diasRestantes}d rest.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 gap-3 relative z-10">
            <div>
              <div className="text-3xl sm:text-4xl font-mono text-amber-400 font-bold tracking-tight">
                {ritmoRequerido.toFixed(1)}{' '}
                <span className="text-base sm:text-lg text-white font-sans font-bold">CLI/DÍA</span>
              </div>
              <div className="text-xs font-sans text-neutral-400 mt-1">
                Activar <span className="text-amber-400 font-bold">~{Math.ceil(ritmoRequerido)} cli/día</span> en{' '}
                {diasRestantes} días hábiles ({faltan} cli faltantes).
              </div>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-900/50 px-3 py-1.5 rounded-full flex items-center justify-center gap-2 w-full sm:w-auto self-start sm:self-auto">
              <Target className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-xs font-sans font-bold text-emerald-400">Meta Requerida</span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-emerald-900/30 mt-4 relative z-10">
            <span className="text-xs font-sans text-neutral-400">
              Avance: <strong className="text-white font-mono text-sm">{ritmoActual.toFixed(1)} cli/d</strong>
            </span>
            <div
              className={`px-3 py-1 rounded-full flex items-center gap-2 ${
                isEnRitmo
                  ? 'bg-emerald-950/40 border border-emerald-900/50'
                  : 'bg-red-950/40 border border-red-900/50'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full animate-pulse ${
                  isEnRitmo ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              <span
                className={`text-xs font-sans font-bold ${
                  isEnRitmo ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {isEnRitmo ? 'En ritmo' : 'Atrasado'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: MÓDULO DE ACTIVACIÓN POR CLIENTE & FILTROS POR VENDEDOR */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden flex flex-col">
        {/* Header / Vendedor Toolbar */}
        <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-neutral-900/20">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="bg-red-600 p-2.5 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-neutral-950 rounded-full" />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-red-500" />
                <h2 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider">
                  Módulo de Activación por Cliente
                </h2>
                <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-[9px] font-mono px-2 py-0.5 rounded-full uppercase ml-1">
                  Código: 004
                </div>
              </div>
              <h3 className="text-lg md:text-xl font-sans font-bold text-white uppercase tracking-tight">
                {activeVendedorTitle === 'GLOBAL (TODOS)' ? 'REPORTE: ' : 'VENDEDOR: '}{' '}
                <span className="text-red-400">{activeVendedorTitle}</span>
              </h3>
            </div>
          </div>

          {/* Controles de Filtro por Supervisor, Vendedor, Vista, Buscador y PDF */}
          <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
            {/* Filtro por Supervisor */}
            <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <select
                value={supervisorFilter}
                onChange={(e) => {
                  setSupervisorFilter(e.target.value);
                  setDirectVendorFilter('ALL');
                }}
                aria-label="Filtrar por Supervisor"
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL" className="bg-neutral-900 text-white">
                  Todos los Supervisores
                </option>
                {supervisorList.map((sup) => (
                  <option key={sup} value={sup} className="bg-neutral-900 text-white">
                    Sup: {sup}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector Directo por Vendedor / Ruta */}
            <div className="relative flex items-center bg-neutral-900 border border-red-500/40 hover:border-red-500 rounded-lg px-3 py-1.5 text-xs shadow-[0_0_12px_rgba(220,38,38,0.12)]">
              <User className="w-3.5 h-3.5 text-red-400 mr-1.5 shrink-0" />
              <select
                value={directVendorFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setDirectVendorFilter(val);
                  if (val !== 'ALL') {
                    setSelectedSellers([]);
                  }
                }}
                aria-label="Filtrar por Vendedor"
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer text-xs pr-5 max-w-[230px] sm:max-w-[270px] truncate"
              >
                <option value="ALL" className="bg-neutral-950 text-white font-bold">
                  Todos los Vendedores ({enrichedRawList.length} cli)
                </option>
                {directVendorDropdownOptions.options.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-neutral-950 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-red-400 pointer-events-none absolute right-2.5" />
            </div>

            {/* Multi-Select de Vendedores (Consistente con las demás pestañas de Cuotas) */}
            <SellerMultiSelect
              sellers={availableSellers}
              selectedSellers={selectedSellers}
              onChange={(next) => {
                setSelectedSellers(next);
                if (next.length > 0) {
                  setDirectVendorFilter('ALL');
                }
              }}
              supervisorLabel={supervisorFilter !== 'ALL' ? supervisorFilter : undefined}
            />

            {/* Selector de Modo de Vista */}
            <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => {
                  setViewMode('personal');
                  setStatusFilter('FALTAN_RUBROS');
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-sans transition-colors border-r cursor-pointer ${
                  viewMode === 'personal'
                    ? 'font-bold text-white bg-red-600 border-red-700'
                    : 'text-neutral-400 hover:text-white border-neutral-800'
                }`}
              >
                <User className="w-3.5 h-3.5" /> Vista Personal
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('listado');
                  if (statusFilter === 'FALTAN_RUBROS') setStatusFilter('TODOS');
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-sans transition-colors border-r cursor-pointer ${
                  viewMode === 'listado'
                    ? 'font-bold text-white bg-red-600 border-red-700'
                    : 'text-neutral-400 hover:text-white border-neutral-800'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" /> Listado
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tarjetas')}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-sans transition-colors cursor-pointer ${
                  viewMode === 'tarjetas'
                    ? 'font-bold text-white bg-red-600'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Grip className="w-3.5 h-3.5" /> Tarjetas
              </button>
            </div>

            {/* Buscador + Botones de Sincronización y PDF */}
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar cliente, código o vendedor..."
                  className="w-full sm:w-56 bg-neutral-900 border border-neutral-800 text-xs sm:text-sm font-sans text-white rounded-full pl-9 pr-8 py-1.5 focus:outline-none focus:border-neutral-600 transition-colors"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    title="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => syncFromServer(true)}
                disabled={isSyncing}
                title="Sincronizar activación de clientes en vivo"
                className="flex shrink-0 items-center justify-center p-2 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-red-400' : ''}`} />
              </button>

              <button
                type="button"
                onClick={generarPDF}
                className="flex shrink-0 items-center justify-center gap-1.5 text-xs font-sans font-bold text-white bg-red-600 px-3.5 py-1.5 rounded-full hover:bg-red-700 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Píldoras Rápidas por Vendedor para filtrar en 1 clic */}
        <div className="px-4 py-2.5 bg-neutral-900/40 border-b border-neutral-800 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <span className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Users className="w-3 h-3 text-red-500" /> Vendedores:
          </span>
          <button
            type="button"
            onClick={() => {
              setDirectVendorFilter('ALL');
              setSelectedSellers([]);
            }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-sans font-bold border shrink-0 transition-all cursor-pointer ${
              directVendorFilter === 'ALL' && selectedSellers.length === 0
                ? 'bg-red-600 text-white border-red-500 shadow'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
            }`}
          >
            Todos ({enrichedRawList.length})
          </button>
          {directVendorDropdownOptions.sellerPills.map((s) => {
            const isSelected =
              directVendorFilter === `SELLER:${s.canonical}` ||
              (selectedSellers.length === 1 && selectedSellers[0] === s.canonical);
            const pct = s.total > 0 ? Math.round((s.activos / s.total) * 100) : 0;
            return (
              <button
                key={s.canonical}
                type="button"
                onClick={() => {
                  setSelectedSellers([]);
                  setDirectVendorFilter((prev) =>
                    prev === `SELLER:${s.canonical}` ? 'ALL' : `SELLER:${s.canonical}`
                  );
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-sans font-bold border shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-red-600 text-white border-red-400 shadow'
                    : 'bg-neutral-900/90 text-neutral-300 border-neutral-800 hover:text-white hover:border-neutral-600'
                }`}
              >
                <span>{s.canonical}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? 'bg-black/30 text-white'
                      : pct >= 60
                      ? 'bg-emerald-950/70 text-emerald-400'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {s.activos}/{s.total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Métricas Header */}
        <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-2">
            <TriangleAlert className="w-4 h-4 text-neutral-400" />
            <h3 className="text-xs md:text-sm font-sans font-bold text-neutral-300 uppercase tracking-wider">
              Métricas de Activación & Clientes Faltantes
            </h3>
          </div>

          <div className="text-[10px] md:text-xs font-sans text-neutral-500">
            Salud de Cartera:{' '}
            <span className="text-emerald-400 font-bold">
              {saludCartera.toFixed(1)} / 5 Rubros Promedio
            </span>
          </div>
        </div>

        {/* Métricas Cards */}
        <div className="p-4 md:p-5 bg-neutral-950">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            {/* Card 1: Faltantes por activar (< 5 rubros) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectMetricFilter('FALTAN_RUBROS')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectMetricFilter('FALTAN_RUBROS');
                }
              }}
              title="Clic para filtrar los clientes a los que les falta activar 1 o más rubros"
              className={`bg-neutral-950 rounded-xl p-4 md:p-5 flex flex-col relative overflow-hidden cursor-pointer transition-all select-none ${
                statusFilter === 'FALTAN_RUBROS'
                  ? 'border-2 border-red-500 ring-2 ring-red-500/20 bg-gradient-to-b from-red-950/25 to-neutral-950 shadow-lg shadow-red-950/30'
                  : 'border border-neutral-800 hover:border-red-600/60 hover:bg-neutral-900/30'
              }`}
            >
              <div className="flex justify-between items-start mb-4 relative z-10">
                <h4 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Faltantes Por Activar
                </h4>
                <div className="flex items-center gap-1.5">
                  {statusFilter === 'FALTAN_RUBROS' && (
                    <span className="bg-red-600 text-white text-[9px] font-sans font-extrabold px-2 py-0.5 rounded-full uppercase">
                      Filtro Activo
                    </span>
                  )}
                  <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-[9px] md:text-[10px] font-sans font-bold px-2 py-1 rounded-full">
                    {totalClientes > 0 ? Math.round((faltantesPorActivar / totalClientes) * 100) : 0}% Cartera
                  </div>
                </div>
              </div>

              <div className="mb-2 relative z-10">
                <div className="text-3xl md:text-4xl font-mono text-white font-bold tracking-tight">
                  {faltantesPorActivar}{' '}
                  <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal">
                    de {totalClientes} clientes
                  </span>
                </div>
              </div>

              <p className="text-[10px] md:text-xs font-sans text-neutral-400 mb-4 mt-1 leading-tight relative z-10">
                Les falta comprar 1 o más rubros para completar la activación de 5 rubros (toca para filtrar)
              </p>

              <div className="mt-auto relative z-10">
                <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                  <div
                    className="bg-red-500 h-full rounded-full"
                    style={{
                      width: `${
                        totalClientes > 0 ? Math.min(100, (faltantesPorActivar / totalClientes) * 100) : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Sin ningún rubro (0/5) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectMetricFilter('FALTANTES')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectMetricFilter('FALTANTES');
                }
              }}
              title="Clic para filtrar los clientes que faltan por activar (0 compras)"
              className={`bg-neutral-950 rounded-xl p-4 md:p-5 flex flex-col relative overflow-hidden cursor-pointer transition-all select-none ${
                statusFilter === 'FALTANTES'
                  ? 'border-2 border-red-500 ring-2 ring-red-500/20 bg-gradient-to-b from-red-950/25 to-neutral-950 shadow-lg shadow-red-950/30'
                  : 'border border-neutral-800 hover:border-red-600/60 hover:bg-neutral-900/30'
              }`}
            >
              <div className="flex justify-between items-start mb-4 relative z-10">
                <h4 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> Sin Ningún Rubro (0/5)
                </h4>
                <div className="flex items-center gap-1.5">
                  {statusFilter === 'FALTANTES' && (
                    <span className="bg-red-600 text-white text-[9px] font-sans font-extrabold px-2 py-0.5 rounded-full uppercase">
                      Filtro Activo
                    </span>
                  )}
                  <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-[9px] md:text-[10px] font-sans font-bold px-2 py-1 rounded-full">
                    {totalClientes > 0 ? Math.round((sinNingunRubro / totalClientes) * 100) : 0}% Cartera
                  </div>
                </div>
              </div>

              <div className="mb-2 relative z-10">
                <div className="text-3xl md:text-4xl font-mono text-red-400 font-bold tracking-tight">
                  {sinNingunRubro}{' '}
                  <span className="text-xs md:text-sm font-sans font-normal text-white">
                    de {totalClientes} clientes
                  </span>
                </div>
              </div>

              <p className="text-[10px] md:text-xs font-sans text-neutral-400 mb-4 mt-1 leading-tight relative z-10">
                Atención prioritaria: clientes con 0 compras en la temporada (toca para filtrar)
              </p>

              <div className="mt-auto relative z-10">
                <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                  <div
                    className="bg-red-600 h-full rounded-full"
                    style={{
                      width: `${
                        totalClientes > 0 ? Math.min(100, (sinNingunRubro / totalClientes) * 100) : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Card 3: 100% Activados (5/5) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectMetricFilter('CINCO_RUBROS')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectMetricFilter('CINCO_RUBROS');
                }
              }}
              title="Clic para filtrar los clientes 100% activados (5/5 rubros)"
              className={`bg-neutral-950 rounded-xl p-4 md:p-5 flex flex-col relative overflow-hidden cursor-pointer transition-all select-none ${
                statusFilter === 'CINCO_RUBROS'
                  ? 'border-2 border-emerald-500 ring-2 ring-emerald-500/20 bg-gradient-to-b from-emerald-950/25 to-neutral-950 shadow-lg shadow-emerald-950/30'
                  : 'border border-neutral-800 hover:border-emerald-600/60 hover:bg-neutral-900/30'
              }`}
            >
              <div className="flex justify-between items-start mb-4 relative z-10">
                <h4 className="text-xs font-sans font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> 100% Activados (5/5)
                </h4>
                <div className="flex items-center gap-1.5">
                  {statusFilter === 'CINCO_RUBROS' && (
                    <span className="bg-emerald-600 text-white text-[9px] font-sans font-extrabold px-2 py-0.5 rounded-full uppercase">
                      Filtro Activo
                    </span>
                  )}
                  <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 text-[9px] md:text-[10px] font-sans font-bold px-2 py-1 rounded-full">
                    {totalClientes > 0 ? Math.round((cienPorCientoActivados / totalClientes) * 100) : 0}% Cobertura
                  </div>
                </div>
              </div>

              <div className="mb-2 relative z-10">
                <div className="text-3xl md:text-4xl font-mono text-emerald-400 font-bold tracking-tight">
                  {cienPorCientoActivados}{' '}
                  <span className="text-xs md:text-sm font-sans font-normal text-white">
                    de {totalClientes} clientes
                  </span>
                </div>
              </div>

              <p className="text-[10px] md:text-xs font-sans text-neutral-400 mb-4 mt-1 leading-tight relative z-10">
                Clientes meta: cuentan con compras en los 5 rubros del programa (toca para filtrar)
              </p>

              <div className="mt-auto relative z-10">
                <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{
                      width: `${
                        totalClientes > 0 ? Math.min(100, (cienPorCientoActivados / totalClientes) * 100) : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Cartera vs Faltan */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectMetricFilter('FALTANTES')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectMetricFilter('FALTANTES');
                }
              }}
              title="Clic para filtrar los clientes que faltan por activar"
              className={`bg-neutral-950 rounded-xl p-4 md:p-5 flex flex-col relative overflow-hidden cursor-pointer transition-all select-none ${
                statusFilter === 'FALTANTES'
                  ? 'border-2 border-amber-500 ring-2 ring-amber-500/20 bg-gradient-to-b from-amber-950/25 to-neutral-950 shadow-lg shadow-amber-950/30'
                  : 'border border-neutral-800 hover:border-amber-600/60 hover:bg-neutral-900/30'
              }`}
            >
              <div className="flex justify-between items-start mb-4 relative z-10">
                <h4 className="text-xs font-sans font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4" /> Cartera vs Faltan
                </h4>
                <div className="flex items-center gap-1.5">
                  {statusFilter === 'FALTANTES' && (
                    <span className="bg-amber-600 text-white text-[9px] font-sans font-extrabold px-2 py-0.5 rounded-full uppercase">
                      Filtro Activo
                    </span>
                  )}
                  <div className="bg-amber-950/40 border border-amber-900/50 text-amber-400 text-[9px] md:text-[10px] font-sans font-bold px-2 py-1 rounded-full">
                    {totalClientes > 0 ? Math.round((faltan / totalClientes) * 100) : 0}% Faltan
                  </div>
                </div>
              </div>

              <div className="mb-2 relative z-10">
                <div className="text-3xl md:text-4xl font-mono text-amber-400 font-bold tracking-tight">
                  {faltan}{' '}
                  <span className="text-xs md:text-sm text-white font-sans font-normal">
                    de {totalClientes} clientes
                  </span>
                </div>
              </div>

              <p className="text-[10px] md:text-xs font-sans text-neutral-400 mb-4 mt-1 leading-tight relative z-10">
                Activados: <strong className="text-emerald-400">{activos} cli ({porcentaje.toFixed(1)}%)</strong> · Faltan
                por vender: <strong className="text-red-400">{faltan} cli</strong> (toca para filtrar)
              </p>

              <div className="mt-auto relative z-10">
                <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{
                      width: `${totalClientes > 0 ? Math.min(100, (faltan / totalClientes) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: DETALLE DE COBERTURA POR CLIENTE (TABLA EXACTA DE LA IMAGEN) */}
      <div
        ref={clientTableRef}
        className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden flex flex-col"
      >
        <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LayoutList className="w-4 h-4 text-white bg-red-600 p-1 box-content rounded" />
            <div>
              <h2 className="text-base font-sans font-bold text-white uppercase tracking-wider">
                Detalle de Cobertura por Cliente
              </h2>
              <p className="text-[11px] font-sans text-neutral-400">
                Tilda uno o varios rubros para <strong>filtrar clientes activos o faltantes por rubro</strong>, selecciona
                un <strong>vendedor arriba</strong>, o toca los rubros de un cliente para{' '}
                <strong>activarlos en verde</strong>.
              </p>
            </div>
          </div>

          {/* Barra rápida de rubros */}
          <div className="flex flex-wrap items-center gap-1.5">
            {RUBROS_ACTIVACION_CLIENTES.map((rCode) => {
              const active = selectedRubros.includes(rCode);
              const rTheme = getRubroIconAndTheme(rCode);
              const IconComp = rTheme.icon;
              return (
                <button
                  key={rCode}
                  type="button"
                  onClick={() => toggleRubroFilter(rCode)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-sans font-bold border transition-all cursor-pointer ${
                    active
                      ? `${rTheme.badgeCls} shadow ring-1 ring-white/10`
                      : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:text-white hover:border-neutral-600'
                  }`}
                >
                  {active ? (
                    <CheckSquare className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 opacity-60" />
                  )}
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{RUBRO_CLIENTE_LABEL[rCode]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de filtros rápidos por Estado de Cartera */}
        <div className="px-4 py-2.5 bg-neutral-900/40 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-sans font-bold text-neutral-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-red-500" /> Filtrar Cartera:
            </span>
            <button
              type="button"
              onClick={() => handleSelectMetricFilter('TODOS', false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'TODOS' && viewMode !== 'personal'
                  ? 'bg-neutral-200 text-black border-white'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              Todos ({totalClientes})
            </button>
            <button
              type="button"
              onClick={() => handleSelectMetricFilter('ACTIVOS', false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'ACTIVOS'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-neutral-900 text-emerald-400/90 border-neutral-800 hover:border-emerald-700/60'
              }`}
            >
              Activos ≥1 ({activos})
            </button>
            <button
              type="button"
              onClick={() => handleSelectMetricFilter('FALTANTES', false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'FALTANTES'
                  ? 'bg-red-600 text-white border-red-500'
                  : 'bg-neutral-900 text-red-400/90 border-neutral-800 hover:border-red-700/60'
              }`}
            >
              Faltan Vender 0/5 ({faltan})
            </button>
            <button
              type="button"
              onClick={() => handleSelectMetricFilter('FALTAN_RUBROS', false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'FALTAN_RUBROS' || viewMode === 'personal'
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-neutral-900 text-amber-400/90 border-neutral-800 hover:border-amber-700/60'
              }`}
            >
              Faltan Rubros &lt;5 ({faltantesPorActivar})
            </button>
            <button
              type="button"
              onClick={() => handleSelectMetricFilter('CINCO_RUBROS', false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'CINCO_RUBROS'
                  ? 'bg-teal-600 text-white border-teal-500'
                  : 'bg-neutral-900 text-teal-400/90 border-neutral-800 hover:border-teal-700/60'
              }`}
            >
              100% Activados 5/5 ({cienPorCientoActivados})
            </button>
          </div>

          {(searchTerm.trim() !== '' ||
            statusFilter !== 'TODOS' ||
            selectedRubros.length > 0 ||
            viewMode === 'personal' ||
            directVendorFilter !== 'ALL' ||
            supervisorFilter !== 'ALL' ||
            selectedSellers.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('TODOS');
                setSelectedRubros([]);
                setRubroFilterMode('ACTIVOS');
                setDirectVendorFilter('ALL');
                setSupervisorFilter('ALL');
                setSelectedSellers([]);
                if (viewMode === 'personal') setViewMode('listado');
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-sans font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpiar filtros ({displayedClients.length}/{enrichedRawList.length})
            </button>
          )}
        </div>

        {selectedRubros.length > 0 && (
          <div className="px-4 py-2.5 bg-emerald-950/25 border-b border-emerald-900/40 flex flex-wrap items-center justify-between gap-2 text-xs font-sans">
            <div className="flex flex-wrap items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Mostrando <strong>{displayedClients.length}</strong>{' '}
                {rubroFilterMode === 'FALTANTES'
                  ? 'clientes que faltan por activar en:'
                  : 'clientes activos en:'}{' '}
                <strong>{selectedRubros.map((r) => RUBRO_CLIENTE_LABEL[r]).join(', ')}</strong>
              </span>
              <div className="inline-flex rounded-md overflow-hidden border border-neutral-700 ml-1">
                <button
                  type="button"
                  onClick={() => setRubroFilterMode('ACTIVOS')}
                  className={`px-2 py-0.5 text-[11px] font-bold transition-colors cursor-pointer ${
                    rubroFilterMode === 'ACTIVOS'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  Activos en rubro ({rubroSelectionCounts.activos})
                </button>
                <button
                  type="button"
                  onClick={() => setRubroFilterMode('FALTANTES')}
                  className={`px-2 py-0.5 text-[11px] font-bold transition-colors border-l border-neutral-700 cursor-pointer ${
                    rubroFilterMode === 'FALTANTES'
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  Faltantes en rubro ({rubroSelectionCounts.faltantes})
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedRubros([]);
                setRubroFilterMode('ACTIVOS');
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 transition-colors cursor-pointer"
            >
              Quitar filtro de rubro ({totalClientes})
            </button>
          </div>
        )}

        {/* Desktop View: Table */}
        {viewMode !== 'tarjetas' && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-[#b90000] text-[10px] font-sans text-white uppercase tracking-wider">
                  <th className="p-3 font-bold border-r border-[#a00000] w-20 text-center">Codigo</th>
                  <th className="p-3 font-bold border-r border-[#a00000]">Razon Social</th>
                  <th
                    onClick={() => handleSelectMetricFilter('FALTANTES', false)}
                    title="Clic para filtrar clientes que faltan por vender (o volver a todos)"
                    className={`p-3 font-bold text-center border-r border-[#a00000] w-36 cursor-pointer transition-colors ${
                      statusFilter === 'FALTANTES' ? 'bg-red-950 text-amber-300' : 'hover:bg-red-800'
                    }`}
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> Activación General
                      </span>
                      <span className="text-[9px] font-mono text-red-100 mt-0.5">
                        Act: {activos}/{totalClientes} · Falta: {faltan}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => toggleRubroFilter('ACEITE')}
                    title="Filtrar clientes por Aceite"
                    className={`p-3 font-bold text-center border-r border-[#a00000] w-24 cursor-pointer transition-colors ${
                      selectedRubros.includes('ACEITE') ? 'bg-emerald-800 text-white' : 'hover:bg-red-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {selectedRubros.includes('ACEITE') ? (
                        <CheckSquare className="w-3 h-3" />
                      ) : (
                        <Activity className="w-3 h-3 opacity-75" />
                      )}{' '}
                      Aceite
                    </span>
                  </th>
                  <th
                    onClick={() => toggleRubroFilter('AZUCAR')}
                    title="Filtrar clientes por Azúcar"
                    className={`p-3 font-bold text-center border-r border-[#a00000] w-24 cursor-pointer transition-colors ${
                      selectedRubros.includes('AZUCAR') ? 'bg-emerald-800 text-white' : 'hover:bg-red-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {selectedRubros.includes('AZUCAR') ? (
                        <CheckSquare className="w-3 h-3" />
                      ) : (
                        <Activity className="w-3 h-3 opacity-75" />
                      )}{' '}
                      Azúcar
                    </span>
                  </th>
                  <th
                    onClick={() => toggleRubroFilter('POLLO')}
                    title="Filtrar clientes por Pollo"
                    className={`p-3 font-bold text-center border-r border-[#a00000] w-24 cursor-pointer transition-colors ${
                      selectedRubros.includes('POLLO') ? 'bg-emerald-800 text-white' : 'hover:bg-red-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {selectedRubros.includes('POLLO') ? (
                        <CheckSquare className="w-3 h-3" />
                      ) : (
                        <Activity className="w-3 h-3 opacity-75" />
                      )}{' '}
                      Pollo
                    </span>
                  </th>
                  <th
                    onClick={() => toggleRubroFilter('ESTANDAR_ASTURIAS')}
                    title="Filtrar clientes por Est. y Sup. Asturias"
                    className={`p-3 font-bold text-center border-r border-[#a00000] min-w-[120px] cursor-pointer transition-colors ${
                      selectedRubros.includes('ESTANDAR_ASTURIAS')
                        ? 'bg-emerald-800 text-white'
                        : 'hover:bg-red-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {selectedRubros.includes('ESTANDAR_ASTURIAS') ? (
                        <CheckSquare className="w-3 h-3" />
                      ) : (
                        <Activity className="w-3 h-3 opacity-75" />
                      )}{' '}
                      Est. y Sup. Asturias
                    </span>
                  </th>
                  <th
                    onClick={() => toggleRubroFilter('MORTADELA_SALPICAO')}
                    title="Filtrar clientes por Mort. Salpicao y Asturias"
                    className={`p-3 font-bold text-center border-r border-[#a00000] min-w-[130px] cursor-pointer transition-colors ${
                      selectedRubros.includes('MORTADELA_SALPICAO')
                        ? 'bg-emerald-800 text-white'
                        : 'hover:bg-red-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {selectedRubros.includes('MORTADELA_SALPICAO') ? (
                        <CheckSquare className="w-3 h-3" />
                      ) : (
                        <Activity className="w-3 h-3 opacity-75" />
                      )}{' '}
                      Mort. Salpicao y Asturias
                    </span>
                  </th>
                  <th className="p-3 font-bold text-center w-32">Cobertura</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {displayedClients.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center bg-[#0d0d0d] text-neutral-400 font-sans">
                      <Users className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                      <div className="text-white font-bold text-sm">No se encontraron clientes</div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {searchTerm
                          ? `No existen clientes que coincidan con "${searchTerm}"`
                          : 'No hay clientes registrados bajo los criterios actuales.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleClients.map((client, idx) => {
                    const bgClass = idx % 2 === 0 ? 'bg-[#141414]' : 'bg-[#0a0a0a]';
                    const getCell = (has: boolean, rCode: RubroClienteCodigo) =>
                      has ? (
                        <td
                          key={`${client.codigo}-${rCode}-1`}
                          translate="no"
                          onClick={() => handleToggleClientRubro(client.codigo, rCode, true)}
                          title={`Rubro ${RUBRO_CLIENTE_LABEL[rCode]} ACTIVO en ${client.razonSocial} (Clic para desmarcar)`}
                          className="p-3 text-center border-r border-neutral-800/50 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold cursor-pointer transition-colors"
                        >
                          <span className="inline-flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                            <span>SI</span>
                          </span>
                        </td>
                      ) : (
                        <td
                          key={`${client.codigo}-${rCode}-0`}
                          translate="no"
                          onClick={() => handleToggleClientRubro(client.codigo, rCode, false)}
                          title={`Clic para activar ${RUBRO_CLIENTE_LABEL[rCode]} en ${client.razonSocial}`}
                          className="p-3 text-center border-r border-neutral-800/50 bg-neutral-900/40 hover:bg-emerald-950/30 text-neutral-600 hover:text-emerald-400 font-bold cursor-pointer transition-colors"
                        >
                          -
                        </td>
                      );

                    const isClientActive = client.cobertura > 0;
                    const badgeColor = isClientActive
                      ? 'border-emerald-300 bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.45)]'
                      : 'border-red-900/50 bg-red-950/40 text-red-400';

                    const percentage = client.cobertura * 20;

                    return (
                      <tr
                        key={client.codigo}
                        className={`${bgClass} border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors`}
                      >
                        <td
                          translate="no"
                          className="p-3 border-r border-neutral-800/50 text-white font-sans text-center font-bold"
                        >
                          {client.codigo}
                        </td>
                        <td className="p-3 border-r border-neutral-800/50 font-sans font-bold text-white uppercase">
                          <div className="flex flex-col">
                            <span>{client.razonSocial}</span>
                            {showSellerTagInRow && client.vendedor && (
                              <span className="text-[10px] font-normal text-neutral-400 mt-0.5">
                                Vendedor: <strong className="text-neutral-300">{client.vendedor}</strong>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center border-r border-neutral-800/50">
                          {isClientActive ? (
                            <span
                              translate="no"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-300 bg-emerald-600 text-white text-[10px] font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.35)]"
                            >
                              <CheckCircle2 className="w-3 h-3 text-white shrink-0" />
                              <span>ACTIVO</span>
                            </span>
                          ) : (
                            <span
                              translate="no"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-800/70 bg-red-950/50 text-red-400 text-[10px] font-extrabold"
                            >
                              <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                              <span>FALTA VENDER</span>
                            </span>
                          )}
                        </td>
                        {getCell(client.hasAceite, 'ACEITE')}
                        {getCell(client.hasAzucar, 'AZUCAR')}
                        {getCell(client.hasPollo, 'POLLO')}
                        {getCell(client.hasEstandarAsturias, 'ESTANDAR_ASTURIAS')}
                        {getCell(client.hasMortadelaSalpicao, 'MORTADELA_SALPICAO')}
                        <td className="p-3 text-center">
                          <span
                            key={`${client.codigo}-badge-${client.cobertura}`}
                            translate="no"
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-extrabold ${badgeColor}`}
                          >
                            {client.cobertura > 0 && (
                              <CheckCircle2 className="w-3 h-3 text-white shrink-0" />
                            )}
                            <span>{`${client.cobertura}/5 (${percentage}%)`}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}

                {displayedClients.length > 0 && (
                  <tr className="bg-neutral-900 border-t-2 border-red-900/60 font-bold text-xs">
                    <td className="p-3 text-center text-red-400 border-r border-neutral-800 font-sans">
                      TOTAL
                    </td>
                    <td className="p-3 font-sans text-white border-r border-neutral-800">
                      CARTERA EN LISTADO:{' '}
                      <span className="text-emerald-400">{displayedClients.length}</span> de{' '}
                      <span className="text-white">{totalClientes}</span> clientes
                    </td>
                    <td className="p-3 text-center border-r border-neutral-800 font-sans text-[11px]">
                      <div className="flex flex-col items-center leading-tight">
                        <span className="text-emerald-400">
                          Activos: {displayedClients.filter((c) => c.cobertura > 0).length}
                        </span>
                        <span className="text-red-400">
                          Faltan: {displayedClients.filter((c) => c.cobertura === 0).length}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-emerald-400 border-r border-neutral-800">
                      {displayedClients.filter((c) => c.hasAceite).length}
                    </td>
                    <td className="p-3 text-center text-emerald-400 border-r border-neutral-800">
                      {displayedClients.filter((c) => c.hasAzucar).length}
                    </td>
                    <td className="p-3 text-center text-emerald-400 border-r border-neutral-800">
                      {displayedClients.filter((c) => c.hasPollo).length}
                    </td>
                    <td className="p-3 text-center text-emerald-400 border-r border-neutral-800">
                      {displayedClients.filter((c) => c.hasEstandarAsturias).length}
                    </td>
                    <td className="p-3 text-center text-emerald-400 border-r border-neutral-800">
                      {displayedClients.filter((c) => c.hasMortadelaSalpicao).length}
                    </td>
                    <td className="p-3 text-center text-amber-400">
                      {(
                        (displayedClients.filter((c) => c.cobertura > 0).length /
                          displayedClients.length) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile / Cards View */}
        <div
          className={`flex flex-col p-3 gap-3 bg-neutral-950 ${
            viewMode !== 'tarjetas' ? 'md:hidden' : 'md:grid md:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          <div className="text-[10px] font-sans text-neutral-400 uppercase tracking-wider mb-1 px-1 col-span-full">
            Desglose por Cliente (Toca los rubros del cliente para activarlos en{' '}
            <span className="text-emerald-400 font-bold">verde</span>)
          </div>

          {displayedClients.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-neutral-900/40 border border-neutral-800 rounded-xl text-neutral-400">
              <Users className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
              <div className="text-white font-bold text-sm">No se encontraron clientes</div>
              <div className="text-xs text-neutral-500 mt-1">
                {searchTerm
                  ? `Sin resultados para "${searchTerm}"`
                  : 'No hay clientes registrados en esta cartera.'}
              </div>
            </div>
          ) : (
            visibleClients.map((client) => {
              const badgeColor =
                client.cobertura > 0
                  ? 'border-emerald-300 bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.45)]'
                  : 'border-red-900/50 bg-red-950/40 text-red-400';
              const percentage = client.cobertura * 20;

              const getPill = (name: string, has: boolean, rCode: RubroClienteCodigo) =>
                has ? (
                  <button
                    key={`${client.codigo}-${rCode}-1`}
                    type="button"
                    translate="no"
                    onClick={() => handleToggleClientRubro(client.codigo, rCode, true)}
                    className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 border-2 border-emerald-300 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-md shadow-[0_0_12px_rgba(16,185,129,0.45)] cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                    <span>{name}</span>
                  </button>
                ) : (
                  <button
                    key={`${client.codigo}-${rCode}-0`}
                    type="button"
                    translate="no"
                    onClick={() => handleToggleClientRubro(client.codigo, rCode, false)}
                    className="inline-flex items-center gap-1 bg-neutral-900/60 hover:bg-emerald-950/40 hover:border-emerald-700/60 hover:text-emerald-300 border border-neutral-800 text-neutral-500 text-[10px] font-bold px-2.5 py-1 rounded-md line-through hover:no-underline cursor-pointer transition-all"
                  >
                    <span>{name}</span>
                  </button>
                );

              return (
                <div
                  key={client.codigo}
                  className={`rounded-lg p-3 transition-all ${
                    client.cobertura > 0
                      ? 'bg-neutral-900 border-2 border-emerald-500/60 shadow-[0_0_16px_rgba(16,185,129,0.12)]'
                      : 'bg-neutral-900 border border-neutral-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span translate="no" className="text-neutral-300 font-mono text-xs font-bold">
                      {client.codigo}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      {client.cobertura > 0 ? (
                        <span
                          translate="no"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-600 text-white text-[10px] font-sans font-extrabold"
                        >
                          <CheckCircle2 className="w-3 h-3 text-white shrink-0" />
                          <span>ACTIVO</span>
                        </span>
                      ) : (
                        <span
                          translate="no"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-800/70 bg-red-950/50 text-red-400 text-[10px] font-sans font-extrabold"
                        >
                          <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                          <span>FALTA VENDER</span>
                        </span>
                      )}
                      <span
                        translate="no"
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-extrabold ${badgeColor}`}
                      >
                        {client.cobertura > 0 && (
                          <CheckCircle2 className="w-3 h-3 text-white shrink-0" />
                        )}
                        <span>{`${client.cobertura}/5 (${percentage}%)`}</span>
                      </span>
                    </div>
                  </div>

                  <h4 className="text-white font-sans text-sm font-bold mb-1 uppercase leading-tight">
                    {client.razonSocial}
                  </h4>
                  {client.vendedor && (
                    <div className="text-[10px] text-neutral-400 mb-2">
                      Vendedor: <strong className="text-neutral-300">{client.vendedor}</strong>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5 border-t border-neutral-800 pt-3 mt-2">
                    {getPill('ACEITE', client.hasAceite, 'ACEITE')}
                    {getPill('AZÚCAR', client.hasAzucar, 'AZUCAR')}
                    {getPill('POLLO', client.hasPollo, 'POLLO')}
                    {getPill('EST. ASTURIAS', client.hasEstandarAsturias, 'ESTANDAR_ASTURIAS')}
                    {getPill('MORT. SALPICAO', client.hasMortadelaSalpicao, 'MORTADELA_SALPICAO')}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Paginación / Mostrar más clientes cuando hay más de visibleLimit */}
        {displayedClients.length > visibleLimit && (
          <div className="p-4 bg-neutral-900/60 border-t border-neutral-800 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs text-neutral-400">
              Mostrando <strong className="text-white">{visibleClients.length}</strong> de{' '}
              <strong className="text-white">{displayedClients.length}</strong> clientes
            </span>
            <button
              type="button"
              onClick={() => setVisibleLimit((prev) => prev + 500)}
              className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Mostrar 500 más
            </button>
            <button
              type="button"
              onClick={() => setVisibleLimit(displayedClients.length)}
              className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Ver todos ({displayedClients.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
