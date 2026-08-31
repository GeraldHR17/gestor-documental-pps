// src/comun/servicios/usuario-actual.service.ts
//
// Abstrae el acceso al usuario autenticado de la peticion actual. Como
// la Fase 4 (autenticacion) ahora se construye ANTES que Catalogos
// (Fase 5) y Gestion Documental (Fase 6), este servicio queda
// disponible desde el inicio: cuando llegues a Documentos y necesites
// resolver `id_usuario_creador`, inyectas este servicio directamente —
// nunca hace falta el hack temporal de variable de entorno que se
// planteaba antes.
//
// Scope.REQUEST: se crea una instancia nueva por cada peticion HTTP, ya
// que depende del `request` de esa peticion en particular.

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import type { PayloadJwt } from '../../autenticacion/estrategias/jwt.strategy';

type RequestConUsuario = Request & { user?: PayloadJwt };

@Injectable({ scope: Scope.REQUEST })
export class UsuarioActualService {
  constructor(@Inject(REQUEST) private readonly request: RequestConUsuario) {}

  obtener(): PayloadJwt {
    if (!this.request.user) {
      throw new Error(
        'UsuarioActualService.obtener() fue llamado fuera de una ruta protegida por JwtAuthGuard',
      );
    }
    return this.request.user;
  }

  obtenerIdUsuario(): number {
    return this.obtener().idUsuario;
  }

  obtenerNombreRol(): string {
    return this.obtener().nombreRol;
  }

  tienePermiso(nombrePermiso: string): boolean {
    return this.obtener().permisos.includes(nombrePermiso);
  }
}