const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const CSV_PATH = 'C:/Users/JAVIER CASTELLANOS/.gemini/antigravity/brain/deb5db05-3034-4769-9f8f-2f22cb45a985/.user_uploaded/media_1792596937479_9bc1bdd6.csv';
const OSM_PATH = path.join(__dirname, 'osm_streets_places.json');
const SURVEY_JSON_PATH = path.join(__dirname, '../src/data/surveyLocations.json');
const CARTERA_TS_PATH = path.join(__dirname, '../src/data/carteraClientes.ts');

console.log('1. Loading OSM streets and places...');
const osmRaw = JSON.parse(fs.readFileSync(OSM_PATH, 'utf8'));
const elements = Array.isArray(osmRaw) ? osmRaw : (osmRaw.elements || []);

const streets = [];
const places = [];
const amenities = [];

for (const el of elements) {
  const tags = el.tags || {};
  const name = (tags.name || '').trim();
  const addrStreet = (tags['addr:street'] || '').trim();
  const addrPlace = (tags['addr:place'] || tags['addr:suburb'] || tags['addr:neighbourhood'] || '').trim();

  if (addrStreet && (typeof el.lat === 'number' || typeof el.center?.lat === 'number')) {
    const lat = el.lat ?? el.center.lat;
    const lon = el.lon ?? el.center.lon;
    streets.push({
      name: addrStreet,
      highway: 'residential',
      geom: [{ lat, lon }],
      minLat: lat, maxLat: lat, minLon: lon, maxLon: lon,
    });
  }
  if (addrPlace && (typeof el.lat === 'number' || typeof el.center?.lat === 'number')) {
    const lat = el.lat ?? el.center.lat;
    const lon = el.lon ?? el.center.lon;
    places.push({
      name: addrPlace,
      placeType: 'neighbourhood',
      lat,
      lon,
    });
  }

  if (!name) continue;

  const geom = Array.isArray(el.geometry) && el.geometry.length > 0
    ? el.geometry
    : (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number'
      ? [el.center]
      : (typeof el.lat === 'number' && typeof el.lon === 'number' ? [{ lat: el.lat, lon: el.lon }] : null));

  if (tags.highway && geom) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const pt of geom) {
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
    }
    streets.push({
      name,
      highway: tags.highway,
      geom,
      minLat, maxLat, minLon, maxLon,
    });
  } else if (tags.place) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat === 'number' && typeof lon === 'number') {
      places.push({
        name,
        placeType: tags.place,
        lat,
        lon,
      });
    }
  } else if (tags.amenity || tags.shop || tags.leisure) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat === 'number' && typeof lon === 'number') {
      amenities.push({
        name,
        amenity: tags.amenity || tags.shop || tags.leisure,
        lat,
        lon,
      });
    }
  }
}

console.log(`Loaded ${streets.length} streets, ${places.length} places, ${amenities.length} amenities.`);

// Spatial grid index for streets (cell size 0.02 deg ~ 2.2km)
const CELL_SIZE = 0.02;
const streetGrid = new Map();
function getCellKey(latIdx, lonIdx) {
  return `${latIdx}:${lonIdx}`;
}

for (let i = 0; i < streets.length; i++) {
  const s = streets[i];
  const minLatIdx = Math.floor((s.minLat - 0.01) / CELL_SIZE);
  const maxLatIdx = Math.floor((s.maxLat + 0.01) / CELL_SIZE);
  const minLonIdx = Math.floor((s.minLon - 0.01) / CELL_SIZE);
  const maxLonIdx = Math.floor((s.maxLon + 0.01) / CELL_SIZE);
  for (let a = minLatIdx; a <= maxLatIdx; a++) {
    for (let b = minLonIdx; b <= maxLonIdx; b++) {
      const k = getCellKey(a, b);
      let arr = streetGrid.get(k);
      if (!arr) {
        arr = [];
        streetGrid.set(k, arr);
      }
      arr.push(s);
    }
  }
}

