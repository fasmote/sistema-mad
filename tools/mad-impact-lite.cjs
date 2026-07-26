#!/usr/bin/env node
'use strict';

/* ============================================================================
 *  MAD-Impact Lite v0.3  (Node.js / CommonJS)
 *  ---------------------------------------------------------------------------
 *  QUÉ ES: una herramienta que comprueba DOS cosas distintas antes de aceptar
 *  un cambio documental (típicamente en un Pull Request):
 *
 *    1. SINCRONIZACIÓN ESTÁTICA: que ciertos archivos existan y contengan
 *       (o NO contengan) fragmentos de texto declarados. Sirve para verificar
 *       que documentos que deben estar alineados no quedaron desincronizados.
 *
 *    2. IMPACTO DE CAMBIOS: cuando cambia un archivo "fuente", informa qué
 *       archivos "derivados" deberían revisarse en el mismo cambio. Detecta
 *       el caso peligroso: "cambié la fuente pero me olvidé de actualizar
 *       los documentos que dependen de ella".
 *
 *  No modifica documentos ni decide contenido. Solo verifica y avisa.
 *
 *  ---------------------------------------------------------------------------
 *  ORIGEN: nació en his-core-platform-sos y se promovió a sistema-mad como
 *  producto genérico (v0.1 → v0.2 → v0.3). En la v0.2, todo lo específico del proyecto
 *  (nombres de archivos, resumen de estado, bloque de reglas) pasó a ser
 *  CONFIGURABLE desde el registro, en vez de estar cableado. Cualquier proyecto
 *  la usa definiendo su propio registro.
 *
 *  ---------------------------------------------------------------------------
 *  USO:
 *    node tools/mad-impact-lite.cjs --registry <registro.json>
 *    node tools/mad-impact-lite.cjs --registry reg.json --state estado.json
 *    node tools/mad-impact-lite.cjs --registry reg.json --base main
 *    node tools/mad-impact-lite.cjs --registry reg.json --strict-impact
 *    node tools/mad-impact-lite.cjs --help
 *
 *  FLAGS:
 *    --registry <archivo>  (obligatorio) registro de checks y grupos de sync
 *    --state    <archivo>  estado del proyecto a resumir (opcional)
 *    --output   <archivo>  reporte de salida (default: impact-report.txt)
 *    --base     <ref>      rama/commit base para el diff (default: auto o env
 *                          MAD_IMPACT_BASE). Si no, usa HEAD^..HEAD.
 *    --no-diff             no calcular impacto (solo checks estáticos)
 *    --strict-impact       si hay derivados sin revisar, exit 3 (bloquea CI)
 *    --help                muestra esta ayuda
 *
 *  ---------------------------------------------------------------------------
 *  FORMATO DEL REGISTRO (registro.json):
 *
 *  {
 *    "schema_version": "0.01",
 *
 *    "checks": [
 *      {
 *        "path": "docs/documento.md",
 *        "must_contain": ["texto que DEBE estar"],
 *        "must_not_contain": ["texto obsoleto que NO debe estar"]
 *      }
 *    ],
 *
 *    "sync_groups": [
 *      {
 *        "id": "GRUPO-001",
 *        "title": "Descripción del grupo",
 *        "triggers": ["docs/fuente.md"],
 *        "expected_updates": ["docs/derivado-1.md", "docs/derivado-2.md"]
 *      }
 *    ],
 *
 *    "state_summary": {
 *      "key": "nfm",
 *      "label": "MÓDULOS",
 *      "fields": ["version", "state"]
 *    },
 *
 *    "context_rule": {
 *      "title": "REGLA PARA CAMBIO DE CONTEXTO",
 *      "read_first": [
 *        "estado-proyecto.json",
 *        "registro.json"
 *      ],
 *      "note": "Una IA no debe afirmar que auditó todo si solo leyó este paquete."
 *    }
 *  }
 *
 *  Notas del formato:
 *   - checks: verificación estática de fragmentos por archivo.
 *   - sync_groups: si cambia algo que matchea "triggers", los
 *     "expected_updates" deberían haber cambiado también. Los que no
 *     cambiaron se listan como "pendientes de revisión".
 *   - state_summary (OPCIONAL): cómo resumir el archivo de estado. "key" es
 *     la clave del JSON de estado a recorrer; "fields" los campos a mostrar
 *     de cada entrada. Si no se declara, no se muestra resumen de estado.
 *   - context_rule (OPCIONAL): bloque de recordatorio para quien retoma el
 *     trabajo. Totalmente configurable por proyecto. Si no se declara, se
 *     omite.
 * ==========================================================================*/

