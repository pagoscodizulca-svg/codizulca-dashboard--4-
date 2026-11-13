import { describe, it, expect, beforeEach } from 'vitest';
import {
  FIJA_PHOTO_SLOTS,
  EVENTUAL_PHOTO_SLOTS,
  FIJA_SLOT_DESCRIPTORS,
  EVENTUAL_MORNING_SLOT_DESCRIPTORS,
  EVENTUAL_AFTERNOON_SLOT_DESCRIPTORS,
  MAX_ATTENDANCE_IMAGE_BYTES,
  resolveCanonicalPromoterId,
  resolveMasterPromoterAttendanceProfile,
  resolveEffectiveDailyProfileSnapshot,
  getDescriptorsForProfile,
  evaluateDailyAttendanceCompliance,
  AttendanceSlotSubmissionSchema,
  inspectImageMagicBytes,
  validateAttendanceImagePayload,
  buildDeterministicAttendanceStoragePath,
  getOfficialServerCaracasTimestamp,
  createSignedAttendancePhotoUrl,
  verifySignedAttendancePhotoUrl,
  TransactionalAttendanceEvidenceStore,
} from '../lib/attendanceSecurityValidator';
import { checkinsService } from '../lib/checkinsService';

// Helper para construir payloads base64 con magic bytes reales
function makeValidJpegDataUrl(extraBytes: number = 32): string {
  const bytes = new Uint8Array(12 + extraBytes);
  // JPEG SOI + APP0/EXIF: FF D8 FF E0
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  for (let i = 4; i < bytes.length; i++) {
    bytes[i] = (i * 37) & 0xff;
  }
  const b64 = Buffer.from(bytes).toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}

