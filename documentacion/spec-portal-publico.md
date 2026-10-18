# Especificación — Portal Público de Transparencia

**Sistema Integral de Gestión Documental — Municipalidad de Palmares**
Documento para validación con el Product Owner. Versión 1 — 18 de octubre de 2026.

> **Estado: propuesta, pendiente de aprobación.** Este documento no describe
> nada construido todavía. Se escribe antes del código para que lo que se
> implemente sea lo acordado y no lo supuesto. Mientras no esté aprobado, no
> se escribe código, migraciones ni scripts.

---

## Índice

| | Sección |
|---|---|
| 1 | Contexto y objetivo |
| 2 | Alcance, fuera de alcance y supuestos |
| 3 | Decisiones confirmadas |
| 4 | Requisitos funcionales |
| 5 | Requisitos no funcionales |
| 6 | Modelo de datos |
| 7 | Sesión y acceso anónimo |
| 8 | Contrato de la API pública |
| 9 | Frontend |
| 10 | Manejo de errores |
| 11 | Reglas de negocio |
| 12 | Seguridad |
| 13 | Rendimiento |
| 14 | Pruebas |
| 15 | Despliegue, infraestructura e integración con WordPress |
| 16 | Plan de trabajo, riesgos, criterios de aceptación y preguntas abiertas |

> **Sobre esta numeración.** El `spec.md` de las fases anteriores no está en el
> repositorio: sólo quedan referencias a él en el código
> (`main.ts` → Sección 7, `excepcion-global.filter.ts` → Sección 10,
> `tokenStore.ts` y `autenticacion.module.ts` → Sección 12,
> `jwt.strategy.ts` → Sección 13). La estructura de arriba respeta esas cuatro
> anclas y reconstruye el resto; **no se afirma que sea idéntica al original**.
> Si el documento aparece, hay que alinear los títulos intermedios con él.

---

## 1. Contexto y objetivo

Muni Data está en producción en la VM de la Municipalidad de Palmares. Hoy todo
su contenido exige sesión iniciada: el `JwtAuthGuard` global protege cada ruta
salvo las de autenticación y `/salud`.

El portal ciudadano de la municipalidad es un WordPress que comparte host y
certificado con Muni Data. Su portada tiene un menú donde debe entrar un ítem
**Transparencia** con las cuatro secciones del índice ITSP, y cada una debe
mostrar a cualquier persona —sin cuenta, sin clave— los documentos que la
municipalidad ya publicó.

**Objetivo.** Abrir una vista pública de solo lectura dentro de Muni Data,
embebida por iframe en WordPress, que permita a la ciudadanía navegar el árbol
ITSP y ver y descargar los documentos publicados.

**Lo que esto significa técnicamente:** es la **primera superficie pública** del
sistema. Hasta hoy, equivocarse en un filtro de visibilidad exponía un documento
a una persona autenticada de la propia municipalidad. A partir de esta entrega,
el mismo error lo expone a Internet. La Sección 12 es, por eso, la parte más
importante de este documento.

---

## 2. Alcance, fuera de alcance y supuestos

### 2.1 Dentro del alcance

1. Un módulo público en el backend con su propia ruta base, sus propios DTO y su
   propia limitación de tasa.
2. Tres rutas públicas en el frontend (`/vista`, `/vista/:seccion`,
   `/vista/:seccion/:subseccion`) con layout propio, sin la cáscara de la
   aplicación autenticada.
3. Visualización y descarga del PDF de la versión vigente de cada documento
   publicado.
4. Los archivos de integración con WordPress (snippets de iframe y página de
   prueba) y el instructivo para quien administre WordPress.
5. Las comprobaciones correspondientes en `verificar-despliegue.ps1`.

### 2.2 Fuera del alcance (primera entrega)

| | Por qué |
|---|---|
| Buscador y filtros públicos | Decisión del PO. El listado es corto por subsección. |
| Registro de visitas públicas en bitácora | Decisión del PO. Ver 12.6. |
| Visor de PDF embebido | Decisión del PO: "Ver" abre pestaña nueva. |
| Ajuste automático de altura del iframe (`postMessage`) | Mejora opcional. Altura fija con scroll interno. |
| Editor de contenido para "Participación ciudadana" | Ese contenido lo pone el PO desde WordPress. Ver 11.4. |
| Acoplamiento con el Observatorio de Datos | Explícitamente excluido. Si sus formularios entran en Participación ciudadana, entran desde WordPress. |
| HTTP (puerto 80) para la API | El sistema funciona solo por HTTPS. |
| Indexación por buscadores de los PDF públicos | Nadie lo ha pedido. Se menciona en 16.6 como pregunta abierta. |
| Cambios en el esquema de la base de datos | No hacen falta: ver Sección 6. |

### 2.3 Supuestos

| # | Supuesto | Si resulta falso |
|---|---|---|
| S-1 | WordPress y Muni Data se sirven desde el **mismo origen** (mismo esquema, host y puerto). | El `X-Frame-Options: SAMEORIGIN` del `.htaccess` bloquearía el iframe. Habría que cambiarlo por `frame-ancestors` con el origen exacto. Ver 15.2. |
| S-2 | `CONFIAR_EN_PROXY=true` en el entorno de producción. | La limitación de tasa por IP vería a todo el mundo como `127.0.0.1` y un solo visitante podría dejar el portal fuera de servicio para los demás. Ver 12.5. |
| S-3 | Los PDF ya publicados no contienen datos personales que no deban ser públicos. | Ver 12.7: la responsabilidad es de quien publica, pero el riesgo se materializa en esta entrega. |
| S-4 | Alguien con permisos de administración en WordPress creará las páginas y el menú. | Ver 16.3, riesgo R-1, con su alternativa. |
| S-5 | Los nombres de las secciones y subsecciones son los que ya están en la base. | Confirmado contra la base: ver 6.2. |

---

## 3. Decisiones confirmadas

Tomadas por el supervisor, el PO y el estudiante antes de redactar este
documento. Se listan para que la implementación no las reabra.

| # | Decisión |
|---|---|
| D-1 | El menú "Transparencia" de WordPress lleva un ítem manual por cada una de las 4 raíces ITSP. Cada ítem abre una página de WordPress con un iframe hacia Muni Data. |
| D-2 | Dentro del iframe, las subsecciones salen del árbol ITSP de la base y se muestran como recuadros seleccionables. Al elegir una, se listan sus documentos. |
| D-3 | Ruta pública: `/munipalmares/wp-munidata/vista`, con subrutas por sección y subsección. |
| D-4 | Solo documentos en estado `PUBLICADO`, y de cada uno la **versión vigente**. |
| D-5 | Datos por documento: título, tipo, dependencia, fecha de publicación, número de páginas y etiquetas. |
| D-6 | Sin buscador ni filtros. Sin bitácora de visitas públicas. Solo HTTPS. |
| D-7 | Aspecto **claro**, alineado a `documentacion/design/DESIGN.md`. |
| D-8 | "Ver" abre el PDF en pestaña nueva; "Descargar" lo descarga. Sin visor embebido. |
| D-9 | Altura del iframe **fija**, con scroll interno, igual que el iframe del Observatorio de Datos. |
| D-10 | Subsecciones sin documentos: mensaje "Sin documentos publicados". Listado ordenado por fecha de publicación descendente, con el tipo como etiqueta. |
| D-11 | "Participación ciudadana" aparece como sección y queda lista para recibir contenido, pero sigue excluida de la clasificación documental y no tendrá documentos. |
| D-12 | Los nombres de secciones y subsecciones los manda la base de datos, no las capturas de referencia. |
| D-13 | El alcance debe caber en las ~3 semanas que quedan de la PPS, integración con WordPress incluida. |

---

## 4. Requisitos funcionales

Numerados `RFP` (Requisito Funcional Público) para no colisionar con los `RF-xx`
de las fases anteriores.

| # | Requisito |
|---|---|
| RFP-01 | Cualquier persona, sin sesión, puede abrir la vista pública y ver las 4 secciones ITSP activas, en el orden que define la columna `orden`. |
| RFP-02 | Al abrir una sección se muestran sus subsecciones activas como recuadros seleccionables, en el orden de `orden`. |
| RFP-03 | Cada recuadro de subsección muestra su nombre, su descripción (si la tiene) y la cantidad de documentos publicados que contiene. |
| RFP-04 | Al abrir una subsección se lista sus documentos publicados, ordenados por fecha de publicación descendente. |
| RFP-05 | Cada documento del listado muestra: título, tipo de documento (como etiqueta), dependencia, fecha de publicación, número de páginas y sus etiquetas. |
| RFP-06 | Cada documento ofrece dos acciones: **Ver** (abre el PDF en una pestaña nueva) y **Descargar**. |
| RFP-07 | Una subsección sin documentos publicados muestra el mensaje "Sin documentos publicados" y no una lista vacía ni un error. |
| RFP-08 | La sección "Participación ciudadana" se muestra como las demás y presenta el marcador "Contenido próximamente". |
| RFP-09 | Hay una ruta raíz `/vista` que muestra las 4 secciones; la usan la página de prueba y cualquier enlace que no apunte a una sección concreta. |
| RFP-10 | Existe navegación de retorno dentro del iframe (de subsección a sección, y de sección a la raíz) mediante migas de pan. |
| RFP-11 | Los tres niveles son direccionables: una URL de subsección abierta directamente, o recargada con F5, muestra esa subsección. |
| RFP-12 | El visitante anónimo nunca es redirigido al inicio de sesión ni al panel interno. |

