# Sistema MAD — Motor de Debate Multi-Agente

> *"El resultado de un debate entre múltiples IAs es más robusto que el de cualquiera de ellas sola."*

---

## ¿Qué es?

MAD es un sistema que hace debatir a múltiples inteligencias artificiales para producir documentación técnica de alta calidad — requerimientos funcionales, revisión de código, diseño de arquitectura, y más.

En lugar de pedirle a una sola IA que genere un documento, MAD le pasa el problema a varias IAs especializadas, cada una con un rol distinto, y sintetiza lo mejor de cada aporte. El resultado es más completo, más robusto, y tiene menor probabilidad de contener errores silenciosos.

---

## El problema que resuelve

Cuando un analista funcional escribe los requerimientos de un sistema de software, normalmente lo hace solo. El resultado depende de su experiencia y de los ángulos que considera.

MAD automatiza el proceso de someter ese documento a crítica múltiple:

- Un agente busca errores de implementación (**Adversarial**)
- Otro busca casos borde que nadie consideró (**QA / Casos Borde**)
- Otro evalúa si es coherente con la arquitectura (**Arquitecto**)
- Otro simula cómo lo usaría un usuario real bajo presión (**StakeSim**)
- Un **Orquestador** sintetiza todos los aportes y produce el documento final

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
│   Decision Records → Síntesis → Documento Vivo         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                      MÓDULO 4  (POST-MVP)               │
│               Memoria persistente                       │
│          Supabase + pgvector + RAG                      │
└─────────────────────────────────────────────────────────┘
```

**Stack:** Node.js · OpenRouter API · readline · JSON/JSONL · Git

---

## Estado actual del proyecto

| Módulo | Estado | Descripción |
|---|---|---|
| Módulo 1 | 🟡 En implementación | RF v0.3 cerrado — 51 decisiones incorporadas |
| Módulo 2 | 📋 Especificado | Arquitectura v7 con 77 decisiones |
| Módulo 3 | 📋 Especificado | Consolidación MoA supervisada |
| Módulo 4 | 🔮 POST-MVP | Memoria persistente con pgvector |

---

## Instalación rápida

### Requisitos

- [Node.js](https://nodejs.org) versión 18 o superior
- Una cuenta en [OpenRouter](https://openrouter.ai) (gratuito para empezar)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/sistema-mad.git
cd sistema-mad

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
copy .env.example .env
# Abrir .env con el Bloc de notas y agregar tu OPENROUTER_API_KEY

# 4. Correr el test de validación del Módulo 1
node test_briefing.js
```

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

**Criterio de DoD:** ≥ 4/5 casos con resultado PASS o DEGRADADO, con ≤ 1 DEGRADADO.

---

## Roles de los agentes

| Rol | Función | Modelo recomendado |
|---|---|---|
| **Adversarial** | Ataca argumentos y busca contradicciones | DeepSeek R1 / Kimi K2 |
| **QA / Casos Borde** | Imagina lo que puede fallar | ChatGPT 4o |
| **Arquitecto** | Evalúa implementabilidad técnica | Gemini 2.0 |
| **Developer Usuario** | Simula al dev que implementa | Qwen Max |
| **StakeSim** | Simula usuarios reales bajo presión | Claude 3.5 Sonnet |
| **Secretario Técnico** | Actualiza el Documento Vivo | Gemini 1.5 Pro |
| **Orquestador** | Gestiona el debate y sintetiza | Claude 3.7 |

---

## Dominios soportados

| Dominio | Agentes adicionales | Casos de uso típicos |
|---|---|---|
| **Salud** | StakeSim (obligatorio) | Historia clínica, turnos, habilitaciones |
| **GovTech** | — | Trámites, gestión pública, TAD/SADE |
| **Fintech** | — | Integraciones BCRA, AFIP |
| **Genérico** | — | Cualquier sistema de software |

---

## Estructura del repositorio

