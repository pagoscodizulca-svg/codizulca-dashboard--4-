/**
 * Lightweight Render deployment watcher:
 * Polls `/api/version` (no-store) on startup and tab visibility/focus (throttled >= 60s).
 * When Render finishes deploying a newer GitHub commit (`server.buildHash !== clientBuildHash`),
 * purges volatile KPI/sheets caches and refreshes the tab once so users never stay stuck on an old build.
 */

const CHECK_INTERVAL_MS = 60_000;
const RELOAD_GUARD_KEY = 'codizulca_autoreload_target_hash';
const VOLATILE_CACHE_KEYS = [
  'app_kpi_cache',
  'app_historical_sales_cache',
  'app_historical_sales_cache_v3',
  'app_historical_sales_cache_v4',
  'october_2026_closing_cache',
  'app_last_sheets_sync',
  'codizulca_maestra_sync_version',
  'codibot_messages_active',
];

function getClientBuildHash(): string {
  if (typeof window === 'undefined') return '';
  const raw = (window as any).__CODIZULCA_BUILD_HASH__;
  if (typeof raw !== 'string') return '';
  const clean = raw.trim();
  if (!clean || clean === 'dev' || clean.includes('__CODIZULCA_BUILD_HASH__')) {
    return '';
  }
  return clean;
}

export function startBuildVersionWatcher(): () => void {
  const clientHash = getClientBuildHash();
  if (!clientHash || typeof window === 'undefined') {
    return () => {};
  }

  let lastCheckedAt = 0;
  let inFlight = false;
  let stopped = false;

  const checkForNewDeploy = async (force = false) => {
    if (stopped || inFlight) return;
    const now = Date.now();
    if (!force && now - lastCheckedAt < CHECK_INTERVAL_MS) return;

    inFlight = true;
    lastCheckedAt = now;
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`/api/version?t=${now}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      if (!res.ok) return;

      const data = await res.json();
      const serverHash = typeof data?.buildHash === 'string' ? data.buildHash.trim() : '';
      if (!serverHash || serverHash === 'dev' || serverHash === clientHash) {
        return;
      }

      // Guard against reload loops for the same target hash
      try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === serverHash) {
          return;
        }
        sessionStorage.setItem(RELOAD_GUARD_KEY, serverHash);
        VOLATILE_CACHE_KEYS.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {}
        });
      } catch {}

      try {
        if ('caches' in window) {
          await caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
        }
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker
            .getRegistrations()
            .then((regs) => Promise.all(regs.map((r) => r.unregister())));
        }
      } catch {}

      window.location.reload();
    } catch {
      // Ignore transient offline/timeout errors
    } finally {
      inFlight = false;
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      void checkForNewDeploy(false);
    }
  };

  const handleFocus = () => {
    void checkForNewDeploy(false);
  };

  const initialTimer = window.setTimeout(() => {
    void checkForNewDeploy(true);
  }, 4000);

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleFocus);

  return () => {
    stopped = true;
    window.clearTimeout(initialTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('focus', handleFocus);
  };
}
