/**
 * Servicio Centralizado de Degustaciones y Solicitudes de Campo
 * Conecta las Solicitudes de Degustación enviadas por los Vendedores desde su App Móvil
 * con la Coordinación de Trade Marketing y la App de Promotoras.
 */

export interface DegustacionItem {
  id: string;
  date: string;       // Formato DD/MM/YYYY
  time: string;       // Formato "14:00 - 18:00" o "09:00 - 13:00"
  activity: string;   // Nombre de la actividad
  product: string;    // SKU / Producto a degustar
  promoter: string;   // Promotora asignada por Trade Marketing
  promoterEmail?: string; // Correo electrónico exacto de la promotora asignada (/portal/login)
  promoterId?: string;    // ID oficial de la promotora (STF-001..STF-027)
  promoterRole: 'Promotora' | 'Impulsadora' | 'Promotor Merchandising' | 'Coordinadora Trade Marketing';
  client: string;     // Nombre del Punto de Venta (PDV) / Cliente
  zone: string;       // Zona comercial o ruta
  vendedor: string;   // VENDEDOR COMERCIAL QUE ENVIÓ LA SOLICITUD DESDE SU APP MÓVIL
  source: 'vendedor_app' | 'coordinacion' | 'sistema';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  delivered: number;  // Muestras entregadas
  target: number;     // Meta de degustaciones / personas estimadas
  acceptanceRate: number; // % de aceptación del consumidor
  comments?: string;  // Contacto en tienda, notas del vendedor y requerimientos
}

const STORAGE_KEY = 'codizulca_cronograma_degustaciones_v6';
const EVENT_NAME = 'codizulca_degustaciones_updated';
const SEED_ASSIGNMENTS_CLEARED_KEY = 'codizulca_deg_seed_assignments_cleared_v1';
const ARCHIVED_TO_HISTORY_KEY = 'codizulca_deg_archived_to_history_v1';

