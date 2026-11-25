import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  APP_UPDATE_DEFERRED_EVENT,
  performCleanDashboardReload,
  type AppUpdateDeferredDetail,
} from '../lib/appVersionGuard';

/**
 * Aviso flotante no intrusivo cuando llega una nueva versión mientras el usuario
 * escribe en un formulario; se aplica sola al salir del campo o al pulsar Actualizar.
 */
export function AppUpdateBanner() {
  const [pending, setPending] = useState<AppUpdateDeferredDetail | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onDeferred = (event: Event) => {
      const detail = (event as CustomEvent<AppUpdateDeferredDetail>).detail;
      if (detail?.buildId) setPending(detail);
    };
    window.addEventListener(APP_UPDATE_DEFERRED_EVENT, onDeferred);
    return () => window.removeEventListener(APP_UPDATE_DEFERRED_EVENT, onDeferred);
  }, []);

  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[9999] max-w-sm rounded-2xl bg-zinc-950/95 border border-red-500/40 text-white px-4 py-3 shadow-2xl flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-extrabold text-white">Nueva versión disponible</p>
        <p className="text-[11px] text-zinc-400">
          Se aplicará automáticamente sin cerrar tu sesión.
        </p>
      </div>
      <button
        type="button"
        disabled={updating}
        onClick={() => {
          setUpdating(true);
          void performCleanDashboardReload({ signature: pending.buildId, manual: true });
        }}
        className="shrink-0 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
        {updating ? 'Actualizando...' : 'Actualizar'}
      </button>
    </div>
  );
}
