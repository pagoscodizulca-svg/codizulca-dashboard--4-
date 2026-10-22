import React, { useState } from 'react';
import {
  ClipboardList,
  Sparkles,
  CheckCircle2,
  X,
  Store,
  ChevronDown
} from 'lucide-react';
import {
  CODIZULCA_PRODUCTS,
  FREQUENT_STORES,
  campoService,
  TastingSurveyPayload,
  PromoterProfile
} from '../../lib/campoService';
import { useOutletContext } from 'react-router-dom';
import { STORAGE_KEY_ACTIVE_STORE } from '../../lib/checkinsService';
import { degustacionesService } from '../../lib/degustacionesService';
import { CampoStoreSelector } from '../../components/mobile/CampoStoreSelector';

const AVAILABLE_PRODUCTS = Array.from(
  new Set([
    'Caraotas 400gr',
    'Lentejas 400gr',
    ...CODIZULCA_PRODUCTS.map((p) => p.name),
    'Arroz 900gr',
    'Mortadela Tapara Especial 1kg',
    'Jamón Cocido Superior 1kg',
    'Salchichas Viena (Paquete 12)',
    'Tocineta Ahumada Especial 1kg',
    'Chuleta Ahumada de Cerdo',
    'Salchichón Tipo Milano',
    'Queso Amarillo Paisa / Gouda'
  ])
);

