# Especificación — Cierre de la PPS: README, configuración, guía de despliegue e insumos verificados

**Muni Data — Sistema Integral de Gestión Documental y Portal Web de Gobierno Abierto y Transparencia Municipal, Municipalidad de Palmares**
Documento para validación con el Product Owner (supervisor). Versión 1 — 9 de noviembre de 2026.

> **Estado: propuesta, pendiente de aprobación.** La Fase 1 (reconocimiento,
> auditoría y esta spec) está cumplida. La Fase 2 empieza solo cuando Gerald
> escriba «Spec validada, continúa».

---

# Resumen para el Product Owner

*Esta página se puede leer sola. El resto del documento es el detalle técnico.*

## Qué cambia

1. **`README.md` de la raíz.** Se reescribe: hoy se llama «Sistema Integral de
   Gestión Documental…», cita una carpeta `docker/` que no existe y no explica
   cómo arrancar el proyecto. Pasa a llamarse **Muni Data**, describe el
   stack real y la puesta en marcha en desarrollo, y enlaza a la guía de
   despliegue y a los manuales.
2. **`base-datos/scripts/README.md`.** Se quitan el correo y la contraseña del
   usuario semilla, que hoy están escritos en claro.
3. **`.env.example` de la raíz.** Se agregan las variables que el backend usa
   y faltan (`NODE_ENV`, `RUTA_ALMACENAMIENTO`, `HOST_ESCUCHA`,
   `CONFIAR_EN_PROXY`) y se quitan tres que nada usa.
4. **`despliegue/DESPLIEGUE.md`.** Se corrigen 13 discrepancias con los scripts
   reales. La más importante: **la restauración de la base de datos, tal como
   está escrita, falla**, porque usa un usuario sin permiso para crear
   tablas. Se agrega además un procedimiento de prueba de restauración y una
   sección sobre el `git pull` cuando el repositorio pase a ser privado.
5. **Insumos para la documentación final** (`documentacion/insumos-cierre/`,
   fuera de git): modelo de datos real, estado de los 58 RF y 20 RNF, y
   métricas del proyecto, todo sacado del código.

## Qué NO incluye

- No se modifica código fuente, estilos, vistas, scripts `.ps1` ni scripts SQL.
- No se hace push ni se ejecuta nada contra la VM.
- No se reescribe el historial de git (hay hallazgos en él: sección 16.6).

## Lo que necesitamos que usted confirme

Los valores por defecto de la sección 3.1 (D-1 a D-12), en particular:
D-4 (cómo se explica el cambio de contraseña del usuario semilla, porque el
sistema no obliga a cambiarla y no tiene pantalla de «cambiar contraseña»),
D-6 (`SMTP_FROM` queda vacío en `.env.example`) y D-9 (la restauración se
documenta con `root`).

---

## Índice

1. Contexto y objetivo
2. Alcance, fuera de alcance y supuestos
3. Decisiones confirmadas
4. Requisitos funcionales
5. Requisitos no funcionales
6. Modelo de datos y migración
7. Algoritmos
8. Contrato de la API (cambios)
9. Documentos: contenido propuesto
10. Manejo de errores
11. Reglas de negocio
12. Seguridad y accesibilidad
13. Rendimiento
14. Pruebas y verificación
15. Despliegue
16. Plan de trabajo, riesgos, criterios de aceptación, hallazgos y discrepancias

---

## 1. Contexto y objetivo

La PPS termina. Antes de entregar y de hacer privado el repositorio hay que
dejar la documentación de entrada (README, plantillas de configuración y
guía de despliegue) alineada con el código, y producir insumos verificados
para el informe final. El Manual Técnico ya registra dos de estas faltas como
limitaciones (`documentacion/manual-tecnico.md:132` y `:914`): el README cita
`docker/` y el `.env.example` no trae `RUTA_ALMACENAMIENTO`, `HOST_ESCUCHA` ni
`CONFIAR_EN_PROXY`.

## 2. Alcance, fuera de alcance y supuestos

### 2.1 Alcance

- `README.md` (raíz), `base-datos/scripts/README.md`, `.env.example` (raíz),
  `despliegue/DESPLIEGUE.md`.
- Tres archivos nuevos sin seguimiento en `documentacion/insumos-cierre/`.
- Esta spec.

