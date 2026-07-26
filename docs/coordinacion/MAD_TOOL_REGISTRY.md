# MAD — Registro de herramientas (Tool Registry)

> Mapa único de todas las herramientas del toolchain MAD: dónde vive cada una,
> quién la mantiene, su estado y si es candidata a unificarse en `sistema-mad`.
> Este documento evita la doble fuente de verdad entre el motor y sus clientes.

---

## Modelo de trabajo

MAD se desarrolla con un modelo **híbrido pragmático**:

```
sistema-mad            = FUENTE DE VERDAD del método y del toolchain genérico
his-core-platform-sos  = CLIENTE que usa MAD y puede originar herramientas
```

**Regla rectora:**

```
Una herramienta nace donde se necesita.
Cuando demuestra ser genérica y estable, sube a sistema-mad como producto.
Nunca vive con vida propia en los dos repositorios a la vez.
```

---

## Estados posibles

| Estado | Significado |
|---|---|
| `genérica-estable` | Vive en `sistema-mad`, es reutilizable y forma parte del producto MAD |
| `candidata-a-subir` | Nació en un cliente, es genérica y debería promoverse |
| `específica-SOS` | Depende del perfil particular del SOS; no se promueve todavía |
| `consumida-remota` | El cliente la usa desde `sistema-mad` sin mantener una copia propia |

---

## Herramientas genéricas que viven en `sistema-mad`

| Herramienta | Versión | Estado | Qué hace | Mantiene |
|---|---|---|---|---|
| `mad-linter.cjs` | v0.4 | genérica-estable | Coherencia documental: referencias rotas, IDs duplicados y títulos fabricados [H] | Claude + Claudio |
| `test_linter.cjs` | v0.4 | genérica-estable | Pruebas del linter (10 casos) | Claude + Claudio |
| `mad-snapshot.cjs` | v0.1 | genérica-estable | Censo de artefactos con sello temporal y detección de pérdidas | Claude + Claudio |
| `mad-diff.cjs` | v0.1 | genérica-estable | Compara contenido de artefactos entre versiones | Claude + Claudio |
| `mad-index.cjs` | v0.06 | genérica-estable, unificada con SOS | Índice persistente con 9.ª regla, IDs compuestos y namespace GAP | Claude + Claudio + SOS |
| `mad-pack.cjs` | v0.2 | genérica-estable | Arma paquetes mínimos de contexto para IA; valida visibilidad, tamaño, rutas, configuración y privacidad | Claude + ChatGPT + Claudio |
| `test_pack.cjs` | v0.2 | genérica-estable | Suite de ground truth de `mad-pack` (41 casos) | Claude + ChatGPT + Claudio |
| `mad-release-gate.cjs` | v0.2 | genérica-estable | Puerta determinística de publicación: corpus, commit, hashes y bytes | Claude + Claudio + SOS |
| `test_release_gate.cjs` | v0.2 | genérica-estable | Pruebas de Release Gate (8 casos) | Claude + ChatGPT + Claudio |
| `mad-impact-lite.cjs` | v0.3 | genérica-estable | Detecta derivados desactualizados y distingue diff desactivado, calculado o indeterminado | Claude + Claudio + SOS |
| `test_impact_lite.cjs` | v0.3 | genérica-estable | Pruebas de Impact Lite (8 casos) | Claude + ChatGPT + Claudio |

### Configuración de `mad-pack`

La herramienta vive en el motor, pero la configuración real de cada cliente
vive en el repositorio del cliente:

```text
sistema-mad/docs/examples/context-packs-example.json
  = ejemplo genérico de dos packs; nunca es fuente operativa real

his-core-platform-sos/config/context-packs.json
  = configuración canónica de los packs reales del SOS
```

`--packs` es obligatorio cuando se genera o valida un pack. Esto impide que el
motor mantenga una segunda copia operativa de la configuración del cliente.

---

## Herramientas específicas del cliente SOS

