# Especificación — Ajustes posdespliegue de Muni Data

**Sistema Integral de Gestión Documental — Municipalidad de Palmares**
Documento para validación con el Product Owner. Versión 2 — 23 de octubre de 2026.

> **Estado: propuesta, pendiente de aprobación.** Este documento no describe
> nada construido todavía. La Fase 1 (reconocimiento y esta spec) está
> cumplida. La Fase 2 empieza solo cuando Gerald escriba «Spec aprobada,
> continúa con la Fase 2» e implementa en el orden de la sección 16.1. Los
> cambios respecto a la versión 1 están en el Anexo B.

---

# Resumen para el Product Owner

*Esta página se puede leer sola. El resto del documento es el detalle técnico.*

## Qué cambia

1. **El código de las categorías lo pone el sistema.** Al crear una sección o
   una subsección ya no se escribe el código: el sistema asigna el siguiente
   número libre (`ITSP-05`, `ITSP-05-01`, `ITSP-05-02`…). Al editar, el código se
   ve pero no se puede cambiar. Los códigos que ya existen **no se tocan**: son
   los que ya están en las URL de WordPress.
2. **Si se mueve una subsección a otra sección, cambia su código y su URL.** El
   sistema lo avisa antes de guardar, con el código viejo y el nuevo, para que
   se actualice el enlace en WordPress.
3. **Una sección no puede pasar a ser subsección, ni al revés.** Hoy el sistema
   lo permite; con los códigos automáticos dejaría URL sin sentido.
4. **Los recuadros de transparencia de WordPress pasan a ser oscuros**, con el
   mismo aspecto que el Observatorio de Datos que ya está en la portada: fondo
   casi negro, tarjeta gris oscuro, botones rojos redondeados y letra Poppins.
   Solo cambia el aspecto: las direcciones, los documentos y lo que se ve son
   los mismos.
5. **Modo oscuro dentro del sistema.** Un botón en la barra superior cambia
   entre claro y oscuro; el sistema recuerda la elección en cada equipo. La
   pantalla de inicio de sesión sigue siempre clara.
6. **El sistema se llama "Muni Data"** en pantalla, en la pestaña del navegador y
   en los correos. Los documentos académicos conservan el nombre formal.

## Qué NO incluye

- **Participación ciudadana sigue sin documentos.** Queda diferido hasta
  aclararlo con usted (sección 2.2).
- No se cambia nada en WordPress, ni la configuración del correo, ni las
  contraseñas.
- No hay logotipo nuevo: se conserva el ícono institucional y el nombre va en
  texto.

## Lo que necesitamos que usted confirme

Gerald ya decidió las tres; las preguntas 1 y 3 quedan **pendientes de
confirmación del PO**. Mientras tanto se implementa lo decidido.

| | Decisión | Decidido por Gerald |
|---|---|---|
| **1** | Hoy el sistema permite convertir una sección en subsección y al revés. Con códigos automáticos lo prohibimos. ¿De acuerdo? | Sí, se prohíbe. Para reorganizar se crea la categoría nueva y se mueven los documentos. **Pendiente de confirmación del PO.** |
| **2** | El encargo habla de URL `/vista/itps-01`, pero el sistema usa `itsp-01` (con **S-P**, de "Índice de Transparencia del Sector Público"). ¿Qué grafía está escrita en las páginas de WordPress? | Se conserva `ITSP` para los códigos nuevos y no se modifica ningún código existente. **Confirmado:** los enlaces de WordPress y los códigos usan `ITSP`, también la quinta raíz (`ITSP-05`). |
| **3** | Los botones de los recuadros públicos serán redondeados (píldora), como en el Observatorio. En el sistema interno la píldora está reservada a las insignias de estado. ¿Aceptamos la excepción solo en los recuadros públicos? | Sí, solo en los recuadros públicos; se anota en `DESIGN.md`. **Pendiente de confirmación del PO.** |

---

## Índice

1. Contexto y objetivo
2. Alcance, fuera de alcance y supuestos
3. Decisiones confirmadas
4. Requisitos funcionales
5. Requisitos no funcionales
6. Modelo de datos y migración
7. Algoritmo de generación de códigos
8. Contrato de la API (cambios)
9. Frontend
10. Manejo de errores
11. Reglas de negocio
12. Seguridad y accesibilidad
13. Rendimiento
14. Pruebas
15. Despliegue sobre datos reales
16. Plan de trabajo, riesgos, criterios de aceptación y preguntas abiertas
- Anexo A — Resultado del reconocimiento (Fase 1)
- Anexo B — Cambios respecto a la versión 1

---

## 1. Contexto y objetivo

Muni Data está desplegado en la VM municipal (Apache + servicio `MuniData-API`
con NSSM + MySQL80) y el supervisor ya cargó datos reales: usuarios, documentos,
dependencias, unas 169 acciones de bitácora y una quinta categoría raíz creada
desde el propio sistema, con una subsección y un documento. Sobre esa base hay
cinco pedidos (encargo §4.1–4.5). Cuatro se implementan; uno (§4.5) queda
diferido.

El objetivo de esta entrega es que todo lo anterior se aplique con el flujo de
siempre (`git pull` → scripts de `despliegue/`) **sobre la base con datos
reales, sin perder ni alterar nada que ya esté en uso**, y con un camino de
vuelta probado.

## 2. Alcance, fuera de alcance y supuestos

### 2.1 Alcance

| Id | Pedido | Resumen |
|---|---|---|
| A1 | §4.1 | Código de categoría autogenerado en el backend, migración idempotente, script de diagnóstico, cambios de formulario y tabla. |
| A2 | §4.2 | Estilo oscuro del Observatorio en las vistas públicas (`/vista/...`), siempre oscuro, con Poppins incluida en el proyecto. |
| A3 | §4.3 | Modo oscuro opcional en el área autenticada, con conmutador, persistencia y sin parpadeo. |
| A4 | §4.4 | Nombre "Muni Data" en la interfaz, el `<title>` y los correos. |
| A5 | §5 | `DESPLIEGUE.md` §"Actualización sobre datos reales" y dos ajustes a `preparar-base-datos.ps1`: `-SoloScripts`, para aplicar la migración sin rehacer el usuario de la aplicación, y una guardia que aborta sobre una base poblada sin registro fiable de scripts (15.2.1). |

### 2.2 Fuera de alcance

- **§4.5 Participación ciudadana (manuales): DIFERIDO, pendiente de aclaración
  con el PO.** No se modifica la exclusión actual
  (`CODIGO_CATEGORIA_RAIZ_EXCLUIDA = 'ITSP-03'` en
  `backend/src/comun/constantes/categorias-itsp.ts` y
  `frontend/src/lib/documentos.config.ts`), ni el aviso "Contenido próximamente".
- WordPress, los snippets de iframe (`frontend/public/iframes/*.html`), la
  configuración SMTP, la contraseña de aplicación, `.env` y secretos.
- Identificadores técnicos: nombre del servicio `MuniData-API`, su
  `DisplayName`/`Description` en `desplegar.ps1`, carpetas, paquetes, nombres de
  tabla y de base.
- El nombre visible del remitente de los correos (ver D-12).
- El esquema de tablas salvo la columna `categorias_itsp.codigo`, la lógica de
  bitácora y la política de no borrado físico.

### 2.3 Supuestos

- S-1. La base de la VM se creó con `preparar-base-datos.ps1`, de modo que
  existe la tabla de control `scripts_aplicados` y la restricción
  `uk_categorias_itsp_codigo` de `01-esquema.sql`. El script de diagnóstico lo
  confirma antes de migrar.
- S-2. La colación de la base de la VM es `utf8mb4_unicode_ci` (la que fija
  `preparar-base-datos.ps1`); la local de Docker es `utf8mb4_0900_ai_ci`. Las
  dos son insensibles a mayúsculas: `itsp-01` encuentra `ITSP-01` en ambas. Solo
  difieren en los espacios finales (`unicode_ci` es PAD SPACE): el diagnóstico
  los reporta por separado.
- S-3. La VM tiene salida al registro de npm, porque `desplegar.ps1` ya ejecuta
  `npm ci` del frontend en cada despliegue.

## 3. Decisiones confirmadas

Tomadas del encargo; no se reabren.

| Id | Decisión |
|---|---|
| C-1 | Código autogenerado con la opción A: máximo + 1, por nivel. |
| C-2 | Dos niveles exactos; una raíz no se convierte en subsección ni al revés. |
| C-3 | Mover una subsección recalcula **solo su** código; los demás no cambian. |
| C-4 | La migración no modifica ningún código existente; solo rellena nulos y vacíos. |
| C-5 | Duplicados: la migración aborta y los lista, sin corregirlos. |
| C-6 | Concurrencia: transacción + índice único + hasta 3 reintentos. |
| C-7 | Vistas públicas siempre oscuras, tokens del Observatorio, acento `#ba0911` (intencional, distinto del `#D30505` interno). |
| C-8 | Poppins incluida en el proyecto (sin CDN y sin la ruta `wp-observatorio`). |
| C-9 | Modo oscuro solo en el área autenticada; clave `munidata-tema` en `localStorage`; la primera vez sigue `prefers-color-scheme`. |
| C-10 | Public Sans se mantiene en el sistema interno. |
| C-11 | Commits permitidos, solo locales, directo en `main`, sin push. Pequeños (uno por paso de 16.1 o más finos), con `git add` de rutas explícitas y revisión de `git diff --cached` antes de cada uno. Antes del primero se crea la etiqueta local `antes-ajustes` en el `HEAD` de partida. Prohibidos `push`, `amend`, `rebase`, `reset`, `force`, `--no-verify` y cambiar de rama. Gerald hace el push. |

### 3.1 Decisiones asumidas

Defaults aplicados por ambigüedad del encargo o por choque con el repositorio.
Todas se pueden revertir antes de la Fase 2.

