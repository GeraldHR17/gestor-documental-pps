USE gestor_documental_pps;

-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base (ej. 'Gestion' guardado como 'GestiÃ³n').
SET NAMES utf8mb4;

-- ============================================================
-- 01-ESQUEMA.SQL
-- Sistema Integral de Gestión Documental - Municipalidad de Palmares
-- Contiene: CREATE TABLE, PK, FK, NOT NULL, UNIQUE, CHECK, índices
-- Motor: MySQL 8.0
-- ============================================================

-- ============================================================
-- 1. ROLES (estado como ENUM: regla de negocio estable)
-- ============================================================
CREATE TABLE roles (
    id_rol INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255) NULL,
    estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_roles_nombre UNIQUE (nombre)
) ENGINE=InnoDB;


-- ============================================================
-- 2. PERMISOS (estado como VARCHAR: catálogo evolutivo)
-- ============================================================
CREATE TABLE permisos (
    id_permiso INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_permisos_nombre UNIQUE (nombre),
    INDEX idx_permisos_estado (estado)
) ENGINE=InnoDB;


-- ============================================================
-- 3. ROLES_PERMISOS (N:M entre roles y permisos)
-- ============================================================
CREATE TABLE roles_permisos (
    id_rol INT UNSIGNED NOT NULL,
    id_permiso INT UNSIGNED NOT NULL,

    PRIMARY KEY (id_rol, id_permiso),

    CONSTRAINT fk_roles_permisos_rol
        FOREIGN KEY (id_rol) REFERENCES roles(id_rol)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_roles_permisos_permiso
        FOREIGN KEY (id_permiso) REFERENCES permisos(id_permiso)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    INDEX idx_roles_permisos_permiso (id_permiso)
) ENGINE=InnoDB;


-- ============================================================
-- 4. USUARIOS (estado como ENUM: regla de negocio estable)
-- ============================================================
CREATE TABLE usuarios (
    id_usuario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre_completo VARCHAR(150) NOT NULL,
    identificacion VARCHAR(30) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    id_rol INT UNSIGNED NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_usuarios_identificacion UNIQUE (identificacion),
    CONSTRAINT uk_usuarios_correo UNIQUE (correo),

    CONSTRAINT fk_usuarios_rol
        FOREIGN KEY (id_rol) REFERENCES roles(id_rol)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    INDEX idx_usuarios_correo (correo),
    INDEX idx_usuarios_identificacion (identificacion),
    INDEX idx_usuarios_rol (id_rol)
) ENGINE=InnoDB;


-- ============================================================
-- 5. CATEGORIAS_ITSP (estado como VARCHAR: catálogo evolutivo)
-- ============================================================
CREATE TABLE categorias_itsp (
    id_categoria_itsp INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_categoria_padre INT UNSIGNED NULL,
    codigo VARCHAR(50) NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT NULL,
    nivel TINYINT UNSIGNED NOT NULL DEFAULT 1,
    orden INT UNSIGNED NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_categorias_itsp_codigo UNIQUE (codigo),

    CONSTRAINT fk_categorias_itsp_padre
        FOREIGN KEY (id_categoria_padre) REFERENCES categorias_itsp(id_categoria_itsp)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    INDEX idx_categorias_itsp_padre (id_categoria_padre),
    INDEX idx_categorias_itsp_estado (estado),
    INDEX idx_categorias_itsp_orden (orden)
) ENGINE=InnoDB;


-- ============================================================
-- 6. TIPOS_DOCUMENTOS (estado como VARCHAR: catálogo evolutivo)
-- ============================================================
CREATE TABLE tipos_documentos (
    id_tipo_documento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_tipos_documentos_nombre UNIQUE (nombre),
    INDEX idx_tipos_documentos_estado (estado)
) ENGINE=InnoDB;


-- ============================================================
-- 7. DEPENDENCIAS (estado como VARCHAR: catálogo evolutivo)
-- ============================================================
CREATE TABLE dependencias (
    id_dependencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(255) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_dependencias_nombre UNIQUE (nombre),
    INDEX idx_dependencias_estado (estado)
) ENGINE=InnoDB;


-- ============================================================
-- 8. ETIQUETAS (estado como VARCHAR: catálogo evolutivo)
-- ============================================================
CREATE TABLE etiquetas (
    id_etiqueta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uk_etiquetas_nombre UNIQUE (nombre),
    INDEX idx_etiquetas_estado (estado)
) ENGINE=InnoDB;


