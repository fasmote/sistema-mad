# Sistema MAD — Motor de Debate Multi-Agente

> *"El resultado de un debate entre múltiples IAs es más robusto que el de cualquiera de ellas sola."*

---

## ¿Qué es este proyecto?

MAD es un sistema que hace debatir a múltiples inteligencias artificiales para producir documentación técnica de alta calidad — requerimientos funcionales, revisión de código, diseño de arquitectura, y más.

En lugar de pedirle a una sola IA que genere un documento, MAD le pasa el problema a varias IAs especializadas con roles distintos y sintetiza lo mejor de cada aporte. El resultado es más completo, más robusto, y tiene menor probabilidad de contener errores silenciosos.

**¿Quién lo usa?** Analistas funcionales, desarrolladores, y equipos técnicos que necesitan documentación de calidad sin depender de una sola perspectiva.

**¿Dónde nació?** En DGSISAN (Dirección General de Sistemas Sanitarios, Buenos Aires), como respuesta a la necesidad de producir requerimientos robustos para sistemas hospitalarios complejos.

La historia completa de cómo se construyó está en [`docs/HISTORIA_DEL_PROYECTO.md`](docs/HISTORIA_DEL_PROYECTO.md).

---

## Cómo funciona en 5 pasos

```
1. El usuario describe qué quiere documentar (en lenguaje libre)
       ↓
2. El Módulo 1 transforma esa descripción en una
   "Ficha de Inicio" estructurada (Briefing)
       ↓
3. El Módulo 2 hace debatir a los agentes de IA
   usando esa ficha como punto de partida
       ↓
4. Cada agente aporta desde su rol especializado
   (adversarial, QA, arquitecto, etc.)
       ↓
5. El Orquestador sintetiza y produce el documento final
```

---

## Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────┐
│                      MÓDULO 1                           │
│           Entrevista + Generación de Briefing           │
│   Usuario → CLI → Orquestador IA → briefing.json       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                      MÓDULO 2                           │
│          Motor de Debate (Floor Control Dinámico)       │
│   Briefing → Agentes → Rondas → Decision Records       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                      MÓDULO 3                           │
│         Consolidación supervisada por humano            │
│   Decision Records → Síntesis → Documento Final        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  MÓDULO 4  (POST-MVP)                   │
│               Memoria persistente                       │
│          Supabase + pgvector + RAG                      │
└─────────────────────────────────────────────────────────┘
```

**Stack técnico:** Node.js · OpenRouter API · readline · JSON/JSONL · Git

---

## Estado actual

| Módulo | Estado | Descripción |
|---|---|---|
| Módulo 1 | 🟡 En implementación | RF v0.3 cerrado — 51 decisiones incorporadas |
| Módulo 2 | 📋 Especificado | Arquitectura v7 con 77 decisiones |
| Módulo 3 | 📋 Especificado | Consolidación supervisada |
| Módulo 4 | 🔮 POST-MVP | Memoria persistente con pgvector |

---

## Requisitos previos

Antes de instalar el proyecto, necesitás tener:

| Requisito | Para qué sirve | Cómo obtenerlo |
|---|---|---|
| **Node.js ≥ 18** | Ejecuta el código JavaScript del sistema | [nodejs.org](https://nodejs.org) → botón LTS |
| **Cuenta en OpenRouter** | Accede a las IAs (Claude, GPT-4, Gemini, etc.) | [openrouter.ai](https://openrouter.ai) → Sign Up |
| **API Key de OpenRouter** | Autentica las llamadas a las IAs | openrouter.ai → perfil → API Keys |
| **Créditos en OpenRouter** | Paga el uso de las IAs | openrouter.ai → Credits (con $5 USD alcanza para cientos de pruebas) |

---

## Instalación paso a paso

### Paso 1 — Clonar el repositorio

Abrí una terminal (en Windows: presioná `Windows + R`, escribí `cmd`, Enter) y ejecutá:

```bash
git clone https://github.com/fasmote/sistema-mad.git
cd sistema-mad
```

### Paso 2 — Instalar las dependencias

```bash
npm install
```

Esto descarga las librerías que el sistema necesita. Al terminar aparece algo como `added 45 packages`. Solo hay que hacerlo una vez.

### Paso 3 — Configurar la API key

Copiar el archivo de ejemplo:

```bash
# En Windows:
copy .env.example .env

# En Mac/Linux:
cp .env.example .env
```

Abrir el archivo `.env` con cualquier editor de texto (en Windows: Bloc de notas) y reemplazar `sk-or-v1-PONER-TU-KEY-AQUI` con tu API key real de OpenRouter:

```
OPENROUTER_API_KEY=sk-or-v1-tu-key-real-aqui
```

Guardar el archivo.

> ⚠️ **Importante:** el archivo `.env` contiene tu API key y **nunca** debe subirse a GitHub. El `.gitignore` ya lo protege automáticamente — no aparecerá en tus commits.

### Paso 4 — Correr el primer test

```bash
node test_briefing.js
```

El script prueba que todo funciona correctamente corriendo 5 casos de ejemplo y mostrando el resultado de cada uno.

---

## Resultado esperado del primer test

```
╔════════════════════════════════════════════╗
║     Sistema MAD — Test Briefing v0.3      ║
╚════════════════════════════════════════════╝

