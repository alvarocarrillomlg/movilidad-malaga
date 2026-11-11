// Lee las fuentes públicas y las deja en el formato compacto que usa la página.
// Lo comparten el servidor local (server.js) y la función del despliegue (api/data.js).
'use strict';

const B = 'https://datosabiertos.malaga.eu/recursos';
const SRC = {
  buses: `${B}/transporte/EMT/EMTlineasUbicaciones/lineasyubicaciones.geojson`,
  lineas: `${B}/transporte/EMT/EMTLineasYParadas/lineasyparadas.geojson`,
  ocup: `${B}/aparcamientos/ocupappublicosmun/ocupappublicosmun.csv`,
  aparc: `${B}/aparcamientos/ubappublicosmun/da_aparcamientosPublicosMunicipales-4326.geojson`,
  cortes: `${B}/transporte/trafico/da_cortesTrafico-4326.geojson`,
  camaras: `${B}/transporte/trafico/da_camarasTrafico-4326.geojson`,
  tiempo: 'https://api.open-meteo.com/v1/forecast?latitude=36.72&longitude=-4.42&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day&timezone=Europe%2FMadrid',
  aire: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=36.72&longitude=-4.42&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=Europe%2FMadrid',
  mar: 'https://marine-api.open-meteo.com/v1/marine?latitude=36.70&longitude=-4.40&current=wave_height,wave_direction,wave_period,sea_surface_temperature&timezone=Europe%2FMadrid',
};

