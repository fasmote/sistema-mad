# Manual de Instalación y Primer Uso
## Sistema MAD — Motor de Debate Multi-Agente
### Para Windows — Sin experiencia previa requerida

---

## ¿Qué es el sistema MAD?

MAD es un motor que hace debatir a múltiples inteligencias artificiales para producir documentación técnica de alta calidad. En lugar de pedirle a una sola IA que genere un documento, MAD le pasa el problema a varias IAs especializadas — una busca errores, otra busca casos borde, otra evalúa la arquitectura — y sintetiza lo mejor de cada aporte.

**Analogía:** el Módulo 1 es como el cajero de un restaurante que toma el pedido desordenado del cliente y lo convierte en un ticket claro para la cocina. Sin ese ticket, los cocineros (las IAs) no saben qué preparar.

El sistema fue diseñado usando el propio proceso que implementa: 8 IAs debatieron durante 7 rondas para especificarse a sí mismas. La historia completa está en `HISTORIA_DEL_PROYECTO.md`.

---

## Paso 1 — Crear cuenta en GitHub y subir el proyecto

### 1.1 Crear una cuenta en GitHub

1. Abrir el navegador (Chrome, Edge, Firefox)
2. Ir a **github.com**
3. Hacer click en **"Sign up"** (esquina superior derecha)
4. Ingresar un email, crear una contraseña, elegir un nombre de usuario
5. Verificar el email que llega a tu casilla
6. En el plan, elegir **"Free"** (gratis)

### 1.2 Crear el repositorio del proyecto

1. Hacer click en **"+"** → **"New repository"**
2. Nombre: `sistema-mad`
3. Descripción: `Motor de Debate Multi-Agente para documentación técnica`
4. Seleccionar **Public** o **Private** según prefieras
5. Tildar **"Add a README file"**
6. Hacer click en **"Create repository"**

### 1.3 Instalar GitHub Desktop

1. Ir a **desktop.github.com**
2. Hacer click en **"Download for Windows"**
3. Ejecutar el instalador descargado
4. Cuando abra, hacer click en **"Sign in to GitHub.com"**
5. Autorizar la aplicación en el navegador

### 1.4 Clonar el repositorio a tu computadora

1. En GitHub Desktop: **File → Clone repository**
2. Seleccionar `sistema-mad` de la lista
3. En "Local path" elegir dónde guardarlo (ej. `C:\Proyectos\sistema-mad`)
4. Hacer click en **"Clone"**

### 1.5 Copiar los archivos del proyecto

