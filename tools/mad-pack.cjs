#!/usr/bin/env node
'use strict';

// MAD-Pack v0.2 — arma paquetes mínimos de contexto para IA.
// El motor vive en sistema-mad; la configuración real vive en el repo cliente.
// --packs es obligatorio con --pack. --list sin --packs usa solo el ejemplo genérico.

const fs = require('fs');
const path = require('path');

const CONFIG = {
  EXAMPLE_PACKS_FILE: path.join(__dirname, '..', 'docs', 'examples', 'context-packs-example.json'),
  ZONA: 'America/Argentina/Buenos_Aires',
};
const KNOWN_FLAGS = new Set([
  '--list', '--check', '--include-private', '--create-out-dir', '--help', '-h',
  '--pack', '--repo', '--packs', '--out', '--max-chars',
]);
const ARRAY_FIELDS = ['files', 'rules', 'must_not_reopen', 'expected_output'];
const VISIBILITIES = new Set(['public', 'internal', 'private']);

function fail(message, code = 1) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function fechaART() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CONFIG.ZONA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day} ${v.hour}:${v.minute} ART`;
}

function parseArgs(argv) {
  const args = {
    list: false, pack: null, repo: null, packs: null, out: null, check: false,
    maxChars: null, includePrivate: false, createOutDir: false, help: false,
    _provided: new Set(),
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('-')) fail(`argumento inesperado, no es un flag: "${flag}"`);
    if (!KNOWN_FLAGS.has(flag)) fail(`flag desconocido: "${flag}"`);

    const canonical = flag === '-h' ? '--help' : flag;
    if (args._provided.has(canonical)) fail(`flag repetido: "${flag}"`);
    args._provided.add(canonical);

    if (flag === '--list') { args.list = true; continue; }
    if (flag === '--check') { args.check = true; continue; }
    if (flag === '--include-private') { args.includePrivate = true; continue; }
    if (flag === '--create-out-dir') { args.createOutDir = true; continue; }
    if (flag === '--help' || flag === '-h') { args.help = true; continue; }

    const value = argv[i + 1];
    if (value === undefined) fail(`el flag "${flag}" requiere un valor`);
    if (value.startsWith('-')) {
      if (KNOWN_FLAGS.has(value)) fail(`el flag "${flag}" requiere un valor antes de "${value}"`);
      fail(`flag desconocido: "${value}"`);
    }
    i++;

    if (flag === '--pack') args.pack = value;
    else if (flag === '--repo') args.repo = value;
    else if (flag === '--packs') args.packs = value;
    else if (flag === '--out') args.out = value;
    else if (flag === '--max-chars') {
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) fail(`--max-chars debe ser un entero positivo; recibido: "${value}"`);
      args.maxChars = n;
    }
  }
  return args;
}

function validateCombinations(args) {
  const provided = args._provided || new Set();
  if (args.help && provided.size > 1) fail('--help / -h debe usarse sin otros flags para evitar argumentos ignorados.');
  if (args.list && args.pack) fail('--list y --pack son modos mutuamente excluyentes.');

  const packOnly = [];
  if (args.check) packOnly.push('--check');
  if (args.repo) packOnly.push('--repo');
  if (args.out) packOnly.push('--out');
  if (args.maxChars !== null) packOnly.push('--max-chars');
  if (args.includePrivate) packOnly.push('--include-private');
  if (args.createOutDir) packOnly.push('--create-out-dir');
  if (!args.pack && packOnly.length) fail(`estos flags solo son válidos junto con --pack: ${packOnly.join(', ')}`);

  if (args.createOutDir && !args.out) fail('--create-out-dir solo es válido junto con --out.');
  if (args.check && args.out) fail('--check y --out son incompatibles: --check valida sin generar archivos.');
  if (!args.list && !args.pack && args.packs) fail('--packs requiere un modo: usá --list o --pack <ID>.');
  if (args.pack && !args.repo) fail('--repo es obligatorio para operar con --pack.');
  if (args.pack && !args.packs) fail('--packs es obligatorio para operar con un pack real.');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePacksConfig(raw, sourcePath = '(config)') {
  if (!isPlainObject(raw)) fail(`la configuración de packs debe ser un objeto JSON: ${sourcePath}`);
  const result = Object.create(null);

  for (const [id, original] of Object.entries(raw)) {
    if (!id.trim() || /[\0\r\n]/.test(id)) fail(`ID de pack inválido: ${JSON.stringify(id)}`);
    if (!isPlainObject(original)) fail(`el pack "${id}" debe ser un objeto JSON`);

    const pack = { ...original };
    if (pack.title !== undefined && typeof pack.title !== 'string') fail(`pack ${id}: title debe ser texto`);
    if (pack.purpose !== undefined && typeof pack.purpose !== 'string') fail(`pack ${id}: purpose debe ser texto`);

    pack.visibility = pack.visibility === undefined ? 'internal' : pack.visibility;
    if (!VISIBILITIES.has(pack.visibility)) {
      fail(`pack ${id}: visibility inválida "${pack.visibility}"; use public, internal o private`);
    }
    if (pack.max_chars_recomendado !== undefined &&
        (!Number.isInteger(pack.max_chars_recomendado) || pack.max_chars_recomendado <= 0)) {
      fail(`pack ${id}: max_chars_recomendado debe ser un entero positivo`);
    }

    for (const field of ARRAY_FIELDS) {
      if (pack[field] === undefined) pack[field] = [];
      if (!Array.isArray(pack[field])) fail(`pack ${id}: ${field} debe ser un array`);
      pack[field].forEach((value, index) => {
        if (typeof value !== 'string') fail(`pack ${id}: ${field}[${index}] debe ser texto`);
      });
    }

    pack.files.forEach((file, index) => {
      if (!file.trim()) fail(`pack ${id}: files[${index}] no puede estar vacío`);
      if (/[\0\r\n]/.test(file)) fail(`pack ${id}: files[${index}] contiene caracteres de control`);
      if (path.isAbsolute(file)) fail(`pack ${id}: files[${index}] debe ser una ruta relativa al --repo: ${file}`);
    });
    result[id] = pack;
  }
  return result;
}

function loadPacksConfig(file) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) fail(`no se encontró el archivo de packs:\n  ${absolute}`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { fail(`no se pudo parsear el archivo de packs:\n  ${absolute}\n  ${error.message}`); }
  return validatePacksConfig(raw, absolute);
}

function resolveRepo(repoArg) {
  const absolute = path.resolve(repoArg);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    fail(`el repo objetivo no existe o no es una carpeta:\n  ${absolute}`);
  }
  return absolute;
}

function pathIdentity(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function resolveSafeFile(file, repoBase, repoRealBase) {
  if (typeof file !== 'string' || path.isAbsolute(file)) return { safe: false };
  const resolved = path.resolve(repoBase, file);
  if (resolved !== repoBase && !resolved.startsWith(repoBase + path.sep)) return { safe: false, resolved };
  if (!fs.existsSync(resolved)) return { safe: true, exists: false, resolved };

  let real;
  try { real = fs.realpathSync(resolved); }
  catch (_) { return { safe: false, resolved }; }
  if (real !== repoRealBase && !real.startsWith(repoRealBase + path.sep)) return { safe: false, resolved, real };
  return { safe: true, exists: true, resolved, real };
}

function isPathSafe(file, repoBase, repoRealBase = fs.realpathSync(repoBase)) {
  return resolveSafeFile(file, repoBase, repoRealBase).safe;
}

function validateFiles(pack, repoBase) {
  const out = { ok: [], faltantes: [], vacios: [], duplicados: [], inseguros: [] };
  const repoRealBase = fs.realpathSync(repoBase);
  const seenResolved = new Set();
  const seenReal = new Set();

  for (const file of pack.files) {
    const info = resolveSafeFile(file, repoBase, repoRealBase);
    if (!info.safe) { out.inseguros.push(file); continue; }

    const resolvedKey = pathIdentity(info.resolved);
    if (seenResolved.has(resolvedKey)) { out.duplicados.push(file); continue; }
    seenResolved.add(resolvedKey);

    if (!info.exists || !fs.statSync(info.resolved).isFile()) { out.faltantes.push(file); continue; }
    const realKey = pathIdentity(info.real);
    if (seenReal.has(realKey)) { out.duplicados.push(file); continue; }
    seenReal.add(realKey);

    const content = fs.readFileSync(info.resolved, 'utf8');
    if (!content.trim()) out.vacios.push(file);
    out.ok.push(file);
  }
  return out;
}

function cmdList(config, example) {
  console.log('='.repeat(68));
  console.log('  MAD-Pack v0.2 — Packs disponibles');
  if (example) console.log('  EJEMPLO genérico del motor; use --packs para una configuración real.');
  console.log('='.repeat(68));
  for (const [id, pack] of Object.entries(config)) {
    console.log(`\n  ${id}`);
    console.log(`    Título:     ${pack.title || '(sin título)'}`);
    console.log(`    Propósito:  ${(pack.purpose || '').slice(0, 72)}`);
    console.log(`    Visibility: ${pack.visibility}`);
    console.log(`    Archivos:   ${pack.files.length}`);
    if (pack.max_chars_recomendado) console.log(`    Límite rec: ${pack.max_chars_recomendado.toLocaleString()} chars`);
  }
  if (!Object.keys(config).length) console.log('\n  (no hay packs definidos)');
  console.log('\n' + '='.repeat(68));
}

function escapeTableCell(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function displayConfigPath(packsFile, repoBase) {
  const absolute = path.resolve(packsFile);
  const relative = path.relative(repoBase, absolute);
  return relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : path.basename(absolute);
}

function buildMarkdown(packId, pack, repoBase, files, packsFile) {
  const contents = files.map(file => ({ file, content: fs.readFileSync(path.resolve(repoBase, file), 'utf8') }));
  const title = String(pack.title || packId).replace(/\r?\n/g, ' ').trim();
  const lines = [
    `# MAD Context Pack — ${title}`, '', '| Campo | Valor |', '|---|---|',
    `| **Pack** | \`${escapeTableCell(packId).replace(/`/g, '\\`')}\` |`,
    `| **Título** | ${escapeTableCell(pack.title || '—')} |`,
    `| **Propósito** | ${escapeTableCell(pack.purpose || '—')} |`,
    `| **Fecha/hora** | ${fechaART()} |`,
    `| **Repo objetivo** | \`${escapeTableCell(path.basename(repoBase) || '.')}\` |`,
    `| **Packs config** | \`${escapeTableCell(displayConfigPath(packsFile, repoBase))}\` |`,
    `| **Visibility** | ${pack.visibility} |`,
    `| **Archivos incluidos** | ${contents.length} |`, '',
  ];

  const addList = (heading, values) => {
    if (!values.length) return;
    lines.push(`## ${heading}`, '', ...values.map(value => `- ${value.replace(/\r?\n/g, '\n  ')}`), '');
  };
  addList('Reglas para la IA', pack.rules);
  addList('Qué NO debe reabrir', pack.must_not_reopen);
  addList('Resultado esperado', pack.expected_output);

  contents.forEach(({ file, content }, index) => {
    lines.push('---', '', `## Archivo ${index + 1}: ${file}`, '', content.trimEnd(), '');
  });
  const output = lines.join('\n');
  return { output, totalChars: output.length };
}

