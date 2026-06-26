# Historia del Proyecto MAD

## Motor de Debate Multi-Agente para Documentación Técnica

*Por Claudio — Analista Funcional Jr., Buenos Aires*
*Con Claude 3.7 como Orquestador — Enero 2026*

---

> *Este documento cuenta cómo se construyó el sistema MAD. Pero hay algo que lo hace distinto: el sistema fue diseñado usando el propio proceso que implementa. Las mismas IAs que van a debatir dentro del sistema debatieron sobre cómo debería funcionar ese sistema.*

---

## 1. El origen

El 2 de enero de 2026, Claudio escribió un mensaje que parecía una pregunta técnica simple:

> *"¿Cómo puedo hacer un programa que pueda hacer que varias inteligencias artificiales debatan entre ellas? Porque cuando estaba haciendo el documento de requerimiento funcional para la Habilitación de establecimientos de salud, copiaba lo que Claude me decía y se lo ponía a ChatGPT, eso aportaba otra mirada, luego te lo pasaba a Gemini... daba trabajo eso."*

Esa descripción de trabajo manual contenía el diseño del sistema en embrión. Claudio ya estaba haciendo manualmente lo que quería automatizar: un proceso iterativo de debate entre perspectivas distintas para producir documentación técnica más robusta.

### El insight fundamental

Lo que Claudio describía tenía propiedades matemáticamente interesantes: múltiples IAs con roles distintos producen fricción cognitiva. La fricción fuerza la justificación de cada argumento. Los argumentos que sobreviven la fricción son más robustos.

Esto tenía nombre en la literatura: **Multi-Agent Debate (MAD)**. Du et al. (2023) habían demostrado que los debates entre múltiples instancias de LLMs mejoraban la precisión en tareas de razonamiento. Nadie lo había aplicado sistemáticamente a la documentación técnica de software en el sector público de salud.

---

## 2. Los participantes

**Claudio** — Analista Funcional Jr.  Buenos Aires. Árbitro humano del sistema. Tiene la última palabra en todas las decisiones.

**Claude 3.7** — Orquestador del proceso. Sintetiza las respuestas, detecta convergencias falsas, produce los consolidados de cada ronda.

**Las 8 IAs debatientes:**

| IA          | Especialización empírica observada              |
| ----------- | ----------------------------------------------- |
| ChatGPT 4o  | QA y casos borde                                |
| Gemini 2.0  | Arquitectura técnica + pedagogía                |
| DeepSeek R1 | Adversarial sistémico — bugs de implementación  |
| Qwen Max    | Perspectiva del developer — pragmatismo extremo |
| Kimi K2     | Adversarial de consistencia arquitectónica      |
| MIMO        | Síntesis y meta-análisis del proceso            |
| MiniMax     | Producción masiva de artefactos de proceso      |
| Claude 3.5  | Análisis equilibrado                            |

Estas especializaciones no fueron asignadas — emergieron empíricamente a lo largo del proceso.

---

## 3. La arquitectura del sistema

El sistema MAD automatiza el debate iterativo entre múltiples IAs para producir documentación técnica:

```
Módulo 1 → Entrevista + Generación de Briefing
Módulo 2 → Motor de debate con Floor Control Dinámico
Módulo 3 → Consolidación supervisada
Módulo 4 → Memoria persistente (POST-MVP)
```

**Floor Control Dinámico:** En lugar de turnos fijos, cada agente envía una señal de intención barata. El Orquestador da la palabra solo al agente cuyo aporte tiene más valor en ese momento. Como un debate televisivo donde los expertos tienen un botón rojo — el moderador solo enciende el micrófono al que más puede aportar.

---

## 4. La cronología — 7 rondas de debate

### Ronda 1 — El borrador y el primer impacto

**11 problemas genuinamente nuevos** en 13 RF. El ratio de casi 1 problema por RF habría aparecido como bugs o errores de diseño durante la implementación. El debate los encontró antes.

El más peligroso: RF-004 interpretaba "no" como "sin restricciones". Si el usuario escribía *"No permitir acceso a usuarios sin matrícula activa"*, el sistema borraría esa restricción. En un contexto clínico, ese bug silencioso podría tener consecuencias reales.

### Ronda 2 — El problema del Enter

Gemini identificó el bug más peligroso del proceso: cuando el usuario presionara Enter para hacer un punto y aparte en texto multilínea, el sistema capturaría el texto incompleto y lo aceptaría como válido. Sin aviso. Sin error.

La cascada de fallo: texto incompleto → Briefing basado en información parcial → debate sobre humo → documentación de mala calidad sin que nadie sepa por qué.

