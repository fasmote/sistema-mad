#!/usr/bin/env node
/* ============================================================================
 *  MAD-Snapshot v0.1  (Node.js / CommonJS)
 *  ---------------------------------------------------------------------------
 *  QUE ES: la herramienta de "antes y despues" del corpus SOS. Combina tres
 *  cosas en un solo comando, pensada para correr ANTES y DESPUES de cada cambio
 *  documental para asegurarse de que no se rompio ni se perdio nada.
 *
 *  HACE TRES COSAS:
 *    1) SELLO TEMPORAL automatico en zona horaria de Buenos Aires (ART).
 *    2) CENSO de artefactos: cuenta RF-CORE, RF-ANA, RNF, ADR, DA, PH, FUT, FOA.
 *    3) DIFF contra la corrida anterior: que ID aparecio, cual desaparecio.
 *       (Esto es lo que te protege de borrar un RF sin querer al reescribir.)
 *
 *  Ademas corre los chequeos de coherencia del linter si esta disponible:
 *    referencias colgadas, IDs duplicados, titulos fabricados [H].
 *
 *  GUARDA un archivo .snapshot.json con el censo, para comparar la proxima vez.
 *
 *  USO:
 *    node tools/mad-snapshot.cjs ./docs
 *    node tools/mad-snapshot.cjs ./docs --salida docs/.snapshot.json
 *
 *  NOTA: extension .cjs porque el package.json declara "type": "module".
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');

// El linter es opcional: si esta, corremos sus chequeos de coherencia.
let linterDisponible = false;
let lintFn = null;
try {
  const mod = require('./mad-linter.cjs');
  lintFn = mod.lint;
  linterDisponible = true;
} catch (e) { /* el linter no esta, seguimos sin sus chequeos */ }

/* ============================================================================
 *  CONFIG  —  patrones de los artefactos del corpus SOS.
 *  Para otro proyecto: editar solo este bloque.
 * ==========================================================================*/
const CONFIG = {
  // Cada tipo de artefacto con su patron. El orden importa: el primero que
  // coincide gana (por eso RF-CORE y RF-ANA van antes que un RF generico).
  TIPOS: [
    { tipo: 'RF-CORE', re: /RF-CORE-[A-Z]{2,5}-\d{3}/g },
    { tipo: 'RF-ANA',  re: /RF-ANA-\d{3}/g },
    { tipo: 'RNF',     re: /RNF-[A-Z]{2,5}-\d{3}/g },
    { tipo: 'ADR',     re: /ADR-\d{2,3}/g },
    { tipo: 'DA',      re: /DA-\d{2,3}/g },
    { tipo: 'PH',      re: /PH-[A-Z0-9]{2,6}-\d{3}/g },
    { tipo: 'FUT',     re: /FUT-[A-Z]{1,5}-\d{3}/g },
    { tipo: 'FOA',     re: /FOA-[A-Z]{2,4}(?:-[A-Z]{2,4})?-\d{3}/g },
  ],

  DEFAULT_OUTPUT: '.snapshot.json',
  ZONA: 'America/Argentina/Buenos_Aires',
};

const HEADING_RE = /^\s*#{1,6}\s+(.*\S)\s*$/;

/* ----------------------------------------------------------------------------
 *  SELLO TEMPORAL — fecha/hora en zona Buenos Aires, formato "AAAA-MM-DD HH:mm ART"
 * --------------------------------------------------------------------------*/
function fechaSOS() {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CONFIG.ZONA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const v = {};
  for (const p of partes) v[p.type] = p.value;
  return `${v.year}-${v.month}-${v.day} ${v.hour}:${v.minute} ART`;
}

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

function expandPaths(args) {
  const out = [];
  for (const a of args) {
    if (fs.existsSync(a) && fs.statSync(a).isDirectory()) walkMd(a, out);
    else if (fs.existsSync(a)) out.push(a);
  }
  return [...new Set(out)].sort();
}

/* ----------------------------------------------------------------------------
 *  CENSO — recorre los .md y junta todos los IDs por tipo, con su ubicacion.
 *  Solo cuenta un ID cuando aparece en un ENCABEZADO que arranca con el
 *  (definicion real), no en una mencion suelta en el texto.
 * --------------------------------------------------------------------------*/
function censar(paths) {
  const censo = {};
  for (const { tipo } of CONFIG.TIPOS) censo[tipo] = new Map();

  for (const p of paths) {
    const text = read(p);
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const h = line.match(HEADING_RE);
      if (!h) continue;
      const titulo = h[1];

      for (const { tipo, re } of CONFIG.TIPOS) {
        const m = titulo.match(new RegExp('^(' + re.source + ')'));
        if (m) {
          const id = m[1];
          if (!censo[tipo].has(id)) censo[tipo].set(id, { definido_en: [], titulo: '' });
          const reg = censo[tipo].get(id);
          if (!reg.definido_en.includes(base(p))) reg.definido_en.push(base(p));
          if (!reg.titulo) {
            const t = titulo.slice(id.length).replace(/^[\s—–\-:.]+/, '').trim();
            reg.titulo = t.slice(0, 100);
          }
          break;
        }
      }
    }
  }
  return censo;
}

function censoAPlano(censo) {
  const plano = { totales: {}, ids: {} };
  for (const { tipo } of CONFIG.TIPOS) {
    const ids = [...censo[tipo].keys()].sort();
    plano.totales[tipo] = ids.length;
    plano.ids[tipo] = ids;
  }
  plano.totales.TOTAL = Object.values(plano.totales).reduce((a, b) => a + b, 0);
  return plano;
}

