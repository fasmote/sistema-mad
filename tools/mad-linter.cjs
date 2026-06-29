#!/usr/bin/env node
/* ============================================================================
 *  MAD-Linter v0.4  (Node.js)
 *  ---------------------------------------------------------------------------
 *  QUE ES: un programa que LEE tus .md y AVISA inconsistencias. No cambia nada;
 *  solo señala. Es el "corrector ortográfico de coherencia" del método SOS/MAD.
 *
 *  COMO FUNCIONA (3 pasos): 1) LEER archivos  2) ANALIZAR con reglas  3) REPORTAR.
 *
 *  CHEQUEOS:
 *    [A] Referencias RF citadas pero nunca definidas.
 *    [B] IDs (RF o DA) definidos dos veces.
 *    [C] Títulos numerados repetidos dentro de un documento.
 *    [D] Versión del nombre de archivo != versión de la metadata.
 *    [E] El conjunto está en versiones mezcladas.
 *    [F] Eventos del Anexo B que NO están en el catálogo canónico §4.7.3.
 *    [G] Eventos con nombres parecidos (posible "mismo evento, dos nombres").
 *    [H] Títulos divergentes para el mismo ID (posible ALUCINACIÓN/fabricación). <- NUEVO v0.4
 *
 *  POR QUE [H]: nació del incidente real HIG-B-001. Una IA produjo una tabla
 *  "lista para pegar" con títulos de DA que NO existían en la fuente — los
 *  inventó. El chequeo [H] detecta exactamente eso: cuando el mismo ID aparece
 *  con un título acá y con OTRO título allá, uno de los dos puede ser fabricado.
 *  El formato no valida la verdad; la coincidencia contra la fuente sí.
 *
 *  ¿SIRVE PARA OTROS DOCUMENTOS? La LÓGICA es universal; lo específico de tu
 *  proyecto está en el bloque CONFIG. Para otras convenciones, editás CONFIG.
 *
 *  REGEX (lo verás seguido): patrón de búsqueda. /RF-[A-Z]+-[A-Z]+-\d{3}/ =
 *  "RF-, MAYÚSCULAS, guión, MAYÚSCULAS, guión, 3 dígitos" -> halla RF-CORE-IDN-001.
 *
 *  USO:  node mad-linter.js <carpeta>   |   node mad-linter.js a.md b.md
 * ==========================================================================*/
'use strict';
const fs = require('fs');     // leer archivos del disco.
const path = require('path'); // manejar nombres/rutas.

/* ============================================================================
 *  CONFIG  —  TODO lo específico del proyecto va acá (y nada más).
 * ==========================================================================*/
const CONFIG = {
  // Forma de un código de RF (RF-CORE-IDN-001).
  RF_PATTERN: /RF-[A-Z]{2,5}-[A-Z]{2,5}-\d{3}/g,

  // RF de backlog/futuro: si se referencian sin definir, NO son error (se informan).
  BACKLOG_RF: new Set([
    'RF-CORE-IDN-010',
    'RF-CORE-PRV-001',
    'RF-CORE-CFG-004',
    'RF-CORE-ANA-001',
    'RF-MAD-CAND-001',
    'RF-MAD-CAND-002',
    'RF-MAD-CAND-003',
    'RF-MAD-CAND-004',
    'RF-MAD-CAND-005',
    'RF-MAD-CAND-006',
    'RF-MAD-CAND-007',
    'RF-NFM-AMB-001',
  ]),

  // Documentos históricos append-only (B, J): se saltean en el chequeo [C].
  HISTORICAL_DOC: /_B_|_J_/,

  // Versión declarada en la metadata (fila "Versión | v1.55").
  DECLARED_VERSION: /Versi[oó]n\s*[|:]\s*v?(\d+)[._](\d+)/i,

  // Título que marca el catálogo canónico de eventos (§4.7.3).
  CATALOG_HEADING: /Cat[aá]logo can[oó]nico de eventos/i,

  // Título que marca el Anexo B (matriz de trazabilidad con columna de eventos).
  ANEXO_B_HEADING: /Anexo B/i,
  ANEXO_EVENT_COL: 5,

  // Forma de un nombre de evento.
  EVENT_TOKEN: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g,

  // [H] IDs cuyo título se verifica entre documentos (DA, ADR, PH, FUT, RF).
  // El chequeo compara: ¿el mismo ID tiene el mismo título en todos lados?
  TITLED_ID_PATTERNS: [
    { tipo: 'RF',  re: /RF-[A-Z]{2,5}-[A-Z]{2,5}-\d{3}/ },
    { tipo: 'DA',  re: /DA-\d{2,3}/ },
    { tipo: 'ADR', re: /ADR-\d{2,3}/ },
    { tipo: 'PH',  re: /PH-[A-Z]{2,4}-\d{3}/ },
    { tipo: 'FUT', re: /FUT-[A-Z]{2,4}-\d{3}/ },
  ],

  // [H] Documentos históricos donde SE ESPERA que un ID tenga títulos distintos
  // (el ledger de debate guarda variantes a propósito). Se informan, no se marcan duro.
  TITLE_CHECK_SKIP: /_B_|_J_/,

  // [H] Umbral: títulos que difieren en menos de este % se consideran "el mismo
  // con edición menor" (no alucinación). Por encima, son títulos realmente distintos.
  TITLE_SIMILARITY_THRESHOLD: 0.45,
};