**Hallazgo meta:** DeepSeek y Kimi intercambiaron roles sin aviso. DeepSeek (asignado como Adversarial) respondió como QA sistemático. Kimi (asignado como Revisor) respondió como Adversarial feroz. Esto reveló que los modelos tienen especializaciones naturales que no siempre coinciden con los roles asignados.

### Ronda 3 — El cierre y los primeros artefactos

Curva de rendimiento decreciente: Ronda 1 → 11 hallazgos, Ronda 2 → 7, Ronda 3 → 1. El debate se cierra naturalmente cuando se satura.

ChatGPT generó el Glosario del proyecto sin que nadie se lo pidiera. Detectó que el documento usaba términos en inglés sin definirlos y los tradujo al español. Ese output inesperado es uno de los argumentos más honestos a favor del sistema: un debate bien diseñado produce valor más allá del scope definido.

### Ronda 4 — Los bugs críticos

**La ronda más importante del proceso.** DeepSeek, en rol adversarial, encontró cuatro bugs críticos:

**Bug 1 — Vulnerabilidad de inyección de templates**
Si el usuario escribía `{{dominio}}` en su objetivo, el sistema lo reemplazaría por el valor real del dominio, corrompiendo el input. La solución fue arquitectónica: separar el input del usuario como mensaje `user` en el array `messages` de la API. El modelo distingue estructuralmente entre instrucciones y contenido.

**Bug 2 — Extracción de JSON con regex**
La expresión `/{[\s\S]*}/` falla con JSONs anidados. Solución: marcas `<JSON_OUTPUT>...</JSON_OUTPUT>` en el prompt.

**Bug 3 — Timeout fijo para todos los modelos**
30 segundos no alcanzan para modelos de razonamiento. Solución: campo `timeout_segundos` configurable por modelo.

**Bug 4 — Lista de "sin restricciones" incompleta**
La lista no cubría el español argentino ("ni idea", "no tengo"). Solución: pregunta binaria s/n. Determinístico, sin ambigüedad.

### Rondas 5 y 6 — Los artefactos de proceso

MIMO diagnosticó el problema central: *"El proceso como está documentado es un registro excelente de lo que pasó, pero no es un protocolo ejecutable de lo que hay que hacer. Es como leer las notas de un cirujano sobre una operación exitosa — enseña mucho, pero no te habilita a operar."*

MiniMax respondió produciendo **11 artefactos en una sola ronda:** protocolo de ronda, checklist del orquestador, threshold de suficiencia, registro de fallos, 6 prompts de agentes, y 5 casos de ground truth en JSON.

### Ronda 7 — El experimento multi-rol y el bootstrapping

**La pregunta del experimento:** ¿Los roles cambian genuinamente el output, o son decorativos?

**El resultado inesperado:** Qwen no hizo el experimento. Después de 7 rondas de debate sobre *cómo debería funcionar* el sistema, interpretó la situación como una señal de que era tiempo de actuar. Entregó el código:

- `prompts/orquestador_briefing_v1.md`
- `schemas/briefing.schema.json`
- `config/available_models.json`
- `config/fallback_defaults.json`
- `test_briefing.js` — el runner listo para ejecutar

Cinco artefactos listos para usar. Ese es el **bootstrapping del sistema MAD**: el proceso de debate produjo el código para construirse a sí mismo.

**Lo que el experimento confirmó:** Sí — los roles son reales. ChatGPT y DeepSeek encontraron cosas distintas desde cada rol con el mismo input.

---

## 5. Los 6 momentos bisagra

1. **El primer mensaje de Claudio** — la descripción del trabajo manual contenía el diseño del sistema
2. **La contradicción StakeSim** — ¿mandatorio por dominio o por complejidad? La respuesta cambió la arquitectura
3. **El problema del Enter** — el bug más peligroso es el que produce basura con aspecto de output válido
4. **La vulnerabilidad de inyección** — la solución no fue más validación sino cambiar la arquitectura
5. **MiniMax y los 11 artefactos** — el proceso puede producir valor más allá del scope definido
6. **Qwen dejó de debatir y escribió el código** — la señal de cuándo pasar al código no vino del Orquestador sino de un agente

---

## 6. Hallazgos empíricos

### H1 — Los roles son reales, no decorativos

El mismo input, el mismo modelo, roles distintos → hallazgos distintos. El diseño de roles en sistemas multi-agente tiene valor real.

### H2 — El adversarial es el rol más crítico

Sin adversarial, los debates convergen prematuramente. Confirmado empíricamente en la Ronda 7 cuando el adversarial quedó vacante: esa ronda fue la más convergente y menos crítica.

### H3 — La curva de rendimiento decreciente es señal de salud

