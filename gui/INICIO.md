# MAD Tools — Interfaz gráfica de escritorio

Aplicación de escritorio (Windows) para ejecutar las herramientas de análisis
documental del sistema MAD sin usar la terminal.

## ¿Qué hace?

Cada herramienta del sistema tiene su tarjeta en la interfaz. Seleccionás la
carpeta con tus documentos `.md`, apretás **Ejecutar** y el reporte aparece en
pantalla. Desde ahí podés guardarlo como `.md`, `.txt`, `.pdf` o `.xlsx`.

Las herramientas disponibles (configurables en `tools-config.json`):

| Herramienta    | Qué hace                                                    |
|----------------|-------------------------------------------------------------|
| MAD Linter     | Detecta referencias rotas, IDs duplicados, títulos fabricados |
| MAD Snapshot   | Censo de artefactos con sello temporal, detecta pérdidas    |
| MAD Diff       | Compara dos versiones del corpus                            |
| MAD Index      | Genera índice persistente de artefactos                     |

---

## Requisitos

- **Node.js ≥ 18** — [nodejs.org](https://nodejs.org) → botón LTS
- Windows 10 u 11

---

## Instalación normal

Abrí una terminal, **posicionarte en la carpeta `gui/`** y ejecutá:

```bash
cd gui
npm install
npm start
```

El `npm install` descarga Electron (~130 MB) y las dependencias de exportación
(pdfkit, exceljs). Tarda entre 1 y 5 minutos según la conexión.

Si la ventana aparece → listo.

---

## Si Electron no se descarga (instalación manual)

En algunas redes corporativas o con antivirus muy restrictivos, el binario de
Electron se descarga pero no se extrae correctamente.

### Diagnóstico

Desde `gui/`, verificá si el binario existe:

```bash
ls node_modules/electron/dist/electron.exe 2>/dev/null || echo "FALTA"
```

Si dice `FALTA`, seguí los pasos de abajo.

---

### Opción A — Reintentar con mirror alternativo

```bash
rm -rf node_modules/electron/dist
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
npm start
```

Si el segundo comando tarda varios minutos y muestra progreso → va a funcionar.
Si termina al instante sin output → la descarga sigue bloqueada → usá la Opción B.

---

### Opción B — Descarga manual (100% confiable)

**Paso 1** — Conocer la versión instalada (desde `gui/`):

```bash
node -e "console.log(require('./node_modules/electron/package.json').version)"
```

Ejemplo de salida: `32.3.3`

**Paso 2** — Descargar el zip desde el navegador.
Reemplazá `VERSION` por el número que obtuviste:

```
https://npmmirror.com/mirrors/electron/vVERSION/electron-vVERSION-win32-x64.zip
```

Ejemplo para 32.3.3:
```
https://npmmirror.com/mirrors/electron/v32.3.3/electron-v32.3.3-win32-x64.zip
```

Si ese mirror no responde, alternativa en GitHub:
```
https://github.com/electron/electron/releases/download/vVERSION/electron-vVERSION-win32-x64.zip
```

**Paso 3** — Extraer el zip.
Extraé el contenido **directamente** dentro de esta carpeta (sin subcarpeta):

```
sistema-mad\gui\node_modules\electron\dist\
```

Resultado esperado: `dist\electron.exe` junto con las DLLs y la carpeta `locales\`.

**Paso 4** — Corregir el archivo de ruta (desde `gui/`):

```bash
printf "electron.exe" > node_modules/electron/path.txt
```

**Paso 5** — Lanzar:

```bash
npm start
```

---

## Uso

- **Seleccionar carpeta:** clic en la zona punteada → navegá hasta la carpeta
  que **contiene** tus `.md` → seleccioná la carpeta (un clic) → "Seleccionar carpeta".
  También podés arrastrar la carpeta desde el Explorador de Windows.

- **Ejecutar:** botón azul "Ejecutar" en cada tarjeta.

- **Guardar el reporte:** botón "Guardar como…" en el panel de resultados.
  Formatos disponibles: `.md`, `.txt`, `.pdf`, `.xlsx`.
  La app recuerda la última carpeta de guardado.

- **Agregar una herramienta nueva:** editá solo `gui/tools-config.json`.
  No hace falta tocar ningún otro archivo.

---

## Estructura de archivos

```
gui/
├── main.js              ← Proceso principal de Electron (ventana, IPC, spawn)
├── preload.js           ← Puente seguro entre la UI y Node.js
├── tools-config.json    ← Configuración de herramientas (único archivo a editar)
├── package.json         ← Dependencias: electron, pdfkit, exceljs
└── renderer/
    ├── index.html       ← Estructura de la ventana
    ├── app.js           ← Lógica de la interfaz
    └── styles.css       ← Estilos
```
