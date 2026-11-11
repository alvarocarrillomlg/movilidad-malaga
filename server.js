#!/usr/bin/env node
// La movilidad de Málaga en directo — servidor local
//
//   node server.js              sirve la página en http://localhost:8080
//   node server.js --snapshot   guarda una copia de los datos en ./data
//
// Necesita Node 18 o posterior; no hay que instalar nada más.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DATOS, pagina } = require('./lib/fuentes');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const cache = {};

async function datos(nombre) {
  const [leer, ttl] = DATOS[nombre];
  const c = cache[nombre];
  if (c && c.json && Date.now() - c.t < (c.parcial ? 60 : ttl) * 1000) return c.json;
  if (c?.pendiente) return c.pendiente;
  const pendiente = leer().then((d) => {
    cache[nombre] = { t: Date.now(), json: JSON.stringify(d), parcial: !!d.parcial }; // un resultado incompleto se reintenta al minuto
    return cache[nombre].json;
  }).catch((e) => {
    console.warn(`${nombre}: ${e.message}`);
    if (c) { delete c.pendiente; return c.json; } // si la fuente falla, se sirve lo último que se tuvo
    delete cache[nombre];
    throw e;
  });
  cache[nombre] = { ...c, pendiente };
  return pendiente;
}

async function tesela(z, x, y) {
  const file = path.join(ROOT, 'tiles', z, x, `${y}.png`);
  if (!fs.existsSync(file)) { // se pide a OpenStreetMap una sola vez y se guarda
    const res = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: { 'User-Agent': 'MovilidadMalaga/1.0' } });
    if (!res.ok) throw new Error(`tesela ${res.status}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file);
}

async function main() {
  if (process.argv.includes('--snapshot')) {
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    for (const nombre of Object.keys(DATOS)) {
      fs.writeFileSync(path.join(ROOT, 'data', `${nombre}.json`), await datos(nombre));
      console.log(`data/${nombre}.json`);
    }
    return;
  }
  http.createServer(async (req, res) => {
    const ruta = decodeURIComponent(req.url.split('?')[0]);
    const enviar = (code, type, body, cc = 'no-store') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': cc }); res.end(body); };
    try {
      let m;
      if (ruta === '/' || ruta === '/index.html') enviar(200, 'text/html; charset=utf-8', pagina(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
      else if ((m = ruta.match(/^\/data\/(\w+)\.json$/)) && DATOS[m[1]]) enviar(200, 'application/json; charset=utf-8', await datos(m[1]));
      else if ((m = ruta.match(/^\/tiles\/(\d{1,2})\/(\d+)\/(\d+)\.png$/))) enviar(200, 'image/png', await tesela(m[1], m[2], m[3]), 'max-age=604800');
      else enviar(404, 'text/plain; charset=utf-8', 'No encontrado');
    } catch (e) {
      console.warn(`${ruta}: ${e.message}`);
      enviar(502, 'text/plain; charset=utf-8', 'Fuente no disponible');
    }
  }).listen(PORT, () => console.log(`La movilidad de Málaga en directo → http://localhost:${PORT}`));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