| Id | Ambigüedad | Decisión asumida | Motivo |
|---|---|---|---|
| D-1 | El encargo dice `ITPS-NN`; el repo siembra `ITSP-NN` en mayúsculas (`03-datos-itsp.sql`) y los snippets usan `/vista/itsp-0N`. | Prefijo **`ITSP`**, almacenado en **mayúsculas**, salida pública en minúsculas (como hoy). | La realidad del repo manda (encargo §0). |
| D-2 | La raíz creada a mano en la VM pudo guardarse como `itps-05`, `ITPS-05`, `ITSP-05` u otro texto. | Para calcular el máximo de raíces se reconocen **`ITSP-NN` e `ITPS-NN`** (sin distinguir mayúsculas). Los códigos nuevos son siempre `ITSP`. Cualquier otro formato es irregular. | Si existiera `ITPS-05` y se ignorara, la siguiente raíz sería `ITSP-05`: dos "secciones 05" con URL casi idénticas. Reconocer la errata evita esa confusión sin tocar el código existente. **P-2 confirmó que en la VM todo usa `ITSP`**: esto queda solo como defensa. |
| D-3 | ¿Cómo se forma el código de una subsección cuya raíz tiene un código irregular? | **Código de la raíz en mayúsculas + `-MM`.** Con raíz `ITSP-05` da `ITSP-05-01`, como pide el encargo; con raíz `itps-05` da `ITPS-05-01`. | Mantiene la subsección legible bajo su sección sin reescribir la raíz. |
| D-4 | Mínimo dos dígitos; "crece si pasa de 99". | `LPAD(n, 2, '0')` para n ≤ 99; desde 100, el número sin relleno (`ITSP-100`). Al leer se acepta `\d{2,}`. | Literal del encargo. |
| D-5 | Un cliente que siga enviando `codigo` en `POST`/`PATCH`. | Se **ignora en silencio**: el `ValidationPipe` global usa `whitelist: true` **sin** `forbidNonWhitelisted`, así que al quitar la propiedad del DTO el campo se descarta antes del servicio. No se responde 400. | No rompe a ningún cliente (incluido un frontend viejo en caché) y no exige tocar la configuración global. |
| D-6 | El aviso de mover una subsección pide "de X a Y", pero Y lo calcula el servidor. | Endpoint de solo lectura `GET /categorias-itsp/siguiente-codigo?idCategoriaPadre=N` que devuelve el código que se asignaría. Si al guardar otro usuario ganó ese número, el código final viene en la respuesta y el aviso de éxito lo muestra. | Es la única forma de mostrar Y antes de guardar. |
| D-7 | Al mover una subsección queda libre su número viejo. | Puede reutilizarse: el máximo se calcula sobre los hijos **actuales** de la raíz (encargo §4.1). Se documenta como riesgo R-4. | Literal del encargo. |
| D-8 | ¿Dónde vive el script de diagnóstico? | `base-datos/scripts/diagnostico/10-diagnostico-codigos-categorias.sql`, **fuera de `init/`**, más un envoltorio `despliegue/diagnosticar-codigos-categorias.ps1` (solo lectura, `-Simular`). | `preparar-base-datos.ps1` aplica **todo** `*.sql` de `init/`; dejarlo ahí lo registraría como migración. En PowerShell `mysql ... < archivo` no funciona, de ahí el envoltorio. |
| D-9 | La migración debe abortar con mensaje claro, pero el SQL plano no tiene `IF`. | Procedimiento almacenado **temporal** (`DROP PROCEDURE IF EXISTS` al inicio y al final) dentro de `10-codigos-categorias-autogenerados.sql`, con `SIGNAL SQLSTATE '45000'`. | Lo ejecuta el usuario administrativo (tiene `CREATE ROUTINE`); el usuario de la aplicación no necesita privilegios nuevos. |
| D-10 | Ancho de la tarjeta pública: el Observatorio usa 560 px y el iframe de WordPress mide 900×580. | Tarjeta con **`max-width: 820px`**. | Una fila de documento lleva título, metadatos y dos botones: en 560 px los botones caen siempre debajo y la lista se vuelve el doble de alta en un iframe de solo 580 px de alto. 820 + 2×20 de relleno = 860 < 900. |
| D-11 | Poppins: paquete o archivos versionados. | **`@fontsource/poppins`** (subset latin, pesos 400/600/700), importado **solo** desde `PortalPublicoLayout.vue`. Alternativa documentada: copiar los tres `.woff2` a `frontend/src/assets/fuentes/`. | Lo pide el encargo; Vite reescribe las URL de las fuentes con el `base` (`/munipalmares/wp-munidata/`). |
| D-12 | §4.4 pide cambiar el nombre visible del remitente "si está fijo en código". | **No se cambia.** El remitente es `NOMBRE_INSTITUCION` = "Municipalidad de Palmares" (`plantillas-correo.ts:13`), el nombre de la institución y no el del sistema; además, una restricción permanente del proyecto prohíbe tocar el remitente. Solo cambia el subtítulo "Sistema Integral de Gestión Documental" de la cabecera del correo. | Choque con una restricción permanente; se reporta (Anexo A, Δ-6). |
| D-13 | Modo oscuro: ¿atributo en `<html>` que afecte a toda la página? | Los atributos `data-tema` y `data-superficie` van en `<html>`, y las variables oscuras se declaran **solo** bajo `html[data-tema='oscuro'][data-superficie='sistema']`. No hay clase `.tema-sistema`. | Un selector sobre `<html>` cubre todo lo que se pinta en la página, incluidos los modales, desplegables y toasts que se monten fuera de `AppShellLayout` o con `Teleport`. Login, recuperación, verificación (`publica`) y portal (`portal`) quedan fuera por el valor de `data-superficie`, no por excepción. |
| D-14 | Archivo de la spec. | `documentacion/spec-ajustes-posdespliegue.md`, junto a `spec-portal-publico.md`. | Misma carpeta y convención de nombre. |
| D-15 | Guardia de `preparar-base-datos.ps1`: ¿qué cuenta como "base poblada"? ¿Y como "huecos"? | **Poblada:** la base existe y tiene al menos una tabla distinta de `scripts_aplicados`. **Huecos:** algún script de `init/` que debería estar registrado no lo está, pero hay registrado otro posterior a él (por nombre). El 06 solo cuenta como esperado con `-IncluirUsuarioSemilla`. | Es la definición más simple que detecta los tres casos de 4.2: sin tabla de control, con la tabla vacía y con huecos. |
| D-16 | ¿En qué punto aborta la guardia? | Inmediatamente después de comprobar que la base existe, **antes** del volcado previo, del paso "Usuario de aplicación" (`CREATE`/`ALTER USER`, `GRANT`), del `CREATE TABLE IF NOT EXISTS scripts_aplicados` y de cualquier script. | Hoy la guardia actúa después del `ALTER USER` y de crear la tabla de control (15.2.1). Abortar antes no deja ningún efecto secundario. |
| D-17 | Tema del portal: ¿redefinir los tokens globales o usar variables propias? | Variables **`--portal-*`** declaradas solo en `.tema-portal`; **no** se redefine ningún `--color-*`. Dentro de `.tema-portal` se sobrescribe la regla global `:focus-visible` de `main.css` con el foco `#6bccf2`. | Pedido explícito de Gerald (4.3). Mantiene el portal independiente de la refactorización de tokens y del modo oscuro, y permite hacerlo antes que ellos. |
| D-18 | Orden de §16.1 con el portal antes del modo oscuro: ¿quién crea el script en línea de `index.html`? | Lo crea el paso 11, solo con `data-superficie`. El paso 10 le añade `data-tema`. | El paso 11 ya no depende de los pasos 9 y 10. |
| D-19 | (Fase 2) ¿Qué hace `-SoloScripts` si la base no existe? | Se detiene con un error y no la crea. | `-SoloScripts` es para actualizar una base en uso; crearla así dejaría una base sin usuario de aplicación. |
| D-20 | (Fase 2) ¿Cómo distingue el servicio una colisión de código de otro error de clave única? | Cualquier `ER_DUP_ENTRY` al guardar una categoría cuenta como colisión de código, sin comparar el nombre del índice. | Es la única restricción única de la tabla aparte de la clave primaria, y en una base migrada a mano el índice podría tener otro nombre. |
| D-21 | (Fase 2) Al mover una subsección, ¿cuenta ella misma entre sus hermanas nuevas? | No: se excluye explícitamente del cálculo. | Un reintento la encontraría con el padre o el código del intento anterior y saltaría un número (lo detectó una prueba). |
| D-22 | (Fase 2) "Mismo texto" en los duplicados: ¿comparación binaria o con la colación? | Con la colación de la columna, tras `TRIM`. | Es la que aplica el índice único: dos códigos que el índice rechazaría deben verse como duplicados antes de migrar. |
| D-23 | (Fase 2) Si la migración aborta, el procedimiento temporal queda creado. | Se acepta y se documenta en la cabecera del script. | MySQL no deja que un procedimiento se borre a sí mismo y el cliente se detiene en el error del `CALL`. La siguiente ejecución lo reemplaza; no hace nada por sí solo. |
| D-24 | (Fase 2) CA-12 pide `lint` del backend limpio, pero de partida ya tenía 871 problemas (717 de prettier por el ancho de línea y los finales de línea, y 154 de otras reglas). | Criterio aplicado: ningún problema nuevo fuera de prettier, y los archivos nuevos limpios del todo. En los archivos existentes se respeta el ancho de 100 columnas que ya usan, aunque prettier pida 80. No se ejecuta `npm run lint`, porque lleva `--fix` y reformatearía todo el backend. | Reformatear todo el backend queda fuera del alcance; se reporta (choque entre la spec y el repositorio). |

## 4. Requisitos funcionales

| Id | Requisito |
|---|---|
| RF-1 | Al crear una categoría raíz, el backend asigna `ITSP-NN` con NN = máximo de las raíces reconocidas (D-2) + 1. |
| RF-2 | Al crear una subsección, el backend asigna `RAIZ-MM` (D-3) con MM = máximo de los hijos de esa raíz, activos e inactivos, + 1. |
| RF-3 | `codigo` no se acepta como entrada en `POST` ni en `PATCH` (D-5). |
| RF-4 | Al cambiar el padre de una subsección a otra raíz, se recalcula solo su código con la raíz nueva. |
| RF-5 | Se rechaza (400) todo cambio de padre que convierta una raíz en subsección o una subsección en raíz. |
| RF-6 | La bitácora de `ACTUALIZAR_CATEGORIA_ITSP` incluye `codigoAnterior` y `codigoNuevo` cuando el código cambia. `CREAR_CATEGORIA_ITSP` ya incluye `codigo`. |
| RF-7 | `GET /categorias-itsp/siguiente-codigo` devuelve el código que se asignaría (D-6). |
| RF-8 | Formulario: al crear no hay campo de código, solo el texto "Se asignará automáticamente"; al editar se muestra el código en solo lectura. La tabla sigue mostrando el código. |
| RF-9 | Formulario: al editar una raíz no se ofrece elegir padre; al editar una subsección el selector solo lista raíces, sin la opción "ninguna". |
| RF-10 | Antes de guardar un cambio de padre se pide confirmación con el texto: «El código y la URL cambiarán de X a Y; el enlace en WordPress deberá actualizarse.» |
| RF-11 | `/vista/:seccion` y `/vista/:seccion/:subseccion` resuelven el código sin distinguir mayúsculas y minúsculas (ya ocurre por la colación; se fija con una prueba). |
| RF-12 | Las vistas públicas se ven con el estilo del Observatorio (sección 9.2), siempre oscuras. |
| RF-13 | El área autenticada tiene un conmutador claro/oscuro en la barra superior, persistente por navegador. |
| RF-14 | "Muni Data" sustituye al nombre anterior en la interfaz, el `<title>` y la cabecera de los correos (sección 9.4). |
| RF-15 | Script de diagnóstico de solo lectura y migración idempotente (sección 6). |

## 5. Requisitos no funcionales

| Id | Requisito |
|---|---|
| RNF-1 | WCAG 2.1 AA: texto ≥ 4.5:1, componentes y foco ≥ 3:1 (tablas en 12.2). Objetivos táctiles ≥ 44 px. |
| RNF-2 | La migración es idempotente: la segunda ejecución no cambia nada y termina bien. |
| RNF-3 | El modo claro del sistema queda **idéntico píxel a píxel** tras la refactorización de tokens (sección 9.3). |
| RNF-4 | Ningún destello blanco al cargar un iframe público ni al recargar en modo oscuro. |
| RNF-5 | Sin scroll horizontal en el iframe de 900×580 ni a 360 px de ancho. |
| RNF-6 | Todo `.ps1` nuevo o modificado: BOM UTF-8, CRLF, `-Simular` funcional, 0 errores con el analizador de Windows PowerShell 5.1, StrictMode. |
| RNF-7 | Sin IP, rutas de la VM, contraseñas ni dominios fijos en código. |
| RNF-8 | Todo en español: identificadores, comentarios, mensajes. |

