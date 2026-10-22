import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Database } from '../types/database';
import { campoService } from './campoService';

type Profile = Database['public']['Tables']['profiles']['Row'];

export interface DashboardCorporateProfile {
  id: string;
  username?: string;
  name: string;
  email: string;
  passwordHint: string;
  roleKey:
    | 'admin'
    | 'presidente'
    | 'directivo'
    | 'gerente_nacional'
    | 'gerente_regional'
    | 'analista'
    | 'administrativo'
    | 'trade_marketing'
    | 'supervisor'
    | 'vendedor';
  roleLabel: string;
  zone: string;
  canViewTrazabilidad: boolean;
  modules: string[];
}

const GERENCIA_ALL_MODULES = [
  'Resumen Ejecutivo',
  'Cuotas & Metas',
  'Ventas & Facturación',
  'Inventario & Stock',
  'Clientes & Geocercas',
  'Catálogo de Productos',
  'Trade Marketing (IA)',
  'Portal Móvil PWA',
  'Trazabilidad (Exclusivo)',
];

const ALL_MODULES_EXCEPT_TRAZABILIDAD = [
  'Resumen Ejecutivo',
  'Cuotas & Metas',
  'Ventas & Facturación',
  'Inventario & Stock',
  'Clientes & Geocercas',
  'Catálogo de Productos',
  'Trade Marketing (IA)',
  'Portal Móvil PWA',
];

const ANALISTA_MODULES = ALL_MODULES_EXCEPT_TRAZABILIDAD;

const SUPERVISOR_MODULES = ALL_MODULES_EXCEPT_TRAZABILIDAD;

export const DASHBOARD_CORPORATE_PROFILES: DashboardCorporateProfile[] = [
  {
    id: 'CORP-ADMIN',
    username: 'admin',
    name: 'Administrador General',
    email: 'admin@codi.com',
    passwordHint: '123',
    roleKey: 'admin',
    roleLabel: 'Administrador General',
    zone: 'Nacional / Zulia Corporativo',
    canViewTrazabilidad: true,
    modules: GERENCIA_ALL_MODULES,
  },
  {
    id: 'CORP-MIGUEL01',
    username: 'Miguel01',
    name: 'Miguel Gimenez',
    email: 'Miguel01@codizulca.com',
    passwordHint: '123456',
    roleKey: 'presidente',
    roleLabel: 'Presidente',
    zone: 'Presidencia / Nacional',
    canViewTrazabilidad: true,
    modules: GERENCIA_ALL_MODULES,
  },
  {
    id: 'CORP-AMERICO01',
    username: 'Americo01',
    name: 'Sr. Americo',
    email: 'Americo01@codizulca.com',
    passwordHint: 'Codi.01',
    roleKey: 'directivo',
    roleLabel: 'Directivo',
    zone: 'Directiva / Nacional',
    canViewTrazabilidad: true,
    modules: GERENCIA_ALL_MODULES,
  },
  {
    id: 'CORP-RAMON01',
    username: 'Ramon01',
    name: 'Ramon Tovar',
    email: 'Ramon01@codizulca.com',
    passwordHint: '202122',
    roleKey: 'gerente_nacional',
    roleLabel: 'Gerente Nacional',
    zone: 'Gerencia Nacional / Sede Central',
    canViewTrazabilidad: true,
    modules: GERENCIA_ALL_MODULES,
  },
  {
    id: 'CORP-GEREN01',
    username: 'Geren01',
    name: 'Julio Espina',
    email: 'Geren01@codizulca.com',
    passwordHint: '202020',
    roleKey: 'gerente_regional',
    roleLabel: 'Gerente Regional',
    zone: 'Gerencia Regional / Occidente',
    canViewTrazabilidad: true,
    modules: GERENCIA_ALL_MODULES,
  },
  {
    id: 'CORP-GISBELL01',
    username: 'Gisbell01',
    name: 'Gisbell Ferrucho',
    email: 'Gisbell01@codizulca.com',
    passwordHint: '202020',
    roleKey: 'analista',
    roleLabel: 'Analista',
    zone: 'Análisis Comercial / Sede Central',
    canViewTrazabilidad: false,
    modules: ANALISTA_MODULES,
  },
  {
    id: 'CORP-MARI01',
    username: 'Mari01',
    name: 'Marialbert Cabreras',
    email: 'Mari01@codizulca.com',
    passwordHint: '123456',
    roleKey: 'analista',
    roleLabel: 'Analista',
    zone: 'Análisis Comercial / Sede Central',
    canViewTrazabilidad: false,
    modules: ANALISTA_MODULES,
  },
  {
    id: 'CORP-GRECIA01',
    username: 'Grecia01',
    name: 'Grecia',
    email: 'Grecia01@codizulca.com',
    passwordHint: 'Codi.02',
    roleKey: 'trade_marketing',
    roleLabel: 'Trade Marketing',
    zone: 'Trade Marketing / Zulia & Falcón',
    canViewTrazabilidad: false,
    modules: ['Trade Marketing (IA)'],
  },
  {
    id: 'CORP-NELSON01',
    username: 'Nelson01',
    name: 'Nelson Finol',
    email: 'Nelson01@codizulca.com',
    passwordHint: '16467791',
    roleKey: 'supervisor',
    roleLabel: 'Supervisor',
    zone: 'Supervisión Comercial / Zulia',
    canViewTrazabilidad: false,
    modules: SUPERVISOR_MODULES,
  },
  {
    id: 'CORP-JOSE01',
    username: 'Jose01',
    name: 'Jose Mendez',
    email: 'Jose01@codizulca.com',
    passwordHint: '202020',
    roleKey: 'supervisor',
    roleLabel: 'Supervisor',
    zone: 'Supervisión Comercial / Zulia',
    canViewTrazabilidad: false,
    modules: SUPERVISOR_MODULES,
  },
  {
    id: 'CORP-JOHNATAN01',
    username: 'Johnatan01',
    name: 'Johnatan Garcia',
    email: 'Johnatan01@codizulca.com',
    passwordHint: 'Codi.03',
    roleKey: 'supervisor',
    roleLabel: 'Supervisor',
    zone: 'Maracaibo / San Francisco / Sur del Lago',
    canViewTrazabilidad: false,
    modules: SUPERVISOR_MODULES,
  },
  {
    id: 'CORP-ALI01',
    username: 'Ali01',
    name: 'Ali Perez',
    email: 'Ali01@codizulca.com',
    passwordHint: 'Codi.04',
    roleKey: 'supervisor',
    roleLabel: 'Supervisor',
    zone: 'Costa Oriental del Lago (COL) / Falcón',
    canViewTrazabilidad: false,
    modules: SUPERVISOR_MODULES,
  },
];

