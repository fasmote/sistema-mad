# MAD-Impact Lite — Sincronización e impacto documental

## Qué es

`mad-impact-lite` comprueba dos cosas antes de aceptar un cambio documental
(típicamente en un Pull Request):

1. **Sincronización estática:** que ciertos archivos existan y contengan (o no
   contengan) fragmentos de texto declarados.
2. **Impacto de cambios:** cuando cambia un archivo "fuente", avisa qué archivos
   "derivados" deberían revisarse en el mismo cambio.

El problema que resuelve el punto 2:

```
Cambiaste docs/contratos.md (la fuente)
   pero te olvidaste de actualizar docs/resumen.md (el derivado)
   → mad-impact-lite lo detecta y avisa antes de que el PR se apruebe
```

No modifica nada ni decide contenido. Solo verifica y avisa.

---

## Origen

Nació en `his-core-platform-sos` y se promovió a `sistema-mad` como producto
genérico en dos etapas:

**v0.1 → v0.2:** todo lo específico del SOS pasó a ser configurable desde el
registro (nombres de archivo, resumen de estado, bloque de reglas).

**v0.2 → v0.3:** ajustes de robustez detectados en revisión cruzada (ChatGPT,
moderador del proyecto SOS), antes de la promoción final:

- **Diff indeterminado vs `--no-diff`:** antes, si git no podía calcular el
  rango de cambios (por ejemplo un repo con un solo commit), la herramienta
  lo trataba igual que `--no-diff` y podía dar un veredicto **APTO** sin haber
  evaluado el impacto realmente. Ahora se distingue: `--no-diff` es una
  decisión válida del usuario (no penaliza); un diff que no pudo calcularse
  fuerza **APTO CON REVISIÓN**, y con `--strict-impact` bloquea (exit 3). No
  se asume "sin impacto" cuando en realidad no se supo.

- **Coincidencia de rutas exacta:** antes, un patrón como `docs/doc.md` (sin
  barra final) coincidía por prefijo, así que cambiar `docs/doc.md.bak`
  activaba por error el mismo trigger que `docs/doc.md`. Ahora la coincidencia
  es **exacta** salvo que el patrón declare explícitamente una carpeta
  (terminada en `/`), en cuyo caso sí actúa como prefijo.

Las pruebas de estos dos casos están en `tools/test_impact_lite.cjs`.

---

## Uso

```bash
# Básico (solo registro)
node tools/mad-impact-lite.cjs --registry registro.json

# Con resumen de estado
node tools/mad-impact-lite.cjs --registry registro.json --state estado.json

# Con rama base específica para el diff
node tools/mad-impact-lite.cjs --registry registro.json --base main

# Bloqueante: falla si hay derivados sin revisar
node tools/mad-impact-lite.cjs --registry registro.json --strict-impact

# Solo checks estáticos, sin impacto
node tools/mad-impact-lite.cjs --registry registro.json --no-diff

# Ayuda
node tools/mad-impact-lite.cjs --help
```

---

## El registro (registro.json)

```json
{
  "schema_version": "0.01",

  "checks": [
    {
      "path": "docs/documento.md",
      "must_contain": ["texto que DEBE estar"],
      "must_not_contain": ["texto obsoleto que NO debe estar"]
    }
  ],

  "sync_groups": [
    {
      "id": "GRUPO-001",
      "title": "Descripción del grupo",
      "triggers": ["docs/fuente.md"],
      "expected_updates": ["docs/derivado-1.md", "docs/derivado-2.md"]
    }
  ],

  "state_summary": {
    "key": "nfm",
    "label": "Módulos",
    "fields": ["version", "state"]
  },

  "context_rule": {
    "title": "Regla para cambio de contexto",
    "read_first": ["estado.json", "registro.json"],
    "note": "Una IA no debe afirmar que auditó todo si solo leyó este paquete."
  }
}
```

### Los campos

| Campo | Obligatorio | Qué hace |
|---|---|---|
| `checks` | No | Verificación estática de fragmentos por archivo |
| `sync_groups` | No | Grupos fuente→derivados para el impacto |
| `state_summary` | No | Cómo resumir el archivo de estado |
| `context_rule` | No | Bloque de recordatorio para quien retoma |

### checks

Cada check verifica un archivo:
- `must_contain`: fragmentos que **deben** estar presentes
- `must_not_contain`: fragmentos obsoletos que **no deben** quedar

Si falla algún check, el veredicto es **NO APTO** (exit 2).

### sync_groups

El corazón de la herramienta. Cada grupo dice:
- `triggers`: si cambia algo que matchea estas rutas...
- `expected_updates`: ...entonces estos archivos deberían haber cambiado también.

Los `expected_updates` que **no** cambiaron se listan como "pendientes de revisión".
Por defecto es un aviso; con `--strict-impact` bloquea (exit 3).

### state_summary (opcional)

Cómo resumir el archivo de estado (`--state`):
- `key`: qué clave del JSON recorrer (ej. `nfm`, `modules`, `components`)
- `label`: título de la sección en el reporte
- `fields`: qué campos mostrar de cada entrada

Si no se declara, no se muestra resumen de estado.

### context_rule (opcional)

Un bloque de recordatorio para quien retoma el trabajo (humano o IA):
- `title`: título del bloque
- `read_first`: lista de archivos a leer primero
- `note`: nota final

Si no se declara, se omite. Es totalmente configurable por proyecto.

---

## Veredictos y exit codes

| Veredicto | Cuándo | Exit code |
|---|---|---|
| **APTO** | Checks OK, diff calculado, sin impactos pendientes | 0 |
| **APTO CON REVISIÓN** | Checks OK, pero hay derivados sin revisar, o el diff no pudo calcularse | 0 (o 3 con `--strict-impact`) |
| **NO APTO** | Algún check estático falla | 2 |

### Los tres estados del diff

| Estado | Cuándo ocurre | Efecto en el veredicto |
|---|---|---|
| `disabled` | Se pasó `--no-diff` explícitamente | Ninguno — es una decisión válida |
| `ok` | git pudo calcular el rango de cambios | Se evalúa el impacto normalmente |
| `indeterminate` | git no pudo calcular el rango (ej. repo con un solo commit) | Fuerza APTO CON REVISIÓN; bloquea con `--strict-impact` |

Esta distinción existe para no confundir "no hay impacto" con "no se pudo
evaluar el impacto" — son situaciones muy distintas y silenciar la segunda
sería peligroso en un gate de CI.

---

## Integración con CI

Típicamente se corre en cada Pull Request. El `--base` define contra qué comparar:

```yaml
- name: Impact check
  run: node tools/mad-impact-lite.cjs --registry registro.json --base ${{ github.base_ref }}
```

Si querés que un derivado sin actualizar **bloquee** el merge, agregá
`--strict-impact`.

---

## Relación con las otras herramientas

| Herramienta | Rol |
|---|---|
| mad-linter | Coherencia interna del corpus |
| mad-snapshot | Censo de artefactos |
| mad-diff | Qué cambió entre dos versiones |
| **mad-impact-lite** | **Qué derivados quedan desactualizados tras un cambio** |
| mad-release-gate | Certifica la publicación |

`mad-diff` mira dos versiones completas. `mad-impact-lite` mira un solo cambio
(un PR) y avisa qué quedó sin sincronizar. Son complementarias.

---

*Parte del Sistema MAD — github.com/fasmote/sistema-mad*
*Promovida desde his-core-platform-sos.*
