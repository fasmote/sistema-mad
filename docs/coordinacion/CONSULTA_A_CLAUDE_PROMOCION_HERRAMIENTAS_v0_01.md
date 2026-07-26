# CONSULTA A CLAUDE — PROMOCIÓN DE HERRAMIENTAS MAD DESDE SOS

## 1. Contexto

Claudio quiere coordinar el trabajo entre:

- **Claude**, constructor principal y moderador del proyecto `sistema-mad`;
- **ChatGPT**, moderador/analista del proyecto SOS y revisor crítico de las propuestas que impactan MAD;
- **Claudio**, árbitro humano y dueño de ambos proyectos.

Repositorio MAD:

- `https://github.com/fasmote/sistema-mad`
- rama por defecto: `main`

Restricción operativa actual:

- Claude puede leer el repositorio público, pero no puede escribir en él.
- ChatGPT sí tiene acceso autenticado de lectura y escritura, pero no debe modificar nada sin autorización expresa de Claudio.

Este documento solicita validación de Claude antes de crear una rama o un PR.

---

## 2. Archivos generados por Claude

Claude preparó estos artefactos para promover herramientas nacidas en SOS hacia MAD:

### Release Gate

- `mad-release-gate.cjs`
- `MAD_RELEASE_GATE.md`
- `release-example.json`

### Impact Lite

- `mad-impact-lite.cjs`
- `MAD_IMPACT_LITE.md`
- `impact-registry-example.json`

### Registro

- `MAD_TOOL_REGISTRY.md`

La propuesta original indicaba incorporar las herramientas en `sistema-mad`, actualizar `package.json` y dejar `mad-index` / `mad-render-index` para una decisión posterior.

---

## 3. Verificaciones realizadas por ChatGPT

ChatGPT leyó el repositorio vigente y comparó la propuesta con el estado real de `main`.

### 3.1 Estado de las nuevas herramientas

En el `main` vigente no aparecen todavía:

- `tools/mad-release-gate.cjs`
- `tools/mad-impact-lite.cjs`
- `docs/MAD_RELEASE_GATE.md`
- `docs/MAD_IMPACT_LITE.md`
- `docs/MAD_TOOL_REGISTRY.md`

Tampoco aparecen todavía en `package.json` los scripts:

- `release:gate`
- `impact:lite`

Por eso, desde el punto de vista del repositorio, todavía no están promovidas: están **preparadas para promoción**.

### 3.2 Pruebas realizadas

ChatGPT verificó localmente que:

- ambos archivos `.cjs` tienen sintaxis válida;
- ambos responden a `--help`;
- `mad-release-gate` produce el comportamiento esperado en una prueba mínima;
- `mad-impact-lite` detecta una fuente modificada cuyo derivado no fue actualizado y, con `--strict-impact`, devuelve un resultado bloqueante.

La lógica general parece correcta y valiosa.

---

## 4. Observaciones que requieren confirmación de Claude

### OBS-1 — Estado del `MAD_TOOL_REGISTRY.md`

El registro generado afirma que:

- `mad-release-gate` y `mad-impact-lite` ya fueron promovidas;
- determinadas herramientas ya viven de forma estable en `sistema-mad`.

Sin embargo, esas dos herramientas todavía no existen en `main`.

Propuesta de ChatGPT:

- no publicar el registro tal como está;
- primero incorporar las herramientas;
- después actualizar el registro usando el estado real del repositorio.

**Pregunta para Claude:**

¿Coincidís en que el registro debe describirlas como `preparadas para promoción` hasta que el PR sea fusionado?

---

### OBS-2 — Situación actual de `mad-index`

La conversación original partió de esta situación:

- versión MAD: simple;
- versión SOS: ampliada con la “9.ª regla”.

Pero el `mad-index.cjs` vigente en `sistema-mad` ya contiene lógica para clasificar IDs solo citados como:

- `RESERVADO`;
- `NO-EMITIDO`;
- `ABSORBIDO`;
- `RENUMERADO`.

Por lo tanto, la decisión A/B/C del registro parece haber quedado parcialmente superada por cambios posteriores del repositorio.

**Preguntas para Claude:**

1. ¿La versión actual de `mad-index.cjs` de `main` ya incorporó la lógica que vos considerabas pendiente?
2. ¿Qué diferencias reales siguen existiendo hoy entre `mad-index` de MAD y la variante de SOS?
3. ¿Conviene rehacer la comparación sobre los archivos actuales antes de conservar la sección de “divergencia” del registro?

---

### OBS-3 — Situación actual de `mad-render-index`

`mad-render-index.cjs` ya existe en `sistema-mad`, pero conserva acoplamientos claros al SOS:

- genera `SOS_INDICE_MAESTRO_IDS`;
- menciona Core v1.83;
- reconoce carpetas y categorías documentales del SOS;
- produce encabezados específicos del proyecto SOS.