// Point to segment distance in meters
function distPointToSegmentMeters(lat, lon, lat1, lon1, lat2, lon2) {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const x = lon * cosLat * 111320;
  const y = lat * 111320;
  const x1 = lon1 * cosLat * 111320;
  const y1 = lat1 * 111320;
  const x2 = lon2 * cosLat * 111320;
  const y2 = lat2 * 111320;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

function distMeters(lat1, lon1, lat2, lon2) {
  const cosLat = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
  const dx = (lon2 - lon1) * cosLat * 111320;
  const dy = (lat2 - lat1) * 111320;
  return Math.hypot(dx, dy);
}

// Geographic bounding / municipal centers for exact municipality & state determination
const MUNICIPALITY_ZONES = [
  { municipio: 'Maracaibo', estado: 'Zulia', lat: 10.6666, lon: -71.6125, radiusKm: 16 },
  { municipio: 'San Francisco', estado: 'Zulia', lat: 10.555, lon: -71.645, radiusKm: 12 },
  { municipio: 'Mara (San Rafael de El Moján)', estado: 'Zulia', lat: 10.905, lon: -71.735, radiusKm: 22 },
  { municipio: 'Guajira', estado: 'Zulia', lat: 11.15, lon: -71.85, radiusKm: 35 },
  { municipio: 'Jesús Enrique Lossada (La Concepción)', estado: 'Zulia', lat: 10.62, lon: -71.83, radiusKm: 25 },
  { municipio: 'La Cañada de Urdaneta', estado: 'Zulia', lat: 10.42, lon: -71.71, radiusKm: 20 },
  { municipio: 'Rosario de Perijá (La Villa del Rosario)', estado: 'Zulia', lat: 10.325, lon: -72.313, radiusKm: 28 },
  { municipio: 'Machiques de Perijá', estado: 'Zulia', lat: 10.064, lon: -72.545, radiusKm: 35 },
  { municipio: 'Santa Rita', estado: 'Zulia', lat: 10.536, lon: -71.511, radiusKm: 12 },
  { municipio: 'Miranda (Los Puertos de Altagracia)', estado: 'Zulia', lat: 10.675, lon: -71.47, radiusKm: 20 },
  { municipio: 'Cabimas', estado: 'Zulia', lat: 10.398, lon: -71.446, radiusKm: 16 },
  { municipio: 'Simón Bolívar (Tía Juana)', estado: 'Zulia', lat: 10.26, lon: -71.37, radiusKm: 10 },
  { municipio: 'Lagunillas (Ciudad Ojeda)', estado: 'Zulia', lat: 10.198, lon: -71.308, radiusKm: 16 },
  { municipio: 'Valmore Rodríguez (Bachaquero)', estado: 'Zulia', lat: 9.96, lon: -71.15, radiusKm: 18 },
  { municipio: 'Baralt (Mene Grande)', estado: 'Zulia', lat: 9.815, lon: -70.925, radiusKm: 22 },
  { municipio: 'Colón (Santa Bárbara del Zulia)', estado: 'Zulia', lat: 8.995, lon: -71.915, radiusKm: 25 },
  { municipio: 'Sucre (Caja Seca)', estado: 'Zulia', lat: 9.142, lon: -71.075, radiusKm: 22 },
  { municipio: 'Carirubana (Punto Fijo)', estado: 'Falcón', lat: 11.695, lon: -70.195, radiusKm: 22 },
  { municipio: 'Los Taques (Judibana)', estado: 'Falcón', lat: 11.78, lon: -70.18, radiusKm: 15 },
  { municipio: 'Falcón (Pueblo Nuevo)', estado: 'Falcón', lat: 11.95, lon: -69.92, radiusKm: 25 },
  { municipio: 'Miranda (Coro)', estado: 'Falcón', lat: 11.404, lon: -69.673, radiusKm: 25 },
  { municipio: 'Colina (La Vela de Coro)', estado: 'Falcón', lat: 11.46, lon: -69.57, radiusKm: 15 },
  { municipio: 'Dabajuro', estado: 'Falcón', lat: 11.022, lon: -70.677, radiusKm: 20 },
  { municipio: 'Mene de Mauroa', estado: 'Falcón', lat: 10.716, lon: -71.01, radiusKm: 22 },
  { municipio: 'Valera', estado: 'Trujillo', lat: 9.317, lon: -70.603, radiusKm: 18 },
  { municipio: 'Trujillo', estado: 'Trujillo', lat: 9.366, lon: -70.436, radiusKm: 18 },
  { municipio: 'Boconó', estado: 'Trujillo', lat: 9.253, lon: -70.251, radiusKm: 22 },
  { municipio: 'Alberto Adriani (El Vigía)', estado: 'Mérida', lat: 8.618, lon: -71.653, radiusKm: 22 },
  { municipio: 'Libertador (Mérida)', estado: 'Mérida', lat: 8.59, lon: -71.15, radiusKm: 22 },
];

function resolveExactAddressAndZone(lat, lon, rawMunicipio, rawEstado) {
  const latIdx = Math.floor(lat / CELL_SIZE);
  const lonIdx = Math.floor(lon / CELL_SIZE);
  const candidateStreets = new Set();
  for (let a = latIdx - 1; a <= latIdx + 1; a++) {
    for (let b = lonIdx - 1; b <= lonIdx + 1; b++) {
      const arr = streetGrid.get(getCellKey(a, b));
      if (arr) {
        for (const s of arr) candidateStreets.add(s);
      }
    }
  }

  // Find closest street and second distinct street
  const streetDists = new Map();
  for (const s of candidateStreets) {
    let minD = Infinity;
    const g = s.geom;
    if (g.length === 1) {
      minD = distMeters(lat, lon, g[0].lat, g[0].lon);
    } else {
      for (let i = 0; i < g.length - 1; i++) {
        const d = distPointToSegmentMeters(lat, lon, g[i].lat, g[i].lon, g[i + 1].lat, g[i + 1].lon);
        if (d < minD) minD = d;
      }
    }
    const prev = streetDists.get(s.name);
    if (prev === undefined || minD < prev) {
      streetDists.set(s.name, minD);
    }
  }

  const sortedStreets = Array.from(streetDists.entries()).sort((a, b) => a[1] - b[1]);
  const primaryStreet = sortedStreets[0] && sortedStreets[0][1] <= 750 ? sortedStreets[0] : null;
  const crossStreet =
    sortedStreets[1] &&
    primaryStreet &&
    sortedStreets[1][1] <= 180 &&
    sortedStreets[1][0].toLowerCase() !== primaryStreet[0].toLowerCase()
      ? sortedStreets[1]
      : null;

  // Find nearest neighbourhood / suburb / sector place
  let nearestSuburb = null;
  let nearestSuburbDist = Infinity;
  let nearestCity = null;
  let nearestCityDist = Infinity;

  for (const p of places) {
    const d = distMeters(lat, lon, p.lat, p.lon);
    if (
      p.placeType === 'neighbourhood' ||
      p.placeType === 'suburb' ||
      p.placeType === 'quarter' ||
      p.placeType === 'residential' ||
      p.placeType === 'hamlet' ||
      p.placeType === 'village'
    ) {
      if (d < nearestSuburbDist && d <= 2800) {
        nearestSuburbDist = d;
        nearestSuburb = p.name;
      }
    } else if (p.placeType === 'city' || p.placeType === 'town') {
      if (d < nearestCityDist && d <= 25000) {
        nearestCityDist = d;
        nearestCity = p.name;
      }
    }
  }

  // Resolve municipality and state by coordinates if Maracaibo vs San Francisco or missing
  let bestMun = null;
  let bestMunDist = Infinity;
  for (const mz of MUNICIPALITY_ZONES) {
    const dKm = distMeters(lat, lon, mz.lat, mz.lon) / 1000;
    if (dKm < bestMunDist) {
      bestMunDist = dKm;
      bestMun = mz;
    }
  }

  // Refined Maracaibo vs San Francisco boundary (approx lat 10.595)
  let estado = (rawEstado || '').trim();
  let municipio = (rawMunicipio || '').trim();
  if (lat >= 10.50 && lat <= 10.76 && lon >= -71.75 && lon <= -71.55) {
    estado = 'Zulia';
    if (lat < 10.593) {
      municipio = 'San Francisco';
    } else {
      municipio = 'Maracaibo';
    }
  } else if (bestMun && bestMunDist <= bestMun.radiusKm * 1.5) {
    if (!estado) estado = bestMun.estado;
    if (!municipio || municipio.toLowerCase() === 'falcon' || municipio.toLowerCase() === 'zulia') {
      municipio = bestMun.municipio;
    }
  }
  if (!estado) estado = bestMun ? bestMun.estado : 'Zulia';
  if (!municipio) municipio = nearestCity || (bestMun ? bestMun.municipio : 'Maracaibo');

  // Determine exact sector
  let sector = '';
  if (nearestSuburb && primaryStreet) {
    sector = `${nearestSuburb} (${primaryStreet[0]})`;
  } else if (nearestSuburb) {
    sector = nearestSuburb;
  } else if (primaryStreet) {
    sector = primaryStreet[0];
  } else if (nearestCity) {
    sector = `${nearestCity}`;
  } else {
    sector = municipio;
  }

  // Build exact physical address
  const addrParts = [];
  if (primaryStreet) {
    if (crossStreet) {
      addrParts.push(`${primaryStreet[0]} con ${crossStreet[0]}`);
    } else {
      addrParts.push(primaryStreet[0]);
    }
  }
  if (nearestSuburb && (!primaryStreet || !primaryStreet[0].toLowerCase().includes(nearestSuburb.toLowerCase()))) {
    addrParts.push(`Sector/Urb. ${nearestSuburb}`);
  }
  addrParts.push(`Mun. ${municipio}, Edo. ${estado}`);

  const direccion = `${addrParts.join(', ')} (${lat.toFixed(6)}, ${lon.toFixed(6)})`;

  return {
    direccion,
    sector,
    municipio,
    estado,
  };
}

// Load Cartera IDs & names for matchedWithCartera check
const carteraText = fs.readFileSync(CARTERA_TS_PATH, 'utf8');
const carteraIds = new Set();
const idRegex = /"id":\s*"([^"]+)"/g;
let m;
while ((m = idRegex.exec(carteraText)) !== null) {
  carteraIds.add(m[1].trim());
}

