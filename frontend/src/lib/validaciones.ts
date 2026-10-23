// src/lib/validaciones.ts
//
// Reglas de validación de los formularios de Usuario, en un solo archivo
// para que creación y edición no puedan divergir.
//
// Cada validador devuelve el mensaje de error o `null` si el valor es
// válido. Esa forma es la que permite que el formulario limpie el error
// solo: no hay que "borrar" nada, basta con volver a evaluar el valor.

/** Solo letras (con tildes y ñ) y espacios. 3 a 150 = límite real de la columna VARCHAR(150). */
export const REGEX_NOMBRE_COMPLETO = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü ]{3,150}$/;
export const MENSAJE_NOMBRE_COMPLETO =
  'El nombre solo puede contener letras y espacios (3 a 150 caracteres).';

/** Alfanumérico sin espacios ni símbolos. Nacional: numérico; extranjero: admite letras (pasaporte). */
export const REGEX_IDENTIFICACION = /^[A-Za-z0-9]{8,12}$/;
export const MENSAJE_IDENTIFICACION =
  'La identificación debe tener entre 8 y 12 caracteres alfanuméricos.';

export const DOMINIO_INSTITUCIONAL = 'munipalmares.go.cr';
/** El correo se normaliza a minúsculas antes de comparar, así que la regex no necesita rangos en mayúscula. */
export const REGEX_CORREO_INSTITUCIONAL = /^[a-z0-9._%+-]+@munipalmares\.go\.cr$/;
export const MENSAJE_CORREO_INSTITUCIONAL =
  'Debe ser un correo institucional válido (@munipalmares.go.cr).';

/**
 * Misma política que ya aplica el backend en `crear-usuario.dto.ts`
 * (REGEX_POLITICA_CONTRASENA) y que describen los textos de ayuda del
 * registro y la recuperación de contraseña. Se replica aquí —con el mismo
 * mensaje— para poder avisar mientras la persona escribe, en vez de
 * esperar al 400 del servidor. Si la política cambia, hay que cambiarla
 * en ambos lados.
 */
export const REGEX_POLITICA_CONTRASENA = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const MENSAJE_POLITICA_CONTRASENA =
  'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial';

export function normalizarCorreo(valor: string): string {
  return valor.trim().toLowerCase();
}

export function validarNombreCompleto(valor: string): string | null {
  if (!valor.trim()) return 'El nombre completo es obligatorio.';
  return REGEX_NOMBRE_COMPLETO.test(valor.trim()) ? null : MENSAJE_NOMBRE_COMPLETO;
}

export function validarIdentificacion(valor: string): string | null {
  if (!valor.trim()) return 'La identificación es obligatoria.';
  return REGEX_IDENTIFICACION.test(valor.trim()) ? null : MENSAJE_IDENTIFICACION;
}

export function validarCorreoInstitucional(valor: string): string | null {
  if (!valor.trim()) return 'El correo institucional es obligatorio.';
  return REGEX_CORREO_INSTITUCIONAL.test(normalizarCorreo(valor)) ? null : MENSAJE_CORREO_INSTITUCIONAL;
}

export function validarContrasena(valor: string): string | null {
  if (!valor) return 'La contraseña temporal es obligatoria.';
  return REGEX_POLITICA_CONTRASENA.test(valor) ? null : MENSAJE_POLITICA_CONTRASENA;
}

// ---------------------------------------------------------------------
// Catálogos (Fase 5)
//
// Las mismas reglas viven en `backend/src/catalogos/dto/reglas-catalogo.ts`;
// si cambian aquí, hay que cambiarlas allá, o el formulario aceptaría
// valores que el servidor rechaza con un 400.
// ---------------------------------------------------------------------

/** Límite de `descripcion` en tipos_documentos y dependencias: VARCHAR(255). */
export const LONGITUD_MAXIMA_DESCRIPCION_CATALOGO = 255;

/**
 * @param longitudMaxima Límite real de la columna, distinto por catálogo:
 *   200 en categorías ITSP, 150 en dependencias, 100 en tipos y etiquetas.
 */