## 6. Modelo de datos y migración

### 6.1 Estado actual

```sql
-- 01-esquema.sql
codigo VARCHAR(50) NULL,
CONSTRAINT uk_categorias_itsp_codigo UNIQUE (codigo),
```

```ts
// categoria-itsp.entidad.ts
@Column({ name: 'codigo', type: 'varchar', length: 50, nullable: true, unique: true })
codigo: string | null;
```

Hoy `codigo` es opcional y lo escribe la persona: puede haber nulos (varias
filas con `NULL` no violan el `UNIQUE`), mayúsculas mezcladas o textos
arbitrarios. Duplicados exactos no puede haber mientras exista
`uk_categorias_itsp_codigo`; sí puede haber **duplicados numéricos**
(`ITSP-5` y `ITSP-05`, o `ITPS-05` e `ITSP-05`) y, en `utf8mb4_0900_ai_ci`,
variantes con espacios al final.

### 6.2 Estado final

```sql
codigo VARCHAR(50) NOT NULL,
CONSTRAINT uk_categorias_itsp_codigo UNIQUE (codigo),
```

```ts
@Column({ name: 'codigo', type: 'varchar', length: 50, unique: true })
codigo: string;
```

Se actualizan también los tipos `codigo: string | null` de los DTO de respuesta
y de `frontend/src/types/catalogo.types.ts`, y el `?? ''` del portal público
(`codigoPublico`) puede quedarse como defensa.

### 6.3 Script de diagnóstico (solo lectura)

`base-datos/scripts/diagnostico/10-diagnostico-codigos-categorias.sql`, solo
`SELECT`. Lo ejecuta Gerald en la VM **antes** de migrar, con
`despliegue/diagnosticar-codigos-categorias.ps1` (pide la contraseña con
`Read-Host -AsSecureString`, archivo de opciones temporal como en
`preparar-base-datos.ps1`, nunca la imprime). Informa:

| Bloque | Qué lista |
|---|---|
| 1. Estructura | `IS_NULLABLE` de `codigo`, si existe un índice único sobre `codigo` y su nombre, colación de la columna, si existe `scripts_aplicados` y qué scripts registra. |
| 2. Nulos y vacíos | Filas con `codigo IS NULL` o `TRIM(codigo) = ''`, con id, nivel, padre y nombre. Son las que la migración rellenará. |
| 3. Irregulares | Raíces que no cumplen `^IT(SP\|PS)-[0-9]{2,}$` y subsecciones que no cumplen `^CODIGO_RAIZ-[0-9]{2,}$`. Se conservan y se excluyen del máximo. |
| 4. Duplicados | Grupos con el mismo `UPPER(TRIM(codigo))` y grupos con el mismo número normalizado (raíces: NN; subsecciones: raíz + MM). **Si hay alguno, la migración abortará.** |
| 5. Grafía | Raíces con prefijo `ITPS` (D-2) y códigos con minúsculas o espacios extremos. Solo informativo. |
| 6. Vista previa | Para cada fila del bloque 2, el código que le asignaría la migración, calculado con el mismo algoritmo. |

### 6.4 Migración

`base-datos/scripts/init/10-codigos-categorias-autogenerados.sql` (el último
existente es `09-permiso-reportes.sql`; no se altera ninguno de los anteriores).
La aplica `preparar-base-datos.ps1`, que la registra en `scripts_aplicados` y no
vuelve a ejecutarla. Aun así, el script es idempotente por sí mismo, porque se
prueba ejecutándolo dos veces a mano.

Estructura:

```sql
USE gestor_documental_pps;   -- se filtra en la VM, como en todos los scripts
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS migrar_codigos_categorias_10;
DELIMITER $$
CREATE PROCEDURE migrar_codigos_categorias_10()
BEGIN
  -- (e) Duplicados: aborta sin corregir y sin haber escrito nada.
  --     Calcula los grupos del bloque 4 del diagnóstico; si hay alguno:
  --     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
  --       'Migracion 10 abortada: hay codigos de categoria duplicados (...ids...).
  --        Ejecute diagnosticar-codigos-categorias.ps1 y corrijalos a mano.';
  --
  -- (b) Relleno de nulos y vacíos, dentro de START TRANSACTION ... COMMIT:
  --     1. Raíces sin código, en orden (orden, id_categoria_itsp):
  --        NN = MAX(número de las raíces reconocidas) + 1, una por una.
  --     2. Subsecciones sin código, agrupadas por raíz, en el mismo orden:
  --        MM = MAX(número de los hijos reconocidos de esa raíz) + 1.
  --     Un código vacío ('' o solo espacios) se trata igual que NULL.
  --     (c) Ninguna fila con código no vacío se actualiza: el UPDATE lleva
  --         WHERE codigo IS NULL OR TRIM(codigo) = ''.
  --     (d) Los irregulares no entran en el MAX (el regex los excluye).
  --
  -- (f) Restricciones, cada una solo si falta (consulta a information_schema
  --     + PREPARE/EXECUTE):
  --     - MODIFY codigo VARCHAR(50) NOT NULL   si IS_NULLABLE = 'YES'
  --     - ADD CONSTRAINT uk_categorias_itsp_codigo UNIQUE (codigo)
  --                                            si no hay índice único sobre codigo
  --     Antes del MODIFY se vuelve a comprobar que no queden nulos; si quedara
  --     alguno, SIGNAL (nunca se deja el ALTER fallar a medias).
END$$
DELIMITER ;

CALL migrar_codigos_categorias_10();
DROP PROCEDURE IF EXISTS migrar_codigos_categorias_10;

-- Informe final: filas rellenadas en esta ejecución e irregulares conservados.
SELECT ...;
```

Notas:

- El `ALTER TABLE` hace commit implícito; por eso va **después** del `COMMIT` del
  relleno y solo cuando ya no quedan nulos. Si el script se corta entre el
  relleno y el `ALTER`, la siguiente ejecución encuentra el relleno hecho, no
  rellena nada y aplica la restricción que falte.
- El `DELIMITER` lo interpreta el cliente `mysql`; `Invocar-ArchivoSql` envía el
  archivo con `source`, que lo respeta. Se verifica en la prueba local (14.3).
- Si la migración aborta, `preparar-base-datos.ps1` termina con código 1 y **no**
  registra el script: tras corregir el duplicado a mano se vuelve a ejecutar.

## 7. Algoritmo de generación de códigos

### 7.1 Reconocimiento de números

```ts
// backend/src/catalogos/codigos-categoria.ts  (funciones puras, probadas aparte)
const PATRON_RAIZ = /^IT(?:SP|PS)-(\d{2,})$/i;          // D-2
function patronHija(codigoRaiz: string): RegExp {       // D-3
  return new RegExp(`^${escaparRegex(codigoRaiz)}-(\\d{2,})$`, 'i');
}
function formatearNumero(n: number): string {           // D-4
  return String(n).padStart(2, '0');
}
```

- `siguienteCodigoRaiz(codigosDeRaices)` → `ITSP-` + `formatearNumero(max + 1)`;
  si no hay ninguna reconocida, `ITSP-01`.
- `siguienteCodigoHija(codigoRaiz, codigosDeHijas)` →
  `codigoRaiz.toUpperCase()` + `-` + `formatearNumero(max + 1)`.
- Los códigos se comparan tras `trim()`; los que no casan se ignoran (huecos e
  irregulares no rompen nada: con `ITSP-01`, `ITSP-04` y `TRANSP` la siguiente
  raíz es `ITSP-05`).

### 7.2 Asignación con concurrencia

```
crear / mover:
  intento = 1..3
    transacción:
      leer códigos de las raíces (o de los hijos de la raíz destino), activos e inactivos
      calcular el siguiente código
      INSERT / UPDATE
    si ER_DUP_ENTRY sobre uk_categorias_itsp_codigo y intento < 3 → reintentar
    si ER_DUP_ENTRY en el tercer intento → CodigoCategoriaNoAsignadoException (409)
  bitácora después del commit (como hoy)
```

Sin `SELECT ... FOR UPDATE`: el índice único es la garantía y el reintento
resuelve la carrera. El nombre duplicado entre hermanas se sigue validando antes
de la transacción, igual que ahora.

### 7.3 Mover una subsección

- Mismo padre que el actual → el código no cambia.
- Padre distinto, ambos raíces → `siguienteCodigoHija(raízNueva, hijosDeLaNueva)`.
  Solo cambia esa fila; los hermanos viejos y nuevos conservan su código.
- `idCategoriaPadre: null` sobre una subsección, o un padre sobre una raíz →
  400 (RF-5).

## 8. Contrato de la API (cambios)

| Ruta | Cambio |
|---|---|
| `POST /categorias-itsp` | `codigo` deja de existir en `CrearCategoriaItspDto`. Si llega, se descarta (D-5). La respuesta trae el código asignado. |
| `PATCH /categorias-itsp/:id` | `codigo` deja de existir en `ActualizarCategoriaItspDto`. `idCategoriaPadre` sigue existiendo, pero solo para mover una subsección entre raíces. |
| `GET /categorias-itsp/siguiente-codigo?idCategoriaPadre=N` | **Nueva.** Sin `idCategoriaPadre` → siguiente raíz. Respuesta `{ "codigo": "ITSP-05" }`. Mismo permiso `catalogos.administrar`. Se declara **antes** de `:id`, como `arbol`. DTO de consulta con `@IsOptional() @Type(() => Number) @IsInt() @Min(1)`. |
| `GET /publico/...` | Sin cambios de contrato. |

## 9. Frontend

### 9.1 Categorías

- `types/catalogo.types.ts`: `codigo: string` en las respuestas; se quita
  `codigo?` de los datos de formulario.
- `services/catalogos.service.ts`: `obtenerSiguienteCodigo(idCategoriaPadre?)`.
- `composables/useCategoriasItsp.ts`: expone `obtenerSiguienteCodigo`.
- `views/CategoriaItspFormularioView.vue`:
  - Crear: el campo de código se reemplaza por un texto de ayuda «Se asignará
    automáticamente» (opcionalmente con el valor previsto, marcado como
    tentativo).
  - Editar: `<input readonly>` con el código, `aria-readonly="true"` y una ayuda
    asociada con `aria-describedby`.
  - Selector de padre: oculto en raíces; en subsecciones solo raíces, sin
    "ninguna" (RF-9).
  - Al guardar con un padre distinto: pide `siguiente-codigo`, abre
    `ModalConfirmacion` con el texto de RF-10 y solo entonces envía el `PATCH`. El
    toast de éxito dice el código final.
- `lib/validaciones.ts`: se elimina `validarCodigoCategoria` si ya no tiene uso.
- `views/CategoriasItspView.vue`: sin cambios funcionales (ya muestra el código);
  se quita el `?? '—'`.

### 9.2 Vistas públicas: estilo del Observatorio

**Alcance:** `PortalPublicoLayout.vue`, `PortalSeccionesView.vue`,
`PortalSeccionView.vue`, `PortalSubseccionView.vue` y
`components/portal/*.vue`. No cambian rutas, servicios, composables, textos ni
datos.

