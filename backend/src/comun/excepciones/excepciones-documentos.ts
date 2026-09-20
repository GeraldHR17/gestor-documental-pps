// src/comun/excepciones/excepciones-documentos.ts
//
// Excepciones de negocio de la Fase 6 (Gestión Documental). Mismo criterio
// que las de catálogos: extienden HttpException para que el
// ExcepcionGlobalFilter las serialice sin cambios, y su texto está escrito
// para leerse tal cual en el toast del frontend.

import { HttpException, HttpStatus } from '@nestjs/common';

export class DocumentoNoEncontradoException extends HttpException {
  constructor() {
    super('Documento no encontrado', HttpStatus.NOT_FOUND);
  }
}

export class VersionNoEncontradaException extends HttpException {
  constructor(numeroVersion?: number) {
    super(
      numeroVersion !== undefined
        ? `El documento no tiene una versión ${numeroVersion}`
        : 'El documento no tiene ninguna versión cargada',
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Falla cualquiera de las cuatro comprobaciones del archivo (RNF-005):
 * extensión, mime type declarado, firma de bytes y contenido no vacío.
 */
export class ArchivoInvalidoException extends HttpException {
  constructor(motivo: string) {
    super(motivo, HttpStatus.BAD_REQUEST);
  }
}

export class ArchivoDemasiadoGrandeException extends HttpException {
  constructor(tamanoMaximoMb: number) {
    super(
      `El archivo supera el tamaño máximo permitido de ${tamanoMaximoMb} MB`,
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }
}

/**
 * El archivo está registrado en la base pero no se encuentra en disco.
 * Es 410 y no 404 a propósito: el documento sí existe, lo que falta es su
 * contenido, y confundirlo con "documento no encontrado" mandaría a buscar
 * el problema al lugar equivocado.
 */
export class ArchivoNoDisponibleException extends HttpException {
  constructor() {
    super(
      'El archivo de esta versión no está disponible en el almacenamiento del servidor',
      HttpStatus.GONE,
    );
  }
}

/**
 * Transición de estado no permitida (publicar algo ya publicado, editar un
 * documento inactivo, etc.). 409 porque el problema no es la petición en sí
 * sino el estado actual del recurso.
 */
export class TransicionEstadoInvalidaException extends HttpException {
  constructor(motivo: string) {
    super(motivo, HttpStatus.CONFLICT);
  }
}

/**
 * Requisito de publicación incumplido (VP-03 / RN-009): al menos una
 * versión de PDF cargada, además de los metadatos obligatorios.
 */
export class DocumentoNoPublicableException extends HttpException {
  constructor(motivo: string) {
    super(motivo, HttpStatus.CONFLICT);
  }
}

/** Categoría ITSP, tipo, dependencia o etiqueta inexistente o inactiva. */
export class ClasificacionInvalidaException extends HttpException {
  constructor(motivo: string) {
    super(motivo, HttpStatus.BAD_REQUEST);
  }
}