export const STORAGE_KEY_DASHBOARD_PROFILE = 'codizulca_dashboard_profile';

/**
 * Valida estrictamente si un usuario/rol tiene permiso para ver el módulo de Trazabilidad.
 * Regla de negocio: SOLO los perfiles de Gerencia (Presidente, Directivo, Gerente Nacional,
 * Gerente Regional) y Administrador General pueden ver Trazabilidad.
 */
export function checkCanAccessTrazabilidad(input?: {
  role?: string | null;
  email?: string | null;
  fullName?: string | null;
} | null): boolean {
  if (!input) return false;

  const roleNorm = (input.role || '').trim().toLowerCase();
  const emailNorm = (input.email || '').trim().toLowerCase();
  const nameNorm = (input.fullName || '').trim().toLowerCase();

  // Exclusión explícita de roles no autorizados (Supervisores, Analistas, Administrativo, Trade Marketing, Vendedores, Promotoras, Merchandising)
  const forbiddenKeywords = [
    'supervisor',
    'analista',
    'vendedor',
    'promotor',
    'promotora',
    'merchandising',
    'impulsadora',
    'trade',
    'coordinador',
    'almacen',
    'facturacion',
    'administrativo',
    'administracion',
    'administración',
    'sin asignar',
  ];
  if (forbiddenKeywords.some((kw) => roleNorm.includes(kw))) {
    return false;
  }

  // Roles explícitamente autorizados: Gerencia (Presidente, Directivo, Gerente Nacional, Gerente Regional) y Administrador General
  const allowedRoles = [
    'admin',
    'administrador',
    'administrador general',
    'presidente',
    'directivo',
    'gerente nacional',
    'gerente_nacional',
    'gerencia nacional',
    'gerente regional',
    'gerente_regional',
    'gerencia regional',
    'gerencia',
  ];
  if (allowedRoles.includes(roleNorm)) {
    return true;
  }

  // Usuarios / correos corporativos de Gerencia y Administrador General
  const allowedUsersOrEmails = [
    'admin@codi.com',
    'admin@codizulca.com',
    'gerencia@codizulca.com',
    'gerente.nacional@codizulca.com',
    'gerente@codi.com',
    'miguel01',
    'miguel01@codizulca.com',
    'americo01',
    'americo01@codizulca.com',
    'ramon01',
    'ramon01@codizulca.com',
    'geren01',
    'geren01@codizulca.com',
  ];
  if (allowedUsersOrEmails.includes(emailNorm)) {
    return true;
  }

  const allowedNames = [
    'administrador general',
    'gerente nacional',
    'gerente regional',
    'admin general',
    'miguel gimenez',
    'sr. americo',
    'ramon tovar',
    'julio espina',
  ];
  if (allowedNames.includes(nameNorm)) {
    return true;
  }

  return false;
}