**Mecanismo (D-17):** la raíz de `PortalPublicoLayout` lleva la clase
`tema-portal`. En `main.css` se declaran sobre `.tema-portal`, y solo ahí, las
variables propias del portal (`--portal-fondo`, `--portal-tarjeta`,
`--portal-recuadro`, `--portal-borde`, `--portal-texto`,
`--portal-texto-secundario`, `--portal-acento`, `--portal-acento-hover`,
`--portal-contexto`, `--portal-error`, `--portal-foco`), además de
`font-family: 'Poppins'` y `color-scheme: dark`. **No se redefine ningún token
global `--color-*`**: el portal no depende de la refactorización ni del modo
oscuro (9.3), y estos no pueden alterarlo. Los componentes del portal cambian
sus clases para leer esas variables con la sintaxis de Tailwind v4
(`bg-(--portal-tarjeta)`, `border-(--portal-borde)`…). Cuando una regla no se
puede expresar como utilidad, se usa un bloque bajo `.tema-portal` en
`main.css`. Así no hace falta ningún token nuevo en `@theme`.

**Foco:** la regla global `:focus-visible` de `main.css` (`outline: 2px solid
var(--color-on-surface)`) daría un anillo casi negro sobre la tarjeta oscura.
Dentro de `.tema-portal` se sobrescribe:

```css
.tema-portal :focus-visible {
  outline: 2px solid var(--portal-foco); /* #6bccf2 */
  outline-offset: 2px;
}
```

El fondo de `html` y `body` está fuera de `.tema-portal`: lo pone
`html[data-superficie='portal']` con el valor literal `#0d0c12` (ver la tabla).

| Elemento | Especificación |
|---|---|
| `html`, `body` | Fondo `#0d0c12`. Lo pone un script en línea de `index.html` con `data-superficie="portal"` cuando la ruta empieza por `%BASE_URL%vista`, **antes** de montar Vue (RNF-4). |
| Contenedor | `min-height: 100vh`, relleno 20 px, contenido centrado, texto `#fff`, Poppins 17 px / 1.55. |
| Tarjeta | Fondo `#1d2327`, borde 1 px `#abadb3`, radio 16 px, relleno 28 px, sombra `0 24px 48px rgba(0,0,0,.30)`, `max-width: 820px` (D-10). |
| Recuadros (secciones, subsecciones, documentos) | Fondo `#2b3338`, borde 1 px `#abadb3`, radio 8 px, relleno 16 px, título 17 px / 700, hover con borde `#26a3b8`. |
| Píldora de contexto | Nombre de la sección actual en la cabecera de la vista. Radio 999 px, 12 px en mayúsculas, `letter-spacing: .04em`, peso 600, color `#26a3b8`, borde `#abadb3`. **Solo sobre la tarjeta**, nunca dentro de un recuadro (contraste 4.29:1 sobre `#2b3338`, ver 12.2). |
| Etiquetas de documento | Siguen rectangulares (radio 6 px), texto `#fff`, borde `#abadb3`, sin relleno de color. |
| Botón primario ("Ver") | Píldora, alto mínimo 44 px, 16 px / 700, fondo `#ba0911`, hover `#950710`, texto `#fff`. |
| Botón secundario ("Descargar", paginación) | Píldora de contorno, borde `#abadb3`, hover `rgba(255,255,255,.10)`. |
| Texto secundario | `rgba(255,255,255,.75)`. |
| Error | `#f28b82`. |
| Foco | `outline: 2px solid #6bccf2; outline-offset: 2px`, sobrescribiendo la regla global dentro de `.tema-portal` (ver arriba). |
| ≤ 480 px | Relleno 12 px, radio de tarjeta 14 px, botones a ancho completo en columna. |
| Iframe 900×580 | Scroll interno vertical, nunca horizontal. |
| Esqueleto de carga | Bloques `#2b3338` con pulso; nunca blancos. |

**Fuente:** `npm i @fontsource/poppins`, importando en `PortalPublicoLayout.vue`:

```ts
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
```

Vite emite los `.woff2` en `assets/` bajo el `base`; el CSS solo se carga con el
chunk del portal, así que el sistema interno no descarga Poppins. La CSP actual
(`frame-ancestors 'self'`) no restringe fuentes. Justificación de la
dependencia: es la única forma, sin CDN, de que la tipografía coincida con la del
Observatorio; pesa unos 25 KB por peso en latin.

`frontend/package.json` y `frontend/package-lock.json` se commitean **juntos**
en el mismo paso: `desplegar.ps1` instala con `npm ci`, que falla si el lock no
coincide con `package.json`. Se instala con `npm install @fontsource/poppins`
(sin `--no-save` ni `--no-package-lock`) y se comprueba con `npm ci` en limpio
antes del commit.

**Acento:** en las vistas públicas `#ba0911` sustituye a `#D30505`. Es
**intencional**, para alinearse con el Observatorio; se anota en el
encabezado de `PortalPublicoLayout.vue` y en el §16 de `spec-portal-publico.md`
(con una nota "sustituido por spec-ajustes-posdespliegue §9.2", sin
renumerar).

**Excepción de forma (P-3, decidida por Gerald y pendiente de confirmación del
PO):** `DESIGN.md` reserva la píldora para las insignias de estado. Las vistas
públicas la usan en los botones y en la píldora de contexto porque replican otro
sistema. La excepción vale **solo en las vistas públicas** y se anota al final
de `DESIGN.md`. En el sistema interno la regla no cambia.

### 9.3 Modo oscuro del sistema

#### 9.3.1 Diagnóstico de los estilos

- Tailwind v4 CSS-first: los tokens viven en `@theme static` de
  `src/assets/main.css` y se publican en `:root` como `--color-*`; las utilidades
  (`bg-surface`, `text-on-surface`…) leen `var(--color-*)`. **Redefinir las
  variables bajo un selector basta para cambiar el tema.**
- Colores fijos fuera de los tokens: **prácticamente ninguno**. Un hexadecimal en
  un comentario (`RolesPermisosView.vue:228`), ninguna clase de la paleta por
  defecto de Tailwind, ningún valor arbitrario `[#…]`, ningún `rgba` en
  componentes.
- El problema son **tres tokens con dos usos** que no se pueden redefinir sin
  romper uno de los dos:

| Token | Uso como fondo/borde | Uso como texto | Problema en oscuro |
|---|---|---|---|
| `pure-white` | `bg-pure-white` ×100: tarjetas, barra superior, pie | `text-pure-white` ×73: texto sobre rojo y sobre el panel oscuro | Si se oscurece, el texto de los botones rojos queda negro. |
| `on-surface` | `bg-on-surface` ×16: barra lateral, cabeceras de tabla, paneles de resumen | `text-on-surface` ×245 | Si se aclara, la barra lateral se vuelve blanca. |
| `primary` | `bg-primary` ×38: hover de los botones rojos | `text-primary` ×12 (+6 con `hover:`) | `#a60001` sobre fondo oscuro da 2,4:1. |

#### 9.3.2 Migración incremental

Tres pasos, cada uno **sin cambio visual en modo claro**:

1. **Renombrados mecánicos** (≈ 136 clases en ≈ 27 archivos):
   - `bg-pure-white` → `bg-surface-container-lowest` (mismo `#ffffff`).
   - `bg-on-surface` → `bg-panel`, token nuevo `--color-panel: #1a1c1c` (mismo valor).
   - `text-primary` / `hover:text-primary` / `group-hover:text-primary` /
     `text-primary-container` (como texto) → `text-acento`, token nuevo
     `--color-acento: #a60001`.
   Se comprueba con capturas antes y después de las vistas principales en claro.
2. **Bloque oscuro** en `main.css` (D-13):
   ```css
   html[data-tema='oscuro'][data-superficie='sistema'] { --color-...: ...; color-scheme: dark; }
   ```
   La especificidad (0,2,1) supera a la de `:root` (0,1,0), donde Tailwind
   publica los tokens, así que el bloque gana sin `!important`.
3. **Revisión por pantalla** de lo que el bloque no cubre: tablas, formularios,
   modales, `SelectorBusqueda`/`SelectorMultiple`, `BadgeEstadoDocumento`,
   `ZonaCargaPdf`, visor de PDF de `DocumentoDetalleView`, asistente de registro
   (`DocumentoRegistroView`), toasts de éxito y error, estados vacíos y de error.
   Se comprueba en concreto que **ningún componente montado fuera del layout
   quede en claro**. Hoy el repositorio no usa `Teleport`; `ToastContainer` se
   monta en `App.vue`, fuera de `AppShellLayout`, y `ModalConfirmacion` es
   `fixed` dentro de cada vista. Los dos se revisan abiertos en modo oscuro, y
   también la capa oscura del menú lateral móvil. Si en la Fase 2 se añade un
   `Teleport`, entra en la misma revisión.

#### 9.3.3 Paleta oscura

| Token | Claro (actual) | Oscuro |
|---|---|---|
| `background`, `surface`, `surface-bright` | `#f9f9f9` | `#0d0c12` |
| `surface-container-lowest` (tarjetas, barra superior) | `#ffffff` | `#1d2327` |
| `surface-container-low` | `#f3f3f3` | `#232a2e` |
| `surface-container` | `#eeeeee` | `#2b3338` |
| `surface-container-high` | `#e8e8e8` | `#343d43` |
| `surface-container-highest`, `surface-variant` | `#e2e2e2` | `#3d474e` |
| `surface-dim`, `secondary-fixed-dim`, `outline-variant` | varios | `#4a545b` |
| `surface-alt` (bordes y divisores suaves) | `#f0f0f1` | `#3a4247` |
| `panel` (nuevo: barra lateral, cabecera de tabla) | `#1a1c1c` | `#101317` + borde `#3a4247` |
| `on-surface`, `on-background` | `#1a1c1c` | `#f0f1f1` |
| `secondary` (texto secundario) | `#595f64` | `#c4c8cc` |
| `tertiary` | `#4e5156` | `#a9afb4` |
| `outline` (bordes de campo) | `#936e69` | `#8a9197` |
| `primary-container` (botón) | `#d30505` | `#d30505` (sin cambio) |
| `primary` (hover del botón) | `#a60001` | `#a60001` (sin cambio) |
| `acento` (nuevo: texto y enlaces rojos) | `#a60001` | `#ff8a80` |
| `error` (texto y borde) | `#ba1a1a` | `#f28b82` |
| `error-container` / `on-error-container` | `#ffdad6` / `#93000a` | `#4a1714` / `#ffdad6` |
| `secondary-container` / `on-secondary-container` | `#dde3e8` / `#5f656a` | `#34404a` / `#dde3e8` |
| `primary-fixed` (avatar) / su texto | `#ffdad5` / acento | `#4a1210` / `#ffb4a8` |
| foco (`:focus-visible`) | `on-surface` | `#6bccf2` |

#### 9.3.4 Aplicación sin parpadeo

- Script en línea en `index.html`, antes de cualquier hoja de estilos:
  ```html
  <script>
    (function () {
      var tema = null;
      try { tema = localStorage.getItem('munidata-tema'); } catch (e) {}
      if (tema !== 'claro' && tema !== 'oscuro') {
        tema = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
      }
      document.documentElement.setAttribute('data-tema', tema);
      // superficie: 'portal' | 'publica' | 'sistema', según la ruta (con %BASE_URL%)
    })();
  </script>
  ```
- `html[data-tema='oscuro'][data-superficie='sistema']` es el **único** selector
  del modo oscuro (D-13). Declara las variables oscuras y pinta el fondo de
  `html`/`body` de `#0d0c12`, para que la recarga no destelle en blanco. Login,
  recuperación y verificación son `publica`: siempre claros. El portal es
  `portal`: siempre oscuro, con sus propias variables (D-17).
