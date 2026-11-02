# Especificación — Favicon de Muni Data, Manual Técnico y Manual de Usuario

**Sistema Integral de Gestión Documental — Municipalidad de Palmares**
Documento para validación con el Product Owner (supervisor). Versión 1 — 2 de noviembre de 2026.

> **Estado: propuesta, pendiente de aprobación.** La Fase 1 (reconocimiento y
> esta spec) está cumplida. Las fases 2 a 5 empiezan solo cuando Gerald escriba
> «Spec validada, continúa».

---

# Resumen para el Product Owner

*Esta página se puede leer sola. El resto del documento es el detalle técnico.*

## Qué cambia

1. **El icono de la pestaña del navegador.** Deja de ser el logo por defecto de
   Vue y pasa a ser el monograma de Muni Data: una «M» blanca sobre fondo
   oscuro con una barra roja. Se reemplaza un único archivo y una línea de la
   página principal. No cambia nada más del sistema.
2. **Manual Técnico** (`documentacion/manual-tecnico.md`): para quien mantenga
   el sistema sin ayuda del autor. Arquitectura, base de datos, API, seguridad,
   despliegue y problemas frecuentes, tomado del código real.
3. **Manual de Usuario** (`documentacion/manual-usuario.md`): para
   funcionarios y administradores sin formación técnica, con unas veinte
   capturas de pantalla tomadas sobre datos ficticios.

## Qué NO incluye

- No se modifica ningún archivo de código salvo el favicon y su enlace.
- No se modifican `README.md`, `DESPLIEGUE.md` ni los documentos existentes de
  `documentacion/`.
- No se despliega nada en el servidor: el push y el redespliegue los hace
  Gerald.

## Lo que necesitamos que usted confirme

Los valores por defecto de la sección 3.1 (D-1 a D-14), en particular:
D-3 (el título de la pestaña se queda como está), D-5 (los manuales usan los
nombres reales de los roles: Superadministrador, Administrador y Usuario) y
D-8 (la carpeta es `documentacion`, sin tilde).

---

## 1. Contexto y objetivo

El frontend todavía muestra el favicon por defecto de Vue
(`frontend/public/favicon.ico`, una sola imagen de 32×32). Gerald eligió el
monograma de la opción B y lo copió como
`frontend/public/favicon-opcion-b-monograma.ico` (sin seguimiento en git).

El Perfil del Proyecto exige además un manual operativo con capturas
ilustradas y la documentación técnica para el traspaso. Esta spec fija:
cómo se reemplaza el favicon, el índice y las fuentes de ambos manuales, la
lista de capturas y las discrepancias encontradas entre el encargo y el código.

## 2. Alcance, fuera de alcance y supuestos

### 2.1 Alcance

- Favicon: reemplazo del archivo y del enlace en `frontend/index.html`.
- `documentacion/manual-tecnico.md` y `documentacion/manual-usuario.md`.
- Imágenes en `documentacion/imagenes/manual-usuario/`.
- Verificaciones V1 a V7 (favicon) y de la Fase 5 (manuales).

### 2.2 Fuera de alcance

- Crear variantes del icono (SVG, PNG, `apple-touch-icon`, manifest).
- Cambiar el título de la pestaña.
- Modificar `package.json`, `package-lock.json`, `README.md`, `DESPLIEGUE.md`,
  los specs anteriores, `DESIGN.md` o `INTEGRACION-WORDPRESS.md`.
- Push, despliegue o cualquier acción contra la VM.

### 2.3 Supuestos

- `main` coincide con `origin/main` (verificado: `git log origin/main..main`
  vacío al empezar).
- La base local de desarrollo solo tiene datos ficticios: hoy un usuario (el
  semilla), 0 documentos y 19 categorías. Se vuelve a comprobar antes de
  capturar.

## 3. Decisiones confirmadas

Tomadas por Gerald en el encargo; no se reabren.

| Id | Decisión |
|---|---|
| C-1 | El favicon es `favicon-opcion-b-monograma.ico`; no se crean otras variantes. |
| C-2 | Manuales en Markdown, preparados para convertir a PDF (formato de la sección 9). |
| C-3 | Commits locales en `main`, sin push; uno para la spec, uno para el favicon, uno por manual y uno para las imágenes. |
| C-4 | En los documentos no van IP, credenciales, la cuenta de correo del proyecto ni datos reales del municipio. |
| C-5 | Los manuales solo describen lo que existe en el código de `main`. |