---

## 5. Requisitos no funcionales

| # | Requisito | Cómo se mide |
|---|---|---|
| RNFP-01 | La vista pública no consume ni emite credenciales de sesión. | En las herramientas del navegador, ninguna petición de `/vista` lleva cookie ni cabecera `Authorization`, y no hay ningún `POST /auth/refresh`. |
| RNFP-02 | El listado de una subsección responde en menos de 1 s con hasta 200 documentos. | Medición en la VM con los datos reales. |
| RNFP-03 | La vista es usable en móvil (ancho de 360 px) dentro del iframe, sin scroll horizontal. | Prueba manual en iPhone y Android. |
| RNFP-04 | Accesibilidad WCAG 2.1 nivel AA en las tres vistas. | Lista de verificación de 14.3. |
| RNFP-05 | Todo lo que deba sobrevivir a un redespliegue sale del build. | `desplegar.ps1` hace reemplazo limpio: ver 15.4. |
| RNFP-06 | La limitación de tasa pública no afecta al uso interno autenticado. | Son decoradores distintos sobre controladores distintos. |
| RNFP-07 | Textos, nombres de clases, métodos, variables y comentarios en español. | Revisión de código. |

---

## 6. Modelo de datos

### 6.1 No hay cambios de esquema

Esta entrega **no crea ni altera tablas, columnas ni índices**. Todo lo que
necesita ya existe:

| Dato de D-5 | Origen |
|---|---|
| Título | `documentos.titulo` |
| Tipo | `tipos_documentos.nombre` vía `documentos.id_tipo_documento` |
| Dependencia | `dependencias.nombre` vía `documentos.id_dependencia` (admite `NULL`) |
| Fecha de publicación | `documentos.fecha_publicacion` |
| Número de páginas | `versiones_documentos.numero_paginas` de la versión vigente (admite `NULL`) |
| Etiquetas | `etiquetas.nombre` vía `documentos_etiquetas` |
| Secciones y subsecciones | `categorias_itsp` (autorreferencia por `id_categoria_padre`) |

Los índices que hacen falta están puestos desde el esquema inicial:
`idx_documentos_estado`, `idx_documentos_fecha_publicacion`,
`idx_documentos_categoria_itsp`, `idx_categorias_itsp_padre`,
`idx_categorias_itsp_estado` e `idx_categorias_itsp_orden`.

### 6.2 El árbol ITSP tal como está hoy en la base

Consultado contra la base de desarrollo el 18 de octubre de 2026. Son 4 raíces y
13 subsecciones, todas `ACTIVO`:

| Código | Nombre | Subsecciones |
|---|---|---|
| ITSP-01 | Información institucional | Información institucional básica · Organización y funciones · Herramientas para acceso a la información · Procesos de contratación · Inclusividad · Transparencia |
| ITSP-02 | Rendición de cuentas | Planes institucionales · Informes institucionales |
| ITSP-03 | Participación ciudadana | **Información** (una sola) |
| ITSP-04 | Datos abiertos de gobierno | Presupuesto público · Ejecución del presupuesto · Contratación administrativa · Estadísticas o registros del sector |

> **Participación ciudadana sí tiene una subsección en el seed** (`ITSP-03-01`,
> "Información"), aunque por D-11 nunca tendrá documentos. Esto obliga a una
> decisión que el PO debe cerrar: ver P-1 en 16.6.

Las subsecciones de ITSP-01 coinciden una a una con las de la captura de
referencia del PO, lo que confirma que el seed sigue el índice ITSP real.

### 6.3 Qué es la "versión vigente"

Un documento puede tener varias filas en `versiones_documentos`, numeradas desde
1. **La vigente es la de mayor `numero_version`**; así lo resuelve hoy
`VersionesDocumentosService.obtenerArchivo` cuando no se le pide una versión
concreta, y así debe resolverlo el servicio público.

La vista pública **no ofrece versiones anteriores**: solo la vigente. Un
ciudadano que recibe un enlace no debe poder pedir "la versión 2" de un
documento que ya va por la 5.

Un documento `PUBLICADO` siempre tiene al menos una versión: `publicar()` lo
exige y lanza `DocumentoNoPublicableException` si no la hay. Aun así, el servicio
público trata la ausencia de versión como "documento no disponible" y lo omite
del listado, en vez de devolver una fila rota.

---

## 7. Sesión y acceso anónimo

### 7.1 El portal público no tiene sesión, y eso hay que imponerlo

La aplicación autenticada guarda el access token en memoria y el refresh token en
una cookie `httpOnly` con `path=/auth`. Nada de eso aplica aquí: el portal
público **no autentica, no renueva y no guarda nada**.

Pero el código actual no lo sabe. Hay tres puntos donde la vista pública caería
dentro de la maquinaria de sesión si no se tocan:

| # | Punto | Qué pasa hoy | Qué debe pasar |
|---|---|---|---|
| A | `router.beforeEach` | Llama a `restaurarSesion()` **en todas las rutas**, incluidas las marcadas `publica: true`, porque la llamada está antes de mirar `destino.meta`. | Una marca nueva `sinSesion` que se evalúa **primero** y devuelve `true` sin tocar la sesión. |
| B | Comodín `/:rutaNoEncontrada(.*)*` | Redirige siempre a `dashboard`, que exige sesión y acaba en el login. | Si la ruta empieza por el prefijo público, redirigir a la raíz pública. |
| C | `clienteHttp` (`src/lib/http.ts`) | `withCredentials: true`, interceptor que añade `Authorization` y, ante un 401, intenta renovar y si falla hace `window.location.href = '/login?...'`. | Un cliente aparte, sin credenciales ni interceptores. |

Sin A, cada ciudadano que abra el portal dispara un `POST /auth/refresh` desde un
iframe de tercer nivel. No rompe nada, pero es una petición de sesión que nadie
pidió, cuenta contra la limitación de tasa y ensucia el log.

### 7.2 Defecto preexistente que conviene arreglar en la misma entrega

El `window.location.href = '/login?motivo=sesion-expirada'` de `http.ts` usa una
ruta **absoluta desde la raíz del host**, sin `import.meta.env.BASE_URL`. En
producción, donde la aplicación vive bajo `/munipalmares/wp-munidata/`, esa
navegación lleva a `/login`, que no existe: el ciudadano —o el funcionario— ve la
página de error del servidor en vez del formulario de inicio de sesión.

No lo causa esta entrega, pero dentro de un iframe sería mucho más visible. Es un
arreglo de una línea. **Propuesta:** corregirlo en el mismo sprint, en un commit
aparte y claramente etiquetado como defecto preexistente. Queda a decisión del
PO; valor por defecto: **sí, se arregla**.

---

## 8. Contrato de la API pública

### 8.1 Ruta base y cómo queda bajo el proxy

El backend no define prefijo global. La ruta base propuesta es **`/publico`**, lo
que da:

```
Controlador NestJS          GET /publico/secciones
El navegador pide           GET /munipalmares/wp-munidata/api/publico/secciones
Apache recorta y reenvía    GET /publico/secciones   →  127.0.0.1:<puerto del backend>
```

**No hace falta tocar `munidata.conf`:** el `ProxyPass` existente cubre todo
`/api`, y la regla `RewriteRule ^api(/|$) - [L]` del `.htaccess` ya impide que el
SPA se trague esas rutas.

Un prefijo propio y visible (`/publico`) en vez de colgar los endpoints de
`/documentos` y `/categorias-itsp` es deliberado: hace evidente en el árbol de
rutas qué está abierto a Internet y qué no, y permite poner la limitación de tasa
y las cabeceras en un solo controlador en lugar de repartirlas.

### 8.2 Identificadores en la URL

Las secciones y subsecciones se direccionan por su **`codigo` en minúsculas**
(`itsp-01`, `itsp-01-02`), no por su `id` numérico ni por un slug del nombre:

- el `id` es un identificador interno y no hace falta exponerlo;
- el nombre es editable desde el catálogo, así que un slug derivado de él
  rompería los enlaces del menú de WordPress con una corrección de redacción;
- el `codigo` es `UNIQUE` en la base y es la misma clave por la que ya se
  identifica la categoría excluida (`CODIGO_CATEGORIA_RAIZ_EXCLUIDA = 'ITSP-03'`).

Que el código no sea bonito importa poco: la URL va dentro de un iframe y el
ciudadano no la ve.

Los **documentos** sí se direccionan por `id` numérico, porque no tienen otra
clave estable publicable. Consecuencia aceptada y documentada en 12.3.

### 8.3 Endpoints

Todos: método `GET`, sin autenticación (`@Publico()`), sin cookies, respuesta
`application/json` salvo los dos últimos.

---

#### `GET /publico/secciones`

Árbol completo para la vista raíz y para el menú.

**Parámetros:** ninguno.

**Respuesta 200**

```json
[
  {
    "codigo": "itsp-01",
    "nombre": "Información institucional",
    "descripcion": "Información general y administrativa de la institución.",
    "orden": 1,
    "cantidadDocumentos": 23,
    "subsecciones": [
      {
        "codigo": "itsp-01-01",
        "nombre": "Información institucional básica",
        "descripcion": null,
        "orden": 1,
        "cantidadDocumentos": 7
      }
    ]
  }
]
```

