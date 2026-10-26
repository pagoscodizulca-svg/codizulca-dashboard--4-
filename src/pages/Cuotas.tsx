import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { MonthProgressBar, MainTab, ViewLevel } from '../components/cuotas/MonthProgressBar';
import { RubrosActivationTable } from '../components/cuotas/RubrosActivationTable';
import { ActivacionClientesSubmodule } from '../components/cuotas/ActivacionClientesSubmodule';
import { MonthlyVolumeHistoryTable } from '../components/cuotas/MonthlyVolumeHistoryTable';
import { SkuVolumeSubmodule } from '../components/cuotas/SkuVolumeSubmodule';
import { ParetoSubmodule } from '../components/cuotas/ParetoSubmodule';
import { ShareCuotasModal } from '../components/cuotas/ShareCuotasModal';
import { INITIAL_SELLERS_ACTIVATION, SellerActivationRow } from '../components/cuotas/cuotasData';
import { getSellerMetadata, normalizeSellerName } from '../components/cuotas/sellerSupervisorMap';
import { RegionalManagerAuditSubmodule } from '../components/cuotas/regional/RegionalManagerAuditSubmodule';
import { calculateMonthWorkingProgress } from '../components/cuotas/volumeQuotasData';

export const Cuotas: React.FC = () => {
  const autoProgress = calculateMonthWorkingProgress();
  const currentPeriod = `${autoProgress.year}-${String(autoProgress.month).padStart(2, '0')}`;
  const [activeTab, setActiveTab] = useState<MainTab>('activacion');
  const [activeView, setActiveView] = useState<ViewLevel>('vendedor');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sellers, setSellers] = useState<SellerActivationRow[]>(INITIAL_SELLERS_ACTIVATION);

  const [diasLaborables, setDiasLaborables] = useState<number>(autoProgress.diasLaborables);
  const [diasTranscurridos, setDiasTranscurridos] = useState<number>(autoProgress.diasTranscurridos);
  const [isCustomCutoff, setIsCustomCutoff] = useState<boolean>(false);

  const handleUpdateProgress = (newLaborables: number, newTranscurridos: number, isCustom: boolean) => {
    setDiasLaborables(newLaborables);
    setDiasTranscurridos(newTranscurridos);
    setIsCustomCutoff(isCustom);
  };

  // Sincronización en vivo desde la pestaña "Cuotas de Activacion" del Google Sheet
  useEffect(() => {
    let isMounted = true;
    const syncActivationFromSheet = async () => {
      try {
        // Fetch Cuotas de Activacion
        let csvText = '';
        try {
          const res = await fetch('/api/sheets?sheet=' + encodeURIComponent('Cuotas de Activacion'));
          if (res.ok) csvText = await res.text();
        } catch {
          // fallback
        }
        if (!csvText) {
          const res2 = await fetch('https://docs.google.com/spreadsheets/d/16pU4iEcNU_1j6sB7rZbshu2PM8OyH5hI7a24-vYO7P0/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent('Cuotas de Activacion'));
          if (res2.ok) csvText = await res2.text();
        }

        if (csvText && isMounted) {
          const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: true });
          const rows = parsed.data as string[][];
          if (rows.length > 1) {
            const parseNum = (v: any) => {
              if (!v) return 0;
              const n = parseFloat(String(v).replace(/,/g, '').trim());
              return isNaN(n) ? 0 : n;
            };

            const sheetMap = new Map<string, {
              cartera: number;
              aceite: { meta: number; activados: number };
              azucar: { meta: number; activados: number };
              pollo: { meta: number; activados: number };
              estandarAsturias: { meta: number; activados: number };
              mortadelaSalpicaoAsturias: { meta: number; activados: number };
            }>();

            for (let i = 1; i < rows.length; i++) {
              const r = rows[i];
              const rawName = (r[0] || '').trim();
              if (!rawName || rawName.toUpperCase() === 'VENDEDOR' || rawName.toUpperCase().includes('TOTAL')) continue;
              const cleanName = normalizeSellerName(rawName);
              const existing = sheetMap.get(cleanName);
              if (existing) {
                existing.cartera += parseNum(r[1]);
                existing.aceite.meta += parseNum(r[2]);
                existing.aceite.activados += parseNum(r[3]);
                existing.azucar.meta += parseNum(r[4]);
                existing.azucar.activados += parseNum(r[5]);
                existing.pollo.meta += parseNum(r[6]);
                existing.pollo.activados += parseNum(r[7]);
                existing.estandarAsturias.meta += parseNum(r[8]);
                existing.estandarAsturias.activados += parseNum(r[9]);
                existing.mortadelaSalpicaoAsturias.meta += parseNum(r[10]);
                existing.mortadelaSalpicaoAsturias.activados += parseNum(r[11]);
              } else {
                sheetMap.set(cleanName, {
                  cartera: parseNum(r[1]),
                  aceite: { meta: parseNum(r[2]), activados: parseNum(r[3]) },
                  azucar: { meta: parseNum(r[4]), activados: parseNum(r[5]) },
                  pollo: { meta: parseNum(r[6]), activados: parseNum(r[7]) },
                  estandarAsturias: { meta: parseNum(r[8]), activados: parseNum(r[9]) },
                  mortadelaSalpicaoAsturias: { meta: parseNum(r[10]), activados: parseNum(r[11]) },
                });
              }
            }

            if (sheetMap.size > 0) {
              const mergedSellers: SellerActivationRow[] = INITIAL_SELLERS_ACTIVATION.map((baseRow) => {
                const live = sheetMap.get(baseRow.vendedor);
                if (!live) return baseRow;
                return {
                  ...baseRow,
                  cartera: baseRow.cartera,
                  rubros: {
                    aceite: live.aceite,
                    azucar: live.azucar,
                    pollo: live.pollo,
                    estandarAsturias: live.estandarAsturias,
                    mortadelaSalpicaoAsturias: live.mortadelaSalpicaoAsturias,
                  },
                };
              });
              setSellers(mergedSellers);
            }
          }
        }
      } catch (err) {
        console.warn('Using initial sellers activation fallback:', err);
      }
    };

    syncActivationFromSheet();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 font-sans text-zinc-100 max-w-[1600px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-widest text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            CUOTAS & METAS
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Monitoreo comercial de metas de activación de rubros, volumen de ventas y auditoría regional ({currentPeriod}).
          </p>
        </div>
      </div>

      {/* BLOQUE 1: Progreso del Mes y Barra de Subpestañas */}
      <MonthProgressBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeView={activeView}
        onViewChange={setActiveView}
        onShare={() => setIsShareOpen(true)}
        diasLaborables={diasLaborables}
        diasTranscurridos={diasTranscurridos}
        isCustomCutoff={isCustomCutoff}
        onUpdateProgress={handleUpdateProgress}
      />

      {/* VISTA SUBMÓDULO GERENTE REGIONAL: AUDITORÍA Y EVALUACIÓN DE SUPERVISORES Y VENDEDORES */}
      {activeView === 'gerente' ? (
        activeTab === 'pareto' ? (
          <ParetoSubmodule />
        ) : activeTab === 'volumen_sku' ? (
          <SkuVolumeSubmodule />
        ) : activeTab === 'activacion_clientes' ? (
          <ActivacionClientesSubmodule
            viewLevel={activeView}
            diasLaborables={diasLaborables}
            diasTranscurridos={diasTranscurridos}
          />
        ) : (
          <RegionalManagerAuditSubmodule
            activeTab={activeTab}
            onTabChange={setActiveTab}
            sellers={sellers}
            diasLaborables={diasLaborables}
            diasTranscurridos={diasTranscurridos}
          />
        )
      ) : (
        <>
          {/* BLOQUE 2: Cuadro Detallado con los Rubros a Activar */}
          {activeTab === 'activacion' && (
            <RubrosActivationTable
              sellers={sellers}
              viewLevel={activeView}
            />
          )}

          {/* PESTAÑA ACTIVACIÓN POR CLIENTES */}
          {activeTab === 'activacion_clientes' && (
            <ActivacionClientesSubmodule
              viewLevel={activeView}
              diasLaborables={diasLaborables}
              diasTranscurridos={diasTranscurridos}
            />
          )}

          {/* PESTAÑA VOLUMEN CON HISTORIAL Y FILTRO MULTISELECCIÓN DE MESES */}
          {activeTab === 'volumen' && (
            <MonthlyVolumeHistoryTable
              viewLevel={activeView}
              onOpenSkuVolume={() => setActiveTab('volumen_sku')}
              diasLaborables={diasLaborables}
              diasTranscurridos={diasTranscurridos}
            />
          )}

          {/* SUBMÓDULO VOLUMEN POR SKU (TODOS LOS PRODUCTOS + DIAGNÓSTICO POR VENDEDOR) */}
          {activeTab === 'volumen_sku' && <SkuVolumeSubmodule />}

          {/* PESTAÑA PARETO (OPCIÓN 1: DIMENSIONES CONMUTABLES 80/20) */}
          {activeTab === 'pareto' && <ParetoSubmodule />}
        </>
      )}

      {/* Modal Compartir */}
      <ShareCuotasModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        activeTab={activeTab}
        activeView={activeView}
        sellers={sellers}
        diasLaborables={diasLaborables}
        diasTranscurridos={diasTranscurridos}
      />
    </div>
  );
};
