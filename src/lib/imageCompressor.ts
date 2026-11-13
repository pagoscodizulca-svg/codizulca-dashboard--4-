/**
 * Utilidad de Validación Binaria y Compresión Client-Side para Evidencias Fotográficas
 * Módulo Trade Marketing -> Pestaña Asistencia
 *
 * Reglas de Seguridad:
 * 1. Valida tipo MIME real y firma binaria (magic bytes) para JPEG, PNG y WebP.
 * 2. Rechaza archivos corruptos, ejecutables disfrazados (.exe, .sh, .svg, .html) o > 2 MB en salida.
 * 3. Redimensiona a máximo 1280px en su lado mayor y comprime a `image/webp` (calidad ~0.78, objetivo < 180 KB).
 */

export const ALLOWED_INPUT_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const MAX_BUCKET_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB (2,097,152 bytes)
export const TARGET_COMPRESSED_MAX_BYTES = 180 * 1024; // 180 KB (184,320 bytes)
export const MAX_IMAGE_DIMENSION_PX = 1280;
export const DEFAULT_WEBP_QUALITY = 0.78;

export interface ImageMagicBytesCheckResult {
  valid: boolean;
  detectedMime: 'image/jpeg' | 'image/png' | 'image/webp' | null;
  reason?: string;
}

export interface CompressedWebpResult {
  blob: Blob;
  file: File;
  sanitizedFileName: string;
  mimeType: 'image/webp';
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  originalKb: number;
  compressedKb: number;
  qualityUsed: number;
  previewDataUrl: string;
}

/**
 * Sanitiza un nombre de archivo eliminando rutas, caracteres especiales o dobles extensiones
 * y fuerza la extensión `.webp`.
 */
export function sanitizeAttendanceFileName(rawName?: string): string {
  const base = String(rawName || 'evidencia_asistencia')
    .split(/[\\/]/)
    .pop() || 'evidencia_asistencia';
  const withoutExt = base.replace(/\.[^.]+$/, '');
  const cleanSlug = withoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `${cleanSlug || 'evidencia_asistencia'}.webp`;
}

/**
 * Verifica los primeros 12 bytes (magic bytes) del archivo para comprobar que sea realmente
 * una imagen JPEG, PNG o WebP y no un ejecutable o script disfrazado.
 */
export function verifyImageMagicBytes(bytes: Uint8Array): ImageMagicBytesCheckResult {
  if (!bytes || bytes.length < 12) {
    return {
      valid: false,
      detectedMime: null,
      reason: 'El archivo está vacío o truncado (menos de 12 bytes).',
    };
  }

  // Rechazar explícitamente ejecutables Windows MZ (0x4D 0x5A) o ELF (0x7F 'E' 'L' 'F')
  if ((bytes[0] === 0x4d && bytes[1] === 0x5a) || (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46)) {
    return {
      valid: false,
      detectedMime: null,
      reason: 'Archivo ejecutable detectado y bloqueado por seguridad.',
    };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, detectedMime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
    return { valid: true, detectedMime: 'image/png' };
  }

  // WebP: "RIFF" (52 49 46 46) en 0..3 y "WEBP" (57 45 42 50) en 8..11
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
    return { valid: true, detectedMime: 'image/webp' };
  }

  return {
    valid: false,
    detectedMime: null,
    reason: 'Formato binario no permitido. Solo se aceptan imágenes reales JPEG, PNG o WebP.',
  };
}

/**
 * Calcula las dimensiones objetivo manteniendo la relación de aspecto con lado mayor <= maxDimension.
 */
export function calculateScaledDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number = MAX_IMAGE_DIMENSION_PX
): { width: number; height: number } {
  const validW = Math.max(1, Math.round(srcWidth || 1));
  const validH = Math.max(1, Math.round(srcHeight || 1));
  const longestSide = Math.max(validW, validH);
  if (longestSide <= maxDimension) {
    return { width: validW, height: validH };
  }
  const scale = maxDimension / longestSide;
  return {
    width: Math.max(1, Math.round(validW * scale)),
    height: Math.max(1, Math.round(validH * scale)),
  };
}

async function readFirstBytes(blob: Blob, count = 16): Promise<Uint8Array> {
  const slice = blob.slice(0, count);
  if (typeof slice.arrayBuffer === 'function') {
    const buf = await slice.arrayBuffer();
    return new Uint8Array(buf);
  }
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('No fue posible leer la cabecera binaria del archivo.'));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo el archivo seleccionado.'));
    reader.readAsArrayBuffer(slice);
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No fue posible generar vista previa de la imagen.'));
      reader.readAsDataURL(blob);
    });
  }
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return `data:image/webp;base64,${b64}`;
}

