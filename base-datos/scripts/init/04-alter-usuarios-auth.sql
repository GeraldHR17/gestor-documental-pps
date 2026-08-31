-- base-datos/scripts/init/04-alter-usuarios-auth.sql

USE gestor_documental_pps;

-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base (ej. 'Gestion' guardado como 'GestiÃ³n').
SET NAMES utf8mb4;

-- ============================================================
-- 04-ALTER-USUARIOS-AUTH.SQL
-- Fase 4: columnas necesarias para bloqueo por intentos fallidos
-- y verificación de correo en el autoregistro ciudadano.
-- ============================================================

ALTER TABLE usuarios
    ADD COLUMN intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT 'Contador de intentos de login fallidos consecutivos',
    ADD COLUMN bloqueado_hasta DATETIME NULL
        COMMENT 'Fecha/hora hasta la cual la cuenta permanece bloqueada por intentos fallidos',
    ADD COLUMN correo_verificado BOOLEAN NOT NULL DEFAULT FALSE
        COMMENT 'Indica si el ciudadano confirmo su correo tras el autoregistro. Las cuentas creadas por un administrador se marcan TRUE al crearse.';

SELECT 'Columnas de autenticacion agregadas a usuarios correctamente' AS estado;