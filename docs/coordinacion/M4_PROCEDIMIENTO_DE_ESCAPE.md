# M4 — Procedimiento de escape ante ruleset sin bypass

| Campo | Valor |
|---|---|
| **Documento** | `M4_PROCEDIMIENTO_DE_ESCAPE` |
| **Repositorio** | `fasmote/sistema-mad` |
| **Ruleset gobernado** | M4: protección contra merge (ID `20905040`) |
| **Check gobernado** | `mad-ci-verify` (workflow `MAD CI`) |
| **Ejecuta** | Únicamente el árbitro humano |
| **Estado** | Vigente |

---

## Qué problema resuelve

Con `mad-ci-verify` configurado como required status check, el ruleset M4 exige
que todo cambio a `main` llegue por un pull request y que ese pull request tenga
el check en verde. Al no haber bypass, la regla alcanza también al propietario
del repositorio.

El escenario de encierro es concreto:

```text
El check no puede ponerse en verde por una causa ajena al cambio
        ↓
Todo pull request queda bloqueado
        ↓
El pull request que resolvería el problema TAMBIÉN queda bloqueado
        ↓
No hay forma de llegar a main
```

Este documento define cómo salir de esa situación con la menor intervención
posible sobre la protección, y cómo restaurarla sin dejar residuos.

**Regla de fondo:** la ventana de escape existe para lo que el diagnóstico
demuestre irreparable por la vía ordinaria. No es un atajo para un rojo
legítimo, ni para evitar la molestia de agregar commits a un pull request.

---

## A. Criterios de activación de la ventana de escape

La ventana **solo** se abre si se cumplen **las cinco** condiciones:

1. `mad-ci-verify` impide fusionar un pull request, en cualquiera de sus dos
   formas bloqueantes:
   - **`failure`** — el check corrió y dio rojo.
   - **`Expected — waiting for status`** — el check nunca se reportó.
2. El diagnóstico de la sección B **no** atribuye la causa a un defecto del
   cambio propuesto.
3. **La vía ordinaria (D-0) fue intentada y no puede producir el check en
   verde.** Esta condición es la que distingue una reparación normal de una
   emergencia.
4. Existe un cambio urgente y justificado que debe llegar a `main`, y **esperar
   la recuperación no es una alternativa aceptable**.
5. El árbitro humano **autoriza específicamente** abrir la ventana.

**No se abre** cuando el rojo se debe a que el cambio realmente rompe algo: ahí
el gate está funcionando y corresponde corregir el cambio. **Tampoco se abre**
cuando basta con agregar commits al pull request hasta que el check pase.

> **Por qué la condición 3 hace que la ventana sea rara.** En los eventos
> `pull_request`, GitHub ejecuta sobre `refs/pull/<número>/merge` y
> `actions/checkout` toma por defecto esa referencia combinada. Por eso, al
> actualizar la rama del pull request puede ejecutarse la versión corregida del
> workflow: un SHA de action retirado, una versión de Node que desapareció del
> runner o un error de sintaxis introducido en un merge suelen repararse por la
> vía ordinaria, sin tocar el ruleset. El PR #8 aportó evidencia empírica de
> este comportamiento: el workflow se ejecutó antes de existir en `main`.
>
> **Los casos conocidos que normalmente no se resuelven agregando commits al
> pull request suelen corresponder al servicio, la cuenta o la configuración del
> repositorio. La lista no es exhaustiva y debe confirmarse mediante
> diagnóstico.** Existen además situaciones en las que el workflow directamente
> no se ejecuta —por ejemplo, mientras el pull request tenga conflictos de
> merge, o cuando un pull request externo requiere aprobación previa— que no
> encajan en esa clasificación y se resuelven por otras vías.

---

## B. Diagnóstico previo obligatorio

Se corren las cuatro suites **localmente, bajo el mismo entorno**, sobre **dos
SHAs exactos y anotados**: la punta de la rama del pull request y la punta de
`main`. Ningún resultado se interpreta antes de tener los dos.

