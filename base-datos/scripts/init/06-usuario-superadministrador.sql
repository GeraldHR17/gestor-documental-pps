-- base-datos/scripts/init/06-usuario-superadministrador.sql

USE gestor_documental_pps;

-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base (ej. 'Gestion' guardado como 'GestiÃ³n').
SET NAMES utf8mb4;

-- ============================================================
-- 06-USUARIO-SUPERADMINISTRADOR.SQL
-- Fase 4: usuario semilla inicial. Sin él no existe forma de entrar
-- al sistema por primera vez: /auth/registro solo crea cuentas con el
-- rol 'Usuario', y crear cuentas administrativas (POST /usuarios)
-- exige ya estar autenticado con el permiso 'usuarios.administrar'.
--
-- Se ejecuta después de 04-alter-usuarios-auth.sql, porque depende de
-- la columna `correo_verificado` que ese script agrega.
--
-- Credenciales de arranque (SOLO PARA DESARROLLO LOCAL):
--     correo     : admin@munipalmares.go.cr
--     contraseña : Palmares#2026
--
-- El valor almacenado es un hash bcrypt (12 rondas) de esa contraseña;
-- la contraseña en texto plano nunca se guarda. CAMBIE ESTA CONTRASEÑA
-- ANTES DE CUALQUIER DESPLIEGUE que no sea su máquina local.
--
-- `correo_verificado = TRUE` sigue la regla #8: las cuentas que no nacen
-- del autoregistro ciudadano no pasan por verificación de correo.
-- ============================================================

INSERT INTO usuarios (
    nombre_completo,
    identificacion,
    correo,
    contrasena_hash,
    estado,
    id_rol,
    correo_verificado
)
SELECT
    'Administrador del Sistema',
    '000000000',
    'admin@munipalmares.go.cr',
    '$2b$12$gQ4SU2ojTIgrrJUNPWIlh.7GYBYXJ0lkyyYO0ozzBdfAAGpZBEWya',
    'ACTIVO',
    r.id_rol,
    TRUE
FROM roles r
WHERE r.nombre = 'Superadministrador';

SELECT 'Usuario superadministrador inicial creado correctamente' AS estado;
