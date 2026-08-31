// src/comun/guards/permisos.guard.ts
//
// Guard GLOBAL de AUTORIZACION (RF-05). Se registra via APP_GUARD en
// AppModule, DESPUES de JwtAuthGuard (ese resuelve `request.user`; este
// guard lo consume). Si un endpoint no declara @RequierePermisos(), basta
// con estar autenticado para pasar (JwtAuthGuard ya lo garantiza).

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLAVE_PERMISOS_REQUERIDOS } from '../decoradores/requiere-permisos.decorator';
import { CachePermisosService } from '../cache/cache-permisos.service';
import { PermisoDenegadoException } from '../excepciones/excepciones-autenticacion';
import type { PayloadJwt } from '../../autenticacion/estrategias/jwt.strategy';

@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cachePermisos: CachePermisosService,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permisosRequeridos = this.reflector.getAllAndOverride<string[] | undefined>(
      CLAVE_PERMISOS_REQUERIDOS,
      [contexto.getHandler(), contexto.getClass()],
    );

    if (!permisosRequeridos || permisosRequeridos.length === 0) {
      return true;
    }

    const request = contexto.switchToHttp().getRequest();
    const usuario = request.user as PayloadJwt | undefined;

    if (!usuario) {
      throw new PermisoDenegadoException();
    }

    // La cache puede no tener el rol aun (recien invalidado); en ese caso
    // se usa el listado de permisos que ya viaja dentro del propio JWT
    // como respaldo, para no bloquear al usuario por una cache fria.
    const permisosEfectivos = this.cachePermisos.obtener(usuario.idRol) ?? usuario.permisos ?? [];

    const tieneTodosLosPermisos = permisosRequeridos.every((permiso) =>
      permisosEfectivos.includes(permiso),
    );

    if (!tieneTodosLosPermisos) {
      throw new PermisoDenegadoException();
    }

    return true;
  }
}