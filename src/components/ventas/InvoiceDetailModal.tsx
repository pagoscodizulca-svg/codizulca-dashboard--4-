import React from 'react';
import { X, FileText, ArrowDownLeft, User, Building, Package, Calendar, Tag } from 'lucide-react';
import { SalesTransaction } from './types';
import { doesItemMatchSkuQuery, formatItemSkuCode, resolveInvoiceStatus } from './invoiceFilterUtils';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: SalesTransaction | null;
  onOpenClientHistory?: (clientName: string) => void;
  highlightedSkuQuery?: string;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  transaction,
  onOpenClientHistory,
  highlightedSkuQuery = '',
}) => {
  if (!isOpen || !transaction) return null;

  const isDV = transaction.tipo_doc === 'DV';
  const docStatus = resolveInvoiceStatus(transaction);
  const hasSkuHighlight = Boolean(highlightedSkuQuery.trim());

  const formatUSD = (val: number) => {
    return (val < 0 ? '-$' : '$') + Math.abs(val).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isDV 
                ? 'bg-zinc-900 text-zinc-300 border-white/20' 
                : 'bg-red-600/10 text-red-500 border-red-500/20'
            }`}>
              {isDV ? <ArrowDownLeft className="w-5 h-5 text-red-400" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                  isDV
                    ? 'bg-zinc-900 text-zinc-300 border border-white/20'
                    : docStatus === 'ANULADA'
                    ? 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                    : 'bg-red-950/80 text-white border border-red-600/60'
                }`}>
                  {isDV
                    ? 'DEVOLUCIÓN APLICADA (DV)'
                    : docStatus === 'ANULADA'
                    ? 'FACTURA ANULADA / EN CERO (FA)'
                    : 'FACTURA EMITIDA (FA)'}
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  Codizulca C.A.
                </span>
              </div>
              <h3 className="text-lg font-black text-white font-mono tracking-wider mt-0.5">
                {transaction.invoice}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs text-zinc-300">
          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-zinc-900/70 border border-white/5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-red-500" /> Cliente
              </span>
              <p className="text-white font-bold text-sm leading-tight">
                {transaction.client}
              </p>
              {onOpenClientHistory && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenClientHistory(transaction.client);
                  }}
                  className="text-[11px] text-red-400 hover:text-red-300 underline font-medium pt-0.5 block"
                >
                  Ver historial de compras de este cliente →
                </button>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" /> Vendedor Comercial
              </span>
              <p className="text-zinc-200 font-semibold text-sm">
                {transaction.seller}
              </p>
              <div className="flex items-center gap-1.5 text-zinc-400 pt-0.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span>Período: <strong className="text-white font-mono">{transaction.date}</strong></span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-red-500" />
                Renglones del Documento ({transaction.items.length} {transaction.items.length === 1 ? 'producto' : 'productos'})
              </span>
            </div>

            <div className="bg-zinc-950 border border-white/10 rounded-xl overflow-hidden shadow-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/90 text-zinc-400 font-bold uppercase tracking-wider border-b border-white/10 text-[11px]">
                    <th className="p-3 border-r border-white/10">Artículo / Producto</th>
                    <th className="p-3 text-right border-r border-white/10 min-w-[70px]">Cajas</th>
                    <th className="p-3 text-right border-r border-white/10 min-w-[75px]">Kgs / Lts</th>
                    <th className="p-3 text-right min-w-[90px]">Monto ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transaction.items.map((item, idx) => {
                    const skuCode = formatItemSkuCode(item);
                    const isMatchedSku = hasSkuHighlight && doesItemMatchSkuQuery(item, highlightedSkuQuery);

                    return (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          isMatchedSku
                            ? 'bg-red-950/35 hover:bg-red-950/50 border-l-2 border-l-red-500'
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="p-3 font-medium text-zinc-200 border-r border-white/10">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {skuCode && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-black tracking-wider ${
                                  isMatchedSku
                                    ? 'bg-red-600 text-white shadow'
                                    : 'bg-zinc-900 text-zinc-400 border border-white/10'
                                }`}
                              >
                                <Tag className="w-2.5 h-2.5" />
                                {skuCode}
                              </span>
                            )}
                            <span className={isMatchedSku ? 'text-white font-bold' : 'text-zinc-200'}>
                              {item.articulo}
                            </span>
                            {isMatchedSku && (
                              <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-[9px] font-black uppercase tracking-wider text-red-300">
                                SKU Filtrado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`p-3 text-right font-mono font-bold border-r border-white/10 ${
                          isMatchedSku ? 'text-red-300' : 'text-white'
                        }`}>
                          {item.cajas.toLocaleString('es-VE')}
                        </td>
                        <td className="p-3 text-right font-mono text-zinc-400 border-r border-white/10">
                          {item.kgs_lts.toLocaleString('es-VE', { maximumFractionDigits: 1 })}
                        </td>
                        <td className={`p-3 text-right font-mono font-black ${
                          isMatchedSku
                            ? 'text-red-300'
                            : isDV
                            ? 'text-zinc-300'
                            : 'text-white'
                        }`}>
                          {formatUSD(item.monto)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-900 border-t-2 border-white/10 font-bold">
                    <td className="p-3 text-right uppercase text-zinc-400 border-r border-white/10">
                      Total Documento:
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-white border-r border-white/10">
                      {transaction.boxes.toLocaleString('es-VE')} cj
                    </td>
                    <td className="p-3 text-right font-mono text-zinc-400 border-r border-white/10">
                      {transaction.kgs_lts.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Kg
                    </td>
                    <td className={`p-3 text-right font-mono text-sm font-black ${
                      isDV ? 'text-zinc-200' : 'text-white'
                    }`}>
                      {formatUSD(transaction.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-zinc-900/60 flex items-center justify-between">
          <div className="text-[11px] text-zinc-500 font-mono">
            Registro Oficial • Supabase history_sales
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