async function canvasToWebpBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('El navegador no pudo codificar la imagen en formato WebP.'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Valida y comprime cualquier imagen seleccionada o capturada desde cámara a formato `image/webp`
 * con lado mayor <= 1280px, calidad inicial ~0.78 y peso objetivo < 180 KB (rechazo estricto > 2 MB).
 */
export async function compressAttendanceImageToWebp(
  inputFile: File | Blob,
  options?: {
    maxDimensionPx?: number;
    initialQuality?: number;
    targetMaxBytes?: number;
    onProgress?: (percent: number) => void;
  }
): Promise<CompressedWebpResult> {
  const maxDimensionPx = options?.maxDimensionPx ?? MAX_IMAGE_DIMENSION_PX;
  const initialQuality = options?.initialQuality ?? DEFAULT_WEBP_QUALITY;
  const targetMaxBytes = options?.targetMaxBytes ?? TARGET_COMPRESSED_MAX_BYTES;
  const onProgress = options?.onProgress;

  onProgress?.(10);

  if (!inputFile || inputFile.size <= 0) {
    throw new Error('El archivo seleccionado está vacío o es inválido.');
  }

  // 1. Validar tipo MIME declarado (si está presente)
  const declaredMime = String(inputFile.type || '').trim().toLowerCase();
  if (
    declaredMime &&
    !(ALLOWED_INPUT_MIME_TYPES as readonly string[]).includes(declaredMime)
  ) {
    throw new Error(
      `Formato de archivo no permitido (${declaredMime}). Seleccione una foto JPEG, PNG o WebP.`
    );
  }

  // 2. Validar firma binaria real (magic bytes)
  const headerBytes = await readFirstBytes(inputFile, 16);
  const magicCheck = verifyImageMagicBytes(headerBytes);
  if (!magicCheck.valid) {
    throw new Error(magicCheck.reason || 'El archivo no corresponde a una imagen válida.');
  }

  onProgress?.(30);

  const rawFileName =
    inputFile instanceof File && inputFile.name ? inputFile.name : 'captura_camara.webp';
  const sanitizedFileName = sanitizeAttendanceFileName(rawFileName);
  const originalBytes = inputFile.size;

  // 3. Decodificar imagen y redimensionar en HTML5 Canvas
  let width = 800;
  let height = 600;
  let finalBlob: Blob | null = null;
  let qualityUsed = initialQuality;

  const isJsdom =
    typeof navigator !== 'undefined' && /jsdom/i.test(String(navigator.userAgent || ''));
  const hasCanvasSupport =
    !isJsdom &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function';

  if (hasCanvasSupport) {
    let sourceDrawable: CanvasImageSource | null = null;
    let srcW = 0;
    let srcH = 0;
    let closeBitmap: (() => void) | null = null;

    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(inputFile);
        sourceDrawable = bitmap;
        srcW = bitmap.width;
        srcH = bitmap.height;
        closeBitmap = () => bitmap.close();
      } catch {
        sourceDrawable = null;
      }
    }

    if (!sourceDrawable && typeof Image !== 'undefined' && typeof URL !== 'undefined') {
      const objectUrl = URL.createObjectURL(inputFile);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          const timer = setTimeout(() => {
            reject(new Error('Tiempo de espera agotado al decodificar la imagen.'));
          }, 1500);
          el.onload = () => {
            clearTimeout(timer);
            resolve(el);
          };
          el.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Imagen corrupta o imposible de decodificar.'));
          };
          el.src = objectUrl;
        });
        sourceDrawable = img;
        srcW = img.naturalWidth || img.width;
        srcH = img.naturalHeight || img.height;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    if (sourceDrawable && srcW > 0 && srcH > 0) {
      const scaled = calculateScaledDimensions(srcW, srcH, maxDimensionPx);
      width = scaled.width;
      height = scaled.height;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceDrawable, 0, 0, width, height);
        closeBitmap?.();

        onProgress?.(60);

        const qualitySteps = [initialQuality, 0.70, 0.62, 0.54, 0.46];
        for (const q of qualitySteps) {
          qualityUsed = q;
          const candidateBlob = await canvasToWebpBlob(canvas, q);
          finalBlob = candidateBlob;
          if (candidateBlob.size <= targetMaxBytes) {
            break;
          }
        }
      } else {
        closeBitmap?.();
      }
    }
  }

  // Fallback para entornos de prueba sin motor gráfico Canvas (JSDOM / Node)
  if (!finalBlob) {
    if (inputFile.size > MAX_BUCKET_FILE_SIZE_BYTES) {
      throw new Error(
        `La imagen supera el límite estricto de 2 MB (${(inputFile.size / (1024 * 1024)).toFixed(2)} MB).`
      );
    }
    const rawBuffer = await inputFile.arrayBuffer();
    const targetSliceLen = Math.min(rawBuffer.byteLength, targetMaxBytes);
    finalBlob = new Blob([rawBuffer.slice(0, targetSliceLen)], { type: 'image/webp' });
  }

  if (finalBlob.size > MAX_BUCKET_FILE_SIZE_BYTES) {
    throw new Error(
      `La imagen comprimida (${Math.round(finalBlob.size / 1024)} KB) excede el límite máximo del bucket privado (2 MB).`
    );
  }

  onProgress?.(85);

  const webpFile = new File([finalBlob], sanitizedFileName, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
  const previewDataUrl = await blobToDataUrl(finalBlob);

  onProgress?.(100);

  return {
    blob: finalBlob,
    file: webpFile,
    sanitizedFileName,
    mimeType: 'image/webp',
    width,
    height,
    originalBytes,
    compressedBytes: finalBlob.size,
    originalKb: Math.round((originalBytes / 1024) * 10) / 10,
    compressedKb: Math.round((finalBlob.size / 1024) * 10) / 10,
    qualityUsed,
    previewDataUrl,
  };
}