/* ----------------------------------------------------------------------------
 *  DIFF — compara censo nuevo contra el previo guardado.
 * --------------------------------------------------------------------------*/
function diff(nuevo, previo) {
  const cambios = {};
  let hubo = false;
  for (const { tipo } of CONFIG.TIPOS) {
    const setNuevo = new Set(nuevo.ids[tipo] || []);
    const setPrevio = new Set((previo.ids && previo.ids[tipo]) || []);
    const agregados = [...setNuevo].filter(id => !setPrevio.has(id));
    const eliminados = [...setPrevio].filter(id => !setNuevo.has(id));
    if (agregados.length || eliminados.length) {
      cambios[tipo] = { agregados, eliminados };
      hubo = true;
    }
  }
  return { cambios, hubo };
}

/* ----------------------------------------------------------------------------
 *  REPORTE
 * --------------------------------------------------------------------------*/
function reportar(plano, diffResult, sello, paths, lintResult) {
  const bar = '='.repeat(68);
  console.log(bar);
  console.log('  MAD-Snapshot v0.1  —  Censo y verificación del corpus SOS');
  console.log('  Fecha/hora: ' + sello);
  console.log('  Archivos analizados: ' + paths.length);
  console.log(bar);

  console.log('\n  CENSO DE ARTEFACTOS:');
  for (const { tipo } of CONFIG.TIPOS) {
    console.log('    ' + tipo.padEnd(10) + ': ' + plano.totales[tipo]);
  }
  console.log('    ' + '─'.repeat(16));
  console.log('    ' + 'TOTAL'.padEnd(10) + ': ' + plano.totales.TOTAL);

  console.log('\n  CAMBIOS DESDE LA ÚLTIMA CORRIDA:');
  if (!diffResult) {
    console.log('    (primera corrida — no hay snapshot previo para comparar)');
  } else if (!diffResult.hubo) {
    console.log('    OK  ningún artefacto apareció ni desapareció');
  } else {
    for (const [tipo, c] of Object.entries(diffResult.cambios)) {
      if (c.agregados.length) console.log('    + ' + tipo + ' agregados:   ' + c.agregados.join(', '));
      if (c.eliminados.length) console.log('    X ' + tipo + ' DESAPARECIDOS: ' + c.eliminados.join(', '));
    }
    const algoEliminado = Object.values(diffResult.cambios).some(c => c.eliminados.length);
    if (algoEliminado) {
      console.log('\n    ⚠️  ATENCIÓN: hay artefactos que DESAPARECIERON.');
      console.log('       Si no los eliminaste a propósito, algo se rompió al reescribir.');
    }
  }

  console.log('\n  COHERENCIA (linter):');
  if (!lintResult) {
    console.log('    i  linter no disponible — corré tools/mad-linter.cjs por separado');
  } else {
    let problemas = 0;
    if (lintResult.dangling.length) { problemas++; console.log('    X referencias RF colgadas: ' + lintResult.dangling.join(', ')); }
    if (lintResult.dupRf.length) { problemas++; console.log('    X RF duplicados: ' + lintResult.dupRf.map(([id]) => id).join(', ')); }
    if (lintResult.dupDa.length) { problemas++; console.log('    X DA duplicados: ' + lintResult.dupDa.map(([id]) => id).join(', ')); }
    if (lintResult.titleDivergences.length) {
      problemas++;
      console.log('    X títulos divergentes (posible fabricación):');
      for (const d of lintResult.titleDivergences) console.log('        - ' + d.id);
    }
    if (problemas === 0) console.log('    OK  sin referencias rotas, duplicados ni títulos fabricados');
  }

  console.log('\n' + bar);
}

/* ----------------------------------------------------------------------------
 *  MAIN
 * --------------------------------------------------------------------------*/
if (require.main === module) {
  const args = process.argv.slice(2);
  let salida = CONFIG.DEFAULT_OUTPUT;
  const idxSalida = args.indexOf('--salida');
  if (idxSalida !== -1 && args[idxSalida + 1]) salida = args[idxSalida + 1];

  const entradas = args.filter((a, i) => !a.startsWith('--') && (idxSalida === -1 || i !== idxSalida + 1));
  const paths = expandPaths(entradas.length ? entradas : ['.']);
  if (!paths.length) { console.log('No encontré archivos .md.'); process.exit(1); }

  const sello = fechaSOS();
  const censo = censar(paths);
  const plano = censoAPlano(censo);

  let diffResult = null;
  if (fs.existsSync(salida)) {
    try {
      const previo = JSON.parse(fs.readFileSync(salida, 'utf8'));
      diffResult = diff(plano, previo);
    } catch (e) { console.log('(no se pudo leer el snapshot previo)'); }
  }

  let lintResult = null;
  if (linterDisponible && lintFn) {
    try { lintResult = lintFn(paths); } catch (e) { /* ignorar */ }
  }

  reportar(plano, diffResult, sello, paths, lintResult);

  const guardar = { generado: sello, archivos: paths.map(base), ...plano };
  fs.writeFileSync(salida, JSON.stringify(guardar, null, 2), 'utf8');
  console.log('  Snapshot guardado en: ' + salida);
  console.log('='.repeat(68));

  const algoEliminado = diffResult && Object.values(diffResult.cambios).some(c => c.eliminados.length);
  const hayProblemas = lintResult && (lintResult.dangling.length || lintResult.dupRf.length ||
                        lintResult.dupDa.length || lintResult.titleDivergences.length);
  process.exit((algoEliminado || hayProblemas) ? 1 : 0);
}

module.exports = { censar, censoAPlano, diff, fechaSOS };
