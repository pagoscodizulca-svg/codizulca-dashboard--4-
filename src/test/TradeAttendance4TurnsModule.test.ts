import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  verifyImageMagicBytes,
  calculateScaledDimensions,
  sanitizeAttendanceFileName,
  compressAttendanceImageToWebp,
  MAX_BUCKET_FILE_SIZE_BYTES,
  TARGET_COMPRESSED_MAX_BYTES,
} from '../lib/imageCompressor';
import {
  buildTradeAttendanceStoragePath,
  isValidTradeAttendanceStoragePath,
  applyAtomicTurnoUpdate,
  calculateWorkedHoursSummary,
  evaluateTurnoSequenceCoherence,
  normalizeCedula,
  deterministicUuidFromSeed,
  tradeAttendanceService,
  TRADE_ASISTENCIA_BUCKET,
  SIGNED_URL_EXPIRY_SECONDS,
} from '../lib/tradeAttendanceService';

function createValidJpegFile(name = 'captura_camara.jpg', sizeBytes = 24000): File {
  const bytes = new Uint8Array(Math.max(16, sizeBytes));
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  for (let i = 4; i < bytes.length; i++) {
    bytes[i] = (i * 31) & 0xff;
  }
  return new File([bytes], name, { type: 'image/jpeg' });
}

function createFakeExeDisguisedAsJpeg(): File {
  const bytes = new Uint8Array(64);
  // Cabecera Windows PE/EXE: 'M' 'Z' (0x4D 0x5A)
  bytes[0] = 0x4d;
  bytes[1] = 0x5a;
  return new File([bytes], 'malware_disfrazado.jpg', { type: 'image/jpeg' });
}

