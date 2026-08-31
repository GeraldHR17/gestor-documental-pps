USE gestor_documental_pps;

-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base (ej. 'Gestion' guardado como 'GestiÃ³n').
SET NAMES utf8mb4;

-- ============================================================
-- 03-DATOS-ITSP.SQL
-- Taxonomía ITSP: categorías raíz (nivel 1) y subsecciones (nivel 2).
-- Referencia: estructura adoptada de la Municipalidad de San Pablo
-- (sanpablo.go.cr/indicetransparencia), adaptada al proyecto.
-- ============================================================

-- ============================================================
-- NIVEL 1 — CATEGORÍAS RAÍZ
-- ============================================================
INSERT INTO categorias_itsp (codigo, nombre, descripcion, nivel, orden) VALUES
('ITSP-01', 'Información institucional', 'Información general y administrativa de la institución.', 1, 1),
('ITSP-02', 'Rendición de cuentas',      'Información relacionada con la rendición de cuentas institucional.', 1, 2),
('ITSP-03', 'Participación ciudadana',   'Información relacionada con mecanismos y espacios de participación ciudadana.', 1, 3),
('ITSP-04', 'Datos abiertos de gobierno','Información pública disponible como datos abiertos de gobierno.', 1, 4);


-- ============================================================
-- NIVEL 2 — SUBSECCIONES DE "Información institucional"
-- ============================================================
INSERT INTO categorias_itsp (id_categoria_padre, codigo, nombre, nivel, orden)
SELECT id_categoria_itsp, 'ITSP-01-01', 'Información institucional básica', 2, 1
FROM categorias_itsp WHERE codigo = 'ITSP-01'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-01-02', 'Organización y funciones', 2, 2
FROM categorias_itsp WHERE codigo = 'ITSP-01'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-01-03', 'Herramientas para acceso a la información', 2, 3
FROM categorias_itsp WHERE codigo = 'ITSP-01'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-01-04', 'Procesos de contratación', 2, 4
FROM categorias_itsp WHERE codigo = 'ITSP-01'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-01-05', 'Inclusividad', 2, 5
FROM categorias_itsp WHERE codigo = 'ITSP-01'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-01-06', 'Transparencia', 2, 6
FROM categorias_itsp WHERE codigo = 'ITSP-01';


-- ============================================================
-- NIVEL 2 — SUBSECCIONES DE "Rendición de cuentas"
-- ============================================================
INSERT INTO categorias_itsp (id_categoria_padre, codigo, nombre, nivel, orden)
SELECT id_categoria_itsp, 'ITSP-02-01', 'Planes institucionales', 2, 1
FROM categorias_itsp WHERE codigo = 'ITSP-02'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-02-02', 'Informes institucionales', 2, 2
FROM categorias_itsp WHERE codigo = 'ITSP-02';


-- ============================================================
-- NIVEL 2 — SUBSECCIÓN DE "Participación ciudadana"
-- Sin desglose adicional publicado en la fuente de referencia;
-- se deja como sección única de información general.
-- ============================================================
INSERT INTO categorias_itsp (id_categoria_padre, codigo, nombre, nivel, orden)
SELECT id_categoria_itsp, 'ITSP-03-01', 'Información', 2, 1
FROM categorias_itsp WHERE codigo = 'ITSP-03';


-- ============================================================
-- NIVEL 2 — SUBSECCIONES DE "Datos abiertos de gobierno"
-- ============================================================
INSERT INTO categorias_itsp (id_categoria_padre, codigo, nombre, nivel, orden)
SELECT id_categoria_itsp, 'ITSP-04-01', 'Presupuesto público', 2, 1
FROM categorias_itsp WHERE codigo = 'ITSP-04'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-04-02', 'Ejecución del presupuesto', 2, 2
FROM categorias_itsp WHERE codigo = 'ITSP-04'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-04-03', 'Contratación administrativa', 2, 3
FROM categorias_itsp WHERE codigo = 'ITSP-04'
UNION ALL
SELECT id_categoria_itsp, 'ITSP-04-04', 'Estadísticas o registros del sector', 2, 4
FROM categorias_itsp WHERE codigo = 'ITSP-04';


SELECT 'Taxonomía ITSP (raíces + subsecciones) creada correctamente' AS estado;

SELECT
    c1.nombre AS categoria_raiz,
    c2.nombre AS subseccion,
    c2.codigo,
    c2.orden
FROM categorias_itsp c1
JOIN categorias_itsp c2 ON c2.id_categoria_padre = c1.id_categoria_itsp
ORDER BY c1.orden, c2.orden;