### 2.2 Fuera de alcance

- Código, estilos, vistas, scripts SQL y `.ps1`.
- `despliegue/.env.produccion.ejemplo`, `backend/README.md`,
  `frontend/README.md`, los manuales y los specs anteriores (tienen
  hallazgos, que solo se reportan: 16.7).
- Push, despliegue, acciones en la VM, reescritura del historial.

### 2.3 Supuestos

- Al empezar, `git status` limpio y `main` un commit por delante de
  `origin/main` (`c68cbae docs: ruta de NSSM en la guía de despliegue`).
- `documentacion/insumos-cierre/` ya está en `.git/info/exclude`.
- La ruta real de NSSM en la VM es `C:\tools\nssm.exe` (confirmado por
  Gerald).

## 3. Decisiones confirmadas

| Id | Decisión |
|---|---|
| C-1 | La guía es `despliegue/DESPLIEGUE.md` y la carpeta es `documentacion/` (sin tilde). |
| C-2 | Los insumos van en `documentacion/insumos-cierre/` y no se versionan. |
| C-3 | Commits locales en `main`, sin push: spec, README raíz, README de scripts + `.env.example`, `DESPLIEGUE.md`. |
| C-4 | Ningún archivo ni reporte contiene IP de la VM, credenciales (incluido el usuario semilla), secretos, valores de `.env`, la cuenta de correo del proyecto ni datos de AnyDesk. |
| C-5 | No se tocan interfaz, estilos, botones ni la regla raíz↔subsección. |

### 3.1 Decisiones asumidas (valores por defecto)

| Id | Tema | Decisión propuesta | Motivo |
|---|---|---|---|
| D-1 | Ubicación de esta spec. | `documentacion/spec-cierre-pps-readme-insumos.md`, archivo suelto. | Es la convención de los cuatro specs anteriores; no hay carpetas por spec (Δ-3). |
| D-2 | `.env` de desarrollo. | Un único `.env` en la raíz, copiado de `.env.example`. | El backend lo lee con `envFilePath: '../.env'` (`backend/src/app.module.ts:45`) y Docker Compose lee el `.env` de la raíz para `MYSQL_*`. |
| D-3 | Variables del frontend. | El README remite a `frontend/.env.example` (copiar como `frontend/.env.local`); no se mezclan en el `.env` raíz. | Vite solo lee los `.env*` de `frontend/`. |
| D-4 | Usuario semilla. | Ni el README raíz ni el de scripts escriben correo ni contraseña. Dicen: se define en `init/06-usuario-superadministrador.sql`; solo existe en desarrollo (`preparar-base-datos.ps1` lo omite); **el sistema no obliga a cambiarla**, así que hay que cambiarla a mano en el primer ingreso con «¿Olvidó su contraseña?» (en desarrollo el correo se ve por el enlace de Ethereal que deja el log del backend). | No hay endpoint de cambio de contraseña autenticado ni bandera de «debe cambiar» (Δ-4). |
| D-5 | Variables que sobran. | Se quitan `NOMBRE_APLICACION`, `ENTORNO` y `PUERTO_FRONTEND`. `ENTORNO` se sustituye por `NODE_ENV`. | Ningún archivo `.ts`, `.vue`, `.ps1` ni `.yml` las lee. |
| D-6 | `SMTP_FROM` en `.env.example`. | Queda vacío, con comentario: si está vacío se usa el remitente por defecto de `correo.service.ts`. | Hoy trae una dirección institucional con forma de real. La constante del código no se toca (Δ-11). |
| D-7 | `ALMACENAMIENTO_RUTA`. | No se agrega; el comentario de `RUTA_ALMACENAMIENTO` dice que el backend acepta ese nombre antiguo. | Alias heredado (`almacenamiento-documentos.service.ts:77-89`). |
| D-8 | `ADMIN_*` (script `crear:administrador`). | No van en `.env.example`. | Solo las usa `crear-administrador.ps1` en producción, por ejecución, y una es una contraseña. |
| D-9 | Restauración de la base. | `DESPLIEGUE.md` restaura con `root` (o un usuario con DDL), no con `munidata_app`. | `munidata_app` solo tiene `SELECT, INSERT, UPDATE, DELETE` (`preparar-base-datos.ps1:627`) y el volcado trae `DROP/CREATE TABLE` y rutinas (`respaldar.ps1:445`, `--routines`). |
| D-10 | Ruta de `httpd.exe`. | En 4.4, 4.6 y 10.1, `httpd` pasa a `C:\Apache24\bin\httpd.exe`, como en 2.1 y 2.6. | Coherencia interna; la guía ya asume esa ruta. |
| D-11 | Licencia en el README. | Sin sección de licencia; solo «Proyecto privado (`"private": true`, `UNLICENSED`)». | Es lo que declara `backend/package.json`; elegir licencia no es decisión técnica. |
| D-12 | README de backend y frontend. | El README raíz no los enlaza. | Son las plantillas por defecto de Nest y Vite, en inglés (Δ-10). |

