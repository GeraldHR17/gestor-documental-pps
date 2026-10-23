-- base-datos/scripts/diagnostico/10-diagnostico-codigos-categorias.sql
--
-- SOLO LECTURA: unicamente SELECT. Se ejecuta ANTES de aplicar
-- init/10-codigos-categorias-autogenerados.sql para saber que va a hacer
-- la migracion sobre los datos reales, y despues para confirmar que no
-- quedan nulos. Vive fuera de init/ a proposito: preparar-base-datos.ps1
-- aplica y registra todo lo que hay en init/.
--
-- En la VM se ejecuta con despliegue/diagnosticar-codigos-categorias.ps1,
-- que quita la linea USE y selecciona la base por parametro, y ademas
-- lista lo que registra scripts_aplicados (bloque 1b): eso no se puede
-- hacer en SQL plano si la tabla no existe.
--
-- La regla de numeracion es la misma que la de
-- backend/src/catalogos/codigos-categoria.ts y la de la migracion 10
-- (spec-ajustes-posdespliegue §7.1):
--   raiz reconocida      ^IT(SP|PS)-[0-9]{2,}$, sin distinguir mayusculas
--   subseccion reconocida  CODIGO_DE_SU_RAIZ-[0-9]{2,}, sin distinguir
--   nuevo codigo         maximo reconocido + 1, dos digitos como minimo
SET NAMES utf8mb4;
USE gestor_documental_pps;

-- ------------------------------------------------------------
SELECT '1. Estructura' AS bloque;
-- ------------------------------------------------------------
SELECT
    col.IS_NULLABLE AS codigo_admite_nulos,
    col.COLUMN_TYPE AS tipo,
    col.COLLATION_NAME AS colacion_columna,
    COALESCE((
        SELECT GROUP_CONCAT(u.INDEX_NAME)
        FROM (
            SELECT INDEX_NAME
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'categorias_itsp'
              AND NON_UNIQUE = 0
            GROUP BY INDEX_NAME
            HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'codigo'
        ) u
    ), 'NINGUNO') AS indice_unico_sobre_codigo,
    IF(EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scripts_aplicados'
    ), 'SI', 'NO') AS existe_scripts_aplicados
FROM information_schema.COLUMNS col
WHERE col.TABLE_SCHEMA = DATABASE()
  AND col.TABLE_NAME = 'categorias_itsp'
  AND col.COLUMN_NAME = 'codigo';

-- ------------------------------------------------------------
SELECT '2. Nulos y vacios (la migracion los rellena)' AS bloque;
-- ------------------------------------------------------------
SELECT
    c.id_categoria_itsp AS id,
    c.nivel,
    c.id_categoria_padre AS id_padre,
    c.nombre,
    c.estado,
    QUOTE(c.codigo) AS codigo
FROM categorias_itsp c
WHERE c.codigo IS NULL OR TRIM(c.codigo) = ''
ORDER BY c.id_categoria_padre IS NOT NULL, c.id_categoria_padre, c.orden, c.id_categoria_itsp;

-- ------------------------------------------------------------
SELECT '3. Irregulares (se conservan y no cuentan para el maximo)' AS bloque;
-- ------------------------------------------------------------
SELECT
    c.id_categoria_itsp AS id,
    c.nivel,
    c.id_categoria_padre AS id_padre,
    QUOTE(c.codigo) AS codigo,
    CASE
        WHEN c.id_categoria_padre IS NULL THEN 'raiz que no es ITSP-NN ni ITPS-NN'
        WHEN r.id_categoria_itsp IS NULL THEN 'su padre no existe'
        WHEN r.id_categoria_padre IS NOT NULL THEN 'su padre no es una raiz (tercer nivel)'
        WHEN r.codigo IS NULL OR TRIM(r.codigo) = '' THEN 'su raiz no tiene codigo todavia'
        ELSE CONCAT('no sigue el patron ', UPPER(TRIM(r.codigo)), '-MM')
    END AS motivo