```bash
node tools/test_linter.cjs
node tools/test_pack.cjs
node tools/test_release_gate.cjs
node tools/test_impact_lite.cjs
```

| Rama del PR | `main` | Interpretación | Acción |
|---|---|---|---|
| **Falla** | **Pasa** | El cambio probablemente introdujo el defecto | Corregir el cambio. **No corresponde escape.** |
| **Falla** | **Falla** | Problema compartido: baseline, toolchain o entorno. **No permite concluir cuál sin más evidencia.** | Ampliar diagnóstico antes de decidir |
| **Pasa** | **Pasa**, pero CI falla | Problema probable de CI, workflow, runner o Actions | Continuar al punto siguiente |
| **Pasa** | **Falla** | Resultado anómalo | Revisar SHAs, entorno local y diferencias entre árboles antes de cualquier conclusión |

Complementos del diagnóstico:

- Revisar el log de la corrida y distinguir fallo de una suite (código) de fallo
  de infraestructura (checkout, setup-node, timeout, runner).
- Si el check quedó en `Expected` y nunca reportó: revisar la sintaxis YAML del
  workflow en la rama, que el nombre del job siga siendo exactamente
  `mad-ci-verify`, y el estado del servicio de Actions —incluidas cuota y
  habilitación del repositorio—.

La conclusión, con ambos SHAs y la celda de la matriz que aplica, se registra
**antes** de tocar nada.

---

## C. Quién ejecuta

**Únicamente el árbitro humano.** Ninguna IA modifica el ruleset, ni propone
hacerlo por iniciativa propia, ni ejecuta los pasos de las secciones D y D-bis.
El rol de las IAs se limita a diagnosticar y a preparar el cambio que se va a
fusionar.

---

## D. Procedimiento

### D-0. Vía ordinaria — primero, con el ruleset intacto

Un required check impide **fusionar**, no impide **agregar commits al pull
request**. Por eso este es siempre el primer intento, y en la mayoría de los
casos el único.

1. Diagnosticar según la sección B.
2. **Reparar el pull request manteniendo el ruleset intacto**: agregar los
   commits necesarios a la rama.
3. Esperar la nueva corrida y comprobar el resultado del check **exacto**
   `mad-ci-verify`.
4. Si queda en verde: **fusionar normalmente. No hubo emergencia y el
   procedimiento termina acá.**

Solo si esta vía no puede producir el check en verde —ni hacerlo reportar— se
evalúan las condiciones de la sección A.

### D-1. Ventana de escape — solo con las cinco condiciones de A cumplidas

Intervención mínima: se quita únicamente el check requerido. El ruleset sigue
activo, sigue exigiendo pull request y sigue bloqueando force-push y eliminación
de `main`.

1. **Registrar el estado previo del ruleset.**
2. **Quitar exclusivamente `mad-ci-verify`** de los required status checks.
   Guardar.
3. **Preparar el pull request de reparación.**
4. **Si Actions funciona: comprobar que `mad-ci-verify` queda en verde en ese
   pull request, antes de fusionarlo.**
5. **Fusionar exclusivamente ese pull request.** Ningún otro.
6. **Verificar el merge y correr las cuatro suites localmente sobre el commit
   efectivamente incorporado a `main`.**
7. **Restaurar `mad-ci-verify`** como required check, en la misma sesión.
8. **Verificar que el ruleset coincide** con el estado previo registrado en el
   paso 1.

> **El paso 4 es coherente porque** quitar el check de la lista de requeridos
> **no apaga el workflow**: MAD CI sigue corriendo y reportando en cada pull
> request; lo único que se suspende es su capacidad de bloquear.
>
> **El paso 6 es local porque** el workflow no se dispara con `push`: fusionar
> no produce ninguna corrida sobre `main`. No existe hoy una corrida automática
> de `main` que verificar.

