// director.js — CLI principal del Sistema MAD
// Módulo 1: Entrevista y Generación de Briefing (RF-001 a RF-012)

import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// ── Configuración ──────────────────────────────────────────────────────────────

const API_KEY  = process.env.OPENROUTER_API_KEY;
const MODEL    = process.env.DEFAULT_ORCHESTRATOR_MODEL || 'anthropic/claude-sonnet-4.5';
const BASE_URL = 'https://openrouter.ai/api/v1';

const REQUIRED_FILES = [
  'prompts/orquestador_briefing_v1.md',
  'schemas/briefing.schema.json',
  'config/available_models.json',
  'config/fallback_defaults.json',
];

// ── RF-001: Validación de configuración ───────────────────────────────────────

function validarConfiguracion() {
  const errores = [];
  if (!API_KEY) errores.push('OPENROUTER_API_KEY no está configurada en el .env');
  for (const archivo of REQUIRED_FILES) {
    if (!existsSync(archivo)) errores.push(`Archivo no encontrado: ${archivo}`);
  }
  if (errores.length > 0) {
    console.error('\n❌ ERROR DE CONFIGURACIÓN:');
    errores.forEach(e => console.error('   •', e));
    process.exit(1);
  }
}

// ── RF-001: Health check ──────────────────────────────────────────────────────

