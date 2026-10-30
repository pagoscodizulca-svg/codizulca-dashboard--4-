import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  TrendingUp, 
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Users,
  FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  SellerActivationRow, 
  RUBROS_CONFIG, 
  RubroKey 
} from './cuotasData';
import { ViewLevel } from './MonthProgressBar';
import { SellerMultiSelect, SellerOption } from './SellerMultiSelect';

interface RubrosActivationTableProps {
  sellers: SellerActivationRow[];
  viewLevel: ViewLevel;
  maestraTotalActive?: number;
  maestraRoutesCount?: number;
  onOpenMaestraAudit?: () => void;
}

export const RubrosActivationTable: React.FC<RubrosActivationTableProps> = ({
  sellers,
  viewLevel,
  maestraTotalActive = 2676,
  maestraRoutesCount = 30,
  onOpenMaestraAudit,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('ALL');
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
  const [expandedSupervisors, setExpandedSupervisors] = useState<Set<string>>(new Set());

  // Vendedores disponibles dinámicamente según el supervisor seleccionado
  const availableSellers = useMemo<SellerOption[]>(() => {
    let list = sellers;
    if (supervisorFilter !== 'ALL') {
      list = list.filter((s) => s.supervisor === supervisorFilter);
    }
    const map = new Map<string, SellerOption>();
    list.forEach((s) => {
      if (!map.has(s.vendedor)) {
        map.set(s.vendedor, {
          name: s.vendedor,
          supervisor: s.supervisor,
          zona: s.zona,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sellers, supervisorFilter]);

  // Sincronización automática: al cambiar el supervisor, limpiar los vendedores que no correspondan
  useEffect(() => {
    if (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
      const availableNames = new Set(availableSellers.map((s) => s.name));
      const validSelected = selectedSellers.filter((name) => availableNames.has(name));
      if (validSelected.length !== selectedSellers.length) {
        setSelectedSellers(validSelected);
      }
    }
  }, [supervisorFilter, availableSellers]);

  // Toggle expansion of a supervisor's assigned sellers
  const toggleSupervisorExpand = (supName: string) => {
    setExpandedSupervisors((prev) => {
      const next = new Set(prev);
      if (next.has(supName)) {
        next.delete(supName);
      } else {
        next.add(supName);
      }
      return next;
    });
  };

  // Toggle expand all or collapse all supervisors
  const handleToggleAllSupervisors = (allSupervisors: string[]) => {
    if (expandedSupervisors.size === allSupervisors.length) {
      setExpandedSupervisors(new Set());
    } else {
      setExpandedSupervisors(new Set(allSupervisors));
    }
  };

  // List of unique supervisors for filtering
  const supervisorList = useMemo(() => {
    const list = Array.from(new Set(sellers.map((s) => s.supervisor)));
    return list.sort();
  }, [sellers]);

  // Filtered sellers list
  const filteredSellers = useMemo(() => {
    return sellers.filter((s) => {
      const matchSearch =
        s.vendedor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.supervisor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.zona.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSupervisor =
        supervisorFilter === 'ALL' || s.supervisor === supervisorFilter;

      let matchSellers = true;
      if (selectedSellers.length === 1 && selectedSellers[0] === '__NONE__') {
        matchSellers = false;
      } else if (selectedSellers.length > 0) {
        matchSellers = selectedSellers.includes(s.vendedor);
      }

      return matchSearch && matchSupervisor && matchSellers;
    });
  }, [sellers, searchTerm, supervisorFilter, selectedSellers]);

  // Consolidated by supervisor with sellers list
  const consolidatedBySupervisor = useMemo(() => {
    const grouped: Record<
      string,
      {
        supervisor: string;
        region: string;
        sellersCount: number;
        carteraTotal: number;
        sellers: SellerActivationRow[];
        rubros: Record<RubroKey, { meta: number; activados: number }>;
      }
    > = {};

    filteredSellers.forEach((s) => {
      if (!grouped[s.supervisor]) {
        grouped[s.supervisor] = {
          supervisor: s.supervisor,
          region: s.region,
          sellersCount: 0,
          carteraTotal: 0,
          sellers: [],
          rubros: {
            aceite: { meta: 0, activados: 0 },
            azucar: { meta: 0, activados: 0 },
            pollo: { meta: 0, activados: 0 },
            estandarAsturias: { meta: 0, activados: 0 },
            mortadelaSalpicaoAsturias: { meta: 0, activados: 0 },
          },
        };
      }

      grouped[s.supervisor].sellersCount += 1;
      grouped[s.supervisor].carteraTotal += Number(s.cartera) || 0;
      grouped[s.supervisor].sellers.push(s);
      RUBROS_CONFIG.forEach(({ key }) => {
        grouped[s.supervisor].rubros[key].meta += s.rubros[key].meta;
        grouped[s.supervisor].rubros[key].activados += s.rubros[key].activados;
      });
    });

    // Ordenar vendedores alfabéticamente dentro de cada supervisor
    Object.values(grouped).forEach((item) => {
      item.sellers.sort((a, b) => a.vendedor.localeCompare(b.vendedor));
    });

    return Object.values(grouped);
  }, [filteredSellers]);

  // Consolidated by Region (Gerente Regional)
  const consolidatedByRegion = useMemo(() => {
    const grouped: Record<
      string,
      {
        region: string;
        supervisorsCount: number;
        sellersCount: number;
        carteraTotal: number;
        rubros: Record<RubroKey, { meta: number; activados: number }>;
      }
    > = {};

    const seenSupervisorsByRegion: Record<string, Set<string>> = {};

    filteredSellers.forEach((s) => {
      if (!grouped[s.region]) {
        grouped[s.region] = {
          region: s.region,
          supervisorsCount: 0,
          sellersCount: 0,
          carteraTotal: 0,
          rubros: {
            aceite: { meta: 0, activados: 0 },
            azucar: { meta: 0, activados: 0 },
            pollo: { meta: 0, activados: 0 },
            estandarAsturias: { meta: 0, activados: 0 },
            mortadelaSalpicaoAsturias: { meta: 0, activados: 0 },
          },
        };
        seenSupervisorsByRegion[s.region] = new Set();
      }

      seenSupervisorsByRegion[s.region].add(s.supervisor);
      grouped[s.region].sellersCount += 1;
      grouped[s.region].carteraTotal += Number(s.cartera) || 0;

      RUBROS_CONFIG.forEach(({ key }) => {
        grouped[s.region].rubros[key].meta += s.rubros[key].meta;
        grouped[s.region].rubros[key].activados += s.rubros[key].activados;
      });
    });

    Object.keys(grouped).forEach((region) => {
      grouped[region].supervisorsCount = seenSupervisorsByRegion[region].size;
    });

    return Object.values(grouped);
  }, [filteredSellers]);

  const grandCarteraTotal = useMemo(
    () => filteredSellers.reduce((acc, s) => acc + (Number(s.cartera) || 0), 0),
    [filteredSellers]
  );

  // Grand Totals Calculation
  const grandTotals = useMemo(() => {
    const totals: Record<RubroKey, { meta: number; activados: number }> = {
      aceite: { meta: 0, activados: 0 },
      azucar: { meta: 0, activados: 0 },
      pollo: { meta: 0, activados: 0 },
      estandarAsturias: { meta: 0, activados: 0 },
      mortadelaSalpicaoAsturias: { meta: 0, activados: 0 },
    };

    filteredSellers.forEach((s) => {
      RUBROS_CONFIG.forEach(({ key }) => {
        totals[key].meta += s.rubros[key].meta;
        totals[key].activados += s.rubros[key].activados;
      });
    });

    return totals;
  }, [filteredSellers]);

  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const viewLabel =
      viewLevel === 'vendedor'
        ? 'Por Vendedor'
        : viewLevel === 'supervisores'
        ? 'Consolidado por Supervisores'
        : 'Gerencia Regional';

    doc.setFontSize(14);
    doc.setTextColor(185, 28, 28);
    doc.text(
      `CODIZULCA - CUADRO GENERAL DE ACTIVACION POR RUBROS (${viewLabel.toUpperCase()})`,
      14,
      14
    );

    const activeFilters: string[] = [];
    if (supervisorFilter !== 'ALL') activeFilters.push(`Supervisor: ${supervisorFilter}`);
    if (selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__') {
      activeFilters.push(
        `Vendedores (${selectedSellers.length}): ${selectedSellers.slice(0, 4).join(', ')}${
          selectedSellers.length > 4 ? '...' : ''
        }`
      );
    }
    if (searchTerm.trim()) activeFilters.push(`Busqueda: "${searchTerm.trim()}"`);

    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `Vista: ${viewLabel} | Registros: ${
        viewLevel === 'vendedor'
          ? `${filteredSellers.length} Vendedores`
          : viewLevel === 'supervisores'
          ? `${consolidatedBySupervisor.length} Supervisores (${filteredSellers.length} Vendedores)`
          : `${consolidatedByRegion.length} Regiones`
      } | Filtros: ${activeFilters.length > 0 ? activeFilters.join(' | ') : 'Todos (Sin filtro)'} | Exportado: ${new Date().toLocaleString('es-VE')}`,
      14,
      20
    );

    const col1Label =
      viewLevel === 'vendedor'
        ? 'VENDEDOR'
        : viewLevel === 'supervisores'
        ? 'SUPERVISOR / VENDEDOR'
        : 'REGION';
    const col2Label =
      viewLevel === 'vendedor'
        ? 'SUPERVISOR'
        : viewLevel === 'supervisores'
        ? 'VENDEDORES'
        : 'SUPERVISORES';

    const headRow1: any[] = [
      { content: col1Label, rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
      { content: col2Label, rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
    ];
    const headRow2: any[] = [];

    RUBROS_CONFIG.forEach((rubro) => {
      headRow1.push({
        content: rubro.label,
        colSpan: 3,
        styles: { halign: 'center', fillColor: [39, 39, 42] },
      });
      headRow2.push(
        { content: 'META', styles: { halign: 'center' } },
        { content: 'ACT.', styles: { halign: 'center' } },
        { content: '%', styles: { halign: 'center' } }
      );
    });

    const bodyRows: any[][] = [];

    if (viewLevel === 'vendedor') {
      filteredSellers.forEach((row) => {
        const line: any[] = [row.vendedor, row.supervisor];
        RUBROS_CONFIG.forEach((rubro) => {
          const d = row.rubros[rubro.key];
          const pct = d.meta > 0 ? (d.activados / d.meta) * 100 : 0;
          line.push(d.meta, d.activados, `${pct.toFixed(1)}%`);
        });
        bodyRows.push(line);
      });
    } else if (viewLevel === 'supervisores') {
      consolidatedBySupervisor.forEach((row) => {
        const supLine: any[] = [`${row.supervisor} (${row.region})`, `${row.sellersCount}`];
        RUBROS_CONFIG.forEach((rubro) => {
          const d = row.rubros[rubro.key];
          const pct = d.meta > 0 ? (d.activados / d.meta) * 100 : 0;
          supLine.push(d.meta, d.activados, `${pct.toFixed(1)}%`);
        });
        bodyRows.push(supLine);

        // Si el supervisor está desplegado o hay filtro de vendedores/búsqueda activo, incluir el desglose de vendedores
        const includeSellers =
          expandedSupervisors.has(row.supervisor) ||
          supervisorFilter !== 'ALL' ||
          selectedSellers.length > 0 ||
          searchTerm.trim().length > 0;

        if (includeSellers) {
          row.sellers.forEach((seller, idx) => {
            const sLine: any[] = [`   -> ${seller.vendedor}`, `#${idx + 1}`];
            RUBROS_CONFIG.forEach((rubro) => {
              const sData = seller.rubros[rubro.key];
              const sPct = sData.meta > 0 ? (sData.activados / sData.meta) * 100 : 0;
              sLine.push(sData.meta, sData.activados, `${sPct.toFixed(1)}%`);
            });
            bodyRows.push(sLine);
          });
        }
      });
    } else {
      consolidatedByRegion.forEach((row) => {
        const line: any[] = [row.region, `${row.supervisorsCount}`];
        RUBROS_CONFIG.forEach((rubro) => {
          const d = row.rubros[rubro.key];
          const pct = d.meta > 0 ? (d.activados / d.meta) * 100 : 0;
          line.push(d.meta, d.activados, `${pct.toFixed(1)}%`);
        });
        bodyRows.push(line);
      });
    }

    const footRow: any[] = ['TOTAL GENERAL / PROMEDIO', ''];
    RUBROS_CONFIG.forEach((rubro) => {
      const d = grandTotals[rubro.key];
      const pct = d.meta > 0 ? (d.activados / d.meta) * 100 : 0;
      footRow.push(d.meta, d.activados, `${pct.toFixed(1)}%`);
    });

    autoTable(doc, {
      startY: 24,
      head: [headRow1, headRow2],
      body: bodyRows,
      foot: [footRow],
      theme: 'grid',
      styles: {
        fontSize: 6.5,
        cellPadding: 1.5,
        halign: 'center',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      footStyles: {
        fillColor: [185, 28, 28],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 42 },
        1: { halign: 'center', cellWidth: 26 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && viewLevel === 'supervisores') {
          const firstCell = String((data.row.raw as any[])?.[0] || '');
          if (!firstCell.startsWith('   ->')) {
            data.cell.styles.fillColor = [240, 240, 245];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    doc.save(`Cuotas_Activacion_${viewLevel}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  useEffect(() => {
    const onExportEvent = () => handleExportPDF();
    window.addEventListener('cuotas-export-pdf', onExportEvent);
    return () => window.removeEventListener('cuotas-export-pdf', onExportEvent);
  });

  const getPercentColor = (percent: number) => {
    if (percent >= 100) return 'text-emerald-400 font-bold';
    if (percent >= 80) return 'text-green-400 font-semibold';
    if (percent >= 60) return 'text-yellow-400 font-medium';
    return 'text-red-400 font-medium';
  };

  const getProgressPill = (percent: number) => {
    if (percent >= 80) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
          <CheckCircle2 className="w-3 h-3" />
          {percent.toFixed(1)}%
        </span>
      );
    }
    if (percent >= 60) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3" />
          {percent.toFixed(1)}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
        <XCircle className="w-3 h-3" />
        {percent.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className="bg-zinc-950/60 border border-white/5 rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar vendedor, supervisor o zona..."
              className="w-full bg-black/60 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-red-500 transition-colors placeholder:text-zinc-600"
            />
          </div>

          <select
            value={supervisorFilter}
            onChange={(e) => {
              const val = e.target.value;
              setSupervisorFilter(val);
              if (val !== 'ALL') {
                setExpandedSupervisors(new Set([val]));
              }
            }}
            className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-300 focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="ALL">Todos los Supervisores</option>
            {supervisorList.map((sup) => (
              <option key={sup} value={sup}>
                {sup}
              </option>
            ))}
          </select>

          {/* Menú de Vendedores Multiselección Automático */}
          <SellerMultiSelect
            sellers={availableSellers}
            selectedSellers={selectedSellers}
            onChange={setSelectedSellers}
            supervisorLabel={supervisorFilter !== 'ALL' ? supervisorFilter : undefined}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {viewLevel === 'supervisores' && consolidatedBySupervisor.length > 0 && (
            <button
              type="button"
              onClick={() => handleToggleAllSupervisors(consolidatedBySupervisor.map((s) => s.supervisor))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
              title="Expandir o contraer todos los supervisores"
            >
              <ChevronsUpDown className="w-3.5 h-3.5 text-red-400" />
              <span>
                {expandedSupervisors.size === consolidatedBySupervisor.length
                  ? 'Contraer Todos'
                  : 'Desplegar Todos'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-300 hover:text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm"
            title="Exportar cuadro general filtrado a PDF"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar PDF</span>
          </button>

          <span className="font-mono bg-zinc-900 border border-white/10 px-2.5 py-1.5 rounded-lg">
            {viewLevel === 'vendedor' && `${filteredSellers.length} Vendedores`}
            {viewLevel === 'supervisores' && `${consolidatedBySupervisor.length} Supervisores`}
            {viewLevel === 'gerente' && `${consolidatedByRegion.length} Regiones`}
          </span>
        </div>
      </div>

      {/* Cinta de Estado de Cartera Sincronizada con Maestra Activa (Negro / Rojo / Blanco) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-red-600/35 bg-zinc-950 px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-zinc-300">
          <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
            Maestra Oct 2026
          </span>
          <span>
            Cartera Activa Total Sincronizada:{' '}
            <strong className="font-mono text-white font-black">
              {maestraTotalActive.toLocaleString('es-VE')} clientes
            </strong>{' '}
            en <strong className="text-white">{maestraRoutesCount} rutas</strong> (
            <strong className="font-mono text-white">
              {grandCarteraTotal.toLocaleString('es-VE')}
            </strong>{' '}
            en carteras con cuota de 5 rubros + Food Service especializado).
          </span>
        </div>
        {onOpenMaestraAudit && (
          <button
            type="button"
            onClick={onOpenMaestraAudit}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white bg-white px-3 py-1 text-[11px] font-black text-black hover:bg-zinc-200 transition cursor-pointer"
          >
            <span>Ver Auditoría Maestra ({maestraTotalActive.toLocaleString('es-VE')})</span>
          </button>
        )}
      </div>

      {/* Main Activation Table */}
      <div className="bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1160px]">
            {/* Table Header exactly like mockup */}
            <thead>
              {/* Row 1: Main Headers */}
              <tr className="bg-zinc-900/90 text-white border-b border-white/10 select-none text-xs">
                {viewLevel === 'vendedor' && (
                  <>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[180px]"
                    >
                      VENDEDOR
                    </th>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[160px]"
                    >
                      SUPERVISOR
                    </th>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[85px] text-red-400"
                    >
                      CARTERA
                    </th>
                  </>
                )}

                {viewLevel === 'supervisores' && (
                  <>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[200px]"
                    >
                      SUPERVISOR
                    </th>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[100px]"
                    >
                      VENDEDORES
                    </th>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[85px] text-red-400"
                    >
                      CARTERA
                    </th>
                  </>
                )}

                {viewLevel === 'gerente' && (
                  <>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[180px]"
                    >
                      REGIÓN
                    </th>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[100px]"
                    >
                      SUPERVISORES
                    </th>
                    <th
                      rowSpan={2}
                      className="p-3 text-center font-bold tracking-wider uppercase border-r border-white/10 bg-zinc-900/95 min-w-[85px] text-red-400"
                    >
                      CARTERA
                    </th>
                  </>
                )}

                {/* Rubros Headers with 3 columns each */}
                {RUBROS_CONFIG.map((rubro, idx) => (
                  <th
                    key={rubro.key}
                    colSpan={3}
                    className={`p-3 text-center font-bold uppercase tracking-wider bg-zinc-900/70 ${
                      idx < RUBROS_CONFIG.length - 1 ? 'border-r border-white/10' : ''
                    }`}
                  >
                    {rubro.label}
                  </th>
                ))}
              </tr>

              {/* Row 2: Subcolumns (META, ACTIVADOS, %) */}
              <tr className="bg-zinc-950/80 text-zinc-400 border-b border-white/10 text-[11px]">
                {RUBROS_CONFIG.map((rubro, idx) => (
                  <React.Fragment key={`sub-${rubro.key}`}>
                    <th className="py-2 px-2.5 text-center font-semibold uppercase tracking-wider border-r border-white/5 bg-zinc-950/60">
                      META
                    </th>
                    <th className="py-2 px-2.5 text-center font-semibold uppercase tracking-wider border-r border-white/5 bg-zinc-950/60">
                      ACTIVADOS
                    </th>
                    <th
                      className={`py-2 px-2.5 text-center font-semibold uppercase tracking-wider bg-zinc-950/60 ${
                        idx < RUBROS_CONFIG.length - 1 ? 'border-r border-white/10' : ''
                      }`}
                    >
                      %
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-white/5 text-xs">
              {/* VIEW: Por Vendedor */}
              {viewLevel === 'vendedor' &&
                filteredSellers.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-white/[0.03] transition-colors group"
                  >
                    <td className="p-3 border-r border-white/10 font-bold text-zinc-200">
                      <span>{row.vendedor}</span>
                    </td>
                    <td className="p-3 border-r border-white/10 text-zinc-400 font-medium">
                      {row.supervisor}
                    </td>
                    <td className="p-3 border-r border-white/10 text-center font-mono font-black text-white">
                      {row.cartera ?? 0}
                    </td>

                    {/* Rubros cells */}
                    {RUBROS_CONFIG.map((rubro, idx) => {
                      const data = row.rubros[rubro.key];
                      const pct = data.meta > 0 ? (data.activados / data.meta) * 100 : 0;
                      return (
                        <React.Fragment key={`${row.id}-${rubro.key}`}>
                          <td className="p-2.5 text-center font-mono text-zinc-400 border-r border-white/5">
                            {data.meta}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-white border-r border-white/5">
                            {data.activados}
                          </td>
                          <td
                            className={`p-2.5 text-center font-mono ${getPercentColor(
                              pct
                            )} ${
                              idx < RUBROS_CONFIG.length - 1
                                ? 'border-r border-white/10'
                                : ''
                            }`}
                          >
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}

              {/* VIEW: Consolidado (Supervisores) con Desglose Expandible */}
              {viewLevel === 'supervisores' &&
                consolidatedBySupervisor.map((row) => {
                  const isExpanded = expandedSupervisors.has(row.supervisor);

                  return (
                    <React.Fragment key={row.supervisor}>
                      <tr
                        onClick={() => toggleSupervisorExpand(row.supervisor)}
                        className={`cursor-pointer transition-colors border-b border-white/5 select-none ${
                          isExpanded
                            ? 'bg-zinc-900/90 hover:bg-zinc-850/80 border-l-4 border-l-red-500'
                            : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <td className="p-3 border-r border-white/10 font-bold text-zinc-200">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSupervisorExpand(row.supervisor);
                              }}
                              className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
                                isExpanded
                                  ? 'bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                              }`}
                              title={isExpanded ? 'Contraer vendedores' : 'Desplegar vendedores asignados'}
                            >
                              <ChevronRight
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                              />
                            </button>

                            <div className="flex flex-col">
                              <span className="font-bold text-white text-sm flex items-center gap-2">
                                {row.supervisor}
                                <span className="text-[10px] font-normal text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                                  {isExpanded ? 'Desplegado' : 'Clic para desplegar'}
                                </span>
                              </span>
                              <span className="text-[10px] text-zinc-400 font-normal">
                                {row.region}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 border-r border-white/10 text-center font-mono">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                              isExpanded
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : 'bg-zinc-800/80 text-zinc-300 border border-white/10'
                            }`}
                          >
                            <Users className="w-3 h-3" />
                            {row.sellersCount}
                          </span>
                        </td>
                        <td className="p-3 border-r border-white/10 text-center font-mono font-black text-white">
                          {row.carteraTotal.toLocaleString('es-VE')}
                        </td>

                        {RUBROS_CONFIG.map((rubro, idx) => {
                          const data = row.rubros[rubro.key];
                          const pct = data.meta > 0 ? (data.activados / data.meta) * 100 : 0;
                          return (
                            <React.Fragment key={`${row.supervisor}-${rubro.key}`}>
                              <td className="p-2.5 text-center font-mono text-zinc-300 font-semibold border-r border-white/5">
                                {data.meta}
                              </td>
                              <td className="p-2.5 text-center font-mono font-black text-white border-r border-white/5">
                                {data.activados}
                              </td>
                              <td
                                className={`p-2.5 text-center font-mono font-bold ${getPercentColor(
                                  pct
                                )} ${
                                  idx < RUBROS_CONFIG.length - 1
                                    ? 'border-r border-white/10'
                                    : ''
                                }`}
                              >
                                {pct.toFixed(1)}%
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>

                      {/* Desglose de Vendedores Asignados al Supervisor */}
                      {isExpanded &&
                        row.sellers.map((seller, sIdx) => (
                          <tr
                            key={seller.id || `${row.supervisor}-${seller.vendedor}`}
                            className="bg-zinc-950/85 hover:bg-zinc-900/60 transition-colors border-b border-white/5 text-xs"
                          >
                            <td className="py-2.5 pl-10 pr-3 border-r border-white/10">
                              <div className="flex items-center gap-2.5">
                                <span className="text-red-400 font-mono text-xs select-none">
                                  ↳
                                </span>
                                <span className="font-semibold text-zinc-200">
                                  {seller.vendedor}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 border-r border-white/10 text-center font-mono text-zinc-400 text-[11px]">
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/5 text-zinc-400">
                                #{sIdx + 1}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 border-r border-white/10 text-center font-mono font-bold text-white text-xs">
                              {seller.cartera ?? 0}
                            </td>

                            {RUBROS_CONFIG.map((rubro, idx) => {
                              const sData = seller.rubros[rubro.key];
                              const sPct =
                                sData.meta > 0
                                  ? (sData.activados / sData.meta) * 100
                                  : 0;
                              return (
                                <React.Fragment key={`${seller.vendedor}-${rubro.key}`}>
                                  <td className="p-2 text-center font-mono text-zinc-400 border-r border-white/5">
                                    {sData.meta}
                                  </td>
                                  <td className="p-2 text-center font-mono font-bold text-zinc-100 border-r border-white/5">
                                    {sData.activados}
                                  </td>
                                  <td
                                    className={`p-2 text-center font-mono ${getPercentColor(
                                      sPct
                                    )} ${
                                      idx < RUBROS_CONFIG.length - 1
                                        ? 'border-r border-white/10'
                                        : ''
                                    }`}
                                  >
                                    {sPct.toFixed(1)}%
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}

              {/* VIEW: Gerente Regional */}
              {viewLevel === 'gerente' &&
                consolidatedByRegion.map((row) => (
                  <tr
                    key={row.region}
                    className="hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="p-3 border-r border-white/10 font-bold text-zinc-200">
                      {row.region}
                    </td>
                    <td className="p-3 border-r border-white/10 text-center font-mono text-zinc-300">
                      {row.supervisorsCount}
                    </td>
                    <td className="p-3 border-r border-white/10 text-center font-mono font-black text-white">
                      {row.carteraTotal.toLocaleString('es-VE')}
                    </td>

                    {RUBROS_CONFIG.map((rubro, idx) => {
                      const data = row.rubros[rubro.key];
                      const pct = data.meta > 0 ? (data.activados / data.meta) * 100 : 0;
                      return (
                        <React.Fragment key={`${row.region}-${rubro.key}`}>
                          <td className="p-2.5 text-center font-mono text-zinc-400 border-r border-white/5">
                            {data.meta}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-white border-r border-white/5">
                            {data.activados}
                          </td>
                          <td
                            className={`p-2.5 text-center font-mono ${getPercentColor(
                              pct
                            )} ${
                              idx < RUBROS_CONFIG.length - 1
                                ? 'border-r border-white/10'
                                : ''
                            }`}
                          >
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
            </tbody>

            {/* Grand Totals Footer */}
            <tfoot>
              <tr className="bg-zinc-900 border-t-2 border-white/20 font-bold text-xs text-white">
                <td
                  colSpan={2}
                  className="p-3 text-right uppercase tracking-wider border-r border-white/10 text-zinc-300 bg-zinc-900/90"
                >
                  TOTAL GENERAL / PROMEDIO
                </td>
                <td className="p-3 text-center font-mono font-black text-white border-r border-white/10 bg-zinc-900/90">
                  {grandCarteraTotal.toLocaleString('es-VE')}
                </td>

                {RUBROS_CONFIG.map((rubro, idx) => {
                  const data = grandTotals[rubro.key];
                  const pct = data.meta > 0 ? (data.activados / data.meta) * 100 : 0;
                  return (
                    <React.Fragment key={`total-${rubro.key}`}>
                      <td className="p-2.5 text-center font-mono text-zinc-300 border-r border-white/5 bg-zinc-900/70">
                        {data.meta}
                      </td>
                      <td className="p-2.5 text-center font-mono font-bold text-white border-r border-white/5 bg-zinc-900/70">
                        {data.activados}
                      </td>
                      <td
                        className={`p-2.5 text-center font-mono ${getPercentColor(
                          pct
                        )} bg-zinc-900/70 ${
                          idx < RUBROS_CONFIG.length - 1 ? 'border-r border-white/10' : ''
                        }`}
                      >
                        {pct.toFixed(1)}%
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