---

## D-bis. Escenarios en que no se puede obtener ningún check

Son dos situaciones distintas y no comparten procedimiento.

### D-bis-1. Defecto identificado en el repositorio, con el check imposibilitado de reportar

Existe una causa concreta y reparable, pero el check no puede ponerse en verde
ni reportar por la vía ordinaria.

1. **Registrar el estado previo del ruleset.**
2. **Quitar exclusivamente `mad-ci-verify`** de los required status checks.
   Guardar.
3. **Validación local sobre el SHA exacto** de la punta de la rama del pull
   request: las cuatro suites, con salida completa registrada y el SHA anotado.
4. **Revisión del diff completo, línea por línea**, con constancia. Es el
   control compensatorio que reemplaza al check automático.
5. **Fusionar el pull request de reparación**, exclusivamente.
6. **Correr las cuatro suites localmente sobre el commit efectivamente
   incorporado a `main`.**
7. **Restaurar `mad-ci-verify`** como required check, en la misma sesión.
8. **Verificar que el ruleset coincide** con el estado previo registrado en el
   paso 1.
9. **Mantener pendiente la validación de D-bis-3** hasta que el check vuelva a
   poder reportar.

### D-bis-2. Indisponibilidad externa de Actions, sin defecto identificado en el repositorio

El check no puede reportar y el diagnóstico **no** identificó ninguna causa
reparable dentro del repositorio: el servicio no está disponible, la cuota se
agotó, la facturación está en falta, o Actions está deshabilitado. **No hay nada
que reparar en el código.**

#### Paso previo obligatorio — intentar restaurar el servicio antes de tocar el ruleset

Modificar la protección de `main` es siempre posterior a intentar restaurar el
servicio que genera el check. En este orden:

1. Comprobar si el árbitro humano puede **reactivar Actions** en la
   configuración del repositorio o de la cuenta.
2. Resolver **cuota o facturación**, si corresponde.
3. Verificar si existe una **incidencia general de GitHub** publicada.
4. Si la recuperación es razonablemente inmediata, **esperar una nueva corrida**
   y volver a la vía ordinaria D-0.

Si cualquiera de estos pasos restablece el check, **el procedimiento termina
acá: no se abre ninguna ventana y el ruleset no se toca.**

#### Si el servicio no puede restablecerse

Dos alternativas, y solo dos:

**Alternativa 1 — Esperar la recuperación (opción por defecto).**
No se abre ninguna ventana. No se modifica el ruleset. No se fusiona nada. Queda
pendiente la validación de D-bis-3 cuando el servicio vuelva.

**Alternativa 2 — Cambio urgente autorizado.**
Aplica **si y solo si** existe una modificación verdaderamente urgente que deba
llegar a `main`, y el árbitro humano la autoriza **específicamente para ese
cambio concreto**. La urgencia debe justificarse por el contenido del cambio,
nunca por la incomodidad de esperar.

Mecánica completa:

1. **Registrar el estado previo del ruleset.**
2. **Quitar exclusivamente `mad-ci-verify`** de los required status checks.
   Guardar.
3. **Validar localmente las cuatro suites sobre el SHA exacto** de la punta del
   pull request urgente, con salida completa registrada y el SHA anotado.
4. **Revisar el diff completo del pull request, línea por línea**, dejando
   constancia.
5. **Fusionar exclusivamente ese pull request.** Ningún otro.
6. **Correr las cuatro suites localmente sobre el commit efectivamente
   incorporado a `main`.**
7. **Restaurar `mad-ci-verify`** como required check, en la misma sesión.
8. **Verificar que el ruleset coincide** con el estado previo registrado en el
   paso 1.
9. **Mantener pendiente la validación de D-bis-3** hasta recuperar Actions.

No hay "pull request de reparación" en este escenario: lo que se fusiona es el
cambio urgente que motivó la autorización, no un arreglo del repositorio.

