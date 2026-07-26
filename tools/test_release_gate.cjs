#!/usr/bin/env node
'use strict';

/* ============================================================================
 *  test_release_gate.cjs — Casos de ground-truth para MAD-Release Gate v0.2
 *  ---------------------------------------------------------------------------
 *  Crea mini-repos git temporales con escenarios conocidos y verifica que
 *  mad-release-gate.cjs produzca el veredicto y exit code esperados.
 *
 *  Uso: node tools/test_release_gate.cjs
 * ==========================================================================*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');

const TOOL = path.join(__dirname, 'mad-release-gate.cjs');
const cases = [];
const check = (name, cond) => cases.push({ name, ok: !!cond });

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t.com', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  return dir;
}

function commit(dir, message) {
  execSync('git add -A', { cwd: dir });
  execSync(`git commit -q -m "${message}"`, { cwd: dir });
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function runTool(dir, args) {
  try {
    const out = execFileSync('node', [TOOL, ...args], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status, out: (error.stdout || '') + (error.stderr || '') };
  }
}

// 1. APTO: documento presente, texto correcto, artefacto por bytes verificado
//    (external-evidence SIEMPRE deja un aviso por diseño: sus bytes no están
//    en el commit. Para un APTO limpio de verdad, el artefacto debe ser
//    repository-file con bytes que coincidan.)
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/doc.md', 'Contiene TEXTO-OK adentro');
  const artifactContent = 'artefacto real y versionado';
  const full = writeFile(dir, 'dist/app.html', artifactContent);
  const hash = sha256(fs.readFileSync(full));
  writeFile(dir, 'release.json', JSON.stringify({
    schema_version: '0.01', release_id: 'R1', title: 't', target_version: 'v1',
    release_kind: 'document', corpus_scope: 'active-set',
    required_documents: [{ path: 'docs/doc.md', document_role: 'canonical', must_contain: ['TEXTO-OK'] }],
    artifact: {
      storage_mode: 'repository-file',
      versioned_repository_path: 'dist/app.html',
      expected_size_bytes: Buffer.byteLength(artifactContent),
      expected_sha256: hash
    },
    release_policy: {}
  }));
  commit(dir, 'init');
  const r = runTool(dir, ['--release', 'release.json']);
  check('1. Documento OK + artefacto por bytes OK -> APTO limpio', r.code === 0 && r.out.includes('VEREDICTO: APTO\n'));
}

// 2. APTO CON AVISOS: artefacto externo con política que exige bytes para pleno
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/doc.md', 'Contiene TEXTO-OK adentro');
  writeFile(dir, 'release.json', JSON.stringify({
    schema_version: '0.01', release_id: 'R2', title: 't', target_version: 'v1',
    release_kind: 'document', corpus_scope: 'active-set',
    required_documents: [{ path: 'docs/doc.md', must_contain: ['TEXTO-OK'] }],
    artifact: { storage_mode: 'external-evidence' },
    release_policy: { allow_external_artifact: true, require_versioned_bytes_for_full_apto: true, external_artifact_max_verdict: 'APTO CON AVISOS' }
  }));
  commit(dir, 'init');
  const r = runTool(dir, ['--release', 'release.json']);
  check('2. Artefacto externo + política estricta -> APTO CON AVISOS', r.code === 0 && r.out.includes('APTO CON AVISOS'));
}

// 3. Documento faltante -> NO APTO, exit 1
{
  const dir = tmpRepo();
  writeFile(dir, 'release.json', JSON.stringify({
    schema_version: '0.01', release_id: 'R3', title: 't', target_version: 'v1',
    release_kind: 'document', corpus_scope: 'active-set',
    required_documents: [{ path: 'docs/no-existe.md', must_contain: ['algo'] }],
    artifact: { storage_mode: 'external-evidence' },
    release_policy: { allow_external_artifact: true }
  }));
  commit(dir, 'init');
  const r = runTool(dir, ['--release', 'release.json']);
  check('3. Documento faltante -> NO APTO, exit 1', r.code === 1 && r.out.includes('NO APTO'));
}

// 4. Estado JSON incorrecto -> NO APTO
{
  const dir = tmpRepo();
  writeFile(dir, 'estado.json', JSON.stringify({ schema_version: '1', baseline: { state: 'draft' } }));
  writeFile(dir, 'release.json', JSON.stringify({
    schema_version: '0.01', release_id: 'R4', title: 't', target_version: 'v1',
    release_kind: 'document', corpus_scope: 'active-set',
    required_state: { path: 'estado.json', json_checks: { 'baseline.state': 'frozen' } },
    artifact: { storage_mode: 'external-evidence' },
    release_policy: { allow_external_artifact: true }
  }));
  commit(dir, 'init');
  const r = runTool(dir, ['--release', 'release.json']);
  check('4. Estado JSON con valor incorrecto -> NO APTO', r.code === 1 && r.out.includes('NO APTO') && r.out.includes('baseline.state'));
}

// 5. Hash o tamaño incorrecto del artefacto -> NO APTO
{
  const dir = tmpRepo();
  const content = 'contenido del artefacto';
  writeFile(dir, 'dist/app.html', content);
  writeFile(dir, 'release.json', JSON.stringify({
    schema_version: '0.01', release_id: 'R5', title: 't', target_version: 'v1',
    release_kind: 'artifact', corpus_scope: 'active-set',
    artifact: {
      storage_mode: 'repository-file',
      versioned_repository_path: 'dist/app.html',
      expected_size_bytes: 999999,
      expected_sha256: 'hash-incorrecto-a-proposito'
    },
    release_policy: {}
  }));
  commit(dir, 'init');
  const r = runTool(dir, ['--release', 'release.json']);
  check('5. Hash/tamaño de artefacto incorrecto -> NO APTO', r.code === 1 && r.out.includes('divergente'));
}

// 6. Artefacto correcto por bytes -> APTO pleno
{
  const dir = tmpRepo();
  const content = 'contenido exacto del artefacto';
  const full = writeFile(dir, 'dist/app.html', content);
  const hash = sha256(fs.readFileSync(full));
  writeFile(dir, 'release.json', JSON.stringify({
    schema_version: '0.01', release_id: 'R6', title: 't', target_version: 'v1',
    release_kind: 'artifact', corpus_scope: 'active-set',
    artifact: {
      storage_mode: 'repository-file',
      versioned_repository_path: 'dist/app.html',
      expected_size_bytes: Buffer.byteLength(content),
      expected_sha256: hash
    },
    release_policy: {}
  }));
  commit(dir, 'init');
  const r = runTool(dir, ['--release', 'release.json']);
  check('6. Artefacto con hash/tamaño correctos -> APTO', r.code === 0 && r.out.includes('VEREDICTO: APTO\n'));
}

// 7. Pack privado / política sin marcar bytes -> exit code refleja hallazgo
{
  const dir = tmpRepo();
  writeFile(dir, 'release.json', JSON.stringify({
    schema_version: '0.01', release_id: 'R7', title: 't', target_version: 'v1',
    release_kind: 'document', corpus_scope: 'active-set',
    artifact: { storage_mode: 'external-evidence' },
    release_policy: {} // NO allow_external_artifact -> debe fallar
  }));
  commit(dir, 'init');
  const r = runTool(dir, ['--release', 'release.json']);
  check('7. Artefacto externo sin allow_external_artifact -> NO APTO', r.code === 1 && r.out.includes('no permite evidencia externa'));
}

// 8. --help no requiere --release ni falla
{
  const dir = tmpRepo();
  const r = runTool(dir, ['--help']);
  check('8. --help funciona sin --release', r.code === 0 && r.out.includes('MAD-Release Gate'));
}

const bar = '='.repeat(62);
console.log(bar);
console.log('  test_release_gate — casos de ground-truth para MAD-Release Gate');
console.log(bar);
let pass = 0;
for (const c of cases) { console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`); if (c.ok) pass++; }
console.log(bar);
console.log(`  Resultado: ${pass}/${cases.length} casos PASS`);
const dod = pass === cases.length;
console.log(`  DoD cumplido: ${dod ? 'SI' : 'NO'}`);
console.log(bar);
process.exit(dod ? 0 : 1);