// Map seller email / name to canonical seller name
const VENDEDOR_MAP = {
  'maryerygarcia29@gmail.com': 'MARYERY GARCIA',
  'elchupax@gmail.com': 'PEDRO ABREU',
  'carlosfuenmayor@codizulca.com': 'CARLOS FUENMAYOR',
  'cfuenmayor258@gmail.com': 'CARLOS FUENMAYOR',
  'eduardopina@codizulca.com': 'EDUARDO PIÑA',
  'eduardopina956@gmail.com': 'EDUARDO PIÑA',
  'leonardorios@codizulca.com': 'LEONARDO RIOS',
  'leonardorios1908@gmail.com': 'LEONARDO RIOS',
  'luisguanipa@codizulca.com': 'VICTORIA VARGAS',
  'guanipaluis28@gmail.com': 'VICTORIA VARGAS',
  'victoria.vargas@codizulca.com': 'VICTORIA VARGAS',
  'oscarortiz@codizulca.com': 'OSCAR ORTIZ',
  'oscarortiz3020@gmail.com': 'OSCAR ORTIZ',
  'mikelangelodiaz@codizulca.com': 'MIKELANGELO DIAZ',
  'mikelangelodiaz@gmail.com': 'MIKELANGELO DIAZ',
  'mariabriceno@codizulca.com': 'MARÍA BRICEÑO',
  'marianachacin@codizulca.com': 'MARIANA CHACÍN',
  'hernanpaz@codizulca.com': 'HERNÁN PAZ',
  'oswaldochurion@codizulca.com': 'OSWALDO CHURIÓN',
  'sarahreyes@codizulca.com': 'SARAH REYES',
  'jpabloaraujo@codizulca.com': 'J PABLO ARAUJO',
  'josegonzalez@codizulca.com': 'JOSE G. GONZALEZ',
  'angelicamoreno@codizulca.com': 'ANGELICA MORENO',
  'adeljaraba@codizulca.com': 'ADEL JARABA',
  'juanhernandez@codizulca.com': 'JUAN HERNÁNDEZ',
  'yoleidalugo@codizulca.com': 'YOLEIDA LUGO',
  'sairuvalles@codizulca.com': 'SAIRÚ VALLES',
  'elisasoler@codizulca.com': 'ELISA SOLER',
};