### 3.1 Decisiones asumidas (valores por defecto)

| Id | Tema | Decisión propuesta | Motivo |
|---|---|---|---|
| D-1 | Archivo del favicon. | Un único `frontend/public/favicon.ico` con el contenido exacto, byte a byte, del monograma. Se borra `favicon-opcion-b-monograma.ico`. | Nada referencia el nombre largo; un solo archivo evita duplicados en `dist/`. |
| D-2 | Enlace en `index.html`. | `<link rel="icon" type="image/x-icon" sizes="16x16 32x32" href="%BASE_URL%favicon.ico?v=2">`. Probado en un build temporal: resuelve a `/munipalmares/wp-munidata/favicon.ico?v=2`. | `%BASE_URL%` es explícito y ya se usa en el mismo archivo; `?v=2` es necesario por la caché (D-4). |
| D-3 | Título de la pestaña. | Se queda «Muni Data — Municipalidad de Palmares», como está en `index.html`. V5 comprueba que empieza por «Muni Data» y lo reporta. | El encargo prohíbe cambiarlo. |
| D-4 | Caché del icono viejo. | Se usa `?v=2`. El `.htaccess` sirve los `.ico` con `max-age=31536000, immutable`: sin cambiar la URL, un navegador puede conservar el icono de Vue hasta un año. | Romper la caché sin tocar el `.htaccess`. |
| D-5 | Nombres de los roles. | Los manuales usan los nombres reales (`02-datos-iniciales.sql`): **Superadministrador** (administración TI), **Administrador** (funcionario que gestiona documentos y catálogos) y **Usuario** (consulta). El ciudadano y la Defensoría no tienen cuenta: usan el portal público. | El encargo nombra actores; el sistema tiene roles. Ver Δ-1. |
| D-6 | Cuadro duplicado del `.ico`. | El archivo trae 3 imágenes: 16×16 y dos de 32×32 idénticas byte a byte. Se deja tal cual. | Quitar el duplicado sería crear un archivo distinto (C-1); los navegadores eligen uno sin problema. |
| D-7 | Ubicación de esta spec. | `documentacion/spec-favicon-y-manuales.md`, archivo suelto. | Es la convención de los tres specs anteriores; no hay carpetas por spec. Ver Δ-6. |
| D-8 | Carpeta de los manuales. | `documentacion/` (sin tilde), que es la que existe. Imágenes en `documentacion/imagenes/manual-usuario/`. | El encargo dice «documentación/»; manda el repositorio. |
| D-9 | Herramienta de capturas. | `playwright-core` instalado en una carpeta temporal fuera del repo, usando el Chrome instalado (sin descargar Chromium). Viewport 1440×900, imágenes reducidas a 1280 px de ancho. | Evita descargar un navegador y no toca `package.json`. Si no fuera posible, se usa el mismo método con `puppeteer-core`, ya probado en este equipo. |
| D-10 | Credenciales para capturar. | El script lee la contraseña del administrador de una variable de entorno en tiempo de ejecución. Para no depender de la real, en una **copia temporal** de la base local se fija una contraseña de prueba solo para ese usuario. La base de desarrollo no se toca. | Ninguna credencial se imprime ni se escribe en el repo. |
| D-11 | Datos de las capturas. | En la copia temporal se crean, por la API, documentos y usuarios ficticios («Documento de ejemplo», «Usuaria de ejemplo») con PDFs generados. El correo del administrador semilla no aparece en ninguna captura: se recorta o se usa otro usuario ficticio. | Datos de ejemplo verosímiles sin datos reales. |
| D-12 | Niveles de categorías. | Los manuales dicen «hasta 10 niveles», que es el tope del código. | Ver Δ-5. |
| D-13 | Retención de la bitácora. | Se documenta como «3 meses por defecto, configurable con `BITACORA_RETENCION_MESES`», y se aclara que la purga de la bitácora sí borra físicamente esos registros; el «no borrado físico» aplica a documentos, versiones y catálogos. | Es lo que hace `bitacora-limpieza.service.ts`. |
| D-14 | `DESPLIEGUE.md`. | El Manual Técnico resume y enlaza a `despliegue/DESPLIEGUE.md` sin duplicarlo. Si al redactar se encuentra una contradicción con los scripts, se reporta y no se corrige (regla 5). | Encargo. |

