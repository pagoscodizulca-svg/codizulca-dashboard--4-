import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { 
  MapPin, 
  Navigation, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Compass, 
  Sparkles,
  Maximize2,
  Minimize2,
  Filter,
  Eye,
  EyeOff,
  Search,
  UserCheck,
  Building2,
  Phone,
  Copy,
  Check,
  Globe2,
  Satellite,
  ShieldCheck,
  Target
} from 'lucide-react';
import { EnrichedClient } from '../../data/clientsWithLocation';
import { VendedorMultiSelect, SellerOption } from './VendedorMultiSelect';

// Curated Vibrant Seller Palette (25 Official Sellers)
const SELLER_COLORS: { [seller: string]: string } = {
  'MARIA BRICEÑO': '#db2777', // Magenta Pink
  'CUENTAS CLAVES 1 - MC': '#3b82f6', // Blue
  'CUENTAS CLAVE 1 - MC': '#3b82f6', // Blue
  'MARIANA CHACIN': '#3b82f6', // Blue
  'JOHNATAN SOTO': '#1d4ed8', // Deep Royal Blue
  'HERNAN PAZ': '#059669', // Mint Forest
  'OSWALDO CHURION': '#ea580c', // Bright Orange
  'CARLOS FUENMAYOR': '#eab308', // Warm Gold
  'SARAH REYES': '#d97706', // Amber Gold
  'J PABLO ARAUJO - CAB/OJE': '#15803d', // Deep Emerald
  'JOSE G. GONZALEZ': '#475569', // Slate
  'ANGELICA MORENO': '#0891b2', // Ocean Cyan
  'ADEL JARABA': '#0d9488', // Deep Teal
  'JUAN HERNANDEZ': '#e11d48', // Crimson Rose
  'YOLEIDA LUGO': '#c026d3', // Electric Fuchsia
  'CUENTAS CLAVES 2 - SV': '#10b981', // Emerald Green
  'CUENTAS CLAVE 2 - SV': '#10b981', // Emerald Green
  'SAIRU VALLES': '#10b981', // Emerald Green
  'ELISA SOLER': '#f97316', // Tangerine
  'ALI PEREZ': '#dc2626', // Red
  'J PABLO ARAUJO': '#16a34a', // Emerald
  'EDUARDO PIÑA': '#7c3aed', // Violet
  'JOHNATAN SOTO VILLA DEL ROS': '#2563eb', // Royal Blue
  'LEONARDO RIOS': '#9333ea', // Purple
  'MARYERY GARCIA': '#f43f5e', // Hot Pink
  'LUIS GUANIPA': '#65a30d', // Olive Lime
  'PEDRO ABREU': '#b45309', // Bronze
  'OSCAR ORTIZ': '#4f46e5', // Indigo
  'MIKELANGELO DIAZ': '#0284c7', // Sky Blue
};

const DEFAULT_COLOR = '#ef4444';

export const getSellerColor = (seller: string): string => {
  if (!seller) return DEFAULT_COLOR;
  return SELLER_COLORS[seller.trim().toUpperCase()] || DEFAULT_COLOR;
};

// 2D Convex Hull (Monotone Chain algorithm)
function getConvexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Map Base Layers with Official Google Earth Satellite & Hybrid
export type MapLayerStyle = 
  | 'google-earth-hybrid'
  | 'google-earth-satellite'
  | 'google-streets'
  | 'esri-street'
  | 'osm-hot'
  | 'esri-topo';

export const MAP_LAYERS: {
  [key in MapLayerStyle]: {
    name: string;
    url: string;
    subdomains?: string[];
    attribution: string;
    maxZoom: number;
  };
} = {
  'google-earth-hybrid': {
    name: 'Google Earth Satélite Híbrido (Calles + Nombres)',
    url: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Earth Imagery &copy; Google Maps',
    maxZoom: 21,
  },
  'google-earth-satellite': {
    name: 'Google Earth Satélite Puro (Foto Real)',
    url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Earth Imagery',
    maxZoom: 21,
  },
  'google-streets': {
    name: 'Google Maps Calles Oficial',
    url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps',
    maxZoom: 20,
  },
  'esri-street': {
    name: 'Esri Calles Nítido HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  'osm-hot': {
    name: 'OpenStreetMap Humanitario',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    subdomains: ['a', 'b'],
    attribution: '&copy; OpenStreetMap contributors &copy; Humanitarian OSM',
    maxZoom: 19,
  },
  'esri-topo': {
    name: 'Esri Topográfico & Relieve',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, DeLorme, NAVTEQ',
    maxZoom: 19,
  },
};

