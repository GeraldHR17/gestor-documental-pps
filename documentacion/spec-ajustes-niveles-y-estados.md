# Especificación — Ajustes 2 de Muni Data: estados con color, iframes sin migas y subniveles

**Sistema Integral de Gestión Documental — Municipalidad de Palmares**
Documento para validación con el Product Owner (supervisor). Versión 1 — 29 de octubre de 2026.

> **Estado: propuesta, pendiente de aprobación.** Describe cambios que todavía
> no existen. La Fase 1 (reconocimiento y esta spec) está cumplida. La Fase 2
> empieza solo cuando Gerald escriba «Spec aprobada, continúa con la Fase 2» e
> implementa en el orden de 16.1.

---

# Resumen para el Product Owner

*Esta página se puede leer sola. El resto del documento es el detalle técnico.*

## Qué cambia

1. **Los estados tienen color.** En las listas del sistema (usuarios,
   catálogos, categorías y documentos):
   - **Activo** se ve en **verde** e **Inactivo** en **rojo**;
   - un documento **Publicado** se ve en **verde**, en **Borrador** en
     **amarillo** e **Inactivo** en **rojo**.

   La palabra se sigue mostrando, así que se entiende aunque no se distingan
   los colores. Funciona igual en modo claro y oscuro. Los recuadros públicos
   de WordPress **no cambian**.
2. **Los recuadros de WordPress ya no muestran la línea de navegación**
   («Transparencia › Información institucional › …»). Todo lo demás queda
   igual: tarjetas, documentos, botones Ver y Descargar, paginación y estilo
   oscuro. Para volver atrás se usan las flechas del navegador. Arriba de cada
   recuadro sigue indicándose dónde se está.
3. **Las categorías pueden tener subcategorías a cualquier profundidad**, hasta
   **10 niveles** contando la sección principal. Ejemplo: Información
   institucional › Organización y funciones › Organigramas › 2026. Cada nivel
   recibe su código automático (`ITSP-01-02-01`, `ITSP-01-02-01-01`…). **Ningún
   código ni dirección existente cambia.**
4. **Cualquier categoría tiene su propia dirección de recuadro**, armada con su
   código: `…/vista/itsp-01-02-01`. Las direcciones que ya están en WordPress
   siguen funcionando igual.
5. **Mover una subcategoría que tiene subcategorías** se permite. El sistema
   avisa antes de guardar de qué código a cuál cambia y **cuántas direcciones
   cambian en total**, porque todas las que cuelgan de ella cambian también.
6. Al registrar o editar un documento, la categoría se elige en **una sola
   lista con buscador** que muestra la ruta completa («Información
   institucional › Organización y funciones › Organigramas»), en vez de dos
   listas encadenadas.

## Qué NO incluye

- No se toca WordPress ni la configuración del correo.
- No cambia el aspecto de los recuadros públicos, salvo quitar la línea de
  navegación.
- «Participación ciudadana» sigue sin admitir documentos, ahora en todas sus
  subcategorías a cualquier profundidad.

## Lo que necesitamos que usted confirme

| | Decisión | Por defecto si no hay respuesta |
|---|---|---|
| **1** | Al inactivar una categoría, sus subcategorías **conservan su propio estado**, pero dejan de verse en los recuadros y de poder elegirse para documentos nuevos mientras la superior siga inactiva. Al reactivarla, todo vuelve como estaba. ¿De acuerdo? | Sí (es lo que ya pasa hoy con las secciones y sus subsecciones). |
| **2** | En la lista de documentos, el filtro por categoría muestra **solo los documentos clasificados exactamente en esa categoría**, no los de sus subcategorías. ¿Lo dejamos así o incluimos las subcategorías? | Se deja así (es el comportamiento de hoy). |
| **3** | No se podrá mover una subcategoría **con documentos** dentro de «Participación ciudadana», porque esa sección no admite documentos. ¿De acuerdo? | Sí, se rechaza con un mensaje claro. |

---

## Índice

1. Contexto y objetivo
2. Alcance, fuera de alcance y supuestos
3. Decisiones confirmadas
4. Requisitos funcionales
5. Requisitos no funcionales
6. Modelo de datos y migración
7. Algoritmos: códigos, profundidad, mover un subárbol, estado efectivo
8. Contrato de la API (cambios)
9. Frontend
10. Manejo de errores
11. Reglas de negocio
12. Seguridad y accesibilidad
13. Rendimiento
14. Pruebas
15. Despliegue sobre datos reales
16. Plan de trabajo, riesgos, criterios de aceptación y preguntas abiertas
- Anexo A — Resultado del reconocimiento y discrepancias

---

## 1. Contexto y objetivo

Muni Data está desplegado en la VM municipal con datos reales: usuarios,
documentos, dependencias, bitácora y las categorías `ITSP-01` a `ITSP-05` con
subsecciones creadas por el supervisor. La ronda anterior
(`spec-ajustes-posdespliegue.md`: códigos automáticos, portal oscuro, modo
oscuro y nombre Muni Data) está en `main` y subida.

Esta ronda tiene tres pedidos, A, B y C (ver la sección 3). Deben aplicarse
con el flujo de siempre **sin migración de base de datos** (ver la sección 6),
sin alterar ningún dato existente ni ningún código o URL vigente.

## 2. Alcance, fuera de alcance y supuestos

### 2.1 Alcance

| Id | Pedido | Resumen |
|---|---|---|
| A | Estados con color | Insignias Activo/Inactivo y de estado de documento con color, tokens claro/oscuro, componente compartido. |
| B | Iframes sin migas | Quitar `MigasDePanPublicas` de las vistas públicas, vista genérica de nodo para N niveles y ruta `/vista/:codigo` para cualquier nodo. |
| C | Subniveles ilimitados | Jerarquía de hasta 10 niveles: backend (árbol recursivo, códigos, mover subárbol, profundidad, exclusión y estado efectivo por cadena de ancestros), frontend (formulario, selectores, lista) y portal. |
| D | Documentación | `DESPLIEGUE.md` §6.2 «Actualización 2», `INTEGRACION-WORDPRESS.md`, `DESIGN.md` (nota de colores de estado). |

### 2.2 Fuera de alcance

- Las vistas públicas no cambian de colores ni de estilo (A); solo pierden las
  migas (B).
- WordPress, los snippets `frontend/public/iframes/*.html` (siguen apuntando a
  `/vista/itsp-0N`, que no cambia), la configuración de correo y los secretos.
- `base-datos/scripts/README.md` (credenciales del usuario semilla: se limpian
  aparte).
- Identificadores técnicos. `CODIGO_CATEGORIA_RAIZ_EXCLUIDA` conserva su
  nombre.
- El esquema de tablas: no hay migración (ver la sección 6).

### 2.3 Supuestos

- S-1. Las categorías de la VM tienen `nivel` 1 en las raíces y 2 en las
  subsecciones, coherente con `id_categoria_padre`. Si no fuera así, el
  diagnóstico de 15.2 lo muestra.
- S-2. Hay decenas de categorías, no miles: leer la tabla completa y armar el
  árbol en memoria es lo adecuado (sección 13).
- S-3. La VM ya tiene aplicada la migración 10 (`codigo` es `NOT NULL`).

## 3. Decisiones confirmadas

Tomadas por Gerald en el encargo; no se reabren.

