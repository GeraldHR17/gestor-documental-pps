// src/publico/filtro-throttler-publico.ts
//
// Traduce al español el 429 del portal, y SOLO el del portal.
//
// `ThrottlerException` trae el texto en inglés ("ThrottlerException: Too
// Many Requests"), que acabaría en pantalla de un ciudadano. Las tres
// formas de cambiarlo tienen un problema:
//
//   - `ThrottlerModule.forRoot({ errorMessage })` es global y cambiaría
//     también el 429 de las rutas internas, que no son parte de esta
//     entrega.
//   - Extender ThrottlerGuard y aplicarlo con @UseGuards al controlador
//     haría que el guard global y el del controlador contaran la misma
//     petición dos veces, de modo que el límite real sería la mitad del
//     declarado.
//   - Un interceptor no sirve: los guards corren antes y su excepción
//     nunca llega hasta él.
//
// Queda este filtro, declarado con @UseFilters en el controlador público.
// Reproduce la forma de cuerpo de ExcepcionGlobalFilter para que el portal
// no invente una segunda convención de errores.

import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';

export const MENSAJE_DEMASIADAS_SOLICITUDES =
  'Demasiadas solicitudes. Intente de nuevo en un minuto.';

@Catch(ThrottlerException)
export class FiltroThrottlerPublico implements ExceptionFilter {
  catch(_excepcion: ThrottlerException, host: ArgumentsHost): void {
    const contextoHttp = host.switchToHttp();
    const respuesta = contextoHttp.getResponse<Response>();
    const peticion = contextoHttp.getRequest<Request>();

    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    respuesta.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      mensaje: MENSAJE_DEMASIADAS_SOLICITUDES,
      error: 'ThrottlerException',
      timestamp: new Date().toISOString(),
      ruta: peticion.url,
    });
  }
}
