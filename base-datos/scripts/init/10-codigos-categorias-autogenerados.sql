-- base-datos/scripts/init/10-codigos-categorias-autogenerados.sql
--
-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base.
SET NAMES utf8mb4;
USE gestor_documental_pps;

-- ============================================================
-- 10-CODIGOS-CATEGORIAS-AUTOGENERADOS.SQL
-- spec-ajustes-posdespliegue §6.4. Desde esta version el codigo de una
-- categoria ITSP lo asigna el sistema (maximo + 1 por nivel) y deja de
-- ser opcional. Esta migracion:
--
--   1. ABORTA, sin escribir nada, si hay codigos duplicados (el mismo
--      texto, el mismo numero de raiz o el mismo numero de subseccion).
--      No los corrige: eso se decide a mano con el PO.
--   2. Rellena SOLO los codigos nulos o vacios, con la misma regla que
--      backend/src/catalogos/codigos-categoria.ts. Ninguna fila con
--      codigo no vacio se modifica, aunque su grafia sea irregular: esos
--      codigos ya estan en las URL de WordPress.
--   3. Aplica NOT NULL a la columna y el indice unico, cada uno solo si
--      falta.
--
-- Es idempotente: una segunda ejecucion no encuentra nada que rellenar
-- ni restricciones que aplicar, y termina bien sin cambiar nada.
--
-- Antes de aplicarla en la VM se ejecuta el diagnostico de solo lectura
-- (despliegue/diagnosticar-codigos-categorias.ps1), que muestra los
-- codigos que asignara.
--
-- Usa un procedimiento almacenado temporal porque el SQL plano no tiene
-- IF ni bucles. Lo crea y lo borra el usuario administrativo que aplica
-- los scripts; el usuario de la aplicacion no necesita privilegios
-- nuevos. Los DELIMITER los interpreta el cliente mysql, tanto en el
-- init de Docker como con el "source" de preparar-base-datos.ps1.
--
-- Si la migracion aborta, el cliente se detiene en el CALL y el
-- procedimiento queda creado (MySQL no permite que un procedimiento se
-- borre a si mismo). No hace nada por si solo: la siguiente ejecucion lo
-- reemplaza con el DROP PROCEDURE IF EXISTS del principio. Para quitarlo
-- sin reintentar: DROP PROCEDURE IF EXISTS migrar_codigos_categorias_10;
-- ============================================================

DROP PROCEDURE IF EXISTS migrar_codigos_categorias_10;

DELIMITER $$