interface AllClientsMapProps {
  clients: EnrichedClient[];
  onSelectClient: (client: EnrichedClient) => void;
}

export const AllClientsMap: React.FC<AllClientsMapProps> = ({ clients, onSelectClient }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geofencesLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polygonsLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [selectedPinClient, setSelectedPinClient] = useState<EnrichedClient | null>(null);
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [showPolygons, setShowPolygons] = useState<boolean>(true);
  const [geofenceRadius, setGeofenceRadius] = useState<number>(50); // 50m standard check-in geofence
  const [mapStyle, setMapStyle] = useState<MapLayerStyle>('google-earth-hybrid');
  const [selectedSellerFilters, setSelectedSellerFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);

  // Unique list of sellers with GPS points
  const availableSellers = useMemo(() => {
    const map = new Map<string, number>();
    clients.forEach((c) => {
      if (c.hasLocation && c.survey?.latitud && c.survey?.longitud) {
        const s = c.survey?.vendedor || c.vendedor || 'SIN ASIGNAR';
        map.set(s, (map.get(s) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [clients]);

  // Options for VendedorMultiSelect
  const availableSellersOptions: SellerOption[] = useMemo(() => {
    return availableSellers.map(([seller, count]) => ({
      name: seller,
      withGps: count,
      color: getSellerColor(seller)
    }));
  }, [availableSellers]);

  // Filter clients with valid coordinates and applied filters
  // IMPORTANT: All synchronized surveys with GPS are displayed; seller filter supports multi-selection
  const clientsWithGps = useMemo(() => {
    return clients.filter((c) => {
      if (!c.hasLocation || !c.survey?.latitud || !c.survey?.longitud) return false;

      // Seller filter (Multi-selection: respecting the seller who surveyed/owns the geocerca)
      if (selectedSellerFilters.length > 0) {
        const effectiveSeller = (c.survey?.vendedor || c.vendedor || '').toUpperCase();
        if (!selectedSellerFilters.some(s => s.toUpperCase() === effectiveSeller)) return false;
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.nombre.toLowerCase().includes(q);
        const matchId = String(c.id).toLowerCase().includes(q);
        const matchRif = (c.survey?.rifCedula || '').toLowerCase().includes(q);
        const matchSeller = (c.survey?.vendedor || c.vendedor || '').toLowerCase().includes(q);
        const matchMuni = (c.survey?.municipio || '').toLowerCase().includes(q);
        const matchEstado = (c.survey?.estado || '').toLowerCase().includes(q);
        const matchSector = (c.sector || '').toLowerCase().includes(q);
        const matchDir = (c.direccion || c.survey?.direccion || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchRif && !matchSeller && !matchMuni && !matchEstado && !matchSector && !matchDir) return false;
      }

      return true;
    });
  }, [clients, selectedSellerFilters, searchQuery]);

  // Group clients by seller for territory polygons
  const territories = useMemo(() => {
    const map: { [seller: string]: [number, number][] } = {};
    clientsWithGps.forEach((c) => {
      const seller = c.survey?.vendedor || c.vendedor || 'SIN ASIGNAR';
      if (!map[seller]) map[seller] = [];
      map[seller].push([c.survey!.latitud, c.survey!.longitud]);
    });

    const result: { seller: string; points: [number, number][]; hull: [number, number][]; color: string }[] = [];
    Object.entries(map).forEach(([seller, points]) => {
      if (points.length >= 3) {
        const hull = getConvexHull(points);
        result.push({
          seller,
          points,
          hull,
          color: getSellerColor(seller),
        });
      }
    });
    return result;
  }, [clientsWithGps]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [10.6427, -71.6125], // Default Maracaibo center
        zoom: 11,
        zoomControl: false,
        preferCanvas: true, // Smooth performance with 1,400+ points
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Start with Google Earth Hybrid layer
      const layerConfig = MAP_LAYERS['google-earth-hybrid'];
      const tile = L.tileLayer(layerConfig.url, {
        attribution: layerConfig.attribution,
        maxZoom: layerConfig.maxZoom,
        subdomains: layerConfig.subdomains || ['mt0', 'mt1', 'mt2', 'mt3'],
      }).addTo(map);

      tileLayerRef.current = tile;
      polygonsLayerRef.current = L.layerGroup().addTo(map);
      geofencesLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }
  }, []);

  // Update Tile Style
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const layerConfig = MAP_LAYERS[mapStyle] || MAP_LAYERS['google-earth-hybrid'];

    const tile = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: layerConfig.maxZoom,
      subdomains: layerConfig.subdomains || ['mt0', 'mt1', 'mt2', 'mt3'],
    }).addTo(map);

    tileLayerRef.current = tile;
  }, [mapStyle]);

  // Render Markers, Geofence Perimeters (Circles), and Polygons
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    const geofencesGroup = geofencesLayerRef.current;
    const polygonsGroup = polygonsLayerRef.current;
    if (!map || !markersGroup || !geofencesGroup || !polygonsGroup) return;

    markersGroup.clearLayers();
    geofencesGroup.clearLayers();
    polygonsGroup.clearLayers();

    if (clientsWithGps.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    // 1. Draw Territory Polygons (Routes)
    if (showPolygons) {
      territories.forEach((t) => {
        if (t.hull.length >= 3) {
          const latLngs = t.hull.map((p) => [p[0], p[1]] as L.LatLngTuple);
          const polygon = L.polygon(latLngs, {
            color: t.color,
            weight: 2.5,
            opacity: 0.9,
            fillColor: t.color,
            fillOpacity: 0.15,
            dashArray: '5, 6',
          }).addTo(polygonsGroup);

          polygon.bindTooltip(
            `
              <div style="font-family: sans-serif; font-size: 11px; padding: 2px 4px;">
                <div style="font-weight: 800; color: ${t.color};">📍 Ruta / Territorio Comercial</div>
                <div style="font-weight: 700; color: #111;">${t.seller}</div>
                <div style="font-size: 10px; color: #4b5563;">${t.points.length} geocercas sincronizadas</div>
              </div>
            `,
            { sticky: true, opacity: 0.95 }
          );

          polygon.on('mouseover', function () {
            this.setStyle({ fillOpacity: 0.35, weight: 3.5 });
          });
          polygon.on('mouseout', function () {
            this.setStyle({ fillOpacity: 0.15, weight: 2.5 });
          });
        }
      });
    }

    // 2. Draw Geocerca Perimeters (Circles) & Client Markers
    clientsWithGps.forEach((c) => {
      const { latitud, longitud, estadoEncuesta } = c.survey!;
      bounds.push([latitud, longitud]);

      const seller = c.survey?.vendedor || c.vendedor || 'SIN ASIGNAR';
      const sellerColor = getSellerColor(seller);
      const isComplete = estadoEncuesta === 'COMPLETA';
      const isPending = estadoEncuesta === 'PENDIENTE';

      // Status Badge indicator
      const statusBadge = isComplete ? '✓' : isPending ? '⏳' : '✎';
      const badgeBg = isComplete ? '#10b981' : isPending ? '#f59e0b' : '#3b82f6';
      const statusLabel = isComplete ? 'Completa' : isPending ? 'Pendiente' : 'Modificada';

      // 2A. Draw Circular Geofence
      if (showGeofences) {
        const geofenceCircle = L.circle([latitud, longitud], {
          radius: geofenceRadius,
          color: sellerColor,
          fillColor: sellerColor,
          fillOpacity: 0.18,
          weight: 1.5,
          dashArray: '3, 4',
        }).addTo(geofencesGroup);

        geofenceCircle.bindTooltip(
          `
            <div style="font-family: sans-serif; font-size: 11px; padding: 2px 4px;">
              <div style="font-weight: 800; color: ${sellerColor};">🎯 Geocerca Activa (${geofenceRadius}m)</div>
              <div style="font-weight: 700; color: #111;">${c.nombre}</div>
              <div style="font-size: 10px; color: #4b5563;">Vendedor: <b>${seller}</b></div>
              <div style="font-size: 9px; font-weight: bold; color: ${badgeBg};">Estatus: ${statusLabel}</div>
            </div>
          `,
          { sticky: true, opacity: 0.95 }
        );
      }

      // 2B. Draw Client Marker Pin
      const pinHtml = `
        <div class="marker-container" style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s;">
          <div style="
            width: 26px; 
            height: 26px; 
            border-radius: 9999px; 
            background: ${sellerColor}; 
            border: 2.5px solid #ffffff; 
            box-shadow: 0 4px 10px rgba(0,0,0,0.6); 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            color: #ffffff;
            font-weight: 800;
            font-size: 11px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.6);
          ">
            ${statusBadge}
          </div>
          <span style="
            position: absolute; 
            bottom: -1px; 
            right: -1px; 
            width: 10px; 
            height: 10px; 
            border-radius: 9999px; 
            background: ${badgeBg}; 
            border: 1.5px solid #ffffff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
          "></span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'all-clients-marker-wrap',
        html: pinHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([latitud, longitud], { icon: customIcon }).addTo(markersGroup);

      marker.on('click', () => {
        setSelectedPinClient(c);
        map.flyTo([latitud, longitud], Math.max(map.getZoom(), 16), { duration: 0.6 });
      });

      const googleEarthUrl = `https://earth.google.com/web/@${latitud},${longitud},100a,300d,35y,0t,0r`;

      marker.bindPopup(`
        <div style="font-family: sans-serif; padding: 6px; min-width: 220px; max-width: 280px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 800; color: #dc2626; background: rgba(220,38,38,0.1); padding: 1px 6px; border-radius: 4px; font-family: monospace;">
              COD #${c.id}
            </span>
            <span style="font-size: 9px; font-weight: 700; color: white; background: ${badgeBg}; padding: 1px 5px; border-radius: 4px;">
              ${statusLabel}
            </span>
          </div>
          <div style="font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.25; margin-bottom: 4px;">
            ${c.nombre}
          </div>
          <div style="font-size: 11px; font-weight: 700; color: #b91c1c; margin-bottom: 2px;">
            📍 <strong>Sector:</strong> ${c.sector}
          </div>
          ${(c.direccion || c.survey?.direccion) ? `
          <div style="font-size: 10px; color: #1e293b; margin-bottom: 3px; line-height: 1.3; background: #f8fafc; padding: 3px 5px; border-radius: 4px; border: 1px solid #e2e8f0;">
            <strong>Dirección:</strong> ${c.direccion || c.survey?.direccion}
          </div>` : ''}
          <div style="font-size: 11px; color: #475569; margin-bottom: 2px;">
            <strong>Vendedor:</strong> <span style="color: ${sellerColor}; font-weight: 700;">${seller}</span>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">
            <strong>Municipio:</strong> ${c.survey?.municipio || c.zona}
          </div>
          <div style="font-size: 10px; color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 4px; border-radius: 4px; margin-top: 4px; display: inline-block;">
            🎯 Geocerca Activa (Perímetro: ${geofenceRadius}m)
          </div>
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 9px; font-family: monospace; color: #94a3b8;">
              ${latitud.toFixed(5)}, ${longitud.toFixed(5)}
            </span>
            <a href="${googleEarthUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; color: #2563eb; font-weight: bold; text-decoration: none; display: flex; align-items: center; gap: 2px;">
              🌍 Google Earth
            </a>
          </div>
        </div>
      `);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [clientsWithGps, showPolygons, showGeofences, geofenceRadius, territories]);

  const handleFitAll = () => {
    if (mapInstanceRef.current && clientsWithGps.length > 0) {
      const bounds: L.LatLngExpression[] = clientsWithGps.map((c) => [
        c.survey!.latitud,
        c.survey!.longitud,
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  };

  const handleCopyCoords = (lat: number, lng: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  return (
    <div
      className={`relative w-full ${
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen rounded-none' : 'h-[690px] rounded-2xl'
      } overflow-hidden border border-white/10 shadow-2xl bg-zinc-950 transition-all duration-300`}
    >
      {/* Map Leaflet Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Top Header & Control Hub */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2.5 pointer-events-none">
        {/* Left: Interactive Stats & Search */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="bg-zinc-950/92 backdrop-blur-md border border-white/15 rounded-2xl p-2.5 px-3.5 shadow-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-950/50 border border-red-600/40 flex items-center justify-center text-red-500 shrink-0">
              <Target className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-[11px] font-black text-white uppercase tracking-wider">
                  Módulo de Geocercas & Rutas
                </h4>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </div>
              <p className="text-[11px] text-zinc-300">
                <strong className="text-white font-bold">{clientsWithGps.length}</strong> geocercas activas •{' '}
                <strong className="text-white font-bold">{territories.length}</strong> territorios sincronizados
              </p>
            </div>
          </div>

          {/* Quick Search on Map */}
          <div className="relative bg-zinc-950/92 backdrop-blur-md border border-white/15 rounded-2xl shadow-xl flex items-center pl-3 pr-2 py-1.5 min-w-[200px] sm:min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0 mr-2" />
            <input
              type="text"
              placeholder="Buscar cliente, RIF, vendedor, zona..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-zinc-500 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right: Layer Selector & Tool Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-zinc-950/92 backdrop-blur-md border border-white/15 rounded-2xl p-1.5 shadow-2xl">
          {/* Layer Selector with Google Earth */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/15 rounded-xl px-2.5 py-1">
            <Satellite className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
            <select
              value={mapStyle}
              onChange={(e) => setMapStyle(e.target.value as MapLayerStyle)}
              className="bg-transparent text-xs font-bold text-zinc-200 focus:outline-none max-w-[170px] sm:max-w-[220px]"
            >
              <option value="google-earth-hybrid" className="bg-zinc-900 text-white font-semibold">
                🌍 Google Earth Híbrido (HD)
              </option>
              <option value="google-earth-satellite" className="bg-zinc-900 text-white font-semibold">
                🛰️ Google Earth Satélite Puro
              </option>
              <option value="google-streets" className="bg-zinc-900 text-white font-semibold">
                🚗 Google Maps Calles Oficial
              </option>
              <option value="esri-street" className="bg-zinc-900 text-white font-semibold">
                🗺️ Esri Calles Nítido
              </option>
              <option value="osm-hot" className="bg-zinc-900 text-white font-semibold">
                🏘️ OpenStreetMap Humanitario
              </option>
              <option value="esri-topo" className="bg-zinc-900 text-white font-semibold">
                ⛰️ Relieve & Terreno Topográfico
              </option>
            </select>
          </div>

          {/* Seller Filter with Multi-Select */}
          <VendedorMultiSelect
            sellers={availableSellersOptions}
            selectedSellers={selectedSellerFilters}
            onChange={setSelectedSellerFilters}
            compact={true}
          />

          {/* Total Global de Encuestas */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/60 border border-white/15 text-white text-xs font-bold shadow">
            <Target className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span>Total Encuestas: {clientsWithGps.length}</span>
          </div>

          {/* Geocercas Circle Toggle */}
          <button
            onClick={() => setShowGeofences(!showGeofences)}
            className={`p-1.5 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              showGeofences
                ? 'bg-red-950/80 border-red-600/60 text-white shadow'
                : 'bg-black/60 border-white/10 text-zinc-400 hover:text-white'
            }`}
            title={showGeofences ? 'Ocultar perímetro de geocercas' : 'Mostrar perímetro circular de geocercas (50m)'}
          >
            <Target className="w-3.5 h-3.5 text-red-500" />
            <span>Geocerca 50m</span>
          </button>

          {/* Polygon Toggle */}
          <button
            onClick={() => setShowPolygons(!showPolygons)}
            className={`p-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              showPolygons
                ? 'bg-zinc-800 border-white/20 text-white shadow'
                : 'bg-black/60 border-white/10 text-zinc-400 hover:text-white'
            }`}
            title={showPolygons ? 'Ocultar polígonos territoriales' : 'Mostrar polígonos de rutas'}
          >
            {showPolygons ? <Eye className="w-3.5 h-3.5 text-zinc-300" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">Rutas</span>
          </button>

          {/* Re-center / Fit bounds */}
          <button
            onClick={handleFitAll}
            className="p-1.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors"
            title="Ajustar zoom a todos los puntos"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => {
              setIsFullscreen(!isFullscreen);
              setTimeout(() => {
                mapInstanceRef.current?.invalidateSize();
              }, 200);
            }}
            className="p-1.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Selected Client Floating Card (Bottom Right) */}
      {selectedPinClient && (
        <div className="absolute bottom-4 right-4 z-10 bg-zinc-950/96 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-2xl w-80 sm:w-96 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-white bg-red-950/80 border border-red-700/60 px-2 py-0.5 rounded">
                  <span className="text-red-400 font-bold">COD:</span> #{selectedPinClient.id}
                </span>
                <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-900 border border-white/10 px-2 py-0.5 rounded">
                  {selectedPinClient.canal || 'Cliente'}
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    selectedPinClient.survey?.estadoEncuesta === 'COMPLETA'
                      ? 'bg-zinc-900 text-white border border-white/20'
                      : selectedPinClient.survey?.estadoEncuesta === 'PENDIENTE'
                      ? 'bg-red-950/80 text-red-300 border border-red-600/40'
                      : 'bg-zinc-800 text-zinc-300 border border-white/10'
                  }`}
                >
                  {selectedPinClient.survey?.estadoEncuesta || 'COMPLETA'}
                </span>
              </div>
              <h4 className="font-black text-white text-sm mt-1.5 leading-tight">
                <span className="text-red-400 font-mono mr-1.5">#{selectedPinClient.id}</span>
                {selectedPinClient.nombre}
              </h4>
            </div>
            <button
              onClick={() => setSelectedPinClient(null)}
              className="text-zinc-500 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-1.5 text-xs text-zinc-300">
            <div className="flex justify-between items-center bg-black/40 px-2 py-1 rounded border border-white/5">
              <span className="text-zinc-400 font-bold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                Sector:
              </span>
              <span className="text-white font-black text-right truncate max-w-[210px]">
                {selectedPinClient.sector}
              </span>
            </div>
            {(selectedPinClient.direccion || selectedPinClient.survey?.direccion) && (
              <div className="bg-black/40 px-2 py-1.5 rounded border border-white/5 text-[11px] leading-snug">
                <span className="text-zinc-400 font-bold block mb-0.5">Dirección Exacta GPS:</span>
                <span className="text-zinc-200">{selectedPinClient.direccion || selectedPinClient.survey?.direccion}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Vendedor Asignado:</span>
              <span
                className="font-bold truncate max-w-[200px]"
                style={{ color: getSellerColor(selectedPinClient.survey?.vendedor || selectedPinClient.vendedor) }}
              >
                {selectedPinClient.survey?.vendedor || selectedPinClient.vendedor}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Municipio / Zona:</span>
              <span className="text-zinc-300 font-medium">
                {selectedPinClient.survey?.municipio ? `${selectedPinClient.survey.municipio}, ${selectedPinClient.survey.estado || 'Zulia'}` : selectedPinClient.zona}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Geocerca Perímetro:</span>
              <span className="text-white font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                Radio {geofenceRadius}m Activo
              </span>
            </div>
            <div className="flex justify-between items-center font-mono text-[11px]">
              <span className="text-zinc-500">GPS Exacto:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-200 font-semibold">
                  {selectedPinClient.survey?.latitud.toFixed(5)}, {selectedPinClient.survey?.longitud.toFixed(5)}
                </span>
                <button
                  onClick={() =>
                    handleCopyCoords(
                      selectedPinClient.survey!.latitud,
                      selectedPinClient.survey!.longitud
                    )
                  }
                  className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                  title="Copiar coordenadas"
                >
                  {copiedCoords ? (
                    <Check className="w-3 h-3 text-red-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-white/10 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onSelectClient(selectedPinClient)}
              className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-red-950"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Ver Ficha Técnica</span>
            </button>

            {/* Direct Google Earth 3D Link */}
            <a
              href={`https://earth.google.com/web/@${selectedPinClient.survey?.latitud},${selectedPinClient.survey?.longitud},120a,350d,35y,0t,0r`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-2.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-500/30 transition-colors flex items-center gap-1 text-xs font-bold"
              title="Abrir en Google Earth 3D"
            >
              <Globe2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Google Earth 3D</span>
            </a>

            {/* Google Maps Link */}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${selectedPinClient.survey?.latitud},${selectedPinClient.survey?.longitud}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 transition-colors flex items-center justify-center"
              title="Abrir en Google Maps"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
