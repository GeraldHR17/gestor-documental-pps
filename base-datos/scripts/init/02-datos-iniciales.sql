USE gestor_documental_pps;

-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base (ej. 'Gestion' guardado como 'GestiÃ³n').
SET NAMES utf8mb4;

-- ============================================================
-- 02-DATOS-INICIALES.SQL
-- Roles, permisos, asignación roles_permisos.
-- Se ejecuta después de 01-esquema.sql (orden alfabético en Docker).
-- ============================================================

-- ============================================================
-- ROLES
-- ============================================================
INSERT INTO roles (nombre, descripcion) VALUES
('Superadministrador', 'Acceso administrativo completo al sistema. Gestiona usuarios, roles y configuración.'),
('Administrador',      'Gestión operativa de documentos, categorías y catálogos autorizados.'),
('Usuario',            'Acceso de consulta a documentos publicados y funcionalidades del portal ciudadano.');


-- ============================================================
-- PERMISOS (catálogo funcional predefinido, MVP)
-- ============================================================
INSERT INTO permisos (nombre, descripcion) VALUES
('documentos.crear',        'Crear nuevos documentos y cargar su primera versión.'),
('documentos.editar',       'Editar metadatos de documentos existentes.'),
('documentos.publicar',     'Cambiar el estado de un documento a Publicado.'),
('documentos.inactivar',    'Inactivar documentos (eliminación lógica).'),
('documentos.consultar',    'Consultar documentos publicados desde el portal.'),
('versiones.cargar',        'Cargar nuevas versiones de un documento existente.'),
('catalogos.administrar',   'Crear y editar categorías ITSP, tipos, dependencias y etiquetas.'),
('usuarios.administrar',    'Crear, editar y asignar roles a usuarios del sistema.'),
('bitacora.consultar',      'Consultar la bitácora de auditoría del sistema.');


-- ============================================================
-- ROLES_PERMISOS — Asignación inicial por rol
-- ============================================================

-- Superadministrador: todos los permisos sin excepción.
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Superadministrador';

-- Administrador: gestión operativa de documentos y catálogos,
-- sin administración de usuarios ni auditoría.
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador'
  AND p.nombre IN (
      'documentos.crear',
      'documentos.editar',
      'documentos.publicar',
      'documentos.inactivar',
      'documentos.consultar',
      'versiones.cargar',
      'catalogos.administrar'
  );

-- Usuario: únicamente consulta de documentos publicados
-- (perfil funcionario/ciudadano de solo lectura en el MVP).
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Usuario'
  AND p.nombre = 'documentos.consultar';

SELECT 'Roles, permisos y asignaciones RBAC creados correctamente' AS estado;