export function resolveCorporateProfile(email?: string | null, role?: string | null): DashboardCorporateProfile {
  const rawInput = (email || '').trim();
  const emailNorm = rawInput.toLowerCase();
  const userPrefix = emailNorm.includes('@') ? emailNorm.split('@')[0] : emailNorm;
  const roleNorm = (role || '').trim().toLowerCase();

  // 1. Coincidencia exacta por correo, username o id
  const exactMatch = DASHBOARD_CORPORATE_PROFILES.find(
    (p) =>
      p.email.toLowerCase() === emailNorm ||
      (p.username && p.username.toLowerCase() === emailNorm) ||
      (p.username && p.username.toLowerCase() === userPrefix) ||
      p.name.toLowerCase() === emailNorm
  );
  if (exactMatch) return exactMatch;

  // 2. Alias específicos por usuario corporativo
  if (emailNorm === 'admin@codizulca.com' || roleNorm === 'administrador general' || roleNorm === 'admin') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-ADMIN')!;
  }
  if (userPrefix === 'miguel01' || userPrefix === 'miguel.gimenez' || roleNorm === 'presidente') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-MIGUEL01')!;
  }
  if (userPrefix === 'americo01' || userPrefix === 'americo' || roleNorm === 'directivo') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-AMERICO01')!;
  }
  if (
    userPrefix === 'ramon01' ||
    userPrefix === 'ramon.tovar' ||
    emailNorm === 'gerencia@codizulca.com' ||
    emailNorm === 'gerente.nacional@codizulca.com' ||
    roleNorm === 'gerente nacional' ||
    roleNorm === 'gerente_nacional'
  ) {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-RAMON01')!;
  }
  if (
    userPrefix === 'geren01' ||
    userPrefix === 'julio.espina' ||
    roleNorm === 'gerente regional' ||
    roleNorm === 'gerente_regional'
  ) {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-GEREN01')!;
  }
  if (
    userPrefix === 'gisbell01' ||
    userPrefix === 'gisbell' ||
    emailNorm === 'administrativo@codizulca.com' ||
    emailNorm === 'administracion@codizulca.com'
  ) {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-GISBELL01')!;
  }
  if (userPrefix === 'mari01' || userPrefix === 'marialbert' || userPrefix === 'marialbert.cabreras') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-MARI01')!;
  }
  if (
    userPrefix === 'grecia01' ||
    userPrefix === 'grecia' ||
    emailNorm === 'trademarketing@codizulca.com' ||
    emailNorm === 'coordinadora@codizulca.com' ||
    roleNorm.includes('trade')
  ) {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-GRECIA01')!;
  }
  if (userPrefix === 'nelson01' || userPrefix === 'nelson.finol') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-NELSON01')!;
  }
  if (userPrefix === 'jose01' || userPrefix === 'jose.mendez') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-JOSE01')!;
  }
  if (userPrefix === 'johnatan01' || userPrefix === 'johnatan.garcia' || userPrefix === 'johnatan.soto' || userPrefix === 'johnatan') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-JOHNATAN01')!;
  }
  if (userPrefix === 'ali01' || userPrefix === 'ali.perez') {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-ALI01')!;
  }
  if (roleNorm === 'analista' || roleNorm.includes('analista') || roleNorm.includes('administrativo')) {
    return DASHBOARD_CORPORATE_PROFILES.find((p) => p.id === 'CORP-GISBELL01')!;
  }
  if (roleNorm.includes('supervisor')) {
    return {
      id: 'CORP-SUP',
      name: rawInput ? rawInput.split('@')[0] : 'Supervisor',
      email: rawInput || 'supervisor@codizulca.com',
      passwordHint: '202020',
      roleKey: 'supervisor',
      roleLabel: 'Supervisor',
      zone: 'Zulia',
      canViewTrazabilidad: false,
      modules: SUPERVISOR_MODULES,
    };
  }

  // Perfil sin asignar: acceso mínimo (NUNCA se concede Administrador General por defecto)
  return {
    id: 'CORP-NA',
    name: rawInput ? rawInput.split('@')[0] : 'Usuario sin perfil',
    email: rawInput || '',
    passwordHint: '',
    roleKey: 'vendedor',
    roleLabel: 'Perfil sin asignar',
    zone: 'Sin zona asignada',
    canViewTrazabilidad: false,
    modules: ['Resumen Ejecutivo'],
  };
}

