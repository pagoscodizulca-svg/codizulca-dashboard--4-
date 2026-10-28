import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveStoreByGpsIfGenericDefault,
  isGenericDefaultStoreName,
  isMerchandisingRoutePromoter,
  normalizeAndDeduplicateCheckIns,
  CheckInRecord,
  STORAGE_KEY_ACTIVE_PROMOTER,
} from '../lib/checkinsService';
import {
  merchandisingService,
  mapSupabaseMerchRowToReport,
  reconcileMerchandisingCheckIns,
  isSameMerchandisingStore,
  MerchandisingReport,
} from '../lib/merchandisingService';
import {
  campoService,
  AUTH_USER_ID_KEY,
  ACTIVE_USER_KEY,
  ShelfScanPayload,
} from '../lib/campoService';
import {
  matchPromoterName,
  normalizeDateToDMY,
} from '../lib/degustacionesService';

describe('Visitas de Zioreli Grangger (Lunes 26/10 a Miércoles 28/10) y Sincronización 100% App Promotoras -> Trade Marketing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Visitas de Zioreli Grangger cargadas en Merchandising (Lunes 26/10 al Miércoles 28/10) y Filtros Case-Insensitive', () => {
    const zioreliWeekSupabaseRows = [
      // Lunes 2026-10-26 (Ruta La Limpia)
      {
        id: '89e81d99-237c-46a2-8b37-edf243d42a27',
        type: 'Merchandising',
        date: '2026-10-26',
        store: 'FARMACIA FARMAEXPRESS LA LIMPIA, C.A.',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({
          isMerchandising: true,
          time: '08:35',
          address: 'Av. 28 La Limpia, Maracaibo',
          storeManagerName: 'Jorge Fuenmayor',
          storeManagerRole: 'Gerente de Tienda',
          activities: ['Reposición de Anaquel y Neveras', 'Rotación FIFO y Control de Vencimientos'],
          certified: true,
        }),
      },
      {
        id: 'ed391c27-2616-4ab5-88c1-fba178f56660',
        type: 'Merchandising',
        date: '2026-10-26',
        store: 'Mercasa',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({
          isMerchandising: true,
          time: '10:50',
          address: 'Corredor Vial La Limpia, Maracaibo',
          storeManagerName: 'Jesús Barrios',
          storeManagerRole: 'Encargado de Piso',
          activities: ['Reposición de Anaquel y Neveras', 'Exhibición y Ajuste de Planograma'],
          certified: true,
        }),
      },
      {
        id: '63d54bf6-0bda-44c9-877c-f2b2db95702c',
        type: 'Merchandising',
        date: '2026-10-26',
        store: 'Alkosto La Limpia',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({
          isMerchandising: true,
          time: '14:15',
          address: 'Av. La Limpia, Maracaibo',
          storeManagerName: 'Encargado de Tienda',
          storeManagerRole: 'Jefe de Charcutería / Perecederos',
          activities: ['Auditoría de Planograma & Visibilidad'],
          certified: true,
        }),
      },
      // Martes 2026-10-27 (Ruta Amparo & Los Olivos)
      {
        id: 'bce90920-4f61-487e-879d-0bd1f7e8ce7e',
        type: 'Merchandising',
        date: '2026-10-27',
        store: 'Fiorella Amparo',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({ isMerchandising: true, time: '08:30', certified: true }),
      },
      {
        id: '9f7b839c-518c-4c76-81f2-b647ec44a949',
        type: 'Merchandising',
        date: '2026-10-27',
        store: 'Farma Venezuela Amparo',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({ isMerchandising: true, time: '10:45', storeManagerName: 'Richard Villa', certified: true }),
      },
      {
        id: '385075da-2cd3-4ef3-8243-e69ac23ca9f1',
        type: 'Merchandising',
        date: '2026-10-27',
        store: 'Fiorella Los Olivos',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({ isMerchandising: true, time: '13:25', certified: true }),
      },
      {
        id: 'e0b4a3cb-07b8-4c31-87e5-b4bff26c19d9',
        type: 'Merchandising',
        date: '2026-10-27',
        store: 'Familia 6 Los Olivos',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({ isMerchandising: true, time: '15:10', certified: true }),
      },
      // Miércoles 2026-10-28 (Ruta La Curva, La Cumbre & C2 con evidencia fotográfica real)
      {
        id: '42bf67f2-61be-4e6b-89de-bb5ad44cc0bf',
        type: 'Merchandising',
        date: '2026-10-28',
        store: 'Fiorella La Curva',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({
          isMerchandising: true,
          time: '08:40',
          photos: ['data:image/jpeg;base64,fiorella_curva_1', 'data:image/jpeg;base64,fiorella_curva_2'],
          certified: true,
        }),
      },
      {
        id: '3353b5ea-4355-42e0-8d00-5617d79ff3f6',
        type: 'Merchandising',
        date: '2026-10-28',
        store: 'Fiorella Cumbre',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({
          isMerchandising: true,
          time: '10:10',
          photos: ['data:image/jpeg;base64,fiorella_cumbre_1'],
          certified: true,
        }),
      },
      {
        id: '374c4cc0-b8b3-4e08-89f1-0b56e60e90b6',
        type: 'Merchandising',
        date: '2026-10-28',
        store: 'Farma Express C2',
        promoter: 'ZIORELI GRANGGER',
        product: 'Portafolio Embutidos y Charcutería Codizulca',
        creatorId: 'Ziorelis.grangger@codizulca.com',
        comments: JSON.stringify({
          isMerchandising: true,
          time: '12:02',
          storeManagerName: 'Ángel Amador',
          photos: ['data:image/jpeg;base64,farma_express_c2_1'],
          certified: true,
        }),
      },
    ];

    it('mapea las 10 visitas de Zioreli (Lunes 26/10 a Miércoles 28/10) y coincide al 100% con el selector "Zioreli Grangger"', () => {
      const mappedReports = zioreliWeekSupabaseRows.map(mapSupabaseMerchRowToReport);
      expect(mappedReports).toHaveLength(10);

      // Validar que todas resuelven a ZIORELI GRANGGER y coinciden con todas las variantes del filtro en TradeMarketing.tsx
      for (const report of mappedReports) {
        expect(report.promoter).toBe('ZIORELI GRANGGER');
        expect(matchPromoterName(report.promoter, 'Zioreli Grangger')).toBe(true);
        expect(matchPromoterName(report.promoter, 'ZIORELI GRANGGER')).toBe(true);
        expect(matchPromoterName(report.promoter, 'Ziorelis.grangger@codizulca.com')).toBe(true);
        expect(matchPromoterName(report.promoter, 'Jose Barroso')).toBe(false);
      }

      // Validar conteo por día y normalización de filtro de fecha (YYYY-MM-DD vs DD/MM/YYYY)
      const monday = mappedReports.filter((r) => normalizeDateToDMY(r.date) === normalizeDateToDMY('2026-10-26'));
      const tuesday = mappedReports.filter((r) => normalizeDateToDMY(r.date) === normalizeDateToDMY('27/10/2026'));
      const wednesday = mappedReports.filter((r) => normalizeDateToDMY(r.date) === normalizeDateToDMY('2026-10-28'));

      expect(monday.map((r) => r.store)).toEqual([
        'FARMACIA FARMAEXPRESS LA LIMPIA, C.A.',
        'Mercasa',
        'Alkosto La Limpia',
      ]);
      expect(tuesday.map((r) => r.store)).toEqual([
        'Fiorella Amparo',
        'Farma Venezuela Amparo',
        'Fiorella Los Olivos',
        'Familia 6 Los Olivos',
      ]);
      expect(wednesday.map((r) => r.store)).toEqual([
        'Fiorella La Curva',
        'Fiorella Cumbre',
        'Farma Express C2',
      ]);
      expect(wednesday.reduce((sum, r) => sum + r.photos.length, 0)).toBe(4);
    });
  });

  describe('2. Resolución Geocerca GPS y Preservación de Ruta Multi-PDV para Mercaderistas', () => {
    it('corrige automáticamente la tienda por defecto "ALKOSTO DONDE COMPRAR ES GANAR, C.A." usando las coordenadas GPS reales de Zioreli', () => {
      expect(isGenericDefaultStoreName('ALKOSTO DONDE COMPRAR ES GANAR, C.A.')).toBe(true);
      expect(isGenericDefaultStoreName('ALKOSTO DONDE COMPRAR ES GANAR, C.A. (CABIMAS)')).toBe(false);
      expect(isGenericDefaultStoreName('Fiorella La Curva')).toBe(false);

      expect(
        resolveStoreByGpsIfGenericDefault('ALKOSTO DONDE COMPRAR ES GANAR, C.A.', {
          lat: 10.683202,
          lng: -71.680169,
          accuracy: 8,
        }).store
      ).toBe('Fiorella La Curva');

      expect(
        resolveStoreByGpsIfGenericDefault('ALKOSTO DONDE COMPRAR ES GANAR, C.A.', {
          lat: 10.657365,
          lng: -71.66221,
          accuracy: 7,
        }).store
      ).toBe('Fiorella Cumbre');

      expect(
        resolveStoreByGpsIfGenericDefault('ALKOSTO DONDE COMPRAR ES GANAR, C.A.', {
          lat: 10.639101,
          lng: -71.663374,
          accuracy: 6,
        }).store
      ).toBe('Farma Express C2');

      // Nunca sobrescribe una tienda específica elegida explícitamente por la promotora
      expect(
        resolveStoreByGpsIfGenericDefault('Supermercado De Candido', {
          lat: 10.683202,
          lng: -71.680169,
          accuracy: 8,
        }).store
      ).toBe('Supermercado De Candido');
    });

    it('preserva los 3 ingresos en distintos PDVs del mismo día para Zioreli mientras deduplica dobles toques en la misma tienda', () => {
      expect(isMerchandisingRoutePromoter('ZIORELI GRANGGER')).toBe(true);
      expect(isMerchandisingRoutePromoter('JOSE BARROSO')).toBe(true);
      expect(isMerchandisingRoutePromoter('SCARLETH PIÑA')).toBe(false);

      const rawWednesdayCheckins: CheckInRecord[] = [
        {
          id: '0210bc20-07c1-4ade-86f1-2856bdd88526',
          date: '2026-10-28T12:40:40.000Z', // 08:40 a.m. VET
          type: 'Ingreso',
          store: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.',
          photoBase64: 'data:image/jpeg;base64,curva_1',
          location: { lat: 10.683202, lng: -71.680169, accuracy: 8 },
          promoter: 'Ziorelis.grangger@codizulca.com',
          creatorId: '6a14294a-7ac4-4d0b-af3c-652b7ff06ce6',
        },
        {
          id: '8b2bc3d7-3266-4446-895f-17973863b27d',
          date: '2026-10-28T12:43:02.000Z', // 08:43 a.m. VET (doble toque en el mismo PDV Fiorella La Curva)
          type: 'Ingreso',
          store: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.',
          photoBase64: 'data:image/jpeg;base64,curva_2',
          location: { lat: 10.683195, lng: -71.680175, accuracy: 7 },
          promoter: 'ZIORELI GRANGGER',
          creatorId: '6a14294a-7ac4-4d0b-af3c-652b7ff06ce6',
        },
        {
          id: '57e962e8-56a5-4ebe-8f41-1046271eb12a',
          date: '2026-10-28T14:10:30.000Z', // 10:10 a.m. VET
          type: 'Ingreso',
          store: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.',
          photoBase64: 'data:image/jpeg;base64,cumbre_1',
          location: { lat: 10.657365, lng: -71.66221, accuracy: 9 },
          promoter: 'ZIORELI GRANGGER',
          creatorId: '6a14294a-7ac4-4d0b-af3c-652b7ff06ce6',
        },
        {
          id: 'b12cf0bb-3941-4003-8270-e5c236b97b9e',
          date: '2026-10-28T16:01:59.000Z', // 12:01 p.m. VET
          type: 'Ingreso',
          store: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.',
          photoBase64: 'data:image/jpeg;base64,c2_1',
          location: { lat: 10.639101, lng: -71.663374, accuracy: 6 },
          promoter: 'ZIORELI GRANGGER',
          creatorId: '6a14294a-7ac4-4d0b-af3c-652b7ff06ce6',
        },
      ];

      const normalized = normalizeAndDeduplicateCheckIns(rawWednesdayCheckins);
      expect(normalized).toHaveLength(3);
      expect(normalized.map((c) => c.store).sort()).toEqual([
        'Farma Express C2',
        'Fiorella Cumbre',
        'Fiorella La Curva',
      ]);
      expect(normalized.every((c) => c.promoter === 'ZIORELI GRANGGER')).toBe(true);
    });
  });

  describe('3. Reconciliación Automática Check-in -> Merchandising y Sincronización Bidireccional', () => {
    it('convierte automáticamente los Check-ins de mercaderistas en visitas de Merchandising sin duplicar reportes existentes', () => {
      expect(isSameMerchandisingStore('Fiorella La Curva', '', 'FIORELLA LA CURVA', '')).toBe(true);
      expect(isSameMerchandisingStore('Fiorella', 'La curva', 'Fiorella La Curva', '')).toBe(true);
      expect(isSameMerchandisingStore('FARMAEXPRESS', 'Circunvalación 2', 'Farma Express C2', '')).toBe(true);

      const existingReports: MerchandisingReport[] = [
        mapSupabaseMerchRowToReport({
          id: '42bf67f2-61be-4e6b-89de-bb5ad44cc0bf',
          type: 'Merchandising',
          date: '2026-10-28',
          store: 'Fiorella La Curva',
          promoter: 'ZIORELI GRANGGER',
          comments: JSON.stringify({ isMerchandising: true, time: '08:40', photos: [] }),
        }),
      ];

      const checkins: CheckInRecord[] = [
        // Mismo PDV que ya tiene reporte en surveys (sin fotos): debe enriquecer foto, NO duplicar tarjeta
        {
          id: '0210bc20-07c1-4ade-86f1-2856bdd88526',
          date: '2026-10-28T12:40:40.000Z',
          type: 'Ingreso',
          store: 'Fiorella La Curva',
          photoBase64: 'data:image/jpeg;base64,foto_real_curva',
          location: { lat: 10.683202, lng: -71.680169, accuracy: 8 },
          promoter: 'ZIORELI GRANGGER',
        },
        // Nuevo PDV visitado por Zioreli vía Asistencia GPS sin llenar formulario separado: debe crear visita en Merchandising
        {
          id: '57e962e8-56a5-4ebe-8f41-1046271eb12a',
          date: '2026-10-28T14:10:30.000Z',
          type: 'Ingreso',
          store: 'Fiorella Cumbre',
          photoBase64: 'data:image/jpeg;base64,foto_real_cumbre',
          location: { lat: 10.657365, lng: -71.66221, accuracy: 9 },
          promoter: 'ZIORELI GRANGGER',
        },
        // Check-in de impulsadora fija (no mercaderista): NO debe mezclarse en Merchandising
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          date: '2026-10-28T13:00:00.000Z',
          type: 'Ingreso',
          store: 'Supermercado De Candido',
          photoBase64: 'data:image/jpeg;base64,impulso',
          location: { lat: 10.661, lng: -71.612, accuracy: 5 },
          promoter: 'SCARLETH PIÑA',
        },
      ];

      const reconciled = reconcileMerchandisingCheckIns(existingReports, checkins);
      expect(reconciled).toHaveLength(2);

      const curva = reconciled.find((r) => r.store === 'Fiorella La Curva');
      const cumbre = reconciled.find((r) => r.store === 'Fiorella Cumbre');

      expect(curva).toBeDefined();
      expect(curva?.photos).toContain('data:image/jpeg;base64,foto_real_curva');
      expect(cumbre).toBeDefined();
      expect(cumbre?.promoter).toBe('ZIORELI GRANGGER');
      expect(cumbre?.photos).toContain('data:image/jpeg;base64,foto_real_cumbre');
    });

    it('recupera la sesión autenticada de Zioreli en la App Móvil y sincroniza informes de Merchandising y Escaneos IA', async () => {
      // Simular sesión autenticada donde ACTIVE_USER_KEY se perdió pero AUTH_USER_ID_KEY persiste
      localStorage.setItem(AUTH_USER_ID_KEY, 'STF-027');
      localStorage.removeItem(ACTIVE_USER_KEY);
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROMOTER, 'ZIORELI GRANGGER');

      const active = campoService.getActivePromoter();
      expect(active.id).toBe('STF-027');
      expect(active.name).toBe('ZIORELI GRANGGER');
      expect(active.role).toBe('Promotor Merchandising');

      // Crear visita desde PortalMerchandising usando minúsculas o correo
      const created = await merchandisingService.create({
        date: '2026-10-28',
        time: '15:20',
        store: 'Farma Express C2',
        address: 'Circunvalación 2, Maracaibo',
        promoter: 'zioreli grangger',
        creatorId: active.email,
        storeManagerName: 'Ángel Amador',
        storeManagerRole: 'Gerente de Tienda',
        storeManagerPhone: '',
        visitReason: 'Visita de Merchandising y Certificación PDV',
        activities: ['Reposición de Anaquel y Neveras', 'Exhibición y Ajuste de Planograma'],
        product: 'Línea Embutidos Codizulca',
        observations: 'Nevera abastecida y precios actualizados',
        signature: 'data:image/png;base64,sig',
        signedAt: '2026-10-28T19:20:00.000Z',
        certified: true,
        photos: ['data:image/jpeg;base64,evidencia'],
      });

      expect(created.promoter).toBe('ZIORELI GRANGGER');

      // Guardar también un Escaneo Inteligente de Góndola (IA) de Zioreli
      const shelfScan: ShelfScanPayload = {
        id: 'a1b2c3d4-e5f6-4789-8abc-def012345678',
        date: '2026-10-28T16:30:00.000Z',
        store: 'Fiorella Cumbre',
        category: 'Embutidos y Charcutería',
        photos: ['data:image/jpeg;base64,gondola_ia'],
        metrics: {
          ourFacings: 16,
          competitorFacings: 12,
          totalFacings: 28,
          shareOfShelfPercent: 57,
          shelfLevel: 'Nivel Ojos / Manos',
          outOfStockDetected: false,
          popDetected: true,
        },
        competitorBrandsObserved: ['Plumrose', 'Montserratina'],
        promoter: 'Ziorelis.grangger@codizulca.com',
      };

      await campoService.saveShelfScan(shelfScan);

      const allMerch = await merchandisingService.getAll();
      const foundCert = allMerch.find((r) => r.id === created.id);
      const foundScan = allMerch.find((r) => r.id === 'a1b2c3d4-e5f6-4789-8abc-def012345678');

      expect(foundCert).toBeDefined();
      expect(foundCert?.promoter).toBe('ZIORELI GRANGGER');
      expect(matchPromoterName(foundCert!.promoter, 'Zioreli Grangger')).toBe(true);

      expect(foundScan).toBeDefined();
      expect(foundScan?.promoter).toBe('ZIORELI GRANGGER');
      expect(foundScan?.metrics?.shareOfShelfPercent).toBe(57);
      expect(matchPromoterName(foundScan!.promoter, 'Zioreli Grangger')).toBe(true);
    });
  });
});
