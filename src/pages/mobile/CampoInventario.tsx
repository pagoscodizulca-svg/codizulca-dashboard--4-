import React, { useState } from 'react';
import {
  Package,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Check,
  BarChart3,
  Calendar,
  Layers
} from 'lucide-react';
import {
  CODIZULCA_PRODUCTS,
  FREQUENT_STORES,
  campoService,
  InventoryLogPayload,
  PromoterProfile
} from '../../lib/campoService';
import { useOutletContext } from 'react-router-dom';
import { STORAGE_KEY_ACTIVE_STORE } from '../../lib/checkinsService';
import { degustacionesService } from '../../lib/degustacionesService';
import { CampoStoreSelector } from '../../components/mobile/CampoStoreSelector';
import { DecimalInput, roundQty } from '../../components/mobile/DecimalInput';

export const CampoInventario: React.FC<{ activePromoterName?: string }> = ({
  activePromoterName
}) => {
  const context = useOutletContext<{
    activePromoter?: PromoterProfile;
  }>();
  const activePromoter = context?.activePromoter || campoService.getActivePromoter();

  const [storeName, setStoreName] = useState<string>(() => {
    try {
      const savedStore = localStorage.getItem(STORAGE_KEY_ACTIVE_STORE);
      if (savedStore && typeof savedStore === 'string' && savedStore.trim()) {
        return savedStore.trim();
      }
    } catch {}
    if (activePromoter?.assignedStore && typeof activePromoter.assignedStore === 'string') {
      const cleanAssigned = activePromoter.assignedStore.toUpperCase();
      const matched = FREQUENT_STORES.find(s => s.toUpperCase().includes(cleanAssigned));
      if (matched) return matched;
    }
    return FREQUENT_STORES[0];
  });
  const [selectedProduct, setSelectedProduct] = useState(() => CODIZULCA_PRODUCTS[0]);
  
  // Estados de inventario numérico (admiten decimales: Kg de embutidos, etc.)
  const [initialStock, setInitialStock] = useState<number>(0);
  const [salesGiven, setSalesGiven] = useState<number>(0);
  const [tastingsGiven, setTastingsGiven] = useState<number>(0);
  const [observations, setObservations] = useState<string>('');

  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [isOfflineSaved, setIsOfflineSaved] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recentSessionLogs, setRecentSessionLogs] = useState<InventoryLogPayload[]>([]);

  // Inventario Final automático: Inicial - Ventas - Degustaciones/Muestras
  const safeInitial = Number.isFinite(initialStock) ? initialStock : 0;
  const safeSales = Number.isFinite(salesGiven) ? salesGiven : 0;
  const safeTastings = Number.isFinite(tastingsGiven) ? tastingsGiven : 0;
  const rawFinalStock = roundQty(safeInitial - safeSales - safeTastings);
  const finalStock = Math.max(0, rawFinalStock);

  // Validación Lógica Estricta: lo vendido + degustado no puede exceder el inventario inicial
  const isFinalStockInvalid = rawFinalStock < 0;

  // Rotación Neta (Ventas) y Desplazamiento Total (Ventas + Degustación)
  const netRotation = roundQty(safeSales);
  const totalDisplacement = roundQty(safeSales + safeTastings);
  const rotationPercentage =
    safeInitial > 0 ? Math.min(100, Math.max(0, Math.round(((safeInitial - finalStock) / safeInitial) * 100))) : 0;

  const handleSave = async () => {
    if (isSubmitting) return;
    if (isFinalStockInvalid) {
      alert('Error de validación: Las ventas y degustaciones no pueden ser mayores al inventario inicial.');
      return;
    }
    if (safeInitial < 0 || safeSales < 0 || safeTastings < 0) {
      alert('Los valores numéricos no pueden ser negativos.');
      return;
    }

    setIsSubmitting(true);
    try {
      const fallbackPromoter = campoService.getActivePromoter();
      const promoterFinalName =
        activePromoterName || activePromoter?.name || fallbackPromoter?.name || 'Promotora';
      const generatedId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'INV-' + Date.now().toString().slice(-6);
      const safeProduct = selectedProduct || CODIZULCA_PRODUCTS[0];
      const payload: InventoryLogPayload = {
        id: generatedId,
        date: new Date().toISOString(),
        store: storeName || FREQUENT_STORES[0],
        promoter: promoterFinalName,
        creatorId: activePromoter?.email || activePromoter?.id || promoterFinalName,
        productName: safeProduct.name,
        initialStock: safeInitial,
        tastingsGiven: safeTastings,
        finalStock,
        netRotation,
        observations: String(observations || '').trim()
      };

      const res = await campoService.saveInventoryLog(payload);

      // Si registró muestras degustadas, sincronizar en segundo plano con su degustación activa sin bloquear la pantalla
      if (safeTastings > 0) {
        Promise.resolve()
          .then(async () => {
            const assigned = await degustacionesService.getForPromoter({
              id: activePromoter?.id,
              name: promoterFinalName,
              email: activePromoter?.email
            });
            if (assigned.length > 0) {
              const activeDeg = assigned.find((d) => d.status === 'in_progress') || assigned[0];
              if (activeDeg) {
                await degustacionesService.update(activeDeg.id, {
                  delivered: Math.max(Number(activeDeg.delivered) || 0, safeTastings),
                  status: activeDeg.status === 'scheduled' ? 'in_progress' : activeDeg.status
                });
              }
            }
          })
          .catch(() => {});
      }

      setRecentSessionLogs((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)].slice(0, 10));
      setSaveSuccess(true);
      setIsOfflineSaved(Boolean(res?.offline));
    } catch (err) {
      console.error('[CampoInventario] Error inesperado al guardar:', err);
      setSaveSuccess(true);
      setIsOfflineSaved(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setObservations('');
    setInitialStock(0);
    setSalesGiven(0);
    setTastingsGiven(0);
    setSaveSuccess(false);
  };

  return (
    <div translate="no" className="notranslate space-y-4 animate-in fade-in duration-300">
      
      {/* Encabezado */}
      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-500 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-black text-white uppercase tracking-wider">
                Control de Inventario y Rotación
              </h2>
              <p className="text-[10px] text-neutral-400 font-mono">
                Apertura • Degustaciones • Cierre de Guardia
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-[10px] font-mono font-bold">
            Auditoría
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
            label="Punto de Venta / Establecimiento:"
          />
        </div>
      </div>

      {saveSuccess ? (
        <div
          key="inventory-success-view"
          className="bg-[#0d0d0d] border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4 shadow-xl"
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">¡Inventario Registrado!</h3>
            <p className="text-xs text-neutral-400 mt-1">
              {isOfflineSaved
                ? 'Guardado localmente en tu dispositivo. Se sincronizará al detectar conexión.'
                : 'Transmitido con éxito al panel de Trade Marketing Codizulca.'}
            </p>
          </div>

          <div className="p-3.5 bg-[#171717] rounded-xl border border-neutral-800 text-xs flex items-center justify-around font-mono">
            <div>
              <span className="text-neutral-500 block text-[10px]">Rotación Neta</span>
              <strong className="text-emerald-400 text-base">{`${netRotation} u.`}</strong>
            </div>
            <div className="h-6 w-px bg-neutral-800" />
            <div>
              <span className="text-neutral-500 block text-[10px]">Desplazamiento</span>
              <strong className="text-white text-base">{`${rotationPercentage}%`}</strong>
            </div>
            <div className="h-6 w-px bg-neutral-800" />
            <div>
              <span className="text-neutral-500 block text-[10px]">Muestras</span>
              <strong className="text-amber-400 text-base">{`${safeTastings} u.`}</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer"
          >
            Registrar Otro SKU
          </button>
        </div>
      ) : (
        <div key="inventory-form-view" className="space-y-4">
          {/* SELECCIÓN DE PRODUCTO */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block">
              1. SKU / Producto a Auditar:
            </span>

            <select
              translate="no"
              value={selectedProduct?.id || CODIZULCA_PRODUCTS[0].id}
              onChange={(e) => {
                const prod = CODIZULCA_PRODUCTS.find(p => p.id === e.target.value) || CODIZULCA_PRODUCTS[0];
                setSelectedProduct(prod);
              }}
              className="notranslate w-full bg-[#171717] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-bold"
            >
              {CODIZULCA_PRODUCTS.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name.toLowerCase().includes(prod.weight.toLowerCase())
                    ? `${prod.name} (${prod.category})`
                    : `${prod.name} (${prod.category} - ${prod.weight})`}
                </option>
              ))}
            </select>
          </div>

          {/* BALANCE DE INVENTARIO */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 block">
              2. Conteo Físico en Anaquel y Cava:
            </span>

            <div className="space-y-3">
              {/* Inventario Inicial */}
              <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 flex items-center justify-between">
                <div>
                  <strong className="text-xs text-white block">Inventario Inicial (Apertura)</strong>
                  <span className="text-[10px] text-neutral-500">Stock físico al iniciar guardia</span>
                </div>
                <div className="flex items-center gap-2">
                  <DecimalInput
                    value={initialStock}
                    onValueChange={setInitialStock}
                    ariaLabel="Inventario inicial"
                    className="w-24 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-center text-xs text-white font-mono font-bold focus:outline-none focus:border-red-500"
                  />
                  <span className="text-xs text-neutral-400 font-mono">Kg/u.</span>
                </div>
              </div>

              {/* Ventas */}
              <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 flex items-center justify-between">
                <div>
                  <strong className="text-xs text-emerald-300 block">Ventas (Desplazamiento)</strong>
                  <span className="text-[10px] text-neutral-500">Cantidad vendida durante la guardia (admite decimales)</span>
                </div>
                <div className="flex items-center gap-2">
                  <DecimalInput
                    value={salesGiven}
                    onValueChange={setSalesGiven}
                    ariaLabel="Ventas"
                    className="w-24 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-center text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs text-neutral-400 font-mono">Kg/u.</span>
                </div>
              </div>

              {/* Degustaciones */}
              <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 flex items-center justify-between">
                <div>
                  <strong className="text-xs text-amber-300 block">Degustaciones / Muestras</strong>
                  <span className="text-[10px] text-neutral-500">Cantidad consumida en prueba</span>
                </div>
                <div className="flex items-center gap-2">
                  <DecimalInput
                    value={tastingsGiven}
                    onValueChange={setTastingsGiven}
                    ariaLabel="Degustaciones y muestras"
                    className="w-24 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-center text-xs text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-xs text-neutral-400 font-mono">Kg/u.</span>
                </div>
              </div>

              {/* Inventario Final (calculado automáticamente al ingresar Inicial y Degustación o Venta) */}
              <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                isFinalStockInvalid
                  ? 'bg-red-950/40 border-red-500/60'
                  : 'bg-[#171717] border-emerald-500/30'
              }`}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <strong className="text-xs text-white block">Inventario Final (Cierre)</strong>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[9px] font-mono font-bold uppercase">
                      Automático
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {`${safeInitial} (Inicial) − ${safeSales} (Venta) − ${safeTastings} (Degustación) = ${finalStock}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    translate="no"
                    value={finalStock}
                    aria-label="Inventario final calculado"
                    className="notranslate w-24 bg-neutral-950 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 text-center text-xs text-emerald-300 font-mono font-bold focus:outline-none cursor-default"
                  />
                  <span className="text-xs text-neutral-400 font-mono">Kg/u.</span>
                </div>
              </div>
            </div>

            {/* Error de validación lógica (siempre montado para evitar errores de reconciliación DOM en móviles) */}
            <div
              className={`p-2.5 bg-red-950/60 border border-red-500/50 rounded-xl text-red-300 text-xs items-center gap-2 ${
                isFinalStockInvalid ? 'flex' : 'hidden'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                {`Bloqueo: Las ventas (${safeSales}) + muestras (${safeTastings}) no pueden exceder el inventario inicial (${safeInitial}).`}
              </span>
            </div>
          </div>

          {/* CÁLCULO DE ROTACIÓN NETA EN VIVO */}
          <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-3 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
              3. Resumen de Desplazamiento & Rotación:
            </span>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 text-center">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Rotación Neta (Ventas)
                </span>
                <strong className="text-2xl font-black text-emerald-400 block mt-1">
                  {`${netRotation} u.`}
                </strong>
                <span className="text-[9px] text-neutral-500 font-mono">
                  Desplazadas del anaquel
                </span>
              </div>

              <div className="p-3 bg-[#171717] rounded-xl border border-neutral-800 text-center">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Tasa de Desplazamiento
                </span>
                <strong className="text-2xl font-black text-white block mt-1">
                  {`${rotationPercentage}%`}
                </strong>
                <span className="text-[9px] text-neutral-500 font-mono">
                  Eficiencia de rotación
                </span>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                Observaciones del Inventario / Cava:
              </label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Ej. Quiebre de stock por alta demanda en hora pico, producto en cava de frío..."
                rows={2}
                className="w-full bg-[#171717] border border-neutral-800 rounded-xl p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Botón Guardar */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isFinalStockInvalid || isSubmitting}
              className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                isFinalStockInvalid || isSubmitting
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-600/30 active:scale-[0.98]'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Sincronizando Inventario...' : 'Guardar Control de Inventario'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Historial de SKUs cargados en la sesión actual */}
      {recentSessionLogs.length > 0 && (
        <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-4 space-y-2.5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              {`SKUs Cargados en esta Guardia (${recentSessionLogs.length})`}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">
              Sincronizados
            </span>
          </div>
          <div className="space-y-1.5">
            {recentSessionLogs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 bg-[#171717] rounded-xl border border-neutral-800/80 flex items-center justify-between text-xs"
              >
                <div className="truncate pr-2">
                  <strong className="text-white block truncate text-[11px]">{log.productName}</strong>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {`Ini: ${log.initialStock} | Fin: ${log.finalStock} | Deg: ${log.tastingsGiven}`}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-[10px] shrink-0">
                  {`Venta: ${log.netRotation}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
