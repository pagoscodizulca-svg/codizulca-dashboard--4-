/**
 * Configuración de Migración y Seguridad del Portal Móvil (/portal/*)
 *
 * El módulo "/portal/" de promotoras e impulsadoras se trasladó desde
 * "Dashboard de Gerencia" hacia el proyecto "Programa de Trade Marketing",
 * manteniendo el mismo proyecto compartido de Supabase ("dashboard de gerencia").
 */

/**
 * Bandera maestra para mostrar u ocultar enlaces hacia "/portal/*" en la interfaz
 * del Dashboard de Gerencia. Se mantiene en `false` tras la migración.
 */
export const SHOW_LEGACY_PORTAL_LINK: boolean = false;

/**
 * Subrutas conocidas del antiguo módulo `/portal/*` que pueden preservarse de forma
 * segura al redirigir hacia el nuevo portal en `Programa de Trade Marketing`.
 */
const ALLOWED_PORTAL_SUBPATHS = new Set([
  '',
  '/',
  '/login',
  '/ruta',
  '/asistencia',
  '/encuestas',
  '/inventario',
  '/precios',
  '/merchandising',
  '/perfil',
  '/checkin',
]);

/**
 * Parámetros de consulta (query string) seguros permitidos durante la redirección.
 * Se bloquean explícitamente parámetros de redirección anidada (`redirect`, `url`, `next`, `returnTo`).
 */
const ALLOWED_QUERY_PARAMS = new Set(['email', 'user', 'promoter']);

export interface PortalRedirectValidationResult {
  isValid: boolean;
  targetUrl: string | null;
  reason?: string;
  originHost?: string;
}

/**
 * Verifica si un hostname corresponde a una dirección IP local/privada o loopback
 * para evitar redirecciones hacia recursos internos no autorizados (SSRF / Open Redirect).
 */
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '[::1]' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  // IPv4 privadas (10.x.x.x, 192.168.x.x, 172.16-31.x.x, 169.254.x.x)
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(lower);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return false;
}

/**
 * Valida que la URL configurada en `VITE_NEW_TRADE_PORTAL_URL` sea una URL HTTPS
 * estrictamente segura y construye la URL final hacia el nuevo Portal de Promotoras,
 * previniendo vulnerabilidades de Open Redirect.
 *
 * @param rawBaseUrl Valor de `VITE_NEW_TRADE_PORTAL_URL`
 * @param currentPathname Ruta actual en el navegador (ej. `/portal/ruta`)
 * @param currentSearch Query string actual (ej. `?email=promotora@gmail.com`)
 * @param rawAllowedHosts Lista opcional separada por comas de dominios permitidos (`VITE_NEW_TRADE_PORTAL_ALLOWED_HOSTS`)
 */
export function validateAndBuildNewPortalUrl(
  rawBaseUrl?: string | null,
  currentPathname = '/portal',
  currentSearch = '',
  rawAllowedHosts?: string | null
): PortalRedirectValidationResult {
  const trimmedBase = String(rawBaseUrl ?? '').trim();

  if (!trimmedBase) {
    return {
      isValid: false,
      targetUrl: null,
      reason: 'NOT_CONFIGURED',
    };
  }

  // Rechazar URLs relativas al protocolo (//evil.com), caracteres de control o barras invertidas
  if (
    trimmedBase.startsWith('//') ||
    trimmedBase.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(trimmedBase)
  ) {
    return {
      isValid: false,
      targetUrl: null,
      reason: 'MALFORMED_OR_PROTOCOL_RELATIVE_URL',
    };
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(trimmedBase);
  } catch {
    return {
      isValid: false,
      targetUrl: null,
      reason: 'INVALID_URL_SYNTAX',
    };
  }

  // Regla obligatoria: Sólo se permite HTTPS
  if (parsedBase.protocol !== 'https:') {
    return {
      isValid: false,
      targetUrl: null,
      reason: 'HTTPS_REQUIRED',
    };
  }

  // Prohibir credenciales embebidas en la URL (ej. https://admin:pass@evil.com)
  if (parsedBase.username !== '' || parsedBase.password !== '') {
    return {
      isValid: false,
      targetUrl: null,
      reason: 'EMBEDDED_CREDENTIALS_FORBIDDEN',
    };
  }

  const hostname = parsedBase.hostname.toLowerCase();
  if (!hostname || !hostname.includes('.') || isPrivateOrLoopbackHost(hostname)) {
    return {
      isValid: false,
      targetUrl: null,
      reason: 'INVALID_OR_PRIVATE_HOSTNAME',
    };
  }

  // Si se configuró una lista blanca explícita de dominios permitidos, exigir coincidencia exacta
  const allowedHostsList = String(rawAllowedHosts ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (allowedHostsList.length > 0 && !allowedHostsList.includes(hostname)) {
    return {
      isValid: false,
      targetUrl: null,
      reason: 'HOSTNAME_NOT_IN_ALLOWLIST',
    };
  }

  // Sanitizar la subruta solicitada dentro de /portal/*
  let subPath = '';
  const cleanPathname = String(currentPathname || '').trim();
  if (cleanPathname.startsWith('/portal')) {
    const candidateSub = cleanPathname.slice('/portal'.length).replace(/\/+$/, '');
    if (ALLOWED_PORTAL_SUBPATHS.has(candidateSub)) {
      subPath = candidateSub === '/' ? '' : candidateSub;
    }
  }

  // Construir el pathname destino combinando el pathname base configurado y la subruta permitida
  const basePath = parsedBase.pathname.replace(/\/+$/, '');
  const finalPathname =
    subPath && !basePath.endsWith(subPath) ? `${basePath}${subPath}` : basePath || '/';
  parsedBase.pathname = finalPathname;

  // Filtrar estrictamente los query params a la lista blanca segura
  const safeParams = new URLSearchParams();
  parsedBase.searchParams.forEach((val, key) => {
    if (ALLOWED_QUERY_PARAMS.has(key) && val.trim().length > 0 && val.length <= 160) {
      safeParams.set(key, val.trim());
    }
  });

  if (currentSearch) {
    try {
      const incomingParams = new URLSearchParams(currentSearch);
      incomingParams.forEach((val, key) => {
        if (ALLOWED_QUERY_PARAMS.has(key) && val.trim().length > 0 && val.length <= 160) {
          safeParams.set(key, val.trim());
        }
      });
    } catch {
      // Ignorar query strings malformados
    }
  }

  parsedBase.search = safeParams.toString();
  parsedBase.hash = '';

  return {
    isValid: true,
    targetUrl: parsedBase.toString(),
    originHost: hostname,
  };
}

/**
 * Obtiene el estado de redirección leyendo las variables de entorno públicas de Vite.
 */
export function getConfiguredTradePortalRedirect(
  currentPathname = '/portal',
  currentSearch = ''
): PortalRedirectValidationResult {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_NEW_TRADE_PORTAL_URL as string | undefined)
      : undefined;

  const envAllowedHosts =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_NEW_TRADE_PORTAL_ALLOWED_HOSTS as string | undefined)
      : undefined;

  return validateAndBuildNewPortalUrl(envUrl, currentPathname, currentSearch, envAllowedHosts);
}