FROM categorias_itsp c
LEFT JOIN categorias_itsp r ON r.id_categoria_itsp = c.id_categoria_padre
WHERE TRIM(c.codigo) <> ''
  AND (
        (c.id_categoria_padre IS NULL
            AND NOT REGEXP_LIKE(TRIM(c.codigo), '^IT(SP|PS)-[0-9]{2,}$', 'i'))
     OR (c.id_categoria_padre IS NOT NULL
            AND NOT COALESCE(
                r.id_categoria_padre IS NULL
                AND TRIM(r.codigo) <> ''
                AND CAST(UPPER(LEFT(TRIM(c.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 1)) AS BINARY)
                    = CAST(CONCAT(UPPER(TRIM(r.codigo)), '-') AS BINARY)
                AND SUBSTRING(TRIM(c.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) REGEXP '^[0-9]{2,}$',
                FALSE))
  )
ORDER BY c.id_categoria_itsp;

-- ------------------------------------------------------------
SELECT '4. Duplicados (si hay alguno, la migracion ABORTA sin escribir)' AS bloque;
-- ------------------------------------------------------------
-- Tres formas de "mismo codigo": el mismo texto (sin espacios extremos y
-- con la colacion de la columna, que es la que usa el indice unico), el
-- mismo numero de raiz (ITSP-05, ITPS-05, ITSP-005) o el mismo numero de
-- subseccion dentro de una raiz. Los numeros se calculan primero en una
-- CTE porque only_full_group_by no reconoce la misma expresion repetida
-- en el SELECT y en el GROUP BY.
WITH
textos AS (
    SELECT id_categoria_itsp AS id, TRIM(codigo) AS texto
    FROM categorias_itsp
    WHERE TRIM(codigo) <> ''
),
raices_reconocidas AS (
    SELECT id_categoria_itsp AS id,
           CAST(SUBSTRING(TRIM(codigo), 6) AS UNSIGNED) AS numero
    FROM categorias_itsp
    WHERE id_categoria_padre IS NULL
      AND REGEXP_LIKE(TRIM(codigo), '^IT(SP|PS)-[0-9]{2,}$', 'i')
),
hijas_reconocidas AS (
    SELECT h.id_categoria_itsp AS id,
           h.id_categoria_padre AS id_raiz,
           UPPER(TRIM(r.codigo)) AS prefijo,
           CAST(SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) AS UNSIGNED) AS numero
    FROM categorias_itsp h
    JOIN categorias_itsp r
      ON r.id_categoria_itsp = h.id_categoria_padre
     AND r.id_categoria_padre IS NULL
     AND TRIM(r.codigo) <> ''
    WHERE TRIM(h.codigo) <> ''
      AND CAST(UPPER(LEFT(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 1)) AS BINARY)
          = CAST(CONCAT(UPPER(TRIM(r.codigo)), '-') AS BINARY)
      AND SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) REGEXP '^[0-9]{2,}$'
)
-- CONVERT(... USING utf8mb4) en las tres ramas: la columna tiene la
-- colacion de la base (utf8mb4_unicode_ci en la VM) y los literales la de
-- la conexion; sin igualarlas, el UNION falla con "Illegal mix of
-- collations".
SELECT 'mismo texto' AS tipo,
       CONVERT(MIN(texto) USING utf8mb4) AS clave,
       GROUP_CONCAT(id ORDER BY id) AS ids
FROM textos
GROUP BY texto
HAVING COUNT(*) > 1
UNION ALL
SELECT 'mismo numero de raiz',
       CONVERT(CAST(numero AS CHAR) USING utf8mb4),
       GROUP_CONCAT(id ORDER BY id)
FROM raices_reconocidas
GROUP BY numero
HAVING COUNT(*) > 1
UNION ALL
SELECT 'mismo numero de subseccion',
       CONVERT(CONCAT(MIN(prefijo), '-', numero) USING utf8mb4),
       GROUP_CONCAT(id ORDER BY id)
FROM hijas_reconocidas
GROUP BY id_raiz, numero
HAVING COUNT(*) > 1;