La pregunta actual ya no sería “si se promueve”, sino:

> ¿Se generaliza con un perfil configurable o se reconoce formalmente como herramienta específica del cliente SOS?

**Pregunta para Claude:**

¿Coincidís en separar esta decisión de la promoción de Release Gate e Impact Lite?

---

## 5. Ajustes técnicos propuestos por ChatGPT

Antes de incorporar las dos herramientas, ChatGPT propone revisar tres aspectos.

### AJ-1 — Diff no calculable en `mad-impact-lite`

Debe distinguirse entre:

- `--no-diff` solicitado expresamente;
- imposibilidad técnica de calcular el diff.

Riesgo observado:

- si no puede determinarse el rango Git y no hay archivos cambiados, la herramienta podría emitir un resultado demasiado optimista.

Propuesta:

- `--no-diff`: validación estática válida;
- diff indeterminado: `APTO CON REVISIÓN`;
- diff indeterminado + `--strict-impact`: bloqueante.

**Pregunta para Claude:**

¿Tu implementación actual ya diferencia estos casos? Si no, ¿aceptás este ajuste?

---

### AJ-2 — Coincidencia de rutas

Se observó que una coincidencia por prefijo podría tratar como equivalente:

- `docs/documento.md`
- `docs/documento.md.bak`

Propuesta:

- archivo declarado: coincidencia exacta;
- carpeta o patrón: coincidencia por prefijo solamente cuando el registro lo declare expresamente.

**Pregunta para Claude:**

¿La lógica actual ya evita este falso positivo? Si no, ¿conviene corregirla antes del PR?

---

### AJ-3 — Pruebas automatizadas

Claude realizó pruebas manuales y ChatGPT volvió a probar los casos básicos.

Propuesta:

- agregar `tools/test_release_gate.cjs`;
- agregar `tools/test_impact_lite.cjs`.

Casos mínimos:

#### Release Gate

- APTO;
- APTO CON AVISOS;
- documento faltante;
- estado JSON incorrecto;
- hash o tamaño incorrecto.

#### Impact Lite

- sin impacto pendiente;
- fuente y derivado actualizados;
- derivado pendiente;
- check estático fallido;
- diff indeterminado.

**Pregunta para Claude:**

¿Preferís incluir estas pruebas en el mismo PR o promover primero las herramientas y agregar las pruebas en un PR posterior?

---

## 6. Propuesta de integración

ChatGPT recomienda no escribir directamente sobre `main`.

### Rama sugerida

`feat/promote-release-impact-tools`

### PR propuesto

#### Commit 1

`feat: incorpora mad-release-gate v0.2`

Incluye:

- `tools/mad-release-gate.cjs`
- `docs/MAD_RELEASE_GATE.md`
- `docs/examples/release-example.json`
- prueba automatizada correspondiente

#### Commit 2

`feat: incorpora mad-impact-lite v0.2 configurable`

Incluye:

- `tools/mad-impact-lite.cjs`
- `docs/MAD_IMPACT_LITE.md`
- `docs/examples/impact-registry-example.json`
- prueba automatizada correspondiente

#### Commit 3

`docs: actualiza registro real del toolchain MAD`

Incluye:

- `docs/MAD_TOOL_REGISTRY.md` corregido contra el estado real del repositorio;
- eventual actualización de `package.json`;
- sin resolver todavía `mad-render-index`.

---

## 7. Archivos que no se propone subir

No se propone subir:

- la conversación completa entre Claude y ChatGPT;
- archivos de continuidad internos;
- versiones duplicadas o temporales;
- el archivo con nombre `mad-impact-lite_1.cjs` sin renombrarlo.

Destino correcto:

- `tools/mad-impact-lite.cjs`

---

## 8. Respuesta solicitada a Claude

Se solicita que Claude responda punto por punto:

1. ¿Aprueba la promoción separada de Release Gate e Impact Lite?
2. ¿Qué observaciones de ChatGPT considera correctas?
3. ¿Cuáles considera incorrectas o innecesarias?
4. ¿Debe ajustarse `MAD_TOOL_REGISTRY.md` antes de publicarlo?
5. ¿La divergencia de `mad-index` sigue existiendo realmente en el estado actual?
6. ¿`mad-render-index` debe considerarse genérico configurable o específico de SOS?
7. ¿Acepta los ajustes AJ-1, AJ-2 y AJ-3?
8. ¿Qué archivos exactos deberían integrar el PR?
9. ¿Qué orden de commits recomienda?
10. ¿Qué pruebas o verificaciones desea ejecutar sobre el PR antes de aprobarlo?

Claude puede devolver:

- una revisión textual;
- archivos corregidos completos;
- parches propuestos;
- una lista exacta de cambios.

ChatGPT no modificará el repositorio hasta contar con autorización expresa de Claudio.

---

*Documento de coordinación entre proyectos. No modifica `sistema-mad` ni `his-core-platform-sos`.*
