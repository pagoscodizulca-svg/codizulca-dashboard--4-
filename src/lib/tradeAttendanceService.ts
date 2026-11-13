/**
 * Servicio Integral de Asistencia Diaria — Módulo Trade Marketing
 * Soporta Promotoras Fijas ('fija') y Promotoras Eventuales ('eventual')
 * con 4 turnos fotográficos diarios:
 *   1. manana_entrada
 *   2. manana_salida
 *   3. tarde_entrada
 *   4. tarde_salida
 *
 * Seguridad:
 * - Bucket privado `trade-asistencia-fotos` (máx. 2 MB, formato WebP).
 * - Cero Base64 en PostgreSQL: la BD almacena únicamente `storage_path`.
 * - Hidratación por lote mediante `createSignedUrls(paths, 3600)` en una sola llamada.
 * - Actualización atómica por turno vía `rpc_registrar_turno_asistencia_trade` sin sobrescribir otros turnos.
 */

import { supabase } from './supabase';
import { INITIAL_STAFF_SEED, StaffMember, staffService } from './staffService';
import {
  compressAttendanceImageToWebp,
  CompressedWebpResult,
} from './imageCompressor';

export const TRADE_ASISTENCIA_BUCKET = 'trade-asistencia-fotos';
export const SIGNED_URL_EXPIRY_SECONDS = 3600;

export type TradePromotoraType = 'fija' | 'eventual';

export type TradeAttendanceTurno =
  | 'manana_entrada'
  | 'manana_salida'
  | 'tarde_entrada'
  | 'tarde_salida';

export type TradeEstadoJornada =
  | 'pendiente'
  | 'en_progreso'
  | 'parcial_justificada'
  | 'completa'
  | 'incidencia';

export interface TradeTurnoDescriptor {
  turno: TradeAttendanceTurno;
  order: 1 | 2 | 3 | 4;
  block: 'manana' | 'tarde';
  blockLabel: 'Jornada Mañana' | 'Jornada Tarde';
  shortLabel: string;
  fullLabel: string;
  expectedTimeHint: string;
  pathColumn:
    | 'foto_manana_entrada_path'
    | 'foto_manana_salida_path'
    | 'foto_tarde_entrada_path'
    | 'foto_tarde_salida_path';
  timeColumn:
    | 'hora_manana_entrada'
    | 'hora_manana_salida'
    | 'hora_tarde_entrada'
    | 'hora_tarde_salida';
  userColumn:
    | 'usuario_manana_entrada'
    | 'usuario_manana_salida'
    | 'usuario_tarde_entrada'
    | 'usuario_tarde_salida';
}

export const TRADE_TURNO_DESCRIPTORS: readonly TradeTurnoDescriptor[] = [
  {
    turno: 'manana_entrada',
    order: 1,
    block: 'manana',
    blockLabel: 'Jornada Mañana',
    shortLabel: 'Entrada AM',
    fullLabel: 'Mañana - Entrada',
    expectedTimeHint: '08:00 AM',
    pathColumn: 'foto_manana_entrada_path',
    timeColumn: 'hora_manana_entrada',
    userColumn: 'usuario_manana_entrada',
  },
  {
    turno: 'manana_salida',
    order: 2,
    block: 'manana',
    blockLabel: 'Jornada Mañana',
    shortLabel: 'Salida AM',
    fullLabel: 'Mañana - Salida',
    expectedTimeHint: '12:00 PM',
    pathColumn: 'foto_manana_salida_path',
    timeColumn: 'hora_manana_salida',
    userColumn: 'usuario_manana_salida',
  },
  {
    turno: 'tarde_entrada',
    order: 3,
    block: 'tarde',
    blockLabel: 'Jornada Tarde',
    shortLabel: 'Entrada PM',
    fullLabel: 'Tarde - Entrada',
    expectedTimeHint: '02:00 PM',
    pathColumn: 'foto_tarde_entrada_path',
    timeColumn: 'hora_tarde_entrada',
    userColumn: 'usuario_tarde_entrada',
  },
  {
    turno: 'tarde_salida',
    order: 4,
    block: 'tarde',
    blockLabel: 'Jornada Tarde',
    shortLabel: 'Salida PM',
    fullLabel: 'Tarde - Salida',
    expectedTimeHint: '05:30 PM',
    pathColumn: 'foto_tarde_salida_path',
    timeColumn: 'hora_tarde_salida',
    userColumn: 'usuario_tarde_salida',
  },
] as const;

