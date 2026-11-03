import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  useAuth,
  STORAGE_KEY_DASHBOARD_PROFILE,
  resolveCorporateProfile,
  authenticateCorporateUser,
  canAccessDashboardRoute,
  getDefaultDashboardRoute,
} from '../lib/auth';
import { campoService } from '../lib/campoService';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { AlertCircle } from 'lucide-react';
import { KillSwitchGuard } from '../components/layout/KillSwitchGuard';
import { trazabilidadService } from '../lib/trazabilidadService';

const loginSchema = z.object({
  email: z.string().min(1, 'El usuario o correo es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const LoginContent: React.FC = () => {
  const { user, corporateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState<string | null>(null);
  
  const from = location.state?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setAuthError(null);
    
    const rawIdentifier = data.email.trim();
    const rawPass = data.password.trim();

    const matchedCandidate = resolveCorporateProfile(rawIdentifier);
    const authenticatedCorp = authenticateCorporateUser(rawIdentifier, rawPass);

    let loginEmail = rawIdentifier;
    let loginPassword = data.password;

    // Si es un usuario corporativo válido con su contraseña oficial asignada
    if (authenticatedCorp) {
      const activeCorp = authenticatedCorp;
      loginEmail = 'admin@codi.com';
      loginPassword = 'admin123_Codizulca_Gerencia';

      try {
        localStorage.setItem(STORAGE_KEY_DASHBOARD_PROFILE, JSON.stringify(activeCorp));
        window.dispatchEvent(new Event('codizulca_dashboard_profile_changed'));
      } catch {
        // ignore storage errors
      }

      // Intentar sincronizar sesión de Supabase en segundo plano sin bloquear el acceso
      supabase.auth
        .signInWithPassword({
          email: loginEmail,
          password: loginPassword,
        })
        .catch(() => {});

      trazabilidadService.logConnection(
        {
          name: activeCorp.name,
          email: activeCorp.email,
          role: activeCorp.roleLabel,
        },
        false
      );

      const defaultRoute = getDefaultDashboardRoute(activeCorp);
      const targetPath =
        from && from !== '/dashboard' && canAccessDashboardRoute(activeCorp, from)
          ? from
          : defaultRoute;
      navigate(targetPath, { replace: true });
      return;
    }

    // Si el usuario pertenece a un perfil corporativo oficial pero la contraseña no coincide, rechazar
    if (matchedCandidate && matchedCandidate.id !== 'CORP-NA') {
      setAuthError('Usuario o contraseña incorrectos.');
      trazabilidadService.logFailedLogin({
        email: rawIdentifier,
        role: matchedCandidate.roleLabel,
        details: 'Contraseña incorrecta en Portal Gerencia',
        module: 'Dashboard Gerencia',
      });
      return;
    }

    // Si una promotora o impulsadora intenta ingresar desde /login, autenticarla y redirigirla a /portal/ruta
    const promoterRes = await campoService.loginPromoter(rawIdentifier, data.password);
    if (promoterRes.success && promoterRes.promoter) {
      trazabilidadService.logConnection(
        {
          name: promoterRes.promoter.name,
          email: promoterRes.promoter.email,
          role: promoterRes.promoter.role,
          photoUrl: promoterRes.promoter.photoUrl,
        },
        true
      );
      navigate('/portal/ruta', { replace: true });
      return;
    }

    let { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    // Autoprovisionamiento: si no existe y es el administrador general, intentamos crearlo
    if (error && error.message.includes('Invalid login credentials') && loginEmail.toLowerCase() === 'admin@codi.com') {
      const { error: signUpError } = await supabase.auth.signUp({
        email: loginEmail,
        password: loginPassword,
      });
      
      if (!signUpError) {
        const retry = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword,
        });
        error = retry.error;
      }
    }

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setAuthError('Usuario o contraseña incorrectos.');
      } else {
        setAuthError(error.message);
      }
      trazabilidadService.logFailedLogin({
        email: rawIdentifier,
        role: matchedCandidate?.roleLabel || 'Sin Asignar',
        details: 'Credenciales inválidas en Portal Gerencia',
        module: 'Dashboard Gerencia'
      });
    } else {
      const activeCorp = resolveCorporateProfile(rawIdentifier);
      try {
        localStorage.setItem(STORAGE_KEY_DASHBOARD_PROFILE, JSON.stringify(activeCorp));
        window.dispatchEvent(new Event('codizulca_dashboard_profile_changed'));
      } catch {
        // ignore storage errors
      }
      trazabilidadService.logConnection({
        name: activeCorp.name,
        email: activeCorp.email,
        role: activeCorp.roleLabel
      }, false);
    }
  };

  if (user) {
    const safeDestination = canAccessDashboardRoute(corporateProfile, from)
      ? from
      : getDefaultDashboardRoute(corporateProfile);
    return <Navigate to={safeDestination} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black relative overflow-hidden px-4">
      {/* Background futuristic accents */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-red-900/30 via-black to-black pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-red-900/20 via-black to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />

      <div className="w-full max-w-md space-y-8 rounded-2xl bg-zinc-950/60 p-10 shadow-[0_0_50px_rgba(220,38,38,0.15)] border border-white/10 backdrop-blur-xl relative z-10">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center">
            <img 
              src="https://i.postimg.cc/W19QG233/logo.jpg" 
              alt="Codizulca Logo" 
              className="h-full w-full rounded-full object-cover shadow-[0_0_25px_rgba(220,38,38,0.6)] border-2 border-red-600 animate-spin-coin"
            />
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-[0.1em] sm:tracking-[0.15em] uppercase text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] whitespace-nowrap flex items-center justify-center gap-2">
            <span>Dashboard</span>
            <span className="text-red-600">Gerencia</span>
          </h2>
          <p className="mt-2 text-sm text-zinc-400 font-medium tracking-wide">
            PORTAL DE GESTIÓN CORPORATIVA
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {authError && (
            <div className="flex items-center gap-2 rounded-md bg-red-950/50 border border-red-900 p-3 text-sm text-red-200">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
              <span>{authError}</span>
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-2 text-left">
              <Label htmlFor="email" className="text-zinc-300">Usuario o Correo</Label>
              <Input
                id="email"
                type="text"
                autoComplete="email"
                placeholder="admin@codi.com"
                className="bg-zinc-900/80 border-white/10 text-white placeholder:text-zinc-600 focus-visible:ring-red-600 focus-visible:border-red-600 transition-all"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2 text-left">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-zinc-300">Contraseña</Label>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="bg-zinc-900/80 border-white/10 text-white placeholder:text-zinc-600 focus-visible:ring-red-600 focus-visible:border-red-600 transition-all"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-red-600 hover:bg-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] hover:shadow-[0_0_25px_rgba(220,38,38,0.6)] transition-all uppercase tracking-wider font-bold py-6 border border-red-500/50" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Iniciando sistema...' : 'Iniciar Sesión'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export const Login: React.FC = () => {
  return (
    <KillSwitchGuard>
      <LoginContent />
    </KillSwitchGuard>
  );
};