## 4. Requisitos funcionales

| Id | Requisito |
|---|---|
| RF-1 | La pestaña del navegador muestra el monograma en el panel, el login y el portal. |
| RF-2 | `dist/` contiene `favicon.ico` con el contenido del monograma, y `dist/index.html` lo enlaza con el prefijo de la base. |
| RF-3 | No queda en el repo ningún icono ni recurso por defecto de Vue. |
| RF-4 | `manual-tecnico.md` cubre los 16 capítulos y el glosario del índice 9.2. |
| RF-5 | `manual-usuario.md` cubre los 12 capítulos del índice 9.3, con las capturas de 9.4. |

## 5. Requisitos no funcionales

- Los manuales se convierten a PDF A4 vertical sin retoques: formato de 9.1.
- Lenguaje claro, español de Costa Rica, trato de «usted» en el Manual de
  Usuario.
- Todo texto de pantalla citado se copia exacto de las vistas.
- Cero secretos (escaneo de la Fase 5).

## 6. Modelo de datos y migración

No aplica: no hay cambios de esquema ni scripts SQL.

## 7. Algoritmos

No aplica.

## 8. Contrato de la API (cambios)

No aplica: no cambia la API. El Manual Técnico documenta la existente (64
rutas en 13 controladores).

## 9. Frontend y documentos

### 9.1 Formato común de los manuales

- Un único `#` (título); luego `## 1.`, `### 1.1`, como máximo 4 niveles y sin
  saltos.
- Tras el título: tabla de control del documento (sistema, institución,
  versión 1.0, fecha 2026-11-02, autor, supervisor técnico/PO, supervisor
  académico) y tabla de historial de cambios. Sin tabla de contenido, sin
  front matter.
- Tablas de hasta 5 columnas; código con lenguaje y líneas de hasta 90
  caracteres; Mermaid solo `flowchart`, `erDiagram`, `stateDiagram-v2` o
  `sequenceDiagram`, de hasta 12 nodos.
- Avisos como `> **Nota:**` y `> **Advertencia:**`. Sin HTML, emojis,
  insignias, notas al pie ni marcadores de pendiente.

### 9.2 Índice del Manual Técnico y fuentes

| Capítulo | Fuentes en el código |
|---|---|
| 1. Introducción, alcance, actores y normativa | `README.md`, `02-datos-iniciales.sql`, specs de `documentacion/` |
| 2. Arquitectura general y stack | `backend/package.json`, `frontend/package.json`, `docker-compose.yml`, `despliegue/apache/munidata.conf` |
| 3. Estructura del repositorio | árbol de carpetas (`git ls-files`) |
| 4. Entorno de desarrollo y puesta en marcha | `README.md`, `docker-compose.yml`, `.env.example`, `frontend/.env.example`, `package.json` (scripts) |
| 5. Configuración | `.env.example`, `despliegue/.env.produccion.ejemplo`, `frontend/.env.*`, lecturas de `ConfigService` en `backend/src` |
| 6. Base de datos | `base-datos/scripts/init/01` a `10`, `backend/src/entidades/`, `app.module.ts` (`synchronize`), `bitacora-limpieza.service.ts` |
| 7. Backend | `backend/src/*/*.controller.ts`, `*.module.ts`, `autenticacion/`, `comun/guards`, `comun/servicios/usuario-actual.service.ts`, `comun/filtros/excepcion-global.filter.ts`, `main.ts`, `correo/`, `bitacora/` |
| 8. Gestión documental | `documentos/` (servicio, almacenamiento, versiones), `comun/constantes`, `01-esquema.sql` (CHECK de tamaño) |
| 9. Frontend | `frontend/src/` (types, services, composables, views, layouts, `router/index.ts`, `lib/tokenStore.ts`, `lib/tema.ts`, `assets/main.css`), `documentacion/design/DESIGN.md` |
| 10. Portal público y WordPress | `publico/`, `views/PortalNodoView.vue`, `PortalSeccionesView.vue`, `frontend/public/iframes/`, `INTEGRACION-WORDPRESS.md` |
| 11. Seguridad | `main.ts`, guards, throttler, `bcrypt`, `frontend/public/.htaccess`, `munidata.conf`, `.gitignore` |
| 12. Despliegue y operación | `despliegue/*.ps1`, `despliegue/DESPLIEGUE.md`, `base-datos/scripts/README.md` (solo estructura) |
| 13. Identidad visual | `frontend/public/favicon.ico`, `frontend/index.html`, `assets/main.css` |
| 14. Decisiones de arquitectura | specs de `documentacion/` y comentarios del código |
| 15. Problemas frecuentes | `DESPLIEGUE.md` §10, `verificar-despliegue.ps1`, mensajes de `comun/excepciones` |
| 16. Limitaciones y trabajo futuro | sección 16.4 de esta spec |
| Anexo A. Glosario | — |

