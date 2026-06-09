// test_briefing.js — Runner de validación del Módulo 1
// Sistema MAD — Motor de Debate Multi-Agente
// Producido por Qwen Max, adaptado por Claude 3.7 (Orquestador)

import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { randomUUID } from 'crypto';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// ── Configuración ──────────────────────────────────────────────────────────────

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL   = process.env.DEFAULT_ORCHESTRATOR_MODEL || 'anthropic/claude-sonnet-4.5';
const BASE_URL = 'https://openrouter.ai/api/v1';

// ── Validación de archivos al inicio (D-EXP-8) ───────────────────────────────

const REQUIRED_FILES = [
  'prompts/orquestador_briefing_v1.md',
  'schemas/briefing.schema.json',
  'config/available_models.json',
  'config/fallback_defaults.json',
];

function validarConfiguracion() {
  const errores = [];
  if (!API_KEY) errores.push('OPENROUTER_API_KEY no está configurada en el .env');
  for (const archivo of REQUIRED_FILES) {
    if (!existsSync(archivo)) errores.push(`Archivo no encontrado: ${archivo}`);
  }
  if (errores.length > 0) {
    console.error('\n❌ ERROR DE CONFIGURACIÓN:');
    errores.forEach(e => console.error('   •', e));
    console.error('\nVerificá que el .env esté completo y todos los archivos estén en su lugar.');
    process.exit(1);
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function cargarJSON(ruta) {
  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

function log(mensaje) {
  const ts = new Date().toISOString();
  const linea = `${ts} | ${mensaje}\n`;
  if (!existsSync('logs')) mkdirSync('logs');
  appendFileSync('logs/fallos_modelos.jsonl', linea);
}

function extraerJSON(texto) {
  // Busca entre marcas <JSON_OUTPUT> primero (D-R4-2)
  const match = texto.match(/<JSON_OUTPUT>([\s\S]*?)<\/JSON_OUTPUT>/);
  if (match) return JSON.parse(match[1].trim());
  // Fallback: primer objeto JSON en el texto
  const matchBraces = texto.match(/\{[\s\S]*\}/);
  if (matchBraces) return JSON.parse(matchBraces[0]);
  throw new Error('No se encontró JSON válido en la respuesta');
}

// ── Llamada al Orquestador IA ────────────────────────────────────────────────

async function llamarOrquestador(systemPrompt, inputUsuario, modelConfig) {
  const timeout = modelConfig?.timeout_segundos ?? 30;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/sistema-mad',
        'X-Title': 'Sistema MAD'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },   // instrucciones
          { role: 'user',   content: inputUsuario  }   // input aislado (D-R4-1)
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

// ── Validación funcional (D-R7-8) ───────────────────────────────────────────

function validarFuncionalmente(briefing, dominio) {
  const errores = [];

  if (!briefing.agentes_activados?.some(a => a.id === 'adversarial'))
    errores.push('Falta agente adversarial — es mandatorio (FUNDACIONAL #12)');

  if (dominio === 'salud' && !briefing.agentes_activados?.some(a => a.id === 'stakesim'))
    errores.push('Falta StakeSim — mandatorio en dominio Salud');

  if (!briefing.objetivo?.trim() || briefing.objetivo.trim().length < 10)
    errores.push('El objetivo procesado está vacío o es demasiado corto');

  if (!briefing.alcance?.length)
    errores.push('alcance no puede estar vacío (minItems: 1)');

  if (!briefing.actores?.length)
    errores.push('actores no puede estar vacío (minItems: 1)');

  if (!briefing.riesgos_a_explorar?.length)
    errores.push('riesgos_a_explorar no puede estar vacío (minItems: 1)');

  if ((briefing.agentes_activados?.length ?? 0) < 2)
    errores.push('Se requieren al menos 2 agentes activos');

  return errores;
}

// ── Plan C — Briefing esqueleto (D-R5-5, D-EXP-1) ───────────────────────────

function generarPlanC(caso, defaults) {
  const briefing = {
    _origin: 'PLAN_C_FALLBACK',
    debate_id: randomUUID(),
    timestamp: new Date().toISOString(),
    dominio: caso.input.dominio,
    objetivo: caso.input.objetivo_raw.substring(0, 200),
    alcance: ['Por definir con el usuario'],
    fuera_de_alcance: [],
    actores: ['Usuario del sistema'],
    restricciones: caso.input.restricciones_raw
      ? [caso.input.restricciones_raw] : [],
    agentes_activados: JSON.parse(JSON.stringify(defaults.agentes_activados)),
    complejidad: defaults.complejidad,
    criterio_de_cierre: JSON.parse(JSON.stringify(defaults.criterio_de_cierre)),
    riesgos_a_explorar: ['Casos no contemplados en el brief inicial'],
    memoria_relevante: []
  };

  // D-EXP-1: Si dominio es salud, agregar stakesim
  if (caso.input.dominio === 'salud' &&
      !briefing.agentes_activados.some(a => a.id === 'stakesim')) {
    briefing.agentes_activados.push({
      id: 'stakesim',
      modelo: 'anthropic/claude-3-5-sonnet',
      rol: 'Simulador de Stakeholder — usuario real bajo presión'
    });
  }

  return briefing;
}

// ── Ejecutar un caso ─────────────────────────────────────────────────────────

async function ejecutarCaso(caso, systemPrompt, schema, modelos, defaults) {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const validar = ajv.compile(schema);

  const inputUsuario = [
    `Dominio: ${caso.input.dominio}`,
    `Objetivo: ${caso.input.objetivo_raw}`,
    `Restricciones: ${caso.input.restricciones_raw || 'ninguna'}`,
    `Cantidad aproximada de RF: ${caso.input.cantidad_aprox || 'no especificada'}`,
    `debate_id: ${randomUUID()}`,
    `timestamp: ${new Date().toISOString()}`
  ].join('\n');

  const modelConfig = modelos[MODEL] ?? {};
  let intentos = 0;
  let promptActual = systemPrompt;

  while (intentos < 3) {
    intentos++;
    const espera = intentos === 2 ? 2000 : intentos === 3 ? 5000 : 0;
    if (espera > 0) await new Promise(r => setTimeout(r, espera));

    try {
      const texto = await llamarOrquestador(promptActual, inputUsuario, modelConfig);
      const briefing = extraerJSON(texto);
      briefing.debate_id = briefing.debate_id || randomUUID();
      briefing.timestamp = new Date().toISOString(); // siempre por Node.js (D-R4-9)

      const schemaOk = validar(briefing);
      if (!schemaOk) {
        const motivo = validar.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
        promptActual = systemPrompt + `\n\n[CORRECCIÓN REQUERIDA]: El JSON anterior falló porque: ${motivo}. Corregí solo esos campos y devolvé el JSON completo entre marcas <JSON_OUTPUT></JSON_OUTPUT>.`;
        log(JSON.stringify({ intento: intentos, error: 'schema', motivo, caso: caso.id }));
        continue;
      }

      const erroresFuncionales = validarFuncionalmente(briefing, caso.input.dominio);
      if (erroresFuncionales.length > 0) {
        const motivo = erroresFuncionales.join('; ');
        promptActual = systemPrompt + `\n\n[CORRECCIÓN REQUERIDA]: ${motivo}. Corregí y devolvé el JSON completo entre marcas <JSON_OUTPUT></JSON_OUTPUT>.`;
        log(JSON.stringify({ intento: intentos, error: 'funcional', motivo, caso: caso.id }));
        continue;
      }

      return { estado: 'PASA', briefing, intentos };

    } catch (e) {
      log(JSON.stringify({ intento: intentos, error: e.message, caso: caso.id, modelo: MODEL }));
      if (intentos === 3) break;
    }
  }

  // Plan C
  console.log('     ⚠️  LLM falló 3 veces — activando Plan C');
  const briefingFallback = generarPlanC(caso, defaults);
  const erroresPlanC = validarFuncionalmente(briefingFallback, caso.input.dominio);
  if (erroresPlanC.length > 0) {
    return { estado: 'FALLA', error: `Plan C falló validación: ${erroresPlanC.join('; ')}` };
  }
  return { estado: 'PASA_CON_DEGRADACION', briefing: briefingFallback, intentos };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║     Sistema MAD — Test Briefing v0.3      ║');
  console.log('╚════════════════════════════════════════════╝\n');

  validarConfiguracion();

  const systemPrompt = readFileSync('prompts/orquestador_briefing_v1.md', 'utf-8');
  const schema       = cargarJSON('schemas/briefing.schema.json');
  const modelos      = cargarJSON('config/available_models.json');
  const defaults     = cargarJSON('config/fallback_defaults.json');

  const casos = [
    'CASO_01_ABM_SIMPLE.json',
    'CASO_02_PERMISOS_ROLES.json',
    'CASO_03_INTEGRACION_EXTERNA.json',
    'CASO_04_ESTADOS_COMPLEJOS.json',
    'CASO_05_SALUD_CLINICO.json',
  ];

  const resultados = [];

  for (const archivo of casos) {
    const ruta = `ground_truth/${archivo}`;
    if (!existsSync(ruta)) {
      console.log(`⚠️  ${archivo} no encontrado — omitiendo`);
      continue;
    }

    const caso = cargarJSON(ruta);
    console.log(`🧪 Ejecutando: ${archivo}`);

    const resultado = await ejecutarCaso(caso, systemPrompt, schema, modelos, defaults);
    resultados.push({ caso: archivo, ...resultado });

    const icono = resultado.estado === 'PASA' ? '✅' :
                  resultado.estado === 'PASA_CON_DEGRADACION' ? '⚠️ ' : '❌';
    console.log(`   ${icono} ${resultado.estado}${resultado.intentos ? ` (${resultado.intentos} intento/s)` : ''}`);
    if (resultado.error) console.log(`   Error: ${resultado.error}`);
    console.log();
  }

  // ── Reporte final ─────────────────────────────────────────────────────────
  const pasa       = resultados.filter(r => r.estado === 'PASA').length;
  const degradado  = resultados.filter(r => r.estado === 'PASA_CON_DEGRADACION').length;
  const falla      = resultados.filter(r => r.estado === 'FALLA').length;
  const total      = resultados.length;
  const dodOk      = (pasa + degradado) >= 4 && degradado <= 1 && falla === 0;

  console.log('─'.repeat(46));
  console.log(`🏁 REPORTE FINAL | Total: ${total}`);
  console.log(`   ✅ PASS: ${pasa} | ⚠️  DEGRADADO: ${degradado} | ❌ FAIL: ${falla}`);
  console.log(`   📈 DoD Cumplido: ${dodOk ? 'SÍ 🎉' : 'NO ❌'}`);

  if (!dodOk) {
    console.log('\n⚠️  El DoD no se cumplió. Revisá:');
    if (falla > 0) console.log('   • Hay casos con FAIL — revisá logs/fallos_modelos.jsonl');
    if (degradado > 1) console.log('   • Más de 1 caso DEGRADADO — el LLM tiene problemas de formato');
    if (pasa + degradado < 4) console.log('   • Menos de 4 casos exitosos — revisá la API key y los créditos');
  }

  console.log('─'.repeat(46));
  process.exit(dodOk ? 0 : 1);
}

main().catch(e => {
  console.error('\n❌ Error fatal:', e.message);
  process.exit(1);
});
