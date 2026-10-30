import { describe, it, expect } from 'vitest';
import {
  getSellerMetadata,
  normalizeSellerName,
  isValidVolumeSeller,
  isExcludedVolumeSeller,
  OFFICIAL_SUPERVISORS,
  OFFICIAL_SELLERS_LIST
} from '../components/cuotas/sellerSupervisorMap';
import { INITIAL_SELLERS_ACTIVATION } from '../components/cuotas/cuotasData';
import { SELLER_VOLUME_QUOTAS } from '../components/cuotas/volumeQuotasData';
import { CARTERA_CLIENTES } from '../data/carteraClientes';
import { ENRICHED_CLIENTS } from '../data/clientsWithLocation';

describe('Ventas & Cuotas Business Calculations Test Suite', () => {
  // =========================================================================
  // 1. NORMALIZACIÓN DE NOMBRES DE VENDEDORES
  // =========================================================================
  describe('normalizeSellerName', () => {
    it('debe limpiar espacios adicionales y convertir a mayúsculas', () => {
      expect(normalizeSellerName('  hernan   paz  ')).toBe('HERNAN PAZ');
      expect(normalizeSellerName('carlos fuenmayor')).toBe('CARLOS FUENMAYOR');
    });

    it('debe manejar variantes con tildes y sin tildes de forma consistente', () => {
      const res1 = normalizeSellerName('MARÍA BRICEÑO');
      const res2 = normalizeSellerName('MARIA BRICENO');
      expect(res1).toBe('MARIA BRICEÑO');
      expect(res2).toBe('MARIA BRICEÑO');
    });

    it('debe normalizar códigos legacy y pasar las rutas de Johnatan Soto a MIKELANGELO DIAZ y la ruta de Ali Perez a ANGEL NAVARRO', () => {
      expect(normalizeSellerName('CUENTAS CLAVE 1 - MC')).toBe('MARIANA CHACIN');
      expect(normalizeSellerName('CUENTAS CLAVE 2 - SV')).toBe('SAIRU VALLES');
      expect(normalizeSellerName('OSCAR ORTIZ- CORO')).toBe('OSCAR ORTIZ');
      expect(normalizeSellerName('OSCAR ORTIZ- LA COSTA')).toBe('OSCAR ORTIZ');
      expect(normalizeSellerName('MIKELANGELO DIAZ')).toBe('MIKELANGELO DIAZ');
      expect(normalizeSellerName('MIKELANGELO DIAZ - VILLA DEL ROS')).toBe('MIKELANGELO DIAZ');
      expect(normalizeSellerName('JOHNATAN SOTO')).toBe('MIKELANGELO DIAZ');
      expect(normalizeSellerName('JOHNATAN SOTO VILLA DEL ROS')).toBe('MIKELANGELO DIAZ');
      expect(normalizeSellerName('ALI PEREZ')).toBe('ANGEL NAVARRO');
      expect(normalizeSellerName('ANGEL NAVARRO')).toBe('ANGEL NAVARRO');
    });

    it('debe retornar string vacío ante inputs vacíos, nulos o indefinidos sin lanzar excepción', () => {
      expect(normalizeSellerName('')).toBe('');
      expect(normalizeSellerName(null as any)).toBe('');
      expect(normalizeSellerName(undefined as any)).toBe('');
    });
  });

  // =========================================================================
  // 2. ASIGNACIÓN OFICIAL DE SUPERVISORES (ALÍ PÉREZ, JOHNATAN SOTO, NELSON FINOL)
  // =========================================================================
  describe('getSellerMetadata - División Oficial de Supervisores y Fuerza de Ventas', () => {
    it('debe contener exactamente los 3 supervisores oficiales y las 25 carteras activas de ventas', () => {
      expect(OFFICIAL_SUPERVISORS).toContain('JOHNATAN SOTO');
      expect(OFFICIAL_SUPERVISORS).toContain('ALI PEREZ');
      expect(OFFICIAL_SUPERVISORS).toContain('NELSON FINOL');
      expect(OFFICIAL_SUPERVISORS.length).toBe(3);
      expect(OFFICIAL_SELLERS_LIST.length).toBe(25);
      expect(OFFICIAL_SELLERS_LIST).not.toContain('ALI PEREZ');
      expect(OFFICIAL_SELLERS_LIST).toContain('ANGEL NAVARRO');
      expect(OFFICIAL_SELLERS_LIST).toContain('MARIANGEL GONZALEZ');
      expect(OFFICIAL_SELLERS_LIST).toContain('VICTOR CAMPOS');
      expect(INITIAL_SELLERS_ACTIVATION.length).toBe(25);
      expect(Object.keys(SELLER_VOLUME_QUOTAS).length).toBe(25);
    });

    it('debe asignar a JOHNATAN SOTO sus 6 vendedores (con los clientes de Johnatan asignados a Mikelangelo Diaz)', () => {
      expect(getSellerMetadata('MIKELANGELO DIAZ').supervisor).toBe('JOHNATAN SOTO');
      expect(getSellerMetadata('MIKELANGELO DIAZ - VILLA DEL ROS').supervisor).toBe('JOHNATAN SOTO');
      expect(getSellerMetadata('HERNAN PAZ').supervisor).toBe('JOHNATAN SOTO');
      expect(getSellerMetadata('OSWALDO CHURION').supervisor).toBe('JOHNATAN SOTO');
      expect(getSellerMetadata('JUAN HERNANDEZ').supervisor).toBe('JOHNATAN SOTO');
      expect(getSellerMetadata('ADEL JARABA').supervisor).toBe('JOHNATAN SOTO');
      expect(getSellerMetadata('ANGELICA MORENO').supervisor).toBe('JOHNATAN SOTO');
    });

    it('debe asignar a ALÍ PÉREZ exclusivamente como Supervisor de sus 7 vendedores (incluyendo Angel Navarro, Mariangel Gonzalez y Victor Campos)', () => {
      expect(getSellerMetadata('ALI PEREZ').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('ANGEL NAVARRO').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('MARIANGEL GONZALEZ').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('VICTOR CAMPOS').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('ELISA SOLER').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('LEONARDO RIOS').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('LUIS GUANIPA').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('OSCAR ORTIZ').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('OSCAR ORTIZ- CORO').supervisor).toBe('ALI PEREZ');
      expect(getSellerMetadata('OSCAR ORTIZ- LA COSTA').supervisor).toBe('ALI PEREZ');
    });

    it('debe asignar a NELSON FINOL sus 12 carteras de vendedores según la regla de negocio', () => {
      expect(getSellerMetadata('MARIA BRICEÑO').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('MARIANA CHACIN').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('CARLOS FUENMAYOR').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('SARAH REYES').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('J PABLO ARAUJO - CAB/OJE').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('JOSE G. GONZALEZ').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('YOLEIDA LUGO').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('SAIRU VALLES').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('J PABLO ARAUJO').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('EDUARDO PIÑA').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('MARYERY GARCIA').supervisor).toBe('NELSON FINOL');
      expect(getSellerMetadata('PEDRO ABREU').supervisor).toBe('NELSON FINOL');
    });

    it('cualquier vendedor no registrado debe asignarse por defecto a NELSON FINOL', () => {
      const meta = getSellerMetadata('VENDEDOR NUEVO O DESCONOCIDO');
      expect(meta.supervisor).toBe('NELSON FINOL');
      expect(meta.region).toBe('Supervisión Nelson Finol');
    });

    it('debe manejar vendedor nulo o vacío asignando NELSON FINOL sin lanzar error', () => {
      const meta = getSellerMetadata('');
      expect(meta.supervisor).toBe('NELSON FINOL');
    });
  });

  // =========================================================================
  // 3. EXCLUSIONES Y VALIDACIÓN EXACTA DE LA CARTERA DE CLIENTES OCTUBRE 2026
  // =========================================================================
  describe('Filtros de Vendedores Válidos y Cartera Exacta de Clientes Octubre 2026', () => {
    it('debe excluir cuentas administrativas y de oficina (OFICINA, GERENCIA, etc.)', () => {
      expect(isExcludedVolumeSeller('OFICINA')).toBe(true);
      expect(isExcludedVolumeSeller('OFICINA - GERENCIA')).toBe(true);
      expect(isExcludedVolumeSeller('GERENCIA LC')).toBe(true);
      expect(isExcludedVolumeSeller('OFICINA - AMERICO ALFONZO')).toBe(true);
      expect(isValidVolumeSeller('OFICINA')).toBe(false);
    });

    it('debe reconocer como válidos los 25 registros comerciales activos', () => {
      OFFICIAL_SELLERS_LIST.forEach((seller) => {
        expect(isValidVolumeSeller(seller)).toBe(true);
        expect(isExcludedVolumeSeller(seller)).toBe(false);
      });
    });

    it('debe sincronizar exactamente los 2,676 clientes activos de Maestra Octubre 2026 (2,559 FDV + 117 Food Service) incluyendo Angel Navarro, Mariangel Gonzalez y Victor Campos', () => {
      expect(CARTERA_CLIENTES.length).toBe(2676);
      expect(ENRICHED_CLIENTS.length).toBeGreaterThanOrEqual(2676);

      const countBySeller = new Map<string, number>();
      CARTERA_CLIENTES.forEach((c) => {
        countBySeller.set(c.vendedor, (countBySeller.get(c.vendedor) || 0) + 1);
      });

      expect(countBySeller.get('ALI PEREZ')).toBeUndefined();
      expect(countBySeller.get('ANGEL NAVARRO')).toBe(37);
      expect(countBySeller.get('MARIANGEL GONZALEZ')).toBe(67);
      expect(countBySeller.get('VICTOR CAMPOS')).toBe(81);
      expect(countBySeller.get('MIKELANGELO DIAZ')).toBe(98);
      expect(countBySeller.get('EDUARDO PIÑA')).toBe(185);
      expect(countBySeller.get('ELISA SOLER')).toBe(166);
      expect(countBySeller.get('J PABLO ARAUJO')).toBe(164);
      expect(countBySeller.get('MARYERY GARCIA')).toBe(162);
      expect(countBySeller.get('SARAH REYES')).toBe(148);
      expect(countBySeller.get('JOSE G. GONZALEZ')).toBe(147);
      expect(countBySeller.get('OSCAR ORTIZ')).toBe(136);
      expect(countBySeller.get('MARIA BRICEÑO')).toBe(130);
      expect(countBySeller.get('JUAN HERNANDEZ')).toBe(123);
      expect(countBySeller.get('CARLOS FUENMAYOR')).toBe(114);
      expect(countBySeller.get('LEONARDO RIOS')).toBe(101);
      expect(countBySeller.get('YOLEIDA LUGO')).toBe(101);
      expect(countBySeller.get('ANGELICA MORENO')).toBe(95);
      expect(countBySeller.get('ADEL JARABA')).toBe(93);
      expect(countBySeller.get('PEDRO ABREU')).toBe(80);
      expect(countBySeller.get('OSWALDO CHURION')).toBe(75);
      expect(countBySeller.get('HERNAN PAZ')).toBe(70);
      expect(countBySeller.get('J PABLO ARAUJO - CAB/OJE')).toBe(57);
      expect(countBySeller.get('LUIS GUANIPA')).toBe(55);
      expect(countBySeller.get('MARIANA CHACIN')).toBe(38);
      expect(countBySeller.get('SAIRU VALLES')).toBe(36);
      // Rutas especializadas de Food Service (117 clientes activos)
      expect(countBySeller.get('FOOD SERVICE SENIOR - JUAN HERNANDEZ')).toBe(58);
      expect(countBySeller.get('FOOD SERVICE SUR')).toBe(32);
      expect(countBySeller.get('JAIDER MEDINA - FOOD SERVICE NORTE')).toBe(27);
    });
  });

  // =========================================================================
  // 4. LÓGICA DE DISTRIBUCIÓN PARETO ABC (80-15-5)
  // =========================================================================
  describe('Lógica Matemática de Pareto ABC', () => {
    const calculateParetoDistribution = (items: { id: string; valor: number }[]) => {
      const sorted = [...items].sort((a, b) => b.valor - a.valor);
      const total = sorted.reduce((sum, item) => sum + item.valor, 0);

      if (total === 0) {
        return sorted.map((item, idx) => ({
          ...item,
          ranking: idx + 1,
          pctIndividual: 0,
          pctAcumulado: 0,
          clasificacion: 'C' as 'A' | 'B' | 'C'
        }));
      }

      let runningSum = 0;
      return sorted.map((item, idx) => {
        runningSum += item.valor;
        const pctIndividual = (item.valor / total) * 100;
        const pctAcumulado = (runningSum / total) * 100;
        let clasificacion: 'A' | 'B' | 'C' = 'C';
        if (pctAcumulado <= 80 || idx === 0) {
          clasificacion = 'A';
        } else if (pctAcumulado <= 95) {
          clasificacion = 'B';
        } else {
          clasificacion = 'C';
        }

        return {
          ...item,
          ranking: idx + 1,
          pctIndividual: Math.round(pctIndividual * 100) / 100,
          pctAcumulado: Math.round(pctAcumulado * 100) / 100,
          clasificacion
        };
      });
    };

    it('debe clasificar correctamente productos o clientes según la regla 80/20 de Pareto', () => {
      const mockData = [
        { id: '1', valor: 500 }, // 50% -> A
        { id: '2', valor: 250 }, // 25% (acum 75%) -> A
        { id: '3', valor: 150 }, // 15% (acum 90%) -> B
        { id: '4', valor: 70 },  // 7% (acum 97%) -> C
        { id: '5', valor: 30 }   // 3% (acum 100%) -> C
      ];

      const result = calculateParetoDistribution(mockData);

      expect(result[0].clasificacion).toBe('A');
      expect(result[0].pctAcumulado).toBe(50);

      expect(result[1].clasificacion).toBe('A');
      expect(result[1].pctAcumulado).toBe(75);

      expect(result[2].clasificacion).toBe('B');
      expect(result[2].pctAcumulado).toBe(90);

      expect(result[3].clasificacion).toBe('C');
      expect(result[4].clasificacion).toBe('C');
      expect(result[4].pctAcumulado).toBe(100);
    });

    it('debe proteger contra división por cero cuando todos los valores son 0', () => {
      const zeroData = [
        { id: '1', valor: 0 },
        { id: '2', valor: 0 }
      ];

      const result = calculateParetoDistribution(zeroData);
      expect(result[0].pctIndividual).toBe(0);
      expect(result[0].pctAcumulado).toBe(0);
      expect(Number.isNaN(result[0].pctIndividual)).toBe(false);
    });

    it('debe manejar un array vacío sin lanzar excepciones', () => {
      const result = calculateParetoDistribution([]);
      expect(result).toEqual([]);
    });
  });
});
