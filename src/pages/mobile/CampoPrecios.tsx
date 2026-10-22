import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Tag,
  DollarSign,
  TrendingUp,
  Camera,
  Plus,
  Trash2,
  CheckCircle2,
  Info,
  Check,
  AlertCircle
} from 'lucide-react';
import {
  CODIZULCA_PRODUCTS,
  COMPETITOR_BRANDS,
  FREQUENT_STORES,
  OFFICIAL_BCV_RATE,
  campoService,
  PriceSurveyPayload,
  PromoterProfile
} from '../../lib/campoService';
import { CampoStoreSelector } from '../../components/mobile/CampoStoreSelector';
import { DecimalInput } from '../../components/mobile/DecimalInput';
import { STORAGE_KEY_ACTIVE_STORE } from '../../lib/checkinsService';

export const CampoPrecios: React.FC<{ activePromoterName?: string }> = ({
  activePromoterName
}) => {
  const context = useOutletContext<{
    activePromoter?: PromoterProfile;
    isOnline?: boolean;
    pendingQueueCount?: number;
  }>();

  const activePromoter = context?.activePromoter || campoService.getActivePromoter();

  // Selecciona el PDV activo de ruta/asistencia o el Alkosto asignado a la promotora fija si corresponde
  const getInitialStore = () => {
    try {
      const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE_STORE);
      if (savedActive && savedActive.trim()) {
        return savedActive.trim();
      }
    } catch {}
    if (activePromoter?.assignedStore) {
      const cleanAssigned = activePromoter.assignedStore.toUpperCase();
      const matched = FREQUENT_STORES.find(s => {
        const cleanS = s.toUpperCase();
        return cleanS.includes(cleanAssigned) || (cleanAssigned.includes('ALKOSTO') && cleanAssigned.includes(cleanS.replace('ALKOSTO DONDE COMPRAR ES GANAR, C.A.', '').replace(/[()]/g, '').trim()));
      });
      if (matched) return matched;
    }
    return FREQUENT_STORES[0];
  };

  const [storeName, setStoreName] = useState<string>(getInitialStore);
  const [selectedProduct, setSelectedProduct] = useState(CODIZULCA_PRODUCTS[0]);
  const [ownPriceUsd, setOwnPriceUsd] = useState<number>(CODIZULCA_PRODUCTS[0].defaultPriceUsd);
  const [bcvRate, setBcvRate] = useState<number>(OFFICIAL_BCV_RATE);

  // Matriz Multicompetidor (Hasta 3 Marcas)
  const [competitors, setCompetitors] = useState<Array<{ name: string; priceUsd: number }>>([
    { name: COMPETITOR_BRANDS[0], priceUsd: Number((CODIZULCA_PRODUCTS[0].defaultPriceUsd * 1.08).toFixed(2)) },
    { name: COMPETITOR_BRANDS[1], priceUsd: Number((CODIZULCA_PRODUCTS[0].defaultPriceUsd * 0.95).toFixed(2)) }
  ]);

  const [priceTagPhoto, setPriceTagPhoto] = useState<string | null>(null);
  const [observations, setObservations] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [isOfflineSaved, setIsOfflineSaved] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Al cambiar producto, actualiza precio sugerido
  const handleProductChange = (prodId: string) => {
    const prod = CODIZULCA_PRODUCTS.find((p) => p.id === prodId) || CODIZULCA_PRODUCTS[0];
    setSelectedProduct(prod);
    setOwnPriceUsd(prod.defaultPriceUsd);
  };

  const ownPriceBs = Number((ownPriceUsd * bcvRate).toFixed(2));

  // Manejo de competidores
  const addCompetitor = () => {
    if (competitors.length >= 3) return;
    const remaining = COMPETITOR_BRANDS.filter(b => !competitors.some(c => c.name === b));
    const nextBrand = remaining[0] || 'Competidor ' + (competitors.length + 1);
    setCompetitors([...competitors, { name: nextBrand, priceUsd: ownPriceUsd }]);
  };

  const updateCompetitor = (index: number, key: 'name' | 'priceUsd', val: any) => {
    setCompetitors(competitors.map((c, i) => i === index ? { ...c, [key]: val } : c));
  };

  const removeCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index));
  };

  // Captura de foto del fleje / etiqueta
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = Math.round((img.height * 800) / img.width);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setPriceTagPhoto(canvas.toDataURL('image/jpeg', 0.7));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Guardar Monitoreo de Precios
  const handleSave = async () => {
    if (isSubmitting) return;
    if (!ownPriceUsd || ownPriceUsd <= 0) {
      alert('Ingresa el precio de góndola de Codizulca.');
      return;
    }

    setIsSubmitting(true);
    try {
      const validCompetitors = competitors.filter(
        (c) => (c.name && c.name.trim() !== '') || Number(c.priceUsd) > 0
      );
      const compPayload = validCompetitors.map((c) => {
        const cleanPrice = Number(c.priceUsd) || 0;
        const pBs = Number((cleanPrice * bcvRate).toFixed(2));
        const diffPercent = ownPriceUsd > 0 && cleanPrice > 0
          ? Number((((cleanPrice - ownPriceUsd) / ownPriceUsd) * 100).toFixed(1))
          : 0;
        return {
          name: (c.name || 'Competidor').trim(),
          priceUsd: cleanPrice,
          priceBs: pBs,
          diffPercent
        };
      });

      const generatedId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'PRICE-' + Date.now().toString().slice(-6);

      const promoterFinal = activePromoterName || activePromoter?.name || campoService.getActivePromoter().name;
      const payload: PriceSurveyPayload = {
        id: generatedId,
        date: new Date().toISOString(),
        store: storeName,
        promoter: promoterFinal,
        creatorId: activePromoter?.email || activePromoter?.id || promoterFinal,
        productName: selectedProduct.name,
        ownPriceUsd,
        ownPriceBs,
        bcvRate,
        competitors: compPayload,
        photoPriceTag: priceTagPhoto || undefined,
        observations
      };

      const res = await campoService.savePriceSurvey(payload);
      setSaveSuccess(true);
      setIsOfflineSaved(res.offline);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setPriceTagPhoto(null);
    setObservations('');
    setSaveSuccess(false);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Encabezado */}
      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/40 text-red-500 flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-black text-white uppercase tracking-wider">
                Monitoreo de Precios en Góndola
              </h2>
              <p className="text-[10px] text-neutral-400 font-mono">
                Matriz Multicompetidor & Tasa Oficial BCV
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-[10px] font-mono font-bold">
            BCV: {bcvRate} Bs/$
          </span>
        </div>

        {/* PDV Selector */}
        <div className="mt-3 pt-3 border-t border-neutral-800/80">
          <CampoStoreSelector
            value={storeName}
            onChange={(val) => {
              setStoreName(val);
              try {
                localStorage.setItem(STORAGE_KEY_ACTIVE_STORE, val);
              } catch {}
            }}
            label="Punto de Venta / Comercio:"
          />
        </div>
      </div>

      {saveSuccess ? (
        <div className="bg-[#0d0d0d] border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">¡Precios Registrados!</h3>
            <p className="text-xs text-neutral-400 mt-1">
              {isOfflineSaved
                ? 'Almacenado localmente en tu smartphone. Se enviará tan pronto haya señal.'
                : 'Sincronizado con la base central de Trade Marketing Codizulca.'}
            </p>
          </div>

          <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 text-xs text-left space-y-1">
            <p className="text-neutral-300"><strong>{selectedProduct.name}</strong></p>
            <p className="text-emerald-400 font-mono font-bold">${ownPriceUsd} USD • Bs. {ownPriceBs}</p>
            <p className="text-neutral-500 text-[10px]">{competitors.length} marcas competidoras comparadas</p>
          </div>

          <button
            onClick={handleReset}
            className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer"
          >
            Registrar Otro Producto
          </button>
        </div>
      ) : (
        <>
          {/* 1. SELECCIÓN DE PRODUCTO PROPIO (CODIZULCA) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block">
              1. Producto Evaluado (Catálogo Oficial):
            </span>

            <div>
              <select
                value={selectedProduct.id}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full bg-[#171717] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-bold"
              >
                {CODIZULCA_PRODUCTS.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name.toLowerCase().includes(prod.weight.toLowerCase())
                      ? prod.name
                      : `${prod.name} (${prod.weight})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Input de Precio en Góndola */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                  Precio en Estante (USD $):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-bold text-xs">$</span>
                  <DecimalInput
                    value={ownPriceUsd}
                    onValueChange={setOwnPriceUsd}
                    ariaLabel="Precio en estante USD"
                    className="w-full bg-[#171717] border border-neutral-800 rounded-xl pl-7 pr-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                  Equivalente en Bs.:
                </label>
                <div className="w-full bg-[#171717] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold flex items-center justify-between">
                  <span>Bs. {ownPriceBs}</span>
                  <span className="text-[9px] text-neutral-500 font-normal">BCV</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. MATRIZ MULTICOMPETIDOR (HASTA 3 MARCAS) */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
                2. Matriz de Competencia en Anaquel ({competitors.length}/3 marcas):
              </span>
              {competitors.length < 3 && (
                <button
                  type="button"
                  onClick={addCompetitor}
                  className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3 h-3 text-red-500" />
                  <span>Añadir</span>
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {competitors.map((comp, idx) => {
                const compBs = Number((comp.priceUsd * bcvRate).toFixed(2));
                const diffPercent = ownPriceUsd > 0
                  ? Number((((comp.priceUsd - ownPriceUsd) / ownPriceUsd) * 100).toFixed(1))
                  : 0;

                return (
                  <div key={idx} className="p-3 bg-[#171717] border border-neutral-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={COMPETITOR_BRANDS.includes(comp.name) ? comp.name : '__CUSTOM__'}
                        onChange={(e) => {
                          if (e.target.value !== '__CUSTOM__') {
                            updateCompetitor(idx, 'name', e.target.value);
                          }
                        }}
                        className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white font-bold focus:outline-none max-w-[165px]"
                      >
                        {COMPETITOR_BRANDS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                        {!COMPETITOR_BRANDS.includes(comp.name) && (
                          <option value="__CUSTOM__">Otra marca / Personalizado</option>
                        )}
                      </select>

                      {/* Badge de Diferencial de Precio */}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        diffPercent > 0
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                          : diffPercent < 0
                          ? 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                          : 'bg-neutral-800 text-neutral-300'
                      }`}>
                        {diffPercent > 0 ? `+${diffPercent}% más caro` : diffPercent < 0 ? `${diffPercent}% más barato` : 'Mismo precio'}
                      </span>

                      {competitors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCompetitor(idx)}
                          className="text-neutral-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={comp.name}
                        onChange={(e) => updateCompetitor(idx, 'name', e.target.value)}
                        placeholder="Marca o producto competidor (ej. Plumrose / Pantera 400gr)"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 placeholder-neutral-500 font-bold focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[9px] text-neutral-500 block">Precio Estante ($):</span>
                        <DecimalInput
                          value={comp.priceUsd}
                          onValueChange={(v) => updateCompetitor(idx, 'priceUsd', v)}
                          ariaLabel={`Precio estante competidor ${comp.name}`}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-neutral-500 block">Equivalente Bs:</span>
                        <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-lg px-2 py-1 text-xs text-neutral-300 font-mono">
                          Bs. {compBs}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. FOTO DE SOPORTE DEL FLEJE / ETIQUETA */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
              3. Foto de Soporte del Fleje / Etiqueta:
            </span>

            {priceTagPhoto ? (
              <div className="relative aspect-video rounded-xl overflow-hidden border border-neutral-700 bg-black">
                <img src={priceTagPhoto} alt="Fleje de precio" className="w-full h-full object-cover" />
                <button
                  onClick={() => setPriceTagPhoto(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 text-white hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-neutral-800 hover:border-neutral-700 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center bg-[#171717]/50 transition-colors">
                <Camera className="w-6 h-6 text-red-500" />
                <span className="text-xs font-bold text-white">Capturar Foto del Fleje</span>
                <span className="text-[10px] text-neutral-500">Comprobante de auditoría de precio</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />
              </label>
            )}

            {/* Observaciones */}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                Notas / Promociones Activas:
              </label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Ej. Promoción 2x1 en competidor, fleje desactualizado, etc..."
                rows={2}
                className="w-full bg-[#171717] border border-neutral-800 rounded-xl p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Botón Guardar */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Sincronizando Precios...' : 'Guardar Monitoreo de Precios'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
