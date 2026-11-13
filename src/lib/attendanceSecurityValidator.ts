/**
 * Módulo de Validación Condicional, Integridad Histórica y Ciberseguridad para Evidencias de Asistencia
 * Soporta Perfiles FIJA (2 fotos por jornada) y EVENTUAL (4 fotos por jornada: Mañana + Tarde)
 */

import { z } from 'zod';
import { INITIAL_STAFF_SEED, StaffMember } from './staffService';
import { PROMOTERS_LIST, resolvePromoterNameFromRaw } from './campoService';

export type AttendanceProfileType = 'FIJA' | 'EVENTUAL';

export type FijaPhotoSlot = 'JORNADA_INGRESO' | 'JORNADA_SALIDA';

export type EventualPhotoSlot =
  | 'MANANA_INGRESO'
  | 'MANANA_SALIDA'
  | 'TARDE_INGRESO'
  | 'TARDE_SALIDA';

export type AttendancePhotoSlot = FijaPhotoSlot | EventualPhotoSlot;

export type LegacyCheckInType =
  | 'Ingreso'
  | 'Salida a almorzar'
  | 'Vuelta a almorzar'
  | 'Salida';

export const FIJA_PHOTO_SLOTS: readonly FijaPhotoSlot[] = [
  'JORNADA_INGRESO',
  'JORNADA_SALIDA',
] as const;

export const EVENTUAL_MORNING_SLOTS: readonly EventualPhotoSlot[] = [
  'MANANA_INGRESO',
  'MANANA_SALIDA',
] as const;

export const EVENTUAL_AFTERNOON_SLOTS: readonly EventualPhotoSlot[] = [
  'TARDE_INGRESO',
  'TARDE_SALIDA',
] as const;

export const EVENTUAL_PHOTO_SLOTS: readonly EventualPhotoSlot[] = [
  'MANANA_INGRESO',
  'MANANA_SALIDA',
  'TARDE_INGRESO',
  'TARDE_SALIDA',
] as const;

export const ALL_ATTENDANCE_PHOTO_SLOTS: readonly AttendancePhotoSlot[] = [
  ...FIJA_PHOTO_SLOTS,
  ...EVENTUAL_PHOTO_SLOTS,
] as const;

export const MAX_ATTENDANCE_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB (5,242,880 bytes)
export const MAX_ATTENDANCE_IMAGE_BYTES = MAX_ATTENDANCE_PHOTO_BYTES;
export const CLIENT_MAX_IMAGE_DIMENSION_PX = 1600;
export const CLIENT_IMAGE_COMPRESSION_QUALITY = 0.8;
export const PRIVATE_ATTENDANCE_BUCKET = 'asistencia-evidencias';

export interface AttendanceSlotDescriptor {
  slot: AttendancePhotoSlot;
  stepNumber: string;
  label: string;
  shortLabel: string;
  sublabel: string;
  blockTitle?: 'Jornada de la Mañana' | 'Jornada de la Tarde' | 'Jornada Laboral';
  sectionTitle?: 'Jornada de la Mañana' | 'Jornada de la Tarde';
  legacyType: LegacyCheckInType;
  defaultTime: string;
  badgeBg: string;
  emptyText: string;
  buildAriaLabel: (promoterName: string, hasExisting?: boolean) => string;
}

export const FIJA_SLOT_DESCRIPTORS: readonly AttendanceSlotDescriptor[] = [
  {
    slot: 'JORNADA_INGRESO',
    stepNumber: '1',
    label: 'Ingreso a la jornada laboral',
    shortLabel: 'Ingreso Jornada',
    sublabel: 'Foto de ingreso a la jornada laboral en PDV',
    blockTitle: 'Jornada Laboral',
    legacyType: 'Ingreso',
    defaultTime: '08:30',
    badgeBg: 'bg-emerald-600/90 border-emerald-400/40 text-white',
    emptyText: 'Sin foto de ingreso a la jornada laboral',
    buildAriaLabel: (promoterName, hasExisting) =>
      `${hasExisting ? 'Reemplazar' : 'Subir'} foto de ingreso a la jornada laboral para ${promoterName}`,
  },
  {
    slot: 'JORNADA_SALIDA',
    stepNumber: '2',
    label: 'Salida de la jornada laboral',
    shortLabel: 'Salida Jornada',
    sublabel: 'Foto de salida de la jornada laboral en PDV',
    blockTitle: 'Jornada Laboral',
    legacyType: 'Salida',
    defaultTime: '17:00',
    badgeBg: 'bg-red-600/90 border-red-400/40 text-white',
    emptyText: 'Sin foto de salida de la jornada laboral',
    buildAriaLabel: (promoterName, hasExisting) =>
      `${hasExisting ? 'Reemplazar' : 'Subir'} foto de salida de la jornada laboral para ${promoterName}`,
  },
] as const;

export const EVENTUAL_MORNING_SLOT_DESCRIPTORS: readonly AttendanceSlotDescriptor[] = [
  {
    slot: 'MANANA_INGRESO',
    stepNumber: '1',
    label: 'Foto de ingreso — Jornada de la mañana',
    shortLabel: 'Ingreso Mañana',
    sublabel: 'Apertura del turno matutino en PDV',
    blockTitle: 'Jornada de la Mañana',
    sectionTitle: 'Jornada de la Mañana',
    legacyType: 'Ingreso',
    defaultTime: '08:30',
    badgeBg: 'bg-emerald-600/90 border-emerald-400/40 text-white',
    emptyText: 'Sin foto de ingreso (Mañana)',
    buildAriaLabel: (promoterName, hasExisting) =>
      `${hasExisting ? 'Reemplazar' : 'Subir'} foto de ingreso jornada de la mañana para ${promoterName}`,
  },
  {
    slot: 'MANANA_SALIDA',
    stepNumber: '2',
    label: 'Foto de salida — Jornada de la mañana',
    shortLabel: 'Salida Mañana',
    sublabel: 'Cierre del turno matutino en PDV',
    blockTitle: 'Jornada de la Mañana',
    sectionTitle: 'Jornada de la Mañana',
    legacyType: 'Salida a almorzar',
    defaultTime: '12:30',
    badgeBg: 'bg-amber-600/90 border-amber-400/40 text-white',
    emptyText: 'Sin foto de salida (Mañana)',
    buildAriaLabel: (promoterName, hasExisting) =>
      `${hasExisting ? 'Reemplazar' : 'Subir'} foto de salida jornada de la mañana para ${promoterName}`,
  },
] as const;

export const EVENTUAL_AFTERNOON_SLOT_DESCRIPTORS: readonly AttendanceSlotDescriptor[] = [
  {
    slot: 'TARDE_INGRESO',
    stepNumber: '3',
    label: 'Foto de ingreso — Jornada de la tarde',
    shortLabel: 'Ingreso Tarde',
    sublabel: 'Apertura del turno vespertino en PDV',
    blockTitle: 'Jornada de la Tarde',
    sectionTitle: 'Jornada de la Tarde',
    legacyType: 'Vuelta a almorzar',
    defaultTime: '14:00',
    badgeBg: 'bg-blue-600/90 border-blue-400/40 text-white',
    emptyText: 'Sin foto de ingreso (Tarde)',
    buildAriaLabel: (promoterName, hasExisting) =>
      `${hasExisting ? 'Reemplazar' : 'Subir'} foto de ingreso jornada de la tarde para ${promoterName}`,
  },
  {
    slot: 'TARDE_SALIDA',
    stepNumber: '4',
    label: 'Foto de salida — Jornada de la tarde',
    shortLabel: 'Salida Tarde',
    sublabel: 'Cierre del turno vespertino en PDV',
    blockTitle: 'Jornada de la Tarde',
    sectionTitle: 'Jornada de la Tarde',
    legacyType: 'Salida',
    defaultTime: '17:30',
    badgeBg: 'bg-red-600/90 border-red-400/40 text-white',
    emptyText: 'Sin foto de salida (Tarde)',
    buildAriaLabel: (promoterName, hasExisting) =>
      `${hasExisting ? 'Reemplazar' : 'Subir'} foto de salida jornada de la tarde para ${promoterName}`,
  },
] as const;