function makeValidPngDataUrl(): string {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

function makeValidWebpDataUrl(): string {
  // RIFF (52 49 46 46) + size (4 bytes) + WEBP (57 45 42 50)
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20,
  ]);
  return `data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('Informes > Asistencia — Lógica Condicional por Perfil (FIJA vs EVENTUAL) y Seguridad', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
  });

  it('TC-01 (Renderizado Condicional FIJA): Promotoras Fijas exponen exclusivamente 2 ranuras (Ingreso y Salida) sin turnos de mañana/tarde', () => {
    const fijaPromoters = ['NICOLE GODOY', 'SCARLETH PIÑA', 'CARELIZ REYES', 'TANIA CARDENAS'];

    for (const promoter of fijaPromoters) {
      const profile = resolveMasterPromoterAttendanceProfile(promoter);
      expect(profile).toBe('FIJA');

      const descriptors = getDescriptorsForProfile(profile);
      expect(descriptors).toHaveLength(2);
      expect(descriptors.map((d) => d.slot)).toEqual(['JORNADA_INGRESO', 'JORNADA_SALIDA']);
      expect(descriptors[0].label).toBe('Ingreso a la jornada laboral');
      expect(descriptors[1].label).toBe('Salida de la jornada laboral');

      // Ninguna ranura de promotora FIJA contiene referencias a mañana, tarde o almuerzo
      for (const desc of descriptors) {
        expect(desc.slot).not.toMatch(/MANANA_|TARDE_/);
        expect(desc.sectionTitle).toBeUndefined();
        const aria = desc.buildAriaLabel(promoter, false);
        expect(aria).toContain(promoter);
      }
    }
  });

  it('TC-02 (Renderizado Condicional EVENTUAL): Promotoras Eventuales exponen exactamente 4 ranuras agrupadas en Jornada de la Mañana y Jornada de la Tarde', () => {
    const eventualPromoters = [
      'CLAUDIA ALVAREZ',
      'AHYRLET RUIZ',
      'VALERIA ACEVEDO',
      'JELARY ACOSTA',
      'MARIANGEL VALDIVIESO',
      'ANGELICA SANCHEZ',
      'ENELIANGELA GONZALEZ',
      'MARIANYEL ARANDA',
      'JULIANNYS GIL',
    ];

    for (const promoter of eventualPromoters) {
      const profile = resolveMasterPromoterAttendanceProfile(promoter);
      expect(profile).toBe('EVENTUAL');

      const descriptors = getDescriptorsForProfile(profile);
      expect(descriptors).toHaveLength(4);
      expect(descriptors.map((d) => d.slot)).toEqual([
        'MANANA_INGRESO',
        'MANANA_SALIDA',
        'TARDE_INGRESO',
        'TARDE_SALIDA',
      ]);

      expect(EVENTUAL_MORNING_SLOT_DESCRIPTORS).toHaveLength(2);
      expect(EVENTUAL_MORNING_SLOT_DESCRIPTORS[0].sectionTitle).toBe('Jornada de la Mañana');
      expect(EVENTUAL_AFTERNOON_SLOT_DESCRIPTORS).toHaveLength(2);
      expect(EVENTUAL_AFTERNOON_SLOT_DESCRIPTORS[0].sectionTitle).toBe('Jornada de la Tarde');

      const morningAria = EVENTUAL_MORNING_SLOT_DESCRIPTORS[0].buildAriaLabel(promoter, false);
      expect(morningAria).toBe(`Subir foto de ingreso jornada de la mañana para ${promoter}`);
    }
  });

  it('TC-03 (Seguridad Backend — Rechazo de Ranura Cruzada): Rechaza con 422 que una promotora FIJA envíe ranuras de EVENTUAL o viceversa', async () => {
    // 1. Validación Zod directa
    const invalidFijaWithMorningSlot = AttendanceSlotSubmissionSchema.safeParse({
      promotora_id: resolveCanonicalPromoterId('NICOLE GODOY'),
      fecha: '2026-11-12',
      perfil_aplicado: 'FIJA',
      slot_foto: 'MANANA_INGRESO',
    });
    expect(invalidFijaWithMorningSlot.success).toBe(false);

    const invalidEventualWithFijaSlot = AttendanceSlotSubmissionSchema.safeParse({
      promotora_id: resolveCanonicalPromoterId('CLAUDIA ALVAREZ'),
      fecha: '2026-11-12',
      perfil_aplicado: 'EVENTUAL',
      slot_foto: 'JORNADA_INGRESO',
    });
    expect(invalidEventualWithFijaSlot.success).toBe(false);

    // 2. Validación en el motor transaccional del servidor (HTTP 422)
    const store = new TransactionalAttendanceEvidenceStore();
    const result = store.upsertEvidence({
      promotoraNameOrId: 'NICOLE GODOY',
      fecha: '2026-11-12',
      requestedProfile: 'FIJA',
      slotFoto: 'MANANA_INGRESO',
      photoDataUrl: makeValidJpegDataUrl(),
      originalFilename: 'evidencia.jpg',
    });
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(422);
    expect(result.errorCode).toBe('PROFILE_SLOT_MISMATCH');

    // 3. Validación en checkinsService.createCheckIn cuando se manipula slot_foto en cliente
    await expect(
      checkinsService.createCheckIn({
        date: '2026-11-12T12:30:00.000Z',
        promoter: 'NICOLE GODOY',
        store: 'ALKOSTO (Bella Vista)',
        type: 'Ingreso',
        perfil_aplicado: 'FIJA',
        slot_foto: 'MANANA_INGRESO',
        photoBase64: makeValidJpegDataUrl(),
        location: { lat: 10.65, lng: -71.62, accuracy: 8 },
      })
    ).rejects.toThrow(/Operación rechazada por seguridad/i);
  });

  it('TC-04 (Seguridad de Archivos — Magic Bytes, Tamaño Máximo 5 MB y Rutas Determinísticas): Rechaza SVG/EXE/HTML camuflados y archivos > 5 MB', () => {
    // 1. Archivo SVG camuflado con cabecera data:image/jpeg
    const maliciousSvg = Buffer.from('<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
    const svgDisguisedAsJpg = `data:image/jpeg;base64,${maliciousSvg}`;
    const svgCheck = validateAttendanceImagePayload(svgDisguisedAsJpg);
    expect(svgCheck.valid).toBe(false);
    expect(svgCheck.errorCode).toBe('INVALID_MAGIC_BYTES');

    // 2. Archivo ejecutable MZ (.exe) camuflado como PNG
    const maliciousExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff').toString('base64');
    const exeDisguisedAsPng = `data:image/png;base64,${maliciousExe}`;
    const exeCheck = validateAttendanceImagePayload(exeDisguisedAsPng);
    expect(exeCheck.valid).toBe(false);
    expect(exeCheck.errorCode).toBe('INVALID_MAGIC_BYTES');

    // 3. Archivo que excede los 5 MB (5,242,880 bytes)
    const oversizedBytes = new Uint8Array(MAX_ATTENDANCE_IMAGE_BYTES + 1024);
    oversizedBytes[0] = 0xff;
    oversizedBytes[1] = 0xd8;
    oversizedBytes[2] = 0xff;
    const oversizedDataUrl = `data:image/jpeg;base64,${Buffer.from(oversizedBytes).toString('base64')}`;
    const sizeCheck = validateAttendanceImagePayload(oversizedDataUrl);
    expect(sizeCheck.valid).toBe(false);
    expect(sizeCheck.errorCode).toBe('FILE_TOO_LARGE');

    // 4. Imágenes rasterizadas legítimas (JPEG, PNG, WEBP) pasan Magic Bytes
    expect(validateAttendanceImagePayload(makeValidJpegDataUrl()).valid).toBe(true);
    expect(validateAttendanceImagePayload(makeValidPngDataUrl()).valid).toBe(true);
    expect(validateAttendanceImagePayload(makeValidWebpDataUrl()).valid).toBe(true);

    // 5. Generación de ruta determinística ignora nombre original malicioso (Path Traversal)
    const pathResult = buildDeterministicAttendanceStoragePath({
      fecha: '2026-11-12',
      promotoraId: 'STF-001',
      slotFoto: 'JORNADA_INGRESO',
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      extension: 'webp',
    });
    expect(pathResult).toBe(
      'asistencia/2026-11-12/STF-001/JORNADA_INGRESO_123e4567-e89b-12d3-a456-426614174000.webp'
    );
  });

  it('TC-05 (Idempotencia y Reemplazo Limpio): Subir dos veces a la misma ranura reemplaza la evidencia sin duplicar filas y limpia el archivo huérfano', () => {
    const store = new TransactionalAttendanceEvidenceStore();

    const firstUpload = store.upsertEvidence({
      promotoraNameOrId: 'SCARLETH PIÑA',
      fecha: '2026-11-12',
      slotFoto: 'JORNADA_INGRESO',
      photoDataUrl: makeValidJpegDataUrl(16),
      originalFilename: '../../malicious_name.jpg',
    });
    expect(firstUpload.ok).toBe(true);
    expect(firstUpload.replacedOrphanStoragePath).toBeNull();
    expect(firstUpload.compliance?.badgeText).toBe('1/2');
    expect(firstUpload.compliance?.status).toBe('En curso / Incompleta');

    const firstPath = firstUpload.evidence!.storage_path;

    // Segunda subida a la MISMA ranura (JORNADA_INGRESO)
    const secondUpload = store.upsertEvidence({
      promotoraNameOrId: 'SCARLETH PIÑA',
      fecha: '2026-11-12',
      slotFoto: 'JORNADA_INGRESO',
      photoDataUrl: makeValidPngDataUrl(),
    });
    expect(secondUpload.ok).toBe(true);
    expect(secondUpload.replacedOrphanStoragePath).toBe(firstPath);
    // El conteo sigue siendo 1/2 (idempotencia por (asistencia_id, slot_foto))
    expect(secondUpload.compliance?.badgeText).toBe('1/2');
    expect(store.getOrphanDeletedPaths()).toContain(firstPath);

    const record = store.getDailyRecord('SCARLETH PIÑA', '2026-11-12');
    expect(record?.evidences.size).toBe(1);
    expect(record?.evidences.get('JORNADA_INGRESO')?.storage_path).toBe(
      secondUpload.evidence!.storage_path
    );
  });

  it('TC-06 (Inmutabilidad Histórica): Si una promotora cambia de FIJA en T1 a EVENTUAL en T2, la consulta de T1 conserva su snapshot FIJA (2/2 = Completa)', () => {
    const store = new TransactionalAttendanceEvidenceStore();

    // En fecha T1 (2026-11-10), NICOLE GODOY abre y completa su asistencia como FIJA (2/2)
    store.upsertEvidence({
      promotoraNameOrId: 'NICOLE GODOY',
      fecha: '2026-11-10',
      requestedProfile: 'FIJA',
      slotFoto: 'JORNADA_INGRESO',
      photoDataUrl: makeValidJpegDataUrl(),
    });
    const t1Complete = store.upsertEvidence({
      promotoraNameOrId: 'NICOLE GODOY',
      fecha: '2026-11-10',
      requestedProfile: 'FIJA',
      slotFoto: 'JORNADA_SALIDA',
      photoDataUrl: makeValidJpegDataUrl(),
    });
    expect(t1Complete.ok).toBe(true);
    expect(t1Complete.compliance?.badgeText).toBe('2/2');
    expect(t1Complete.compliance?.status).toBe('Completa');

    // Supongamos que en T2 (2026-11-12) cambia su modalidad a EVENTUAL y alguien intenta
    // mutar o inyectar una ranura EVENTUAL en la fecha histórica T1 (2026-11-10):
    const illegalHistoricalMutation = store.upsertEvidence({
      promotoraNameOrId: 'NICOLE GODOY',
      fecha: '2026-11-10',
      requestedProfile: 'EVENTUAL',
      slotFoto: 'MANANA_INGRESO',
      photoDataUrl: makeValidJpegDataUrl(),
    });
    expect(illegalHistoricalMutation.ok).toBe(false);
    expect(illegalHistoricalMutation.httpStatus).toBe(422);

    // Al consultar T1 (2026-11-10), su perfil_aplicado sigue siendo inmutablemente 'FIJA' con 2/2 Completa
    const historicalDay = store.getDailyRecord('NICOLE GODOY', '2026-11-10');
    expect(historicalDay?.perfil_aplicado).toBe('FIJA');
    const historicalEval = evaluateDailyAttendanceCompliance(
      historicalDay!.perfil_aplicado,
      Array.from(historicalDay!.evidences.keys())
    );
    expect(historicalEval.badgeText).toBe('2/2');
    expect(historicalEval.status).toBe('Completa');
    expect(historicalEval.percentage).toBe(100);
  });

  it('TC-07 (Cálculo de Estados de Cumplimiento): Evalúa con precisión 0/2, 1/2, 2/2 para FIJA y 0/4, 1/4..3/4, 4/4 para EVENTUAL', () => {
    // Perfil FIJA
    expect(evaluateDailyAttendanceCompliance('FIJA', [])).toMatchObject({
      badgeText: '0/2',
      status: 'Sin registro',
      isComplete: false,
      percentage: 0,
    });
    expect(evaluateDailyAttendanceCompliance('FIJA', ['JORNADA_INGRESO'])).toMatchObject({
      badgeText: '1/2',
      status: 'En curso / Incompleta',
      isComplete: false,
      percentage: 50,
    });
    expect(
      evaluateDailyAttendanceCompliance('FIJA', ['JORNADA_INGRESO', 'JORNADA_SALIDA'])
    ).toMatchObject({
      badgeText: '2/2',
      status: 'Completa',
      isComplete: true,
      percentage: 100,
    });

    // Perfil EVENTUAL
    expect(evaluateDailyAttendanceCompliance('EVENTUAL', [])).toMatchObject({
      badgeText: '0/4',
      status: 'Sin registro',
      isComplete: false,
      percentage: 0,
    });
    expect(evaluateDailyAttendanceCompliance('EVENTUAL', ['MANANA_INGRESO'])).toMatchObject({
      badgeText: '1/4',
      status: 'Parcial / Incompleta',
      isComplete: false,
      percentage: 25,
    });
    expect(
      evaluateDailyAttendanceCompliance('EVENTUAL', [
        'MANANA_INGRESO',
        'MANANA_SALIDA',
        'TARDE_INGRESO',
      ])
    ).toMatchObject({
      badgeText: '3/4',
      status: 'Parcial / Incompleta',
      isComplete: false,
      percentage: 75,
    });
    expect(
      evaluateDailyAttendanceCompliance('EVENTUAL', [
        'MANANA_INGRESO',
        'MANANA_SALIDA',
        'TARDE_INGRESO',
        'TARDE_SALIDA',
      ])
    ).toMatchObject({
      badgeText: '4/4',
      status: 'Completa',
      isComplete: true,
      percentage: 100,
    });
  });

  it('TC-08 (Acceso Privado, URLs Firmadas y Hora Oficial America/Caracas): Genera Signed URLs con expiración y verifica firma HMAC', () => {
    const secret = 'unit-test-signing-secret';
    const nowMs = 1762956000000; // Timestamp fijo de control
    const signed = createSignedAttendancePhotoUrl({
      recordId: '123e4567-e89b-12d3-a456-426614174000',
      storagePath:
        'asistencia/2026-11-12/STF-018/MANANA_INGRESO_123e4567-e89b-12d3-a456-426614174000.jpg',
      ttlSeconds: 300,
      nowMs,
      secret,
    });

    expect(signed.signedUrl).toContain('/api/checkins/123e4567-e89b-12d3-a456-426614174000/photo?expires=');
    expect(signed.signedUrl).toContain('&sig=');

    // Verificación exitosa dentro de la ventana de vida útil (TTL 300s)
    const validCheck = verifySignedAttendancePhotoUrl({
      recordId: '123e4567-e89b-12d3-a456-426614174000',
      storagePath:
        'asistencia/2026-11-12/STF-018/MANANA_INGRESO_123e4567-e89b-12d3-a456-426614174000.jpg',
      expiresAtEpochMs: signed.expiresAtEpochMs,
      signature: signed.signature,
      nowMs: nowMs + 60_000,
      secret,
    });
    expect(validCheck.valid).toBe(true);

    // Verificación rechazada cuando la URL firmada ha expirado
    const expiredCheck = verifySignedAttendancePhotoUrl({
      recordId: '123e4567-e89b-12d3-a456-426614174000',
      storagePath:
        'asistencia/2026-11-12/STF-018/MANANA_INGRESO_123e4567-e89b-12d3-a456-426614174000.jpg',
      expiresAtEpochMs: signed.expiresAtEpochMs,
      signature: signed.signature,
      nowMs: signed.expiresAtEpochMs + 1000,
      secret,
    });
    expect(expiredCheck.valid).toBe(false);
    expect(expiredCheck.reason).toBe('EXPIRED');

    // Verificación de hora oficial normalizada a America/Caracas (UTC-4)
    const clock = getOfficialServerCaracasTimestamp(new Date('2026-11-12T12:30:00.000Z'));
    expect(clock.fechaCaracas).toBe('2026-11-12');
    expect(clock.horaCaracas24h).toBe('08:30:00');
  });
});