```
sistema-mad/
├── director.js                    ← punto de entrada del Módulo 1 (próximo)
├── test_briefing.js               ← runner de validación del Módulo 1
├── .env.example                   ← plantilla de configuración
├── package.json
├── prompts/
│   └── orquestador_briefing_v1.md ← system prompt del Orquestador IA
├── schemas/
│   └── briefing.schema.json       ← schema JSON del Briefing (Draft 2020-12)
├── config/
│   ├── available_models.json      ← catálogo de modelos con timeouts y precios
│   └── fallback_defaults.json     ← defaults del Plan C (fallback si la IA falla)
├── ground_truth/                  ← 5 casos de validación
│   ├── CASO_01_ABM_SIMPLE.json
│   ├── CASO_02_PERMISOS_ROLES.json
│   ├── CASO_03_INTEGRACION_EXTERNA.json
│   ├── CASO_04_ESTADOS_COMPLEJOS.json
│   └── CASO_05_SALUD_CLINICO.json
├── docs/                          ← documentación completa del proyecto
│   ├── HISTORIA_DEL_PROYECTO.md   ← cómo se construyó el sistema
│   ├── 10_RF_Modulo1_MAD_v03.md   ← requerimientos del Módulo 1 (51 decisiones)
│   ├── GLOSARIO.md                ← definición de términos
│   ├── MANIFIESTO_ORQUESTADOR.md  ← responsabilidades del Orquestador
│   ├── MAPA_DE_ARTEFACTOS.md      ← índice navegable del proyecto
│   └── PROTOCOLO_DE_RONDA.md      ← cómo ejecutar un debate
├── logs/                          ← logs técnicos (generados automáticamente)
└── debates/                       ← debates generados (generados automáticamente)
```

---

## Lo que hace especial a este proyecto

El sistema MAD fue diseñado usando el propio proceso MAD — el debate multi-agente se usó para especificarse a sí mismo. Durante el desarrollo:

- **8 IAs distintas** participaron en el diseño (ChatGPT, Gemini, DeepSeek, Qwen, Kimi, MIMO, MiniMax, Claude)
- **7 rondas de debate** sobre el RF del Módulo 1
- **51 decisiones** documentadas y trazables — cada una con su origen en una ronda y un agente
- **18+ problemas** encontrados antes de escribir una línea de código
- **1 experimento** que confirmó empíricamente que los roles de debate son reales (no decorativos)
- **Bootstrapping:** el proceso de debate produjo el código para construirse a sí mismo

Toda la historia de decisiones está en `docs/HISTORIA_DEL_PROYECTO.md`.

---

## Solución de problemas frecuentes

| Error | Causa probable | Solución |
|---|---|---|
| `OPENROUTER_API_KEY no configurada` | El .env no tiene la key | Abrir .env y agregar la key |
| `HTTP 401` | La API key es incorrecta | Verificar en openrouter.ai → API Keys |
| `HTTP 402` | Sin créditos en OpenRouter | Cargar créditos en openrouter.ai → Credits |
| `Cannot find module 'ajv'` | npm install no se ejecutó | Correr: `npm install` |
| `Archivo no encontrado: schemas/...` | Faltan archivos de config | Verificar que la estructura de carpetas esté completa |

---

## Documentación

| Documento | Descripción |
|---|---|
| `docs/HISTORIA_DEL_PROYECTO.md` | Cómo se construyó el sistema — la historia completa |
| `docs/10_RF_Modulo1_MAD_v03.md` | Requerimientos funcionales del Módulo 1 |
| `docs/GLOSARIO.md` | Definición de todos los términos del sistema |
| `docs/MANIFIESTO_ORQUESTADOR.md` | Responsabilidades y poderes del Orquestador |
| `docs/MAPA_DE_ARTEFACTOS.md` | Índice navegable de todos los artefactos |
| `docs/PROTOCOLO_DE_RONDA.md` | Cómo ejecutar una ronda de debate manual |

---

## Licencia

MIT

---

*Desarrollado por Claudio (DGSISAN, Buenos Aires) con Claude 3.7 como Orquestador — Mayo 2025*