CREATE PROCEDURE migrar_codigos_categorias_10()
BEGIN
    DECLARE v_id INT UNSIGNED;
    DECLARE v_id_padre INT UNSIGNED;
    DECLARE v_prefijo VARCHAR(50);
    DECLARE v_siguiente BIGINT UNSIGNED;
    DECLARE v_duplicados TEXT;
    DECLARE v_mensaje VARCHAR(128);

    -- Cualquier error deshace el relleno que no se haya confirmado y se
    -- propaga tal cual: el cliente mysql termina con error y
    -- preparar-base-datos.ps1 no registra el script.
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET @migracion_10_rellenadas = 0;

    -- --------------------------------------------------------
    -- 1. Duplicados: abortar antes de escribir nada
    -- --------------------------------------------------------
    -- Mismos criterios que el bloque 4 del diagnostico.
    SELECT GROUP_CONCAT(d.ids ORDER BY d.ids SEPARATOR ' / ')
      INTO v_duplicados
      FROM (
        SELECT GROUP_CONCAT(t.id ORDER BY t.id) AS ids
          FROM (SELECT id_categoria_itsp AS id, TRIM(codigo) AS texto
                  FROM categorias_itsp
                 WHERE TRIM(codigo) <> '') t
         GROUP BY t.texto
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT GROUP_CONCAT(n.id ORDER BY n.id)
          FROM (SELECT id_categoria_itsp AS id,
                       CAST(SUBSTRING(TRIM(codigo), 6) AS UNSIGNED) AS numero
                  FROM categorias_itsp
                 WHERE id_categoria_padre IS NULL
                   AND REGEXP_LIKE(TRIM(codigo), '^IT(SP|PS)-[0-9]{2,}$', 'i')) n
         GROUP BY n.numero
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT GROUP_CONCAT(n.id ORDER BY n.id)
          FROM (SELECT h.id_categoria_itsp AS id,
                       h.id_categoria_padre AS id_raiz,
                       CAST(SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) AS UNSIGNED) AS numero
                  FROM categorias_itsp h
                  JOIN categorias_itsp r
                    ON r.id_categoria_itsp = h.id_categoria_padre
                   AND r.id_categoria_padre IS NULL
                   AND TRIM(r.codigo) <> ''
                 WHERE TRIM(h.codigo) <> ''
                   AND CAST(UPPER(LEFT(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 1)) AS BINARY)
                       = CAST(CONCAT(UPPER(TRIM(r.codigo)), '-') AS BINARY)
                   AND SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) REGEXP '^[0-9]{2,}$') n
         GROUP BY n.id_raiz, n.numero
        HAVING COUNT(*) > 1
      ) d;

    IF v_duplicados IS NOT NULL THEN
        -- La lista completa sale como resultado antes del error; el
        -- mensaje del SIGNAL admite solo 128 caracteres.
        SELECT v_duplicados AS ids_de_categorias_con_codigo_duplicado;
        SET v_mensaje = CONCAT(
            'Migracion 10 abortada: hay codigos de categoria duplicados (ids ',
            LEFT(v_duplicados, 18),
            '). Ejecute diagnosticar-codigos-categorias.ps1');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_mensaje;
    END IF;

    -- --------------------------------------------------------
    -- 2. Relleno de nulos y vacios
    -- --------------------------------------------------------
    START TRANSACTION;

    -- 2a. Raices, en orden (orden, id): maximo de las raices reconocidas
    -- (ITSP-NN e ITPS-NN) + 1, una por una. Cada raiz rellenada cuenta
    -- para la siguiente.
    bucle_raices: LOOP
        SET v_id = (
            SELECT id_categoria_itsp
              FROM categorias_itsp
             WHERE id_categoria_padre IS NULL
               AND (codigo IS NULL OR TRIM(codigo) = '')
             ORDER BY orden, id_categoria_itsp
             LIMIT 1);

        IF v_id IS NULL THEN
            LEAVE bucle_raices;
        END IF;

        SET v_siguiente = 1 + (
            SELECT COALESCE(MAX(CAST(SUBSTRING(TRIM(codigo), 6) AS UNSIGNED)), 0)
              FROM categorias_itsp
             WHERE id_categoria_padre IS NULL
               AND REGEXP_LIKE(TRIM(codigo), '^IT(SP|PS)-[0-9]{2,}$', 'i'));

        UPDATE categorias_itsp
           SET codigo = CONCAT('ITSP-',
                   IF(v_siguiente < 100, LPAD(v_siguiente, 2, '0'), CAST(v_siguiente AS CHAR)))
         WHERE id_categoria_itsp = v_id
           AND (codigo IS NULL OR TRIM(codigo) = '');

        SET @migracion_10_rellenadas = @migracion_10_rellenadas + 1;
    END LOOP;

    -- 2b. Subsecciones cuyo padre es una raiz, agrupadas por raiz y en
    -- orden (orden, id): codigo de la raiz en mayusculas + '-MM', con MM =
    -- maximo de sus hijas reconocidas (activas e inactivas) + 1. Una
    -- subseccion cuyo padre no es una raiz no se toca: queda nula y el
    -- paso 3 aborta antes del NOT NULL.
    bucle_hijas: LOOP
        SET v_id = (
            SELECT h.id_categoria_itsp
              FROM categorias_itsp h
              JOIN categorias_itsp r
                ON r.id_categoria_itsp = h.id_categoria_padre
               AND r.id_categoria_padre IS NULL
               AND TRIM(r.codigo) <> ''
             WHERE h.codigo IS NULL OR TRIM(h.codigo) = ''
             ORDER BY h.id_categoria_padre, h.orden, h.id_categoria_itsp
             LIMIT 1);

        IF v_id IS NULL THEN
            LEAVE bucle_hijas;
        END IF;

        SET v_id_padre = (SELECT id_categoria_padre FROM categorias_itsp WHERE id_categoria_itsp = v_id);
        SET v_prefijo = (SELECT UPPER(TRIM(codigo)) FROM categorias_itsp WHERE id_categoria_itsp = v_id_padre);

        SET v_siguiente = 1 + (
            SELECT COALESCE(MAX(CAST(SUBSTRING(TRIM(codigo), CHAR_LENGTH(v_prefijo) + 2) AS UNSIGNED)), 0)
              FROM categorias_itsp
             WHERE id_categoria_padre = v_id_padre
               AND TRIM(codigo) <> ''
               AND CAST(UPPER(LEFT(TRIM(codigo), CHAR_LENGTH(v_prefijo) + 1)) AS BINARY)
                   = CAST(CONCAT(v_prefijo, '-') AS BINARY)
               AND SUBSTRING(TRIM(codigo), CHAR_LENGTH(v_prefijo) + 2) REGEXP '^[0-9]{2,}$');

        UPDATE categorias_itsp
           SET codigo = CONCAT(v_prefijo, '-',
                   IF(v_siguiente < 100, LPAD(v_siguiente, 2, '0'), CAST(v_siguiente AS CHAR)))
         WHERE id_categoria_itsp = v_id
           AND (codigo IS NULL OR TRIM(codigo) = '');

        SET @migracion_10_rellenadas = @migracion_10_rellenadas + 1;
    END LOOP;

    COMMIT;

    -- --------------------------------------------------------
    -- 3. Restricciones, cada una solo si falta
    -- --------------------------------------------------------
    -- Van despues del COMMIT porque un ALTER TABLE confirma la
    -- transaccion por su cuenta. Si el script se corta aqui, la siguiente
    -- ejecucion encuentra el relleno hecho y aplica lo que falte.
    IF (SELECT IS_NULLABLE
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'categorias_itsp'
           AND COLUMN_NAME = 'codigo') = 'YES' THEN

        -- Nunca se deja que el ALTER falle a medias por un nulo.
        IF EXISTS (SELECT 1 FROM categorias_itsp WHERE codigo IS NULL OR TRIM(codigo) = '') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
                'Migracion 10 abortada: quedan categorias sin codigo (padre que no es raiz). Ejecute diagnosticar-codigos-categorias.ps1';
        END IF;

        -- Se conservan el tipo, el juego de caracteres y la colacion
        -- actuales de la columna: solo cambia la nulabilidad.
        SELECT CONCAT('ALTER TABLE categorias_itsp MODIFY codigo ', COLUMN_TYPE,
                      ' CHARACTER SET ', CHARACTER_SET_NAME,
                      ' COLLATE ', COLLATION_NAME, ' NOT NULL')
          INTO @migracion_10_sentencia
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'categorias_itsp'
           AND COLUMN_NAME = 'codigo';

        PREPARE sentencia_not_null FROM @migracion_10_sentencia;
        EXECUTE sentencia_not_null;
        DEALLOCATE PREPARE sentencia_not_null;
    END IF;

    -- Un indice unico cuya unica columna sea `codigo`, con el nombre que
    -- tenga. El de 01-esquema.sql es uk_categorias_itsp_codigo.
    IF NOT EXISTS (
        SELECT 1
          FROM (SELECT INDEX_NAME
                  FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'categorias_itsp'
                   AND NON_UNIQUE = 0
                 GROUP BY INDEX_NAME
                HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'codigo') u
    ) THEN
        ALTER TABLE categorias_itsp ADD CONSTRAINT uk_categorias_itsp_codigo UNIQUE (codigo);
    END IF;
