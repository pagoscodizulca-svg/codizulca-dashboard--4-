import React, { useState, useMemo } from 'react';
import { X, Copy, Check, Share2, Download, FileSpreadsheet } from 'lucide-react';
import { SellerActivationRow, RUBROS_CONFIG, filterActivationSellers } from './cuotasData';
import { MainTab, ViewLevel } from './MonthProgressBar';

interface ShareCuotasModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: MainTab;
  activeView: ViewLevel;
  sellers: SellerActivationRow[];
  diasLaborables: number;
  diasTranscurridos: number;
}

export const ShareCuotasModal: React.FC<ShareCuotasModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  activeView,
  sellers,
  diasLaborables,
  diasTranscurridos,
}) => {
  const [copied, setCopied] = useState(false);

  const effectiveSellers = useMemo(
    () => (activeTab === 'activacion' ? filterActivationSellers(sellers) : sellers),
    [activeTab, sellers]
  );

  if (!isOpen) return null;

  const pctMes = ((diasTranscurridos / diasLaborables) * 100).toFixed(1);

  // Generate text report
  const generateReportText = () => {
    let report = `📊 *REPORTE DE ACTIVACIÓN & CUOTAS*\n`;
    report += `📅 Progreso del Mes: ${pctMes}% (${diasTranscurridos}/${diasLaborables} días laborables)\n`;
    report += `Vista: ${activeView.toUpperCase()} | Pestaña: ${activeTab.toUpperCase()}\n\n`;
    report += `🎯 *RESUMEN DE ACTIVACIONES POR RUBRO:*\n`;

    RUBROS_CONFIG.forEach((r) => {
      const totalMeta = effectiveSellers.reduce((acc, s) => acc + s.rubros[r.key].meta, 0);
      const totalAct = effectiveSellers.reduce((acc, s) => acc + s.rubros[r.key].activados, 0);
      const pct = totalMeta > 0 ? ((totalAct / totalMeta) * 100).toFixed(1) : '0.0';
      report += `• ${r.label}: ${totalAct}/${totalMeta} (${pct}%)\n`;
    });

    report += `\n👥 *TOP VENDEDORES:*\n`;
    effectiveSellers.slice(0, 4).forEach((s) => {
      const actTotal = RUBROS_CONFIG.reduce((acc, r) => acc + s.rubros[r.key].activados, 0);
      const metaTotal = RUBROS_CONFIG.reduce((acc, r) => acc + s.rubros[r.key].meta, 0);
      const pct = metaTotal > 0 ? ((actTotal / metaTotal) * 100).toFixed(1) : '0.0';
      report += `- ${s.vendedor} (${s.supervisor}): ${pct}%\n`;
    });

    return report;
  };

  const handleCopy = () => {
    const text = generateReportText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportCSV = () => {
    let csv = 'VENDEDOR,SUPERVISOR,ZONA,REGION';
    RUBROS_CONFIG.forEach((r) => {
      csv += `,${r.label} META,${r.label} ACTIVADOS,${r.label} %`;
    });
    csv += '\n';

    sellers.forEach((s) => {
      csv += `"${s.vendedor}","${s.supervisor}","${s.zona}","${s.region}"`;
      RUBROS_CONFIG.forEach((r) => {
        const meta = s.rubros[r.key].meta;
        const act = s.rubros[r.key].activados;
        const pct = meta > 0 ? ((act / meta) * 100).toFixed(1) : '0';
        csv += `,${meta},${act},${pct}%`;
      });
      csv += '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Activacion_Rubros_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative space-y-4">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Compartir Resumen de Cumplimiento
            </h3>
            <p className="text-xs text-zinc-400">
              Genera un reporte para WhatsApp o descarga el archivo CSV.
            </p>
          </div>
        </div>

        {/* Report Preview */}
        <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 font-mono text-xs text-zinc-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
          {generateReportText()}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-md transition-all active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Texto</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white font-semibold text-xs sm:text-sm transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Descargar CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
};
