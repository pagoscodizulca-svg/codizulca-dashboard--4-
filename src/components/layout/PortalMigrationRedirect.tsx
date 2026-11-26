import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Smartphone, ExternalLink, ShieldCheck, ArrowLeft, Info } from 'lucide-react';
import { getConfiguredTradePortalRedirect } from '../../lib/portalMigrationConfig';

/**
 * Componente ligero de transición y redirección segura para enlaces antiguos `/portal` y `/portal/*`.
 *
 * - Lee `VITE_NEW_TRADE_PORTAL_URL` y valida que sea una URL HTTPS estricta (anti-Open Redirect).
 * - Si es válida, redirige automáticamente hacia el nuevo portal en `Programa de Trade Marketing`.
 * - Si aún no está definida, muestra un aviso claro de migración sin exponer rutas rotas ni redirecciones inseguras.
 */
export const PortalMigrationRedirect: React.FC = () => {
  const location = useLocation();
  const redirectState = getConfiguredTradePortalRedirect(location.pathname, location.search);

  useEffect(() => {
    if (!redirectState.isValid || !redirectState.targetUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.location.replace(redirectState.targetUrl as string);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [redirectState.isValid, redirectState.targetUrl]);

  return (
    <div className="min-h-screen bg-[#090a0c] text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-red-600 selection:text-white relative overflow-hidden">
      {/* Efecto visual corporativo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-red-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-[#121316] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative z-10">
        {/* Cabecera */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-500 shadow-lg shadow-red-600/20">
            <Smartphone className="w-8 h-8" />
          </div>

          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-red-600/20 text-red-400 border border-red-500/30">
            Actualización de Plataforma • Trade Marketing
          </span>

          <h1 className="text-xl font-black text-white tracking-tight">
            Módulo de Trade Marketing Trasladado
          </h1>

          <p className="text-xs text-zinc-400 leading-relaxed">
            El módulo de <strong className="text-white">Trade Marketing</strong> y el portal móvil <strong className="text-white font-mono">/portal/</strong> ahora operan exclusivamente en la aplicación independiente{' '}
            <strong className="text-red-400">Programa de Trade Marketing</strong>.
          </p>
        </div>

        {/* Estado de Redirección Segura */}
        {redirectState.isValid && redirectState.targetUrl ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-300">
                  Redirigiendo de forma segura (HTTPS verificado)...
                </p>
                <p className="text-[11px] text-emerald-300/80 font-mono break-all">
                  Destino: {redirectState.originHost}
                </p>
              </div>
            </div>

            <a
              href={redirectState.targetUrl}
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Ir al Nuevo Portal de Trade Marketing</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-white/10 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Info className="w-4 h-4 shrink-0" />
                <span>Aplicación Independiente Activa</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                Trade Marketing fue retirado del Dashboard de Gerencia para optimizar el rendimiento. Ingresa directamente al{' '}
                <strong className="text-white">Programa de Trade Marketing</strong> para gestionar asistencia, degustaciones, merchandising, precios e informes.
              </p>
            </div>

            <a
              href="https://trade-marketing-qi6j.onrender.com"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Abrir Programa de Trade Marketing</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Enlace de retorno para usuarios administrativos del Dashboard de Gerencia */}
        <div className="pt-4 border-t border-white/10 text-center">
          <Link
            to="/login"
            className="text-xs text-zinc-400 hover:text-white font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Dashboard de Gerencia</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
