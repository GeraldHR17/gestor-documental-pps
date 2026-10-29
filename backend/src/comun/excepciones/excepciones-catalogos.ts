// src/comun/excepciones/excepciones-catalogos.ts
//
// Excepciones de negocio de la Fase 5 (Catálogos). Igual que las de
// autenticación, extienden HttpException para que el ExcepcionGlobalFilter
// las serialice sin cambios; el frontend muestra su `mensaje` tal cual en
// el toast de error, así que el texto está escrito para leerse de cara a
// la persona usuaria, no como código de error.

import { HttpException, HttpStatus } from '@nestjs/common';

export class RegistroCatalogoNoEncontradoException extends HttpException {
  /** @param etiqueta Nombre en singular del catálogo, ej. 'Tipo de documento'. */
  constructor(etiqueta: string) {
    super(`${etiqueta} no encontrado`, HttpStatus.NOT_FOUND);
  }
}

export class NombreCatalogoDuplicadoException extends HttpException {
  constructor(etiqueta: string) {
    super(`Ya existe ${etiqueta} con ese nombre`, HttpStatus.CONFLICT);
  }
}

/**
 * El código de una categoría lo asigna el sistema (máximo + 1) y lo
 * garantiza el índice único. Si dos personas crean a la vez, una pierde la
 * carrera y se reintenta; esto sólo se lanza si se pierde tres veces
 * seguidas.
 */
export class CodigoCategoriaNoAsignadoException extends HttpException {
  constructor() {
    super('No se pudo asignar un código a la categoría; intente de nuevo', HttpStatus.CONFLICT);
  }
}

/**
 * Modos de romper la jerarquía ITSP: padre inexistente, superar el tope de
 * niveles, moverse dentro de su propio subárbol, un código que no cabe en
 * la columna, llevar documentos a Participación ciudadana, y cambiar de
 * nivel (una raíz no pasa a subsección ni una subsección a raíz, porque su
 * código y su URL dejarían de tener sentido).
 */
export class CategoriaPadreInvalidaException extends HttpException {
  constructor(motivo: string) {
    super(motivo, HttpStatus.BAD_REQUEST);
  }
}
