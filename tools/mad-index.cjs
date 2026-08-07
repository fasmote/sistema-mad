#!/usr/bin/env node
/* ============================================================================
 *  MAD-Index v0.07  (Node.js)
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
const { extractDefinitions, stripCode } = require('./mad-definition-extractor.cjs');
const {
  TITLE_COLLISION_POLICY,
  groupTitleVariants,
  collisionMetadata,
} = require('./mad-title-policy.cjs');

/* ============================================================================
 *  CONFIG  —  Patrones de los artefactos del método SOS/MAD.
 *  Para otro proyecto: editá solo este bloque.
 * ==========================================================================*/
const CONFIG = {
  // Patrones de cada tipo de artefacto (cómo se escribe su ID).
  PATTERNS: {
    // FIX: (?<![A-Z-]) evita matchear un ID embebido dentro de otro (p.ej. ADR-043 dentro de FUT-ADR-043).
    rf:  /(?<![A-Z-])RF-[A-Z]{2,5}-[A-Z]{2,5}(?:-[A-Z]{2,7})?-\d{3}/g,   // RF-CORE-IDN-001
    rfMad: /(?<![A-Z-])RF-MAD-[A-Z]{2,6}-\d{3}/g,                        // RF-MAD-CAND-001
    da:  /(?<![A-Z-])DA-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}|(?<![A-Z-])DA-\d{2,3}/g, // DA-181 y DA-CDS-MED-001
    ph:  /(?<![A-Z-])PH-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}/g,              // PH-AMB-001 y PH-CDS-MED-001
    adr: /(?<![A-Z-])ADR-\d{2,3}/g,                                      // ADR-034 (no FUT-ADR-043)
    fut: /(?<![A-Z-])FUT-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}|(?<![A-Z-])FUT-\d{3}/g, // FUT-MAD-016 y FUT-ANA-CR-001
    gap: /(?<![A-Z-])GAP-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}/g,             // GAP-CCA-EV-001
  },
  // 10ª regla: candidatos del contraste operativo (Documento I). Clase aparte, NO cuentan en el total.
  CANDIDATE_PATTERN: /(?<![A-Z-])C-(?:RF|DA|PH|ADR|FUT|GAP)-[A-Z]{2,7}(?:-[A-Z]{2,7})?-\d{3}/g,

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

  // Archivos generados que NO deben indexarse a sí mismos (evita auto-cita circular).
  SKIP_FILES: new Set(['SOS_INDICE_MAESTRO_IDS.md']),
  // Carpeta y nombre de salida por defecto.
  DEFAULT_OUTPUT: 'mad-index.json',
};

