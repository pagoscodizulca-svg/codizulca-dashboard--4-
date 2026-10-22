import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Store, Search, X, Check, Building2, MapPin, ChevronDown } from 'lucide-react';
import { FREQUENT_STORES } from '../../lib/campoService';

interface ClientSearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectClient?: (client: { id: string; name: string; sector?: string; canal?: string }) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  dark?: boolean;
}

type LightClientOption = {
  id: string;
  name: string;
  canal?: string;
  region?: string;
  sector?: string;
};

let cachedFullClients: LightClientOption[] | null = null;

export const ClientSearchAutocomplete: React.FC<ClientSearchAutocompleteProps> = ({
  value,
  onChange,
  onSelectClient,
  placeholder = "Buscar cliente o escribir nombre del establecimiento...",
  required = false,
  className = "",
  dark = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [allClients, setAllClients] = useState<LightClientOption[]>(() => {
    if (cachedFullClients) return cachedFullClients;
    return FREQUENT_STORES.map((s, idx) => ({
      id: `PDV-${idx + 1}`,
      name: s,
      canal: 'SUPERMERCADOS',
      region: 'Zulia / Falcón'
    }));
  });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar cartera completa de forma diferida sin bloquear el arranque móvil
  useEffect(() => {
    if (cachedFullClients) return;
    let cancelled = false;
    Promise.all([
      import('../../data/clientsWithLocation').catch(() => ({ ENRICHED_CLIENTS: [] })),
      import('../../data/carteraClientes').catch(() => ({ CARTERA_CLIENTES: [] }))
    ]).then(([enrichedMod, carteraMod]) => {
      if (cancelled) return;
      const map = new Map<string, LightClientOption>();

      FREQUENT_STORES.forEach((s, idx) => {
        map.set(s.toUpperCase(), {
          id: `PDV-${idx + 1}`,
          name: s,
          canal: 'CUENTAS CLAVE',
          region: 'Zulia / Falcón'
        });
      });

      const enrichedList = Array.isArray(enrichedMod?.ENRICHED_CLIENTS) ? enrichedMod.ENRICHED_CLIENTS : [];
      enrichedList.forEach((c: any) => {
        if (c && c.nombre) {
          map.set(String(c.nombre).toUpperCase(), {
            id: String(c.id || ''),
            name: String(c.nombre),
            canal: c.canal,
            region: c.region,
            sector: c.sector
          });
        }
      });

      const carteraList = Array.isArray(carteraMod?.CARTERA_CLIENTES) ? carteraMod.CARTERA_CLIENTES : [];
      carteraList.forEach((c: any) => {
        if (c && c.nombre) {
          const key = String(c.nombre).toUpperCase();
          if (!map.has(key)) {
            map.set(key, {
              id: String(c.id || ''),
              name: String(c.nombre),
              canal: c.canal,
              region: c.region
            });
          }
        }
      });

      const merged = Array.from(map.values());
      cachedFullClients = merged;
      setAllClients(merged);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Filtrado reactivo e instantáneo según lo que escriba el usuario
  const filteredClients = useMemo(() => {
    const query = (searchTerm || value || '').trim().toLowerCase();
    if (!query) {
      // Si no ha escrito nada, mostrar los primeros 25 clientes destacados
      return allClients.slice(0, 25);
    }

    const terms = query.split(/\s+/).filter(Boolean);

    return allClients
      .filter((c) => {
        const target = `${c.name} ${c.id} ${c.canal || ''} ${c.region || ''} ${c.sector || ''}`.toLowerCase();
        return terms.every((t) => target.includes(t));
      })
      .slice(0, 35); // Limitar a 35 para rendimiento instantáneo
  }, [allClients, searchTerm, value]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    onChange(text);
    setSearchTerm(text);
    setIsOpen(true);
  };

  const handleSelect = (client: { id: string; name: string; sector?: string; canal?: string }) => {
    onChange(client.name);
    setSearchTerm('');
    setIsOpen(false);
    if (onSelectClient) {
      onSelectClient(client);
    }
  };

  const handleClear = () => {
    onChange('');
    setSearchTerm('');
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      {/* Barra de Búsqueda Inteligente */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          className={`w-full text-xs font-semibold pl-9 pr-9 py-2.5 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
            dark
              ? 'bg-[#171717] border-neutral-800 text-white placeholder-neutral-500 focus:border-red-500'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-red-500'
          }`}
        />

        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white p-0.5 rounded-full"
            title="Limpiar selección"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </div>
        )}
      </div>

      {/* Menú Desplegable Inteligente de Resultados */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 mt-1.5 max-h-64 overflow-y-auto rounded-2xl shadow-2xl border z-50 animate-in fade-in-50 duration-150 ${
            dark
              ? 'bg-[#121212] border-neutral-800 text-white divide-y divide-neutral-850'
              : 'bg-white border-gray-200 text-gray-900 divide-y divide-gray-100'
          }`}
        >
          {filteredClients.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs font-medium text-gray-400">
                No se encontró cliente con ese nombre.
              </p>
              <p className="text-[10px] text-gray-500 mt-1">
                Puedes continuar usando <strong className="text-red-500 font-bold">"{value}"</strong> como establecimiento manual.
              </p>
            </div>
          ) : (
            <>
              <div className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${
                dark ? 'text-neutral-400 bg-neutral-900/80' : 'text-gray-400 bg-gray-50'
              }`}>
                {searchTerm ? `Resultados coincidentes (${filteredClients.length}):` : `Cartera Oficial de Clientes (${allClients.length.toLocaleString()} PDVs):`}
              </div>

              {filteredClients.map((client) => {
                const isSelected = value.trim().toLowerCase() === client.name.trim().toLowerCase();
                return (
                  <button
                    key={`${client.id}-${client.name}`}
                    type="button"
                    onClick={() => handleSelect(client)}
                    className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? dark
                          ? 'bg-red-950/40 text-red-300 font-bold'
                          : 'bg-red-50 text-red-700 font-bold'
                        : dark
                        ? 'hover:bg-neutral-800/80 text-neutral-200'
                        : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span className="text-xs font-black truncate">
                          {client.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400">
                        {client.canal && (
                          <span className={`px-1.5 py-0.2 rounded font-mono text-[8px] font-bold uppercase ${
                            dark ? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {client.canal}
                          </span>
                        )}
                        {client.sector && (
                          <span className="truncate flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5 text-neutral-500 shrink-0" />
                            {client.sector}
                          </span>
                        )}
                        {client.id && (
                          <span className="font-mono text-[9px] opacity-60">
                            ID #{client.id}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};
