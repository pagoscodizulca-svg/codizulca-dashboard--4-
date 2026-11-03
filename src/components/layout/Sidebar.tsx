import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, canAccessModule } from '../../lib/auth';
import { 
  LayoutDashboard, 
  Users, 
  Target, 
  ShoppingCart,
  MapPin,
  Smartphone,
  ShieldAlert,
  Hexagon,
  Box,
  LogOut,
  Sparkles,
  Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';

export const Sidebar: React.FC = () => {
  const { signOut, canAccessTrazabilidad, corporateProfile } = useAuth();

  const allLinks = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Resumen Ejecutivo', exact: true },
    { to: '/dashboard/cuotas', icon: Target, label: 'Cuotas & Metas' },
    { to: '/dashboard/ventas', icon: ShoppingCart, label: 'Ventas & Facturación' },
    { to: '/dashboard/inventario', icon: Hexagon, label: 'Inventario & Stock', badge: { text: '2 RISK', color: 'text-yellow-500', bg: 'bg-yellow-950/50 border-yellow-900/50' } },
    { to: '/dashboard/clientes', icon: Users, label: 'Clientes & Geocercas' },
    { to: '/dashboard/productos', icon: Box, label: 'Catálogo de Productos' },
    { to: '/dashboard/trade', icon: MapPin, label: 'Trade Marketing (IA)' },
    { to: '/portal', icon: Smartphone, label: 'Portal Móvil PWA', badge: { text: 'OFFLINE', color: 'text-zinc-300', bg: 'bg-zinc-800/80 border-zinc-700' } },
    ...(canAccessTrazabilidad
      ? [{ to: '/dashboard/trazabilidad', icon: Activity, label: 'Trazabilidad', badge: { text: 'EN VIVO', color: 'text-emerald-400', bg: 'bg-emerald-950/50 border-emerald-900/50' } }]
      : []),
  ];

  // Cada perfil solo ve los módulos que tiene asignados (Trazabilidad se controla con canAccessTrazabilidad)
  const links = allLinks.filter(
    (link) => link.label === 'Trazabilidad' || canAccessModule(corporateProfile, link.label)
  );

  return (
    <aside className="flex w-72 flex-col border-r border-white/5 bg-[#0a0a0a]">
      <div className="flex h-16 items-center border-b border-white/5 px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-transparent">
            <img src="https://i.postimg.cc/W19QG233/logo.jpg" alt="Logo" className="h-full w-full rounded-full border border-red-600/50 object-cover" />
          </div>
          <span className="text-xl font-black text-white tracking-widest uppercase">Codizulca</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-6">
        <nav className="flex flex-col space-y-2 px-4">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.exact}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300",
                  isActive
                    ? "bg-gradient-to-r from-red-950/40 to-transparent text-white border border-red-900/50 shadow-[inset_0_0_20px_rgba(220,38,38,0.1)]"
                    : "text-blue-200/60 hover:text-blue-100 hover:bg-white/[0.02]"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <link.icon className={cn("h-5 w-5 transition-colors", isActive ? "text-red-500 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" : "text-blue-300/40 group-hover:text-blue-300")} />
                  <span className={cn("flex-1 tracking-wide", isActive ? "font-bold" : "")}>{link.label}</span>
                  {link.badge && (
                    <Badge variant="outline" className={cn("px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-md border", link.badge.bg, link.badge.color)}>
                      {link.badge.text}
                    </Badge>
                  )}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="border-t border-white/5 p-4 shrink-0">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-500 transition-colors hover:bg-red-950/30 hover:text-red-500"
        >
          <LogOut className="h-5 w-5" />
          SALIR DEL SISTEMA
        </button>
      </div>
    </aside>
  );
};