Solo categorías con `estado = 'ACTIVO'`. Orden: por `orden` y, a igualdad, por
`nombre`. `cantidadDocumentos` cuenta únicamente documentos `PUBLICADO`; en una
raíz es la suma de sus subsecciones más los documentos colgados directamente de
ella.

---

#### `GET /publico/secciones/:codigoSeccion`

Una sección y sus subsecciones. Es lo que carga la página de una sección.

**Respuesta 200:** un solo objeto con la misma forma que un elemento del árbol.

**404** si el código no existe, si la categoría no es raíz
(`id_categoria_padre IS NOT NULL`) o si su estado no es `ACTIVO`. Los tres casos
devuelven exactamente la misma respuesta.

---

#### `GET /publico/secciones/:codigoSeccion/:codigoSubseccion/documentos`

Listado paginado de los documentos publicados de una subsección.

**Parámetros de consulta**

| Nombre | Tipo | Por defecto | Validación |
|---|---|---|---|
| `pagina` | entero | 1 | ≥ 1 |
| `limite` | entero | 20 | entre 1 y 50 |

El tope duro de 50 es intencional: sin él, `limite=100000` convierte un endpoint
público en una forma barata de volcar el catálogo entero y de cargar el servidor.

**Respuesta 200** — misma envoltura que el listado interno, para no inventar una
segunda convención de paginación:

```json
{
  "datos": [
    {
      "id": 42,
      "titulo": "Informe de labores 2025",
      "descripcion": "Informe anual presentado ante el Concejo Municipal.",
      "anio": 2025,
      "fechaPublicacion": "2026-03-14T15:22:08.000Z",
      "tipoDocumento": "Informe",
      "dependencia": "Alcaldía",
      "numeroPaginas": 58,
      "tamanoBytes": 2458112,
      "etiquetas": ["Rendición de cuentas", "2025"]
    }
  ],
  "total": 7,
  "pagina": 1,
  "limite": 20
}
```

Orden: `fecha_publicacion DESC` y, a igualdad, `id DESC` para que el orden sea
determinista entre páginas.

**404** si la sección o la subsección no existen, no están activas o la
subsección no cuelga de esa sección. Pedir `itsp-02/itsp-01-01/documentos`
devuelve 404 aunque ambas existan: la jerarquía se valida, no se ignora.

**200 con `datos: []`** si la subsección existe y no tiene documentos
publicados. El caso vacío **no es un error** (RFP-07).

---

#### `GET /publico/documentos/:id/visualizar`

PDF de la versión vigente, `Content-Disposition: inline`.

#### `GET /publico/documentos/:id/descargar`

El mismo PDF, `Content-Disposition: attachment`.

**404** si el documento no existe, no está `PUBLICADO`, está en una categoría
inactiva o no tiene versiones. **503** (`ArchivoNoDisponibleException`) si la
fila existe pero el archivo no está en disco, que es un fallo de operación y no
una ausencia.

Cabeceras de la respuesta: ver 12.4.

### 8.4 DTO público: lista blanca, no lista negra

Los DTO públicos se declaran campo por campo. **No** se reutiliza
`DocumentoRespuestaDto` quitando propiedades: una lista negra se rompe sola en
cuanto alguien añade un campo a la entidad.

**`DocumentoPublicoDto`** — exactamente los campos del ejemplo de arriba.

**Qué queda fuera, y por qué**

| Campo | Motivo |
|---|---|
| `estado` | Si solo sale lo publicado, el campo es ruido que invita a filtrar en el cliente. |
| `idUsuarioCreador`, `nombreUsuarioCreador` | Nombres de funcionarios. Dato personal innecesario para el ciudadano (Ley N.º 8968, principio de finalidad). |
| `rutaArchivo`, `nombreArchivoSistema` | Revelan la disposición del almacenamiento y el UUID del archivo en disco. |
| `hashArchivo`, `algoritmoHash` | Dato de integridad interno. Se usa como `ETag` (12.4) pero no se publica como campo. |
| `idCategoriaItsp`, `idTipoDocumento`, `idDependencia` | Identificadores internos; el público recibe nombres. |
| `fechaCreacion`, `fechaActualizacion` | Revelan el ritmo de trabajo interno sin aportar nada. |
| `cantidadVersiones`, `versiones[]`, `numeroVersion` | El público ve un documento, no su historial. |
| `nombreArchivoOriginal` | Puede arrastrar nombres internos (`borrador_final_v3.pdf`). Ver 12.4 para el nombre con el que se descarga. |

**`SeccionPublicaDto`** y **`SubseccionPublicaDto`**: `codigo`, `nombre`,
`descripcion`, `orden`, `cantidadDocumentos` y, en la sección, `subsecciones[]`.
Fuera quedan `id`, `nivel`, `estado`, `idCategoriaPadre`, `fechaCreacion` y
`fechaActualizacion`.

### 8.5 Códigos y mensajes

Se mantiene el formato que ya impone `ExcepcionGlobalFilter`:
`{ statusCode, mensaje, error, timestamp, ruta }`.

| Código | Cuándo | Mensaje |
|---|---|---|
| 200 | Todo bien, incluida la lista vacía | — |
| 400 | `pagina` o `limite` fuera de rango | El que genera `ValidationPipe`, en español |
| 404 | Sección, subsección o documento no disponible públicamente | `"El recurso solicitado no está disponible."` |
| 429 | Se superó la limitación de tasa | `"Demasiadas solicitudes. Intente de nuevo en un minuto."` |
| 503 | El archivo está registrado pero no en disco | `"El documento no está disponible en este momento."` |

El 404 usa **un único mensaje para todos los casos**. Decir "el documento existe
pero no está publicado" sería confirmar su existencia.

---

## 9. Frontend

### 9.1 Rutas

| Ruta | Nombre | Vista | Meta |
|---|---|---|---|
| `/vista` | `portal-secciones` | `PortalSeccionesView.vue` | `{ sinSesion: true }` |
| `/vista/:seccion` | `portal-seccion` | `PortalSeccionView.vue` | `{ sinSesion: true }` |
| `/vista/:seccion/:subseccion` | `portal-subseccion` | `PortalSubseccionView.vue` | `{ sinSesion: true }` |

Las tres cuelgan de un `PortalPublicoLayout.vue`, **no** de `AppShellLayout.vue`:
el shell trae barra lateral, menú de usuario y botón de cierre de sesión, que
dentro del iframe serían a la vez inútiles y confusos.

### 9.2 Cambios en el router

Dos cambios, ambos mínimos:

```ts
// 1. Nueva marca en RouteMeta
/** Ruta del portal público: se resuelve sin tocar la sesión. */
sinSesion?: boolean;

// 2. Primera línea del beforeEach, antes de restaurarSesion()
if (destino.meta.sinSesion) {
  return true;
}
```

Y el comodín deja de mandar a todo el mundo al panel:

```ts
{
  path: '/:rutaNoEncontrada(.*)*',
  name: 'no-encontrado',
  redirect: (destino) =>
    destino.path.startsWith('/vista')
      ? { name: 'portal-secciones' }
      : { name: 'dashboard' },
}
```

El destino de esa redirección lleva `sinSesion`, así que el `beforeEach` lo deja
pasar: un enlace roto del portal acaba en la portada pública y nunca en el login.

### 9.3 Cliente HTTP público

`src/lib/httpPublico.ts`, instancia de axios aparte:

```ts
const clienteHttpPublico = axios.create({
  baseURL: URL_BASE_API,   // la misma de http.ts, relativa
  withCredentials: false,  // nada de cookies: no hay sesión que llevar
});
// Sin interceptores: sin Authorization, sin renovación, sin redirección al login.
```

Por qué un cliente aparte y no una bandera en el existente: el interceptor de
respuesta del cliente actual redirige a `/login` ante un 401 que no pueda
renovar. Dentro del iframe eso sacaría al ciudadano del portal sin explicación.
Un cliente sin interceptores no puede hacer eso **por construcción**, que es más
fiable que recordar pasar la bandera.

### 9.4 Capas, siguiendo el patrón del repositorio

```
src/types/portalPublico.types.ts        SeccionPublicaDto, SubseccionPublicaDto,
                                        DocumentoPublicoDto, ListaPaginadaDocumentosPublicos
src/services/portalPublico.service.ts   obtenerSecciones, obtenerSeccion,
                                        listarDocumentos, urlVisualizar, urlDescargar
src/composables/usePortalPublico.ts     estado reactivo: cargando, error, datos
src/views/PortalSeccionesView.vue
src/views/PortalSeccionView.vue
src/views/PortalSubseccionView.vue
src/layouts/PortalPublicoLayout.vue
src/components/portal/TarjetaSubseccion.vue
src/components/portal/FilaDocumentoPublico.vue
src/components/portal/MigasDePanPublicas.vue
src/components/portal/EstadoVacioPublico.vue
```

`urlVisualizar` y `urlDescargar` devuelven una **URL absoluta de navegador**
(base de la API + ruta), no una promesa: los botones son un `<a href>` con
`target="_blank" rel="noopener"` para "Ver" y un `<a download>` para "Descargar".
No se descarga por `axios` a un `blob`: sacar un PDF de 40 MiB a memoria dentro
de un iframe en un móvil es exactamente la forma de que la pestaña muera.

> `target="_blank"` desde dentro de un iframe abre una pestaña del navegador, no
> una "ventana dentro del iframe". Es lo que pide D-8 y lo que la prueba de humo
> de 14.4 verifica en iPhone y Android, donde el comportamiento de los visores de
> PDF integrados varía más que en escritorio.