export const EVENTUAL_SLOT_DESCRIPTORS: readonly AttendanceSlotDescriptor[] = [
  ...EVENTUAL_MORNING_SLOT_DESCRIPTORS,
  ...EVENTUAL_AFTERNOON_SLOT_DESCRIPTORS,
] as const;

export function getSlotDescriptorsForProfile(
  profile: AttendanceProfileType
): readonly AttendanceSlotDescriptor[] {
  return profile === 'EVENTUAL' ? EVENTUAL_SLOT_DESCRIPTORS : FIJA_SLOT_DESCRIPTORS;
}

export const getDescriptorsForProfile = getSlotDescriptorsForProfile;

export function getAllowedSlotsForProfile(
  profile: AttendanceProfileType
): readonly AttendancePhotoSlot[] {
  return profile === 'EVENTUAL' ? EVENTUAL_PHOTO_SLOTS : FIJA_PHOTO_SLOTS;
}

export function getMaxPhotosForProfile(profile: AttendanceProfileType): 2 | 4 {
  return profile === 'EVENTUAL' ? 4 : 2;
}

export function isSlotAllowedForProfile(
  profile: AttendanceProfileType,
  slot: string
): slot is AttendancePhotoSlot {
  if (profile === 'FIJA') {
    return (FIJA_PHOTO_SLOTS as readonly string[]).includes(slot);
  }
  if (profile === 'EVENTUAL') {
    return (EVENTUAL_PHOTO_SLOTS as readonly string[]).includes(slot);
  }
  return false;
}

export function mapSlotToLegacyCheckInType(slot: AttendancePhotoSlot): LegacyCheckInType {
  switch (slot) {
    case 'JORNADA_INGRESO':
    case 'MANANA_INGRESO':
      return 'Ingreso';
    case 'MANANA_SALIDA':
      return 'Salida a almorzar';
    case 'TARDE_INGRESO':
      return 'Vuelta a almorzar';
    case 'JORNADA_SALIDA':
    case 'TARDE_SALIDA':
      return 'Salida';
  }
}

export const mapAttendanceSlotToLegacyType = mapSlotToLegacyCheckInType;

export function mapLegacyCheckInTypeToSlot(
  legacyType: string,
  profile: AttendanceProfileType,
  explicitSlot?: string | null
): AttendancePhotoSlot {
  if (explicitSlot && isSlotAllowedForProfile(profile, explicitSlot)) {
    return explicitSlot;
  }
  const clean = String(legacyType || '').trim().toLowerCase();
  if (profile === 'FIJA') {
    if (clean === 'salida' || clean.includes('cierre') || clean === 'jornada_salida') {
      return 'JORNADA_SALIDA';
    }
    return 'JORNADA_INGRESO';
  }

  // Perfil EVENTUAL (4 ranuras)
  if (clean === 'ingreso' || clean.includes('entrada') || clean === 'manana_ingreso') {
    return 'MANANA_INGRESO';
  }
  if (
    clean.includes('salida a almorzar') ||
    clean.includes('salida almorzar') ||
    clean.includes('salida almuerzo') ||
    clean === 'manana_salida'
  ) {
    return 'MANANA_SALIDA';
  }
  if (
    clean.includes('vuelta a almorzar') ||
    clean.includes('llegada de almorzar') ||
    clean.includes('llegada almorzar') ||
    clean.includes('regreso') ||
    clean === 'tarde_ingreso'
  ) {
    return 'TARDE_INGRESO';
  }
  if (clean === 'salida' || clean.includes('cierre') || clean === 'tarde_salida') {
    return 'TARDE_SALIDA';
  }
  return 'MANANA_INGRESO';
}