-- ============================================================
-- 9. DOCUMENTOS (estado como ENUM: regla de negocio estable)
-- ============================================================
CREATE TABLE documentos (
    id_documento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NULL,
    anio YEAR NOT NULL,
    estado ENUM('BORRADOR', 'PUBLICADO', 'INACTIVO')
        NOT NULL DEFAULT 'BORRADOR',
    fecha_publicacion DATETIME NULL,
    id_categoria_itsp INT UNSIGNED NOT NULL,
    id_tipo_documento INT UNSIGNED NOT NULL,
    id_usuario_creador INT UNSIGNED NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_documentos_categoria_itsp
        FOREIGN KEY (id_categoria_itsp) REFERENCES categorias_itsp(id_categoria_itsp)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT fk_documentos_tipo_documento
        FOREIGN KEY (id_tipo_documento) REFERENCES tipos_documentos(id_tipo_documento)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT fk_documentos_usuario_creador
        FOREIGN KEY (id_usuario_creador) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    INDEX idx_documentos_anio (anio),
    INDEX idx_documentos_estado (estado),
    INDEX idx_documentos_fecha_publicacion (fecha_publicacion),
    INDEX idx_documentos_usuario_creador (id_usuario_creador),
    INDEX idx_documentos_categoria_itsp (id_categoria_itsp),
    INDEX idx_documentos_tipo_documento (id_tipo_documento),

    FULLTEXT INDEX idx_documentos_titulo (titulo)
) ENGINE=InnoDB;


-- ============================================================
-- 10. VERSIONES_DOCUMENTOS
-- ============================================================
CREATE TABLE versiones_documentos (
    id_version INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_documento INT UNSIGNED NOT NULL,
    numero_version INT UNSIGNED NOT NULL,
    nombre_archivo_original VARCHAR(255) NOT NULL,
    nombre_archivo_sistema VARCHAR(255) NOT NULL,
    ruta_archivo VARCHAR(500) NOT NULL,
    hash_archivo CHAR(64) NOT NULL,
    algoritmo_hash VARCHAR(20) NOT NULL DEFAULT 'SHA-256',
    tamano_bytes BIGINT UNSIGNED NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    comentario_version VARCHAR(500) NULL,
    id_usuario_carga INT UNSIGNED NOT NULL,
    fecha_carga DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_versiones_documento_numero UNIQUE (id_documento, numero_version),

    CONSTRAINT fk_versiones_documento
        FOREIGN KEY (id_documento) REFERENCES documentos(id_documento)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT fk_versiones_usuario_carga
        FOREIGN KEY (id_usuario_carga) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_versiones_tamano
        CHECK (tamano_bytes > 0 AND tamano_bytes <= 41943040),

    CONSTRAINT chk_versiones_mime
        CHECK (mime_type = 'application/pdf'),

    INDEX idx_versiones_documento (id_documento),
    INDEX idx_versiones_hash (hash_archivo)
) ENGINE=InnoDB;


-- ============================================================
-- 11. DOCUMENTOS_DEPENDENCIAS (N:M)
-- ============================================================
CREATE TABLE documentos_dependencias (
    id_documento INT UNSIGNED NOT NULL,
    id_dependencia INT UNSIGNED NOT NULL,

    PRIMARY KEY (id_documento, id_dependencia),

    CONSTRAINT fk_documentos_dependencias_documento
        FOREIGN KEY (id_documento) REFERENCES documentos(id_documento)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_documentos_dependencias_dependencia
        FOREIGN KEY (id_dependencia) REFERENCES dependencias(id_dependencia)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    INDEX idx_documentos_dependencias_dependencia (id_dependencia)
) ENGINE=InnoDB;


-- ============================================================
-- 12. DOCUMENTOS_ETIQUETAS (N:M)
-- ============================================================
CREATE TABLE documentos_etiquetas (
    id_documento INT UNSIGNED NOT NULL,
    id_etiqueta INT UNSIGNED NOT NULL,

    PRIMARY KEY (id_documento, id_etiqueta),

    CONSTRAINT fk_documentos_etiquetas_documento
        FOREIGN KEY (id_documento) REFERENCES documentos(id_documento)
        ON UPDATE CASCADE ON DELETE CASCADE,

    CONSTRAINT fk_documentos_etiquetas_etiqueta
        FOREIGN KEY (id_etiqueta) REFERENCES etiquetas(id_etiqueta)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    INDEX idx_documentos_etiquetas_etiqueta (id_etiqueta)
) ENGINE=InnoDB;


-- ============================================================
-- 13. BITACORA_LOGS
-- ============================================================
CREATE TABLE bitacora_logs (
    id_log BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NULL,
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(100) NOT NULL,
    id_registro BIGINT UNSIGNED NULL,
    fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resultado VARCHAR(20) NULL,
    ip_origen VARCHAR(45) NULL,
    detalles JSON NULL,

    CONSTRAINT fk_bitacora_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL,

    INDEX idx_bitacora_usuario_fecha (id_usuario, fecha_hora),
    INDEX idx_bitacora_entidad_registro (entidad, id_registro),
    INDEX idx_bitacora_fecha (fecha_hora)
) ENGINE=InnoDB;

SELECT 'Esquema (13 tablas) creado correctamente' AS estado;