async function healthCheck() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${BASE_URL}/auth/key`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.status === 401) {
      console.error('\n❌ API key inválida. Verificá tu OPENROUTER_API_KEY.');
      process.exit(1);
    }
    if (res.status === 402) {
      console.error('\n❌ Sin créditos en OpenRouter. Cargá créditos en openrouter.ai/credits.');
      process.exit(1);
    }
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      console.error('\n❌ Timeout conectando a OpenRouter (>10s). Verificá tu conexión.');
      process.exit(1);
    }
    // Red corporativa con proxy SSL — continúa de todas formas
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function cargarJSON(ruta) {
  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

function logFallo(datos) {
  if (!existsSync('logs')) mkdirSync('logs');
  appendFileSync('logs/fallos_modelos.jsonl', `${new Date().toISOString()} | ${JSON.stringify(datos)}\n`);
}

function sanitizarTexto(texto) {
  let limpio = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (limpio.length > 8000) {
    // No cortar dentro de estructuras JSON abiertas
    let corte = 8000;
    const ultimaLlave = Math.max(limpio.lastIndexOf('{', 8000), limpio.lastIndexOf('[', 8000));
    if (ultimaLlave > 7900) corte = ultimaLlave;
    limpio = limpio.substring(0, corte);
    console.log('\n⚠️  Texto truncado a 8.000 caracteres.');
  }
  return limpio.trim();
}

function extraerJSON(texto) {
  const match = texto.match(/<JSON_OUTPUT>([\s\S]*?)<\/JSON_OUTPUT>/);
  if (match) return JSON.parse(match[1].trim());
  const matchBraces = texto.match(/\{[\s\S]*\}/);
  if (matchBraces) return JSON.parse(matchBraces[0]);
  throw new Error('No se encontró JSON válido en la respuesta');
}

// ── readline ──────────────────────────────────────────────────────────────────

let rl;

function crearRL() {
  rl = createInterface({ input: process.stdin, output: process.stdout });

  // RF-011: Ctrl+C
  let ctrlCCount = 0;
  rl.on('SIGINT', async () => {
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      console.log('\n\n👋 Saliendo.');
      process.exit(130);
    }
    console.log('\n\n⚠️  Presioná Ctrl+C de nuevo para salir, o Enter para continuar.');
  });
}

function preguntar(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function capturarMultilinea(promptInicial) {
  console.log(promptInicial);
  console.log('(Cuando termines, escribí /fin en una línea sola)\n');
  const lineas = [];
  return new Promise((resolve) => {
    const handler = (linea) => {
      if (linea.trim() === '/fin') {
        rl.removeListener('line', handler);
        resolve(lineas.join('\n'));
      } else {
        lineas.push(linea);
      }
    };
    rl.on('line', handler);
    rl.once('close', () => {
      rl.removeListener('line', handler);
      resolve(lineas.join('\n'));
    });
  });
}

// ── Llamada al LLM (RF-007a) ──────────────────────────────────────────────────

async function llamarOrquestador(systemPrompt, inputUsuario, modelConfig) {
  const timeout = modelConfig?.timeout_segundos ?? 45;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/fasmote/sistema-mad',
        'X-Title': 'Sistema MAD'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: inputUsuario  }
        ],
        temperature: 0.3,
        max_tokens: 2000
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;

  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error(`Timeout después de ${timeout}s`);
    throw e;
  }
}

// ── Validación funcional (RF-007b) ───────────────────────────────────────────

function validarFuncionalmente(briefing, dominio) {
  const errores = [];

  if (!briefing.agentes_activados?.some(a => a.id === 'adversarial'))
    errores.push('Falta agente adversarial — es mandatorio (FUNDACIONAL #12)');

  if (dominio === 'salud' && !briefing.agentes_activados?.some(a => a.id === 'stakesim'))
    errores.push('Falta StakeSim — mandatorio en dominio Salud');

  if (!briefing.objetivo?.trim() || briefing.objetivo.trim().length < 10)
    errores.push('El objetivo procesado está vacío o es demasiado corto');

  if (!briefing.alcance?.length)
    errores.push('alcance no puede estar vacío');

  if (!briefing.actores?.length)
    errores.push('actores no puede estar vacío');

  if (!briefing.riesgos_a_explorar?.length)
    errores.push('riesgos_a_explorar no puede estar vacío');

  if ((briefing.agentes_activados?.length ?? 0) < 2)
    errores.push('Se requieren al menos 2 agentes activos');

  return errores;
}

// ── Plan C (RF-007a) ──────────────────────────────────────────────────────────

function generarPlanC(dominio, objetivoRaw, restriccionesRaw, defaults) {
  const briefing = {
    _origin: 'PLAN_C_FALLBACK',
    debate_id: randomUUID(),
    timestamp: new Date().toISOString(),
    dominio,
    objetivo: objetivoRaw.substring(0, 200),
    alcance: ['Por definir con el usuario'],
    fuera_de_alcance: [],
    actores: ['Usuario del sistema'],
    restricciones: restriccionesRaw ? [restriccionesRaw] : [],
    agentes_activados: JSON.parse(JSON.stringify(defaults.agentes_activados)),
    complejidad: defaults.complejidad,
    criterio_de_cierre: JSON.parse(JSON.stringify(defaults.criterio_de_cierre)),
    riesgos_a_explorar: ['Casos no contemplados en el brief inicial'],
    memoria_relevante: []
  };

  if (dominio === 'salud' && !briefing.agentes_activados.some(a => a.id === 'stakesim')) {
    briefing.agentes_activados.push({
      id: 'stakesim',
      modelo: 'anthropic/claude-sonnet-4.5',
      rol: 'Simulador de Stakeholder — usuario real bajo presión'
    });
  }

  return briefing;
}

// ── RF-007: Generar y validar Briefing ────────────────────────────────────────

async function generarBriefing(dominio, objetivoRaw, restriccionesRaw, cantidadRF, systemPrompt, schema, modelos, defaults) {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const validar = ajv.compile(schema);

  const inputUsuario = [
    `Dominio: ${dominio}`,
    `Objetivo: ${objetivoRaw}`,
    `Restricciones: ${restriccionesRaw || 'ninguna'}`,
    `Cantidad aproximada de RF: ${cantidadRF}`,
    `debate_id: ${randomUUID()}`,
    `timestamp: ${new Date().toISOString()}`
  ].join('\n');

  const modelConfig = modelos[MODEL] ?? {};
  let intentos = 0;
  let promptActual = systemPrompt;

  process.stdout.write('\n⏳ Generando Briefing');

  while (intentos < 3) {
    intentos++;
    if (intentos === 2) await new Promise(r => setTimeout(r, 2000));
    if (intentos === 3) await new Promise(r => setTimeout(r, 5000));

    try {
      const texto = await llamarOrquestador(promptActual, inputUsuario, modelConfig);
      process.stdout.write('.');

      const briefing = extraerJSON(texto);
      briefing.debate_id = briefing.debate_id || randomUUID();
      briefing.timestamp = new Date().toISOString();

      if (!validar(briefing)) {
        const motivo = validar.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
        promptActual = systemPrompt + `\n\n[CORRECCIÓN REQUERIDA]: El JSON falló validación: ${motivo}. Corregí esos campos y devolvé el JSON completo entre <JSON_OUTPUT></JSON_OUTPUT>.`;
        logFallo({ intento: intentos, error: 'schema', motivo, modelo: MODEL });
        continue;
      }

      const erroresFuncionales = validarFuncionalmente(briefing, dominio);
      if (erroresFuncionales.length > 0) {
        const motivo = erroresFuncionales.join('; ');
        promptActual = systemPrompt + `\n\n[CORRECCIÓN REQUERIDA]: ${motivo}. Corregí y devolvé el JSON completo entre <JSON_OUTPUT></JSON_OUTPUT>.`;
        logFallo({ intento: intentos, error: 'funcional', motivo, modelo: MODEL });
        continue;
      }

      console.log(' ✅\n');
      return { briefing, degradado: false };

    } catch (e) {
      process.stdout.write('✗');
      logFallo({ intento: intentos, error: e.message, modelo: MODEL });
    }
  }

  console.log('\n⚠️  LLM falló 3 veces — activando Plan C\n');
  const briefingFallback = generarPlanC(dominio, objetivoRaw, restriccionesRaw, defaults);
  const erroresPlanC = validarFuncionalmente(briefingFallback, dominio);
  if (erroresPlanC.length > 0) {
    console.error('❌ Plan C también falló:', erroresPlanC.join('; '));
    process.exit(1);
  }
  return { briefing: briefingFallback, degradado: true };
}

// ── RF-002: Selección de dominio ─────────────────────────────────────────────

async function seleccionarDominio() {
  const dominios = ['salud', 'govtech', 'fintech', 'generico'];
  const nombres  = ['Salud', 'GovTech', 'Fintech', 'Genérico'];

  console.log('¿Cuál es el dominio del debate?');
  nombres.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));

  for (let intento = 0; intento < 3; intento++) {
    const respuesta = (await preguntar('\nDominio (número o nombre): ')).trim().toLowerCase();
    const porNumero = parseInt(respuesta, 10);
    if (porNumero >= 1 && porNumero <= 4) return dominios[porNumero - 1];
    const porNombre = dominios.findIndex(d => d === respuesta || d.startsWith(respuesta));
    if (porNombre !== -1) return dominios[porNombre];
    if (intento < 2) console.log(`  ⚠️  Opción no reconocida. Intentos restantes: ${2 - intento}`);
  }

  console.log('  ℹ️  Se asignó "Genérico" por defecto.');
  return 'generico';
}

// ── RF-005: Cantidad aproximada de RF ────────────────────────────────────────

async function capturarCantidadRF() {
  const respuesta = (await preguntar('\n¿Cuántos RF aproximados esperás? (Enter = no sé): ')).trim().toLowerCase();

  if (!respuesta || respuesta === 'no sé' || respuesta === 'no se') return 15;
  if (respuesta === 'pocos') return 5;
  if (respuesta === 'muchos' || respuesta.includes('100+')) return 50;

  const rango = respuesta.match(/entre\s+(\d+)\s+[ye]\s+(\d+)/);
  if (rango) return Math.round((parseInt(rango[1]) + parseInt(rango[2])) / 2);

  const numero = parseInt(respuesta, 10);
  return (!isNaN(numero) && numero > 0) ? numero : 15;
}

// ── RF-008: Mostrar resumen del Briefing ─────────────────────────────────────

function mostrarResumenBriefing(briefing, degradado) {
  console.log('\n' + '═'.repeat(52));
  console.log('  BRIEFING TÉCNICO');
  console.log('═'.repeat(52));

  if (degradado) {
    console.log('\n⚠️  Generado por Plan C (fallback). El LLM no respondió.');
    console.log('   Revisá los parámetros antes de continuar.\n');
  }

  console.log(`Dominio:      ${briefing.dominio}`);
  console.log(`Complejidad:  ${briefing.complejidad}`);
  console.log(`\nObjetivo:\n  ${briefing.objetivo}`);
  console.log(`\nAlcance:`);
  briefing.alcance.forEach(a => console.log(`  • ${a}`));
  if (briefing.fuera_de_alcance?.length) {
    console.log(`\nFuera de alcance:`);
    briefing.fuera_de_alcance.forEach(a => console.log(`  • ${a}`));
  }
  console.log(`\nActores:`);
  briefing.actores.forEach(a => console.log(`  • ${a}`));
  if (briefing.restricciones?.length) {
    console.log(`\nRestricciones:`);
    briefing.restricciones.forEach(r => console.log(`  • ${r}`));
  }
  console.log(`\nAgentes activados:`);
  briefing.agentes_activados.forEach(a => console.log(`  • [${a.id}] ${a.rol}`));
  console.log(`\nRiesgos a explorar:`);
  briefing.riesgos_a_explorar.forEach(r => console.log(`  • ${r}`));
  console.log(`\nCriterio de cierre:`);
  console.log(`  DoD mínimo: ${briefing.criterio_de_cierre.dod_minimo}%`);
  console.log(`  Máx. rondas: ${briefing.criterio_de_cierre.max_rondas}`);
  console.log(`  Costo máx.:  $${briefing.criterio_de_cierre.max_costo_usd} USD`);
  console.log('═'.repeat(52));
}

// ── RF-009: Ajustar parámetros ────────────────────────────────────────────────

async function ajustarParametros(briefing) {
  const protegidos = new Set(['adversarial']);
  if (briefing.dominio === 'salud') protegidos.add('stakesim');

  for (let ciclo = 0; ciclo < 5; ciclo++) {
    console.log('\n¿Qué querés ajustar?');
    console.log('  1. Agregar agente');
    console.log('  2. Quitar agente');
    console.log('  3. Cambiar máx. rondas');
    console.log('  4. Cambiar costo máximo');
    console.log('  5. Listo, continuar');

    const opcion = (await preguntar('\nOpción: ')).trim();

    if (opcion === '5' || opcion === '') break;

    if (opcion === '1') {
      const id     = (await preguntar('  ID del agente: ')).trim().toLowerCase();
      const modelo = (await preguntar('  Modelo (ej: openai/gpt-4o): ')).trim();
      const rol    = (await preguntar('  Rol: ')).trim();
      if (id && modelo && rol) {
        briefing.agentes_activados.push({ id, modelo, rol });
        console.log(`  ✅ Agente "${id}" agregado.`);
      }
    } else if (opcion === '2') {
      console.log('  Agentes actuales:');
      briefing.agentes_activados.forEach((a, i) => console.log(`    ${i + 1}. [${a.id}] ${a.rol}`));
      const idx = parseInt(await preguntar('  Número a quitar: '), 10) - 1;
      if (idx >= 0 && idx < briefing.agentes_activados.length) {
        const agente = briefing.agentes_activados[idx];
        if (protegidos.has(agente.id)) {
          console.log(`  ❌ No se puede quitar "${agente.id}" — es mandatorio.`);
        } else if (briefing.agentes_activados.length <= 2) {
          console.log('  ❌ Se requieren mínimo 2 agentes.');
        } else {
          briefing.agentes_activados.splice(idx, 1);
          console.log(`  ✅ Agente "${agente.id}" quitado.`);
        }
      }
    } else if (opcion === '3') {
      const valor = parseInt(await preguntar('  Máx. rondas (2, 4, 6 u 8): '), 10);
      if ([2, 4, 6, 8].includes(valor)) {
        briefing.criterio_de_cierre.max_rondas = valor;
        console.log(`  ✅ Máx. rondas → ${valor}`);
      } else {
        console.log('  ❌ Debe ser 2, 4, 6 u 8.');
      }
    } else if (opcion === '4') {
      const valor = parseFloat(await preguntar('  Costo máximo en USD (máx. 5.00): '));
      if (!isNaN(valor) && valor > 0 && valor <= 5.00) {
        briefing.criterio_de_cierre.max_costo_usd = valor;
        console.log(`  ✅ Costo máximo → $${valor}`);
      } else {
        console.log('  ❌ Valor inválido (debe ser entre 0 y 5.00).');
      }
    }
  }

  return briefing;
}

// ── RF-010: Crear estructura del debate ──────────────────────────────────────

function crearEstructuraDebate(briefing) {
  const dir = `debates/${briefing.debate_id}`;
  mkdirSync(`${dir}/decision_records`, { recursive: true });
  mkdirSync(`${dir}/documento_vivo`,   { recursive: true });

  writeFileSync(`${dir}/briefing.json`, JSON.stringify(briefing, null, 2));

  const checkpoint = {
    debate_id: briefing.debate_id,
    estado: 'INICIADO',
    ronda_actual: 0,
    timestamp_inicio: new Date().toISOString(),
    modelo_orquestador: MODEL
  };
  writeFileSync(`${dir}/orquestador_checkpoint.json`, JSON.stringify(checkpoint, null, 2));

  const primerEvento = {
    timestamp: new Date().toISOString(),
    tipo: 'DEBATE_INICIADO',
    debate_id: briefing.debate_id,
    dominio: briefing.dominio,
    agentes: briefing.agentes_activados.map(a => a.id)
  };
  writeFileSync(`${dir}/debate_log.jsonl`, JSON.stringify(primerEvento) + '\n');

  // Commit del briefing como último paso
  try {
    execSync(`git add ${dir}/briefing.json`, { stdio: 'ignore' });
    execSync(`git commit -m "debate: iniciar ${briefing.debate_id} [${briefing.dominio}]"`, { stdio: 'ignore' });
  } catch (_) {
    // Git no disponible o nada para commitear — no es fatal
  }

  return dir;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Sistema MAD — Motor de Debate Multi-Agente    ║');
  console.log('║   Módulo 1: Entrevista y Generación de Briefing ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  validarConfiguracion();
  await healthCheck();
  crearRL();

  const systemPrompt = readFileSync('prompts/orquestador_briefing_v1.md', 'utf-8');
  const schema       = cargarJSON('schemas/briefing.schema.json');
  const modelos      = cargarJSON('config/available_models.json');
  const defaults     = cargarJSON('config/fallback_defaults.json');

  // RF-002: Dominio
  const dominio = await seleccionarDominio();
  console.log(`  ✅ Dominio seleccionado: ${dominio}\n`);

  // RF-003: Objetivo
  const objetivoRaw = sanitizarTexto(
    await capturarMultilinea('\n📝 Describí el objetivo del debate.')
  );
  if (objetivoRaw.replace(/\s/g, '').length < 10) {
    console.error('\n❌ El objetivo es demasiado corto (mínimo 10 caracteres no blancos).');
    process.exit(1);
  }

  // RF-004: Restricciones
  let restriccionesRaw = '';
  const tieneRestricciones = (await preguntar('\n¿Tenés restricciones obligatorias? (s/n): ')).trim().toLowerCase();
  if (tieneRestricciones === 's' || tieneRestricciones === 'si' || tieneRestricciones === 'sí') {
    restriccionesRaw = sanitizarTexto(
      await capturarMultilinea('\n📋 Describí las restricciones.')
    );
  }

  // RF-005: Cantidad de RF
  const cantidadRF = await capturarCantidadRF();

  // RF-007: Generar y validar Briefing
  const { briefing, degradado } = await generarBriefing(
    dominio, objetivoRaw, restriccionesRaw, cantidadRF,
    systemPrompt, schema, modelos, defaults
  );

  // RF-008: Mostrar resumen + menú
  for (;;) {
    mostrarResumenBriefing(briefing, degradado);
    console.log('\n¿Qué querés hacer?');
    console.log('  1. Iniciar debate');
    console.log('  2. Ajustar parámetros');
    console.log('  3. Cancelar');

    const accion = (await preguntar('\nOpción: ')).trim();

    if (accion === '3') {
      console.log('\n👋 Debate cancelado.');
      rl.close();
      process.exit(0);
    }

    if (accion === '2') {
      await ajustarParametros(briefing);
      continue;
    }

    if (accion === '1') break;
  }

  // RF-010: Crear estructura y commitear
  const dir = crearEstructuraDebate(briefing);

  console.log(`\n✅ Debate iniciado.`);
  console.log(`   ID:      ${briefing.debate_id}`);
  console.log(`   Carpeta: ${dir}/`);
  console.log('\n🚀 Módulo 1 completado. Briefing listo para el Módulo 2.\n');

  rl.close();
}

process.on('uncaughtException', (e) => {
  logFallo({ tipo: 'uncaughtException', error: e.message });
  console.error('\n❌ Error inesperado:', e.message);
  process.exit(1);
});

process.on('SIGTERM', () => process.exit(0));

main().catch(e => {
  console.error('\n❌ Error fatal:', e.message);
  process.exit(1);
});
