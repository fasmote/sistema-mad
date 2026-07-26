| Campo | Valor |
|---|---|
| **Documento** | `RESPUESTA_CLAUDE_PROMOCION_HERRAMIENTAS_MAD_v0.02` |
| **Responde a** | `CONSULTA_A_CLAUDE_PROMOCION_HERRAMIENTAS_MAD_v0_01.md` |
| **Autor** | Claude (constructor principal de `sistema-mad`) |
| **Estado** | Ninguno de los dos repositorios fue modificado todavía |

# Respuesta a la consulta de promoción de herramientas MAD

## Resumen ejecutivo

La revisión de ChatGPT fue rigurosa y encontró **dos problemas reales** en mi
propia implementación (AJ-1 y AJ-2), más **un error real** en el registro que
generé (OBS-1). Los tres quedaron corregidos. Hay un punto (OBS-2) que no
puedo confirmar ni negar todavía porque no tengo acceso de lectura confiable
al estado actual de `sistema-mad/main` en este momento — lo marco como
verificación pendiente, no lo doy por cierto.

Adjunto en esta entrega:

- `mad-impact-lite.cjs` **v0.3** (con AJ-1 y AJ-2 corregidos)
- `MAD_IMPACT_LITE.md` actualizado
- `test_impact_lite.cjs` — 8/8 casos PASS
- `test_release_gate.cjs` — 8/8 casos PASS
- Esta respuesta punto por punto

---

## Respuestas punto por punto

### 1. ¿Aprueba la promoción separada de Release Gate e Impact Lite?

**Sí.** Son herramientas independientes entre sí y de las decisiones
pendientes de `mad-index`/`mad-render-index`. No hay razón para atarlas.

### 2. ¿Qué observaciones de ChatGPT considera correctas?

Las tres son correctas:

- **OBS-1 (registro adelantado):** correcta sin matices. El
  `MAD_TOOL_REGISTRY.md` que generé decía "PROMOVIDA" cuando en realidad los
  archivos no estaban en `main`. Es un error mío — until it's merged es
  "preparada para promoción", no "promovida". Corregido (ver punto 4).

- **AJ-1 (diff indeterminado vs `--no-diff`):** correcta. Verifiqué mi propio
  código: `gitChangedFiles` devolvía el mismo resultado (`[]`) tanto si el
  usuario pedía `--no-diff` como si git fallaba en calcular el rango. Eso
  podía producir un veredicto **APTO** sin que el impacto se haya evaluado
  realmente. Implementé la distinción de tres estados (`disabled` / `ok` /
  `indeterminate`) exactamente como propuso ChatGPT. Test agregado.

- **AJ-2 (coincidencia de rutas):** correcta. Verifiqué `pathMatches`: un
  patrón sin barra final (`docs/doc.md`) coincidía por prefijo, así que
  `docs/doc.md.bak` disparaba el mismo trigger. Corregido a coincidencia
  exacta salvo declaración explícita de carpeta (`docs/carpeta/`). Test
  agregado.

### 3. ¿Cuáles considera incorrectas o innecesarias?

Ninguna de las observaciones técnicas es incorrecta o innecesaria. Las tres
señalaron problemas reales verificables en el código, no apreciaciones de
estilo.

### 4. ¿Debe ajustarse `MAD_TOOL_REGISTRY.md` antes de publicarlo?

**Sí.** Acepto la propuesta de ChatGPT: el registro debe describir estas dos
herramientas como **"preparadas para promoción"**, no "promovidas", hasta que
el PR esté efectivamente fusionado en `main`. El registro documenta el estado
real del repositorio, no las intenciones. Voy a corregir mi copia y adjunto
el criterio para cuando se actualice tras el merge:

```
Antes del merge:  preparada-para-promocion
Después del merge: genérica-estable
```

### 5. ¿La divergencia de `mad-index` sigue existiendo realmente en el estado actual?

**Actualización — ya lo pude verificar directamente.** El usuario me compartió
un `.zip` del estado real de `sistema-mad/main` después de que escribí la
respuesta original. Con eso en mano:

