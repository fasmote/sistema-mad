# MAD-Pack — Paquetes de contexto para IA

## Qué es

`mad-pack` es una herramienta CLI del repositorio `sistema-mad` que arma
paquetes de contexto para enviarle a una IA sin pasarle todo el repositorio
del proyecto.

El problema que resuelve:

```
El repo completo no entra en el contexto de una IA.
Pero pasar poco contexto produce respuestas pobres y sin trazabilidad.
mad-pack elige exactamente los documentos necesarios para cada objetivo.
```

---

## Origen y versión

`mad-pack` nació durante el trabajo del proyecto cliente SOS y fue recuperada,
generalizada y endurecida antes de incorporarse como herramienta de producto en
`sistema-mad`.

**v0.2** consolida diez correcciones surgidas de revisión cruzada. Todos los
hallazgos fueron reproducidos antes de corregirse y quedan cubiertos por
`tools/test_pack.cjs`:

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | **Symlink escape**: un enlace dentro del repo podía apuntar afuera | Se resuelve con `fs.realpathSync` y se exige que el destino real permanezca dentro del repo |
| 2 | **Flags individuales inválidos ignorados** | Los flags desconocidos y `--max-chars` inválido cortan con error |
| 3 | **Archivos vacíos anunciados pero no incluidos** | Se incluyen realmente con advertencia |
| 4 | **Límite medido sobre contenido parcial** | `--check` y generación miden el Markdown final mediante `buildMarkdown` |
| 5 | **Combinaciones inválidas de flags** | `validateCombinations` rechaza modos y opciones incompatibles |
| 6 | **Flags repetidos o absorbidos como valores** | Se rechazan duplicados y un token que empieza con `-` no puede ocultarse como valor |
| 7 | **Configuración permisiva** | Se valida la estructura del JSON y `visibility` funciona en modo fail-closed |
| 8 | **Duplicados por alias de ruta** | Se deduplica por ruta resuelta e identidad real del archivo |
| 9 | **Filtración de rutas absolutas locales** | El Markdown solo muestra el nombre del repo y una ruta relativa o basename de la configuración |
| 10 | **Riesgo de sobreescritura** | `--out` no puede reemplazar un archivo fuente ni el propio archivo de packs; los errores de escritura son explícitos |

La suite vigente contiene **41 casos de ground truth**.

---

## Concepto clave: motor vs repo objetivo

```
sistema-mad          = el motor (donde vive mad-pack)
his-core-platform-sos = el repo objetivo (donde viven los documentos)
context-packs.json   = configuración de packs del PROYECTO OBJETIVO
```

Las rutas listadas en `context-packs.json` son **relativas al `--repo`**, no a
`sistema-mad`. Esto hace que el motor sea reutilizable para cualquier proyecto.

---

## Por qué `--packs` es obligatorio en v0.2

En la primera versión, si no se pasaba `--packs`, la herramienta usaba por
defecto `config/context-packs.json` **dentro de `sistema-mad`**. Eso llevaba
a un problema estructural: si esa copia contenía la configuración real de un
cliente (como llegó a pasar con los 7 packs del SOS), el motor terminaba
teniendo una segunda fuente de verdad que podía divergir silenciosamente de
la configuración real del proyecto — exactamente lo que el modelo motor/
cliente de MAD prohíbe.

**La regla en v0.2:**

```
--pack (generar o --check)  → --packs es OBLIGATORIO
--list solo (sin --pack)    → si no hay --packs, muestra un ejemplo genérico
                               del motor, y lo anuncia explícitamente como
                               ejemplo — nunca como configuración real
```

El ejemplo genérico vive en `docs/examples/context-packs-example.json` y
tiene solo 2 packs de demostración, sin ningún dato real de ningún cliente.

---

## Instalación

```
tools/mad-pack.cjs
tools/test_pack.cjs
docs/examples/context-packs-example.json   ← solo demo, nunca config real
```

La configuración real de cada proyecto cliente vive **en ese proyecto**:

```
his-core-platform-sos/config/context-packs.json
```

---

## Comandos

### Listar packs disponibles

```bash
# Sin --packs: muestra el ejemplo genérico del motor (anunciado como tal)
node tools/mad-pack.cjs --list

# Con --packs: muestra los packs reales de un proyecto
node tools/mad-pack.cjs --list --packs ../his-core-platform-sos/config/context-packs.json
```

### Validar un pack sin generar nada (--check)

```bash
node tools/mad-pack.cjs \
  --pack PACK-IA-003 \
  --repo ../his-core-platform-sos \
  --packs ../his-core-platform-sos/config/context-packs.json \
  --check
```

