# MAD_HISTORIAL_DECISIONES — Registro vivo de decisiones

| Campo | Valor |
|---|---|
| **Documento** | `MAD_HISTORIAL_DECISIONES` |
| **Tipo** | Registro vivo único (no se reinicia, no se versiona por entrada) |
| **Zona horaria** | America/Argentina/Buenos_Aires (ART) |
| **Volver a** | `coordinacion/MAD_TOOL_REGISTRY.md` · `coordinacion/` |

## Qué es este documento

El historial de decisiones del proyecto Sistema MAD. Una entrada por sesión
de trabajo relevante — qué se decidió, qué se construyó, qué quedó pendiente.

Es la fuente de verdad **compartida** entre Claudio (árbitro humano), Claude
(constructor de `sistema-mad`) y ChatGPT (moderador del SOS). Ninguna de las
IAs tiene memoria del historial de la otra — este documento es el puente.

## Regla de este registro

Igual que `SOS_TRANSVERSAL_CHANGELOG.md`: es un **registro vivo único**. No
se reinicia, no se reescribe el pasado, no se crea un archivo nuevo por cada
sesión chica. Las entradas se agregan al final, en orden cronológico.

**Cuándo SÍ crear un archivo aparte (fechado):** cuando una sesión produce
documentación extensa que merece su propio espacio — una consulta formal
entre IAs, un análisis largo, una decisión con mucho detalle técnico. Ese
archivo va en `docs/coordinacion/sesiones/AAAA-MM-DD-tema-corto.md`, y la
entrada acá en el historial queda como resumen de 3-4 líneas con el link.

```
Resumen corto + decisión → siempre acá (este archivo)
Detalle largo / consulta formal / anexo técnico → archivo fechado aparte, linkeado
```

## Cómo agregar una entrada nueva

1. Fecha en formato `AAAA-MM-DD ART` (o `AAAA-MM-DD HH:mm ART` si el sello lo amerita)
2. Título corto de la sesión
3. 3-6 líneas: qué se decidió / construyó / encontró
4. Si hay archivo de detalle aparte, link relativo
5. Pendientes que quedaron abiertos (si los hay)

Plantilla para copiar:

```markdown
## AAAA-MM-DD — Título corto de la sesión

**Decisión / resultado:** ...

**Construido:** ...

**Pendiente:** ...

**Detalle:** [docs/coordinacion/sesiones/AAAA-MM-DD-tema.md](coordinacion/sesiones/AAAA-MM-DD-tema.md) (si aplica)
```

---

## Entradas

### 2026-06-24/25 — Sincronización entre PCs y arranque de herramientas de verificación

**Decisión/resultado:** detectado y resuelto el conflicto `.js` vs `.cjs` (ES
Module vs CommonJS) que rompía el linter en cada PC nueva. Se estandarizó
`.cjs` para todo el toolchain de `tools/`.

**Construido:** `mad-snapshot.cjs` (censo de artefactos + sello temporal ART +
detección de IDs perdidos entre corridas) y `mad-diff.cjs` (comparación de
contenido entre dos versiones del corpus).

**Pendiente en ese momento:** instalar y calibrar la GitHub Action en el
repo del SOS.

---

### 2026-06-26 — GUI de escritorio + limpieza del repositorio

**Decisión/resultado:** se aprobó la propuesta de arquitectura de Claude Code
para la GUI (Electron, `tools-config.json` externo y ampliable, zona de
drag&drop, exportación a .md/.txt/.pdf/.xlsx), con tres ajustes: separar la
exportación de reportes del flag `--salida` interno, corregir el placeholder
de `--tipo` en mad-diff, y no tratar el exit code 1 de las herramientas como
error de ejecución.

**Construido:** interfaz gráfica completa (commit `ff9d55a`, 26/06 19:36 ART),
seguida de una limpieza (commit `2ae4a03`) que eliminó los `.js` obsoletos del
linter y sacó `.claude/` del control de versiones.

**Detalle:** instrucciones de instalación documentadas en `gui/INICIO.md`.

---

### 2026-06-26/27 — Calibración de la GitHub Action sobre el corpus SOS real

**Decisión/resultado:** tres iteraciones para que el linter dejara de marcar
como error el ruido esperado del histórico (versiones v1.42 a v1.83
conviviendo, documentos B/D/E/F/G/H/I/K del baseline). Resultado final:
**0 hallazgos duros** sobre la fuente vigente (Documento A + registros
vivos), manteniendo el snapshot apuntando a `./docs` completo para el censo
histórico (301 artefactos).

**Construido:** `lint-docs.yml` calibrado — el linter apunta solo a
`CORE_v1_83_INDEX.md` + Documento A + `00_CONTEXTO`/`02_META`/`03_TRANSVERSAL`/
`04_NFM`/`05_DOSSIERS`; el snapshot sigue viendo todo `./docs`.

