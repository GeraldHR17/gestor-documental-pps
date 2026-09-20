// src/catalogos/dto/reglas-catalogo.ts
//
// Reglas compartidas por los DTO de los 4 catálogos. Son las mismas que
// aplica el formulario en `frontend/src/lib/validaciones.ts`
// (validarNombreCatalogo / validarDescripcionCatalogo): si cambian aquí,
// hay que cambiarlas allá, o el formulario aceptaría valores que el
// servidor rechaza con un 400.

/**
 * Sin espacios en blanco al inicio ni al final, y al menos un carácter
 * visible. Evita nombres como '  Legal' o 'Legal ' que se verían iguales
 * en pantalla pero romperían la unicidad del catálogo.
 */
export const REGEX_SIN_ESPACIOS_EXTREMOS = /^\S(?:[\s\S]*\S)?$/;
export const MENSAJE_SIN_ESPACIOS_EXTREMOS =
  'El nombre no puede iniciar ni terminar con espacios en blanco';

/** Límite de `descripcion` en tipos_documentos y dependencias: VARCHAR(255). */
export const LONGITUD_MAXIMA_DESCRIPCION = 255;
