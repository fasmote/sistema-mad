# 10_RF_Modulo1_MAD_v03.md
## Sistema MAD — Motor de Debate Multi-Agente
## Módulo 1: Entrevista y Generación de Briefing
### Versión: 0.3 — Lista para codificar
### Fecha: Mayo 2025
### Base: v0.2 + 51 decisiones de 7 rondas de debate + 1 experimento

---

## Trazabilidad

| Documento | Rol |
|---|---|
| `prompts/orquestador_briefing_v1.md` | System prompt del Orquestador |
| `schemas/briefing.schema.json` | Schema JSON del Briefing |
| `config/available_models.json` | Catálogo de modelos |
| `config/fallback_defaults.json` | Defaults del Plan C |
| `MANIFIESTO_ORQUESTADOR.md` | Rige el proceso de debate |
| `GLOSARIO.md` | Define los términos de este documento |

---

## Contexto del sistema

El sistema MAD automatiza el proceso de debate iterativo entre múltiples IAs.
Stack: Node.js + OpenRouter API + readline + JSON/JSONL + Git.

| Objeto | Descripción | Ubicación |
|---|---|---|
| **Briefing** | Ficha de inicio — inmutable una vez aprobada | `debates/{id}/briefing.json` |
| **Debate Log** | Registro cronológico — SOLO auditoría | `debates/{id}/debate_log.jsonl` |
| **Decision Records** | Decisiones con fundamento | `debates/{id}/decision_records/` |
| **Documento Vivo** | RF limpio en construcción | `debates/{id}/documento_vivo/` |
| **Checkpoint** | Estado del Orquestador | `debates/{id}/orquestador_checkpoint.json` |
| **Fallos de modelos** | Registro operacional | `logs/fallos_modelos.jsonl` |

---

## Requerimientos Funcionales

### RF-001 — Iniciar sesión de debate

**Actor:** Usuario
**Precondiciones:** Node.js ≥ 18.0, `.env` con `OPENROUTER_API_KEY`

**Descripción:** El sistema valida los 4 archivos de config al inicio, antes de interactuar con el usuario. Si cualquiera falla → error descriptivo + exit code 1. Health check en `GET /api/v1/auth/key` con timeout 10s.

**Criterios de aceptación:**
- Los 4 archivos de config validados antes de mostrar cualquier mensaje
- 429 activa fallback igual que 500
- Exit code 1 en todo error fatal
- Fallback chain: OpenRouter → Anthropic → OpenAI → Google

---

### RF-002 — Seleccionar dominio del debate

**Dominios MVP:** (1) Salud / (2) GovTech / (3) Fintech / (4) Genérico

**Criterios de aceptación:**
- Acepta número o nombre (case insensitive, trim)
- 3 intentos fallidos → asigna "Genérico" con aviso

---

### RF-003 — Capturar objetivo del debate

**Prompt:** `"Describí el objetivo. Cuando termines, escribí /fin en una línea sola."`

**Criterios de aceptación:**
- Acumula líneas hasta `/fin` o `Ctrl+D`
- Mínimo 10 chars no blancos
- Máximo 8.000 chars — trunca sin preguntar, con mensaje
- El truncado no corta dentro de estructuras JSON abiertas `{` o `[`

---

### RF-004 — Capturar restricciones obligatorias

**Pregunta binaria:** `"¿Tenés restricciones obligatorias? (s/n)"`
Si s → captura multilínea con `/fin`. Si n → `restricciones_raw: []`.

---

### RF-005 — Capturar cantidad aproximada de RF esperados

| Input | Valor interpretado |
|---|---|
| Enter vacío / "no sé" | 15 (default) |
| "pocos" | 5 |
| Número entero | ese número |
| "entre X e Y" | valor medio |
| "muchos" / "100+" | 50 |

---

### RF-006 — Configurar parámetros del debate (MVP defaults)

**Regla de StakeSim:** Si dominio = `"salud"` → agregar `stakesim` automáticamente. No es opcional.
Clasificación automática de complejidad es POST-MVP (v1.1).

---

### RF-007a — Generar Briefing Técnico

**Regla crítica — separación de mensajes:**
```javascript
messages: [
  { role: "system", content: promptCargadoDesdeArchivo }, // instrucciones
  { role: "user",   content: objetivoRaw }                // input aislado
]
```
El input del usuario NUNCA se interpola en el system prompt.

**Extracción del JSON:** busca entre marcas `<JSON_OUTPUT>...</JSON_OUTPUT>`.

**Timeout:** configurable por modelo en `config/available_models.json` (campo `timeout_segundos`).

**Plan C:** si LLM falla 3 veces → genera Briefing esqueleto desde `config/fallback_defaults.json`.
- Si dominio es "salud" → agrega stakesim al esqueleto
- El Briefing lleva `_origin: "PLAN_C_FALLBACK"`
- Se clasifica como `PASA_CON_DEGRADACIÓN` en el DoD

