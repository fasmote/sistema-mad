# Sistema MAD — Motor de Debate Multi-Agente

> *"El resultado de un debate entre múltiples IAs es más robusto que el de cualquiera de ellas sola."*

---

## ¿Qué es este proyecto?

MAD es un sistema que hace debatir a múltiples inteligencias artificiales para producir documentación técnica de alta calidad — requerimientos funcionales, revisión de código, diseño de arquitectura, y más.

En lugar de pedirle a una sola IA que genere un documento, MAD le pasa el problema a varias IAs especializadas con roles distintos y sintetiza lo mejor de cada aporte. El resultado es más completo, más robusto, y tiene menor probabilidad de contener errores silenciosos.

**¿Dónde nació?** Como respuesta a la necesidad de producir requerimientos robustos para sistemas hospitalarios complejos. Su primer caso de uso real es el proyecto HIS/SOS (un sistema operativo sanitario modular).

La historia completa de cómo se construyó está en [`docs/HISTORIA_DEL_PROYECTO.md`](docs/HISTORIA_DEL_PROYECTO.md).

---

## Las dos mitades de MAD

El sistema tiene dos mitades que se complementan:

```
┌─────────────────────────────────────────────────────────────┐
│  MITAD DETERMINISTA  (sin costo de IA, corre en tu máquina)  │
│  Verifica, cuenta y compara documentos. Ya funciona.         │
│  → linter, snapshot, diff, índice                            │
├─────────────────────────────────────────────────────────────┤
│  MITAD DELIBERATIVA  (el motor de debate multi-IA)           │
│  Genera briefings y coordina el debate. En construcción.     │
│  → test_briefing, director (Módulo 1)                        │
└─────────────────────────────────────────────────────────────┘
```

La mitad determinista es la que más valor da hoy: corre sola, no cuesta nada, y detecta los errores que más duelen (referencias rotas, IDs perdidos, títulos fabricados por alucinación).

---

## Herramientas disponibles

### Mitad determinista — verificación documental

| Herramienta      | Qué hace                                                                                                                                      | Comando                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **mad-linter**   | Detecta inconsistencias: referencias rotas, IDs duplicados, eventos fuera de catálogo, y **títulos fabricados por alucinación** (chequeo [H]) | `npm run lint:docs`                       |
| **mad-snapshot** | Censo de artefactos (RF, DA, PH, ADR, FUT, FOA) con sello temporal ART automático. Detecta qué IDs aparecen o **desaparecen** entre corridas  | `node tools/mad-snapshot.cjs <carpeta>`   |
| **mad-diff**     | Compara dos versiones del corpus y reporta qué artefactos **cambiaron de contenido**, cuáles son nuevos y cuáles se eliminaron                | `node tools/mad-diff.cjs <vieja> <nueva>` |
| **mad-index**    | Genera un índice persistente de todos los artefactos y sus relaciones                                                                         | `npm run index:docs`                      |

### Mitad deliberativa — motor de debate

| Herramienta       | Qué hace                                                          | Comando     |
| ----------------- | ----------------------------------------------------------------- | ----------- |
| **test_briefing** | Valida que el generador de briefings funcione (5 casos de prueba) | `npm test`  |
| **director**      | La CLI que te entrevista y genera un briefing real (Módulo 1)     | `npm start` |

---

## Arquitectura del sistema

```
Módulo 1 → Entrevista + Generación de Briefing   (✅ implementado)
Módulo 2 → Motor de debate (Floor Control)        (📋 especificado)
Módulo 3 → Consolidación + verificación documental (🟡 linter/snapshot/diff funcionando)
Módulo 4 → Memoria persistente                     (🔮 POST-MVP)
```

**Stack técnico:** Node.js · OpenRouter API · readline · JSON/JSONL · Git

---

## Instalación

### Requisitos