export function normalizePromoterLookupKey(raw?: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Resuelve el ID oficial de la promotora (ej. STF-004, STF-018) o un slug seguro
 */
export function resolveCanonicalPromoterId(
  promoterNameOrEmailOrId?: string,
  creatorIdHint?: string,
  staffRoster?: StaffMember[]
): string {
  const roster = staffRoster && staffRoster.length > 0 ? staffRoster : INITIAL_STAFF_SEED;
  const rawA = String(promoterNameOrEmailOrId || '').trim();
  const rawB = String(creatorIdHint || '').trim();

  for (const candidate of [rawA, rawB]) {
    if (!candidate) continue;
    if (/^STF-\d{3,}$/i.test(candidate)) {
      return candidate.toUpperCase();
    }
    const lower = candidate.toLowerCase();
    const byEmailOrId = roster.find(
      (s) => s.id.toLowerCase() === lower || s.email.trim().toLowerCase() === lower
    );
    if (byEmailOrId) return byEmailOrId.id.toUpperCase();
  }

  const canonicalName = resolvePromoterNameFromRaw(rawA, rawB);
  const normCanonical = normalizePromoterLookupKey(canonicalName);

  const byStaffName = roster.find(
    (s) => normalizePromoterLookupKey(s.name) === normCanonical
  );
  if (byStaffName) return byStaffName.id.toUpperCase();

  const byPromotersList = PROMOTERS_LIST.find(
    (p) => normalizePromoterLookupKey(p.name) === normCanonical
  );
  if (byPromotersList) return byPromotersList.id.toUpperCase();

  const slug = normCanonical.replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug ? `PRM-${slug.slice(0, 32)}` : 'PRM-GENERICA';
}

/**
 * Resuelve el perfil maestro actual ('FIJA' | 'EVENTUAL') de una promotora
 * según la nómina de Trade Marketing (`staffService` / `PROMOTERS_LIST`).
 */
export function resolveMasterPromoterAttendanceProfile(
  promoterNameOrEmailOrId?: string,
  creatorIdHint?: string,
  staffRoster?: StaffMember[]
): AttendanceProfileType {
  const roster = staffRoster && staffRoster.length > 0 ? staffRoster : INITIAL_STAFF_SEED;
  const rawA = String(promoterNameOrEmailOrId || '').trim();
  const rawB = String(creatorIdHint || '').trim();
  const canonicalName = resolvePromoterNameFromRaw(rawA, rawB);
  const normCanonical = normalizePromoterLookupKey(canonicalName || rawA);

  const staffMatch = roster.find(
    (s) =>
      s.id.toLowerCase() === rawA.toLowerCase() ||
      s.id.toLowerCase() === rawB.toLowerCase() ||
      s.email.trim().toLowerCase() === rawA.toLowerCase() ||
      s.email.trim().toLowerCase() === rawB.toLowerCase() ||
      normalizePromoterLookupKey(s.name) === normCanonical
  );

  if (staffMatch) {
    return staffMatch.category === 'eventual' ? 'EVENTUAL' : 'FIJA';
  }

  const promoterProfile = PROMOTERS_LIST.find(
    (p) =>
      p.id.toLowerCase() === rawA.toLowerCase() ||
      p.id.toLowerCase() === rawB.toLowerCase() ||
      p.email.trim().toLowerCase() === rawA.toLowerCase() ||
      p.email.trim().toLowerCase() === rawB.toLowerCase() ||
      normalizePromoterLookupKey(p.name) === normCanonical
  );

  if (promoterProfile) {
    return promoterProfile.tag.toLowerCase().includes('eventual') ? 'EVENTUAL' : 'FIJA';
  }

  return 'FIJA';
}

/**
 * Regla de Inmutabilidad Histórica (Snapshot de Perfil):
 * Si existen registros previos en la fecha consultada con `perfil_aplicado` ('FIJA' | 'EVENTUAL'),
 * prevalece siempre el snapshot histórico de ese día sobre cualquier cambio posterior en la nómina maestra.
 */
export function resolveEffectiveDailyProfileSnapshot(options: {
  dayRecords?: Array<{
    perfil_aplicado?: string | null;
    slot_foto?: string | null;
    type?: string | null;
  }>;
  existingDaySnapshot?: AttendanceProfileType | string | null;
  promoterNameOrEmailOrId?: string;
  promoterNameOrId?: string;
  creatorIdHint?: string;
  creatorId?: string;
  staffRoster?: StaffMember[];
}): AttendanceProfileType {
  const {
    dayRecords,
    existingDaySnapshot,
    promoterNameOrEmailOrId,
    promoterNameOrId,
    creatorIdHint,
    creatorId,
    staffRoster,
  } = options;

  const explicitSnap = String(existingDaySnapshot || '').trim().toUpperCase();
  if (explicitSnap === 'FIJA' || explicitSnap === 'EVENTUAL') {
    return explicitSnap;
  }

  if (Array.isArray(dayRecords) && dayRecords.length > 0) {
    // 1. Buscar snapshot explícito almacenado en la apertura del día
    for (const rec of dayRecords) {
      const snap = String(rec?.perfil_aplicado || '').trim().toUpperCase();
      if (snap === 'FIJA' || snap === 'EVENTUAL') {
        return snap;
      }
    }
    // 2. Si son registros históricos legados sin campo perfil_aplicado explícito,
    //    verificar si tenían slots exclusivos de EVENTUAL o FIJA
    for (const rec of dayRecords) {
      const slot = String(rec?.slot_foto || '').trim().toUpperCase();
      if (slot === 'JORNADA_INGRESO' || slot === 'JORNADA_SALIDA') {
        return 'FIJA';
      }
      if (
        slot === 'MANANA_INGRESO' ||
        slot === 'MANANA_SALIDA' ||
        slot === 'TARDE_INGRESO' ||
        slot === 'TARDE_SALIDA'
      ) {
        return 'EVENTUAL';
      }
    }
  }

  // 3. Si aún no existe registro para la fecha seleccionada, usar el perfil maestro actual
  return resolveMasterPromoterAttendanceProfile(
    promoterNameOrEmailOrId || promoterNameOrId,
    creatorIdHint || creatorId,
    staffRoster
  );
}

export type AttendanceComplianceStatus =
  | 'Completa'
  | 'En curso / Incompleta'
  | 'Parcial / Incompleta'
  | 'Sin registro';

export interface DailyAttendanceComplianceResult {
  perfil_aplicado: AttendanceProfileType;
  uploadedCount: number;
  requiredCount: 2 | 4;
  progressFraction: string; // '2/2', '1/2', '0/2', '4/4', '2/4', etc.
  status: AttendanceComplianceStatus;
  statusCode: 'COMPLETA' | 'EN_CURSO_INCOMPLETA' | 'PARCIAL_INCOMPLETA' | 'SIN_REGISTRO';
  statusLabel: string;
  badgeText: string;
  fullBadgeText: string;
  isComplete: boolean;
  percentage: number;
  presentSlots: AttendancePhotoSlot[];
  missingSlots: AttendancePhotoSlot[];
}

export type AttendanceComplianceEvaluation = DailyAttendanceComplianceResult;

/**
 * Calcula el estado de cumplimiento diario obedeciendo estrictamente al `perfil_aplicado` de esa jornada:
 * - FIJA (2 fotos): 2/2 = Completa | 1/2 = En curso / Incompleta | 0/2 = Sin registro
 * - EVENTUAL (4 fotos): 4/4 = Completa | 1/4 a 3/4 = Parcial / Incompleta | 0/4 = Sin registro
 */
export function evaluateDailyAttendanceCompliance(
  profile: AttendanceProfileType,
  filledSlotsInput: Iterable<string>
): DailyAttendanceComplianceResult {
  const allowedSlots = getAllowedSlotsForProfile(profile);
  const requiredCount = getMaxPhotosForProfile(profile);
  const inputSet = new Set(
    Array.from(filledSlotsInput).map((s) => String(s || '').trim().toUpperCase())
  );

  const presentSlots = allowedSlots.filter((slot) => inputSet.has(slot));
  const missingSlots = allowedSlots.filter((slot) => !inputSet.has(slot));
  const uploadedCount = presentSlots.length;
  const progressFraction = `${uploadedCount}/${requiredCount}`;

  if (profile === 'FIJA') {
    if (uploadedCount >= 2) {
      return {
        perfil_aplicado: 'FIJA',
        uploadedCount: 2,
        requiredCount: 2,
        progressFraction: '2/2',
        status: 'Completa',
        statusCode: 'COMPLETA',
        statusLabel: 'Completa',
        badgeText: '2/2',
        fullBadgeText: '2/2 • Completa',
        isComplete: true,
        percentage: 100,
        presentSlots,
        missingSlots,
      };
    }
    if (uploadedCount === 1) {
      return {
        perfil_aplicado: 'FIJA',
        uploadedCount: 1,
        requiredCount: 2,
        progressFraction: '1/2',
        status: 'En curso / Incompleta',
        statusCode: 'EN_CURSO_INCOMPLETA',
        statusLabel: 'En curso / Incompleta',
        badgeText: '1/2',
        fullBadgeText: '1/2 • En curso / Incompleta',
        isComplete: false,
        percentage: 50,
        presentSlots,
        missingSlots,
      };
    }
    return {
      perfil_aplicado: 'FIJA',
      uploadedCount: 0,
      requiredCount: 2,
      progressFraction: '0/2',
      status: 'Sin registro',
      statusCode: 'SIN_REGISTRO',
      statusLabel: 'Sin registro',
      badgeText: '0/2',
      fullBadgeText: '0/2 • Sin registro',
      isComplete: false,
      percentage: 0,
      presentSlots,
      missingSlots,
    };
  }

  // Perfil EVENTUAL (4 fotos: Mañana Ingreso/Salida + Tarde Ingreso/Salida)
  if (uploadedCount >= 4) {
    return {
      perfil_aplicado: 'EVENTUAL',
      uploadedCount: 4,
      requiredCount: 4,
      progressFraction: '4/4',
      status: 'Completa',
      statusCode: 'COMPLETA',
      statusLabel: 'Completa',
      badgeText: '4/4',
      fullBadgeText: '4/4 • Completa',
      isComplete: true,
      percentage: 100,
      presentSlots,
      missingSlots,
    };
  }
  if (uploadedCount >= 1) {
    return {
      perfil_aplicado: 'EVENTUAL',
      uploadedCount,
      requiredCount: 4,
      progressFraction,
      status: 'Parcial / Incompleta',
      statusCode: 'PARCIAL_INCOMPLETA',
      statusLabel: 'Parcial / Incompleta',
      badgeText: progressFraction,
      fullBadgeText: `${progressFraction} • Parcial / Incompleta`,
      isComplete: false,
      percentage: Math.round((uploadedCount / 4) * 100),
      presentSlots,
      missingSlots,
    };
  }
  return {
    perfil_aplicado: 'EVENTUAL',
    uploadedCount: 0,
    requiredCount: 4,
    progressFraction: '0/4',
    status: 'Sin registro',
    statusCode: 'SIN_REGISTRO',
    statusLabel: 'Sin registro',
    badgeText: '0/4',
    fullBadgeText: '0/4 • Sin registro',
    isComplete: false,
    percentage: 0,
    presentSlots,
    missingSlots,
  };
}

/**
 * Esquema Zod estricto para validar el envío de evidencias en Servidor y Cliente.
 * Prohibido confiar solo en el Frontend:
 * - Una promotora FIJA NO puede enviar ranuras MANANA_* o TARDE_*, ni superar 2 evidencias por fecha.
 * - Una promotora EVENTUAL solo puede enviar MANANA_INGRESO, MANANA_SALIDA, TARDE_INGRESO, TARDE_SALIDA, sin superar 4 evidencias.
 */
export const AttendanceSlotSubmissionSchema = z
  .object({
    asistencia_id: z.string().min(1).max(128).optional(),
    dayKey: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (debe ser YYYY-MM-DD)')
      .optional(),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (debe ser YYYY-MM-DD)')
      .optional(),
    promotora_id: z.string().min(1).max(80),
    promoter: z.string().min(2).max(120).optional().default('Promotora'),
    store: z.string().min(1).max(180).optional().default('Punto de Venta'),
    perfil_aplicado: z.enum(['FIJA', 'EVENTUAL']),
    historical_perfil_snapshot: z.enum(['FIJA', 'EVENTUAL']).optional(),
    slot_foto: z.enum([
      'JORNADA_INGRESO',
      'JORNADA_SALIDA',
      'MANANA_INGRESO',
      'MANANA_SALIDA',
      'TARDE_INGRESO',
      'TARDE_SALIDA',
    ]),
    existingSlotsForDay: z.array(z.string()).default([]),
    isAuthorizedReplacement: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    const resolvedDayKey = val.dayKey || val.fecha;
    if (!resolvedDayKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fecha'],
        message: 'Formato de fecha inválido (debe ser YYYY-MM-DD).',
      });
      return;
    }

    // 1. Verificar inmutabilidad del snapshot histórico si el día ya fue abierto
    if (
      val.historical_perfil_snapshot &&
      val.historical_perfil_snapshot !== val.perfil_aplicado
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['perfil_aplicado'],
        message: `SNAPSHOT_IMMUTABILITY_VIOLATION: Operación rechazada por seguridad. El registro del día ${resolvedDayKey} fue abierto con perfil ${val.historical_perfil_snapshot} y no puede alterarse a ${val.perfil_aplicado}.`,
      });
      return;
    }

    const effectiveProfile = val.historical_perfil_snapshot || val.perfil_aplicado;
    const existingSet = new Set(
      (val.existingSlotsForDay || []).map((s) => String(s || '').trim().toUpperCase())
    );
    const isUpdatingSameSlot = existingSet.has(val.slot_foto);

    // 2. Reglas para Perfil FIJA (exactamente 2 ranuras permitidas: JORNADA_INGRESO, JORNADA_SALIDA)
    if (effectiveProfile === 'FIJA') {
      if (!isSlotAllowedForProfile('FIJA', val.slot_foto)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slot_foto'],
          message: `SLOT_NOT_ALLOWED_FOR_FIJA: Operación rechazada por seguridad. Una promotora con perfil FIJA no puede enviar la ranura ${val.slot_foto}. Solo se permiten JORNADA_INGRESO y JORNADA_SALIDA.`,
        });
        return;
      }

      const distinctAfterSubmit = isUpdatingSameSlot
        ? existingSet.size
        : existingSet.size + 1;
      if (distinctAfterSubmit > 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slot_foto'],
          message:
            'MAX_SLOTS_EXCEEDED_FIJA: Operación rechazada por seguridad. El perfil FIJA permite un máximo estricto de 2 evidencias fotográficas por jornada.',
        });
      }
    }

    // 3. Reglas para Perfil EVENTUAL (exactamente 4 ranuras permitidas: MANANA_*, TARDE_*)
    if (effectiveProfile === 'EVENTUAL') {
      if (!isSlotAllowedForProfile('EVENTUAL', val.slot_foto)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slot_foto'],
          message: `SLOT_NOT_ALLOWED_FOR_EVENTUAL: Operación rechazada por seguridad. Una promotora con perfil EVENTUAL solo puede enviar MANANA_INGRESO, MANANA_SALIDA, TARDE_INGRESO o TARDE_SALIDA (recibido: ${val.slot_foto}).`,
        });
        return;
      }

      const distinctAfterSubmit = isUpdatingSameSlot
        ? existingSet.size
        : existingSet.size + 1;
      if (distinctAfterSubmit > 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slot_foto'],
          message:
            'MAX_SLOTS_EXCEEDED_EVENTUAL: Operación rechazada por seguridad. El perfil EVENTUAL permite un máximo estricto de 4 evidencias fotográficas por jornada.',
        });
      }
    }
  });

