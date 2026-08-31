# Scripts de base de datos — Gestor Documental PPS

## Orden de ejecución (automático vía Docker)

Los scripts en `init/` se ejecutan en **orden alfabético** una única vez,
al crearse por primera vez el volumen `mysql_data` del contenedor MySQL.

| Archivo                              | Contenido                                                      |
|--------------------------------------|----------------------------------------------------------------|
| `01-esquema.sql`                     | CREATE TABLE, PK, FK, NOT NULL, UNIQUE, CHECK, índices          |
| `02-datos-iniciales.sql`             | Roles, permisos y asignación roles_permisos (RBAC)              |
| `03-datos-itsp.sql`                  | Categorías raíz de la taxonomía ITSP                            |
| `04-alter-usuarios-auth.sql`         | Fase 4: columnas de bloqueo y verificación de correo            |
| `05-tablas-sesiones-tokens.sql`      | Fase 4: sesiones de refresh token y tokens de un solo uso       |
| `06-usuario-superadministrador.sql`  | Fase 4: usuario semilla para el primer inicio de sesión         |

### Credenciales del usuario semilla

`06-usuario-superadministrador.sql` crea la única cuenta con la que se
puede entrar al sistema por primera vez:

- **Correo:** `admin@palmares.go.cr`
- **Contraseña:** `Palmares#2026`

Son credenciales **de desarrollo local**. Cámbielas antes de cualquier
despliegue.

## Re-ejecutar los scripts manualmente

Docker solo corre `init/` la primera vez. Para reiniciar la base de datos
desde cero durante desarrollo (por ejemplo, tras modificar el esquema):

\`\`\`powershell
docker compose down -v
docker compose up -d
\`\`\`

El flag `-v` elimina el volumen `mysql_data`, forzando que MySQL vuelva
a ejecutar todos los scripts de `init/` en el próximo arranque.

## Respaldos

La carpeta `respaldos/` almacena dumps manuales generados con `mysqldump`
(no se versiona su contenido en Git, solo la carpeta vía `.gitkeep`).

Ejemplo de respaldo manual:

\`\`\`powershell
docker exec gestor_documental_mysql mysqldump -u gestor_app -p gestor_documental_pps > base-datos/respaldos/respaldo_2026-08-21.sql
\`\`\`