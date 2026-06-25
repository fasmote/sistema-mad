# MAD — Requisitos anti-alucinación
## Derivados del incidente HIG-B-001 del proyecto HIS/SOS (v1.76)
### Fecha: Junio 2026
### Estado: Requisitos candidatos para el Módulo 2 y Módulo 3 de MAD

---

## El incidente que originó estos requisitos

Durante una ronda de higiene documental del proyecto HIS/SOS, se le pidió a un panel de IAs resolver un bloque de colisiones de IDs (DA-125 a DA-132). Una de las IAs produjo una tabla perfectamente formateada, presentada como "lista para pegar", con los títulos de cada decisión colisionada.

**Los títulos eran fabricados.** No existían en el documento fuente. La IA los inventó para cumplir la consigna.

El error fue detectado por verificación determinista — otra instancia buscó cada ID en el archivo real y comprobó que los títulos no coincidían. La tabla se descartó completa.

**La lección central:** una contribución de IA puede estar impecablemente formateada y ser completamente falsa. La validez no depende del formato, la confianza verbal ni la apariencia de completitud, sino de la verificación contra la fuente.

---

## Por qué esto es crítico para MAD

MAD automatiza un proceso de debate multi-agente. Si los agentes pueden producir contenido fabricado con apariencia válida, y ese contenido se incorpora automáticamente al documento consolidado, MAD amplificaría las alucinaciones en lugar de filtrarlas.

El sistema de debate solo tiene valor si puede distinguir entre:
- Una afirmación extraída de un documento real
- Una inferencia razonable a partir del documento
- Una propuesta nueva del agente
- Una fabricación con formato convincente

---

## RF-MAD-CAND-008 — Clasificación de procedencia de afirmaciones

**Origen:** Incidente HIG-B-001
**Módulo:** 2 (motor de debate)

Toda afirmación producida por un agente debe estar etiquetada según su procedencia:

| Etiqueta | Significado |
|---|---|
| `EXTRAÍDO` | Copiado o citado directamente de un documento fuente |
| `INFERIDO` | Derivado por razonamiento a partir del documento |
| `PROPUESTA` | Idea nueva del agente, no presente en ningún documento |
| `NO_VERIFICADO` | El agente no pudo confirmar contra fuente |

**Regla:** Una tabla o bloque que mezcle afirmaciones extraídas e inferidas sin marcar cuál es cuál no puede incorporarse al documento consolidado.

**Criterio de aceptación:**
- Cada afirmación factual sobre contenido existente lleva su etiqueta de procedencia
- El Orquestador rechaza bloques sin etiquetar que afirmen contenido histórico
- Las afirmaciones `NO_VERIFICADO` nunca se incorporan automáticamente

---

## RF-MAD-CAND-009 — Matriz de evidencia para afirmaciones históricas

**Origen:** Incidente HIG-B-001
**Módulo:** 3 (consolidación)

Para cualquier auditoría que afirme la existencia de un ID, título o decisión, el agente debe producir una matriz de evidencia:

```
| Afirmación | Documento fuente | Sección/ubicación | Texto exacto encontrado | Estado |
```

Sin esta matriz, la contribución puede servir como opinión, pero **no puede usarse para consolidación documental**.

**Criterio de aceptación:**
- Toda afirmación sobre contenido existente incluye: documento, ubicación, ID completo, título exacto, y cita textual breve
- El Orquestador no consolida afirmaciones sin matriz de evidencia
- La matriz es verificable de forma determinista (un script puede comprobar cada fila)

---

## RF-MAD-CAND-010 — Regla de cuarentena por fabricación

**Origen:** Incidente HIG-B-001
**Módulo:** 2 y 3

Si un agente fabrica títulos, IDs o decisiones, su contribución factual **no se corrige parcialmente**. Se aplica:

```
CONTRIBUCIÓN DESCARTADA POR BASE FÁCTICA NO VERIFICADA
```

No "usar con cuidado". No "rescatar lo útil". Se descarta la parte factual completa.

**El fundamento:** una fabricación puede contaminar otras partes de la misma respuesta. Si un agente inventó un dato, no hay garantía de que el resto de sus afirmaciones factuales sean confiables. El costo de revisar parcialmente supera el de descartar y volver a pedir.

**Criterio de aceptación:**
- Detectada una fabricación, toda la sección factual de esa contribución se marca como descartada
- La opinión o análisis del agente puede preservarse, pero ningún dato factual no verificado
- El descarte queda registrado en el log con el motivo

---

## RF-MAD-CAND-011 — Verificación determinista pre-incorporación