/**
 * Autentica un usuario corporativo verificando su identificador (usuario o correo) y su contraseña asignada.
 */
export function authenticateCorporateUser(
  identifier: string,
  password: string
): DashboardCorporateProfile | null {
  const resolved = resolveCorporateProfile(identifier);
  if (!resolved || resolved.id === 'CORP-NA') return null;

  const cleanPass = password.trim();
  const expectedPass = resolved.passwordHint.trim();

  // Comparación case-insensitive para claves con prefijo "Codi." o exacta para numéricas
  const matchesAssignedPassword =
    cleanPass === expectedPass || cleanPass.toLowerCase() === expectedPass.toLowerCase();

  // Compatibilidad con clave maestra de administrador para admin@codi.com
  const isAdminMasterPass =
    resolved.id === 'CORP-ADMIN' &&
    ['123', 'admin123', 'admin123_codizulca_gerencia'].includes(cleanPass.toLowerCase());

  if (matchesAssignedPassword || isAdminMasterPass) {
    return resolved;
  }

  return null;
}

/**
 * Módulos del Dashboard protegidos por perfil. Cada ruta exige que el módulo figure en la lista
 * `modules` del perfil corporativo asignado. Trazabilidad se valida aparte (checkCanAccessTrazabilidad).
 */
const ROUTE_MODULE_RULES: Array<{ prefix: string; module: string }> = [
  { prefix: '/dashboard/cuotas', module: 'Cuotas & Metas' },
  { prefix: '/dashboard/ventas', module: 'Ventas & Facturación' },
  { prefix: '/dashboard/clientes', module: 'Clientes & Geocercas' },
  { prefix: '/dashboard/geofence-review', module: 'Clientes & Geocercas' },
  { prefix: '/dashboard/productos', module: 'Catálogo de Productos' },
  { prefix: '/dashboard/inventario', module: 'Inventario & Stock' },
  { prefix: '/dashboard/trade', module: 'Trade Marketing (IA)' },
];

export function canAccessModule(profile: Pick<DashboardCorporateProfile, 'modules'>, moduleName: string): boolean {
  return profile.modules.includes(moduleName);
}

export function canAccessDashboardRoute(
  profile: Pick<DashboardCorporateProfile, 'modules'> & Partial<Pick<DashboardCorporateProfile, 'canViewTrazabilidad' | 'roleLabel' | 'email' | 'name'>>,
  pathname: string
): boolean {
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/dashboard';

  if (path === '/dashboard') {
    return canAccessModule(profile, 'Resumen Ejecutivo');
  }

  if (path === '/dashboard/trazabilidad' || path === '/dashboard/admin') {
    if (typeof profile.canViewTrazabilidad === 'boolean') {
      return profile.canViewTrazabilidad;
    }
    return canAccessModule(profile, 'Trazabilidad (Exclusivo)');
  }

  const rule = ROUTE_MODULE_RULES.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'));
  if (!rule) return true;
  return canAccessModule(profile, rule.module);
}