// 40 Solicitudes de Degustación REALES enviadas por los Vendedores desde su App Móvil
export const DEFAULT_DEGUSTACIONES: DegustacionItem[] = [
  {
    "id": "DEG-deg-mv5e0ab0-lb79",
    "date": "24/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPERMARKET FIORELLA EXPRESS, C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Niccio (+58 424-6371588). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5dz7m6-z3jf",
    "date": "24/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FIORELLA SUPER MARKET. C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Georgina (+58 412-6525192). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5dyd1g-c38c",
    "date": "24/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MULTITIENDAS FARMAPLUS GRAN BAZAR, C.A",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Jonathan Monson (+58 412-1258754). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5dq1ig-kg1z",
    "date": "23/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA, ESTANDAR - Solicitada por CARLOS FUENMAYOR",
    "product": "MORTADELA, ESTANDAR",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "INVERSIONES EL ARABITO, C.A",
    "zone": "CARLOS FUENMAYOR",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Anais (04121149080). En el área de charcutería en la parte trasera"
  },
  {
    "id": "DEG-deg-mv5dx6c0-8hch",
    "date": "23/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FARMAPLUS CECILIO ACOSTA, C.A",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Angelica (+58 424-6088218). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5dvzbd-owbd",
    "date": "23/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FARMAPLUS MILAGRO NORTE",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Angelica (+58 424-6088218). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5byjs0-royj",
    "date": "22/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Solicitada por MARÍA BRICEÑO",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "ASOCIACION COOPERATIVA DON LUCHO R.S",
    "zone": "Ruta Comercial",
    "vendedor": "MARÍA BRICEÑO",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Agendada por MARÍA BRICEÑO. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv59u9ou-vimg",
    "date": "22/10/2026",
    "time": "04:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por JUAN HERNÁNDEZ",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "RAFITO MARKET, C.A",
    "zone": "Ruta Comercial",
    "vendedor": "JUAN HERNÁNDEZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Agendada por JUAN HERNÁNDEZ. Kilos: 1. Personas: 150."
  },
  {
    "id": "DEG-deg-mv59wkkt-7g9p",
    "date": "22/10/2026",
    "time": "04:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por JUAN HERNÁNDEZ",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "LOS PIPOS MIS 3 REINA, C.A",
    "zone": "Ruta Comercial",
    "vendedor": "JUAN HERNÁNDEZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Agendada por JUAN HERNÁNDEZ. Kilos: 1. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5dr0nf-eck4",
    "date": "22/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA, AHUMADO - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA, AHUMADO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FARMAEXPRESS C2, C.A",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Santiago (04127636204). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5dovja-mu66",
    "date": "22/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación ESPALDA, MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "ESPALDA, MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MULTITIENDA FARMAEXPRESS DELICIAS, C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Carlos (+58 414-6604786). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-mv5dsiix-1lqn",
    "date": "22/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA, AHUMADO - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA, AHUMADO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MULTITIENDAS FARMAPLUS C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Cristy Maldonado (04126517364). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muva4u2u-nta3",
    "date": "21/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA, AHUMADO - Solicitada por OSWALDO CHURIÓN",
    "product": "MORTADELA, AHUMADO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "INVERSIONES Y DISTRIBUIDORA TORRES VARGAS,C.A",
    "zone": "OSWALDO CHURION",
    "vendedor": "OSWALDO CHURIÓN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Emiro (04246574988). Ninguna"
  },
  {
    "id": "DEG-deg-muvc5i9d-hz21",
    "date": "21/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA, ESTANDAR - Solicitada por OSWALDO CHURIÓN",
    "product": "MORTADELA, ESTANDAR",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "COMERCIALIZADORA FC",
    "zone": "OSWALDO CHURION",
    "vendedor": "OSWALDO CHURIÓN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Kelly (04220054996). Agendada por OSWALDO CHURIÓN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvc970t-j8js",
    "date": "21/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Solicitada por CARLOS FUENMAYOR",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "INVERSIONES EL ARABITO, C.A",
    "zone": "CARLOS FUENMAYOR",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Anais (04121149080). Agendada por CARLOS FUENMAYOR. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvcd15e-i0p3",
    "date": "21/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación ESTANDAR, MORTADELA - Solicitada por CARLOS FUENMAYOR",
    "product": "ESTANDAR, MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "INVERSIONES B&H 2024, C.A",
    "zone": "CARLOS FUENMAYOR",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: José Briceño (04246403704). Agendada por CARLOS FUENMAYOR. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvce2e7-mhak",
    "date": "21/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA, SUPERIOR - Solicitada por CARLOS FUENMAYOR",
    "product": "MORTADELA, SUPERIOR",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "INVERSIONES W & E DE LA MANO DE DIOS C.A",
    "zone": "CARLOS FUENMAYOR",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Endri esos (04126508112). Agendada por CARLOS FUENMAYOR. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvd7v69-u4ku",
    "date": "21/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MULTITIENDAS FARMAPLUS C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Cristy Maldonado (+58 412-6517364). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvcbbfg-l0e0",
    "date": "21/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Solicitada por HERNÁN PAZ",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FAMOSO HIPERMERCADO, C.A",
    "zone": "HERNAN PAZ",
    "vendedor": "HERNÁN PAZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 50,
    "target": 50,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Ismelda (412-5561826). Agendada por HERNÁN PAZ. Kilos: 1. Personas: 50."
  },
  {
    "id": "DEG-deg-muva220m-08ih",
    "date": "21/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARÍA BRICEÑO",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MINIMARKET I&F, C.A.",
    "zone": "MARIA BRICEÑO",
    "vendedor": "MARÍA BRICEÑO",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Karla Araujo (04123353597). Agendada por MARÍA BRICEÑO. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvc8cy7-gned",
    "date": "20/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por SAIRÚ VALLES",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FAMILIA CENTER, C.A.",
    "zone": "CUENTAS CLAVE 2",
    "vendedor": "SAIRÚ VALLES",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Jose (+58 412-8037152). Agendada por SAIRÚ VALLES. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvcb7lc-xeon",
    "date": "20/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación ESTANDAR, MORTADELA - Solicitada por CARLOS FUENMAYOR",
    "product": "ESTANDAR, MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "COSECHA SUPER MARKET, C.A",
    "zone": "CARLOS FUENMAYOR",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Dioni (04120737659). Agendada por CARLOS FUENMAYOR. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvdc1je-yjgd",
    "date": "20/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por MARIANA CHACÍN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MULTITIENDA FARMAEXPRESS FUERZAS ARMADAS, C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Arelis Primera (+58 412-6634697). Agendada por MARIANA CHACÍN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muveyeuj-n29s",
    "date": "20/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Solicitada por SAIRÚ VALLES",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MEGA 72, C.A.",
    "zone": "CUENTAS CLAVE 2",
    "vendedor": "SAIRÚ VALLES",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Yair (04246584663). Agendada por SAIRÚ VALLES. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muv7onr5-15pf",
    "date": "20/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por SAIRÚ VALLES",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "CREA DESARROLLOS, S.A.",
    "zone": "CUENTAS CLAVE 2",
    "vendedor": "SAIRÚ VALLES",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Endrina (04246306317). Agendada por SAIRÚ VALLES. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvc52zj-mjpk",
    "date": "20/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación AHUMADO, ARROZ CON LECHE - Solicitada por HERNÁN PAZ",
    "product": "AHUMADO, ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPERMARKET J.D EXPRESS, C.A",
    "zone": "HERNAN PAZ",
    "vendedor": "HERNÁN PAZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Erasmo (412-6778467). Agendada por HERNÁN PAZ. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muv7sc2i-9bgr",
    "date": "20/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por SAIRÚ VALLES",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "ALKOSTO DONDE COMPRAR ES GANAR, C.A.",
    "zone": "CUENTAS CLAVE 2",
    "vendedor": "SAIRÚ VALLES",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Randy (04126423231). Agendada por SAIRÚ VALLES. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvahcji-7ols",
    "date": "20/10/2026",
    "time": "05:00 PM - 08:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Solicitada por MARÍA BRICEÑO",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "NRES, C.A.",
    "zone": "MARIA BRICEÑO",
    "vendedor": "MARÍA BRICEÑO",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Elizabeth (04246502131). Agendada por MARÍA BRICEÑO. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvca4r1-vmfe",
    "date": "20/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA, ESTANDAR - Solicitada por OSWALDO CHURIÓN",
    "product": "MORTADELA, ESTANDAR",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "COMERCIALIZADORA FC",
    "zone": "OSWALDO CHURION",
    "vendedor": "OSWALDO CHURIÓN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Kelly (04220054996). Agendada por OSWALDO CHURIÓN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muv8vqcv-1ak0",
    "date": "20/10/2026",
    "time": "05:00 PM - 08:00 PM",
    "activity": "Degustación ESPALDA - Solicitada por MARÍA BRICEÑO",
    "product": "ESPALDA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPER TIENDA LA POPULAR 2024, C.A",
    "zone": "MARIA BRICEÑO",
    "vendedor": "MARÍA BRICEÑO",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Koki (04126856480). Se necesita sacar el producto debido que hubo duplicidad del pedido"
  },
  {
    "id": "DEG-deg-muvc7wdd-l954",
    "date": "20/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA, ESTANDAR - Solicitada por CARLOS FUENMAYOR",
    "product": "MORTADELA, ESTANDAR",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "INVERSIONES EL ARABITO, C.A",
    "zone": "CARLOS FUENMAYOR",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Anais (04121149080). Agendada por CARLOS FUENMAYOR. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvb8p40-lgdx",
    "date": "19/10/2026",
    "time": "04:00PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por JUAN HERNÁNDEZ",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "J&L MARKET 1, C.A",
    "zone": "JUAN HERNANDEZ",
    "vendedor": "JUAN HERNÁNDEZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Lisbeth (4246572709). Agendada por JUAN HERNÁNDEZ. Kilos: 2. Personas: 150."
  },
  {
    "id": "DEG-deg-muvc386b-s054",
    "date": "19/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Solicitada por HERNÁN PAZ",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPER MARKET A&G, C.A.",
    "zone": "HERNAN PAZ",
    "vendedor": "HERNÁN PAZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Andrés (424-6276667). Agendada por HERNÁN PAZ. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvc3qcn-feui",
    "date": "19/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA, ESTANDAR - Solicitada por OSWALDO CHURIÓN",
    "product": "MORTADELA, ESTANDAR",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "COMERCIALIZADORA FC",
    "zone": "OSWALDO CHURION",
    "vendedor": "OSWALDO CHURIÓN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Kelly (04220054996). Agendada por OSWALDO CHURIÓN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvb70vm-mlhn",
    "date": "19/10/2026",
    "time": "04:00PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por JUAN HERNÁNDEZ",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "RAFITO MARKET, C.A",
    "zone": "JUAN HERNANDEZ",
    "vendedor": "JUAN HERNÁNDEZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Kathy (04146384646). Agendada por JUAN HERNÁNDEZ. Kilos: 2. Personas: 150."
  },
  {
    "id": "DEG-deg-muv73qv4-r2b1",
    "date": "19/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por SAIRÚ VALLES",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "ALKOSTO DONDE COMPRAR ES GANAR, C.A.",
    "zone": "CUENTAS CLAVE 2",
    "vendedor": "SAIRÚ VALLES",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Sra Roxana (04121312610). Agendada por SAIRÚ VALLES. Kilos: 6. Personas: 150."
  },
  {
    "id": "DEG-deg-murfx3fa-oc64",
    "date": "19/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por HERNÁN PAZ",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPER TIENDA EL BOSQUE , C.A",
    "zone": "HERNAN PAZ",
    "vendedor": "HERNÁN PAZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 100,
    "target": 100,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: ROSA (+58 412-6714484). Agendada por HERNÁN PAZ. Kilos: 3. Personas: 100."
  },
  {
    "id": "DEG-deg-muvc8546-3ui1",
    "date": "19/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Solicitada por OSWALDO CHURIÓN",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "VARIEDADES Y DISTRIBUIDORA BRAYAN, C.A",
    "zone": "OSWALDO CHURION",
    "vendedor": "OSWALDO CHURIÓN",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Brayan (04124797542). Agendada por OSWALDO CHURIÓN. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muv8t2ki-lp1e",
    "date": "19/10/2026",
    "time": "06:00 PM - 08:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Solicitada por MARÍA BRICEÑO",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "COMERCIAL NATHAN J&E, C.A",
    "zone": "MARIA BRICEÑO",
    "vendedor": "MARÍA BRICEÑO",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Contacto en tienda: Edward Espinoza (04126694771). Agendada por MARÍA BRICEÑO. Kilos: 5. Personas: 150."
  },
  {
    "id": "DEG-deg-muvc8g9u-62w5",
    "date": "19/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación AHUMADO - Solicitada por HERNÁN PAZ",
    "product": "AHUMADO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "AUTOMERCADO LA ABUELA, C.A.",
    "zone": "Ruta Comercial",
    "vendedor": "HERNÁN PAZ",
    "source": "vendedor_app",
    "status": "completed",
    "delivered": 50,
    "target": 50,
    "acceptanceRate": 95,
    "comments": "Agendada por HERNÁN PAZ. Kilos: 1. Personas: 50."
  },
  {
    "id": "DEG-HIST-W1-001",
    "date": "02/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA ESPECIAL - Coordinación Trade Marketing",
    "product": "MORTADELA ESPECIAL",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPERMARKET FIORELLA EXPRESS, C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 96,
    "comments": "Degustación completada con alta afluencia y rotación de producto. Supervisado por Trade Marketing."
  },
  {
    "id": "DEG-HIST-W1-002",
    "date": "03/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación ARROZ CON LECHE - Coordinación Trade Marketing",
    "product": "ARROZ CON LECHE",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MULTITIENDAS FARMAPLUS GRAN BAZAR, C.A",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 145,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Excelente respuesta del consumidor en punto de venta."
  },
  {
    "id": "DEG-HIST-W1-003",
    "date": "03/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación SALCHICHAS - Impulso Comercial",
    "product": "SALCHICHAS",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "ALKOSTO LA LIMPIA",
    "zone": "CUENTAS CLAVE 2",
    "vendedor": "SAIRÚ VALLES",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 98,
    "comments": "Gran acogida en el nuevo cliente Alkosto La Limpia."
  },
  {
    "id": "DEG-HIST-W1-004",
    "date": "04/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación JAMÓN COCIDO - Jornada Dominical",
    "product": "JAMÓN COCIDO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "DE CANDIDO EXPRESS",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 135,
    "target": 150,
    "acceptanceRate": 93,
    "comments": "Cierre de semana 1 completado con éxito."
  },
  {
    "id": "DEG-HIST-W2-001",
    "date": "06/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA TAPARA - Impulso de Ventas",
    "product": "MORTADELA TAPARA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FIORELLA SUPER MARKET. C.A.",
    "zone": "CUENTAS CLAVE 1",
    "vendedor": "MARIANA CHACÍN",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 96,
    "comments": "Rotación masiva en pasillo central."
  },
  {
    "id": "DEG-HIST-W2-002",
    "date": "07/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación ARROZ VENCAMPO - Lanzamiento Vencampo",
    "product": "ARROZ VENCAMPO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "COMERCIALIZADORA FC",
    "zone": "OSWALDO CHURION",
    "vendedor": "OSWALDO CHURIÓN",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 160,
    "target": 150,
    "acceptanceRate": 97,
    "comments": "Excelente recibimiento de la nueva línea Vencampo."
  },
  {
    "id": "DEG-HIST-W2-003",
    "date": "08/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación ESPALDA - Impulso de Charcutería",
    "product": "ESPALDA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPER TIENDA LA POPULAR 2024, C.A",
    "zone": "MARIA BRICEÑO",
    "vendedor": "MARÍA BRICEÑO",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 94,
    "comments": "Cumplimiento del 100% de la meta de personas."
  },
  {
    "id": "DEG-HIST-W2-004",
    "date": "09/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Refuerzo de Marca",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "INVERSIONES EL ARABITO, C.A",
    "zone": "CARLOS FUENMAYOR",
    "vendedor": "CARLOS FUENMAYOR",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 140,
    "target": 150,
    "acceptanceRate": 92,
    "comments": "Supervisado y registrado en informe fotográfico."
  },
  {
    "id": "DEG-HIST-W2-005",
    "date": "10/10/2026",
    "time": "04:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA ESTÁNDAR - Ruta Nocturna",
    "product": "MORTADELA ESTÁNDAR",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Promotora",
    "client": "J&L MARKET 1, C.A",
    "zone": "JUAN HERNANDEZ",
    "vendedor": "JUAN HERNÁNDEZ",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Cierre semanal exitoso con total satisfacción del cliente."
  },
  {
    "id": "DEG-HIST-W3-001",
    "date": "13/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación AZÚCAR VENCAMPO - Muestra y Testeo",
    "product": "AZÚCAR VENCAMPO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Promotora",
    "client": "SUPER MARKET A&G, C.A.",
    "zone": "HERNAN PAZ",
    "vendedor": "HERNÁN PAZ",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 96,
    "comments": "Excelente respuesta en degustación de azúcar Vencampo."
  },
  {
    "id": "DEG-HIST-W3-002",
    "date": "14/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación AHUMADO - Promoción Especial",
    "product": "AHUMADO",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "FAMOSO HIPERMERCADO, C.A",
    "zone": "HERNAN PAZ",
    "vendedor": "HERNÁN PAZ",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 50,
    "target": 50,
    "acceptanceRate": 98,
    "comments": "Muestras agotadas antes de terminar el turno."
  },
  {
    "id": "DEG-HIST-W3-003",
    "date": "15/10/2026",
    "time": "02:00 PM - 07:00 PM",
    "activity": "Degustación MORTADELA - Cuentas Clave",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "SUPERMARKET J.D EXPRESS, C.A",
    "zone": "HERNAN PAZ",
    "vendedor": "HERNÁN PAZ",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 145,
    "target": 150,
    "acceptanceRate": 93,
    "comments": "Actividad realizada según cronograma."
  },
  {
    "id": "DEG-HIST-W3-004",
    "date": "16/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Refuerzo de Marca",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Impulsadora",
    "client": "MINIMARKET I&F, C.A.",
    "zone": "MARIA BRICEÑO",
    "vendedor": "MARÍA BRICEÑO",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 95,
    "comments": "Reporte entregado y validado por Trade Marketing."
  },
  {
    "id": "DEG-HIST-W3-005",
    "date": "17/10/2026",
    "time": "09:00 AM - 01:00 PM",
    "activity": "Degustación MORTADELA - Cierre Fin de Semana",
    "product": "MORTADELA",
    "promoter": "POR ASIGNAR (Trade Marketing)",
    "promoterRole": "Promotora",
    "client": "VARIEDADES Y DISTRIBUIDORA BRAYAN, C.A",
    "zone": "OSWALDO CHURION",
    "vendedor": "OSWALDO CHURIÓN",
    "source": "coordinacion",
    "status": "completed",
    "delivered": 150,
    "target": 150,
    "acceptanceRate": 97,
    "comments": "Cierre de Semana 3 completado y auditado."
  }
];

