#!/usr/bin/env node
/* ============================================================================
 *  MAD-Index v0.1  (Node.js)
 *  ---------------------------------------------------------------------------
 *  QUE ES: extiende el linter para GUARDAR lo que encuentra, en lugar de solo
 *  imprimirlo. Genera un archivo mad-index.json que es la MEMORIA del proyecto:
 *  qué artefactos existen (RF, DA, PH, ADR, FUT, eventos), en qué documento,
 *  desde qué versión, y quién los cita.
 *
 *  POR QUE: el linter es efímero — lee, reporta, olvida. El índice es PERSISTENTE
 *  — lee, guarda, y podés consultarlo después o compararlo entre versiones.
 *  Esto resuelve el problema de "documentos dispersos": MAD lleva el control
 *  exhaustivo de cada artefacto.
 *
 *  QUE PRODUCE: mad-index.json con esta estructura:
 *    {
 *      "generado": "fecha ISO",
 *      "baseline": "1.67",
 *      "archivos_analizados": 11,
 *      "rf":  { "RF-CORE-IDN-001": { definido_en, citado_en[], ... } },
 *      "da":  { "DA-181": { definido_en, titulo, citado_en[] } },
 *      "ph":  { "PH-AMB-001": { definido_en, ... } },
 *      "adr": { "ADR-034": { ... } },
 *      "fut": { "FUT-MAD-016": { ... } },
 *      "eventos": { "PACIENTE_CREADO": { ... } },
 *      "alertas": { rf_huerfanos[], da_colisionadas[], ... }
 *    }
 *
 *  USO:  node tools/mad-index.js <carpeta>
 *        node tools/mad-index.js <carpeta> --salida docs/mad-index.json
 *        node tools/mad-index.js <carpeta> --comparar  (compara con el índice previo)
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');

/* ============================================================================
 *  CONFIG  —  Patrones de los artefactos del método SOS/MAD.
 *  Para otro proyecto: editá solo este bloque.
 * ==========================================================================*/
const CONFIG = {
  // Patrones de cada tipo de artefacto (cómo se escribe su ID).
  PATTERNS: {
    rf:  /RF-[A-Z]{2,5}-[A-Z]{2,5}-\d{3}/g,    // RF-CORE-IDN-001
    rfMad: /RF-MAD-[A-Z]{2,6}-\d{3}/g,          // RF-MAD-CAND-001
    da:  /DA-\d{2,3}/g,                          // DA-181
    ph:  /PH-[A-Z]{2,4}-\d{3}/g,                 // PH-AMB-001
    adr: /ADR-\d{2,3}/g,                         // ADR-034
    fut: /FUT-[A-Z]{2,4}-\d{3}|FUT-\d{3}/g,      // FUT-MAD-016 o FUT-001
  },

  // Nombre de evento: MAYÚSCULAS con guión bajo (PACIENTE_CREADO).
  EVENT_TOKEN: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,5}\b/g,

  // Eventos a ignorar (palabras que parecen evento pero no lo son).
  EVENT_STOPLIST: new Set([
    'NUEVO', 'EN_ANALISIS', 'ACEPTADO', 'RECHAZADO', 'RECLASIFICADO',
    'REQUIERE_HUMANO', 'REQUIERE_ADR', 'RESUELTO', 'EXPIRADO',
    'DIFERIDO_A_FUENTE_ANONIMIZADA', 'MAD_MVP', 'RF_MAD',
  ]),

  // Versión declarada en la metadata.
  DECLARED_VERSION: /Versi[oó]n\s*[|:]\s*v?(\d+)[._](\d+)/i,

  // Artefactos de backlog conocidos (citados sin definir, es esperado).
  BACKLOG_IDS: new Set([
    'RF-CORE-IDN-010', 'RF-CORE-PRV-001', 'RF-CORE-CFG-004', 'RF-CORE-ANA-001',
  ]),

  // Carpeta y nombre de salida por defecto.
  DEFAULT_OUTPUT: 'mad-index.json',
};