describe('Módulo Trade Marketing -> Pestaña Asistencia (4 Turnos Fotográficos, Storage Privado y RPC)', () => {
  it('Fase 1: Verifica que la migración SQL 009 implemente tablas, bucket privado trade-asistencia-fotos (2 MB), RLS y RPC transaccional', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '009_trade_asistencia_4turnos_rls.sql'
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.trade_promotoras');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.trade_asistencia_jornadas');
    expect(sql).toContain('UNIQUE (promotora_id, fecha_jornada)');
    expect(sql).toContain("AT TIME ZONE 'America/Caracas'");
    expect(sql).toContain('marcajes_completados SMALLINT GENERATED ALWAYS AS');
    expect(sql).toContain("'trade-asistencia-fotos'");
    expect(sql).toContain('2097152'); // 2 MB
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_registrar_turno_asistencia_trade');
    expect(sql).toContain('TO authenticated');
    expect(sql).not.toContain('auth.role()');
  });

  it('Fase 2.1: imageCompressor valida magic bytes reales, rechaza ejecutables disfrazados y comprime a WebP (< 180 KB, <= 1280px)', async () => {
    // Escala proporcional a máximo 1280px
    expect(calculateScaledDimensions(2560, 1920, 1280)).toEqual({ width: 1280, height: 960 });
    expect(calculateScaledDimensions(900, 1200, 1280)).toEqual({ width: 900, height: 1200 });

    // Sanitización de nombre de archivo y prevención de path traversal
    expect(sanitizeAttendanceFileName('../../etc/passwd/Foto Mañana #1.JPG')).toBe(
      'Foto_Manana_1.webp'
    );

    // Rechazo de ejecutable MZ disfrazado con MIME image/jpeg
    const fakeExe = createFakeExeDisguisedAsJpeg();
    await expect(compressAttendanceImageToWebp(fakeExe)).rejects.toThrow(/ejecutable|Formato/i);

    // Compresión exitosa de imagen JPEG real a image/webp (< 180 KB y <= 2 MB)
    const validJpeg = createValidJpegFile('evidencia_entrada.jpg', 48000);
    const compressed = await compressAttendanceImageToWebp(validJpeg);
    expect(compressed.mimeType).toBe('image/webp');
    expect(compressed.sanitizedFileName).toBe('evidencia_entrada.webp');
    expect(compressed.compressedBytes).toBeLessThanOrEqual(TARGET_COMPRESSED_MAX_BYTES);
    expect(compressed.compressedBytes).toBeLessThanOrEqual(MAX_BUCKET_FILE_SIZE_BYTES);
  });

  it('Fase 2.2: Construye la ruta obligatoria en Storage {anio}/{mes}/{fecha_jornada}/{tipo_promotora}/{promotora_id}/{turno}_{timestamp}.webp', () => {
    const promotoraUuid = deterministicUuidFromSeed('STF-004');
    const pathFija = buildTradeAttendanceStoragePath({
      fechaJornada: '2026-11-13',
      tipoPromotora: 'fija',
      promotoraId: promotoraUuid,
      turno: 'manana_entrada',
      timestampMs: 1763049600000,
    });

    expect(pathFija).toBe(
      `2026/11/2026-11-13/fija/${promotoraUuid}/manana_entrada_1763049600000.webp`
    );
    expect(isValidTradeAttendanceStoragePath(pathFija)).toBe(true);
    expect(TRADE_ASISTENCIA_BUCKET).toBe('trade-asistencia-fotos');
    expect(SIGNED_URL_EXPIRY_SECONDS).toBe(3600);
  });

  it('Fase 2.3: Actualización atómica por ranura (1..4) sin sobrescribir otros turnos y cálculo exacto de horas trabajadas', () => {
    const promotora = {
      id: deterministicUuidFromSeed('STF-018'),
      tipo_promotora: 'eventual' as const,
      punto_venta_habitual: 'ALKOSTO BELLA VISTA',
      zona: 'MARACAIBO',
      cliente_habitual_id: null,
    };
    const fecha = '2026-11-13';

    // Turno 1: Mañana Entrada (08:00 AM Caracas -> 12:00 UTC)
    const t1 = applyAtomicTurnoUpdate({
      existingJornada: null,
      promotora,
      fechaJornada: fecha,
      turno: 'manana_entrada',
      storagePath: `2026/11/${fecha}/eventual/${promotora.id}/manana_entrada_1001.webp`,
      serverNowIso: '2026-11-13T12:00:00.000Z',
    });
    expect(t1.updatedJornada.marcajes_completados).toBe(1);
    expect(t1.updatedJornada.estado_jornada).toBe('en_progreso');

    // Turno 2: Mañana Salida (12:00 PM Caracas -> 16:00 UTC)
    const t2 = applyAtomicTurnoUpdate({
      existingJornada: t1.updatedJornada,
      promotora,
      fechaJornada: fecha,
      turno: 'manana_salida',
      storagePath: `2026/11/${fecha}/eventual/${promotora.id}/manana_salida_1002.webp`,
      serverNowIso: '2026-11-13T16:00:00.000Z',
    });
    expect(t2.updatedJornada.marcajes_completados).toBe(2);
    expect(t2.updatedJornada.foto_manana_entrada_path).toContain('manana_entrada_1001.webp');
    expect(t2.updatedJornada.foto_manana_salida_path).toContain('manana_salida_1002.webp');

    // Turno 3: Tarde Entrada (02:00 PM Caracas -> 18:00 UTC)
    const t3 = applyAtomicTurnoUpdate({
      existingJornada: t2.updatedJornada,
      promotora,
      fechaJornada: fecha,
      turno: 'tarde_entrada',
      storagePath: `2026/11/${fecha}/eventual/${promotora.id}/tarde_entrada_1003.webp`,
      serverNowIso: '2026-11-13T18:00:00.000Z',
    });
    expect(t3.updatedJornada.marcajes_completados).toBe(3);

    // Turno 4: Tarde Salida (05:30 PM Caracas -> 21:30 UTC)
    const t4 = applyAtomicTurnoUpdate({
      existingJornada: t3.updatedJornada,
      promotora,
      fechaJornada: fecha,
      turno: 'tarde_salida',
      storagePath: `2026/11/${fecha}/eventual/${promotora.id}/tarde_salida_1004.webp`,
      serverNowIso: '2026-11-13T21:30:00.000Z',
    });
    expect(t4.updatedJornada.marcajes_completados).toBe(4);
    expect(t4.updatedJornada.estado_jornada).toBe('completa');

    // Verificar que las 4 ranuras coexisten intactas
    expect(t4.updatedJornada.foto_manana_entrada_path).toContain('manana_entrada_1001.webp');
    expect(t4.updatedJornada.foto_manana_salida_path).toContain('manana_salida_1002.webp');
    expect(t4.updatedJornada.foto_tarde_entrada_path).toContain('tarde_entrada_1003.webp');
    expect(t4.updatedJornada.foto_tarde_salida_path).toContain('tarde_salida_1004.webp');

    // Verificar cálculo de horas: 4h 00m (AM) + 3h 30m (PM) = 7h 30m
    const hours = calculateWorkedHoursSummary(t4.updatedJornada);
    expect(hours.morningMinutes).toBe(240);
    expect(hours.afternoonMinutes).toBe(210);
    expect(hours.totalMinutes).toBe(450);
    expect(hours.formattedTotal).toBe('7h 30m');
  });

  it('Fase 2.4: Detecta salto de turno previo y exige observación justificativa (ej. salida sin entrada o media jornada)', async () => {
    expect(normalizeCedula(' v - 25 123 456 ')).toBe('V-25123456');

    const checkExitWithoutEntry = evaluateTurnoSequenceCoherence(null, 'manana_salida');
    expect(checkExitWithoutEntry.requiresObservation).toBe(true);
    expect(checkExitWithoutEntry.isBlockExitWithoutEntry).toBe(true);

    const checkAfternoonOnly = evaluateTurnoSequenceCoherence(null, 'tarde_entrada');
    expect(checkAfternoonOnly.requiresObservation).toBe(true);

    const promotora = (await tradeAttendanceService.listPromotoras())[0];
    const validFile = createValidJpegFile('tarde_entrada.jpg', 18000);

    // Debe rechazar si intenta iniciar en tarde_entrada sin bloque mañana y sin observación
    await expect(
      tradeAttendanceService.uploadTurnoAttendancePhoto({
        promotora,
        fechaJornada: '2026-11-13',
        turno: 'tarde_entrada',
        file: validFile,
        puntoVenta: 'EVENTO ESPECIAL TARDE',
        observaciones: '',
        existingJornada: null,
      })
    ).rejects.toThrow(/observaci[oó]n/i);

    // Debe aceptar y marcar 'parcial_justificada' cuando se incluye observación justificativa
    const uploaded = await tradeAttendanceService.uploadTurnoAttendancePhoto({
      promotora,
      fechaJornada: '2026-11-13',
      turno: 'tarde_entrada',
      file: validFile,
      puntoVenta: 'EVENTO ESPECIAL TARDE',
      observaciones: 'Media jornada vespertina autorizada por coordinación',
      existingJornada: null,
    });
    expect(uploaded.jornada.estado_jornada).toBe('parcial_justificada');
    expect(uploaded.jornada.marcajes_completados).toBe(1);
  });
});
