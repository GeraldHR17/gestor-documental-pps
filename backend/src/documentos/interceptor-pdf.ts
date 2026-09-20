// src/documentos/interceptor-pdf.ts
//
// FileInterceptor con el límite de tamaño configurado explícitamente
// (Sección 4 del pliego) y con el error de Multer traducido.
//
// Sin almacenamiento configurado, Multer usa memoria: el archivo llega
// como Buffer y así se puede calcular el SHA-256 y comprobar la firma
// `%PDF-` ANTES de escribir nada en disco. Con 40 MB de techo, sostener el
// archivo en memoria durante la validación es asumible.
//
// El límite se fija en el máximo + 1 byte a propósito: cualquier archivo de
// hasta 40 MB llega completo al servicio, que es quien produce el mensaje
// claro en español; el límite de Multer sólo actúa como tope de memoria
// para cargas desmedidas, y ese caso también se traduce aquí en lugar de
// dejar salir el "File too large" de la librería.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
  mixin,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';

import { ArchivoDemasiadoGrandeException } from '../comun/excepciones/excepciones-documentos';
import { TAMANO_MAXIMO_BYTES, TAMANO_MAXIMO_MB } from './almacenamiento-documentos.service';

export function InterceptorPdf(campo = 'archivo'): Type<NestInterceptor> {
  const InterceptorBase = FileInterceptor(campo, {
    limits: { fileSize: TAMANO_MAXIMO_BYTES + 1, files: 1 },
  });

  @Injectable()
  class InterceptorPdfMixin extends InterceptorBase {
    async intercept(
      contexto: ExecutionContext,
      siguiente: CallHandler,
    ): Promise<Observable<unknown>> {
      try {
        return await super.intercept(contexto, siguiente);
      } catch (error) {
        if (error instanceof PayloadTooLargeException) {
          throw new ArchivoDemasiadoGrandeException(TAMANO_MAXIMO_MB);
        }
        throw error;
      }
    }
  }

  return mixin(InterceptorPdfMixin);
}
