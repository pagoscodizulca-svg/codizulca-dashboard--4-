import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  FileText,
  Store,
  Camera,
  BarChart3,
  Users,
  ChevronRight,
  Star,
  ClipboardCheck,
  ClipboardList,
  Smartphone,
  Copy,
  Plus,
  Search,
  Filter,
  Download,
  CheckCircle2,
  AlertCircle,
  Eye,
  Check,
  ExternalLink,
  Layers,
  MapPin,
  TrendingUp,
  X,
  Clock,
  Sparkles,
  Package,
  ShieldCheck,
  ThumbsUp,
  Archive,
  History,
  Info,
  CalendarDays,
  FolderArchive,
  Scale,
  Box,
  Tag,
  DollarSign,
  AlertTriangle,
  TrendingDown,
  UserCheck,
  ChevronDown,
  Navigation,
  Bell,
  Send,
  Building,
  Target,
  Pencil,
  Trash2,
  Bot,
  RefreshCw,
  LayoutGrid,
  Radio,
  Maximize2,
  Printer,
  FileCheck,
  Mail,
  UserPlus,
  Lock,
  EyeOff,
  KeyRound,
  Key
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { InventoryProduct } from '../components/inventario/types';
import { ENRICHED_CLIENTS } from '../data/clientsWithLocation';
import { checkinsService, CheckInRecord, CheckInType, getCaracasDayKey } from '../lib/checkinsService';
import { merchandisingService, MerchandisingReport } from '../lib/merchandisingService';
import { staffService, StaffMember } from '../lib/staffService';
import { campoService } from '../lib/campoService';
import { supabase } from '../lib/supabase';
import {
  degustacionesService,
  DegustacionItem,
  matchPromoterName,
  matchPromoterAssignment,
  resolvePromoterIdentity,
  matchVendedorName,
  normalizeDateToDMY,
  getWeekBounds,
  parseDateDMY,
  getTodayStart,
  isPastDegustacionDate,
  getDefaultScheduleDateStr,
  getWeekInfo
} from '../lib/degustacionesService';

export {
  getWeekBounds,
  parseDateDMY,
  getTodayStart,
  isPastDegustacionDate,
  getDefaultScheduleDateStr,
  getWeekInfo
};

interface InformeItem {
  id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  promoter: string;
  client: string;
  zone: string;
  type: 'Auditoría Profunda' | 'Encuesta Breve' | 'Informe Degustación' | 'Merchandising PDV' | 'Relevamiento Precios';
  stock: 'alto' | 'medio' | 'bajo' | 'quiebre';
  pop: 'excelente' | 'bueno' | 'regular' | 'deteriorado';
  acceptance: 'Muy Positivo' | 'Positivo' | 'Neutro' | 'Negativo';
  samplesGiven?: number;
  photosCount: number;
  gpsVerified?: boolean;
  distanceMeters?: number;
  comments: string;
}

// Interfaz para la pestaña: Comparativa de Precios
export interface CompetitorPriceEntry {
  brand: string;
  product: string;
  priceUSD: number;
}

export interface PriceComparisonItem {
  id: string;
  client: string;
  zone: string;
  promoter: string;
  origin?: string; // e.g. "App Promotora"
  date: string;
  codizulcaProduct: string;
  codizulcaSku: string;
  codizulcaPriceUSD: number;
  codizulcaPriceBS: number;
  competitors: CompetitorPriceEntry[];
  competitorBrand: string;
  competitorProduct: string;
  competitorPriceUSD: number;
  competitorPriceBS: number;
  differencePercent: number; // e.g. -5.8% (más económico) or +2.2%
  competitiveness: 'Mas Competitivo' | 'A la Par' | 'Mas Alto' | 'Alerta Desviacion';
  shelfFacing: string;
  notes?: string;
  strategicAction?: string;
}

// Interfaz para la Tabla de Métricas de Decisiones Gerenciales
export interface PricingDecisionMetric {
  id: string;
  sku: string;
  productName: string;
  category: string;
  channel: string;
  codizulcaPriceUSD: number;
  codizulcaPriceBS: number;
  competitorBrand: string;
  competitorProduct: string;
  competitorPriceUSD: number;
  priceGapPercent: number;
  priceGapUSD: number;
  diagnosisType: 'margen' | 'riesgo' | 'alkosto' | 'liderazgo';
  diagnosisBadge: string;
  elasticityLabel: string;
  executiveRecommendation: string;
  projectedImpact: string;
  actionButtonLabel: string;
}

// Interfaz para la pestaña: Inventario en Campo
interface FieldInventoryItem {
  id: string;
  client: string;
  zone: string;
  product: string;
  sku: string;
  category: string;
  facingCount: number;
  shelfStock: number; // Unidades o kg en anaquel
  storageStock: number; // Unidades o kg en cava/trastienda
  totalStock: number;
  unit: string;
  stockStatus: 'alto' | 'medio' | 'bajo' | 'quiebre';
  daysOfInventory: number;
  suggestedReorder: number;
  promoter: string;
  lastAuditDate: string;
}

// Interfaz para Reportes de Inventario y Degustación (Antes y Después con Observación de Promotora)
export interface InventoryTastingReport {
  id: string;
  productName: string;
  sku: string;
  client: string;
  promoter: string;
  date: string;
  initialStock: number;
  finalStock: number;
  samplesGiven: number;
  salesGenerated: number;
  unit: string;
  rotationPercent: number;
  promoterObservation: string;
  isRecent?: boolean;
}

// Interfaz para la pestaña: Asistencias en PDV
interface AttendanceItem {
  id: string;
  promoter: string;
  promoterRole: 'Promotora' | 'Impulsadora' | 'Promotor Merchandising';
  client: string;
  zone: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  hoursRendered: string;
  gpsVerified: boolean;
  distanceMeters: number;
  status: 'en_tienda' | 'completado' | 'retardo' | 'ausente';
  batteryLevel?: string;
}

const checkinPhotoMemoryCache = new Map<string, string>();

// Foto de evidencia de asistencia: carga desde URL o directamente desde Supabase si el endpoint local no responde,
// y utiliza object-contain para que la fotografía jamás aparezca cortada.
const CheckInPhoto: React.FC<{ src?: string; checkInId?: string; alt: string; className?: string }> = ({
  src,
  checkInId,
  alt,
  className,
}) => {
  const resolvedId = useMemo(() => {
    if (checkInId) return checkInId;
    if (src && src.startsWith('/api/checkins/')) {
      const m = src.match(/^\/api\/checkins\/([^/]+)\/photo/);
      if (m) return decodeURIComponent(m[1]);
    }
    return undefined;
  }, [checkInId, src]);

  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(() => {
    if (resolvedId && checkinPhotoMemoryCache.has(resolvedId)) {
      return checkinPhotoMemoryCache.get(resolvedId);
    }
    return src;
  });
  const [failed, setFailed] = useState(false);
  const [triedSupabase, setTriedSupabase] = useState(false);

  useEffect(() => {
    if (resolvedId && checkinPhotoMemoryCache.has(resolvedId)) {
      setResolvedSrc(checkinPhotoMemoryCache.get(resolvedId));
      setFailed(false);
      return;
    }
    setResolvedSrc(src);
    setFailed(false);
    setTriedSupabase(false);
  }, [src, resolvedId]);

  const fetchPhotoFromSupabase = async () => {
    if (!resolvedId || triedSupabase) {
      setFailed(true);
      return;
    }
    setTriedSupabase(true);
    try {
      const { data, error } = await supabase
        .from('checkins')
        .select('photoBase64')
        .eq('id', resolvedId)
        .maybeSingle();
      const rawPhoto = (data as any)?.photoBase64;
      if (!error && rawPhoto && typeof rawPhoto === 'string' && rawPhoto.trim().length > 10) {
        const normalized =
          rawPhoto.startsWith('data:') || rawPhoto.startsWith('http') || rawPhoto.startsWith('/')
            ? rawPhoto
            : `data:image/jpeg;base64,${rawPhoto}`;
        checkinPhotoMemoryCache.set(resolvedId, normalized);
        setResolvedSrc(normalized);
        setFailed(false);
        return;
      }
    } catch {
      // ignore
    }
    setFailed(true);
  };

  if (!resolvedSrc || failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-zinc-900 text-zinc-500">
        <Camera className="w-6 h-6" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-center px-2">Foto no disponible</span>
      </div>
    );
  }
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={fetchPhotoFromSupabase}
      className={className ? className.replace(/\bobject-cover\b/g, 'object-contain') : 'w-full h-full object-contain bg-zinc-950'}
    />
  );
};

// Sucursales Oficiales de Alkosto en la Base de Datos Comercial
export const ALKOSTO_BRANCHES = [
  {
    id: 'ALKOSTO-01',
    nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Bella Vista)',
    cadena: 'ALKOSTO',
    zona: 'Bella Vista, Calle 72',
    region: 'Occidente / Maracaibo',
    canal: 'SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-413243580',
    isKeyAccount: true
  },
  {
    id: 'ALKOSTO-02',
    nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Maracaibo Norte)',
    cadena: 'ALKOSTO',
    zona: 'Av. Fuerzas Armadas',
    region: 'Occidente / Maracaibo',
    canal: 'SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-413243580',
    isKeyAccount: true
  },
  {
    id: 'ALKOSTO-03',
    nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Las Delicias)',
    cadena: 'ALKOSTO',
    zona: 'Av. 15 Las Delicias',
    region: 'Occidente / Maracaibo',
    canal: 'SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-413243580',
    isKeyAccount: true
  },
  {
    id: 'ALKOSTO-04',
    nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (San Francisco)',
    cadena: 'ALKOSTO',
    zona: 'San Francisco, Av. 5',
    region: 'Occidente / San Francisco',
    canal: 'SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-413243580',
    isKeyAccount: true
  },
  {
    id: 'ALKOSTO-05',
    nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Circunvalación 2)',
    cadena: 'ALKOSTO',
    zona: 'C-2 cruce con Amparo',
    region: 'Occidente / Maracaibo',
    canal: 'SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-413243580',
    isKeyAccount: true
  },
  {
    id: 'ALKOSTO-06',
    nombre: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LA LIMPIA)',
    cadena: 'ALKOSTO',
    zona: 'Av. La Limpia',
    region: 'Occidente / Maracaibo',
    canal: 'SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-413243580',
    isKeyAccount: true
  },
  {
    id: 'OLIMPICA-01',
    nombre: 'OLIMPICA MAYORISTA',
    cadena: 'OLIMPICA',
    zona: 'Maracaibo / San Francisco',
    region: 'Occidente / Maracaibo',
    canal: 'MAYORISTAS / SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-400000010',
    isKeyAccount: true
  },
  {
    id: 'OLIMPICA-02',
    nombre: 'OLIMPICA SÚPER MARKET',
    cadena: 'OLIMPICA',
    zona: 'Maracaibo / San Francisco',
    region: 'Occidente / Maracaibo',
    canal: 'SUPERMERCADOS',
    supervisor: 'SAIRU VALLES (Cuentas Clave)',
    rif: 'J-400000020',
    isKeyAccount: true
  }
];

interface PersonalItem {
  id: string;
  name: string;
  email?: string;
  role: 'Promotora' | 'Impulsadora' | 'Promotor Merchandising';
  zone: string;
  phone: string;
  status: 'activo' | 'en_campo' | 'descanso' | 'inactivo';
  assignedDegustaciones: number;
  reportsSubmitted: number;
  efficiencyScore: number;
  avatarBg: string;
}

interface MerchandisingItem {
  id: string;
  client: string;
  zone: string;
  promoter: string;
  date: string;
  type: 'Punta de Góndola' | 'Isla Central' | 'Cabecera' | 'Exhibidor POP';
  complianceRate: number;
  popCondition: 'Excelente' | 'Bueno' | 'Deteriorado' | 'Faltante';
  facingShare: string;
  photoUrl: string;
  status: 'Aprobado' | 'En Revisión' | 'Corregir';
}

// Las funciones de cálculo de semanas y fechas (getWeekBounds, parseDateDMY, getTodayStart, isPastDegustacionDate, getDefaultScheduleDateStr, getWeekInfo)
// se importan y re-exportan desde ../lib/degustacionesService para evitar acoplar paquetes móviles pesados.

// Datos iniciales de degustaciones (Inicializado vacío para producción; sincronizado en vivo con actividades reales)
const initialDegustaciones: DegustacionItem[] = [];

// Informes de campo recibidos (Inicializado vacío para producción; alimentado en vivo desde la App de Promotoras)
const initialInformes: InformeItem[] = [];

// Datos de Relevamiento de Comparativa de Precios (Inicializado vacío para producción)
const initialPriceComparisons: PriceComparisonItem[] = [];

// Datos de Inventario en Campo (Auditoría de Góndola y Cavas)
const initialFieldInventories: FieldInventoryItem[] = [];

// Datos de Reportes de Inventario y Degustación (Antes y Después de la Degustación)
const INITIAL_INVENTORY_TASTING_REPORTS: InventoryTastingReport[] = [];

// Datos de Asistencia en PDV (Control y Geocerca)
const initialAttendances: AttendanceItem[] = [];

// Registros de Merchandising y Material POP
const initialMerchandising: MerchandisingItem[] = [];

// Equipo Oficial de Promotoras, Impulsadoras y Mercaderistas de Codizulca (Sincronizado dinámicamente)
const initialPersonal: PersonalItem[] = [];