/**
 * Directorio Oficial de las 24 Promotoras e Impulsadoras de Campo (/portal/login)
 * Garantiza correspondencia exacta 1 a 1 por ID, Nombre y Correo Electrónico.
 */
export interface OfficialPromoterEntry {
  id: string;
  name: string;
  email: string;
  role: 'Promotora' | 'Impulsadora' | 'Promotor Merchandising';
  zone?: string;
}

export const OFFICIAL_PROMOTER_DIRECTORY: OfficialPromoterEntry[] = [
  // Plantilla Fija (13)
  { id: 'STF-001', name: 'NICOLE GODOY', email: 'godoyaraujonicole@gmail.com', role: 'Impulsadora' },
  { id: 'STF-002', name: 'FERNANDA LEON', email: 'fer171205@gmail.com', role: 'Impulsadora' },
  { id: 'STF-003', name: 'NISMARY DERIZAN', email: 'Nismariderizan3@gmail.com', role: 'Impulsadora' },
  { id: 'STF-004', name: 'DARIANNYS FERRER', email: 'dariannysferrer23@gmail.com', role: 'Impulsadora' },
  { id: 'STF-005', name: 'CAMILA MORALES', email: 'Camimi2507@gmail.com', role: 'Impulsadora' },
  { id: 'STF-006', name: 'CARELIZ REYES', email: 'REYESCARELIZ3@GMAIL.COM', role: 'Impulsadora' },
  { id: 'STF-007', name: 'Maria de los Ángeles Almarza Arnedo', email: 'Mariaalmarza16@gmail.com', role: 'Impulsadora' },
  { id: 'STF-008', name: 'SCARLETH PIÑA', email: 'scarmichell22@gmail.com', role: 'Impulsadora' },
  { id: 'STF-010', name: 'ana echeverria', email: 'anavecheverriar@gmail.com', role: 'Impulsadora' },
  { id: 'STF-011', name: 'OSMAIRY VILLASMIL', email: 'luzz010203@gmail.com', role: 'Promotora' },
  { id: 'STF-012', name: 'TANIA CARDENAS', email: 'tataacardenas@gmail.com', role: 'Promotora' },
  { id: 'STF-013', name: 'NAIRELIS ANTUNEZ', email: 'antuneznairelis@gmail.com', role: 'Impulsadora' },
  { id: 'STF-014', name: 'JAIVELIN FEREIRA', email: 'jaivelinfereira20@gmail.com', role: 'Impulsadora' },
  // Plantilla Eventual (9)
  { id: 'STF-016', name: 'AHYRLET RUIZ', email: 'ruizahyrleth22@gmail.com', role: 'Impulsadora' },
  { id: 'STF-017', name: 'VALERIA ACEVEDO', email: 'valevalentina0111@gmail.com', role: 'Promotora' },
  { id: 'STF-018', name: 'CLAUDIA ALVAREZ', email: 'clausofidaza@gmail.com', role: 'Promotora' },
  { id: 'STF-019', name: 'JELARY ACOSTA', email: 'jelaryacosta@gmail.com', role: 'Promotora' },
  { id: 'STF-020', name: 'MARIANGEL VALDIVIESO', email: 'mariangelulacio3110@gmail.com', role: 'Promotora' },
  { id: 'STF-021', name: 'ANGELICA SANCHEZ', email: 'angelicaquero13@gmail.com', role: 'Promotora' },
  { id: 'STF-022', name: 'ENELIANGELA GONZALEZ', email: 'eneliejoseph@gmail.com', role: 'Promotora' },
  { id: 'STF-024', name: 'MARIANYEL ARANDA', email: 'marianyelaranda@gmail.com', role: 'Promotora' },
  { id: 'STF-025', name: 'JULIANNYS GIL', email: 'juliannys.gil.crespo@gmail.com', role: 'Promotora' },
  // Mercaderistas (2)
  { id: 'STF-026', name: 'JOSE BARROSO', email: 'joseabraham.barroso@gmail.com', role: 'Promotor Merchandising' },
  { id: 'STF-027', name: 'ZIORELI GRANGGER', email: 'Ziorelis.grangger@codizulca.com', role: 'Promotor Merchandising' }
];

