-- base-datos/scripts/init/08-ajuste-dependencia-y-paginas.sql
--
-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base.
SET NAMES utf8mb4;
USE gestor_documental_pps;

-- ============================================================
-- 08-AJUSTE-DEPENDENCIA-Y-PAGINAS.SQL
-- Pulido de Fases 4-6, decisión del Product Owner: un documento tiene
-- UNA sola dependencia (no varias), y cada usuario tiene la suya, que
-- sirve para precargar —no forzar— la del documento que registre.
--
-- Reemplaza la relación N:M `documentos_dependencias` por una columna
-- `id_dependencia` en `documentos`, agrega la misma columna a `usuarios`
-- y, de paso, agrega `numero_paginas` a `versiones_documentos`.
--
-- Ambas columnas de dependencia quedan NULL: la dependencia sigue sin
-- ser obligatoria para publicar (regla ya confirmada, VP-03).
--
-- REQUISITO PREVIO: `documentos_dependencias` debe tener 0 filas. Así
-- quedó la base tras la verificación de Fase 6. Si tuviera datos, este
-- script se detiene con un error antes del DROP para no perderlos.
-- ============================================================

-- Guarda: aborta si hubiera asociaciones que se perderían con el DROP.
SET @filas_nm = (SELECT COUNT(*) FROM documentos_dependencias);
SET @mensaje = IF(
    @filas_nm > 0,
    'ABORTADO: documentos_dependencias tiene filas; migre esos datos antes de continuar',
    'OK'
);
-- Una división entre cero es la forma portable de forzar un error en un
-- script de init de MySQL (no admite SIGNAL fuera de un procedimiento).
SELECT IF(@filas_nm > 0, (SELECT 1 / 0), @mensaje) AS verificacion_previa;

ALTER TABLE usuarios
    ADD COLUMN id_dependencia INT UNSIGNED NULL AFTER id_rol,
    ADD CONSTRAINT fk_usuarios_dependencia
        FOREIGN KEY (id_dependencia) REFERENCES dependencias(id_dependencia)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE documentos
    ADD COLUMN id_dependencia INT UNSIGNED NULL AFTER id_tipo_documento,
    ADD CONSTRAINT fk_documentos_dependencia
        FOREIGN KEY (id_dependencia) REFERENCES dependencias(id_dependencia)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD INDEX idx_documentos_dependencia (id_dependencia);

DROP TABLE documentos_dependencias;

-- Conteo de páginas del PDF, calculado por el servidor al cargar cada
-- versión. NULL cuando el archivo no se pudo interpretar: el dato es
-- informativo y no bloquea la carga.
ALTER TABLE versiones_documentos
    ADD COLUMN numero_paginas INT UNSIGNED NULL AFTER mime_type;

SELECT 'Migración de dependencia única y numero_paginas aplicada correctamente' AS estado;