export type AllowedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AllowedImageExtension = 'jpg' | 'png' | 'webp';

export interface ValidatedImagePayload {
  valid: boolean;
  mimeType?: AllowedImageMimeType;
  extension?: AllowedImageExtension;
  byteLength?: number;
  bytes?: Uint8Array;
  buffer?: Uint8Array;
  normalizedDataUrl?: string;
  errorCode?:
    | 'EMPTY_IMAGE'
    | 'DISALLOWED_MIME_HEADER'
    | 'FILE_TOO_LARGE'
    | 'INVALID_BASE64'
    | 'INVALID_MAGIC_BYTES'
    | 'INVALID_IMAGE_MAGIC_BYTES';
  errorMessage?: string;
}

/**
 * Inspecciona los Magic Bytes reales de un arreglo de bytes para verificar que sea
 * genuinamente una imagen rasterizada válida (JPEG, PNG o WEBP) y rechazar .svg, .html, .exe, etc.
 */
export function inspectImageMagicBytes(
  bytes: Uint8Array
): { mimeType: AllowedImageMimeType; extension: AllowedImageExtension } | null {
  if (!bytes || bytes.length < 12) return null;

  // 1. JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // 3. WEBP: "RIFF" (52 49 46 46) en 0..3 y "WEBP" (57 45 42 50) en 8..11
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
}

