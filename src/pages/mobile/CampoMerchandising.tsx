import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Sparkles,
  FileCheck,
  Layers,
  Camera,
  PenTool,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { CampoEscaneoGondola } from './CampoEscaneoGondola';
import { PortalMerchandising } from './PortalMerchandising';
import { campoService, PromoterProfile } from '../../lib/campoService';
import { merchandisingService } from '../../lib/merchandisingService';

export const CampoMerchandising: React.FC = () => {
  const context = useOutletContext<{ activePromoter?: PromoterProfile }>();
  const activePromoter = context?.activePromoter || campoService.getActivePromoter();
  const [activeSubTab, setActiveSubTab] = useState<'escaneo_ia' | 'certificacion_firma'>('escaneo_ia');

  // Sincronizar en segundo plano cualquier informe o escaneo pendiente en el teléfono con Supabase
  useEffect(() => {
    merchandisingService.getAll(true).catch(() => {});
  }, [activePromoter?.id]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Selector Superior entre Escaneo IA y Certificación de Visita */}
      <div className="bg-[#0d0d0d] border border-neutral-800 rounded-2xl p-2 shadow-xl flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSubTab('escaneo_ia')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'escaneo_ia'
              ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>1. Escaneo Góndola (IA)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('certificacion_firma')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'certificacion_firma'
              ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <PenTool className="w-4 h-4" />
          <span>2. Certificación & Firma</span>
        </button>
      </div>

      {/* Renderizado de la Sub-Pestaña Activa */}
      {activeSubTab === 'escaneo_ia' ? (
        <CampoEscaneoGondola activePromoterName={activePromoter?.name} />
      ) : (
        <div className="text-white">
          <PortalMerchandising activePromoterName={activePromoter?.name} />
        </div>
      )}
    </div>
  );
};