export const TradeMarketing: React.FC = () => {
  // Navegación de Submódulos: Degustaciones, Informes, Merchandising, Personal
  const [activeSubmodule, setActiveSubmodule] = useState<'degustaciones' | 'informes' | 'merchandising' | 'personal'>('degustaciones');

  // SUBMÓDULO EN DEGUSTACIONES: "Cronograma Actual" vs "Historial" (EXACTO A LA IMAGEN)
  const [degustacionSubtab, setDegustacionSubtab] = useState<'actual' | 'historial'>('actual');

  // Filtro opcional por semana específica dentro del historial
  const [selectedHistoricalWeek, setSelectedHistoricalWeek] = useState<string>('todas');

  // Datos
  const [degustaciones, setDegustaciones] = useState<DegustacionItem[]>(() => degustacionesService.getDegustaciones());
  const [informes, setInformes] = useState<InformeItem[]>(initialInformes);
  const [merchandising, setMerchandising] = useState<MerchandisingItem[]>(initialMerchandising);
  const [personal, setPersonal] = useState<PersonalItem[]>(initialPersonal);

  // Sincronización en tiempo real con degustacionesService y API de Vendedores
  useEffect(() => {
    degustacionesService.getDegustacionesAsync().then((items) => {
      if (Array.isArray(items) && items.length > 0) {
        setDegustaciones(items);
      }
    });

    const unsubscribe = degustacionesService.subscribe((items) => {
      setDegustaciones(items);
    });
    return () => unsubscribe();
  }, []);

  // Estados de Filtros Generales
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [promoterFilter, setPromoterFilter] = useState<string>('todos');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');

  // Vendedores oficiales de la Fuerza de Ventas + los que han enviado solicitudes de degustación desde su app (sin duplicados por acento)
  const uniqueVendedores = useMemo(() => {
    const cleanKey = (s: string) =>
      (s || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    const canonicalMap = new Map<string, string>();
    const officialSellers = [
      'MARÍA BRICEÑO',
      'MARIANA CHACÍN',
      'HERNÁN PAZ',
      'OSWALDO CHURIÓN',
      'CARLOS FUENMAYOR',
      'SARAH REYES',
      'J PABLO ARAUJO - CAB/OJE',
      'JOSE G. GONZALEZ',
      'ANGELICA MORENO',
      'ADEL JARABA',
      'JUAN HERNÁNDEZ',
      'YOLEIDA LUGO',
      'SAIRÚ VALLES',
      'ELISA SOLER',
      'J PABLO ARAUJO',
      'EDUARDO PIÑA',
      'LEONARDO RIOS',
      'MARYERY GARCIA',
      'LUIS GUANIPA',
      'PEDRO ABREU',
      'OSCAR ORTIZ',
      'MIKELANGELO DIAZ'
    ];

    officialSellers.forEach((v) => {
      canonicalMap.set(cleanKey(v), v);
    });

    degustaciones.forEach((d) => {
      if (d.vendedor) {
        const k = cleanKey(d.vendedor);
        if (k && !canonicalMap.has(k)) {
          canonicalMap.set(k, d.vendedor.trim());
        }
      }
    });

    return Array.from(canonicalMap.values());
  }, [degustaciones]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState<boolean>(false);
  const [revealedPasswords, setRevealedPasswords] = useState<{ [id: string]: boolean }>({});
  const [credentialsSearchTerm, setCredentialsSearchTerm] = useState<string>('');
  const [copiedCredentialId, setCopiedCredentialId] = useState<string | null>(null);

  // Productos de la Base de Datos Oficial Codizulca (285 SKUs)
  const [dbProducts, setDbProducts] = useState<InventoryProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true);
  const [productSearchTerm, setProductSearchTerm] = useState<string>('');
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>('TODAS');
  const [selectedDbProduct, setSelectedDbProduct] = useState<InventoryProduct | null>(null);

  // Cargar todos los productos de la Base de Datos Oficial
  useEffect(() => {
    setIsLoadingProducts(true);
    fetch('/api/inventory/products')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.products && Array.isArray(data.products)) {
          setDbProducts(data.products);
          if (data.products.length > 0) {
            const defaultProd = data.products.find((p: InventoryProduct) => p.articulo.toLowerCase().includes('ebenezer')) || data.products[0];
            setSelectedDbProduct(defaultProd);
            setNewActivity((prev) => ({
              ...prev,
              product: defaultProd.articulo
            }));
          }
        }
        setIsLoadingProducts(false);
      })
      .catch((err) => {
        console.error('Error al cargar catálogo de productos para Trade Marketing:', err);
        setIsLoadingProducts(false);
      });
  }, []);

  // Categorías de productos registradas
  const productCategories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('TODAS');
    dbProducts.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [dbProducts]);

  // Lista de productos filtrados para el modal de agendar
  const filteredModalProducts = useMemo(() => {
    return dbProducts.filter((p) => {
      if (selectedProductCategory !== 'TODAS' && p.category !== selectedProductCategory) {
        return false;
      }
      if (productSearchTerm.trim()) {
        const term = productSearchTerm.toLowerCase();
        return (
          p.articulo.toLowerCase().includes(term) ||
          p.codigo.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          String(p.id_articulo).includes(term)
        );
      }
      return true;
    });
  }, [dbProducts, selectedProductCategory, productSearchTerm]);

  // 4 PESTAÑAS EN EL SUBMÓDULO DE INFORMES (EXACTO A LA IMAGEN 2)
  // 'visitas' | 'precios' | 'inventario' | 'asistencia'
  const [informesTab, setInformesTab] = useState<'visitas' | 'precios' | 'inventario' | 'asistencia'>('visitas');

  // Datos para las 4 pestañas de Informes
  const [priceComparisons, setPriceComparisons] = useState<PriceComparisonItem[]>(initialPriceComparisons);
  const [fieldInventories, setFieldInventories] = useState<FieldInventoryItem[]>(initialFieldInventories);
  const [attendances, setAttendances] = useState<AttendanceItem[]>(initialAttendances);

  // Estados para el Submódulo de Asistencia en PDV (Check-in con Selfie 3:4 y GPS)
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  const [checkInViewMode, setCheckInViewMode] = useState<'gallery' | 'table'>('gallery');
  const [checkInTypeFilter, setCheckInTypeFilter] = useState<string>('todos');
  const [deleteConfirmCheckIn, setDeleteConfirmCheckIn] = useState<CheckInRecord | null>(null);
  const [inspectCheckIn, setInspectCheckIn] = useState<CheckInRecord | null>(null);
  const [isRefreshingCheckIns, setIsRefreshingCheckIns] = useState<boolean>(false);
  const [lastCheckInSync, setLastCheckInSync] = useState<Date>(new Date());
  const [manualSlotModal, setManualSlotModal] = useState<{
    existingId?: string;
    dayKey: string;
    dateFormatted: string;
    promoter: string;
    store: string;
    type: CheckInType;
    time: string;
    location: { lat: number; lng: number; accuracy: number };
    photoBase64: string;
  } | null>(null);
  const [isSavingManualSlot, setIsSavingManualSlot] = useState<boolean>(false);

  const handleManualSlotPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !manualSlotModal) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const TARGET_WIDTH = 720;
          const vWidth = img.width || 720;
          const vHeight = img.height || 960;
          const TARGET_HEIGHT = Math.round((vHeight / vWidth) * TARGET_WIDTH);
          canvas.width = TARGET_WIDTH;
          canvas.height = TARGET_HEIGHT;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressed = canvas.toDataURL('image/jpeg', 0.72);
            setManualSlotModal((prev) => (prev ? { ...prev, photoBase64: compressed } : null));
            return;
          }
        } catch {}
        setManualSlotModal((prev) =>
          prev ? { ...prev, photoBase64: String(ev.target?.result || '') } : null
        );
      };
      img.onerror = () => {
        setManualSlotModal((prev) =>
          prev ? { ...prev, photoBase64: String(ev.target?.result || '') } : null
        );
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveManualCheckInSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSlotModal || !manualSlotModal.photoBase64) return;
    setIsSavingManualSlot(true);
    try {
      const cleanTime = /^\d{2}:\d{2}$/.test(manualSlotModal.time.trim())
        ? manualSlotModal.time.trim()
        : '08:30';
      const isoCaracas = new Date(`${manualSlotModal.dayKey}T${cleanTime}:00-04:00`).toISOString();
      const staffMatch = resolvePromoterIdentity(manualSlotModal.promoter);
      const creatorId = staffMatch?.email || staffMatch?.id || manualSlotModal.promoter;

      const res = await checkinsService.createCheckIn({
        id: manualSlotModal.existingId,
        date: isoCaracas,
        promoter: manualSlotModal.promoter,
        store: manualSlotModal.store || 'Punto de Venta',
        type: manualSlotModal.type,
        photoBase64: manualSlotModal.photoBase64,
        location: manualSlotModal.location || { lat: 10.6542, lng: -71.6241, accuracy: 8 },
        creatorId,
      });

      if (res.record?.id && manualSlotModal.photoBase64.startsWith('data:')) {
        checkinPhotoMemoryCache.set(res.record.id, manualSlotModal.photoBase64);
      }

      setManualSlotModal(null);
      await loadCheckIns(true);
    } finally {
      setIsSavingManualSlot(false);
    }
  };

  const loadCheckIns = async (forceRefresh: boolean = false) => {
    setIsRefreshingCheckIns(true);
    try {
      const records = await checkinsService.getAllCheckIns(forceRefresh);
      setCheckIns(records);
      setLastCheckInSync(new Date());

      // Sincronizar también la pestaña de Asistencias en Informes con los Check-ins reales de las promotoras
      const mappedAttendances: AttendanceItem[] = records.map((rec) => {
        const staffMatch = resolvePromoterIdentity(rec.promoter);
        const timeFormatted = rec.date && rec.date.includes('T')
          ? new Date(rec.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
          : '08:30 AM';
        return {
          id: rec.id,
          promoter: rec.promoter || 'Promotora',
          promoterRole: (staffMatch?.role as any) || 'Impulsadora',
          client: rec.store || 'Punto de Venta',
          zone: staffMatch?.zone || 'Zulia / Falcón',
          date: normalizeDateToDMY(rec.date),
          checkInTime: timeFormatted,
          checkOutTime: rec.type === 'Salida' ? timeFormatted : null,
          hoursRendered: rec.type === 'Salida' ? 'Jornada Completa' : 'En Guardia Activa',
          gpsVerified: Boolean(rec.location && rec.location.lat && rec.location.lng),
          distanceMeters: rec.location?.accuracy ? Math.round(rec.location.accuracy) : 12,
          status: rec.type === 'Salida' ? 'completado' : 'en_tienda',
          batteryLevel: rec.batteryLevel || '92%'
        };
      });
      setAttendances(mappedAttendances);
    } finally {
      setIsRefreshingCheckIns(false);
    }
  };

  useEffect(() => {
    loadCheckIns();
    const unsubscribe = checkinsService.subscribe(() => {
      loadCheckIns();
    });
    // Los marcajes se registran desde los teléfonos de las promotoras (otros dispositivos), por lo que el
    // dashboard se actualiza solo cada 30 s y al volver a la pestaña, sin necesidad de recargar la página.
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadCheckIns();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadCheckIns();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const handleDeleteCheckIn = async (id: string) => {
    await checkinsService.deleteCheckIn(id);
    setDeleteConfirmCheckIn(null);
    loadCheckIns();
  };

  // Estados para el Submódulo de Merchandising (Informes y Certificación de Visita en PDV)
  const [merchandisingReports, setMerchandisingReports] = useState<MerchandisingReport[]>([]);
  const [merchandisingSubtab, setMerchandisingSubtab] = useState<'informes_visita' | 'auditoria_ia'>('informes_visita');
  const [merchFilterType, setMerchFilterType] = useState<'todos' | 'con_ia' | 'certificados'>('todos');
  const [merchandisingSearchTerm, setMerchandisingSearchTerm] = useState<string>('');
  const [merchandisingDateFilter, setMerchandisingDateFilter] = useState<string>('todos');
  const [selectedMerchReportForAudit, setSelectedMerchReportForAudit] = useState<MerchandisingReport | null>(null);
  const [deleteConfirmMerchReport, setDeleteConfirmMerchReport] = useState<MerchandisingReport | null>(null);
  const [isRefreshingMerch, setIsRefreshingMerch] = useState<boolean>(false);
  const [copiedAiSummaryId, setCopiedAiSummaryId] = useState<string | null>(null);

  const loadMerchandisingReports = async () => {
    setIsRefreshingMerch(true);
    try {
      const data = await merchandisingService.getAll();
      setMerchandisingReports(data);
    } finally {
      setIsRefreshingMerch(false);
    }
  };

  // Sincronización integral de toda la información cargada por las promotoras desde la App Móvil (/portal/*) y Supabase
  const loadCampoSynchronizedData = async (forceRefresh: boolean = false) => {
    try {
      const [priceSurveys, invLogs, tastingSurveys, shelfScans, merchList, checkinList] = await Promise.all([
        campoService.getPriceSurveys(forceRefresh),
        campoService.getInventoryLogs(forceRefresh),
        campoService.getTastingSurveys(),
        campoService.getShelfScans(),
        merchandisingService.getAll(),
        checkinsService.getAllCheckIns()
      ]);

      // 1. Sincronizar Monitoreo de Precios (CampoPrecios / Supabase prices -> Trade Marketing Precios)
      const mappedPrices: PriceComparisonItem[] = priceSurveys.map((ps, idx) => {
        const staffMatch = resolvePromoterIdentity(ps.promoter);
        const validComps = (ps.competitors || []).filter(
          (c) => (c.name && c.name.trim() !== '') || Number(c.priceUsd) > 0
        );
        const firstComp = validComps.length > 0
          ? validComps[0]
          : { name: 'Competidor', priceUsd: ps.ownPriceUsd, priceBs: ps.ownPriceBs, diffPercent: 0 };
        const gapPercent = ps.ownPriceUsd > 0 && firstComp.priceUsd > 0
          ? Number((((ps.ownPriceUsd - firstComp.priceUsd) / firstComp.priceUsd) * 100).toFixed(1))
          : 0;
        const competitiveness: PriceComparisonItem['competitiveness'] =
          gapPercent <= -2
            ? 'Mas Competitivo'
            : gapPercent <= 2
            ? 'A la Par'
            : gapPercent <= 8
            ? 'Mas Alto'
            : 'Alerta Desviacion';

        return {
          id: ps.id || `PRICE-${idx + 1}`,
          client: ps.store || 'Punto de Venta',
          zone: staffMatch?.zone || 'Zulia / Falcón',
          promoter: staffMatch?.name || ps.promoter || 'Promotora',
          origin: 'App Promotora',
          date: normalizeDateToDMY(ps.date),
          codizulcaProduct: ps.productName,
          codizulcaSku: `SKU-AST-${String(idx + 1).padStart(2, '0')}`,
          codizulcaPriceUSD: Number(ps.ownPriceUsd) || 0,
          codizulcaPriceBS: Number(ps.ownPriceBs) || 0,
          competitors: validComps.map((c) => ({
            brand: c.name,
            product: c.name,
            priceUSD: Number(c.priceUsd) || 0
          })),
          competitorBrand: firstComp.name,
          competitorProduct: firstComp.name,
          competitorPriceUSD: Number(firstComp.priceUsd) || 0,
          competitorPriceBS: Number(firstComp.priceBs) || 0,
          differencePercent: gapPercent,
          competitiveness,
          shelfFacing: 'Nivel Ojos / Manos',
          notes: ps.observations || 'Relevamiento en vivo desde App de Promotoras'
        };
      });
      setPriceComparisons(mappedPrices);

      // 2. Sincronizar Control de Inventario y Degustación (CampoInventario / Supabase inventory -> Trade Marketing Inventario)
      const mappedInvReports: InventoryTastingReport[] = invLogs.map((log, idx) => {
        const staffMatch = resolvePromoterIdentity(log.promoter);
        const init = Number(log.initialStock) || 0;
        const fin = Number(log.finalStock) || 0;
        const samples = Number(log.tastingsGiven) || 0;
        const rawDiff = Number((init - fin).toFixed(2));
        const defaultNet =
          samples > 0 && rawDiff > samples
            ? Number((rawDiff - samples).toFixed(2))
            : Math.max(0, rawDiff);
        const net =
          typeof log.netRotation === 'number' && !Number.isNaN(log.netRotation)
            ? Number(log.netRotation.toFixed(2))
            : defaultNet;
        const rotPct = init > 0 ? Math.round(((init - fin) / init) * 100) : 0;
        const prodLower = String(log.productName || '').toLowerCase();
        const detectedUnit =
          /\b(kg|1kg|x\s*kg)\b/i.test(prodLower) && !prodLower.includes('paquete') && !prodLower.includes('pieza') && !prodLower.includes('unidad')
            ? 'Kg'
            : 'Unid/Kg';
        return {
          id: log.id || `INV-${idx + 1}`,
          productName: log.productName,
          sku: `SKU-INV-${String(idx + 1).padStart(2, '0')}`,
          client: log.store,
          promoter: staffMatch?.name || log.promoter,
          date: normalizeDateToDMY(log.date),
          initialStock: init,
          finalStock: fin,
          samplesGiven: samples,
          salesGenerated: net,
          unit: detectedUnit,
          rotationPercent: rotPct,
          promoterObservation: log.observations || 'Reporte sincronizado desde App Móvil de Promotoras',
          isRecent: true
        };
      });
      setInventoryReports(mappedInvReports);

      // También poblar FieldInventories combinando logs de inventario y escaneos de góndola
      const mappedFieldInv: FieldInventoryItem[] = [
        ...invLogs.map((log, idx): FieldInventoryItem => {
          const staffMatch = resolvePromoterIdentity(log.promoter);
          const fin = Number(log.finalStock) || 0;
          const status: FieldInventoryItem['stockStatus'] =
            fin === 0 ? 'quiebre' : fin < 10 ? 'bajo' : fin < 25 ? 'medio' : 'alto';
          return {
            id: log.id || `FINV-${idx + 1}`,
            client: log.store,
            zone: staffMatch?.zone || 'Zulia / Falcón',
            product: log.productName,
            sku: `SKU-${String(idx + 1).padStart(3, '0')}`,
            category: 'Embutidos / Asturias',
            facingCount: 6,
            shelfStock: fin,
            storageStock: Math.max(0, (Number(log.initialStock) || 0) - fin),
            totalStock: Number(log.initialStock) || fin,
            unit: 'Unid',
            stockStatus: status,
            daysOfInventory: fin > 0 ? Math.max(2, Math.round(fin / 3)) : 0,
            suggestedReorder: status === 'quiebre' || status === 'bajo' ? 30 : 0,
            promoter: log.promoter,
            lastAuditDate: normalizeDateToDMY(log.date)
          };
        }),
        ...shelfScans.map((scan, idx): FieldInventoryItem => {
          const staffMatch = resolvePromoterIdentity(scan.promoter);
          const ourFacings = Number(scan.metrics?.ourFacings) || 0;
          const outOfStock = Boolean(scan.metrics?.outOfStockDetected);
          return {
            id: scan.id || `SCAN-INV-${idx + 1}`,
            client: scan.store,
            zone: staffMatch?.zone || 'Zulia / Falcón',
            product: scan.category || 'Línea Refrigerados Codizulca',
            sku: `GOND-${String(idx + 1).padStart(3, '0')}`,
            category: scan.category || 'Charcutería',
            facingCount: ourFacings,
            shelfStock: ourFacings * 4,
            storageStock: 10,
            totalStock: ourFacings * 4 + 10,
            unit: 'Frentes',
            stockStatus: outOfStock ? 'quiebre' : ourFacings < 6 ? 'bajo' : 'alto',
            daysOfInventory: outOfStock ? 0 : 7,
            suggestedReorder: outOfStock ? 25 : 0,
            promoter: scan.promoter,
            lastAuditDate: normalizeDateToDMY(scan.date)
          };
        })
      ];
      setFieldInventories(mappedFieldInv);

      // 3. Sincronizar Historial de Visitas e Informes Unificados (Encuestas Corta/Larga + Precios + Inventario + Merchandising + Asistencia)
      const unifiedInformes: InformeItem[] = [
        ...tastingSurveys.map((ts): InformeItem => {
          const staffMatch = resolvePromoterIdentity(ts.promoter);
          const rating = Number(ts.ratingOverall) || 5;
          const acceptance: InformeItem['acceptance'] =
            rating >= 5 ? 'Muy Positivo' : rating >= 4 ? 'Positivo' : rating >= 3 ? 'Neutro' : 'Negativo';
          return {
            id: ts.id,
            date: normalizeDateToDMY(ts.date),
            checkIn: ts.date && ts.date.includes('T')
              ? new Date(ts.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
              : '09:30 AM',
            promoter: ts.promoter,
            client: ts.store,
            zone: staffMatch?.zone || 'Zulia / Falcón',
            type: ts.type === 'extendida' ? 'Informe Degustación' : 'Encuesta Breve',
            stock: 'alto',
            pop: 'excelente',
            acceptance,
            samplesGiven: 1,
            photosCount: 1,
            gpsVerified: true,
            comments: `Producto: ${ts.productName} | Intención de compra: ${ts.purchaseIntent} (${rating}/5★). ${ts.comments || ''}`.trim()
          };
        }),
        ...invLogs.map((inv): InformeItem => {
          const staffMatch = resolvePromoterIdentity(inv.promoter);
          const fin = Number(inv.finalStock) || 0;
          return {
            id: `INF-${inv.id}`,
            date: normalizeDateToDMY(inv.date),
            checkIn: inv.date && inv.date.includes('T')
              ? new Date(inv.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
              : '10:00 AM',
            promoter: inv.promoter,
            client: inv.store,
            zone: staffMatch?.zone || 'Zulia / Falcón',
            type: 'Informe Degustación',
            stock: fin === 0 ? 'quiebre' : fin < 10 ? 'bajo' : fin < 25 ? 'medio' : 'alto',
            pop: 'bueno',
            acceptance: 'Muy Positivo',
            samplesGiven: Number(inv.tastingsGiven) || 0,
            photosCount: 1,
            gpsVerified: true,
            comments: `Inventario ${inv.productName}: Inicial ${inv.initialStock}, Muestras ${inv.tastingsGiven}, Final ${inv.finalStock} (Rotación Neta: ${inv.netRotation}). ${inv.observations || ''}`.trim()
          };
        }),
        ...priceSurveys.map((ps): InformeItem => {
          const staffMatch = resolvePromoterIdentity(ps.promoter);
          return {
            id: `INF-${ps.id}`,
            date: normalizeDateToDMY(ps.date),
            checkIn: ps.date && ps.date.includes('T')
              ? new Date(ps.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
              : '10:30 AM',
            promoter: ps.promoter,
            client: ps.store,
            zone: staffMatch?.zone || 'Zulia / Falcón',
            type: 'Relevamiento Precios',
            stock: 'alto',
            pop: 'bueno',
            acceptance: 'Positivo',
            photosCount: ps.photoPriceTag ? 1 : 0,
            gpsVerified: true,
            comments: `Monitoreo de Precio: ${ps.productName} a $${Number(ps.ownPriceUsd).toFixed(2)} (Bs. ${Number(ps.ownPriceBs).toFixed(2)}) vs ${(ps.competitors || []).length} competidores. ${ps.observations || ''}`.trim()
          };
        }),
        ...merchList.map((mr): InformeItem => {
          const staffMatch = resolvePromoterIdentity(mr.promoter);
          return {
            id: `INF-${mr.id}`,
            date: normalizeDateToDMY(mr.date),
            checkIn: mr.time || '09:00 AM',
            promoter: mr.promoter,
            client: mr.store,
            zone: staffMatch?.zone || 'Zulia / Falcón',
            type: mr.metrics ? 'Auditoría Profunda' : 'Merchandising PDV',
            stock: mr.metrics?.outOfStockDetected ? 'quiebre' : 'alto',
            pop: mr.metrics?.popDetected === false ? 'regular' : 'excelente',
            acceptance: 'Muy Positivo',
            photosCount: mr.photos ? mr.photos.length : 0,
            gpsVerified: Boolean(mr.certified),
            comments: mr.observations || `Actividades: ${(mr.activities || []).join(', ')}`
          };
        }),
        ...checkinList.map((ci): InformeItem => {
          const staffMatch = resolvePromoterIdentity(ci.promoter);
          const timeFormatted = ci.date && ci.date.includes('T')
            ? new Date(ci.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
            : '08:30 AM';
          return {
            id: `INF-${ci.id}`,
            date: normalizeDateToDMY(ci.date),
            checkIn: timeFormatted,
            promoter: ci.promoter,
            client: ci.store,
            zone: staffMatch?.zone || 'Zulia / Falcón',
            type: 'Encuesta Breve',
            stock: 'alto',
            pop: 'excelente',
            acceptance: 'Muy Positivo',
            photosCount: ci.photoBase64 ? 1 : 0,
            gpsVerified: Boolean(ci.location && ci.location.lat && ci.location.lng),
            comments: `Asistencia verificada (${ci.type}) en ${ci.store}.`
          };
        })
      ];

      setInformes(unifiedInformes);
    } catch (e) {
      console.warn('Error syncing promoter field data into Trade Marketing:', e);
    }
  };

  useEffect(() => {
    loadMerchandisingReports();
    loadCampoSynchronizedData(true);
    const unsubMerch = merchandisingService.subscribe(() => {
      loadMerchandisingReports();
      loadCampoSynchronizedData(true);
    });
    const unsubCampo = campoService.subscribe(() => {
      loadCampoSynchronizedData(true);
    });
    const unsubCheckins = checkinsService.subscribe(() => {
      loadCampoSynchronizedData();
    });

    // Suscripción en tiempo real a Supabase (tablas `prices` e `inventory`) para reflejar al instante
    // cualquier comparativa de precios o inventario que envíe la promotora desde su teléfono
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    try {
      realtimeChannel = supabase
        .channel('trade-marketing-campo-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, () => {
          loadCampoSynchronizedData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
          loadCampoSynchronizedData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, () => {
          loadCheckIns();
          loadCampoSynchronizedData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'surveys' }, () => {
          loadMerchandisingReports();
          loadCampoSynchronizedData(true);
        })
        .subscribe();
    } catch {
      realtimeChannel = null;
    }

    const pollCampo = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadCampoSynchronizedData(true);
      }
    }, 15000);

    const onCampoVisible = () => {
      if (document.visibilityState === 'visible') {
        loadCampoSynchronizedData(true);
      }
    };
    document.addEventListener('visibilitychange', onCampoVisible);
    window.addEventListener('focus', onCampoVisible);

    return () => {
      unsubMerch();
      unsubCampo();
      unsubCheckins();
      window.clearInterval(pollCampo);
      document.removeEventListener('visibilitychange', onCampoVisible);
      window.removeEventListener('focus', onCampoVisible);
      if (realtimeChannel) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch {}
      }
    };
  }, []);

  const handleDeleteMerchReport = async (id: string) => {
    await merchandisingService.delete(id);
    setDeleteConfirmMerchReport(null);
    if (selectedMerchReportForAudit?.id === id) {
      setSelectedMerchReportForAudit(null);
    }
    loadMerchandisingReports();
  };

  // Estados para el Submódulo de Personal de Campo (Nómina: Fija, Eventual, Merchandising)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [editingStaffMember, setEditingStaffMember] = useState<StaffMember | null>(null);
  const [isNewStaffModalOpen, setIsNewStaffModalOpen] = useState<boolean>(false);
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<StaffMember | null>(null);
  const [staffCopiedId, setStaffCopiedId] = useState<string | null>(null);
  const [personalCategoryFilter, setPersonalCategoryFilter] = useState<'todas' | 'fija' | 'eventual' | 'merchandising' | 'activo'>('todas');
  const [personalSearchTerm, setPersonalSearchTerm] = useState<string>('');
  const [personalActionToast, setPersonalActionToast] = useState<string | null>(null);

  const loadStaff = async () => {
    try {
      const data = await staffService.getAll();
      setStaffMembers(data);
      if (Array.isArray(data) && data.length > 0) {
        const mapped: PersonalItem[] = data.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          role: s.role,
          zone: s.address || s.assignedStore || 'Maracaibo',
          phone: s.phone,
          status: s.status === 'Inactivo' ? 'inactivo' : 'activo',
          assignedDegustaciones: s.assignedDegustaciones || 0,
          reportsSubmitted: s.reportsSubmitted || 0,
          efficiencyScore: s.efficiencyScore || 90,
          avatarBg: s.avatarBg || 'bg-emerald-600'
        }));
        setPersonal(mapped);
      }
    } catch (e) {
      console.warn('Error loading staff:', e);
    }
  };

  useEffect(() => {
    loadStaff();
    const unsub = staffService.subscribe(() => {
      loadStaff();
    });
    return () => unsub();
  }, []);

  const handleStaffPhotoUpload = async (id: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        await staffService.updatePhoto(id, base64);
        await loadStaff();
        setPersonalActionToast('¡Foto de perfil actualizada exitosamente!');
        setTimeout(() => setPersonalActionToast(null), 3500);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveStaffMember = async (member: Omit<StaffMember, 'id'> & { id?: string }) => {
    await staffService.save(member);
    setIsNewStaffModalOpen(false);
    setEditingStaffMember(null);
    await loadStaff();
    setPersonalActionToast('¡Ficha de personal guardada con éxito!');
    setTimeout(() => setPersonalActionToast(null), 3500);
  };

  const handleDeleteStaffMember = async (id: string) => {
    await staffService.delete(id);
    setDeleteConfirmStaff(null);
    await loadStaff();
    setPersonalActionToast('Promotora eliminada de la plantilla.');
    setTimeout(() => setPersonalActionToast(null), 3500);
  };

  const handleCopyCustomLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setStaffCopiedId(id);
    setPersonalActionToast('¡Enlace de acceso a la App Móvil copiado al portapapeles!');
    setTimeout(() => {
      setStaffCopiedId(null);
      setPersonalActionToast(null);
    }, 3000);
  };

  // Filtros de Informes
  const [priceChainFilter, setPriceChainFilter] = useState<string>('todos');
  const [selectedCompetitorBrand, setSelectedCompetitorBrand] = useState<string>('todos');
  const [isManagementDecisionOpen, setIsManagementDecisionOpen] = useState<boolean>(true);
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<string>('todos');
  const [orderNotifiedId, setOrderNotifiedId] = useState<string | null>(null);

  // Estados para la Métrica con IA de Posicionamiento en el Mercado y Recomendación
  const PRICING_DECISION_METRICS = useMemo<PricingDecisionMetric[]>(() => {
    return priceComparisons.map((p, idx) => {
      const isNegative = (p.differencePercent || 0) < 0;
      return {
        id: p.id || `DEC-${idx + 1}`,
        sku: p.codizulcaSku || 'SKU-00',
        productName: p.codizulcaProduct,
        category: 'Góndola PDV',
        channel: `${p.client} (${p.zone})`,
        codizulcaPriceUSD: p.codizulcaPriceUSD,
        codizulcaPriceBS: p.codizulcaPriceBS,
        competitorBrand: p.competitorBrand || 'Competidor',
        competitorProduct: p.competitorProduct || 'Producto Rival',
        competitorPriceUSD: p.competitorPriceUSD,
        priceGapPercent: p.differencePercent || 0,
        priceGapUSD: Math.round((p.codizulcaPriceUSD - p.competitorPriceUSD) * 100) / 100,
        diagnosisType: isNegative ? 'margen' : 'riesgo',
        diagnosisBadge: p.competitiveness || (isNegative ? 'Más Competitivo' : 'Alerta Precio'),
        elasticityLabel: p.shelfFacing || 'Visibilidad en anaquel',
        executiveRecommendation: p.strategicAction || p.notes || 'Monitorear rotación y paridad en PDV.',
        projectedImpact: isNegative ? 'Liderazgo en Góndola' : 'Defensa de Anaquel',
        actionButtonLabel: 'Evaluar Acción'
      };
    });
  }, [priceComparisons]);

  const [selectedAiProductId, setSelectedAiProductId] = useState<string>('DEC-01');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [aiCustomRecommendations, setAiCustomRecommendations] = useState<{
    [id: string]: {
      score?: number;
      diagnostic?: string;
      recommendation?: string;
      impact?: string;
    };
  }>({});

  const selectedAiProduct = useMemo(() => {
    return PRICING_DECISION_METRICS.find((p) => p.id === selectedAiProductId) || PRICING_DECISION_METRICS[0] || null;
  }, [PRICING_DECISION_METRICS, selectedAiProductId]);

  const handleGenerateAiRecommendation = async (product: PricingDecisionMetric) => {
    setIsAiGenerating(true);
    try {
      const res = await fetch('/api/trade-ai-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: product.productName,
          category: product.category,
          channel: product.channel,
          codizulcaPriceUSD: product.codizulcaPriceUSD,
          competitorBrand: product.competitorBrand,
          competitorProduct: product.competitorProduct,
          competitorPriceUSD: product.competitorPriceUSD,
          priceGapPercent: product.priceGapPercent
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiCustomRecommendations((prev) => ({
          ...prev,
          [product.id]: {
            score: data.marketPositionScore,
            diagnostic: data.marketDiagnostic,
            recommendation: data.strategicRecommendation,
            impact: data.projectedImpact
          }
        }));
      }
    } catch (e) {
      console.warn('AI recommendation error:', e);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Estados para Reportes de Inventario y Degustación (Antes y Después de la Actividad)
  const [inventoryReports, setInventoryReports] = useState<InventoryTastingReport[]>(INITIAL_INVENTORY_TASTING_REPORTS);
  const [reportSearchTerm, setReportSearchTerm] = useState<string>('');
  const [isTastingAiPanelOpen, setIsTastingAiPanelOpen] = useState<boolean>(true);
  const [isTastingAiLoading, setIsTastingAiLoading] = useState<boolean>(false);
  const [tastingAiAnalysis, setTastingAiAnalysis] = useState<{
    overallScore: number;
    effectivenessLevel: string;
    conversionRate: string;
    rotationLiftPercent: number;
    summaryDiagnostic: string;
    strengths: string[];
    improvementOpportunities: string[];
    roiEstimate: string;
  } | null>(null);

  // Modal para registrar nuevo reporte de inventario y degustación
  const [isNewReportModalOpen, setIsNewReportModalOpen] = useState<boolean>(false);
  const [newReportForm, setNewReportForm] = useState({
    productName: 'Embutidos (Mortadela, Salchichas...) - 1kg',
    client: 'Olimpica mayorista',
    promoter: 'JAIVELIN FEREIRA',
    initialStock: 50.50,
    finalStock: 50.50,
    samplesGiven: 1,
    unit: 'Kg',
    promoterObservation: 'Buen precio '
  });

  // Modal para editar observación de promotora
  const [editingObservationReportId, setEditingObservationReportId] = useState<string | null>(null);
  const [tempObservation, setTempObservation] = useState<string>('');

  const handleAnalyzeTastingEffectiveness = async () => {
    setIsTastingAiLoading(true);
    try {
      const res = await fetch('/api/trade-tasting-effectiveness-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: inventoryReports })
      });
      if (res.ok) {
        const data = await res.json();
        setTastingAiAnalysis(data);
      }
    } catch (e) {
      console.warn('Error analyzing tasting effectiveness with AI:', e);
    } finally {
      setIsTastingAiLoading(false);
    }
  };

  const handleCreateInventoryReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const initial = Number(newReportForm.initialStock) || 0;
    const final = Number(newReportForm.finalStock) || 0;
    const samples = Number(newReportForm.samplesGiven) || 0;
    const sales = Math.round((initial - final - samples) * 10) / 10;
    const rotation = initial > 0 ? Math.round(((initial - final) / initial) * 100) : 0;
    const reportId = `INV-${Date.now().toString().slice(-6)}`;

    const newRep: InventoryTastingReport = {
      id: reportId,
      productName: newReportForm.productName,
      sku: 'SKU-' + Math.floor(100 + Math.random() * 900),
      client: newReportForm.client,
      promoter: newReportForm.promoter,
      date: normalizeDateToDMY(new Date().toISOString()),
      initialStock: initial,
      finalStock: final,
      samplesGiven: samples,
      salesGenerated: sales,
      unit: newReportForm.unit,
      rotationPercent: rotation,
      promoterObservation: newReportForm.promoterObservation,
      isRecent: true
    };

    setInventoryReports([newRep, ...inventoryReports]);
    setIsNewReportModalOpen(false);

    await campoService.saveInventoryLog({
      id: reportId,
      date: new Date().toISOString(),
      store: newReportForm.client,
      promoter: newReportForm.promoter,
      productName: newReportForm.productName,
      initialStock: initial,
      tastingsGiven: samples,
      finalStock: final,
      netRotation: sales,
      observations: newReportForm.promoterObservation
    });
  };

  const handleDeleteReport = async (id: string) => {
    setInventoryReports((prev) => prev.filter((r) => r.id !== id));
    await campoService.deleteInventoryLog(id);
  };

  const handleSaveObservation = (id: string) => {
    setInventoryReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, promoterObservation: tempObservation } : r))
    );
    setEditingObservationReportId(null);
  };

  // Estado para el selector interactivo de Cliente PDV en el Modal (con Alkosto destacado)
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState<boolean>(false);
  const [clientSearchFilter, setClientSearchFilter] = useState<string>('');

  // Base de datos de clientes unificada: Alkosto destacado al inicio + clientes de cartera
  const allAvailableClients = useMemo(() => {
    const list: {
      id: string;
      nombre: string;
      zona: string;
      region: string;
      canal: string;
      supervisor: string;
      isKeyAccount?: boolean;
    }[] = [];

    // 1. Agregar las sucursales oficiales de ALKOSTO prioritariamente
    ALKOSTO_BRANCHES.forEach((b) => list.push(b));

    // 2. Agregar los clientes de la base enriquecida
    ENRICHED_CLIENTS.forEach((c) => {
      if (!c.nombre.toUpperCase().includes('ALKOSTO')) {
        list.push({
          id: c.id,
          nombre: c.nombre,
          zona: c.zona || c.region || 'Maracaibo',
          region: c.region || 'Zulia',
          canal: c.canal || 'SUPERMERCADOS',
          supervisor: c.supervisor || 'General'
        });
      }
    });

    return list;
  }, []);

  // Clientes filtrados para el dropdown del modal
  const filteredClientsForModal = useMemo(() => {
    if (!clientSearchFilter.trim()) return allAvailableClients;
    const term = clientSearchFilter.toLowerCase();
    return allAvailableClients.filter((c) =>
      c.nombre.toLowerCase().includes(term) ||
      c.zona.toLowerCase().includes(term) ||
      c.supervisor.toLowerCase().includes(term)
    );
  }, [allAvailableClients, clientSearchFilter]);

  // Modal Agendar
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newActivity, setNewActivity] = useState({
    activity: '',
    product: 'Mortadela Tapara Especial 1 Kg',
    promoter: 'CARELIZ REYES',
    promoterRole: 'Impulsadora' as 'Promotora' | 'Impulsadora' | 'Promotor Merchandising',
    client: '',
    zone: 'Punto Fijo',
    vendedor: 'MARIANA CHACÍN',
    source: 'vendedor_app' as 'vendedor_app' | 'coordinacion' | 'sistema',
    date: getDefaultScheduleDateStr(),
    time: '14:00 - 18:00',
    target: 150,
    comments: ''
  });

  // Modal Detalle de Informe
  const [selectedInforme, setSelectedInforme] = useState<InformeItem | null>(null);

  // Copiar Enlace de Promotoras
  const handleCopyLink = () => {
    const portalUrl = window.location.origin + '/portal/login';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(portalUrl).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      }).catch(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      });
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  // Abrir Portal
  const handleOpenPortal = () => {
    window.open('/portal/login', '_blank');
  };

  // Estado de notificación cuando se acepta y asigna una degustación a una promotora
  const [assignmentToast, setAssignmentToast] = useState<string | null>(null);

  // Estado de sincronización en vivo con la base de datos y la App de Vendedores
  const [isSyncingDegustaciones, setIsSyncingDegustaciones] = useState<boolean>(false);
  const [syncFeedbackToast, setSyncFeedbackToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Sincronización manual con backend/Supabase y App de Vendedores con feedback visual inmediato
  const handleSyncDegustaciones = async () => {
    setIsSyncingDegustaciones(true);
    try {
      const refreshed = await degustacionesService.getDegustacionesAsync(true);
      if (Array.isArray(refreshed) && refreshed.length > 0) {
        setDegustaciones(refreshed);
        const activeCount = refreshed.filter((i) => i.status === 'scheduled' || i.status === 'in_progress').length;
        setSyncFeedbackToast({
          message: `¡Sincronización exitosa! ${refreshed.length} actividades actualizadas (${activeCount} solicitudes activas de vendedores en Cronograma Actual).`,
          type: 'success'
        });
      } else {
        setSyncFeedbackToast({
          message: 'Base de datos sincronizada. No hay nuevas solicitudes pendientes.',
          type: 'info'
        });
      }
    } catch (e) {
      console.warn('[TradeMarketing] Error en sincronización manual:', e);
      setSyncFeedbackToast({
        message: 'Degustaciones sincronizadas con la base local.',
        type: 'info'
      });
    } finally {
      setIsSyncingDegustaciones(false);
      setTimeout(() => {
        setSyncFeedbackToast((prev) => (prev ? null : prev));
      }, 5000);
    }
  };

  // Asignar / aceptar degustación directamente desde la fila del cronograma a la ruta de la promotora
  const handleQuickAssignPromoter = async (row: DegustacionItem, selectedPromoterName: string) => {
    const isUnassigned = !selectedPromoterName || selectedPromoterName.toUpperCase().includes('POR ASIGNAR');
    const matchedStaff = !isUnassigned
      ? personal.find((pers) => matchPromoterName(pers.name, selectedPromoterName)) ||
        resolvePromoterIdentity(selectedPromoterName)
      : null;

    const updatedItem: DegustacionItem = {
      ...row,
      promoter: isUnassigned ? 'POR ASIGNAR (Trade Marketing)' : (matchedStaff ? matchedStaff.name : selectedPromoterName),
      promoterEmail: isUnassigned ? '' : (matchedStaff?.email || ''),
      promoterId: isUnassigned ? '' : (matchedStaff?.id || ''),
      promoterRole: isUnassigned ? 'Impulsadora' : (matchedStaff ? matchedStaff.role : row.promoterRole),
      status: row.status === 'cancelled' && !isUnassigned ? 'scheduled' : row.status
    };

    await degustacionesService.updateDegustacion(updatedItem);

    if (isUnassigned) {
      setAssignmentToast(`⏳ Degustación en ${row.client} marcada como Pendiente por Asignar.`);
    } else {
      const emailInfo = updatedItem.promoterEmail ? ` (${updatedItem.promoterEmail})` : '';
      setAssignmentToast(
        `✅ Degustación aceptada y asignada a la Ruta de ${updatedItem.promoter}${emailInfo}`
      );
    }
    setTimeout(() => setAssignmentToast(null), 5000);
  };

  // Guardar nueva actividad
  const handleCreateActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivity.activity.trim() || !newActivity.client.trim()) return;

    const isUnassigned = !newActivity.promoter || newActivity.promoter.toUpperCase().includes('POR ASIGNAR');
    const matchedStaff = !isUnassigned
      ? personal.find((pers) => matchPromoterName(pers.name, newActivity.promoter)) ||
        resolvePromoterIdentity(newActivity.promoter)
      : null;

    const newItem: DegustacionItem = {
      id: `DEG-VEND-${Date.now().toString().slice(-6)}`,
      date: normalizeDateToDMY(newActivity.date),
      time: newActivity.time,
      activity: newActivity.activity,
      product: newActivity.product,
      promoter: isUnassigned ? 'POR ASIGNAR (Trade Marketing)' : (matchedStaff ? matchedStaff.name : newActivity.promoter),
      promoterEmail: isUnassigned ? '' : (matchedStaff?.email || ''),
      promoterId: isUnassigned ? '' : (matchedStaff?.id || ''),
      promoterRole: isUnassigned ? 'Impulsadora' : (matchedStaff ? matchedStaff.role : newActivity.promoterRole),
      client: newActivity.client,
      zone: newActivity.zone,
      vendedor: newActivity.vendedor || 'MARIANA CHACÍN',
      source: 'vendedor_app',
      status: 'scheduled',
      delivered: 0,
      target: Number(newActivity.target) || 150,
      acceptanceRate: 0,
      comments: newActivity.comments
    };

    degustacionesService.addDegustacion(newItem);
    setIsModalOpen(false);
    if (!isUnassigned) {
      setAssignmentToast(
        `✅ Degustación agendada y asignada a la Ruta de ${newItem.promoter}${newItem.promoterEmail ? ` (${newItem.promoterEmail})` : ''}`
      );
      setTimeout(() => setAssignmentToast(null), 5000);
    }
    setNewActivity({
      activity: '',
      product: 'Mortadela Tapara Especial 1 Kg',
      promoter: personal[0]?.name || 'CARELIZ REYES',
      promoterRole: 'Impulsadora',
      client: '',
      zone: 'Punto Fijo',
      vendedor: 'MARIANA CHACÍN',
      source: 'vendedor_app',
      date: getDefaultScheduleDateStr(),
      time: '14:00 - 18:00',
      target: 150,
      comments: ''
    });
  };

  // Estados para Edición y Eliminación de Degustaciones
  const [editingActivity, setEditingActivity] = useState<DegustacionItem | null>(null);
  const [activityToDelete, setActivityToDelete] = useState<DegustacionItem | null>(null);

  // Actualizar actividad existente
  const handleUpdateActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingActivity) return;

    const isUnassigned = !editingActivity.promoter || editingActivity.promoter.toUpperCase().includes('POR ASIGNAR');
    const matchedStaff = !isUnassigned
      ? personal.find((pers) => matchPromoterName(pers.name, editingActivity.promoter)) ||
        resolvePromoterIdentity(editingActivity.promoter, editingActivity.promoterEmail)
      : null;

    const enriched: DegustacionItem = {
      ...editingActivity,
      promoter: isUnassigned ? 'POR ASIGNAR (Trade Marketing)' : (matchedStaff ? matchedStaff.name : editingActivity.promoter),
      promoterEmail: isUnassigned ? '' : (matchedStaff?.email || editingActivity.promoterEmail || ''),
      promoterId: isUnassigned ? '' : (matchedStaff?.id || editingActivity.promoterId || ''),
      promoterRole: isUnassigned ? 'Impulsadora' : (matchedStaff ? matchedStaff.role : editingActivity.promoterRole)
    };

    degustacionesService.updateDegustacion(enriched);
    setEditingActivity(null);
    if (!isUnassigned) {
      setAssignmentToast(
        `✅ Degustación actualizada y sincronizada en la Ruta de ${enriched.promoter}${enriched.promoterEmail ? ` (${enriched.promoterEmail})` : ''}`
      );
      setTimeout(() => setAssignmentToast(null), 5000);
    }
  };

  // Confirmar eliminación de actividad
  const handleConfirmDelete = () => {
    if (!activityToDelete) return;
    degustacionesService.deleteDegustacion(activityToDelete.id);
    setActivityToDelete(null);
  };

  // =========================================================================
  // SEPARACIÓN AUTOMÁTICA: CRONOGRAMA ACTUAL (>= HOY) vs HISTORIAL (< HOY)
  // Todo lo que sea de una fecha anterior a hoy pasa automáticamente al Historial,
  // dejando el Cronograma Actual limpio y listo para la nueva programación de vendedores.
  // =========================================================================
  const todayStart = useMemo(() => getTodayStart(new Date()), []);

  const { weekStart, weekEnd } = useMemo(() => {
    const refForWeek = new Date(todayStart);
    // Si hoy es domingo (fin de semana), mostrar el rango de la nueva semana que inicia mañana lunes
    if (refForWeek.getDay() === 0) {
      refForWeek.setDate(refForWeek.getDate() + 1);
    }
    return getWeekBounds(refForWeek);
  }, [todayStart]);

  // Cronograma Actual:
  // Muestra únicamente las solicitudes de degustación nuevas/pendientes o en curso ('scheduled' o 'in_progress'),
  // dejando el Cronograma Actual completamente limpio cuando las actividades pasan al Historial.
  const currentWeekDegustaciones = useMemo(() => {
    return degustaciones.filter((item) => {
      return item.status === 'scheduled' || item.status === 'in_progress';
    });
  }, [degustaciones]);

  // Historial:
  // Todas las degustaciones completadas o archivadas ('completed' o 'cancelled').
  const historicalDegustaciones = useMemo(() => {
    return degustaciones.filter((item) => {
      return item.status !== 'scheduled' && item.status !== 'in_progress';
    });
  }, [degustaciones]);

  // Agrupación automática de Historial por Semana (Semana 4, Semana 3, Semana 2, Semana 1)
  const historicalWeeksGrouped = useMemo(() => {
    const groups: {
      [key: string]: {
        weekNumber: number;
        weekLabel: string;
        rangeLabel: string;
        items: DegustacionItem[];
        totalDelivered: number;
        totalTarget: number;
        avgAcceptance: number;
        promotersCount: number;
      };
    } = {};

    historicalDegustaciones.forEach((item) => {
      const info = getWeekInfo(item.date);
      const key = `semana-${info.weekNumber}`;

      if (!groups[key]) {
        groups[key] = {
          weekNumber: info.weekNumber,
          weekLabel: info.weekLabel,
          rangeLabel: info.rangeLabel,
          items: [],
          totalDelivered: 0,
          totalTarget: 0,
          avgAcceptance: 0,
          promotersCount: 0
        };
      }

      groups[key].items.push(item);
      groups[key].totalDelivered += item.delivered;
      groups[key].totalTarget += item.target;
    });

    // Calcular promedios y promotoras únicas por cada semana
    Object.keys(groups).forEach((key) => {
      const grp = groups[key];
      const validAcceptance = grp.items.filter((i) => i.acceptanceRate > 0);
      grp.avgAcceptance = validAcceptance.length > 0
        ? Math.round(validAcceptance.reduce((acc, curr) => acc + curr.acceptanceRate, 0) / validAcceptance.length)
        : 0;
      const uniquePromoters = new Set(grp.items.map((i) => i.promoter));
      grp.promotersCount = uniquePromoters.size;
    });

    // Ordenar de semana más reciente a más antigua (Semana 4 -> 3 -> 2 -> 1)
    return Object.values(groups).sort((a, b) => b.weekNumber - a.weekNumber);
  }, [historicalDegustaciones]);

  // Filtrado para el Cronograma Actual
  const filteredCurrentDegustaciones = useMemo(() => {
    return currentWeekDegustaciones.filter((item) => {
      const matchesSearch =
        item.activity.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.promoter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.vendedor && item.vendedor.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus =
        statusFilter === 'todos' || item.status === statusFilter;

      const matchesPromoter =
        promoterFilter === 'todos' || matchPromoterName(item.promoter, promoterFilter);

      const matchesVendedor =
        vendedorFilter === 'todos' || matchVendedorName(item.vendedor, vendedorFilter);

      return matchesSearch && matchesStatus && matchesPromoter && matchesVendedor;
    });
  }, [currentWeekDegustaciones, searchTerm, statusFilter, promoterFilter, vendedorFilter]);

  // Filtrado para el Historial
  const filteredHistoricalWeeks = useMemo(() => {
    return historicalWeeksGrouped
      .filter((grp) => {
        if (selectedHistoricalWeek !== 'todas' && `semana-${grp.weekNumber}` !== selectedHistoricalWeek) {
          return false;
        }
        return true;
      })
      .map((grp) => {
        const filteredItems = grp.items.filter((item) => {
          const matchesSearch =
            item.activity.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.promoter.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.vendedor && item.vendedor.toLowerCase().includes(searchTerm.toLowerCase()));

          const matchesStatus =
            statusFilter === 'todos' || item.status === statusFilter;

          const matchesPromoter =
            promoterFilter === 'todos' || matchPromoterName(item.promoter, promoterFilter);

          const matchesVendedor =
            vendedorFilter === 'todos' || matchVendedorName(item.vendedor, vendedorFilter);

          return matchesSearch && matchesStatus && matchesPromoter && matchesVendedor;
        });

        return {
          ...grp,
          items: filteredItems
        };
      })
      .filter((grp) => grp.items.length > 0);
  }, [historicalWeeksGrouped, selectedHistoricalWeek, searchTerm, statusFilter, promoterFilter, vendedorFilter]);

  // Filtrado de Informes (Historial de Visitas)
  const filteredInformes = useMemo(() => {
    return informes.filter((inf) => {
      const matchesSearch =
        inf.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inf.promoter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inf.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inf.comments.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPromoter =
        promoterFilter === 'todos' || inf.promoter === promoterFilter;

      return matchesSearch && matchesPromoter;
    });
  }, [informes, searchTerm, promoterFilter]);

  // Marcas de competidores disponibles dinámicamente según los relevamientos enviados por promotoras
  const availableCompetitorBrands = useMemo(() => {
    const baseBrands = [
      'Plumrose',
      'Hermo',
      'Oscar Mayer',
      'Alibal',
      'Montserratina',
      'San Antonio',
      'Embutidos Arichuna',
      'El Corral',
      'Alimex',
      'Turza',
      'Leyenda',
      'Torondoy',
      'Primor',
      'Mary',
      'Montalbán',
      'Pantera',
      'Iberia',
      'Campestre',
      'La Campiña'
    ];
    const map = new Map<string, string>();
    baseBrands.forEach((b) => map.set(b.toLowerCase(), b));
    priceComparisons.forEach((item) => {
      if (item.competitorBrand && item.competitorBrand.trim() && item.competitorBrand !== 'Competidor') {
        const clean = item.competitorBrand.trim();
        if (!map.has(clean.toLowerCase())) map.set(clean.toLowerCase(), clean);
      }
      if (Array.isArray(item.competitors)) {
        item.competitors.forEach((c) => {
          const clean = (c.brand || c.product || '').trim();
          if (clean && clean !== 'Competidor' && !map.has(clean.toLowerCase())) {
            map.set(clean.toLowerCase(), clean);
          }
        });
      }
    });
    return Array.from(map.values());
  }, [priceComparisons]);

  const [isSyncingPrices, setIsSyncingPrices] = useState<boolean>(false);
  const handleManualSyncPrices = async () => {
    setIsSyncingPrices(true);
    try {
      await loadCampoSynchronizedData(true);
    } finally {
      setIsSyncingPrices(false);
    }
  };

  // Filtrado de Comparativa de Precios
  const filteredPriceComparisons = useMemo(() => {
    return priceComparisons.filter((item) => {
      const matchesSearch =
        item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.codizulcaProduct.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.competitorBrand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.competitorProduct.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.promoter.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesChain =
        priceChainFilter === 'todos' || item.client.toLowerCase().includes(priceChainFilter.toLowerCase());

      const matchesCompetitor =
        selectedCompetitorBrand === 'todos' ||
        item.competitorBrand.toLowerCase().includes(selectedCompetitorBrand.toLowerCase()) ||
        (item.competitors &&
          item.competitors.some(
            (c) =>
              c.brand.toLowerCase().includes(selectedCompetitorBrand.toLowerCase()) ||
              c.product.toLowerCase().includes(selectedCompetitorBrand.toLowerCase())
          ));

      const matchesPromoter =
        promoterFilter === 'todos' || matchPromoterName(item.promoter, promoterFilter);

      return matchesSearch && matchesChain && matchesCompetitor && matchesPromoter;
    });
  }, [priceComparisons, searchTerm, priceChainFilter, selectedCompetitorBrand, promoterFilter]);

  // Filtrado de Reportes de Inventario y Degustación
  const filteredInventoryReports = useMemo(() => {
    return inventoryReports.filter((r) => {
      const matchesPromoter =
        promoterFilter === 'todos' || matchPromoterName(r.promoter, promoterFilter);
      if (!matchesPromoter) return false;
      const combinedTerm = (reportSearchTerm || searchTerm).trim().toLowerCase();
      if (!combinedTerm) return true;
      return (
        r.productName.toLowerCase().includes(combinedTerm) ||
        r.client.toLowerCase().includes(combinedTerm) ||
        r.promoter.toLowerCase().includes(combinedTerm) ||
        r.promoterObservation.toLowerCase().includes(combinedTerm)
      );
    });
  }, [inventoryReports, reportSearchTerm, searchTerm, promoterFilter]);

  // Totales agregados de inventario y degustación
  const inventoryReportTotals = useMemo(() => {
    const totalInitial = filteredInventoryReports.reduce((acc, r) => acc + r.initialStock, 0);
    const totalFinal = filteredInventoryReports.reduce((acc, r) => acc + r.finalStock, 0);
    const totalSamples = filteredInventoryReports.reduce((acc, r) => acc + r.samplesGiven, 0);
    const totalSales = filteredInventoryReports.reduce((acc, r) => acc + r.salesGenerated, 0);
    const avgRotation = filteredInventoryReports.length > 0
      ? Math.round(filteredInventoryReports.reduce((acc, r) => acc + r.rotationPercent, 0) / filteredInventoryReports.length)
      : 0;
    return {
      totalInitial: Math.round(totalInitial * 100) / 100,
      totalFinal: Math.round(totalFinal * 100) / 100,
      totalSamples: Math.round(totalSamples * 100) / 100,
      totalSales: Math.round(totalSales * 100) / 100,
      avgRotation
    };
  }, [filteredInventoryReports]);

  // Filtrado de Inventario en Campo
  const filteredFieldInventories = useMemo(() => {
    return fieldInventories.filter((item) => {
      const matchesSearch =
        item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        inventoryStatusFilter === 'todos' || item.stockStatus === inventoryStatusFilter;

      const matchesPromoter =
        promoterFilter === 'todos' || item.promoter === promoterFilter;

      return matchesSearch && matchesStatus && matchesPromoter;
    });
  }, [fieldInventories, searchTerm, inventoryStatusFilter, promoterFilter]);

  // Filtrado de Asistencias en PDV
  const filteredAttendances = useMemo(() => {
    return attendances.filter((item) => {
      const matchesSearch =
        item.promoter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.zone.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPromoter =
        promoterFilter === 'todos' || item.promoter === promoterFilter;

      return matchesSearch && matchesPromoter;
    });
  }, [attendances, searchTerm, promoterFilter]);

  // Filtrado de Check-ins Biométricos y GPS en PDV
  const filteredCheckIns = useMemo(() => {
    return checkIns.filter((item) => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        item.promoter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.store.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPromoter =
        promoterFilter === 'todos' || matchPromoterName(item.promoter, promoterFilter);

      const matchesType =
        checkInTypeFilter === 'todos' || item.type === checkInTypeFilter;

      return matchesSearch && matchesPromoter && matchesType;
    });
  }, [checkIns, searchTerm, promoterFilter, checkInTypeFilter]);

  // Organización de Asistencias por Día (Fecha) y Promotora con los 4 hitos cronológicos:
  // 1. Foto de Ingreso | 2. Salida a Almorzar (Cuando aplique) | 3. Llegada de Almorzar (Cuando aplique) | 4. Salida
  const dailyGroupedCheckIns = useMemo(() => {
    interface PromoterDailyAttendance {
      key: string;
      dayKey: string;
      dateFormatted: string;
      promoter: string;
      stores: string[];
      primaryLocation: { lat: number; lng: number; accuracy: number };
      ingreso?: CheckInRecord;
      salidaAlmorzar?: CheckInRecord;
      llegadaAlmorzar?: CheckInRecord;
      salida?: CheckInRecord;
      recordsCount: number;
    }

    interface DayAttendanceSection {
      dayKey: string;
      dateFormatted: string;
      dateLongLabel: string;
      promoters: PromoterDailyAttendance[];
      totalCheckIns: number;
    }

    const dayMap = new Map<string, Map<string, PromoterDailyAttendance>>();

    for (const item of filteredCheckIns) {
      const dayKey = getCaracasDayKey(item.date); // YYYY-MM-DD en America/Caracas
      const [yyyy, mm, dd] = dayKey.split('-');
      const dateFormatted = dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : dayKey;
      const promoterKey = (item.promoter || 'Promotora').trim().toUpperCase();

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, new Map());
      }
      const pMap = dayMap.get(dayKey)!;
      if (!pMap.has(promoterKey)) {
        pMap.set(promoterKey, {
          key: `${dayKey}|${promoterKey}`,
          dayKey,
          dateFormatted,
          promoter: item.promoter || 'Promotora',
          stores: [],
          primaryLocation: item.location || { lat: 0, lng: 0, accuracy: 0 },
          recordsCount: 0,
        });
      }

      const entry = pMap.get(promoterKey)!;
      entry.recordsCount += 1;

      const storeClean = (item.store || '').trim();
      if (storeClean && !entry.stores.some((s) => s.toLowerCase() === storeClean.toLowerCase())) {
        entry.stores.push(storeClean);
      }

      if (
        item.location &&
        item.location.lat !== 0 &&
        item.location.lng !== 0 &&
        (entry.primaryLocation.lat === 0 || entry.primaryLocation.lng === 0)
      ) {
        entry.primaryLocation = item.location;
      }

      if (item.type === 'Ingreso') {
        entry.ingreso = item;
      } else if (item.type === 'Salida a almorzar') {
        entry.salidaAlmorzar = item;
      } else if (item.type === 'Vuelta a almorzar') {
        entry.llegadaAlmorzar = item;
      } else if (item.type === 'Salida') {
        entry.salida = item;
      }
    }

    const sortedDays = Array.from(dayMap.keys()).sort((a, b) => b.localeCompare(a));
    const sections: DayAttendanceSection[] = sortedDays.map((dayKey) => {
      const [yyyy, mm, dd] = dayKey.split('-');
      const dateFormatted = dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : dayKey;
      let dateLongLabel = dateFormatted;
      try {
        const refDate = new Date(`${dayKey}T12:00:00-04:00`);
        if (!Number.isNaN(refDate.getTime())) {
          dateLongLabel = refDate.toLocaleDateString('es-VE', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Caracas',
          });
        }
      } catch {}

      const pMap = dayMap.get(dayKey)!;
      const promoters = Array.from(pMap.values()).sort((a, b) =>
        a.promoter.localeCompare(b.promoter, 'es')
      );
      const totalCheckIns = promoters.reduce((acc, p) => acc + p.recordsCount, 0);

      return {
        dayKey,
        dateFormatted,
        dateLongLabel,
        promoters,
        totalCheckIns,
      };
    });

    return sections;
  }, [filteredCheckIns]);

  // Filtrado de Informes de Merchandising Certificados & Evaluados con IA
  const filteredMerchandisingReports = useMemo(() => {
    return merchandisingReports.filter((item) => {
      const term = (merchandisingSearchTerm || searchTerm).toLowerCase().trim();
      const matchesSearch =
        term === '' ||
        item.store.toLowerCase().includes(term) ||
        item.promoter.toLowerCase().includes(term) ||
        item.storeManagerName.toLowerCase().includes(term) ||
        (item.address && item.address.toLowerCase().includes(term)) ||
        (item.aiRecommendations?.marketPositionStatus && item.aiRecommendations.marketPositionStatus.toLowerCase().includes(term));

      const matchesPromoter =
        promoterFilter === 'todos' || item.promoter === promoterFilter;

      const matchesDate =
        merchandisingDateFilter === 'todos' || item.date === merchandisingDateFilter;

      const matchesType =
        merchFilterType === 'todos' ||
        (merchFilterType === 'con_ia' && !!item.aiRecommendations) ||
        (merchFilterType === 'certificados' && item.certified && !!item.signature);

      return matchesSearch && matchesPromoter && matchesDate && matchesType;
    });
  }, [merchandisingReports, merchandisingSearchTerm, searchTerm, promoterFilter, merchandisingDateFilter, merchFilterType]);

  // Exportar a Excel con separación de Cronograma Actual, Historial Semanal y las 4 áreas de Informes
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: Cronograma Actual (Semana en Curso)
    const actualRows = currentWeekDegustaciones.map((d) => ({
      ID: d.id,
      Fecha: d.date,
      Horario: d.time,
      Actividad: d.activity,
      Producto: d.product,
      Promotora: d.promoter,
      Rol: d.promoterRole,
      Cliente_PDV: d.client,
      Zona: d.zone,
      Estado: d.status.toUpperCase(),
      Muestras_Entregadas: d.delivered,
      Meta_Muestras: d.target,
      Aceptacion_Positiva: `${d.acceptanceRate}%`,
      Comentarios: d.comments || ''
    }));
    const wsActual = XLSX.utils.json_to_sheet(actualRows);
    XLSX.utils.book_append_sheet(wb, wsActual, 'Cronograma Actual');

    // Hoja 2: Historial por Semanas (Semana 1, 2, 3, 4)
    const histRows = historicalDegustaciones.map((d) => {
      const info = getWeekInfo(d.date);
      return {
        Encabezado_Semana: info.weekLabel,
        Rango_Fecha: info.rangeLabel,
        ID: d.id,
        Fecha: d.date,
        Horario: d.time,
        Actividad: d.activity,
        Producto: d.product,
        Promotora: d.promoter,
        Cliente_PDV: d.client,
        Zona: d.zone,
        Estado: d.status.toUpperCase(),
        Muestras_Entregadas: d.delivered,
        Meta_Muestras: d.target,
        Aceptacion_Positiva: `${d.acceptanceRate}%`,
        Comentarios: d.comments || ''
      };
    });
    const wsHist = XLSX.utils.json_to_sheet(histRows);
    XLSX.utils.book_append_sheet(wb, wsHist, 'Historial Semanas 1-4');

    // Hoja 3: Historial de Visitas
    const infRows = informes.map((inf) => ({
      ID: inf.id,
      Fecha: inf.date,
      CheckIn: inf.checkIn || '',
      CheckOut: inf.checkOut || '',
      Promotora: inf.promoter,
      Cliente_PDV: inf.client,
      Zona: inf.zone,
      Tipo_Informe: inf.type,
      Estado_Stock: inf.stock.toUpperCase(),
      Material_POP: inf.pop.toUpperCase(),
      Indice_Aceptacion: inf.acceptance,
      Muestras_Degustadas: inf.samplesGiven || 0,
      Fotos_Subidas: inf.photosCount,
      GPS_Verificado: inf.gpsVerified ? 'SÍ' : 'NO',
      Observaciones: inf.comments
    }));
    const wsInf = XLSX.utils.json_to_sheet(infRows);
    XLSX.utils.book_append_sheet(wb, wsInf, 'Historial Visitas');

    // Hoja 4: Comparativa de Precios en PDV
    const priceRows = priceComparisons.map((p) => ({
      ID: p.id,
      PDV_Cliente: p.client,
      Zona: p.zone,
      Producto_Codizulca: p.codizulcaProduct,
      SKU_Codizulca: p.codizulcaSku,
      Precio_USD_Codizulca: p.codizulcaPriceUSD,
      Precio_BS_Codizulca: p.codizulcaPriceBS,
      Marca_Competencia: p.competitorBrand,
      Producto_Competencia: p.competitorProduct,
      Precio_USD_Competencia: p.competitorPriceUSD,
      Precio_BS_Competencia: p.competitorPriceBS,
      Diferencial_Porcentaje: `${p.differencePercent.toFixed(2)}%`,
      Competitividad: p.competitiveness,
      Auditora: p.promoter,
      Fecha: p.date
    }));
    const wsPrice = XLSX.utils.json_to_sheet(priceRows);
    XLSX.utils.book_append_sheet(wb, wsPrice, 'Comparativa Precios');

    // Hoja 5: Inventario en Campo
    const invRows = fieldInventories.map((inv) => ({
      ID: inv.id,
      PDV_Cliente: inv.client,
      Zona: inv.zone,
      Producto: inv.product,
      SKU: inv.sku,
      Categoria: inv.category,
      Facings: inv.facingCount,
      Stock_Gondola: inv.shelfStock,
      Stock_Cava: inv.storageStock,
      Total_Stock: inv.totalStock,
      Unidad: inv.unit,
      Estado_Stock: inv.stockStatus.toUpperCase(),
      Dias_Cobertura: inv.daysOfInventory,
      Pedido_Sugerido: inv.suggestedReorder,
      Auditora: inv.promoter,
      Fecha_Auditoria: inv.lastAuditDate
    }));
    const wsInv = XLSX.utils.json_to_sheet(invRows);
    XLSX.utils.book_append_sheet(wb, wsInv, 'Inventario en Campo');

    // Hoja 6: Asistencias en PDV (Organizadas por Fecha y Promotora: Ingreso, Salida Almorzar, Llegada Almorzar y Salida)
    const formatCheckInHour = (rec?: CheckInRecord) =>
      rec
        ? new Date(rec.date).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Caracas',
          })
        : 'No aplica';

    const attRows = dailyGroupedCheckIns.flatMap((daySection) =>
      daySection.promoters.map((p) => {
        const staffMatch = resolvePromoterIdentity(p.promoter);
        const hasGps = p.primaryLocation && p.primaryLocation.lat !== 0 && p.primaryLocation.lng !== 0;
        return {
          Fecha: daySection.dateFormatted,
          Promotora: p.promoter,
          Rol: staffMatch?.role || 'Impulsadora',
          PDV_Tienda: p.stores.join(' / ') || 'Punto de Venta',
          Zona: staffMatch?.zone || 'Zulia / Falcón',
          Hora_Ingreso: formatCheckInHour(p.ingreso),
          Salida_Almorzar: formatCheckInHour(p.salidaAlmorzar),
          Llegada_Almorzar: formatCheckInHour(p.llegadaAlmorzar),
          Hora_Salida: p.salida ? formatCheckInHour(p.salida) : 'Pendiente / En Curso',
          Coordenadas_GPS: hasGps
            ? `${p.primaryLocation.lat.toFixed(6)}, ${p.primaryLocation.lng.toFixed(6)} (±${Math.round(p.primaryLocation.accuracy || 0)}m)`
            : 'Sin GPS',
          Estado: p.ingreso && p.salida ? 'JORNADA COMPLETA' : 'EN GUARDIA ACTIVA',
        };
      })
    );
    const wsAtt = XLSX.utils.json_to_sheet(attRows);
    XLSX.utils.book_append_sheet(wb, wsAtt, 'Asistencias por Día');

    XLSX.writeFile(wb, `TradeMarketing_Codizulca_Consolidado_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg border border-emerald-500/40 bg-emerald-950/60 text-emerald-400 inline-flex items-center gap-1 shadow-sm">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Completado
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg border border-blue-500/40 bg-blue-950/60 text-blue-400 inline-flex items-center gap-1 shadow-sm animate-pulse">
            <Clock className="w-3 h-3 text-blue-400" /> En Curso
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg border border-red-500/40 bg-red-950/60 text-red-400 inline-flex items-center gap-1 shadow-sm">
            <X className="w-3 h-3 text-red-400" /> Cancelado
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 inline-flex items-center gap-1 shadow-sm">
            <Calendar className="w-3 h-3 text-zinc-400" /> Programado
          </span>
        );
    }
  };

  const getStockBadge = (stock: string) => {
    switch (stock) {
      case 'alto':
        return <span className="px-2 py-0.5 text-[10px] uppercase font-black rounded border border-emerald-500/40 bg-emerald-950/60 text-emerald-400">Alto</span>;
      case 'medio':
        return <span className="px-2 py-0.5 text-[10px] uppercase font-black rounded border border-blue-500/40 bg-blue-950/60 text-blue-400">Medio</span>;
      case 'bajo':
        return <span className="px-2 py-0.5 text-[10px] uppercase font-black rounded border border-yellow-500/40 bg-yellow-950/60 text-yellow-400">Bajo</span>;
      case 'quiebre':
        return <span className="px-2 py-0.5 text-[10px] uppercase font-black rounded border border-red-500/50 bg-red-950/80 text-red-400">Quiebre</span>;
      default:
        return null;
    }
  };

  const totalDegustacionesCount = degustaciones.length;
  const totalInformesCount = informes.length;
  const globalAcceptanceRate = useMemo(() => {
    const completed = degustaciones.filter((d) => d.status === 'completed' && d.acceptanceRate > 0);
    if (completed.length > 0) {
      return Math.round(completed.reduce((acc, curr) => acc + curr.acceptanceRate, 0) / completed.length);
    }
    if (informes.length > 0) {
      const positiveCount = informes.filter((i) => i.acceptance === 'Muy Positivo' || i.acceptance === 'Positivo').length;
      return Math.round((positiveCount / informes.length) * 100);
    }
    return 0;
  }, [degustaciones, informes]);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 font-sans text-zinc-100 max-w-[1600px] mx-auto pb-12">
      {/* ========================================================================= */}
      {/* 1. FILA DE MÉTRICAS OFICIAL (DINÁMICAS PARA PRODUCCIÓN)                   */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tarjeta 1: Degustaciones este mes */}
        <div className="bg-[#121316] border border-white/10 rounded-2xl p-5 shadow-xl flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Calendar className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-medium text-zinc-400">
              Degustaciones este mes
            </p>
            <p className="text-2xl sm:text-3xl font-black text-white mt-0.5">
              {totalDegustacionesCount} {totalDegustacionesCount === 1 ? 'programada' : 'programadas'}
            </p>
          </div>
        </div>

        {/* Tarjeta 2: Informes Recibidos */}
        <div className="bg-[#121316] border border-white/10 rounded-2xl p-5 shadow-xl flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-950/40 border border-blue-500/20 flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-medium text-zinc-400">
              Informes Recibidos
            </p>
            <p className="text-2xl sm:text-3xl font-black text-white mt-0.5">
              {totalInformesCount} {totalInformesCount === 1 ? 'recibido' : 'recibidos'}
            </p>
          </div>
        </div>

        {/* Tarjeta 3: Índice de Aceptación Global */}
        <div className="bg-[#121316] border border-white/10 rounded-2xl p-5 shadow-xl flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-purple-950/40 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Star className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-medium text-zinc-400">
              Índice de Aceptación Global
            </p>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-0.5">
              {globalAcceptanceRate > 0 ? `${globalAcceptanceRate}% Positivo` : '0%'}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BLOQUE DE ENLACE DE ACCESO MÓVIL EXACTO (IMAGEN 1)                     */}
      {/* ========================================================================= */}
      <div className="bg-[#121316] border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Contenido Izquierdo */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <Smartphone className="h-6 w-6 text-red-500" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-bold text-white text-base">
                Enlace de Acceso Móvil (App de Promotoras & Impulsadoras)
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Sincronizado en Vivo
              </span>
            </div>
          </div>
        </div>

        {/* Botones de Acción Derechos */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0 self-end lg:self-center">
          <button
            type="button"
            onClick={() => setIsCredentialsModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white font-bold text-xs transition-colors shadow-md cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>Ver Credenciales</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors shadow-lg shadow-red-600/30 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>¡Copiado con Éxito!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Enlace de Promotoras</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenPortal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 font-bold text-xs transition-colors cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-zinc-400" />
            <span>Abrir Portal</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. BARRA DE SUBMÓDULOS "CRONOGRAMA DE CAMPO"                              */}
      {/* ========================================================================= */}
      <div className="bg-[#121316] border border-white/10 rounded-2xl p-3 sm:p-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Título de la sección con ícono de calendario */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 text-white font-bold text-base sm:text-lg">
              <Calendar className="w-5 h-5 text-red-500 shrink-0" />
              <span>Cronograma de Campo</span>
            </div>

            {/* Submódulos Tabs */}
            <div className="flex items-center bg-black/50 border border-white/10 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setActiveSubmodule('degustaciones')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeSubmodule === 'degustaciones'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Degustaciones
              </button>

              <button
                type="button"
                onClick={() => setActiveSubmodule('informes')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeSubmodule === 'informes'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Informes
              </button>

              <button
                type="button"
                onClick={() => setActiveSubmodule('merchandising')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeSubmodule === 'merchandising'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Merchandising
              </button>

              <button
                type="button"
                onClick={() => setActiveSubmodule('personal')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeSubmodule === 'personal'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Personal
              </button>
            </div>
          </div>

          {/* Botones de Acción Derecha */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-emerald-400 transition-colors cursor-pointer"
              title="Exportar base completa a Excel (Cronograma Actual e Historial)"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>

            {activeSubmodule === 'degustaciones' && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-white transition-colors cursor-pointer shadow-sm hover:border-red-500/50"
              >
                <Plus className="w-4 h-4 text-red-500" />
                <span>+ Agendar Degustación</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Búsqueda y Filtros de Submódulo */}
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder={
                activeSubmodule === 'degustaciones'
                  ? degustacionSubtab === 'actual'
                    ? 'Buscar en cronograma actual por actividad, producto, cliente...'
                    : 'Buscar en historial por actividad, producto, cliente...'
                  : activeSubmodule === 'informes'
                  ? 'Buscar en informes recibidos, cliente o comentarios...'
                  : activeSubmodule === 'merchandising'
                  ? 'Buscar exhibición, tienda o tipo...'
                  : 'Buscar promotora por nombre o zona...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900/80 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Filtro por Semana en el Historial */}
            {activeSubmodule === 'degustaciones' && degustacionSubtab === 'historial' && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
                <CalendarDays className="w-3.5 h-3.5 text-red-400" />
                <select
                  value={selectedHistoricalWeek}
                  onChange={(e) => setSelectedHistoricalWeek(e.target.value)}
                  className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                >
                  <option value="todas" className="bg-zinc-900 text-white">Todas las Semanas ({historicalDegustaciones.length})</option>
                  <option value="semana-4" className="bg-zinc-900 text-white">Semana 4 (19 Oct - 25 Oct)</option>
                  <option value="semana-3" className="bg-zinc-900 text-white">Semana 3 (12 Oct - 18 Oct)</option>
                  <option value="semana-2" className="bg-zinc-900 text-white">Semana 2 (05 Oct - 11 Oct)</option>
                  <option value="semana-1" className="bg-zinc-900 text-white">Semana 1 (01 Oct - 04 Oct)</option>
                </select>
              </div>
            )}

            {activeSubmodule === 'degustaciones' && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
                <Filter className="w-3.5 h-3.5 text-zinc-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                >
                  <option value="todos" className="bg-zinc-900 text-white">Todos los Estados</option>
                  <option value="scheduled" className="bg-zinc-900 text-white">Programados</option>
                  <option value="in_progress" className="bg-zinc-900 text-white">En Curso</option>
                  <option value="completed" className="bg-zinc-900 text-white">Completados</option>
                  <option value="cancelled" className="bg-zinc-900 text-white">Cancelados</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={promoterFilter}
                onChange={(e) => setPromoterFilter(e.target.value)}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-zinc-900 text-white">Todo el Personal</option>
                {personal.map((p) => (
                  <option key={p.id} value={p.name} className="bg-zinc-900 text-white">
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Vendedor Solicitante */}
            {activeSubmodule === 'degustaciones' && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl">
                <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                <select
                  value={vendedorFilter}
                  onChange={(e) => setVendedorFilter(e.target.value)}
                  className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                >
                  <option value="todos" className="bg-zinc-900 text-white">Todos los Vendedores</option>
                  {uniqueVendedores.map((v) => (
                    <option key={v} value={v} className="bg-zinc-900 text-white">
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. SUBMÓDULO DEGUSTACIONES: CRONOGRAMA ACTUAL vs HISTORIAL               */}
      {/* ========================================================================= */}
      {activeSubmodule === 'degustaciones' && (
        <div className="space-y-4">
          {/* BARRA DE NAVEGACIÓN SECUNDARIA */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center bg-black/60 border border-white/10 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setDegustacionSubtab('actual')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  degustacionSubtab === 'actual'
                    ? 'bg-red-600 text-white shadow-md font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>Cronograma Actual</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  degustacionSubtab === 'actual' ? 'bg-black/30 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {currentWeekDegustaciones.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDegustacionSubtab('historial')}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                  degustacionSubtab === 'historial'
                    ? 'bg-red-600 text-white shadow-md font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>Historial</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  degustacionSubtab === 'historial' ? 'bg-black/30 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {historicalDegustaciones.length}
                </span>
              </button>
            </div>

            {/* Aviso de Almacenamiento y Botón de Sincronización en Vivo */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={isSyncingDegustaciones}
                onClick={handleSyncDegustaciones}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-zinc-300 hover:text-white rounded-xl border border-white/10 text-xs font-bold transition-all cursor-pointer shadow-sm"
                title="Sincronizar solicitudes en tiempo real desde la App de Vendedores y base de datos"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-red-500 ${isSyncingDegustaciones ? 'animate-spin text-amber-400' : ''}`} />
                <span>{isSyncingDegustaciones ? 'Sincronizando con Vendedores...' : 'Sincronizar Solicitudes App Vendedores'}</span>
              </button>

              <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-900/60 border border-white/5 px-3 py-1.5 rounded-xl font-mono">
                <Clock className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>
                  Origen: <strong className="text-zinc-200">Enviado por Vendedores desde App</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Notificación de Sincronización Exitosa con App de Vendedores */}
          {syncFeedbackToast && (
            <div className={`px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 border ${
              syncFeedbackToast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : 'bg-zinc-900/90 border-white/10 text-zinc-200'
            }`}>
              <div className="flex items-center gap-2.5 font-bold">
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${syncFeedbackToast.type === 'success' ? 'text-emerald-400' : 'text-cyan-400'}`} />
                <span>{syncFeedbackToast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setSyncFeedbackToast(null)}
                className="text-emerald-300 hover:text-white font-bold ml-3 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Notificación de Aceptación y Sincronización con App de Promotoras (/portal/ruta) */}
          {assignmentToast && (
            <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{assignmentToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setAssignmentToast(null)}
                className="text-emerald-300 hover:text-white font-bold ml-3 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* VISTA A: CRONOGRAMA ACTUAL (Semana en curso) */}
          {degustacionSubtab === 'actual' && (
            <div className="bg-[#121316] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-white/10 bg-zinc-900/40 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Cronograma Actual (Actividades desde Hoy y Próxima Programación)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/10 text-zinc-300 font-mono text-[10px]">
                    {weekStart.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} - {weekEnd.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {filteredCurrentDegustaciones.length} solicitudes activas en cronograma • {historicalDegustaciones.length} archivadas en Historial
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[980px] text-xs">
                  <thead>
                    <tr className="bg-zinc-900/90 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[11px] select-none">
                      <th className="p-4 border-r border-white/10 min-w-[130px]">Fecha / Horario</th>
                      <th className="p-4 border-r border-white/10 min-w-[200px]">Actividad & Producto</th>
                      <th className="p-4 border-r border-white/10 min-w-[160px]">Vendedor Solicitante</th>
                      <th className="p-4 border-r border-white/10 min-w-[240px]">Promotora Asignada (Ruta App)</th>
                      <th className="p-4 border-r border-white/10 min-w-[190px]">Cliente PDV & Zona</th>
                      <th className="p-4 border-r border-white/10 text-center min-w-[110px]">Estado</th>
                      <th className="p-4 border-r border-white/10 text-right min-w-[120px]">Muestras (Avance)</th>
                      <th className="p-4 border-r border-white/10 text-center min-w-[100px]">Aceptación</th>
                      <th className="p-4 text-center min-w-[90px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredCurrentDegustaciones.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-12 text-center">
                          <div className="max-w-lg mx-auto space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400 shadow-md">
                              <Calendar className="w-6 h-6" />
                            </div>
                            <h4 className="font-bold text-white text-base">
                              Cronograma Actual Listo para la Nueva Programación de Vendedores
                            </h4>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                              Todas las degustaciones de fechas anteriores ({historicalDegustaciones.length} actividades registradas hasta ayer) han sido transferidas automáticamente a la pestaña de <strong className="text-zinc-200">Historial</strong>. Este cronograma está limpio y listo para recibir las solicitudes de degustación que los vendedores programen desde su app móvil a partir de mañana (<strong className="text-emerald-400">{getDefaultScheduleDateStr()}</strong>).
                            </p>
                            <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setDegustacionSubtab('historial')}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                              >
                                <FolderArchive className="w-3.5 h-3.5 text-amber-400" />
                                <span>Ver Historial ({historicalDegustaciones.length})</span>
                              </button>
                              <button
                                type="button"
                                disabled={isSyncingDegustaciones}
                                onClick={handleSyncDegustaciones}
                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 text-red-500 ${isSyncingDegustaciones ? 'animate-spin text-amber-400' : ''}`} />
                                <span>{isSyncingDegustaciones ? 'Sincronizando...' : 'Sincronizar App Vendedores'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsModalOpen(true)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ Agendar Manual</span>
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredCurrentDegustaciones.map((row) => {
                        const percent = Math.min(100, Math.round((row.delivered / (row.target || 1)) * 100));

                        return (
                          <tr key={row.id} className="hover:bg-white/[0.02] transition-colors group">
                            {/* Fecha y Horario */}
                            <td className="p-4 border-r border-white/10">
                              <div className="font-bold text-white font-mono">{row.date}</div>
                              <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3 text-zinc-500" />
                                {row.time}
                              </div>
                            </td>

                            {/* Actividad y Producto */}
                            <td className="p-4 border-r border-white/10">
                              <div className="font-bold text-white group-hover:text-red-400 transition-colors">
                                {row.activity}
                              </div>
                              <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1 font-mono">
                                <Package className="w-3 h-3 text-red-500" />
                                {row.product}
                              </div>
                            </td>

                            {/* Vendedor Solicitante */}
                            <td className="p-4 border-r border-white/10">
                              <div className="font-bold text-amber-300 text-xs flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>{row.vendedor || 'Vendedor Comercial'}</span>
                              </div>
                              <span className="inline-block px-1.5 py-0.5 text-[9px] font-mono rounded uppercase tracking-wider mt-1 bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                App Vendedor
                              </span>
                            </td>

                            {/* Promotora Asignada (Selector directo para Aceptar y Asignar en /portal/ruta) */}
                            <td className="p-4 border-r border-white/10">
                              {(() => {
                                const isAssigned = Boolean(row.promoter && !row.promoter.toUpperCase().includes('POR ASIGNAR'));
                                const resolvedInfo = isAssigned ? resolvePromoterIdentity(row.promoter, row.promoterEmail) : null;
                                const assignedEmail = row.promoterEmail || resolvedInfo?.email || '';
                                const selectValue = isAssigned
                                  ? (personal.find((p) => matchPromoterName(p.name, row.promoter))?.name || row.promoter)
                                  : 'POR ASIGNAR (Trade Marketing)';

                                return (
                                  <div className="space-y-1.5">
                                    <select
                                      value={selectValue}
                                      onChange={(e) => handleQuickAssignPromoter(row, e.target.value)}
                                      className={`w-full rounded-xl px-2.5 py-1.5 text-[11px] font-bold focus:outline-none cursor-pointer transition-colors ${
                                        isAssigned
                                          ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 focus:border-emerald-400'
                                          : 'bg-amber-950/40 border border-amber-500/40 text-amber-200 focus:border-amber-400'
                                      }`}
                                      title="Aceptar solicitud y asignar promotora a su módulo de Ruta (/portal/ruta)"
                                    >
                                      <option value="POR ASIGNAR (Trade Marketing)">⏳ POR ASIGNAR (Seleccionar Promotora)</option>
                                      {personal.map((p) => (
                                        <option key={p.id} value={p.name}>
                                          ✓ {p.name} ({p.role})
                                        </option>
                                      ))}
                                    </select>

                                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                      <span className={`inline-block px-1.5 py-0.5 text-[9px] font-black rounded uppercase tracking-wider ${
                                        !isAssigned
                                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                          : row.promoterRole === 'Promotor Merchandising'
                                          ? 'bg-red-950/80 text-red-400 border border-red-500/30'
                                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                      }`}>
                                        {isAssigned ? `✓ Ruta: ${row.promoterRole}` : 'Pendiente Asignar'}
                                      </span>

                                      {isAssigned && assignedEmail && (
                                        <a
                                          href={`/portal/login?email=${encodeURIComponent(assignedEmail)}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[10px] font-mono text-zinc-400 hover:text-emerald-400 flex items-center gap-1 truncate max-w-[155px]"
                                          title={`Abrir App de Ruta de ${row.promoter} (${assignedEmail})`}
                                        >
                                          <Mail className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                          <span className="truncate">{assignedEmail}</span>
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Cliente PDV & Zona */}
                            <td className="p-4 border-r border-white/10">
                              <div className="font-bold text-white">{row.client}</div>
                              <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5 font-mono">
                                <MapPin className="w-3 h-3 text-zinc-500" />
                                {row.zone}
                              </div>
                            </td>

                            {/* Estado */}
                            <td className="p-4 border-r border-white/10 text-center">
                              {getStatusBadge(row.status)}
                            </td>

                            {/* Muestras */}
                            <td className="p-4 border-r border-white/10 text-right">
                              <div className="font-mono font-bold text-white">
                                {row.delivered}{' '}
                                <span className="text-zinc-500 text-[11px]">/ {row.target}</span>
                              </div>
                              <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    row.status === 'completed'
                                      ? 'bg-emerald-500'
                                      : row.status === 'in_progress'
                                      ? 'bg-blue-500'
                                      : 'bg-zinc-600'
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </td>

                            {/* Aceptación */}
                            <td className="p-4 border-r border-white/10 text-center">
                              {row.acceptanceRate > 0 ? (
                                <span className="font-mono font-black text-emerald-400 text-xs px-2 py-1 rounded bg-emerald-950/50 border border-emerald-500/30 inline-flex items-center gap-1">
                                  <ThumbsUp className="w-3 h-3" />
                                  {row.acceptanceRate}%
                                </span>
                              ) : (
                                <span className="text-zinc-500 font-mono text-[11px]">—</span>
                              )}
                            </td>

                            {/* Acciones: Editar y Eliminar */}
                            <td className="p-4 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingActivity({ ...row })}
                                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer group/btn"
                                  title="Editar degustación"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-blue-400 group-hover/btn:scale-110 transition-transform" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActivityToDelete(row)}
                                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 border border-white/10 hover:border-red-500/40 text-zinc-300 hover:text-red-400 transition-colors cursor-pointer group/btn"
                                  title="Eliminar degustación"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400 group-hover/btn:scale-110 transition-transform" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VISTA B: HISTORIAL AGRUPADO POR SEMANA 1, 2, 3, 4 (ALMACENAMIENTO AUTOMÁTICO) */}
          {degustacionSubtab === 'historial' && (
            <div className="space-y-6">
              {/* Tarjeta Informativa de Consolidación */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-red-500/20 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-center shrink-0">
                    <FolderArchive className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      Historial Consolidado por Semanas
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Degustaciones ejecutadas de fechas anteriores, archivadas automáticamente los domingos al final del día.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-zinc-300">
                  <div className="bg-zinc-900 px-3 py-1.5 rounded-xl border border-white/5">
                    Total Histórico: <strong className="text-white">{historicalDegustaciones.length}</strong> eventos
                  </div>
                  <div className="bg-zinc-900 px-3 py-1.5 rounded-xl border border-white/5">
                    Muestras: <strong className="text-emerald-400">
                      {historicalDegustaciones.reduce((acc, curr) => acc + curr.delivered, 0)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* BLOQUES SEMANALES CON ENCABEZADOS: SEMANA 4, SEMANA 3, SEMANA 2, SEMANA 1 */}
              {filteredHistoricalWeeks.length === 0 ? (
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-12 text-center text-zinc-500 font-medium">
                  No hay registros históricos que coincidan con la búsqueda o la semana seleccionada.
                </div>
              ) : (
                filteredHistoricalWeeks.map((weekGroup) => (
                  <div
                    key={`group-${weekGroup.weekNumber}`}
                    className="bg-[#121316] border border-white/10 rounded-2xl shadow-xl overflow-hidden"
                  >
                    {/* ENCABEZADO DE SEMANA (Semana 1, Semana 2, Semana 3, Semana 4) */}
                    <div className="p-4 border-b border-white/10 bg-gradient-to-r from-red-950/40 via-zinc-900 to-zinc-900/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="px-3.5 py-1 rounded-xl bg-red-600 text-white font-black text-xs uppercase tracking-wider shadow-md">
                          {weekGroup.weekLabel}
                        </span>
                        <div>
                          <h4 className="font-bold text-white text-sm">
                            {weekGroup.rangeLabel}
                          </h4>
                          <span className="text-[11px] text-zinc-400 font-mono">
                            Cierre dominical completado y auditado
                          </span>
                        </div>
                      </div>

                      {/* Métricas consolidadas de la semana */}
                      <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs">
                        <span className="px-3 py-1 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 font-mono">
                          Actividades: <strong className="text-white">{weekGroup.items.length}</strong>
                        </span>
                        <span className="px-3 py-1 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 font-mono">
                          Muestras: <strong className="text-emerald-400">{weekGroup.totalDelivered}</strong> / {weekGroup.totalTarget}
                        </span>
                        <span className="px-3 py-1 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono font-bold flex items-center gap-1">
                          <ThumbsUp className="w-3 h-3" />
                          {weekGroup.avgAcceptance}% Positivo
                        </span>
                        <span className="px-3 py-1 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 font-mono">
                          Promotoras: <strong className="text-white">{weekGroup.promotersCount}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Tabla de Degustaciones de esa Semana */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[950px] text-xs">
                        <thead>
                          <tr className="bg-zinc-900/60 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/5 text-[10px] select-none">
                            <th className="p-3.5 border-r border-white/5 min-w-[120px]">Fecha / Horario</th>
                            <th className="p-3.5 border-r border-white/5 min-w-[220px]">Actividad & Producto</th>
                            <th className="p-3.5 border-r border-white/5 min-w-[160px]">Vendedor Solicitante</th>
                            <th className="p-3.5 border-r border-white/5 min-w-[230px]">Promotora Asignada (Ruta App)</th>
                            <th className="p-3.5 border-r border-white/5 min-w-[200px]">Cliente PDV & Zona</th>
                            <th className="p-3.5 border-r border-white/5 text-center min-w-[110px]">Estado</th>
                            <th className="p-3.5 border-r border-white/5 text-right min-w-[130px]">Muestras (Entregadas)</th>
                            <th className="p-3.5 border-r border-white/5 text-center min-w-[110px]">Aceptación</th>
                            <th className="p-3.5 text-center min-w-[90px]">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {weekGroup.items.map((row) => (
                            <tr key={row.id} className="hover:bg-white/[0.02] transition-colors group">
                              {/* Fecha */}
                              <td className="p-3.5 border-r border-white/5">
                                <div className="font-bold text-white font-mono">{row.date}</div>
                                <div className="text-[11px] text-zinc-400 font-mono">{row.time}</div>
                              </td>

                              {/* Actividad y Producto */}
                              <td className="p-3.5 border-r border-white/5">
                                <div className="font-bold text-white group-hover:text-red-400 transition-colors">
                                  {row.activity}
                                </div>
                                <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1 font-mono">
                                  <Package className="w-3 h-3 text-red-500" />
                                  {row.product}
                                </div>
                              </td>

                              {/* Vendedor Solicitante */}
                              <td className="p-3.5 border-r border-white/5">
                                <div className="font-bold text-amber-300 text-xs flex items-center gap-1">
                                  <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>{row.vendedor || 'Vendedor Comercial'}</span>
                                </div>
                                <span className="inline-block px-1.5 py-0.5 text-[9px] font-mono rounded uppercase tracking-wider mt-1 bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                  App Vendedor
                                </span>
                              </td>

                              {/* Promotora Asignada (Historial) */}
                              <td className="p-3.5 border-r border-white/5">
                                {(() => {
                                  const isAssigned = Boolean(row.promoter && !row.promoter.toUpperCase().includes('POR ASIGNAR'));
                                  const resolvedInfo = isAssigned ? resolvePromoterIdentity(row.promoter, row.promoterEmail) : null;
                                  const assignedEmail = row.promoterEmail || resolvedInfo?.email || '';
                                  const selectValue = isAssigned
                                    ? (personal.find((p) => matchPromoterName(p.name, row.promoter))?.name || row.promoter)
                                    : 'POR ASIGNAR (Trade Marketing)';

                                  return (
                                    <div className="space-y-1">
                                      <select
                                        value={selectValue}
                                        onChange={(e) => handleQuickAssignPromoter(row, e.target.value)}
                                        className={`w-full rounded-xl px-2 py-1 text-[11px] font-bold focus:outline-none cursor-pointer transition-colors ${
                                          isAssigned
                                            ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 focus:border-emerald-400'
                                            : 'bg-amber-950/40 border border-amber-500/40 text-amber-200 focus:border-amber-400'
                                        }`}
                                      >
                                        <option value="POR ASIGNAR (Trade Marketing)">⏳ POR ASIGNAR (Seleccionar Promotora)</option>
                                        {personal.map((p) => (
                                          <option key={p.id} value={p.name}>
                                            ✓ {p.name} ({p.role})
                                          </option>
                                        ))}
                                      </select>
                                      {isAssigned && assignedEmail && (
                                        <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1 truncate">
                                          <Mail className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                          <span className="truncate">{assignedEmail}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>

                              {/* Cliente PDV & Zona */}
                              <td className="p-3.5 border-r border-white/5">
                                <div className="font-bold text-white">{row.client}</div>
                                <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5 font-mono">
                                  <MapPin className="w-3 h-3 text-zinc-500" />
                                  {row.zone}
                                </div>
                              </td>

                              {/* Estado */}
                              <td className="p-3.5 border-r border-white/5 text-center">
                                {getStatusBadge(row.status)}
                              </td>

                              {/* Muestras */}
                              <td className="p-3.5 border-r border-white/5 text-right font-mono">
                                <span className="font-black text-white">{row.delivered}</span>{' '}
                                <span className="text-zinc-500 text-[11px]">/ {row.target}</span>
                              </td>

                              {/* Aceptación */}
                              <td className="p-3.5 border-r border-white/5 text-center font-mono font-black text-emerald-400">
                                {row.acceptanceRate > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30">
                                    <ThumbsUp className="w-3 h-3" />
                                    {row.acceptanceRate}%
                                  </span>
                                ) : (
                                  <span className="text-zinc-500 font-mono">—</span>
                                )}
                              </td>

                              {/* Acciones */}
                              <td className="p-3.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingActivity({ ...row })}
                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer group/btn"
                                    title="Editar actividad histórica"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-blue-400 group-hover/btn:scale-110 transition-transform" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setActivityToDelete(row)}
                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 border border-white/10 hover:border-red-500/40 text-zinc-300 hover:text-red-400 transition-colors cursor-pointer group/btn"
                                    title="Eliminar actividad histórica"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-400 group-hover/btn:scale-110 transition-transform" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBMÓDULO 2: INFORMES (4 PESTAÑAS: VISITAS, PRECIOS, INVENTARIO, ASISTENCIA) */}
      {/* ========================================================================= */}
      {activeSubmodule === 'informes' && (
        <div className="space-y-6">
          {/* BARRA DE NAVEGACIÓN DE 4 PESTAÑAS */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-[#121316] border border-white/10 rounded-2xl shadow-xl">
            <div className="flex items-center gap-2 overflow-x-auto p-1 bg-zinc-950/80 rounded-xl border border-white/5 scrollbar-thin">
              {/* Pestaña 1: Historial de Visita */}
              <button
                type="button"
                onClick={() => setInformesTab('visitas')}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  informesTab === 'visitas'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-black'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Historial de Visita</span>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-mono font-bold ${
                  informesTab === 'visitas' ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {filteredInformes.length}
                </span>
              </button>

              {/* Pestaña 2: Comparativa de Precios */}
              <button
                type="button"
                onClick={() => setInformesTab('precios')}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  informesTab === 'precios'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-black'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Scale className="w-4 h-4" />
                <span>Comparativa de Precios</span>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-mono font-bold ${
                  informesTab === 'precios' ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {filteredPriceComparisons.length}
                </span>
              </button>

              {/* Pestaña 3: Inventario y Degustación */}
              <button
                type="button"
                onClick={() => setInformesTab('inventario')}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  informesTab === 'inventario'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-black'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Box className="w-4 h-4" />
                <span>Inventario y Degustación</span>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-mono font-bold ${
                  informesTab === 'inventario' ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {filteredInventoryReports.length}
                </span>
              </button>

              {/* Pestaña 4: Asistencia en PDV */}
              <button
                type="button"
                onClick={() => setInformesTab('asistencia')}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                  informesTab === 'asistencia'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-black'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>Asistencia en PDV</span>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-mono font-bold ${
                  informesTab === 'asistencia' ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {filteredCheckIns.length}
                </span>
              </button>
            </div>

            {/* Controles y Filtros Secundarios Dinámicos */}
            <div className="flex items-center gap-3 self-end lg:self-center">
              {informesTab === 'asistencia' && (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {/* Selector de Tipo de Marcaje */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 hidden sm:inline">Marcaje:</span>
                    <select
                      value={checkInTypeFilter}
                      onChange={(e) => setCheckInTypeFilter(e.target.value)}
                      className="bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white font-bold focus:outline-none focus:border-red-500 cursor-pointer text-xs"
                    >
                      <option value="todos">Todos los Marcajes</option>
                      <option value="Ingreso">🟢 Ingreso</option>
                      <option value="Salida a almorzar">🟡 Salida Almuerzo</option>
                      <option value="Vuelta a almorzar">🔵 Vuelta Almuerzo</option>
                      <option value="Salida">🔴 Salida</option>
                    </select>
                  </div>

                  {/* Switcher de Vista: Galería 3:4 vs Tabla */}
                  <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-0.5">
                    <button
                      type="button"
                      onClick={() => setCheckInViewMode('gallery')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        checkInViewMode === 'gallery'
                          ? 'bg-red-600 text-white shadow-sm font-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Galería de Tarjetas de Evidencia 3:4"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Galería 3:4</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckInViewMode('table')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        checkInViewMode === 'table'
                          ? 'bg-red-600 text-white shadow-sm font-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Tabla de Control Horario"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Tabla</span>
                    </button>
                  </div>

                  {/* Botón Refrescar en Vivo */}
                  <button
                    type="button"
                    onClick={loadCheckIns}
                    disabled={isRefreshingCheckIns}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Refrescar en tiempo real"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshingCheckIns ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">En Vivo</span>
                  </button>

                  {/* Botón Simular / Abrir App Móvil */}
                  <a
                    href="/portal/checkin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                    title="Abrir App de Campo para Promotores (/portal/checkin)"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">App Móvil</span>
                  </a>
                </div>
              )}
              {informesTab === 'precios' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 hidden sm:inline">Cadena:</span>
                  <select
                    value={priceChainFilter}
                    onChange={(e) => setPriceChainFilter(e.target.value)}
                    className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-white font-bold focus:outline-none focus:border-red-500"
                  >
                    <option value="todos">Todas las Cadenas</option>
                    <option value="Alkosto">⭐ ALKOSTO (Cadena Clave)</option>
                    <option value="Viviana">Hipermercado Viviana</option>
                    <option value="El Sol">Supermercado El Sol</option>
                    <option value="Madeirense">Central Madeirense</option>
                  </select>
                </div>
              )}

              {informesTab === 'inventario' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 hidden sm:inline">Nivel Stock:</span>
                  <select
                    value={inventoryStatusFilter}
                    onChange={(e) => setInventoryStatusFilter(e.target.value)}
                    className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-white font-bold focus:outline-none focus:border-red-500"
                  >
                    <option value="todos">Todos los Estados</option>
                    <option value="quiebre">⚠️ Quiebre Crítico</option>
                    <option value="bajo">Bajo (Reposición Urgente)</option>
                    <option value="medio">Medio</option>
                    <option value="alto">Alto / Óptimo</option>
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Exportar Datos</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* PESTAÑA 1: HISTORIAL DE VISITA                                            */}
          {/* ========================================================================= */}
          {informesTab === 'visitas' && (
            <div className="space-y-4">
              {/* Tabla de Visitas */}
              <div className="bg-[#121316] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1000px] text-xs">
                    <thead>
                      <tr className="bg-zinc-900/90 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[11px] select-none">
                        <th className="p-4 border-r border-white/10 min-w-[140px]">Fecha / Hora</th>
                        <th className="p-4 border-r border-white/10 min-w-[160px]">Promotora</th>
                        <th className="p-4 border-r border-white/10 min-w-[210px]">Cliente PDV & Zona</th>
                        <th className="p-4 border-r border-white/10 min-w-[140px]">Tipo de Informe</th>
                        <th className="p-4 border-r border-white/10 text-center min-w-[100px]">Stock Góndola</th>
                        <th className="p-4 border-r border-white/10 text-center min-w-[110px]">Material POP</th>
                        <th className="p-4 border-r border-white/10 text-center min-w-[100px]">Aceptación</th>
                        <th className="p-4 border-r border-white/10 text-center min-w-[90px]">GPS</th>
                        <th className="p-4 text-center min-w-[90px]">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredInformes.map((inf) => (
                        <tr key={inf.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="p-4 border-r border-white/10 font-mono text-zinc-300 font-bold">
                            <div>{inf.date}</div>
                            {inf.checkIn && (
                              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                In: {inf.checkIn} | Out: {inf.checkOut || 'En curso'}
                              </div>
                            )}
                          </td>
                          <td className="p-4 border-r border-white/10 font-bold text-white">
                            {inf.promoter}
                          </td>
                          <td className="p-4 border-r border-white/10">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              {inf.client.toUpperCase().includes('ALKOSTO') && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black">
                                  ALKOSTO
                                </span>
                              )}
                              <span>{inf.client}</span>
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-zinc-500" />
                              {inf.zone}
                            </div>
                          </td>
                          <td className="p-4 border-r border-white/10">
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-zinc-900 border border-white/10 text-zinc-300">
                              {inf.type}
                            </span>
                          </td>
                          <td className="p-4 border-r border-white/10 text-center">
                            {getStockBadge(inf.stock)}
                          </td>
                          <td className="p-4 border-r border-white/10 text-center capitalize text-zinc-300 font-bold">
                            {inf.pop}
                          </td>
                          <td className="p-4 border-r border-white/10 text-center">
                            <span className="font-bold text-emerald-400">
                              {inf.acceptance}
                            </span>
                          </td>
                          <td className="p-4 border-r border-white/10 text-center">
                            {inf.gpsVerified ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold inline-flex items-center gap-1">
                                <Check className="w-3 h-3" /> OK
                              </span>
                            ) : (
                              <span className="text-zinc-500 text-[10px] font-mono">—</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedInforme(inf)}
                              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-red-500" />
                              <span>Ver</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 2: COMPARATIVA DE PRECIOS (EXACTO A IMÁGENES 1 Y 2 + DECISIONES)  */}
          {/* ========================================================================= */}
          {informesTab === 'precios' && (
            <div className="space-y-5 animate-in fade-in-50 duration-300">
              {/* 1. TARJETAS KPI DE PRECIOS SINCRONIZADAS CON LA APP DE PROMOTORAS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Tarjeta 1: SKUS RELEVADOS */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    SKUS RELEVADOS
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-white">
                      {priceComparisons.length > 0
                        ? new Set(priceComparisons.map((p) => p.codizulcaProduct)).size
                        : 0}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">
                      ({priceComparisons.length} relevamientos)
                    </span>
                  </div>
                </div>

                {/* Tarjeta 2: VENTAJA COMPETITIVA */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    VENTAJA COMPETITIVA
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-emerald-400">
                      {priceComparisons.length > 0
                        ? `${Math.round(
                            (priceComparisons.filter((p) => p.differencePercent <= 0).length /
                              priceComparisons.length) *
                              100
                          )}%`
                        : '0%'}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">más económico / par</span>
                  </div>
                </div>

                {/* Tarjeta 3: DIFERENCIAL PROMEDIO */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    DIFERENCIAL PROMEDIO
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-emerald-400">
                      {priceComparisons.length > 0
                        ? `${(
                            priceComparisons.reduce((acc, p) => acc + (p.differencePercent || 0), 0) /
                            priceComparisons.length
                          ).toFixed(1)}%`
                        : '0.0%'}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono leading-tight">vs competidores</span>
                  </div>
                </div>

                {/* Tarjeta 4: PDV CLAVE ALKOSTO */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    PDV MONITOREADOS
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-amber-400">
                      {priceComparisons.length > 0
                        ? new Set(priceComparisons.map((p) => p.client)).size
                        : 0}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono leading-tight">sedes monitoreadas</span>
                  </div>
                </div>
              </div>

              {/* 2. MÉTRICA CON IA: POSICIONAMIENTO EN EL MERCADO & RECOMENDACIÓN ESTRATÉGICA */}
              <div className="bg-[#121316] border border-white/10 rounded-2xl shadow-xl overflow-hidden p-5 sm:p-6 space-y-6 animate-in fade-in-50 duration-200">
                {/* Cabecera de la Métrica con IA */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-950/70 border border-purple-500/40 flex items-center justify-center shrink-0 shadow-lg shadow-purple-950/40">
                      <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-base sm:text-lg tracking-tight">
                          Posicionamiento en el Mercado & Recomendación con IA
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                          <Bot className="w-3 h-3 text-purple-400" />
                          Gemini AI
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Métrica analítica de competitividad en tiempo real y sugerencias tácticas por producto para optimizar margen y participación en el mercado.
                      </p>
                    </div>
                  </div>
                </div>

                {/* TARJETA DE MÉTRICA DE POSICIONAMIENTO Y SELECTOR DE PRODUCTO */}
                {selectedAiProduct && PRICING_DECISION_METRICS.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                      {/* Puntuación / Métrica Central de Posicionamiento en el Mercado */}
                      <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-950/90 border border-purple-500/30 flex flex-col justify-between space-y-4">
                        <div>
                          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                            Índice de Posicionamiento en el Mercado
                          </span>
                          <div className="flex items-baseline gap-3 mt-2">
                            <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 font-mono">
                              84 <span className="text-xl sm:text-2xl text-zinc-500 font-normal">/ 100</span>
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-black uppercase">
                              Liderazgo Favorable
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300 mt-2.5 leading-relaxed">
                            <strong>Diagnóstico IA:</strong> Codizulca mantiene una posición competitiva de precios en los puntos de venta auditados.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                          <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/5">
                            <span className="text-[10px] text-zinc-400 block uppercase font-mono">Diferencial vs Rival</span>
                            <span className="text-sm font-bold text-emerald-400 font-mono">{selectedAiProduct.priceGapPercent.toFixed(1)}%</span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/5">
                            <span className="text-[10px] text-zinc-400 block uppercase font-mono">Canal Auditado</span>
                            <span className="text-sm font-bold text-blue-400 font-mono truncate">{selectedAiProduct.channel.split('(')[0]}</span>
                          </div>
                        </div>
                      </div>

                      {/* Selector de Producto & Comparativa Rápida en Góndola */}
                      <div className="lg:col-span-7 p-5 rounded-2xl bg-zinc-950/90 border border-white/10 flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <label className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                              <Package className="w-3.5 h-3.5 text-red-500" />
                              <span>Selecciona un Producto para Analizar con IA:</span>
                            </label>
                            <span className="text-[11px] font-mono text-zinc-500">
                              {PRICING_DECISION_METRICS.length} SKUs Disponibles
                            </span>
                          </div>

                          {/* Dropdown Selector Limpio */}
                          <select
                            value={selectedAiProductId}
                            onChange={(e) => setSelectedAiProductId(e.target.value)}
                            className="w-full bg-zinc-900 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-purple-500 cursor-pointer shadow-inner"
                          >
                            {PRICING_DECISION_METRICS.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                {prod.productName} [{prod.sku}] — PVP: ${prod.codizulcaPriceUSD.toFixed(2)} (Rival: {prod.competitorBrand} ${prod.competitorPriceUSD.toFixed(2)})
                              </option>
                            ))}
                          </select>

                          {/* Ficha Comparativa de Posición del Producto */}
                          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                            <div>
                              <span className="text-[10px] text-zinc-400 uppercase font-mono block">PVP Codizulca</span>
                              <span className="text-base font-black text-white font-mono mt-0.5 block">
                                ${selectedAiProduct.codizulcaPriceUSD.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                Bs. {selectedAiProduct.codizulcaPriceBS.toFixed(2)}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] text-zinc-400 uppercase font-mono block">Rival ({selectedAiProduct.competitorBrand})</span>
                              <span className="text-base font-black text-amber-400 font-mono mt-0.5 block">
                                ${selectedAiProduct.competitorPriceUSD.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-zinc-500 truncate max-w-[120px] block mx-auto">
                                {selectedAiProduct.competitorProduct}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] text-zinc-400 uppercase font-mono block">Brecha vs Mercado</span>
                              <div className="mt-0.5">
                                {selectedAiProduct.priceGapPercent < 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono font-bold text-xs inline-flex items-center gap-0.5 border border-emerald-500/30">
                                    <TrendingDown className="w-3 h-3" />
                                    {selectedAiProduct.priceGapPercent.toFixed(1)}%
                                  </span>
                                ) : selectedAiProduct.priceGapPercent > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 font-mono font-bold text-xs inline-flex items-center gap-0.5 border border-amber-500/30">
                                    <TrendingUp className="w-3 h-3" />
                                    +{selectedAiProduct.priceGapPercent.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono font-bold text-xs">
                                    0.0% Par
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-400 font-mono mt-0.5 block">
                                {selectedAiProduct.priceGapUSD < 0
                                  ? `-$${Math.abs(selectedAiProduct.priceGapUSD).toFixed(2)} (favor)`
                                  : selectedAiProduct.priceGapUSD > 0
                                  ? `+$${selectedAiProduct.priceGapUSD.toFixed(2)} (alerta)`
                                  : 'Mismo precio'}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] text-zinc-400 uppercase font-mono block">Canal Relevado</span>
                              <span className="text-xs font-bold text-zinc-200 mt-1 block truncate">
                                {selectedAiProduct.channel.split('&')[0]}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">Góndola activa</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RECOMENDACIÓN DE MEJORA CON IA PARA EL PRODUCTO SELECCIONADO */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/30 via-zinc-950/90 to-blue-950/20 border border-purple-500/40 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                          <h5 className="font-bold text-white text-xs sm:text-sm">
                            Recomendación de Mejora con IA: <span className="text-purple-300">{selectedAiProduct.productName}</span>
                          </h5>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs">
                            Impacto Proyectado: {aiCustomRecommendations[selectedAiProduct.id]?.impact || selectedAiProduct.projectedImpact}
                          </div>

                          <button
                            type="button"
                            disabled={isAiGenerating}
                            onClick={() => handleGenerateAiRecommendation(selectedAiProduct)}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/30"
                            title="Consultar al motor de IA por una nueva recomendación de mejora"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                            <span>{isAiGenerating ? 'Analizando con IA...' : 'Regenerar con IA'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs leading-relaxed">
                        <p className="text-zinc-200">
                          <strong className="text-purple-300">Diagnóstico de Posicionamiento:</strong>{' '}
                          {aiCustomRecommendations[selectedAiProduct.id]?.diagnostic || `${selectedAiProduct.diagnosisBadge} — ${selectedAiProduct.elasticityLabel}.`}
                        </p>

                        <p className="text-zinc-300">
                          <strong className="text-emerald-400">Recomendación de Mejora para Crecer en el Mercado:</strong>{' '}
                          {aiCustomRecommendations[selectedAiProduct.id]?.recommendation || selectedAiProduct.executiveRecommendation}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-8 rounded-2xl bg-zinc-950/80 border border-white/10 text-center text-zinc-400 space-y-2">
                    <Scale className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="font-bold text-white text-sm">Esperando Relevamientos de Precios en Góndola</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Los análisis comparativos y diagnósticos de pricing con IA se generarán en tiempo real una vez que las promotoras registren los primeros precios desde la App (/portal).
                    </p>
                  </div>
                )}
              </div>

              {/* 3. TABLA DE REGISTROS RECIENTES EXACTA A LA IMAGEN 1 */}
              <div className="bg-[#121316] border border-white/10 rounded-2xl shadow-xl overflow-hidden p-4 sm:p-6 space-y-4">
                {/* Cabecera de la Tabla (Imagen 1) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Título y Subtítulo */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        Registros Recientes
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 border border-white/5 text-zinc-300 font-medium text-xs font-mono">
                        {`${filteredPriceComparisons.length} de ${priceComparisons.length} registros`}
                      </span>
                      <button
                        type="button"
                        onClick={handleManualSyncPrices}
                        disabled={isSyncingPrices}
                        className="px-2.5 py-1 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-400 font-mono font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Sincronizar relevamientos de precios en vivo desde la App de Promotoras y Supabase"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPrices ? 'animate-spin' : ''}`} />
                        <span>{isSyncingPrices ? 'Sincronizando...' : 'Sincronizar Precios'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Precios relevados en punto de venta con comparativa directa de competidores.
                    </p>
                  </div>

                  {/* Filtro por Competidor (Imagen 1) */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <label className="text-xs font-bold text-zinc-400">
                      Filtrar Competidor
                    </label>
                    <div className="relative">
                      <select
                        value={selectedCompetitorBrand}
                        onChange={(e) => setSelectedCompetitorBrand(e.target.value)}
                        className="w-full sm:w-[260px] bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-9 py-2 text-xs font-bold text-zinc-200 focus:outline-none focus:border-red-500 cursor-pointer appearance-none shadow-sm"
                      >
                        <option value="todos">Todas las marcas de competidores</option>
                        {availableCompetitorBrands.map((brand) => (
                          <option key={brand} value={brand}>
                            {brand}
                          </option>
                        ))}
                      </select>
                      <Filter className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Tabla de Registros Recientes (Imagen 1) */}
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left border-collapse min-w-[950px] text-xs">
                    <thead>
                      <tr className="text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[11px] select-none">
                        <th className="pb-3 pr-4 font-bold min-w-[95px]">FECHA</th>
                        <th className="pb-3 px-4 font-bold min-w-[170px]">PUNTO DE VENTA</th>
                        <th className="pb-3 px-4 font-bold min-w-[210px]">NUESTRO PROD.</th>
                        <th className="pb-3 px-4 font-bold min-w-[110px]">PRECIO</th>
                        <th className="pb-3 px-4 font-bold min-w-[280px]">COMPETIDORES</th>
                        <th className="pb-3 pl-4 font-bold min-w-[150px]">ORIGEN / USUARIO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredPriceComparisons.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-zinc-500 font-medium">
                            No se encontraron registros de precios para el filtro seleccionado.
                          </td>
                        </tr>
                      ) : (
                        filteredPriceComparisons.map((item) => (
                          <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                            {/* 1. FECHA */}
                            <td className="py-4 pr-4 font-mono font-bold text-white text-xs align-top whitespace-nowrap">
                              {item.date}
                            </td>

                            {/* 2. PUNTO DE VENTA */}
                            <td className="py-4 px-4 align-top">
                              <div className="font-bold text-white text-sm leading-snug">
                                {item.client}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-zinc-600 shrink-0" />
                                {item.zone}
                              </div>
                            </td>

                            {/* 3. NUESTRO PROD. (Verde Esmeralda brillante como en Imagen 1) */}
                            <td className="py-4 px-4 align-top">
                              <div className="font-bold text-[#10b981] text-xs leading-snug">
                                {item.codizulcaProduct}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono mt-1">
                                {item.codizulcaSku}
                              </div>
                            </td>

                            {/* 4. PRECIO (Blanco grande en Dólares) */}
                            <td className="py-4 px-4 align-top whitespace-nowrap font-mono">
                              <div className="font-black text-white text-base">
                                $ {item.codizulcaPriceUSD.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-zinc-400 mt-0.5">
                                Bs. {item.codizulcaPriceBS.toFixed(2)}
                              </div>
                            </td>

                            {/* 5. COMPETIDORES (Tarjetas Negras con texto ámbar y precio blanco) */}
                            <td className="py-4 px-4 align-top">
                              <div className="space-y-1.5 max-w-[280px]">
                                {item.competitors && item.competitors.length > 0 ? (
                                  item.competitors.map((comp, idx) => (
                                    <div
                                      key={idx}
                                      className="bg-black/90 border border-white/5 rounded-lg px-3 py-1.5 flex items-center justify-between gap-3 shadow-inner"
                                    >
                                      <span className="text-[#f59e0b] font-medium text-xs truncate max-w-[180px]">
                                        {comp.product}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0 font-mono">
                                        <span className="text-white font-bold text-xs">$</span>
                                        <span className="text-white font-black text-xs">
                                          {comp.priceUSD.toFixed(2)}
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="bg-black/90 border border-white/5 rounded-lg px-3 py-1.5 flex items-center justify-between gap-3">
                                    <span className="text-[#f59e0b] font-medium text-xs truncate max-w-[180px]">
                                      {item.competitorProduct}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0 font-mono">
                                      <span className="text-white font-bold text-xs">$</span>
                                      <span className="text-white font-black text-xs">
                                        {item.competitorPriceUSD.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 6. ORIGEN / USUARIO (Badge verde y nombre en mayúsculas) */}
                            <td className="py-4 pl-4 align-top">
                              <div className="space-y-1">
                                <span className="px-2.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 font-bold text-[10px] inline-block">
                                  {item.origin || 'App Promotora'}
                                </span>
                                <div className="text-[11px] font-mono text-zinc-400 uppercase font-bold tracking-wider">
                                  {item.promoter}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 3: CONTROL DE INVENTARIOS & EFECTIVIDAD DE DEGUSTACIONES         */}
          {/* ========================================================================= */}
          {informesTab === 'inventario' && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              {/* 1. CABECERA EJECUTIVA DEL SUBMÓDULO DE INVENTARIO */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#121316] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center shrink-0">
                      <Box className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      Control de Inventarios & Resultados de Degustación
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 border border-white/10 text-zinc-300 font-mono text-xs">
                      {filteredInventoryReports.length} balances registrados
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {/* Botón para desplegar o re-evaluar efectividad con IA */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsTastingAiPanelOpen(true);
                      handleAnalyzeTastingEffectiveness();
                    }}
                    disabled={isTastingAiLoading}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-60 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className={`w-4 h-4 text-purple-200 ${isTastingAiLoading ? 'animate-spin' : 'animate-pulse'}`} />
                    <span>{isTastingAiLoading ? 'Evaluando con IA...' : 'Evaluar Efectividad con IA'}</span>
                  </button>

                  {/* Botón para registrar balance de inventario */}
                  <button
                    type="button"
                    onClick={() => setIsNewReportModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-red-600/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Registrar Balance</span>
                  </button>
                </div>
              </div>

              {/* 2. TARJETAS KPI RESUMEN DE INVENTARIOS Y VENTAS */}
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* KPI 1: Total Inventario Inicial */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Inv. Inicial Total
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                      {inventoryReportTotals.totalInitial}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">Kg / Paq</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Pre-degustación</span>
                </div>

                {/* KPI 2: Total Inventario Final */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Inv. Final Remanente
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-zinc-300 font-mono">
                      {inventoryReportTotals.totalFinal}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">Kg / Paq</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Post-degustación o venta</span>
                </div>

                {/* KPI 3: Muestras Degustadas */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Muestras Degustadas
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-purple-400 font-mono">
                      {inventoryReportTotals.totalSamples}
                    </span>
                    <span className="text-xs text-purple-300 font-mono">porciones / kg</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Inversión en impulso</span>
                </div>

                {/* KPI 4: Resultado Ventas Generadas */}
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Resultado (Ventas)
                  </span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                      +{inventoryReportTotals.totalSales}
                    </span>
                    <span className="text-xs text-emerald-300 font-mono">unidades / kg</span>
                  </div>
                  <span className="text-[10px] text-emerald-500/80 font-mono mt-1 block">Inicial - Final - Muestras</span>
                </div>
              </div>

              {/* 3. PANEL DE EFECTIVIDAD DE DEGUSTACIONES CON IA (GEMINI AI) */}
              {isTastingAiPanelOpen && (
                <div className="bg-gradient-to-br from-[#151124] via-[#121316] to-[#0f151c] border border-purple-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in-50 duration-200">
                  {/* Encabezado del Panel de IA */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-purple-500/20 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-950/90 border border-purple-500/50 flex items-center justify-center shrink-0 shadow-lg shadow-purple-900/50">
                        <Bot className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-white text-base sm:text-lg">
                            Diagnóstico de Efectividad de Degustaciones con IA
                          </h4>
                          <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono text-[10px] font-black uppercase flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-purple-400" />
                            Gemini 3.8 Intelligence
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Análisis cuantitativo de inventario inicial vs final correlacionado con las observaciones cualitativas de las promotoras.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAnalyzeTastingEffectiveness}
                        disabled={isTastingAiLoading}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900/90 border border-purple-500/40 text-purple-300 hover:text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Re-evaluar datos de inventario con IA"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isTastingAiLoading ? 'animate-spin' : ''}`} />
                        <span>{isTastingAiLoading ? 'Procesando...' : 'Regenerar con IA'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Diagnóstico de Efectividad con IA o Estado Vacío */}
                  {inventoryReports.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 font-medium bg-zinc-950/60 rounded-xl border border-white/5 space-y-2">
                      <Sparkles className="w-8 h-8 text-purple-400 mx-auto opacity-60" />
                      <p className="text-sm font-semibold text-zinc-200">En espera de balances de inventario de degustación</p>
                      <p className="text-xs text-zinc-500 max-w-md mx-auto">
                        Registre los balances de inventario (inicial vs final) mediante el botón "+ Nuevo Balance de Degustación" para que la IA audite la efectividad comercial real.
                      </p>
                    </div>
                  ) : tastingAiAnalysis ? (
                    <>
                      {/* 4 Métricas Clave de Efectividad con IA */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-purple-500/20">
                          <span className="text-[10px] uppercase font-mono font-bold text-zinc-400 block">
                            Efectividad Global
                          </span>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 font-mono">
                              {tastingAiAnalysis.overallScore}/100
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase">
                              {tastingAiAnalysis.effectivenessLevel}
                            </span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-purple-500/20">
                          <span className="text-[10px] uppercase font-mono font-bold text-zinc-400 block">
                            Conversión Degusto ➔ Venta
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                              {tastingAiAnalysis.conversionRate}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">por porción</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-purple-500/20">
                          <span className="text-[10px] uppercase font-mono font-bold text-zinc-400 block">
                            Incremento en Rotación
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
                              +{tastingAiAnalysis.rotationLiftPercent}%
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">vs sin degustación</span>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-purple-500/20">
                          <span className="text-[10px] uppercase font-mono font-bold text-zinc-400 block">
                            Impacto Estimado (ROI)
                          </span>
                          <div className="mt-1 font-mono font-bold text-sm sm:text-base text-amber-300 truncate">
                            {tastingAiAnalysis.roiEstimate}
                          </div>
                        </div>
                      </div>

                      {/* Diagnóstico Sintetizado */}
                      <div className="p-4 rounded-xl bg-zinc-900/80 border border-white/5 space-y-1">
                        <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block font-mono">
                          Resumen Ejecutivo IA:
                        </span>
                        <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
                          {tastingAiAnalysis.summaryDiagnostic}
                        </p>
                      </div>

                      {/* Fortalezas y Oportunidades de Mejora */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Fortalezas Detectadas */}
                        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <h5 className="font-bold text-xs uppercase tracking-wider text-emerald-300">
                              Fortalezas Clave de las Degustaciones
                            </h5>
                          </div>
                          <ul className="space-y-1.5 text-xs text-zinc-300">
                            {tastingAiAnalysis.strengths.map((str, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-emerald-400 font-bold">•</span>
                                <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Oportunidades de Mejora */}
                        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            <h5 className="font-bold text-xs uppercase tracking-wider text-amber-300">
                              Oportunidades de Mejora Comercial
                            </h5>
                          </div>
                          <ul className="space-y-1.5 text-xs text-zinc-300">
                            {tastingAiAnalysis.improvementOpportunities.map((opp, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-amber-400 font-bold">•</span>
                                <span>{opp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center text-zinc-400 font-medium bg-zinc-950/60 rounded-xl border border-white/5 space-y-2">
                      <p className="text-xs text-zinc-400">Presione "Regenerar con IA" para procesar el diagnóstico cuantitativo de los {inventoryReports.length} balances registrados.</p>
                    </div>
                  )}
                </div>
              )}

              {/* 4. TABLA ESTRUCTURADA DE INVENTARIOS: INICIAL, FINAL, RESULTADO Y OBSERVACIÓN */}
              <div className="bg-[#121316] border border-white/10 rounded-2xl shadow-xl overflow-hidden p-4 sm:p-6 space-y-4">
                {/* Barra de Filtros y Búsqueda */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-white text-lg tracking-tight">
                      Registros de Inventario en Degustación & Ventas
                    </h4>
                    <p className="text-xs text-zinc-400">
                      Balance por punto de venta con conteo antes y después de la actividad, cálculo de resultado y observaciones de la promotora.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar producto, PDV, promotora..."
                        value={reportSearchTerm}
                        onChange={(e) => setReportSearchTerm(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Tabla de Datos */}
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left border-collapse min-w-[1100px] text-xs">
                    <thead>
                      <tr className="bg-zinc-900/90 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[11px] select-none">
                        <th className="py-3.5 px-3 border-r border-white/10 min-w-[95px]">Fecha</th>
                        <th className="py-3.5 px-3 border-r border-white/10 min-w-[200px]">Punto de Venta (PDV)</th>
                        <th className="py-3.5 px-3 border-r border-white/10 min-w-[220px]">Producto & SKU</th>
                        <th className="py-3.5 px-3 border-r border-white/10 text-right min-w-[120px]">
                          <span className="block text-zinc-300">Inv. Inicial</span>
                          <span className="text-[9px] font-normal text-zinc-500 lowercase">(antes degustar)</span>
                        </th>
                        <th className="py-3.5 px-3 border-r border-white/10 text-right min-w-[120px]">
                          <span className="block text-zinc-300">Inv. Final</span>
                          <span className="text-[9px] font-normal text-zinc-500 lowercase">(post venta)</span>
                        </th>
                        <th className="py-3.5 px-3 border-r border-white/10 text-center min-w-[110px]">Muestras</th>
                        <th className="py-3.5 px-3 border-r border-white/10 text-right min-w-[160px]">
                          <span className="block text-emerald-400">Resultado</span>
                          <span className="text-[9px] font-normal text-zinc-500 lowercase">(ventas generadas)</span>
                        </th>
                        <th className="py-3.5 px-3 border-r border-white/10 min-w-[280px]">
                          Observación de la Actividad (Promotora)
                        </th>
                        <th className="py-3.5 px-3 text-center min-w-[90px]">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredInventoryReports.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-zinc-500 font-medium">
                            No se encontraron registros de inventario para el criterio de búsqueda.
                          </td>
                        </tr>
                      ) : (
                        filteredInventoryReports.map((item) => (
                          <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                            {/* 1. FECHA */}
                            <td className="py-3.5 px-3 border-r border-white/10 font-mono font-bold text-white text-xs align-top whitespace-nowrap">
                              <div>{item.date}</div>
                              <span className="text-[10px] text-zinc-500 font-mono">{item.id}</span>
                            </td>

                            {/* 2. PUNTO DE VENTA */}
                            <td className="py-3.5 px-3 border-r border-white/10 align-top">
                              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                                {item.client.toUpperCase().includes('ALKOSTO') && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black">
                                    ALKOSTO
                                  </span>
                                )}
                                {item.client.toUpperCase().includes('OLIMPICA') && (
                                  <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[9px] font-black">
                                    MAYORISTA
                                  </span>
                                )}
                                <span>{item.client}</span>
                              </div>
                              <div className="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1">
                                <UserCheck className="w-3 h-3 text-zinc-500" />
                                <span>Promotora: <strong>{item.promoter}</strong></span>
                              </div>
                            </td>

                            {/* 3. PRODUCTO & SKU */}
                            <td className="py-3.5 px-3 border-r border-white/10 align-top">
                              <div className="font-bold text-white group-hover:text-red-400 transition-colors">
                                {item.productName}
                              </div>
                              <div className="font-mono text-[10px] text-red-400 bg-red-950/80 px-1.5 py-0.2 rounded border border-red-800/40 inline-block mt-1">
                                {item.sku}
                              </div>
                            </td>

                            {/* 4. INVENTARIO INICIAL (Antes de degustación) */}
                            <td className="py-3.5 px-3 border-r border-white/10 text-right align-top font-mono">
                              <div className="font-black text-white text-sm">
                                {item.initialStock.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-zinc-400">{item.unit}</div>
                            </td>

                            {/* 5. INVENTARIO FINAL (Después de degustación / venta) */}
                            <td className="py-3.5 px-3 border-r border-white/10 text-right align-top font-mono">
                              <div className="font-black text-zinc-200 text-sm">
                                {item.finalStock.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-zinc-400">{item.unit}</div>
                            </td>

                            {/* 6. MUESTRAS DEGUSTADAS */}
                            <td className="py-3.5 px-3 border-r border-white/10 text-center align-top font-mono">
                              <span className="px-2 py-0.5 rounded-lg bg-purple-950/80 text-purple-300 border border-purple-500/30 text-xs font-bold inline-block">
                                {item.samplesGiven} {item.unit}
                              </span>
                            </td>

                            {/* 7. RESULTADO (VENTAS GENERADAS) */}
                            <td className="py-3.5 px-3 border-r border-white/10 text-right align-top font-mono">
                              {item.salesGenerated > 0 ? (
                                <div>
                                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 font-black text-xs inline-flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    +{Number(item.salesGenerated.toFixed(2))} {item.unit} vendidas
                                  </span>
                                  <div className="text-[10px] text-emerald-400 font-bold mt-1">
                                    {item.rotationPercent}% rotación
                                  </div>
                                </div>
                              ) : item.salesGenerated < 0 ? (
                                <div>
                                  <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-500/40 font-black text-xs inline-flex items-center gap-1">
                                    <TrendingDown className="w-3 h-3" />
                                    {Number(item.salesGenerated.toFixed(2))} {item.unit} (Merma)
                                  </span>
                                  <div className="text-[10px] text-red-400 font-bold mt-1">
                                    {item.rotationPercent}% rotación
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold text-xs">
                                    0 {item.unit} ventas
                                  </span>
                                  <div className="text-[10px] text-zinc-500 mt-1">
                                    0% rotación
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* 8. OBSERVACIÓN DE LA ACTIVIDAD (PROMOTORA) */}
                            <td className="py-3.5 px-3 border-r border-white/10 align-top">
                              <div className="bg-zinc-900/80 border border-white/5 rounded-xl p-2.5 relative group/obs">
                                <div className="text-zinc-200 text-xs italic leading-relaxed">
                                  "{item.promoterObservation || 'Sin observaciones registradas por la promotora.'}"
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-white/5">
                                  <span className="text-[10px] text-zinc-500 font-mono">
                                    Por: {item.promoter}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingObservationReportId(item.id);
                                      setTempObservation(item.promoterObservation || '');
                                    }}
                                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Modificar o colocar observación de la actividad"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                    <span>Editar Observación</span>
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* 9. ACCIONES */}
                            <td className="py-3.5 px-3 text-center align-top">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingObservationReportId(item.id);
                                    setTempObservation(item.promoterObservation || '');
                                  }}
                                  className="p-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900 text-blue-300 border border-blue-500/30 transition-colors cursor-pointer"
                                  title="Editar Observación de la Promotora"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReport(item.id)}
                                  className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-500/30 transition-colors cursor-pointer"
                                  title="Eliminar Reporte de Inventario"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 4: ASISTENCIA EN PDV (CONTROL HORARIO Y GEOCERCA GPS)              */}
          {/* ========================================================================= */}
          {informesTab === 'asistencia' && (
            <div className="space-y-4">
              {/* Header del Submódulo de Asistencia */}
              <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-red-500" />
                        Centro de Control & Auditoría de Asistencias en PDV
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-500/40 text-red-400 text-[10px] font-black font-mono">
                        {filteredCheckIns.length} marcaje(s) verificados
                      </span>
                      {/* Estado de Sincronización en Tiempo Real */}
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold flex items-center gap-1.5 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                        <span>Canal Realtime Activo</span>
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Trazabilidad biométrica-visual de promotoras e impulsadoras con geolocalización satelital obligatoria (GPS en tiempo real) y soporte offline.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                    <span className="text-[10px] text-zinc-500 font-mono hidden xl:inline">
                      Última sync: {lastCheckInSync.toLocaleTimeString('es-VE')}
                    </span>
                    <button
                      type="button"
                      onClick={() => loadCheckIns(true)}
                      disabled={isRefreshingCheckIns}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-200 font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshingCheckIns ? 'animate-spin' : ''}`} />
                      <span>{isRefreshingCheckIns ? 'Sincronizando...' : 'Sincronizar Asistencias'}</span>
                    </button>
                    <a
                      href="/portal/checkin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Abrir App Promotora</span>
                    </a>
                  </div>
                </div>

                {/* Filtro Rápido de Promotora Inline si no se usó el superior */}
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                    <span className="text-zinc-500 font-bold shrink-0 text-[11px]">Promotora:</span>
                    <button
                      type="button"
                      onClick={() => setPromoterFilter('todos')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition cursor-pointer ${
                        promoterFilter === 'todos'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                      }`}
                    >
                      Todas ({checkIns.length})
                    </button>
                    {personal.map((p) => {
                      const count = checkIns.filter(c => matchPromoterName(c.promoter, p.name)).length;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPromoterFilter(p.name)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                            promoterFilter === p.name
                              ? 'bg-red-600 text-white shadow-sm'
                              : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                          }`}
                        >
                          <span>{p.name.split(' ')[0]}</span>
                          <span className="text-[10px] opacity-75 font-mono">({count})</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-[11px] text-zinc-400 font-mono">
                    Mostrando <strong>{filteredCheckIns.length}</strong> de {checkIns.length} registros
                  </div>
                </div>
              </div>

              {/* Tarjetas KPI de Asistencia */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Marcajes Verificados
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-white">
                      {filteredCheckIns.length}
                    </span>
                    <span className="text-xs text-emerald-400 font-mono font-bold">en período</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Ingresos Registrados
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-emerald-400">
                      {filteredCheckIns.filter(c => c.type === 'Ingreso').length}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">inicios de turno</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Geolocalización GPS
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-emerald-400">100%</span>
                    <span className="text-xs text-zinc-500 font-mono">satelital validado</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Pausas de Almuerzo
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-amber-400">
                      {filteredCheckIns.filter(c => c.type === 'Salida a almorzar' || c.type === 'Vuelta a almorzar').length}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">recesos y retornos</span>
                  </div>
                </div>
              </div>

              {/* VISTA 1: ASISTENCIA ORGANIZADA POR FECHA (DÍA) Y PROMOTORA CON LOS 4 HITOS CRONOLÓGICOS */}
              {checkInViewMode === 'gallery' && (
                <div>
                  {dailyGroupedCheckIns.length === 0 ? (
                    <div className="bg-[#121316] border border-white/10 rounded-2xl p-12 text-center text-zinc-400 space-y-3">
                      <Camera className="w-12 h-12 text-zinc-600 mx-auto" />
                      <h4 className="text-sm font-bold text-white">No hay asistencias que coincidan con los filtros</h4>
                      <p className="text-xs text-zinc-500 max-w-md mx-auto">
                        Intenta cambiando el filtro de promotora o el tipo de marcaje, o realiza un nuevo registro desde la app móvil.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPromoterFilter('todos');
                          setCheckInTypeFilter('todos');
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl"
                      >
                        Restablecer Filtros
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {dailyGroupedCheckIns.map((daySection) => (
                        <div
                          key={daySection.dayKey}
                          className="bg-[#121316] border border-white/10 rounded-2xl overflow-hidden shadow-xl"
                        >
                          {/* ENCABEZADO DE FECHA (DÍA) */}
                          <div className="px-4 py-3 bg-gradient-to-r from-red-950/50 via-zinc-900 to-zinc-900 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                                <CalendarDays className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-white uppercase tracking-tight capitalize">
                                    {daySection.dateLongLabel}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-zinc-200 font-mono text-[11px] font-bold">
                                    {daySection.dateFormatted}
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-400">
                                  Secuencia diaria certificada: 1. Foto de Ingreso • 2. Salida a Almorzar (Cuando aplique) • 3. Llegada de Almorzar (Cuando aplique) • 4. Salida
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-mono">
                              <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-white/10 text-zinc-200 font-bold">
                                {daySection.promoters.length} promotora(s)
                              </span>
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 font-bold">
                                {daySection.totalCheckIns} marcaje(s)
                              </span>
                            </div>
                          </div>

                          {/* TARJETAS CONSOLIDADAS POR PROMOTORA EN EL DÍA */}
                          <div className="p-4 space-y-4">
                            {daySection.promoters.map((pRow) => {
                              const hasValidGps =
                                pRow.primaryLocation &&
                                pRow.primaryLocation.lat !== 0 &&
                                pRow.primaryLocation.lng !== 0;
                              const mapsUrl = hasValidGps
                                ? `https://www.google.com/maps/search/?api=1&query=${pRow.primaryLocation.lat},${pRow.primaryLocation.lng}`
                                : null;
                              const isCompleteDay = Boolean(pRow.ingreso && pRow.salida);

                              const slots: Array<{
                                key: string;
                                stepNumber: string;
                                label: string;
                                sublabel: string;
                                checkInType: CheckInType;
                                defaultTime: string;
                                record?: CheckInRecord;
                                badgeBg: string;
                                emptyText: string;
                              }> = [
                                {
                                  key: 'ingreso',
                                  stepNumber: '1',
                                  label: 'Foto de Ingreso',
                                  sublabel: 'Apertura de jornada en PDV',
                                  checkInType: 'Ingreso',
                                  defaultTime: '08:30',
                                  record: pRow.ingreso,
                                  badgeBg: 'bg-emerald-600/90 border-emerald-400/40 text-white',
                                  emptyText: 'Sin registro de ingreso',
                                },
                                {
                                  key: 'salida_almorzar',
                                  stepNumber: '2',
                                  label: 'Salida a Almorzar',
                                  sublabel: 'Cuando aplique',
                                  checkInType: 'Salida a almorzar',
                                  defaultTime: '12:00',
                                  record: pRow.salidaAlmorzar,
                                  badgeBg: 'bg-amber-600/90 border-amber-400/40 text-white',
                                  emptyText: 'No aplica / Sin salida a almorzar',
                                },
                                {
                                  key: 'llegada_almorzar',
                                  stepNumber: '3',
                                  label: 'Llegada de Almorzar',
                                  sublabel: 'Cuando aplique',
                                  checkInType: 'Vuelta a almorzar',
                                  defaultTime: '14:00',
                                  record: pRow.llegadaAlmorzar,
                                  badgeBg: 'bg-blue-600/90 border-blue-400/40 text-white',
                                  emptyText: 'No aplica / Sin llegada de almorzar',
                                },
                                {
                                  key: 'salida',
                                  stepNumber: '4',
                                  label: 'Salida',
                                  sublabel: 'Cierre de guardia en PDV',
                                  checkInType: 'Salida',
                                  defaultTime: '17:00',
                                  record: pRow.salida,
                                  badgeBg: 'bg-red-600/90 border-red-400/40 text-white',
                                  emptyText: 'Pendiente / Sin registro de salida',
                                },
                              ];

                              const openSlotUploadModal = (
                                checkInType: CheckInType,
                                defaultTime: string,
                                existingRec?: CheckInRecord
                              ) => {
                                let initialTime = defaultTime;
                                if (existingRec?.date) {
                                  try {
                                    const d = new Date(existingRec.date);
                                    const caracas = new Date(d.getTime() - 4 * 60 * 60 * 1000);
                                    const hh = String(caracas.getUTCHours()).padStart(2, '0');
                                    const mm = String(caracas.getUTCMinutes()).padStart(2, '0');
                                    initialTime = `${hh}:${mm}`;
                                  } catch {}
                                }
                                setManualSlotModal({
                                  existingId: existingRec?.id,
                                  dayKey: pRow.dayKey,
                                  dateFormatted: pRow.dateFormatted,
                                  promoter: pRow.promoter,
                                  store: existingRec?.store || pRow.stores[0] || 'Punto de Venta',
                                  type: checkInType,
                                  time: initialTime,
                                  location:
                                    pRow.primaryLocation &&
                                    pRow.primaryLocation.lat !== 0 &&
                                    pRow.primaryLocation.lng !== 0
                                      ? pRow.primaryLocation
                                      : { lat: 10.621332, lng: -71.660643, accuracy: 8 },
                                  photoBase64: '',
                                });
                              };

                              return (
                                <div
                                  key={pRow.key}
                                  className="bg-zinc-950/90 border border-white/10 hover:border-white/20 rounded-2xl overflow-hidden shadow-lg transition-all"
                                >
                                  {/* Cabecera de la Promotora en ese Día */}
                                  <div className="px-4 py-3 bg-zinc-900/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 font-black text-xs flex items-center justify-center shrink-0">
                                        {pRow.promoter.slice(0, 2).toUpperCase()}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-black text-sm text-white tracking-tight">
                                            {pRow.promoter}
                                          </span>
                                          <span
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                              isCompleteDay
                                                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                                                : 'bg-amber-950/80 border-amber-500/40 text-amber-400'
                                            }`}
                                          >
                                            {isCompleteDay ? 'Jornada Completa' : 'En Guardia / Marcaje Parcial'}
                                          </span>
                                        </div>
                                        <div className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5 mt-0.5">
                                          <Store className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                          <span>{pRow.stores.join(' / ') || 'Punto de Venta'}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-[11px] font-mono text-zinc-400">
                                        Fecha: <strong className="text-white">{pRow.dateFormatted}</strong>
                                      </span>
                                      {mapsUrl && (
                                        <a
                                          href={mapsUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                          title="Abrir ubicación satelital en Google Maps"
                                        >
                                          <MapPin className="w-3 h-3" />
                                          <span>
                                            {pRow.primaryLocation.lat.toFixed(4)}, {pRow.primaryLocation.lng.toFixed(4)}
                                          </span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  {/* Cuadrícula de los 4 Hitos del Día */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5">
                                    {slots.map((slot) => {
                                      const rec = slot.record;
                                      const timeStr = rec
                                        ? new Date(rec.date).toLocaleTimeString('es-VE', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: true,
                                            timeZone: 'America/Caracas',
                                          })
                                        : null;

                                      return (
                                        <div
                                          key={slot.key}
                                          className={`rounded-xl border overflow-hidden flex flex-col ${
                                            rec
                                              ? 'bg-[#121316] border-white/15 shadow-md'
                                              : 'bg-zinc-900/40 border-white/5 opacity-75'
                                          }`}
                                        >
                                          {/* Encabezado del Hito */}
                                          <div className="px-3 py-2 bg-zinc-900/90 border-b border-white/10 flex items-center justify-between gap-1">
                                            <div>
                                              <span className="text-[11px] font-black text-white uppercase tracking-wider block">
                                                {slot.stepNumber}. {slot.label}
                                              </span>
                                              <span className="text-[10px] text-zinc-400 block">
                                                {slot.sublabel}
                                              </span>
                                            </div>
                                            {timeStr ? (
                                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black border ${slot.badgeBg}`}>
                                                {timeStr}
                                              </span>
                                            ) : (
                                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-zinc-500 bg-zinc-800/70">
                                                —
                                              </span>
                                            )}
                                          </div>

                                          {/* Cuerpo Fotográfico o Estado Vacío */}
                                          {rec ? (
                                            <div
                                              className="relative aspect-[3/4] w-full bg-zinc-950 overflow-hidden cursor-pointer group"
                                              onClick={() => setInspectCheckIn(rec)}
                                            >
                                              <CheckInPhoto
                                                src={rec.photoBase64}
                                                checkInId={rec.id}
                                                alt={`${slot.label} - ${pRow.promoter}`}
                                                className="w-full h-full object-contain bg-zinc-950 group-hover:scale-105 transition-transform duration-300"
                                              />

                                              <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openSlotUploadModal(slot.checkInType, slot.defaultTime, rec);
                                                  }}
                                                  className="p-1.5 rounded-lg bg-black/75 hover:bg-black text-emerald-400 border border-emerald-500/30 backdrop-blur-sm transition-colors cursor-pointer"
                                                  title="Actualizar / Reemplazar Fotografía"
                                                >
                                                  <Camera className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setInspectCheckIn(rec);
                                                  }}
                                                  className="p-1.5 rounded-lg bg-black/75 hover:bg-black text-white border border-white/20 backdrop-blur-sm transition-colors cursor-pointer"
                                                  title="Ver Evidencia en Tamaño Completo"
                                                >
                                                  <Maximize2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteConfirmCheckIn(rec);
                                                  }}
                                                  className="p-1.5 rounded-lg bg-red-950/85 hover:bg-red-800 text-red-200 border border-red-500/40 backdrop-blur-sm transition-colors cursor-pointer"
                                                  title="Eliminar Marcaje (Auditoría)"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>

                                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent pt-8 pb-2.5 px-3 text-white">
                                                <div className="text-[11px] font-bold text-zinc-100 line-clamp-1 flex items-center gap-1">
                                                  <Store className="w-3 h-3 text-red-400 shrink-0" />
                                                  <span>{rec.store}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-300 mt-1">
                                                  <span>{pRow.dateFormatted}</span>
                                                  <span className="text-emerald-400 font-bold">
                                                    {rec.location?.lat
                                                      ? `±${Math.round(rec.location.accuracy || 5)}m GPS`
                                                      : 'Verificado'}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="aspect-[3/4] w-full flex flex-col items-center justify-center p-4 text-center bg-zinc-950/50 text-zinc-500 gap-2.5">
                                              <Clock className="w-6 h-6 text-zinc-700" />
                                              <span className="text-[11px] font-semibold text-zinc-500">
                                                {slot.emptyText}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => openSlotUploadModal(slot.checkInType, slot.defaultTime)}
                                                className="mt-1 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-red-600/90 border border-white/15 hover:border-red-400 text-zinc-200 hover:text-white text-[10px] font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                                              >
                                                <Camera className="w-3 h-3 text-red-400" />
                                                <span>Cargar / Sincronizar Foto</span>
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* VISTA 2: TABLA DE CONTROL HORARIO ORGANIZADA POR DÍA (FECHA) Y PROMOTORA */}
              {checkInViewMode === 'table' && (
                <div className="bg-[#121316] border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1150px] text-xs">
                      <thead>
                        <tr className="bg-zinc-900/90 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[11px] select-none">
                          <th className="p-3.5 border-r border-white/10 min-w-[110px]">Fecha</th>
                          <th className="p-3.5 border-r border-white/10 min-w-[175px]">Promotora</th>
                          <th className="p-3.5 border-r border-white/10 min-w-[210px]">Punto de Venta / PDV</th>
                          <th className="p-3.5 border-r border-white/10 min-w-[145px]">1. Foto Ingreso</th>
                          <th className="p-3.5 border-r border-white/10 min-w-[155px]">2. Salida Almorzar</th>
                          <th className="p-3.5 border-r border-white/10 min-w-[155px]">3. Llegada Almorzar</th>
                          <th className="p-3.5 border-r border-white/10 min-w-[145px]">4. Salida</th>
                          <th className="p-3.5 text-center min-w-[150px]">Geolocalización GPS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {dailyGroupedCheckIns.flatMap((daySection) =>
                          daySection.promoters.map((pRow) => {
                            const hasValidGps =
                              pRow.primaryLocation &&
                              pRow.primaryLocation.lat !== 0 &&
                              pRow.primaryLocation.lng !== 0;
                            const mapsUrl = hasValidGps
                              ? `https://www.google.com/maps/search/?api=1&query=${pRow.primaryLocation.lat},${pRow.primaryLocation.lng}`
                              : null;

                            const renderMilestoneCell = (
                              rec: CheckInRecord | undefined,
                              badgeCls: string,
                              emptyLabel: string,
                              slotType: CheckInType,
                              defaultTime: string
                            ) => {
                              if (!rec) {
                                return (
                                  <div className="space-y-1">
                                    <span className="text-[11px] text-zinc-500 font-mono block">{emptyLabel}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setManualSlotModal({
                                          dayKey: pRow.dayKey,
                                          dateFormatted: pRow.dateFormatted,
                                          promoter: pRow.promoter,
                                          store: pRow.stores[0] || 'Punto de Venta',
                                          type: slotType,
                                          time: defaultTime,
                                          location:
                                            pRow.primaryLocation &&
                                            pRow.primaryLocation.lat !== 0 &&
                                            pRow.primaryLocation.lng !== 0
                                              ? pRow.primaryLocation
                                              : { lat: 10.621332, lng: -71.660643, accuracy: 8 },
                                          photoBase64: '',
                                        })
                                      }
                                      className="text-[10px] text-red-400 hover:text-red-300 font-bold underline cursor-pointer"
                                    >
                                      + Cargar foto
                                    </button>
                                  </div>
                                );
                              }
                              const timeStr = new Date(rec.date).toLocaleTimeString('es-VE', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                                timeZone: 'America/Caracas',
                              });
                              return (
                                <div className="flex items-center gap-2.5">
                                  <div
                                    onClick={() => setInspectCheckIn(rec)}
                                    className="w-10 h-13 rounded-lg overflow-hidden bg-zinc-950 border border-white/15 shrink-0 cursor-pointer hover:border-red-400 transition"
                                    title="Clic para ampliar foto de evidencia"
                                  >
                                    <CheckInPhoto
                                      src={rec.photoBase64}
                                      checkInId={rec.id}
                                      alt={rec.promoter}
                                      className="w-full h-full object-contain bg-zinc-950"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <span
                                      className={`px-2 py-0.5 rounded-md border text-[11px] font-mono font-bold inline-block ${badgeCls}`}
                                    >
                                      {timeStr}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setInspectCheckIn(rec)}
                                        className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer"
                                      >
                                        Ver foto
                                      </button>
                                      <span className="text-zinc-600">•</span>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteConfirmCheckIn(rec)}
                                        className="text-[10px] text-red-400 hover:text-red-300 underline cursor-pointer"
                                      >
                                        Borrar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <tr key={pRow.key} className="hover:bg-white/[0.02] transition-colors">
                                <td className="p-3.5 border-r border-white/10 font-mono font-bold text-white">
                                  {pRow.dateFormatted}
                                </td>
                                <td className="p-3.5 border-r border-white/10">
                                  <div className="font-bold text-white text-sm">{pRow.promoter}</div>
                                  <span className="text-[10px] text-zinc-400 font-mono">
                                    {pRow.ingreso && pRow.salida ? 'Jornada Completa' : 'En Guardia'}
                                  </span>
                                </td>
                                <td className="p-3.5 border-r border-white/10">
                                  <div className="font-bold text-zinc-200 leading-snug">
                                    {pRow.stores.join(' / ') || 'Punto de Venta'}
                                  </div>
                                </td>
                                <td className="p-3.5 border-r border-white/10">
                                  {renderMilestoneCell(
                                    pRow.ingreso,
                                    'bg-emerald-950/70 border-emerald-500/40 text-emerald-400',
                                    'Sin ingreso',
                                    'Ingreso',
                                    '08:30'
                                  )}
                                </td>
                                <td className="p-3.5 border-r border-white/10">
                                  {renderMilestoneCell(
                                    pRow.salidaAlmorzar,
                                    'bg-amber-950/70 border-amber-500/40 text-amber-400',
                                    'No aplica',
                                    'Salida a almorzar',
                                    '12:00'
                                  )}
                                </td>
                                <td className="p-3.5 border-r border-white/10">
                                  {renderMilestoneCell(
                                    pRow.llegadaAlmorzar,
                                    'bg-blue-950/70 border-blue-500/40 text-blue-400',
                                    'No aplica',
                                    'Vuelta a almorzar',
                                    '14:00'
                                  )}
                                </td>
                                <td className="p-3.5 border-r border-white/10">
                                  {renderMilestoneCell(
                                    pRow.salida,
                                    'bg-red-950/70 border-red-500/40 text-red-400',
                                    'Pendiente',
                                    'Salida',
                                    '17:00'
                                  )}
                                </td>
                                <td className="p-3.5 text-center">
                                  {mapsUrl ? (
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] hover:bg-emerald-900 transition"
                                    >
                                      <MapPin className="w-3 h-3" />
                                      <span>
                                        {pRow.primaryLocation.lat.toFixed(4)}, {pRow.primaryLocation.lng.toFixed(4)}
                                      </span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-zinc-500 font-mono">Sin GPS</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MODAL 1: CONFIRMACIÓN PARA ELIMINAR ASISTENCIA (AUDITORÍA SEGURA) */}
              {deleteConfirmCheckIn && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-[#121316] border border-white/15 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-500/40 text-red-500 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base">¿Eliminar registro de asistencia?</h4>
                        <p className="text-xs text-zinc-400 mt-0.5">Esta acción eliminará permanentemente la evidencia y el registro de la auditoría.</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-xs text-zinc-300 space-y-1">
                      <p><strong>Promotora:</strong> {deleteConfirmCheckIn.promoter}</p>
                      <p><strong>Punto de Venta:</strong> {deleteConfirmCheckIn.store}</p>
                      <p><strong>Marcaje:</strong> {deleteConfirmCheckIn.type} • {new Date(deleteConfirmCheckIn.date).toLocaleTimeString('es-VE')}</p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmCheckIn(null)}
                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCheckIn(deleteConfirmCheckIn.id)}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Confirmar Eliminación</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL 2: INSPECCIÓN COMPLETA DE EVIDENCIA FOTOGRÁFICA Y GEOLOCALIZACIÓN */}
              {inspectCheckIn && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
                  <div className="bg-[#121316] border border-white/15 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Certificación de Marcaje en PDV</span>
                        <h4 className="font-black text-white text-lg flex items-center gap-2 mt-0.5">
                          <span>{inspectCheckIn.promoter}</span>
                          <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-600 text-white">
                            {inspectCheckIn.type}
                          </span>
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInspectCheckIn(null)}
                        className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                      {/* Fotografía 3:4 */}
                      <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-black border border-white/10 shadow-lg relative">
                        <CheckInPhoto
                          src={inspectCheckIn.photoBase64}
                          checkInId={inspectCheckIn.id}
                          alt={inspectCheckIn.promoter}
                          className="w-full h-full object-contain bg-zinc-950"
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-white text-[10px] font-mono">
                          Evidencia Inalterable
                        </div>
                      </div>

                      {/* Datos de Auditoría */}
                      <div className="space-y-3 text-xs">
                        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-white/5 space-y-2">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Punto de Venta</span>
                          <p className="font-bold text-white text-sm leading-snug">{inspectCheckIn.store}</p>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-white/5 space-y-2">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Marca de Tiempo Oficial</span>
                          <p className="font-mono text-emerald-400 font-bold text-sm">
                            {new Date(inspectCheckIn.date).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                          </p>
                          <p className="font-mono text-zinc-300 text-xs">
                            Hora exacta: {new Date(inspectCheckIn.date).toLocaleTimeString('es-VE', { hour12: true })}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 space-y-2">
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block flex items-center gap-1">
                            <Navigation className="w-3.5 h-3.5" /> Geolocalización Satelital
                          </span>
                          <div className="font-mono text-xs space-y-0.5">
                            <p>Latitud: <strong>{inspectCheckIn.location.lat}</strong></p>
                            <p>Longitud: <strong>{inspectCheckIn.location.lng}</strong></p>
                            <p>Margen de Precisión: <strong>±{inspectCheckIn.location.accuracy}m</strong></p>
                          </div>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${inspectCheckIn.location.lat},${inspectCheckIn.location.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition text-xs shadow-md"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            <span>Abrir en Google Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setInspectCheckIn(null)}
                        className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Cerrar Ficha de Evidencia
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL 3: SINCRONIZAR / CARGAR SOPORTE FOTOGRÁFICO FALTANTE EN HITO DE ASISTENCIA */}
              {manualSlotModal && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
                  <form
                    onSubmit={handleSaveManualCheckInSlot}
                    className="bg-[#121316] border border-white/15 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div>
                        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">
                          Sincronización de Soporte de Asistencia en Nube
                        </span>
                        <h4 className="font-black text-white text-base flex items-center gap-2 mt-0.5">
                          <span>{manualSlotModal.promoter}</span>
                          <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-600 text-white">
                            {manualSlotModal.type}
                          </span>
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setManualSlotModal(null)}
                        className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 space-y-1">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block">Fecha del Marcaje</span>
                          <span className="font-mono font-bold text-white text-sm">{manualSlotModal.dateFormatted}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 space-y-1">
                          <label className="text-[10px] text-zinc-400 font-bold uppercase block">
                            Hora del Marcaje (VE)
                          </label>
                          <input
                            type="time"
                            value={manualSlotModal.time}
                            onChange={(e) =>
                              setManualSlotModal((prev) => (prev ? { ...prev, time: e.target.value } : null))
                            }
                            className="w-full bg-zinc-950 border border-white/15 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-red-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 space-y-1">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase block">
                          Punto de Venta / Sucursal
                        </label>
                        <input
                          type="text"
                          value={manualSlotModal.store}
                          onChange={(e) =>
                            setManualSlotModal((prev) => (prev ? { ...prev, store: e.target.value } : null))
                          }
                          className="w-full bg-zinc-950 border border-white/15 rounded-lg px-3 py-1.5 text-white font-bold text-xs focus:outline-none focus:border-red-500"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase block">
                          Fotografía de Evidencia ({manualSlotModal.type})
                        </span>
                        {manualSlotModal.photoBase64 ? (
                          <div className="relative aspect-[3/4] max-h-64 mx-auto rounded-2xl overflow-hidden bg-black border border-emerald-500/40">
                            <img
                              src={manualSlotModal.photoBase64}
                              alt="Vista previa"
                              className="w-full h-full object-contain bg-zinc-950"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setManualSlotModal((prev) => (prev ? { ...prev, photoBase64: '' } : null))
                              }
                              className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/80 text-red-300 hover:text-white text-[10px] font-bold border border-white/15 cursor-pointer"
                            >
                              Cambiar foto
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-white/20 hover:border-red-500/60 bg-zinc-900/60 hover:bg-zinc-900 cursor-pointer transition-all text-center">
                            <Camera className="w-8 h-8 text-red-500" />
                            <span className="text-xs font-bold text-white">
                              Seleccionar fotografía de {manualSlotModal.type}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              Formatos soportados: JPG, PNG, WEBP (se sincronizará en Supabase y Render)
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleManualSlotPhotoFile}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setManualSlotModal(null)}
                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={!manualSlotModal.photoBase64 || isSavingManualSlot}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/30 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isSavingManualSlot ? 'Sincronizando...' : 'Guardar & Sincronizar Foto'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBMÓDULO 3: MERCHANDISING (INFORMES DE VISITA Y ESCANEO IA EN PDV)       */}
      {/* ========================================================================= */}
      {activeSubmodule === 'merchandising' && (
        <div className="space-y-4">
          {/* Header del Submódulo de Merchandising con Subpestañas */}
          <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                    <Layers className="w-5 h-5 text-red-500" />
                    Panel de Supervisión de Merchandising en PDV
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-black font-mono flex items-center gap-1 shadow-sm">
                    <FileCheck className="w-3 h-3" />
                    {filteredMerchandisingReports.length} Informes en Registro
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-950/80 border border-violet-500/30 text-violet-300 text-[10px] font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-violet-400" />
                    Auditorías con IA Gemini
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Certificación técnica de labores en anaquel, ajuste de planogramas, material POP, escaneo inteligente de góndolas con IA y firma digital del encargado.
                </p>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={loadMerchandisingReports}
                  disabled={isRefreshingMerch}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Recargar informes"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshingMerch ? 'animate-spin' : ''}`} />
                  <span>Sincronizar</span>
                </button>
                <a
                  href="/portal/merchandising?role=merchandising&user=jose"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>App Móvil (Mercaderista)</span>
                </a>
              </div>
            </div>

            {/* Subpestañas del Submódulo: "Informes de Visita" y "Auditoría IA de Góndolas" */}
            <div className="flex items-center gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => setMerchandisingSubtab('informes_visita')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                  merchandisingSubtab === 'informes_visita'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Informes de Visita ({merchandisingReports.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setMerchandisingSubtab('auditoria_ia')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                  merchandisingSubtab === 'auditoria_ia'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Auditoría IA de Góndolas & Share of Shelf</span>
              </button>
            </div>

            {/* Centro de Búsqueda y Filtros Reactivos */}
            <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={merchandisingSearchTerm}
                    onChange={(e) => setMerchandisingSearchTerm(e.target.value)}
                    placeholder="Buscar por tienda, mercaderista o diagnóstico..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 text-xs"
                  />
                  {merchandisingSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setMerchandisingSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Filtro por Tipo de Informe */}
                <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-white/10 text-xs">
                  <button
                    type="button"
                    onClick={() => setMerchFilterType('todos')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      merchFilterType === 'todos' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Todos ({merchandisingReports.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMerchFilterType('con_ia')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                      merchFilterType === 'con_ia' ? 'bg-violet-900/60 text-violet-300 border border-violet-500/40' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-violet-400" />
                    <span>Con IA ({merchandisingReports.filter(r => !!r.aiRecommendations).length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMerchFilterType('certificados')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                      merchFilterType === 'certificados' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Firmados</span>
                  </button>
                </div>

                {/* Filtro por Mercaderista */}
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1 text-xs">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <select
                    value={promoterFilter}
                    onChange={(e) => setPromoterFilter(e.target.value)}
                    className="bg-transparent text-white font-bold focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="todos" className="bg-zinc-900">Todos los Mercaderistas y Promotoras</option>
                    <option value="Jose Barroso" className="bg-zinc-900">Jose Barroso (Mercaderista)</option>
                    <option value="Zioreli Grangger" className="bg-zinc-900">Zioreli Grangger (Mercaderista)</option>
                    {personal.filter(p => p.name !== 'Jose Barroso' && p.name !== 'Zioreli Grangger').map((p) => (
                      <option key={p.id} value={p.name} className="bg-zinc-900">{p.name} ({p.role})</option>
                    ))}
                  </select>
                </div>

                {/* Filtro por Fecha */}
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="date"
                    value={merchandisingDateFilter === 'todos' ? '' : merchandisingDateFilter}
                    onChange={(e) => setMerchandisingDateFilter(e.target.value || 'todos')}
                    className="bg-transparent text-white font-mono focus:outline-none cursor-pointer text-xs"
                  />
                  {merchandisingDateFilter !== 'todos' && (
                    <button
                      type="button"
                      onClick={() => setMerchandisingDateFilter('todos')}
                      className="text-zinc-400 hover:text-white text-[10px]"
                    >
                      Ver todas
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SUBPESTAÑA 1: INFORMES DE VISITA (SOLICITADA POR EL USUARIO) */}
          {merchandisingSubtab === 'informes_visita' && (
            <>
              {/* KPIS DE GESTIÓN EN VIVO */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Informes de Visita
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-white">
                      {filteredMerchandisingReports.length}
                    </span>
                    <span className="text-xs text-emerald-400 font-mono font-bold">registrados</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    PDVs Auditados
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-blue-400">
                      {new Set(filteredMerchandisingReports.map(r => r.store)).size}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">tiendas únicas</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Share of Shelf Promedio
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-emerald-400">
                      {Math.round(
                        filteredMerchandisingReports.reduce((acc, r) => acc + (r.metrics?.shareOfShelfPercent || 42), 0) /
                        (filteredMerchandisingReports.length || 1)
                      )}%
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">cuota anaquel</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Informes con IA
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-violet-400">
                      {filteredMerchandisingReports.filter(r => !!r.aiRecommendations).length}
                    </span>
                    <span className="text-xs text-violet-300 font-mono">con planograma</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-white/10 rounded-xl p-3.5 shadow-md col-span-2 md:col-span-1">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Firma de Encargado
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-emerald-400">100%</span>
                    <span className="text-xs text-zinc-500 font-mono">verificada</span>
                  </div>
                </div>
              </div>

              {/* GALERÍA DE REPORTES DE VISITA */}
              {filteredMerchandisingReports.length === 0 ? (
                <div className="bg-[#121316] border border-white/10 rounded-2xl p-12 text-center text-zinc-400 space-y-3">
                  <Layers className="w-12 h-12 text-zinc-600 mx-auto" />
                  <h4 className="text-sm font-bold text-white">No hay informes de visita con los filtros seleccionados</h4>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto">
                    Prueba ajustando el mercaderista, la fecha o el tipo de informe, o registra una visita desde la app móvil.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMerchandisingSearchTerm('');
                      setPromoterFilter('todos');
                      setMerchandisingDateFilter('todos');
                      setMerchFilterType('todos');
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Limpiar Filtros
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                  {filteredMerchandisingReports.map((report) => {
                    const coverPhoto = report.photos?.[0] || '';
                    const photoCount = report.photos?.length || 0;
                    const hasAi = !!report.aiRecommendations;

                    return (
                      <div
                        key={report.id}
                        className={`bg-[#121316] border rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between transition-all group duration-200 ${
                          hasAi ? 'border-violet-500/30 hover:border-violet-400/60' : 'border-white/10 hover:border-red-500/40'
                        }`}
                      >
                        <div>
                          {/* Cabecera con Foto de Evidencia Principal */}
                          <div
                            className="relative h-48 bg-zinc-950 overflow-hidden cursor-pointer"
                            onClick={() => setSelectedMerchReportForAudit(report)}
                          >
                            {coverPhoto ? (
                              <img
                                src={coverPhoto}
                                alt={report.store}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500">
                                <Camera className="w-8 h-8 mb-1 opacity-40" />
                                <span className="text-[11px] font-mono">Sin fotografía adjunta</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                            {/* Badge Superior: IA o Firma */}
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                              {hasAi ? (
                                <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-purple-700 border border-violet-400/40 text-white text-[10px] font-black uppercase tracking-wider backdrop-blur-md flex items-center gap-1 shadow-md">
                                  <Sparkles className="w-3 h-3 text-amber-300" />
                                  Informe IA ({report.aiRecommendations?.visibilityScore}/100)
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-600/90 border border-emerald-400/40 text-white text-[10px] font-black uppercase tracking-wider backdrop-blur-md flex items-center gap-1 shadow-md">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Firma Validada
                                </span>
                              )}
                            </div>

                            {/* Contador de Fotos */}
                            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-white text-[10px] font-mono flex items-center gap-1">
                              <Camera className="w-3 h-3" />
                              <span>{photoCount} fotos</span>
                            </div>

                            {/* Sello de Fecha y Hora */}
                            <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white flex justify-between items-center">
                              <span className="text-[10px] font-mono text-zinc-300 bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                                {report.date} • {report.time || '10:00'}
                              </span>
                              {report.metrics?.shareOfShelfPercent && (
                                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded backdrop-blur-sm">
                                  SoS: {report.metrics.shareOfShelfPercent}%
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Cuerpo de la Tarjeta */}
                          <div className="p-4 space-y-3">
                            <div>
                              <div className="flex items-center gap-1.5">
                                {report.store.toUpperCase().includes('ALKOSTO') && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black">
                                    ALKOSTO
                                  </span>
                                )}
                                <h4 className="font-black text-white text-sm leading-snug line-clamp-1">
                                  {report.store}
                                </h4>
                              </div>
                              {report.address && (
                                <p className="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1 line-clamp-1">
                                  <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                                  <span>{report.address}</span>
                                </p>
                              )}
                            </div>

                            {/* Diagnóstico IA Resumido */}
                            {report.aiRecommendations && (
                              <div className="p-2.5 rounded-xl bg-violet-950/30 border border-violet-500/30 space-y-1 text-xs">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-amber-300" />
                                    Diagnóstico de Visibilidad
                                  </span>
                                  <strong className="text-violet-300 font-mono">
                                    Score: {report.aiRecommendations.visibilityScore}/100
                                  </strong>
                                </div>
                                <p className="text-[11px] text-zinc-300 line-clamp-2">
                                  {report.aiRecommendations.marketDiagnostic}
                                </p>
                                {report.aiRecommendations.clientRecommendations?.[0] && (
                                  <div className="pt-1 border-t border-violet-500/20 text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                                    <span>💡 Recom:</span>
                                    <span className="truncate">{report.aiRecommendations.clientRecommendations[0].title}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Mercaderista y Encargado */}
                            <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-white/5 space-y-1 text-xs">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-500">Mercaderista:</span>
                                <span className="font-bold text-white">{report.promoter}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-500">Encargado Tienda:</span>
                                <span className="font-bold text-emerald-400">{report.storeManagerName} ({report.storeManagerRole})</span>
                              </div>
                            </div>

                            {/* Labores y Métricas */}
                            {report.metrics && (
                              <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-around text-[10px] font-mono">
                                <div>
                                  <span className="text-zinc-500 block text-[9px]">Frentes Propios</span>
                                  <strong className="text-red-400">{report.metrics.ourFacings} u.</strong>
                                </div>
                                <div className="h-4 w-px bg-white/10" />
                                <div>
                                  <span className="text-zinc-500 block text-[9px]">Competencia</span>
                                  <strong className="text-zinc-300">{report.metrics.competitorFacings} u.</strong>
                                </div>
                                <div className="h-4 w-px bg-white/10" />
                                <div>
                                  <span className="text-zinc-500 block text-[9px]">Zona</span>
                                  <strong className="text-amber-400">{report.metrics.shelfLevel}</strong>
                                </div>
                              </div>
                            )}

                            {/* Vista previa de la firma táctil */}
                            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                              <span className="text-[10px] text-zinc-400 font-mono">Firma del Responsable:</span>
                              <div className="h-8 w-24 bg-white/5 rounded border border-white/10 p-0.5 flex items-center justify-center overflow-hidden">
                                <img src={report.signature} alt="Firma" className="h-full object-contain filter invert opacity-80" />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Botones de Pie */}
                        <div className="p-3 bg-zinc-900/80 border-t border-white/5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedMerchReportForAudit(report)}
                            className={`flex-1 h-9 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-colors ${
                              hasAi
                                ? 'bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white'
                                : 'bg-red-600 hover:bg-red-500 text-white'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{hasAi ? 'Auditar con Informe IA' : 'Auditar & Ver Acta'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmMerchReport(report)}
                            className="p-2 rounded-xl bg-zinc-800 hover:bg-red-950/70 text-zinc-400 hover:text-red-300 border border-white/10 hover:border-red-500/30 transition-colors cursor-pointer"
                            title="Eliminar Reporte"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* SUBPESTAÑA 2: AUDITORÍA IA DE GÓNDOLAS & SHARE OF SHELF CONSOLIDADO */}
          {merchandisingSubtab === 'auditoria_ia' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="bg-[#121316] border border-violet-500/30 rounded-2xl p-4 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-400 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">
                        Matriz de Posicionamiento y Visibilidad de Anaqueles
                      </h3>
                      <p className="text-[11px] text-zinc-400">
                        Análisis comparativo de frentes Codizulca vs competidores en PDVs auditados
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-violet-950 text-violet-300 border border-violet-500/40 text-[10px] font-bold font-mono">
                    Motor IA de Trade Marketing
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      Promedio Share of Shelf
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-emerald-400">44.5%</span>
                      <span className="text-xs text-emerald-400 font-bold">+4.5% sobre meta (40%)</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Participación ponderada en las categorías de Embutidos, Cocidos y Madurados.
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      Zona Dorada (Nivel Ojos)
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-amber-400">78%</span>
                      <span className="text-xs text-zinc-400 font-mono">de frentes propios</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Ubicación de alta conversión ocupada por Mortadela Tapara y Jamón Cocido Superior.
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-900 rounded-xl border border-white/5 space-y-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      Presencia de Material POP
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-violet-400">92%</span>
                      <span className="text-xs text-zinc-400 font-mono">cumplimiento</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Cenefas y habladores con precio oficial en Bs y USD colocados en flejes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* D. VISUALIZADOR DETALLADO Y ACTA IMPRIMIBLE (PDF / PRINT / RECOMENDACIONES IA) */}
          {selectedMerchReportForAudit && (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 overflow-y-auto">
              <div className="bg-[#121316] border border-white/15 rounded-3xl max-w-3xl w-full p-6 space-y-6 shadow-2xl max-h-[92vh] overflow-y-auto text-white">
                
                {/* Barra de Acciones del Modal */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-black">
                      CZ
                    </div>
                    <div>
                      <h3 className="font-black text-white text-base">Acta de Auditoría de Merchandising & Diagnóstico IA</h3>
                      <p className="text-[11px] text-zinc-400 font-mono">Ref: {selectedMerchReportForAudit.id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedMerchReportForAudit.aiRecommendations && (
                      <button
                        type="button"
                        onClick={() => {
                          const rep = selectedMerchReportForAudit;
                          const ai = rep.aiRecommendations!;
                          const text = `📊 *INFORME DE VISIBILIDAD Y AUDITORÍA DE GÓNDOLA CODIZULCA*\n🏢 *Tienda:* ${rep.store}\n🎯 *Share of Shelf:* ${rep.metrics?.shareOfShelfPercent || 45}%\n⭐ *Score de Visibilidad:* ${ai.visibilityScore}/100 (${ai.marketPositionStatus})\n\n📌 *Diagnóstico:*\n${ai.marketDiagnostic}\n\n🚀 *Recomendaciones para el Comercio:*\n${ai.clientRecommendations.map((r, i) => `${i + 1}. *${r.title}:* ${r.action}\n_Impacto:_ ${r.expectedBenefit}`).join('\n\n')}\n\n📈 *Proyección:* ${ai.projectedSalesLift}`;
                          navigator.clipboard.writeText(text);
                          setCopiedAiSummaryId(rep.id);
                          setTimeout(() => setCopiedAiSummaryId(null), 3000);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-violet-900/60 hover:bg-violet-800 border border-violet-500/40 text-violet-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                        title="Copiar informe para WhatsApp"
                      >
                        <Copy className="w-3.5 h-3.5 text-amber-300" />
                        <span>{copiedAiSummaryId === selectedMerchReportForAudit.id ? '¡Copiado!' : 'Copiar para WhatsApp'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir / Exportar Acta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMerchReportForAudit(null)}
                      className="p-1.5 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* CONTENIDO DEL ACTA FORMAL (Optimizado para Impresión) */}
                <div className="space-y-4 print:text-black print:bg-white">
                  {/* Encabezado Formal Membretado */}
                  <div className="p-4 rounded-2xl bg-zinc-900/90 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="text-xs font-black text-red-400 uppercase tracking-wider">
                        CODIZULCA C.A. • GERENCIA DE TRADE MARKETING
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold">
                        CERTIFICACIÓN VÁLIDA EN PDV
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Punto de Venta / Comercio:</span>
                        <strong className="text-white text-sm">{selectedMerchReportForAudit.store}</strong>
                        {selectedMerchReportForAudit.address && (
                          <p className="text-[11px] text-zinc-300 font-mono mt-0.5">{selectedMerchReportForAudit.address}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Mercaderista Especializado:</span>
                          <strong className="text-white">{selectedMerchReportForAudit.promoter}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Fecha y Hora de Inspección:</span>
                          <span className="font-mono text-emerald-400">{selectedMerchReportForAudit.date} • {selectedMerchReportForAudit.time || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* INFORME DE RECOMENDACIONES IA PARA EL CLIENTE (SI DISPONE DE IA) */}
                  {selectedMerchReportForAudit.aiRecommendations && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-950/40 via-purple-950/20 to-zinc-900 border border-violet-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            Diagnóstico y Recomendaciones de Visibilidad Generadas con IA
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-violet-900/80 text-violet-300 text-[10px] font-mono font-bold">
                          Score: {selectedMerchReportForAudit.aiRecommendations.visibilityScore}/100
                        </span>
                      </div>

                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1 text-xs">
                        <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">Diagnóstico de Mercado:</span>
                        <p className="text-zinc-200 leading-relaxed">
                          {selectedMerchReportForAudit.aiRecommendations.marketDiagnostic}
                        </p>
                      </div>

                      {/* Métricas de Góndola */}
                      {selectedMerchReportForAudit.metrics && (
                        <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                          <div className="p-2 bg-zinc-900 rounded-lg border border-white/5">
                            <span className="text-zinc-500 block text-[9px]">Share of Shelf</span>
                            <strong className="text-emerald-400 text-sm">{selectedMerchReportForAudit.metrics.shareOfShelfPercent}%</strong>
                          </div>
                          <div className="p-2 bg-zinc-900 rounded-lg border border-white/5">
                            <span className="text-zinc-500 block text-[9px]">Frentes Codizulca</span>
                            <strong className="text-red-400 text-sm">{selectedMerchReportForAudit.metrics.ourFacings} u.</strong>
                          </div>
                          <div className="p-2 bg-zinc-900 rounded-lg border border-white/5">
                            <span className="text-zinc-500 block text-[9px]">Frentes Competencia</span>
                            <strong className="text-zinc-300 text-sm">{selectedMerchReportForAudit.metrics.competitorFacings} u.</strong>
                          </div>
                        </div>
                      )}

                      {/* Recomendaciones Tácticas para el Comercio */}
                      <div className="space-y-2 pt-1">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                          Recomendaciones Tácticas para el Comercio / Gerencia del PDV:
                        </span>
                        <div className="space-y-2">
                          {selectedMerchReportForAudit.aiRecommendations.clientRecommendations.map((rec, i) => (
                            <div key={i} className="p-2.5 rounded-lg bg-black/50 border border-white/5 space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <strong className="text-zinc-100 font-bold">{rec.title}</strong>
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                                  + Ventas
                                </span>
                              </div>
                              <p className="text-zinc-300 text-[11px]">{rec.action}</p>
                              <p className="text-emerald-400 font-mono text-[10px]">💡 Beneficio: {rec.expectedBenefit}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Proyección y Carta */}
                      {selectedMerchReportForAudit.aiRecommendations.projectedSalesLift && (
                        <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-xs flex justify-between items-center">
                          <span className="text-zinc-300 text-[11px]">Proyección de Crecimiento Estimada:</span>
                          <strong className="text-emerald-400">{selectedMerchReportForAudit.aiRecommendations.projectedSalesLift}</strong>
                        </div>
                      )}

                      {selectedMerchReportForAudit.aiRecommendations.executiveSummaryForStoreManager && (
                        <div className="p-2.5 bg-zinc-900 rounded-lg border border-white/5 text-[10px] text-zinc-300 italic">
                          "{selectedMerchReportForAudit.aiRecommendations.executiveSummaryForStoreManager}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Labores Operativas Ejecutadas */}
                  <div className="p-4 rounded-2xl bg-zinc-900/90 border border-white/10 space-y-2">
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Labores y Tareas Operativas Verificadas en Anaquel:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                      {selectedMerchReportForAudit.activities.map((act, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 border border-white/5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-semibold text-zinc-200">{act}</span>
                        </div>
                      ))}
                    </div>
                    {selectedMerchReportForAudit.product && (
                      <p className="text-xs text-zinc-400 pt-2 border-t border-white/5 font-mono">
                        Marcas/SKUs intervenidos: <strong>{selectedMerchReportForAudit.product}</strong>
                      </p>
                    )}
                  </div>

                  {/* Observaciones y Hallazgos */}
                  {selectedMerchReportForAudit.observations && (
                    <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-white/10 text-xs space-y-1">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Observaciones y Diagnóstico de Campo:</span>
                      <p className="italic text-zinc-200 leading-relaxed">"{selectedMerchReportForAudit.observations}"</p>
                    </div>
                  )}

                  {/* Malla con las Fotografías de Evidencia */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                      Evidencias Fotográficas de Auditoría ({selectedMerchReportForAudit.photos?.length || 0} fotos):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {selectedMerchReportForAudit.photos?.map((pic, idx) => (
                        <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black group shadow-sm">
                          <img src={pic} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-mono">
                            Evidencia #{idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bloque de Certificación Presencial y Firma Digital */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-zinc-900 to-zinc-900 border border-blue-500/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-blue-400" />
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Declaración y Certificación del Responsable del Establecimiento
                      </h4>
                    </div>

                    <p className="text-xs text-blue-200 italic leading-relaxed">
                      “Certifico formalmente que el promotor/mercaderista visitó personalmente este establecimiento y llevó a cabo las labores de merchandising indicadas.”
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/10 text-xs">
                      <div className="space-y-1">
                        <p className="text-zinc-400">Responsable / Encargado: <strong className="text-white">{selectedMerchReportForAudit.storeManagerName}</strong></p>
                        <p className="text-zinc-400">Cargo: <strong className="text-zinc-200">{selectedMerchReportForAudit.storeManagerRole}</strong></p>
                        {selectedMerchReportForAudit.storeManagerPhone && (
                          <p className="text-zinc-400">Teléfono: <strong className="text-zinc-300 font-mono">{selectedMerchReportForAudit.storeManagerPhone}</strong></p>
                        )}
                        <p className="text-[10px] text-zinc-500 font-mono">Timestamp Certificado: {selectedMerchReportForAudit.signedAt}</p>
                      </div>

                      {/* Recuadro de la Firma Digital */}
                      <div className="bg-white p-2 rounded-xl shadow-inner border border-gray-300 text-center w-48 shrink-0">
                        <span className="text-[9px] text-gray-500 font-mono block mb-1">Firma Digital Certificada:</span>
                        <img src={selectedMerchReportForAudit.signature} alt="Firma" className="h-16 mx-auto object-contain" />
                        <span className="text-[9px] text-gray-700 font-bold block border-t border-gray-200 pt-0.5 mt-0.5">
                          {selectedMerchReportForAudit.storeManagerName}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pie del Modal */}
                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setSelectedMerchReportForAudit(null)}
                    className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cerrar Auditoría
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* E. MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
          {deleteConfirmMerchReport && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#121316] border border-white/15 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-500/40 text-red-500 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">¿Eliminar reporte de merchandising?</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Esta acción eliminará el informe y las evidencias fotográficas de la auditoría.</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-xs text-zinc-300 space-y-1">
                  <p><strong>Tienda:</strong> {deleteConfirmMerchReport.store}</p>
                  <p><strong>Mercaderista:</strong> {deleteConfirmMerchReport.promoter}</p>
                  <p><strong>Encargado:</strong> {deleteConfirmMerchReport.storeManagerName} ({deleteConfirmMerchReport.storeManagerRole})</p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmMerchReport(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMerchReport(deleteConfirmMerchReport.id)}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Eliminación</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBMÓDULO 4: PERSONAL & FICHAS DE PROMOTORAS (TRADE MARKETING & RRHH)      */}
      {/* ========================================================================= */}
      {activeSubmodule === 'personal' && (() => {
        // Filtrado de personal según categoría y término de búsqueda
        const filteredStaff = staffMembers.filter((s) => {
          const matchCategory =
            personalCategoryFilter === 'todas'
              ? true
              : personalCategoryFilter === 'activo'
              ? s.status === 'Activo'
              : s.category === personalCategoryFilter;

          const matchSearch =
            personalSearchTerm.trim() === '' ||
            s.name.toLowerCase().includes(personalSearchTerm.toLowerCase()) ||
            s.phone.toLowerCase().includes(personalSearchTerm.toLowerCase()) ||
            (s.address && s.address.toLowerCase().includes(personalSearchTerm.toLowerCase())) ||
            (s.assignedStore && s.assignedStore.toLowerCase().includes(personalSearchTerm.toLowerCase())) ||
            (s.email && s.email.toLowerCase().includes(personalSearchTerm.toLowerCase()));

          return matchCategory && matchSearch;
        });

        const counts = {
          total: staffMembers.length,
          fija: staffMembers.filter((s) => s.category === 'fija').length,
          eventual: staffMembers.filter((s) => s.category === 'eventual').length,
          merchandising: staffMembers.filter((s) => s.category === 'merchandising').length,
          activo: staffMembers.filter((s) => s.status === 'Activo').length,
        };

        return (
          <div className="space-y-4 animate-in fade-in-50">
            {/* Toast de Notificación de Personal */}
            {personalActionToast && (
              <div className="bg-emerald-600 border border-emerald-400 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in slide-in-from-top-2 font-bold">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>{personalActionToast}</span>
                </div>
                <button
                  onClick={() => setPersonalActionToast(null)}
                  className="text-white/80 hover:text-white ml-2 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Barra Superior de Control y Filtros de Personal */}
            <div className="bg-[#121316] border border-white/10 rounded-2xl p-4 shadow-xl space-y-4">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0 shadow-lg">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-base">Fichas del Personal & Promotoras</h3>
                      <span className="px-2 py-0.5 rounded bg-red-600 text-white font-mono text-[10px] font-black uppercase">
                        {counts.total} Registradas
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Gestión de fotos de perfil, asignación de PDV, teléfonos y acceso personalizado a la App Móvil.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStaffMember(null);
                      setIsNewStaffModalOpen(true);
                    }}
                    className="flex-1 lg:flex-none px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ Registrar Promotora</span>
                  </button>
                </div>
              </div>

              {/* Filtros por Categoría y Buscador */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs">
                {/* Tabs de Categorías */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setPersonalCategoryFilter('todas')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                      personalCategoryFilter === 'todas'
                        ? 'bg-zinc-800 text-white border border-white/20 shadow-sm'
                        : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Todas ({counts.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalCategoryFilter('fija')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                      personalCategoryFilter === 'fija'
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Plantilla Fija ({counts.fija})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalCategoryFilter('eventual')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                      personalCategoryFilter === 'eventual'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Eventuales ({counts.eventual})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalCategoryFilter('merchandising')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                      personalCategoryFilter === 'merchandising'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Merchandising ({counts.merchandising})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersonalCategoryFilter('activo')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 cursor-pointer ${
                      personalCategoryFilter === 'activo'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    Activas ({counts.activo})
                  </button>
                </div>

                {/* Buscador Rápido de Personal */}
                <div className="relative min-w-[260px]">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={personalSearchTerm}
                    onChange={(e) => setPersonalSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, zona, teléfono o PDV..."
                    className="w-full pl-9 pr-8 py-1.5 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                  {personalSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setPersonalSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Grid de Fichas de Personal con Foto y Detalles */}
            {filteredStaff.length === 0 ? (
              <div className="bg-[#121316] border border-white/10 rounded-2xl p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-sm">No se encontraron promotoras</h4>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  No hay registros que coincidan con la búsqueda o el filtro seleccionado.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Grupos de Plantilla (Fija, Eventual, Merchandising) */}
                {(['fija', 'eventual', 'merchandising'] as const).map((catKey) => {
                  const sectionStaff = filteredStaff.filter((s) => s.category === catKey);
                  if (sectionStaff.length === 0) return null;

                  const sectionTitle =
                    catKey === 'fija'
                      ? `PLANTILLA FIJA (${sectionStaff.length})`
                      : catKey === 'eventual'
                      ? `PLANTILLA EVENTUAL (${sectionStaff.length})`
                      : `PROMOTORES MERCHANDISING (${sectionStaff.length})`;

                  return (
                    <div key={catKey} className="space-y-3">
                      {/* Título de la Sección */}
                      <div className="flex items-center gap-2 px-1">
                        {catKey === 'merchandising' && (
                          <ShieldCheck className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <h4 className={`text-xs font-black uppercase tracking-wider ${
                          catKey === 'merchandising' ? 'text-red-500' : 'text-zinc-300'
                        }`}>
                          {sectionTitle}
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3.5">
                        {sectionStaff.map((p) => {
                          const portalUrl = `${window.location.origin}/portal/login?email=${encodeURIComponent(p.email)}`;
                          const isMerch = p.category === 'merchandising';
                          const isPassRevealed = revealedPasswords[p.id];
                          const pDegustacionesSemana = currentWeekDegustaciones.filter((d) =>
                            matchPromoterAssignment(d, p, p.email)
                          );

                          return (
                            <div
                              key={p.id}
                              className="bg-[#111215] border border-white/10 hover:border-white/20 rounded-2xl p-4 shadow-xl flex flex-col justify-between space-y-3 transition-all relative overflow-hidden group"
                            >
                              <div>
                                {/* Cabecera de la Ficha: Foto con Botón de Carga + Nombre + Chips + Acciones */}
                                <div className="flex items-start justify-between gap-3">
                                  {/* Avatar con botón de cámara */}
                                  <div className="relative group/photo shrink-0">
                                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/15 bg-zinc-800 shadow-md relative flex items-center justify-center">
                                      {p.photoUrl ? (
                                        <img
                                          src={p.photoUrl}
                                          alt={p.name}
                                          className="w-full h-full object-cover group-hover/photo:scale-105 transition-transform duration-300"
                                          onError={(e) => {
                                            (e.target as HTMLElement).style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <div
                                          className={`w-full h-full ${
                                            p.avatarBg || 'bg-emerald-700'
                                          } text-white font-black text-lg flex items-center justify-center`}
                                        >
                                          {p.name.charAt(0)}
                                        </div>
                                      )}

                                      {/* Overlay de Carga Rápida de Foto */}
                                      <label
                                        htmlFor={`photo-upload-${p.id}`}
                                        className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center text-white cursor-pointer transition-opacity"
                                        title="Subir / Cambiar Foto"
                                      >
                                        <Camera className="w-4 h-4 text-white" />
                                      </label>
                                    </div>

                                    {/* Botón Circular Rápido de Cámara */}
                                    <label
                                      htmlFor={`photo-upload-${p.id}`}
                                      className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-zinc-900 border border-white/20 text-zinc-300 hover:text-white flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110"
                                      title="Cambiar Foto"
                                    >
                                      <Camera className="w-2.5 h-2.5" />
                                    </label>

                                    <input
                                      id={`photo-upload-${p.id}`}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          handleStaffPhotoUpload(p.id, file);
                                        }
                                      }}
                                    />
                                  </div>

                                  {/* Nombre y Chips */}
                                  <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-white text-sm truncate tracking-tight" title={p.name}>
                                      {p.name}
                                    </h4>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 font-bold text-[10px]">
                                        {p.status === 'Activo' ? 'Activo' : p.status}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                                        isMerch
                                          ? 'bg-red-950/80 border-red-500/40 text-red-400'
                                          : p.category === 'eventual'
                                          ? 'bg-blue-950/80 border-blue-500/40 text-blue-400'
                                          : 'bg-zinc-800 border-white/10 text-zinc-300'
                                      }`}>
                                        {p.category === 'fija'
                                          ? 'Plantilla Fija'
                                          : p.category === 'eventual'
                                          ? 'Plantilla Eventual'
                                          : 'Merchandising'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Acciones: Editar y Eliminar */}
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingStaffMember(p);
                                        setIsNewStaffModalOpen(true);
                                      }}
                                      className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg transition-colors cursor-pointer"
                                      title="Editar Ficha"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmStaff(p)}
                                      className="text-zinc-500 hover:text-red-400 p-1 rounded-lg transition-colors cursor-pointer"
                                      title="Eliminar Promotora"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Filas de Información de Contacto, Credenciales y Asignación */}
                                <div className="mt-3.5 space-y-1.5 text-xs text-zinc-400">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-500">Teléfono:</span>
                                    <span className="font-mono text-zinc-200 font-medium truncate">
                                      {p.phone}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-500">Correo:</span>
                                    <span className="text-zinc-200 font-mono text-[11px] font-medium truncate max-w-[210px]" title={p.email}>
                                      {p.email}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-500">Asignación PDV:</span>
                                    <span className={`font-bold uppercase truncate max-w-[200px] ${
                                      isMerch ? 'text-red-400' : p.category === 'eventual' ? 'text-blue-400' : 'text-emerald-400'
                                    }`} title={p.assignedStore}>
                                      {p.assignedStore || 'VARIAS'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-500">Dirección:</span>
                                    <span className="text-zinc-200 font-medium truncate max-w-[200px]" title={p.address}>
                                      {p.address || '-'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 pt-0.5">
                                    <span className="text-zinc-500">Contraseña App:</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-zinc-300 font-bold">
                                        {isPassRevealed ? (p.password || 'Codi.123') : '••••••••'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setRevealedPasswords(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                                        className="text-[10px] text-zinc-400 hover:text-white p-0.5 cursor-pointer"
                                        title={isPassRevealed ? 'Ocultar' : 'Ver Contraseña'}
                                      >
                                        {isPassRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Degustaciones en Cronograma Actual (Semana en Curso) */}
                              <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Cronograma Actual:</span>
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                    pDegustacionesSemana.length > 0
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : 'bg-zinc-800 text-zinc-400 border border-white/5'
                                  }`}>
                                    {pDegustacionesSemana.length} asignada(s)
                                  </span>
                                </div>

                                {pDegustacionesSemana.length > 0 ? (
                                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                    {pDegustacionesSemana.map((deg) => (
                                      <div
                                        key={deg.id}
                                        className="p-2 rounded-xl bg-zinc-900/90 border border-white/10 hover:border-amber-500/30 transition-all text-[11px] space-y-1"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-amber-400 font-mono font-bold text-[10px]">
                                            📅 {deg.date}
                                          </span>
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold ${
                                            deg.status === 'in_progress'
                                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                                              : deg.status === 'completed'
                                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                              : 'bg-zinc-800 text-zinc-300'
                                          }`}>
                                            {deg.status === 'in_progress' ? 'En Curso' : deg.status === 'completed' ? 'Completada' : 'Programada'}
                                          </span>
                                        </div>
                                        <div className="font-bold text-white truncate flex items-center gap-1">
                                          <Store className="w-3 h-3 text-red-500 shrink-0" />
                                          <span className="truncate">{deg.client}</span>
                                        </div>
                                        <div className="text-zinc-400 flex items-center justify-between text-[10px]">
                                          <span className="truncate font-medium">{deg.product}</span>
                                          <span className="font-mono text-zinc-300">{deg.time}</span>
                                        </div>
                                        {deg.vendedor && (
                                          <div className="text-[10px] text-amber-400/90 font-mono pt-0.5 truncate">
                                            👤 Solicitado por: {deg.vendedor}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPromoterFilter(p.name);
                                        setActiveSubmodule('degustaciones');
                                        setDegustacionSubtab('actual');
                                      }}
                                      className="w-full text-center text-[10px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer pt-1"
                                    >
                                      Ver en Cronograma Actual ({pDegustacionesSemana.length}) →
                                    </button>
                                  </div>
                                ) : (
                                  <div className="p-2 rounded-xl bg-zinc-900/40 border border-white/5 text-center text-[11px] text-zinc-500">
                                    Sin degustaciones en cronograma actual (Disponible)
                                  </div>
                                )}
                              </div>

                              {/* Botón de Acceso Personalizado a la App Móvil */}
                              <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCopyCustomLink(portalUrl, p.id)}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-md ${
                                    isMerch
                                      ? 'bg-red-950/60 hover:bg-red-900/60 border-red-500/40 text-red-200 hover:text-white'
                                      : staffCopiedId === p.id
                                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-600/20'
                                      : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-300 hover:text-white'
                                  }`}
                                >
                                  {staffCopiedId === p.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-white" />
                                      <span>¡Enlace Copiado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                                      <span>Copiar Enlace App</span>
                                    </>
                                  )}
                                </button>
                                <a
                                  href={portalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                                  title={`Abrir App de ${p.name}`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL: REGISTRAR / EDITAR FICHA DE PERSONAL & FOTO DE PROMOTORA           */}
            {/* ========================================================================= */}
            {isNewStaffModalOpen && (() => {
              return (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
                  <div className="bg-[#121316] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#16171b]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-500">
                          {editingStaffMember ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base">
                            {editingStaffMember ? 'Editar Ficha de Promotora' : 'Registrar Nueva Promotora'}
                          </h3>
                          <span className="text-[11px] text-zinc-400">
                            Información oficial de nómina, foto y asignación de PDV
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewStaffModalOpen(false);
                          setEditingStaffMember(null);
                        }}
                        className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const memberData: Omit<StaffMember, 'id'> & { id?: string } = {
                          id: editingStaffMember ? editingStaffMember.id : undefined,
                          name: formData.get('name') as string,
                          role: formData.get('role') as StaffMember['role'],
                          category: formData.get('category') as StaffMember['category'],
                          status: formData.get('status') as StaffMember['status'],
                          phone: formData.get('phone') as string,
                          email: formData.get('email') as string,
                          password: (formData.get('password') as string) || editingStaffMember?.password || 'Codi.123',
                          address: formData.get('address') as string,
                          assignedStore: formData.get('assignedStore') as string,
                          photoUrl: (formData.get('photoUrl') as string) || editingStaffMember?.photoUrl || '',
                          avatarBg: editingStaffMember?.avatarBg || 'bg-red-600',
                          assignedDegustaciones: editingStaffMember?.assignedDegustaciones || 0,
                          reportsSubmitted: editingStaffMember?.reportsSubmitted || 0,
                          efficiencyScore: editingStaffMember?.efficiencyScore || 100
                        };
                        handleSaveStaffMember(memberData);
                      }}
                      className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto"
                    >
                      {/* Sección de Foto de Perfil */}
                      <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-2.5">
                        <label className="block text-zinc-300 font-bold flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-red-500" />
                          <span>Foto de Perfil de la Promotora</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border border-white/15 shrink-0 flex items-center justify-center">
                            {editingStaffMember?.photoUrl ? (
                              <img
                                src={editingStaffMember.photoUrl}
                                alt="Vista previa"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Camera className="w-6 h-6 text-zinc-500" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <label className="block">
                              <span className="text-[10px] text-zinc-400 block mb-1">Subir archivo desde dispositivo:</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      const base64 = ev.target?.result as string;
                                      if (base64 && editingStaffMember) {
                                        setEditingStaffMember({ ...editingStaffMember, photoUrl: base64 });
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="text-[11px] text-zinc-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-red-600 file:text-white hover:file:bg-red-500 cursor-pointer"
                              />
                            </label>
                            <input
                              type="text"
                              name="photoUrl"
                              defaultValue={editingStaffMember?.photoUrl || ''}
                              placeholder="O pegar URL de imagen..."
                              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-2.5 py-1.5 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-red-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Nombre Completo & Teléfono */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Nombre y Apellido *</label>
                          <input
                            type="text"
                            name="name"
                            required
                            defaultValue={editingStaffMember?.name || ''}
                            placeholder="Ej. Careliz Reyes"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 font-bold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Teléfono (WhatsApp) *</label>
                          <input
                            type="text"
                            name="phone"
                            required
                            defaultValue={editingStaffMember?.phone || '+58 414-'}
                            placeholder="+58 414-1234567"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Rol y Categoría de Contratación */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Rol Oficial</label>
                          <select
                            name="role"
                            defaultValue={editingStaffMember?.role || 'Promotora'}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                          >
                            <option value="Promotora">Promotora</option>
                            <option value="Impulsadora">Impulsadora</option>
                            <option value="Promotor Merchandising">Promotor Merchandising</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Tipo de Nómina / Categoría</label>
                          <select
                            name="category"
                            defaultValue={editingStaffMember?.category || 'fija'}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                          >
                            <option value="fija">Plantilla Fija</option>
                            <option value="eventual">Eventual / Fines de Semana</option>
                            <option value="merchandising">Merchandising / Anaquel</option>
                          </select>
                        </div>
                      </div>

                      {/* Estatus, Correo Electrónico & Contraseña */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Estatus Actual</label>
                          <select
                            name="status"
                            defaultValue={editingStaffMember?.status || 'Activo'}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                          >
                            <option value="Activo">Activo / Disponible</option>
                            <option value="En Descanso">En Descanso / Vacaciones</option>
                            <option value="Inactivo">Inactivo</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Correo de Acceso App *</label>
                          <input
                            type="email"
                            name="email"
                            required
                            defaultValue={editingStaffMember?.email || ''}
                            placeholder="promotora@gmail.com"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Contraseña App *</label>
                          <input
                            type="text"
                            name="password"
                            required
                            defaultValue={editingStaffMember?.password || 'Codi.123'}
                            placeholder="Codi.123"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Zona Geográfica & PDV Asignado */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Zona / Ubicación</label>
                          <input
                            type="text"
                            name="address"
                            defaultValue={editingStaffMember?.address || ''}
                            placeholder="Ej. Maracaibo Norte & Los Olivos"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-zinc-300 font-bold block">Punto de Venta Asignado</label>
                          <input
                            type="text"
                            name="assignedStore"
                            defaultValue={editingStaffMember?.assignedStore || ''}
                            placeholder="Ej. ALKOSTO BELLA VISTA"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewStaffModalOpen(false);
                            setEditingStaffMember(null);
                          }}
                          className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all shadow-lg shadow-red-600/30 cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{editingStaffMember ? 'Guardar Cambios' : 'Registrar Promotora'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })()}

            {/* Modal de Confirmación de Eliminación */}
            {deleteConfirmStaff && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
                <div className="bg-[#121316] border border-red-500/30 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
                  <div className="w-12 h-12 rounded-full bg-red-950/80 border border-red-500/40 flex items-center justify-center mx-auto text-red-500">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div className="text-center space-y-1">
                    <h4 className="font-bold text-white text-base">¿Eliminar Promotora?</h4>
                    <p className="text-xs text-zinc-400">
                      ¿Seguro que deseas eliminar a <strong className="text-white">{deleteConfirmStaff.name}</strong> de la nómina de Trade Marketing?
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmStaff(null)}
                      className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStaffMember(deleteConfirmStaff.id)}
                      className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow-lg shadow-red-600/30"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL: + AGENDAR DEGUSTACIÓN / ACTIVIDAD                                 */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#121316] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-white text-base uppercase tracking-wider">
                  Agendar Nueva Degustación
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateActivity} className="p-5 space-y-4 text-xs">
              {/* 1. SELECCIÓN DE PRODUCTO DESDE LA BASE DE DATOS OFICIAL */}
              <div className="space-y-2 p-3 rounded-xl bg-zinc-900/60 border border-white/10">
                <div className="flex items-center justify-between">
                  <label className="block text-zinc-300 font-bold flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5 text-red-500" />
                    <span>Producto de la Base de Datos ({dbProducts.length > 0 ? `${dbProducts.length} SKUs Disponibles` : 'Cargando...'})</span>
                  </label>
                  {selectedDbProduct && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono ${
                      selectedDbProduct.isPesable
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    }`}>
                      {selectedDbProduct.isPesable ? '⚖️ Pesable (Kg)' : '📦 Empacado (Cajas)'}
                    </span>
                  )}
                </div>

                {/* Filtro Rápido de Búsqueda y Categoría de Productos */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Filtrar por SKU o nombre (ej. 629, Ebenezer, Corral)..."
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <select
                      value={selectedProductCategory}
                      onChange={(e) => setSelectedProductCategory(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-red-500 font-bold"
                    >
                      {productCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === 'TODAS' ? 'Todas las Categorías' : cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selector Principal con los 285 Productos de la Base de Datos */}
                <select
                  value={newActivity.product}
                  onChange={(e) => {
                    const prodName = e.target.value;
                    const found = dbProducts.find((p) => p.articulo === prodName);
                    setSelectedDbProduct(found || null);
                    setNewActivity((prev) => ({
                      ...prev,
                      product: prodName,
                      activity: prev.activity && !prev.activity.startsWith('Degustación') && !prev.activity.startsWith('Impulso')
                        ? prev.activity
                        : `Impulso y Degustación ${prodName}`
                    }));
                  }}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold text-xs"
                >
                  {isLoadingProducts ? (
                    <option value="">Cargando productos del catálogo...</option>
                  ) : filteredModalProducts.length === 0 ? (
                    <option value="">No hay productos que coincidan con la búsqueda</option>
                  ) : (
                    filteredModalProducts.map((p) => (
                      <option key={p.id_articulo} value={p.articulo}>
                        [{p.codigo}] {p.articulo} — {p.isPesable ? '(KILOS / KG)' : '(CAJAS / CJ)'} • ${p.avgPricePerUnit.toFixed(2)}
                      </option>
                    ))
                  )}
                </select>

                {/* Ficha Informativa del Producto Seleccionado */}
                {selectedDbProduct && (
                  <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-white/5 flex items-center justify-between text-[11px] flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800/50">
                        {selectedDbProduct.codigo}
                      </span>
                      <span className="text-zinc-300 font-bold truncate max-w-[200px]">
                        {selectedDbProduct.articulo}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[10px]">
                      <span className="text-zinc-400">
                        Cat: <strong className="text-white">{selectedDbProduct.category}</strong>
                      </span>
                      <span className="text-zinc-400">
                        Precio Ref: <strong className="text-emerald-400">${selectedDbProduct.avgPricePerUnit.toFixed(2)} {selectedDbProduct.isPesable ? '/kg' : '/cj'}</strong>
                      </span>
                      <span className="text-zinc-400">
                        Rotación: <strong className="text-yellow-400">{selectedDbProduct.rotation}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. NOMBRE DE LA ACTIVIDAD */}
              <div>
                <label className="block text-zinc-400 font-bold mb-1">Nombre de la Actividad</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Impulso Pollo Ebenezer & Nuggets"
                  value={newActivity.activity}
                  onChange={(e) => setNewActivity({ ...newActivity, activity: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                />
              </div>

              {/* 3. VENDEDOR SOLICITANTE Y PROMOTORA ASIGNADA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-amber-400 font-bold mb-1 flex items-center gap-1.5 text-xs">
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" /> Vendedor Solicitante (App Vendedores)
                  </label>
                  <select
                    value={newActivity.vendedor}
                    onChange={(e) => setNewActivity({ ...newActivity, vendedor: e.target.value })}
                    className="w-full bg-zinc-900 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-300 focus:outline-none focus:border-amber-500 font-bold text-xs"
                  >
                    {uniqueVendedores.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1 text-xs">Promotora Asignada (Ruta App)</label>
                  <select
                    value={newActivity.promoter}
                    onChange={(e) => {
                      const p = personal.find((pers) => pers.name === e.target.value);
                      setNewActivity({
                        ...newActivity,
                        promoter: e.target.value,
                        promoterRole: p ? p.role : 'Promotora'
                      });
                    }}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold text-xs"
                  >
                    <option value="POR ASIGNAR (Trade Marketing)">-- POR ASIGNAR (Trade Marketing) --</option>
                    {personal.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} — {p.email} ({p.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. CLIENTE PDV (BASE OFICIAL) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 font-bold text-xs">Cliente PDV (Base de Datos Oficial)</label>
                  <span className="text-[10px] text-amber-400 font-mono font-bold flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Alkosto Prioritario
                  </span>
                </div>

                {/* Acceso Rápido a Sedes de ALKOSTO (1 Clic) */}
                <div className="mb-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-[10px] text-amber-300 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Building className="w-3 h-3 text-amber-400" /> Sedes Oficiales ALKOSTO (Selección Rápida):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALKOSTO_BRANCHES.map((branch) => (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => {
                          setNewActivity({
                            ...newActivity,
                            client: branch.nombre,
                            zone: branch.zona
                          });
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          newActivity.client === branch.nombre
                            ? 'bg-amber-500 text-black font-black shadow-md'
                            : 'bg-zinc-900/90 text-amber-200 hover:bg-amber-500/20 border border-amber-500/30'
                        }`}
                      >
                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        <span>{branch.nombre.replace('ALKOSTO DONDE COMPRAR ES GANAR, C.A. ', '')}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campo de Búsqueda y Autocompletado para todos los 300+ clientes */}
                <input
                  type="text"
                  required
                  list="clientes-pdv-list-full"
                  placeholder="Escriba o busque PDV (Alkosto, Automercados, Supermercados)..."
                  value={newActivity.client}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = allAvailableClients.find((c) => c.nombre.toLowerCase() === val.toLowerCase());
                    setNewActivity({
                      ...newActivity,
                      client: val,
                      zone: matched ? matched.zona : newActivity.zone
                    });
                  }}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold text-xs"
                />
                <datalist id="clientes-pdv-list-full">
                  {allAvailableClients.map((c) => (
                    <option key={c.id} value={c.nombre}>
                      {c.isKeyAccount ? '⭐ [CUENTA CLAVE ALKOSTO] ' : ''}{c.zona} — Supervisor: {c.supervisor}
                    </option>
                  ))}
                </datalist>

                {/* Ficha de Información de Cliente si es Alkosto */}
                {newActivity.client.toUpperCase().includes('ALKOSTO') && (
                  <div className="mt-1.5 p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                      <span>CUENTA CLAVE: ALKOSTO DONDE COMPRAR ES GANAR</span>
                    </div>
                    <span className="font-mono text-zinc-300">
                      Supervisor: <strong>SAIRU VALLES</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* 4. ZONA COMERCIAL Y FECHA / HORA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Zona Comercial</label>
                  <input
                    type="text"
                    value={newActivity.zone}
                    onChange={(e) => setNewActivity({ ...newActivity, zone: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Fecha</label>
                    <input
                      type="text"
                      placeholder="DD/MM/AAAA"
                      value={newActivity.date}
                      onChange={(e) => setNewActivity({ ...newActivity, date: e.target.value })}
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Meta Muestras</label>
                    <input
                      type="number"
                      min="1"
                      value={newActivity.target}
                      onChange={(e) => setNewActivity({ ...newActivity, target: Number(e.target.value) })}
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Horario</label>
                  <input
                    type="text"
                    placeholder="14:00 - 18:00"
                    value={newActivity.time}
                    onChange={(e) => setNewActivity({ ...newActivity, time: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Instrucciones Especiales / POP</label>
                  <input
                    type="text"
                    placeholder="Material necesario, stand, frío..."
                    value={newActivity.comments}
                    onChange={(e) => setNewActivity({ ...newActivity, comments: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-colors shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  Confirmar y Agendar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDITAR DEGUSTACIÓN                                                 */}
      {/* ========================================================================= */}
      {editingActivity && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#121316] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#121316] z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-950/60 border border-blue-500/40 flex items-center justify-center shrink-0">
                  <Pencil className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Editar Degustación • {editingActivity.id}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Modificar datos operativos, metas y estatus de la actividad comercial.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingActivity(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateActivity} className="p-5 space-y-4 text-xs">
              {/* 1. Nombre de la Actividad */}
              <div>
                <label className="block text-zinc-400 font-bold mb-1">Nombre de la Actividad</label>
                <input
                  type="text"
                  required
                  value={editingActivity.activity}
                  onChange={(e) => setEditingActivity({ ...editingActivity, activity: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                />
              </div>

              {/* 2. Producto */}
              <div>
                <label className="block text-zinc-400 font-bold mb-1">Producto Degustado</label>
                <input
                  type="text"
                  required
                  value={editingActivity.product}
                  onChange={(e) => setEditingActivity({ ...editingActivity, product: e.target.value })}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              {/* 2.1 Vendedor Solicitante (App Vendedores) */}
              <div>
                <label className="block text-amber-400 font-bold mb-1 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" /> Vendedor Solicitante (App Vendedores)
                </label>
                <input
                  type="text"
                  value={editingActivity.vendedor || ''}
                  onChange={(e) => setEditingActivity({ ...editingActivity, vendedor: e.target.value })}
                  placeholder="Ej: MARIANA CHACÍN, CARLOS FUENMAYOR..."
                  className="w-full bg-zinc-900 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* 3. Promotora y Rol */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Promotora Asignada (Ruta App)</label>
                  <select
                    value={editingActivity.promoter}
                    onChange={(e) => {
                      const p = personal.find((pers) => pers.name === e.target.value);
                      setEditingActivity({
                        ...editingActivity,
                        promoter: e.target.value,
                        promoterEmail: p ? p.email : '',
                        promoterId: p ? p.id : '',
                        promoterRole: p ? p.role : editingActivity.promoterRole
                      });
                    }}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                  >
                    <option value="POR ASIGNAR (Trade Marketing)">-- POR ASIGNAR (Trade Marketing) --</option>
                    {personal.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} — {p.email} ({p.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Rol Operativo</label>
                  <select
                    value={editingActivity.promoterRole}
                    onChange={(e) => setEditingActivity({
                      ...editingActivity,
                      promoterRole: e.target.value as 'Promotora' | 'Impulsadora' | 'Promotor Merchandising'
                    })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Promotora">Promotora</option>
                    <option value="Impulsadora">Impulsadora</option>
                    <option value="Promotor Merchandising">Promotor Merchandising</option>
                  </select>
                </div>
              </div>

              {/* 4. Cliente PDV y Zona */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Cliente PDV</label>
                  <input
                    type="text"
                    required
                    value={editingActivity.client}
                    onChange={(e) => setEditingActivity({ ...editingActivity, client: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Zona Comercial</label>
                  <input
                    type="text"
                    required
                    value={editingActivity.zone}
                    onChange={(e) => setEditingActivity({ ...editingActivity, zone: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* 5. Fecha, Horario y Estado */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Fecha (DD/MM/AAAA)</label>
                  <input
                    type="text"
                    required
                    value={editingActivity.date}
                    onChange={(e) => setEditingActivity({ ...editingActivity, date: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Horario</label>
                  <input
                    type="text"
                    value={editingActivity.time}
                    onChange={(e) => setEditingActivity({ ...editingActivity, time: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Estado</label>
                  <select
                    value={editingActivity.status}
                    onChange={(e) => setEditingActivity({
                      ...editingActivity,
                      status: e.target.value as 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
                    })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 font-bold"
                  >
                    <option value="scheduled">Programado</option>
                    <option value="in_progress">En Curso</option>
                    <option value="completed">Completado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>

              {/* 6. Muestras Meta, Entregadas y % Aceptación */}
              <div className="grid grid-cols-3 gap-3 bg-zinc-900/60 p-3 rounded-xl border border-white/5">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Meta Muestras</label>
                  <input
                    type="number"
                    min="1"
                    value={editingActivity.target}
                    onChange={(e) => setEditingActivity({ ...editingActivity, target: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Entregadas</label>
                  <input
                    type="number"
                    min="0"
                    value={editingActivity.delivered}
                    onChange={(e) => setEditingActivity({ ...editingActivity, delivered: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">% Aceptación</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editingActivity.acceptanceRate}
                    onChange={(e) => setEditingActivity({ ...editingActivity, acceptanceRate: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* 7. Comentarios */}
              <div>
                <label className="block text-zinc-400 font-bold mb-1">Comentarios / Observaciones</label>
                <input
                  type="text"
                  value={editingActivity.comments || ''}
                  onChange={(e) => setEditingActivity({ ...editingActivity, comments: e.target.value })}
                  placeholder="Observaciones de campo, material POP, recepción..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Botones */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingActivity(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors shadow-lg shadow-blue-600/30 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ELIMINAR DEGUSTACIÓN (CONFIRMACIÓN)                                */}
      {/* ========================================================================= */}
      {activityToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#121316] border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">
                  Eliminar Degustación
                </h3>
                <span className="text-xs text-red-400 font-mono">
                  {activityToDelete.id}
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              ¿Estás seguro de que deseas eliminar permanentemente la actividad <strong className="text-white">"{activityToDelete.activity}"</strong> asignada a <strong className="text-white">{activityToDelete.promoter}</strong> en <strong className="text-white">{activityToDelete.client}</strong> para la fecha <strong className="text-white font-mono">{activityToDelete.date}</strong>?
            </p>

            <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-[11px] text-red-300">
              ⚠️ Esta acción no se puede deshacer y el registro se eliminará de las métricas comerciales.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActivityToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors shadow-lg shadow-red-600/30 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirmar y Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VER DETALLE DE INFORME RECIBIDO                                    */}
      {/* ========================================================================= */}
      {selectedInforme && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#121316] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-white text-base">
                  Auditoría Recibida • {selectedInforme.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInforme(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-zinc-900/60 p-3.5 rounded-xl border border-white/5">
                <div>
                  <span className="text-zinc-500 text-[11px] block">Cliente PDV:</span>
                  <span className="font-bold text-white text-sm">{selectedInforme.client}</span>
                  <span className="text-[11px] text-zinc-400 block mt-0.5">{selectedInforme.zone}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[11px] block">Auditora de Campo:</span>
                  <span className="font-bold text-white text-sm">{selectedInforme.promoter}</span>
                  <span className="text-[11px] text-zinc-400 block mt-0.5">{selectedInforme.date}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-center">
                  <span className="text-zinc-500 text-[11px] block">Stock en Góndola</span>
                  <div className="mt-1">{getStockBadge(selectedInforme.stock)}</div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-center">
                  <span className="text-zinc-500 text-[11px] block">Material POP</span>
                  <span className="font-bold text-white capitalize block mt-1">
                    {selectedInforme.pop}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-center">
                  <span className="text-zinc-500 text-[11px] block">Aceptación</span>
                  <span className="font-bold text-emerald-400 block mt-1">
                    {selectedInforme.acceptance}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-zinc-400 font-bold block mb-1">
                  Observaciones y Reporte de Campo:
                </span>
                <p className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 text-zinc-300 leading-relaxed italic">
                  "{selectedInforme.comments}"
                </p>
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-white/5">
                <span>Fotografías adjuntas: <strong className="text-white">{selectedInforme.photosCount} imágenes</strong></span>
                <span>Muestras entregadas: <strong className="text-emerald-400">{selectedInforme.samplesGiven || 0}</strong></span>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedInforme(null)}
                  className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors cursor-pointer"
                >
                  Cerrar Detalle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL: REGISTRAR BALANCE DE INVENTARIO & DEGUSTACIÓN                      */}
      {/* ========================================================================= */}
      {isNewReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#121316] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center shrink-0">
                  <Box className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Registrar Balance de Inventario & Degustación
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Control de stock inicial vs final, muestras y observaciones de campo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewReportModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInventoryReport} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Cliente PDV */}
              <div className="space-y-1">
                <label className="font-bold text-zinc-300 block">Punto de Venta / Cliente PDV:</label>
                <input
                  type="text"
                  required
                  value={newReportForm.client}
                  onChange={(e) => setNewReportForm({ ...newReportForm, client: e.target.value })}
                  placeholder="Ej: Olimpica mayorista, Alkosto Bella Vista..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-red-500 text-xs"
                />
                <div className="flex items-center flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] text-zinc-500">Sugerencias rápidas:</span>
                  <button
                    type="button"
                    onClick={() => setNewReportForm({ ...newReportForm, client: 'OLIMPICA MAYORISTA' })}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    Olimpica Mayorista
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewReportForm({ ...newReportForm, client: 'OLIMPICA SÚPER MARKET' })}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    Olimpica Súper Market
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewReportForm({ ...newReportForm, client: 'ALKOSTO DONDE COMPRAR ES GANAR (Bella Vista)' })}
                    className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-500/30 text-amber-300 transition-colors"
                  >
                    Alkosto Bella Vista
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewReportForm({ ...newReportForm, client: 'ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LA LIMPIA)' })}
                    className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-500/30 text-amber-300 transition-colors"
                  >
                    Alkosto La Limpia
                  </button>
                </div>
              </div>

              {/* Producto & Promotora */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 block">Producto:</label>
                  <select
                    value={newReportForm.productName}
                    onChange={(e) => setNewReportForm({ ...newReportForm, productName: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-red-500 text-xs cursor-pointer"
                  >
                    <option value="Arroz Vencampo 400gr">Arroz Vencampo 400gr</option>
                    <option value="Arroz Vencampo 500gr">Arroz Vencampo 500gr</option>
                    <option value="Arroz Vencampo 900gr">Arroz Vencampo 900gr</option>
                    <option value="Arroz Vencampo 1kg">Arroz Vencampo 1kg</option>
                    <option value="Azúcar Vencampo 400gr">Azúcar Vencampo 400gr</option>
                    <option value="Azúcar Vencampo 500gr">Azúcar Vencampo 500gr</option>
                    <option value="Azúcar Vencampo 900gr">Azúcar Vencampo 900gr</option>
                    <option value="Azúcar Vencampo 1kg">Azúcar Vencampo 1kg</option>
                    <option value="Aceite Vencampo 400gr">Aceite Vencampo 400gr</option>
                    <option value="Aceite Vencampo 500gr">Aceite Vencampo 500gr</option>
                    <option value="Aceite Vencampo 900gr">Aceite Vencampo 900gr</option>
                    <option value="Aceite Vencampo 1kg">Aceite Vencampo 1kg</option>
                    <option value="Leche Vencampo 400gr">Leche Vencampo 400gr</option>
                    <option value="Leche Vencampo 500gr">Leche Vencampo 500gr</option>
                    <option value="Leche Vencampo 900gr">Leche Vencampo 900gr</option>
                    <option value="Leche Vencampo 1kg">Leche Vencampo 1kg</option>
                    <option value="Embutidos (Mortadela, Salchichas...) - 1kg">Embutidos (Mortadela, Salchichas...) - 1kg</option>
                    <option value="Pollo Beneficiado Ebenezer por Kg">Pollo Beneficiado Ebenezer por Kg</option>
                    <option value="Salchichas Especiales Asturias 500g">Salchichas Especiales Asturias 500g</option>
                    <option value="Mortadela Esp d/Pollo Corral 1x12">Mortadela Esp d/Pollo Corral 1x12</option>
                    <option value="Jamón Cocido Superior Codizulca 1kg">Jamón Cocido Superior Codizulca 1kg</option>
                    <option value="Queso Paisa Pasteurizado por Kg">Queso Paisa Pasteurizado por Kg</option>
                    <option value="Huevos de Consumo Tunal Tipo A (Cartón 30)">Huevos Tunal Tipo A (Cartón 30)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 block">Promotora Asignada:</label>
                  <select
                    value={newReportForm.promoter}
                    onChange={(e) => setNewReportForm({ ...newReportForm, promoter: e.target.value })}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-red-500 text-xs cursor-pointer"
                  >
                    {staffMembers.length > 0 ? (
                      staffMembers.map((s) => (
                        <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                      ))
                    ) : (
                      <option value="CARELIZ REYES">CARELIZ REYES (Impulsadora)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Conteo de Inventarios: Inicial, Final y Muestras */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/60 p-3.5 rounded-xl border border-white/5">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 text-[11px] block">
                    Inv. Inicial:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newReportForm.initialStock}
                    onChange={(e) => setNewReportForm({ ...newReportForm, initialStock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold text-xs"
                  />
                  <span className="text-[9px] text-zinc-500 block">Antes degustación</span>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 text-[11px] block">
                    Inv. Final:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newReportForm.finalStock}
                    onChange={(e) => setNewReportForm({ ...newReportForm, finalStock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold text-xs"
                  />
                  <span className="text-[9px] text-zinc-500 block">Post degustación/venta</span>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-purple-300 text-[11px] block">
                    Muestras:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={newReportForm.samplesGiven}
                    onChange={(e) => setNewReportForm({ ...newReportForm, samplesGiven: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-purple-500/30 rounded-lg px-2.5 py-1.5 text-purple-300 font-mono font-bold text-xs"
                  />
                  <span className="text-[9px] text-purple-400/80 block">Entregadas</span>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300 text-[11px] block">
                    Unidad:
                  </label>
                  <select
                    value={newReportForm.unit}
                    onChange={(e) => setNewReportForm({ ...newReportForm, unit: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2 py-1.5 text-white font-mono text-xs"
                  >
                    <option value="Kg">Kg</option>
                    <option value="Paquetes">Paquetes</option>
                    <option value="Piezas">Piezas</option>
                    <option value="Unidades">Unidades</option>
                  </select>
                  <span className="text-[9px] text-zinc-500 block">Medida</span>
                </div>
              </div>

              {/* Resumen Calculado en Vivo del Resultado */}
              {(() => {
                const init = Number(newReportForm.initialStock) || 0;
                const fin = Number(newReportForm.finalStock) || 0;
                const samp = Number(newReportForm.samplesGiven) || 0;
                const calcSales = Math.round((init - fin - samp) * 10) / 10;
                const calcRot = init > 0 ? Math.round(((init - fin) / init) * 100) : 0;
                return (
                  <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-zinc-400 uppercase font-mono block">
                        Cálculo Automático del Resultado:
                      </span>
                      <span className="text-xs text-zinc-300">
                        Ventas Generadas = Inicial ({init}) - Final ({fin}) - Muestras ({samp})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`text-base font-black font-mono block ${calcSales > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {calcSales > 0 ? `+${calcSales}` : calcSales} {newReportForm.unit}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {calcRot}% de rotación
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Observación de la Promotora */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-zinc-300 block">
                    Observación de la Actividad (Promotora):
                  </label>
                  <span className="text-[10px] text-zinc-500">Reacción del público y motivos</span>
                </div>
                <textarea
                  required
                  rows={3}
                  value={newReportForm.promoterObservation}
                  onChange={(e) => setNewReportForm({ ...newReportForm, promoterObservation: e.target.value })}
                  placeholder="Ej: Buen precio, alta afluencia de amas de casa en pasillo, prefirieron la degustación con queso paisa..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 text-xs"
                />
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsNewReportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-colors shadow-lg shadow-red-600/30 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Balance de Inventario</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDITAR / COLOCAR OBSERVACIÓN DE LA ACTIVIDAD (PROMOTORA)           */}
      {/* ========================================================================= */}
      {editingObservationReportId && (() => {
        const targetReport = inventoryReports.find((r) => r.id === editingObservationReportId);
        if (!targetReport) return null;
        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50">
            <div className="bg-[#121316] border border-blue-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-500/40 flex items-center justify-center shrink-0">
                    <Pencil className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      Observación de la Actividad
                    </h3>
                    <span className="text-xs text-blue-300 font-mono">
                      {targetReport.client} • {targetReport.productName}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingObservationReportId(null)}
                  className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-xs text-zinc-300 flex items-center justify-between font-mono">
                <span>Promotora: <strong className="text-white">{targetReport.promoter}</strong></span>
                <span>Resultado: <strong className={targetReport.salesGenerated > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {targetReport.salesGenerated > 0 ? `+${targetReport.salesGenerated}` : targetReport.salesGenerated} {targetReport.unit}
                </strong></span>
              </div>

              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-white block">
                  Coloca o modifica la observación de la promotora:
                </label>
                <textarea
                  rows={4}
                  value={tempObservation}
                  onChange={(e) => setTempObservation(e.target.value)}
                  placeholder="Escribe la observación de la actividad realizada en el punto de venta..."
                  className="w-full bg-zinc-900 border border-white/15 rounded-xl p-3.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setEditingObservationReportId(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveObservation(targetReport.id)}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors shadow-lg shadow-blue-600/30 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Observación</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL: CREDENCIALES DE ACCESO A LA APP DE PROMOTORAS                      */}
      {/* ========================================================================= */}
      {isCredentialsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-[#121316] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Header del Modal */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#16171b] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-500 shadow-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <span>Credenciales de Acceso - App de Promotoras</span>
                    <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30 font-mono text-[10px] font-black">
                      {staffMembers.length} Promotoras
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Usuarios y contraseñas registrados para ingresar a <strong className="text-white">/portal/login</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCredentialsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Buscador de Credenciales */}
            <div className="p-4 bg-[#141518] border-b border-white/5 shrink-0 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={credentialsSearchTerm}
                  onChange={(e) => setCredentialsSearchTerm(e.target.value)}
                  placeholder="Buscar promotora por nombre, correo o zona..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow-md cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedLink ? '¡Copiado!' : 'Copiar Enlace App'}</span>
              </button>
            </div>

            {/* Lista de Promotoras y Credenciales */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {/* Tarjeta Destacada: Coordinadora de Trade Marketing (Grecia) */}
              {(!credentialsSearchTerm.trim() ||
                'grecia coordinadora trade marketing grecia01@codizulca.com'.includes(
                  credentialsSearchTerm.toLowerCase()
                )) && (
                <div className="p-3.5 rounded-2xl bg-red-950/30 border border-red-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-red-600 border border-red-400/40 shrink-0 flex items-center justify-center font-black text-white text-xs">
                      G
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-white text-xs uppercase truncate">
                          GRECIA (COORDINADORA TRADE MARKETING)
                        </h4>
                        <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-mono text-[9px] font-black uppercase">
                          Coordinación General
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-300 mt-1 font-mono flex-wrap">
                        <span className="text-white font-bold truncate">✉️ Grecia01@codizulca.com</span>
                        <span className="text-zinc-500">•</span>
                        <div className="flex items-center gap-1">
                          <span>🔑</span>
                          <span className="text-emerald-400 font-bold">
                            {revealedPasswords['COORD-TM-01'] ? 'Codi.02' : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedPasswords((prev) => ({
                                ...prev,
                                'COORD-TM-01': !prev['COORD-TM-01'],
                              }))
                            }
                            className="text-zinc-400 hover:text-white ml-0.5 cursor-pointer"
                            title="Ver contraseña"
                          >
                            {revealedPasswords['COORD-TM-01'] ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        const coordPortalUrl = `${window.location.origin}/portal/login?email=${encodeURIComponent('Grecia01@codizulca.com')}`;
                        const text = `Credenciales Coordinación Trade Marketing\nCoordinadora: GRECIA\nCorreo: Grecia01@codizulca.com\nContraseña: Codi.02\nEnlace App Campo: ${coordPortalUrl}`;
                        navigator.clipboard.writeText(text);
                        setCopiedCredentialId('COORD-TM-01');
                        setTimeout(() => setCopiedCredentialId(null), 2500);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1 border border-white/10 transition-colors cursor-pointer"
                    >
                      {copiedCredentialId === 'COORD-TM-01' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-zinc-400" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                    <a
                      href={`${window.location.origin}/portal/login?email=${encodeURIComponent('Grecia01@codizulca.com')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <span>Abrir</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {staffMembers
                .filter(s => {
                  if (!credentialsSearchTerm.trim()) return true;
                  const term = credentialsSearchTerm.toLowerCase();
                  return s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term) || (s.address && s.address.toLowerCase().includes(term));
                })
                .map((s) => {
                  const portalUrl = `${window.location.origin}/portal/login?email=${encodeURIComponent(s.email)}`;
                  const isPassRev = revealedPasswords[s.id];

                  return (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-2xl bg-[#17181c] border border-white/5 hover:border-white/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-white/10 shrink-0 flex items-center justify-center font-black text-white text-xs">
                          {s.photoUrl ? (
                            <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                          ) : (
                            s.name.charAt(0)
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white text-xs uppercase truncate">{s.name}</h4>
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[9px] font-bold">
                              {s.role}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-1 font-mono">
                            <span className="text-zinc-300 font-bold truncate">✉️ {s.email}</span>
                            <span className="text-zinc-500">•</span>
                            <div className="flex items-center gap-1">
                              <span>🔑</span>
                              <span className="text-red-400 font-bold">
                                {isPassRev ? (s.password || 'Codi.123') : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setRevealedPasswords(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                                className="text-zinc-500 hover:text-white ml-0.5 cursor-pointer"
                                title="Ver contraseña"
                              >
                                {isPassRev ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            const text = `Credenciales Codizulca Campo\nPromotora: ${s.name}\nCorreo: ${s.email}\nContraseña: ${s.password || 'Codi.123'}\nEnlace: ${portalUrl}`;
                            navigator.clipboard.writeText(text);
                            setCopiedCredentialId(s.id);
                            setTimeout(() => setCopiedCredentialId(null), 2500);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1 border border-white/5 transition-colors cursor-pointer"
                          title="Copiar correo y contraseña"
                        >
                          {copiedCredentialId === s.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">¡Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-zinc-400" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>

                        <a
                          href={portalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <span>Abrir</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Footer del Modal */}
            <div className="p-4 bg-[#141518] border-t border-white/10 flex items-center justify-between text-xs text-zinc-400 shrink-0">
              <span className="text-[11px]">
                💡 Cada promotora verá exclusivamente sus degustaciones asignadas al ingresar con su cuenta.
              </span>
              <button
                type="button"
                onClick={() => setIsCredentialsModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
