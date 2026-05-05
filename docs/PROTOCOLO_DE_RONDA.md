# PROTOCOLO_DE_RONDA.md
## Sistema MAD — Motor de Debate Multi-Agente
## Protocolo operativo del proceso de debate manual
### Versión: 1.0 — Mayo 2025 — Estado: ESTABLE ✅

---

## Flujo de una ronda

```
INICIO DE RONDA
      ↓
1. Preparar documento de entrada
      ↓
2. Distribuir a todas las IAs simultáneamente
      ↓
3. Recopilar respuestas
      ↓
4. Analizar (identificar roles, convergencias, hallazgos)
      ↓
5. ¿Criterio de cierre?
   ├── SÍ → síntesis final + próximo artefacto
   └── NO → consolidado + nueva ronda
```

---

## Composición mínima para un debate válido

| Rol | Sin este rol... |
|---|---|
| **Adversarial** | El debate converge falsamente |
| **Arquitecto** | Los RF son correctos pero inimplementables |
| **QA/Casos Borde** | El happy path falla en producción |

---

## Selección de modelos por rol (patrón empírico)

| Rol | Modelo preferido | Alternativa |
|---|---|---|
| Adversarial | Kimi K2 / DeepSeek R1 | Claude (prompt agresivo) |
| Arquitecto | Gemini 2.0 | GPT-4o |
| QA/Casos Borde | ChatGPT 4o | Claude |
| Developer Usuario | Qwen Max | GPT-4o |
| Síntesis | MIMO / Gemini 1.5 Pro | — |

**Failover:** Si el Adversarial cae → reasignar inmediatamente. Nunca cancelar una ronda por ausencia de una sola IA.

---

## Análisis del Orquestador

### Clasificar cada punto de las respuestas

- **Hallazgo nuevo:** No aparece en ningún documento anterior → alta prioridad
- **Confirmación:** Ratifica algo ya conocido → agregar a convergencias
- **Reformulación:** Mismo punto con otras palabras → no agregar como nuevo
- **Contradicción:** Discrepa con decisión anterior → resolver explícitamente

### Medir convergencias

- **Real:** ≥3 IAs con argumentos distintos desde perspectivas distintas
- **Falsa:** Las IAs acuerdan pero ninguna da argumento original

### Clasificar puntos abiertos

| Categoría | Cuándo |
|---|---|
| **Cerrada** | Hay argumento suficiente |
| **Diferida** | Requiere código corriendo |
| **Debate activo** | Argumentos fuertes en ambas direcciones |

**No válido:** dejar un punto como "abierto" sin categoría.

---

## Criterio de cierre

| Condición | Señal |
|---|---|
| Convergencia genuina | ≤1 hallazgo nuevo en la última ronda |
| Saturación | Todos los puntos tienen resolución |
| Costo marginal | Otra ronda cuesta más de lo que aporta |
| Directiva humana | Claudio dice "suficiente" |

**Rendimiento esperado:** Ronda 1: 10-15 / Ronda 2: 5-8 / Ronda 3: 1-3 / Ronda 4+: saturado.

---

## Reglas del consolidado

- Un solo próximo paso concreto
- Tabla de decisiones con estados: ✅ CERRADA / 🔄 DIFERIDA / 🔒 FUNDACIONAL
- Hallazgos nuevos van PRIMERO
- Puntos diferidos tienen condición de revisión explícita

---

## Problema de distribución de archivos (limitación conocida)

Las IAs chinas (DeepSeek, Qwen, MiniMax) aceptan máximo 5 archivos y no aceptan ZIP.
**Solución:** Compilar todo el contexto necesario en un único MD que declara ser la suma de varios:

```markdown
# COMPILADO_RONDA_N.md
## Este documento contiene el contenido de los siguientes archivos:
- PROTOCOLO_DE_RONDA.md
- MAPA_DE_ARTEFACTOS.md
- RF v0.3 (secciones clave)
[contenido completo a continuación]
```

---

*Claude 3.7 + Claudio — Mayo 2025 — v1.0*
