# Muni Data

**Sistema Integral de Gestión Documental y Portal Web de Gobierno Abierto y
Transparencia Municipal — Municipalidad de Palmares**

Proyecto de la Práctica Profesional Supervisada (PPS) de la Universidad
Nacional de Costa Rica, desarrollado en 2026 para la Municipalidad de
Palmares.

## Qué hace

- **Panel interno** para funcionarios: registro de documentos PDF con
  metadatos y versiones, publicación y despublicación, clasificación por la
  taxonomía ITSP (categorías de hasta 10 niveles), tipos documentales,
  dependencias y etiquetas, usuarios con roles y permisos, bitácora de
  auditoría y reportes.
- **Portal público de transparencia**, de solo lectura y sin sesión, que
  WordPress incrusta por iframes. Desde ahí la ciudadanía consulta,
  visualiza y descarga los documentos publicados.

## Stack

| Capa | Tecnología |
| --- | --- |
| Backend | NestJS 11, TypeORM, TypeScript (API REST/JSON, JWT y RBAC) |
| Frontend | Vue 3, Vite 8, Vue Router, Tailwind CSS 4, TypeScript |
| Base de datos | MySQL 8.0 |
| Entorno | Node.js 22 o superior (el frontend pide `^22.18.0` o `>=24.12.0`) |
| Desarrollo | MySQL en un contenedor con Docker Compose |
| Producción | Windows Server: Apache sirve el frontend bajo `/munipalmares/wp-munidata/` y hace de proxy de `/api` hacia el backend, que corre como el servicio NSSM `MuniData-API`. Solo HTTPS. |

## Estructura del repositorio

```text
backend/                 API REST con NestJS (src/, test/)
frontend/                Aplicación web con Vue 3 y Vite (src/, public/)
base-datos/
  scripts/init/          Scripts SQL numerados 01 a 10 (esquema, datos, migraciones)
  scripts/diagnostico/   Consultas de solo lectura para antes de migrar
  respaldos/             Volcados manuales en desarrollo (no se versiona su contenido)
despliegue/              Scripts PowerShell de despliegue y apache/munidata.conf
documentacion/           Manuales, especificaciones, diseño e integración con WordPress
docker-compose.yml       Contenedor MySQL de desarrollo
.env.example             Plantilla de variables de entorno de desarrollo
```

## Requisitos de desarrollo

- Node.js 22 o superior, con npm.
- Docker con Docker Compose.
- Git.

## Puesta en marcha en desarrollo

Los comandos son de PowerShell y se ejecutan desde la raíz del repositorio.

### 1. Variables de entorno

```powershell
Copy-Item .env.example .env
```

Hay un único `.env`, en la raíz. Lo leen el backend
(`envFilePath: '../.env'`) y Docker Compose (`MYSQL_*`). Edítelo y:

- genere los dos secretos JWT, distintos entre sí, con el comando que trae
  el propio archivo;
- ponga contraseñas locales en `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` y
  `BD_CONTRASENA`. Las dos últimas deben coincidir.

Cada variable está explicada en `.env.example`. Las de producción se
documentan en `despliegue/.env.produccion.ejemplo`.

### 2. Base de datos

```powershell
docker compose up -d
```

La primera vez que se crea el volumen `mysql_data`, MySQL ejecuta los
scripts de `base-datos/scripts/init/` en orden alfabético:

| Script | Contenido |
| --- | --- |
| `01-esquema.sql` | Tablas, claves, restricciones e índices |
| `02-datos-iniciales.sql` | Roles, permisos y matriz rol-permiso |
| `03-datos-itsp.sql` | Taxonomía ITSP inicial |
| `04-alter-usuarios-auth.sql` | Bloqueo de cuenta y verificación de correo |
| `05-tablas-sesiones-tokens.sql` | Sesiones de refresh y tokens de un solo uso |
| `06-usuario-superadministrador.sql` | Usuario semilla, solo para desarrollo |
| `07-datos-catalogos-fase5.sql` | Tipos de documento |
| `08-ajuste-dependencia-y-paginas.sql` | Dependencia única y número de páginas |
| `09-permiso-reportes.sql` | Permiso `reportes.consultar` |
| `10-codigos-categorias-autogenerados.sql` | Códigos de categoría obligatorios |

Para volver a crear la base desde cero (borra todos los datos locales):

```powershell
docker compose down -v
docker compose up -d
```

Más detalle en `base-datos/scripts/README.md`.

### 3. Backend

```powershell
cd backend
npm ci
npm run start:dev
```

La API queda en `http://localhost:3000`, y `GET /salud` responde si alcanza
la base de datos.

### 4. Frontend

En otra consola:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
cd frontend
npm ci
npm run dev
```

La aplicación queda en `http://localhost:5173`. Las variables del frontend
(`VITE_*`) van solo en los `.env*` de `frontend/`, porque viajan dentro del
código que descarga el navegador.

### 5. Primer ingreso

En desarrollo, el script `06-usuario-superadministrador.sql` crea un usuario
semilla con rol Superadministrador. Sus datos de acceso están en ese script.
El sistema **no** obliga a cambiar la contraseña ni tiene una pantalla para
hacerlo: cámbiela usted con **«¿Olvidó su contraseña?»** en el login. Si
`SMTP_HOST` está vacío, el correo no sale a ningún buzón. Se envía a una
cuenta de pruebas de Ethereal y el enlace para abrirlo aparece en el log del
backend.

Ese usuario no existe en producción: `preparar-base-datos.ps1` omite el
script 06 y el primer administrador se crea con
`despliegue/crear-administrador.ps1`.

## Comandos

Backend (`backend/`):

| Comando | Para qué |
| --- | --- |
| `npm run start:dev` | Arranque con recarga automática |
| `npm run build` | Compila a `dist/` |
| `npm run start:prod` | Ejecuta lo compilado |
| `npm test` | Pruebas unitarias (Jest) |
| `npm run test:cov` | Pruebas con cobertura |
| `npm run test:e2e` | Prueba de extremo a extremo |
| `npm run lint` | ESLint, con corrección automática |
| `npm run format` | Prettier |
| `npm run correo:verificar` | Comprueba la configuración SMTP del `.env` |

Frontend (`frontend/`):

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo de Vite |
| `npm run build` | Revisión de tipos y compilación a `dist/` |
| `npm run type-check` | Solo la revisión de tipos |
| `npm run preview` | Sirve lo compilado |

## Despliegue

En producción no se usa Docker. Los scripts de `despliegue/` preparan
MySQL, compilan y publican el backend y el frontend, registran el servicio
`MuniData-API` con NSSM, programan los respaldos y verifican el resultado.
Todos aceptan `-Simular`. El procedimiento completo, con la configuración de
Apache, la restauración y la solución de problemas, está en
[`despliegue/DESPLIEGUE.md`](despliegue/DESPLIEGUE.md).

## Documentación

- [Manual técnico](documentacion/manual-tecnico.md)
- [Manual de usuario](documentacion/manual-usuario.md)
- [Sistema de diseño](documentacion/design/DESIGN.md)
- [Integración del portal con WordPress](documentacion/portal-publico/INTEGRACION-WORDPRESS.md)
- Especificaciones de cada entrega: `documentacion/spec-*.md`

## Seguridad

- Los archivos `.env` no se versionan (`.gitignore`). El repositorio solo
  contiene plantillas con valores ficticios.
- No suba credenciales, direcciones de servidores ni datos reales.

## Autoría

Gerald Huertas Rodríguez — Práctica Profesional Supervisada, Universidad
Nacional, 2026.

Proyecto privado (`"private": true`, licencia `UNLICENSED` en
`backend/package.json`).
