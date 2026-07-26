# MAD — Registro de herramientas (Tool Registry)

> Mapa único de todas las herramientas del toolchain MAD: dónde vive cada una,
> quién la mantiene, su estado, y si es candidata a unificarse en `sistema-mad`.
> Este documento es la defensa contra la "doble fuente de verdad" en un modelo
> de trabajo híbrido entre dos repositorios.

---

## Modelo de trabajo

MAD se desarrolla en un modelo **híbrido pragmático**:

```
sistema-mad            = FUENTE DE VERDAD del método y del toolchain genérico
his-core-platform-sos  = CLIENTE que usa MAD y a veces crea herramientas propias
```

**Regla rectora:**

```
Una herramienta nace donde se necesita.
Cuando demuestra ser genérica y estable, "sube" a sistema-mad como producto.
Nunca vive con vida propia en los dos repos a la vez.
```

Esto permite velocidad (el SOS crea lo urgente sin esperar) sin perder gobierno
(lo genérico se consolida en un solo lugar).

---

## Estados posibles de una herramienta

| Estado | Significado |
|---|---|
| `genérica-estable` | Vive en sistema-mad, reutilizable, es producto MAD |
| `candidata-a-subir` | Nació en el SOS, es genérica, debería promoverse a sistema-mad |
| `específica-SOS` | Sirve solo al SOS por su perfil; no se promueve (o todavía no) |
| `consumida-remota` | El SOS la usa pero la baja de sistema-mad (no tiene copia propia) |

---

## Registro completo

### Herramientas que viven en `sistema-mad` (genéricas)

| Herramienta | Versión | Estado | Qué hace | Mantiene |
|---|---|---|---|---|
| `mad-linter.cjs` | v0.4 | genérica-estable | Coherencia documental: referencias rotas, IDs duplicados, títulos fabricados [H] | Claude + Claudio |
| `mad-snapshot.cjs` | v0.1 | genérica-estable | Censo de artefactos con sello temporal ART, detecta pérdidas | Claude + Claudio |
| `mad-diff.cjs` | v0.1 | genérica-estable | Compara contenido de artefactos entre dos versiones | Claude + Claudio |
| `mad-index.cjs` | v0.06 (455 líneas) | genérica-estable — UNIFICADA con SOS (verificado: 0 diferencias) | Índice persistente de artefactos, con 9ª regla de clasificación de solo-citados (RESERVADO/NO-EMITIDO/ABSORBIDO/RENUMERADO), IDs compuestos y namespace GAP | Claude + Claudio + SOS (patch aplicado) |
| `mad-release-gate.cjs` | v0.2 | genérica-estable — incorporada por el PR de promoción | Puerta de publicación determinística: prueba qué corpus, commit y bytes fueron validados | Claude + Claudio + SOS |
| `mad-impact-lite.cjs` | v0.3 | genérica-estable — incorporada por el PR de promoción | Detecta derivados desactualizados y distingue diff desactivado, calculado o indeterminado | Claude + Claudio + SOS |
| `test_linter.cjs` | v0.4 | genérica-estable | Tests del linter (10 casos) | Claude + Claudio |

El SOS ya consume de forma remota `mad-linter`, `mad-snapshot`, `mad-diff` y
`mad-index`: su GitHub Action los baja desde `sistema-mad` en cada corrida y no
mantiene copias propias de esas herramientas. La adopción remota de
`mad-release-gate` y `mad-impact-lite` requiere un cambio posterior en el repo SOS;
este PR no modifica ese cliente.

### Herramientas que viven en `his-core-platform-sos` (creadas por el SOS)

| Herramienta | Versión | Estado | Qué hace | Nació en |
|---|---|---|---|---|
| `mad-render-index.cjs` | v0.8 (dos variantes distintas) | específica-SOS, divergente entre repos | Genera el índice maestro legible desde mad-index.json. Verificado: NO es idéntica entre sistema-mad y SOS (202 líneas de diff), y ambas copias todavía mencionan "SOS"/"v1.83" en el código. | SOS |

### Herramientas construidas pero no incorporadas

| Herramienta | Versión | Estado | Qué hace | Próximo paso |
|---|---|---|---|---|
| `mad-pack.cjs` | v0.1 | pendiente-de-reincorporación ⚠️ | Arma paquetes de contexto para IA (`PACK-IA-001` a `007`) | Buscar la versión original; si no aparece, regenerar y subir en un PR separado |

`mad-pack.cjs`, `config/context-packs.json` y `docs/MAD_PACK_CONTEXT.md` no están
en `main`. Por lo tanto, no se clasifican como herramientas genéricas estables
hasta que sus archivos sean recuperados o regenerados, probados y fusionados.

| Herramienta | Versión | Estado | Qué hace | Nació en |
|---|---|---|---|---|
| `mad-prepare-index-corpus.cjs` | v0.1 | específica-SOS | Prepara el corpus para indexar (rutas relativas) | SOS |
| `mad-apply-index-overrides.cjs` | v0.2 | específica-SOS | Aplica clasificaciones explícitas del perfil al índice | SOS |

**Nota de adopción por SOS:** este PR incorpora las versiones genéricas en
`sistema-mad`, pero no modifica automáticamente el repositorio SOS. La migración
del SOS para consumirlas de forma remota y retirar copias locales debe realizarse
como cambio separado y controlado. Para conservar el comportamiento de
`mad-impact-lite`, el registro del SOS debe declarar `state_summary` y
`context_rule`.