Copiar todos los archivos de `C:\Users\clau\Documents\RF_MAD\` a la carpeta que clonaste.

### 1.6 Subir a GitHub

1. Abrir GitHub Desktop
2. En la caja de abajo escribir: `"Primer commit — estructura inicial del proyecto MAD"`
3. Hacer click en **"Commit to main"**
4. Hacer click en **"Push origin"** (botón azul arriba)

> ✅ Los archivos ya están en GitHub. El `.env` con tu API key **no** se sube — el `.gitignore` lo protege automáticamente.

---

## Paso 2 — Instalar Node.js en Windows

Node.js es el entorno que permite ejecutar el código del sistema MAD.

### 2.1 Descargar e instalar

1. Ir a **nodejs.org**
2. Hacer click en el botón verde **"LTS"** (versión estable)
3. Ejecutar el archivo `.msi` descargado
4. Hacer click en "Next" en todas las pantallas → **"Install"**

### 2.2 Verificar la instalación

1. Presionar **Windows + R**
2. Escribir `cmd` → Enter (se abre la terminal)
3. Escribir: `node --version`
4. Si aparece algo como `v20.11.0` → instalación exitosa

> Si aparece "node no se reconoce como un comando" → reiniciar la computadora e intentar de nuevo.

---

## Paso 3 — Crear cuenta en OpenRouter

OpenRouter da acceso a múltiples IAs (Claude, GPT-4, Gemini, DeepSeek, etc.) a través de una sola API. El sistema MAD lo usa para generar los Briefings.

### 3.1 Crear la cuenta

1. Ir a **openrouter.ai**
2. Hacer click en **"Sign Up"**
3. Registrarse con Google, GitHub, o email

### 3.2 Obtener la API Key

1. Iniciar sesión en openrouter.ai
2. Hacer click en tu foto de perfil → **"API Keys"**
3. Hacer click en **"Create Key"**
4. Nombre: `sistema-mad`
5. Hacer click en **"Create"**
6. **Copiar la clave** que aparece (empieza con `sk-or-v1-...`)

> ⚠️ Esta clave aparece **UNA SOLA VEZ**. Guardarla antes de cerrar la ventana.

### 3.3 Cargar créditos

1. En openrouter.ai → ir a **"Credits"**
2. Hacer click en **"Add Credits"**
3. Elegir el monto (con $5 USD alcanza para cientos de pruebas)
4. Ingresar datos de tarjeta y confirmar

> 💡 OpenRouter cobra solo lo que usás. No hay suscripción mensual.

---

## Paso 4 — Configurar el proyecto

### 4.1 Abrir la terminal en la carpeta del proyecto

1. Abrir el Explorador de archivos de Windows
2. Navegar hasta la carpeta `sistema-mad`
3. En la barra de direcciones, hacer click → borrar lo que dice → escribir `cmd` → Enter

La terminal se abre ya posicionada en la carpeta del proyecto.

> 💡 Cómo saber si estás en la carpeta correcta: el texto debe decir algo como `C:\Proyectos\sistema-mad>`

### 4.2 Configurar la API key

Abrir el archivo `.env` con el Bloc de notas:

```
notepad .env
```

Reemplazar `sk-or-v1-PONER-TU-KEY-AQUI` con tu API key real:

```
OPENROUTER_API_KEY=sk-or-v1-tu-key-aqui
```

Guardar el archivo (Ctrl+S) y cerrar.

### 4.3 Instalar las dependencias

En la terminal, escribir:

```
npm install
```

Se descargan las librerías necesarias. Al terminar aparece algo como `added 45 packages`.

---

## Paso 5 — Correr el primer test

### 5.1 Ejecutar el test

En la terminal:

```
node test_briefing.js
```

El script corre los 5 casos del ground truth y muestra el resultado de cada uno.

### 5.2 Interpretar los resultados

| Resultado | Significado | ¿Es bueno? |
|---|---|---|
| ✅ PASS | La IA generó un Briefing válido y completo | Sí — ideal |
| ⚠️ DEGRADADO | La IA falló, el sistema usó el Plan C (fallback) | Aceptable — máx. 1 |
| ❌ FAIL | Ni la IA ni el Plan C funcionaron | No — revisar logs |

**DoD cumplido** significa: ≥ 4 de 5 casos con PASS o DEGRADADO, con ≤ 1 DEGRADADO.

### 5.3 Solución de problemas frecuentes

| Error | Causa | Solución |
|---|---|---|
| `OPENROUTER_API_KEY no configurada` | El .env no tiene la key | Abrir .env y agregar la key |
| `HTTP 401` | La API key es incorrecta | Verificar en openrouter.ai → API Keys |
| `HTTP 402` | Sin créditos | Cargar créditos en openrouter.ai → Credits |
| `Cannot find module 'ajv'` | npm install no se ejecutó | Correr: `npm install` |
| `Archivo no encontrado` | Falta algún archivo de config | Verificar la estructura de carpetas |
| `FAIL en CASO_05` | El caso de Salud es el más complejo | Volver a correr — suele pasar en el primer intento |

---

## Paso 6 — Guardar el progreso en GitHub

Después de cada sesión de trabajo:

1. Abrir GitHub Desktop
2. Ver los archivos modificados en la columna izquierda
3. Escribir un mensaje descriptivo (ej. `"Primer test exitoso — DoD cumplido 4/5"`)
4. Hacer click en **"Commit to main"**
5. Hacer click en **"Push origin"**

> 💡 Guardar en GitHub frecuentemente es como tener un historial de versiones. Si algo se rompe, podés volver a cualquier punto anterior.

---

## Próximos pasos

| Paso | Qué es | Cuándo |
|---|---|---|
| `director.js` | La CLI completa que entrevista al usuario | Después del test exitoso |
| Módulo 2 | El motor de debate entre IAs | Después de director.js |
| Módulo 3 | La consolidación supervisada | Después del Módulo 2 |
| Módulo 4 | La memoria persistente | POST-MVP |

> 📌 El sistema MAD usa el mismo proceso de debate que construimos para mejorar su propia documentación. Cada módulo nuevo puede ser especificado usando el Módulo 1 ya funcionando.

---

*Sistema MAD — Mayo 2025*
*Claude 3.7 (Orquestador) + Claudio (Árbitro)*