Subsecciones previstas (`###`): 2.1 Componentes (flowchart), 2.2 Stack con
versiones; 4.1 Requisitos, 4.2 Base de datos con Docker, 4.3 Backend, 4.4
Frontend, 4.5 Pruebas; 5.1 Backend, 5.2 Frontend; 6.1 Diagrama (erDiagram),
6.2 Tablas, 6.3 Scripts y orden, 6.4 Semillas, 6.5 Retención de la bitácora;
7.1 Módulos, 7.2 Endpoints por módulo, 7.3 Autenticación (sequenceDiagram),
7.4 RBAC y orden de guards, 7.5 Errores y validación, 7.6 Correo, 7.7
Bitácora; 8.1 Almacenamiento, 8.2 Validación del PDF, 8.3 Estados
(stateDiagram-v2), 8.4 Versiones; 9.1 Estructura y patrón, 9.2 Router y
layouts, 9.3 Sesión sin Pinia, 9.4 Modo oscuro, 9.5 Sistema de diseño; 10.1
Rutas y endpoints públicos, 10.2 Iframes en WordPress; 12.1 Arquitectura del
despliegue, 12.2 Redespliegue, 12.3 Respaldos y restauración.

### 9.3 Índice del Manual de Usuario y fuentes

| Capítulo | Fuentes en el código |
|---|---|
| 1. Introducción y a quién va dirigido | `README.md` |
| 2. Requisitos y cómo ingresar | `LoginView.vue`, `RecuperarContrasenaView.vue`, `VerificarCorreoView.vue` |
| 3. Roles y qué puede hacer cada uno | `02-datos-iniciales.sql`, `09-permiso-reportes.sql`, `meta.permiso` de `router/index.ts` |
| 4. Navegación general y modo oscuro | `AppShellLayout.vue`, `DashboardView.vue`, `useTema.ts` |
| 5. Gestión de documentos | `DocumentosView`, `DocumentoRegistroView`, `DocumentoDetalleView`, `DocumentoFormularioView`, `lib/documentos.config.ts` |
| 6. Catálogos | `CategoriasItspView`, `CategoriaItspFormularioView`, `CatalogoSimpleView`, `lib/catalogos.config.ts` |
| 7. Usuarios, roles y permisos | `GestionUsuariosView`, `UsuarioFormularioView`, `RolesPermisosView` |
| 8. Bitácora | `BitacoraView.vue`, `lib/bitacora.config.ts`, `bitacora-limpieza.service.ts` |
| 9. Portal público de transparencia | `PortalSeccionesView.vue`, `PortalNodoView.vue`, `lib/portalPublico.config.ts` |
| 10. Preguntas frecuentes | lo anterior |
| 11. Mensajes de error comunes | `comun/excepciones/`, `lib/validaciones.ts`, mensajes de las vistas |
| 12. Glosario | — |

### 9.4 Capturas del Manual de Usuario

Viewport 1440×900, guardadas a 1280 px de ancho. «Admin» es el
Superadministrador de la copia temporal; «Funcionaria» es un usuario ficticio
con rol Administrador.