## 4. Requisitos funcionales

| Id | Requisito |
|---|---|
| RF-C1 | El README raíz cubre las secciones de 9.1, sin rutas, comandos ni variables inexistentes. |
| RF-C2 | El README de scripts no contiene credenciales y explica dónde está y cómo se trata el usuario semilla. |
| RF-C3 | `.env.example` lista exactamente las variables que leen el backend y `docker-compose.yml` (salvo D-7 y D-8). |
| RF-C4 | `DESPLIEGUE.md` corrige D-01 a D-13 de 9.4 y agrega 9.4.1 y 9.4.2. |
| RF-C5 | Los tres insumos de 9.5 existen, con evidencia por línea. |

## 5. Requisitos no funcionales

- Español de Costa Rica; en `DESPLIEGUE.md` se mantiene el trato de «usted».
- Cero secretos, IP o correos reales en lo creado o cambiado (escaneo de 14.1).
- Cada cifra de los insumos se puede rehacer con el comando o archivo citado.

## 6. Modelo de datos y migración

No aplica: no hay cambios de esquema ni scripts SQL. El modelo real se
documenta en el insumo A (9.5).

## 7. Algoritmos

No aplica.

## 8. Contrato de la API (cambios)

No aplica: la API no cambia.

## 9. Documentos: contenido propuesto

### 9.1 `README.md` (raíz)

1. **Muni Data**, con el nombre completo como subtítulo.
2. **Contexto**: PPS de la Universidad Nacional, Municipalidad de Palmares,
   autor Gerald Huertas Rodríguez, 2026.
3. **Qué hace**: panel interno (documentos con versiones, catálogos y
   categorías ITSP de hasta 10 niveles, usuarios y roles, bitácora, reportes)
   y portal público de transparencia de solo lectura, incrustado en WordPress
   por iframes.
4. **Stack** (versiones de `package.json`): NestJS 11 + TypeORM + TypeScript;
   Vue 3 + Vite 8 + Vue Router + Tailwind CSS 4; MySQL 8.0; Node.js ≥ 22
   (frontend: `^22.18.0 || >=24.12.0`). En desarrollo, MySQL en Docker
   Compose. En producción, Windows Server con Apache (frontend estático y
   proxy de `/api`), el backend como servicio NSSM `MuniData-API` y solo HTTPS.
5. **Estructura**: `backend/`, `frontend/`, `base-datos/` (`scripts/init`,
   `scripts/diagnostico`, `respaldos/`), `despliegue/` (scripts `.ps1` y
   `apache/munidata.conf`), `documentacion/`, `docker-compose.yml`,
   `.env.example`.
6. **Requisitos de desarrollo**: Node.js y npm, Docker con Compose, Git.
7. **Puesta en marcha**:
   1. `Copy-Item .env.example .env`, generar los dos secretos JWT con el
      comando del propio archivo y poner contraseñas locales.
   2. `docker compose up -d`: la primera vez MySQL ejecuta `base-datos/scripts/init/`
      en orden alfabético (tabla 01 a 10 con una línea por script). Volver a
      empezar: `docker compose down -v`.
   3. Backend: `cd backend`, `npm ci`, `npm run start:dev` (puerto 3000).
   4. Frontend: `Copy-Item frontend\.env.example frontend\.env.local`,
      `cd frontend`, `npm ci`, `npm run dev` (puerto 5173).
   5. Primer ingreso: según D-4, sin credenciales.
