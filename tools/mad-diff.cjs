#!/usr/bin/env node
/* ============================================================================
 *  MAD-Diff v0.1  (Node.js / CommonJS)  —  modo A (detección simple)
 *  ---------------------------------------------------------------------------
 *  QUE ES: compara DOS versiones del corpus (dos carpetas) y te dice, por cada
 *  artefacto (RF, DA, PH, ADR...), si su CONTENIDO cambió, se agregó o desapareció.
 *
 *  DIFERENCIA con mad-snapshot:
 *    - mad-snapshot dice "este RF existe / no existe" (presencia).
 *    - mad-diff dice "este RF DICE algo distinto que antes" (contenido).
 *
 *  MODO A (este): un veredicto por ID → IGUAL / CAMBIÓ / NUEVO / ELIMINADO.
 *    No muestra palabra por palabra (eso sería el modo B). Te dice CUÁLES
 *    cambiaron, que es lo que más necesitás para saber dónde mirar.
 *
 *  COMO DECIDE SI "CAMBIÓ": toma todo el texto bajo el encabezado de ese ID
 *  (hasta el siguiente encabezado del mismo nivel o mayor), lo normaliza
 *  (espacios, saltos de línea) y compara. Si el texto normalizado difiere,
 *  el contenido cambió.
 *
 *  USO:
 *    node tools/mad-diff.cjs <carpeta_vieja> <carpeta_nueva>
 *    node tools/mad-diff.cjs "C:\...\v180" "C:\...\v183"
 *    node tools/mad-diff.cjs <vieja> <nueva> --tipo RF-CORE   (filtra un tipo)
 *
 *  NOTA: extensión .cjs porque el package.json declara "type": "module".
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');

/* ============================================================================
 *  CONFIG  —  patrones de artefactos (mismos que mad-snapshot).
 * ==========================================================================*/
const CONFIG = {
  TIPOS: [
    { tipo: 'RF-CORE', re: /RF-CORE-[A-Z]{2,5}-\d{3}/ },
    { tipo: 'RF-ANA',  re: /RF-ANA-\d{3}/ },
    { tipo: 'RNF',     re: /RNF-[A-Z]{2,5}-\d{3}/ },
    { tipo: 'ADR',     re: /ADR-\d{2,3}/ },
    { tipo: 'DA',      re: /DA-\d{2,3}/ },
    { tipo: 'PH',      re: /PH-[A-Z0-9]{2,6}-\d{3}/ },
    { tipo: 'FUT',     re: /FUT-[A-Z]{1,5}-\d{3}/ },
    { tipo: 'FOA',     re: /FOA-[A-Z]{2,4}(?:-[A-Z]{2,4})?-\d{3}/ },
  ],

  // Documentos a saltear en la comparación de contenido (ledger histórico:
  // ahí los IDs se repiten a propósito y comparar no tiene sentido).
  SKIP_DOC: /_B_|_J_/,
};

const HEADING_RE = /^(\s*)(#{1,6})\s+(.*\S)\s*$/;

/* ----------------------------------------------------------------------------
 *  HELPERS
 * --------------------------------------------------------------------------*/
function read(p) { return fs.readFileSync(p, 'utf8'); }
function base(p) { return path.basename(p); }

function walkMd(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
}

function listarMd(dir) {
  const out = [];
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) walkMd(dir, out);
  return out.sort();
}

// Detecta el ID definido por un encabezado (si arranca con un ID conocido).
function idDelEncabezado(titulo) {
  for (const { tipo, re } of CONFIG.TIPOS) {
    const m = titulo.match(new RegExp('^(' + re.source + ')'));
    if (m) return { id: m[1], tipo };
  }
  return null;
}

