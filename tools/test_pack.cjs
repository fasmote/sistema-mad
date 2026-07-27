#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const TOOL = path.join(__dirname, 'mad-pack.cjs');
const results = [];
const test = (name, ok) => results.push({ name, ok: !!ok });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mad-pack-test-'));
function write(dir, rel, content = '') {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}
const config = (dir, obj) => write(dir, 'packs.json', JSON.stringify(obj, null, 2));
function run(args) {
  try {
    return { code: 0, out: execFileSync('node', [TOOL, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}
function basePack(dir, extra = {}, files = ['a.md']) {
  write(dir, 'a.md', 'contenido');
  return config(dir, { P1: { title: 't', files, ...extra } });
}

// Flujo base.
{
  const d = tmp(), p = config(d, { P1: { title: 'Uno', files: [] } });
  let r = run(['--list', '--packs', p]); test('1. list válido', r.code === 0 && r.out.includes('P1'));
  r = run(['--pack', 'NO', '--repo', d, '--packs', p]); test('2. pack inexistente', r.code === 1 && r.out.includes('inexistente'));
  r = run(['--pack', 'P1', '--repo', '/no/existe/jamas', '--packs', p]); test('3. repo inexistente', r.code === 1 && r.out.includes('no existe'));
}
{
  const d = tmp(), p = config(d, { P1: { files: ['falta.md'] } });
  const r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--check']);
  test('4. archivo faltante', r.code === 1 && r.out.includes('Faltantes:   1'));
}
{
  const d = tmp(), p = basePack(d, { visibility: 'private' });
  let r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--check']);
  test('5. private sin permiso', r.code === 1 && r.out.includes('visibility=private'));
  r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--check', '--include-private']);
  test('5b. private con permiso', r.code === 0 && r.out.includes('RESULTADO: OK'));
}
{
  const d = tmp(); write(path.dirname(d), 'fuera.md', 'secreto');
  const p = config(d, { P1: { files: ['../fuera.md'] } });
  const r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--check']);
  test('6. path traversal', r.code === 1 && r.out.includes('Inseguros:   1'));
}
{
  const d = tmp(), outside = tmp(); write(outside, 'secret.md', 'x');
  fs.symlinkSync(outside, path.join(d, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  let p = config(d, { P1: { files: ['link/secret.md'] } });
  let r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--check']);
  test('7. symlink fuera', r.code === 1 && r.out.includes('Inseguros:   1'));

  const inside = path.join(d, 'inside'); write(inside, 'ok.md', 'ok');
  fs.symlinkSync(inside, path.join(d, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  p = config(d, { P1: { files: ['alias/ok.md'] } });
  r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--check']);
  test('7b. symlink dentro', r.code === 0);
}
{
  const d = tmp(), p = basePack(d);
  const r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--check', '--max-chars', '10']);
  test('8. límite sobre Markdown final', r.code === 1 && r.out.includes('supera el límite'));
}
{
  const d = tmp(), p = basePack(d, {}, ['a.md', 'a.md']);
  let r = run(['--pack', 'P1', '--repo', d, '--packs', p]);
  test('9. duplicado literal una vez', r.code === 0 && (r.out.match(/## Archivo \d+:/g) || []).length === 1);
  const out = path.join(d, 'no-existe', 'x.md');
  r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--out', out]);
  test('10. out dir ausente', r.code === 1 && r.out.includes('no existe'));
  r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--out', out, '--create-out-dir']);
  test('11. create out dir', r.code === 0 && fs.existsSync(out));
}

// Flags y modos.
{
  const d = tmp(), p = config(d, { P1: { files: [] } });
  const cases = [
    ['12. flag desconocido', ['--list', '--packs', p, '--inventado'], 'desconocido'],
    ['13. max no numérico', ['--pack', 'P1', '--repo', d, '--packs', p, '--max-chars', 'abc'], 'entero positivo'],
    ['13b. max <= 0', ['--pack', 'P1', '--repo', d, '--packs', p, '--max-chars', '0'], 'entero positivo'],
    ['14. pack sin packs', ['--pack', 'P1', '--repo', d], '--packs es obligatorio'],
    ['20. check sin pack', ['--check'], 'solo son válidos'],
    ['21. list + pack', ['--list', '--pack', 'P1', '--packs', p], 'mutuamente excluyentes'],
    ['22. create dir sin out', ['--pack', 'P1', '--repo', d, '--packs', p, '--create-out-dir'], 'solo es válido'],
    ['23. list + repo', ['--list', '--repo', d, '--packs', p], 'solo son válidos'],
    ['24. out sin pack', ['--out', path.join(d, 'x')], 'solo son válidos'],
    ['25. private flag sin pack', ['--list', '--include-private'], 'solo son válidos'],
    ['27. flag absorbido como valor', ['--pack', '--inventado'], 'flag desconocido'],
    ['28. flag repetido', ['--list', '--packs', p, '--packs', p], 'flag repetido'],
    ['29. packs sin modo', ['--packs', p], 'requiere un modo'],
    ['30. check + out', ['--pack', 'P1', '--repo', d, '--packs', p, '--check', '--out', path.join(d, 'x')], 'incompatibles'],
    ['40. help + operativo', ['--help', '--check'], 'sin otros flags'],
  ];
  for (const [name, args, token] of cases) {
    const r = run(args); test(name, r.code === 1 && r.out.includes(token));
  }
  let r = run([]); test('26. sin args muestra ayuda', r.code === 0 && r.out.includes('Arma paquetes'));
  r = run(['--list']); test('16. list usa ejemplo genérico', r.code === 0 && r.out.includes('EJEMPLO genérico'));
}

// Consistencia y validación de config.
{
  const d = tmp(); write(d, 'vacío.md', ''); write(d, 'normal.md', 'ok');
  const p = config(d, { P1: { files: ['vacío.md', 'normal.md'] } });
  const r = run(['--pack', 'P1', '--repo', d, '--packs', p]);
  test('15. vacío incluido realmente', r.code === 0 && (r.out.match(/## Archivo \d+:/g) || []).length === 2);
}
{
  const d = tmp(); write(d, 'a.md', 'ok');
  const invalid = [
    ['31. visibility fail-closed', { P1: { visibility: 'privte', files: ['a.md'] } }, 'visibility inválida'],
    ['32. raíz no objeto', [], 'objeto JSON'],
    ['33. files no array', { P1: { files: 'a.md' } }, 'files debe ser un array'],
    ['41. ruta absoluta', { P1: { files: [path.join(d, 'a.md')] } }, 'ruta relativa'],
  ];
  for (const [name, obj, token] of invalid) {
    const p = write(d, `${name}.json`, JSON.stringify(obj));
    const r = run(['--list', '--packs', p]); test(name, r.code === 1 && r.out.includes(token));
  }
  const empty = config(d, {});
  const r = run(['--pack', 'toString', '--repo', d, '--packs', empty]);
  test('34. ID heredado no existe', r.code === 1 && r.out.includes('inexistente'));
}
{
  const d = tmp(), p = basePack(d, {}, ['a.md', './a.md']);
  const r = run(['--pack', 'P1', '--repo', d, '--packs', p]);
  test('35. alias de ruta deduplicado', r.code === 0 && (r.out.match(/## Archivo \d+:/g) || []).length === 1);
}
{
  const d = tmp(), c = tmp(); write(d, 'a.md', 'ok');
  const p = config(c, { P1: { title: 'A|B\nC', purpose: 'X|Y', files: ['a.md'] } });
  let r = run(['--pack', 'P1', '--repo', d, '--packs', p]);
  test('36. sin rutas absolutas', r.code === 0 && !r.out.includes(d) && !r.out.includes(c));
  test('39. tabla Markdown escapada', r.code === 0 && r.out.includes('A\\|B<br>C') && r.out.includes('X\\|Y'));

  const source = path.join(d, 'a.md');
  r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--out', source]);
  test('37. no sobrescribe fuente', r.code === 1 && fs.readFileSync(source, 'utf8') === 'ok');
  const original = fs.readFileSync(p, 'utf8');
  r = run(['--pack', 'P1', '--repo', d, '--packs', p, '--out', p]);
  test('38. no sobrescribe config', r.code === 1 && fs.readFileSync(p, 'utf8') === original);
}

const bar = '='.repeat(62);
console.log(bar);
console.log('  test_pack — ground truth MAD-Pack v0.2');
console.log(bar);
let pass = 0;
for (const r of results) { console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`); if (r.ok) pass++; }
console.log(bar);
console.log(`  Resultado: ${pass}/${results.length} casos PASS`);
console.log(`  DoD cumplido: ${pass === results.length ? 'SI' : 'NO'}`);
console.log(bar);
process.exit(pass === results.length ? 0 : 1);
