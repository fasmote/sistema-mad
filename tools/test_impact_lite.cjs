#!/usr/bin/env node
'use strict';

/* ============================================================================
 *  test_impact_lite.cjs — Casos de ground-truth para MAD-Impact Lite v0.3
 *  ---------------------------------------------------------------------------
 *  Crea mini-repos git temporales con escenarios conocidos y verifica que
 *  mad-impact-lite.cjs produzca el veredicto y exit code esperados.
 *
 *  Uso: node tools/test_impact_lite.cjs
 * ==========================================================================*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const TOOL = path.join(__dirname, 'mad-impact-lite.cjs');
const cases = [];
const check = (name, cond) => cases.push({ name, ok: !!cond });

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-test-'));
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

// 1. Sin impacto pendiente: fuente y derivado actualizados juntos -> APTO
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/fuente.md', 'v1');
  writeFile(dir, 'docs/derivado.md', 'v1');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({
    schema_version: '0.01',
    sync_groups: [{ id: 'G1', title: 'g1', triggers: ['docs/fuente.md'], expected_updates: ['docs/derivado.md'] }]
  }));
  writeFile(dir, 'docs/fuente.md', 'v2');
  writeFile(dir, 'docs/derivado.md', 'v2');
  commit(dir, 'cambio ambos');
  const r = runTool(dir, ['--registry', 'registro.json']);
  check('1. Fuente y derivado actualizados juntos -> APTO', r.code === 0 && r.out.includes('APTO: controles'));
}

// 2. Derivado pendiente: cambia fuente, no el derivado -> APTO CON REVISION
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/fuente.md', 'v1');
  writeFile(dir, 'docs/derivado.md', 'v1');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({
    schema_version: '0.01',
    sync_groups: [{ id: 'G1', title: 'g1', triggers: ['docs/fuente.md'], expected_updates: ['docs/derivado.md'] }]
  }));
  writeFile(dir, 'docs/fuente.md', 'v2');
  commit(dir, 'cambio solo fuente');
  const r = runTool(dir, ['--registry', 'registro.json']);
  check('2. Derivado pendiente -> APTO CON REVISION, exit 0 (sin --strict)', r.code === 0 && r.out.includes('APTO CON REVISIÓN'));
}

// 3. Check estático fallido -> NO APTO, exit 2
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/doc.md', 'no tiene el texto');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({
    schema_version: '0.01',
    checks: [{ path: 'docs/doc.md', must_contain: ['TEXTO-OBLIGATORIO'] }]
  }));
  const r = runTool(dir, ['--registry', 'registro.json', '--no-diff']);
  check('3. Check estático fallido -> NO APTO, exit 2', r.code === 2 && r.out.includes('NO APTO'));
}

// 4. --no-diff explícito -> no debe bloquear ni marcarse "indeterminado"
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/doc.md', 'ok');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({ schema_version: '0.01' }));
  const r = runTool(dir, ['--registry', 'registro.json', '--no-diff']);
  check('4. --no-diff explícito -> aviso "desactivado", no "indeterminado"', r.code === 0 && r.out.includes('desactivado (--no-diff)') && !r.out.includes('indeterminado'));
}

// 5. Diff indeterminado (un solo commit, sin padre) -> APTO CON REVISION
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/doc.md', 'unico commit');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({ schema_version: '0.01' }));
  const r = runTool(dir, ['--registry', 'registro.json']);
  check('5. Diff indeterminado -> APTO CON REVISION (no APTO silencioso)', r.code === 0 && r.out.includes('no pudo evaluarse'));
}

// 6. Diff indeterminado + --strict-impact -> bloquea (exit 3)
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/doc.md', 'unico commit');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({ schema_version: '0.01' }));
  const r = runTool(dir, ['--registry', 'registro.json', '--strict-impact']);
  check('6. Diff indeterminado + --strict-impact -> exit 3', r.code === 3);
}

// 7. AJ-2: coincidencia exacta, no debe confundir doc.md con doc.md.bak
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/doc.md', 'v1');
  writeFile(dir, 'docs/doc.md.bak', 'backup');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({
    schema_version: '0.01',
    sync_groups: [{ id: 'G1', title: 'g1', triggers: ['docs/doc.md'], expected_updates: ['docs/doc.md'] }]
  }));
  writeFile(dir, 'docs/doc.md.bak', 'backup modificado'); // solo el .bak cambia
  commit(dir, 'cambio bak');
  const r = runTool(dir, ['--registry', 'registro.json']);
  check('7. AJ-2: cambiar doc.md.bak NO dispara trigger de doc.md', r.code === 0 && r.out.includes('Ningún grupo de sincronización fue activado'));
}

// 8. Carpeta declarada con "/" SÍ actúa como prefijo
{
  const dir = tmpRepo();
  writeFile(dir, 'docs/carpeta/a.md', 'v1');
  writeFile(dir, 'docs/derivado.md', 'v1');
  commit(dir, 'init');
  writeFile(dir, 'registro.json', JSON.stringify({
    schema_version: '0.01',
    sync_groups: [{ id: 'G1', title: 'g1', triggers: ['docs/carpeta/'], expected_updates: ['docs/derivado.md'] }]
  }));
  writeFile(dir, 'docs/carpeta/a.md', 'v2');
  commit(dir, 'cambio dentro de carpeta');
  const r = runTool(dir, ['--registry', 'registro.json']);
  check('8. Trigger de carpeta ("docs/carpeta/") SÍ actúa como prefijo', r.code === 0 && r.out.includes('[G1]'));
}

const bar = '='.repeat(62);
console.log(bar);
console.log('  test_impact_lite — casos de ground-truth para MAD-Impact Lite');
console.log(bar);
let pass = 0;
for (const c of cases) { console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`); if (c.ok) pass++; }
console.log(bar);
console.log(`  Resultado: ${pass}/${cases.length} casos PASS`);
const dod = pass === cases.length;
console.log(`  DoD cumplido: ${dod ? 'SI' : 'NO'}`);
console.log(bar);
process.exit(dod ? 0 : 1);
