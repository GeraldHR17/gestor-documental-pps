USE gestor_documental_pps;

-- El cliente mysql del contenedor usa latin1 por defecto al ejecutar los
-- scripts de init; sin esta linea, todo texto acentuado queda con doble
-- codificacion en la base (ej. 'Gestion' guardado como 'GestiÃ³n').
SET NAMES utf8mb4;

-- ============================================================
-- 07-DATOS-CATALOGOS-FASE5.SQL
-- Datos semilla de tipos_documentos (catálogo plano).
--
-- categorias_itsp NO se toca aquí: ya quedó sembrada en 03-datos-itsp.sql
-- con sus 4 raíces y subsecciones.
--
-- dependencias queda vacía intencionalmente: el Superadministrador
-- la puebla dinámicamente según el área que origina cada documento
-- (no existe un listado oficial predefinido, confirmado por el PO).
--
-- etiquetas queda vacía intencionalmente: se crean sobre la marcha al
-- clasificar documentos, no responden a un listado oficial.
-- ============================================================

-- Grupo: Rendición de Cuentas y Presupuesto
INSERT INTO tipos_documentos (nombre, descripcion) VALUES
('Presupuestos Ordinarios', 'Documentos anuales detallados de la proyección de ingresos y gastos públicos.'),
('Presupuestos Extraordinarios', 'Modificaciones presupuestarias aprobadas durante el año fiscal en curso.'),
('Liquidaciones Presupuestarias', 'Informes técnicos del cierre contable evaluados por la Contraloría General de la República.'),
('Informes de Labores', 'Documentos anuales de rendición de cuentas emitidos directamente por la Alcaldía Municipal.'),
('Informes POA / PAO', 'Evaluaciones físicas y presupuestarias de las metas fijadas en el Plan Anual Operativo.'),
('Agendas y Bitácoras', 'Registros documentales de las giras de trabajo y reuniones de los jerarcas municipales.'),

-- Grupo: Planificación Institucional
('Planes de Corto, Mediano y Largo Plazo', 'Estrategias de desarrollo local e institucional de la municipalidad.'),
('Planes Anuales Operativos (PAO)', 'Documentos de planificación operativa que rigen el año correspondiente.'),
('Planes de Desarrollo Humano Local (PDHL)', 'Diagnósticos socioeconómicos y planes de acción comunal a largo plazo.'),
('Plan de Ordenamiento Territorial', 'Reglamentos, mapas e informes de zonificación urbana y uso del suelo.'),

-- Grupo: Información Institucional y Recursos Humanos
('Organigramas', 'Esquemas de la estructura jerárquica y organizacional actualizada.'),
('Manuales de Puestos', 'Documentos técnicos descriptivos con los requisitos y competencias de cada plaza institucional.'),
('Informes de Competencias y Responsabilidades', 'Listados del marco de funciones de cada oficina o jefatura.'),
('Informes de Activos y Bienes Inmuebles', 'Registros patrimoniales detallados sobre las propiedades e infraestructura municipal.'),
('Estados de Pasivos', 'Informes financieros sobre las deudas, obligaciones fiscales o compromisos económicos municipales.'),

-- Grupo: Adquisiciones y Proveeduría
('Programas Anuales de Adquisiciones', 'Documentación del plan de compras planificado por la administración para el año en curso.'),
('Carteles de Licitación', 'Especificaciones técnicas y pliegos de condiciones administrativas para concursos públicos (enlazados a través de SICOP).'),
('Actas de Adjudicación', 'Documentos legales donde se formaliza la selección del oferente ganador de una compra pública.'),
('Contratos Administrativos', 'Documentos contractuales suscritos entre la municipalidad y los proveedores adjudicados.'),

-- Grupo: Participación Ciudadana y Gestión Comunitaria
('Encuestas Ciudadanas y Resultados', 'Documentos con el procesamiento de datos recopilados sobre la percepción de los servicios locales.'),
('Informes de Canales de Comunicación', 'Evaluaciones de los medios oficiales de interacción y atención del cantón.'),
('Actas de Audiencias Públicas', 'Documentación de los acuerdos tomados en procesos participativos o cabildos abiertos con la comunidad.'),
('Agendas Ciudadanas', 'Programaciones documentadas de foros o actividades de consulta comunal.'),

-- Grupo: Datos Abiertos (Open Data)
('Lista de Patentados', 'Documentos con los registros públicos de comercios y patentes aprobadas en el cantón.'),
('Planilla Municipal', 'Listados del personal y salarios de la institución.'),
('Pagos de Dietas a Regidores', 'Desgloses de compensaciones económicas entregadas al Concejo Municipal.'),
('Informes de Viáticos', 'Detalle documental del gasto de viáticos facturados por funcionarios públicos.'),
('Compras por Funcionario', 'Informes de los procesos de adquisición fiscalizados por departamento ejecutor.'),

-- Grupo: Marco Jurídico y Normativo
('Actas del Concejo Municipal', 'Documentos oficiales tras cada sesión ordinaria o extraordinaria donde se registran votaciones y acuerdos de los regidores.'),
('Reglamentos Municipales', 'Textos normativos e internos vigentes que regulan el cobro de tasas, patentes, servicios y el ordenamiento interno.');

SELECT 'Datos semilla de tipos_documentos creados correctamente (dependencias queda vacía)' AS estado;

SELECT COUNT(*) AS total_tipos_documentos FROM tipos_documentos;
SELECT COUNT(*) AS total_dependencias FROM dependencias;