export function getDefaultDashboardRoute(profile: Pick<DashboardCorporateProfile, 'modules'>): string {
  if (canAccessModule(profile, 'Resumen Ejecutivo')) {
    return '/dashboard';
  }
  if (canAccessModule(profile, 'Trade Marketing (IA)')) {
    return '/dashboard/trade';
  }
  const firstRule = ROUTE_MODULE_RULES.find((r) => canAccessModule(profile, r.module));
  return firstRule ? firstRule.prefix : '/dashboard';
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  corporateProfile: DashboardCorporateProfile;
  canAccessTrazabilidad: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const NO_PROFILE_DEFAULT = resolveCorporateProfile(null, null);

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  corporateProfile: NO_PROFILE_DEFAULT,
  canAccessTrazabilidad: false,
  isLoading: true,
  signOut: async () => {},
});


const upgradeStoredCorporateProfile = (rawProfile: DashboardCorporateProfile | null): DashboardCorporateProfile | null => {
  if (!rawProfile) return null;
  const candidateKey = rawProfile.username || rawProfile.email || rawProfile.name || '';
  const resolved = resolveCorporateProfile(candidateKey, rawProfile.roleLabel);
  if (resolved.id !== 'CORP-NA') {
    if (
      rawProfile.id === 'CORP-NA' ||
      rawProfile.id !== resolved.id ||
      rawProfile.name !== resolved.name ||
      rawProfile.roleKey !== resolved.roleKey ||
      rawProfile.roleLabel !== resolved.roleLabel ||
      rawProfile.canViewTrazabilidad !== resolved.canViewTrazabilidad ||
      rawProfile.modules?.length !== resolved.modules.length ||
      rawProfile.modules?.some((m, idx) => m !== resolved.modules[idx])
    ) {
      try {
        localStorage.setItem(STORAGE_KEY_DASHBOARD_PROFILE, JSON.stringify(resolved));
      } catch {
        // ignore storage errors
      }
      return resolved;
    }
  }
  return rawProfile;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storedCorpProfile, setStoredCorpProfile] = useState<DashboardCorporateProfile | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DASHBOARD_PROFILE);
      return raw ? upgradeStoredCorporateProfile(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const syncLocalCorpProfile = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_DASHBOARD_PROFILE);
        setStoredCorpProfile(raw ? upgradeStoredCorporateProfile(JSON.parse(raw)) : null);
      } catch {
        setStoredCorpProfile(null);
      }
    };
    window.addEventListener('codizulca_dashboard_profile_changed', syncLocalCorpProfile);

    // SessionManager logic: Get initial session and subscribe to changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Una sesión de Supabase heredada SIN perfil corporativo asignado no concede acceso:
      // cada usuario debe iniciar sesión y recibir su propio perfil.
      let hasAssignedProfile = false;
      try {
        hasAssignedProfile = Boolean(localStorage.getItem(STORAGE_KEY_DASHBOARD_PROFILE));
      } catch {
        hasAssignedProfile = false;
      }
      if (session?.user && !hasAssignedProfile) {
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('codizulca_dashboard_profile_changed', syncLocalCorpProfile);
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY_DASHBOARD_PROFILE);
      setStoredCorpProfile(null);
    } catch {
      // ignore
    }
    // Cerrar también la sesión de Codizulca Campo para no dejar perfiles activos al salir
    try {
      campoService.logoutPromoter();
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
  };

  // El perfil asignado en el inicio de sesión es la única fuente de identidad y permisos.
  // Sin perfil asignado NO existe sesión válida (no se concede Administrador General por defecto).
  const corporateProfile = storedCorpProfile
    ? storedCorpProfile
    : resolveCorporateProfile(user?.email, profile?.role);

  const effectiveUser: User | null = storedCorpProfile
    ? ({
        ...(user ?? {}),
        id: user?.id ?? storedCorpProfile.id,
        email: storedCorpProfile.email,
        app_metadata: user?.app_metadata ?? {},
        user_metadata: {
          ...(user?.user_metadata ?? {}),
          full_name: storedCorpProfile.name,
          role: storedCorpProfile.roleLabel,
        },
        aud: user?.aud ?? 'authenticated',
        created_at: user?.created_at ?? new Date().toISOString(),
      } as User)
    : null;

  const canAccessTrazabilidad = effectiveUser
    ? checkCanAccessTrazabilidad({
        role: storedCorpProfile?.roleLabel || corporateProfile.roleLabel,
        email: storedCorpProfile?.email || corporateProfile.email,
        fullName: storedCorpProfile?.name || corporateProfile.name,
      })
    : false;

  return (
    <AuthContext.Provider value={{ session, user: effectiveUser, profile, corporateProfile, canAccessTrazabilidad, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