- El paso 11 crea este script solo con `data-superficie`. El paso 10 le añade la
  lectura de `munidata-tema` y `data-tema` (D-18).
- `router.afterEach` mantiene `data-superficie` al navegar dentro de la SPA.
- Patrón `types → service → composable`: `types/tema.types.ts`
  (`type Tema = 'claro' | 'oscuro'`), `lib/tema.ts` (lectura y escritura en
  `localStorage` con `try/catch`), `composables/useTema.ts` (singleton a nivel de
  módulo, como `useNotificaciones`). Sin Pinia.
- Conmutador en la barra superior de `AppShellLayout`: botón de 44×44 px con
  ícono `dark_mode`/`light_mode`, `aria-pressed` y `aria-label` «Modo oscuro».
- Mientras la persona no elija, se siguen los cambios de `prefers-color-scheme`.
  Una vez que elige, manda su elección.

### 9.4 Nombre "Muni Data"

| Archivo | Hoy | Queda |
|---|---|---|
| `frontend/index.html:7` | `Gestión Documental — Municipalidad de Palmares` | `Muni Data — Municipalidad de Palmares` |
| `frontend/src/layouts/AppShellLayout.vue:150` (barra lateral, junto al ícono `account_balance`) | `Gestión Municipal` | `Muni Data` |
| `frontend/src/layouts/AppShellLayout.vue:270` (pie) | `Sistema Integral de Gestión Documental` | `Muni Data` |
| `frontend/src/views/LoginView.vue:82` | `Sistema Integral de Gestión Documental` | `Muni Data` |
| `backend/src/correo/plantillas-correo.ts:62` (subtítulo de la cabecera del correo) | `Sistema Integral de Gestión Documental` | `Muni Data` |
| `backend/src/correo/verificar-smtp.ts:289` (correo de prueba) | `…del sistema de gestión documental…` | `…de Muni Data…` |

No cambian: los asuntos y el remitente, que usan `NOMBRE_INSTITUCION` (D-12);
los comentarios técnicos que dicen "gestión documental" como nombre del dominio
funcional (Fase 6, MF-08); el texto descriptivo del panel de inicio («Estado
general de la gestión documental»); `README.md` (título formal);
`01-esquema.sql` y `09-permiso-reportes.sql` (scripts existentes: no se
alteran); `munidata.conf` y el `DisplayName` del servicio (técnicos);
`DESPLIEGUE.md`, que ya se titula "Guía de despliegue — Muni Data". La pestaña
del portal público ya dice "Muni Data" y no cambia.

Comprobación final (Fase 2): `grep -rniE "gesti.{1,2}n (documental|municipal)|sistema integral"`
sobre `frontend/src`, `frontend/index.html` y `backend/src/correo`, cuyo
resultado esperado son solo los comentarios listados arriba.

## 10. Manejo de errores

| Caso | Código | `error` (clase) | `mensaje` |
|---|---|---|---|
| Cambio de nivel (raíz ↔ subsección) | 400 | `CategoriaPadreInvalidaException` | «Una categoría raíz no puede convertirse en subsección ni una subsección en raíz» |
| Tres colisiones seguidas al asignar código | 409 | `CodigoCategoriaNoAsignadoException` (nueva) | «No se pudo asignar un código a la categoría; intente de nuevo» |
| `siguiente-codigo` con un padre inexistente o que no es raíz | 400 | `CategoriaPadreInvalidaException` | Mensajes actuales de `resolverPadre` |
| Migración con duplicados | — | `SIGNAL 45000` | «Migracion 10 abortada: hay codigos de categoria duplicados (ids …). Ejecute diagnosticar-codigos-categorias.ps1» |

`CodigoCategoriaDuplicadoException` deja de lanzarse desde el servicio, porque
el código ya no lo escribe nadie; se conserva la clase por si la usa otra
prueba y se elimina si queda sin referencias.

## 11. Reglas de negocio

- RN-1. El código es inmutable salvo al mover una subsección (C-3).
- RN-2. Los números libres (huecos) no se rellenan: siempre máximo + 1.
- RN-3. Inactivar una categoría no libera su código: los inactivos cuentan para
  el máximo.
- RN-4. Las subsecciones de una raíz con código irregular heredan ese prefijo
  (D-3).
- RN-5. La raíz excluida `ITSP-03` mantiene su código y su exclusión (§4.5).
- RN-6. No hay borrado físico: nada de esta entrega borra filas.

## 12. Seguridad y accesibilidad

### 12.1 Seguridad

- `siguiente-codigo` exige `catalogos.administrar`, igual que el resto del
  controlador; no expone nada que la lista no exponga ya.
- El diagnóstico y la migración piden la contraseña administrativa con
  `Read-Host -AsSecureString` y la pasan por un archivo de opciones temporal que
  se borra siempre; nunca se imprime (como en `preparar-base-datos.ps1`).
- `localStorage` guarda solo `claro`/`oscuro`.
- `@fontsource/poppins` es un paquete de solo CSS y fuentes (sin código
  ejecutable); entra en el `package-lock.json` y pasa por `npm audit`.

### 12.2 Contrastes (WCAG 2.1 AA)

Calculados con la fórmula de luminancia relativa de WCAG 2.1.

**Sistema interno, modo oscuro**

| Par | Ratio | Mínimo | |
|---|---|---|---|
| Texto `#f0f1f1` / tarjeta `#1d2327` | 14.04 | 4.5 | ✓ |
| Texto `#f0f1f1` / fondo `#0d0c12` | 17.21 | 4.5 | ✓ |
| Texto `#f0f1f1` / elevada `#2b3338` | 11.36 | 4.5 | ✓ |
| Secundario `#c4c8cc` / tarjeta | 9.44 | 4.5 | ✓ |
| Secundario `#c4c8cc` / elevada | 7.64 | 4.5 | ✓ |
| Terciario `#a9afb4` / tarjeta | 7.17 | 4.5 | ✓ |
| Terciario `#a9afb4` / elevada | 5.80 | 4.5 | ✓ |
| Acento `#ff8a80` / tarjeta | 6.96 | 4.5 | ✓ |
| Acento `#ff8a80` / elevada | 5.63 | 4.5 | ✓ |
| Error `#f28b82` / tarjeta | 6.65 | 4.5 | ✓ |
| Error `#f28b82` / elevada | 5.38 | 4.5 | ✓ |
| `#ffdad6` / error-container `#4a1714` | 11.41 | 4.5 | ✓ |
| `#dde3e8` / secondary-container `#34404a` | 8.20 | 4.5 | ✓ |
| Avatar `#ffb4a8` / `#4a1210` | 8.91 | 4.5 | ✓ |
| Blanco / botón `#d30505` | 5.54 | 4.5 | ✓ |
| Blanco / hover `#a60001` | 8.01 | 4.5 | ✓ |
| Blanco / panel `#101317` | 18.62 | 4.5 | ✓ |
| Borde de campo `#8a9197` / tarjeta | 4.98 | 3 | ✓ |
| Borde de campo `#8a9197` / elevada | 4.03 | 3 | ✓ |
| Foco `#6bccf2` / tarjeta | 8.73 | 3 | ✓ |
| Foco `#6bccf2` / fondo | 10.70 | 3 | ✓ |
| Botón `#d30505` / tarjeta | 2.87 | 3 | ⚠ ver nota |
| Panel `#101317` / fondo `#0d0c12` | 1.05 | — | se separa con borde `#3a4247` |

**Vistas públicas**

| Par | Ratio | Mínimo | |
|---|---|---|---|
| Blanco / tarjeta `#1d2327` | 15.89 | 4.5 | ✓ |
| Blanco / recuadro `#2b3338` | 12.86 | 4.5 | ✓ |
| Secundario 75 % / tarjeta (≈ `#c7c8c9`) | 9.48 | 4.5 | ✓ |
| Secundario 75 % / recuadro (≈ `#cacccd`) | 7.98 | 4.5 | ✓ |
| Píldora `#26a3b8` / tarjeta | 5.31 | 4.5 | ✓ |
| Píldora `#26a3b8` / recuadro | 4.29 | 4.5 | ✗ → la píldora **nunca** va dentro de un recuadro |
| Hover de borde `#26a3b8` / recuadro | 4.29 | 3 | ✓ |
| Borde `#abadb3` / tarjeta | 7.08 | 3 | ✓ |
| Borde `#abadb3` / recuadro | 5.73 | 3 | ✓ |
| Borde `#abadb3` / fondo | 8.68 | 3 | ✓ |
| Blanco / botón `#ba0911` | 6.70 | 4.5 | ✓ |
| Blanco / hover `#950710` | 9.07 | 4.5 | ✓ |
| Blanco / hover secundario (≈ `#34393d`) | 11.68 | 4.5 | ✓ |
| Error `#f28b82` / tarjeta | 6.65 | 4.5 | ✓ |
| Foco `#6bccf2` / tarjeta | 8.73 | 3 | ✓ |
| Foco `#6bccf2` / recuadro | 7.07 | 3 | ✓ |
| Botón `#ba0911` / tarjeta | 2.37 | 3 | ⚠ ver nota |

**Nota sobre los botones rojos.** El criterio 1.4.11 exige 3:1 a lo que hace
falta para **identificar** el componente. Un botón con etiqueta de texto se
identifica por esa etiqueta (5.54:1 y 6.70:1), no por su silueta, así que el
fondo rojo frente a la tarjeta no es un requisito. Aun así, es el punto más
débil de la paleta. **Decidido por Gerald (P-4): sin borde en los botones
rojos**, porque el Observatorio no lo lleva y la consigna es igualarlo. El borde
de 1 px `#abadb3` (7.08:1) queda como alternativa si en el futuro se pidiera.

### 12.3 Otros puntos de accesibilidad

- El modo oscuro no se activa por sorpresa: la primera vez sigue la preferencia
  del sistema operativo, que es lo que la persona ya eligió.
- `color-scheme: dark` en el ámbito oscuro y en el portal, para que las barras de
  desplazamiento y los controles nativos (`select`, `input[type=date]`) se vean
  oscuros.
- La confirmación de RF-10 usa `ModalConfirmacion`, que ya gestiona el foco y
  `Escape`.
- El código en solo lectura se lee como texto, no como un campo deshabilitado
  gris de bajo contraste.

## 13. Rendimiento

- El generador lee solo las raíces, o los hijos de una raíz: decenas de filas.
- Poppins: tres `.woff2` latin (≈ 75 KB en total) solo en el chunk del portal,
  con `font-display: swap` (lo trae fontsource) y caché `immutable` por el hash
  del nombre (`.htaccess` ya lo aplica a `assets/`).
- El script en línea de `index.html` es de unos 500 bytes, sin peticiones.

## 14. Pruebas

### 14.1 Backend (Jest)

- `codigos-categoria.spec.ts` (funciones puras): primera raíz; siguiente raíz
  con huecos (`01, 04` → `05`); `ITPS-05` cuenta (D-2); irregulares ignorados;
  mayúsculas y minúsculas; `99 → 100`; subsección con y sin hermanas; hermanas
  inactivas cuentan; raíz con código irregular (D-3).