const HEADING_RE = /^\s*(#{1,6})\s+(.*\S)\s*$/;
const NUMHEAD_RE = /^\s*#{1,6}\s+(\d+(?:\.\d+)*)(?=[\s.\u2014\-:])/;
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
    else out.push(a);
  }
  return [...new Set(out)].sort();
}

function headingDefinesId(headingText, idRegexSource) {
  const m = headingText.match(new RegExp('^(' + idRegexSource + ')'));
  return m ? m[1] : null;
}

// Normaliza un título para comparar: minúsculas, sin tildes, sin puntuación, sin espacios extra.
function normalizarTitulo(t) {
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .replace(/[^a-z0-9\s]/g, ' ')                       // puntuación -> espacio
    .replace(/\s+/g, ' ').trim();
}

// Similitud entre dos títulos: proporción de palabras compartidas (Jaccard).
function similitudTitulos(a, b) {
  const setA = new Set(normalizarTitulo(a).split(' ').filter(Boolean));
  const setB = new Set(normalizarTitulo(b).split(' ').filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let comunes = 0;
  for (const w of setA) if (setB.has(w)) comunes++;
  return comunes / (setA.size + setB.size - comunes); // Jaccard
}

// Extrae el título que sigue a un ID en un encabezado.
// "### DA-181 — Reunificación de CLN..." → "Reunificación de CLN..."
function tituloDespuesDeId(headingText, id) {
  const idx = headingText.indexOf(id);
  if (idx === -1) return '';
  const after = headingText.slice(idx + id.length);
  return after.replace(/^[\s—–\-:.]+/, '').trim();
}

function loadEventCatalog(files) {
  for (const [, text] of files) {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex(l => /^#{1,6}\s/.test(l) && CONFIG.CATALOG_HEADING.test(l));
    if (start === -1) continue;
    const catalog = new Set();
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^#{1,6}\s/.test(l)) break;
      if (/Eventos internos/i.test(l)) break;
      const m = l.match(/`([A-Z][A-Z0-9_]+)`/);
      if (m) catalog.add(m[1]);
    }
    if (catalog.size) return catalog;
  }
  return new Set();
}

function parseAnexoBEvents(files) {
  const events = new Set();
  for (const [, text] of files) {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex(l => /^#{1,6}\s/.test(l) && CONFIG.ANEXO_B_HEADING.test(l));
    if (start === -1) continue;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^#{1,6}\s/.test(l)) break;
      if (!l.trim().startsWith('|')) continue;
      const cell = l.split('|')[CONFIG.ANEXO_EVENT_COL];
      if (!cell) continue;
      for (const t of (cell.match(CONFIG.EVENT_TOKEN) || [])) events.add(t);
    }
    if (events.size) return events;
  }
  return events;
}

/* ----------------------------------------------------------------------------
 *  [H] VERIFICACIÓN DE TÍTULOS — detector de fabricación/alucinación
 *  ----------------------------------------------------------------------------
 *  Recorre todos los encabezados que definen un ID con título. Para cada ID,
 *  junta TODOS los títulos con los que aparece (en cualquier documento). Si un
 *  mismo ID tiene títulos sustancialmente distintos, lo reporta: uno de esos
 *  títulos puede ser fabricado (el caso Gemini en HIG-B-001).
 * --------------------------------------------------------------------------*/
function checkTitleConsistency(files) {
  // Mapa: ID -> [ { titulo, archivo } ]
  const titlesById = new Map();

  for (const [p, text] of files) {
    if (CONFIG.TITLE_CHECK_SKIP.test(base(p))) continue; // saltear ledger histórico
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const h = line.match(HEADING_RE);
      if (!h) continue;
      const headingText = h[2];
      for (const { re } of CONFIG.TITLED_ID_PATTERNS) {
        const id = headingDefinesId(headingText, re.source);
        if (!id) continue;
        const titulo = tituloDespuesDeId(headingText, id);
        if (!titulo || titulo.length < 4) continue; // sin título legible, ignorar
        if (!titlesById.has(id)) titlesById.set(id, []);
        titlesById.get(id).push({ titulo, archivo: base(p) });
      }
    }
  }

  // Detectar IDs con títulos divergentes.
  const divergentes = [];
  for (const [id, apariciones] of titlesById) {
    if (apariciones.length < 2) continue;
    // ¿Hay al menos un par de títulos suficientemente distintos?
    let hayDivergencia = false;
    for (let i = 0; i < apariciones.length; i++) {
      for (let j = i + 1; j < apariciones.length; j++) {
        const sim = similitudTitulos(apariciones[i].titulo, apariciones[j].titulo);
        if (sim < CONFIG.TITLE_SIMILARITY_THRESHOLD) { hayDivergencia = true; break; }
      }
      if (hayDivergencia) break;
    }
    if (hayDivergencia) {
      // Agrupar títulos únicos para el reporte.
      const unicos = [];
      for (const a of apariciones) {
        const yaEsta = unicos.find(u => similitudTitulos(u.titulo, a.titulo) >= 0.85);
        if (yaEsta) { if (!yaEsta.archivos.includes(a.archivo)) yaEsta.archivos.push(a.archivo); }
        else unicos.push({ titulo: a.titulo, archivos: [a.archivo] });
      }
      if (unicos.length > 1) divergentes.push({ id, variantes: unicos });
    }
  }
  return divergentes;
}