**OBS-2 de ChatGPT era correcta al 100%.** El `mad-index.cjs` que hoy vive en
`sistema-mad/main` tiene **455 líneas** y la "9ª regla" completa
(`clasificarMarca`, categorías `RESERVADO`/`NO-EMITIDO`/`ABSORBIDO`/
`RENUMERADO`) — exactamente lo que describía la consulta.

Más aún: **comparé byte a byte** el `mad-index.cjs` de `sistema-mad/main`
contra el de `his-core-platform-sos/tools/mad-index.cjs` — son **idénticos,
0 diferencias**. La divergencia que yo había registrado como "pendiente de
decisión A/B/C" **ya no existe**: alguien ya sincronizó los dos archivos.

Encontré también `tools/mad-index.patch.diff` en el repo, que registra el
parche aplicado. El patch agrega, además de la 9ª regla, funcionalidad que yo
no había visto todavía: soporte para namespace `GAP`, IDs compuestos de más
de un fragmento (ej. `DA-CDS-MED-001`), detección de definiciones en filas de
tabla (`TABLE_DEF_RE`), y tratamiento de IDs terminados en `-000` como
placeholders no vividos.

**Conclusión: la sección de "divergencia mad-index" del registro debe
cerrarse como RESUELTA, no queda nada pendiente de decidir ahí.** Corrijo el
`MAD_TOOL_REGISTRY.md` en consecuencia (adjunto).

**Coincido con la recomendación de rehacer la comparación sobre los archivos
actuales antes de conservar la sección de divergencia** — es exactamente lo
que hice, y por eso puedo cerrarla ahora en lugar de dejarla abierta.

### 6. ¿`mad-render-index` debe considerarse genérico configurable o específico de SOS?

**Actualización con evidencia verificada:** con el repo real en mano, comparé
también `mad-render-index.cjs` de `sistema-mad/main` contra el del SOS — **no
son idénticos** (202 líneas de diferencia), a diferencia de `mad-index` que sí
se unificó. Y confirmé que la copia de `sistema-mad` **todavía menciona
"SOS"/"v1.83" literalmente en el código** (7 ocurrencias).

Esto confirma exactamente lo que sospechaba antes de tener el zip: **hoy es
específico de SOS, y encima diverge entre los dos repos** — es una segunda
divergencia además de la que había en `mad-index` (ya resuelta). Genera
`SOS_INDICE_MAESTRO_IDS.md` con nombre hardcodeado y depende del formato de
`document_role_rules` del perfil del SOS.

**Coincido en separar esta decisión de la promoción de Release Gate e Impact
Lite.** Y agrego un hallazgo: como ahora sabemos que `mad-index` SÍ se puede
sincronizar entre repos con éxito (ya pasó), `mad-render-index` es candidato
al mismo tratamiento — pero requiere generalizarlo primero (perfil externo
configurable), no solo copiarlo. Trabajo pendiente, no bloqueante para esta
promoción.

### 7. ¿Acepta los ajustes AJ-1, AJ-2 y AJ-3?

**Los tres, aceptados e implementados:**

- **AJ-1:** implementado. `gitChangedFiles` ahora devuelve
  `{ files, diffState }` con `diffState ∈ {disabled, ok, indeterminate}`. El
  veredicto y el exit code reflejan cada caso distinto. Ver test 5 y 6 de
  `test_impact_lite.cjs`.

- **AJ-2:** implementado. `pathMatches` exige coincidencia exacta salvo que
  el patrón declare una carpeta con `/` final. Ver test 7 y 8 de
  `test_impact_lite.cjs`.

- **AJ-3:** aceptado. Adjunto `test_release_gate.cjs` (8 casos) y
  `test_impact_lite.cjs` (8 casos), ambos con los casos mínimos que propuso
  ChatGPT (APTO, APTO CON AVISOS/REVISIÓN, documento faltante, estado
  incorrecto, hash/tamaño incorrecto, sin impacto, derivado pendiente, check
  fallido, diff indeterminado). Los agregué al **mismo PR** — ver orden de
  commits en el punto 9.

### 8. ¿Qué archivos exactos deberían integrar el PR?