const fs = require('fs');
const { execFileSync } = require('child_process');

const HELP = `MAD-Impact Lite v0.3 — sincronización e impacto documental

Uso:
  node tools/mad-impact-lite.cjs --registry <registro.json>
  node tools/mad-impact-lite.cjs --registry reg.json --state estado.json --base main
  node tools/mad-impact-lite.cjs --help

Flags:
  --registry <archivo>  (obligatorio) registro de checks y grupos de sync
  --state    <archivo>  estado del proyecto a resumir (opcional)
  --output   <archivo>  reporte de salida (default: impact-report.txt)
  --base     <ref>      rama/commit base para el diff
  --no-diff             solo checks estáticos, sin impacto
  --strict-impact       bloquea (exit 3) si hay derivados sin revisar
  --help                muestra esta ayuda

El formato del registro está documentado en la cabecera de este archivo
y en docs/MAD_IMPACT_LITE.md.
`;

function fail(message, code = 2) {
  console.error(`MAD-Impact Lite: ${message}`);
  process.exit(code);
}

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`no se pudo leer JSON ${filePath}: ${error.message}`);
  }
}

function normalize(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function exists(p) {
  return fs.existsSync(p) && fs.statSync(p).isFile();
}

// AJ-2 (observación ChatGPT, aceptada): coincidencia exacta por defecto.
// Solo se trata como prefijo de carpeta cuando el patrón termina en "/".
// Antes: "docs/doc.md" matcheaba también "docs/doc.md.bak" (falso positivo).
// Ahora: "docs/doc.md" exige coincidencia exacta; "docs/carpeta/" sí es prefijo.
function pathMatches(changedPath, pattern) {
  const p = normalize(pattern);
  const c = normalize(changedPath);
  if (p.endsWith('/')) return c === p.slice(0, -1) || c.startsWith(p);
  return c === p;
}

// AJ-1 (observación ChatGPT, aceptada): distinguir "--no-diff pedido a propósito"
// de "no se pudo determinar el rango git" (por ejemplo, un solo commit en el repo,
// o un checkout superficial sin historial). Antes ambos casos devolvían [] y el
// reporte los trataba igual — lo cual podía dar un veredicto APTO demasiado
// optimista cuando en realidad el impacto nunca se evaluó. Ahora se devuelve el
// estado del diff junto con los archivos, y el veredicto lo refleja.
//
// Devuelve { files, diffState } donde diffState es:
//   'disabled'      → --no-diff pedido explícitamente (válido, no penaliza)
//   'ok'             → diff calculado con éxito (incluso si files está vacío)
//   'indeterminate'  → no se pudo calcular el diff (fuerza aviso o bloqueo)
function gitChangedFiles(baseRef) {
  if (hasFlag('--no-diff')) return { files: [], diffState: 'disabled' };

  const attempts = [];
  if (baseRef) attempts.push([baseRef, 'HEAD']);
  attempts.push(['HEAD^1', 'HEAD']);
  attempts.push(['HEAD^', 'HEAD']);

  for (const [from, to] of attempts) {
    try {
      const output = execFileSync(
        'git',
        ['diff', '--name-only', '--diff-filter=ACMRT', from, to],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const files = [...new Set(output.split(/\r?\n/).map(normalize).filter(Boolean))].sort();
      return { files, diffState: 'ok' };
    } catch (_) {
      // Se prueba el siguiente rango.
    }
  }

  return { files: [], diffState: 'indeterminate' };
}

function buildStaticChecks(registry) {
  const results = [];

  for (const check of registry.checks || []) {
    const filePath = normalize(check.path || '');
    if (!filePath) {
      results.push({ path: '(sin ruta)', ok: false, errors: ['check sin path'] });
      continue;
    }

    if (!exists(filePath)) {
      results.push({ path: filePath, ok: false, errors: ['archivo inexistente'] });
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const errors = [];

    for (const token of check.must_contain || []) {
      if (!text.includes(token)) errors.push(`falta fragmento requerido: ${JSON.stringify(token)}`);
    }

    for (const token of check.must_not_contain || []) {
      if (text.includes(token)) errors.push(`permanece fragmento obsoleto: ${JSON.stringify(token)}`);
    }

    results.push({ path: filePath, ok: errors.length === 0, errors });
  }

  return results;
}

function buildImpact(registry, changedFiles) {
  const changed = new Set(changedFiles.map(normalize));
  const groups = [];

  for (const group of registry.sync_groups || []) {
    const triggeredBy = changedFiles.filter(file =>
      (group.triggers || []).some(trigger => pathMatches(file, trigger))
    );

    if (!triggeredBy.length) continue;

    const reviewed = [];
    const pending = [];

    for (const expected of group.expected_updates || []) {
      const normalizedExpected = normalize(expected);
      const wasChanged = [...changed].some(file => pathMatches(file, normalizedExpected));
      (wasChanged ? reviewed : pending).push(normalizedExpected);
    }

    groups.push({
      id: group.id,
      title: group.title || group.id,
      triggeredBy,
      reviewed,
      pending
    });
  }

  return groups;
}

// GENÉRICO: resume el estado según lo que declare el registro (state_summary).
// Si no hay state_summary o no hay estado, devuelve lista vacía.
function stateSummary(state, summaryConfig) {
  if (!state || !summaryConfig || !summaryConfig.key) return [];
  const section = state[summaryConfig.key];
  if (!section || typeof section !== 'object') return [];

  const fields = summaryConfig.fields || ['version', 'state'];
  const rows = [];
  for (const code of Object.keys(section).sort()) {
    const item = section[code] || {};
    const parts = fields.map(f => item[f] || `sin ${f}`);
    rows.push(`${code}: ${parts.join(' · ')}`);
  }
  return rows;
}

function renderReport({ state, registry, staticChecks, impactGroups, changedFiles, diffState }) {
  const lines = [];
  const staticErrors = staticChecks.filter(r => !r.ok);
  const impactPending = impactGroups.reduce((acc, g) => acc + g.pending.length, 0);
  // AJ-1: el diff indeterminado nunca puede resultar en un APTO silencioso.
  const impactUnknown = diffState === 'indeterminate';

  lines.push('==================================================================');
  lines.push('  MAD-Impact Lite v0.3 — Sincronización e impacto documental');
  lines.push('==================================================================');
  lines.push('');
  lines.push(`Esquema registro: ${registry.schema_version || 'desconocido'}`);
  lines.push(`Archivos cambiados detectados: ${changedFiles.length}`);
  lines.push('');

  // Resumen de estado (solo si el registro lo configura y hay estado).
  const summaryConfig = registry.state_summary;
  const summaryRows = stateSummary(state, summaryConfig);
  if (summaryRows.length) {
    lines.push((summaryConfig.label || 'ESTADO').toUpperCase());
    for (const row of summaryRows) lines.push(`  - ${row}`);
    lines.push('');
  }

  lines.push('COMPROBACIONES ESTÁTICAS');
  if (!staticChecks.length) {
    lines.push('  i   No hay checks estáticos declarados.');
  } else if (!staticErrors.length) {
    lines.push(`  OK  ${staticChecks.length} archivo(s) sincronizados con fragmentos mínimos.`);
  } else {
    for (const result of staticChecks) {
      if (result.ok) continue;
      lines.push(`  X   ${result.path}`);
      for (const error of result.errors) lines.push(`      - ${error}`);
    }
  }
  lines.push('');

  lines.push('IMPACTO DEL CAMBIO');
  if (diffState === 'disabled') {
    lines.push('  i   Cálculo de impacto desactivado (--no-diff). Solo se evaluaron los checks estáticos.');
  } else if (diffState === 'indeterminate') {
    lines.push('  !   No se pudo determinar el rango de cambios (git diff falló).');
    lines.push('      El impacto NO fue evaluado — no confundir con "sin impacto".');
  } else if (!changedFiles.length) {
    lines.push('  OK  Diff calculado sin archivos cambiados en el rango analizado.');
  } else if (!impactGroups.length) {
    lines.push('  OK  Ningún grupo de sincronización fue activado por el diff.');
  } else {
    for (const group of impactGroups) {
      lines.push(`  [${group.id}] ${group.title}`);
      lines.push('    Disparado por:');
      for (const file of group.triggeredBy) lines.push(`      - ${file}`);
      lines.push('    Revisados en el mismo cambio:');
      if (group.reviewed.length) {
        for (const file of group.reviewed) lines.push(`      - ${file}`);
      } else {
        lines.push('      - (ninguno)');
      }
      lines.push('    Pendientes de revisión explícita:');
      if (group.pending.length) {
        for (const file of group.pending) lines.push(`      - ${file}`);
      } else {
        lines.push('      - (ninguno)');
      }
    }
  }
  lines.push('');

  lines.push('VEREDICTO');
  if (staticErrors.length) {
    lines.push(`  NO APTO: ${staticErrors.length} archivo(s) fallan controles estáticos.`);
  } else if (impactUnknown) {
    lines.push('  APTO CON REVISIÓN: el impacto no pudo evaluarse (diff indeterminado).');
    lines.push('  Con --strict-impact esto bloquea (no se asume "sin impacto").');
  } else if (impactPending) {
    lines.push(`  APTO CON REVISIÓN: ${impactPending} impacto(s) no fueron tocados en el diff.`);
    lines.push('  Esto es aviso; usar --strict-impact para bloquear.');
  } else {
    lines.push('  APTO: controles estáticos e impacto explícito sin pendientes.');
  }
  lines.push('');

  // Bloque de regla de contexto (solo si el registro lo configura).
  const rule = registry.context_rule;
  if (rule) {
    lines.push((rule.title || 'REGLA PARA CAMBIO DE CONTEXTO').toUpperCase());
    if (Array.isArray(rule.read_first) && rule.read_first.length) {
      lines.push('  Leer primero:');
      rule.read_first.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`));
    }
    if (rule.note) {
      lines.push('');
      lines.push(`  ${rule.note}`);
    }
    lines.push('==================================================================');
  }

  return {
    text: `${lines.join('\n')}\n`,
    staticErrors: staticErrors.length,
    impactPending,
    impactUnknown
  };
}

if (hasFlag('--help') || hasFlag('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}

const registryPath = argValue('--registry', null);
if (!registryPath) fail('falta --registry <archivo.json>  (usá --help para ver el formato)');

const statePath = argValue('--state', null);
const outputPath = argValue('--output', 'impact-report.txt');
const baseRef = argValue('--base', process.env.MAD_IMPACT_BASE || null);
const strictImpact = hasFlag('--strict-impact');

if (!exists(registryPath)) fail(`no existe el registro: ${registryPath}`);
const registry = readJson(registryPath);

// El estado es opcional en la versión genérica.
let state = null;
if (statePath) {
  if (!exists(statePath)) fail(`no existe el archivo de estado: ${statePath}`);
  state = readJson(statePath);
}

const changedResult = gitChangedFiles(baseRef);
const changedFiles = changedResult.files;
const diffState = changedResult.diffState;
const staticChecks = buildStaticChecks(registry);
const impactGroups = buildImpact(registry, changedFiles);
const report = renderReport({ state, registry, staticChecks, impactGroups, changedFiles, diffState });

fs.writeFileSync(outputPath, report.text, 'utf8');
process.stdout.write(report.text);

if (report.staticErrors > 0) process.exit(2);
// AJ-1: con --strict-impact, un diff indeterminado bloquea igual que un
// pendiente real — no se asume "sin impacto" cuando en realidad no se supo.
if (strictImpact && (report.impactPending > 0 || report.impactUnknown)) process.exit(3);
process.exit(0);