export interface TradePromotora {
  id: string;
  codigo: string | null;
  cedula: string;
  nombre_completo: string;
  telefono: string | null;
  tipo_promotora: TradePromotoraType;
  zona: string | null;
  supervisor_nombre: string | null;
  cliente_habitual_id: string | null;
  punto_venta_habitual: string | null;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export interface TradeAsistenciaJornada {
  id: string;
  promotora_id: string;
  fecha_jornada: string;
  tipo_promotora_snapshot: TradePromotoraType;
  cliente_id: string | null;
  punto_venta: string;
  zona: string | null;
  foto_manana_entrada_path: string | null;
  hora_manana_entrada: string | null;
  usuario_manana_entrada: string | null;
  foto_manana_salida_path: string | null;
  hora_manana_salida: string | null;
  usuario_manana_salida: string | null;
  foto_tarde_entrada_path: string | null;
  hora_tarde_entrada: string | null;
  usuario_tarde_entrada: string | null;
  foto_tarde_salida_path: string | null;
  hora_tarde_salida: string | null;
  usuario_tarde_salida: string | null;
  marcajes_completados: number;
  estado_jornada: TradeEstadoJornada;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkedHoursSummary {
  morningMinutes: number;
  afternoonMinutes: number;
  totalMinutes: number;
  formattedTotal: string;
  formattedMorning: string;
  formattedAfternoon: string;
}

export interface EnrichedTurnoSlot {
  descriptor: TradeTurnoDescriptor;
  storagePath: string | null;
  signedUrl: string | null;
  timestampIso: string | null;
  formattedTimeCaracas: string | null;
  recordedByUserId: string | null;
  isCompleted: boolean;
}

export interface DailyPromotoraAttendanceRow {
  promotora: TradePromotora;
  jornada: TradeAsistenciaJornada | null;
  fechaJornada: string;
  tipoPromotoraEfectivo: TradePromotoraType;
  puntoVentaEfectivo: string;
  zonaEfectiva: string;
  marcajesCompletados: number;
  estadoJornada: TradeEstadoJornada;
  observaciones: string | null;
  workedHours: WorkedHoursSummary;
  turnos: Record<TradeAttendanceTurno, EnrichedTurnoSlot>;
}

export interface TradeAttendanceKpiSummary {
  totalPromotoras: number;
  totalFijas: number;
  totalEventuales: number;
  jornadasCompletas: number;
  enCurso: number;
  pendientesOIncidencia: number;
  conIncidencia: number;
  sinRegistro: number;
}

export interface DailyAttendanceMatrixResponse {
  fechaJornada: string;
  rows: DailyPromotoraAttendanceRow[];
  kpis: TradeAttendanceKpiSummary;
  signedUrlsCount: number;
}

const PROMOTORAS_STORAGE_KEY = 'codizulca_trade_promotoras_v1';
const JORNADAS_STORAGE_KEY = 'codizulca_trade_asistencia_jornadas_v1';

// Caché en memoria para vistas previas firmadas locales cuando se opera sin conexión directa al bucket
const localSignedPreviewMemoryCache = new Map<string, string>();

const STORAGE_PATH_REGEX =
  /^[0-9]{4}\/[0-9]{2}\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/(fija|eventual)\/[0-9a-fA-F-]{36}\/(manana_entrada|manana_salida|tarde_entrada|tarde_salida)_[0-9]+\.webp$/;

/**
 * Normaliza una cédula eliminando espacios y caracteres no alfanuméricos.
 */
export function normalizeCedula(rawCedula: string): string {
  const cleaned = String(rawCedula || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^VEPJ0-9-]/g, '');
  return cleaned || 'V-00000000';
}

/**
 * Genera un UUID v4 determinístico a partir de una semilla textual (ej. STF-004)
 * para mantener llaves primarias UUID consistentes entre sesiones y base de datos.
 */
export function deterministicUuidFromSeed(seed: string): string {
  const clean = String(seed || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return clean.toLowerCase();
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 3) | (c >>> 5)), 0x5bd1e995) >>> 0;
    h3 = Math.imul(h3 ^ (c + i * 31), 0x27d4eb2d) >>> 0;
    h4 = Math.imul(h4 ^ (c * 131 + i), 0x165667b1) >>> 0;
  }
  const hex = (
    h1.toString(16).padStart(8, '0') +
    h2.toString(16).padStart(8, '0') +
    h3.toString(16).padStart(8, '0') +
    h4.toString(16).padStart(8, '0')
  ).toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Obtiene la fecha operativa actual en zona horaria 'America/Caracas' (YYYY-MM-DD).
 */
export function getCaracasCurrentDateKey(referenceDate: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(referenceDate);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback UTC-4 fijo para Venezuela
  }
  const caracasMs = referenceDate.getTime() - 4 * 60 * 60 * 1000;
  return new Date(caracasMs).toISOString().slice(0, 10);
}

/**
 * Formatea una marca de tiempo ISO a hora local de Venezuela ('America/Caracas', ej. '08:02 AM').
 */