**Origen:** Incidente HIG-B-001
**Módulo:** 3 (el MAD-Linter ya implementa parte de esto)

Antes de incorporar cualquier bloque al documento consolidado, un verificador determinista (no una IA) debe comprobar:

```
Para cada ID citado:
  - ¿Existe en el documento fuente?
Para cada título citado:
  - ¿Coincide exactamente con el documento fuente?
Para cada cita a un ID colisionado:
  - ¿Incluye el sufijo o título que lo desambigua?
```

Si no pasa, no entra.

**Conexión con el MAD-Linter:** El linter ya verifica referencias rotas (chequeo [A]) e IDs duplicados (chequeo [B]). Este requisito extiende esa capacidad: verificar que los títulos citados por un agente coincidan con los títulos reales en la fuente.

**Criterio de aceptación:**
- El verificador corre antes de toda incorporación al consolidado
- Compara IDs y títulos citados contra la fuente real
- Bloquea la incorporación si encuentra discrepancias
- Es determinista — mismo input, mismo resultado, sin intervención de IA

---

## RF-MAD-CAND-012 — Clasificación de tipo de ronda

**Origen:** Análisis del incidente HIG-B-001
**Módulo:** 2 (orquestación)

Toda ronda se clasifica **antes de lanzarse**, y el tipo determina qué agentes participan y qué verificación se aplica:

| Tipo | Propósito | Mecanismo |
|---|---|---|
| **A — Verificación documental** | Confirmar si algo existe o está resuelto | Linter/búsqueda determinista + 1 IA verificadora. NO panel amplio |
| **B — Decisión funcional** | Resolver una pregunta de diseño | Panel multi-IA + moderación humana |
| **C — ADR técnico** | Decidir representación técnica | Panel multi-IA + restricciones + verificación técnica |
| **D — Redacción documental** | Producir o editar texto | IA + matriz de cambios + validación posterior |

**El error de HIG-B-001:** era una ronda Tipo A (verificar si las colisiones seguían abiertas), pero se trató como Tipo B (resolver las colisiones). Pedirle a un panel que "resuelva" algo que primero había que "verificar" abrió la puerta a la fabricación.

**La pregunta correcta para una ronda Tipo A no es** "resolvé este problema" **sino** "¿este problema sigue abierto? Mostrame la evidencia."

**Criterio de aceptación:**
- Cada ronda declara su tipo antes de ejecutarse
- El tipo determina la cantidad de agentes y el tipo de verificación
- Las rondas Tipo A no usan panel amplio — usan verificación determinista
- El prompt de una ronda Tipo A pide evidencia, no solución

---

## El cambio en el prompt de auditoría

Para todas las rondas de auditoría futuras, este bloque pasa a ser obligatorio en el prompt:

```
Antes de proponer cambios, verificá si el problema ya está resuelto en los
documentos vigentes.

No inventes títulos, IDs, decisiones ni secciones.
Si no encontrás evidencia documental, escribí: NO VERIFICADO.

Toda afirmación sobre contenido existente debe incluir:
- documento;
- sección o ubicación;
- ID completo;
- título exacto;
- breve cita o referencia textual.

Si una tabla contiene datos no verificados, marcala como BORRADOR NO PEGABLE.
No entregues bloques "listos para pegar" con datos históricos salvo que estén
verificados contra fuente.
```

---

## El flujo correcto que estos requisitos imponen

El incidente reveló que el flujo "IA propone → se pega" es peligroso. El flujo correcto es:

```
1. IA propone
2. IA o validador extrae la evidencia
3. Script/linter verifica IDs y títulos contra la fuente
4. Moderador consolida
5. Solo después se incorpora
```

La verificación determinista (paso 3) es donde el MAD-Linter ya tiene la base construida. Lo que falta es extenderlo para verificar títulos citados, no solo referencias e IDs.

---

## Resumen: el principio central

El incidente HIG-B-001 destila a una regla que debe vivir en el corazón de MAD:

```
Ninguna afirmación histórica entra al corpus sin evidencia.
Ningún bloque "listo para pegar" entra sin verificación.
Ninguna contribución con base factual falsa se rescata parcialmente.
El verificador determinista comprueba lo que el panel redacta.
```

El panel de IAs **propone**. La fuente documental **verifica**. Esa separación es lo que distingue un sistema de debate que filtra alucinaciones de uno que las amplifica.

---

*Requisitos derivados del incidente real HIG-B-001 del proyecto HIS/SOS v1.76*
*Para incorporar al diseño de los Módulos 2 y 3 de MAD*
*Junio 2026*