function decodeBase64ToUint8Array(base64Str: string): Uint8Array | null {
  try {
    const clean = base64Str.replace(/\s+/g, '');
    if (!clean || clean.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(clean)) {
      return null;
    }
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(clean, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    if (typeof atob === 'function') {
      const binary = atob(clean);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeUint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

/**
 * Valida una imagen recibida en el servidor (DataURL o binario Base64):
 * - Rechaza explícitamente .svg, .html, .exe o cualquier contenido cuyos magic bytes no sean JPEG, PNG o WEBP.
 * - Limita el tamaño máximo recibido en servidor a 5 MB por foto.
 */
export function validateAttendanceImagePayload(
  rawInput: string | Uint8Array,
  options?: { allowLegacyTestPlaceholder?: boolean }
): ValidatedImagePayload {
  if (!rawInput) {
    return {
      valid: false,
      errorCode: 'EMPTY_IMAGE',
      errorMessage: 'La evidencia fotográfica está vacía o ausente.',
    };
  }

  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return {
        valid: false,
        errorCode: 'EMPTY_IMAGE',
        errorMessage: 'La evidencia fotográfica está vacía.',
      };
    }

    // Permitir placeholder sintético sólo cuando se indique explícitamente en tests legados
    if (
      options?.allowLegacyTestPlaceholder &&
      (trimmed === 'data:image/jpeg;base64,selfie' ||
        /^data:image\/jpeg;base64,[a-z0-9_]+$/i.test(trimmed))
    ) {
      const syntheticJpeg = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
      ]);
      return {
        valid: true,
        mimeType: 'image/jpeg',
        extension: 'jpg',
        byteLength: syntheticJpeg.byteLength,
        bytes: syntheticJpeg,
        buffer: syntheticJpeg,
        normalizedDataUrl: trimmed,
      };
    }

    // Bloquear cabeceras MIME peligrosas (.svg, .html, javascript, ejecutables)
    if (
      /^data:(image\/svg|text\/html|application\/javascript|application\/x-msdownload|application\/octet-stream|text\/xml)/i.test(
        trimmed
      )
    ) {
      return {
        valid: false,
        errorCode: 'DISALLOWED_MIME_HEADER',
        errorMessage:
          'Formato de archivo rechazado por seguridad: solo se aceptan imágenes JPEG, PNG o WEBP.',
      };
    }

    let base64Body = trimmed;
    const dataUrlMatch = trimmed.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    if (dataUrlMatch) {
      const declaredMime = dataUrlMatch[1].trim().toLowerCase();
      if (
        declaredMime !== 'image/jpeg' &&
        declaredMime !== 'image/jpg' &&
        declaredMime !== 'image/png' &&
        declaredMime !== 'image/webp'
      ) {
        return {
          valid: false,
          errorCode: 'DISALLOWED_MIME_HEADER',
          errorMessage: `Tipo MIME no permitido (${declaredMime}). Solo se aceptan image/jpeg, image/png e image/webp.`,
        };
      }
      base64Body = dataUrlMatch[2];
    }

    const decoded = decodeBase64ToUint8Array(base64Body);
    if (!decoded || decoded.byteLength === 0) {
      return {
        valid: false,
        errorCode: 'INVALID_BASE64',
        errorMessage: 'El archivo codificado en Base64 es inválido o está corrupto.',
      };
    }

    if (decoded.byteLength > MAX_ATTENDANCE_PHOTO_BYTES) {
      return {
        valid: false,
        errorCode: 'FILE_TOO_LARGE',
        errorMessage: `El tamaño de la imagen (${(decoded.byteLength / (1024 * 1024)).toFixed(2)} MB) supera el límite máximo de 5 MB en servidor.`,
      };
    }

    const magic = inspectImageMagicBytes(decoded);
    if (!magic) {
      return {
        valid: false,
        errorCode: 'INVALID_MAGIC_BYTES',
        errorMessage:
          'Archivo rechazado: los magic bytes reales no corresponden a una imagen rasterizada válida (JPEG, PNG o WEBP).',
      };
    }

    return {
      valid: true,
      mimeType: magic.mimeType,
      extension: magic.extension,
      byteLength: decoded.byteLength,
      bytes: decoded,
      buffer: decoded,
      normalizedDataUrl: `data:${magic.mimeType};base64,${encodeUint8ArrayToBase64(decoded)}`,
    };
  }

  // Uint8Array directo
  if (rawInput.byteLength === 0) {
    return {
      valid: false,
      errorCode: 'EMPTY_IMAGE',
      errorMessage: 'El archivo binario está vacío.',
    };
  }
  if (rawInput.byteLength > MAX_ATTENDANCE_PHOTO_BYTES) {
    return {
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      errorMessage: 'El archivo supera el límite máximo permitido de 5 MB.',
    };
  }
  const magic = inspectImageMagicBytes(rawInput);
  if (!magic) {
    return {
      valid: false,
      errorCode: 'INVALID_MAGIC_BYTES',
      errorMessage:
        'Archivo rechazado: los magic bytes reales no corresponden a una imagen rasterizada válida (JPEG, PNG o WEBP).',
    };
  }
  return {
    valid: true,
    mimeType: magic.mimeType,
    extension: magic.extension,
    byteLength: rawInput.byteLength,
    bytes: rawInput,
    buffer: rawInput,
    normalizedDataUrl: `data:${magic.mimeType};base64,${encodeUint8ArrayToBase64(rawInput)}`,
  };
}

/**
 * Genera rutas determinísticas y seguras en el servidor ignorando por completo
 * el nombre original del archivo enviado por el usuario (prevención de Path Traversal y RCE):
 * Formato exacto: `asistencia/{yyyy-mm-dd}/{promotora_id}/{slot_foto}_{uuid}.{ext}`
 */
export function buildDeterministicAttendanceStoragePath(params: {
  dayKey?: string;
  fecha?: string;
  promotoraId: string;
  slotFoto: AttendancePhotoSlot;
  uuid: string;
  extension: AllowedImageExtension;
  originalUserFilename?: string; // Ignorado deliberadamente
}): string {
  const cleanDay = String(params.dayKey || params.fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDay)) {
    throw new Error(`Fecha inválida para ruta de almacenamiento: ${cleanDay}`);
  }

  // Sanitizar promotora_id contra cualquier intento de traversal (../, \, /, nulo)
  const safePromotoraId = String(params.promotoraId || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);
  if (!safePromotoraId) {
    throw new Error('Identificador de promotora inválido para ruta de almacenamiento.');
  }

  if (!(ALL_ATTENDANCE_PHOTO_SLOTS as readonly string[]).includes(params.slotFoto)) {
    throw new Error(`Slot de foto inválido: ${params.slotFoto}`);
  }

  const cleanUuid = String(params.uuid || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f-]/g, '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cleanUuid)) {
    throw new Error('UUID inválido para ruta determinística de almacenamiento.');
  }

  const safeExt: AllowedImageExtension =
    params.extension === 'png' ? 'png' : params.extension === 'webp' ? 'webp' : 'jpg';

  return `asistencia/${cleanDay}/${safePromotoraId}/${params.slotFoto}_${cleanUuid}.${safeExt}`;
}

/**
 * Fuente de Tiempo Confiable:
 * Genera la marca de tiempo oficial del servidor fijada/normalizada a `America/Caracas` (`UTC-4`),
 * sin confiar en la hora local del dispositivo cliente para auditoría.
 */