| Herramienta | Versión | Estado | Qué hace | Nació en |
|---|---|---|---|---|
| `mad-render-index.cjs` | v0.8, dos variantes | específica-SOS y divergente | Genera el índice maestro legible; todavía contiene convenciones `SOS`/`v1.83` | SOS |
| `mad-prepare-index-corpus.cjs` | v0.1 | específica-SOS | Prepara el corpus para indexar con rutas relativas | SOS |
| `mad-apply-index-overrides.cjs` | v0.2 | específica-SOS | Aplica clasificaciones explícitas del perfil al índice | SOS |

---

## Consumo remoto por SOS

El SOS ya consume de forma remota `mad-linter`, `mad-snapshot`, `mad-diff` y
`mad-index`. La adopción remota de `mad-release-gate`, `mad-impact-lite` y
`mad-pack` requiere cambios separados en el repositorio cliente.

La incorporación de `mad-pack` en `sistema-mad` **no modifica** el corpus ni la
línea base del SOS. El archivo real `config/context-packs.json` debe incorporarse
en el repo SOS mediante un cambio independiente y no mezclarse con el PR H4.

---

## Divergencia `mad-index` — resuelta

Las copias históricas de:

- `sistema-mad/tools/mad-index.cjs`
- `his-core-platform-sos/tools/mad-index.cjs`

fueron verificadas como idénticas. La versión v0.06 incluye la **9.ª regla**,
que clasifica IDs solo citados como `RESERVADO`, `NO-EMITIDO`, `ABSORBIDO` o
`RENUMERADO`, además de soportar namespace `GAP`, IDs compuestos, definiciones
en tablas y placeholders `-000`.

No queda una decisión pendiente sobre `mad-index`.

---

## `mad-render-index` — divergencia vigente

`mad-render-index.cjs` todavía no es genérica. Las variantes de MAD y SOS
difieren y conservan menciones literales a `SOS` y `v1.83`. Su promoción exige
un perfil configurable real; no corresponde resolverla copiando una variante
sobre la otra.

---

## Candidatas a promoción o generalización

| Prioridad | Herramienta | Estado |
|---|---|---|
| ~~1~~ | ~~`mad-release-gate`~~ | Incorporada |
| ~~2~~ | ~~`mad-impact-lite`~~ | Incorporada |
| ~~3~~ | ~~`mad-index`~~ | Unificada |
| ~~4~~ | ~~`mad-pack`~~ | Recuperada, endurecida e incorporada como v0.2 |
| 5 | `mad-render-index` | Requiere generalización real mediante perfil configurable |

---

## Candidatos de funcionalidad nueva

| # | Candidato | Valor | Nota |
|---|---|---|---|
| 1 | Detección de respuestas duplicadas por hash | Medio | Implementación acotada |
| 2 | Control de cumplimiento con evidencia | Alto | Refuerza la defensa anti-alucinación |
| 3 | Ciclo de vida de hallazgos | Medio | Retirado, reformulado o cambio de severidad |
| 4 | **Control síntesis → ejecución documental** | **Alto** | Verifica que cada decisión de la síntesis haya sido escrita en el consolidado |
| 5 | Detección de reglas del moderador sin ratificación humana | Alto | Gobernanza |
| 6 | Registro de versión/hash del corpus auditado | Cubierto | Lo resuelve `mad-release-gate` |
| 7 | Revisión cruzada posterior | Avanzado | Post-MVP |

El candidato #4 conserva el mayor valor diferencial: `mad-diff` compara corpus,
pero no demuestra que cada decisión de una síntesis fue ejecutada en el documento
consolidado.

---

## Deuda documental detectada

`docs/MAPA_DE_ARTEFACTOS.md` continúa necesitando una actualización integral
contra el código vigente. Este PR actualiza README y el registro, pero no declara
resuelta esa deuda más amplia.

---

## Cómo se mantiene este registro

1. Cuando un cliente crea una herramienta, se registra como `candidata-a-subir` o `específica-SOS`.
2. Cuando se promueve a `sistema-mad`, cambia a `genérica-estable`.
3. La configuración operativa del cliente permanece en el cliente.
4. Cuando se resuelve una divergencia, se documenta la decisión y la evidencia.
5. Claudio autoriza cada promoción, unificación y adopción remota.

---

*Registro mantenido en `sistema-mad`. Refleja el estado del producto MAD y su relación con el primer cliente SOS.*