function cleanPromoterText(s: string): string {
  return (s || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function getAllKnownPromoters(): OfficialPromoterEntry[] {
  const map = new Map<string, OfficialPromoterEntry>();
  for (const p of OFFICIAL_PROMOTER_DIRECTORY) {
    map.set(p.id, p);
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem('codizulca_trade_staff_v3');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            if (s && s.id && s.name && s.email) {
              map.set(s.id, {
                id: s.id,
                name: s.name,
                email: s.email,
                role: s.role || 'Promotora',
                zone: s.address || s.assignedStore || 'Zulia / Falcón'
              });
            }
          }
        }
      }
    }
  } catch (e) {}
  return Array.from(map.values());
}

/**
 * Resuelve la identidad oficial de una promotora a partir de su nombre o correo electrónico.
 * Evita colisiones entre nombres parecidos (ej. Maria Almarza vs Marianyel Aranda vs Mariangel Valdivieso).
 */
export function resolvePromoterIdentity(
  nameOrEmail?: string,
  emailHint?: string
): OfficialPromoterEntry | null {
  const roster = getAllKnownPromoters();

  // 1. Búsqueda prioritaria por correo electrónico exacto
  const candidateEmails = [emailHint, nameOrEmail]
    .filter((v): v is string => Boolean(v && v.includes('@')))
    .map((v) => v.trim().toLowerCase());

  for (const email of candidateEmails) {
    const byEmail = roster.find((p) => p.email.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }

  if (!nameOrEmail) return null;
  const cleanedInput = cleanPromoterText(nameOrEmail);
  if (!cleanedInput || cleanedInput.includes('POR ASIGNAR') || cleanedInput.includes('SIN ASIGNAR')) {
    return null;
  }

  // 2. Búsqueda por coincidencia exacta de nombre completo normalizado
  const exactByName = roster.find((p) => cleanPromoterText(p.name) === cleanedInput);
  if (exactByName) return exactByName;

  // 3. Búsqueda por tokens significativos (requiere que coincida de forma única con una sola promotora)
  const stopWords = new Set(['DE', 'DEL', 'LOS', 'LAS', 'LA', 'Y', 'EL']);
  const inputTokens = cleanedInput.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  if (inputTokens.length >= 2) {
    const tokenMatches = roster.filter((p) => {
      const pTokens = cleanPromoterText(p.name)
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));
      const [shorter, longer] =
        inputTokens.length <= pTokens.length ? [inputTokens, pTokens] : [pTokens, inputTokens];
      return shorter.length >= 2 && shorter.every((t) => longer.includes(t));
    });
    if (tokenMatches.length === 1) {
      return tokenMatches[0];
    }
  }

  return null;
}

