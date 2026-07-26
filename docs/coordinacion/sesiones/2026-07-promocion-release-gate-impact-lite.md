# Sesión 2026-07 — Promoción de mad-release-gate y mad-impact-lite

| Campo | Valor |
|---|---|
| **Tipo** | Coordinación entre Claude (sistema-mad) y ChatGPT (moderador SOS) |
| **Participantes** | Claudio (árbitro), Claude, ChatGPT |
| **Volver a** | `../../MAD_HISTORIAL_DECISIONES.md` |

## Contexto

Dos herramientas nacidas en `his-core-platform-sos` (`mad-release-gate.cjs`,
`mad-impact-lite.cjs`) se identificaron como candidatas genéricas para
promover a `sistema-mad`, según el `MAD_TOOL_REGISTRY.md`.

## Secuencia de la sesión

1. **Análisis de portabilidad.** Se revisó cada herramienta línea por línea
   para detectar dependencias del SOS. `mad-release-gate` resultó ~95%
   genérica ya; `mad-impact-lite` tenía acoplamiento real (nombres de
   archivo del SOS, resumen de estado cableado a la clave `nfm`, bloque de
   reglas hardcodeado).

2. **Adaptación.** `mad-release-gate` → v0.2 (solo se agregó documentación,
   `--help` y ejemplo; lógica intacta). `mad-impact-lite` → v0.2, con
   `state_summary` y `context_rule` configurables desde el registro externo,
   en vez de cableados.

3. **Consulta formal de ChatGPT.** Documento
   `CONSULTA_A_CLAUDE_PROMOCION_HERRAMIENTAS_MAD_v0_01.md` con 10 preguntas
   y 3 ajustes técnicos (AJ-1, AJ-2, AJ-3) — ver resumen abajo.

4. **Respuesta punto por punto de Claude**, con verificación real de cada
   ajuste contra el código (no aceptado "de confianza"):
   - AJ-1 y AJ-2 se reprodujeron efectivamente en el código existente →
     aceptados y corregidos → `mad-impact-lite` pasa a v0.3.
   - AJ-3 aceptado → se construyeron `test_release_gate.cjs` (8 casos) y
     `test_impact_lite.cjs` (8 casos), ambos 8/8 PASS.
   - OBS-1 (registro adelantado: decía "promovidas" sin estar mergeadas) →
     aceptada, corregida.
   - OBS-2 (¿ya existe la 9ª regla en `mad-index` de `main`?) → en la
     respuesta inicial, Claude no pudo verificarlo (sin acceso de lectura
     confiable a GitHub en ese momento) y lo dejó como pendiente explícito,
     sin aceptar ni rechazar la afirmación de ChatGPT.

5. **Verificación con zip real.** Claudio compartió un `.zip` del estado
   actual de `sistema-mad`. Con eso:
   - **OBS-2 confirmada:** `mad-index.cjs` en `main` ya tiene 455 líneas y
     la 9ª regla completa.
   - **Hallazgo adicional:** comparación byte a byte contra el `mad-index.cjs`
     del SOS → **0 diferencias**. La divergencia ya estaba resuelta (patch
     documentado en `tools/mad-index.patch.diff`, con funcionalidad extra no
     prevista: namespace `GAP`, IDs compuestos, detección de tablas de
     definición, placeholders `-000`).
   - **mad-render-index.cjs**: comparación byte a byte → 202 líneas de
     diferencia. **Sigue divergiendo**, y ambas copias mencionan "SOS"/"v1.83"
     literalmente. Confirmado específico-SOS.
   - **Hallazgo no previsto:** `mad-pack.cjs` — construido y especificado en
     una sesión anterior para subir a `sistema-mad` — **no está en `main`**.
     Ni el `.cjs`, ni `config/context-packs.json`, ni
     `docs/MAD_PACK_CONTEXT.md`.

## Ajustes técnicos aceptados (detalle)

**AJ-1 — Diff indeterminado vs `--no-diff`.**
Antes: `gitChangedFiles()` devolvía `[]` tanto si el usuario pedía `--no-diff`
como si `git diff` fallaba (ej. repo con un solo commit, sin `HEAD^`). Ambos
casos producían el mismo reporte y podían dar veredicto **APTO** sin que el
impacto se evaluara de verdad.

Corrección: la función devuelve `{ files, diffState }` con
`diffState ∈ {disabled, ok, indeterminate}`. Con `indeterminate`, el veredicto
se fuerza a **APTO CON REVISIÓN**, y con `--strict-impact` bloquea (exit 3).

**AJ-2 — Coincidencia de rutas por prefijo.**
Antes: un patrón sin barra final (`docs/doc.md`) coincidía por prefijo, así
que modificar `docs/doc.md.bak` disparaba el mismo trigger que `docs/doc.md`.

Corrección: coincidencia **exacta** salvo que el patrón declare
explícitamente una carpeta (termina en `/`), en cuyo caso sí actúa como
prefijo.

**AJ-3 — Pruebas automatizadas.**
Se agregaron ambos test suites en el mismo commit que cada herramienta (no en
un PR de seguimiento), para mejor trazabilidad.

## Estructura del PR propuesta (pendiente de fusión)

```
Commit 1: feat: incorpora mad-release-gate v0.2 + tests
Commit 2: feat: incorpora mad-impact-lite v0.3 (configurable + AJ-1/AJ-2) + tests
Commit 3: chore: agrega scripts release:gate e impact:lite a package.json
Commit 4: docs: actualiza registro real del toolchain MAD
```

## Pendientes que salen de esta sesión

1. Fusionar el PR de arriba en `sistema-mad`
2. Re-generar y subir `mad-pack.cjs` (no llegó a `main` en su momento)
3. Generalizar `mad-render-index.cjs` — requiere perfil configurable real,
   no alcanza con copiar el archivo más reciente
4. Actualizar `mad-prepare-index-corpus.cjs` y `mad-apply-index-overrides.cjs`
   siguen siendo específicas del SOS (sin cambios necesarios por ahora)

## Archivos producidos en esta sesión

```
tools/mad-release-gate.cjs          (v0.2)
tools/test_release_gate.cjs         (nuevo)
docs/MAD_RELEASE_GATE.md
docs/examples/release-example.json

tools/mad-impact-lite.cjs           (v0.3)
tools/test_impact_lite.cjs          (nuevo)
docs/MAD_IMPACT_LITE.md
docs/examples/impact-registry-example.json

docs/coordinacion/MAD_TOOL_REGISTRY.md           (actualizado con estado verificado)
docs/coordinacion/RESPUESTA_CLAUDE_PROMOCION_HERRAMIENTAS.md
```