| Id | Decisión |
|---|---|
| C-1 | Activo = verde; Inactivo = rojo, en todos los indicadores Activo/Inactivo del sistema autenticado. |
| C-2 | Documento: PUBLICADO = verde, BORRADOR = amarillo, INACTIVO = rojo (el mismo de Inactivo). |
| C-3 | Se mantiene la etiqueta de texto y la forma de insignia. Contraste de texto ≥ 4.5:1 en claro y oscuro. Tokens con variante oscura en el mecanismo existente. Un componente compartido. |
| C-4 | Iframes: se quitan SOLO las migas. Se conserva todo lo demás. |
| C-5 | Se conservan las rutas públicas actuales y se añade una ruta por código para cualquier profundidad, insensible a mayúsculas, con su endpoint público. |
| C-6 | Tope técnico de 10 niveles contando la raíz, en una constante única. |
| C-7 | Código = código del padre + `-MM` (máximo de los hijos del padre, activos e inactivos, + 1). No cambia ningún código existente. |
| C-8 | Mover un nodo con hijos recalcula su subárbol en una transacción: el nodo toma el siguiente `MM` del padre nuevo; los descendientes regulares conservan su sufijo relativo; los irregulares toman máximo + 1 bajo su padre. Nunca bajo sí mismo ni bajo un descendiente; el tope se valida con la altura del subárbol. El aviso dice de qué código a cuál y cuántas URL cambian. Bitácora y reintento por colisión como hoy. |
| C-9 | Una raíz no pasa a subsección ni al revés. Una subsección puede moverse bajo otra subsección o bajo otra raíz. |
| C-10 | Documentos: la regla actual de las raíces se mantiene; en los demás nodos (con o sin hijos) se pueden clasificar documentos. |
| C-11 | Participación ciudadana: todo su subárbol queda excluido de clasificar documentos, comprobado por cadena de ancestros, en frontend y backend. |
| C-12 | El árbol del backend se construye en memoria desde una consulta plana; `GET /categorias-itsp/arbol` y los tipos son recursivos. Se invierten (no se borran) las pruebas de los dos niveles. |
| C-13 | Selectores de documentos y filtros: un selector de N niveles con ruta completa y búsqueda, reutilizando `SelectorBusqueda`. |
| C-14 | Sin migración salvo que se demuestre necesaria; si la hubiera, sería la 11, idempotente y con diagnóstico. |

### 3.1 Decisiones asumidas

Defaults aplicados por ambigüedad o por choque con el repositorio (ver el
Anexo A). Todos se pueden revertir antes de la Fase 2.

| Id | Ambigüedad | Decisión asumida | Motivo |
|---|---|---|---|
| D-1 | La ruta genérica `/vista/:codigo` tiene exactamente la misma forma que la ruta actual `/vista/:seccion`. | **No se agrega una ruta nueva: se generaliza la de un segmento** para resolver cualquier nodo activo por su código (`/vista/itsp-01` sigue siendo la sección; `/vista/itsp-01-02-01` abre ese nodo). Se conservan el nombre `portal-seccion` y el parámetro. `/vista/:seccion/:subseccion` no cambia: exige que la subsección sea hija **directa** de la sección, como hoy. | Dos rutas con el mismo patrón no pueden coexistir en el router. Generalizar la existente mantiene intactas todas las URL publicadas. |
| D-2 | Endpoint público equivalente. | `GET /publico/categorias/:codigo` (nodo con hijos activos, ruta de ancestros y conteos) y `GET /publico/categorias/:codigo/documentos` (paginado, documentos clasificados **directamente** en el nodo). Los cinco endpoints actuales no cambian de contrato. | Endpoints nuevos y aditivos: nada que ya consuma la API se rompe. |
| D-3 | ¿A dónde enlazan las tarjetas del portal? | Hijas directas de una raíz: a `/vista/:seccion/:subseccion`, como hoy. Nodos de nivel 3 o más: a `/vista/:codigo`. | Las URL que hoy se generan no cambian. |
| D-4 | «Se mantiene la regla actual para las raíces» (documentos). | La regla de hoy: **una raíz solo se puede elegir si no tiene subcategorías**. Hoy vive solo en el frontend (`idCategoriaEfectiva`) y así sigue. Los nodos de nivel ≥ 2 se pueden elegir siempre, tengan o no hijos. | Literal del encargo; el backend nunca la impuso (ver Δ-3). |
| D-5 | Estado efectivo (inactivar con descendientes). | Inactivar **no** escribe el estado de los descendientes: conservan el suyo. Un nodo está **efectivamente activo** si él y todos sus ancestros están ACTIVO. Solo los efectivamente activos aparecen en el portal, en el árbol filtrado por `estado=ACTIVO` y en los selectores de clasificación, y admiten documentos nuevos. Reactivar devuelve el subárbol como estaba. El catálogo interno los sigue listando y editando con su estado propio. | Es el comportamiento actual (raíz inactiva ⇒ sus subsecciones desaparecen) extendido a N niveles. No pierde información. |
| D-6 | Clasificar en un nodo activo cuyo ancestro está inactivo. | El backend lo rechaza (400): exige el estado **efectivo**. | Hoy `verificarClasificacion` solo mira el nodo y se puede saltar por API (Δ-4). |
| D-7 | Mover un nodo con documentos al subárbol de Participación ciudadana. | Se rechaza (400) si el subárbol movido tiene algún documento clasificado, en cualquier estado. | Si no, quedarían documentos en un subárbol que no los admite y que el portal oculta (pregunta 3 del resumen). |
| D-8 | Ruta de la categoría en la respuesta de documentos. | `nombreCategoriaRaiz` pasa a ser el nombre de la **raíz real** (hoy es el del padre directo, que en 2 niveles coincidía) y se agrega `rutaCategoria: string[]` (nombres de los ancestros, de la raíz al padre). El detalle muestra la ruta completa. | Con N niveles «padre» y «raíz» dejan de coincidir (Δ-7). |
| D-9 | Reportes por categoría. | Se agrupan por la **raíz real** (cadena de ancestros), no por el padre directo. | Hoy un documento de nivel 3 se contaría en una subsección que el reporte no muestra (Δ-6). |
| D-10 | Conteo público de un nodo. | `cantidadDocumentos` de una sección o subsección = documentos PUBLICADOS de su subárbol **visible** (él y descendientes efectivamente activos). | Una tarjeta que dice «3 documentos» debe llevar a donde están esos 3. |
| D-11 | Exclusión de Participación ciudadana en el portal. | Un nodo está excluido si su raíz (primer elemento de `ruta`, o él mismo si es raíz) es `ITSP-03`. Muestra el marcador «Contenido próximamente», como hoy. | Por cadena de ancestros (C-11), sin prefijos de código. |
| D-12 | Componentes de estado (A). | `components/InsigniaEstado.vue` (base: `tono` = `exito` / `advertencia` / `peligro` y el texto). `BadgeEstadoDocumento` lo usa, y el nuevo `BadgeEstadoRegistro` (ACTIVO/INACTIVO) reemplaza las tres copias en las vistas de usuarios, catálogos y categorías. El resumen del formulario de usuario («Estado: Activo», hoy texto plano) también pasa a la insignia. | Hoy el Activo/Inactivo está copiado en tres vistas (C-3: centralizar). Los roles no tienen estado (Δ-10). |
| D-13 | Tokens de color de estado (A). | `--color-exito*`, `--color-advertencia*`, `--color-peligro*` (contenedor, texto, borde, punto), con variante en el bloque oscuro existente (`html[data-tema='oscuro'][data-superficie='sistema']`). Valores y contrastes en 12.2. | Mismo mecanismo que el modo oscuro de la ronda anterior. |
| D-14 | `DESIGN.md` reserva el rojo para errores y pinta los estados en neutros. | Se agrega una nota de excepción: estados con colores semánticos (decisión del PO), siempre con texto. | Choque entre la regla de diseño y la decisión C-1/C-2; manda la decisión y se documenta. |
| D-15 | Profundidad: ¿dónde vive la constante? | `PROFUNDIDAD_MAXIMA_CATEGORIAS = 10` en `backend/src/comun/constantes/categorias-itsp.ts` y su espejo en `frontend/src/lib/documentos.config.ts`, como `CODIGO_CATEGORIA_RAIZ_EXCLUIDA`. | Mismo patrón que la otra regla compartida. |
| D-16 | Longitud del código (VARCHAR(50)). | Con números de dos dígitos, el código más largo de 10 niveles mide 34 caracteres (`ITSP-01` + 9 × `-MM`); con tres dígitos en todos los niveles, 44. Caben. Si una raíz con código irregular largo produjera más de 50, el servicio responde 400 con un mensaje claro en vez de fallar en la base. | Sin migración (C-14). |
| D-17 | Bitácora de un movimiento con subárbol. | Una entrada `ACTUALIZAR_CATEGORIA_ITSP` en el nodo movido con `codigoAnterior`, `codigoNuevo`, `cantidadUrlCambiadas` y `cambiosDescendientes: [{ id, codigoAnterior, codigoNuevo }]`. | Una sola acción de la persona, un solo registro, con el detalle completo. |
| D-18 | Selector de categoría padre en el formulario de categorías. | También `SelectorBusqueda` con la ruta completa y el código. Al crear: cualquier nodo con nivel < 10 o «Ninguna (raíz)». Al editar una subsección: cualquier nodo salvo ella misma y sus descendientes, y que respete el tope; sin «Ninguna». Al editar una raíz: sin selector, como hoy. Incluye nodos inactivos, como hoy incluye raíces inactivas. | Con N niveles una lista simple de raíces ya no alcanza. |
| D-19 | Filtro de documentos por categoría. | Igualdad exacta, como hoy (pregunta 2). | No cambiar el comportamiento sin pedido. |
| D-20 | Columna «Nivel» de la lista de categorías. | Sangría proporcional al nivel y el texto «Raíz» para nivel 1 o «Nivel N» para los demás. | «Subsección» ya no describe un nivel 4. |
| D-21 | `portal-publico.service.spec.ts` tiene 2 errores de tipos previos. | Como se modifica en esta ronda, se corrigen y se anota. | Pedido del encargo. |
| D-22 | `prueba-vista.html` y snippets. | No cambian: las cuatro URL de sección siguen iguales. | No hace falta (B). |

