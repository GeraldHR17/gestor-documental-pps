// src/comun/decoradores/usuario-jwt-actual.decorator.ts
//
// NOTA DE INTEGRACION: este decorador es un complemento del NUEVO
// JwtAuthGuard, y expone directamente el payload validado por JwtStrategy
// (request.user). Es DISTINTO del `UsuarioActualService` que ya existe en
// el proyecto (usado hoy con resolucion via ID_USUARIO_TEMPORAL). Ver la
// guia de integracion al final de la respuesta: lo esperado es que
// `UsuarioActualService` termine leyendo de `request.user` (este mismo
// payload) en lugar de la variable de entorno temporal, para no tener
// dos mecanismos de "usuario actual" viviendo en paralelo.

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PayloadJwt } from '../../autenticacion/estrategias/jwt.strategy';

export const UsuarioJwtActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): PayloadJwt => {
    const request = contexto.switchToHttp().getRequest();
    return request.user;
  },
);