8. **Comandos**: backend `build`, `start:prod`, `test`, `test:cov`,
   `test:e2e`, `lint`, `format`, `correo:verificar`; frontend `build`,
   `type-check`, `preview`.
9. **Despliegue**: un párrafo y el enlace a `despliegue/DESPLIEGUE.md`.
10. **Documentación**: `documentacion/manual-tecnico.md`,
    `documentacion/manual-usuario.md`, `documentacion/design/DESIGN.md`,
    `documentacion/portal-publico/INTEGRACION-WORDPRESS.md` y los `spec-*.md`.
11. **Seguridad**: los `.env` no se versionan (`.gitignore`); el repositorio
    será privado.
12. **Autoría**: Gerald Huertas Rodríguez; proyecto privado (D-11).

### 9.2 `base-datos/scripts/README.md`

- Título: «Scripts de base de datos — Muni Data».
- La sección «Credenciales del usuario semilla» (líneas 31-40) se sustituye
  por «Usuario semilla de desarrollo», con el texto de D-4 y sin valores.
- Se agrega una nota: en producción `preparar-base-datos.ps1` omite el 06 y el
  administrador se crea con `crear-administrador.ps1`.
- Se arreglan los bloques de código de las líneas 47-50 y 62-64, que hoy
  llevan las comillas invertidas escapadas (`\`\`\``) y no se ven como código.
- La tabla de scripts y el ejemplo de respaldo se mantienen.

### 9.3 `.env.example` (raíz): versión propuesta

Se conservan sin cambios los bloques MySQL, `BD_*`, JWT, bcrypt, bloqueo,
tokens, SMTP (salvo `SMTP_FROM`) y retención, con sus comentarios. Cambia la
cabecera y se agregan dos bloques:

```dotenv
# ============================================================
# Muni Data — variables de DESARROLLO (copie como .env en la raíz)
# ============================================================
# Lo leen el backend (envFilePath '../.env') y docker-compose.yml.
# Producción usa despliegue/.env.produccion.ejemplo, no este archivo.

# development en local. Con "production" la cookie del refresh sale con
# secure=true (no viaja por http://localhost), TypeORM deja de registrar
# consultas y el correo nunca usa la cuenta de pruebas de Ethereal.
NODE_ENV=development

# Backend
PUERTO=3000
# Vacío: Nest escucha en todas las interfaces. En producción vale 127.0.0.1.
HOST_ESCUCHA=
# true solo detrás de un proxy inverso (Apache en producción). Con true y sin
# proxy, cualquier cliente podría falsificar su IP con X-Forwarded-For.
CONFIAR_EN_PROXY=false

# URL del frontend: enlaces de los correos y origen permitido por CORS.
FRONTEND_URL=http://localhost:5173

# ... (MySQL, BD_*, autenticación: sin cambios) ...

# ============================================================
# Almacenamiento de documentos
# ============================================================
# Carpeta raíz de los PDF (se guardan en <raíz>/documentos/<uuid>.pdf).
# Vacío: backend/storage. Admite ruta absoluta. El backend acepta también el
# nombre antiguo ALMACENAMIENTO_RUTA; si están los dos, manda este.
RUTA_ALMACENAMIENTO=

# ... (SMTP sin cambios, salvo:) ...
# Vacío: se usa el remitente por defecto definido en el backend.
SMTP_FROM=
```

Se quitan `NOMBRE_APLICACION`, `ENTORNO` y `PUERTO_FRONTEND` (D-5).

### 9.4 `despliegue/DESPLIEGUE.md`: correcciones