| Archivo | Pantalla | Rol | Datos mostrados |
|---|---|---|---|
| `01-inicio-sesion.png` | Login | Sin sesión | Formulario vacío |
| `02-recuperar-contrasena.png` | Recuperar contraseña | Sin sesión | Formulario vacío |
| `03-inicio.png` | Inicio | Admin | Indicadores con documentos ficticios |
| `04-inicio-modo-oscuro.png` | Inicio en modo oscuro | Admin | Igual que 03 |
| `05-menu-administrador.png` | Inicio con el menú reducido | Funcionaria | Menú sin Usuarios ni Bitácora |
| `06-documentos-lista.png` | Documentos | Admin | 5 documentos de ejemplo en los 3 estados |
| `07-registro-paso-1.png` | Nuevo documento, paso 1 | Funcionaria | PDF de ejemplo cargado |
| `08-registro-paso-2.png` | Nuevo documento, paso 2 | Funcionaria | Metadatos y selector de categoría abierto |
| `09-registro-paso-3.png` | Nuevo documento, paso 3 | Funcionaria | Resumen de revisión |
| `10-documento-detalle.png` | Detalle de documento | Admin | Metadatos, estado y versiones |
| `11-documento-editar.png` | Editar documento | Admin | Formulario con datos de ejemplo |
| `12-categorias-lista.png` | Categorías ITSP | Admin | Árbol con niveles y estados |
| `13-categoria-formulario.png` | Nueva categoría ITSP | Admin | Selector de categoría padre |
| `14-catalogo-tipos.png` | Tipos de Documento | Admin | Catálogo semilla |
| `15-usuarios-lista.png` | Gestión de Usuarios | Admin | Usuarios ficticios, correos ocultos o ficticios |
| `16-usuario-formulario.png` | Nuevo usuario | Admin | Formulario con datos ficticios |
| `17-roles-permisos.png` | Roles y Permisos | Admin | Matriz real de permisos |
| `18-bitacora.png` | Bitácora | Admin | Registros de la sesión de prueba |
| `19-portal-secciones.png` | Portal, portada | Público | Las cuatro secciones |
| `20-portal-seccion.png` | Portal, una sección | Público | Tarjetas de subsecciones |
| `21-portal-documentos.png` | Portal, subsección | Público | Lista con Ver y Descargar |

El texto de pantalla y el nombre exacto de cada vista se confirman al
capturar; si una pantalla no existe tal como se describe, se omite y se
reporta.

## 10. Manejo de errores

No aplica al favicon. Los manuales documentan los mensajes existentes
(capítulo 11 del Manual de Usuario y 15 del Técnico).

## 11. Reglas de negocio

No aplica: no se cambian reglas. Los manuales describen las existentes
(estados de documento, permisos, categorías hasta 10 niveles, Participación
ciudadana sin documentos, tamaño máximo de 40 MB y solo PDF).

## 12. Seguridad y accesibilidad

- Escaneo de la Fase 5 sobre `documentacion/`: IPs distintas de
  `127.0.0.1`, «@gmail», «AnyDesk», cadenas con forma de secreto y los
  valores del usuario semilla. Cero hallazgos.
- Marcadores permitidos: `<IP_O_DOMINIO_DEL_SERVIDOR>`,
  `<CORREO_DEL_PROYECTO>`.
- Las variables de entorno se documentan solo por nombre.
- Las imágenes llevan texto alternativo y pie de figura.

## 13. Rendimiento

No aplica. El favicon pesa 9710 bytes.

## 14. Pruebas

### 14.1 Favicon (Fase 2)

| Id | Verificación |
|---|---|
| V1 | Encabezado del `.ico` (tipo 1, cuadros 16×16 y 32×32); cada cuadro extraído a PNG, ampliado ×8 sobre fondo claro y oscuro y revisado a la vista. |
| V2 | `npm run build`: `dist/index.html` enlaza `/munipalmares/wp-munidata/favicon.ico?v=2` y `dist/favicon.ico` es idéntico al de `public/`. |
| V3 | `npm run preview` (con la misma base): la URL del icono responde 200 con tipo de imagen y el tamaño coincide. Se detiene el servidor. |
| V4 | Búsqueda en el repo (sin `node_modules` ni `dist`): sin restos de Vue ni recursos huérfanos. |
| V5 | Navegador headless en el login: el `link rel="icon"` responde 200; el título empieza por «Muni Data» (D-3). |
| V6 | `desplegar.ps1` copia `dist\*` completo y el `.htaccess` aparte; el fallback SPA solo atiende lo que no existe como archivo. Ya comprobado en el reconocimiento (Anexo A.3). |
| V7 | `git status` limpio salvo los PNG de diseño sin seguimiento. |