## 4. Requisitos funcionales

| Id | Requisito |
|---|---|
| RF-1 | Las insignias Activo/Inactivo del sistema autenticado se pintan verde/rojo con su texto. |
| RF-2 | Las insignias de estado de documento se pintan PUBLICADO verde, BORRADOR amarillo e INACTIVO rojo. |
| RF-3 | Las vistas públicas no muestran migas; el nivel actual se sigue indicando con la píldora de contexto y el título. No queda espacio vacío ni enlace del bloque eliminado. |
| RF-4 | `/vista/:codigo` abre cualquier nodo efectivamente activo, sin distinguir mayúsculas. Muestra las tarjetas de sus hijos activos, sus documentos publicados y, si no tiene ninguno, un mensaje claro. |
| RF-5 | Las URL actuales (`/vista`, `/vista/:seccion`, `/vista/:seccion/:subseccion`) siguen funcionando igual para todas las categorías existentes. |
| RF-6 | Una categoría puede tener hijas a cualquier profundidad hasta 10 niveles; superarlo da 400 con un mensaje claro. |
| RF-7 | El código de una categoría nueva de cualquier nivel es el código del padre + `-MM` (máximo de sus hijos, activos e inactivos, + 1). |
| RF-8 | Mover un nodo (no raíz) bajo otro nodo recalcula su subárbol según C-8 en una transacción, con reintento ante colisión y 409 tras tres intentos. |
| RF-9 | No se puede mover un nodo bajo sí mismo ni bajo un descendiente (400). |
| RF-10 | El aviso previo al mover dice el código actual, el nuevo y el total de URL que cambian. |
| RF-11 | Ningún nodo del subárbol de Participación ciudadana admite documentos (frontend y backend), a cualquier profundidad. |
| RF-12 | Solo los nodos efectivamente activos (D-5) admiten documentos nuevos y aparecen en los selectores de clasificación y en el portal. |
| RF-13 | `GET /categorias-itsp/arbol` devuelve el árbol completo de forma recursiva; con `estado=ACTIVO` poda en cualquier nivel los nodos no efectivamente activos. |
| RF-14 | Formulario de categoría: selector de padre según D-18, con la ruta completa. |
| RF-15 | Registro y edición de documentos: un selector de categoría con la ruta completa y búsqueda (D-4). Filtro del listado: el mismo tipo de selector, con todos los nodos. |
| RF-16 | La lista de categorías muestra la jerarquía con sangría y el nivel (D-20). |
| RF-17 | El detalle de un documento muestra la ruta completa de su categoría (D-8). |

## 5. Requisitos no funcionales

| Id | Requisito |
|---|---|
| RNF-1 | Contraste de texto de las insignias ≥ 4.5:1 en claro y oscuro; punto de color ≥ 3:1 (12.2). El color nunca es la única señal. |
| RNF-2 | Fuera de las insignias de estado y de los cambios de C, el modo claro no cambia (capturas antes y después). |
| RNF-3 | Sin migración de base de datos y sin cambio en ningún dato ni código existente al desplegar. |
| RNF-4 | Iframe de 900×580 y de 360 px de ancho sin scroll horizontal, también en un nodo de nivel 6. |
| RNF-5 | Todo `.ps1` modificado: analizador de PowerShell 5.1 con 0 errores, BOM UTF-8, CRLF (en esta ronda no se espera tocar ninguno). |
| RNF-6 | Todo en español; tipos e identificadores coherentes con el repositorio. |
| RNF-7 | Sin IP, dominios reales, contraseñas ni rutas privadas en los archivos. |

## 6. Modelo de datos y migración

### 6.1 Estado actual (verificado)

```sql
-- 01-esquema.sql
id_categoria_padre INT UNSIGNED NULL,
codigo VARCHAR(50) NULL,           -- NOT NULL desde la migración 10
nivel TINYINT UNSIGNED NOT NULL DEFAULT 1,
CONSTRAINT uk_categorias_itsp_codigo UNIQUE (codigo),
CONSTRAINT fk_categorias_itsp_padre FOREIGN KEY (id_categoria_padre)
    REFERENCES categorias_itsp(id_categoria_itsp) ON UPDATE CASCADE ON DELETE RESTRICT,
INDEX idx_categorias_itsp_padre (id_categoria_padre),
INDEX idx_categorias_itsp_estado (estado),
INDEX idx_categorias_itsp_orden (orden)
```

No hay `CHECK` sobre `nivel` ni disparadores. `nivel` es `TINYINT UNSIGNED`
(hasta 255).

### 6.2 Conclusión: no hace falta migración

- `id_categoria_padre` ya es autorreferencial y admite cualquier profundidad.
- `nivel` admite 10 sin cambios; lo mantiene el servicio (`nivel` = el del
  padre + 1 al crear; al mover, se recalcula en todo el subárbol).
