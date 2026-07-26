# MAD-Release Gate — Puerta de publicación

## Qué es

`mad-release-gate` es una herramienta determinística que **certifica una
publicación** antes de que ocurra. En lugar de "confío en que la versión está
bien", produce una prueba concreta de qué se validó, con qué commit, y con qué
hashes de archivos.

```
Sin gate:  "publiqué la versión 1.0"           → afirmación sin prueba
Con gate:  "versión 1.0, commit abc123,        → prueba reproducible
            5 archivos con SHA-256, veredicto APTO"
```

---

## Origen

Esta herramienta nació en el proyecto `his-core-platform-sos` y se promovió a
`sistema-mad` como producto genérico (v0.1 → v0.2). No depende de ningún dominio
ni de nombres internos de ningún proyecto: todo lo específico vive en el archivo
de declaración `.release.json`.

Cambios de la promoción (v0.1 → v0.2):
- Encabezado de documentación completo
- Flag `--help`
- Este documento
- La lógica de validación quedó **idéntica** — probada y funcionando

---

## Qué hace, paso a paso

1. Lee una **declaración de release** (un JSON que vos definís)
2. Verifica que los **documentos obligatorios** existan y contengan el texto requerido
3. Verifica el **estado del proyecto** (campos de un JSON de estado)
4. Verifica el **artefacto** (sus bytes: tamaño y SHA-256) si está versionado
5. Consulta si otras herramientas MAD pasaron (vía variables de entorno)
6. Calcula un **veredicto**: APTO / APTO CON AVISOS / NO APTO
7. Genera un **manifiesto reproducible** (JSON) y un **reporte legible** (texto)

---

## Qué NO hace

No reemplaza a las otras herramientas MAD. Las complementa:

| Herramienta | Rol |
|---|---|
| mad-linter | Verifica coherencia documental |
| mad-snapshot | Censo de artefactos |
| mad-index | Índice de artefactos |
| mad-impact | Qué se desactualiza tras un cambio |
| **mad-release-gate** | **Certifica que la publicación está lista y demostrable** |

El gate puede *exigir* que las otras hayan pasado (ver "Integración con CI").

---

## Uso

```bash
# Básico
node tools/mad-release-gate.cjs --release declaracion.json

# Con artefacto a verificar por bytes
node tools/mad-release-gate.cjs --release declaracion.json --artifact dist/entregable.html

# Con salidas personalizadas
node tools/mad-release-gate.cjs \
  --release declaracion.json \
  --manifest out/manifest.json \
  --report out/report.txt

# Ayuda
node tools/mad-release-gate.cjs --help
```

---

## El archivo de declaración (.release.json)

Este es el corazón de la herramienta. Define qué se valida. Ejemplo genérico:

```json
{
  "schema_version": "0.01",
  "release_id": "MI-RELEASE-001",
  "title": "Publicación de ejemplo",
  "target_version": "v1.0",
  "release_kind": "document",
  "corpus_scope": "active-set",

  "required_documents": [
    {
      "path": "docs/mi-documento.md",
      "document_role": "canonical",
      "version": "v1.0",
      "must_contain": ["texto que DEBE estar presente"]
    }
  ],

  "required_state": {
    "path": "estado-proyecto.json",
    "json_checks": {
      "baseline.state": "frozen"
    }
  },

  "artifact": {
    "storage_mode": "repository-file",
    "versioned_repository_path": "dist/entregable.html",
    "expected_size_bytes": 12345,
    "expected_sha256": "abc123..."
  },

  "release_policy": {
    "require_zero_hard_findings": true,
    "require_impact_clean": true,
    "require_zero_actionable_orphans": true,
    "allow_external_artifact": false,
    "require_versioned_bytes_for_full_apto": true,
    "external_artifact_max_verdict": "APTO CON AVISOS"
  },

  "known_notices": ["aviso conocido y aceptado"]
}
```

### Los campos

| Campo | Qué hace |
|---|---|
| `release_id`, `title`, `target_version` | Identifican la publicación |
| `release_kind` | Tipo: document, artifact, version, etc. |
| `corpus_scope` | Alcance: active-set, full-history, release-package... |
| `required_documents` | Archivos que deben existir; `must_contain` exige texto |
| `required_state` | Un JSON de estado y checks sobre sus campos |
| `artifact` | El entregable y cómo se verifica |
| `release_policy` | Qué se exige para dar APTO |
| `known_notices` | Avisos aceptados de antemano |

### storage_mode del artefacto

| Modo | Significado |
|---|---|
| `repository-file` | El artefacto es un archivo versionado. Se verifican sus bytes (tamaño + SHA-256). |
| `external-evidence` | El artefacto todavía no está versionado. Se valida por evidencia documental. Requiere `allow_external_artifact: true`. |

---

## Integración con CI (variables de entorno)

El gate puede exigir que otras herramientas MAD hayan pasado. Como el gate no
las corre él mismo, se le informa el resultado vía variables de entorno:

| Variable | Informa si... |
|---|---|
| `MAD_IMPACT_CLEAN` | mad-impact pasó limpio |
| `MAD_LINTER_CLEAN` | mad-linter dio 0 hallazgos duros |
| `MAD_ZERO_ACTIONABLE_ORPHANS` | el índice no tiene huérfanos accionables |
| `MAD_INDEX_REPRODUCIBLE` | el índice maestro es reproducible |

Cada una acepta `true/1/yes` o `false/0/no`. Si no se define, se informa como
"no informado" (genera aviso, no bloquea).

Ejemplo en un GitHub Action:

```yaml
- name: Release Gate
  env:
    MAD_LINTER_CLEAN: ${{ steps.linter.outcome == 'success' }}
    MAD_IMPACT_CLEAN: 'true'
  run: node tools/mad-release-gate.cjs --release declaracion.json
```

---

## Veredictos

| Veredicto | Cuándo | Exit code |
|---|---|---|
| **APTO** | Sin hallazgos duros ni avisos | 0 |
| **APTO CON AVISOS** | Sin hallazgos duros, pero hay avisos | 0 |
| **NO APTO** | Al menos un hallazgo duro | 1 |

Un artefacto `external-evidence` no puede dar APTO pleno si la política exige
bytes versionados (`require_versioned_bytes_for_full_apto`): su veredicto máximo
es `external_artifact_max_verdict` (típicamente APTO CON AVISOS). Esto refleja
que un entregable aún no versionado no está 100% probado.

---

## Salidas

**release-manifest.json** — el manifiesto reproducible. Contiene el commit, el
veredicto, los hashes de cada archivo, y los resultados de cada check. Es la
prueba que queda registrada.

**release-report.txt** — el reporte legible para humanos, con el mismo contenido
en formato de texto.

---

## Por qué es determinística

Dado el mismo commit y los mismos archivos, el gate produce siempre el mismo
manifiesto (salvo la marca de tiempo). Los SHA-256 son reproducibles. Esto
significa que cualquiera puede re-correr el gate sobre el mismo commit y obtener
exactamente el mismo veredicto — no depende de criterio humano ni de IA.

---

*Parte del Sistema MAD — github.com/fasmote/sistema-mad*
*Promovida desde his-core-platform-sos.*
