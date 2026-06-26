#!/usr/bin/env node
/**
 * test_linter.js — Test de ground-truth para MAD-Linter v0.4.
 * Crea documentos .md de prueba con defectos CONOCIDOS y verifica que el linter
 * los detecte (y que NO marque lo que no debe). Estilo DoD, como test_briefing.js.
 *
 * Uso:  node tools/test_linter.js     (o:  npm run test:linter)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lint, similitudTitulos } = require('./mad-linter.js');

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
  const p = tmp('HIS_Core_Platform_v1_54_A_LIMPIO.md',
`# Doc
| Campo | Valor |
|---|---|
| Versión | v1.54 |

### RF-CORE-IDN-001 — Identidad base
El RF-CORE-IDN-001 define la identidad.`);
  const r = lint([p]);
  check('1. Documento limpio no genera hallazgos',
    r.dangling.length === 0 && r.dupRf.length === 0 && r.dupDa.length === 0 &&
    r.dupHeadings.length === 0 && r.verIssues.length === 0 && r.titleDivergences.length === 0);
}

// 2. Referencia RF colgada
{
  const p = tmp('HIS_Core_Platform_v1_54_A_COLGADO.md',
`### RF-CORE-IDN-001 — Identidad base
Esto referencia RF-CORE-LAB-999, que nunca se define.`);
  const r = lint([p]);
  check('2. Detecta referencia RF colgada (RF-CORE-LAB-999)',
    r.dangling.includes('RF-CORE-LAB-999'));
}

// 3. Titulo numerado duplicado en documento normal
{
  const p = tmp('HIS_Core_Platform_v1_54_A_DUPHEAD.md',
`## 8 Primera seccion
texto
## 8 Otra vez la 8`);
  const r = lint([p]);
  check('3. Detecta titulo "8" duplicado en documento normal',
    r.dupHeadings.some(d => d.num === '8'));
}

// 4. El MISMO duplicado en documento historico (_B_) NO se marca
{
  const p = tmp('HIS_Core_Platform_v1_54_B_Debate.md',
`## 8 Primera seccion
texto
## 8 Otra vez la 8`);
  const r = lint([p]);
  check('4. NO marca numeracion duplicada en documento historico (_B_)',
    r.dupHeadings.length === 0);
}

// 5. Version del archivo vs version de la metadata
{
  const p = tmp('HIS_Core_Platform_v1_54_E_ADR.md',
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
  const p = tmp('HIS_Core_Platform_v1_54_H_Backlog.md',
`### Backlog
Referencia RF-CORE-IDN-010, que es backlog conocido.`);
  const r = lint([p]);
  check('6. RF de backlog (RF-CORE-IDN-010) no se marca como colgado',
    r.backlogRefs.includes('RF-CORE-IDN-010') && !r.dangling.includes('RF-CORE-IDN-010'));
}

// 7. [H] DETECTA FABRICACIÓN: mismo ID, títulos divergentes en dos documentos
{
  const pE = tmp('HIS_Core_Platform_v1_76_E_ADR.md',
`# Doc E
| Versión | v1.76 |

### DA-127 — Política de retención de datos clínicos según normativa vigente
Texto.`);
  const pG = tmp('HIS_Core_Platform_v1_76_G_Preguntas.md',
`# Doc G
| Versión | v1.76 |

### DA-127 — Gestión de turnos ambulatorios en guardia externa
Título fabricado, no coincide.`);
  const r = lint([pE, pG]);
  check('7. [H] Detecta titulo fabricado (DA-127 con dos titulos distintos)',
    r.titleDivergences.some(d => d.id === 'DA-127' && d.variantes.length === 2));
}

// 8. [H] NO marca variación menor de título (mismo título extendido)
{
  const p1 = tmp('HIS_Core_Platform_v1_76_E_x.md',
`# Doc E
| Versión | v1.76 |

### DA-196 — Evento operativo asociado como flujo NFM referenciado por trazabilidad
Texto.`);
  const p2 = tmp('HIS_Core_Platform_v1_76_G_x.md',
`# Doc G
| Versión | v1.76 |

### DA-196 — Evento operativo asociado como flujo NFM referenciado por trazabilidad, no como primitivo
Texto.`);
  const r = lint([p1, p2]);
  check('8. [H] NO marca variacion menor de titulo (mismo concepto extendido)',
    !r.titleDivergences.some(d => d.id === 'DA-196'));
}

// 9. [H] El ledger histórico (_B_) se saltea en la verificación de títulos
{
  const p = tmp('HIS_Core_Platform_v1_76_B_Debate.md',
`# Doc B
| Versión | v1.76 |

### DA-127 — Primera version de esta decision historica
Texto.

### DA-127 — Segunda version completamente distinta reemitida
El ledger guarda variantes a proposito.`);
  const r = lint([p]);
  check('9. [H] El ledger historico (_B_) no dispara falsa alarma de fabricacion',
    !r.titleDivergences.some(d => d.id === 'DA-127'));
}

// 10. La función de similitud funciona como se espera
{
  const simAlta = similitudTitulos('Evento operativo asociado NFM', 'Evento operativo asociado NFM referenciado');
  const simBaja = similitudTitulos('Politica de retencion de datos', 'Gestion de turnos ambulatorios');
  check('10. similitudTitulos: alta para titulos parecidos, baja para distintos',
    simAlta >= 0.45 && simBaja < 0.45);
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

const bar = '='.repeat(58);
console.log(bar);
console.log('  test_linter v0.4 — casos de ground-truth para MAD-Linter');
console.log(bar);
let pass = 0;
for (const c of cases) { console.log(`  ${c.ok ? 'PASS' : 'FALL'}  ${c.name}`); if (c.ok) pass++; }
console.log(bar);
console.log(`  Resultado: ${pass}/${cases.length} casos PASS`);
const dod = pass === cases.length;
console.log(`  DoD cumplido: ${dod ? 'SI' : 'NO'}`);
console.log(bar);
process.exit(dod ? 0 : 1);