| Id | Lugar | Hoy dice | Corrección | Evidencia |
|---|---|---|---|---|
| D-01 | 1.1 | Node «20 o superior» | 22 o superior (frontend `^22.18.0 \|\| >=24.12.0`) | `backend/package.json` y `frontend/package.json`, `engines` |
| D-02 | 3.2 | `Scripts aplicados ahora : 8` | `9` (01-05 y 07-10) | `base-datos/scripts/init/` tiene 10 scripts y el 06 se omite |
| D-03 | 3.5 | «eso se hace en el paso 3» | «en la sección 4» | Apache se configura en la sección 4 |
| D-04 | 4.4, 4.6, 10.1 | `httpd -t`, `httpd -M` | `C:\Apache24\bin\httpd.exe -t` / `-M` | D-10 |
| D-05 | 4.5 | «las siete comprobaciones» | diez | `verificar-despliegue.ps1:447-464` |
| D-06 | 5, 11 | «límite absoluto de 8 horas» | La sesión vence de forma absoluta cuando se cumple `JWT_REFRESH_EXPIRATION` desde el inicio de sesión: 2 h con la plantilla, 8 h si la variable falta | `autenticacion.service.ts:300-334` (la renovación hereda la fecha; el valor por defecto es `'8h'`); `.env.produccion.ejemplo:86` |
| D-07 | 6 | `desplegar.ps1 -RutaHtdocs …` sin `-RutaNssm` | Agregar `-RutaNssm "C:\tools\nssm.exe"` | 3.3 y 10.9: en la VM NSSM no está en el `PATH` |
| D-08 | 7 | `-RutaNssm "C:\ruta\a\nssm.exe"` (2 veces) | `"C:\tools\nssm.exe"` | Coherencia con `c68cbae` |
| D-09 | 8.1, 11 | «Conserva los 14 más recientes» / «14 días» | La rotación cuenta también las carpetas que crea `desplegar.ps1`, que solo tienen código; cada despliegue reduce los días de respaldo de datos que quedan | `respaldar.ps1:524-541`, `desplegar.ps1:97-101,1270-1312` |
| D-10 | 8.2 | Restaurar con `mysql -u munidata_app` | Con `root` (D-9), por `cmd /c` y la ruta completa de `mysql.exe`, con el servicio detenido | `preparar-base-datos.ps1:627`, `respaldar.ps1:445` |
| D-11 | 8.2 | `nssm restart MuniData-API` | `& "C:\tools\nssm.exe" restart MuniData-API` | NSSM fuera del `PATH` |
| D-12 | 8.3 | Solo el `Expand-Archive` | Aclarar que el zip trae la subcarpeta `documentos\` y que se expande en la raíz `C:\munidata\storage\documentos`; con el servicio detenido | `respaldar.ps1:89,505`, `almacenamiento-documentos.service.ts:45,136` |
| D-13 | 8.4 | «los once puntos de la sección 9» | nueve | La sección 9 tiene 9 puntos |

#### 9.4.1 Restauración: procedimiento nuevo (sustituye 8.2 y 8.3)

1. Respaldo del estado actual (`respaldar.ps1`).
2. Detener el servicio: `& "C:\tools\nssm.exe" stop MuniData-API`.
3. Descomprimir `base-datos.sql.gz` con la línea de `node` existente.
4. Cargar con `root`:
   `cmd /c '"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p munidata < restaurar.sql'`.
5. Documentos: `Expand-Archive … -DestinationPath C:\munidata\storage\documentos -Force`.
6. Borrar `restaurar.sql`, arrancar el servicio y ejecutar
   `verificar-despliegue.ps1 -UrlPublica …`.

**Prueba de restauración** (recomendada una vez, sin tocar la base real):
crear con `root` una base temporal `munidata_prueba_restauracion`, cargar ahí
el volcado, comparar `SELECT COUNT(*)` de `documentos`, `usuarios`,
`categorias_itsp` y `bitacora_logs` con la base real, comprobar que
`documentos.zip` se abre y que un `ruta_archivo` tomado al azar existe dentro
del zip, y borrar la base temporal con `DROP DATABASE`. Cada paso es un
comando copiable.

#### 9.4.2 Sección nueva: repositorio privado

- Cuando el repositorio pase a privado, `git clone` y `git pull` en la VM
  pedirán credenciales.
- Recomendación: un token *fine-grained* de GitHub limitado a este
  repositorio, con permiso **Contents: Read-only** y fecha de vencimiento.
- Se guarda una sola vez en el Administrador de credenciales de Windows por
  medio de Git Credential Manager, que viene con Git para Windows: en el
  primer `git pull`, usuario de GitHub y token como contraseña. Para
  comprobarlo: `git config --get credential.helper` debe responder `manager`.
- Nunca dentro de la URL del remoto, ni en scripts ni en `.env`.
- Rotación o revocación: vencido o revocado el token, se borra la entrada
  `git:https://github.com` en el Administrador de credenciales y se repite el
  `git pull`.