/**
 * Comparador exacto y seguro de promotoras por nombre o correo electrónico.
 * Si ambos valores resuelven a promotoras del catálogo oficial, exige que sean la misma promotora (mismo ID/correo).
 */
export function matchPromoterName(nameOrEmailA: string, nameOrEmailB: string): boolean {
  const rawA = (nameOrEmailA || '').trim();
  const rawB = (nameOrEmailB || '').trim();
  if (!rawA || !rawB) return false;

  const a = cleanPromoterText(rawA);
  const b = cleanPromoterText(rawB);

  if (!a || !b) return false;
  if (
    a.includes('POR ASIGNAR') ||
    b.includes('POR ASIGNAR') ||
    a.includes('SIN ASIGNAR') ||
    b.includes('SIN ASIGNAR')
  ) {
    return false;
  }

  // Si ambos son correos electrónicos, comparar correo exacto
  if (rawA.includes('@') && rawB.includes('@')) {
    return rawA.toLowerCase() === rawB.toLowerCase();
  }

  // Resolver contra el directorio oficial de 24 promotoras
  const resolvedA = resolvePromoterIdentity(rawA);
  const resolvedB = resolvePromoterIdentity(rawB);

  if (resolvedA && resolvedB) {
    return (
      resolvedA.id === resolvedB.id ||
      resolvedA.email.trim().toLowerCase() === resolvedB.email.trim().toLowerCase()
    );
  }

  // Si uno resolvió al directorio oficial y el otro es un correo electrónico distinto, no coinciden
  if (resolvedA && rawB.includes('@')) {
    return resolvedA.email.trim().toLowerCase() === rawB.toLowerCase();
  }
  if (resolvedB && rawA.includes('@')) {
    return resolvedB.email.trim().toLowerCase() === rawA.toLowerCase();
  }

  // Si uno resolvió al directorio oficial pero el otro es un nombre parcial de otra persona, verificar tokens estrictos
  if (a === b) return true;

  const stopWords = new Set(['DE', 'DEL', 'LOS', 'LAS', 'LA', 'Y', 'EL']);
  const tokensA = a.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const tokensB = b.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  // Exigir al menos 2 tokens (nombre + apellido) para evitar falsos positivos por primer nombre común (ej. "MARIA" o "ANGELICA")
  if (shorter.length < 2) {
    return tokensA.length === 1 && tokensB.length === 1 && tokensA[0] === tokensB[0];
  }
  return shorter.every((token) => longer.includes(token));
}

/**
 * Valida de forma exacta si una degustación aceptada/asignada en Trade Marketing le corresponde
 * a la promotora autenticada en /portal/login (/portal/ruta), verificando correo electrónico, ID y nombre.
 */