export function getOfficialServerCaracasTimestamp(serverNow: Date = new Date()): {
  utcIso: string;
  isoUtc: string;
  caracasIso: string;
  dayKey: string;
  fechaCaracas: string;
  formattedTime12h: string;
  formattedTime24h: string;
  horaCaracas24h: string;
} {
  const safeDate = Number.isNaN(serverNow.getTime()) ? new Date() : serverNow;
  const caracasMs = safeDate.getTime() - 4 * 60 * 60 * 1000;
  const caracasDate = new Date(caracasMs);

  const yyyy = caracasDate.getUTCFullYear();
  const mm = String(caracasDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(caracasDate.getUTCDate()).padStart(2, '0');
  const hh = String(caracasDate.getUTCHours()).padStart(2, '0');
  const min = String(caracasDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(caracasDate.getUTCSeconds()).padStart(2, '0');
  const ms = String(caracasDate.getUTCMilliseconds()).padStart(3, '0');

  const dayKey = `${yyyy}-${mm}-${dd}`;
  const caracasIso = `${dayKey}T${hh}:${min}:${ss}.${ms}-04:00`;
  const formattedTime24h = `${hh}:${min}`;
  const horaCaracas24h = `${hh}:${min}:${ss}`;

  const hourNum = caracasDate.getUTCHours();
  const period = hourNum >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
  const formattedTime12h = `${String(hour12).padStart(2, '0')}:${min} ${period}`;
  const utcIso = safeDate.toISOString();

  return {
    utcIso,
    isoUtc: utcIso,
    caracasIso,
    dayKey,
    fechaCaracas: dayKey,
    formattedTime12h,
    formattedTime24h,
    horaCaracas24h,
  };
}

/**
 * Función de firma criptográfica ligera (Keyed Hash / MAC de 128 bits en hexadecimal)
 * compatible con Browser y Node para firmar URLs temporales (*Signed URLs*) de evidencias privadas.
 */
function computeKeyedSignatureHex(payload: string, secret: string): string {
  const combined = `${secret}::${payload}::${secret.split('').reverse().join('')}`;
  let h1 = 0xdeadbeef ^ combined.length;
  let h2 = 0x41c6ce57 ^ combined.length;
  let h3 = 0x811c9dc5 ^ combined.length;
  let h4 = 0x9e3779b9 ^ combined.length;

  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ (ch + i * 17), 0x01000193);
    h4 = Math.imul(h4 ^ (ch * 31 + i), 0x85ebca6b);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);

  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

export function createSignedAttendancePhotoUrl(params: {
  checkInId?: string;
  recordId?: string;
  storagePath?: string;
  secret?: string;
  ttlSeconds?: number;
  nowMs?: number;
}): {
  url: string;
  signedUrl: string;
  expiresAtUnix: number;
  expiresAtEpochMs: number;
  signature: string;
} {
  const ttl = Math.max(30, Math.min(params.ttlSeconds ?? 900, 3600)); // Por defecto 15 min (expiración corta)
  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const expiresAtUnix = nowSec + ttl;
  const expiresAtEpochMs = expiresAtUnix * 1000;
  const cleanId = String(params.checkInId || params.recordId || '').trim();
  const effectiveSecret = params.secret || 'codizulca-signed-url-secret';
  const payloadToSign = `${cleanId}|${params.storagePath || ''}|${expiresAtUnix}`;
  const signature = computeKeyedSignatureHex(payloadToSign, effectiveSecret);
  const url = `/api/checkins/${encodeURIComponent(cleanId)}/photo?expires=${expiresAtUnix}&sig=${signature}`;

  return {
    url,
    signedUrl: url,
    expiresAtUnix,
    expiresAtEpochMs,
    signature,
  };
}

export function verifySignedAttendancePhotoUrl(params: {
  checkInId?: string;
  recordId?: string;
  storagePath?: string;
  expiresAtUnix?: number | string;
  expiresAtEpochMs?: number | string;
  signature: string;
  secret?: string;
  nowMs?: number;
}): { valid: boolean; reason?: 'EXPIRED' | 'INVALID_SIGNATURE' | 'MISSING_PARAMS' } {
  const cleanId = String(params.checkInId || params.recordId || '').trim();
  let expNum = Number(params.expiresAtUnix);
  if (!Number.isFinite(expNum) && params.expiresAtEpochMs !== undefined) {
    const rawMs = Number(params.expiresAtEpochMs);
    if (Number.isFinite(rawMs)) {
      expNum = rawMs > 10_000_000_000 ? Math.floor(rawMs / 1000) : rawMs;
    }
  } else if (Number.isFinite(expNum) && expNum > 10_000_000_000) {
    expNum = Math.floor(expNum / 1000);
  }

  if (!cleanId || !params.signature || !Number.isFinite(expNum)) {
    return { valid: false, reason: 'MISSING_PARAMS' };
  }
  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000);
  if (nowSec > expNum) {
    return { valid: false, reason: 'EXPIRED' };
  }
  const effectiveSecret = params.secret || 'codizulca-signed-url-secret';
  const expectedWithStorage = computeKeyedSignatureHex(
    `${cleanId}|${params.storagePath || ''}|${expNum}`,
    effectiveSecret
  );
  const expectedWithoutStorage = computeKeyedSignatureHex(
    `${cleanId}||${expNum}`,
    effectiveSecret
  );

  if (
    params.signature !== expectedWithStorage &&
    params.signature !== expectedWithoutStorage
  ) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  return { valid: true };
}

/**
 * Verifica si el actor que realiza la petición tiene autorización para subir, visualizar o reemplazar evidencias.
 */
export function verifyAttendanceActorAuthorization(params: {
  actorRole?: string;
  actorIdOrEmail?: string;
  targetPromoterIdOrName: string;
  action: 'upload' | 'replace' | 'view' | 'delete';
}): { authorized: boolean; reason?: string } {
  const roleClean = String(params.actorRole || '')
    .trim()
    .toLowerCase();

  const isPrivilegedRole =
    roleClean.includes('admin') ||
    roleClean.includes('gerente') ||
    roleClean.includes('presidente') ||
    roleClean.includes('directivo') ||
    roleClean.includes('supervisor') ||
    roleClean.includes('coordinador') ||
    roleClean.includes('trade');

  if (isPrivilegedRole) {
    return { authorized: true };
  }

  if (params.action === 'delete') {
    return {
      authorized: false,
      reason: 'Solo roles de Coordinación Trade Marketing, Supervisión o Administración pueden eliminar registros de auditoría.',
    };
  }

  const actorCanonicalId = resolveCanonicalPromoterId(params.actorIdOrEmail);
  const targetCanonicalId = resolveCanonicalPromoterId(params.targetPromoterIdOrName);

  if (
    params.actorIdOrEmail &&
    actorCanonicalId === targetCanonicalId &&
    actorCanonicalId !== 'PRM-GENERICA'
  ) {
    return { authorized: true };
  }

  return {
    authorized: false,
    reason: 'No autorizado para modificar evidencias de otra promotora.',
  };
}

/**
 * Compresión y redimensionamiento de imagen en cliente para optimización de red móvil:
 * - Lado mayor máximo: 1600px
 * - Calidad: 0.80 en image/webp o image/jpeg
 * - Reporta progreso (0..100) para UI
 */