- El código más largo cabe en `VARCHAR(50)` (D-16).
- La regla de dos niveles solo vive en el código (servicio y frontend), no en
  el esquema.

Por eso esta ronda **no tiene script SQL** ni requiere
`preparar-base-datos.ps1`. El diagnóstico de 15.2 se hace con el diagnóstico
existente (`diagnosticar-codigos-categorias.ps1`), solo como verificación.

## 7. Algoritmos

### 7.1 Códigos (generalización de `codigos-categoria.ts`)

- `siguienteCodigoRaiz` no cambia.
- `siguienteCodigoHija(codigoRaiz, …)` pasa a `siguienteCodigoHija(codigoPadre,
  codigosDeHijas)`: misma regla, con el padre a cualquier nivel. Se renombran
  los parámetros, comentarios y nombres internos de «raíz» a «padre» donde
  corresponde; no cambia el resultado.
- Nueva función pura `recodificarSubarbol(nodoMovido, codigoNuevo,
  descendientes)` → lista de `{ id, codigoAnterior, codigoNuevo }`:
  - un descendiente **regular** (su código es el de su padre de antes + `-MM`)
    conserva el sufijo relativo: `codigoNuevoDelPadre + '-MM'`;
  - un descendiente **irregular** toma `siguienteCodigoHija(codigoNuevoDelPadre,
    hermanos ya recodificados)`;
  - se procesa de arriba abajo, en orden (`orden`, `id`), para que cada padre
    tenga ya su código nuevo.

### 7.2 Profundidad

- `profundidad(nodo)` = `nivel` (1 en la raíz).
- `altura(subárbol)` = niveles por debajo del nodo, incluido él (una hoja = 1).
- Crear bajo un padre: se rechaza si `padre.nivel + 1 > 10`.
- Mover `n` bajo `p`: se rechaza si `p.nivel + altura(n) > 10`.

### 7.3 Mover un nodo (con o sin subárbol)

```
validar: n no es raíz; p existe; p no es n ni un descendiente de n (ciclo);
         p.nivel + altura(n) ≤ 10; si p está en el subárbol excluido y el
         subárbol de n tiene documentos → 400 (D-7); nombre libre entre hermanas
intento 1..3, en transacción:
    codigoNuevo = siguienteCodigoHija(p.codigo, hijos actuales de p, sin n)
    cambios = recodificarSubarbol(n, codigoNuevo, descendientes de n)
    actualizar n (padre, nivel, código) y cada descendiente (nivel, código)
    ER_DUP_ENTRY → reintentar; tras el tercero → 409
bitácora después del commit (D-17)
```

Todo el subárbol se lee de una sola consulta (la tabla completa) y se arma en
memoria. Los cambios de nivel se aplican aunque el código no cambie.

### 7.4 Estado efectivo y exclusión

Funciones puras sobre la lista plana (`Map` por id):

- `ancestros(nodo)`: de la raíz al padre, siguiendo `idCategoriaPadre`, con
  protección contra ciclos (corte en 10 pasos).
- `efectivamenteActivo(nodo)`: el nodo y todos sus ancestros están ACTIVO.
- `enSubarbolExcluido(nodo)`: la raíz de su cadena (o él mismo) tiene el
  código `CODIGO_CATEGORIA_RAIZ_EXCLUIDA`.

Las usan `CategoriasItspService` (árbol filtrado y validaciones),
`DocumentosService.verificarClasificacion`, `PortalPublicoService` (visibilidad
y conteos) y `ReportesService` (raíz real).

## 8. Contrato de la API (cambios)

| Ruta | Cambio |
|---|---|
| `GET /categorias-itsp` | Lista plana en orden de despliegue recursivo (cada nodo seguido de su subárbol). Sin campos nuevos. |
| `GET /categorias-itsp/arbol` | Recursivo a cualquier profundidad (`hijos` ya era recursivo en el tipo). Con `estado=ACTIVO` poda los no efectivamente activos. |
| `GET /categorias-itsp/siguiente-codigo?idCategoriaPadre=N` | Acepta cualquier nodo como padre; 400 si superaría el tope. |
| `POST /categorias-itsp` | `idCategoriaPadre` puede ser cualquier nodo con nivel < 10. |
| `PATCH /categorias-itsp/:id` | `idCategoriaPadre` puede ser cualquier nodo válido (7.3); la respuesta trae el código nuevo. |
| `GET /documentos…` (respuesta) | `nombreCategoriaRaiz` = raíz real; nuevo `rutaCategoria: string[]` (D-8). |
| `GET /reportes/por-categoria` | Agrupa por raíz real (D-9). Mismo contrato. |
| `GET /publico/secciones` y `/publico/secciones/:codigo` | Mismo contrato; los conteos incluyen los descendientes visibles (D-10). |
| `GET /publico/secciones/:codigo/documentos`, `/publico/secciones/:codigo/:sub/documentos` | Sin cambios. |
| **`GET /publico/categorias/:codigo`** | **Nuevo** (D-2). `{ codigo, nombre, descripcion, orden, cantidadDocumentos, documentosPropios, ruta: [{ codigo, nombre }], hijos: [{ codigo, nombre, descripcion, orden, cantidadDocumentos, tieneHijos }] }`. Lista blanca, códigos en minúsculas, mismo throttle y cabeceras que los demás JSON públicos. 404 si no existe o no está efectivamente activo. |
| **`GET /publico/categorias/:codigo/documentos`** | **Nuevo**. Paginado como los actuales; documentos PUBLICADOS clasificados directamente en el nodo. |

## 9. Frontend

### 9.1 Estados con color (A)

- Tokens en `main.css` (`@theme static`) y su variante en el bloque oscuro
  existente (D-13, valores en 12.2).
- `InsigniaEstado.vue` (base), `BadgeEstadoDocumento.vue` (la usa) y
  `BadgeEstadoRegistro.vue` (nuevo).
- Se reemplazan las insignias de `GestionUsuariosView`, `CatalogoSimpleView`,
  `CategoriasItspView` y el resumen de `UsuarioFormularioView` (D-12).
- Forma, tamaño, punto y texto idénticos a los de hoy: cambia solo el color.
- Las demás píldoras neutras (etiquetas, «Solo lectura», «Vigente») no son
  estados y no cambian.

### 9.2 Categorías (C)

- `types/catalogo.types.ts`: tipos recursivos; tipo `CategoriaConRuta` para las
  opciones (`ruta: string[]`, `profundidad`).
- `lib/categorias.ts` (nuevo, funciones puras): aplanar el árbol, calcular la
  ruta, los descendientes, la altura y la exclusión. Espejo de 7.4 para el
  frontend.
- `CategoriaItspFormularioView`: selector de padre según D-18. Al mover, el
  aviso de RF-10: «El código y la URL cambiarán de X a Y. En total cambian N
  direcciones (esta categoría y sus M subcategorías); los enlaces de WordPress
  que apunten a ellas deberán actualizarse.» N sale del árbol que ya está
  cargado, sin endpoint nuevo.
- `CategoriasItspView`: sangría por nivel y nivel (D-20).
- `useCategoriasItsp`: `categoriasRaiz` deja de ser la fuente del selector; se
  expone la lista con ruta.

### 9.3 Selectores de documentos (C)

- `useClasificacionDocumental`: el árbol pasa a recursivo; reemplaza
  `raicesSeleccionables`, `subseccionesDe` y `ubicarCategoria` por
  `opcionesClasificables` (efectivamente activos, fuera del subárbol excluido,
  y raíces solo si no tienen hijos: D-4) y `opcionesFiltro` (todos los nodos).