### 9.5 Estados de cada vista

Las tres vistas tienen cuatro estados y los tres primeros son obligatorios:

| Estado | Qué se muestra |
|---|---|
| Cargando | Esqueleto de las tarjetas o de las filas, con `aria-busy="true"`. Nunca un espacio en blanco. |
| Error | Mensaje en español, sin detalles técnicos, y un botón "Reintentar". |
| Vacío | Solo en la subsección: "Sin documentos publicados" (D-10), con un icono y un texto que explique que esa subsección aún no tiene documentos publicados. |
| Con datos | Lo normal. |

Ningún estado de error muestra el `statusCode`, la ruta ni el `timestamp` que
trae el cuerpo del error: eso va a la consola, no a la pantalla del ciudadano.

### 9.6 Accesibilidad (WCAG 2.1 AA)

| Criterio | Cómo se cumple |
|---|---|
| 1.1.1 Contenido no textual | El icono de PDF de cada fila es decorativo (`aria-hidden`); el tipo del documento va como texto. |
| 1.3.1 Información y relaciones | Las subsecciones son una lista (`<ul>`) de enlaces, no `<div>` con `@click`. El listado de documentos también. |
| 1.4.3 Contraste mínimo | Medido sobre los tokens de DESIGN.md: `#a60001` sobre blanco = **8,0:1**; `#d30505` sobre blanco = **5,5:1**; blanco sobre `#d30505` = **5,5:1**. Los tres pasan AA. El texto secundario no puede usar gris claro sobre `#f9f9f9` sin medirlo antes. |
| 1.4.4 Redimensionar texto | Nada en `px` fijos que impida el zoom al 200 %; la altura del iframe es fija pero su contenido tiene scroll interno (D-9). |
| 2.1.1 Teclado | Todo navegable con Tab. Las tarjetas son `<a>`, así que se activan con Enter sin código extra. |
| 2.4.2 Título de página | Cada vista fija `document.title`, aunque dentro del iframe no se vea: lo usan los lectores de pantalla y la pestaña nueva del PDF. |
| 2.4.4 Propósito del enlace | "Ver" y "Descargar" llevan `aria-label` con el título del documento: "Ver Informe de labores 2025", no dos enlaces idénticos repetidos 20 veces. |
| 2.4.7 Foco visible | Anillo de foco de 2 px con desplazamiento, como pide DESIGN.md. No se desactiva el `outline`. |
| 4.1.2 Nombre, función, valor | Migas de pan en `<nav aria-label="Ruta de navegación">`. |

El `<iframe>` de WordPress lleva `title` descriptivo (lo exige 4.1.2 desde el
documento contenedor); está en el formato del snippet de 15.5.

---

## 10. Manejo de errores

### 10.1 Backend

Se reutiliza `ExcepcionGlobalFilter` sin cambios. El módulo público define dos
excepciones de negocio, en la línea de las que ya existen en
`src/comun/excepciones/`:

| Excepción | Código | Uso |
|---|---|---|
| `RecursoPublicoNoDisponibleException` | 404 | Sección, subsección o documento que no debe ser visible. Mensaje único. |
| (reutilizada) `ArchivoNoDisponibleException` | 503 | Fila sin archivo en disco. Ya existe y ya registra el fallo en el log del servicio. |

**Nunca** se usan `DocumentoNoEncontradoException` ni
`CategoriaNoEncontradaException` en el módulo público: sus mensajes están
redactados para un funcionario y pueden distinguir casos que aquí deben ser
indistinguibles.

### 10.2 Frontend

Un 404 del backend no se muestra como "404": la vista dice "Esta sección no está
disponible" y ofrece volver a la portada pública. Un 429 dice "Demasiadas
solicitudes, espere un momento". Cualquier otro error, incluido un fallo de red,
dice "No se pudo cargar la información. Intente de nuevo." con botón de
reintento.

### 10.3 Un PDF que falla

Si `/publico/documentos/:id/descargar` devuelve 404 o 503, el navegador ya habrá
abierto la pestaña nueva, que mostrará el JSON del error. Es feo. **Propuesta:**
antes de abrir, el listado ya sabe que el documento existe —lo acaba de recibir—,
así que el caso solo ocurre si el documento se retira entre la carga del listado
y el clic. Se acepta y se deja anotado como mejora: una página de error HTML para
esas dos rutas en vez del JSON. No cabe en las 3 semanas.

---

## 11. Reglas de negocio

### 11.1 Solo publicado, solo versión vigente

```sql
documentos.estado = 'PUBLICADO'
AND categorias_itsp.estado = 'ACTIVO'          -- la subsección
AND categoria_padre.estado = 'ACTIVO'          -- y su sección
```

Y de las versiones, la de mayor `numero_version`.

La condición sobre la **categoría padre** no es un detalle: si alguien desactiva
la sección "Rendición de cuentas" desde el catálogo esperando que desaparezca del
portal, sus subsecciones deben desaparecer con ella. Sin esa condición, seguirían
siendo alcanzables por URL directa.

### 11.2 Lo retirado desaparece de inmediato

Despublicar o inactivar un documento lo saca del portal en la siguiente petición.
No hay caché de servidor que lo retenga; la caché del navegador se controla con
revalidación obligatoria (12.4). Esto es un requisito, no un efecto secundario:
cuando alguien retira un documento, normalmente es porque **tiene que dejar de
estar público ya**.

### 11.3 La exclusión de ITSP-03 aplica a clasificar, no a mostrar

`CODIGO_CATEGORIA_RAIZ_EXCLUIDA = 'ITSP-03'` impide **asignar** documentos a
"Participación ciudadana", en el frontend y en `DocumentosService`. Eso no
cambia.

El módulo público **no** reutiliza ese filtro para armar el árbol: D-11 pide que
la sección aparezca. Dicho explícitamente aquí para que nadie lo "corrija" más
adelante creyendo que es un olvido.

### 11.4 Participación ciudadana: qué muestra hoy y cómo recibirá contenido

**Hoy**, su página de sección muestra:

- el nombre y la descripción que trae la base;
- un bloque "Contenido próximamente", con un texto breve del estilo: *"Esta
  sección está en preparación. Próximamente encontrará aquí información y
  formularios de participación ciudadana."*;
- la subsección que existe en el seed, como un recuadro más (ver P-1).

**Cómo recibirá contenido, sin tocar código:** la página de WordPress de esa
sección es un documento editable. Quien administre WordPress puede añadir
bloques —texto, enlaces, o el iframe del Observatorio de Datos— **encima o debajo**
del iframe de Muni Data, o sustituirlo por completo. Muni Data no necesita
enterarse.

Esto mantiene la frontera: Muni Data publica documentos; el contenido editorial y
los formularios son de WordPress y del Observatorio. **Este spec no construye un
editor de contenido ni acopla Muni Data al Observatorio.** La decisión final es
del PO: ver P-2 en 16.6.

### 11.5 Sin bitácora de visitas públicas

Por D-6. Además hay dos razones técnicas que conviene dejar escritas:

1. Registrar visitas anónimas significaría guardar IP y marca de tiempo de
   ciudadanos, lo que convierte una tabla interna en un registro de navegación
   ciudadana con sus propias obligaciones bajo la Ley N.º 8968.
2. `bitacora_logs` se purga físicamente cada 3 meses (día 1, 03:00) y ya es la
   fuente de auditoría del sistema. Mezclarle tráfico público la haría inservible
   para lo que existe.

El servicio público **no llama** a `BitacoraService`. En particular, no usa
`VersionesDocumentosService.obtenerArchivo`, que registra `DESCARGAR_DOCUMENTO`
y además exige un `PayloadJwt` que aquí no existe: abre el archivo contra
`AlmacenamientoDocumentosService.abrirLectura` por su cuenta.

---

## 12. Seguridad

> Esta sección es la razón de ser del documento. Lo que sigue no son buenas
> prácticas genéricas: cada punto responde a algo concreto que existe en este
> código.

### 12.1 Modelo de amenaza, en una línea

Cualquiera en Internet puede llamar a cualquier endpoint bajo `/publico` con
cualquier parámetro, tantas veces como quiera. Todo lo demás se deduce de ahí.

### 12.2 Superficie expuesta

El módulo público expone **cinco rutas de lectura** y ninguna de escritura. No
hay `POST`, `PATCH` ni `DELETE`. No recibe cuerpo de petición. Sus únicas
entradas son dos códigos de categoría y dos enteros de paginación, todos
validados por `ValidationPipe` con `whitelist: true`, que ya está activo
globalmente y descarta cualquier propiedad no declarada en el DTO.

### 12.3 Sin enumeración y sin canal lateral

- **Una sola respuesta 404, un solo mensaje**, para: no existe, existe en
  borrador, existe inactivo, existe pero su categoría está inactiva, y existe
  pero cuelga de otra sección. Es el mismo criterio que ya aplica
  `verificarVisibilidad` en `DocumentosService`, donde está explicado: *"un 403
  confirmaría que el documento existe"*.
- **Los identificadores de documento son correlativos y se exponen.** Alguien
  puede recorrer `1..N`. Lo que obtiene es: 200 para lo publicado —que es público
  por definición— y 404 indistinguible para todo lo demás. El conteo total de
  documentos publicados ya es visible en el portal, así que no se filtra nada que
  no estuviera a la vista. Se acepta conscientemente; una clave pública opaca
  exigiría una columna nueva y no cabe en el plazo.