Verifica que todos los archivos del pack existan en el repo objetivo (y que
ningún symlink escape del repo), que no haya duplicados, y que el tamaño del
Markdown final esté dentro del límite. Termina con exit 0 si todo OK, exit 1
si hay fallas.

**Usar siempre antes de una ronda importante.** Si `--check` pasa, el pack
está listo para generar — y el tamaño que reporta es el tamaño **real** del
Markdown que se va a generar (ver corrección #4 arriba).

### Generar el paquete (a pantalla o a archivo)

```bash
# A pantalla
node tools/mad-pack.cjs --pack PACK-IA-003 --repo ../his-core-platform-sos --packs ../his-core-platform-sos/config/context-packs.json

# A archivo
node tools/mad-pack.cjs --pack PACK-IA-003 --repo ../his-core-platform-sos --packs ../his-core-platform-sos/config/context-packs.json --out salida/amb-frontera.md

# Creando la carpeta de salida si no existe (opt-in, por defecto NO la crea)
node tools/mad-pack.cjs --pack PACK-IA-003 --repo ../his-core-platform-sos --packs ../his-core-platform-sos/config/context-packs.json --out salida/amb-frontera.md --create-out-dir
```

### Generar pack privado

```bash
node tools/mad-pack.cjs --pack PACK-IA-006 --repo ../his-core-platform-sos --packs ../his-core-platform-sos/config/context-packs.json --include-private
```

Los packs con `visibility=private` requieren el flag explícito
`--include-private`. Sin él, la herramienta corta con error.

### Controlar el límite de caracteres

```bash
node tools/mad-pack.cjs --pack PACK-IA-003 --repo ../his-core-platform-sos --packs ../his-core-platform-sos/config/context-packs.json --max-chars 80000
```

Debe ser un entero positivo — un valor no numérico o `<= 0` corta con error
(v0.2; antes se ignoraba en silencio y caía al límite por defecto).

---

## El campo visibility

| Valor | Significado | Se genera con |
|---|---|---|
| `public` | Material presentable externamente | Sin flags especiales |
| `internal` | Trabajo local, sin restricción operativa | Sin flags especiales |
| `private` | Histórico sensible, FOA, contraste operativo | `--include-private` |

---

## El campo max_chars_recomendado

Cada pack puede declarar un límite recomendado de caracteres. Si no se pasa
`--max-chars`, se usa ese valor. El límite se mide sobre el **Markdown final
completo** (con metadatos, reglas, y separadores de archivo) — no solo sobre
el contenido crudo de los archivos, para que el número que ves coincida
exactamente con lo que le vas a pasar a la IA.

---

## Formato del archivo context-packs.json

```json
{
  "PACK-IA-003": {
    "title": "Título corto",
    "purpose": "Para qué sirve este pack.",
    "visibility": "internal",
    "max_chars_recomendado": 80000,
    "files": [
      "ruta/relativa/al/repo/archivo.md"
    ],
    "rules": [
      "Regla que la IA debe seguir durante la ronda."
    ],
    "must_not_reopen": [
      "Decisión cerrada que no debe reabrirse."
    ],
    "expected_output": [
      "Qué debe producir la IA al terminar."
    ]
  }
}
```

Las rutas en `files` son **relativas al repo objetivo** (`--repo`), nunca a
`sistema-mad`.

La herramienta valida además que:

- la raíz del JSON sea un objeto;
- cada pack sea un objeto;
- `files`, `rules`, `must_not_reopen` y `expected_output` sean arrays de texto;
- `visibility` sea exactamente `public`, `internal` o `private`;
- `max_chars_recomendado`, cuando existe, sea un entero positivo;
- cada archivo use una ruta relativa, no absoluta.

Un error de configuración corta la ejecución antes de leer contenido del repo.

---

## Privacidad de la salida

El Markdown generado no expone rutas absolutas del equipo local. En los
metadatos se muestra únicamente:

- el nombre de la carpeta del repo objetivo;
- la ruta de `context-packs.json` relativa al repo, cuando está dentro de él;
- o solamente el nombre del archivo de configuración cuando vive afuera.

Esto evita filtrar nombres de usuario, unidades de red o estructura interna de
la estación de trabajo al compartir un pack público o interno.

---

## Seguridad de rutas (v0.2: incluye symlinks)

La herramienta previene dos formas de escapar del repo objetivo:

1. **Path traversal textual** — una ruta como `../../archivo.md` en el
   `files` del pack.
2. **Symlink escape** — un archivo dentro del repo que en realidad es un
   enlace simbólico apuntando afuera. Se detecta resolviendo el destino real
   con `fs.realpathSync` y verificando que también quede dentro del repo.

En ambos casos, la ruta se marca como insegura, se lista en el reporte, y
corta la generación con error (nunca se incluye el contenido).

---

## Validaciones

| Problema | Comportamiento |
|---|---|
| Pack inexistente | Error, lista los packs disponibles |
| Config de packs inexistente | Error con la ruta |
| Repo objetivo inexistente o no es carpeta | Error con la ruta |
| Archivo no encontrado en el repo | Error, lista los faltantes |
| Archivo vacío | **Se incluye igual, con aviso** (v0.2 — antes se excluía pese al mensaje) |
| Ruta insegura (path traversal o symlink fuera del repo) | Error, no continúa |
| Archivo duplicado en el pack | Se incluye una sola vez, con aviso |
| Pack supera max_chars (medido sobre el markdown final) | Error con tamaño real vs límite |
| Pack private sin --include-private | Error con instrucción de uso |
| No se puede crear carpeta de salida | Error con motivo |
| Flag desconocido | Error explícito (v0.2 — antes se ignoraba) |
| --max-chars no numérico o <= 0 | Error explícito (v0.2 — antes se ignoraba) |
| --pack sin --packs | Error explícito (v0.2 — ya no hay config real por defecto) |
| --list junto con --pack | Error: modos mutuamente excluyentes (v0.2) |
| --check / --repo / --out / --max-chars / --include-private / --create-out-dir sin --pack | Error: solo válidos con --pack (v0.2) |
| --create-out-dir sin --out | Error: solo válido junto con --out (v0.2) |
| Flag repetido | Error explícito; no se acepta “último valor gana” |
| Flag desconocido usado como supuesto valor | Error explícito |
| `--packs` sin `--list` ni `--pack` | Error: falta modo operativo |
| `--check` junto con `--out` | Error: validar y generar son modos incompatibles |
| Config raíz, arrays o tipos inválidos | Error de validación antes de leer archivos |
| `visibility` desconocida o mal escrita | Error fail-closed; nunca degrada a `internal` |
| Ruta absoluta dentro de `files` | Error: las rutas deben ser relativas al repo |
| Rutas equivalentes o aliases al mismo archivo | Se incluye una sola vez, con aviso |
| `--out` coincide con un archivo fuente o con la config | Error; el archivo original se preserva |

---

## Pruebas automatizadas

```bash
node tools/test_pack.cjs
```

La suite ejecuta **41 casos**: flujo normal, packs privados, path traversal,
symlinks internos y externos, límites, archivos vacíos, flags inválidos,
combinaciones incompatibles, configuración mal formada, deduplicación canónica,
privacidad de rutas, escape de tablas Markdown y protección contra
sobreescritura.

El resultado esperado es:

```text
Resultado: 41/41 casos PASS
DoD cumplido: SI
```

---

## Flujo de trabajo recomendado

```bash
# 1. Ver qué packs existen en un proyecto
node tools/mad-pack.cjs --list --packs ../repo-cliente/config/context-packs.json

# 2. Validar antes de generar
node tools/mad-pack.cjs --pack PACK-IA-003 --repo ../repo-cliente --packs ../repo-cliente/config/context-packs.json --check

# 3. Si el check pasa, generar
node tools/mad-pack.cjs \
  --pack PACK-IA-003 \
  --repo ../repo-cliente \
  --packs ../repo-cliente/config/context-packs.json \
  --out salida/amb-frontera-$(date +%Y%m%d).md \
  --create-out-dir

# 4. Pegar el contenido del .md a la IA que modera la ronda
```

---

## Relación con las otras herramientas MAD

| Herramienta | Rol |
|---|---|
| `mad-linter` | Verifica coherencia del corpus (referencias, IDs, alucinaciones) |
| `mad-snapshot` | Censo de artefactos con sello temporal, detecta pérdidas |
| `mad-diff` | Compara contenido entre dos versiones |
| `mad-index` | Índice persistente de artefactos y relaciones |
| `mad-release-gate` | Certifica una publicación: qué se validó, con qué commit |
| `mad-impact-lite` | Detecta documentos derivados desactualizados tras un cambio |
| **`mad-pack`** | **Arma el contexto mínimo para una ronda de debate con IA** |

---

*Parte del Sistema MAD — github.com/fasmote/sistema-mad*
