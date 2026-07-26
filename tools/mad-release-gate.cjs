#!/usr/bin/env node
'use strict';

/* ============================================================================
 *  MAD-Release Gate v0.2  (Node.js / CommonJS)
 *  ---------------------------------------------------------------------------
 *  QUÉ ES: una "puerta de publicación" determinística. Antes de publicar algo
 *  (un documento, un artefacto, una versión), verifica y CERTIFICA:
 *    - qué objetivo se está validando
 *    - qué documentos participaron y su hash exacto (SHA-256)
 *    - con qué commit de git se hizo
 *    - qué evidencia falta todavía
 *  Produce un manifiesto reproducible (release-manifest.json) y un reporte.
 *
 *  POR QUÉ IMPORTA: sin esto, "publiqué la versión X" es una afirmación sin
 *  prueba. Con esto, cada publicación queda atada a un commit, a hashes de
 *  archivos, y a un veredicto APTO / APTO CON AVISOS / NO APTO. Es la diferencia
 *  entre "confío en que está bien" y "puedo demostrar exactamente qué validé".
 *
 *  NO REEMPLAZA a mad-impact, mad-index, mad-linter ni mad-snapshot. Los
 *  complementa: esas herramientas verifican coherencia; el gate certifica la
 *  publicación y puede exigir que esas otras hayan pasado (vía variables de
 *  entorno, ver abajo).
 *
 *  ORIGEN: esta herramienta nació en el proyecto his-core-platform-sos y se
 *  promovió a sistema-mad como producto genérico. No depende de ningún dominio
 *  ni de nombres internos de ningún proyecto: todo lo específico vive en el
 *  archivo de declaración (--release <archivo.json>).
 *
 *  ---------------------------------------------------------------------------
 *  USO:
 *    node tools/mad-release-gate.cjs --release <declaracion.json>
 *    node tools/mad-release-gate.cjs --release rel.json --manifest out/manifest.json
 *    node tools/mad-release-gate.cjs --release rel.json --artifact dist/app.html
 *    node tools/mad-release-gate.cjs --help
 *
 *  FLAGS:
 *    --release   <archivo>  (obligatorio) declaración de release en JSON
 *    --manifest  <archivo>  salida del manifiesto (default: release-manifest.json)
 *    --report    <archivo>  salida del reporte legible (default: release-report.txt)
 *    --artifact  <archivo>  artefacto cuyos bytes se verifican (opcional)
 *    --help                 muestra esta ayuda y el formato del .release.json
 *
 *  VARIABLES DE ENTORNO (opcionales, para integración con CI):
 *    Permiten que el gate exija que otras herramientas MAD hayan pasado.
 *    Cada una acepta true/1/yes o false/0/no. Si no se define, se informa
 *    como "no informado" (aviso, no bloqueo).
 *      MAD_IMPACT_CLEAN            → ¿mad-impact pasó limpio?
 *      MAD_LINTER_CLEAN           → ¿mad-linter dio 0 hallazgos duros?
 *      MAD_ZERO_ACTIONABLE_ORPHANS → ¿el índice no tiene huérfanos accionables?
 *      MAD_INDEX_REPRODUCIBLE     → ¿el índice maestro es reproducible?
 *
 *  VEREDICTOS:
 *    APTO              → sin hallazgos duros ni avisos
 *    APTO CON AVISOS   → sin hallazgos duros, pero hay avisos (ej: artefacto
 *                        aún no versionado, o un check de CI no informado)
 *    NO APTO           → hay al menos un hallazgo duro (exit code 1)
 *
 *  ---------------------------------------------------------------------------
 *  FORMATO DEL ARCHIVO .release.json (ejemplo genérico):
 *
 *  {
 *    "schema_version": "0.01",
 *    "release_id": "MI-RELEASE-001",
 *    "title": "Publicación de ejemplo",
 *    "target_version": "v1.0",
 *    "release_kind": "document",
 *    "corpus_scope": "active-set",
 *
 *    "required_documents": [
 *      {
 *        "path": "docs/mi-documento.md",
 *        "document_role": "canonical",
 *        "version": "v1.0",
 *        "must_contain": ["texto que DEBE estar presente"]
 *      }
 *    ],
 *
 *    "required_state": {
 *      "path": "estado-proyecto.json",
 *      "json_checks": {
 *        "baseline.state": "frozen"
 *      }
 *    },
 *
 *    "artifact": {
 *      "storage_mode": "repository-file",
 *      "versioned_repository_path": "dist/entregable.html",
 *      "expected_size_bytes": 12345,
 *      "expected_sha256": "abc123..."
 *    },
 *
 *    "release_policy": {
 *      "require_zero_hard_findings": true,
 *      "require_impact_clean": true,
 *      "require_zero_actionable_orphans": true,
 *      "allow_external_artifact": false,
 *      "require_versioned_bytes_for_full_apto": true,
 *      "external_artifact_max_verdict": "APTO CON AVISOS"
 *    },
 *
 *    "known_notices": ["aviso conocido y aceptado"]
 *  }
 *
 *  Notas del formato:
 *   - required_documents: archivos que deben existir; must_contain verifica
 *     que cada uno contenga cierto texto obligatorio.
 *   - required_state: un JSON de estado y comprobaciones sobre sus campos
 *     (json_checks usa rutas con punto: "a.b.c").
 *   - artifact.storage_mode:
 *       "repository-file"   → el artefacto es un archivo versionado; se
 *                             verifican sus bytes (tamaño y SHA-256).
 *       "external-evidence" → el artefacto todavía no está versionado; se
 *                             valida por evidencia documental. Requiere
 *                             allow_external_artifact: true en la política.
 *   - release_policy: qué se exige para dar APTO. Los require_* que dependen
 *     de otras herramientas se informan vía las variables de entorno de arriba.
 * ==========================================================================*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const HELP = `MAD-Release Gate v0.2 — puerta de publicación determinística

Uso:
  node tools/mad-release-gate.cjs --release <declaracion.json>
  node tools/mad-release-gate.cjs --release rel.json --artifact dist/app.html
  node tools/mad-release-gate.cjs --help

Flags:
  --release   <archivo>  (obligatorio) declaración de release en JSON
  --manifest  <archivo>  salida del manifiesto (default: release-manifest.json)
  --report    <archivo>  salida del reporte legible (default: release-report.txt)
  --artifact  <archivo>  artefacto cuyos bytes se verifican (opcional)
  --help                 muestra esta ayuda

Variables de entorno opcionales (integración CI):
  MAD_IMPACT_CLEAN, MAD_LINTER_CLEAN, MAD_ZERO_ACTIONABLE_ORPHANS,
  MAD_INDEX_REPRODUCIBLE  (cada una: true/1/yes o false/0/no)

Veredictos: APTO | APTO CON AVISOS | NO APTO (exit 1 si NO APTO)

El formato completo del .release.json está documentado en la cabecera de
este archivo y en docs/MAD_RELEASE_GATE.md.
`;

function fail(message, code = 2) {
  console.error(`MAD-Release-Gate: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    release: null,
    manifest: 'release-manifest.json',
    report: 'release-report.txt',
    artifact: null
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--help' || key === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    }
    const value = argv[i + 1];
    if (key === '--release') args.release = value;
    else if (key === '--manifest') args.manifest = value;
    else if (key === '--report') args.report = value;
    else if (key === '--artifact') args.artifact = value;
    else fail(`argumento desconocido: ${key}`);
    i += 1;
  }
  if (!args.release) fail('falta --release <archivo.json>  (usá --help para ver el formato)');
  return args;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`no se pudo leer JSON ${filePath}: ${error.message}`);
  }
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fileEvidence(filePath, documentRole, declaredVersion) {
  const buffer = fs.readFileSync(filePath);
  return {
    path: filePath.replace(/\\/g, '/'),
    document_role: documentRole || 'unspecified',
    version: declaredVersion || null,
    size_bytes: buffer.length,
    sha256: sha256Buffer(buffer)
  };
}

function getByPath(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => {
    if (value === undefined || value === null) return undefined;
    return value[key];
  }, object);
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (error) {
    fail(`no se pudo determinar el commit exacto: ${error.message}`);
  }
}

function envBoolean(name) {
  const value = String(process.env[name] || '').toLowerCase();
  if (['true', '1', 'yes'].includes(value)) return true;
  if (['false', '0', 'no'].includes(value)) return false;
  return null;
}

const args = parseArgs(process.argv);
const releasePath = path.normalize(args.release);
if (!fs.existsSync(releasePath)) fail(`no existe la declaración de release: ${releasePath}`);

const release = readJson(releasePath);
const commit = gitCommit();
const hardFindings = [];
const notices = Array.isArray(release.known_notices) ? [...release.known_notices] : [];
const files = [];

files.push(fileEvidence(releasePath, 'release-declaration', release.schema_version));

for (const required of release.required_documents || []) {
  const filePath = path.normalize(required.path);
  if (!fs.existsSync(filePath)) {
    hardFindings.push(`Falta documento obligatorio: ${required.path}`);
    continue;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  for (const expected of required.must_contain || []) {
    if (!text.includes(expected)) {
      hardFindings.push(`${required.path}: falta texto obligatorio «${expected}»`);
    }
  }
  files.push(fileEvidence(filePath, required.document_role, required.version));
}

if (release.required_state && release.required_state.path) {
  const statePath = path.normalize(release.required_state.path);
  if (!fs.existsSync(statePath)) {
    hardFindings.push(`Falta estado canónico: ${release.required_state.path}`);
  } else {
    const state = readJson(statePath);
    for (const [jsonPath, expected] of Object.entries(release.required_state.json_checks || {})) {
      const actual = getByPath(state, jsonPath);
      if (actual !== expected) {
        hardFindings.push(`${release.required_state.path}: ${jsonPath}=${JSON.stringify(actual)}; esperado=${JSON.stringify(expected)}`);
      }
    }
    files.push(fileEvidence(statePath, 'canonical-project-state', state.schema_version));
  }
}

const artifact = release.artifact || {};
let artifactResult = {
  storage_mode: artifact.storage_mode || null,
  source_name: artifact.source_name || null,
  publication_name: artifact.publication_name || null,
  expected_size_bytes: artifact.expected_size_bytes || null,
  expected_sha256: artifact.expected_sha256 || null,
  verified_bytes: false,
  verified_path: null,
  actual_size_bytes: null,
  actual_sha256: null
};

let artifactPath = args.artifact ? path.normalize(args.artifact) : null;
if (!artifactPath && artifact.storage_mode === 'repository-file' && artifact.versioned_repository_path) {
  artifactPath = path.normalize(artifact.versioned_repository_path);
}

if (artifactPath) {
  if (!fs.existsSync(artifactPath)) {
    hardFindings.push(`No existe el artefacto declarado para verificación de bytes: ${artifactPath}`);
  } else {
    const buffer = fs.readFileSync(artifactPath);
    artifactResult.verified_bytes = true;
    artifactResult.verified_path = artifactPath.replace(/\\/g, '/');
    artifactResult.actual_size_bytes = buffer.length;
    artifactResult.actual_sha256 = sha256Buffer(buffer);
    if (artifact.expected_size_bytes !== undefined && buffer.length !== artifact.expected_size_bytes) {
      hardFindings.push(`Tamaño del artefacto divergente: ${buffer.length}; esperado ${artifact.expected_size_bytes}`);
    }
    if (artifact.expected_sha256 && artifactResult.actual_sha256 !== artifact.expected_sha256) {
      hardFindings.push(`SHA-256 del artefacto divergente: ${artifactResult.actual_sha256}; esperado ${artifact.expected_sha256}`);
    }
    files.push(fileEvidence(artifactPath, 'release-artifact', release.target_version));
  }
} else if (artifact.storage_mode === 'external-evidence') {
  if (!(release.release_policy && release.release_policy.allow_external_artifact)) {
    hardFindings.push('El artefacto es externo pero la política no permite evidencia externa.');
  }
  if (!notices.some(item => item.includes('todavía no está versionado'))) {
    notices.push('El artefacto se valida por evidencia documental; sus bytes no participan todavía en el commit.');
  }
} else {
  hardFindings.push('No existe una ruta verificable para el artefacto de publicación.');
}

const policy = release.release_policy || {};
const integrationChecks = {
  impact_clean: envBoolean('MAD_IMPACT_CLEAN'),
  linter_clean: envBoolean('MAD_LINTER_CLEAN'),
  zero_actionable_orphans: envBoolean('MAD_ZERO_ACTIONABLE_ORPHANS'),
  index_reproducible: envBoolean('MAD_INDEX_REPRODUCIBLE')
};

function requireCiCheck(policyKey, checkKey, label) {
  if (!policy[policyKey]) return;
  const value = integrationChecks[checkKey];
  if (value === false) hardFindings.push(`${label}: NO CUMPLE`);
  else if (value === null) notices.push(`${label}: no informado en esta ejecución local`);
}

requireCiCheck('require_impact_clean', 'impact_clean', 'MAD-Impact Lite');
requireCiCheck('require_zero_hard_findings', 'linter_clean', 'MAD-Linter');
requireCiCheck('require_zero_actionable_orphans', 'zero_actionable_orphans', 'Índice sin huérfanos accionables');
if (policy.require_zero_actionable_orphans) {
  const value = integrationChecks.index_reproducible;
  if (value === false) hardFindings.push('Índice maestro reproducible: NO CUMPLE');
  else if (value === null) notices.push('Índice maestro reproducible: no informado en esta ejecución local');
}

files.sort((a, b) => a.path.localeCompare(b.path, 'es'));

let verdict = 'APTO';
if (hardFindings.length) verdict = 'NO APTO';
else if (notices.length) verdict = 'APTO CON AVISOS';

if (artifact.storage_mode === 'external-evidence' && verdict === 'APTO' && policy.require_versioned_bytes_for_full_apto) {
  verdict = policy.external_artifact_max_verdict || 'APTO CON AVISOS';
}

const manifest = {
  schema_version: '0.01',
  generator: 'MAD-Release-Gate v0.2',
  generated_at_utc: new Date().toISOString(),
  release_declaration: releasePath.replace(/\\/g, '/'),
  release_id: release.release_id,
  title: release.title,
  target_version: release.target_version,
  release_kind: release.release_kind,
  corpus_scope: release.corpus_scope,
  commit,
  verdict,
  integration_checks: integrationChecks,
  artifact: artifactResult,
  files,
  hard_findings: hardFindings,
  notices
};

fs.mkdirSync(path.dirname(path.resolve(args.manifest)), { recursive: true });
fs.writeFileSync(args.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const report = [
  'MAD-Release Gate v0.2',
  '======================',
  `Release: ${release.release_id || 'no declarada'}`,
  `Título: ${release.title || 'no declarado'}`,
  `Versión objetivo: ${release.target_version || 'no declarada'}`,
  `Commit exacto: ${commit}`,
  `Corpus scope: ${release.corpus_scope || 'no declarado'}`,
  `Archivos manifestados: ${files.length}`,
  `Artefacto con bytes verificados: ${artifactResult.verified_bytes ? 'SÍ' : 'NO'}`,
  '',
  'Controles integrados:',
  `- MAD-Impact Lite: ${integrationChecks.impact_clean === null ? 'NO INFORMADO' : integrationChecks.impact_clean ? 'CUMPLE' : 'NO CUMPLE'}`,
  `- MAD-Linter: ${integrationChecks.linter_clean === null ? 'NO INFORMADO' : integrationChecks.linter_clean ? 'CUMPLE' : 'NO CUMPLE'}`,
  `- Cero huérfanos accionables: ${integrationChecks.zero_actionable_orphans === null ? 'NO INFORMADO' : integrationChecks.zero_actionable_orphans ? 'CUMPLE' : 'NO CUMPLE'}`,
  `- Índice reproducible: ${integrationChecks.index_reproducible === null ? 'NO INFORMADO' : integrationChecks.index_reproducible ? 'CUMPLE' : 'NO CUMPLE'}`,
  '',
  `Hallazgos duros: ${hardFindings.length}`,
  ...hardFindings.map(item => `- ${item}`),
  '',
  `Avisos: ${notices.length}`,
  ...notices.map(item => `- ${item}`),
  '',
  `VEREDICTO: ${verdict}`,
  ''
].join('\n');

fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
fs.writeFileSync(args.report, report, 'utf8');
console.log(report);

if (hardFindings.length) process.exit(1);