- **No se devuelven mensajes distintos ni códigos distintos** según el motivo, y
  conviene vigilar también el **tiempo de respuesta**: las cinco rutas resuelven
  con una consulta indexada, así que no hay una diferencia medible entre "no
  existe" y "existe pero no es público".

### 12.4 Cabeceras de la respuesta del PDF

**Importante:** las cabeceras del `.htaccess` del frontend **no se aplican a la
API**. Ese `.htaccess` gobierna un directorio de disco; las peticiones a `/api`
las atiende `ProxyPass` a nivel de `VirtualHost` y nunca se asignan a ese
directorio. Hoy, por tanto, **ninguna respuesta de la API lleva
`X-Content-Type-Options`**, y `main.ts` no usa `helmet`. Las rutas públicas deben
ponerse sus propias cabeceras.

| Cabecera | Valor | Por qué |
|---|---|---|
| `Content-Type` | `application/pdf` | Viene de la fila, que tiene `CHECK (mime_type = 'application/pdf')`. |
| `X-Content-Type-Options` | `nosniff` | Sin esto, un navegador puede ignorar el `Content-Type` y adivinar. Es el vector clásico para que un archivo subido se interprete como otra cosa. |
| `Content-Disposition` | `inline` (ver) / `attachment` (descargar) | D-8. Con `filename` en ASCII y `filename*` en UTF-8, como ya hace el controlador interno. |
| `Content-Length` | tamaño de la versión | Permite barra de progreso y evita descargas truncadas silenciosas. |
| `Cache-Control` | `public, max-age=0, must-revalidate` | Permite guardar la copia, pero obliga a revalidar en cada uso: así, retirar un documento surte efecto de inmediato (11.2) sin renunciar al ahorro de ancho de banda. |
| `ETag` | `"<hash_archivo>"` | El SHA-256 de la versión **ya está en la base**. La revalidación cuesta un 304 sin cuerpo. |
| `X-Robots-Tag` | *(sin decidir)* | Ver P-5. |

**Nombre con el que se descarga.** La propuesta es construirlo desde el **título
del documento** saneado (`Informe de labores 2025.pdf`) y no desde
`nombre_archivo_original`, que puede arrastrar nombres internos. Valor por
defecto: título saneado, con el nombre original como respaldo si el título queda
vacío tras sanear. Ver P-4.

### 12.5 Limitación de tasa propia

`ThrottlerGuard` ya es global con 100 peticiones por minuto. Eso es razonable
para funcionarios autenticados y demasiado generoso para Internet, sobre todo
para rutas que mueven archivos de hasta 40 MiB.

| Rutas | Límite propuesto |
|---|---|
| Listados (`/publico/secciones*`) | 60 por minuto y por IP |
| PDF (`/publico/documentos/:id/*`) | 20 por minuto y por IP |

Se declaran con `@Throttle({ default: { ttl: 60_000, limit: N } })` sobre los
métodos, igual que ya hace `AutenticacionController` con el login.

> **Depende de `CONFIAR_EN_PROXY=true`.** Detrás de Apache, `req.ip` es
> `127.0.0.1` para todo el mundo salvo que `trust proxy` esté activo. Si esa
> variable no está en `true` en producción, **los contadores de todos los
> visitantes se suman en un solo cubo** y bastaría una persona recargando para
> dejar el portal en 429 para el resto. Hay que verificarlo en la VM antes de
> publicar (supuesto S-2), y la comprobación entra en 15.6.

### 12.6 Lo que el portal no hace

- No acepta escrituras.
- No emite ni lee cookies (`withCredentials: false`).
- No registra nada en bitácora (11.5), así que no acumula datos de navegación
  ciudadana.
- No llama a `BitacoraService` ni a `UsuarioActualService`.
- No usa CORS: el frontend y la API se sirven del mismo origen a través de
  Apache, de modo que el navegador no emite ni comprobación previa ni
  `Origin`. La configuración de CORS de `main.ts` sigue como está; no hay que
  añadir orígenes para esta entrega. Si algún día un tercero consumiera esta API
  desde otro dominio, sería una decisión aparte y explícita.

### 12.7 Recorridos de ruta

El endpoint recibe un `id` numérico y un `codigo` de catálogo, nunca una ruta de
archivo. La ruta sale de la fila de `versiones_documentos`, y
`AlmacenamientoDocumentosService` la resuelve contra la raíz configurada y
**comprueba que el resultado siga dentro de esa raíz** antes de abrir nada. Esa
defensa ya existe y el módulo público la hereda por usar el mismo servicio. No se
duplica la lógica ni se abre ningún archivo por ruta recibida del cliente.

### 12.8 ISO/IEC 27001 y Ley N.º 8968

| Control | Cómo queda |
|---|---|
| **A.9.4 — Control de acceso a la información** | El portal expone exclusivamente documentos que un funcionario con el permiso `documentos.publicar` marcó como `PUBLICADO`. Publicar es, a partir de ahora, **el acto que hace público un documento en Internet**, no solo "visible para la municipalidad". El PO debe confirmar que los usuarios con ese permiso lo entienden así: ver P-6. |
| **A.12.4 — Registro y seguimiento** | La publicación y la despublicación siguen quedando en bitácora con su autor. Lo que no se registra es la consulta anónima (11.5). La trazabilidad de *quién hizo público qué* se conserva íntegra. |
| **A.13.1 — Seguridad de las redes** | No cambia: el backend sigue escuchando solo en loopback y el único camino es el proxy de Apache sobre HTTPS. El portal no abre ningún puerto. |
| **A.14.2 — Seguridad en el desarrollo** | DTO de lista blanca (8.4), validación de entrada, pruebas específicas de los estados no públicos (14.1). |
| **Ley N.º 8968, art. 5 (finalidad) y 6 (calidad del dato)** | **Quien publica es responsable de que el PDF no contenga datos personales que no deban ser públicos.** El sistema no inspecciona el contenido de los PDF y no puede hacerlo. Se propone que el instructivo de WordPress y la pantalla de publicación lleven una advertencia explícita, y que el PO acuerde con las dependencias una revisión previa. Ver P-7. |

Esta última fila es el riesgo real de la entrega. Lo técnico está controlado; lo
que puede causar un incidente es un PDF con una cédula, un teléfono o una firma
escaneada dentro, publicado por alguien que creía que "publicado" significaba
"visible en la intranet".

---

## 13. Rendimiento

| Punto | Medida |
|---|---|
| Conteo de documentos por subsección | Una sola consulta agrupada (`GROUP BY id_categoria_itsp`) para todo el árbol, no una por subsección. Con 13 subsecciones la diferencia es menor, pero evita el patrón N+1 desde el principio. |
| Listado | Paginado con tope de 50 (8.3). Usa `idx_documentos_categoria_itsp` e `idx_documentos_fecha_publicacion`. |
| Versión vigente | Se resuelve con una subconsulta por `MAX(numero_version)` agrupada, no abriendo cada documento. |
| PDF | Se transmite con `createReadStream` y `StreamableFile`, igual que el endpoint interno. Nunca se carga el archivo completo en memoria: con un límite de 40 MiB por archivo, hacerlo sería la forma más rápida de tumbar el servicio. |
| Caché de servidor | **Ninguna.** El contenido debe poder retirarse de inmediato (11.2) y el volumen no la justifica. La revalidación con `ETag` cubre el ahorro de ancho de banda. |
| Frontend | Las tres vistas se cargan con `import()` diferido, como el resto del router, para que el ciudadano no descargue el panel administrativo. |

---

## 14. Pruebas

### 14.1 Backend — unitarias (Jest, junto a las 183 existentes)

`portal-publico.service.spec.ts`:

| # | Caso | Esperado |
|---|---|---|
| 1 | Documento `PUBLICADO` en subsección activa | Aparece en el listado |
| 2 | Documento `BORRADOR` | **No** aparece |
| 3 | Documento `INACTIVO` | **No** aparece |
| 4 | Documento publicado en subsección `INACTIVO` | **No** aparece |
| 5 | Documento publicado en subsección activa cuya **sección padre** está `INACTIVO` | **No** aparece |
| 6 | Documento con 3 versiones | El DTO trae el `numeroPaginas` y el `tamanoBytes` de la versión 3 |
| 7 | Documento publicado sin versiones | Se omite, sin excepción |
| 8 | Subsección sin documentos | 200 con `datos: []` y `total: 0` |
| 9 | `GET` de un documento `BORRADOR` por `visualizar` | 404 con el mensaje genérico |
| 10 | `GET` de un documento inexistente por `visualizar` | 404 **idéntico byte a byte** al del caso 9 |
| 11 | Subsección que no cuelga de la sección indicada | 404 |
| 12 | Código de sección inexistente | 404 |
| 13 | Código que corresponde a una subsección usado como sección | 404 |
| 14 | `limite=1000` | 400 |
| 15 | `pagina=0` | 400 |
| 16 | DTO del listado | **No** contiene `estado`, `idUsuarioCreador`, `nombreUsuarioCreador`, `rutaArchivo`, `nombreArchivoSistema` ni `hashArchivo` |
| 17 | Árbol de secciones | ITSP-03 aparece; ninguna categoría `INACTIVO` aparece |
| 18 | Descarga pública | **No** se llama a `BitacoraService.registrar` |

