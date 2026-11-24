import { describe, it, expect } from 'vitest';
import {
  SHOW_LEGACY_PORTAL_LINK,
  validateAndBuildNewPortalUrl,
} from '../lib/portalMigrationConfig';

describe('Portal Migration Config & Open Redirect Security', () => {
  it('mantiene SHOW_LEGACY_PORTAL_LINK desactivado (false) por defecto', () => {
    expect(SHOW_LEGACY_PORTAL_LINK).toBe(false);
  });

  it('rechaza URLs vacías o no configuradas', () => {
    expect(validateAndBuildNewPortalUrl('').isValid).toBe(false);
    expect(validateAndBuildNewPortalUrl('   ').reason).toBe('NOT_CONFIGURED');
    expect(validateAndBuildNewPortalUrl(undefined).isValid).toBe(false);
  });

  it('rechaza vectores de Open Redirect con esquemas inseguros (http, javascript, data, //)', () => {
    expect(validateAndBuildNewPortalUrl('http://trade-portal.codizulca.com').reason).toBe(
      'HTTPS_REQUIRED'
    );
    expect(validateAndBuildNewPortalUrl('javascript:alert(1)').isValid).toBe(false);
    expect(validateAndBuildNewPortalUrl('data:text/html,<script>alert(1)</script>').isValid).toBe(
      false
    );
    expect(validateAndBuildNewPortalUrl('//evil.example.com/portal').reason).toBe(
      'MALFORMED_OR_PROTOCOL_RELATIVE_URL'
    );
  });

  it('rechaza URLs con credenciales embebidas o hosts privados/loopback', () => {
    expect(
      validateAndBuildNewPortalUrl('https://admin:secret@trade.codizulca.com/portal').reason
    ).toBe('EMBEDDED_CREDENTIALS_FORBIDDEN');

    expect(validateAndBuildNewPortalUrl('https://localhost:3000/portal').reason).toBe(
      'INVALID_OR_PRIVATE_HOSTNAME'
    );
    expect(validateAndBuildNewPortalUrl('https://127.0.0.1/portal').reason).toBe(
      'INVALID_OR_PRIVATE_HOSTNAME'
    );
    expect(validateAndBuildNewPortalUrl('https://192.168.1.50/portal').reason).toBe(
      'INVALID_OR_PRIVATE_HOSTNAME'
    );
  });

  it('valida lista blanca de dominios cuando se especifica rawAllowedHosts', () => {
    const blocked = validateAndBuildNewPortalUrl(
      'https://phishing-site.com/portal',
      '/portal/login',
      '',
      'trade.codizulca.com,programa-trade.onrender.com'
    );
    expect(blocked.isValid).toBe(false);
    expect(blocked.reason).toBe('HOSTNAME_NOT_IN_ALLOWLIST');

    const allowed = validateAndBuildNewPortalUrl(
      'https://programa-trade.onrender.com/portal',
      '/portal/login',
      '?email=godoyaraujonicole%40gmail.com&redirect=https://evil.com',
      'trade.codizulca.com,programa-trade.onrender.com'
    );
    expect(allowed.isValid).toBe(true);
    expect(allowed.targetUrl).toBe(
      'https://programa-trade.onrender.com/portal/login?email=godoyaraujonicole%40gmail.com'
    );
  });

  it('preserva subrutas válidas y descarta parámetros de redirección maliciosos', () => {
    const res = validateAndBuildNewPortalUrl(
      'https://trade-marketing.codizulca.com',
      '/portal/asistencia',
      '?user=Nicole&url=https://attacker.com&next=//attacker.com'
    );
    expect(res.isValid).toBe(true);
    expect(res.targetUrl).toBe(
      'https://trade-marketing.codizulca.com/asistencia?user=Nicole'
    );
  });
});