export async function compressAttendanceImageClient(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{
  dataUrl: string;
  mimeType: AllowedImageMimeType;
  width: number;
  height: number;
  byteSizeApprox: number;
}> {
  onProgress?.(10);

  // Validación rápida en cliente antes de abrir FileReader
  const lowerName = (file.name || '').toLowerCase();
  const lowerType = (file.type || '').toLowerCase();
  if (
    lowerType.includes('svg') ||
    lowerType.includes('html') ||
    lowerType.includes('script') ||
    lowerName.endsWith('.svg') ||
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.exe')
  ) {
    throw new Error(
      'Formato no permitido. Selecciona únicamente una fotografía válida (JPG, PNG o WEBP).'
    );
  }

  if (file.size > MAX_ATTENDANCE_PHOTO_BYTES * 2.5) {
    throw new Error('El archivo original es demasiado pesado. Selecciona una imagen menor a 12 MB.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress?.(Math.min(45, 10 + Math.round((ev.loaded / ev.total) * 35)));
      }
    };
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen seleccionado.'));
    reader.readAsDataURL(file);
  });

  onProgress?.(55);

  const result = await new Promise<{
    dataUrl: string;
    mimeType: AllowedImageMimeType;
    width: number;
    height: number;
    byteSizeApprox: number;
  }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let width = img.width || 1200;
        let height = img.height || 1600;

        if (width >= height && width > CLIENT_MAX_IMAGE_DIMENSION_PX) {
          height = Math.round((height * CLIENT_MAX_IMAGE_DIMENSION_PX) / width);
          width = CLIENT_MAX_IMAGE_DIMENSION_PX;
        } else if (height > width && height > CLIENT_MAX_IMAGE_DIMENSION_PX) {
          width = Math.round((width * CLIENT_MAX_IMAGE_DIMENSION_PX) / height);
          height = CLIENT_MAX_IMAGE_DIMENSION_PX;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el motor gráfico de compresión.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        onProgress?.(80);

        let compressed = canvas.toDataURL('image/webp', CLIENT_IMAGE_COMPRESSION_QUALITY);
        let mimeType: AllowedImageMimeType = 'image/webp';
        if (!compressed.startsWith('data:image/webp')) {
          compressed = canvas.toDataURL('image/jpeg', CLIENT_IMAGE_COMPRESSION_QUALITY);
          mimeType = 'image/jpeg';
        }

        const base64Len = compressed.split(',')[1]?.length || 0;
        const byteSizeApprox = Math.round((base64Len * 3) / 4);
        if (byteSizeApprox > MAX_ATTENDANCE_PHOTO_BYTES) {
          reject(new Error('La imagen comprimida supera el límite máximo de 5 MB.'));
          return;
        }

        onProgress?.(100);
        resolve({
          dataUrl: compressed,
          mimeType,
          width,
          height,
          byteSizeApprox,
        });
      } catch (err: any) {
        reject(err instanceof Error ? err : new Error('Error al comprimir la fotografía.'));
      }
    };
    img.onerror = () =>
      reject(new Error('El archivo seleccionado no es una imagen válida o está dañado.'));
    img.src = rawDataUrl;
  });

  return result;
}

/**
 * Motor en memoria / transaccional para gestionar la unicidad `(asistencia_id, slot_foto)`,
 * la inmutabilidad histórica de `perfil_aplicado` y la limpieza de archivos huérfanos.
 */
export interface StoredAttendanceEvidence {
  id: string;
  asistencia_id: string;
  dayKey: string;
  promotora_id: string;
  promoter: string;
  store: string;
  perfil_aplicado: AttendanceProfileType;
  slot_foto: AttendancePhotoSlot;
  legacyType: LegacyCheckInType;
  storage_path: string;
  mime_type: AllowedImageMimeType;
  byte_size: number;
  server_uploaded_at: string;
  caracas_timestamp: string;
  photoDataUrl: string;
}

export class TransactionalAttendanceEvidenceStore {
  private dailyHeaders = new Map<
    string,
    {
      asistencia_id: string;
      dayKey: string;
      promotora_id: string;
      promoter: string;
      perfil_aplicado: AttendanceProfileType;
      opened_at_caracas: string;
    }
  >();

  private slotsByKey = new Map<string, StoredAttendanceEvidence>();
  private privateBucketObjects = new Set<string>();
  private removedOrphanPaths: string[] = [];

  private getHeaderKey(dayKey: string, promotoraId: string): string {
    return `${dayKey}|${promotoraId.toUpperCase()}`;
  }

  private getSlotKey(asistenciaId: string, slotFoto: AttendancePhotoSlot): string {
    return `${asistenciaId}|${slotFoto}`;
  }

  public getRemovedOrphanPaths(): string[] {
    return [...this.removedOrphanPaths];
  }

  public hasBucketObject(storagePath: string): boolean {
    return this.privateBucketObjects.has(storagePath);
  }

