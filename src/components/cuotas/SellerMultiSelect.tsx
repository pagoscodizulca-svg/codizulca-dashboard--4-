import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Users, Check, ChevronDown, Search, X, Filter } from 'lucide-react';

export interface SellerOption {
  name: string;
  supervisor?: string;
  zona?: string;
  badgeText?: string;
  badgeHighlight?: boolean;
}

interface SellerMultiSelectProps {
  sellers: SellerOption[];
  selectedSellers: string[];
  onChange: (selected: string[]) => void;
  supervisorLabel?: string;
  className?: string;
}

export const SellerMultiSelect: React.FC<SellerMultiSelectProps> = ({
  sellers,
  selectedSellers,
  onChange,
  supervisorLabel,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter sellers inside the dropdown by search input
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return sellers;
    const query = searchQuery.toLowerCase();
    return sellers.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.zona && s.zona.toLowerCase().includes(query)) ||
        (s.supervisor && s.supervisor.toLowerCase().includes(query))
    );
  }, [sellers, searchQuery]);

  const isAllSelected = selectedSellers.length === 0 || selectedSellers.length === sellers.length;

  const handleToggleSeller = (sellerName: string) => {
    if (selectedSellers.length === 0) {
      // If currently "all" (empty array), clicking one deselects it from the full set
      const allNames = sellers.map((s) => s.name);
      onChange(allNames.filter((name) => name !== sellerName));
    } else if (selectedSellers.includes(sellerName)) {
      const next = selectedSellers.filter((name) => name !== sellerName);
      onChange(next);
    } else {
      const next = [...selectedSellers, sellerName];
      // If now all are selected, we can keep the explicit list or normalize
      onChange(next.length === sellers.length ? [] : next);
    }
  };

  const handleSelectAll = () => {
    onChange([]); // Empty array represents "All active"
  };

  const handleClearAll = () => {
    // Select none (or keep single indicator)
    onChange(['__NONE__']);
  };

  const handleSelectOnly = (sellerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([sellerName]);
  };

  // Label to show on the button
  const buttonLabel = useMemo(() => {
    if (selectedSellers.length === 0) {
      return `Todos los Vendedores (${sellers.length})`;
    }
    if (selectedSellers.length === 1 && selectedSellers[0] === '__NONE__') {
      return 'Ningún vendedor seleccionado';
    }
    if (selectedSellers.length === 1) {
      const found = sellers.find((s) => s.name === selectedSellers[0]);
      if (found?.badgeText) {
        return `${found.name} (${found.badgeText})`;
      }
      return selectedSellers[0];
    }
    if (selectedSellers.length === sellers.length) {
      return `Todos (${sellers.length})`;
    }
    return `${selectedSellers.length} de ${sellers.length} Vendedores`;
  }, [selectedSellers, sellers]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm rounded-lg border transition-all cursor-pointer min-w-[210px] max-w-[280px] ${
          isOpen
            ? 'bg-zinc-900 border-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.2)]'
            : selectedSellers.length > 0 && selectedSellers[0] !== '__NONE__'
            ? 'bg-red-500/10 border-red-500/40 text-red-200'
            : 'bg-black/60 border-white/10 hover:border-white/25 text-zinc-300'
        }`}
        title={`Filtrar vendedores${supervisorLabel ? ` de ${supervisorLabel}` : ''}`}
      >
        <div className="flex items-center gap-2 truncate">
          <Users className={`w-3.5 h-3.5 shrink-0 ${selectedSellers.length > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
          <span className="truncate font-medium">{buttonLabel}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedSellers.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleSelectAll();
              }}
              className="p-0.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Restablecer a todos"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-red-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 bg-zinc-950 border border-white/15 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Header with Search and Actions */}
          <div className="p-2.5 border-b border-white/10 bg-zinc-900/80 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar vendedor o zona..."
                className="w-full bg-black/70 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] px-0.5 text-zinc-400">
              <span>
                {filteredOptions.length} {filteredOptions.length === 1 ? 'vendedor' : 'vendedores'}
                {supervisorLabel && <strong className="text-zinc-300 ml-1">({supervisorLabel})</strong>}
              </span>
              <div className="flex items-center gap-2 font-medium">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  Todos
                </button>
                <span className="text-zinc-700">|</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>

          {/* List of Sellers with Checkboxes */}
          <div className="max-h-60 overflow-y-auto divide-y divide-white/5 py-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">
                No se encontraron vendedores
              </div>
            ) : (
              filteredOptions.map((seller) => {
                const isChecked =
                  selectedSellers.length === 0 ||
                  (selectedSellers[0] !== '__NONE__' && selectedSellers.includes(seller.name));

                return (
                  <div
                    key={seller.name}
                    onClick={() => handleToggleSeller(seller.name)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors text-xs group ${
                      isChecked
                        ? 'bg-red-500/10 hover:bg-red-500/15 text-white'
                        : 'hover:bg-white/[0.04] text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                          isChecked
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-500'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`truncate font-medium ${isChecked ? 'text-zinc-100 font-semibold' : 'text-zinc-300'}`}>
                          {seller.name}
                        </span>
                        {seller.badgeText && (
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                              seller.badgeHighlight
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {seller.badgeText}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleSelectOnly(seller.name, e)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-all shrink-0 ml-2"
                      title="Seleccionar solo este vendedor"
                    >
                      Solo este
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="px-3 py-2 bg-zinc-950 border-t border-white/10 text-[10px] text-zinc-500 flex items-center justify-between">
            <span>Filtro automático multiselección</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="font-bold text-red-400 hover:text-red-300"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