console.log('2. Parsing attached CSV...');
const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
console.log(`Parsed ${parsed.data.length} rows from attached CSV.`);

// Also load existing surveyLocations.json so we don't lose any previously matched client
let existingSurveys = [];
if (fs.existsSync(SURVEY_JSON_PATH)) {
  existingSurveys = JSON.parse(fs.readFileSync(SURVEY_JSON_PATH, 'utf8'));
}

// Deduplicate CSV rows by client (ID del Cliente if non-empty, else RIF + Nombre) keeping the best row (COMPLETA with valid GPS and latest timestamp)
const clientMap = new Map();

function getClientKey(clienteId, rif, nombre) {
  const cleanId = String(clienteId || '').trim();
  if (cleanId && cleanId !== '0' && cleanId !== 'N/A' && cleanId !== '-') {
    return `ID:${cleanId}`;
  }
  const cleanNombre = String(nombre || '').trim().toUpperCase();
  const cleanRif = String(rif || '').trim().toUpperCase();
  return `NAME:${cleanNombre}|RIF:${cleanRif}`;
}

function isValidCoord(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lon) &&
    lat >= 7.0 &&
    lat <= 13.0 &&
    lon >= -74.0 &&
    lon <= -68.0
  );
}

// Seed from existing surveys first
for (const ex of existingSurveys) {
  const k = getClientKey(ex.clienteId, ex.rifCedula, ex.clienteNombre);
  clientMap.set(k, ex);
}