function ensurePrivateAllowed(pack, args) {
  if (pack.visibility === 'private' && !args.includePrivate) {
    fail('pack con visibility=private; use --include-private');
  }
}

function cmdCheck(packId, pack, repoBase, args, packsFile) {
  ensurePrivateAllowed(pack, args);
  const v = validateFiles(pack, repoBase);
  const { totalChars } = buildMarkdown(packId, pack, repoBase, v.ok, packsFile);
  const limit = args.maxChars || pack.max_chars_recomendado || null;
  const failures = [];
  if (v.faltantes.length) failures.push('archivos faltantes');
  if (v.inseguros.length) failures.push('rutas inseguras');
  if (limit && totalChars > limit) failures.push('supera el límite');

  console.log('='.repeat(68));
  console.log('  MAD-PACK CHECK');
  console.log(`  Pack:        ${packId}`);
  console.log(`  Repo:        ${repoBase}`);
  console.log(`  Archivos declarados: ${pack.files.length}`);
  console.log(`  OK:          ${v.ok.length}`);
  console.log(`  Faltantes:   ${v.faltantes.length}`);
  console.log(`  Vacíos:      ${v.vacios.length}`);
  console.log(`  Duplicados:  ${v.duplicados.length}`);
  console.log(`  Inseguros:   ${v.inseguros.length}`);
  console.log(`  Tamaño real (Markdown final): ${totalChars.toLocaleString()} chars`);
  console.log(`  Límite:      ${limit ? limit.toLocaleString() + ' chars' : 'sin límite'}`);
  v.faltantes.forEach(file => console.log(`  FALTA: ${file}`));
  v.inseguros.forEach(file => console.log(`  INSEGURO: ${file}`));
  v.vacios.forEach(file => console.log(`  AVISO vacío incluido: ${file}`));
  v.duplicados.forEach(file => console.log(`  AVISO duplicado omitido: ${file}`));
  console.log(`  RESULTADO: ${failures.length ? 'FAIL' : 'OK'}`);
  failures.forEach(reason => console.log(`  Motivo: ${reason}`));
  console.log('='.repeat(68));
  process.exit(failures.length ? 1 : 0);
}

