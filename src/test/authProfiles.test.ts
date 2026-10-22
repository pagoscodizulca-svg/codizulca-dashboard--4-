import { describe, it, expect } from 'vitest';
import {
  authenticateCorporateUser,
  canAccessDashboardRoute,
  canAccessModule,
  checkCanAccessTrazabilidad,
  getDefaultDashboardRoute,
  resolveCorporateProfile,
} from '../lib/auth';

describe('Perfiles corporativos asignados del Dashboard de Gerencia', () => {
  it('un correo desconocido recibe un perfil sin asignar con acceso mínimo (no admin)', () => {
    const p = resolveCorporateProfile('alguien.desconocido@correo.com');
    expect(p.roleKey).not.toBe('admin');
    expect(p.roleLabel).toBe('Perfil sin asignar');
    expect(p.canViewTrazabilidad).toBe(false);
    expect(p.modules).toEqual(['Resumen Ejecutivo']);
  });

  it('sin correo ni rol tampoco se concede Administrador General', () => {
    expect(resolveCorporateProfile(null, null).roleKey).not.toBe('admin');
    expect(resolveCorporateProfile('', '').roleKey).not.toBe('admin');
  });

  it('un correo que solo contiene "ali" (ej. valeria) no hereda el perfil de Ali Perez', () => {
    expect(resolveCorporateProfile('valeria@correo.com').roleLabel).toBe('Perfil sin asignar');
    expect(resolveCorporateProfile('Ali01').name).toBe('Ali Perez');
    expect(resolveCorporateProfile('Ali01').roleLabel).toBe('Supervisor');
  });

  it('valida los 11 usuarios corporativos con su usuario, contraseña, rol y nombre exactos', () => {
    const expectedUsers = [
      { user: 'Nelson01', pass: '16467791', role: 'Supervisor', name: 'Nelson Finol', trazabilidad: false },
      { user: 'Jose01', pass: '202020', role: 'Supervisor', name: 'Jose Mendez', trazabilidad: false },
      { user: 'Geren01', pass: '202020', role: 'Gerente Regional', name: 'Julio Espina', trazabilidad: true },
      { user: 'Gisbell01', pass: '202020', role: 'Analista', name: 'Gisbell Ferrucho', trazabilidad: false },
      { user: 'Ramon01', pass: '202122', role: 'Gerente Nacional', name: 'Ramon Tovar', trazabilidad: true },
      { user: 'Miguel01', pass: '123456', role: 'Presidente', name: 'Miguel Gimenez', trazabilidad: true },
      { user: 'Mari01', pass: '123456', role: 'Analista', name: 'Marialbert Cabreras', trazabilidad: false },
      { user: 'Americo01', pass: 'Codi.01', role: 'Directivo', name: 'Sr. Americo', trazabilidad: true },
      { user: 'Grecia01', pass: 'Codi.02', role: 'Trade Marketing', name: 'Grecia', trazabilidad: false },
      { user: 'Johnatan01', pass: 'Codi.03', role: 'Supervisor', name: 'Johnatan Garcia', trazabilidad: false },
      { user: 'Ali01', pass: 'Codi.04', role: 'Supervisor', name: 'Ali Perez', trazabilidad: false },
    ];

    for (const u of expectedUsers) {
      const auth = authenticateCorporateUser(u.user, u.pass);
      expect(auth, `Falló autenticación para ${u.user}`).not.toBeNull();
      expect(auth!.name).toBe(u.name);
      expect(auth!.roleLabel).toBe(u.role);
      expect(auth!.canViewTrazabilidad).toBe(u.trazabilidad);
      expect(
        checkCanAccessTrazabilidad({
          role: auth!.roleLabel,
          email: auth!.email,
          fullName: auth!.name,
        })
      ).toBe(u.trazabilidad);

      // Contraseña incorrecta debe rechazarse
      expect(authenticateCorporateUser(u.user, 'clave-erronea')).toBeNull();
    }
  });

  it('el módulo de Trazabilidad solo lo pueden ver Gerencia (Presidente, Directivo, Gerente Nacional, Gerente Regional) y Administrador General', () => {
    for (const gerenciaUser of ['admin@codi.com', 'Miguel01', 'Americo01', 'Ramon01', 'Geren01']) {
      const p = resolveCorporateProfile(gerenciaUser);
      expect(p.canViewTrazabilidad).toBe(true);
      expect(checkCanAccessTrazabilidad({ role: p.roleLabel, email: p.email, fullName: p.name })).toBe(true);
      expect(canAccessDashboardRoute(p, '/dashboard/trazabilidad')).toBe(true);
    }

    for (const nonGerenciaUser of ['Nelson01', 'Jose01', 'Gisbell01', 'Mari01', 'Grecia01', 'Johnatan01', 'Ali01']) {
      const p = resolveCorporateProfile(nonGerenciaUser);
      expect(p.canViewTrazabilidad).toBe(false);
      expect(checkCanAccessTrazabilidad({ role: p.roleLabel, email: p.email, fullName: p.name })).toBe(false);
      expect(canAccessDashboardRoute(p, '/dashboard/trazabilidad')).toBe(false);
    }
  });

  it('Grecia01 (Trade Marketing) SOLO puede ver el módulo de Trade Marketing', () => {
    const grecia = resolveCorporateProfile('Grecia01');
    expect(grecia.name).toBe('Grecia');
    expect(grecia.roleLabel).toBe('Trade Marketing');
    expect(grecia.modules).toEqual(['Trade Marketing (IA)']);
    expect(getDefaultDashboardRoute(grecia)).toBe('/dashboard/trade');

    // Solo accede a /dashboard/trade
    expect(canAccessDashboardRoute(grecia, '/dashboard/trade')).toBe(true);

    // No accede a ningún otro módulo del dashboard
    expect(canAccessDashboardRoute(grecia, '/dashboard')).toBe(false);
    expect(canAccessDashboardRoute(grecia, '/dashboard/cuotas')).toBe(false);
    expect(canAccessDashboardRoute(grecia, '/dashboard/ventas')).toBe(false);
    expect(canAccessDashboardRoute(grecia, '/dashboard/clientes')).toBe(false);
    expect(canAccessDashboardRoute(grecia, '/dashboard/productos')).toBe(false);
    expect(canAccessDashboardRoute(grecia, '/dashboard/inventario')).toBe(false);
    expect(canAccessDashboardRoute(grecia, '/dashboard/trazabilidad')).toBe(false);
    expect(canAccessModule(grecia, 'Portal Móvil PWA')).toBe(false);
  });

  it('las Analistas (Gisbell01 y Mari01) y Supervisores (Nelson01, Jose01, Johnatan01, Ali01) tienen acceso a TODOS los módulos menos a Trazabilidad', () => {
    for (const u of ['Gisbell01', 'Mari01', 'Nelson01', 'Jose01', 'Johnatan01', 'Ali01']) {
      const profile = resolveCorporateProfile(u);
      expect(profile.canViewTrazabilidad).toBe(false);
      expect(canAccessDashboardRoute(profile, '/dashboard/trazabilidad')).toBe(false);
      expect(canAccessDashboardRoute(profile, '/dashboard')).toBe(true);
      for (const route of ['cuotas', 'ventas', 'clientes', 'productos', 'inventario', 'trade', 'geofence-review']) {
        expect(canAccessDashboardRoute(profile, `/dashboard/${route}`)).toBe(true);
      }
      expect(canAccessModule(profile, 'Portal Móvil PWA')).toBe(true);
    }
  });
});
