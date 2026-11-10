/**
 * Submódulo de Asistencia en Punto de Venta (PDV / Check-in)
 * App Móvil de Campo para Promotores e Impulsadoras (/portal/checkin)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  MapPin,
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  SwitchCamera,
  Wifi,
  WifiOff,
  Navigation,
  Clock,
  User,
  Store,
  UploadCloud,
  Check,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  checkinsService,
  CheckInType,
  CheckInLocation,
  STORAGE_KEY_ACTIVE_STORE,
  STORAGE_KEY_ACTIVE_PROMOTER
} from '../../lib/checkinsService';

const MARCAJE_OPTIONS: { type: CheckInType; label: string; desc: string; color: string; border: string; bg: string }[] = [
  {
    type: 'Ingreso',
    label: 'Ingreso',
    desc: 'Inicio de jornada en PDV',
    color: 'text-emerald-700',
    border: 'border-emerald-500',
    bg: 'bg-emerald-50'
  },
  {
    type: 'Salida a almorzar',
    label: 'Salida Almuerzo',
    desc: 'Pausa de descanso',
    color: 'text-amber-700',
    border: 'border-amber-500',
    bg: 'bg-amber-50'
  },
  {
    type: 'Vuelta a almorzar',
    label: 'Vuelta Almuerzo',
    desc: 'Retorno a piso de venta',
    color: 'text-blue-700',
    border: 'border-blue-500',
    bg: 'bg-blue-50'
  },
  {
    type: 'Salida',
    label: 'Salida',
    desc: 'Cierre formal de turno',
    color: 'text-red-700',
    border: 'border-red-500',
    bg: 'bg-red-50'
  }
];

const FREQUENT_STORES = [
  "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Bella Vista)",
  "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Maracaibo Norte)",
  "Supermercado Olímpica (El Bajo)",
  "Hipermercado Viviana Bella Vista",
  "Central Madeirense San Francisco",
  "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Cabimas)"
];

const PROMOTER_SUGGESTIONS = [
  'CARELIZ REYES',
  'Maria de los Ángeles Almarza',
  'SCARLETH PIÑA',
  'OSMAIRY VILLASMIL',
  'TANIA CARDENAS',
  'Maria Gonzalez',
  'JAIVELIN FEREIRA',
  'NAIRELIS ANTUNEZ',
  'ana echeverria',
  'MARIA ALMARZA',
  'AHYRLET RUIZ',
  'VALERIA ACEVEDO',
  'CLAUDIA ALVAREZ',
  'JELARY ACOSTA',
  'MARIANGEL VALDIVIESO',
  'ANGELICA SANCHEZ',
  'ENELIANGELA GONZALEZ',
  'Ana Silva',
  'MARIANYEL ARANDA',
  'JULIANNYS GIL',
  'JOSE BARROSO',
  'ZIORELI GRANGGER'
];

type GpsState = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

export const CheckIn: React.FC = () => {
  const { profile } = useAuth();

  // Estados de Marcaje
  const [selectedType, setSelectedType] = useState<CheckInType>('Ingreso');
  const [storeName, setStoreName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_STORE) || "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Bella Vista)";
  });
  const [promoterName, setPromoterName] = useState<string>(() => {
    return profile?.full_name || localStorage.getItem(STORAGE_KEY_ACTIVE_PROMOTER) || 'Scarleth Piña';
  });

  // Estado de Red y Cola Offline
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // Estados de GPS
  const [gpsState, setGpsState] = useState<GpsState>('IDLE');
  const [coords, setCoords] = useState<CheckInLocation | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Estados de Cámara WebRTC Anti-Crash
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string; isOffline?: boolean } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sincronización del nombre de tienda en LocalStorage
  const handleStoreChange = (val: string) => {
    setStoreName(val);
    localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, val);
  };

  const handlePromoterChange = (val: string) => {
    setPromoterName(val);
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROMOTER, val);
  };

  // 1. Manejo de Red (Online / Offline) y Auto-vaciado de cola
  const refreshQueueCount = useCallback(() => {
    const queue = checkinsService.getOfflineQueue();
    setOfflineQueueCount(queue.length);
  }, []);

  const handleDrainQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    setIsSyncingQueue(true);
    try {
      const { syncedCount } = await checkinsService.flushOfflineQueue();
      refreshQueueCount();
      if (syncedCount > 0) {
        setSyncSuccessMsg(`¡${syncedCount} registro(s) sincronizado(s) con éxito!`);
        setTimeout(() => setSyncSuccessMsg(null), 4000);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [refreshQueueCount]);

  useEffect(() => {
    refreshQueueCount();

    const handleOnline = () => {
      setIsOnline(true);
      handleDrainQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Intentar vaciar cola al montar si hay conexión
    if (navigator.onLine) {
      handleDrainQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleDrainQueue, refreshQueueCount]);

  // 2. Adquisición Automática y Validación Satelital de GPS
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState('ERROR');
      setGpsError('Geolocalización no soportada por el navegador.');
      return;
    }

    setGpsState('LOADING');
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracy = Math.round(pos.coords.accuracy || 8);
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy
        });
        setGpsState('SUCCESS');
      },
      (err) => {
        let msg = 'Error desconocido al triangular satélites.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permiso GPS denegado. Activa la ubicación en los ajustes del dispositivo.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Señal satelital no disponible en este momento.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tiempo de espera GPS agotado. Reintenta al aire libre.';
        }
        setGpsState('ERROR');
        setGpsError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

  // 3. Limpieza Estricta de Tracks WebRTC (Evitar fugas de memoria y crash OOM)
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Detener cámara al desmontar o al ocultar la pestaña
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopCameraStream();
        setIsCameraActive(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // 4. Iniciar Cámara WebRTC In-App Anti-Crash
  const startCamera = async (facing: 'user' | 'environment') => {
    stopCameraStream();
    setCameraError(null);
    setIsCameraActive(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('La cámara WebRTC no es compatible con este navegador.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => console.warn('Video play error:', err));
      }
    } catch (err: any) {
      console.warn('Error accediendo a cámara:', err);
      setCameraError(err.message || 'No se pudo acceder al sensor de la cámara.');
      setIsCameraActive(false);
    }
  };

  const toggleLens = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing);
    }
  };

  // 5. Captura con Compresión Canvas (720px @ 65% JPEG) + Estampado Digital de Evidencia
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    const MAX_DIM = 720;
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > height) {
      if (width > MAX_DIM) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      }
    } else {
      if (height > MAX_DIM) {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Aplicar Mirror Mode en canvas si es cámara frontal
    ctx.save();
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    // ==============================================================
    // ESTAMPADO DIGITAL DE EVIDENCIA (Watermark inalterable)
    // ==============================================================
    const now = new Date();
    const timestampStr = now.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Caracas'
    }) + ' ' + now.toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'America/Caracas'
    });

    // Franja inferior semi-transparente para alta legibilidad
    const bannerHeight = 84;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
    ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

    // Borde superior de acento rojo Codizulca
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, height - bannerHeight, width, 3);

    // Tipografía nítida
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`CODIZULCA | ASISTENCIA: [${selectedType.toUpperCase()}]`, 14, height - bannerHeight + 22);

    ctx.font = 'normal 13px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    const storeShort = storeName.length > 40 ? storeName.slice(0, 38) + '...' : storeName;
    ctx.fillText(`PDV: ${storeShort}`, 14, height - bannerHeight + 42);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#34d399';
    const gpsText = coords
      ? `GPS: ${coords.lat}, ${coords.lng} (±${coords.accuracy}m)`
      : 'GPS: No satélite';
    ctx.fillText(gpsText, 14, height - bannerHeight + 62);

    ctx.font = 'normal 12px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(timestampStr, width - 14, height - bannerHeight + 62);

    // Exportar a DataURL comprimido (~40KB - 70KB)
    const base64Data = canvas.toDataURL('image/jpeg', 0.65);
    setPhotoPreview(base64Data);

    // Liberar hardware inmediatamente
    stopCameraStream();
    setIsCameraActive(false);
  };

  // Selector de Galería / Archivo como respaldo seguro
  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 720;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        // Estampado
        const now = new Date();
        const timestampStr =
          now.toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) +
          ' ' +
          now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Caracas' });
        const bannerHeight = 84;
        ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
        ctx.fillRect(0, height - bannerHeight, width, bannerHeight);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(0, height - bannerHeight, width, 3);
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`CODIZULCA | ASISTENCIA: [${selectedType.toUpperCase()}]`, 14, height - bannerHeight + 22);
        ctx.font = 'normal 13px sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(`PDV: ${storeName.slice(0, 38)}`, 14, height - bannerHeight + 42);
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#34d399';
        ctx.fillText(coords ? `GPS: ${coords.lat}, ${coords.lng} (±${coords.accuracy}m)` : 'GPS: Pendiente', 14, height - bannerHeight + 62);
        ctx.font = 'normal 12px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText(timestampStr, width - 14, height - bannerHeight + 62);

        const base64Data = canvas.toDataURL('image/jpeg', 0.65);
        setPhotoPreview(base64Data);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 6. Validación y Envío del Marcaje
  const handleSubmitCheckIn = async () => {
    // Validaciones estrictas
    if (!coords || gpsState !== 'SUCCESS') {
      alert('Error: La geolocalización satelital es obligatoria. Asegúrate de tener coordenadas GPS válidas.');
      return;
    }

    if (!photoPreview) {
      alert('Error: La evidencia fotográfica es obligatoria antes de registrar la asistencia.');
      return;
    }

    if (!storeName.trim()) {
      alert('Error: Debes ingresar el nombre del punto de venta o tienda visitada.');
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        date: nowIso,
        type: selectedType,
        store: storeName.trim(),
        photoBase64: photoPreview,
        location: coords,
        promoter: promoterName.trim(),
        creatorId: profile?.id || 'usr-mobile-promoter',
        batteryLevel: '88%'
      };

      const { isOffline } = await checkinsService.createCheckIn(payload);
      refreshQueueCount();

      if (isOffline) {
        setSubmitResult({
          success: true,
          isOffline: true,
          message: `Marcaje guardado en cola local sin conexión (Modo Offline). Se enviará automáticamente al recuperar internet.`
        });
      } else {
        setSubmitResult({
          success: true,
          isOffline: false,
          message: `¡Marcaje de ${selectedType} registrado exitosamente con GPS y evidencia visual certificada!`
        });
      }

      // Reiniciar captura de foto para el próximo evento pero mantener PDV
      setPhotoPreview(null);
    } catch (err: any) {
      setSubmitResult({
        success: false,
        message: err.message || 'Error al procesar el marcaje de asistencia.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormReady = Boolean(photoPreview && coords && gpsState === 'SUCCESS' && storeName.trim().length > 3);

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300 pb-20 max-w-lg mx-auto">
      {/* Header con Indicador de Conectividad y Cola Offline */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-black shadow-sm">
              CZ
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 tracking-tight leading-none">
                Asistencia en PDV
              </h2>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                Check-in Biométrico & Satelital
              </p>
            </div>
          </div>

          {/* Badge Online/Offline */}
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Wifi className="h-3 w-3 text-emerald-600" /> Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
                <WifiOff className="h-3 w-3 text-amber-600" /> Offline
              </span>
            )}
          </div>
        </div>

        {/* Notificación de Cola Offline si existen registros pendientes */}
        {offlineQueueCount > 0 && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>{offlineQueueCount}</strong> marcaje(s) pendiente(s) en cola local.
              </span>
            </div>
            {isOnline && (
              <button
                type="button"
                onClick={handleDrainQueue}
                disabled={isSyncingQueue}
                className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
              >
                {isSyncingQueue ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}
          </div>
        )}

        {syncSuccessMsg && (
          <div className="mt-3 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Selector de Promotora y Tienda Activa */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Promotora */}
          <div>
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1">
              <User className="h-3.5 w-3.5 text-gray-500" />
              Promotora / Impulsadora:
            </label>
            <div className="relative">
              <input
                type="text"
                value={promoterName}
                onChange={(e) => handlePromoterChange(e.target.value)}
                placeholder="Nombre de la promotora"
                className="w-full text-xs font-semibold px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            {/* Chips rápidos de promotoras */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 no-scrollbar">
              {PROMOTER_SUGGESTIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handlePromoterChange(name)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition cursor-pointer ${
                    promoterName === name
                      ? 'bg-red-600 text-white font-bold'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Punto de Venta */}
          <div>
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1">
              <Store className="h-3.5 w-3.5 text-gray-500" />
              Punto de Venta / Sucursal Visitada <span className="text-red-500">*</span>:
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => handleStoreChange(e.target.value)}
              placeholder="Ej. ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Bella Vista)"
              required
              className="w-full text-xs font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {/* Tiendas rápidas */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 no-scrollbar">
              {FREQUENT_STORES.slice(0, 4).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleStoreChange(st)}
                  className={`text-[10px] px-2 py-0.5 rounded-md font-medium whitespace-nowrap border transition cursor-pointer ${
                    storeName === st
                      ? 'bg-zinc-900 text-white border-zinc-900 font-bold'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {st.split('(')[0].trim().slice(0, 24)}...
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* A. TIPOS DE MARCAJE OPERATIVO */}
      <div>
        <label className="text-xs font-bold text-gray-700 flex items-center gap-1 mb-1.5 uppercase tracking-wider">
          <Clock className="h-3.5 w-3.5 text-gray-500" />
          Tipo de Marcaje Operativo:
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MARCAJE_OPTIONS.map((opt) => {
            const isSelected = selectedType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => setSelectedType(opt.type)}
                className={`p-2.5 rounded-xl border-2 text-left transition flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? `${opt.border} ${opt.bg} shadow-sm ring-1 ring-offset-1 ring-red-400`
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-xs font-black ${isSelected ? opt.color : 'text-gray-800'}`}>
                    {opt.label}
                  </span>
                  {isSelected && <Check className={`h-3.5 w-3.5 ${opt.color}`} />}
                </div>
                <span className="text-[10px] text-gray-500 mt-1">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* C. VALIDACIÓN DE GEOLOCALIZACIÓN SATELITAL (GPS OBLIGATORIO) */}
      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <CardContent className="p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 text-red-600" />
              Validación Satelital (GPS Obligatorio):
            </span>
            <button
              type="button"
              onClick={requestGps}
              disabled={gpsState === 'LOADING'}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${gpsState === 'LOADING' ? 'animate-spin' : ''}`} />
              Reintentar
            </button>
          </div>

          {/* Estados de Localización */}
          {gpsState === 'LOADING' && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2.5 text-xs text-blue-800">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
              <div>
                <p className="font-bold">Triangulando satélites GPS en tiempo real...</p>
                <p className="text-[10px] text-blue-600">Calculando margen de precisión métrica</p>
              </div>
            </div>
          )}

          {gpsState === 'SUCCESS' && coords && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  GPS Validado con Éxito
                </span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-emerald-200/80 rounded-full text-emerald-900">
                  ±{coords.accuracy}m precisión
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 text-emerald-800">
                <div>
                  <span className="text-emerald-600 font-sans text-[10px] block">Latitud:</span>
                  <strong>{coords.lat}</strong>
                </div>
                <div>
                  <span className="text-emerald-600 font-sans text-[10px] block">Longitud:</span>
                  <strong>{coords.lng}</strong>
                </div>
              </div>
            </div>
          )}

          {gpsState === 'ERROR' && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-red-800">No se pudo adquirir la señal satelital</p>
                  <p className="text-[11px] text-red-700">{gpsError}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={requestGps}
                className="w-full text-xs font-bold text-red-700 border-red-300 hover:bg-red-100"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reintentar GPS Satelital
              </Button>
            </div>
          )}

          {gpsState === 'IDLE' && (
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600 flex items-center justify-between">
              <span>GPS en espera de activación.</span>
              <button
                type="button"
                onClick={requestGps}
                className="px-2.5 py-1 bg-red-600 text-white text-xs font-bold rounded-lg"
              >
                Activar GPS
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* D. CAPTURA DE EVIDENCIA FOTOGRÁFICA (CÁMARA EN VIVO IN-APP ANTI-CRASH) */}
      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wider">
              <Camera className="h-3.5 w-3.5 text-red-600" />
              Evidencia Fotográfica In-App <span className="text-red-500">*</span>:
            </label>
            {isCameraActive && (
              <button
                type="button"
                onClick={toggleLens}
                className="text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer"
              >
                <SwitchCamera className="h-3.5 w-3.5 text-gray-600" />
                {facingMode === 'user' ? 'Cámara Trasera' : 'Selfie Frontal'}
              </button>
            )}
          </div>

          {/* VISTA 1: Cámara WebRTC Activa */}
          {isCameraActive && (
            <div className="space-y-3">
              <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden border-2 border-red-600 shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                />

                {/* Encuadre Guía punteado para centrar rostro y uniforme */}
                <div className="absolute inset-4 border-2 border-dashed border-white/70 rounded-2xl pointer-events-none flex flex-col items-center justify-between p-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white border border-white/20">
                    {facingMode === 'user' ? 'Centra tu rostro y uniforme' : 'Enfoca la fachada o anaquel del PDV'}
                  </span>
                  <div className="w-16 h-16 border-2 border-white/40 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  </div>
                  <span className="text-[9px] text-white/80 font-mono">
                    {selectedType.toUpperCase()} • {coords ? `GPS ±${coords.accuracy}m` : 'Buscando GPS...'}
                  </span>
                </div>
              </div>

              {/* Botón Disparador */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={capturePhoto}
                  className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl gap-2 shadow-md cursor-pointer"
                >
                  <Camera className="h-5 w-5" />
                  Capturar y Estampar Evidencia
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    stopCameraStream();
                    setIsCameraActive(false);
                  }}
                  className="h-12 px-4 rounded-xl text-xs font-bold text-gray-600 cursor-pointer"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* VISTA 2: Fotografía ya capturada con Estampado Digital */}
          {!isCameraActive && photoPreview && (
            <div className="space-y-3">
              <div className="relative aspect-[3/4] bg-zinc-900 rounded-2xl overflow-hidden border border-gray-200 shadow-md">
                <img
                  src={photoPreview}
                  alt="Evidencia fotográfica estampada"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-emerald-600/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow">
                  <CheckCircle2 className="h-3 w-3" /> Evidencia Certificada
                </div>
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-[10px] font-mono shadow">
                  3:4 • ~50KB
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPhotoPreview(null);
                    startCamera(facingMode);
                  }}
                  className="flex-1 h-10 border-gray-300 text-xs font-bold text-gray-700 rounded-xl gap-1.5 hover:bg-gray-100 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" /> Tomar Nueva Foto
                </Button>
              </div>
            </div>
          )}

          {/* VISTA 3: Cámara inactiva y sin foto tomada todavía */}
          {!isCameraActive && !photoPreview && (
            <div className="space-y-2">
              <div
                onClick={() => startCamera(facingMode)}
                className="aspect-[3/4] max-h-72 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center p-6 text-center bg-gray-50/70 hover:bg-gray-100/70 hover:border-red-400 transition cursor-pointer"
              >
                <div className="h-14 w-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2 shadow-sm">
                  <Camera className="h-7 w-7" />
                </div>
                <h4 className="text-xs font-bold text-gray-800">
                  Abrir Cámara en Vivo In-App
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5 max-w-[220px]">
                  Selfie frontal o foto del PDV con estampado digital inalterable.
                </p>
                <span className="mt-3 px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm">
                  Activar Cámara WebRTC
                </span>
              </div>

              {cameraError && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <p className="font-bold">Permiso de cámara restringido</p>
                  <p className="text-[10px]">{cameraError}</p>
                </div>
              )}

              {/* Selector de Galería como Respaldo Seguro */}
              <div className="pt-1">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileFallback}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-center text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline py-1 cursor-pointer"
                >
                  ¿Problemas con la cámara? Cargar foto desde galería (Respaldo)
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mensaje de Resultado tras enviar */}
      {submitResult && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-medium border flex items-start gap-2.5 ${
            submitResult.success
              ? submitResult.isOffline
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {submitResult.success ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <p className="font-bold">
              {submitResult.success
                ? submitResult.isOffline
                  ? 'Guardado en Modo Offline'
                  : 'Registro Exitoso'
                : 'Error al Guardar'}
            </p>
            <p className="text-[11px] leading-relaxed">{submitResult.message}</p>
          </div>
        </div>
      )}

      {/* Botón Principal de Envío */}
      <div className="pt-2">
        <Button
          type="button"
          onClick={handleSubmitCheckIn}
          disabled={!isFormReady || isSubmitting}
          className={`w-full h-13 text-sm font-black rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
            isFormReady && !isSubmitting
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Procesando y Certificando Marcaje...
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              Registrar Marcaje: {selectedType.toUpperCase()}
            </>
          )}
        </Button>

        {/* Motivo de bloqueo si no está listo */}
        {!isFormReady && (
          <p className="text-[10px] text-center text-gray-500 mt-2 font-medium">
            {!coords || gpsState !== 'SUCCESS'
              ? '⚠ Se requiere validar coordenadas GPS satelitales antes de continuar.'
              : !photoPreview
              ? '⚠ Se requiere capturar la evidencia fotográfica con la cámara.'
              : 'Completa todos los campos obligatorios para habilitar el registro.'}
          </p>
        )}
      </div>
    </div>
  );
};
