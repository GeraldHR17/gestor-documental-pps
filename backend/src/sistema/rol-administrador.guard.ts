import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import { PermisoDenegadoException } from '../comun/excepciones/excepciones-autenticacion';

export const ROL_ADMINISTRADOR_SISTEMA = 'Superadministrador';

@Injectable()
export class RolAdministradorGuard implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const { user: usuario } = contexto
      .switchToHttp()
      .getRequest<{ user?: PayloadJwt }>();

    if (usuario?.nombreRol !== ROL_ADMINISTRADOR_SISTEMA) {
      throw new PermisoDenegadoException();
    }

    return true;
  }
}