El caso 10 merece una prueba propia y no un comentario: es la que impide que una
refactorización futura reintroduzca la enumeración.

### 14.2 Backend — verificación de regresión

`nest build` limpio y las **183 pruebas existentes siguen pasando**. El módulo
público no toca `DocumentosService`, `VersionesDocumentosService` ni
`CategoriasItspService`; si alguna de sus suites se rompe, es señal de que se
cambió algo que no tocaba.

### 14.3 Frontend — lista de verificación manual

| # | Comprobación |
|---|---|
| 1 | `/vista` muestra las 4 secciones en el orden de la base |
| 2 | Una sección muestra sus subsecciones con el conteo correcto |
| 3 | Participación ciudadana muestra el marcador "Contenido próximamente" |
| 4 | Una subsección lista sus documentos por fecha descendente |
| 5 | Una subsección sin documentos muestra "Sin documentos publicados" |
| 6 | "Ver" abre el PDF en pestaña nueva |
| 7 | "Descargar" descarga el archivo con el nombre esperado |
| 8 | F5 en `/vista/itsp-01/itsp-01-02` recarga esa subsección (prueba el `.htaccess`) |
| 9 | Las migas de pan vuelven a la sección y a la raíz |
| 10 | **En las herramientas del navegador: ninguna petición a `/auth/refresh`, ninguna cookie enviada, ninguna cabecera `Authorization`** |
| 11 | Navegación completa solo con teclado, con foco visible en cada paso |
| 12 | Zoom al 200 % sin pérdida de contenido ni scroll horizontal |
| 13 | A 360 px de ancho, las tarjetas se apilan y nada se desborda |
| 14 | Desconectar la red: aparece el mensaje de error con "Reintentar", no una pantalla en blanco |

### 14.4 Prueba de humo en la VM, por HTTPS

Con la aplicación desplegada y antes de tocar WordPress, usando
`/munipalmares/wp-munidata/iframes/prueba-vista.html` (15.5b):

| # | Comprobación |
|---|---|
| 1 | La página de prueba carga los 4 iframes sobre fondo oscuro |
| 2 | Cada iframe muestra su sección, sin barra lateral ni menú de usuario |
| 3 | El scroll interno del iframe funciona y la página contenedora no salta |
| 4 | Recargar con F5 dentro del iframe mantiene la subsección |
| 5 | `GET /munipalmares/wp-munidata/api/publico/secciones` devuelve 200 y las 4 secciones |
| 6 | Abrir `/munipalmares/wp-munidata/vista` directamente en una pestaña funciona igual |
| 7 | En una ventana de incógnito, sin haber iniciado sesión nunca, todo lo anterior funciona |
| 8 | **iPhone (Safari):** ver y descargar un PDF desde dentro del iframe |
| 9 | **Android (Chrome):** ver y descargar un PDF desde dentro del iframe |
| 10 | En móvil, el iframe de altura fija no atrapa el scroll de la página |
| 11 | Con sesión de funcionario abierta en otra pestaña, el portal sigue comportándose como anónimo |

Los puntos 8, 9 y 10 son los que más veces fallan en una integración por iframe y
son los que no se pueden probar desde el escritorio: el visor de PDF del sistema,
el gesto de scroll y el bloqueo de ventanas emergentes se comportan distinto.

---

## 15. Despliegue, infraestructura e integración con WordPress

### 15.1 Qué no cambia

- `despliegue/apache/munidata.conf`: el `ProxyPass` de `/api` ya cubre
  `/api/publico/...`.
- `desplegar.ps1`: no necesita cambios de código. Ver 15.4.
- El esquema de la base de datos y los scripts SQL: ninguno.

### 15.2 `X-Frame-Options` frente a `frame-ancestors`

El `.htaccess` del frontend pone hoy `X-Frame-Options: SAMEORIGIN`.

**Eso ya permite el iframe**, porque WordPress y Muni Data se sirven del mismo
origen (supuesto S-1): `SAMEORIGIN` compara el origen del documento de nivel
superior con el del documento embebido y aquí coinciden. **No hay que quitarlo ni
relajarlo**, y conviene dejar escrito por qué, porque el comentario actual del
`.htaccess` dice "el sistema no se embebe en ningún otro sitio" y eso deja de ser
cierto con esta entrega.

**Recomendación:** añadir, **junto** a la cabecera actual:

```apache
Header always set Content-Security-Policy "frame-ancestors 'self'"
```

Tres razones:

1. `X-Frame-Options` está obsoleto; `frame-ancestors` es lo que los navegadores
   actuales privilegian, y cuando ambos están presentes gana `frame-ancestors`.
2. Es **una directiva independiente**: declarar solo `frame-ancestors` no activa
   ninguna política sobre scripts, estilos ni fuentes. La preocupación anotada en
   el `.htaccess` —que una CSP incompleta rompería la tipografía de Google
   Fonts— **no aplica** aquí, porque eso lo gobierna `default-src`/`font-src`,
   que no se declaran. Es un cambio de riesgo muy bajo.
3. Deja preparado el día en que el portal haya que embeberlo desde otro
   subdominio: se cambia `'self'` por el origen exacto, en un solo sitio.

Se actualiza también el comentario del `.htaccess` para que diga que el sistema
**sí** se embebe, desde el mismo origen, y que por eso la política es `'self'` y
no `none`.

### 15.3 El `.htaccess` y la ruta `/vista`

No requiere cambios. La regla existente

```apache
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.html [L]
```

hace dos cosas que esta entrega necesita:

1. `/vista`, `/vista/itsp-01` y `/vista/itsp-01/itsp-01-02` **no existen como
   archivo**, así que caen en `index.html` y las resuelve el router. Recargar con
   F5 funciona.
2. Los snippets de `iframes/` **sí existen como archivo**, así que se sirven tal
   cual y **no** se reescriben a `index.html`. Es exactamente lo que hace falta
   para 15.5.

`Options -Indexes` impide además que alguien liste el contenido de
`/iframes/` pidiendo la carpeta.

### 15.4 Supervivencia al redespliegue

`desplegar.ps1` hace **reemplazo limpio** de la carpeta publicada: borra todo su
contenido (solo si lleva el marcador `.munidata-despliegue`) y copia encima
`dist/*` más el `.htaccess`.

Por tanto, **lo único que sobrevive es lo que sale del build**. Vite copia
`frontend/public/` tal cual a `dist/`, de modo que `frontend/public/iframes/`
llega a la carpeta publicada en cada despliegue sin intervención manual. Es el
mismo mecanismo por el que ya sobreviven el `.htaccess` y el `favicon.ico`.

> **Corolario:** los snippets **no** pueden crearse a mano en la VM. Si alguien
> los copia directamente en la carpeta publicada, el siguiente `git pull` +
> `desplegar.ps1` los borra sin avisar. Tienen que estar en el repositorio.

### 15.5 Entregables de integración

#### (a) Snippets por sección — `frontend/public/iframes/`

Un archivo `.html` por sección, cada uno con **una sola línea**, en el formato
exacto que ya usa el Observatorio de Datos (`src` relativo a la raíz del host,
sin IP ni dominio; `title` descriptivo; `width:100%`; altura fija; `border:0`;
`display:block`):

| Archivo | Contenido |
|---|---|
| `transparencia-informacion-institucional.html` | `<iframe src="/munipalmares/wp-munidata/vista/itsp-01" title="Transparencia: Información institucional" style="width:100%;height:800px;border:0;display:block"></iframe>` |
| `transparencia-rendicion-de-cuentas.html` | igual, con `vista/itsp-02` y su título |
| `transparencia-participacion-ciudadana.html` | igual, con `vista/itsp-03` y su título |
| `transparencia-datos-abiertos.html` | igual, con `vista/itsp-04` y su título |

**Alturas propuestas:** 800 px para ITSP-01 y ITSP-04 (6 y 4 subsecciones), 650 px
para ITSP-02 e ITSP-03 (2 y 1). Son los dos valores que el Observatorio ya usa,
así que el portal queda visualmente consistente. Sujeto a P-3.

> **Limitación conocida, idéntica a la del `.htaccess`.** La ruta
> `/munipalmares/wp-munidata/` va **escrita fija** en estos archivos: son
> estáticos y Vite los copia sin sustituir variables, así que no pueden leer
> `VITE_RUTA_BASE`. Si algún día cambia la ruta de publicación, hay que cambiar
> **cuatro** cosas a la vez: `VITE_RUTA_BASE`, el `RewriteBase` del `.htaccess`,
> el `ProxyPass` de `munidata.conf` y estos snippets. Queda anotado en el propio
> archivo, como ya se hace en el `.htaccess`.
> *Alternativa descartada por plazo:* generarlos en tiempo de build con un plugin
> de Vite que sustituya la base. Se propone para después de la PPS.

#### (b) Página de prueba — `frontend/public/iframes/prueba-vista.html`

Página estática, sin dependencias, que permite validar todo en la VM **sin tocar
WordPress ni su raíz**. Contiene:

- fondo `#0A0C11` (el token `deep-onyx` de DESIGN.md, que es el de la portada
  real de WordPress), para ver cómo se lee el panel claro sobre oscuro;
- los cuatro iframes, cada uno con su título encima;
- un conmutador para ver un iframe a ancho completo o los cuatro en rejilla;
- una nota visible de que es una página de verificación técnica.

Sirve a la vez como **prototipo para validar el diseño con el PO** (ver 16.2) y
como herramienta de la prueba de humo (14.4). Es accesible por URL para
cualquiera, igual que el resto del portal; no muestra nada que no sea público.