### D-bis-3. Validación posterior a la recuperación

**No se introduce ni se fusiona contenido artificial con el único propósito de
disparar el workflow.**

Dos caminos aceptables:

- **Esperar el siguiente pull request legítimo** y comprobar allí que
  `mad-ci-verify` vuelve a reportar verde. Es la opción preferida: no agrega
  nada al repositorio.
- **Pull request técnico de validación, expresamente autorizado**:
  - rama y pull request autorizados específicamente;
  - cambio deliberadamente descartable;
  - pull request en borrador;
  - comprobar el verde;
  - **cerrar sin fusionar**;
  - conservar o eliminar la rama únicamente mediante otra decisión humana.

La vía degradada no se considera cerrada hasta completar uno de los dos caminos.

---

## E. Restauración y verificación

La ventana de escape **se cierra en la misma sesión de trabajo**. No se deja el
check desactivado "hasta mañana".

La restauración no está completa hasta verificar que la configuración coincide
con el estado previo registrado. Un `mad-ci-verify` que quedó fuera de la lista
por olvido es exactamente el fallo silencioso que M4 pretende evitar.

---

## F. Evidencia: qué se registra y dónde

**Durante la emergencia, la evidencia se conserva en un registro externo bajo
control del árbitro humano**, fuera del repositorio. Motivo: el repositorio está
en estado excepcional y escribir en él durante la ventana agrega una acción no
verificada en el momento de mayor riesgo.

Qué se registra:

1. Diagnóstico previo y su conclusión, incluidos ambos SHAs, la celda de la
   matriz que aplica y la ambigüedad si la hubo.
2. Estado del ruleset antes de la intervención.
3. Vía usada (D-0, D-1, D-bis-1 o D-bis-2) y por qué.
4. Evidencia del verde previo a la fusión o, cuando no fue posible obtenerlo,
   salida local completa, SHA validado y constancia de la revisión del diff.
5. Pull request fusionado durante la ventana (uno solo) y su merge commit.
6. Resultado de las cuatro suites locales sobre el commit incorporado.
7. Estado del ruleset después de restaurar.
8. Marca temporal de apertura y de cierre de la ventana.

**Cualquier registro posterior dentro del repositorio** —por ejemplo, una
entrada en `MAD_HISTORIAL_DECISIONES.md`— es un cambio aparte, con su propia
autorización.

---

## G. Qué no hacer

- No abrir la ventana sin haber intentado antes la vía ordinaria D-0.
- No modificar el ruleset antes de intentar restaurar el servicio, cuando la
  causa es externa.
- No fusionar ningún pull request adicional mientras la ventana esté abierta.
- No dejar el check desactivado más allá de la sesión.
- No usar el procedimiento para saltear un rojo legítimo.
- No delegar en una IA la modificación del ruleset.
- No borrar el ruleset como forma de "resolver" el problema.
- No introducir contenido artificial solo para disparar el workflow.
- No dar por cerrada la vía degradada sin la validación de D-bis-3.

---

## H. Alternativas de mayor alcance (documentadas, no recomendadas)

- **Suspender el ruleset completo.** Solo si el problema es la propia regla de
  pull request y no el check. Durante la ventana, `main` queda sin protección de
  pull request. Mismos requisitos de registro, fusión mínima, restauración y
  verificación.
- **Agregar un actor de bypass temporal.** Deja rastro en la configuración y es
  más difícil de revertir sin residuos. Última alternativa, no camino habitual.

*Nota de precisión: la disponibilidad del modo* Evaluate *(aplicar sin bloquear)
depende del plan de GitHub y puede no existir en un repositorio de cuenta
personal. Conviene confirmarlo antes de contarlo como opción; por eso no forma
parte del procedimiento principal.*

---

*Parte del gobierno M4 de `fasmote/sistema-mad`. Este documento se consulta
antes de tocar la protección de `main`, no después.*
