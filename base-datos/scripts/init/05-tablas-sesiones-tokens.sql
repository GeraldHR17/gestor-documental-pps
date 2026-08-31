-- base-datos/scripts/init/05-tablas-sesiones-tokens.sql

USE gestor_documental_pps;

-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base (ej. 'Gestion' guardado como 'GestiÃ³n').
SET NAMES utf8mb4;

-- ============================================================
-- 05-TABLAS-SESIONES-TOKENS.SQL
-- Fase 4: tablas de sesiones de refresh token, recuperacion de
-- contrasena y verificacion de correo.
-- Se ejecuta despues de 04-alter-usuarios-auth.sql (orden alfabetico).
-- ============================================================

-- ============================================================
-- SESIONES_REFRESH_TOKENS
-- ============================================================
CREATE TABLE sesiones_refresh_tokens (
    id_sesion BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL COMMENT 'SHA-256 del refresh token, nunca el valor plano',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion DATETIME NOT NULL,
    revocado BOOLEAN NOT NULL DEFAULT FALSE,
    ip_origen VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,

    CONSTRAINT fk_sesiones_refresh_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE CASCADE,

    INDEX idx_sesiones_refresh_usuario (id_usuario),
    INDEX idx_sesiones_refresh_token_hash (token_hash),
    INDEX idx_sesiones_refresh_expiracion (fecha_expiracion)
) ENGINE=InnoDB;


-- ============================================================
-- TOKENS_RECUPERACION_CONTRASENA
-- ============================================================
CREATE TABLE tokens_recuperacion_contrasena (
    id_token BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL COMMENT 'SHA-256 del token de recuperacion',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion DATETIME NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_tokens_recuperacion_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE CASCADE,

    INDEX idx_tokens_recuperacion_usuario (id_usuario),
    INDEX idx_tokens_recuperacion_hash (token_hash)
) ENGINE=InnoDB;


-- ============================================================
-- TOKENS_VERIFICACION_CORREO
-- ============================================================
CREATE TABLE tokens_verificacion_correo (
    id_token BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL COMMENT 'SHA-256 del token de verificacion',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion DATETIME NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_tokens_verificacion_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE CASCADE,

    INDEX idx_tokens_verificacion_usuario (id_usuario),
    INDEX idx_tokens_verificacion_hash (token_hash)
) ENGINE=InnoDB;

SELECT 'Tablas de sesiones y tokens (Fase 4) creadas correctamente' AS estado;