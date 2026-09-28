-- base-datos/scripts/init/09-permiso-reportes.sql
--
-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base.
SET NAMES utf8mb4;
USE gestor_documental_pps;

-- ============================================================
-- 09-PERMISO-REPORTES.SQL
-- MF-08 (Reportes, RF-055 a RF-058). Los indicadores y desgloses se
-- muestran embebidos en la pantalla de Inicio, no en un módulo aparte,
-- pero su visibilidad se gobierna con un permiso propio para poder
-- separarlos de la consulta ordinaria de documentos.
--
-- Mismo criterio que 'catalogos.administrar': lo reciben
-- Superadministrador y Administrador. El rol 'Usuario' NO lo recibe, así
-- que ve la pantalla de Inicio reducida (sólo documentos recientes).
-- ============================================================

INSERT INTO permisos (nombre, descripcion) VALUES
('reportes.consultar', 'Consultar indicadores y reportes de gestión documental.');

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
CROSS JOIN permisos p
WHERE p.nombre = 'reportes.consultar'
  AND r.nombre IN ('Superadministrador', 'Administrador');

SELECT 'Permiso reportes.consultar creado y asignado correctamente' AS estado;