**Reintentos:** sin espera → 2s → 5s. Prompt correctivo en cada reintento.

---

### RF-007b — Validar Briefing Técnico

**Capa 1 — Schema:** con `ajv`, Draft 2020-12, `strict: true`, `additionalProperties: false`.
`minItems: 1` en `alcance`, `actores`, `riesgos_a_explorar`.

**Capa 2 — Funcional:**

| Regla | Error |
|---|---|
| Contiene `id: "adversarial"` | "Falta adversarial — mandatorio FUNDACIONAL" |
| Si salud → contiene `id: "stakesim"` | "Falta StakeSim — mandatorio en Salud" |
| Todos los modelos en `config/available_models.json` | "Modelo no reconocido" |
| `objetivo` ≥ 10 chars | "Objetivo vacío" |
| ≥ 2 agentes activos | "Mínimo 2 agentes" |
| `alcance`, `actores`, `riesgos` no vacíos | "Campo vacío" |

**Si Adversarial está vacante:** escala al árbitro humano con mensaje bloqueante. No continúa.

---

### RF-008 — Mostrar resumen del Briefing

Menú numerado: `1. Iniciar debate / 2. Ajustar parámetros / 3. Cancelar`
Si Briefing viene del Plan C → muestra banner de advertencia.

---

### RF-009 — Ajustar parámetros del debate

No permite quitar `adversarial` ni `stakesim` (en Salud). Mínimo 2 agentes.
Máximo 5 iteraciones del ciclo de ajuste.

---

### RF-010 — Crear estructura del debate y registrar inicio

Crea carpetas, escribe checkpoint del Orquestador, registra primer evento en Debate Log.
El commit git se hace como ÚLTIMO paso — después del ajuste final del usuario.
Timestamp siempre generado por Node.js con `new Date().toISOString()`.

---

### RF-011 — Manejar cancelación

`Ctrl+C` → AbortController cancela HTTP en curso → pregunta si cancelar → ofrece guardar borrador.
Doble `Ctrl+C` → `process.exit(130)` inmediato con AbortController.

---

### RF-012 — Configuración inicial del sistema

`.env.example` en el repositorio. `.env` en `.gitignore`.
`OPENROUTER_API_KEY` es la única variable estrictamente obligatoria.

---

## Requisitos No Funcionales

| RNF | Descripción |
|---|---|
| RNF-001 | Timeout en TODAS las llamadas: health check 10s, briefing según modelo, chain global 120s |
| RNF-002 | Logs separados: `debate_log.jsonl` (auditoría), `logs/fallos_modelos.jsonl` (técnico) |
| RNF-003 | Sanitización: truncar a 8.000 chars, remover ASCII control, encoding UTF-8 |
| RNF-004 | SIGTERM → exit 0 limpio. `uncaughtException` → loguear + exit 1 |
| RNF-005 | Reintentos con backoff: 0s → 2s → 5s. Máximo 3 intentos |
| RNF-006 | Context Pruning = deuda técnica diferida al Módulo 2 |

---

## Definición de Done (DoD)

### Categorías de resultado del runner

| Resultado | Significado | Cuenta para DoD |
|---|---|---|
| `PASA` | LLM generó JSON válido y funcional | ✅ Sí |
| `PASA_CON_DEGRADACIÓN` | Plan C activado | ✅ Sí (máx. 1) |
| `FALLA` | Ni LLM ni Plan C funcionaron | ❌ No |

**DoD cumplido:** ≥ 4/5 con PASA o PASA_CON_DEGRADACIÓN, con ≤ 1 PASA_CON_DEGRADACIÓN.

### Checklist completo

- [ ] RF-001 a RF-012 implementados y testeados
- [ ] `node test_briefing.js` pasa el DoD
- [ ] `adversarial` presente en 100% de los Briefings
- [ ] `stakesim` presente en 100% de los Briefings con dominio Salud
- [ ] Ctrl+C cancela el fetch HTTP (no lo deja colgado)
- [ ] Logs separados correctamente
- [ ] Briefing commiteado en git

---

## Features POST-MVP

| Feature | Por qué se difiere |
|---|---|
| RF-013 Retomar debate | Manejo de estados complejos |
| Clasificación automática de complejidad | v1.1 |
| Context Pruning | Módulo 2 |
| Sanitización completa para Salud | Requiere diseño de privacidad |
| `$EDITOR` para input multilínea | v1.1 |
| Sistema multi-rol estándar | v1.1 |

---

*Claude 3.7 — Mayo 2025 — RF Módulo 1 v0.3 — 51 decisiones — Listo para codificar*
