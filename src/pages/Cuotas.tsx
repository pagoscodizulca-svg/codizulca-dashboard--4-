import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import Papa from 'papaparse';
import { MonthProgressBar, MainTab, ViewLevel } from '../components/cuotas/MonthProgressBar';
import { RubrosActivationTable } from '../components/cuotas/RubrosActivationTable';
import { INITIAL_SELLERS_ACTIVATION, SellerActivationRow } from '../components/cuotas/cuotasData';
import { normalizeSellerName } from '../components/cuotas/sellerSupervisorMap';
import { calculateMonthWorkingProgress } from '../components/cuotas/volumeQuotasData';
import maestraSnapshotSeed from '../data/maestraActivaAuditSnapshot.json';
import type { MaestraAuditReport } from '../lib/maestraActivaTypes';

const ActivacionClientesSubmodule = lazy(() =>
  import('../components/cuotas/ActivacionClientesSubmodule').then((m) => ({
    default: m.ActivacionClientesSubmodule,
  }))
);
const MaestraActivaAuditSubmodule = lazy(() =>
  import('../components/cuotas/MaestraActivaAuditSubmodule').then((m) => ({
    default: m.MaestraActivaAuditSubmodule,
  }))
);
const MonthlyVolumeHistoryTable = lazy(() =>
  import('../components/cuotas/MonthlyVolumeHistoryTable').then((m) => ({
    default: m.MonthlyVolumeHistoryTable,
  }))
);
const SkuVolumeSubmodule = lazy(() =>
  import('../components/cuotas/SkuVolumeSubmodule').then((m) => ({
    default: m.SkuVolumeSubmodule,
  }))
);
const ParetoSubmodule = lazy(() =>
  import('../components/cuotas/ParetoSubmodule').then((m) => ({
    default: m.ParetoSubmodule,
  }))
);
const ShareCuotasModal = lazy(() =>
  import('../components/cuotas/ShareCuotasModal').then((m) => ({
    default: m.ShareCuotasModal,
  }))
);
const RegionalManagerAuditSubmodule = lazy(() =>
  import('../components/cuotas/regional/RegionalManagerAuditSubmodule').then((m) => ({
    default: m.RegionalManagerAuditSubmodule,
  }))
);

const SubmoduleLoadingFallback: React.FC = () => (
  <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-8 flex items-center justify-center text-zinc-400 text-sm">
    Cargando submódulo comercial...
  </div>
);

export const Cuotas: React.FC = () => {
  const autoProgress = calculateMonthWorkingProgress();
  const currentPeriod = `${autoProgress.year}-${String(autoProgress.month).padStart(2, '0')}`;
  const [activeTab, setActiveTab] = useState<MainTab>('activacion');
  const [activeView, setActiveView] = useState<ViewLevel>('vendedor');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sellers, setSellers] = useState<SellerActivationRow[]>(INITIAL_SELLERS_ACTIVATION);
  const [portfolioSyncVersion, setPortfolioSyncVersion] = useState<number>(0);
  const [maestraStats, setMaestraStats] = useState<{ totalActive: number; routesCount: number }>(() => {
    const snap = maestraSnapshotSeed as unknown as MaestraAuditReport;
    return {
      totalActive: snap?.parseMetrics?.validActiveCount || 2676,
      routesCount: snap?.parseMetrics?.sellersCount || 30,
    };
  });

  const applyMaestraCarteraToSellers = useCallback((report: MaestraAuditReport) => {
    if (!report?.sellerAuditRows?.length) return;
    const byCanonical = new Map<string, number>();
    report.sellerAuditRows.forEach((row) => {
      const key = row.canonicalSeller;
      byCanonical.set(key, (byCanonical.get(key) || 0) + row.excelActiveCount);
    });
    setSellers((prev) =>
      prev.map((s) =>
        byCanonical.has(s.vendedor)
          ? { ...s, cartera: byCanonical.get(s.vendedor)! }
          : s
      )
    );
  }, []);

  const handlePortfolioSynced = useCallback(
    (report: MaestraAuditReport) => {
      setMaestraStats({
        totalActive: report.parseMetrics.validActiveCount,
        routesCount: report.parseMetrics.sellersCount,
      });
      applyMaestraCarteraToSellers(report);
      setPortfolioSyncVersion((v) => v + 1);
    },
    [applyMaestraCarteraToSellers]
  );

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
      <Suspense fallback={<SubmoduleLoadingFallback />}>
        {activeView === 'gerente' ? (
          activeTab === 'pareto' ? (
            <ParetoSubmodule />
          ) : activeTab === 'volumen_sku' ? (
            <SkuVolumeSubmodule />
          ) : activeTab === 'auditoria_maestra' ? (
            <MaestraActivaAuditSubmodule onPortfolioSynced={handlePortfolioSynced} />
          ) : activeTab === 'activacion_clientes' ? (
            <ActivacionClientesSubmodule
              viewLevel={activeView}
              diasLaborables={diasLaborables}
              diasTranscurridos={diasTranscurridos}
              syncVersion={portfolioSyncVersion}
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
                maestraTotalActive={maestraStats.totalActive}
                maestraRoutesCount={maestraStats.routesCount}
                onOpenMaestraAudit={() => setActiveTab('auditoria_maestra')}
              />
            )}

            {/* PESTAÑA ACTIVACIÓN POR CLIENTES */}
            {activeTab === 'activacion_clientes' && (
              <ActivacionClientesSubmodule
                viewLevel={activeView}
                diasLaborables={diasLaborables}
                diasTranscurridos={diasTranscurridos}
                syncVersion={portfolioSyncVersion}
              />
            )}

            {/* PESTAÑA AUDITORÍA Y SINCRONIZACIÓN DE MAESTRA DE CLIENTES ACTIVOS */}
            {activeTab === 'auditoria_maestra' && (
              <MaestraActivaAuditSubmodule onPortfolioSynced={handlePortfolioSynced} />
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
        {isShareOpen && (
          <ShareCuotasModal
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
            activeTab={activeTab}
            activeView={activeView}
            sellers={sellers}
            diasLaborables={diasLaborables}
            diasTranscurridos={diasTranscurridos}
          />
        )}
      </Suspense>
    </div>
  );
};