🧪 Ejecutando: CASO_01_ABM_SIMPLE.json
   ✅ PASS (1 intento/s)

🧪 Ejecutando: CASO_02_PERMISOS_ROLES.json
   ✅ PASS (1 intento/s)

🧪 Ejecutando: CASO_03_INTEGRACION_EXTERNA.json
   ✅ PASS (1 intento/s)

🧪 Ejecutando: CASO_04_ESTADOS_COMPLEJOS.json
   ✅ PASS (1 intento/s)

🧪 Ejecutando: CASO_05_SALUD_CLINICO.json
   ✅ PASS (1 intento/s)

──────────────────────────────────────────────
🏁 REPORTE FINAL | Total: 5
   ✅ PASS: 5 | ⚠️  DEGRADADO: 0 | ❌ FAIL: 0
   📈 DoD Cumplido: SÍ 🎉
──────────────────────────────────────────────
```

### ¿Qué significa cada resultado?

| Resultado | Significado |
|---|---|
| ✅ PASS | La IA generó un Briefing válido y completo |
| ⚠️ DEGRADADO | La IA falló, el sistema usó el fallback automático (Plan C) |
| ❌ FAIL | Ni la IA ni el fallback funcionaron — revisar logs |

**DoD Cumplido** significa que el sistema está funcionando correctamente: ≥ 4 de 5 casos con PASS o DEGRADADO, y no más de 1 DEGRADADO.

---

## Solución de problemas

| Error que aparece | Causa | Solución |
|---|---|---|
| `OPENROUTER_API_KEY no configurada` | El .env no tiene la key o no existe | Verificar que el archivo `.env` existe y tiene la key |
| `HTTP 401 Unauthorized` | La API key es incorrecta | Verificar la key en openrouter.ai → API Keys |
| `HTTP 402 Payment Required` | Sin créditos en OpenRouter | Cargar créditos en openrouter.ai → Credits |
| `Cannot find module 'ajv'` | Las dependencias no están instaladas | Correr: `npm install` |
| `Archivo no encontrado: prompts/...` | Faltan archivos de configuración | Verificar que clonaste el repositorio completo |
| `DoD Cumplido: NO` | Algún caso falló | Revisar el detalle en pantalla y el archivo `logs/fallos_modelos.jsonl` |

---

## Estructura de carpetas explicada

```
sistema-mad/
│
├── .env                    ← Tu configuración personal (API key, etc.)
│                             NO se sube a GitHub — es solo tuyo
│
├── .env.example            ← Plantilla del .env sin datos sensibles
│                             SÍ se sube a GitHub — sirve de guía
│
├── .gitignore              ← Le dice a Git qué archivos ignorar
│                             Protege el .env, node_modules, logs, etc.
│
├── package.json            ← Declara las dependencias del proyecto
│                             npm install lee este archivo para saber qué instalar
│
├── test_briefing.js        ← El primer script ejecutable
│                             Prueba que el sistema funciona correctamente
│                             Correr con: node test_briefing.js
│
├── director.js             ← (próximo) El punto de entrada del sistema completo
│                             La CLI que entrevista al usuario
│                             Correr con: node director.js
│
├── prompts/
│   └── orquestador_briefing_v1.md
│                           ← El "system prompt" del Orquestador IA
│                             Le dice a la IA exactamente qué hacer y cómo responder
│                             Sin este archivo el sistema no arranca
│
├── schemas/
│   └── briefing.schema.json
│                           ← La estructura formal que debe tener el Briefing
│                             El sistema valida cada respuesta de la IA contra este schema
│                             Si la respuesta no cumple → reintento automático
│
├── config/
│   ├── available_models.json
│   │                       ← Catálogo de modelos de IA disponibles
│   │                         Tiene el nombre, proveedor, precio, timeout y
│   │                         cadena de fallback de cada modelo
│   │
│   └── fallback_defaults.json
│                           ← Valores por defecto del Plan C
│                             Si la IA falla 3 veces, el sistema genera un Briefing
│                             básico usando estos valores en lugar de rendirse
│
├── ground_truth/
│   ├── CASO_01_ABM_SIMPLE.json         ← Caso simple sin restricciones (dominio Genérico)
│   ├── CASO_02_PERMISOS_ROLES.json     ← Caso con permisos y roles (dominio GovTech)
│   ├── CASO_03_INTEGRACION_EXTERNA.json ← Caso con API externa (dominio Fintech)
│   ├── CASO_04_ESTADOS_COMPLEJOS.json  ← Caso con máquina de estados (dominio Genérico)
│   └── CASO_05_SALUD_CLINICO.json      ← Caso clínico con offline + Ley 153 (dominio Salud)
│
│   Estos 5 archivos son los "casos de prueba" del sistema.
│   Cada uno tiene un input de ejemplo y los criterios para considerar
│   que el sistema respondió correctamente.
│
├── docs/
│   ├── HISTORIA_DEL_PROYECTO.md   ← Cómo se construyó el sistema
│   │                                 La historia completa: 8 IAs, 7 rondas de debate,
│   │                                 51 decisiones, los bugs encontrados, los momentos
│   │                                 bisagra. Lectura recomendada antes de contribuir.
│   │
│   ├── MANUAL_INSTALACION.md      ← Este manual en versión extendida
│   │                                 Con capturas y explicaciones más detalladas
│   │
│   ├── 10_RF_Modulo1_MAD_v03.md   ← Requerimientos Funcionales del Módulo 1
│   │                                 La especificación técnica completa de lo que
│   │                                 hace el sistema (51 decisiones incorporadas)
│   │
│   ├── GLOSARIO.md                ← Definición de todos los términos del proyecto
│   │                                 Briefing, Handoff, Floor Control, Ground Truth,
│   │                                 Consensus Drift, StakeSim, etc.
│   │
│   ├── MANIFIESTO_ORQUESTADOR.md  ← Las reglas del Orquestador
│   │                                 Qué debe hacer, qué puede hacer, qué no puede hacer
│   │
│   ├── MAPA_DE_ARTEFACTOS.md      ← Índice navegable del proyecto
│   │                                 Qué existe, para qué sirve cada cosa,
│   │                                 en qué orden consultarlo
│   │
│   └── PROTOCOLO_DE_RONDA.md      ← Cómo ejecutar un debate manualmente
│                                     El paso a paso para coordinar múltiples IAs
│
├── logs/                   ← Logs técnicos generados automáticamente
│                             fallos_modelos.jsonl → qué modelos fallaron y cuándo
│                             sistema.log → errores de Node.js para debugging
│                             No se suben a GitHub (están en .gitignore)
│
└── debates/                ← Debates generados por el sistema
                              Cada debate tiene su propia carpeta con:
                              briefing.json, debate_log.jsonl, decision_records/, etc.
                              No se suben a GitHub (están en .gitignore)