END$$

DELIMITER ;

CALL migrar_codigos_categorias_10();
DROP PROCEDURE IF EXISTS migrar_codigos_categorias_10;

-- Informe final. Los irregulares se conservan tal cual (no cuentan para
-- el maximo y no se reescriben).
SELECT
    @migracion_10_rellenadas AS filas_rellenadas,
    (SELECT IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'categorias_itsp'
        AND COLUMN_NAME = 'codigo') AS codigo_admite_nulos,
    (SELECT COUNT(*)
       FROM categorias_itsp c
       LEFT JOIN categorias_itsp r ON r.id_categoria_itsp = c.id_categoria_padre
      WHERE (c.id_categoria_padre IS NULL
             AND NOT REGEXP_LIKE(TRIM(c.codigo), '^IT(SP|PS)-[0-9]{2,}$', 'i'))
         OR (c.id_categoria_padre IS NOT NULL
             AND NOT COALESCE(
                 r.id_categoria_padre IS NULL
                 AND CAST(UPPER(LEFT(TRIM(c.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 1)) AS BINARY)
                     = CAST(CONCAT(UPPER(TRIM(r.codigo)), '-') AS BINARY)
                 AND SUBSTRING(TRIM(c.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) REGEXP '^[0-9]{2,}$',
                 FALSE))) AS irregulares_conservados;