- `DocumentoRegistroView` y `DocumentoFormularioView`: la cascada de dos
  `<select>` se reemplaza por un `SelectorBusqueda` con búsqueda local
  (etiqueta = ruta «A › B › C», detalle = código). `SelectorBusqueda` ya
  muestra las primeras opciones al enfocarse sin texto, así que también sirve
  como lista. El resumen del asistente muestra la ruta.
- `DocumentosView`: el filtro de categoría pasa al mismo selector, con la
  opción de limpiarlo.

### 9.4 Vistas públicas (B)

- Se elimina `MigasDePanPublicas` de las tres vistas y el componente se borra
  si queda sin uso. Se revisa que no quede margen ni contenedor vacío.
- `PortalSeccionView` y `PortalSubseccionView` pasan a una única
  `PortalNodoView` alimentada por `GET /publico/categorias/:codigo`:
  - píldora de contexto con el padre (o «Transparencia» en una raíz);
  - título;
  - tarjetas de hijos activos (D-3);
  - documentos propios paginados;
  - `VacioPortal` si no hay ninguna de las dos cosas;
  - marcador de Participación ciudadana si `ruta` lo indica (D-11).
- En `/vista/:seccion/:subseccion` se comprueba que el padre de la subsección
  sea la sección (`ruta` termina en la sección); si no, «no disponible», como
  hoy.
- `TarjetaSubseccion` sirve para cualquier hijo y recibe el destino ya
  armado.
- `PortalSeccionesView` no cambia salvo quitar las migas (no tiene).
- No existe un botón «Volver» en el portal (Δ-2): no hay nada que conservar.
  El enlace «Ver todas las secciones» del error 404 se mantiene.

## 10. Manejo de errores

| Caso | Código | `error` (clase) | `mensaje` |
|---|---|---|---|
| Crear o mover más allá del tope | 400 | `CategoriaPadreInvalidaException` | «La jerarquía admite como máximo 10 niveles; esta operación la dejaría en N» |
| Mover bajo sí misma o un descendiente | 400 | `CategoriaPadreInvalidaException` | «Una categoría no puede moverse dentro de sí misma ni de sus subcategorías» |
| Código resultante > 50 | 400 | `CategoriaPadreInvalidaException` | «El código resultante supera los 50 caracteres; elija otra categoría superior» |
| Mover con documentos a Participación ciudadana | 400 | `CategoriaPadreInvalidaException` | «No se puede mover a 'Participación ciudadana' una categoría con documentos: esa sección no los admite» |
| Clasificar con un ancestro inactivo | 400 | `ClasificacionInvalidaException` | «La categoría ITSP seleccionada no está disponible: una categoría superior está inactiva» |
| Raíz ↔ subsección, padre inexistente, nombre repetido, 3 colisiones | Como hoy | | |

## 11. Reglas de negocio

- RN-1. Ningún código existente cambia salvo al mover un nodo, y entonces solo
  los de su subárbol.
- RN-2. Máximo 10 niveles (constante única).
- RN-3. Una raíz no se mueve ni pasa a subsección; una subsección no pasa a
  raíz.
- RN-4. Estado efectivo (D-5); inactivar no escribe estados de descendientes.
- RN-5. Exclusión por cadena de ancestros (C-11).
- RN-6. Una raíz admite documentos solo si no tiene hijos (regla de frontend
  de hoy, D-4); los nodos de nivel ≥ 2 siempre.
- RN-7. Sin borrado físico.

## 12. Seguridad y accesibilidad

### 12.1 Seguridad

- Los endpoints públicos nuevos son de solo lectura, con lista blanca de
  campos, el mismo throttle y las mismas cabeceras que los actuales. `ruta`
  solo expone nombres y códigos de ancestros que ya son públicos.
- La visibilidad de archivos públicos exige el estado efectivo de toda la
  cadena (hoy solo el padre).

### 12.2 Contrastes de las insignias (WCAG 2.1, fórmula de luminancia relativa)

Paleta (contenedor / texto / borde / punto):

| Tono | Claro | Oscuro |
|---|---|---|
| Éxito (verde) | `#e3f2e7` / `#1b5e30` / `#9fcfae` / `#2e7d43` | `#14301f` / `#8fdaa5` / `#2f6143` / `#62c27f` |
| Advertencia (amarillo) | `#fff3d1` / `#6b4a00` / `#e8c770` / `#a86f00` | `#3a2d0c` / `#f3cf6e` / `#6e5620` / `#e0b345` |
| Peligro (rojo) | `#fde7e5` / `#9b1c16` / `#f1b2ac` / `#c62828` | `#3e1614` / `#ffb4ab` / `#73302a` / `#f28b82` |

| Par | Claro | Oscuro | Mínimo |
|---|---|---|---|
| Texto éxito / su contenedor | 6.74 | 8.65 | 4.5 ✓ |
| Texto advertencia / su contenedor | 7.29 | 8.95 | 4.5 ✓ |
| Texto peligro / su contenedor | 6.90 | 9.30 | 4.5 ✓ |
| Texto éxito / tarjeta (`#ffffff` / `#1d2327`) | 7.81 | 9.64 | 4.5 ✓ |
| Texto advertencia / tarjeta | 8.06 | 10.56 | 4.5 ✓ |
| Texto peligro / tarjeta | 8.17 | 9.36 | 4.5 ✓ |
| Punto éxito / su contenedor | 4.39 | 6.48 | 3 ✓ |
| Punto advertencia / su contenedor | 3.85 | 6.86 | 3 ✓ |
| Punto peligro / su contenedor | 4.75 | 6.61 | 3 ✓ |

El borde de la insignia es decorativo (la insignia se identifica por su texto),
igual que hoy.

### 12.3 Accesibilidad

- El texto del estado se mantiene: el color no es la única señal (1.4.1).
- Sin migas, la ubicación se comunica con la píldora de contexto y el `<h1>`, y
  con `document.title` («Nodo — Transparencia — Municipalidad de Palmares»).
- `SelectorBusqueda` ya es un combobox accesible (teclado, `aria-selected`);
  la ruta va en el texto de la opción, no solo en la sangría.

## 13. Rendimiento

- El árbol se arma desde una consulta plana (decenas de filas). Sin consultas
  recursivas por nivel ni CTE recursivas.
- Mover un subárbol: una lectura y una actualización por nodo del subárbol,
  dentro de una transacción.
- Conteos públicos: la consulta agrupada actual y una suma en memoria por
  subárbol.

## 14. Pruebas

### 14.1 Backend (Jest)

- `codigos-categoria.spec.ts`: `siguienteCodigoHija` a cualquier profundidad;
  `recodificarSubarbol` con descendientes regulares, irregulares y huecos.
- Nuevo `jerarquia-categorias.spec.ts` (funciones de 7.4): ancestros, altura,
  estado efectivo, exclusión, ciclo defensivo.
- `categorias-itsp.service.spec.ts`:
  - crear en niveles 3 a 10 y rechazo en el 11;
  - **invertir** «rechaza colgar de una subsección» (ahora se permite) y «crear
    tercer nivel» (ahora válido);
  - mover un subárbol (códigos y niveles de todos los descendientes, bitácora);
  - mover bajo sí misma o un descendiente (400);
  - tope con la altura del subárbol;
  - colisión con reintento y 409;
  - mover con documentos a Participación ciudadana (400);
  - árbol recursivo y poda por estado efectivo.
- `documentos.service.spec.ts`: exclusión de un nieto de `ITSP-03`; rechazo con
  ancestro inactivo; `rutaCategoria` y raíz real.