function canonicalPotentialPath(filePath) {
  const absolute = path.resolve(filePath);
  if (fs.existsSync(absolute)) return pathIdentity(fs.realpathSync(absolute));
  let parent = path.dirname(absolute);
  while (!fs.existsSync(parent)) {
    const next = path.dirname(parent);
    if (next === parent) return pathIdentity(absolute);
    parent = next;
  }
  return pathIdentity(path.join(fs.realpathSync(parent), path.relative(parent, absolute)));
}

function cmdGenerate(packId, pack, repoBase, args, packsFile) {
  ensurePrivateAllowed(pack, args);
  const v = validateFiles(pack, repoBase);
  if (v.inseguros.length) fail(`rutas inseguras: ${v.inseguros.join(', ')}`);
  if (v.faltantes.length) fail(`archivos faltantes: ${v.faltantes.join(', ')}`);
  v.vacios.forEach(file => console.warn(`AVISO: archivo vacío incluido: ${file}`));
  v.duplicados.forEach(file => console.warn(`AVISO: archivo duplicado omitido: ${file}`));

  const { output, totalChars } = buildMarkdown(packId, pack, repoBase, v.ok, packsFile);
  const limit = args.maxChars || pack.max_chars_recomendado || null;
  if (limit && totalChars > limit) fail(`el pack supera el límite (${totalChars} > ${limit})`);

  if (!args.out) { process.stdout.write(output + '\n'); return; }
  const outPath = path.resolve(args.out);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    if (!args.createOutDir) fail(`la carpeta de salida no existe:\n  ${outDir}\nUse --create-out-dir para crearla.`);
    try { fs.mkdirSync(outDir, { recursive: true }); }
    catch (error) { fail(`no se pudo crear la carpeta de salida: ${error.message}`); }
  }

  const protectedPaths = [
    ...v.ok.map(file => pathIdentity(fs.realpathSync(path.resolve(repoBase, file)))),
    pathIdentity(fs.realpathSync(path.resolve(packsFile))),
  ];
  if (protectedPaths.includes(canonicalPotentialPath(outPath))) {
    fail(`la salida colisiona con un archivo fuente o con la configuración de packs:\n  ${outPath}`);
  }
  try { fs.writeFileSync(outPath, output, 'utf8'); }
  catch (error) { fail(`no se pudo escribir la salida:\n  ${outPath}\n  ${error.message}`); }

  console.log(`MAD-Pack v0.2: ${packId} generado en ${outPath} (${totalChars} chars)`);
}

