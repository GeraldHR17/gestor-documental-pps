// src/documentos/dto/reglas-documento.ts
//
// Reglas compartidas por los DTO de documentos. Sus equivalentes viven en
// `frontend/src/lib/validaciones.ts` (validarTituloDocumento,
// validarAnioDocumento...): si cambian aquí, hay que cambiarlas allá, o el
// formulario aceptaría valores que el servidor rechaza con un 400.

import { Transform } from 'class-transformer';

/** Sin espacios en blanco al inicio ni al final, y al menos un carácter visible. */
export const REGEX_SIN_ESPACIOS_EXTREMOS = /^\S(?:[\s\S]*\S)?$/;
export const MENSAJE_SIN_ESPACIOS_EXTREMOS =
  'El título no puede iniciar ni terminar con espacios en blanco';

/** `documentos.titulo` es VARCHAR(255); `descripcion` es TEXT, se acota por criterio de UI. */
export const LONGITUD_MAXIMA_TITULO = 255;
export const LONGITUD_MAXIMA_DESCRIPCION = 2000;
/** `versiones_documentos.comentario_version` es VARCHAR(500). */
export const LONGITUD_MAXIMA_COMENTARIO_VERSION = 500;

/** Rango real del tipo YEAR de MySQL. */
export const ANIO_MINIMO = 1901;
export const ANIO_MAXIMO = 2155;

/**
 * Los identificadores de dependencias y etiquetas viajan dentro de un
 * `multipart/form-data` junto al PDF, donde no existen los tipos de JSON:
 * todo llega como texto. Se aceptan por eso las tres formas en que un
 * cliente puede expresar una lista —campo repetido (arreglo de strings),
 * `"1,2,3"` y `"[1,2,3]"`— y se normalizan a `number[]`.
 *
 * Un valor no numérico se deja pasar como NaN a propósito: así lo rechaza
 * `@IsInt({ each: true })` con un mensaje de validación normal, en lugar de
 * desaparecer en silencio de la lista.
 */
export const aListaDeEnteros = Transform(({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((elemento) => Number(elemento));
  }

  const texto = String(value).trim();

  if (texto.startsWith('[')) {
    try {
      const analizado: unknown = JSON.parse(texto);
      if (Array.isArray(analizado)) {
        return analizado.map((elemento) => Number(elemento));
      }
    } catch {
      // Cae al separado por comas: un texto que empieza con '[' pero no es
      // JSON válido no tiene por qué invalidar toda la petición aquí; que
      // decida class-validator sobre el resultado.
    }
  }

  return texto
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0)
    .map((parte) => Number(parte));
});

/** Campo numérico opcional de multipart: '' o ausente -> undefined. */
export const aEnteroOpcional = Transform(({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
});

/**
 * Booleano de multipart: llega como 'true' / 'false' / '1' / '0'. Cualquier
 * otro texto se deja pasar tal cual para que @IsBoolean lo rechace.
 */
export const aBooleano = Transform(({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0' || value === '' || value === undefined) return false;
  return value;
});