| Ronda | Hallazgos nuevos       |
| ----- | ---------------------- |
| 1     | 11                     |
| 2     | 7                      |
| 3     | 1                      |
| 4     | 5 (nuevo scope)        |
| 5     | 9 (artefactos MiniMax) |
| 6     | 2                      |
| 7     | 7 (experimento)        |

El criterio de cierre correcto no es "N rondas" sino "≤1 hallazgo nuevo en la última ronda".

### H4 — Los errores más peligrosos son los silenciosos

El "no" interpretado como "sin restricciones", el texto incompleto aceptado sin aviso, el JSON válido pero semánticamente vacío — ninguno hace crashear el sistema. Todos producen output incorrecto con aspecto de output válido.

### H5 — El contexto acumulado vale más que los archivos

DeepSeek y Qwen no recibieron los artefactos de MiniMax por limitación de la plataforma. Aun así, encontraron hallazgos de la misma calidad. El conocimiento acumulado en rondas previas compensó la falta de archivos físicos.

### H6 — Los outputs inesperados son los más valiosos

El glosario de ChatGPT, los 11 artefactos de MiniMax, el código de Qwen — ninguno fue solicitado. Los tres emergieron porque el agente interpretó el contexto y actuó.

---

## 7. Lecciones para quien quiera replicarlo

1. **Diseñá el proceso antes de diseñar el sistema** — el Manifiesto, el Protocolo, el Glosario son el sistema
2. **El adversarial nunca es opcional** — sin él, el debate produce consenso falso
3. **Limitá los puntos por rol** — 3 puntos máximo obliga a priorizar lo importante
4. **Usá restricciones positivas en los prompts** — "hacé exclusivamente Y" ancla mejor que "no hagas X"
5. **Compilá el contexto en un solo documento** — para superar limitaciones de plataformas
6. **El criterio de cierre es rendimiento decreciente, no N rondas**
7. **Separá los objetos de estado** — Debate Log (auditoría) ≠ Log técnico (operacional)

---

## 8. El sistema que resultó

El RF v0.3 tiene **51 decisiones** de 7 rondas de debate + 1 experimento. Cada una con origen trazable: una ronda, un agente, un argumento.

**Artefactos de software:**

- `test_briefing.js`, system prompt, schemas, catálogo de modelos, defaults del Plan C

**Artefactos de proceso:**

- Manifiesto, Protocolo, Checklist, Glosario, Mapa de Artefactos, Threshold, Registro de Fallos, 6 prompts de agentes, 5 casos de ground truth

---

## 9. Trabajo futuro

**El paper académico:**

- Pregunta: ¿El diseño de roles en sistemas MAD afecta la calidad del output de forma medible?
- Comparar RF v0.1 (sin debate) vs RF v0.3 (con debate) en métricas objetivas
- Contribución: aplicación de MAD a documentación técnica en sector público de salud

**Los módulos restantes:**
| Módulo | Estado |
|---|---|
| Módulo 1 | ✅ Especificado — en implementación |
| Módulo 2 | 📋 Arquitectura documentada (77 decisiones) |
| Módulo 3 | 📋 Especificado conceptualmente |
| Módulo 4 | 🔮 POST-MVP |

---

## Epílogo

Este proyecto empezó con una queja de eficiencia: copiar y pegar entre IAs daba trabajo.

Terminó con un sistema que se diseñó a sí mismo, encontró sus propios bugs, produjo sus propios artefactos de proceso, y demostró empíricamente que el proceso funciona.

La ironía más bella del proyecto es la del bootstrapping: el primer caso de uso del sistema MAD fue generar la documentación del sistema MAD.

Eso no estaba planeado. Emergió. Y eso es, quizás, la evidencia más fuerte de que el sistema funciona.

---

*Claudio — Buenos Aires — Enero 2026*
*Con Claude 3.7, ChatGPT, Gemini, DeepSeek, Qwen, Kimi, MIMO y MiniMax*

---

## Apéndice — Decisiones FUNDACIONALES

1. El agente Adversarial es mandatorio en todo debate, sin excepciones
2. StakeSim es mandatorio en debates de dominio Salud
3. El árbitro humano tiene la última palabra en todas las decisiones
4. El Debate Log es append-only e inmutable
5. El Briefing es inmutable una vez aprobado

## Apéndice — Referencias

- Du, Y. et al. (2023). *Improving factuality and reasoning through multiagent debate.* arXiv:2305.14325
- Irving, G. et al. (2018). *AI safety via debate.* arXiv:1805.00899
- Wang, J. et al. (2024). *Mixture-of-Agents enhances large language model capabilities.* arXiv:2406.04692
- Zhou, Y. & Chen, X. (2025). *Adaptive heterogeneous multi-agent debate.* J. King Saud University CIS.