export function formatCaracasTimestamp12h(isoTimestamp?: string | null): string | null {
  if (!isoTimestamp) return null;
  try {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

/**
 * Construye la ruta obligatoria en el bucket privado `trade-asistencia-fotos`:
 * `{anio}/{mes}/{fecha_jornada}/{tipo_promotora}/{promotora_id}/{turno}_{timestamp}.webp`
 */
export function buildTradeAttendanceStoragePath(params: {
  fechaJornada: string;
  tipoPromotora: TradePromotoraType;
  promotoraId: string;
  turno: TradeAttendanceTurno;
  timestampMs?: number;
}): string {
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(params.fechaJornada || '').trim())
    ? String(params.fechaJornada).trim()
    : getCaracasCurrentDateKey();
  const [anio, mes] = cleanDate.split('-');
  const tipo: TradePromotoraType = params.tipoPromotora === 'eventual' ? 'eventual' : 'fija';
  const uuid = deterministicUuidFromSeed(params.promotoraId);
  const ts = Math.max(1, Math.floor(params.timestampMs ?? Date.now()));
  return `${anio}/${mes}/${cleanDate}/${tipo}/${uuid}/${params.turno}_${ts}.webp`;
}

export function isValidTradeAttendanceStoragePath(storagePath: string): boolean {
  return STORAGE_PATH_REGEX.test(String(storagePath || '').trim());
}

function formatDurationMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

/**
 * Calcula las horas laboradas del día:
 * (Salida AM - Entrada AM) + (Salida PM - Entrada PM)
 */
export function calculateWorkedHoursSummary(
  jornada?: Pick<
    TradeAsistenciaJornada,
    'hora_manana_entrada' | 'hora_manana_salida' | 'hora_tarde_entrada' | 'hora_tarde_salida'
  > | null
): WorkedHoursSummary {
  if (!jornada) {
    return {
      morningMinutes: 0,
      afternoonMinutes: 0,
      totalMinutes: 0,
      formattedTotal: '0h 00m',
      formattedMorning: '0h 00m',
      formattedAfternoon: '0h 00m',
    };
  }

  let morningMinutes = 0;
  if (jornada.hora_manana_entrada && jornada.hora_manana_salida) {
    const startMs = new Date(jornada.hora_manana_entrada).getTime();
    const endMs = new Date(jornada.hora_manana_salida).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      morningMinutes = Math.round((endMs - startMs) / 60000);
    }
  }

  let afternoonMinutes = 0;
  if (jornada.hora_tarde_entrada && jornada.hora_tarde_salida) {
    const startMs = new Date(jornada.hora_tarde_entrada).getTime();
    const endMs = new Date(jornada.hora_tarde_salida).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      afternoonMinutes = Math.round((endMs - startMs) / 60000);
    }
  }

  const totalMinutes = morningMinutes + afternoonMinutes;
  return {
    morningMinutes,
    afternoonMinutes,
    totalMinutes,
    formattedTotal: formatDurationMinutes(totalMinutes),
    formattedMorning: formatDurationMinutes(morningMinutes),
    formattedAfternoon: formatDurationMinutes(afternoonMinutes),
  };
}

/**
 * Detecta si el turno que se desea registrar salta un turno previo lógico
 * (ej. registrar Salida sin Entrada previa del mismo bloque, o iniciar en la Tarde sin bloque Mañana),
 * devolviendo si requiere observación obligatoria y el motivo de auditoría.
 */
export function evaluateTurnoSequenceCoherence(
  existingJornada: Partial<TradeAsistenciaJornada> | null | undefined,
  targetTurno: TradeAttendanceTurno
): {
  requiresObservation: boolean;
  isBlockExitWithoutEntry: boolean;
  warningMessage: string | null;
} {
  const hasMe = Boolean(existingJornada?.foto_manana_entrada_path);
  const hasMs = Boolean(existingJornada?.foto_manana_salida_path);
  const hasTe = Boolean(existingJornada?.foto_tarde_entrada_path);

  if (targetTurno === 'manana_salida' && !hasMe) {
    return {
      requiresObservation: true,
      isBlockExitWithoutEntry: true,
      warningMessage:
        'Está registrando "Mañana - Salida" sin haber cargado previamente "Mañana - Entrada". Debe indicar una observación de auditoría.',
    };
  }

  if (targetTurno === 'tarde_salida' && !hasTe) {
    return {
      requiresObservation: true,
      isBlockExitWithoutEntry: true,
      warningMessage:
        'Está registrando "Tarde - Salida" sin haber cargado previamente "Tarde - Entrada". Debe indicar una observación de auditoría.',
    };
  }

  if (targetTurno === 'tarde_entrada' && (!hasMe || !hasMs)) {
    return {
      requiresObservation: true,
      isBlockExitWithoutEntry: false,
      warningMessage:
        'El bloque de la mañana está incompleto (ej. media jornada vespertina). Ingrese una observación justificativa para continuar.',
    };
  }

  return {
    requiresObservation: false,
    isBlockExitWithoutEntry: false,
    warningMessage: null,
  };
}

/**
 * Aplica de forma atómica e inmutable la actualización de un único turno sobre una jornada,
 * garantizando que las otras 3 ranuras jamás sean borradas ni sobrescritas.
 */
