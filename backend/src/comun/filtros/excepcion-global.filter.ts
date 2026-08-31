// src/comun/filtros/excepcion-global.filter.ts
//
// Filtro global de excepciones (spec.md, Seccion 10). Homogeneiza la
// forma de TODAS las respuestas de error de la API — tanto excepciones
// de negocio (HttpException, incluidas las de excepciones-autenticacion.ts)
// como errores no controlados — sin exponer jamas detalles internos
// (stack traces, mensajes de driver de BD, etc.) al cliente.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ExcepcionGlobalFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExcepcionGlobalFilter.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const contextoHttp = host.switchToHttp();
    const response = contextoHttp.getResponse<Response>();
    const request = contextoHttp.getRequest<Request>();

    const esHttpException = excepcion instanceof HttpException;
    const statusCode = esHttpException ? excepcion.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const respuestaExcepcion = esHttpException ? excepcion.getResponse() : null;

    if (!esHttpException) {
      // Error no controlado (ej. fallo de conexion a BD): se registra
      // completo en el log del servidor, pero al cliente solo se le
      // devuelve un mensaje generico.
      this.logger.error(excepcion instanceof Error ? excepcion.stack : excepcion);
    }

    response.status(statusCode).json({
      statusCode,
      mensaje: this.extraerMensaje(respuestaExcepcion),
      error: esHttpException ? excepcion.constructor.name : 'InternalServerError',
      timestamp: new Date().toISOString(),
      ruta: request.url,
    });
  }

  private extraerMensaje(respuestaExcepcion: unknown): string | string[] {
    if (respuestaExcepcion && typeof respuestaExcepcion === 'object' && 'message' in respuestaExcepcion) {
      return (respuestaExcepcion as { message: string | string[] }).message;
    }
    if (typeof respuestaExcepcion === 'string') {
      return respuestaExcepcion;
    }
    return 'Ocurrió un error inesperado';
  }
}