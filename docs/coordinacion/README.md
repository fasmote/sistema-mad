# docs/coordinacion/ — Histórico e intercambio entre Claude y ChatGPT

## Qué hay acá

```
docs/
├── MAD_HISTORIAL_DECISIONES.md          ← EMPEZÁ ACÁ. Registro vivo único,
│                                            una entrada corta por sesión.
└── coordinacion/
    ├── README.md                         ← este archivo
    ├── MAD_TOOL_REGISTRY.md              ← mapa de qué herramienta vive dónde
    ├── RESPUESTA_CLAUDE_PROMOCION_HERRAMIENTAS.md
    ├── CONSULTA_A_CLAUDE_PROMOCION_HERRAMIENTAS_v0_01.md
    └── sesiones/
        ├── _PLANTILLA.md                 ← copiar para sesiones nuevas
        └── AAAA-MM-DD-tema-corto.md       ← detalle fechado de sesiones grandes
```

## Cómo se usa esto, en la práctica

**Después de cada sesión de trabajo relevante sobre MAD:**

1. Agregá una entrada corta (3-6 líneas) al final de
   `MAD_HISTORIAL_DECISIONES.md`, siguiendo la plantilla que está arriba de
   ese mismo archivo.

2. Si la sesión produjo documentos largos (una consulta formal entre IAs,
   un análisis extenso, una decisión con mucho detalle técnico) — copiá
   `sesiones/_PLANTILLA.md` a `sesiones/AAAA-MM-DD-tema-corto.md`, completalo,
   y linkealo desde la entrada del historial.

3. Si la sesión generó documentos de "estado" que se actualizan seguido
   (como `MAD_TOOL_REGISTRY.md`), esos van sueltos en `coordinacion/` — no
   se fechan, se sobreescriben (igual que un registro transversal vivo).

## Por qué existe esta carpeta

Claude y ChatGPT no comparten memoria entre sí. Cada uno solo sabe lo que
está en los documentos de este repo. Esta carpeta es el puente: la fuente de
verdad compartida entre las dos IAs y Claudio (el árbitro humano), para que
ninguna sesión tenga que re-explicar desde cero lo que ya se decidió.

## Regla de oro (la misma que rige todo MAD)

```
Registro corto y vivo  → MAD_HISTORIAL_DECISIONES.md (nunca se reinicia)
Detalle largo y fechado → coordinacion/sesiones/ (uno por sesión grande)
Estado actual del toolchain → coordinacion/MAD_TOOL_REGISTRY.md (se actualiza in place)
```