- `categorias-itsp.service.spec.ts`:
  - crear raíz y subsección asigna código y lo registra en bitácora;
  - `codigo` en el DTO no llega al servicio (prueba del `ValidationPipe` con
    `whitelist`);
  - mover una subsección recalcula solo su código y la bitácora lleva
    `codigoAnterior`/`codigoNuevo`; no tocar el padre no cambia el código;
  - **reintento**: el repositorio falla con `ER_DUP_ENTRY` una vez y luego
    acepta → éxito; falla tres veces → 409;
  - raíz → subsección y subsección → raíz → 400. Las dos pruebas actuales que
    afirman lo contrario («convierte una subsección en raíz…») **se invierten**,
    no se borran: documentan el cambio de regla (C-2).
- `portal-publico.service.spec.ts`: la prueba que fija la resolución sin
  distinguir mayúsculas sigue verde.
- Todas las suites existentes (224 pruebas, 15 suites) en verde; `npm run lint`
  del backend sin errores.

### 14.2 Frontend

- `vue-tsc` y `npm run build` en 0 errores. El frontend **no tiene script
  `lint`**: no se añade ninguno (sería una dependencia nueva sin pedirla).
- Chrome sin errores de consola en: login, inicio, documentos, registro,
  detalle con visor, usuarios, bitácora, categorías (crear, editar, mover),
  roles; en claro y en oscuro.
- Capturas de modo claro antes y después de la refactorización de tokens
  (RNF-3). Las de "antes" se toman **antes de empezar el paso 9**. Si no hay
  herramienta de navegador disponible, se entrega a Gerald la lista de
  pantallas para que las capture y compare él.
- Vistas públicas dentro de un iframe de 900×580 y otro de 360 px de ancho (en
  Chrome headless el viewport no se aplica, solo se recorta la imagen),
  comparadas con las capturas de `documentacion/design/portal-publico/`.
- Recarga en oscuro sin destello; portal sin destello blanco; login claro con
  la preferencia en oscuro.

### 14.3 Migración en la BD local

Sobre la MySQL de Docker, en una **base de prueba aparte**
(`munidata_prueba_migracion`), nunca sobre `gestor_documental_pps`:

1. Crear el esquema con `01` a `09`.
2. Dataset que simula la VM: raíces `ITSP-01`…`ITSP-04`, una raíz `itps-05`
   (minúsculas y errata), una raíz con código `NULL`, una con `''`, una con
   `TRANSPARENCIA` (irregular), subsecciones con `NULL` bajo `ITSP-02` y bajo
   `itps-05`, una subsección inactiva con el máximo de su raíz.
3. Ejecutar el diagnóstico y comprobar cada bloque.
4. Ejecutar la migración → los nulos y vacíos quedan rellenados, nada más
   cambia (comparación de un volcado de la tabla antes y después, excluyendo las
   filas rellenadas), `NOT NULL` aplicado.
5. Ejecutarla **otra vez** → 0 filas rellenadas, sin error, esquema idéntico.
6. Caso duplicado: en una tercera base, quitar temporalmente
   `uk_categorias_itsp_codigo` para insertar `ITSP-05` e `itsp-05` (o
   `ITSP-5` y `ITSP-05` con el índice puesto) → la migración aborta con el
   mensaje y **no escribe nada**.
7. Ejecutarla también a través de `preparar-base-datos.ps1 -SoloScripts` contra
   esa base de prueba (puente al MySQL de Docker, como en las rondas
   anteriores), para probar el paso real y no solo el SQL.
8. **Guardia (15.2.1, CA-14)**, sobre una base poblada con `01`–`09`:
   a. Borrar `scripts_aplicados` → con y sin `-SoloScripts` el script aborta
      con el mensaje de la guardia, sale con código 1 y **no** ejecuta ningún
      script.
   b. Recrear `scripts_aplicados` vacía → mismo resultado.
   c. Registrar solo `01`–`05` y `08`–`09` (hueco en el `07`) → mismo
      resultado, con el `07` señalado como hueco.
   d. En los tres casos se comprueba que no hubo efectos secundarios:
      `scripts_aplicados` sigue igual (o sigue sin existir en el caso a), el
      volcado de las tablas de datos es idéntico al de antes y, sin
      `-SoloScripts`, no se ejecutó `ALTER USER`: la contraseña del usuario de
      prueba sigue sirviendo para conectar. Las ejecuciones sin `-SoloScripts`
      usan `-UsuarioAplicacion munidata_prueba_app`, nunca el usuario con el
      que conecta el backend local.
   e. Control positivo: con `01`–`05` y `07`–`09` registrados, el script solo
      aplica el `10`.
9. Borrar las bases de prueba y el usuario de prueba, si se creó.
   `gestor_documental_pps` y `backend/storage` quedan como estaban.

## 15. Despliegue sobre datos reales

### 15.1 Auditoría de `despliegue/`

| Script | ¿Toca la BD? | ¿Seguro repetirlo con datos? |
|---|---|---|
| `desplegar.ps1` | **No.** Compila y publica el backend y el frontend, configura NSSM y arranca. No ejecuta SQL, ni seeds, ni `DROP`; TypeORM corre con `synchronize: false`. | **Sí.** Respalda antes de reemplazar y deshace el cambio si el arranque falla. |
| `preparar-base-datos.ps1` | Sí. Crea la base si falta, crea o actualiza `munidata_app`, hace un `mysqldump` previo si hay tablas y aplica **solo** los `init/*.sql` que no figuren en `scripts_aplicados`. No hace `DROP` (solo lo sugiere en un mensaje). Omite `06` salvo que se pida. | **Sí en cuanto a datos, si la tabla de control está completa.** Dos riesgos: **siempre pide una contraseña NUEVA para `munidata_app` y ejecuta `ALTER USER`** (si no se escribe exactamente la de `.env.produccion` y del registro del servicio, el backend deja de conectar), y su guardia actual no cubre una tabla de control con huecos (15.2.1). |
| `respaldar.ps1` | Lee (volcado). | Sí. |
| `revertir.ps1` | Restaura código; ofrece restaurar `base-datos.sql.gz`. | Sí; la restauración de la BD pide confirmación. |
| `verificar-*.ps1`, `crear-administrador.ps1` | Leen o crean el administrador. | Sí. |

### 15.2 Cómo se aplica la migración

- El usuario de la aplicación solo tiene `SELECT, INSERT, UPDATE, DELETE`, sin
  DDL. Por eso el backend **no puede** migrar al arrancar, y no debe: la
  migración la aplica `preparar-base-datos.ps1` con el usuario administrativo,
  que es el mecanismo que ya existe y que lleva la tabla de control.
- Cambio mínimo en `preparar-base-datos.ps1`: un switch **`-SoloScripts`**
  (**aprobado por Gerald**) que omite las dos preguntas de contraseña de
  `munidata_app` y el paso "Usuario de aplicación" (`CREATE USER`/`ALTER
  USER`/`GRANT`). Conserva la comprobación de conexión, el volcado previo, la
  tabla de control y la aplicación de los scripts pendientes. `-Simular` lo
  refleja. Sin `-SoloScripts`, el comportamiento por defecto no cambia, salvo
  que se suma la guardia de 15.2.1, que solo actúa en casos que hoy ya terminan
  en error o en una base a medias.
- "Sin intervención manual" se cumple en el sentido de que no hay que ejecutar
  SQL a mano. Lo único que se escribe es la contraseña administrativa de MySQL,
  que por diseño no se guarda en ningún sitio.
- Si la VM todavía no tuviera aplicado `09-permiso-reportes.sql`, esta misma
  ejecución lo aplica antes del `10`; la salida lo muestra como `APLICANDO`.
  Eso no es un hueco: el `09` sería el siguiente después del último registrado.

#### 15.2.1 Guardia ante una base poblada sin registro fiable (R-11, CA-14)

**Qué hace hoy** (`preparar-base-datos.ps1` en `acefbec`, confirmado leyendo el
código, líneas 449–573):

| Caso | Comportamiento actual |
|---|---|
| Base con tablas y **sin** `scripts_aplicados` | Hace el volcado previo, ejecuta `CREATE USER IF NOT EXISTS` + **`ALTER USER`** + `GRANT` (cambia la contraseña de `munidata_app`), **crea** `scripts_aplicados` vacía y **después** comprueba: con la lista vacía y la tabla `usuarios` presente, lanza el error «ya contiene el esquema… pero no hay registro» y sale con código 1 sin aplicar scripts. Deja dos efectos: la contraseña cambiada y la tabla de control creada vacía. |
| Igual, pero sin tabla `usuarios` (base poblada por otra vía con otras tablas) | La guardia no salta: aplica **todos** los scripts desde el `01` encima de los datos y falla a mitad. |
| `scripts_aplicados` existe pero **vacía** | Igual que el primer caso, sin el `CREATE TABLE`. |
| `scripts_aplicados` con **huecos** (por ejemplo, registra `01`–`05` y `08`, pero no el `07`) | **No hay guardia.** Aplica todos los no registrados, incluidos los anteriores al último registrado (el `07`), sobre una base que probablemente ya los tiene. Los `INSERT` de datos semilla pueden duplicar filas o fallar por clave única a mitad, y el script queda sin registrar. |
| `-SoloScripts` | Todavía no existe. |

**Qué debe hacer:**

1. Justo después de comprobar si la base existe (D-16), si está **poblada**
   (D-15):
   - si `scripts_aplicados` no existe → **aborta**;
   - si existe y está vacía → **aborta**;
   - si existe y tiene huecos → **aborta** y lista los scripts que faltan.
2. Abortar significa: mensaje claro en rojo, código de salida 1 y **ningún**
   efecto. Ni volcado, ni `CREATE`/`ALTER USER`, ni `GRANT`, ni
   `CREATE TABLE scripts_aplicados`, ni ningún script.
3. Aplica igual **con y sin `-SoloScripts`**. Con `-Simular` no se conecta a la
   base y, por tanto, no puede evaluarla: lo dice en una línea.
4. Esperados: todos los `init/*.sql` en orden de nombre; el `06` solo con
   `-IncluirUsuarioSemilla`. Si el `06` está registrado sin ese switch, no es
   un hueco. Un script registrado que ya no existe en `init/` se informa como
   aviso y no aborta.
5. El mensaje dice qué se encontró, que no se ejecutó nada y qué hacer: ejecutar
   `diagnosticar-codigos-categorias.ps1` (bloque 1) y revisar con el
   responsable de la base qué scripts tiene aplicados de verdad. **No** sugiere
   `DROP DATABASE` cuando la base tiene datos. Tampoco sugiere registrar los
   scripts a mano con `INSERT` sin comprobarlos antes (ver el riesgo residual).
6. Una base que **no** está poblada (nueva o vacía) sigue el camino actual: se
   crea la tabla de control y se aplican todos los scripts.

**Riesgo residual (R-12):** la guardia solo comprueba que lo registrado sea un
**prefijo contiguo** de lo esperado; no puede saber si cada script registrado se
aplicó de verdad. Una tabla de control rellenada a mano (como sugería el
mensaje actual), o un script registrado tras fallar a mitad por otra vía, la
pasan. **Mitigación:** antes de migrar en la VM, el bloque 1 del diagnóstico debe
mostrar registrados `01`–`05` y `07`–`09` (el `06` se omite por defecto). Si no
es así, **no se migra** y se revisa a mano. El paso 4 de 15.3 lo exige.

### 15.3 Nueva sección de `DESPLIEGUE.md`: "Actualización sobre datos reales"

Se añade como §6.1, debajo de "Actualizaciones posteriores" (no se renumera
nada). Documenta este orden en la VM, que no se altera: **respaldo → `git
status` limpio → `git pull` → diagnóstico → `preparar-base-datos.ps1
-SoloScripts` → `desplegar.ps1` → verificación**. Contenido:

1. **Respaldo previo**: `respaldar.ps1` a mano y comprobar que se creó la
   carpeta del día con `base-datos.sql.gz` y los documentos.
2. **`git status` limpio en la VM**: si muestra cambios, detenerse.
3. **`git pull`** y anotar el commit anterior (`git rev-parse HEAD` antes del
   pull) para la reversión.
4. **Diagnóstico**: `diagnosticar-codigos-categorias.ps1`.
   - El bloque 1 debe mostrar registrados en `scripts_aplicados` el `01` al `05`
     y el `07` al `09` (el `06` se omite por defecto). Si no es así,
     **detenerse**: no se migra (R-12).
   - Si reporta duplicados, **detenerse** y corregirlos a mano con el PO antes
     de seguir.
   - Los irregulares no impiden continuar, pero se anotan.
5. **Migración**: `preparar-base-datos.ps1 -SoloScripts`. Debe mostrar
   `APLICANDO 10-codigos-categorias-autogenerados.sql` y terminar con «Base de
   datos preparada correctamente». Si la guardia (15.2.1) aborta, no se ejecutó
   nada: detenerse y revisar.
6. **Despliegue**: `desplegar.ps1` con los mismos parámetros de siempre.
7. **Verificación**, sin crear datos de prueba en la VM (no hay borrado físico:
   una categoría de prueba quedaría para siempre):
   - `verificar-despliegue.ps1 -UrlPublica ...` (las diez comprobaciones);
   - repetir el diagnóstico, que ahora debe dar 0 nulos y 0 vacíos;
   - abrir el formulario de categorías en *crear* (muestra «Se asignará
     automáticamente», **sin guardar**) y en *editar* sobre una existente
     (código en solo lectura, **sin guardar**);
   - recorrer las vistas existentes de categorías y documentos;
   - abrir los cuatro iframes en `prueba-vista.html`;
   - alternar el modo oscuro, si se desplegó.
   La generación de códigos (crear, mover, reintento) se prueba **solo en
   local** (14.1 y 14.3).
8. **Reversión**: `revertir.ps1` (código y frontend anteriores) y, si hace falta
   la base, restaurar el `base-datos.sql.gz` del paso 1 según §8.2. Luego
   `git checkout` del commit anotado en el paso 3 y, cuando ya no haga falta ese
   código, **`git checkout main`** para salir del HEAD separado antes del
   siguiente `git pull`. Nota: el backend anterior funciona sobre la base
   migrada (un `NOT NULL` adicional no lo rompe), así que revertir el código
   **no exige** restaurar la base, salvo que el problema sea la propia
   migración.

Comandos de ejemplo (para la VM, sin marcadores):

```powershell
cd C:\munidata\gestor-documental-pps
powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1
git status
git rev-parse HEAD
git pull
powershell -ExecutionPolicy Bypass -File .\despliegue\diagnosticar-codigos-categorias.ps1
powershell -ExecutionPolicy Bypass -File .\despliegue\preparar-base-datos.ps1 -SoloScripts
powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs" -RutaNssm "C:\tools\nssm.exe"
powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-despliegue.ps1 -UrlPublica "https://su-servidor-real/munipalmares/wp-munidata"
```

(`C:\Apache24\htdocs` y `C:\tools\nssm.exe` son los valores de la VM ya
documentados en `DESPLIEGUE.md`; en los `.ps1` siguen siendo parámetros.)

Para la reversión, además de `revertir.ps1`, `git checkout` recibe el hash
completo que imprimió `git rev-parse HEAD` en el paso 3, copiado de la
pantalla, y después:

```powershell
git checkout main
```

## 16. Plan de trabajo, riesgos, criterios de aceptación y preguntas abiertas

### 16.1 Orden de implementación

Los pasos conservan su número, pero se ejecutan en este orden: **1 a 8, luego
11 y 12, luego 9 y 10, y cierre con el 13.**

| Orden | # | Paso | Depende de |
|---|---|---|---|
| 1 | 1 | Funciones puras de códigos + pruebas (7.1) | — |
| 2 | 2 | Servicio, DTO, endpoint `siguiente-codigo`, excepción, bitácora, regla de nivel + pruebas (7.2, 7.3, 8, 10) | 1 |
| 3 | 3 | Script de diagnóstico + envoltorio `.ps1` (6.3) | — |
| 4 | 4 | Migración `10-…sql` y entidad (6.4, 6.2) | 1 (mismo algoritmo) |
| 5 | 5 | `preparar-base-datos.ps1`: `-SoloScripts` y guardia (15.2, 15.2.1) | — |
| 6 | 6 | Prueba de la migración en la BD local: dos veces, con duplicado, guardia y vía `-SoloScripts` (14.3) | 3, 4, 5 |
| — | — | **Punto de control:** detenerse y reportar a Gerald archivos, SQL de la migración, resultados de 14.3 y `git log --oneline origin/main..main`. No se sigue sin su confirmación. | 6 |
| 7 | 7 | Frontend de categorías (9.1) | 2 |
| 8 | 8 | Nombre "Muni Data" (9.4) | — |
| 9 | 11 | Vistas públicas con el estilo del Observatorio + Poppins, con variables `--portal-*` (9.2, D-17). Crea el script en línea de `index.html` con `data-superficie` (D-18). | — |
| 10 | 12 | `DESPLIEGUE.md` §6.1, notas en `spec-portal-publico.md` §16 y `DESIGN.md` (15.3, 9.2) | 3–5, 11 |
| 11 | 9 | Capturas de "antes" en claro y luego refactorización de tokens sin cambio visual (9.3.2, paso 1; 14.2) | — |
| 12 | 10 | Modo oscuro: tokens, `data-tema` en el script de `index.html`, `useTema`, conmutador, revisión por pantalla con los componentes montados fuera del layout (9.3) | 9, 11 |
| 13 | 13 | Verificación final: pruebas, `lint` del backend, `vue-tsc`, build, consola, `grep` del nombre, analizador de PS 5.1, limpieza | todo |

Si falta tiempo, lo que se pospone es el **modo oscuro (pasos 9 y 10)**. El
resto de la entrega no depende de ellos.

### 16.2 Riesgos

| Id | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-1 | La base de la VM tiene un duplicado numérico y la migración aborta el día del despliegue. | Baja | Medio | Diagnóstico antes de migrar; la migración aborta sin escribir; el despliegue del código no depende de ella. |
| R-2 | Al repetir `preparar-base-datos.ps1` se cambia sin querer la contraseña de `munidata_app` y el backend deja de conectar. | Media sin el cambio | Alto | `-SoloScripts` (15.2); `DESPLIEGUE.md` §6.1 solo muestra esa forma. |
| R-3 | La raíz creada en la VM usa una grafía (`itps-05`) distinta de la que usan los enlaces de WordPress. | Media | Medio | El diagnóstico la muestra; D-2 evita colisiones de numeración; la URL sigue funcionando sin distinguir mayúsculas; se corrige el enlace de WordPress si hace falta (fuera de alcance). |
| R-4 | Mover una subsección libera su número, y la siguiente subsección creada en esa raíz lo reutiliza: un enlace viejo de WordPress llevaría a otra subsección. | Baja | Medio | Confirmación explícita (RF-10); bitácora con código anterior y nuevo; anotado en el instructivo de WordPress. Alternativa si el PO lo exige: reservar los números consultando la bitácora (fuera de esta entrega). |
| R-5 | La refactorización de ≈ 136 clases cambia algo del modo claro. | Media | Bajo | Mismos valores de color; capturas antes y después (RNF-3). |
| R-6 | Un componente con color propio no cubierto por los tokens se ve mal en oscuro (visor de PDF, `select` nativo). | Media | Bajo | `color-scheme: dark`; revisión por pantalla (9.3.2, paso 3). El visor de PDF del navegador tiene su propio tema y no se fuerza. |
| R-7 | `npm ci` en la VM no puede descargar `@fontsource/poppins`. | Baja | Bajo | Alternativa D-11: `.woff2` versionados en `src/assets/fuentes/`. |
| R-8 | `DELIMITER`/procedimiento no se comporta igual vía `source` en la VM. | Baja | Medio | Se prueba por el mismo camino (`preparar-base-datos.ps1`) en local (14.3, paso 7). |
| R-9 | Un navegador con `localStorage` bloqueado lanza una excepción en el script en línea. | Baja | Bajo | `try/catch`; sin almacenamiento se sigue `prefers-color-scheme`. |
| R-10 | Un frontend viejo en caché sigue enviando `codigo`. | Baja | Nulo | Se descarta (D-5); `index.html` va con `no-cache`. |
| R-11 | `preparar-base-datos.ps1` se ejecuta sobre una base poblada cuya tabla de control falta, está vacía o tiene huecos, y aplica scripts antiguos encima de los datos (o cambia la contraseña de `munidata_app` antes de abortar). | Baja | Alto | Guardia de 15.2.1: aborta antes de cualquier efecto, con y sin `-SoloScripts` (CA-14). |
| R-12 | Residual de R-11: la tabla de control tiene un prefijo contiguo que no refleja lo aplicado de verdad (por ejemplo, rellenado a mano). La guardia no lo detecta. | Baja | Alto | Bloque 1 del diagnóstico: deben figurar `01`–`05` y `07`–`09`. Si no figuran, no se migra (15.3, paso 4). |
| R-13 | Un modal, desplegable o toast montado fuera de `AppShellLayout` queda en claro dentro del modo oscuro. | Baja | Bajo | Selector sobre `<html>` (D-13); revisión específica en 9.3.2, paso 3. |

### 16.3 Criterios de aceptación

- CA-1. Crear una raíz sin escribir código asigna el siguiente `ITSP-NN`; crear
  una subsección asigna `RAIZ-MM` contando también las inactivas.
- CA-2. Enviar `codigo` en el cuerpo no tiene efecto ni da error.
- CA-3. Mover una subsección pide confirmación con X e Y reales y, al aceptar,
  cambia solo su código; la bitácora registra ambos.
- CA-4. Convertir una raíz en subsección, o al revés, responde 400 y el
  formulario no lo ofrece.
- CA-5. `/vista/ITSP-01`, `/vista/itsp-01` e `/vista/Itsp-01` muestran la
  misma sección.
- CA-6. La migración, ejecutada dos veces en la base de prueba, rellena los
  nulos y vacíos la primera vez y no cambia nada la segunda; con un duplicado
  aborta sin escribir.
- CA-7. Ningún código no vacío existente cambia tras la migración (comparación
  de volcados).
- CA-8. Las vistas públicas coinciden con las capturas del Observatorio, son
  oscuras con cualquier preferencia del sistema, no destellan en blanco y no
  tienen scroll horizontal a 900×580 ni a 360 px.
- CA-9. El modo oscuro se activa con el conmutador, persiste al recargar, no
  destella, no afecta al login ni a las vistas públicas, y todos los pares de
  12.2 se cumplen en las pantallas listadas en 9.3.2.
- CA-10. El modo claro es idéntico al anterior.
- CA-11. "Muni Data" aparece en la barra lateral, el pie, el login, el
  `<title>` y la cabecera del correo; el `grep` de 9.4 no devuelve apariciones
  de interfaz ni de correo.
- CA-12. 224+ pruebas en verde, `lint` del backend limpio, `vue-tsc` y build en
  0 errores, sin errores de consola, `.ps1` con 0 errores del analizador 5.1,
  BOM UTF-8 y CRLF. `frontend/package-lock.json` está commiteado junto con
  `@fontsource/poppins`, y `npm ci` en limpio termina sin errores.