// Código del fichero de ocupación -> nombre en el fichero de ubicaciones
const PARKING = {
  SA: 'Salitre', CE: 'Cervantes', PA: 'El Palo', AN: 'Av. de Andalucía', CA: 'Camas',
  CR: 'Cruz De Humilladero', AL: 'Alcazaba', SJ: 'San Juan De La Cruz', MA: 'Pz. de la Marina',
  TE: 'Tejón y Rodriguez', PB: 'Pío Baroja',
};
// El fichero municipal trae Pío Baroja sin coordenadas; posición aproximada.
const PARKING_FIX = { 'Pío Baroja': [36.7213, -4.3556] };

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'MovilidadMalaga/1.0' }, signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).host}`);
  const buf = await res.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('latin1').decode(buf); }
}
const getJson = async (url) => JSON.parse(await getText(url));

const r5 = (x) => Math.round(Number(x) * 1e5) / 1e5;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Hora local de Málaga -> milisegundos, sin depender de la zona horaria de la máquina.
function madridMs(y, mo, d, h, mi, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(guess).map((x) => [x.type, Number(x.value)]));
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess);
}
function fechaMs(s) { // "09/11/2026 08:00"
  const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
  return m ? madridMs(+m[3], +m[2], +m[1], +m[4], +m[5]) : null;
}

async function buses() {
  const raw = await getJson(SRC.buses);
  let upd = null;
  const list = [];
  for (const f of raw) {
    const [lon, lat] = (f.geometry?.coordinates ?? []).map(Number);
    if (!lat || Math.abs(lat) < 1) continue;
    const u = f.properties?.last_update;
    if (u && (!upd || u > upd)) upd = u;
    list.push({ id: String(f.codBus), c: Math.trunc(Number(f.codLinea)), s: Number(f.sentido), lat: r5(lat), lon: r5(lon), p: Number(f.codParIni) });
  }
  const m = upd && upd.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return { t: Date.now(), upd: m ? madridMs(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]) : Date.now(), buses: list };
}

async function lineas() {
  const raw = await getJson(SRC.lineas);
  const stops = new Map();
  const lines = raw.map((l) => {
    const r = { 1: [], 2: [] };
    [...l.paradas].sort((a, b) => a.sentido - b.sentido || a.orden - b.orden).forEach((p) => {
      const pa = p.parada, id = Number(pa.codParada);
      if (Math.abs(Number(pa.latitud)) < 1) return;
      if (!stops.has(id)) stops.set(id, { id, n: clean(pa.nombreParada), d: clean(pa.direccion), lat: r5(pa.latitud), lon: r5(pa.longitud) });
      (r[Number(p.sentido)] ??= []).push(id);
    });
    return { c: Math.trunc(Number(l.codLinea)), u: String(l.userCodLinea), n: clean(l.nombreLinea), ida: clean(l.cabeceraIda),
      vuelta: clean(l.cabeceraVuelta), obs: clean(l.observaciones), r };
  });
  return { t: Date.now(), lines, stops: [...stops.values()] };
}

async function aparcamientos() {
  const [csv, geo] = await Promise.all([getText(SRC.ocup), getJson(SRC.aparc)]);
  const libres = {};
  csv.trim().split(/\r?\n/).slice(1).forEach((row) => { const c = row.split(','); if (c[1]) libres[c[1].trim()] = Number(c[2]) || 0; });
  const byName = Object.fromEntries(geo.features.map((f) => [f.properties.name, f]));
  const list = [];
  for (const [cod, n] of Object.entries(libres)) {
    const name = PARKING[cod];
    if (!name) continue;
    const f = byName[name];
    let [lon, lat] = f ? f.geometry.coordinates : [0, 0];
    let aprox = false;
    if (Math.abs(lat) < 1 && PARKING_FIX[name]) { [lat, lon] = PARKING_FIX[name]; aprox = true; }
    if (Math.abs(lat) < 1) continue;
    const d = clean(f?.properties.address).replace(/\s*-?\s*(\d{5} )?Málaga( \(Málaga\))?$/, '').replace(/\s*-\s*$/, '');
    list.push({ id: cod, n: name.replace('Pz.', 'Plaza').replace(' De ', ' de ').replace(' y Rodriguez', ' y Rodríguez'), d,
      lat: r5(lat), lon: r5(lon), libres: n, aprox });
  }
  return { t: Date.now(), sinUbicar: Object.keys(libres).filter((k) => !PARKING[k]), list };
}

async function cortes() {
  const list = [];
  for (const f of (await getJson(SRC.cortes)).features) {
    const [lon, lat] = f.geometry.coordinates;
    if (Math.abs(lat) < 1) continue;
    const p = f.properties;
    list.push({ id: p.ID, d: clean(p.DESCRIPCION), dir: clean(p.DIRECCION), nota: clean(p.NOTAS), tipo: clean(p.TIPOCORTE),
      af: clean(p.TIPOAFECTACION), desde: fechaMs(p.DESDE), hasta: fechaMs(p.HASTA), lat: r5(lat), lon: r5(lon) });
  }
  return { t: Date.now(), list };
}

async function camaras() {
  const list = [];
  for (const f of (await getJson(SRC.camaras)).features) {
    const [lon, lat] = f.geometry.coordinates;
    if (Math.abs(lat) < 1) continue;
    const p = f.properties;
    list.push({ id: p.ID, n: clean(p.NOMBRE), d: clean(p.DESCRIPCION), dir: clean(p.DIRECCION), url: p.URL, img: p.URLIMAGEN, lat: r5(lat), lon: r5(lon) });
  }
  return { t: Date.now(), list };
}

async function clima() {
  const out = { t: Date.now() };
  await Promise.all([['tiempo', 'w'], ['aire', 'a'], ['mar', 'm']].map(async ([src, key]) => {
    try { out[key] = (await getJson(SRC[src])).current; } catch (e) { console.warn(`clima/${src}: ${e.message}`); }
  }));
  return out;
}

// nombre -> [lector, segundos que se puede reutilizar la respuesta]
const DATOS = {
  buses: [buses, 20], lineas: [lineas, 6 * 3600], aparcamientos: [aparcamientos, 60],
  cortes: [cortes, 600], camaras: [camaras, 3600], clima: [clima, 600],
};

const ESQUELETO = '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const pagina = (contenido) => `${ESQUELETO}${contenido}</body></html>`;

module.exports = { DATOS, pagina };