- [Node.js](https://nodejs.org) versión 18 o superior
- Una cuenta en [OpenRouter](https://openrouter.ai) (solo para la mitad deliberativa)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/fasmote/sistema-mad.git
cd sistema-mad

# 2. Instalar las dependencias
npm install

# 3. Configurar la API key (solo para el motor de debate)
copy .env.example .env
# Editar .env y agregar tu OPENROUTER_API_KEY

# 4. Verificar que todo funciona
npm test            # motor de briefing (5/5 PASS)
npm run test:linter # verificador documental (10/10 PASS)
```

---

## Flujo de trabajo típico

Para mantener un corpus documental coherente entre versiones:

```bash
# Antes de reescribir un documento — guardás el censo actual
node tools/mad-snapshot.cjs "ruta/a/tus/documentos"

# Reescribís / editás lo que sea

# Después — te dice qué cambió y si algo se perdió
node tools/mad-snapshot.cjs "ruta/a/tus/documentos"

# Para comparar dos versiones completas
node tools/mad-diff.cjs "ruta/v1.80" "ruta/v1.83"
```

Si algo desapareció sin querer al reescribir, las herramientas te avisan al instante.

---

## Los chequeos del linter

| Chequeo | Detecta                                                                    |
| ------- | -------------------------------------------------------------------------- |
| [A]     | Referencias a RF que se citan pero nunca se definen                        |
| [B]     | IDs definidos dos veces                                                    |
| [C]     | Títulos numerados repetidos                                                |
| [D]     | Versión del archivo distinta de la metadata                                |
| [E]     | Conjunto de documentos en versiones mezcladas                              |
| [F]     | Eventos usados que no están en el catálogo canónico                        |
| [G]     | Eventos con nombres sospechosamente parecidos                              |
| **[H]** | **Títulos divergentes para el mismo ID — posible alucinación/fabricación** |

El chequeo [H] nació de un incidente real: una IA produjo una tabla "lista para pegar" con títulos de decisiones que no existían en la fuente — los inventó. El linter ahora detecta eso automáticamente. Ver [`docs/MAD_Requisitos_Anti_Alucinacion.md`](docs/MAD_Requisitos_Anti_Alucinacion.md).

---

## Estructura del repositorio

```
sistema-mad/
├── test_briefing.js          ← valida el generador de briefings
├── director.js               ← CLI del Módulo 1 (entrevista + briefing real)
├── .env.example              ← plantilla de configuración
├── package.json
├── tools/
│   ├── mad-linter.cjs        ← verificador de coherencia [A-H]
│   ├── test_linter.cjs       ← tests del linter (10 casos)
│   ├── mad-index.cjs         ← índice persistente de artefactos
│   ├── mad-snapshot.cjs      ← censo + sello temporal + diff de IDs
│   └── mad-diff.cjs          ← comparador de contenido entre versiones
├── prompts/                  ← system prompts del Orquestador
├── schemas/                  ← validación JSON del briefing
├── config/                   ← catálogo de modelos y defaults
├── ground_truth/             ← 5 casos de validación
└── docs/                     ← documentación completa del proyecto
    ├── HISTORIA_DEL_PROYECTO.md
    ├── MAD_Requisitos_Anti_Alucinacion.md
    ├── 10_RF_Modulo1_MAD_v03.md
    ├── GLOSARIO.md
    ├── MANIFIESTO_ORQUESTADOR.md
    ├── MAPA_DE_ARTEFACTOS.md
    └── PROTOCOLO_DE_RONDA.md
```

---

## Notas técnicas

**¿Por qué algunos archivos son `.cjs` y otros `.js`?**
El `package.json` declara `"type": "module"`, lo que hace que Node trate los `.js` como ES Modules (con `import`). Las herramientas del linter usan CommonJS (`require`), así que llevan extensión `.cjs` para convivir sin conflicto. El `test_briefing.js` y el `director.js` usan `import`; las herramientas de `tools/` usan `require`.

**Las herramientas son adaptables.** Cada una tiene un bloque `CONFIG` al principio con los patrones específicos del proyecto (cómo se escribe un RF, dónde está el catálogo de eventos, etc.). Para usarlas en otro proyecto con otras convenciones, se edita solo ese bloque.

---

## Lo que hace especial a este proyecto

El sistema MAD fue diseñado usando el propio proceso que implementa. Durante el desarrollo:

- **8 IAs distintas** participaron en el diseño
- **7 rondas de debate** para especificar el Módulo 1
- **51 decisiones** documentadas y trazables
- **Bootstrapping:** el proceso de debate produjo el código para construirse a sí mismo

Y la mitad determinista nació de necesidades reales del proyecto HIS/SOS: cada herramienta resuelve un problema que apareció al mantener un corpus de cientos de artefactos coherente a lo largo de decenas de versiones.

---

## Licencia

MIT

---

*Desarrollado por Claudio (Buenos Aires) con Claude como Orquestador.*
