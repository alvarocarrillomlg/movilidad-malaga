#!/usr/bin/env node
// Genera calles.json, el índice de calles que usa el buscador, a partir del callejero municipal.
//
//   1. Descargar y descomprimir da_cartografiaCallejero-4326-csv.zip (datos abiertos del Ayuntamiento de Málaga,
//      conjunto «Sistema de Información Cartográfica - Callejero»).
//   2. node herramientas/generar-calles.js <carpeta con los CSV>
//
// El callejero cambia poco, así que el resultado se guarda en el repositorio y se regenera de vez en cuando.
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Uso: node herramientas/generar-calles.js <carpeta con los CSV del callejero>'); process.exit(1); }
const leer = (n) => fs.readFileSync(path.join(dir, `da_cartografia${n}-4326.csv`), 'utf8');

// CSV con campos entre comillas que pueden llevar comas y saltos de línea.
function csv(text) {
  const filas = []; let fila = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { fila.push(cur); cur = ''; }
    else if (ch === '\n') { fila.push(cur); filas.push(fila); fila = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || fila.length) { fila.push(cur); filas.push(fila); }
  const cab = filas.shift();
  return filas.filter((f) => f.length > 1).map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i]])));
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'al']);
const titulo = (s) => s.toLowerCase().split(/\s+/).filter(Boolean)
  .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : /^(x{0,3})(ix|iv|v?i{0,3})$/.test(w) ? w.toUpperCase() : w.replace(/(^|[-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()))).join(' ');
const plano = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const TILDES = { Callejon: 'Callejón', Travesia: 'Travesía', Autovia: 'Autovía' };
const tipos = Object.fromEntries(csv(leer('TipoVial')).map((t) => [t.CODTIPVIAL, TILDES[t.DESTIPVIAL] || t.DESTIPVIAL]));
const nucleo = (t) => plano(t).split(' ').filter((w) => !MINUSCULAS.has(w)).sort().join(' ');

// Rótulos del plano: traen el nombre con tildes, que el listado de viales no tiene.
const rotulos = new Map();
for (const r of csv(leer('ToponimiaVial'))) {
  const txt = r.TEXTO.replace(/\s+/g, ' ').trim();
  if (txt && !rotulos.has(r.CODVIAL5)) rotulos.set(r.CODVIAL5, txt);
}

// Geometría: tramos de cada vial.
const tramoDeVial = new Map();
for (const r of csv(leer('RelacionTramoVial'))) {
  if (!tramoDeVial.has(r.CODVIAL5)) tramoDeVial.set(r.CODVIAL5, []);
  tramoDeVial.get(r.CODVIAL5).push(r.ID_TRAMOVIAL);
}
const puntos = new Map();
for (const r of csv(leer('TramoVial'))) {
  if (r.FECBAJA) continue;
  const pts = [...r.SDOLINEA.matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => [Number(m[2]), Number(m[1])]);
  if (pts.length) puntos.set(r.ID_TRAMOVIAL, pts);
}

const calles = [];
for (const v of csv(leer('Vial'))) {
  if (v.FECBAJA) continue; // vial dado de baja
  const pts = (tramoDeVial.get(v.CODVIAL5) || []).flatMap((t) => puntos.get(t) || []);
  if (!pts.length) continue;
  const tipo = tipos[v.CODTIPVIAL] || 'Calle';
  if (tipo === 'Diseminado') continue;
  // El listado guarda los artículos al final («MARINA DE LA») y sin tildes: se recolocan, y si el rótulo del
  // plano nombra la misma calle (mismas palabras, sin contar artículos ni el tipo de vía) se usa ese, que trae tildes.
  let nombre = v.NOMVIAL.trim().replace(/^(.*?)\s+((?:DE|DEL|LA|LAS|LOS|EL)(?:\s+(?:LA|LAS|LOS|EL))?)$/i, '$2 $1');
  const rot = rotulos.get(v.CODVIAL5);
  if (rot) {
    const sinTipo = rot.replace(new RegExp(`^(${Object.values(tipos).map(plano).join('|')})\\s+`, 'i'), '');
    if (nucleo(sinTipo) === nucleo(nombre) && nucleo(nombre)) nombre = sinTipo;
  }
  // Punto de referencia: el punto del vial más cercano a su centro.
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const p = pts.reduce((m, q) => (Math.hypot(q[0] - cx, q[1] - cy) < Math.hypot(m[0] - cx, m[1] - cy) ? q : m));
  calles.push([titulo(`${tipo} ${nombre}`).replace(/^Callejon /, 'Callejón ').replace(/^Travesia /, 'Travesía ').replace(/^Autovia /, 'Autovía '), Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
}
calles.sort((a, b) => a[0].localeCompare(b[0], 'es'));
fs.writeFileSync(path.join(__dirname, '..', 'calles.json'), JSON.stringify({ fuente: 'Callejero del Ayuntamiento de Málaga (CC BY 4.0)', calles }));
console.log(`${calles.length} calles → calles.json`);