// PATCH: los IDs terminados en -000 son placeholders, no definiciones vivas.
function isPlaceholder(id){ return /-000$/.test(id); }
// 9ª REGLA (rigurosa): clasifica SOLO-CITADO como RESERVADO/NO-EMITIDO/ABSORBIDO/RENUMERADO
// solo si hay RELACIÓN SINTÁCTICA EXPLÍCITA entre el marcador y ESE ID (no co-ocurrencia de línea).
// Evidencia = ventana centrada en el ID. No infiere por cercanía débil.
function esc(id){ return id.replace(/[-]/g,'\\-'); }
function ventana(text, idx, p){
  const start=Math.max(0, idx-70), end=Math.min(text.length, idx+130);
  return { archivo: base(p), fragmento: text.slice(start,end).replace(/\s+/g,' ').trim() };
}
function clasificarMarca(id, files){
  const R = esc(id);
  const fam = id.replace(/-(\d{3})$/, '');
  const num = /-(\d{3})$/.test(id) ? parseInt(id.slice(-3),10) : NaN;
  for (const [p, textRaw] of files){
    const text = stripCode(textRaw);
    // (a) "no se crea <ID>"  → ABSORBIDO si sigue "absorbid..."; si no, NO-EMITIDO
    let m = new RegExp('no\\s+se\\s+crea\\s+`?'+R+'`?([\\s\\S]{0,90})','i').exec(text);
    if (m){ const clase = /absorbid[oa]/i.test(m[1]) ? 'ABSORBIDO' : 'NO-EMITIDO';
      return { clase, evidencia: ventana(text, m.index, p) }; }
    // (b) "<ID> ... queda absorbido / absorbido en"  (ID sujeto, sin corte de oración)
    m = new RegExp('`?'+R+'`?[^.\\n]{0,45}(?:queda\\s+)?absorbid[oa]\\b','i').exec(text);
    if (m) return { clase:'ABSORBIDO', evidencia: ventana(text, m.index, p) };
    // (c) "renumerado desde <ID>"  y  "<ID> renumerado a"
    m = new RegExp('renumerad[oa]\\s+desde\\s+`?'+R+'`?','i').exec(text);
    if (m) return { clase:'RENUMERADO', evidencia: ventana(text, m.index, p) };
    m = new RegExp('`?'+R+'`?[^.\\n]{0,30}renumerad[oa]\\s+a\\b','i').exec(text);
    if (m) return { clase:'RENUMERADO', evidencia: ventana(text, m.index, p) };
    // (d) "<ID> ... no emitido / reservado"  (ID sujeto, mismo enunciado)
    m = new RegExp('`?'+R+'`?[^.\\n]{0,45}\\bno\\s+emitid[oa]\\b','i').exec(text);
    if (m) return { clase:'NO-EMITIDO', evidencia: ventana(text, m.index, p) };
    m = new RegExp('`?'+R+'`?[^.\\n]{0,45}\\breservad[oa]\\b','i').exec(text);
    if (m) return { clase:'RESERVADO', evidencia: ventana(text, m.index, p) };
    // (e) RANGO explícito: "<fam>-N1 a <fam>-N2 ... reservad/no emitid", con este ID en el rango
    if (!isNaN(num)){
      const rre = new RegExp(esc(fam)+'-(\\d{3})`?\\s*(?:a|hasta|—|-)\\s*`?'+esc(fam)+'-(\\d{3})','gi');
      let mr;
      while ((mr = rre.exec(text))){
        const lo=Math.min(+mr[1],+mr[2]), hi=Math.max(+mr[1],+mr[2]);
        if (num>=lo && num<=hi){
          const ctx = text.slice(mr.index, mr.index+170);
          if (/no\s+emitid[oa]/i.test(ctx)) return { clase:'NO-EMITIDO', evidencia: ventana(text, mr.index, p) };
          if (/reservad[oa]|hueco\s+documental\s+intencional/i.test(ctx)) return { clase:'RESERVADO', evidencia: ventana(text, mr.index, p) };
        }
      }
    }
  }
  return null;
}
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
    if (CONFIG.SKIP_FILES && CONFIG.SKIP_FILES.has(entry.name)) continue;  // no auto-indexar el índice generado
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
 *  CONSTRUCCIÓN DEL ÍNDICE
 * --------------------------------------------------------------------------*/
