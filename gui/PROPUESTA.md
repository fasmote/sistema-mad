# Propuesta de arquitectura — GUI de herramientas MAD

## Estructura de archivos

```
gui/
├── package.json           # dependencias: electron, pdfkit, exceljs
├── main.js                # proceso principal: ventana, IPC, spawn de herramientas
├── preload.js             # contextBridge (puente seguro renderer ↔ main)
├── tools-config.json      # ← el único archivo que editás para agregar herramientas
└── renderer/
    ├── index.html         # shell HTML
    ├── app.js             # lógica de UI (renderiza tarjetas desde config, drag&drop)
    └── styles.css         # estilos sobrios
```

Sin subcarpetas `lib/` — la lógica de ejecutar herramientas y exportar resultados
vive en `main.js` (no hay complejidad suficiente para más capas).

---

## Formato del `tools-config.json`

Cada herramienta declara:

| Campo       | Tipo     | Descripción                                                    |
|-------------|----------|----------------------------------------------------------------|
| `id`        | string   | Identificador único interno                                    |
| `name`      | string   | Nombre visible en la tarjeta                                   |
| `description` | string | Descripción breve                                              |
| `command`   | string   | Ruta al .cjs relativa a la raíz del proyecto                   |
| `inputs`    | array    | Zonas de entrada (ver tabla abajo)                             |
| `flags`     | array    | Flags opcionales (ver tabla abajo)                             |

### Campos de cada `input`

| Campo      | Tipo    | Valores posibles      | Descripción                        |
|------------|---------|-----------------------|------------------------------------|
| `id`       | string  | —                     | Identificador del argumento        |
| `label`    | string  | —                     | Texto de la zona de drop/selección |
| `type`     | string  | `"folder"` / `"files"` | Qué acepta la zona                |
| `required` | boolean | `true` / `false`      | Si es obligatorio para ejecutar    |

### Campos de cada `flag`

| Campo         | Tipo    | Descripción                                |
|---------------|---------|--------------------------------------------|
| `id`          | string  | Identificador interno                      |
| `flag`        | string  | El flag tal como se pasa al CLI (`--salida`) |
| `label`       | string  | Etiqueta del campo en la UI                |
| `type`        | string  | `"text"` / `"boolean"`                     |
| `required`    | boolean | Si es obligatorio                          |
| `placeholder` | string  | Texto de ejemplo en el campo               |

---

## El archivo `tools-config.json` completo

```json
{
  "tools": [
    {
      "id": "mad-linter",
      "name": "MAD Linter",
      "description": "Detecta referencias rotas, IDs duplicados y títulos fabricados en documentos .md.",
      "command": "tools/mad-linter.cjs",
      "inputs": [
        {
          "id": "carpeta",
          "label": "Carpeta de documentos",
          "type": "folder",
          "required": true
        }
      ],
      "flags": []
    },
    {
      "id": "mad-snapshot",
      "name": "MAD Snapshot",
      "description": "Censo de artefactos con sello temporal. Detecta IDs que aparecieron o desaparecieron.",
      "command": "tools/mad-snapshot.cjs",
      "inputs": [
        {
          "id": "carpeta",
          "label": "Carpeta de documentos",
          "type": "folder",
          "required": true
        }
      ],
      "flags": [
        {
          "id": "salida",
          "flag": "--salida",
          "label": "Archivo de salida (.json)",
          "type": "text",
          "required": false,
          "placeholder": "ej: snapshot.json"
        }
      ]
    },
    {
      "id": "mad-diff",
      "name": "MAD Diff",
      "description": "Compara dos versiones del corpus: qué cambió de contenido, qué es nuevo, qué se eliminó.",
      "command": "tools/mad-diff.cjs",
      "inputs": [
        {
          "id": "carpeta_vieja",
          "label": "Versión vieja",
          "type": "folder",
          "required": true
        },
        {
          "id": "carpeta_nueva",
          "label": "Versión nueva",
          "type": "folder",
          "required": true
        }
      ],
      "flags": [
        {
          "id": "tipo",
          "flag": "--tipo",
          "label": "Tipo de diff",
          "type": "text",
          "required": false,
          "placeholder": "ej: FULL"
        }
      ]
    },
    {
      "id": "mad-index",
      "name": "MAD Index",
      "description": "Genera un índice persistente de todos los artefactos: dónde se define cada uno, quién lo cita.",
      "command": "tools/mad-index.cjs",
      "inputs": [
        {
          "id": "carpeta",
          "label": "Carpeta de documentos",
          "type": "folder",
          "required": true
        }
      ],
      "flags": [
        {
          "id": "salida",
          "flag": "--salida",
          "label": "Archivo de salida (.json)",
          "type": "text",
          "required": false,
          "placeholder": "ej: mad-index.json"
        }
      ]
    }
  ]
}
```

---

## Cómo se construye el comando al ejecutar

```
node <command> <input[0]> [<input[1]>] [--flag valor ...]
```

Ejemplos:

```bash
# mad-linter
node tools/mad-linter.cjs "C:/docs/corpus"

# mad-snapshot con salida opcional
node tools/mad-snapshot.cjs "C:/docs/corpus" --salida "snapshot.json"

# mad-diff (dos carpetas)
node tools/mad-diff.cjs "C:/docs/v1.80" "C:/docs/v1.83" --tipo FULL

# mad-index
node tools/mad-index.cjs "C:/docs/corpus" --salida "mad-index.json"
```

---

## Lo que NO está hardcodeado

- Nombres ni rutas de herramientas (todo viene del JSON)
- Cantidad de zonas de entrada (se generan según `inputs.length`)
- Flags disponibles (se renderizan según el array `flags`)

**Agregar una herramienta futura = agregar un objeto al array `tools`. Sin tocar código.**

---

## Dependencias previstas

| Paquete     | Uso                                      |
|-------------|------------------------------------------|
| `electron`  | App de escritorio, acceso a filesystem   |
| `pdfkit`    | Exportar resultado como PDF              |
| `exceljs`   | Exportar resultado como .xlsx            |

---

*Validar esta propuesta antes de generar el código completo.*