### 14.2 Manuales (Fase 5)

1. Escaneo de secretos (12).
2. Script temporal que comprueba que cada ruta de archivo, variable, endpoint,
   tabla y script citado existe en el código.
3. Enlaces a imágenes, bloques de código cerrados y niveles de encabezado.
4. Relectura completa y coherencia de nombres («Muni Data»).

## 15. Despliegue

No se despliega. Le corresponde a Gerald: `git push`, `git pull` en la VM,
`desplegar.ps1` y recargar con Ctrl+F5. Con `?v=2` el icono nuevo aparece aunque
el navegador conserve el anterior en caché; si una pestaña ya abierta sigue
mostrando el viejo, basta cerrarla y abrirla de nuevo.

## 16. Plan de trabajo, riesgos, criterios de aceptación y preguntas abiertas

### 16.1 Orden

1. Fase 2: favicon y V1 a V7; un commit.
2. Fase 3: Manual Técnico por etapas (esqueleto, capítulos); un commit.
3. Fase 4: entorno local, capturas y Manual de Usuario; un commit para el
   manual y otro para las imágenes.
4. Fase 5: verificación final y reporte.

### 16.2 Riesgos

| Id | Riesgo | Mitigación |
|---|---|---|
| R-1 | Una captura muestra un correo o un dato real. | Copia temporal con datos ficticios; revisión de cada imagen. |
| R-2 | Un dato del manual queda desactualizado frente al código. | Comprobación automática de la Fase 5. |
| R-3 | El navegador conserva el icono viejo. | `?v=2` (D-4). |
| R-4 | No se puede instalar Playwright. | `puppeteer-core` con el Chrome instalado (D-9) o lista de capturas para tomar a mano. |

### 16.3 Criterios de aceptación

- CA-1. V1 a V7 en OK, o justificadas como NO VERIFICADO.
- CA-2. Ambos manuales cumplen 9.1 y pasan la Fase 5 sin hallazgos.
- CA-3. Cada captura de 9.4 existe o figura en la lista de faltantes.

### 16.4 Limitaciones que el Manual Técnico registrará como trabajo futuro

- Interoperabilidad con DECSA, SITRIMU y Strategos: no existe código (búsqueda
  sin resultados).
- Participación ciudadana: sección del portal sin contenido; se llena desde
  WordPress.
- No hay exportación de la bitácora antes de su purga (lo dice
  `bitacora-limpieza.service.ts`).
- En la bitácora, `camposActualizados` anota todos los campos que envía el
  formulario aunque no cambien (pendiente registrado en la ronda anterior).
- `.env.example` de la raíz no incluye `RUTA_ALMACENAMIENTO`, `HOST_ESCUCHA`
  ni `CONFIAR_EN_PROXY` (sí están en `despliegue/.env.produccion.ejemplo`).

### 16.5 Preguntas abiertas

Ninguna bloqueante: se aplican los valores por defecto de 3.1.

---

## Anexo A — Resultado del reconocimiento

### A.1 Favicon

| Archivo | Bytes | Imágenes | Formato |
|---|---|---|---|
| `public/favicon.ico` (Vue) | 4286 | 1: 32×32 | BMP 32 bits |
| `public/favicon-opcion-b-monograma.ico` | 9710 | 3: 16×16, 32×32, 32×32 | BMP 32 bits |

- Encabezado válido en ambos (reservado 0, tipo 1). Los dos cuadros de 32×32
  del monograma son idénticos (0 bytes distintos de 4264).
- Única referencia: `frontend/index.html`, `<link rel="icon" href="/favicon.ico">`.
  Vite ya le antepone la base al compilar (`dist/index.html` enlaza
  `/munipalmares/wp-munidata/favicon.ico`), así que hoy no estaba roto.
- No hay `vite.svg`, `logo.svg`, `HelloWorld`, `TheWelcome` ni manifest en el
  repo. `src/assets/` solo contiene `main.css`.