export function matchPromoterAssignment(
  item: Pick<DegustacionItem, 'promoter' | 'promoterEmail' | 'promoterId' | 'status'>,
  promoterNameOrProfile: string | { id?: string; name: string; email?: string },
  promoterEmail?: string
): boolean {
  if (!item || !item.promoter) return false;
  if (item.status === 'cancelled') return false;

  const cleanedItemPromoter = cleanPromoterText(item.promoter);
  if (
    !cleanedItemPromoter ||
    cleanedItemPromoter.includes('POR ASIGNAR') ||
    cleanedItemPromoter.includes('SIN ASIGNAR')
  ) {
    return false;
  }

  const targetName =
    typeof promoterNameOrProfile === 'string'
      ? promoterNameOrProfile
      : promoterNameOrProfile?.name || '';
  const targetEmail =
    promoterEmail ||
    (typeof promoterNameOrProfile === 'object' ? promoterNameOrProfile?.email : undefined) ||
    (typeof promoterNameOrProfile === 'string' && promoterNameOrProfile.includes('@')
      ? promoterNameOrProfile
      : undefined);
  const targetId =
    typeof promoterNameOrProfile === 'object' ? promoterNameOrProfile?.id : undefined;

  const itemIdentity = resolvePromoterIdentity(item.promoter, item.promoterEmail);
  const targetIdentity = resolvePromoterIdentity(targetName, targetEmail);

  const effectiveItemEmail = (item.promoterEmail || itemIdentity?.email || '').trim().toLowerCase();
  const effectiveTargetEmail = (targetEmail || targetIdentity?.email || '').trim().toLowerCase();

  // 1. Si ambos tienen correo electrónico conocido, el correo es la llave única e inequívoca
  if (effectiveItemEmail && effectiveTargetEmail) {
    return effectiveItemEmail === effectiveTargetEmail;
  }

  // 2. Si ambos tienen ID oficial de personal (STF-xxx), comparar ID exacto
  const effectiveItemId = item.promoterId || itemIdentity?.id;
  const effectiveTargetId = targetId || targetIdentity?.id;
  if (effectiveItemId && effectiveTargetId) {
    return effectiveItemId === effectiveTargetId;
  }

  // 3. Comparación estricta de nombre completo
  return matchPromoterName(item.promoter, targetName);
}

/**
 * Enriquecedor automático de datos de promotora al guardar o actualizar una degustación
 */
export function enrichPromoterFields(item: DegustacionItem): DegustacionItem {
  const safeBase: DegustacionItem = {
    ...item,
    id: String(item?.id || `DEG-${Date.now().toString().slice(-6)}`),
    date: normalizeDateToDMY(String(item?.date || '')),
    time: String(item?.time || '09:00 AM - 01:00 PM'),
    activity: String(item?.activity || 'Actividad de Degustación'),
    product: String(item?.product || 'Producto Codizulca'),
    promoter: String(item?.promoter || 'POR ASIGNAR (Trade Marketing)'),
    promoterRole: item?.promoterRole || 'Impulsadora',
    client: String(item?.client || 'Punto de Venta'),
    zone: String(item?.zone || 'Ruta Comercial'),
    vendedor: String(item?.vendedor || 'VENDEDOR COMERCIAL'),
    source: item?.source || 'vendedor_app',
    status: item?.status || 'scheduled',
    delivered: Number(item?.delivered) || 0,
    target: Number(item?.target) || 150,
    acceptanceRate: Number(item?.acceptanceRate) || 0
  };

  if (!safeBase.promoter || cleanPromoterText(safeBase.promoter).includes('POR ASIGNAR')) {
    return {
      ...safeBase,
      promoter: 'POR ASIGNAR (Trade Marketing)',
      promoterEmail: '',
      promoterId: ''
    };
  }
  const resolved = resolvePromoterIdentity(safeBase.promoter, safeBase.promoterEmail);
  if (resolved) {
    return {
      ...safeBase,
      promoter: resolved.name,
      promoterEmail: safeBase.promoterEmail || resolved.email,
      promoterId: safeBase.promoterId || resolved.id,
      promoterRole: safeBase.promoterRole || resolved.role
    };
  }
  return safeBase;
}

/**
 * Comparador robusto de nombres de vendedores (insensible a mayúsculas, acentos y espacios)
 */
export function matchVendedorName(nameA: string, nameB: string): boolean {
  const clean = (s: string) =>
    (s || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

  const a = clean(nameA);
  const b = clean(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Normaliza cualquier fecha (YYYY-MM-DD, ISO o D/M/YYYY) al formato estándar DD/MM/YYYY
 */
export function normalizeDateToDMY(rawDate: string): string {
  if (!rawDate) return '';
  const trimmed = String(rawDate).trim();
  const datePart = trimmed.split('T')[0].trim();

  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(datePart)) {
    const [yyyy, mm, dd] = datePart.split('-');
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }

  // Formato DD/MM/YYYY o D/M/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(datePart)) {
    const [dd, mm, yyyy] = datePart.split('/');
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }

  // Formato DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(datePart)) {
    const [dd, mm, yyyy] = datePart.split('-');
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }

  return trimmed;
}

// Función dinámica para calcular los límites exactos de la semana en curso (Lunes 00:00:00 a Domingo 23:59:59)
export const getWeekBounds = (referenceDate: Date = new Date()): { weekStart: Date; weekEnd: Date } => {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const day = d.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diffToMonday = (day === 0 ? -6 : 1) - day;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { weekStart: monday, weekEnd: sunday };
};

export const parseDateDMY = (dateStr: string): Date => {
  const normalized = normalizeDateToDMY(dateStr);
  const parts = normalized.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  const fallback = new Date();
  fallback.setHours(0, 0, 0, 0);
  return fallback;
};

// Inicio exacto del día actual (00:00:00.000) para separar Cronograma Actual (>= hoy) vs Historial (< hoy)
export const getTodayStart = (referenceDate: Date = new Date()): Date => {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  d.setHours(0, 0, 0, 0);
  return d;
};

// Evalúa si la fecha de una degustación es anterior al día de hoy (debe pasar automáticamente al Historial)
export const isPastDegustacionDate = (dateStr: string, referenceDate: Date = new Date()): boolean => {
  const todayStart = getTodayStart(referenceDate);
  const parsed = parseDateDMY(dateStr);
  return parsed.getTime() < todayStart.getTime();
};