/* ----------------------------------------------------------------------------
 *  ANALISIS PRINCIPAL
 * --------------------------------------------------------------------------*/
function lint(paths) {
  const files = new Map(paths.map(p => [p, read(p)]));

  const rfDef = new Map(), rfRef = new Map(), daDef = new Map();
  const dupHeadings = [], verIssues = [], fileVersions = {};

  for (const [p, text] of files) {
    const lines = text.split(/\r?\n/);
    const numCount = new Map();

    for (const line of lines) {
      const h = line.match(HEADING_RE);
      if (h) {
        const headingText = h[2];
        const rfHere = headingDefinesId(headingText, 'RF-[A-Z]{2,5}-[A-Z]{2,5}-\\d{3}');
        if (rfHere) { if (!rfDef.has(rfHere)) rfDef.set(rfHere, new Set()); rfDef.get(rfHere).add(p); }
        const daHere = headingDefinesId(headingText, 'DA-\\d{2,3}');
        if (daHere) { if (!daDef.has(daHere)) daDef.set(daHere, new Set()); daDef.get(daHere).add(p); }
        const nm = line.match(NUMHEAD_RE);
        if (nm) numCount.set(nm[1], (numCount.get(nm[1]) || 0) + 1);
      }
    }

    for (const rf of (text.match(CONFIG.RF_PATTERN) || [])) {
      if (!rfRef.has(rf)) rfRef.set(rf, new Set());
      rfRef.get(rf).add(p);
    }

    if (!CONFIG.HISTORICAL_DOC.test(base(p))) {
      for (const [num, c] of numCount) if (c > 1) dupHeadings.push({ file: p, num, count: c });
    }

    const mfn = base(p).match(FNAME_VER_RE);
    const fileVer = mfn ? `${mfn[1]}.${mfn[2]}` : null;
    fileVersions[p] = fileVer;
    const md = lines.slice(0, 25).join('\n').match(CONFIG.DECLARED_VERSION);
    const declaredVer = md ? `${md[1]}.${md[2]}` : null;
    if (fileVer && declaredVer && fileVer !== declaredVer) verIssues.push({ file: p, fileVer, declaredVer });
  }

  const defined = new Set(rfDef.keys());
  const dangling = [], backlogRefs = [];
  for (const rf of rfRef.keys()) {
    if (!defined.has(rf)) (CONFIG.BACKLOG_RF.has(rf) ? backlogRefs : dangling).push(rf);
  }
  dangling.sort(); backlogRefs.sort();
  const dupRf = [...rfDef].filter(([, s]) => s.size > 1);
  const dupDa = [...daDef].filter(([, s]) => s.size > 1);

  const catalog = loadEventCatalog(files);
  const anexoEvents = parseAnexoBEvents(files);
  const eventsNotInCatalog = [...anexoEvents].filter(e => !catalog.has(e)).sort();

  const allEvents = new Set([...catalog, ...anexoEvents]);
  const groups = new Map();
  for (const e of allEvents) {
    const seg = e.split('_');
    if (seg.length < 2) continue;
    const key = seg[0] + ' / ' + seg[seg.length - 1];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const similarGroups = [...groups.values()].filter(g => g.length > 1);

  // [H] verificación de títulos divergentes (detector de fabricación).
  const titleDivergences = checkTitleConsistency(files);

  return {
    paths, rfRef, defined, dangling, backlogRefs, dupRf, dupDa,
    dupHeadings, verIssues, fileVersions,
    catalog, anexoEvents, eventsNotInCatalog, similarGroups,
    titleDivergences,
  };
}

/* ----------------------------------------------------------------------------
 *  REPORTE
 * --------------------------------------------------------------------------*/
function report(r) {
  let findings = 0;
  const bar = '='.repeat(66);
  console.log(bar);
  console.log('  MAD-Linter v0.4  —  Reporte de consistencia documental');
  console.log('  Archivos analizados: ' + r.paths.length);
  console.log(bar);

  console.log('\n[A] Referencias RF colgadas (citadas, nunca definidas)');
  if (r.dangling.length) { for (const rf of r.dangling) { findings++; console.log('    X ' + rf); } }
  else { console.log('    OK  ' + r.defined.size + ' definidos, 0 colgados'); }
  if (r.backlogRefs.length) console.log('    i  backlog (esperado): ' + r.backlogRefs.join(', '));

  console.log('\n[B] IDs duplicados');
  if (r.dupRf.length || r.dupDa.length) {
    for (const [rf, s] of r.dupRf) { findings++; console.log('    X RF ' + rf + ': ' + [...s].map(base).join(', ')); }
    for (const [da, s] of r.dupDa) { findings++; console.log('    X DA ' + da + ': ' + [...s].map(base).join(', ')); }
  } else { console.log('    OK  sin IDs duplicados'); }

  console.log('\n[C] Títulos numerados duplicados (excluye históricos B/J)');
  if (r.dupHeadings.length) { for (const d of r.dupHeadings) { findings++; console.log("    X " + base(d.file) + ": título '" + d.num + "' x" + d.count); } }
  else { console.log('    OK  sin numeraciones repetidas'); }

  console.log('\n[D] Versión del archivo vs versión declarada en metadata');
  if (r.verIssues.length) { for (const v of r.verIssues) { findings++; console.log('    X ' + base(v.file) + ': nombre v' + v.fileVer + ', metadata v' + v.declaredVer); } }
  else { console.log('    OK  metadata coherente'); }

  console.log('\n[E] Baseline del set');
  const vers = {};
  for (const v of Object.values(r.fileVersions)) if (v) vers[v] = (vers[v] || 0) + 1;
  const keys = Object.keys(vers);
  if (keys.length > 1) { console.log('    !  set mixto: ' + JSON.stringify(vers)); }
  else { console.log('    OK  todos en v' + (keys[0] || '?')); }

  console.log('\n[F] Anexo B vs catálogo §4.7.3');
  if (!r.catalog.size || !r.anexoEvents.size) { console.log('    !  catálogo o Anexo B no encontrado; [F] omitido'); }
  else if (r.eventsNotInCatalog.length) { for (const e of r.eventsNotInCatalog) { findings++; console.log('    X ' + e); } }
  else { console.log('    OK  Anexo B alineado (' + r.anexoEvents.size + ' eventos)'); }

  console.log('\n[G] Eventos con nombre parecido');
  if (r.similarGroups.length) { for (const g of r.similarGroups) console.log('    !  ' + g.join('   vs   ')); }
  else { console.log('    OK  sin nombres ambiguos'); }

  // ── [H] DETECTOR DE FABRICACIÓN ────────────────────────────────────────
  console.log('\n[H] Títulos divergentes para el mismo ID (posible ALUCINACIÓN)');
  if (r.titleDivergences.length) {
    for (const d of r.titleDivergences) {
      findings++;
      console.log('    X ' + d.id + ' aparece con ' + d.variantes.length + ' títulos distintos:');
      for (const v of d.variantes) {
        const tituloCorto = v.titulo.length > 70 ? v.titulo.slice(0, 70) + '...' : v.titulo;
        console.log('        - "' + tituloCorto + '"  [' + v.archivos.join(', ') + ']');
      }
    }
    console.log('    -> Verificá contra la fuente: uno de los títulos puede ser fabricado.');
  } else {
    console.log('    OK  cada ID tiene un título consistente en todos los documentos');
  }

  console.log('\n' + bar);
  console.log('  Hallazgos duros (A-F, H): ' + findings + '  |  Avisos (G): ' + r.similarGroups.length);
  console.log(bar);
  return findings;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const paths = expandPaths(args.length ? args : ['.']);
  if (!paths.length) { console.log('No encontré archivos .md.'); process.exit(1); }
  const findings = report(lint(paths));
  process.exit(findings > 0 ? 1 : 0);
}

module.exports = { lint, report, checkTitleConsistency, similitudTitulos };