- 3.1 remite a esta sección. No se escribe ningún token ni valor.

### 9.5 Insumos (`documentacion/insumos-cierre/`, sin seguimiento)

**A) `modelo-datos-real.md`.** Fuente: los scripts `init/01` a `10`, leídos en
orden, contrastados con `backend/src/entidades/*.entidad.ts` y, si Docker está
disponible, con `SHOW CREATE TABLE` sobre una base temporal levantada en un
contenedor aparte (puerto distinto; no se toca el volumen de desarrollo).
Contenido: por tabla, columnas (tipo, nulabilidad, valor por defecto), PK, FK
con `ON UPDATE` y `ON DELETE`, `UNIQUE`, `CHECK` e índices; relaciones con
cardinalidad; enumeraciones; triggers, procedimientos y eventos (en especial
cualquier protección de `bitacora_logs` contra `UPDATE`/`DELETE`, o la
constancia de que no existe); orden y efecto de cada script; semillas RBAC
(3 roles, 10 permisos, matriz rol×permiso) sin usuarios; diferencias
entidad↔script.

**B) `estado-requerimientos.md`.** Una tabla por grupo con RF-001 a RF-058 y
RNF-001 a RNF-020: estado (IMPLEMENTADO / PARCIAL / NO IMPLEMENTADO / NO
VERIFICABLE EN CÓDIGO), evidencia (archivo:línea, endpoint o vista) y una
nota. Adelanto del reconocimiento, por confirmar: RF-005 (cambio de
contraseña) y RF-015 (actualizar perfil) apuntan a NO IMPLEMENTADO o PARCIAL,
porque solo existen `GET /auth/perfil` y la recuperación por correo. Al final,
«Funcionalidades implementadas que no están en la lista», cada una
verificada: verificación de correo, bloqueo por intentos, retención de la
bitácora, portal por iframes, modo oscuro, reportes del panel, `/salud`,
limitación de tasa, códigos de categoría automáticos y N niveles.

**C) `metricas-proyecto.md`.** Fechas del primer y del último commit; tabla de
commits por semana ISO; commits agrupados por tema con su rango de fechas
(asuntos de commit, enmascarados si hiciera falta); líneas por área
(`backend/src`, `frontend/src`, `base-datos/scripts`, sin `node_modules`,
`dist` ni lockfiles, contadas sobre `git ls-files`); número de módulos Nest
(`*.module.ts`), endpoints (decoradores HTTP), entidades, vistas,
composables, servicios del frontend y scripts SQL; pruebas automáticas
(archivos `*.spec.ts` y resultado de `npm test` y `npm run test:e2e` si se
pueden ejecutar sin base de datos; si no, se dice).

## 10. Manejo de errores

Si al redactar un insumo aparece algo que no se puede verificar, se escribe
«no verificado» con el motivo; no se infiere.

## 11. Reglas de negocio

No aplica (no hay cambios de comportamiento).

## 12. Seguridad y accesibilidad

- Ningún archivo nuevo o modificado contiene IP distintas de `127.0.0.1` y
  `0.0.0.0`, credenciales, secretos ni correos reales. Se usan marcadores
  como `<IP_O_DOMINIO_DEL_SERVIDOR>`.
- Accesibilidad: no aplica (solo documentación).

## 13. Rendimiento

No aplica.

## 14. Pruebas y verificación

### 14.1 Escaneo de secretos

Sobre cada archivo cambiado o creado: IPv4 distintas de `127.0.0.1` y
`0.0.0.0`, `@gmail`, `@hotmail`, la contraseña semilla, `ghp_`/`github_pat_`,
cadenas de 4×4 letras y `AnyDesk`. Resultado esperado: cero.

### 14.2 Existencia de lo citado

Un script temporal en `$env:TEMP` extrae de los README y de `DESPLIEGUE.md`
cada ruta del repositorio, cada `npm run <x>`, cada variable `MAYÚSCULAS_X`
y cada `.ps1`, y comprueba que existen en el árbol, en `package.json` o en
el código. Las rutas de la VM (`C:\munidata\…`, `C:\Apache24\…`) se cotejan
con los valores por defecto de los scripts.

### 14.3 Estado final