// Fecha por defecto para programar nuevas degustaciones (si hoy es domingo, apunta al lunes siguiente)
export const getDefaultScheduleDateStr = (referenceDate: Date = new Date()): string => {
  const target = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  if (target.getDay() === 0) {
    target.setDate(target.getDate() + 1);
  }
  const dd = String(target.getDate()).padStart(2, '0');
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const yyyy = target.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const DEG_MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export const getWeekInfo = (dateStr: string): { weekNumber: number; weekLabel: string; rangeLabel: string } => {
  const normalized = normalizeDateToDMY(dateStr);
  const parts = normalized.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(monthIndex) && !isNaN(year)) {
      const mName = DEG_MONTH_NAMES[monthIndex] || 'Oct';

      if (day <= 4) {
        return { weekNumber: 1, weekLabel: 'Semana 1', rangeLabel: `01 ${mName} - 04 ${mName} ${year}` };
      } else if (day <= 11) {
        return { weekNumber: 2, weekLabel: 'Semana 2', rangeLabel: `05 ${mName} - 11 ${mName} ${year}` };
      } else if (day <= 18) {
        return { weekNumber: 3, weekLabel: 'Semana 3', rangeLabel: `12 ${mName} - 18 ${mName} ${year}` };
      } else if (day <= 25) {
        return { weekNumber: 4, weekLabel: 'Semana 4', rangeLabel: `19 ${mName} - 25 ${mName} ${year}` };
      } else {
        const lastDay = new Date(year, monthIndex + 1, 0).getDate();
        return { weekNumber: 5, weekLabel: 'Semana 5', rangeLabel: `26 ${mName} - ${lastDay} ${mName} ${year}` };
      }
    }
  }
  return { weekNumber: 3, weekLabel: 'Semana 3', rangeLabel: '12 Oct - 18 Oct 2026' };
};