**Pendiente:** agregar `RF-MAD-CAND-001..007` y `RF-NFM-AMB-001` al
`BACKLOG_RF` del linter (se hizo directo en GitHub por Claudio, ya resuelto).

---

### 2026-06-27/28 — Modelo híbrido de trabajo entre sistema-mad y el SOS

**Decisión/resultado:** adoptado el modelo híbrido pragmático. `sistema-mad`
es el motor y la fuente de verdad del método; `his-core-platform-sos` es el
primer cliente y puede crear herramientas propias cuando la velocidad importa
más que el orden. Regla rectora: *"una herramienta nace donde se necesita;
cuando prueba ser genérica y estable, sube a sistema-mad; nunca vive con vida
propia en los dos repos a la vez."*

**Roles:** Claudio = árbitro humano; Claude = implementación de `sistema-mad`;
ChatGPT = moderador/analista del SOS y puente de lecciones SOS → MAD.

**Construido:** `MAD_TOOL_REGISTRY.md` — mapa único de qué herramienta vive
dónde y su estado de promoción.

**Detalle:** análisis completo de ChatGPT sobre el estado real de MAD en
`docs/coordinacion/sesiones/2026-06-27-analisis-chatgpt-mad.md`.

---

### 2026-06-28 — Construcción de mad-pack (paquetes de contexto para IA)

**Decisión/resultado:** construida `mad-pack.cjs` — arma paquetes de contexto
(`PACK-IA-001` a `007`) para pasarle a una IA sin enviarle todo el repo.
Decisiones de diseño: `--repo` obligatorio (sistema-mad es el motor, el repo
objetivo es externo); `--packs` permite config externa por proyecto;
`visibility` (public/internal/private) protege material sensible;
`--create-out-dir` es opt-in — por defecto NO crea carpetas de salida
automáticamente, para no ocultar errores de ruta del usuario.

**Construido:** `mad-pack.cjs`, `config/context-packs.json` (7 packs
completos del SOS), `docs/MAD_PACK_CONTEXT.md`.

**Pendiente (detectado luego, 2026-07):** esta herramienta nunca llegó a
fusionarse en `main` de `sistema-mad` — ver entrada de verificación abajo.

---

### 2026-07 — Promoción de mad-release-gate y mad-impact-lite; verificación contra el repo real

**Decisión/resultado:** **promovidas e incorporadas en `sistema-mad`** dos
herramientas nacidas y probadas en el SOS, mediante la rama
`feat/promote-release-impact-tools` y un PR con cuatro commits. Se trata de
versiones genéricas de `sistema-mad`: `mad-release-gate` v0.2 (puerta de
publicación determinística) y `mad-impact-lite` v0.3 (sincronización e
impacto de cambios documentales, con `state_summary` y `context_rule`
configurables para no depender de la estructura del SOS).

ChatGPT hizo una revisión cruzada rigurosa (documento de consulta formal) y
encontró tres problemas reales, los tres aceptados y corregidos:
- **AJ-1:** el diff indeterminado (git no puede calcular el rango) se
  confundía con `--no-diff` explícito, pudiendo dar un veredicto APTO sin
  haber evaluado el impacto. Corregido: ahora distingue `disabled` / `ok` /
  `indeterminate`, y con `--strict-impact` el estado indeterminado bloquea.
- **AJ-2:** la coincidencia de rutas por prefijo generaba falsos positivos
  (`docs/doc.md` matcheaba `docs/doc.md.bak`). Corregido a coincidencia
  exacta salvo declaración explícita de carpeta.
- **AJ-3:** se agregaron `test_release_gate.cjs` y `test_impact_lite.cjs`
  (8/8 PASS cada uno).

**Verificación clave:** al recibir un `.zip` real del repo `sistema-mad`, se
confirmó que la divergencia de `mad-index.cjs` entre `sistema-mad` y el SOS
**ya estaba resuelta** (0 diferencias, unificada vía patch con la "9ª regla"
de clasificación RESERVADO/NO-EMITIDO/ABSORBIDO/RENUMERADO). En cambio,
`mad-render-index.cjs` **sí sigue divergiendo** y sigue siendo específico
del SOS. Y se descubrió que **`mad-pack.cjs` nunca llegó a `main`** — quedó
especificado pero no fusionado.

**Pendiente:**
- Re-generar y subir `mad-pack.cjs` en un PR separado
- Generalizar `mad-render-index.cjs` (requiere perfil configurable, no solo copia)

**Detalle:** consulta formal de ChatGPT y respuesta punto por punto en
`docs/coordinacion/sesiones/2026-07-promocion-release-gate-impact-lite.md`.

---

<!--
  Próxima entrada: agregar acá arriba de esta línea, siguiendo la plantilla
  de más arriba. No borrar entradas anteriores — es un registro histórico.
-->