-- ------------------------------------------------------------
SELECT '5. Grafia (solo informativo)' AS bloque;
-- ------------------------------------------------------------
SELECT
    c.id_categoria_itsp AS id,
    QUOTE(c.codigo) AS codigo,
    CONCAT_WS(', ',
        IF(c.id_categoria_padre IS NULL AND UPPER(TRIM(c.codigo)) LIKE 'ITPS-%', 'prefijo ITPS (errata)', NULL),
        IF(CAST(c.codigo AS BINARY) <> CAST(UPPER(c.codigo) AS BINARY), 'minusculas', NULL),
        IF(CHAR_LENGTH(c.codigo) <> CHAR_LENGTH(TRIM(c.codigo)), 'espacios extremos', NULL)
    ) AS observacion
FROM categorias_itsp c
WHERE TRIM(c.codigo) <> ''
  AND (
        (c.id_categoria_padre IS NULL AND UPPER(TRIM(c.codigo)) LIKE 'ITPS-%')
     OR CAST(c.codigo AS BINARY) <> CAST(UPPER(c.codigo) AS BINARY)
     OR CHAR_LENGTH(c.codigo) <> CHAR_LENGTH(TRIM(c.codigo))
  )
ORDER BY c.id_categoria_itsp;

-- ------------------------------------------------------------
SELECT '6. Vista previa: codigo que asignaria la migracion' AS bloque;
-- ------------------------------------------------------------
-- Equivale al bucle de la migracion: las raices sin codigo reciben, en
-- orden (orden, id), maximo + 1, + 2...; despues las subsecciones sin
-- codigo, por raiz y en el mismo orden, con el codigo (ya rellenado) de
-- su raiz como prefijo.
WITH
maximo_raiz AS (
    SELECT COALESCE(MAX(CAST(SUBSTRING(TRIM(codigo), 6) AS UNSIGNED)), 0) AS maximo
    FROM categorias_itsp
    WHERE id_categoria_padre IS NULL
      AND REGEXP_LIKE(TRIM(codigo), '^IT(SP|PS)-[0-9]{2,}$', 'i')
),
raices_sin_codigo AS (
    SELECT c.id_categoria_itsp AS id,
           (SELECT maximo FROM maximo_raiz)
             + ROW_NUMBER() OVER (ORDER BY c.orden, c.id_categoria_itsp) AS numero
    FROM categorias_itsp c
    WHERE c.id_categoria_padre IS NULL
      AND (c.codigo IS NULL OR TRIM(c.codigo) = '')
),
raices AS (
    SELECT c.id_categoria_itsp AS id,
           COALESCE(
               NULLIF(TRIM(c.codigo), ''),
               CONCAT('ITSP-', IF(n.numero < 100, LPAD(n.numero, 2, '0'), CAST(n.numero AS CHAR)))
           ) AS codigo_final
    FROM categorias_itsp c
    LEFT JOIN raices_sin_codigo n ON n.id = c.id_categoria_itsp
    WHERE c.id_categoria_padre IS NULL
),
maximo_hija AS (
    SELECT r.id AS id_raiz,
           COALESCE(MAX(
               CASE
                   WHEN TRIM(h.codigo) <> ''
                    AND CAST(UPPER(LEFT(TRIM(h.codigo), CHAR_LENGTH(r.codigo_final) + 1)) AS BINARY)
                        = CAST(CONCAT(UPPER(r.codigo_final), '-') AS BINARY)
                    AND SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(r.codigo_final) + 2) REGEXP '^[0-9]{2,}$'
                   THEN CAST(SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(r.codigo_final) + 2) AS UNSIGNED)
               END
           ), 0) AS maximo
    FROM raices r
    LEFT JOIN categorias_itsp h ON h.id_categoria_padre = r.id
    GROUP BY r.id
),
hijas_sin_codigo AS (
    SELECT h.id_categoria_itsp AS id,
           h.id_categoria_padre AS id_raiz,
           m.maximo + ROW_NUMBER() OVER (
               PARTITION BY h.id_categoria_padre ORDER BY h.orden, h.id_categoria_itsp
           ) AS numero
    FROM categorias_itsp h
    JOIN maximo_hija m ON m.id_raiz = h.id_categoria_padre
    WHERE h.codigo IS NULL OR TRIM(h.codigo) = ''
),
-- CONVERT en las dos ramas por la misma razon que en el bloque 4.
previstos AS (
    SELECT n.id, CONVERT(r.codigo_final USING utf8mb4) AS codigo_previsto
    FROM raices_sin_codigo n
    JOIN raices r ON r.id = n.id
    UNION ALL
    SELECT n.id,
           CONVERT(CONCAT(UPPER(r.codigo_final), '-',
                          IF(n.numero < 100, LPAD(n.numero, 2, '0'), CAST(n.numero AS CHAR)))
                   USING utf8mb4)
    FROM hijas_sin_codigo n
    JOIN raices r ON r.id = n.id_raiz
)
SELECT
    c.id_categoria_itsp AS id,
    c.nivel,
    c.id_categoria_padre AS id_padre,
    c.nombre,
    COALESCE(p.codigo_previsto, 'SIN VISTA PREVIA: su padre no es una raiz; la migracion abortara') AS codigo_previsto
