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

export class CodigoCategoriaDuplicadoException extends HttpException {
  constructor() {
    super('Ya existe una categoría con ese código', HttpStatus.CONFLICT);
  }
}

/**
 * La taxonomía ITSP es de exactamente dos niveles (raíz -> subsección),
 * porque así la consumen los selects en cascada del formulario de
 * documentos. Cubre los tres modos de romperla: padre inexistente, padre
 * que ya es subsección, y una raíz con hijos a la que se le quiere poner
 * un padre (pasaría a tener nietos).
 */
export class CategoriaPadreInvalidaException extends HttpException {
  constructor(motivo: string) {
    super(motivo, HttpStatus.BAD_REQUEST);
  }
}