// Normaliza un bloque de texto para comparar: colapsa espacios, saca líneas vacías.
function normalizar(texto) {
  return texto
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ----------------------------------------------------------------------------
 *  EXTRAER ARTEFACTOS de una carpeta: para cada ID, su título y su cuerpo.
 *  El cuerpo va desde su encabezado hasta el próximo encabezado de igual o
 *  mayor nivel (un # corta a un ###, un ## corta a un ##, etc.).
 * --------------------------------------------------------------------------*/
function extraerArtefactos(paths) {
  const artefactos = new Map(); // id -> { tipo, titulo, cuerpo, archivo }

  for (const p of paths) {
    if (CONFIG.SKIP_DOC.test(base(p))) continue;
    const lines = read(p).split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(HEADING_RE);
      if (!h) continue;
      const nivel = h[2].length;
      const titulo = h[3];
      const info = idDelEncabezado(titulo);
      if (!info) continue;

      // Juntar el cuerpo hasta el próximo encabezado de nivel <= nivel actual.
      const cuerpo = [];
      for (let j = i + 1; j < lines.length; j++) {
        const h2 = lines[j].match(HEADING_RE);
        if (h2 && h2[2].length <= nivel) break;
        cuerpo.push(lines[j]);
      }

      // Si el mismo ID ya estaba, nos quedamos con el primero (definición canónica).
      if (!artefactos.has(info.id)) {
        artefactos.set(info.id, {
          tipo: info.tipo,
          titulo: titulo.slice(info.id.length).replace(/^[\s—–\-:.]+/, '').trim(),
          cuerpo: normalizar(cuerpo.join('\n')),
          archivo: base(p),
        });
      }
    }
  }
  return artefactos;
}

/* ----------------------------------------------------------------------------
 *  COMPARAR las dos versiones.
 * --------------------------------------------------------------------------*/
function comparar(vieja, nueva, filtroTipo) {
  const idsVieja = new Set(vieja.keys());
  const idsNueva = new Set(nueva.keys());
  const todos = [...new Set([...idsVieja, ...idsNueva])].sort();

  const resultado = { iguales: [], cambiados: [], nuevos: [], eliminados: [] };

  for (const id of todos) {
    const a = vieja.get(id);
    const b = nueva.get(id);

    if (filtroTipo) {
      const tipo = (a || b).tipo;
      if (tipo !== filtroTipo) continue;
    }

    if (a && !b) { resultado.eliminados.push({ id, ...a }); continue; }
    if (!a && b) { resultado.nuevos.push({ id, ...b }); continue; }

    // Ambos existen: comparar contenido (título + cuerpo).
    const igualTitulo = a.titulo === b.titulo;
    const igualCuerpo = a.cuerpo === b.cuerpo;
    if (igualTitulo && igualCuerpo) {
      resultado.iguales.push({ id, tipo: b.tipo });
    } else {
      resultado.cambiados.push({
        id, tipo: b.tipo,
        cambioTitulo: !igualTitulo,
        cambioCuerpo: !igualCuerpo,
        tituloViejo: a.titulo, tituloNuevo: b.titulo,
      });
    }
  }
  return resultado;
}

/* ----------------------------------------------------------------------------
 *  REPORTE
 * --------------------------------------------------------------------------*/
function reportar(r, dirVieja, dirNueva, filtroTipo) {
  const bar = '='.repeat(68);
  console.log(bar);
  console.log('  MAD-Diff v0.1 (modo A)  —  Comparación de contenido entre versiones');
  console.log('  Versión vieja: ' + dirVieja);
  console.log('  Versión nueva: ' + dirNueva);
  if (filtroTipo) console.log('  Filtro: solo ' + filtroTipo);
  console.log(bar);

  console.log('\n  RESUMEN:');
  console.log('    Iguales (sin cambios): ' + r.iguales.length);
  console.log('    CAMBIARON de contenido: ' + r.cambiados.length);
  console.log('    NUEVOS:                 ' + r.nuevos.length);
  console.log('    ELIMINADOS:             ' + r.eliminados.length);

  if (r.cambiados.length) {
    console.log('\n  ── ARTEFACTOS QUE CAMBIARON DE CONTENIDO ──');
    for (const c of r.cambiados) {
      const que = [];
      if (c.cambioTitulo) que.push('título');
      if (c.cambioCuerpo) que.push('cuerpo');
      console.log('    ~ ' + c.id + '  (cambió: ' + que.join(' + ') + ')');
      if (c.cambioTitulo) {
        console.log('        título viejo: "' + (c.tituloViejo || '').slice(0, 60) + '"');
        console.log('        título nuevo: "' + (c.tituloNuevo || '').slice(0, 60) + '"');
      }
    }
  }

  if (r.nuevos.length) {
    console.log('\n  ── NUEVOS (no estaban en la versión vieja) ──');
    for (const n of r.nuevos) console.log('    + ' + n.id + '  ' + (n.titulo || '').slice(0, 55));
  }

  if (r.eliminados.length) {
    console.log('\n  ── ELIMINADOS (estaban en la vieja, ya no están) ──');
    for (const e of r.eliminados) console.log('    X ' + e.id + '  ' + (e.titulo || '').slice(0, 55));
    console.log('\n    ⚠️  Verificá si estos se retiraron a propósito o se perdieron.');
  }

  console.log('\n' + bar);
}

/* ----------------------------------------------------------------------------
 *  MAIN
 * --------------------------------------------------------------------------*/
if (require.main === module) {
  const args = process.argv.slice(2);
  let filtroTipo = null;
  const idxTipo = args.indexOf('--tipo');
  if (idxTipo !== -1 && args[idxTipo + 1]) filtroTipo = args[idxTipo + 1];

  const carpetas = args.filter((a, i) =>
    !a.startsWith('--') && (idxTipo === -1 || i !== idxTipo + 1));

  if (carpetas.length < 2) {
    console.log('Uso: node tools/mad-diff.cjs <carpeta_vieja> <carpeta_nueva> [--tipo RF-CORE]');
    console.log('Ejemplo:');
    console.log('  node tools/mad-diff.cjs "C:\\...\\v180" "C:\\...\\v183"');
    process.exit(1);
  }

  const [dirVieja, dirNueva] = carpetas;
  const pathsVieja = listarMd(dirVieja);
  const pathsNueva = listarMd(dirNueva);

  if (!pathsVieja.length) { console.log('No encontré .md en la carpeta vieja: ' + dirVieja); process.exit(1); }
  if (!pathsNueva.length) { console.log('No encontré .md en la carpeta nueva: ' + dirNueva); process.exit(1); }

  const vieja = extraerArtefactos(pathsVieja);
  const nueva = extraerArtefactos(pathsNueva);
  const r = comparar(vieja, nueva, filtroTipo);
  reportar(r, dirVieja, dirNueva, filtroTipo);

  // Exit 1 si algo se eliminó (útil para CI / alertas).
  process.exit(r.eliminados.length ? 1 : 0);
}

module.exports = { extraerArtefactos, comparar, normalizar };
