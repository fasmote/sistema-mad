# Sesión 2026-07-26 — Recuperación e incorporación de mad-pack v0.2

| Campo | Valor |
|---|---|
| **Tipo** | Recuperación de herramienta + revisión cruzada + incorporación |
| **Participantes** | Claudio (árbitro), Claude (construcción/verificación), ChatGPT (revisión/incorporación) |
| **Volver a** | `../../MAD_HISTORIAL_DECISIONES.md` |

## Contexto

`mad-pack.cjs`, construida previamente para armar paquetes mínimos de contexto
para IA, había quedado documentada pero nunca había llegado a `main` de
`sistema-mad`. Esta sesión recuperó la herramienta, corrigió problemas reales,
la generalizó como producto y cerró su incorporación mediante el PR #2.

## Secuencia de la sesión

1. **Recuperación.** Claude rescató la implementación y la documentación
   previas, verificó sintaxis, carga de packs y funcionamiento de `--list`.

2. **Primera revisión cruzada.** ChatGPT encontró cuatro problemas de código y
   uno estructural, todos reproducidos antes de corregirse:
   - escape del repo mediante symlinks;
   - argumentos inválidos ignorados;
   - archivos vacíos anunciados como incluidos pero omitidos;
   - límite medido sobre contenido parcial y no sobre el Markdown final;
   - duplicación de la configuración real del SOS dentro del motor.

3. **Corrección a v0.2.** Se incorporó `fs.realpathSync`, validación estricta
   de argumentos, inclusión real de archivos vacíos, una única función
   `buildMarkdown()` para medir y generar, `--packs` obligatorio para packs
   reales y un ejemplo genérico de dos packs sin datos del SOS.

4. **Segunda revisión cruzada.** Se detectaron combinaciones semánticamente
   inválidas de flags que terminaban con exit 0 o ignoraban argumentos. Se
   incorporó `validateCombinations()` y se ampliaron las pruebas.

5. **Endurecimiento final durante la integración.** ChatGPT agregó controles
   para flags repetidos o absorbidos como valores, configuración JSON mal
   formada, `visibility` fail-closed, IDs heredados del prototipo, aliases de
   ruta, exposición de rutas absolutas, tablas Markdown y sobrescritura
   accidental de fuentes o configuración.

6. **Incorporación.** El PR #2 se fusionó en `main` con merge commit
   `b9ab38a2bdf489789abe2829fbc696cf2159ac9e`. La suite final quedó en
   **41/41 PASS**.

## Decisiones tomadas

- `mad-pack` v0.2 queda como herramienta `genérica-estable` de `sistema-mad`.
- La configuración real de packs vive en el repositorio cliente; el motor solo
  contiene un ejemplo genérico no operativo.
- `--packs` es obligatorio para generar o validar un pack real.
- La revisión cruzada con reproducción previa del hallazgo se adopta como
  práctica de endurecimiento del toolchain.

## Pendientes que salen de esta sesión

- Incorporar en un cambio separado
  `his-core-platform-sos/config/context-packs.json` con los siete packs reales.
- Generalizar `mad-render-index.cjs`, que continúa divergente y específico del
  SOS.

## Archivos incorporados o actualizados por el PR #2

```text
tools/mad-pack.cjs
tools/test_pack.cjs
docs/MAD_PACK_CONTEXT.md
docs/examples/context-packs-example.json
package.json
README.md
docs/coordinacion/MAD_TOOL_REGISTRY.md
```

## Evidencia

```text
node --check tools/mad-pack.cjs   OK
node --check tools/test_pack.cjs  OK
node tools/test_pack.cjs          41/41 PASS
DoD cumplido: SI
```