const HEADING_RE = /^\s*(#{1,6})\s+(.*\S)\s*$/;
const FNAME_VER_RE = /v(\d+)[._](\d+)/;

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

// ¿El título ARRANCA con este ID? Entonces es una DEFINICIÓN (no solo mención).
function headingStartsWithId(headingText, idPattern) {
  const src = idPattern.source.replace(/\\d/g, '\\d').replace(/g$/, '');
  const m = headingText.match(new RegExp('^(' + src + ')'));
  return m ? m[1] : null;
}

// Extrae el título legible que sigue a un ID en un encabezado.
// "### DA-181 — Reunificación de CLN..." → "Reunificación de CLN..."
function extractTitle(headingText, id) {
  const after = headingText.slice(headingText.indexOf(id) + id.length);
  return after.replace(/^[\s—–\-:.]+/, '').trim().slice(0, 120);
}

/* ----------------------------------------------------------------------------
 *  CONSTRUCCIÓN DEL ÍNDICE
 * --------------------------------------------------------------------------*/
function buildIndex(paths) {
  const files = new Map(paths.map(p => [p, read(p)]));

  // Estructura: por cada tipo, un mapa ID → { definido_en, titulo, citado_en[] }
  const index = { rf: {}, da: {}, ph: {}, adr: {}, fut: {}, eventos: {} };
  const fileVersions = {};

  // Helper para registrar una DEFINICIÓN (desde un encabezado).
  function registrarDef(tipo, id, file, titulo) {
    if (!index[tipo][id]) index[tipo][id] = { definido_en: [], titulo: titulo || '', citado_en: [] };
    if (!index[tipo][id].definido_en.includes(base(file))) index[tipo][id].definido_en.push(base(file));
    if (titulo && !index[tipo][id].titulo) index[tipo][id].titulo = titulo;
  }
  // Helper para registrar una CITA (mención en el texto).
  function registrarCita(tipo, id, file) {
    if (!index[tipo][id]) index[tipo][id] = { definido_en: [], titulo: '', citado_en: [] };
    if (!index[tipo][id].citado_en.includes(base(file))) index[tipo][id].citado_en.push(base(file));
  }

  for (const [p, text] of files) {
    const lines = text.split(/\r?\n/);

    // Versión del archivo (nombre y metadata).
    const mfn = base(p).match(FNAME_VER_RE);
    fileVersions[p] = mfn ? `${mfn[1]}.${mfn[2]}` : null;

    // 1) DEFINICIONES: recorrer encabezados.
    for (const line of lines) {
      const h = line.match(HEADING_RE);
      if (!h) continue;
      const txt = h[2];

      // ¿El encabezado define un RF / RF-MAD / DA / PH / ADR / FUT?
      for (const [tipo, pat] of Object.entries(CONFIG.PATTERNS)) {
        const idPattern = new RegExp('^(' + pat.source + ')');
        const m = txt.match(idPattern);
        if (m) {
          const id = m[1];
          const titulo = extractTitle(txt, id);
          const tipoNorm = (tipo === 'rfMad') ? 'rf' : tipo;
          registrarDef(tipoNorm, id, p, titulo);
        }
      }
    }

    // 2) CITAS: buscar todos los IDs en el texto completo.
    for (const [tipo, pat] of Object.entries(CONFIG.PATTERNS)) {
      const tipoNorm = (tipo === 'rfMad') ? 'rf' : tipo;
      for (const id of (text.match(pat) || [])) {
        registrarCita(tipoNorm, id, p);
      }
    }

    // 3) EVENTOS: buscar tokens tipo EVENTO_NOMBRE.
    for (const ev of (text.match(CONFIG.EVENT_TOKEN) || [])) {
      if (CONFIG.EVENT_STOPLIST.has(ev)) continue;
      registrarCita('eventos', ev, p);
    }
  }

  // ── ALERTAS derivadas ──────────────────────────────────────────────────
  const alertas = {
    rf_huerfanos: [],        // citados pero nunca definidos (y no son backlog)
    rf_backlog: [],          // citados sin definir, pero conocidos como backlog
    da_colisionadas: [],     // definidas en más de un documento
    ph_colisionadas: [],
    adr_colisionados: [],
    eventos_duplicados: [],  // nombres muy parecidos
  };

  for (const [id, info] of Object.entries(index.rf)) {
    if (info.definido_en.length === 0 && info.citado_en.length > 0) {
      (CONFIG.BACKLOG_IDS.has(id) ? alertas.rf_backlog : alertas.rf_huerfanos).push(id);
    }
  }
  for (const [id, info] of Object.entries(index.da)) {
    if (info.definido_en.length > 1) alertas.da_colisionadas.push({ id, en: info.definido_en });
  }
  for (const [id, info] of Object.entries(index.ph)) {
    if (info.definido_en.length > 1) alertas.ph_colisionadas.push({ id, en: info.definido_en });
  }
  for (const [id, info] of Object.entries(index.adr)) {
    if (info.definido_en.length > 1) alertas.adr_colisionados.push({ id, en: info.definido_en });
  }

  // Eventos con nombre parecido (mismo primer y último segmento).
  const grupos = new Map();
  for (const ev of Object.keys(index.eventos)) {
    const seg = ev.split('_');
    if (seg.length < 2) continue;
    const key = seg[0] + '...' + seg[seg.length - 1];
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(ev);
  }
  for (const g of grupos.values()) if (g.length > 1) alertas.eventos_duplicados.push(g);

  // Baseline: la versión más frecuente.
  const vers = {};
  for (const v of Object.values(fileVersions)) if (v) vers[v] = (vers[v] || 0) + 1;
  const baseline = Object.keys(vers).sort((a, b) => vers[b] - vers[a])[0] || null;

  return {
    generado: new Date().toISOString(),
    baseline,
    archivos_analizados: paths.length,
    archivos: paths.map(base),
    totales: {
      rf: Object.keys(index.rf).length,
      da: Object.keys(index.da).length,
      ph: Object.keys(index.ph).length,
      adr: Object.keys(index.adr).length,
      fut: Object.keys(index.fut).length,
      eventos: Object.keys(index.eventos).length,
    },
    rf: index.rf,
    da: index.da,
    ph: index.ph,
    adr: index.adr,
    fut: index.fut,
    eventos: index.eventos,
    alertas,
  };
}

/* ----------------------------------------------------------------------------
 *  COMPARACIÓN entre índice nuevo y previo (qué cambió entre versiones)
 * --------------------------------------------------------------------------*/
function comparar(nuevo, previo) {
  const cambios = { agregados: {}, eliminados: {} };
  for (const tipo of ['rf', 'da', 'ph', 'adr', 'fut', 'eventos']) {
    const idsNuevo = new Set(Object.keys(nuevo[tipo] || {}));
    const idsPrevio = new Set(Object.keys(previo[tipo] || {}));
    cambios.agregados[tipo] = [...idsNuevo].filter(id => !idsPrevio.has(id));
    cambios.eliminados[tipo] = [...idsPrevio].filter(id => !idsNuevo.has(id));
  }
  return cambios;
}

/* ----------------------------------------------------------------------------
 *  REPORTE en pantalla
 * --------------------------------------------------------------------------*/
function reportar(idx, cambios) {
  const bar = '='.repeat(66);
  console.log(bar);
  console.log('  MAD-Index v0.1  —  Índice persistente de artefactos');
  console.log('  Baseline: v' + idx.baseline + '  |  Archivos: ' + idx.archivos_analizados);
  console.log(bar);

  console.log('\n  TOTALES:');
  console.log('    RF:      ' + idx.totales.rf);
  console.log('    DA:      ' + idx.totales.da);
  console.log('    PH:      ' + idx.totales.ph);
  console.log('    ADR:     ' + idx.totales.adr);
  console.log('    FUT:     ' + idx.totales.fut);
  console.log('    Eventos: ' + idx.totales.eventos);

  const a = idx.alertas;
  console.log('\n  ALERTAS:');
  if (a.rf_huerfanos.length) console.log('    X RF huérfanos (citados sin definir): ' + a.rf_huerfanos.join(', '));
  else console.log('    OK  sin RF huérfanos');
  if (a.rf_backlog.length) console.log('    i  RF backlog (esperado): ' + a.rf_backlog.join(', '));
  if (a.da_colisionadas.length) console.log('    X DA en más de un documento: ' + a.da_colisionadas.map(d => d.id).join(', '));
  if (a.ph_colisionadas.length) console.log('    X PH en más de un documento: ' + a.ph_colisionadas.map(d => d.id).join(', '));
  if (a.adr_colisionados.length) console.log('    X ADR en más de un documento: ' + a.adr_colisionados.map(d => d.id).join(', '));
  if (a.eventos_duplicados.length) {
    console.log('    !  Eventos con nombre parecido:');
    for (const g of a.eventos_duplicados) console.log('       ' + g.join('  vs  '));
  }

  if (cambios) {
    console.log('\n  CAMBIOS RESPECTO DEL ÍNDICE PREVIO:');
    let huboCambios = false;
    for (const tipo of ['rf', 'da', 'ph', 'adr', 'fut']) {
      const ag = cambios.agregados[tipo] || [];
      const el = cambios.eliminados[tipo] || [];
      if (ag.length) { console.log('    + ' + tipo.toUpperCase() + ' agregados: ' + ag.join(', ')); huboCambios = true; }
      if (el.length) { console.log('    - ' + tipo.toUpperCase() + ' eliminados: ' + el.join(', ')); huboCambios = true; }
    }
    if (!huboCambios) console.log('    (sin cambios en artefactos)');
  }

  console.log('\n' + bar);
}

/* ----------------------------------------------------------------------------
 *  MAIN
 * --------------------------------------------------------------------------*/
if (require.main === module) {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));

  // Resolver carpeta de entrada y archivo de salida.
  let salida = CONFIG.DEFAULT_OUTPUT;
  const idxSalida = args.indexOf('--salida');
  if (idxSalida !== -1 && args[idxSalida + 1]) salida = args[idxSalida + 1];

  const entradas = positional.filter(p => p !== salida);
  const paths = expandPaths(entradas.length ? entradas : ['.']);
  if (!paths.length) { console.log('No encontré archivos .md.'); process.exit(1); }

  const idx = buildIndex(paths);

  // ¿Comparar con el índice previo?
  let cambios = null;
  if (flags.includes('--comparar') && fs.existsSync(salida)) {
    try {
      const previo = JSON.parse(fs.readFileSync(salida, 'utf8'));
      cambios = comparar(idx, previo);
    } catch (e) { console.log('(no se pudo leer el índice previo para comparar)'); }
  }

  reportar(idx, cambios);

  // Guardar el índice.
  fs.writeFileSync(salida, JSON.stringify(idx, null, 2), 'utf8');
  console.log('  Índice guardado en: ' + salida);
  console.log('='.repeat(66));
}

module.exports = { buildIndex, comparar };
