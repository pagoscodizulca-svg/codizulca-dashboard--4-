/**
 * Guardián de versión e invalidación automática de caché — Codizulca Dashboard.
 *
 * - Consulta `/version.json?t=...` (`cache: 'no-store'`) al abrir, al volver a la pestaña,
 *   al reconectar y cada 3 minutos.
 * - Cuando detecta un build nuevo, purga Cache Storage, desregistra Service Workers viejos
 *   y limpia únicamente las claves volátiles de KPIs/Sheets (jamás cierra sesiones de usuario).
 * - Si el usuario escribe en un formulario, difiere la recarga y notifica con `AppUpdateBanner`.
 * - Auto-recupera fallos de importación dinámica (`vite:preloadError` / `unhandledrejection`).
 */

export const VERSION_RELOAD_GUARD_KEY = 'codizulca_dash:version_reload_guard';
export const PRELOAD_RELOAD_GUARD_KEY = 'codizulca_dash:preload_reload_guard';
export const APP_UPDATE_DEFERRED_EVENT = 'codizulca_dash:update-available';
const POLL_INTERVAL_MS = 3 * 60 * 1000;
const MIN_CHECK_GAP_MS = 15 * 1000;
const RELOAD_COOLDOWN_MS = 60 * 1000;

const VOLATILE_KPI_STORAGE_KEYS: readonly string[] = [
  'app_kpi_cache',
  'app_historical_sales_cache',
  'app_historical_sales_cache_v3',
  'app_historical_sales_cache_v4',
  'october_2026_closing_cache',
  'app_last_sheets_sync',
  'codizulca_maestra_sync_version',
  'codibot_messages_active',
];

const CHUNK_LOAD_ERROR_PATTERNS: readonly RegExp[] = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /loading css chunk [\w-]+ failed/i,
  /unable to preload css/i,
];

const EDITABLE_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'email',
  'tel',
  'url',
  'password',
  'number',
  'date',
  'datetime-local',
  'time',
]);

export interface AppUpdateDeferredDetail {
  buildId: string;
}

function getCurrentBuildId(): string {
  try {
    return typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__.trim() : '';
  } catch {
    return '';
  }
}

function isValidBuildId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'dev' || trimmed === '__APP_BUILD_ID__' || trimmed === '__CODIZULCA_BUILD_VERSION__') {
    return false;
  }
  return /^[a-zA-Z0-9._-]{4,80}$/.test(trimmed);
}

function isChunkLoadError(err: unknown): boolean {
  const text =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? `${err.name} ${err.message}`
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : '';
  return Boolean(text) && CHUNK_LOAD_ERROR_PATTERNS.some((re) => re.test(text));
}

function isUserEditingForm(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || active === document.documentElement) return false;
  const tag = active.tagName?.toUpperCase() ?? '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    return EDITABLE_INPUT_TYPES.has(((active as HTMLInputElement).type || '').toLowerCase());
  }
  return Boolean(active.isContentEditable);
}

function canAttemptReload(guardKey: string, signature: string, cooldownMs = RELOAD_COOLDOWN_MS): boolean {
  try {
    const raw = window.sessionStorage.getItem(guardKey);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { signature?: string; at?: number };
    if (parsed?.signature === signature && typeof parsed.at === 'number' && Date.now() - parsed.at < cooldownMs) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function markReloadAttempt(guardKey: string, signature: string): void {
  try {
    window.sessionStorage.setItem(guardKey, JSON.stringify({ signature, at: Date.now() }));
  } catch {
    // ignorar si sessionStorage está restringido
  }
}

async function purgeStaleBrowserCaches(): Promise<void> {
  // Limpia solo claves volátiles de KPIs/Sheets; jamás toca sesión de usuario ni credenciales.
  for (const key of VOLATILE_KPI_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignorar
    }
  }

  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name).catch(() => false)));
    } catch {
      // ignorar
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));
    } catch {
      // ignorar
    }
  }
}

let reloadInFlight = false;

export async function performCleanDashboardReload(options: {
  signature: string;
  guardKey?: string;
  manual?: boolean;
  cooldownMs?: number;
}): Promise<boolean> {
  if (reloadInFlight && !options.manual) return false;
  const guardKey = options.guardKey ?? VERSION_RELOAD_GUARD_KEY;
  if (!options.manual && !canAttemptReload(guardKey, options.signature, options.cooldownMs)) {
    return false;
  }
  reloadInFlight = true;
  if (!options.manual) {
    markReloadAttempt(guardKey, options.signature);
  }
  await purgeStaleBrowserCaches();
  window.location.reload();
  return true;
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) return null;
    const data = (await res.json()) as { buildId?: unknown } | null;
    return data && isValidBuildId(data.buildId) ? data.buildId.trim() : null;
  } catch {
    return null;
  }
}

let guardStarted = false;

export function startAppVersionGuard(): void {
  if (typeof window === 'undefined' || guardStarted) return;
  guardStarted = true;

  // Recuperación automática de imports dinámicos obsoletos
  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return;
    event.preventDefault();
    void performCleanDashboardReload({
      signature: `dash-chunk:${getCurrentBuildId() || 'current'}`,
      guardKey: PRELOAD_RELOAD_GUARD_KEY,
      cooldownMs: 30 * 1000,
    });
  });

  const localBuildId = getCurrentBuildId();
  if (!isValidBuildId(localBuildId)) return;

  let lastCheckAt = 0;
  let pendingBuildId: string | null = null;

  const checkVersion = (force: boolean, respectInput: boolean) => {
    if (navigator.onLine === false) return;
    const now = Date.now();
    if (!force && now - lastCheckAt < MIN_CHECK_GAP_MS) return;
    lastCheckAt = now;

    void fetchServerBuildId().then(async (remoteBuildId) => {
      if (!remoteBuildId || remoteBuildId === localBuildId) return;
      if (respectInput && isUserEditingForm()) {
        pendingBuildId = remoteBuildId;
        window.dispatchEvent(
          new CustomEvent<AppUpdateDeferredDetail>(APP_UPDATE_DEFERRED_EVENT, {
            detail: { buildId: remoteBuildId },
          })
        );
        return;
      }
      const reloaded = await performCleanDashboardReload({ signature: remoteBuildId });
      if (!reloaded) {
        pendingBuildId = remoteBuildId;
        window.dispatchEvent(
          new CustomEvent<AppUpdateDeferredDetail>(APP_UPDATE_DEFERRED_EVENT, {
            detail: { buildId: remoteBuildId },
          })
        );
      }
    });
  };

  checkVersion(true, false);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pendingBuildId && !isUserEditingForm()) {
      const target = pendingBuildId;
      pendingBuildId = null;
      void performCleanDashboardReload({ signature: target });
      return;
    }
    checkVersion(false, true);
  });

  document.addEventListener('focusout', () => {
    if (!pendingBuildId) return;
    window.setTimeout(() => {
      if (pendingBuildId && !isUserEditingForm()) {
        const target = pendingBuildId;
        pendingBuildId = null;
        void performCleanDashboardReload({ signature: target });
      }
    }, 400);
  });

  window.addEventListener('focus', () => checkVersion(false, true));
  window.addEventListener('online', () => checkVersion(true, true));
  window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      checkVersion(true, true);
    }
  }, POLL_INTERVAL_MS);
}
