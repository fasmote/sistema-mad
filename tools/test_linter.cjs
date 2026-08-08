#!/usr/bin/env node
/**
 * test_linter.cjs — Test de ground-truth para MAD-Linter v0.5.
 * Crea documentos .md de prueba con defectos CONOCIDOS y verifica que el linter
 * los detecte (y que NO marque lo que no debe). Estilo DoD, como test_briefing.js.
 *
 * NOTA: extensión .cjs (CommonJS) porque el package.json declara "type": "module".
 *
 * Uso:  node tools/test_linter.cjs     (o:  npm run test:linter)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lint, report, checkTitleConsistency, similitudTitulos } = require('./mad-linter.cjs');
const { buildIndex } = require('./mad-index.cjs');
const { extractDefinitions, tablePolicy } = require('./mad-definition-extractor.cjs');
const { TITLE_COLLISION_POLICY } = require('./mad-title-policy.cjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'madlint-'));
function tmp(name, content) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}
const cases = [];
const check = (name, cond) => cases.push({ name, ok: !!cond });

// 1. Documento limpio -> 0 hallazgos
{
  const p = tmp('MAD_Fixture_v1_54_A_LIMPIO.md',
`# Doc
| Campo | Valor |
|---|---|
| Versión | v1.54 |

### RF-TST-DOC-001 — Registro sintético de ejemplo
El RF-TST-DOC-001 define un artefacto de prueba.`);
  const r = lint([p]);
  check('1. Documento limpio no genera hallazgos',
    r.dangling.length === 0 && r.dupRf.length === 0 && r.dupDa.length === 0 &&
    r.dupHeadings.length === 0 && r.verIssues.length === 0 && r.titleDivergences.length === 0);
}

// 2. Referencia RF colgada
{
  const p = tmp('MAD_Fixture_v1_54_A_COLGADO.md',
`### RF-TST-DOC-001 — Registro sintético de ejemplo
Esto referencia RF-TST-DOC-999, que nunca se define.`);
  const r = lint([p]);
  check('2. Detecta referencia RF colgada (RF-TST-DOC-999)',
    r.dangling.includes('RF-TST-DOC-999'));
}

// 3. Titulo numerado duplicado en documento normal
{
  const p = tmp('MAD_Fixture_v1_54_A_DUPHEAD.md',
`## 8 Primera seccion
texto
## 8 Otra vez la 8`);
  const r = lint([p]);
  check('3. Detecta titulo "8" duplicado en documento normal',
    r.dupHeadings.some(d => d.num === '8'));
}

// 4. El MISMO duplicado en documento historico (_B_) NO se marca
{
  const p = tmp('MAD_Fixture_v1_54_B_Historico.md',
`## 8 Primera seccion
texto
## 8 Otra vez la 8`);
  const r = lint([p]);
  check('4. NO marca numeracion duplicada en documento historico (_B_)',
    r.dupHeadings.length === 0);
}

// 5. Version del archivo vs version de la metadata
{
  const p = tmp('MAD_Fixture_v1_54_E_Version.md',
`# Doc
| Campo | Valor |
|---|---|
| Versión | v1.49 |`);
  const r = lint([p]);
  check('5. Detecta version archivo (1.54) != metadata (1.49)',
    r.verIssues.some(v => v.fileVer === '1.54' && v.declaredVer === '1.49'));
}

// 6. RF de backlog NO se marca como colgado
{
  const p = tmp('MAD_Fixture_v1_54_H_Backlog.md',
`### Backlog
Referencia RF-TST-DOC-010, que es backlog sintético conocido.`);
  const r = lint([p]);
  check('6. RF de backlog sintético no se marca como colgado',
    r.backlogRefs.includes('RF-TST-DOC-010') && !r.dangling.includes('RF-TST-DOC-010'));
}

// 7. [H] DETECTA FABRICACIÓN: mismo ID, títulos divergentes en dos documentos
{
  const pE = tmp('MAD_Fixture_v1_76_E_Uno.md',
`# Doc E
| Versión | v1.76 |

### DA-127 — Política sintética para archivar registros de prueba
Texto.`);
  const pG = tmp('MAD_Fixture_v1_76_G_Dos.md',
`# Doc G
| Versión | v1.76 |

### DA-127 — Estrategia ficticia para distribuir tareas automáticas
Título sintético divergente.`);
  const r = lint([pE, pG]);
  check('7. [H] Detecta titulo fabricado (DA-127 con dos titulos distintos)',
    r.titleDivergences.some(d => d.id === 'DA-127' && d.variantes.length === 2));
}

// 8. [H] NO marca variación menor de título (mismo título extendido)
{
  const p1 = tmp('MAD_Fixture_v1_76_E_x.md',
`# Doc E
| Versión | v1.76 |

### DA-196 — Evento sintético asociado como flujo referenciado por trazabilidad
Texto.`);
  const p2 = tmp('MAD_Fixture_v1_76_G_x.md',
`# Doc G
| Versión | v1.76 |

### DA-196 — Evento sintético asociado como flujo referenciado por trazabilidad, no como primitivo
Texto.`);
  const r = lint([p1, p2]);
  check('8. [H] NO marca variacion menor de titulo (mismo concepto extendido)',
    !r.titleDivergences.some(d => d.id === 'DA-196'));
}

// 9. [H] Los documentos B/J ya no se excluyen de la verificación de títulos
{
  const pB = tmp('MAD_Fixture_v1_76_B_Historico.md',
`# Doc B sintético
| Versión | v1.76 |

### DA-129 — Primera variante sintética del registro
Texto.
`);
  const pJ = tmp('MAD_Fixture_v1_76_J_Historico.md',
`# Doc J sintético
| Versión | v1.76 |

### DA-129 — Mecanismo ficticio para ordenar trabajos diferidos
Texto.`);
  const r = lint([pB, pJ]);
  check('9. [H] Incluye documentos históricos B/J',
    r.titleDivergences.some(d => d.id === 'DA-129'));
}

// 10. La función de similitud funciona como se espera
{
  const simAlta = similitudTitulos('Evento sintético asociado', 'Evento sintético asociado referenciado');
  const simBaja = similitudTitulos('Política ficticia de archivo', 'Distribución automática de tareas');
  check('10. similitudTitulos: alta para titulos parecidos, baja para distintos',
    simAlta >= 0.45 && simBaja < 0.45);
}

// 11. Extractor compartido: encabezados, tablas, FUT-NNN, colisiones internas y entre archivos.
const seeded = new Set(['ADR-901', 'DA-901', 'FUT-901', 'PH-TST-001', 'RF-TST-MOD-001']);
const fixtureA = tmp('MAD_Fixture_v9_99_A_Definiciones.md',
`# Fixtures sintéticos
| Versión | v9.99 |

### DA-901 — Política ficticia de archivo para objetos temporales
Texto.

### DA-901 — Estrategia simulada de reparto para procesos nocturnos
Texto.

### PH-TST-001 — ¿Debe conservarse el registro sintético después del cierre?
Texto.

### FUT-901 — Evaluar un mecanismo ficticio de compresión incremental
Texto.

## Definiciones de prueba

| ID | Título | Estado |
|---|---|---|
| RF-TST-MOD-001 | Validar lotes sintéticos antes de archivarlos | ACTIVO |
| RF-TST-MOD-001 | Reintentar tareas ficticias luego de una pausa | ACTIVO |
`);
const fixtureB = tmp('MAD_Fixture_v9_99_B_Definiciones.md',
`# Fixtures sintéticos B
| Versión | v9.99 |

### PH-TST-001 — ¿Puede una tarea simulada cambiar su prioridad automáticamente?
Texto.

## Definiciones de prueba

| ID | Título |
|---|---|
| FUT-901 | Investigar una cola ficticia para trabajos caducados |

| Artefacto | Nota |
|---|---|
| ADR-901 — Seleccionar un algoritmo sintético para ordenar paquetes | prueba |
`);
const fixtureJ = tmp('MAD_Fixture_v9_99_J_Definiciones.md',
`# Fixtures sintéticos J
| Versión | v9.99 |

| Artefacto | Nota |
|---|---|
| ADR-901 — Adoptar una política ficticia de nombres para archivos | prueba |
`);

{
  const files = [fixtureA, fixtureB, fixtureJ];
  const r = lint(files);
  const actual = new Set(r.titleDivergences.map(d => d.id));
  check('11. [H] detecta exactamente el conjunto de colisiones sintéticas sembradas',
    actual.size === seeded.size && [...seeded].every(id => actual.has(id)));
}

// 12. Ocho patrones sintéticos de no-definición: sección y columnas para cuatro familias.
const falsePositiveFixture = tmp('MAD_Fixture_v9_99_X_NoDefiniciones.md',
`# Relaciones sintéticas
| Versión | v9.99 |

## Equivalencias
| ID | Título |
|---|---|
| DA-981 | Alias ficticio de otro registro |

## Mapeo uno
| ID origen | ID destino |
|---|---|
| DA-982 | DA-900 |

## Derivaciones
| ID | Título |
|---|---|
| DA-983 | Derivado sintético |

## Mapeo dos
| ID | Deriva de |
|---|---|
| DA-984 | DA-900 |

## Estados
| ID | Título |
|---|---|
| DA-985 | Abierto |

## Mapeo tres
| ID | Estado |
|---|---|
| DA-986 | Cerrado |

## Catálogo
| ID | Título |
|---|---|
| DA-987 | Entrada ficticia de catálogo |

## Mapeo cuatro
| Código | Categoría |
|---|---|
| DA-988 | Simulada |
`);

{
  const ids = new Set(extractDefinitions(new Map([[falsePositiveFixture, fs.readFileSync(falsePositiveFixture, 'utf8')]]))
    .map(definition => definition.id));
  check('12. Extractor excluye los ocho patrones sintéticos de falso positivo',
    ![981, 982, 983, 984, 985, 986, 987, 988].some(n => ids.has(`DA-${n}`)));
}

// 13. Índice y linter comparten extractor, política y conjunto de colisiones.
{
  const files = [fixtureA, fixtureB, fixtureJ, falsePositiveFixture];
  const r = lint(files);
  const index = buildIndex(files);
  const linterIds = new Set(r.titleDivergences.map(d => d.id));
  const indexIds = new Set(index.alertas.titulos_colisionados.map(d => d.id));
  const sample = index.da['DA-901'];
  check('13. Índice y linter coinciden por conjunto y política versionada',
    linterIds.size === indexIds.size && [...linterIds].every(id => indexIds.has(id)) &&
    index.politica_titulos.version === TITLE_COLLISION_POLICY.version);
  check('14. JSON aditivo conserva escalares y agrega ocurrencias y colisión',
    typeof sample.titulo === 'string' && Array.isArray(sample.definido_en) &&
    Array.isArray(sample.citado_en) && sample.definiciones.length === 2 &&
    sample.variantes.length === 2 && sample.colision_titulo.estado === 'COLISIONADO' &&
    sample.definiciones.every(d => d.documento && d.ruta && d.version && d.forma && d.linea_diagnostica));
}

// 15. En audit [H] informa sin sumar; en error queda disponible como bloqueo futuro.
{
  const audit = lint([fixtureA], { titleMode: 'audit' });
  const error = lint([fixtureA], { titleMode: 'error' });
  const originalLog = console.log;
  console.log = () => {};
  let auditFindings, errorFindings;
  try {
    auditFindings = report(audit);
    errorFindings = report(error);
  } finally {
    console.log = originalLog;
  }
  check('15. Modo audit no incrementa hallazgos duros por [H]', auditFindings === 0);
  check('16. Modo error conserva el bloqueo futuro de [H]', errorFindings === 2);
}

// 17-18. La sección inmediata gobierna la exclusión, no toda la jerarquía.
const sectionModeFixture = tmp('MAD_Fixture_v9_99_TST_Secciones.md',
`# Estados sintéticos del documento
| Versión | v9.99 |

## Definiciones válidas
| ID | Pregunta |
|---|---|
| PH-TST-101 | ¿Debe conservarse esta definición sintética? |

## Estados
| ID | Título |
|---|---|
| PH-TST-102 | Estado sintético que no constituye definición |
`);

{
  const definitions = extractDefinitions(new Map([
    [sectionModeFixture, fs.readFileSync(sectionModeFixture, 'utf8')],
  ]));
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  check('17. Extractor usa la sección inmediata y no queda envenenado por un ancestro',
    byId.get('PH-TST-101')?.forma === 'tabla');
  check('18. Extractor mantiene la exclusión bajo una sección inmediata de Estados',
    !byId.has('PH-TST-102'));
}

// 19. Un encabezado de rango no define el primer ID; un título ordinario con "a " sí.
const rangeHeadingFixture = tmp('MAD_Fixture_v9_99_TST_Rangos.md',
`# Rangos sintéticos
| Versión | v9.99 |

### DA-TST-101 a DA-TST-177 — Rango sintético

### DA-TST-103 a 177 — Rango sintético abreviado

### DA-TST-101 — Individual sintético

### DA-TST-102 — a propósito del archivo sintético
`);

{
  const definitions = extractDefinitions(new Map([
    [rangeHeadingFixture, fs.readFileSync(rangeHeadingFixture, 'utf8')],
  ])).map(definition => ({ id: definition.id, titulo: definition.titulo_completo, forma: definition.forma }));
  const expected = [
    { id: 'DA-TST-101', titulo: 'Individual sintético', forma: 'encabezado' },
    { id: 'DA-TST-102', titulo: 'a propósito del archivo sintético', forma: 'encabezado' },
  ];
  check('19. Extractor excluye rangos sin confundir títulos ordinarios que empiezan con "a "',
    JSON.stringify(definitions) === JSON.stringify(expected));
}

// 20-24. Modos de tabla: desconocido, compacto, explícito, catálogo y legado.
const tableModeFixture = tmp('MAD_Fixture_v9_99_TST_ModosTabla.md',
`# Modos sintéticos de tabla
| Versión | v9.99 |

## Horizonte sintético
| RF | Horizonte | Motivo |
|---|---|---|
| RF-TST-MOD-101 | MVP1 | Valor sintético no definitorio |

## Formato compacto
| Artefacto | Nota |
|---|---|
| ADR-902 — Seleccionar un orden sintético para los paquetes | prueba |

## Esquemas explícitos
| ID | Enunciado |
|---|---|
| DA-TST-103 | Enunciado sintético reconocido como título |

| ID futuro | Tema |
|---|---|
| FUT-TST-103 | Tema sintético para análisis futuro |

| ID sugerido | Tema |
|---|---|
| GAP-TST-103 | Tema sintético sugerido |

## Tabla sintética sin encabezado
| DA-TST-104 | Definición sintética posicional heredada |

## Catálogo
| ID | Título |
|---|---|
| PH-TST-103 | Entrada sintética de catálogo |
`);

{
  const definitions = extractDefinitions(new Map([
    [tableModeFixture, fs.readFileSync(tableModeFixture, 'utf8')],
  ]));
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  check('20. Esquema desconocido no usa interpretación posicional',
    !byId.has('RF-TST-MOD-101') && tablePolicy(['RF', 'Horizonte', 'Motivo'], '').mode === 'compact-only');
  check('21. Esquema desconocido conserva una definición compacta',
    byId.get('ADR-902')?.forma === 'tabla-compacta');
  check('22. Encabezados ampliados ID/Enunciado e ID futuro/sugerido/Tema son explícitos',
    ['DA-TST-103', 'FUT-TST-103', 'GAP-TST-103'].every(id => byId.get(id)?.forma === 'tabla') &&
    tablePolicy(['ID', 'Enunciado'], '').mode === 'explicit-schema' &&
    tablePolicy(['ID futuro', 'Tema'], '').mode === 'explicit-schema' &&
    tablePolicy(['ID sugerido', 'Tema'], '').mode === 'explicit-schema' &&
    ['RF', 'DA', 'PH', 'ADR', 'FUT', 'GAP'].every(idHeader =>
      tablePolicy([idHeader, 'Tema'], '').mode === 'explicit-schema'));
  check('23. Sección inmediata de Catálogo continúa excluida',
    !byId.has('PH-TST-103'));
  check('24. Tabla sin encabezado conserva la compatibilidad posicional legacy-row',
    byId.get('DA-TST-104')?.forma === 'tabla' && tablePolicy(null, '').mode === 'legacy-row');
}

// 25-28. Inferencia de columna ID por contenido y recuperación declarada de backlog.
const contentIdFixture = tmp('MAD_Fixture_v9_99_TST_ColumnaIdPorContenido.md',
`# Inferencia sintética de columna ID
| Versión | v9.99 |

## Candidatos sintéticos
| ID candidato | Título | Motivo | Relación funcional |
|---|---|---|---|
| ADR-TST-027 | Motor sintético | Motivo sintético | Relación sintética |

## Horizonte sintético por contenido
| RF | Horizonte | Motivo |
|---|---|---|
| RF-TST-MOD-101 | MVP1 | Motivo sintético no definitorio |

## Backlog sintético con destino
| ID | Tema | Motivo / Disparador | Destino |
|---|---|---|---|
| FUT-TST-005 | Tema sintético | Disparador sintético | NFM X |

## Hallazgos sintéticos diferidos a ADR técnico
| Tema | Motivo de diferimiento | ADR sugerido |
|---|---|---|
| Tema sintético del hallazgo | Motivo sintético | ADR-TST-001 |
`);

{
  const text = fs.readFileSync(contentIdFixture, 'utf8');
  const definitions = extractDefinitions(new Map([[contentIdFixture, text]]));
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  const candidateRows = [{ cells: ['ADR-TST-027', 'Motor sintético', 'Motivo sintético', 'Relación sintética'] }];
  const horizonRows = [{ cells: ['RF-TST-MOD-101', 'MVP1', 'Motivo sintético no definitorio'] }];
  const relationalRows = [{ cells: ['Tema sintético del hallazgo', 'Motivo sintético', 'ADR-TST-001'] }];

  check('25. ID candidato se infiere por contenido mayoritario y conserva ADR namespaced',
    byId.get('ADR-TST-027')?.forma === 'tabla' &&
    tablePolicy(['ID candidato', 'Título', 'Motivo', 'Relación funcional'], '', candidateRows).mode === 'explicit-schema');
  check('26. ID inferido por contenido sin columna de título queda en compact-only',
    !byId.has('RF-TST-MOD-101') &&
    tablePolicy(['RF', 'Horizonte', 'Motivo'], '', horizonRows).mode === 'compact-only');
  check('27. ID y Tema con Destino conserva la definición FUT como recuperación intencional',
    byId.get('FUT-TST-005')?.forma === 'tabla' &&
    tablePolicy(['ID', 'Tema', 'Motivo / Disparador', 'Destino'], '').mode === 'explicit-schema');
  check('28. Columna relacional posterior con IDs no promueve la tabla a esquema explícito',
    !byId.has('ADR-TST-001') &&
    tablePolicy(['Tema', 'Motivo de diferimiento', 'ADR sugerido'], '', relationalRows).mode === 'compact-only');
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

const bar = '='.repeat(58);
console.log(bar);
console.log('  test_linter v0.6 — casos de ground-truth para MAD-Linter');
console.log(bar);
let pass = 0;
for (const c of cases) { console.log(`  ${c.ok ? 'PASS' : 'FALL'}  ${c.name}`); if (c.ok) pass++; }
console.log(bar);
console.log(`  Resultado: ${pass}/${cases.length} casos PASS`);
const dod = pass === cases.length;
console.log(`  DoD cumplido: ${dod ? 'SI' : 'NO'}`);
console.log(bar);
process.exit(dod ? 0 : 1);
