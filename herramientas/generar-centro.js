#!/usr/bin/env node
// Genera centro-restringido.json: las calles del centro histórico según su uso en el callejero municipal,
// para poder descartar los cortes que caen en calles peatonales o de acceso restringido.
//
//   node herramientas/generar-centro.js <carpeta con los CSV del callejero>
//
// En el callejero, cada tramo de vial lleva un uso (CODUSOTRAMOV): 6 = peatonal de tráfico restringido,
// 5 = peatonal; el resto son calles abiertas al tráfico.
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Uso: node herramientas/generar-centro.js <carpeta con los CSV del callejero>'); process.exit(1); }
const texto = fs.readFileSync(path.join(dir, 'da_cartografiaTramoVial-4326.csv'), 'utf8');

const tramos = [];
for (const linea of texto.split('\n').slice(1)) {
  const m = linea.match(/^[^,]*,\d+,(\d+),(\d+),([^,]*),([^,]*),"LINESTRING \(([^)]*)\)"/);
  if (!m || m[4]) continue; // sin geometría o dado de baja
  tramos.push({ uso: m[2], pts: m[5].split(', ').map((p) => { const [lon, lat] = p.split(' ').map(Number); return [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]; }) });
}

// Contorno: envolvente de los tramos de tráfico restringido que están en el centro histórico.
const CAJA = { s: 36.7165, n: 36.7260, o: -4.4270, e: -4.4140 };
const enCaja = (p) => p[0] > CAJA.s && p[0] < CAJA.n && p[1] > CAJA.o && p[1] < CAJA.e;
const puntos = tramos.filter((t) => t.uso === '6').flatMap((t) => t.pts).filter(enCaja).map((p) => [p[1], p[0]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const giro = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const mitad = (lista) => { const h = []; for (const p of lista) { while (h.length >= 2 && giro(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } return h.slice(0, -1); };
const contorno = [...mitad(puntos), ...mitad([...puntos].reverse())].map((p) => [p[1], p[0]]);

const dentro = (t) => t.pts.some(enCaja);
const salida = {
  fuente: 'Callejero del Ayuntamiento de Málaga (CC BY 4.0), tramos de vial por uso',
  contorno,
  peatonal: tramos.filter((t) => (t.uso === '5' || t.uso === '6') && dentro(t)).map((t) => t.pts),
  trafico: tramos.filter((t) => t.uso !== '5' && t.uso !== '6' && dentro(t)).map((t) => t.pts),
};
fs.writeFileSync(path.join(__dirname, '..', 'centro-restringido.json'), JSON.stringify(salida));
console.log(`contorno de ${contorno.length} vértices, ${salida.peatonal.length} tramos peatonales o restringidos, ${salida.trafico.length} de tráfico → centro-restringido.json`);