- `portal-publico.service.spec.ts`: endpoint por código (raíz, nivel 4,
  mayúsculas, inactivo por ancestro, inexistente); conteos de subárbol;
  visibilidad de archivo con ancestro inactivo; corrección de sus 2 errores de
  tipos previos (D-21).
- `reportes.service.spec.ts`: agrupación por raíz real.
- Todas las suites en verde (253 de partida).

### 14.2 Frontend

- `vue-tsc` y build sin errores.
- Capturas en claro antes y después del paso A de las pantallas con insignias:
  usuarios, catálogos (tipos, dependencias, etiquetas), categorías, documentos,
  detalle de documento, inicio y formulario de usuario. Solo deben cambiar los
  colores de las insignias. Las mismas en oscuro.
- Navegador sobre una copia temporal de la base:
  - crear niveles hasta el tope (el 11 se rechaza);
  - mover un subárbol (aviso con el total de URL, códigos nuevos);
  - clasificar y publicar un documento en un nodo de nivel 6;
  - verlo en el iframe a 900×580 y a 360 px sin scroll horizontal;
  - las URL existentes (`/vista/itsp-01`, `/vista/itsp-01/itsp-01-01`) igual que
    antes y sin migas;
  - en claro y oscuro, sin errores de consola.

### 14.3 Datos

Sobre una copia temporal que simula la VM (01–10 aplicados, `ITSP-01` a
`ITSP-05` con subsecciones y documentos) más un árbol de 6 niveles: volcado de
`categorias_itsp` y `documentos` antes y después de desplegar el código nuevo,
sin operar → idénticos (nada se migra ni se reescribe al arrancar).

## 15. Despliegue sobre datos reales

### 15.1 Sin migración

El backend nuevo funciona sobre el esquema actual. No se ejecuta
`preparar-base-datos.ps1`.

### 15.2 `DESPLIEGUE.md` §6.2 «Actualización 2»

1. Respaldo previo con `respaldar.ps1`.
2. `git status` limpio; `git rev-parse HEAD` (anotar); `git pull`.
3. (Verificación, solo lectura) `diagnosticar-codigos-categorias.ps1`: debe
   dar CONTINUAR con el `10` ya aplicado. Si hiciera falta `mysql.exe` en el
   PATH, agregar la carpeta `bin` de MySQL **solo en esa consola**.
4. `desplegar.ps1` con los parámetros de siempre.
5. `verificar-despliegue.ps1 -UrlPublica …`.
6. Verificación manual:
   - crear una subcategoría de nivel 3 en una rama de prueba **solo si el PO lo
     autoriza** (no hay borrado físico); si no, comprobar el formulario sin
     guardar;
   - abrir los iframes de una sección y de una subsección: deben verse sin
     migas y con las tarjetas de siempre;
   - comprobar los colores de los estados en usuarios, catálogos y documentos,
     en claro y oscuro.
7. Reversión: `revertir.ps1`; `git checkout` del commit anotado y luego `git
   checkout main`. No hay base que restaurar (no hubo migración).
   Advertencia: si con el código nuevo se crearon categorías de nivel 3 o más,
   el código anterior las mostrará en la lista pero no sabrá ubicarlas en sus
   selectores de dos niveles. No se pierde nada; se recupera al volver a
   desplegar.

## 16. Plan de trabajo, riesgos, criterios de aceptación y preguntas abiertas

### 16.1 Orden de implementación (Fase 2)

| # | Paso | Notas |
|---|---|---|
| 1 | A — Estados con color | Capturas en claro **antes**; tokens, componentes, reemplazos; capturas después. |
| 2 | Backend de C | Funciones puras, servicio, árbol recursivo, mover subárbol, documentos, reportes, endpoints públicos por código, pruebas. |
| — | **Punto de control** | Archivos, pruebas (resultado), migración (no se espera) y `git log --oneline origin/main..main`. Esperar confirmación. |
| 3 | Frontend de C | Formulario, selectores, lista de categorías, detalle. |
| 4 | B — Vistas públicas | Sin migas, `PortalNodoView`, ruta genérica, N niveles. |
| 5 | Documentación | `INTEGRACION-WORDPRESS.md`, `DESPLIEGUE.md` §6.2, `DESIGN.md`, Anexo B de la spec. |
| 6 | Verificación final | 14.1 a 14.3, limpieza. |

### 16.2 Riesgos

| Id | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-1 | Mover un subárbol rompe enlaces de WordPress hacia sus nodos. | Media | Medio | Aviso con el total de URL (RF-10), bitácora con los códigos anteriores y nuevos (D-17; hasta 100 pares y el total exacto, D-26) e instructivo de WordPress. |
| R-2 | Colisión al recodificar un subárbol con un código irregular existente. | Baja | Bajo | Índice único, transacción, reintento y 409; nada queda a medias. |
| R-3 | Un ciclo en `id_categoria_padre` introducido a mano cuelga el armado del árbol. | Muy baja | Alto | Recorridos con corte en 10 pasos; el servicio impide crear ciclos. |
| R-4 | Código > 50 con una raíz irregular larga. | Muy baja | Bajo | Validación previa con 400 (D-16). |
| R-5 | Cambios visuales fuera de las insignias. | Baja | Bajo | Capturas antes y después (RNF-2). |
| R-6 | El reporte por categoría cambia sus números. | Baja | Bajo | Solo si ya hubiera documentos en nivel 3, que hoy no existen. |
| R-7 | Reversión con nodos de nivel ≥ 3 creados. | Baja | Bajo | Anotado en 15.2; sin pérdida de datos. |
| R-8 | Un iframe de un nodo profundo desborda a 360 px. | Baja | Bajo | Prueba en un nodo de nivel 6 (RNF-4). |
| R-9 | Colores no distinguibles para personas con daltonismo. | Media | Bajo | Texto siempre presente; rojo y verde con luminancias distintas. |

### 16.3 Criterios de aceptación

- CA-1. Activo verde, Inactivo rojo en todas las insignias Activo/Inactivo del
  sistema autenticado.
- CA-2. Documento: Publicado verde, Borrador amarillo, Inactivo rojo.
- CA-3. Contrastes de 12.2 cumplidos en claro y oscuro; el texto se conserva.
- CA-4. En claro, la única diferencia en las pantallas capturadas es el color
  de las insignias.
- CA-5. Las vistas públicas no tienen migas ni espacio vacío en su lugar; el
  resto no cambia.
- CA-6. `/vista/itsp-01`, `/vista/itsp-01/itsp-01-01` y los cuatro snippets
  funcionan igual que antes.
- CA-7. `/vista/CODIGO` abre un nodo de cualquier nivel, sin distinguir
  mayúsculas; un nodo inactivo (propio o por ancestro) o inexistente da «no
  disponible»; uno de Participación ciudadana muestra el marcador.
- CA-8. Se crean categorías hasta el nivel 10; el 11 da 400 con un mensaje
  claro.
- CA-9. Mover un subárbol recalcula sus códigos y niveles según C-8, con aviso
  de N URL y la bitácora completa; mover bajo sí misma o un descendiente da
  400.
- CA-10. Ningún nodo del subárbol de Participación ciudadana admite
  documentos, por frontend ni por API.
- CA-11. Ningún código, URL ni dato existente cambia al desplegar (14.3).
- CA-12. Un documento clasificado en un nodo de nivel 6 se publica y se ve en
  el iframe a 900×580 y a 360 px, sin scroll horizontal, en claro y oscuro.