- Las páginas de `public/iframes/` no enlazan favicon (dentro del iframe manda
  el de WordPress).
- Prueba en una copia temporal: `/favicon.ico?v=2` y
  `%BASE_URL%favicon.ico?v=2` producen ambos
  `/munipalmares/wp-munidata/favicon.ico?v=2`.

### A.2 Base de Vite y título

- `vite.config.ts`: `base` = `VITE_RUTA_BASE` o `/`;
  `frontend/.env.production` fija `/munipalmares/wp-munidata/`.
- `<title>Muni Data — Municipalidad de Palmares</title>`.

### A.3 Apache y despliegue

- `frontend/public/.htaccess`: `RewriteBase /munipalmares/wp-munidata/`;
  excluye `api`; sirve tal cual lo que existe como archivo o carpeta
  (`-f`/`-d`); el resto va a `index.html`. Los `.ico` llevan
  `Cache-Control: public, max-age=31536000, immutable`.
- `despliegue/apache/munidata.conf`: `ProxyPass` de
  `/munipalmares/wp-munidata/api` a `http://127.0.0.1:3100`.
- `desplegar.ps1`: `npm ci`, `npm run build`, comprueba `dist\index.html` y
  `dist\.htaccess`, vacía la carpeta de destino solo si tiene el marcador del
  sistema y copia `dist\*` más el `.htaccess` aparte.

### A.4 Estado de los ajustes del 29 de octubre

Todos implementados y publicados (`origin/main` = `main`):

| Ajuste | Estado | Commits |
|---|---|---|
| Estados con color (Publicado verde, Borrador amarillo, Inactivo rojo; Activo verde, Inactivo rojo) | Implementado | `eca7408` |
| Quitar las migas dentro de los iframes | Implementado | `7444a99` |
| Subcategorías de varios niveles | Implementado, con tope de 10 niveles | `9d2f3f6`, `ff7ef4f`, `b37defb`, `a14d41f`, `fe7ac91`, `54736f5`, `1adea44` |
| Documentación de la actualización 2 | Implementada | `c33d736` |

### A.5 Discrepancias entre el encargo y el código

| Id | Encargo | Código | Resolución propuesta |
|---|---|---|---|
| Δ-1 | Roles: Administrador TI, Funcionario Municipal, Ciudadano/Defensoría. | Roles: Superadministrador, Administrador, Usuario. El ciudadano no tiene cuenta. | D-5. |
| Δ-2 | Carpeta «documentación/». | `documentacion/` sin tilde. | D-8. |
| Δ-3 | Título de la pestaña «Muni Data». | «Muni Data — Municipalidad de Palmares». | D-3: no se cambia; se reporta. |
| Δ-4 | El `.ico` contiene 16×16 y 32×32. | Contiene 16×16 y dos 32×32 idénticos. | D-6. |
| Δ-5 | «Subsecciones sin restricción fija de niveles». | Tope de 10 niveles (`PROFUNDIDAD_MAXIMA_CATEGORIAS`). | D-12. |
| Δ-6 | Spec en «carpeta propia». | Los specs son archivos sueltos en `documentacion/`. | D-7. |
| Δ-7 | Tipografía Public Sans. | Public Sans en el sistema; el portal público usa Poppins (estilo del Observatorio, spec-ajustes-posdespliegue §9.2). | Se documentan ambas. |
| Δ-8 | Primary #D30505, Secondary #1D2327. | En `main.css`, #d30505 es `primary-container` (botones) y `primary` es #a60001; #1D2327 es superficie oscura y fondo del portal. | Se documentan los tokens reales. |
| Δ-9 | Portal en `/vista/itsp-NN`. | Además `/vista/codigo` abre cualquier categoría (ronda del 29-oct). | Se documentan las tres formas de URL. |
| Δ-10 | Variable de almacenamiento. | Se aceptan `RUTA_ALMACENAMIENTO` y `ALMACENAMIENTO_RUTA`. | Se documentan las dos, recomendando la primera. |
| Δ-11 | — | Existe el permiso `reportes.consultar` (indicadores de Inicio). | Entra en la matriz de permisos. |
| Δ-12 | — | La purga de la bitácora borra físicamente. | D-13. |
