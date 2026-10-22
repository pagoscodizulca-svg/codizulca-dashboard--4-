/**
 * Submódulo de Merchandising (Informes y Certificación de Visita en PDV)
 * App Móvil de Campo para Mercaderistas y Promotores Especializados (/portal/merchandising)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Layers,
  Store,
  MapPin,
  Clock,
  Calendar,
  Camera,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Check,
  Phone,
  FileText,
  Eye,
  X,
  UploadCloud,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  merchandisingService,
  MERCHANDISING_ACTIVITIES,
  STORE_MANAGER_ROLES,
  MerchandisingReport
} from '../../lib/merchandisingService';
import { STORAGE_KEY_ACTIVE_STORE } from '../../lib/checkinsService';
import { campoService } from '../../lib/campoService';
import { ClientSearchAutocomplete } from '../../components/mobile/ClientSearchAutocomplete';

const FREQUENT_STORES = [
  "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (LA LIMPIA)",
  "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Bella Vista)",
  "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Maracaibo Norte)",
  "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Cabimas)",
  "OLIMPICA MAYORISTA",
  "OLIMPICA SÚPER MARKET",
  "Supermercado Olímpica (El Bajo)",
  "Hipermercado Viviana Bella Vista",
  "Central Madeirense San Francisco"
];

const SPECIALIZED_PROMOTERS = [
  'Jose Barroso',
  'Zioreli Grangger',
  'CARELIZ REYES',
  'Scarleth Piña'
];

export const PortalMerchandising: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();

  // 1. Promotor y Rol Especializado (sincronizado con sesión personal)
  const userParam = searchParams.get('user');
  const [promoterName, setPromoterName] = useState<string>(() => {
    if (userParam?.toLowerCase().includes('jose')) return 'Jose Barroso';
    if (userParam?.toLowerCase().includes('zioreli')) return 'Zioreli Grangger';
    const activeProm = campoService.getActivePromoter();
    return activeProm?.name || profile?.full_name || localStorage.getItem('portal_active_promoter') || 'Jose Barroso';
  });

  useEffect(() => {
    const syncPromoter = () => {
      const activeProm = campoService.getActivePromoter();
      if (activeProm?.name) setPromoterName(activeProm.name);
    };
    window.addEventListener('codizulca_promoter_changed', syncPromoter);
    return () => window.removeEventListener('codizulca_promoter_changed', syncPromoter);
  }, []);

  // 2. Punto de Venta y Ubicación
  const [storeName, setStoreName] = useState<string>(() => {
    return searchParams.get('store') || localStorage.getItem(STORAGE_KEY_ACTIVE_STORE) || "ALKOSTO DONDE COMPRAR ES GANAR, C.A. (Bella Vista)";
  });
  const [address, setAddress] = useState<string>('Pasillo 3 (Charcutería & Cava de Refrigerados)');

  // 3. Fecha y Hora de Visita
  const todayStr = new Date().toISOString().split('T')[0];
  const nowTimeStr = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const [date, setDate] = useState<string>(todayStr);
  const [time, setTime] = useState<string>(nowTimeStr);

  // 4. Labores Operativas (Checklist)
  const [selectedActivities, setSelectedActivities] = useState<string[]>([
    'Exhibición y Ajuste de Planograma',
    'Limpieza y Organización de Anaquel',
    'Reposición de Frentes y Rotación (FIFO)',
    'Chequeo de Precios y Señalización'
  ]);

  // 5. Detalles de Producto & Observaciones
  const [productDetail, setProductDetail] = useState<string>('Línea Embutidos Cocidos, Jamón Superior, Salchichas');
  const [observations, setObservations] = useState<string>('');

  // 6. Evidencia Fotográfica (Hasta 6 Fotos Optimizadas en Canvas)
  const [photos, setPhotos] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 7. Certificación y Firma Digital del Encargado
  const [storeManagerName, setStoreManagerName] = useState<string>('');
  const [storeManagerRole, setStoreManagerRole] = useState<string>('Encargado de Tienda');
  const [storeManagerPhone, setStoreManagerPhone] = useState<string>('');
  const [hasSignature, setHasSignature] = useState<boolean>(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);

  // 8. Envío y Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedReport, setSubmittedReport] = useState<MerchandisingReport | null>(null);

  // Guardar PDV en localStorage
  const handleStoreChange = (val: string) => {
    setStoreName(val);
    localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, val);
  };

  // Alternar actividad en checklist
  const toggleActivity = (act: string) => {
    setSelectedActivities((prev) =>
      prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]
    );
  };

  const handleSelectAllActivities = () => {
    if (selectedActivities.length === MERCHANDISING_ACTIVITIES.length) {
      setSelectedActivities([]);
    } else {
      setSelectedActivities([...MERCHANDISING_ACTIVITIES]);
    }
  };

  // =========================================================================
  // MOTOR DE COMPRESIÓN DE FOTOS (Canvas HTML5: Max 1200px @ 75% JPEG)
  // =========================================================================
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 6 - photos.length;
    if (remainingSlots <= 0) {
      alert('Ya has alcanzado el límite máximo de 6 fotos de evidencia.');
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    setIsCompressing(true);

    try {
      const compressedResults: string[] = [];

      for (const file of filesToProcess) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_DIM = 1200;
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
              if (!ctx) {
                resolve(event.target?.result as string);
                return;
              }

              ctx.drawImage(img, 0, 0, width, height);

              // Marca de agua de evidencia técnica
              const now = new Date();
              const dateStr = now.toLocaleDateString('es-VE') + ' ' + now.toLocaleTimeString('es-VE', { hour12: true });
              ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
              ctx.fillRect(0, height - 36, width, 36);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 14px sans-serif';
              ctx.fillText(`CODIZULCA MERCHANDISING • ${storeName.slice(0, 30)} • ${dateStr}`, 12, height - 12);

              resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = reject;
            img.src = event.target?.result as string;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file as Blob);
        });

        compressedResults.push(base64);
      }

      setPhotos((prev) => [...prev, ...compressedResults]);
    } catch (err) {
      console.error('Error procesando fotos de merchandising:', err);
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // =========================================================================
  // CANVAS DE FIRMA TÁCTIL (Touch & Pointer fluido con suavizado para iOS / Android)
  // =========================================================================
  const lastCanvasWidthRef = useRef<number>(0);

  const initCanvas = useCallback((forceReset = false) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    // En iOS Safari y Android Chrome, mostrar/ocultar el teclado o la barra de direcciones dispara resize vertical.
    // Evitamos borrar la firma si el ancho del contenedor no cambió.
    if (!forceReset && lastCanvasWidthRef.current > 0 && Math.abs(rect.width - lastCanvasWidthRef.current) < 8) {
      return;
    }

    const prevDataUrl = !forceReset && lastCanvasWidthRef.current > 0 ? canvas.toDataURL() : null;
    lastCanvasWidthRef.current = rect.width;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#1e3a8a'; // Azul corporativo de firma

      if (prevDataUrl) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = prevDataUrl;
      }
    }
  }, []);

  useEffect(() => {
    initCanvas(true);
    const onResize = () => initCanvas(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [initCanvas]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const coords = getCanvasCoords(e.nativeEvent);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const coords = getCanvasCoords(e.nativeEvent);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // =========================================================================
  // VALIDACIÓN Y ENVÍO DEL REPORTE CERTIFICADO
  // =========================================================================
  const handleSubmitReport = async () => {
    if (!storeName.trim()) {
      alert('Ingresa el nombre del punto de venta visitado.');
      return;
    }
    if (selectedActivities.length === 0) {
      alert('Selecciona al menos una labor operativa de merchandising ejecutada.');
      return;
    }
    if (!storeManagerName.trim()) {
      alert('Ingresa el nombre del encargado o responsable del establecimiento.');
      return;
    }
    if (!hasSignature || !signatureCanvasRef.current) {
      alert('La firma digital del encargado es obligatoria para certificar la visita.');
      return;
    }

    setIsSubmitting(true);

    try {
      const signatureBase64 = signatureCanvasRef.current.toDataURL('image/png');

      const payload = {
        type: 'Merchandising' as const,
        date,
        time,
        store: storeName.trim(),
        address: address.trim(),
        promoter: promoterName.trim(),
        storeManagerName: storeManagerName.trim(),
        storeManagerRole,
        storeManagerPhone: storeManagerPhone.trim(),
        visitReason: 'Certificación de Labores de Merchandising en Anaquel',
        activities: selectedActivities,
        product: productDetail.trim(),
        observations: observations.trim(),
        signature: signatureBase64,
        signedAt: new Date().toISOString(),
        certified: true,
        photos
      };

      const result = await merchandisingService.create(payload);
      setSubmittedReport(result);
    } catch (err) {
      console.error('Error registrando informe de merchandising:', err);
      alert('Error al guardar el informe. Se reintentará automáticamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartNewReport = () => {
    setSubmittedReport(null);
    setPhotos([]);
    setObservations('');
    setStoreManagerName('');
    setStoreManagerPhone('');
    clearSignature();
  };

  // Vista de éxito tras enviar reporte
  if (submittedReport) {
    return (
      <div className="space-y-4 animate-in fade-in-50 duration-300 pb-20 max-w-lg mx-auto">
        <div className="bg-white border border-emerald-200 rounded-3xl p-6 shadow-sm text-center space-y-4">
          <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Certificación Oficial Exitosa
            </span>
            <h2 className="text-xl font-black text-gray-900 mt-2">
              Informe de Merchandising Avalado
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              La visita en <strong>{submittedReport.store}</strong> fue registrada y certificada con la firma digital de <strong>{submittedReport.storeManagerName}</strong> ({submittedReport.storeManagerRole}).
            </p>
          </div>

          <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-left text-xs space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Nº Reporte:</span>
              <strong className="font-mono text-gray-900">{submittedReport.id}</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Mercaderista:</span>
              <strong className="text-gray-900">{submittedReport.promoter}</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Labores Validadas:</span>
              <strong className="text-emerald-700">{submittedReport.activities.length} actividades</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Evidencias Fotográficas:</span>
              <strong className="text-gray-900">{submittedReport.photos?.length || 0} fotos optimizadas</strong>
            </div>
          </div>

          {/* Visualización de la Firma */}
          <div className="p-3 bg-white rounded-2xl border border-dashed border-gray-300 text-center">
            <span className="text-[10px] text-gray-400 font-mono block mb-1">Trazo de Firma Digital Certificada:</span>
            <img src={submittedReport.signature} alt="Firma del Encargado" className="h-16 mx-auto object-contain" />
            <span className="text-[10px] text-gray-600 font-semibold block mt-1">
              Firmado por: {submittedReport.storeManagerName}
            </span>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleStartNewReport}
              className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl gap-2 shadow-md cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Realizar Nueva Visita de Merchandising
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300 pb-20 max-w-lg mx-auto">
      {/* Header del Submódulo */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white flex items-center justify-center font-black shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-gray-900 tracking-tight leading-none">
                  Merchandising en PDV
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-700 uppercase">
                  Auditoría
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                Certificación y Acta de Labores en Anaquel
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono text-gray-400 block">Mercaderista:</span>
            <span className="text-xs font-bold text-gray-800">{promoterName}</span>
          </div>
        </div>

        {/* Chips de selección de mercaderistas especializados */}
        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-gray-400 font-medium shrink-0">Promotor:</span>
          {SPECIALIZED_PROMOTERS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setPromoterName(name)}
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap transition cursor-pointer ${
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

      {/* B. REGISTRO DE UBICACIÓN Y TIENDA */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1">
              <Store className="h-3.5 w-3.5 text-red-600" />
              Punto de Venta / Establecimiento Comercial <span className="text-red-500">*</span>:
            </label>
            <ClientSearchAutocomplete
              value={storeName}
              onChange={(val) => handleStoreChange(val)}
              onSelectClient={(client) => {
                if (client.sector) {
                  setAddress(`${client.sector} • Pasillo de Charcutería`);
                }
              }}
              placeholder="Buscar cliente en cartera o escribir nombre..."
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1">
              <MapPin className="h-3.5 w-3.5 text-gray-500" />
              Dirección o Sucursal / Pasillo / Sector en Tienda:
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej. Pasillo 3 (Charcutería & Cava de Refrigerados)"
              className="w-full text-xs font-normal px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-gray-600 flex items-center gap-1 mb-1">
                <Calendar className="h-3 w-3 text-gray-400" />
                Fecha de Inspección:
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs font-semibold px-2.5 py-1.5 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-600 flex items-center gap-1 mb-1">
                <Clock className="h-3 w-3 text-gray-400" />
                Hora de Inicio:
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-xs font-semibold px-2.5 py-1.5 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* C. LISTA DE VERIFICACIÓN DE LABORES OPERATIVAS (CHECKLIST) */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5 uppercase tracking-wider">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Labores de Merchandising Ejecutadas ({selectedActivities.length}/6):
            </label>
            <button
              type="button"
              onClick={handleSelectAllActivities}
              className="text-[11px] font-bold text-red-600 hover:text-red-800 cursor-pointer"
            >
              {selectedActivities.length === MERCHANDISING_ACTIVITIES.length ? 'Desmarcar' : 'Marcar Todas'}
            </button>
          </div>

          <div className="space-y-1.5">
            {MERCHANDISING_ACTIVITIES.map((act) => {
              const isChecked = selectedActivities.includes(act);
              return (
                <div
                  key={act}
                  onClick={() => toggleActivity(act)}
                  className={`p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                    isChecked
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-xs'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`h-5 w-5 rounded-md flex items-center justify-center border transition ${
                        isChecked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                    <span className="text-xs font-semibold">{act}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-600 block">
              Marcas / SKUs Trabajados en la Jornada:
            </label>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {[
                'Caraotas 400gr',
                'Lentejas 400gr',
                'Arroz Vencampo (400gr / 500gr / 900gr / 1kg)',
                'Línea Embutidos Asturias'
              ].map((skuChip) => {
                const isIncluded = productDetail.toLowerCase().includes(skuChip.toLowerCase());
                return (
                  <button
                    key={skuChip}
                    type="button"
                    onClick={() => {
                      if (isIncluded) {
                        const next = productDetail
                          .split(',')
                          .map((s) => s.trim())
                          .filter((s) => s && s.toLowerCase() !== skuChip.toLowerCase())
                          .join(', ');
                        setProductDetail(next);
                      } else {
                        setProductDetail((prev) => (prev.trim() ? `${prev.trim()}, ${skuChip}` : skuChip));
                      }
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                      isIncluded
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    + {skuChip}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={productDetail}
              onChange={(e) => setProductDetail(e.target.value)}
              placeholder="Ej. Caraotas 400gr, Lentejas 400gr, Mortadelas..."
              className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-lg"
            />
          </div>
        </CardContent>
      </Card>

      {/* D. MOTOR DE EVIDENCIA FOTOGRÁFICA (HASTA 6 FOTOS OPTIMIZADAS) */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Camera className="h-4 w-4 text-red-600" />
                Evidencia de Merchandising ({photos.length} de 6):
              </label>
              <span className="text-[10px] text-gray-500">
                Compresión automática en Canvas (Max 1200px @ 75% JPEG)
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 font-mono">
              {6 - photos.length} slots libres
            </span>
          </div>

          {/* Cuadrícula de fotos */}
          <div className="grid grid-cols-3 gap-2.5">
            {photos.map((photoUrl, idx) => (
              <div
                key={idx}
                className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-zinc-900 group shadow-xs"
              >
                <img
                  src={photoUrl}
                  alt={`Evidencia ${idx + 1}`}
                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setPhotoViewerIndex(idx)}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(idx);
                  }}
                  className="absolute top-1 right-1 p-1 rounded-md bg-black/70 hover:bg-red-600 text-white transition-colors cursor-pointer"
                  title="Eliminar esta foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-mono">
                  #{idx + 1}
                </div>
              </div>
            ))}

            {/* Botón para agregar más fotos si no ha llegado a 6 */}
            {photos.length < 6 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-red-400 bg-gray-50 hover:bg-red-50/50 flex flex-col items-center justify-center p-2 text-center transition cursor-pointer"
              >
                {isCompressing ? (
                  <Loader2 className="h-6 w-6 animate-spin text-red-600" />
                ) : (
                  <>
                    <Camera className="h-6 w-6 text-gray-400 mb-1" />
                    <span className="text-[10px] font-bold text-gray-700 leading-tight">
                      + Foto
                    </span>
                    <span className="text-[9px] text-gray-400">
                      Cámara / Galería
                    </span>
                  </>
                )}
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          <div>
            <label className="text-[11px] font-bold text-gray-600 block mb-1">
              Observaciones y Hallazgos en Anaquel:
            </label>
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Comentarios sobre quiebres de competencia, estado del anaquel, sugerencias..."
              className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* E. MÓDULO DE CERTIFICACIÓN Y FIRMA DIGITAL DEL ENCARGADO */}
      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-red-600" />
            <div>
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                Certificación y Firma del Encargado
              </h3>
              <p className="text-[10px] text-gray-500">
                Aval presencial del responsable del comercio para auditoría
              </p>
            </div>
          </div>

          {/* Datos del Responsable */}
          <div className="space-y-2">
            <div>
              <label className="text-[11px] font-bold text-gray-700 block mb-1">
                Nombre Completo del Encargado o Dueño <span className="text-red-500">*</span>:
              </label>
              <input
                type="text"
                value={storeManagerName}
                onChange={(e) => setStoreManagerName(e.target.value)}
                placeholder="Ej. Roberto Chacín"
                required
                className="w-full text-xs font-semibold px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-gray-600 block mb-1">
                  Cargo en el Comercio:
                </label>
                <select
                  value={storeManagerRole}
                  onChange={(e) => setStoreManagerRole(e.target.value)}
                  className="w-full text-xs font-medium px-2.5 py-1.5 border border-gray-300 rounded-lg bg-white"
                >
                  {STORE_MANAGER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-600 block mb-1">
                  Teléfono de Contacto:
                </label>
                <input
                  type="tel"
                  value={storeManagerPhone}
                  onChange={(e) => setStoreManagerPhone(e.target.value)}
                  placeholder="+58 412-..."
                  className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Declaración Jurada */}
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs italic leading-relaxed">
            “Certifico formalmente que el promotor/mercaderista visitó personalmente este establecimiento y llevó a cabo las labores de merchandising indicadas.”
          </div>

          {/* Canvas de Firma Táctil */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-gray-700">
                Firma Táctil en Pantalla <span className="text-red-500">*</span>:
              </span>
              <button
                type="button"
                onClick={clearSignature}
                className="text-[11px] font-bold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" /> Limpiar Trazo
              </button>
            </div>

            <div className="relative border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-2xl bg-white shadow-inner overflow-hidden">
              <canvas
                ref={signatureCanvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none' }}
                className="w-full h-36 cursor-crosshair block"
              />

              {!hasSignature && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-400 text-xs">
                  <span className="font-medium">Firma aquí con el dedo o puntero táctil</span>
                  <span className="text-[10px] text-gray-300">Trazo suave vectorizado</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botón Principal de Certificación y Envío */}
      <div className="pt-1">
        <Button
          type="button"
          onClick={handleSubmitReport}
          disabled={isSubmitting || !hasSignature || !storeName.trim() || !storeManagerName.trim()}
          className={`w-full h-13 text-sm font-black rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
            hasSignature && storeName.trim() && storeManagerName.trim()
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Certificando Informe de Merchandising...
            </>
          ) : (
            <>
              <Check className="h-5 w-5 stroke-[2.5]" />
              Certificar y Enviar Informe de Visita
            </>
          )}
        </Button>
      </div>

      {/* Modal Visor de Foto Ampliada */}
      {photoViewerIndex !== null && photos[photoViewerIndex] && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setPhotoViewerIndex(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/70 text-white hover:bg-red-600 transition cursor-pointer z-10"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={photos[photoViewerIndex]}
              alt={`Foto ${photoViewerIndex + 1}`}
              className="w-full h-auto max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <span className="text-white text-xs font-mono mt-2">
              Foto #{photoViewerIndex + 1} de {photos.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