#### (c) Instructivo — `documentacion/portal-publico/INTEGRACION-WORDPRESS.md`

Para quien tenga permisos de administración en WordPress. Sin credenciales, sin
IP, sin rutas de la VM. Contenido:

1. Crear cuatro páginas, una por sección, con el título de la sección.
2. En cada una, insertar un bloque **HTML personalizado** y pegar el contenido
   del snippet correspondiente, que puede copiarse desde
   `https://<host>/munipalmares/wp-munidata/iframes/<archivo>.html` o del
   repositorio.
3. Crear el ítem de menú **Transparencia** en el menú principal, con las cuatro
   páginas como subítems, en el orden del índice ITSP.
4. Cómo comprobar que quedó bien y qué hacer si el iframe sale en blanco (lista
   corta: ruta mal escrita, página no publicada, caché del navegador).
5. Qué **no** hay que tocar: la configuración de Apache, el `.htaccess` de
   WordPress y el plugin de OneDrive (ver P-8).

### 15.6 Comprobaciones nuevas en `verificar-despliegue.ps1`

Se añaden a las siete actuales, dentro del bloque que ya depende de
`-UrlPublica`:

| # | Comprobación | Fallo dice |
|---|---|---|
| 8 | `GET <UrlPublica>/api/publico/secciones` devuelve 200 y un arreglo con 4 elementos | Si 404: falta desplegar el backend nuevo. Si 401: el controlador no lleva `@Publico()`. |
| 9 | `GET <UrlPublica>/vista` devuelve 200 y el contenedor del SPA | Si 404: el `.htaccess` no está aplicando el fallback. |
| 10 | `GET <UrlPublica>/iframes/prueba-vista.html` devuelve 200 y **no** es el `index.html` del SPA | Si devuelve el index, la regla de archivos existentes del `.htaccess` no está funcionando. |

La comprobación 10 es la que detecta el fallo más difícil de diagnosticar a ojo:
un snippet servido como `index.html` se ve como la aplicación entera dentro del
bloque de WordPress, y nadie entiende por qué.

Se propone además una comprobación **informativa** del supuesto S-2: leer
`CONFIAR_EN_PROXY` del `.env.produccion` y avisar si no vale `true`, explicando
el efecto sobre la limitación de tasa. No es un fallo de despliegue, es un aviso.

---

## 16. Plan de trabajo, riesgos, criterios de aceptación y preguntas abiertas

### 16.1 Plan en tres semanas

| Semana | Backend | Frontend | WordPress y despliegue |
|---|---|---|---|
| **1** | Módulo `publico`: controlador, servicio, DTO de lista blanca, excepción propia, limitación de tasa. Las 18 pruebas de 14.1. | Tipos, servicio, composable, cliente HTTP público. Cambios del router (9.2). | — |
| **2** | Ajustes del contrato tras la revisión con el PO. | Layout público y las tres vistas, con los cuatro estados. Accesibilidad. Prototipo claro-sobre-oscuro. | Snippets y `prueba-vista.html`. Borrador del instructivo. |
| **3** | — | Correcciones de la validación con el PO. | Despliegue en la VM, comprobaciones nuevas, prueba de humo completa (14.4) incluidos iPhone y Android, páginas y menú de WordPress, instructivo final. |

**Hitos de validación con el PO**

| Cuándo | Qué se valida |
|---|---|
| Fin de semana 1 | Este documento aprobado y las preguntas abiertas cerradas. |
| Mitad de semana 2 | El prototipo claro-sobre-oscuro (16.2). Es el punto de no retorno del diseño. |
| Fin de semana 2 | El instructivo de WordPress, para que quien tenga los permisos pueda agendarse. |
| Semana 3 | Prueba de humo conjunta en la VM. |

**El camino crítico no es el código: es el acceso a WordPress.** Hay que
resolverlo en la semana 1, no en la 3.

### 16.2 Cómo validar el aspecto claro dentro de una portada oscura

`DESIGN.md` **ya es un sistema claro** ("High-Contrast Civic Modern", superficie
`#f9f9f9`), así que D-7 no obliga a inventar nada: el portal público se ve como
el resto de Muni Data. El problema es otro: la portada de WordPress es casi negra
y el panel claro va a parecer un recorte pegado encima si no se le da un borde
deliberado.

**Propuesta de tratamiento visual**

1. El contenido del iframe se envuelve en una superficie `#ffffff` sobre un fondo
   `#f9f9f9`, con radio de 8 px y un borde de 1 px, y 24 px de margen interno:
   se lee como una **tarjeta institucional** colocada a propósito, no como un
   fallo de tema.
2. Un encabezado propio dentro del iframe, con el nombre de la sección, para que
   el bloque se explique solo aunque el visitante haya llegado con scroll.
3. En el bloque de WordPress que contiene el iframe se recomienda el mismo radio
   de 8 px, para que el borde del iframe y el del bloque coincidan.

**Cómo mostrárselo al PO:** con `prueba-vista.html` (15.5b), que pinta el fondo
`#0A0C11` de la portada real. El PO ve la combinación exacta sin que nadie haya
tocado WordPress y sin comprometer nada. Si no le convence, cambiar el tratamiento
cuesta CSS; cambiarlo después de haber creado las páginas cuesta además coordinar
con quien administra WordPress.

> **Ojo a la consistencia:** el iframe del Observatorio de Datos que ya está en la
> portada es **oscuro**. Si el de Muni Data es claro, en la misma página
> convivirán dos paneles embebidos de aspecto opuesto. D-7 dice claro y eso es lo
> que se hace, pero conviene que el PO lo vea con los dos a la vista antes de
> cerrarlo. Ver P-9.

### 16.3 Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **R-1** | **No se concede acceso a WordPress.** Hoy nadie ha confirmado quién puede editar páginas y menús, y el estudiante no tiene usuario. | Alto. Sin esto no hay portal, por mucho que el código funcione. | Pedirlo en la semana 1. **Alternativa si no se concede:** el instructivo de 15.5c está escrito para que el supervisor o quien administre WordPress pegue los cuatro snippets sin ayuda; son cuatro páginas y un menú, no requiere conocimientos técnicos. La página `prueba-vista.html` permite demostrar que todo funciona **antes** de pedir el cambio en WordPress, lo que hace mucho más fácil conseguir el permiso. |
| **R-2** | La decisión sobre Participación ciudadana se alarga. | Medio. Bloquea RFP-08. | El valor por defecto de P-1 y P-2 permite avanzar sin la decisión; cambiarla después es texto, no arquitectura. |
| **R-3** | La altura fija no sirve en móvil (doble scroll, el iframe atrapa el gesto). | Medio. | Se prueba en la semana 3 (14.4, puntos 8–10). Si falla, `postMessage` es la mejora prevista en D-9, pero no cabe: la salida sería ajustar alturas por sección. |
| **R-4** | Un PDF ya publicado contiene datos personales. | **Alto, y no es técnico.** | Ver 12.8 y P-7. Hay que plantearlo al PO antes de publicar, no después. |
| **R-5** | El plugin de OneDrive de WordPress interfiere con el bloque HTML. | Bajo. | Se detecta en la semana 3 al crear la primera página. Ver P-8. |
| **R-6** | `CONFIAR_EN_PROXY` no está en `true` en producción. | Medio. | Comprobación informativa de 15.6. Se verifica en la semana 3. |
| **R-7** | Tres semanas es poco si aparecen cambios de alcance. | Alto. | El alcance está cerrado en la Sección 2. Todo lo que no esté ahí es una entrega posterior, no una ampliación de esta. |

### 16.4 Criterios de aceptación

Medibles. La entrega está terminada cuando **todos** se cumplen.

| # | Criterio |
|---|---|
| CA-1 | En una ventana de incógnito, sin haber iniciado sesión nunca, `https://<host>/munipalmares/wp-munidata/vista` muestra las 4 secciones del índice ITSP con los nombres que tiene la base. |
| CA-2 | Las 4 páginas de WordPress del menú "Transparencia" muestran cada una su sección dentro del iframe. |
| CA-3 | Desde una subsección con documentos se puede **ver** un PDF en pestaña nueva y **descargarlo**, en escritorio, en iPhone y en Android. |
| CA-4 | Un documento en `BORRADOR` y uno `INACTIVO` devuelven **404 con idéntica respuesta** a la de un identificador inexistente, tanto en el listado como en `visualizar` y `descargar`. |
| CA-5 | En las herramientas del navegador, ninguna petición del portal lleva cookie ni `Authorization`, y no hay ningún `POST /auth/refresh`. |
| CA-6 | La respuesta del listado no contiene `estado`, `idUsuarioCreador`, `nombreUsuarioCreador`, `rutaArchivo`, `nombreArchivoSistema` ni `hashArchivo`. |
| CA-7 | Una subsección sin documentos muestra "Sin documentos publicados"; Participación ciudadana muestra "Contenido próximamente". |
| CA-8 | Recargar con F5 en `/vista/itsp-01/itsp-01-02`, dentro y fuera del iframe, mantiene la subsección. |
| CA-9 | `nest build` limpio y **las 183 pruebas anteriores más las 18 nuevas pasando**. |
| CA-10 | `verificar-despliegue.ps1` pasa sus diez comprobaciones contra la VM. |
| CA-11 | Tras un `desplegar.ps1` completo, los snippets siguen en `/iframes/` y las páginas de WordPress siguen funcionando sin que nadie toque nada. |
| CA-12 | La navegación completa del portal es posible solo con teclado, con foco visible, y los contrastes medidos cumplen AA. |