- CA-13. Pruebas del backend en verde (253 + nuevas), `vue-tsc` y build sin
  errores, eslint acotado sin problemas nuevos, sin errores de consola.
- CA-14. Bases temporales, usuarios de prueba y procesos propios eliminados;
  `backend/storage` y la base de desarrollo en su estado base; nada subido.

### 16.4 Preguntas abiertas

| Id | Pregunta | Default |
|---|---|---|
| P-1 | Regla de inactivar con descendientes (resumen 1, D-5). | Estado efectivo sin escribir descendientes. |
| P-2 | ¿El filtro por categoría incluye subcategorías? (resumen 2). | No (igualdad exacta). |
| P-3 | ¿Se rechaza mover con documentos a Participación ciudadana? (resumen 3). | Sí. |
| P-4 | ¿La lista de categorías debe indicar cuándo una activa no se ve por tener una superior inactiva? | No en esta ronda; se ve su estado propio. |

---

## Anexo A — Resultado del reconocimiento

Revisión de solo lectura de `main` en `7fd4169` (igual a `origin/main`),
árbol limpio salvo los PNG sin seguimiento. Etiqueta local `antes-niveles`
creada en ese commit.

### A.1 Jerarquía de categorías hoy

- **Entidad:** `CategoriaItsp` con `idCategoriaPadre`, `nivel`, relación
  `categoriaPadre`/`subcategorias`. `codigo: string` (NOT NULL desde la 10).
- **Servicio** (`categorias-itsp.service.ts`):
  - `crear` deriva `nivel` 1/2 y `resolverPadre` exige que el padre sea raíz;
  - `actualizar` impide raíz ↔ subsección y solo mueve una subsección entre
    raíces;
  - `listar` y `obtenerArbol` ordenan y arman dos niveles (`ordenarJerarquicamente`,
    `mapearNodo` con `hijos` de un nivel);
  - `cambiarEstado` cambia solo el nodo (las subsecciones conservan su estado).
- **Códigos** (`codigos-categoria.ts`): `siguienteCodigoRaiz` y
  `siguienteCodigoHija(codigoRaiz, …)`; el nombre «raíz» del segundo debe pasar
  a «padre».
- **DTO:** `CategoriaItspNodoArbolDto.hijos` ya es recursivo en el tipo, pero
  solo se llena un nivel.
- **Endpoint** `GET /categorias-itsp/arbol`: un nivel de hijos; con
  `estado=ACTIVO` poda raíces y subsecciones inactivas.
- **Participación ciudadana** (`ITSP-03`):
  - `DocumentosService.verificarClasificacion` mira el código propio o el del
    padre directo;
  - `ReportesService` excluye la raíz;
  - en el frontend, `raicesSeleccionables` la filtra.
- **Documentos:** `verificarClasificacion` exige que la categoría exista, esté
  activa y no esté excluida; **no** mira el estado del padre ni exige que sea
  hoja.
- **Frontend:**
  - el registro y la edición usan dos `<select>` en cascada (raíz → subsección);
    `idCategoriaEfectiva` cae a la raíz solo si no tiene subsecciones;
  - el filtro del listado es un `<select>` plano con sangría de dos niveles;
  - la lista de categorías indenta por `nivel === 2`;
  - el formulario ofrece solo raíces como padre.
- **Reportes:** agrupan por `idCategoriaPadre ?? id` (un nivel).

### A.2 Vistas públicas hoy

- **Rutas:** `/vista` (secciones), `/vista/:seccion` (sección: tarjetas de
  subsecciones y documentos propios si los hay) y `/vista/:seccion/:subseccion`
  (documentos paginados). Comodín: lo que empieza por `/vista` vuelve a la
  portada.
- **Endpoints:** `secciones`, `secciones/:codigo`, `secciones/:codigo/documentos`,
  `secciones/:codigo/:sub/documentos` y los de archivo.
- **Migas:** `MigasDePanPublicas` en `PortalSeccionView` y
  `PortalSubseccionView`; `PortalSeccionesView` no las tiene.
- **Contexto:** `PildoraContexto` («Municipalidad de Palmares» /
  «Transparencia» / nombre de la sección) y el `<h1>`.
- **Botón «Volver»:** **no existe.** El único retorno son las migas; en el
  error 404, `ErrorPortal` ofrece «Ver todas las secciones».
- **Visibilidad:** `categoriaVisible` mira el nodo y su padre directo.
- **Conteos:** sección = propios + subsecciones; subsección = propios.

### A.3 Estados

- `BadgeEstadoDocumento` (listado, detalle, inicio): PUBLICADO en
  `secondary-container`, BORRADOR e INACTIVO iguales, en neutro.
- Activo/Inactivo copiado en `GestionUsuariosView`, `CatalogoSimpleView` y
  `CategoriasItspView` (mismas clases), y como texto en el resumen de
  `UsuarioFormularioView`.
- Los roles no tienen estado.
- Otras píldoras neutras (etiquetas, «Solo lectura», «Vigente», chips de
  `SelectorMultiple`) no son estados.

### A.4 Base de datos

Ver 6.1: `codigo VARCHAR(50)`, FK autorreferencial (`ON UPDATE CASCADE ON
DELETE RESTRICT`), índices de padre, estado y orden, `uk_categorias_itsp_codigo`.
Sin `CHECK` ni disparadores. Sin migración.

### A.5 Documentación

- `DESPLIEGUE.md` tiene §6 («Actualizaciones posteriores», ya con
  `-SoloScripts`) y §6.1 («Actualización sobre datos reales», la de la
  migración 10). La «Actualización 2» va como §6.2.
- `INTEGRACION-WORDPRESS.md` describe las cuatro páginas con sus snippets y,
  en la nota técnica, que mover una subsección cambia su URL. No explica cómo
  armar la URL de cualquier nodo.

### A.6 Discrepancias entre el encargo y el repositorio

| Id | El encargo dice | El repositorio tiene | Propuesta / default |
|---|---|---|---|
| Δ-1 | Añadir la ruta `/vista/:codigo` | `/vista/:seccion` ya tiene esa forma | Generalizar la existente (D-1). |
| Δ-2 | «Botón de volver si existe» | No existe | Nada que conservar; se mantiene «Ver todas las secciones» del 404. |
| Δ-3 | «Se mantiene la regla actual para las raíces» | La regla (una raíz con hijos no se elige) vive solo en el frontend | Se mantiene así (D-4). |
| Δ-4 | Clasificación en nodos activos | El backend no mira el estado del padre | Exigir estado efectivo (D-6). |
| Δ-5 | Exclusión por cadena de ancestros | Hoy mira el código propio y el del padre directo | Cadena completa (C-11, 7.4). |
| Δ-6 | — | Los reportes agrupan por el padre directo | Raíz real (D-9). |
| Δ-7 | — | `nombreCategoriaRaiz` es el nombre del padre directo | Raíz real + `rutaCategoria` (D-8). |
| Δ-8 | — | El portal mira solo el padre directo y cuenta un nivel | Cadena completa y subárbol (D-10, 12.1). |
| Δ-9 | «Todos los indicadores Activo/Inactivo… roles y demás» | Los roles no tienen estado; el resumen del formulario de usuario lo muestra como texto | Insignia también en el resumen (D-12); en roles no hay nada que colorear. |
| Δ-10 | Estados en verde, amarillo y rojo | `DESIGN.md` pinta los estados en neutros y reserva el rojo a errores | Nota de excepción (D-14). |
| Δ-11 | — | Hoy se puede mover una subsección con documentos a `ITSP-03` | Rechazar (D-7). |
| Δ-12 | — | Comentario de `PortalPublicoService` menciona la colación `utf8mb4_0900_ai_ci`; la VM usa `utf8mb4_unicode_ci` (ambas insensibles a mayúsculas) | Se corrige el comentario al tocar el archivo. |
| Δ-13 | — | `portal-publico.service.spec.ts` tiene 2 errores de tipos previos | Se corrigen al modificarlo (D-21). |