```

---

## Roles de los agentes de debate

| Rol | Función | Modelo recomendado |
|---|---|---|
| **Adversarial** | Ataca argumentos y busca contradicciones. Es el rol más crítico — sin él el debate converge falsamente | DeepSeek R1 / Kimi K2 |
| **QA / Casos Borde** | Imagina lo que puede fallar en producción | ChatGPT 4o |
| **Arquitecto** | Evalúa si las decisiones son técnicamente implementables | Gemini 2.0 |
| **Developer Usuario** | Simula al desarrollador que tiene que implementar el RF | Qwen Max |
| **StakeSim** | Simula usuarios reales bajo presión (el médico con 90 segundos por paciente, el enfermero a las 3am). Obligatorio en debates de dominio Salud | Claude 3.5 Sonnet |
| **Secretario Técnico** | Actualiza el Documento Vivo con las decisiones aprobadas | Gemini 1.5 Pro |
| **Orquestador** | Gestiona el debate, detecta consenso falso, sintetiza | Claude 3.7 |

---

## Dominios soportados

| Dominio | Agentes adicionales | Ejemplos de uso |
|---|---|---|
| **Salud** | StakeSim (obligatorio siempre) | Historia clínica, turnos, habilitaciones de establecimientos |
| **GovTech** | — | Trámites digitales, gestión pública, TAD, SADE |
| **Fintech** | — | Integraciones con BCRA, AFIP, RENAPER |
| **Genérico** | — | Cualquier sistema de software |

---

## Lo que hace especial a este proyecto

El sistema MAD fue diseñado usando el propio proceso que implementa. Durante el desarrollo:

- **8 IAs distintas** participaron en el diseño (ChatGPT, Gemini, DeepSeek, Qwen, Kimi, MIMO, MiniMax, Claude)
- **7 rondas de debate** para especificar el Módulo 1
- **51 decisiones** documentadas y trazables — cada una con su origen en una ronda y un agente específico
- **18+ problemas** encontrados antes de escribir una línea de código
- **Bootstrapping:** en la Ronda 7, una de las IAs (Qwen) dejó de debatir y escribió el código directamente — el proceso de debate produjo los artefactos para construirse a sí mismo

---

## Contribuir

1. Leer [`docs/GLOSARIO.md`](docs/GLOSARIO.md) para entender la terminología
2. Leer [`docs/HISTORIA_DEL_PROYECTO.md`](docs/HISTORIA_DEL_PROYECTO.md) para entender las decisiones tomadas
3. Leer [`docs/MAPA_DE_ARTEFACTOS.md`](docs/MAPA_DE_ARTEFACTOS.md) para entender qué existe y qué falta
4. El proceso de debate para incorporar cambios está en [`docs/PROTOCOLO_DE_RONDA.md`](docs/PROTOCOLO_DE_RONDA.md)

---

## Licencia

MIT

---

*Desarrollado por Claudio (DGSISAN, Buenos Aires) con Claude 3.7 como Orquestador — Mayo 2025*
