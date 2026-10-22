import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  campoService,
  SyncQueueItem,
  ShelfScanPayload,
  PriceSurveyPayload,
  FREQUENT_STORES,
  CODIZULCA_PRODUCTS,
  mapSupabasePriceRowToPayload,
  toSortableTimestamp
} from '../campoService';

describe('campoService - Offline-First & Sync Test Suite', () => {
  const QUEUE_STORAGE_KEY = 'portal_sync_queue';

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. HAPPY PATH (Casos de Éxito)
  // =========================================================================
  describe('Happy Path (Flujos de Éxito)', () => {
    it('debe encolar un elemento en la cola offline con ID y timestamp únicos (enqueue)', () => {
      const payload = { store: 'ALKOSTO', promoter: 'CARELIZ REYES', type: 'Ingreso' };
      const item = campoService.enqueue('checkin', payload);

      expect(item).toBeDefined();
      expect(item.id.startsWith('QUEUE-')).toBe(true);
      expect(item.type).toBe('checkin');
      expect(item.payload).toEqual(payload);
      expect(item.timestamp).toBeDefined();

      const queue = campoService.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].id).toBe(item.id);
    });

    it('debe sincronizar exitosamente todos los elementos de la cola cuando hay conexión (flushQueue)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
      vi.stubGlobal('fetch', mockFetch);

      campoService.enqueue('checkin', { id: 'CHK-1', store: 'ALKOSTO' });
      campoService.enqueue('shelf_scan', { id: 'SCAN-1', category: 'Embutidos' });
      campoService.enqueue('price_survey', { id: 'PRICE-1', productName: 'Mortadela' });

      expect(campoService.getQueue().length).toBe(3);

      const result = await campoService.flushQueue();

      expect(result.synced).toBe(3);
      expect(result.remaining).toBe(0);
      expect(campoService.getQueue().length).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('debe guardar un escaneo de góndola en storage y encolar offline si la API no está disponible', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Sin conexión')));

      const mockScan: ShelfScanPayload = {
        id: 'SCAN-TEST-001',
        date: new Date().toISOString(),
        store: 'ALKOSTO BELLA VISTA',
        category: 'Embutidos Cocidos',
        photos: ['data:image/jpeg;base64,photo1'],
        metrics: {
          ourFacings: 12,
          competitorFacings: 18,
          totalFacings: 30,
          shareOfShelfPercent: 40,
          shelfLevel: 'OJOS',
          outOfStockDetected: false,
          popDetected: true
        },
        competitorBrandsObserved: ['Plumrose', 'Hermo'],
        promoter: 'CARELIZ REYES'
      };

      const result = await campoService.saveShelfScan(mockScan);

      expect(result.success).toBe(true);
      expect(result.offline).toBe(true);

      const queue = campoService.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].type).toBe('shelf_scan');
    });

    it('debe guardar una encuesta de precios exitosamente (savePriceSurvey)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      }));

      const mockSurvey: PriceSurveyPayload = {
        id: 'PRICE-TEST-001',
        date: new Date().toISOString(),
        store: 'ALKOSTO CABIMAS',
        promoter: 'SCARLETH PIÑA',
        productName: 'Mortadela Tapara Especial',
        ownPriceUsd: 4.20,
        ownPriceBs: 154.77,
        bcvRate: 36.85,
        competitors: [
          { name: 'Plumrose', priceUsd: 4.80, priceBs: 176.88, diffPercent: 14.3 }
        ]
      };

      const result = await campoService.savePriceSurvey(mockSurvey);
      expect(result.success).toBe(true);
      expect(result.offline).toBe(false);
    });
  });

  // =========================================================================
  // 2. CASOS BORDE Y VALIDACIÓN DE TIPOS/DATOS (Edge Cases & Null Safety)
  // =========================================================================
  describe('Casos Borde y Validación de Datos (Edge Cases)', () => {
    it('flushQueue debe retornar { synced: 0, remaining: 0 } si la cola está vacía', async () => {
      const result = await campoService.flushQueue();
      expect(result).toEqual({ synced: 0, remaining: 0 });
    });

    it('debe recuperarse si la cola en localStorage contiene JSON corrupto', () => {
      localStorage.setItem(QUEUE_STORAGE_KEY, 'corrupted ::: [ json');
      const queue = campoService.getQueue();
      expect(Array.isArray(queue)).toBe(true);
      expect(queue.length).toBe(0);
    });

    it('debe manejar elementos de tipo desconocido sin lanzar excepción', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      // Inyectar manualmente un tipo no reconocido
      const fakeQueue: SyncQueueItem[] = [
        {
          id: 'QUEUE-UNKNOWN',
          type: 'tipo_inexistente' as any,
          payload: {},
          timestamp: new Date().toISOString()
        }
      ];
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(fakeQueue));

      const result = await campoService.flushQueue();
      // Debe conservarse en remaining al no tener endpoint conocido
      expect(result.synced).toBe(0);
      expect(result.remaining).toBe(1);
    });
  });

  // =========================================================================
  // 3. MANEJO DE EXCEPCIONES Y ERRORES DE RED (Network Errors & HTTP 4xx/5xx)
  // =========================================================================
  describe('Manejo de Excepciones y Errores de Red / API', () => {
    it('debe abortar la sincronización inmediatamente si navigator.onLine es false', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      campoService.enqueue('checkin', { id: 'CHK-OFFLINE' });
      const result = await campoService.flushQueue();

      expect(result.synced).toBe(0);
      expect(result.remaining).toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('debe conservar en cola los elementos que fallen con HTTP 500 y sincronizar los que tengan éxito', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/checkins')) {
          // El primer elemento falla con 500
          return { ok: false, status: 500 };
        }
        // El segundo tiene éxito con 200
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }));

      campoService.enqueue('checkin', { id: 'CHK-FAIL' });
      campoService.enqueue('shelf_scan', { id: 'SCAN-SUCCESS' });

      const result = await campoService.flushQueue();

      expect(result.synced).toBe(1);
      expect(result.remaining).toBe(1);

      const remainingQueue = campoService.getQueue();
      expect(remainingQueue.length).toBe(1);
      expect(remainingQueue[0].type).toBe('checkin');
    });

    it('debe conservar en cola los elementos si fetch lanza TypeError (Network Error o Timeout)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      campoService.enqueue('price_survey', { id: 'PRICE-ERR' });

      const result = await campoService.flushQueue();
      expect(result.synced).toBe(0);
      expect(result.remaining).toBe(1);
      expect(campoService.getQueue().length).toBe(1);
    });
  });

  describe('Precios Module Catalogue & Store Isolation', () => {
    it('contiene las sucursales oficiales de Alkosto y Olímpica en FREQUENT_STORES', () => {
      expect(FREQUENT_STORES.length).toBe(13);
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (AV DELICIAS)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (SAN FELIPE)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (PLAZA BARALT)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LA COROMOTO)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (DR. PORTILLO)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (CABIMAS)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LOS CACTUS)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (TRUJILLO)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (ZONA INDUSTRIAL)');
      expect(FREQUENT_STORES).toContain('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LA LIMPIA)');
      expect(FREQUENT_STORES).toContain('OLIMPICA MAYORISTA');
      expect(FREQUENT_STORES).toContain('OLIMPICA SÚPER MARKET');
    });

    it('contiene los productos de Asturias y las presentaciones de Vencampo (incluyendo Caraotas y Lentejas 400gr) en CODIZULCA_PRODUCTS', () => {
      expect(CODIZULCA_PRODUCTS.length).toBe(24);
      const names = CODIZULCA_PRODUCTS.map((p) => p.name);
      expect(names).toContain('Caraotas 400gr');
      expect(names).toContain('Lentejas 400gr');
      expect(names).not.toContain('Caraotas 500gr');
      expect(names).not.toContain('Caraotas 1kg');
      expect(names).not.toContain('Lentejas 500gr');
      expect(names).not.toContain('Lentejas 1kg');
      expect(names).toContain('Pechuga de Pavo Asturias');
      expect(names).toContain('Pechuga de Pollo Asturias');
      expect(names).toContain('Jamón Cocido de Pavo Asturias');
      expect(names).toContain('Jamón de Pierna Estándar');
      expect(names.some((n) => n.includes('Arroz Vencampo'))).toBe(true);
      expect(names.some((n) => n.includes('Azúcar Vencampo'))).toBe(true);
      expect(names.some((n) => n.includes('Aceite Vencampo'))).toBe(true);
      expect(names.some((n) => n.includes('Leche Vencampo'))).toBe(true);
      const mortadelas = CODIZULCA_PRODUCTS.filter((p) => p.name.includes('Mortadela Especial de Pollo Asturias'));
      expect(mortadelas.length).toBe(2);
      expect(mortadelas.some((m) => m.weight === '900gr')).toBe(true);
      expect(mortadelas.some((m) => m.weight === '500gr')).toBe(true);
    });
  });

  describe('Autenticación de Coordinadora de Trade Marketing (Grecia01@codizulca.com / Codi.02)', () => {
    it('permite iniciar sesión en Codizulca Campo con Grecia01@codizulca.com y contraseña Codi.02', async () => {
      const result = await campoService.loginPromoter('Grecia01@codizulca.com', 'Codi.02');
      expect(result.success).toBe(true);
      expect(result.promoter).toBeDefined();
      expect(result.promoter?.id).toBe('COORD-TM-01');
      expect(result.promoter?.role).toBe('Coordinadora Trade Marketing');
      expect(result.promoter?.email).toBe('Grecia01@codizulca.com');
      expect(campoService.isAuthenticatedPromoter()).toBe(true);
      expect(campoService.isWithinCommercialHours()).toBe(true);
    });

    it('soporta variantes en minúsculas y alias corporativos para la Coordinadora de Trade Marketing', async () => {
      const resLower = await campoService.loginPromoter('grecia01@codizulca.com', 'codi.02');
      expect(resLower.success).toBe(true);
      expect(resLower.promoter?.role).toBe('Coordinadora Trade Marketing');

      const resAlias = await campoService.loginPromoter('trademarketing@codizulca.com', 'Codi.02');
      expect(resAlias.success).toBe(true);
      expect(resAlias.promoter?.id).toBe('COORD-TM-01');
    });
  });

  describe('Sincronización de Comparativa de Precios (Promotoras -> Trade Marketing)', () => {
    it('mapea filas de Supabase prices con hasta 3 competidores y resuelve creatorId a nombre de promotora', () => {
      const rawSupabaseRow = {
        id: '8f14e45f-ceea-467a-a13c-123456789abc',
        date: '2026-10-22',
        created_at: '2026-10-22T14:20:00.000Z',
        store: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (AV DELICIAS)',
        ourProduct: 'Caraotas 400gr',
        ourPrice: 1.5,
        competitor1Brand: 'Pantera 400gr',
        competitor1Price: 1.65,
        competitor2Brand: 'Montalbán 400gr',
        competitor2Price: 1.6,
        competitor3Brand: '',
        competitor3Price: null,
        comments: 'Exhibición principal',
        creatorId: 'dariannysferrer23@gmail.com',
        promoter: 'dariannysferrer23@gmail.com'
      };

      const mapped = mapSupabasePriceRowToPayload(rawSupabaseRow);
      expect(mapped.id).toBe('8f14e45f-ceea-467a-a13c-123456789abc');
      expect(mapped.promoter).toBe('DARIANNYS FERRER');
      expect(mapped.productName).toBe('Caraotas 400gr');
      expect(mapped.ownPriceUsd).toBe(1.5);
      expect(mapped.competitors.length).toBe(2);
      expect(mapped.competitors[0].name).toBe('Pantera 400gr');
      expect(mapped.competitors[0].priceUsd).toBe(1.65);
      expect(mapped.competitors[1].name).toBe('Montalbán 400gr');
      expect(mapped.competitors[1].priceUsd).toBe(1.6);
    });

    it('sincroniza sin duplicados entre savePriceSurvey y getPriceSurveys manteniendo UUID determinístico', async () => {
      let postedBody: any = null;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST' && url.includes('/api/price-surveys')) {
          postedBody = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 201,
            json: async () => postedBody
          };
        }
        if (url.includes('/api/price-surveys')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => (postedBody ? [postedBody] : [])
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      }));

      const survey: PriceSurveyPayload = {
        id: 'PRICE-987654',
        date: '2026-10-22T15:00:00.000Z',
        store: 'OLIMPICA SÚPER MARKET',
        promoter: 'JAIVELIN FEREIRA',
        creatorId: 'jaivelinfereira20@gmail.com',
        productName: 'Lentejas 400gr',
        ownPriceUsd: 1.65,
        ownPriceBs: 60.8,
        bcvRate: 36.85,
        competitors: [
          { name: 'Pantera', priceUsd: 1.8, priceBs: 66.33, diffPercent: 9.1 }
        ],
        observations: 'Relevamiento en vivo'
      };

      const saveRes = await campoService.savePriceSurvey(survey);
      expect(saveRes.success).toBe(true);
      expect(saveRes.offline).toBe(false);

      const allSurveys = await campoService.getPriceSurveys(true);
      expect(allSurveys.length).toBe(1);
      expect(allSurveys[0].productName).toBe('Lentejas 400gr');
      expect(allSurveys[0].promoter).toBe('JAIVELIN FEREIRA');
      expect(allSurveys[0].competitors[0].name).toBe('Pantera');
      expect(allSurveys[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('ordena correctamente fechas ISO y DD/MM/YYYY mediante toSortableTimestamp', () => {
      const tsIso = toSortableTimestamp('2026-10-22', '2026-10-22T14:30:00.000Z');
      const tsDmyOlder = toSortableTimestamp('18/10/2026');
      expect(tsIso).toBeGreaterThan(tsDmyOlder);
      expect(Number.isNaN(tsDmyOlder)).toBe(false);
    });
  });
});
