# MAPA_DE_ARTEFACTOS.md
## Sistema MAD — Motor de Debate Multi-Agente
### Versión: 1.0 — Mayo 2025
### Estado: Documento vivo — actualizar con cada nuevo artefacto

---

## Propósito

Este documento es el índice navegable de todos los artefactos del proyecto MAD.
Un equipo nuevo lo lee primero. Le dice qué existe, para qué sirve, en qué orden consultarlo,
y qué documento tiene autoridad sobre cuál.

**Si dos documentos se contradicen, este mapa indica cuál prevalece.**

---

## Orden de consulta para un equipo nuevo

```
1. OBJETIVO_PROYECTO_MAD.md        ← qué es el sistema
2. GLOSARIO.md                     ← vocabulario compartido
3. MANIFIESTO_ORQUESTADOR.md       ← qué hace el Orquestador
4. 10_RF_Modulo1_MAD_v03.md        ← qué estamos construyendo
5. ground_truth/                   ← cómo validamos
6. prompts/                        ← cómo se comporta el Orquestador
```

---

## Nivel 1 — Proceso del debate

| Documento | Para qué |
|---|---|
| `MANIFIESTO_ORQUESTADOR.md` | Responsabilidades y poderes del Orquestador |
| `PROTOCOLO_DE_RONDA.md` | Cómo ejecutar una ronda de debate |

---

## Nivel 2 — Definiciones compartidas

| Documento | Para qué |
|---|---|
| `GLOSARIO.md` | Definición de todos los términos del sistema |
| `OBJETIVO_PROYECTO_MAD.md` | Descripción general del proyecto |

---

## Nivel 3 — Agentes del sistema

| Documento | Rol | Modelo recomendado |
|---|---|---|
| `prompts/orquestador_briefing_v1.md` | Orquestador — genera el Briefing | Claude 3.5 Sonnet |

*(Los prompts de los 6 agentes de debate van en docs/prompts/agentes/ — pendiente de migrar)*

---

## Nivel 4 — Casos de prueba (ground_truth/)

| Archivo | Dominio | Valida |
|---|---|---|
| `CASO_01_ABM_SIMPLE.json` | Genérico | Flujo básico |
| `CASO_02_PERMISOS_ROLES.json` | GovTech | Permisos y roles |
| `CASO_03_INTEGRACION_EXTERNA.json` | Fintech | API externa |
| `CASO_04_ESTADOS_COMPLEJOS.json` | Genérico | Máquina de estados |
| `CASO_05_SALUD_CLINICO.json` | Salud | Offline + Ley 153 + StakeSim |

---

## Nivel 5 — El RF y su historia (docs/)

| Documento | Qué es | Estado |
|---|---|---|
| `RF_Modulo1_MAD_v01.md` | Borrador original — 13 RF | Superado |
| `01_` a `09_` | Historial de rondas de debate | Cerrado |
| `10_RF_Modulo1_MAD_v03.md` | RF v0.3 — **listo para codificar** | ✅ Activo |
| `EXP_01_TodosLosRoles_Consolidado.md` | Experimento de rotación de roles | Cerrado |

---

## Artefactos pendientes

| Artefacto | Prioridad |
|---|---|
| `PROTOCOLO_MAESTRO.md` (fusión de dos protocolos) | 🔴 Alta |
| `config/roles_agentes.json` | 🟡 Media |
| Runner automático del ground truth | 🟡 Media |

---

*Mayo 2025 — Sistema MAD v1.0 — Generado por Claude 3.7*