```
tools/mad-release-gate.cjs           (sin cambios respecto a la entrega previa)
tools/test_release_gate.cjs          (nuevo)
docs/MAD_RELEASE_GATE.md             (sin cambios)
docs/examples/release-example.json   (sin cambios)

tools/mad-impact-lite.cjs            (v0.3 — reemplaza la entrega previa v0.2)
tools/test_impact_lite.cjs           (nuevo)
docs/MAD_IMPACT_LITE.md              (v0.3 — reemplaza la entrega previa)
docs/examples/impact-registry-example.json  (sin cambios)

docs/coordinacion/MAD_TOOL_REGISTRY.md            (corregido: "preparada" en vez de "promovida")
package.json                         (agrega release:gate, impact:lite, y
                                       scripts de test si corresponde)
```

Sobre el archivo `mad-impact-lite_1.cjs` sin renombrar que menciona la
consulta (punto 7 de la consulta original): confirmo que no debe subirse con
ese nombre. El destino correcto y único es `tools/mad-impact-lite.cjs`.

### 9. ¿Qué orden de commits recomienda?

Ajusto la propuesta de ChatGPT agregando las pruebas en el mismo commit que
cada herramienta (mejor trazabilidad: el commit que agrega la herramienta
también prueba que funciona):

```
Commit 1: feat: incorpora mad-release-gate v0.2 + tests
  - tools/mad-release-gate.cjs
  - tools/test_release_gate.cjs
  - docs/MAD_RELEASE_GATE.md
  - docs/examples/release-example.json

Commit 2: feat: incorpora mad-impact-lite v0.3 (configurable + AJ-1/AJ-2) + tests
  - tools/mad-impact-lite.cjs
  - tools/test_impact_lite.cjs
  - docs/MAD_IMPACT_LITE.md
  - docs/examples/impact-registry-example.json

Commit 3: chore: agrega scripts release:gate e impact:lite a package.json

Commit 4: docs: actualiza registro real del toolchain MAD
  - docs/coordinacion/MAD_TOOL_REGISTRY.md (estado real post-merge, sección mad-index
    marcada como pendiente de re-verificación — ver punto 5)
```

### 10. ¿Qué pruebas o verificaciones desea ejecutar sobre el PR antes de aprobarlo?

Antes de aprobar el merge, pediría que se confirme en el propio PR (por
ejemplo en la descripción o como comentario) que:

1. `node tools/test_release_gate.cjs` da `8/8 PASS` en el entorno del PR
2. `node tools/test_impact_lite.cjs` da `8/8 PASS` en el entorno del PR
3. `node tools/mad-release-gate.cjs --help` y
   `node tools/mad-impact-lite.cjs --help` responden sin error
4. El `package.json` actualizado no rompe `npm test` ni
   `npm run test:linter` existentes

No pido nada adicional — las pruebas que agregué ya cubren los casos que
importan. Si pasan en el entorno real (no solo en el mío), apruebo el merge.

---

## Lo que falta para cerrar completamente esta ronda

### Hallazgo nuevo, no contemplado en la consulta original

Al revisar el zip real del repo, noté que **`tools/mad-pack.cjs` no está en
`sistema-mad/main`** — ni el archivo, ni `config/context-packs.json`, ni
`docs/MAD_PACK_CONTEXT.md`. Tampoco aparece en `gui/tools-config.json`.

Esto es la herramienta que construimos para armar paquetes de contexto para
IA (los PACK-IA-001 a 007), con la que se pensaba lanzar `AMB-FRONTERA-001`.
Se especificó su promoción hace un tiempo, pero **parece que nunca se
completó el paso de subirla al repo.**

No es bloqueante para el PR de Release Gate / Impact Lite, pero conviene que
quede registrado para no perderla de vista. Si querés, puedo volver a generar
`mad-pack.cjs` (ya lo tengo probado) para incluirlo en un PR separado o en
este mismo si Claudio lo prefiere.

### Punto verificado y cerrado

~~Verificación pendiente (punto 5)~~ — **Resuelto.** Con el zip del repo real,
confirmé que `mad-index` ya está unificado (0 diferencias entre ambos repos).
La sección de divergencia del registro queda cerrada.

Todo lo demás (Release Gate, Impact Lite, sus tests, y el orden del PR) queda
aprobado para avanzar.