### A.7 Archivo con credenciales (no se toca)

`base-datos/scripts/README.md`, líneas 36 (correo) y 37 (contraseña) del usuario
semilla de desarrollo.

## Anexo B — Ajustes y decisiones de la Fase 2

Decisiones tomadas durante la implementación. Continúan la numeración de §3;
las que vienen de un pedido de Gerald lo citan. Se completa al cerrar cada
paso.

| Id | Tema | Decisión | Motivo |
|---|---|---|---|
| D-23 | Filas inactivas atenuadas (`opacity-60`) en usuarios, catálogos, categorías y documentos. | La atenuación se aplica a todas las celdas de la fila salvo la del estado (`.celda-estado`); el resto de la fila se ve igual que antes. | Con la fila entera atenuada, «Inactivo» bajaba a 3.07:1 en claro y 4.33:1 en oscuro, por debajo de 4.5:1. Aprobada en el punto de control del paso 2. |
| D-24 | Resumen del formulario de usuario. | Crece 4 px de alto porque la insignia es más alta que el texto que reemplaza. | Efecto de D-12; aprobado en el punto de control del paso 2. |
| D-25 | Estado efectivo en la vista de categorías (ajuste 1). | Un nodo activo con una superior inactiva se muestra con la insignia «Inactivo», el texto auxiliar «por una categoría superior» y la fila atenuada como las inactivas. Su estado propio no cambia: el botón sigue ofreciendo «Inactivar» y el filtro por estado sigue usando el estado propio, como la API. Al reactivar la superior se ve activo otra vez, sin recargar. El modal de inactivar avisa cuántas subcategorías se verán inactivas. Para calcularlo con la tabla filtrada, la vista carga además el catálogo completo (una consulta más, solo si hay filtros). | Pedido de Gerald; coherente con D-5 (sin escrituras en cascada). |
| D-26 | Tamaño de `detalles` en la bitácora al mover un subárbol (ajuste 2). | La columna es `JSON` (01-esquema.sql), cuyo límite es `max_allowed_packet` (64 MB por defecto en MySQL 8): no se desborda en la práctica. Aun así, `cambiosDescendientes` se recorta a 100 pares (`MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA`); lo que pasa del tope queda como `cambiosDescendientesOmitidos` y `cantidadUrlCambiadas` conserva el total exacto. Prueba con un subárbol de 123 descendientes. Commit aparte. | Una fila con miles de pares es pesada de leer y de mostrar, y el límite depende de la configuración del servidor. |
| D-27 | Selectores de categoría del registro y la edición de documentos (ajuste 4). | Las categorías que no admiten documentos se ven en la lista deshabilitadas, con «No disponible:» y el motivo, y no se pueden elegir: Participación ciudadana y su subárbol, las que tienen una superior inactiva y las raíces con subcategorías (D-4). Las inactivas por sí mismas siguen sin ofrecerse, como cualquier catálogo inactivo. Si un documento ya está en una categoría que dejó de admitirlos, su ruta se ve igual y el error dice el motivo. | Pedido de Gerald: que no se oculten. |
| D-28 | Selector de categoría padre (precisa D-18). | Vacío equivale a «Ninguna (raíz)», y lo dice el texto del campo. Al editar una subcategoría, dejarlo vacío da el error «Una subcategoría no puede pasar a ser raíz». La propia categoría, sus descendientes y los destinos que superarían el tope (contando la altura del subárbol) se ven deshabilitados con el motivo en vez de omitirse, igual que en D-27. | El selector con búsqueda no tiene una opción «Ninguna» propia; mostrar el motivo explica la regla. |
| D-29 | `SelectorBusqueda`. | Admite opciones `deshabilitada` con `motivo` e `idEntrada` (para el `<label for>`), y la etiqueta de cada opción ya no se trunca: una ruta larga se lee entera. Lo demás no cambia. | Necesario para D-27 y D-28. |
| D-30 | Regla raíz ↔ subsección (ajuste 3). | Sigue cubierta: «rechaza convertir una subsección en raíz», «rechaza convertir una raíz sin hijas en subsección» y la prueba que impedía colgar una raíz con hijas, cuyo título hablaba de un «tercer nivel»; ahora nombra la regla y comprueba el mensaje exacto. | Con N niveles el motivo ya no es la profundidad. |
| D-31 | Verificación del frontend. | El frontend no tiene linter configurado (ni eslint ni script de lint): se verifica con `vue-tsc`, el build y las pruebas en el navegador. | No añadir dependencias sin justificarlas. |
| D-32 | `/vista/:seccion/:subseccion` con una subsección que no es hija directa de esa sección. | Se ve el aviso «Esta sección no está disponible» con «Ver todas las secciones», igual que cualquier página inexistente. Antes aparecía además una cabecera de relleno («Documentos», con la píldora de la sección) sobre el mismo aviso; ya no. | La página genérica primero resuelve el nodo; no hay datos con que armar una cabecera que no corresponde. |
| D-33 | Presentación de `PortalNodoView` según el nodo. | Una raíz, o un nodo con hijas, se ve como la antigua página de sección: tarjetas y, si tiene documentos propios, «Documentos de esta sección» debajo. Un nodo sin hijas se ve como la antigua página de subsección: su lista paginada o «Sin documentos publicados». Participación ciudadana y todo su subárbol muestran el marcador con el nombre de la sección como título, como hacía su subsección. El título de la pestaña es el nombre del nodo, como antes. | Que las páginas de hoy se vean igual que antes salvo las migas (C-4). |
| D-34 | Carga de una página del portal. | Mientras llega el nodo se ve el esqueleto: de tarjetas en `/vista/:seccion` y de filas en la URL de dos segmentos. Antes la subsección mostraba su cabecera al instante, tomada del árbol en caché; ahora la cabecera llega con el nodo, en la misma petición. | El nodo trae nombre, ruta e hijas en una sola respuesta; no hace falta el árbol. |
| D-35 | Servicio y composable del portal. | El frontend deja de llamar a `/publico/secciones/:codigo` y a sus dos listados de documentos, que quedaron sin uso, y se quitan sus funciones del servicio y del composable. Los endpoints siguen en el backend con el mismo contrato (D-2); se actualizó el comentario de `listarDocumentosDeSeccion`, que citaba la regla vieja del formulario. `TarjetaSubseccion` recibe el destino ya armado. | No dejar código muerto en el frontend sin romper la API. |
| D-36 | Botón «Volver» del portal (Δ-2). | Verificado al quitar las migas: no existe. El único camino de vuelta eran las migas; ahora son las flechas del navegador y el menú «Transparencia» de WordPress, y así lo dice `INTEGRACION-WORDPRESS.md`. Se conserva «Ver todas las secciones» del aviso de no disponible. | Pedido del encargo: quitar solo las migas. |
| D-37 | `INTEGRACION-WORDPRESS.md`, paso 4. | Decía que el recuadro se ve «claro»; desde la ronda anterior el portal es oscuro. Se corrige al tocar ese paso. | Documentación desactualizada. |