function buildIndex(paths) {
  const files = new Map(paths.map(p => [p, read(p)]));
  const definitions = extractDefinitions(files);

  // Estructura: por cada tipo, un mapa ID → { definido_en, titulo, citado_en[] }
  const index = { rf: {}, da: {}, ph: {}, adr: {}, fut: {}, gap: {}, eventos: {}, candidatos: {} };
  const fileVersions = {};

  function emptyArtifactInfo() {
    return {
      definido_en: [],
      titulo: '',
      citado_en: [],
      definiciones: [],
      variantes: [],
      colision_titulo: collisionMetadata([]),
    };
  }

  function updateTitleAnalysis(info) {
    const groups = groupTitleVariants(info.definiciones);
    info.variantes = groups.map(group => ({
      titulo_completo: group.titulo,
      origenes: group.definiciones.map(definition => ({
        documento: definition.documento,
        ruta: definition.ruta,
        version: definition.version,
        forma: definition.forma,
        linea_diagnostica: definition.linea_diagnostica,
      })),
    }));
    info.colision_titulo = collisionMetadata(info.definiciones);
  }

  // Helper para registrar una DEFINICIÓN conservando cada ocurrencia y origen.
  function registrarDef(definition) {
    const { tipo, id } = definition;
    if (isPlaceholder(id) || !index[tipo]) return;
    if (!index[tipo][id]) index[tipo][id] = emptyArtifactInfo();
    const info = index[tipo][id];
    if (!info.definido_en.includes(definition.documento)) info.definido_en.push(definition.documento);
    if (definition.titulo_completo && !info.titulo) info.titulo = definition.titulo_completo;
    info.definiciones.push({
      titulo_completo: definition.titulo_completo,
      documento: definition.documento,
      ruta: definition.ruta,
      version: definition.version,
      forma: definition.forma,
      linea_diagnostica: definition.linea_diagnostica,
    });
  }
  // Helper para registrar una CITA (mención en el texto).
  function registrarCita(tipo, id, file) {
    if (isPlaceholder(id)) return;                         // PATCH: -000 placeholder ignorado
    if (!index[tipo][id]) index[tipo][id] = tipo === 'eventos'
      ? { definido_en: [], titulo: '', citado_en: [] }
      : emptyArtifactInfo();
    if (!index[tipo][id].citado_en.includes(base(file))) index[tipo][id].citado_en.push(base(file));
  }

  for (const definition of definitions) registrarDef(definition);

  for (const [p, textRaw] of files) {
    const text = stripCode(textRaw);                       // PATCH: ignorar bloques de codigo

    // Versión del archivo (nombre y metadata).
    const mfn = base(p).match(FNAME_VER_RE);
    fileVersions[p] = mfn ? `${mfn[1]}.${mfn[2]}` : null;

    // 1) CITAS: buscar todos los IDs en el texto completo.
    for (const [tipo, pat] of Object.entries(CONFIG.PATTERNS)) {
      const tipoNorm = (tipo === 'rfMad') ? 'rf' : tipo;
      for (const id of (text.match(pat) || [])) {
        registrarCita(tipoNorm, id, p);
      }
    }

    // 1b) CANDIDATOS C- (10ª regla): coleccion aparte.
    for (const cid of (text.match(CONFIG.CANDIDATE_PATTERN) || [])) {
      if (!index.candidatos) index.candidatos = {};
      if (!index.candidatos[cid]) index.candidatos[cid] = { citado_en: [] };
      if (!index.candidatos[cid].citado_en.includes(base(p))) index.candidatos[cid].citado_en.push(base(p));
    }

    // 2) EVENTOS: buscar tokens tipo EVENTO_NOMBRE.
    for (const ev of (text.match(CONFIG.EVENT_TOKEN) || [])) {
      if (CONFIG.EVENT_STOPLIST.has(ev)) continue;
      registrarCita('eventos', ev, p);
    }
  }

  for (const tipo of ['rf', 'da', 'ph', 'adr', 'fut', 'gap']) {
    for (const info of Object.values(index[tipo])) updateTitleAnalysis(info);
  }

  // ── ALERTAS derivadas ──────────────────────────────────────────────────
  const alertas = {
    rf_huerfanos: [],        // citados pero nunca definidos (y no son backlog)
    rf_backlog: [],          // citados sin definir, pero conocidos como backlog
    da_colisionadas: [],     // definidas en más de un documento
    ph_colisionadas: [],
    adr_colisionados: [],
    titulos_colisionados: [],
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
  alertas.gap_colisionados = [];                            // PATCH
  for (const [id, info] of Object.entries(index.gap)) {
    if (info.definido_en.length > 1) alertas.gap_colisionados.push({ id, en: info.definido_en });
  }
  for (const tipo of ['rf', 'da', 'ph', 'adr', 'fut', 'gap']) {
    for (const [id, info] of Object.entries(index[tipo])) {
      if (info.colision_titulo.estado === 'COLISIONADO') {
        alertas.titulos_colisionados.push({ id, tipo, variantes: info.colision_titulo.variantes });
      }
    }
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

  // 9ª REGLA: clasificar los SOLO-CITADO (sin definido_en) por marca documental explícita.
  const clasificacion = {};   // id -> { tipo, clase, evidencia }
  for (const tipo of ['rf','da','ph','adr','fut','gap']) {
    for (const [id, info] of Object.entries(index[tipo])) {
      if (info.definido_en.length) continue;               // solo los no definidos
      const c = clasificarMarca(id, files);
      if (c) clasificacion[id] = { tipo, clase: c.clase, evidencia: c.evidencia };
    }
  }

  // Baseline: la versión más frecuente.
  const vers = {};
  for (const v of Object.values(fileVersions)) if (v) vers[v] = (vers[v] || 0) + 1;
  const baseline = Object.keys(vers).sort((a, b) => vers[b] - vers[a])[0] || null;

  return {
    generado: new Date().toISOString(),
    politica_titulos: TITLE_COLLISION_POLICY,
    baseline,
    archivos_analizados: paths.length,
    archivos: paths.map(base),
    totales: {
      rf: Object.keys(index.rf).length,
      da: Object.keys(index.da).length,
      ph: Object.keys(index.ph).length,
      adr: Object.keys(index.adr).length,
      fut: Object.keys(index.fut).length,
      gap: Object.keys(index.gap).length,
      eventos: Object.keys(index.eventos).length,
    },
    rf: index.rf,
    da: index.da,
    ph: index.ph,
    adr: index.adr,
    fut: index.fut,
    gap: index.gap,
    eventos: index.eventos,
    alertas,
    clasificacion,
    candidatos: index.candidatos || {},
  };
}

/* ----------------------------------------------------------------------------
 *  COMPARACIÓN entre índice nuevo y previo (qué cambió entre versiones)
 * --------------------------------------------------------------------------*/
function comparar(nuevo, previo) {
  const cambios = { agregados: {}, eliminados: {} };
  for (const tipo of ['rf', 'da', 'ph', 'adr', 'fut', 'gap', 'eventos']) {
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
  console.log('  MAD-Index v0.07  —  Índice persistente de artefactos');
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
  if (a.titulos_colisionados.length) {
    console.log('    !  Títulos colisionados no resueltos: ' +
      a.titulos_colisionados.map(d => d.id).join(', '));
  }
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
