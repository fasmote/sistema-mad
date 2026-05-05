# GLOSARIO.md
## Sistema MAD — Motor de Debate Multi-Agente
### Versión 1.0 — Mayo 2025
### Documento vivo — se actualiza con cada nueva versión del sistema

---

## Instrucciones de uso

Este glosario define los términos técnicos y del dominio usados en todos los documentos del proyecto MAD. Cuando un término en inglés tiene traducción adoptada oficialmente, se usa la traducción en todos los documentos nuevos. Los documentos anteriores conservan sus términos originales.

Si un documento introduce un término nuevo no definido aquí, el autor debe agregarlo antes de distribuir el documento.

---

## A

**Agente**
Instancia de un modelo de IA con un rol y un system prompt específico. Un modelo puede tener múltiples agentes con roles distintos.

**Agente Adversarial**
Agente cuyo rol es atacar los argumentos de los demás, buscar contradicciones, y forzar a los otros agentes a justificar sus posiciones. Es mandatorio en todo debate — sin él, los debates convergen prematuramente (ver: *consensus drift*).

**Agente Simulador de Stakeholder (StakeSim)**
Agente con prompt conductual que simula el comportamiento real del usuario final: el médico con 90 segundos por paciente, el enfermero a las 3am, el administrativo sin formación técnica. Mandatorio en debates del dominio Salud.

**Árbitro humano**
El ser humano que tiene la última palabra en el sistema. En el contexto actual: Claudio. Aprueba decisiones FUNDACIONALES y resuelve deadlocks.

---

## B

**Briefing Técnico / Ficha de Inicio del Debate**
Documento JSON generado al final del Módulo 1 que define qué se va a debatir, con qué reglas, qué agentes participan y qué límites tiene el debate. Inmutable una vez aprobado.

---

## C

**Cajón de Sastre (anti-patrón)**
Un RF o sección que concentra responsabilidades heterogéneas sin cohesión, imposibilitando su testeo independiente.

**Consensus Drift**
Fenómeno donde los agentes tienden a acordar artificialmente después de varias rondas aunque no hayan resuelto el problema real.

---

## D

**Debate Log**
Registro cronológico e inmutable de todo lo que ocurrió durante el debate. Solo sirve para auditoría. Formato: JSONL.

**Decision Record**
Decisión consolidada que emergió del debate, con fundamento y trazabilidad.

**Definition of Done (DoD)**
Checklist que define cuándo un RF está completo.

**Documento Vivo**
El RF limpio que se está construyendo durante el debate. Se versiona con git.

**Dominio**
Categoría temática que preconfigura los agentes: Salud, GovTech, Fintech, Genérico.

---

## F

**Floor Control Dinámico**
Mecanismo de gestión de turnos: cada agente envía una señal de intención barata antes de hablar. El Orquestador decide quién habla según el valor del aporte.

---

## G

**Ground Truth**
Conjunto de ejemplos validados por expertos humanos que sirven como referencia para evaluar si el sistema produce documentos de calidad.

---

## H

**Handoff / Pase de Posta**
Transferencia formal de control entre módulos del sistema.

---

## M

**MAD (Multi-Agent Debate)**
Metodología donde múltiples instancias de modelos de IA proponen, critican y refinan respuestas durante rondas sucesivas.

**MoA (Mixture of Agents)**
Patrón donde los outputs de múltiples LLMs son sintetizados por una capa de composición supervisada.

---

## O

**Orquestador**
Componente que gestiona el debate: decide quién habla, detecta consensus drift, comunica con el árbitro humano y produce síntesis de cada ronda.

---

## R

**Rastro de Auditoría / Audit Trail**
Registro cronológico e inmutable de todas las decisiones de diseño con sus justificaciones.

**RF (Requerimiento Funcional)**
Especificación de una funcionalidad que el sistema debe proveer.

**RNF (Requisito No Funcional)**
Restricción de calidad o comportamiento que aplica transversalmente.

---

## S

**Señal de Intención**
Mensaje corto que un agente envía al Orquestador antes de su turno completo.

**Suficiencia Razonable**
Punto donde continuar debatiendo cuesta más de lo que aporta.

**System Prompt**
Instrucción inicial que define el rol, restricciones y formato de output de un agente.

---

## Términos en inglés con equivalente oficial en español

| Término inglés | Término español adoptado |
|---|---|
| Briefing | Ficha de Inicio del Debate |
| Handoff | Pase de Posta |
| Ground truth | Verdad de Referencia |
| Audit Trail | Rastro de Auditoría |
| Floor Control | Control de Turno |

---

*Claude 3.7 + Claudio — Mayo 2025 — v1.0*
