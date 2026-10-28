import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin,
  Camera,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Navigation,
  Clock,
  Check,
  ShieldCheck,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import {
  CheckinPayload,
  FREQUENT_STORES,
  campoService,
  resolvePromoterNameFromRaw
} from '../../lib/campoService';
import {
  checkinsService,
  CheckInRecord,
  getCaracasDayKey,
  STORAGE_KEY_ACTIVE_STORE,
  isMerchandisingRoutePromoter,
  resolveStoreByGpsIfGenericDefault,
} from '../../lib/checkinsService';
import { CampoStoreSelector } from '../../components/mobile/CampoStoreSelector';
import {
  trazabilidadService,
  formatCoordinatesDMS,
  reverseGeocodeCoordinates,
  fetchClientNetworkInfo,
  detectRealBrowserAndOs
} from '../../lib/trazabilidadService';

export const CampoAsistencia: React.FC<{ activePromoterName?: string }> = ({
  activePromoterName
}) => {
  const [storeName, setStoreName] = useState<string>(FREQUENT_STORES[0]);
  const [checkInType, setCheckInType] = useState<CheckinPayload['type']>('Ingreso');
  
  // Estados de GPS estricto
  const [gpsLocation, setGpsLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
    error?: string;
  } | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Estados de Cámara WebRTC In-App Anti-Crash
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [isOfflineSaved, setIsOfflineSaved] = useState<boolean>(false);
  const [todayCheckIns, setTodayCheckIns] = useState<CheckInRecord[]>([]);
  const [isSyncingToday, setIsSyncingToday] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeFileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);

  const syncTodayAttendance = useCallback(async () => {
    setIsSyncingToday(true);
    try {
      await checkinsService.flushOfflineQueue();
      const all = await checkinsService.getAllCheckIns(true);
      const activeProfile = campoService.getActivePromoter();
      const canonicalMe = resolvePromoterNameFromRaw(
        activePromoterName || activeProfile.name,
        activeProfile.email || activeProfile.id
      ).toUpperCase();
      const todayKey = getCaracasDayKey(new Date().toISOString());
      const mineToday = all.filter((c) => {
        const cPromoter = resolvePromoterNameFromRaw(c.promoter, c.creatorId).toUpperCase();
        return getCaracasDayKey(c.date) === todayKey && cPromoter === canonicalMe;
      });
      const isRouteMerch = isMerchandisingRoutePromoter(canonicalMe, activeProfile.role || activeProfile.email);
      setTodayCheckIns(mineToday);
      if (!isRouteMerch) {
        if (mineToday.length > 0 && mineToday[0].store) {
          setStoreName(mineToday[0].store);
        }
        const order: Array<CheckinPayload['type']> = [
          'Ingreso',
          'Salida a almorzar',
          'Vuelta a almorzar',
          'Salida'
        ];
        const firstMissing = order.find((t) => !mineToday.some((m) => m.type === t));
        if (firstMissing) {
          setCheckInType(firstMissing);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsSyncingToday(false);
    }
  }, [activePromoterName]);

  useEffect(() => {
    syncTodayAttendance();
  }, [syncTodayAttendance]);

  // 1. CAPTURA DE GPS EN TIEMPO REAL CON PRECISIÓN ESTRICTA + FALLBACK INTERIORES (iOS / Android)
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('La geolocalización no está soportada en este navegador.');
      return;
    }

    setIsCapturingGps(true);
    setGpsError(null);

    const onSuccess = (pos: GeolocationPosition) => {
      const coords = {
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        accuracy: Math.round(pos.coords.accuracy || 15)
      };
      setGpsLocation(coords);
      setStoreName((prev) => {
        const resolved = resolveStoreByGpsIfGenericDefault(prev, coords);
        if (resolved.resolvedByGps) {
          try {
            localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, resolved.store);
          } catch {}
          return resolved.store;
        }
        return prev;
      });
      setIsCapturingGps(false);
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        // Si falla el bloqueo satelital en interiores (techo metálico en supermercados en iOS/Android), reintenta con triangulación Wi-Fi / Red Celular
        if (err.code === 2 || err.code === 3) {
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            (errFallback) => {
              let msg = 'No se pudo obtener la ubicación GPS.';
              if (errFallback.code === 1) msg = 'Permiso de ubicación denegado. Actívalo en Ajustes de tu teléfono.';
              if (errFallback.code === 2) msg = 'Señal de ubicación no disponible en este momento.';
              if (errFallback.code === 3) msg = 'Tiempo de espera de GPS agotado. Presiona Reintentar.';
              setGpsError(msg);
              setIsCapturingGps(false);
            },
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 60000
            }
          );
          return;
        }
        let msg = 'No se pudo obtener la ubicación GPS.';
        if (err.code === 1) msg = 'Permiso de ubicación denegado. Actívalo en Ajustes de tu teléfono.';
        setGpsError(msg);
        setIsCapturingGps(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 15000
      }
    );
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

  // 2. CÁMARA WEBRTC IN-APP ANTI-CRASH (OPTIMIZADA PARA ANDROID & iOS SAFARI)
  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    releaseStream();
    setIsCameraActive(false);
  }, [releaseStream]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      nativeFileInputRef.current?.click();
      return;
    }
    try {
      releaseStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 720 },
          height: { ideal: 960 }
        },
        audio: false
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Error al iniciar WebRTC con restricciones ideales:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fallbackStream;
        setIsCameraActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.play().catch(() => {});
        }
      } catch (e2) {
        // Fallback automático a cámara nativa de iOS / Android si WebRTC está bloqueado
        nativeFileInputRef.current?.click();
      }
    }
  }, [facingMode, releaseStream]);

  useEffect(() => {
    if (isCameraActive) {
      startCamera();
    }
    return () => {
      releaseStream();
    };
  }, [facingMode, isCameraActive, startCamera, releaseStream]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Fallback universal para cámara nativa de iOS / Android con compresión y estampado digital
  const handleNativePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingPhoto(true);

    const reader = new FileReader();
    reader.onload = (event) => {
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
          if (!ctx) return;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const now = new Date();
          const dateStr = now.toLocaleDateString('es-VE') + ' • ' + now.toLocaleTimeString('es-VE', { hour12: true });
          const gpsStr = gpsLocation
            ? `GPS: ${gpsLocation.lat}, ${gpsLocation.lng} (±${gpsLocation.accuracy || 10}m)`
            : 'GPS: PENDIENTE DE SATÉLITE';

          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(0, canvas.height - 65, canvas.width, 65);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, canvas.height - 65, canvas.width, 3);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 15px sans-serif';
          ctx.fillText(`CODIZULCA ASISTENCIA • [${checkInType.toUpperCase()}]`, 14, canvas.height - 40);
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`${storeName.slice(0, 32)} • ${dateStr}`, 14, canvas.height - 22);
          ctx.fillStyle = '#d4d4d8';
          ctx.font = '11px monospace';
          ctx.fillText(gpsStr, 14, canvas.height - 8);

          const jpegUrl = canvas.toDataURL('image/jpeg', 0.65);
          setSelfieDataUrl(jpegUrl);
          stopCamera();
        } finally {
          setIsProcessingPhoto(false);
          if (nativeFileInputRef.current) nativeFileInputRef.current.value = '';
        }
      };
      img.onerror = () => setIsProcessingPhoto(false);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => setIsProcessingPhoto(false);
    reader.readAsDataURL(file);
  };

  // Capturar selfie con compresión en Canvas a 720px y estampado digital
  const handleCaptureSelfie = () => {
    const video = videoRef.current;
    if (!video) return;

    setIsProcessingPhoto(true);

    try {
      const canvas = document.createElement('canvas');
      const TARGET_WIDTH = 720;
      const vWidth = video.videoWidth || 720;
      const vHeight = video.videoHeight || 960;
      const TARGET_HEIGHT = Math.round((vHeight / vWidth) * TARGET_WIDTH);

      canvas.width = TARGET_WIDTH;
      canvas.height = TARGET_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Si es cámara frontal, aplica efecto espejo
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Revertir transformación para texto de estampado
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      // ESTAMPADO DIGITAL DE EVIDENCIA EN LA FOTO
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-VE') + ' • ' + now.toLocaleTimeString('es-VE', { hour12: true });
      const gpsStr = gpsLocation
        ? `GPS: ${gpsLocation.lat}, ${gpsLocation.lng} (±${gpsLocation.accuracy || 10}m)`
        : 'GPS: PENDIENTE DE SATÉLITE';

      // Franja inferior semi-transparente
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, canvas.height - 65, canvas.width, 65);

      // Línea superior de la franja
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(0, canvas.height - 65, canvas.width, 3);

      // Textos estampados
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(`CODIZULCA ASISTENCIA • [${checkInType.toUpperCase()}]`, 14, canvas.height - 40);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`${storeName.slice(0, 32)} • ${dateStr}`, 14, canvas.height - 22);

      ctx.fillStyle = '#d4d4d8';
      ctx.font = '11px monospace';
      ctx.fillText(gpsStr, 14, canvas.height - 8);

      const jpegUrl = canvas.toDataURL('image/jpeg', 0.65);
      setSelfieDataUrl(jpegUrl);
      stopCamera();
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  // 3. GUARDADO DE ASISTENCIA CON REGLAS ESTRICTAS
  const handleSubmitCheckin = async () => {
    if (!gpsLocation) {
      alert('Regla Estricta: No es posible registrar la asistencia sin coordenadas GPS válidas. Presiona "Reintentar GPS".');
      return;
    }
    if (!selfieDataUrl) {
      alert('Debes capturar una fotografía de evidencia con la cámara integrada.');
      return;
    }

    setIsSubmitting(true);

    try {
      const activeProfile = campoService.getActivePromoter();
      const promoterName = resolvePromoterNameFromRaw(
        activePromoterName || activeProfile.name,
        activeProfile.email || activeProfile.id
      );
      const creatorIdentifier =
        activeProfile?.email ||
        activeProfile?.id ||
        'USR-' + promoterName.replace(/\s+/g, '-').toLowerCase();
      const nowIso = new Date().toISOString();
      const gpsStoreResolved = resolveStoreByGpsIfGenericDefault(storeName, gpsLocation);
      const finalStoreName = gpsStoreResolved.store;
      if (finalStoreName !== storeName) {
        setStoreName(finalStoreName);
      }
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, finalStoreName);
      } catch {}

      // Guardar en checkinsService (con UUID válido, sincronización directa a Supabase + Backend y cola offline)
      const checkinResult = await checkinsService.createCheckIn({
        date: nowIso,
        promoter: promoterName,
        store: finalStoreName,
        type: checkInType,
        photoBase64: selfieDataUrl,
        location: {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy: gpsLocation.accuracy || 10
        },
        creatorId: creatorIdentifier
      });

      if (isMerchandisingRoutePromoter(promoterName, activeProfile?.role || creatorIdentifier)) {
        window.dispatchEvent(new Event('codizulca_merchandising_changed'));
      }

      const payload: CheckinPayload & { id: string } = {
        id: checkinResult.record.id,
        date: nowIso,
        store: finalStoreName,
        type: checkInType,
        photoBase64: selfieDataUrl,
        location: gpsLocation,
        promoter: promoterName,
        creatorId: creatorIdentifier
      };

      // Registrar en Trazabilidad con coordenadas GPS reales y dirección física exacta
      (async () => {
        try {
          const [netInfo, geo] = await Promise.all([
            fetchClientNetworkInfo(),
            reverseGeocodeCoordinates(gpsLocation.lat, gpsLocation.lng)
          ]);
          const { browser, os, deviceType, connectionType } = detectRealBrowserAndOs();
          const connLabel = netInfo.isp ? `${connectionType} (${netInfo.isp})` : connectionType;
          const exactAddress = geo?.address || `${gpsLocation.lat.toFixed(6)}°, ${gpsLocation.lng.toFixed(6)}°`;
          const resolvedCity = geo?.locationCity || netInfo.locationCity || 'Ubicación GPS Verificada';

          await trazabilidadService.logEvent({
            user: {
              name: promoterName,
              email: activeProfile.email,
              role: activeProfile.role,
              photoUrl: activeProfile.photoUrl
            },
            action: {
              type: 'checkin',
              label: `Check-in Asistencia PDV (${checkInType})`,
              details: `${storeName} • Dirección GPS: ${exactAddress}`,
              status: 'success',
              module: 'Control de Asistencia'
            },
            device: {
              ip: netInfo.ip,
              browser,
              os,
              deviceType,
              connection: connLabel,
              locationCity: resolvedCity,
              address: exactAddress,
              gpsVerified: true,
              coordinates: formatCoordinatesDMS(gpsLocation.lat, gpsLocation.lng, 6),
              lat: gpsLocation.lat,
              lng: gpsLocation.lng,
              accuracy: gpsLocation.accuracy || 10,
              locationSource: 'gps'
            }
          });
        } catch {}
      })();

      if (!navigator.onLine) {
        campoService.enqueue('checkin', payload);
        setIsOfflineSaved(true);
      } else {
        setIsOfflineSaved(false);
      }

      setSaveSuccess(true);
    } catch (err) {
      console.error('Error al guardar asistencia:', err);
      // Fallback offline garantizado
      try {
        const activeProfile = campoService.getActivePromoter();
        const promoterName = activePromoterName || activeProfile.name;
        const creatorIdentifier =
          activeProfile?.email ||
          activeProfile?.id ||
          'USR-' + promoterName.replace(/\s+/g, '-').toLowerCase();
        campoService.enqueue('checkin', {
          date: new Date().toISOString(),
          store: storeName,
          type: checkInType,
          photoBase64: selfieDataUrl,
          location: gpsLocation,
          promoter: promoterName,
          creatorId: creatorIdentifier
        });
      } catch {}
      setSaveSuccess(true);
      setIsOfflineSaved(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelfieDataUrl(null);
    setSaveSuccess(false);
    syncTodayAttendance();
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Encabezado */}
      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/40 text-red-500 flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-black text-white uppercase tracking-wider">
                Marcaje de Asistencia en PDV
              </h2>
              <p className="text-[10px] text-neutral-400 font-mono">
                Biométrico In-App • GPS Satelital Estricto
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold font-mono">
            Anti-Crash WebRTC
          </span>
        </div>

        {/* PDV Selector */}
        <div className="mt-3 pt-3 border-t border-neutral-800/80">
          <CampoStoreSelector
            value={storeName}
            onChange={(val) => setStoreName(val)}
            label="Punto de Venta / Sucursal:"
          />
        </div>
      </div>

      {saveSuccess ? (
        <div className="bg-[#0d0d0d] border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">¡Marcaje Registrado Exitosamente!</h3>
            <p className="text-xs text-neutral-400 mt-1">
              {isOfflineSaved
                ? 'Marcaje almacenado localmente en modo Offline. Se transmitirá en segundo plano.'
                : 'Transmitido y validado con éxito ante la Gerencia de Trade Marketing.'}
            </p>
          </div>

          <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 text-xs text-left space-y-1 font-mono">
            <p className="text-white"><strong>Marcaje:</strong> <span className="text-red-400">{checkInType}</span></p>
            <p className="text-neutral-400"><strong>Comercio:</strong> {storeName}</p>
            {gpsLocation && (
              <p className="text-emerald-400 text-[11px]">
                <strong>GPS:</strong> {gpsLocation.lat}, {gpsLocation.lng} (±{gpsLocation.accuracy}m)
              </p>
            )}
          </div>

          <button
            onClick={handleReset}
            className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer"
          >
            Realizar Otro Marcaje
          </button>
        </div>
      ) : (
        <>
          {/* ESTADO DE MI ASISTENCIA DE HOY (4 HITOS CRONOLÓGICOS) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-3.5 space-y-2.5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Estado de Mi Jornada de Hoy (4 Hitos):</span>
              </span>
              <button
                type="button"
                onClick={syncTodayAttendance}
                disabled={isSyncingToday}
                className="px-2 py-0.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-mono flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 text-emerald-400 ${isSyncingToday ? 'animate-spin' : ''}`} />
                <span>Sincronizar</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { step: '1', type: 'Ingreso' as const, label: 'Ingreso' },
                  { step: '2', type: 'Salida a almorzar' as const, label: 'Salida Almuerzo' },
                  { step: '3', type: 'Vuelta a almorzar' as const, label: 'Llegada Almuerzo' },
                  { step: '4', type: 'Salida' as const, label: 'Salida' }
                ]
              ).map((slot) => {
                const found = todayCheckIns.find((c) => c.type === slot.type);
                const timeStr = found
                  ? new Date(found.date).toLocaleTimeString('es-VE', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'America/Caracas'
                    })
                  : null;
                return (
                  <button
                    key={slot.type}
                    type="button"
                    onClick={() => setCheckInType(slot.type)}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-1 ${
                      found
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                        : checkInType === slot.type
                        ? 'bg-red-950/50 border-red-500/60 text-white'
                        : 'bg-[#171717] border-neutral-800 text-amber-400/90'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-[10px] font-black block truncate">
                        {slot.step}. {slot.label}
                      </span>
                      <span className="text-[9px] font-mono block truncate opacity-80">
                        {found ? `✓ Sincronizado (${timeStr})` : 'Faltante • Tocar para cargar'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TIPO DE MARCAJE (4 BOTONES TÁCTILES) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block">
              1. Selecciona Tipo de Marcaje:
            </span>

            <div className="grid grid-cols-2 gap-2">
              {(['Ingreso', 'Salida a almorzar', 'Vuelta a almorzar', 'Salida'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCheckInType(type)}
                  className={`py-3 px-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    checkInType === type
                      ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-950/60'
                      : 'bg-[#171717] border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{type}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. VALIDACIÓN GEOGRÁFICA ESTRICTA (GPS) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                2. Validación Satelital de Coordenadas (GPS):
              </span>
              <button
                type="button"
                onClick={requestGps}
                disabled={isCapturingGps}
                className="px-2 py-0.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-mono flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isCapturingGps ? 'animate-spin' : ''}`} />
                <span>Actualizar</span>
              </button>
            </div>

            {gpsLocation ? (
              <div className="p-3 bg-[#171717] rounded-xl border border-emerald-500/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-emerald-400 text-xs font-bold block font-mono">
                      GPS Validado (±{gpsLocation.accuracy}m)
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      Lat: {gpsLocation.lat} • Lng: {gpsLocation.lng}
                    </span>
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            ) : gpsError ? (
              <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-red-400 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{gpsError}</span>
                </div>
                <button
                  type="button"
                  onClick={requestGps}
                  className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Reintentar Captura GPS
                </button>
              </div>
            ) : (
              <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 flex items-center justify-center gap-2 text-xs text-neutral-400 font-mono">
                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                <span>Obteniendo coordenadas satelitales...</span>
              </div>
            )}
          </div>

          {/* 3. CÁMARA EN VIVO INTEGRADA IN-APP (WEBRTC ANTI-CRASH) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                3. Selfie de Evidencia Biométrica In-App:
              </span>
              {isCameraActive && (
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="px-2 py-0.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{facingMode === 'user' ? 'Cámara Trasera' : 'Cámara Frontal'}</span>
                </button>
              )}
            </div>

            {/* Contenedor del Visor */}
            <div className="relative aspect-[3/4] bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center">
              {isCameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                  />

                  {/* Silueta ovalada punteada en pantalla */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-64 border-2 border-dashed border-red-500/70 rounded-[50%] shadow-[0_0_20px_rgba(220,38,38,0.2)]" />
                  </div>

                  <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
                    <span className="bg-black/75 px-3 py-1 rounded-full text-[10px] font-mono text-white">
                      Ubica tu rostro dentro del óvalo guía
                    </span>
                  </div>
                </>
              ) : selfieDataUrl ? (
                <div className="relative w-full h-full">
                  <img src={selfieDataUrl} alt="Selfie de asistencia" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelfieDataUrl(null);
                      setIsCameraActive(true);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 text-white hover:text-red-400"
                    title="Repetir fotografía"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-center p-6 space-y-2 text-neutral-500">
                  <Camera className="w-10 h-10 mx-auto opacity-40 text-red-500" />
                  <p className="text-xs text-neutral-300 font-medium">
                    Cámara WebRTC Integrada In-App
                  </p>
                  <p className="text-[10px] text-neutral-500 max-w-xs mx-auto">
                    Evita el cierre por memoria en Android al no invocar apps externas.
                  </p>
                </div>
              )}
            </div>

            {/* Controles de Cámara (WebRTC In-App + Cámara Nativa Android/iOS + Galería de Soporte) */}
            <div className="space-y-2">
              <input
                ref={nativeFileInputRef}
                type="file"
                accept="image/*"
                capture={facingMode === 'user' ? 'user' : 'environment'}
                onChange={handleNativePhotoUpload}
                className="hidden"
              />
              <input
                ref={galleryFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleNativePhotoUpload}
                className="hidden"
              />
              {!isCameraActive && !selfieDataUrl ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCameraActive(true)}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Activar Cámara In-App</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => nativeFileInputRef.current?.click()}
                      className="w-full py-3.5 rounded-xl bg-[#171717] hover:bg-neutral-800 border border-neutral-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-emerald-400" />
                      <span>Cámara Nativa (iOS / Android)</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => galleryFileInputRef.current?.click()}
                    className="w-full py-2.5 rounded-xl bg-[#121212] hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sincronizar Foto Guardada en el Teléfono (Galería)</span>
                  </button>
                </div>
              ) : isCameraActive ? (
                <button
                  type="button"
                  onClick={handleCaptureSelfie}
                  disabled={isProcessingPhoto}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all cursor-pointer"
                >
                  {isProcessingPhoto ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Comprimiendo & Estampando...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>Tomar Selfie & Estampar Evidencia</span>
                    </>
                  )}
                </button>
              ) : null}
            </div>
          </div>

          {/* BOTÓN FINAL DE GUARDAR ASISTENCIA (VALIDACIÓN ESTRICTA) */}
          <button
            type="button"
            onClick={handleSubmitCheckin}
            disabled={!gpsLocation || !selfieDataUrl || isSubmitting}
            className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
              !gpsLocation || !selfieDataUrl || isSubmitting
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-600/30 active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Registrando Asistencia...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Certificar & Guardar Asistencia</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
};