`git status`: limpio salvo `documentacion/insumos-cierre/`, que está
excluida (se comprueba con `git status --ignored`).

## 15. Despliegue

No aplica: no se despliega. Los cambios de `DESPLIEGUE.md` se aplicarán en la
VM la próxima vez que Gerald la use.

## 16. Plan de trabajo, riesgos, criterios de aceptación, hallazgos y discrepancias

### 16.1 Orden

1. README raíz → commit `docs: README de Muni Data`.
2. README de scripts y `.env.example` → commit
   `docs: sin credenciales en el README de scripts y .env.example completo`.
3. `DESPLIEGUE.md` → commit `docs(despliegue): correcciones frente a los scripts, restauracion y repositorio privado`.
4. Insumos A, B y C (sin commit).
5. Verificación 14.1 a 14.3 y reporte.

### 16.2 Riesgos

| Riesgo | Mitigación |
|---|---|
| La base temporal para el insumo A choca con el MySQL de desarrollo. | Contenedor aparte en otro puerto y sin volumen persistente; si Docker no está, solo lectura de scripts y entidades, y se dice. |
| El escaneo da falsos positivos con versiones de paquetes (`1.2.3.4`). | Se revisa cada coincidencia a mano. |
| Las correcciones de `DESPLIEGUE.md` no se pueden probar aquí. | Se marcan como pasos para ejecutar y probar en la VM (9.4.1). |

### 16.3 Criterios de aceptación

RF-C1 a RF-C5 cumplidos, 14.1 a 14.3 en verde, cuatro commits locales.

### 16.4 Preguntas abiertas

Ninguna que bloquee; las decisiones están en 3.1.

### 16.5 Auditoría del árbol actual (2.2 a-d)

| # | Archivo | Hallazgo |
|---|---|---|
| a1 | `README.md` | Nombre antiguo; cita `docker/` (no existe); sin puesta en marcha, scripts npm ni despliegue; lista Docker como tecnología principal (solo se usa para MySQL en desarrollo). El archivo está truncado: termina en la línea 29, dentro del bloque de código. |
| b1 | `base-datos/scripts/README.md:36-37` | Correo y contraseña del usuario semilla en claro. |
| b2 | `base-datos/scripts/init/06-usuario-superadministrador.sql:21-22` | Correo y contraseña semilla en un comentario, más su hash bcrypt (línea 45). Solo se reporta (no se tocan los `.sql`). |
| b3 | `backend/src/scripts/crear-administrador.ts:7`, `despliegue/preparar-base-datos.ps1:198`, `despliegue/respaldar.ps1:199` | La contraseña semilla aparece citada en comentarios. Solo se reporta. |
| c1 | `.env.example` | Faltan `NODE_ENV`, `RUTA_ALMACENAMIENTO`, `HOST_ESCUCHA` y `CONFIAR_EN_PROXY`. Sobran `NOMBRE_APLICACION`, `ENTORNO` y `PUERTO_FRONTEND`. |
| c2 | `.env.example:85` | `SMTP_FROM` con una dirección institucional con forma de real (`a***@munipalmares…`). |
| d | `despliegue/DESPLIEGUE.md` | D-01 a D-13 (9.4). |

### 16.6 Auditoría de secretos en el historial (2.2 e)

Barrido de `git log --all -p` (sin lockfiles) y de `git grep` sobre el árbol.