  public submitEvidence(params: {
    id: string;
    dayKey?: string;
    promoter: string;
    promotoraId?: string;
    store: string;
    requestedProfile?: AttendanceProfileType;
    slotFoto: AttendancePhotoSlot;
    rawPhoto: string | Uint8Array;
    originalFilename?: string;
    serverNow?: Date;
    staffRoster?: StaffMember[];
  }): {
    record: StoredAttendanceEvidence;
    compliance: DailyAttendanceComplianceResult;
    replacedExisting: boolean;
    orphanRemovedPath: string | null;
  } {
    const serverTime = getOfficialServerCaracasTimestamp(params.serverNow || new Date());
    const effectiveDayKey = params.dayKey || serverTime.dayKey;
    const canonicalPromotoraId =
      params.promotoraId ||
      resolveCanonicalPromoterId(params.promoter, undefined, params.staffRoster);
    const canonicalPromoterName =
      resolvePromoterNameFromRaw(params.promoter, canonicalPromotoraId) || params.promoter;

    const headerKey = this.getHeaderKey(effectiveDayKey, canonicalPromotoraId);
    const existingHeader = this.dailyHeaders.get(headerKey);

    const masterProfile = resolveMasterPromoterAttendanceProfile(
      canonicalPromoterName,
      canonicalPromotoraId,
      params.staffRoster
    );
    const requestedOrMaster = params.requestedProfile || masterProfile;
    const historicalSnapshot = existingHeader?.perfil_aplicado;
    const effectiveProfile = historicalSnapshot || requestedOrMaster;

    const asistenciaId = existingHeader?.asistencia_id || `ASIS-${effectiveDayKey}-${canonicalPromotoraId}`;
    const existingForDay = Array.from(this.slotsByKey.values()).filter(
      (e) => e.asistencia_id === asistenciaId
    );

    // 1. Validar con Zod (reglas de perfil + ranura + cupo máximo + snapshot inmutable)
    const parsed = AttendanceSlotSubmissionSchema.safeParse({
      asistencia_id: asistenciaId,
      dayKey: effectiveDayKey,
      promotora_id: canonicalPromotoraId,
      promoter: canonicalPromoterName,
      store: params.store,
      perfil_aplicado: requestedOrMaster,
      historical_perfil_snapshot: historicalSnapshot,
      slot_foto: params.slotFoto,
      existingSlotsForDay: existingForDay.map((e) => e.slot_foto),
      isAuthorizedReplacement: true,
    });

    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' | ');
      throw new Error(msg);
    }

    // 2. Validar imagen por Magic Bytes y límite de 5 MB
    const validatedImg = validateAttendanceImagePayload(params.rawPhoto);
    if (!validatedImg.valid || !validatedImg.mimeType || !validatedImg.extension) {
      throw new Error(`${validatedImg.errorCode}: ${validatedImg.errorMessage}`);
    }

    // 3. Generar ruta determinística segura ignorando originalFilename
    const storagePath = buildDeterministicAttendanceStoragePath({
      dayKey: effectiveDayKey,
      promotoraId: canonicalPromotoraId,
      slotFoto: params.slotFoto,
      uuid: params.id,
      extension: validatedImg.extension,
      originalUserFilename: params.originalFilename,
    });

    // 4. Congelar cabecera de asistencia diaria con snapshot inmutable
    if (!existingHeader) {
      this.dailyHeaders.set(headerKey, {
        asistencia_id: asistenciaId,
        dayKey: effectiveDayKey,
        promotora_id: canonicalPromotoraId,
        promoter: canonicalPromoterName,
        perfil_aplicado: effectiveProfile,
        opened_at_caracas: serverTime.caracasIso,
      });
    }

    // 5. Upsert transaccional en (asistencia_id, slot_foto) y limpieza de archivo huérfano previo
    const slotKey = this.getSlotKey(asistenciaId, params.slotFoto);
    const previousSlotRecord = this.slotsByKey.get(slotKey);
    let orphanRemovedPath: string | null = null;

    if (previousSlotRecord && previousSlotRecord.storage_path !== storagePath) {
      this.privateBucketObjects.delete(previousSlotRecord.storage_path);
      this.removedOrphanPaths.push(previousSlotRecord.storage_path);
      orphanRemovedPath = previousSlotRecord.storage_path;
    }

    this.privateBucketObjects.add(storagePath);

    const record: StoredAttendanceEvidence = {
      id: params.id,
      asistencia_id: asistenciaId,
      dayKey: effectiveDayKey,
      promotora_id: canonicalPromotoraId,
      promoter: canonicalPromoterName,
      store: params.store,
      perfil_aplicado: effectiveProfile,
      slot_foto: params.slotFoto,
      legacyType: mapSlotToLegacyCheckInType(params.slotFoto),
      storage_path: storagePath,
      mime_type: validatedImg.mimeType,
      byte_size: validatedImg.byteLength || 0,
      server_uploaded_at: serverTime.utcIso,
      caracas_timestamp: serverTime.caracasIso,
      photoDataUrl: validatedImg.normalizedDataUrl || '',
    };

    this.slotsByKey.set(slotKey, record);

    const updatedSlotsForDay = Array.from(this.slotsByKey.values())
      .filter((e) => e.asistencia_id === asistenciaId)
      .map((e) => e.slot_foto);

    const compliance = evaluateDailyAttendanceCompliance(
      effectiveProfile,
      updatedSlotsForDay
    );

    return {
      record,
      compliance,
      replacedExisting: Boolean(previousSlotRecord),
      orphanRemovedPath,
    };
  }

  public getDayReport(
    dayKey: string,
    promoterOrId: string,
    staffRoster?: StaffMember[]
  ): {
    perfil_aplicado: AttendanceProfileType;
    compliance: DailyAttendanceComplianceResult;
    evidences: StoredAttendanceEvidence[];
  } {
    const canonicalPromotoraId = resolveCanonicalPromoterId(
      promoterOrId,
      undefined,
      staffRoster
    );
    const headerKey = this.getHeaderKey(dayKey, canonicalPromotoraId);
    const header = this.dailyHeaders.get(headerKey);

    const evidences = Array.from(this.slotsByKey.values()).filter(
      (e) => e.dayKey === dayKey && e.promotora_id === canonicalPromotoraId
    );

    const effectiveProfile = resolveEffectiveDailyProfileSnapshot({
      dayRecords: header ? [{ perfil_aplicado: header.perfil_aplicado }] : evidences,
      promoterNameOrEmailOrId: promoterOrId,
      creatorIdHint: canonicalPromotoraId,
      staffRoster,
    });

    const compliance = evaluateDailyAttendanceCompliance(
      effectiveProfile,
      evidences.map((e) => e.slot_foto)
    );

    return {
      perfil_aplicado: effectiveProfile,
      compliance,
      evidences,
    };
  }

  public getOrphanDeletedPaths(): string[] {
    return this.getRemovedOrphanPaths();
  }

  public upsertEvidence(params: {
    id?: string;
    promotoraNameOrId: string;
    fecha: string;
    store?: string;
    requestedProfile?: AttendanceProfileType;
    slotFoto: AttendancePhotoSlot;
    photoDataUrl: string | Uint8Array;
    originalFilename?: string;
    serverNow?: Date;
    staffRoster?: StaffMember[];
  }): {
    ok: boolean;
    httpStatus: number;
    errorCode?: string;
    errorMessage?: string;
    evidence?: StoredAttendanceEvidence;
    compliance?: DailyAttendanceComplianceResult;
    replacedOrphanStoragePath: string | null;
  } {
    try {
      const seqNum = this.slotsByKey.size + this.removedOrphanPaths.length + 1;
      const autoUuid =
        params.id ||
        `123e4567-e89b-42d3-a456-${String(seqNum).padStart(12, '0')}`;
      const res = this.submitEvidence({
        id: autoUuid,
        dayKey: params.fecha,
        promoter: params.promotoraNameOrId,
        store: params.store || 'ALKOSTO (Bella Vista)',
        requestedProfile: params.requestedProfile,
        slotFoto: params.slotFoto,
        rawPhoto: params.photoDataUrl,
        originalFilename: params.originalFilename,
        serverNow: params.serverNow,
        staffRoster: params.staffRoster,
      });
      return {
        ok: true,
        httpStatus: 200,
        evidence: res.record,
        compliance: res.compliance,
        replacedOrphanStoragePath: res.orphanRemovedPath,
      };
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const isFileTooLarge = msg.includes('FILE_TOO_LARGE');
      const isInvalidMedia =
        msg.includes('INVALID_MAGIC_BYTES') ||
        msg.includes('INVALID_IMAGE_MAGIC_BYTES') ||
        msg.includes('DISALLOWED_MIME_HEADER');
      const isSnapshotImmutable = msg.includes('HISTORICAL_PROFILE_IMMUTABLE');
      const isMaxSlots = msg.includes('MAX_SLOTS_EXCEEDED');
      return {
        ok: false,
        httpStatus: isFileTooLarge ? 413 : isInvalidMedia ? 415 : 422,
        errorCode: isFileTooLarge
          ? 'FILE_TOO_LARGE'
          : isInvalidMedia
          ? 'INVALID_MAGIC_BYTES'
          : isSnapshotImmutable
          ? 'HISTORICAL_PROFILE_IMMUTABLE'
          : isMaxSlots
          ? 'MAX_SLOTS_EXCEEDED'
          : 'PROFILE_SLOT_MISMATCH',
        errorMessage: msg,
        replacedOrphanStoragePath: null,
      };
    }
  }

  public getDailyRecord(
    promoterOrId: string,
    fecha: string,
    staffRoster?: StaffMember[]
  ): {
    asistencia_id: string;
    perfil_aplicado: AttendanceProfileType;
    compliance: DailyAttendanceComplianceResult;
    evidences: Map<AttendancePhotoSlot, StoredAttendanceEvidence>;
  } | null {
    const report = this.getDayReport(fecha, promoterOrId, staffRoster);
    const canonicalPromotoraId = resolveCanonicalPromoterId(
      promoterOrId,
      undefined,
      staffRoster
    );
    const evidencesMap = new Map<AttendancePhotoSlot, StoredAttendanceEvidence>();
    for (const ev of report.evidences) {
      evidencesMap.set(ev.slot_foto, ev);
    }
    return {
      asistencia_id: `ASIS-${fecha}-${canonicalPromotoraId}`,
      perfil_aplicado: report.perfil_aplicado,
      compliance: report.compliance,
      evidences: evidencesMap,
    };
  }
}