- CA-13. Al terminar: bases de prueba borradas, scripts temporales eliminados,
  procesos detenidos, `gestor_documental_pps` y `backend/storage` idénticos al
  estado base, nada subido (los commits son locales en `main`; `git log
  --oneline origin/main..main` los lista para el push de Gerald).
- CA-14. Sobre una base poblada sin `scripts_aplicados`, con la tabla vacía o
  con huecos, `preparar-base-datos.ps1` aborta con un mensaje claro y código 1,
  con y sin `-SoloScripts`, sin ejecutar ningún script ni `ALTER USER` y sin
  crear la tabla de control (14.3, paso 8). Con la tabla completa, solo aplica
  los scripts pendientes.

### 16.4 Preguntas abiertas

**Decididas por Gerald; P-1 y P-3 pendientes de confirmación del PO.**

| Id | Pregunta | Decisión |
|---|---|---|
| P-1 | ¿Se prohíbe convertir raíz ↔ subsección? (Resumen, 1) | **Sí, se prohíbe.** Se invierten las pruebas que hoy exigen lo contrario (14.1). *Pendiente de confirmación del PO.* |
| P-2 | ¿Qué grafía usan los enlaces de WordPress y qué código tiene de verdad la quinta raíz? (Resumen, 2) | **CONFIRMADA por Gerald:** los enlaces de WordPress y los códigos de categoría usan `ITSP`, y la quinta raíz, `ITSP-05`, tiene la misma grafía que las demás. La migración no modifica ningún código existente (C-4). D-2 se mantiene solo como defensa. |
| P-3 | ¿Excepción de la píldora en los botones públicos? (Resumen, 3) | **Sí, solo en las vistas públicas**, con la nota de excepción en `DESIGN.md` (9.2). *Pendiente de confirmación del PO.* |
| P-4 | ¿Borde de 1 px en los botones rojos para superar 3:1 frente a la tarjeta? (12.2) | **No**, sin borde. |
| P-5 | ¿Reservar los números de las subsecciones movidas (R-4)? | **No** se reserva. |
| P-6 | §4.5 Participación ciudadana (manuales). | **Sigue diferida.** |

---

## Anexo A — Resultado del reconocimiento (Fase 1)

Revisión de solo lectura del repositorio en `main` (`acefbec`), árbol limpio
salvo los PNG que están fuera del control de versiones a propósito.

### A.1 Categorías

- Tabla `categorias_itsp`, entidad `CategoriaItsp`; `codigo VARCHAR(50) NULL` con
  `uk_categorias_itsp_codigo UNIQUE`.
- Seeds (`03-datos-itsp.sql`): `ITSP-01`…`ITSP-04` y subsecciones `ITSP-0N-MM`,
  **mayúsculas, prefijo ITSP**. 4 raíces + 13 subsecciones = 17 filas.
- DTO de crear y actualizar: `codigo?` opcional (`@IsString @MaxLength(50)`); el
  servicio lo normaliza (vacío → `NULL`) y comprueba que no esté repetido.
- El servicio **permite** convertir subsección ↔ raíz (`idCategoriaPadre: null`,
  y colgar una raíz sin hijos), y hay pruebas que lo fijan.
- Resolución pública (`portal-publico.service.ts`): `findOne({ where: { codigo } })`
  sin normalizar; la colación la hace insensible a mayúsculas. La salida pública
  se pasa a minúsculas (`codigoPublico`). Router: `/vista`, `/vista/:seccion`,
  `/vista/:seccion/:subseccion` (`PREFIJO_PORTAL_PUBLICO = '/vista'`). Snippets:
  `/munipalmares/wp-munidata/vista/itsp-0N`.
- Bitácora: `CREAR_/ACTUALIZAR_/INACTIVAR_/REACTIVAR_CATEGORIA_ITSP`;
  `ACTUALIZAR` guarda `camposActualizados`.
- `ValidationPipe({ whitelist: true, transform: true })`, sin
  `forbidNonWhitelisted`.

### A.2 Scripts SQL

`01` a `09` en `base-datos/scripts/init/`. El último es
**`09-permiso-reportes.sql`**, no el 08. Se aplican en orden alfabético con
`preparar-base-datos.ps1`, que los registra en `scripts_aplicados`. La siguiente
migración es la **10**.

### A.3 Despliegue

Ver 15.1. Puntos clave: `desplegar.ps1` no toca la base; `preparar-base-datos.ps1`
es idempotente respecto a los scripts, pero siempre redefine la contraseña de
`munidata_app`; el usuario de la aplicación no tiene DDL.

### A.4 Estilos

Tailwind v4 CSS-first, tokens en `@theme static`; casi ningún color fijo; tres
tokens con doble uso (9.3.1). Public Sans y Material Symbols desde Google Fonts.
Vistas públicas: tarjeta blanca sobre `bg-surface`, `max-w-5xl`, radio 8 px.

### A.5 Capturas (`documentacion/design/portal-publico/`)

- *iframe en WordPress* / *iframe en la ventana principal del WordPress*:
  Observatorio, tarjeta oscura sobre fondo casi negro, logo + título en Poppins
  bold, subtítulo gris, píldora turquesa «TICS», opciones en recuadros
  `#2b3338` con borde claro, botón primario rojo en píldora a todo el ancho y
  botón secundario de contorno.
- *Portal en WordPress*: portada oscura de la municipalidad, Poppins.
- *Pantalla referencia otro sistema…* y *Referencia otro sistema acceso a los
  documentos…*: referencias de navegación (tarjetas de subsección, lista de
  PDF); no son de estilo.

### A.6 Apariciones del nombre

Ver 9.4. En la interfaz: `index.html`, `AppShellLayout.vue` (×2) y `LoginView.vue`.
En el correo: `plantillas-correo.ts:62` y `verificar-smtp.ts:289`. El resto son
comentarios, scripts SQL existentes, documentación formal o identificadores
técnicos.

### A.7 Discrepancias entre el encargo y el repositorio

| Id | El encargo dice | El repositorio tiene | Propuesta / default |
|---|---|---|---|
| Δ-1 | Prefijo `ITPS`, rutas `/vista/itps-01`…`itps-05` | `ITSP` en seeds, snippets, constantes y pruebas | Se mantiene `ITSP` (D-1), se reconoce `ITPS` para la numeración (D-2) y se pregunta (P-2). |
| Δ-2 | El último script SQL es el 08 | Existe `09-permiso-reportes.sql` | La migración es la `10`. |
| Δ-3 | "Una raíz no se convierte en subsección ni al revés" | El backend lo permite y tiene pruebas que lo fijan | Se prohíbe (C-2), se invierten las pruebas y se pregunta (P-1). |
| Δ-4 | Migración "sin intervención manual" | El usuario de la aplicación no tiene DDL; solo el administrativo puede migrar, y su contraseña no se guarda | Se aplica con `preparar-base-datos.ps1 -SoloScripts`: no hay que escribir SQL a mano, pero sí la contraseña administrativa (15.2). |
| Δ-5 | Píldoras en botones y contexto | `DESIGN.md` reserva la píldora para las insignias de estado; el spec del portal hizo rectangulares las etiquetas por eso | Excepción solo en las vistas públicas, documentada (P-3). |
| Δ-6 | Cambiar el asunto y el nombre visible del remitente | Restricción permanente: no tocar plantillas ni remitente; el remitente es la institución, no el sistema | Solo se cambia el subtítulo con el nombre del sistema (D-12). |
| Δ-7 | `spec-portal-publico.md` §16, decisión 5: "panel claro sobre la portada oscura" | Ya implementado en claro | Lo sustituye esta spec; se anota en aquel documento sin renumerar. |
| Δ-8 | "Verifica con build, lint y pruebas" | El frontend no tiene script `lint` | Se verifica con `vue-tsc` + build; no se añade ESLint al frontend. |
| Δ-9 | Iframe de WordPress 900×580 | Los snippets usan `width:100%` y 800/650 px de alto | No se tocan los snippets (WordPress, fuera de alcance); el diseño funciona en 900×580 y en cualquier alto mayor. |

## Anexo B — Cambios respecto a la versión 1

Instrucciones de Gerald posteriores a la Fase 1 (23 de octubre de 2026).

| # | Cambio | Dónde |
|---|---|---|
| B-1 | Preguntas abiertas decididas por Gerald: P-1 sí (se invierten las pruebas), P-2 `ITSP` sin tocar códigos existentes, P-3 sí con nota en `DESIGN.md`, P-4 sin borde, P-5 sin reserva, P-6 diferida. P-1 y P-3 quedan pendientes de confirmación del PO. | Resumen, 9.2, 12.2, 16.4 |
| B-2 | C-11: commits permitidos, solo locales, directo en `main`, sin push; etiqueta local `antes-ajustes` antes del primero. | 3 |
| B-3 | CA-13: «nada commiteado» pasa a «nada subido». | 16.3 |
| B-4 | Guardia de `preparar-base-datos.ps1`: comportamiento actual confirmado leyendo el código (aborta tarde y tras `ALTER USER`; sin protección ante huecos). Nuevo comportamiento: abortar sin efectos con y sin `-SoloScripts`. Decisiones D-15 y D-16, riesgos R-11 y R-12 (prefijo contiguo), criterio CA-14 y prueba local 14.3, paso 8. `-SoloScripts` aprobado; el comportamiento por defecto no cambia. | 2.1, 15.1, 15.2.1, 14.3, 16.2, 16.3 |
| B-5 | Nuevo orden de ejecución de 16.1: 1–8, 11, 12, 9, 10, 13, con punto de control tras el 6. Si falta tiempo se pospone el modo oscuro (9 y 10). D-18: el paso 11 crea el script de `index.html` y el 10 lo amplía. | 16.1, 3.1 |
| B-6 | El portal usa variables `--portal-*` acotadas a `.tema-portal` y no redefine tokens globales; sobrescribe `:focus-visible` con `#6bccf2` dentro de `.tema-portal` (D-17). | 9.2, 3.1 |
| B-7 | Selector del modo oscuro: `html[data-tema='oscuro'][data-superficie='sistema']` en lugar de `.tema-sistema` (D-13). Revisión explícita de modales, desplegables y toasts montados fuera del layout (R-13). | 3.1, 9.3.2, 9.3.4, 16.2 |
| B-8 | 15.3, paso 7: en la VM no se crean categorías de prueba; se verifica con el diagnóstico posterior, el formulario sin guardar, las vistas existentes y los iframes. La generación de códigos se prueba solo en local. El bloque 1 del diagnóstico es condición para migrar. | 15.3 |
| B-9 | 15.3, paso 8: tras el `git checkout` del commit anterior, `git checkout main` para salir del HEAD separado. | 15.3 |
| B-10 | `package-lock.json` se commitea junto con `@fontsource/poppins` (`desplegar.ps1` usa `npm ci`). | 9.2, 16.3 |
| B-11 | `DESPLIEGUE.md` §6.1 documenta el orden respaldo → `git status` → `git pull` → diagnóstico → `-SoloScripts` → `desplegar.ps1` → verificación; los comandos de ejemplo siguen ese orden. | 15.3 |
| B-12 | Capturas de "antes" en claro tomadas antes del paso 9, o lista de pantallas para Gerald si no hay navegador. | 14.2, 16.1 |