export function applyAtomicTurnoUpdate(params: {
  existingJornada?: TradeAsistenciaJornada | null;
  promotora: Pick<
    TradePromotora,
    'id' | 'tipo_promotora' | 'punto_venta_habitual' | 'zona' | 'cliente_habitual_id'
  >;
  fechaJornada: string;
  turno: TradeAttendanceTurno;
  storagePath: string;
  puntoVenta?: string;
  clienteId?: string | null;
  zona?: string | null;
  observaciones?: string | null;
  userId?: string | null;
  serverNowIso?: string;
}): {
  updatedJornada: TradeAsistenciaJornada;
  previousStoragePath: string | null;
} {
  const nowIso = params.serverNowIso || new Date().toISOString();
  const base: TradeAsistenciaJornada = params.existingJornada
    ? { ...params.existingJornada }
    : {
        id: deterministicUuidFromSeed(`${params.promotora.id}::${params.fechaJornada}`),
        promotora_id: params.promotora.id,
        fecha_jornada: params.fechaJornada,
        tipo_promotora_snapshot: params.promotora.tipo_promotora,
        cliente_id: params.clienteId ?? params.promotora.cliente_habitual_id ?? null,
        punto_venta:
          (params.puntoVenta || '').trim() ||
          (params.promotora.punto_venta_habitual || '').trim() ||
          'Punto de Venta Asignado',
        zona: (params.zona || '').trim() || params.promotora.zona || 'Zulia / Falcón',
        foto_manana_entrada_path: null,
        hora_manana_entrada: null,
        usuario_manana_entrada: null,
        foto_manana_salida_path: null,
        hora_manana_salida: null,
        usuario_manana_salida: null,
        foto_tarde_entrada_path: null,
        hora_tarde_entrada: null,
        usuario_tarde_entrada: null,
        foto_tarde_salida_path: null,
        hora_tarde_salida: null,
        usuario_tarde_salida: null,
        marcajes_completados: 0,
        estado_jornada: 'pendiente',
        observaciones: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

  let previousStoragePath: string | null = null;
  let autoWarning: string | null = null;

  if (params.turno === 'manana_entrada') {
    previousStoragePath = base.foto_manana_entrada_path;
    base.foto_manana_entrada_path = params.storagePath;
    base.hora_manana_entrada = nowIso;
    base.usuario_manana_entrada = params.userId ?? base.usuario_manana_entrada;
  } else if (params.turno === 'manana_salida') {
    previousStoragePath = base.foto_manana_salida_path;
    base.foto_manana_salida_path = params.storagePath;
    base.hora_manana_salida = nowIso;
    base.usuario_manana_salida = params.userId ?? base.usuario_manana_salida;
    if (!base.foto_manana_entrada_path) {
      autoWarning = '[Auditoría: Salida Mañana registrada sin Entrada Mañana previa]';
    }
  } else if (params.turno === 'tarde_entrada') {
    previousStoragePath = base.foto_tarde_entrada_path;
    base.foto_tarde_entrada_path = params.storagePath;
    base.hora_tarde_entrada = nowIso;
    base.usuario_tarde_entrada = params.userId ?? base.usuario_tarde_entrada;
    if (
      !base.foto_manana_entrada_path &&
      !base.foto_manana_salida_path &&
      !String(params.observaciones || base.observaciones || '').trim()
    ) {
      autoWarning = '[Auditoría: Inicio en bloque Tarde sin marcajes de Mañana]';
    }
  } else if (params.turno === 'tarde_salida') {
    previousStoragePath = base.foto_tarde_salida_path;
    base.foto_tarde_salida_path = params.storagePath;
    base.hora_tarde_salida = nowIso;
    base.usuario_tarde_salida = params.userId ?? base.usuario_tarde_salida;
    if (!base.foto_tarde_entrada_path) {
      autoWarning = '[Auditoría: Salida Tarde registrada sin Entrada Tarde previa]';
    }
  }

  if (params.puntoVenta && params.puntoVenta.trim()) {
    base.punto_venta = params.puntoVenta.trim();
  }
  if (params.zona && params.zona.trim()) {
    base.zona = params.zona.trim();
  }
  if (params.clienteId !== undefined) {
    base.cliente_id = params.clienteId;
  }

  let obsFinal = String(params.observaciones || '').trim() || base.observaciones || null;
  if (autoWarning) {
    if (!obsFinal) {
      obsFinal = autoWarning;
    } else if (!obsFinal.includes(autoWarning)) {
      obsFinal = `${obsFinal} ${autoWarning}`;
    }
  }
  base.observaciones = obsFinal;

  const completedCount =
    (base.foto_manana_entrada_path ? 1 : 0) +
    (base.foto_manana_salida_path ? 1 : 0) +
    (base.foto_tarde_entrada_path ? 1 : 0) +
    (base.foto_tarde_salida_path ? 1 : 0);

  base.marcajes_completados = completedCount;

  if (completedCount === 4) {
    base.estado_jornada = 'completa';
  } else if (completedCount === 0) {
    base.estado_jornada = 'pendiente';
  } else {
    const missingSameBlockEntry =
      (params.turno === 'manana_salida' && !base.foto_manana_entrada_path) ||
      (params.turno === 'tarde_salida' && !base.foto_tarde_entrada_path);

    if (missingSameBlockEntry && !String(params.observaciones || '').trim()) {
      base.estado_jornada = 'incidencia';
    } else if (
      String(params.observaciones || '').trim() &&
      ((params.turno === 'tarde_entrada' &&
        !base.foto_manana_entrada_path &&
        !base.foto_manana_salida_path) ||
        base.estado_jornada === 'parcial_justificada')
    ) {
      base.estado_jornada = 'parcial_justificada';
    } else if (
      (base.estado_jornada === 'incidencia' || base.estado_jornada === 'parcial_justificada') &&
      completedCount < 4
    ) {
      // Preservar estado especial mientras no complete las 4 evidencias
    } else {
      base.estado_jornada = 'en_progreso';
    }
  }

  base.updated_at = nowIso;

  return {
    updatedJornada: base,
    previousStoragePath,
  };
}

function buildSeedPromotorasFromStaff(): TradePromotora[] {
  const staffList: StaffMember[] =
    typeof staffService?.getStaff === 'function' ? staffService.getStaff() : INITIAL_STAFF_SEED;

  const nowIso = new Date().toISOString();
  const filtered = staffList.filter(
    (s) => s.category === 'fija' || s.category === 'eventual'
  );

  return filtered.map((s, idx) => {
    const numMatch = s.id.match(/\d+/);
    const numPart = numMatch ? Number(numMatch[0]) : idx + 1;
    const syntheticCedula = `V-${String(24500000 + numPart * 13791).slice(0, 8)}`;
    return {
      id: deterministicUuidFromSeed(`trade-promotora-${s.id}`),
      codigo: s.id.toUpperCase(),
      cedula: normalizeCedula(syntheticCedula),
      nombre_completo: s.name.trim().toUpperCase(),
      telefono: s.phone || null,
      tipo_promotora: s.category === 'eventual' ? 'eventual' : 'fija',
      zona: s.address ? s.address.trim().toUpperCase() : 'ZULIA / MARACAIBO',
      supervisor_nombre: 'COORDINACIÓN TRADE MARKETING',
      cliente_habitual_id: null,
      punto_venta_habitual:
        s.assignedStore && s.assignedStore.toUpperCase() !== 'VARIAS' && s.assignedStore.toUpperCase() !== 'VARIOS'
          ? s.assignedStore.trim().toUpperCase()
          : 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.',
      activa: s.status !== 'Inactivo',
      created_at: s.created_at || nowIso,
      updated_at: nowIso,
    };
  });
}

function readLocalPromotoras(): TradePromotora[] {
  const seeded = buildSeedPromotorasFromStaff();
  if (typeof localStorage === 'undefined') return seeded;
  try {
    const raw = localStorage.getItem(PROMOTORAS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(PROMOTORAS_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const byId = new Map<string, TradePromotora>();
      seeded.forEach((p) => byId.set(p.id, p));
      parsed.forEach((p: TradePromotora) => {
        if (p && p.id) byId.set(p.id, p);
      });
      return Array.from(byId.values());
    }
  } catch {
    // ignore storage errors
  }
  return seeded;
}

function writeLocalPromotoras(list: TradePromotora[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROMOTORAS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

function readLocalJornadas(): TradeAsistenciaJornada[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(JORNADAS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalJornadas(list: TradeAsistenciaJornada[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(JORNADAS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export const tradeAttendanceService = {
  /**
   * Lista todas las promotoras (`fija` y `eventual`) sincronizando con `public.trade_promotoras`
   * en Supabase y manteniendo respaldo local determinístico.
   */
  async listPromotoras(includeInactive = false): Promise<TradePromotora[]> {
    const localList = readLocalPromotoras();
    try {
      const { data, error } = await supabase
        .from('trade_promotoras')
        .select('*')
        .order('nombre_completo', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        const mergedMap = new Map<string, TradePromotora>();
        localList.forEach((p) => mergedMap.set(p.id, p));
        (data as TradePromotora[]).forEach((p) => mergedMap.set(p.id, p));
        const merged = Array.from(mergedMap.values()).sort((a, b) =>
          a.nombre_completo.localeCompare(b.nombre_completo, 'es')
        );
        writeLocalPromotoras(merged);
        return includeInactive ? merged : merged.filter((p) => p.activa);
      }
    } catch {
      // Fallback a catálogo local
    }
    const sorted = [...localList].sort((a, b) =>
      a.nombre_completo.localeCompare(b.nombre_completo, 'es')
    );
    return includeInactive ? sorted : sorted.filter((p) => p.activa);
  },

  /**
   * Crea o actualiza una promotora (`fija` o `eventual`) normalizando su cédula sin espacios.
   */
  async upsertPromotora(input: {
    id?: string;
    codigo?: string | null;
    cedula: string;
    nombre_completo: string;
    telefono?: string | null;
    tipo_promotora: TradePromotoraType;
    zona?: string | null;
    supervisor_nombre?: string | null;
    cliente_habitual_id?: string | null;
    punto_venta_habitual?: string | null;
    activa?: boolean;
  }): Promise<TradePromotora> {
    const cleanCedula = normalizeCedula(input.cedula);
    const cleanNombre = String(input.nombre_completo || '').trim().toUpperCase();
    if (!cleanNombre) {
      throw new Error('El nombre completo de la promotora es obligatorio.');
    }

    const nowIso = new Date().toISOString();
    const currentList = readLocalPromotoras();
    const duplicateCedula = currentList.find(
      (p) => normalizeCedula(p.cedula) === cleanCedula && p.id !== input.id
    );
    if (duplicateCedula) {
      throw new Error(`La cédula ${cleanCedula} ya está asignada a ${duplicateCedula.nombre_completo}.`);
    }

    const id =
      input.id && /^[0-9a-f-]{36}$/i.test(input.id)
        ? input.id
        : deterministicUuidFromSeed(`promotora-${cleanCedula}-${Date.now()}`);

    const record: TradePromotora = {
      id,
      codigo: input.codigo ? input.codigo.trim().toUpperCase() : `TRD-${String(currentList.length + 1).padStart(3, '0')}`,
      cedula: cleanCedula,
      nombre_completo: cleanNombre,
      telefono: input.telefono ? input.telefono.trim() : null,
      tipo_promotora: input.tipo_promotora === 'eventual' ? 'eventual' : 'fija',
      zona: input.zona ? input.zona.trim().toUpperCase() : 'ZULIA / MARACAIBO',
      supervisor_nombre: input.supervisor_nombre ? input.supervisor_nombre.trim().toUpperCase() : 'COORDINACIÓN TRADE MARKETING',
      cliente_habitual_id: input.cliente_habitual_id || null,
      punto_venta_habitual: input.punto_venta_habitual ? input.punto_venta_habitual.trim().toUpperCase() : 'PUNTO DE VENTA',
      activa: input.activa ?? true,
      created_at: nowIso,
      updated_at: nowIso,
    };

    try {
      const { data, error } = await supabase
        .from('trade_promotoras')
        .upsert(
          {
            id: record.id,
            codigo: record.codigo,
            cedula: record.cedula,
            nombre_completo: record.nombre_completo,
            telefono: record.telefono,
            tipo_promotora: record.tipo_promotora,
            zona: record.zona,
            supervisor_nombre: record.supervisor_nombre,
            cliente_habitual_id: record.cliente_habitual_id,
            punto_venta_habitual: record.punto_venta_habitual,
            activa: record.activa,
          },
          { onConflict: 'id' }
        )
        .select('*')
        .maybeSingle();

      if (!error && data) {
        const saved = data as TradePromotora;
        const next = currentList.filter((p) => p.id !== saved.id);
        next.push(saved);
        writeLocalPromotoras(next);
        return saved;
      }
    } catch {
      // Fallback local
    }

    const next = currentList.filter((p) => p.id !== record.id);
    next.push(record);
    writeLocalPromotoras(next);
    return record;
  },

  /**
   * Resuelve URLs firmadas temporales en una sola llamada por lote (`createSignedUrls` con expiración de 3600s).
   */
  async resolveBatchSignedUrls(storagePaths: string[]): Promise<Map<string, string>> {
    const uniquePaths = Array.from(
      new Set(
        storagePaths
          .map((p) => String(p || '').trim())
          .filter((p) => p.length > 0)
      )
    );
    const resultMap = new Map<string, string>();
    if (uniquePaths.length === 0) return resultMap;

    // 1. Llamada única en lote a Supabase Storage (expiración 3600 segundos)
    try {
      const { data, error } = await supabase.storage
        .from(TRADE_ASISTENCIA_BUCKET)
        .createSignedUrls(uniquePaths, SIGNED_URL_EXPIRY_SECONDS);

      if (!error && Array.isArray(data)) {
        for (const item of data) {
          if (item && item.path && item.signedUrl) {
            resultMap.set(item.path, item.signedUrl);
          }
        }
      }
    } catch {
      // Continuar con caché local de sesión si el bucket remoto no está accesible
    }

    // 2. Hidratar desde caché de sesión si algún path fue cargado localmente en esta sesión
    for (const path of uniquePaths) {
      if (!resultMap.has(path) && localSignedPreviewMemoryCache.has(path)) {
        resultMap.set(path, localSignedPreviewMemoryCache.get(path)!);
      }
    }

    return resultMap;
  },

  /**
   * Comprime la foto a WebP (< 180 KB, <= 1280px), la sube al bucket privado `trade-asistencia-fotos`
   * e invoca la RPC transaccional `rpc_registrar_turno_asistencia_trade`.
   * Si la RPC falla en BD, elimina el archivo subido en Storage para evitar huérfanos.
   */
  async uploadTurnoAttendancePhoto(params: {
    promotora: TradePromotora;
    fechaJornada: string;
    turno: TradeAttendanceTurno;
    file: File | Blob;
    puntoVenta: string;
    clienteId?: string | null;
    zona?: string | null;
    observaciones?: string | null;
    existingJornada?: TradeAsistenciaJornada | null;
    onProgress?: (pct: number) => void;
  }): Promise<{
    jornada: TradeAsistenciaJornada;
    storagePath: string;
    compressed: CompressedWebpResult;
    orphanCleaned: boolean;
  }> {
    const coherence = evaluateTurnoSequenceCoherence(params.existingJornada, params.turno);
    if (coherence.requiresObservation && !String(params.observaciones || '').trim()) {
      throw new Error(
        coherence.warningMessage ||
          'Debe ingresar una observación justificativa cuando se omite un turno previo.'
      );
    }

    // 1. Comprimir y validar imagen en el cliente (WebP <= 1280px, < 180 KB, máx 2 MB)
    const compressed = await compressAttendanceImageToWebp(params.file, {
      onProgress: (p) => params.onProgress?.(Math.round(p * 0.5)),
    });

    const tipoEfectivo: TradePromotoraType =
      params.existingJornada?.tipo_promotora_snapshot || params.promotora.tipo_promotora;

    const storagePath = buildTradeAttendanceStoragePath({
      fechaJornada: params.fechaJornada,
      tipoPromotora: tipoEfectivo,
      promotoraId: params.promotora.id,
      turno: params.turno,
    });

    params.onProgress?.(65);

    let uploadedToRemoteStorage = false;
    let orphanCleaned = false;

    // 2. Subir objeto WebP al bucket privado `trade-asistencia-fotos`
    try {
      const { error: uploadError } = await supabase.storage
        .from(TRADE_ASISTENCIA_BUCKET)
        .upload(storagePath, compressed.blob, {
          contentType: 'image/webp',
          cacheControl: '3600',
          upsert: false,
        });

      if (!uploadError) {
        uploadedToRemoteStorage = true;
      }
    } catch {
      uploadedToRemoteStorage = false;
    }

    params.onProgress?.(80);

    // 3. Invocar función RPC transaccional en PostgreSQL
    let savedJornada: TradeAsistenciaJornada | null = null;
    let previousStoragePath: string | null = null;

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'rpc_registrar_turno_asistencia_trade',
        {
          p_promotora_id: params.promotora.id,
          p_fecha: params.fechaJornada,
          p_turno: params.turno,
          p_storage_path: storagePath,
          p_punto_venta: params.puntoVenta,
          p_cliente_id: params.clienteId ?? null,
          p_zona: params.zona ?? params.promotora.zona ?? null,
          p_observaciones: params.observaciones ?? null,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      if (rpcData && typeof rpcData === 'object' && (rpcData as any).jornada) {
        savedJornada = (rpcData as any).jornada as TradeAsistenciaJornada;
        previousStoragePath = (rpcData as any).previous_storage_path || null;
      }
    } catch (rpcErr) {
      // Si se subió al bucket remoto pero la transacción RPC falló por un error explícito de negocio, limpiar archivo huérfano
      const errMsg = String((rpcErr as any)?.message || '');
      if (
        uploadedToRemoteStorage &&
        (errMsg.includes('INVALID_') || errMsg.includes('VIOLATION') || errMsg.includes('NOT_FOUND'))
      ) {
        try {
          await supabase.storage.from(TRADE_ASISTENCIA_BUCKET).remove([storagePath]);
          orphanCleaned = true;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }
    }

    // 4. Si estamos en entorno sin tabla remota activa o desconectado, aplicar actualización atómica local
    if (!savedJornada) {
      const allLocal = readLocalJornadas();
      const existingLocal =
        params.existingJornada ||
        allLocal.find(
          (j) =>
            j.promotora_id === params.promotora.id && j.fecha_jornada === params.fechaJornada
        ) ||
        null;

      const atomicResult = applyAtomicTurnoUpdate({
        existingJornada: existingLocal,
        promotora: params.promotora,
        fechaJornada: params.fechaJornada,
        turno: params.turno,
        storagePath,
        puntoVenta: params.puntoVenta,
        clienteId: params.clienteId,
        zona: params.zona,
        observaciones: params.observaciones,
      });

      savedJornada = atomicResult.updatedJornada;
      previousStoragePath = atomicResult.previousStoragePath;
    }

    // 5. Si fue un reemplazo de foto en la misma ranura, limpiar el archivo huérfano previo
    if (previousStoragePath && previousStoragePath !== storagePath) {
      localSignedPreviewMemoryCache.delete(previousStoragePath);
      if (uploadedToRemoteStorage) {
        try {
          await supabase.storage.from(TRADE_ASISTENCIA_BUCKET).remove([previousStoragePath]);
          orphanCleaned = true;
        } catch {
          // ignore
        }
      } else {
        orphanCleaned = true;
      }
    }

    // Guardar vista previa firmada en caché de sesión y sincronizar espejo local
    localSignedPreviewMemoryCache.set(storagePath, compressed.previewDataUrl);
    const localJornadas = readLocalJornadas().filter(
      (j) =>
        !(
          j.promotora_id === savedJornada!.promotora_id &&
          j.fecha_jornada === savedJornada!.fecha_jornada
        )
    );
    localJornadas.push(savedJornada);
    writeLocalJornadas(localJornadas);

    params.onProgress?.(100);

    return {
      jornada: savedJornada,
      storagePath,
      compressed,
      orphanCleaned,
    };
  },

  /**
   * Obtiene la matriz diaria enriquecida para `fechaJornada` resolviendo en una sola llamada
   * por lote (`createSignedUrls`) todas las miniaturas de los 4 turnos del día.
   */
  async getDailyAttendanceMatrix(fechaJornada?: string): Promise<DailyAttendanceMatrixResponse> {
    const targetDate =
      fechaJornada && /^\d{4}-\d{2}-\d{2}$/.test(fechaJornada)
        ? fechaJornada
        : getCaracasCurrentDateKey();

    const promotoras = await this.listPromotoras(false);
    const localJornadasForDate = readLocalJornadas().filter(
      (j) => j.fecha_jornada === targetDate
    );

    const jornadaByPromotora = new Map<string, TradeAsistenciaJornada>();
    localJornadasForDate.forEach((j) => jornadaByPromotora.set(j.promotora_id, j));

    try {
      const { data, error } = await supabase
        .from('trade_asistencia_jornadas')
        .select('*')
        .eq('fecha_jornada', targetDate);

      if (!error && Array.isArray(data)) {
        (data as TradeAsistenciaJornada[]).forEach((j) => {
          jornadaByPromotora.set(j.promotora_id, j);
        });
      }
    } catch {
      // Usar respaldo local si la consulta falla
    }

    // Recolectar todos los storage_path existentes del día para pedir Signed URLs en 1 solo lote
    const allStoragePaths: string[] = [];
    for (const j of jornadaByPromotora.values()) {
      if (j.foto_manana_entrada_path) allStoragePaths.push(j.foto_manana_entrada_path);
      if (j.foto_manana_salida_path) allStoragePaths.push(j.foto_manana_salida_path);
      if (j.foto_tarde_entrada_path) allStoragePaths.push(j.foto_tarde_entrada_path);
      if (j.foto_tarde_salida_path) allStoragePaths.push(j.foto_tarde_salida_path);
    }

    const signedUrlsMap = await this.resolveBatchSignedUrls(allStoragePaths);

    const rows: DailyPromotoraAttendanceRow[] = promotoras.map((promotora) => {
      const jornada = jornadaByPromotora.get(promotora.id) || null;
      const tipoPromotoraEfectivo: TradePromotoraType =
        jornada?.tipo_promotora_snapshot || promotora.tipo_promotora;
      const puntoVentaEfectivo =
        jornada?.punto_venta || promotora.punto_venta_habitual || 'Punto de Venta Asignado';
      const zonaEfectiva = jornada?.zona || promotora.zona || 'ZULIA / MARACAIBO';

      const turnosObj = {} as Record<TradeAttendanceTurno, EnrichedTurnoSlot>;
      let completedCount = 0;

      for (const desc of TRADE_TURNO_DESCRIPTORS) {
        const storagePath = jornada ? (jornada[desc.pathColumn] as string | null) : null;
        const timestampIso = jornada ? (jornada[desc.timeColumn] as string | null) : null;
        const recordedByUserId = jornada ? (jornada[desc.userColumn] as string | null) : null;
        const isCompleted = Boolean(storagePath);
        if (isCompleted) completedCount++;

        turnosObj[desc.turno] = {
          descriptor: desc,
          storagePath,
          signedUrl: storagePath ? signedUrlsMap.get(storagePath) || null : null,
          timestampIso,
          formattedTimeCaracas: formatCaracasTimestamp12h(timestampIso),
          recordedByUserId,
          isCompleted,
        };
      }

      const estadoJornada: TradeEstadoJornada = jornada
        ? jornada.estado_jornada
        : 'pendiente';

      return {
        promotora,
        jornada,
        fechaJornada: targetDate,
        tipoPromotoraEfectivo,
        puntoVentaEfectivo,
        zonaEfectiva,
        marcajesCompletados: jornada ? jornada.marcajes_completados ?? completedCount : 0,
        estadoJornada,
        observaciones: jornada?.observaciones || null,
        workedHours: calculateWorkedHoursSummary(jornada),
        turnos: turnosObj,
      };
    });

    // Calcular KPIs superiores en tiempo real
    const totalPromotoras = rows.length;
    const totalFijas = rows.filter((r) => r.tipoPromotoraEfectivo === 'fija').length;
    const totalEventuales = rows.filter((r) => r.tipoPromotoraEfectivo === 'eventual').length;
    const jornadasCompletas = rows.filter(
      (r) => r.marcajesCompletados === 4 || r.estadoJornada === 'completa'
    ).length;
    const enCurso = rows.filter(
      (r) =>
        r.marcajesCompletados >= 1 &&
        r.marcajesCompletados <= 3 &&
        r.estadoJornada !== 'incidencia'
    ).length;
    const conIncidencia = rows.filter((r) => r.estadoJornada === 'incidencia').length;
    const sinRegistro = rows.filter((r) => r.marcajesCompletados === 0).length;
    const pendientesOIncidencia = sinRegistro + conIncidencia;

    return {
      fechaJornada: targetDate,
      rows,
      kpis: {
        totalPromotoras,
        totalFijas,
        totalEventuales,
        jornadasCompletas,
        enCurso,
        pendientesOIncidencia,
        conIncidencia,
        sinRegistro,
      },
      signedUrlsCount: signedUrlsMap.size,
    };
  },

  /**
   * Suscripción Realtime sobre `public.trade_asistencia_jornadas` para reflejar al instante nuevas fotos cargadas.
   */
  subscribeToRealtime(fechaJornada: string, onChange: () => void): () => void {
    try {
      const channel = supabase
        .channel(`trade-asistencia-${fechaJornada}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'trade_asistencia_jornadas',
          },
          () => {
            onChange();
          }
        )
        .subscribe();

      return () => {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      };
    } catch {
      return () => {};
    }
  },
};