---

## Divergencia `mad-index` — RESUELTA ✅

Había **dos versiones de mad-index** que en algún momento divergieron:

- `sistema-mad/tools/mad-index.cjs`
- `his-core-platform-sos/tools/mad-index.cjs`

**Estado verificado (comparación byte a byte sobre el zip real de ambos
repos):** son **idénticas — 0 diferencias.** La unificación ya ocurrió, vía
un patch documentado en `tools/mad-index.patch.diff` dentro de `sistema-mad`.

La versión unificada (v0.06, 455 líneas) incluye la **"9ª regla"** — clasifica
los IDs solo-citados (mencionados pero no definidos) en categorías:
`RESERVADO`, `NO-EMITIDO`, `ABSORBIDO`, `RENUMERADO` — más funcionalidad
adicional no contemplada en el análisis original: soporte para namespace
`GAP`, IDs compuestos de más de un fragmento (ej. `DA-CDS-MED-001`),
detección de definiciones en filas de tabla, y tratamiento de IDs `-000`
como placeholders.

**No queda ninguna decisión pendiente sobre `mad-index`.** El árbitro humano
no necesita elegir entre las opciones A/B/C que este registro planteaba
antes — la unificación ya se hizo, y el resultado quedó consistente en
ambos repos.

---

## `mad-render-index` — divergencia SÍ existe (distinto de mad-index)

A diferencia de `mad-index`, esta herramienta **no está unificada.**
Verificado por comparación byte a byte: `sistema-mad/tools/mad-render-index.cjs`
y `his-core-platform-sos/tools/mad-render-index.cjs` difieren en 202 líneas.
Ambas copias siguen mencionando "SOS" y "v1.83" literalmente en el código.

Es candidata al mismo tratamiento que recibió `mad-index` (unificar +
generalizar), pero requiere trabajo de generalización real — no es solo
copiar el archivo más nuevo, porque ninguna de las dos versiones es genérica
todavía. Depende del formato de `mad-index` (ya estable), así que este es
el momento correcto para abordarla.

---

## Candidatas a promover a `sistema-mad` (orden sugerido)

Basado en cuán genéricas son y cuánto valor aportan como producto reutilizable:

| Prioridad | Herramienta | Por qué |
|---|---|---|
| ~~1~~ | ~~`mad-release-gate`~~ | ✅ Incorporada por el PR de promoción. |
| ~~2~~ | ~~`mad-impact-lite`~~ | ✅ Incorporada por el PR de promoción. |
| ~~3~~ | ~~`mad-index` (unificación)~~ | ✅ Ya resuelta — ver sección arriba. |
| 3 | `mad-pack` | Falta re-subir: se especificó pero no llegó a `main` (ver hallazgo arriba). |
| 4 | `mad-render-index` | Requiere generalización real, no solo copia. Divergente entre repos. |

Las dos `específica-SOS` (`prepare-index-corpus`, `apply-index-overrides`) se
quedan en el SOS por ahora — dependen del perfil de índice particular del proyecto.

---

## Candidatos de funcionalidad nueva (detectados por análisis externo)

Ideas que **todavía no son herramientas** en ningún repo, identificadas como
genuinamente nuevas (no duplican lo existente):

| # | Candidato | Valor | Nota |
|---|---|---|---|
| 1 | Detección de respuestas duplicadas por hash | Medio | Fácil de implementar |
| 2 | Control de cumplimiento con evidencia (no un "Sí") | Alto | Refuerza anti-alucinación |
| 3 | Ciclo de vida de hallazgos (retirado/reformulado/bajado de severidad) | Medio | Gobernanza de rondas |
| 4 | **Control síntesis → ejecución documental** | **Alto** | Verifica que cada decisión de la síntesis se escribió de verdad. NO es mad-diff. |
| 5 | Detección de reglas del moderador sin ratificación humana | Alto | Gobernanza |
| 6 | Registro de versión/hash del corpus auditado | — | Ya lo cubre mad-release-gate |
| 7 | Revisión cruzada posterior (autocorrección entre IAs) | Avanzado | Post-MVP |

El candidato #4 es el de mayor valor único: `mad-diff` compara dos corpus, pero
nadie verifica que cada decisión de una síntesis fue efectivamente escrita en el
documento consolidado. Es una herramienta nueva, no una variante de las existentes.

---

## Deuda documental detectada

`docs/MAPA_DE_ARTEFACTOS.md` en sistema-mad está desactualizado respecto del código
actual: marca como pendientes componentes que ya existen (director.js, la GUI, las
herramientas nuevas). Conviene actualizarlo para que no genere confusión sobre el
estado vigente.

---

## Cómo se mantiene este registro

1. Cuando el SOS crea una herramienta nueva → se agrega acá como `candidata-a-subir`
   o `específica-SOS`.
2. Cuando una herramienta se promueve a sistema-mad → cambia a `genérica-estable`
   y se marca que el SOS la consume remota.
3. Cuando se resuelve una divergencia → se documenta la decisión.
4. El árbitro humano (Claudio) autoriza cada promoción o unificación.

---

*Registro mantenido en sistema-mad. Refleja el estado del toolchain repartido entre
sistema-mad (producto) y his-core-platform-sos (primer cliente).*
