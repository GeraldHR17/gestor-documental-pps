// src/comun/excepciones/excepciones-portal-publico.ts
//
// Excepciones del portal público de transparencia (spec 10.1).
//
// Son propias y no se reutilizan las de documentos ni las de catálogos por
// dos motivos, y los dos importan:
//
//   1. Sus mensajes están redactados para un funcionario con sesión abierta
//      ("Documento no encontrado", "El archivo de esta versión no está
//      disponible en el almacenamiento del servidor") y revelan más de lo
//      que debe saber alguien anónimo.
//   2. El filtro global escribe en el cuerpo `error` con el NOMBRE DE LA
//      CLASE de la excepción. Si el portal lanzara una clase distinta según
//      el motivo del 404, ese campo delataría exactamente lo que el único
//      mensaje genérico trata de ocultar: que el documento existe pero está
//      en borrador, por ejemplo. Una sola clase para todos los 404 es, por
//      tanto, parte de la defensa contra la enumeración (spec 12.3), no una
//      comodidad.

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 404 único del portal. Cubre a propósito casos muy distintos —no existe,
 * existe en borrador, existe inactivo, su categoría está inactiva, la
 * subsección no cuelga de esa sección, no tiene versiones— con la misma
 * clase, el mismo código y el mismo texto.
 */
export class RecursoPublicoNoDisponibleException extends HttpException {
  constructor() {
    super('El recurso solicitado no está disponible.', HttpStatus.NOT_FOUND);
  }
}

/**
 * 503: la fila existe y es pública, pero su archivo no está en disco.
 *
 * No es lo mismo que el 404 y no debe confundirse con él: aquí el documento
 * sí es público y el problema es del servidor, de modo que decirlo no filtra
 * nada y además evita que se busque el fallo donde no está.
 *
 * `AlmacenamientoDocumentosService` lanza `ArchivoNoDisponibleException`, que
 * es 410 y lleva un mensaje interno; el servicio público la traduce a esta.
 * Ver la nota de discrepancia en portal-publico.service.ts.
 */
export class DocumentoPublicoNoDisponibleException extends HttpException {
  constructor() {
    super('El documento no está disponible en este momento.', HttpStatus.SERVICE_UNAVAILABLE);
  }
}