FROM categorias_itsp c
LEFT JOIN previstos p ON p.id = c.id_categoria_itsp
WHERE c.codigo IS NULL OR TRIM(c.codigo) = ''
ORDER BY c.id_categoria_padre IS NOT NULL, c.id_categoria_padre, c.orden, c.id_categoria_itsp;

-- ------------------------------------------------------------
SELECT '7. Resumen' AS bloque;
-- ------------------------------------------------------------
-- La ultima fila del archivo: el envoltorio .ps1 la lee para su veredicto.
WITH
textos AS (
    SELECT TRIM(codigo) AS texto
    FROM categorias_itsp
    WHERE TRIM(codigo) <> ''
),
raices_reconocidas AS (
    SELECT CAST(SUBSTRING(TRIM(codigo), 6) AS UNSIGNED) AS numero
    FROM categorias_itsp
    WHERE id_categoria_padre IS NULL
      AND REGEXP_LIKE(TRIM(codigo), '^IT(SP|PS)-[0-9]{2,}$', 'i')
),
hijas_reconocidas AS (
    SELECT h.id_categoria_padre AS id_raiz,
           CAST(SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) AS UNSIGNED) AS numero
    FROM categorias_itsp h
    JOIN categorias_itsp r
      ON r.id_categoria_itsp = h.id_categoria_padre
     AND r.id_categoria_padre IS NULL
     AND TRIM(r.codigo) <> ''
    WHERE TRIM(h.codigo) <> ''
      AND CAST(UPPER(LEFT(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 1)) AS BINARY)
          = CAST(CONCAT(UPPER(TRIM(r.codigo)), '-') AS BINARY)
      AND SUBSTRING(TRIM(h.codigo), CHAR_LENGTH(TRIM(r.codigo)) + 2) REGEXP '^[0-9]{2,}$'
)
SELECT
    (SELECT COUNT(*) FROM categorias_itsp
      WHERE codigo IS NULL OR TRIM(codigo) = '') AS nulos_vacios,
    (SELECT COUNT(*) FROM (SELECT 1 FROM textos GROUP BY texto HAVING COUNT(*) > 1) a)
  + (SELECT COUNT(*) FROM (SELECT 1 FROM raices_reconocidas GROUP BY numero HAVING COUNT(*) > 1) b)
  + (SELECT COUNT(*) FROM (SELECT 1 FROM hijas_reconocidas GROUP BY id_raiz, numero HAVING COUNT(*) > 1) c)
      AS grupos_duplicados,
    (SELECT COUNT(*) FROM categorias_itsp h
       LEFT JOIN categorias_itsp r ON r.id_categoria_itsp = h.id_categoria_padre
      WHERE (h.codigo IS NULL OR TRIM(h.codigo) = '')
        AND h.id_categoria_padre IS NOT NULL
        AND (r.id_categoria_itsp IS NULL OR r.id_categoria_padre IS NOT NULL)) AS sin_vista_previa;