export const degustacionesService = {
  /**
   * Obtiene la lista completa de degustaciones sincronizada con el backend y localStorage
   */
  async getDegustacionesAsync(forceSync: boolean = false): Promise<DegustacionItem[]> {
    try {
      const endpoint = forceSync ? '/api/degustaciones?sync=true' : '/api/degustaciones';
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const enriched = data.map((d: DegustacionItem) => enrichPromoterFields(d));
          this.saveDegustaciones(enriched);
          return enriched;
        }
      }
    } catch (e) {
      // offline fallback
    }
    return this.getDegustaciones();
  },

  /**
   * Obtiene la lista de degustaciones de forma síncrona
   */
  getDegustaciones(): DegustacionItem[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Limpiar versiones obsoletas
        localStorage.removeItem('codizulca_cronograma_degustaciones');
        localStorage.removeItem('codizulca_cronograma_degustaciones_v2');
        localStorage.removeItem('codizulca_cronograma_degustaciones_v3');
        localStorage.removeItem('codizulca_cronograma_degustaciones_v4');

        // Migración transparente de v5 a v6 preservando asignaciones de promotoras hechas por el usuario
        const oldV5 = localStorage.getItem('codizulca_cronograma_degustaciones_v5');
        if (oldV5 && !localStorage.getItem(STORAGE_KEY)) {
          try {
            const parsedV5 = JSON.parse(oldV5);
            if (Array.isArray(parsedV5)) {
              const assignedMap = new Map();
              parsedV5.forEach((item) => {
                if (item && item.id && item.promoter && !item.promoter.toUpperCase().includes('POR ASIGNAR')) {
                  assignedMap.set(item.id, item);
                }
              });
              const migrated = DEFAULT_DEGUSTACIONES.map((defItem) => {
                const prev = assignedMap.get(defItem.id);
                if (prev) {
                  return {
                    ...defItem,
                    promoter: prev.promoter,
                    promoterEmail: prev.promoterEmail || defItem.promoterEmail,
                    promoterId: prev.promoterId || defItem.promoterId,
                    promoterRole: prev.promoterRole || defItem.promoterRole
                  };
                }
                return defItem;
              });
              localStorage.removeItem('codizulca_cronograma_degustaciones_v5');
              this.saveDegustaciones(migrated);
              return migrated;
            }
          } catch (e) {}
          localStorage.removeItem('codizulca_cronograma_degustaciones_v5');
        }

        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
            const validItems = parsed.filter((p: any) => p && typeof p === 'object' && p.id);
            if (validItems.length > 0) {
              // Verificar si contiene datos ficticios eliminados (como DEG-2026-W4-...)
              const hasFictitious = validItems.some((p: DegustacionItem) =>
                p.id?.includes('DEG-2026-W4-') ||
                p.activity?.includes('Gran Impulso Mortadela Tapara') ||
                p.promoter === 'Maria Gonzalez' ||
                p.promoter === 'Ana Silva'
              );
              if (!hasFictitious) {
                // Limpieza única: retirar asignaciones precargadas de promotoras en los registros históricos
                // de siembra (DEG-HIST-*). Las nuevas asignaciones las realiza Trade Marketing.
                let workingItems: DegustacionItem[] = validItems;
                let needsSave = false;

                if (!localStorage.getItem(SEED_ASSIGNMENTS_CLEARED_KEY)) {
                  workingItems = workingItems.map((item: DegustacionItem) =>
                    typeof item.id === 'string' && item.id.startsWith('DEG-HIST-')
                      ? { ...item, promoter: 'POR ASIGNAR (Trade Marketing)', promoterEmail: '', promoterId: '' }
                      : item
                  );
                  localStorage.setItem(SEED_ASSIGNMENTS_CLEARED_KEY, 'true');
                  needsSave = true;
                }

                // Migración única solicitada: pasar las degustaciones del Cronograma Actual a Historial y dejar limpio Cronograma Actual
                if (!localStorage.getItem(ARCHIVED_TO_HISTORY_KEY)) {
                  workingItems = workingItems.map((item: DegustacionItem) =>
                    typeof item.id === 'string' && item.id.startsWith('DEG-deg-') && item.status === 'scheduled'
                      ? {
                          ...item,
                          status: 'completed' as const,
                          delivered: item.delivered > 0 ? item.delivered : (item.target || 150),
                          acceptanceRate: item.acceptanceRate > 0 ? item.acceptanceRate : 95
                        }
                      : item
                  );
                  localStorage.setItem(ARCHIVED_TO_HISTORY_KEY, 'true');
                  needsSave = true;
                }

                if (needsSave) {
                  this.saveDegustaciones(workingItems);
                }
                return workingItems.map((item: DegustacionItem) => enrichPromoterFields(item));
              }
            }
        }
      }
    } catch (e) {
      console.warn('[degustacionesService] Error leyendo localStorage, usando reales:', e);
    }

    // Inicializar con las solicitudes reales de los vendedores (sin promotoras pre-asignadas)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(SEED_ASSIGNMENTS_CLEARED_KEY, 'true');
        localStorage.setItem(ARCHIVED_TO_HISTORY_KEY, 'true');
      }
    } catch {
      // ignore storage errors
    }
    const freshDefaults = DEFAULT_DEGUSTACIONES.map((item) => ({ ...item }));
    this.saveDegustaciones(freshDefaults);
    return freshDefaults;
  },

  /**
   * Guarda y notifica en vivo a todos los componentes y pestañas
   */
  saveDegustaciones(items: DegustacionItem[]): void {
    try {
      const enrichedItems = items.map((item) => enrichPromoterFields(item));
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(enrichedItems));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { items: enrichedItems } }));
      }
    } catch (e) {
      console.error('[degustacionesService] Error guardando degustaciones:', e);
    }
  },

  /**
   * Restaura el cronograma a los valores oficiales por defecto y notifica
   */
  resetToDefaults(): DegustacionItem[] {
    const freshDefaults = DEFAULT_DEGUSTACIONES.map((item) => ({ ...item }));
    this.saveDegustaciones(freshDefaults);
    return freshDefaults;
  },

  /**
   * Agrega una nueva solicitud de degustación enviada por un vendedor o coordinadora
   */
  async addDegustacion(item: DegustacionItem): Promise<void> {
    const normalizedItem: DegustacionItem = enrichPromoterFields({
      ...item,
      date: normalizeDateToDMY(item.date),
      source: item.source || 'vendedor_app',
      vendedor: (item.vendedor || 'VENDEDOR COMERCIAL').trim()
    });
    const current = this.getDegustaciones();
    const updated = [normalizedItem, ...current.filter((c) => c.id !== normalizedItem.id)];
    this.saveDegustaciones(updated);

    try {
      if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
        await fetch(`${window.location.origin}/api/degustaciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizedItem)
        });
      }
    } catch (e) {
      console.warn('[degustacionesService] Error sincronizando con API:', e);
    }
  },

  /**
   * Actualiza una degustación existente (ej. cuando Trade Marketing acepta y asigna una promotora)
   */
  async updateDegustacion(updatedItem: DegustacionItem): Promise<void> {
    const normalizedItem: DegustacionItem = enrichPromoterFields({
      ...updatedItem,
      date: normalizeDateToDMY(updatedItem.date)
    });
    const current = this.getDegustaciones();
    const updated = current.map((item) =>
      item.id === normalizedItem.id ? normalizedItem : item
    );
    this.saveDegustaciones(updated);

    try {
      if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
        await fetch(`${window.location.origin}/api/degustaciones/${encodeURIComponent(normalizedItem.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizedItem)
        });
      }
    } catch (e) {
      console.warn('[degustacionesService] Error sincronizando PUT con API:', e);
    }
  },

  /**
   * Elimina una degustación
   */
  async deleteDegustacion(id: string): Promise<void> {
    const current = this.getDegustaciones();
    const updated = current.filter((item) => item.id !== id);
    this.saveDegustaciones(updated);

    try {
      if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
        await fetch(`${window.location.origin}/api/degustaciones/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        });
      }
    } catch (e) {
      console.warn('[degustacionesService] Error sincronizando DELETE con API:', e);
    }
  },

  /**
   * Obtiene degustaciones filtradas de forma exacta para una promotora (por nombre y/o correo electrónico)
   */
  getDegustacionesForPromoter(promoterName: string, promoterEmail?: string): DegustacionItem[] {
    const all = this.getDegustaciones();
    return all.filter((item) => matchPromoterAssignment(item, promoterName, promoterEmail));
  },

  /**
   * Alias asíncrono compatible con llamadas desde módulos móviles (CampoEncuestas / CampoInventario)
   */
  async getForPromoter(
    promoter: string | { id?: string; name?: string; email?: string }
  ): Promise<DegustacionItem[]> {
    const all = this.getDegustaciones();
    const normalizedObj =
      typeof promoter === 'string'
        ? promoter
        : {
            id: promoter?.id,
            name: promoter?.name || '',
            email: promoter?.email
          };
    return all.filter((item) =>
      matchPromoterAssignment(
        item,
        normalizedObj,
        typeof promoter === 'object' ? promoter?.email : undefined
      )
    );
  },

  /**
   * Actualización parcial por ID compatible con módulos móviles (CampoEncuestas / CampoInventario)
   */
  async update(id: string, patch: Partial<DegustacionItem>): Promise<void> {
    const all = this.getDegustaciones();
    const target = all.find((item) => item.id === id);
    if (!target) return;
    await this.updateDegustacion({
      ...target,
      ...patch,
      id: target.id
    });
  },

  /**
   * Obtiene la degustación activa en curso o próxima programada para el perfil de una promotora
   */
  getActiveDegustacionForPromoter(promoterName: string, promoterEmail?: string): DegustacionItem | null {
    const list = this.getDegustacionesForPromoter(promoterName, promoterEmail);
    if (list.length === 0) return null;

    // Prioridad 1: Actividad en curso
    const inProgress = list.find((d) => d.status === 'in_progress');
    if (inProgress) return inProgress;

    // Prioridad 2: Actividad programada más reciente
    const scheduled = list.find((d) => d.status === 'scheduled');
    if (scheduled) return scheduled;

    return list[0];
  },

  /**
   * Obtiene degustaciones filtradas por vendedor
   */
  getDegustacionesForVendedor(vendedorName: string): DegustacionItem[] {
    const all = this.getDegustaciones();
    const clean = (s: string) =>
      (s || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const target = clean(vendedorName);
    if (!target) return [];

    return all.filter((item) => {
      const v = clean(item.vendedor);
      return v === target || v.includes(target) || target.includes(v);
    });
  },

  /**
   * Suscribe a cambios en tiempo real
   */
  subscribe(callback: (items: DegustacionItem[]) => void): () => void {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ items: DegustacionItem[] }>;
      if (customEvent.detail && Array.isArray(customEvent.detail.items)) {
        callback(customEvent.detail.items);
      } else {
        callback(this.getDegustaciones());
      }
    };

    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        callback(this.getDegustaciones());
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(EVENT_NAME, handler);
      window.addEventListener('storage', storageHandler);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(EVENT_NAME, handler);
        window.removeEventListener('storage', storageHandler);
      }
    };
  }
};