function printHelp() {
  console.log(`MAD-Pack v0.2 — Arma paquetes de contexto para IA

Uso:
  node tools/mad-pack.cjs --list [--packs archivo.json]
  node tools/mad-pack.cjs --pack ID --repo ../repo --packs ../repo/config/context-packs.json --check
  node tools/mad-pack.cjs --pack ID --repo ../repo --packs ../repo/config/context-packs.json [--out salida.md]

Flags: --list --pack --repo --packs --check --out --max-chars
       --include-private --create-out-dir --help`);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._provided.size) { printHelp(); process.exit(0); }
  validateCombinations(args);
  if (args.help) { printHelp(); process.exit(0); }

  const usingExample = args.list && !args.packs;
  const packsFile = args.packs || CONFIG.EXAMPLE_PACKS_FILE;
  const config = loadPacksConfig(packsFile);
  if (args.list) { cmdList(config, usingExample); process.exit(0); }
  if (!Object.hasOwn(config, args.pack)) {
    console.error(`ERROR: pack inexistente: ${args.pack}`);
    console.error(`Packs disponibles: ${Object.keys(config).join(', ') || '(ninguno)'}`);
    process.exit(1);
  }

  const pack = config[args.pack];
  const repoBase = resolveRepo(args.repo);
  if (args.check) cmdCheck(args.pack, pack, repoBase, args, packsFile);
  else cmdGenerate(args.pack, pack, repoBase, args, packsFile);
}

module.exports = {
  parseArgs, validateCombinations, loadPacksConfig, validatePacksConfig,
  validateFiles, buildMarkdown, isPathSafe, fechaART,
};
