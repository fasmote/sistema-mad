#!/usr/bin/env node
/* ============================================================================
 *  MAD-Linter v0.5  (Node.js)
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
const { extractDefinitions } = require('./mad-definition-extractor.cjs');
const {
  TITLE_COLLISION_POLICY,
  titleSimilarity,
  hasSubstantiveDivergence,
  groupTitleVariants,
} = require('./mad-title-policy.cjs');

/* ============================================================================
 *  CONFIG  —  TODO lo específico del proyecto va acá (y nada más).
 * ==========================================================================*/
const CONFIG = {
  // Forma de un código de RF (RF-CORE-IDN-001).
  RF_PATTERN: /RF-[A-Z]{2,5}-[A-Z]{2,5}-\d{3}/g,

  // RF de backlog/futuro: si se referencian sin definir, NO son error (se informan).
  BACKLOG_RF: new Set([
    'RF-TST-DOC-010',
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
  const definitionsById = new Map();
  for (const definition of extractDefinitions(files)) {
    if (!definitionsById.has(definition.id)) definitionsById.set(definition.id, []);
    definitionsById.get(definition.id).push(definition);
  }

  const divergences = [];
  for (const [id, definitions] of definitionsById) {
    if (!hasSubstantiveDivergence(definitions)) continue;
    const variants = groupTitleVariants(definitions).map(group => ({
      titulo: group.titulo,
      archivos: group.archivos,
      definiciones: group.definiciones,
    }));
    if (variants.length > 1) divergences.push({ id, variantes: variants });
  }
  return divergences.sort((a, b) => a.id.localeCompare(b.id));
}

/* ----------------------------------------------------------------------------
 *  ANALISIS PRINCIPAL
 * --------------------------------------------------------------------------*/
function lint(paths, options = {}) {
  const titleMode = options.titleMode || 'audit';
  if (!['audit', 'error'].includes(titleMode)) throw new Error(`Modo [H] inválido: ${titleMode}`);
  const files = new Map(paths.map(p => [p, read(p)]));

  const rfDef = new Map(), rfRef = new Map(), daDef = new Map();
  const dupHeadings = [], verIssues = [], fileVersions = {};

  // [A], [B] y [H] comparten la misma noción de definición formal.
  for (const definition of extractDefinitions(files)) {
    const target = definition.tipo === 'rf' ? rfDef : definition.tipo === 'da' ? daDef : null;
    if (!target) continue;
    if (!target.has(definition.id)) target.set(definition.id, new Set());
    target.get(definition.id).add(definition.ruta);
  }

  for (const [p, text] of files) {
    const lines = text.split(/\r?\n/);
    const numCount = new Map();

    for (const line of lines) {
      const h = line.match(HEADING_RE);
      if (h) {
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
    titleDivergences, titleMode,
  };
}

/* ----------------------------------------------------------------------------
 *  REPORTE
 * --------------------------------------------------------------------------*/
function report(r) {
  let findings = 0;
  const bar = '='.repeat(66);
  console.log(bar);
  console.log('  MAD-Linter v0.5  —  Reporte de consistencia documental');
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
      if (r.titleMode === 'error') findings++;
      console.log('    ' + (r.titleMode === 'error' ? 'X ' : '! ') + d.id +
        ' aparece con ' + d.variantes.length + ' títulos distintos:');
      for (const v of d.variantes) {
        const tituloCorto = v.titulo.length > 70 ? v.titulo.slice(0, 70) + '...' : v.titulo;
        console.log('        - "' + tituloCorto + '"  [' + v.archivos.join(', ') + ']');
      }
    }
    console.log('    -> Estado: NO RESUELTA. Verificá los orígenes; ninguna variante es canónica.');
  } else {
    console.log('    OK  cada ID tiene un título consistente en todos los documentos');
  }

  console.log('\n' + bar);
  console.log('  Hallazgos duros: ' + findings + '  |  Avisos: ' +
    (r.similarGroups.length + (r.titleMode === 'audit' ? r.titleDivergences.length : 0)));
  console.log('  Modo [H]: ' + r.titleMode + '  |  Política: ' + TITLE_COLLISION_POLICY.version);
  console.log(bar);
  return findings;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let titleMode = 'audit';
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title-mode' && args[i + 1]) { titleMode = args[++i]; continue; }
    if (args[i].startsWith('--title-mode=')) { titleMode = args[i].slice('--title-mode='.length); continue; }
    positional.push(args[i]);
  }
  if (!['audit', 'error'].includes(titleMode)) {
    console.error('Modo [H] inválido. Usá --title-mode audit|error.');
    process.exit(2);
  }
  const paths = expandPaths(positional.length ? positional : ['.']);
  if (!paths.length) { console.log('No encontré archivos .md.'); process.exit(1); }
  const findings = report(lint(paths, { titleMode }));
  process.exit(findings > 0 ? 1 : 0);
}

module.exports = {
  lint,
  report,
  checkTitleConsistency,
  similitudTitulos: titleSimilarity,
  TITLE_COLLISION_POLICY,
};