export const CampoEncuestas: React.FC<{ activePromoterName?: string }> = ({
  activePromoterName
}) => {
  const context = useOutletContext<{
    activePromoter?: PromoterProfile;
  }>();
  const activePromoter = context?.activePromoter || campoService.getActivePromoter();

  // 1. Selector de Modelo: 'corta' o 'larga' (Exacto a las imágenes subidas)
  const [surveyType, setSurveyType] = useState<'corta' | 'larga'>('corta');

  // Datos Generales sincronizados con la tienda activa de la promotora
  const [storeName, setStoreName] = useState<string>(() => {
    const savedStore = localStorage.getItem(STORAGE_KEY_ACTIVE_STORE);
    if (savedStore && savedStore.trim()) return savedStore.trim();
    if (
      activePromoter?.assignedStore &&
      !['VARIAS', 'VARIOS', 'TODAS', 'TODOS'].includes(activePromoter.assignedStore.toUpperCase())
    ) {
      return activePromoter.assignedStore;
    }
    return 'ALKOSTO DONDE COMPRAR ES GANAR, C.A.';
  });
  const [selectedProduct, setSelectedProduct] = useState<string>('Arroz Vencampo 900gr');

  // === MODELO 1: ENCUESTA CORTA ===
  const [saborCalidadCorta, setSaborCalidadCorta] = useState<number>(5);
  const [comprariaCorta, setComprariaCorta] = useState<'Sí, seguro' | 'Tal vez' | 'No por ahora'>('Sí, seguro');
  const [comentariosCorta, setComentariosCorta] = useState<string>('');

  // === MODELO 2: ENCUESTA LARGA ===
  const [saborTexturaLarga, setSaborTexturaLarga] = useState<number>(5);
  const [intencionCompraLarga, setIntencionCompraLarga] = useState<'Muy probable' | 'Probable' | 'Poco probable' | 'Nada probable'>('Muy probable');
  const [percepcionCalidadLarga, setPercepcionCalidadLarga] = useState<'Mejor' | 'Igual' | 'Peor'>('Mejor');
  const [relacionCalidadPrecioLarga, setRelacionCalidadPrecioLarga] = useState<'Excelente' | 'Buena' | 'Regular' | 'Mala'>('Excelente');
  const [recomendacionLarga, setRecomendacionLarga] = useState<number>(5);
  const [comentariosLarga, setComentariosLarga] = useState<string>('');

  // Estados de Envío y Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(false);
  const [isOfflineSaved, setIsOfflineSaved] = useState<boolean>(false);

  // Sincronizar progreso con la degustación asignada a la promotora en Trade Marketing
  const syncProgressWithAssignedDegustacion = async (ratingOutOf5: number) => {
    try {
      const assigned = await degustacionesService.getForPromoter({
        id: activePromoter?.id,
        name: activePromoterName || activePromoter?.name,
        email: activePromoter?.email
      });
      if (assigned.length > 0) {
        const activeDeg = assigned.find((d) => d.status === 'in_progress') || assigned[0];
        if (activeDeg) {
          const prevDelivered = Number(activeDeg.delivered) || 0;
          const prevRate = Number(activeDeg.acceptanceRate) || 90;
          const newRateFromSurvey = Math.round((ratingOutOf5 / 5) * 100);
          const nextDelivered = prevDelivered + 1;
          const nextAcceptanceRate = prevDelivered > 0
            ? Math.round((prevRate * prevDelivered + newRateFromSurvey) / nextDelivered)
            : newRateFromSurvey;
          await degustacionesService.update(activeDeg.id, {
            delivered: nextDelivered,
            acceptanceRate: nextAcceptanceRate,
            status: activeDeg.status === 'scheduled' ? 'in_progress' : activeDeg.status
          });
        }
      }
    } catch {
      // ignore if offline
    }
  };

  // Envío de Encuesta Corta
  const handleSubmitCorta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      alert('Por favor ingresa la tienda o local.');
      return;
    }

    setIsSubmitting(true);
    try {
      const generatedId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'SURV-CORTA-' + Date.now().toString().slice(-6);
      const payload: TastingSurveyPayload = {
        id: generatedId,
        date: new Date().toISOString(),
        store: storeName.trim(),
        promoter: activePromoterName || activePromoter?.name || campoService.getActivePromoter().name,
        type: 'rapida',
        productName: selectedProduct,
        ratingOverall: saborCalidadCorta,
        purchaseIntent: comprariaCorta === 'Sí, seguro' ? 'SI' : comprariaCorta === 'Tal vez' ? 'TAL_VEZ' : 'NO',
        comments: comentariosCorta.trim() || undefined
      };

      const res = await campoService.saveTastingSurvey(payload);
      await syncProgressWithAssignedDegustacion(saborCalidadCorta);
      setSubmittedSuccess(true);
      setIsOfflineSaved(res.offline);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Envío de Encuesta Larga
  const handleSubmitLarga = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      alert('Por favor ingresa la tienda o local.');
      return;
    }

    setIsSubmitting(true);
    try {
      const generatedId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'SURV-LARGA-' + Date.now().toString().slice(-6);
      const payload: TastingSurveyPayload = {
        id: generatedId,
        date: new Date().toISOString(),
        store: storeName.trim(),
        promoter: activePromoterName || activePromoter?.name || campoService.getActivePromoter().name,
        type: 'extendida',
        productName: selectedProduct,
        ratingOverall: recomendacionLarga,
        purchaseIntent: (intencionCompraLarga === 'Muy probable' || intencionCompraLarga === 'Probable') ? 'SI' : 'NO',
        sensoryRatings: {
          sabor: saborTexturaLarga,
          textura: saborTexturaLarga,
          aroma: 5
        },
        comments: `[Percepción: ${percepcionCalidadLarga} | Calidad/Precio: ${relacionCalidadPrecioLarga} | Intención: ${intencionCompraLarga}] ${comentariosLarga.trim()}`
      };

      const res = await campoService.saveTastingSurvey(payload);
      await syncProgressWithAssignedDegustacion(recomendacionLarga);
      setSubmittedSuccess(true);
      setIsOfflineSaved(res.offline);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setComentariosCorta('');
    setComentariosLarga('');
    setSubmittedSuccess(false);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* ========================================================================= */}
      {/* SELECTOR SUPERIOR DE PESTAÑAS: ENCUESTA CORTA / ENCUESTA LARGA            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 gap-2 bg-[#0d0d0d] p-1.5 rounded-2xl border border-neutral-800">
        <button
          type="button"
          onClick={() => { setSurveyType('corta'); setSubmittedSuccess(false); }}
          className={`py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            surveyType === 'corta'
              ? 'bg-[#e60000] text-white shadow-lg shadow-red-600/30'
              : 'text-neutral-400 hover:text-white bg-transparent'
          }`}
        >
          ENCUESTA CORTA
        </button>

        <button
          type="button"
          onClick={() => { setSurveyType('larga'); setSubmittedSuccess(false); }}
          className={`py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            surveyType === 'larga'
              ? 'bg-[#e60000] text-white shadow-lg shadow-red-600/30'
              : 'text-neutral-400 hover:text-white bg-transparent'
          }`}
        >
          ENCUESTA LARGA
        </button>
      </div>

      {/* Pantalla de Éxito al Enviar */}
      {submittedSuccess ? (
        <div className="bg-[#0d0d0d] border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">¡Encuesta Registrada Exitosamente!</h3>
            <p className="text-xs text-neutral-400 mt-1">
              {isOfflineSaved
                ? 'Guardada localmente en tu teléfono en modo Offline. Se sincronizará automáticamente al detectar conexión.'
                : 'Transmitida y sincronizada de inmediato con el servidor central de Trade Marketing Codizulca.'}
            </p>
          </div>

          <div className="p-3.5 bg-[#171717] rounded-xl border border-neutral-800 text-xs font-mono flex items-center justify-around">
            <div>
              <span className="text-neutral-500 block text-[10px]">Modelo</span>
              <strong className="text-white uppercase">{surveyType === 'corta' ? 'Encuesta Corta' : 'Encuesta Larga'}</strong>
            </div>
            <div className="h-6 w-px bg-neutral-800" />
            <div>
              <span className="text-neutral-500 block text-[10px]">Producto</span>
              <strong className="text-amber-400">{selectedProduct}</strong>
            </div>
            <div className="h-6 w-px bg-neutral-800" />
            <div>
              <span className="text-neutral-500 block text-[10px]">PDV</span>
              <strong className="text-emerald-400 truncate max-w-[90px] block">{storeName}</strong>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="w-full py-4 rounded-xl bg-[#e60000] hover:bg-red-600 text-white font-black text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-red-600/30"
          >
            Aplicar Nueva Encuesta
          </button>
        </div>
      ) : surveyType === 'corta' ? (
        /* ========================================================================= */
        /* MODELO 1: ENCUESTA CORTA (EXACTO A IMAGE 1)                                */
        /* ========================================================================= */
        <form onSubmit={handleSubmitCorta} className="space-y-3">
          
          {/* CARD 1: TIENDA / LOCAL Y PRODUCTO IMPULSADO - CATEGORÍA */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <CampoStoreSelector
              value={storeName}
              onChange={(val) => setStoreName(val)}
              label="TIENDA / LOCAL"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  PRODUCTO IMPULSADO - CATEGORÍA
                </label>
                <span className="px-2.5 py-0.5 rounded-lg bg-neutral-800 border border-neutral-700 text-amber-400 text-[10px] font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>{selectedProduct}</span>
                </span>
              </div>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full bg-[#000000] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 cursor-pointer"
              >
                <option value="" disabled>Selecciona una categoría...</option>
                {AVAILABLE_PRODUCTS.map((prod) => (
                  <option key={prod} value={prod}>{prod}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CARD 2: CALIFICACIÓN DE SABOR / CALIDAD (1 AL 5) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2.5 shadow-xl">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              CALIFICACIÓN DE SABOR / CALIDAD (1 AL 5)
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSaborCalidadCorta(num)}
                  className={`py-3 rounded-xl border text-center font-black text-sm transition-all cursor-pointer ${
                    saborCalidadCorta === num
                      ? 'bg-[#e60000] border-red-500 text-white shadow-lg shadow-red-950/60 scale-[1.02]'
                      : 'bg-[#000000] border-neutral-800 text-white hover:border-neutral-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 3: ¿EL CLIENTE COMPRARÍA EL PRODUCTO? */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2.5 shadow-xl">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              ¿EL CLIENTE COMPRARÍA EL PRODUCTO?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Sí, seguro', 'Tal vez', 'No por ahora'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setComprariaCorta(opt)}
                  className={`py-3 px-1 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${
                    comprariaCorta === opt
                      ? 'bg-[#e60000] border-red-500 text-white shadow-lg shadow-red-950/60'
                      : 'bg-[#000000] border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 4: COMENTARIOS DEL CLIENTE (OPCIONAL) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-xl">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              COMENTARIOS DEL CLIENTE (OPCIONAL)
            </label>
            <textarea
              value={comentariosCorta}
              onChange={(e) => setComentariosCorta(e.target.value)}
              placeholder="Ej. Le pareció buen sabor, preguntó por presentación de 1kg..."
              rows={3}
              className="w-full bg-[#000000] border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          {/* BOTÓN DE ENVÍO */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-2xl bg-[#e60000] hover:bg-red-600 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <ClipboardList className="w-4 h-4" />
            <span>{isSubmitting ? 'Enviando...' : 'Enviar Encuesta Corta'}</span>
          </button>
        </form>
      ) : (
        /* ========================================================================= */
        /* MODELO 2: ENCUESTA LARGA (EXACTO A IMAGE 2)                                */
        /* ========================================================================= */
        <form onSubmit={handleSubmitLarga} className="space-y-3">
          
          {/* CARD 1: TIENDA / LOCAL Y PRODUCTO IMPULSADO - CATEGORÍA */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <CampoStoreSelector
              value={storeName}
              onChange={(val) => setStoreName(val)}
              label="TIENDA / LOCAL"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  PRODUCTO IMPULSADO - CATEGORÍA
                </label>
                <span className="px-2.5 py-0.5 rounded-lg bg-neutral-800 border border-neutral-700 text-amber-400 text-[10px] font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>{selectedProduct}</span>
                </span>
              </div>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full bg-[#000000] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 cursor-pointer"
              >
                <option value="" disabled>Selecciona una categoría...</option>
                {AVAILABLE_PRODUCTS.map((prod) => (
                  <option key={prod} value={prod}>{prod}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CARD 2: 1. SABOR Y TEXTURA (1 AL 5) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                1. SABOR Y TEXTURA (1 AL 5)
              </label>
              <p className="text-[11px] text-neutral-500">
                ¿Cómo califica el sabor y la textura del producto que acaba de probar?
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSaborTexturaLarga(num)}
                  className={`py-3 rounded-xl border text-center font-black text-sm transition-all cursor-pointer ${
                    saborTexturaLarga === num
                      ? 'bg-[#e60000] border-red-500 text-white shadow-lg shadow-red-950/60 scale-[1.02]'
                      : 'bg-[#000000] border-neutral-800 text-white hover:border-neutral-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 3: 2. INTENCIÓN DE COMPRA */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                2. INTENCIÓN DE COMPRA
              </label>
              <p className="text-[11px] text-neutral-500">
                Después de haber probado nuestro producto hoy, ¿qué tan probable es que lo compre?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {(['Muy probable', 'Probable', 'Poco probable', 'Nada probable'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setIntencionCompraLarga(opt)}
                  className={`py-2.5 px-3 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${
                    intencionCompraLarga === opt
                      ? 'bg-[#e60000] border-red-500 text-white shadow-lg shadow-red-950/60'
                      : 'bg-[#000000] border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 4: 3. PERCEPCIÓN DE CALIDAD */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                3. PERCEPCIÓN DE CALIDAD
              </label>
              <p className="text-[11px] text-neutral-500">
                En comparación con otras marcas, ¿cómo posiciona la calidad de nuestra marca?
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {(['Mejor', 'Igual', 'Peor'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPercepcionCalidadLarga(opt)}
                  className={`py-2.5 px-2 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${
                    percepcionCalidadLarga === opt
                      ? 'bg-[#e60000] border-red-500 text-white shadow-lg shadow-red-950/60'
                      : 'bg-[#000000] border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 5: 4. RELACIÓN CALIDAD-PRECIO */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                4. RELACIÓN CALIDAD-PRECIO
              </label>
              <p className="text-[11px] text-neutral-500">
                Considerando la calidad, ¿cómo percibe el valor del producto en relación con el precio?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {(['Excelente', 'Buena', 'Regular', 'Mala'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRelacionCalidadPrecioLarga(opt)}
                  className={`py-2.5 px-3 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${
                    relacionCalidadPrecioLarga === opt
                      ? 'bg-[#e60000] border-red-500 text-white shadow-lg shadow-red-950/60'
                      : 'bg-[#000000] border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 6: 5. RECOMENDACIÓN (1 AL 5) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                5. RECOMENDACIÓN (1 AL 5)
              </label>
              <p className="text-[11px] text-neutral-500">
                ¿Qué tan probable es que recomiende nuestros productos a familiares y amigos?
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRecomendacionLarga(num)}
                  className={`py-3 rounded-xl border text-center font-black text-sm transition-all cursor-pointer ${
                    recomendacionLarga === num
                      ? 'bg-[#e60000] border-red-500 text-white shadow-lg shadow-red-950/60 scale-[1.02]'
                      : 'bg-[#000000] border-neutral-800 text-white hover:border-neutral-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 7: COMENTARIOS (OPCIONAL) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-xl">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              COMENTARIOS (OPCIONAL)
            </label>
            <textarea
              value={comentariosLarga}
              onChange={(e) => setComentariosLarga(e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={3}
              className="w-full bg-[#000000] border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          {/* BOTÓN DE ENVÍO */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-2xl bg-[#e60000] hover:bg-red-600 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <ClipboardList className="w-4 h-4" />
            <span>{isSubmitting ? 'Enviando...' : 'Enviar Encuesta Larga'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