export function validarNombreCatalogo(valor: string, longitudMaxima: number): string | null {
  if (!valor.trim()) return 'El nombre es obligatorio.';

  // Se avisa en vez de recortar en silencio: '  Legal' y 'Legal' se verían
  // idénticos en pantalla pero romperían la unicidad del catálogo.
  if (valor !== valor.trim()) {
    return 'El nombre no puede iniciar ni terminar con espacios en blanco.';
  }

  if (valor.length > longitudMaxima) {
    return `El nombre no puede superar los ${longitudMaxima} caracteres.`;
  }

  return null;
}

/** La descripción es opcional en todos los catálogos que la tienen. */
export function validarDescripcionCatalogo(valor: string): string | null {
  if (valor.trim() && valor.length > LONGITUD_MAXIMA_DESCRIPCION_CATALOGO) {
    return `La descripción no puede superar los ${LONGITUD_MAXIMA_DESCRIPCION_CATALOGO} caracteres.`;
  }
  return null;
}


// ---------------------------------------------------------------------
// Documentos (Fase 6)
//
// Las mismas reglas viven en `backend/src/documentos/dto/reglas-documento.ts`;
// si cambian aquí, hay que cambiarlas allá.
// ---------------------------------------------------------------------

/** `documentos.titulo` es VARCHAR(255). */
export const LONGITUD_MAXIMA_TITULO_DOCUMENTO = 255;
export const LONGITUD_MAXIMA_DESCRIPCION_DOCUMENTO = 2000;
/** `versiones_documentos.comentario_version` es VARCHAR(500). */
export const LONGITUD_MAXIMA_COMENTARIO_VERSION = 500;

/** Rango real del tipo YEAR de MySQL. */
export const ANIO_MINIMO_DOCUMENTO = 1901;
export const ANIO_MAXIMO_DOCUMENTO = 2155;

export function validarTituloDocumento(valor: string): string | null {
  if (!valor.trim()) return 'El título es obligatorio.';

  if (valor !== valor.trim()) {
    return 'El título no puede iniciar ni terminar con espacios en blanco.';
  }

  if (valor.length > LONGITUD_MAXIMA_TITULO_DOCUMENTO) {
    return `El título no puede superar los ${LONGITUD_MAXIMA_TITULO_DOCUMENTO} caracteres.`;
  }

  return null;
}

export function validarDescripcionDocumento(valor: string): string | null {
  if (valor.length > LONGITUD_MAXIMA_DESCRIPCION_DOCUMENTO) {
    return `La descripción no puede superar los ${LONGITUD_MAXIMA_DESCRIPCION_DOCUMENTO} caracteres.`;
  }
  return null;
}

/** `valor` llega como texto porque el input numérico puede quedar vacío. */
export function validarAnioDocumento(valor: string): string | null {
  if (!valor.trim()) return 'El año es obligatorio.';

  const anio = Number(valor);
  if (!Number.isInteger(anio)) return 'El año debe ser un número entero.';

  if (anio < ANIO_MINIMO_DOCUMENTO || anio > ANIO_MAXIMO_DOCUMENTO) {
    return `El año debe estar entre ${ANIO_MINIMO_DOCUMENTO} y ${ANIO_MAXIMO_DOCUMENTO}.`;
  }

  return null;
}

export function validarComentarioVersion(valor: string): string | null {
  if (valor.length > LONGITUD_MAXIMA_COMENTARIO_VERSION) {
    return `El comentario no puede superar los ${LONGITUD_MAXIMA_COMENTARIO_VERSION} caracteres.`;
  }
  return null;
}

// ---------------------------------------------------------------------
// Entradas numéricas no negativas
// ---------------------------------------------------------------------

/**
 * Bloqueo real de negativos en un `<input type="number">`: `min="0"` sólo
 * afecta a las flechas del control, no impide escribir "-5". Se usa en
 * `@keydown` (rechaza el signo menos y la notación exponencial) y en
 * `@input` (por si el valor llegó pegado o por autocompletado).
 */
export function bloquearNegativos(evento: KeyboardEvent): void {
  if (evento.key === '-' || evento.key === 'e' || evento.key === 'E') {
    evento.preventDefault();
  }
}

/** Devuelve el valor saneado (≥ 0) y corrige el input si hizo falta. */
export function sanearNoNegativo(evento: Event): string {
  const entrada = evento.target as HTMLInputElement;
  if (entrada.value.startsWith('-')) {
    entrada.value = entrada.value.replace(/^-+/, '');
    entrada.dispatchEvent(new Event('input'));
  }
  return entrada.value;
}