### 16.5 Entregables

| Entregable | Ubicación |
|---|---|
| Módulo público del backend | `backend/src/publico/` |
| Pruebas unitarias | `backend/src/publico/portal-publico.service.spec.ts` |
| Vistas, layout, servicio, composable y tipos | `frontend/src/` según 9.4 |
| Snippets de iframe | `frontend/public/iframes/` |
| Página de prueba | `frontend/public/iframes/prueba-vista.html` |
| Instructivo de WordPress | `documentacion/portal-publico/INTEGRACION-WORDPRESS.md` |
| Comprobaciones de despliegue | `despliegue/verificar-despliegue.ps1` |
| Ajuste de cabeceras | `frontend/public/.htaccess` |
| Este documento, aprobado | `documentacion/spec-portal-publico.md` |

### 16.6 Preguntas abiertas

Cada una con el **valor por defecto** que se aplicará si no hay respuesta antes
del fin de la semana 1. Ninguna bloquea el arranque del backend.

| # | Pregunta | Valor por defecto |
|---|---|---|
| **P-1** | **Participación ciudadana tiene una subsección en la base** (`ITSP-03-01`, "Información"), pero por D-11 nunca tendrá documentos. ¿Se muestra ese recuadro, se oculta, o se muestra la sección sin recuadros y solo con el marcador? | **Mostrar el marcador "Contenido próximamente" y, debajo, el recuadro de la subsección**, que al abrirse dice "Sin documentos publicados". Es lo coherente con D-12 (los nombres los manda la base) y con D-10. |
| **P-2** | El contenido de Participación ciudadana, ¿viene de los formularios del Observatorio de Datos? ¿Se **enlaza** desde la página de WordPress o se **incrusta** como un segundo iframe junto al de Muni Data? | **Se incrusta como un segundo iframe en la misma página de WordPress**, encima del de Muni Data, usando el snippet que el Observatorio ya provee. Muni Data no se entera y no se acopla a nada. |
| **P-3** | Alturas del iframe por sección. | **800 px** para ITSP-01 e ITSP-04; **650 px** para ITSP-02 e ITSP-03. Son los dos valores que el Observatorio ya usa en esa portada. |
| **P-4** | Nombre del archivo al descargar: ¿el título del documento saneado o el nombre original con que se subió? | **El título saneado** (`Informe de labores 2025.pdf`), con el nombre original como respaldo. Evita publicar nombres internos. |
| **P-5** | ¿Los PDF públicos deben ser **indexables** por buscadores? Un portal de transparencia normalmente querría que sí. | **No se declara nada** (`X-Robots-Tag` ausente), que es el comportamiento actual. Decidirlo requiere hablar de `sitemap` y de SEO, y eso no cabe en el plazo. |
| **P-6** | ¿Entienden los usuarios con permiso `documentos.publicar` que, a partir de esta entrega, "publicar" significa **publicar en Internet**? | **Se añade una advertencia** en el instructivo y se propone al PO añadirla también al diálogo de publicación en una entrega posterior. |
| **P-7** | ¿Quién revisa que un PDF no contenga datos personales antes de publicarlo? ¿Hay que revisar los que **ya** están publicados antes de abrir el portal? | **Sí: revisar lo ya publicado antes de abrir el portal.** Es una tarea del PO y de las dependencias, no del sistema, y conviene hacerla en la semana 1 o 2, no la noche anterior. |
| **P-8** | Coexistencia con el plugin de OneDrive ya instalado en WordPress: ¿interfiere con un bloque HTML personalizado? | **Se asume que no**, porque el bloque del Observatorio ya convive con él. Se verifica al crear la primera página. |
| **P-9** | El Observatorio embebido es oscuro y Muni Data será claro, en la misma portada. ¿Se acepta? | **Sí, claro** (D-7). Se le muestra al PO con los dos a la vista en la validación de 16.2 antes de cerrarlo. |
| **P-10** | ¿Se arregla en esta entrega el defecto preexistente de 7.2 (`window.location.href = '/login'` sin la ruta base)? | **Sí**, en un commit aparte marcado como defecto preexistente. |
| **P-11** | ¿Quién administra WordPress y puede crear las páginas y el menú? | **Pendiente, sin valor por defecto posible.** Es el riesgo R-1 y hay que resolverlo con una persona concreta, no con una suposición. |

---

## Anexo A — Resumen de la inspección del código (Paso 0)

Lo que se verificó antes de redactar, con el archivo donde está.

| Punto | Hallazgo |
|---|---|
| `@Publico()` | `src/comun/decoradores/publico.decorator.ts`. `JwtAuthGuard` lo consulta con `getAllAndOverride` y devuelve `true` **antes** de llamar a `super.canActivate`, así que una ruta marcada no pasa por Passport. Funciona. |
| `PermisosGuard` | Si el método no declara `@RequierePermisos()`, deja pasar sin mirar `request.user`. Una ruta `@Publico()` sin permisos declarados atraviesa los dos guards. Confirmado con `SaludController`, que es el precedente exacto. |
| Throttling | `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` global, y `ThrottlerGuard` es el **primer** guard global. `AutenticacionController` ya usa `@Throttle()` por método: el patrón para endurecer rutas concretas existe. |
| `main.ts` | **Sin helmet**: la API no emite ninguna cabecera de seguridad. `cookie-parser` activo. CORS con `credentials: true` y origen derivado de `FRONTEND_URL`. `trust proxy = 1` **solo si** `CONFIAR_EN_PROXY === 'true'`. Sin prefijo global. |
| Documentos y versiones | `estado` es `ENUM('BORRADOR','PUBLICADO','INACTIVO')`; `fecha_publicacion` se fija al publicar. La **versión vigente es la de mayor `numero_version`**. Publicar exige ≥1 versión. `verificarVisibilidad` ya responde **404 y no 403** a quien no gestiona, con el motivo explicado en el código. |
| Categorías ITSP | `/categorias-itsp/arbol` existe pero el controlador lleva `@RequierePermisos('catalogos.administrar')` **a nivel de clase**: **no es reutilizable** para el portal. La exclusión de Participación ciudadana es **por `codigo`** (`ITSP-03`), no por id ni por nombre, en `comun/constantes/categorias-itsp.ts` y espejada en `frontend/src/lib/documentos.config.ts`. |
| Almacenamiento y PDF | `abrirLectura` devuelve un `ReadStream`; `rutaAbsolutaDe` resuelve contra la raíz y **comprueba que no se salga de ella**. El controlador interno envía `Content-Type`, `Content-Length`, `Content-Disposition` con `filename` + `filename*` y `Cache-Control: private, no-store`. **No envía `nosniff`.** La descarga se registra en bitácora; la visualización no. |
| Router del frontend | `beforeEach` llama a `restaurarSesion()` **antes** de mirar `destino.meta`, así que lo hace también en las rutas públicas. El comodín redirige a `dashboard`. Ambos puntos requieren cambio (9.2). |
| `clienteHttp` | `withCredentials: true`; interceptor de petición que añade `Authorization`; interceptor de respuesta que renueva ante 401 y, si falla, hace `window.location.href = '/login?...'` **sin la ruta base** — defecto preexistente (7.2). |
| Patrón del frontend | `types → service → composable → view`, con `components/` y un único `layouts/AppShellLayout.vue`. Sin Pinia, por decisión anterior. |
| `frontend/public/` | Contiene hoy `.htaccess` y `favicon.ico`. Vite lo copia tal cual a `dist/`. |
| `DESIGN.md` | **Ya es un sistema claro**: `surface: #f9f9f9`, `primary: #a60001`, tipografía Public Sans, escala de 8 px, radio de 8 px, objetivo táctil de 44 px, y el token `deep-onyx: #0A0C11` que coincide con el fondo de la portada de WordPress. |
| `spec.md` previo | **No está en el repositorio.** Solo quedan referencias en el código a sus secciones 7, 10, 12 y 13, y a identificadores `RF-xx`, `RNF-xx`, `RN-xxx` y `VP-xx`. La estructura de este documento respeta esas cuatro anclas; el resto es reconstrucción declarada. |
| Cronograma de sprints | **No está en el repositorio.** El plan de 16.1 se propone desde cero sobre las 3 semanas que indica D-13. |
| `desplegar.ps1` | Reemplazo limpio del frontend, solo con el marcador `.munidata-despliegue` presente; copia `dist/*` y el `.htaccess` aparte. Verifica que el build produjo `index.html` y `.htaccess`. **Todo lo que deba sobrevivir tiene que salir del build.** |
| `verificar-despliegue.ps1` | Siete comprobaciones; las que dependen de `-UrlPublica` ya validan el frontend, el proxy de `/api` y una ruta profunda del SPA. Añadir las tres de 15.6 es seguir el patrón, no inventarlo. |
| Capturas del PO | Las cinco están en `documentacion/design/portal-publico/` y **no están versionadas** (carpeta sin seguimiento en git). Muestran: la portada oscura de WordPress, el iframe del Observatorio embebido y en página de prueba, y dos pantallas de otro municipio con el flujo de recuadros y la lista de documentos con icono PDF. Las subsecciones que aparecen en esa referencia **coinciden una a una** con las de `ITSP-01` en la base. |