// Process all 2,603 rows from attached CSV (from bottom to top or keeping valid GPS + COMPLETA)
const rows = parsed.data;
for (let i = rows.length - 1; i >= 0; i--) {
  const r = rows[i];
  const clienteId = String(r['ID del Cliente'] || '').trim();
  const clienteNombre = String(r['Nombre del Cliente'] || '').trim();
  if (!clienteNombre) continue;

  const rawVendedor = String(r['Vendedor'] || '').trim();
  const vendedorUpper = VENDEDOR_MAP[rawVendedor.toLowerCase()] || rawVendedor.toUpperCase();
  const estadoEncuesta = String(r['Estado de la Encuesta'] || 'COMPLETA').trim().toUpperCase();
  const tipoCliente = String(r['Tipo de Cliente'] || '').trim();
  const rifCedula = String(r['RIF / Cédula'] || '').trim();
  const telefono = String(r['Teléfono'] || '').trim();
  const email = String(r['Email'] || '').trim();
  const rawEstado = String(r['Estado (Ubicación)'] || '').trim();
  const rawMunicipio = String(r['Municipio'] || '').trim();
  const rawLat = parseFloat(String(r['Latitud'] || '').replace(',', '.'));
  const rawLon = parseFloat(String(r['Longitud'] || '').replace(',', '.'));
  const hasGps = isValidCoord(rawLat, rawLon);
  const notas = String(r['Notas'] || '').trim();
  const fechaHora = String(r['Fecha y Hora'] || '').trim();
  const fecha = fechaHora.split(',')[0].trim() || '21/10/2026';

  const key = getClientKey(clienteId, rifCedula, clienteNombre);
  const prev = clientMap.get(key);

  // Prefer record with valid GPS; if both have GPS, prefer newer row (smaller index `i` in CSV since CSV is descending)
  if (prev && isValidCoord(prev.latitud, prev.longitud) && !hasGps) {
    continue;
  }

  clientMap.set(key, {
    surveyId: prev?.surveyId || `SURV-${String(clientMap.size + 1).padStart(4, '0')}`,
    clienteId,
    clienteNombre,
    vendedorEmail: rawVendedor.includes('@') ? rawVendedor : (prev?.vendedorEmail || ''),
    vendedor: vendedorUpper || prev?.vendedor || '',
    estadoEncuesta,
    tipoCliente: tipoCliente || prev?.tipoCliente || 'Comercio',
    rifCedula: rifCedula || prev?.rifCedula || '',
    telefono: telefono || prev?.telefono || '',
    email: email || prev?.email || '',
    estado: rawEstado || prev?.estado || '',
    municipio: rawMunicipio || prev?.municipio || '',
    latitud: hasGps ? rawLat : (prev?.latitud ?? null),
    longitud: hasGps ? rawLon : (prev?.longitud ?? null),
    notas: notas || `[${estadoEncuesta} - ${fechaHora}]`,
    fecha,
    matchedWithCartera: Boolean(clienteId && carteraIds.has(clienteId)) || Boolean(prev?.matchedWithCartera),
  });
}

// Now enrich every entry in clientMap with exact OSM address, sector, municipio, estado
const finalSurveys = [];
let idx = 1;
let withExactAddress = 0;

for (const item of clientMap.values()) {
  item.surveyId = `SURV-${String(idx++).padStart(4, '0')}`;
  if (isValidCoord(item.latitud, item.longitud)) {
    const resolved = resolveExactAddressAndZone(
      item.latitud,
      item.longitud,
      item.municipio,
      item.estado
    );
    item.direccion = resolved.direccion;
    item.sector = resolved.sector;
    item.municipio = resolved.municipio;
    item.estado = resolved.estado;
    withExactAddress++;
  } else {
    item.latitud = null;
    item.longitud = null;
    item.direccion = '';
    item.sector = '';
  }
  finalSurveys.push(item);
}

fs.writeFileSync(SURVEY_JSON_PATH, JSON.stringify(finalSurveys, null, 2), 'utf8');
console.log(`Saved ${finalSurveys.length} unique client survey records to src/data/surveyLocations.json (${withExactAddress} with exact GPS & OSM address).`);
console.log('Sample 3 enriched records:', finalSurveys.slice(0, 3));