| # | Tipo | Dónde | Estado en el árbol actual |
|---|---|---|---|
| e1 | Dirección IPv4 pública, una sola (enmascarada, `<IPv4>`) | **Solo en la rama local `respaldo-prepush`** (4 commits que no están en `main`): `156c81e` (`backend/src/configuracion/origen-cors.spec.ts`), `e5ff3c6` (`despliegue/DESPLIEGUE.md`, 1 línea; `despliegue/verificar-despliegue.ps1`, 2 líneas) y `d0d7104` (la retira del test). **No está en ningún commit de `main` ni en el remoto**: `git ls-remote` solo muestra `main` y ninguna etiqueta. | No está. Riesgo: que alguien publique `respaldo-prepush` (`git push --all`). |
| e2 | Contraseña del usuario semilla | En `main`: `b93b837`, `df78426`, `540f1c6`, `bdfeaec`, `0fcf815`; además, `156c81e` y `e5ff3c6` en `respaldo-prepush`. | Sigue en 4 archivos (b1-b3). Es de desarrollo, pero es pública: no debe existir en producción con esa contraseña. |
| e3 | Correo del usuario semilla (`a***@munipalmares…`) | `06-…sql`, README de scripts y pruebas. | Sigue. |
| e4 | Dos correos `@gmail` / `@hotmail` (`m***@`, `p***@`) | `2bd5d70`, en `registro-ciudadano.dto.spec.ts` (datos de prueba); borrados en `0049bb3`. | No están. Parecen ficticios; no se puede confirmar. |
| e5 | Tokens (`ghp_`, `github_pat_`, `xox*`, `AKIA`, claves privadas) | Ninguno. | — |
| e6 | Asignaciones con valor real de `SMTP_PASS`, `JWT_*_SECRET`, `BD_CONTRASENA`, `MYSQL_*PASSWORD`, `ADMIN_CONTRASENA` | Ninguna (solo marcadores `CAMBIEME`/`changeme`). | — |
| e7 | Contraseña de aplicación 4×4 | Solo el marcador `xxxx xxxx xxxx xxxx`. | — |
| e8 | AnyDesk | Solo como palabra en la lista de escaneo de `spec-favicon-y-manuales.md:260`. | — |
| e9 | Correo del autor como autor de los commits | Todos los commits (`g***@est…`). Es metadato de git, no contenido. | — |

No se reescribe el historial (regla). Para e1 no hace falta: basta con no
publicar nunca `respaldo-prepush` y, cuando ya no la necesite, borrarla con
`git branch -D respaldo-prepush`. La decisión es de Gerald. Los
`git log -S` del paso final deben ejecutarse sobre `main`, con
`git log main -S`: con `--all` aparecería esta rama local.

### 16.7 Discrepancias entre el encargo y el código, y hallazgos fuera de alcance

| Id | Discrepancia | Resolución propuesta |
|---|---|---|
| Δ-1 | El encargo pone `DESPLIEGUE.md` en la raíz. | `despliegue/DESPLIEGUE.md` (C-1). |
| Δ-2 | El encargo dice `documentación/`. | `documentacion/` (C-1). |
| Δ-3 | El encargo sugiere una carpeta para el spec. | Archivo suelto, por convención (D-1). |
| Δ-4 | «La contraseña debe cambiarse al primer ingreso»: el sistema no lo obliga y no hay pantalla de cambio de contraseña autenticada (`autenticacion.controller.ts`, `usuarios/dto`). | D-4: se documenta como obligación manual por la recuperación de contraseña. |
| Δ-5 | `verificar-requisitos.ps1:231` acepta Node 20; los `engines` piden 22. | Se corrige solo la guía (D-01); el script se reporta. |
| Δ-6 | `.env.produccion.ejemplo:83-86` dice que el límite absoluto de 8 h «no depende» de `JWT_REFRESH_EXPIRATION`; el código dice lo contrario, y con la plantilla (2h) la sesión dura 2 h. | Se corrige la guía (D-06); la plantilla queda fuera de alcance y se reporta. |
| Δ-7 | `respaldar.ps1:548` y `revertir.ps1:598` imprimen la restauración con `munidata_app`, que no puede ejecutar el volcado. | Se corrige la guía (D-10); los scripts se reportan. |
| Δ-8 | Al corregir README y `.env.example`, las notas de `manual-tecnico.md:132`, `:264-266` y `:914` quedan desactualizadas. | Fuera de alcance; se reporta para una edición posterior del manual. |
| Δ-9 | Hay un `package.json` en la raíz con dependencias de backend y sin scripts (más su `package-lock.json`). | El README no lo menciona; se reporta (parece un `npm install` en la raíz por error). |
| Δ-10 | `backend/README.md` y `frontend/README.md` son las plantillas de Nest y Vite. | D-12; se reporta. |
| Δ-11 | `correo.service.ts:31` tiene como remitente por defecto una dirección institucional con forma de real. | D-6; el código no se toca. |
| Δ-12 | La prueba e2e (`backend/test/app.e2e-spec.ts`) parece la de plantilla. | Se confirma y se informa en el insumo C. |
