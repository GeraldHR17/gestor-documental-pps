// src/comun/guards/jwt-auth.guard.ts
//
// Guard GLOBAL de AUTENTICACION (RF-04). Se registra via APP_GUARD en
// AppModule para que TODA ruta quede protegida por defecto, salvo las
// marcadas @Publico(). Es un guard nuevo y distinto de tu PermisosGuard
// existente (ese sigue encargandose de AUTORIZACION granular por
// permiso, no de validar el JWT en si).
//
// Orden de guards en AppModule: JwtAuthGuard debe ejecutarse ANTES que
// PermisosGuard, ya que este ultimo necesita `request.user` ya resuelto.

import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { CLAVE_PUBLICO } from '../decoradores/publico.decorator';
import {
  TokenExpiradoException,
  TokenInvalidoException,
} from '../excepciones/excepciones-autenticacion';
import type { PayloadJwt } from '../../autenticacion/estrategias/jwt.strategy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(contexto: ExecutionContext) {
    const esPublico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (esPublico) {
      return true;
    }

    return super.canActivate(contexto);
  }

  // La firma debe ser genérica para ser compatible con IAuthGuard, que es
  // lo que declara AuthGuard('jwt') como clase base.
  handleRequest<TUsuario = PayloadJwt>(
    error: unknown,
    usuario: unknown,
    info: { name?: string } | undefined,
  ): TUsuario {
    if (error || !usuario) {
      if (info?.name === 'TokenExpiredError') {
        throw new TokenExpiradoException();
      }
      throw new TokenInvalidoException();
    }
    return usuario as TUsuario;
  }
}