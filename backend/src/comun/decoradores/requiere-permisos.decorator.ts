// src/comun/decoradores/requiere-permisos.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const CLAVE_PERMISOS_REQUERIDOS = 'permisosRequeridos';

/**
 * Declara el/los permiso(s) granular(es) requeridos para acceder a un
 * endpoint o a todos los de un controlador (RF-05). Leido por
 * PermisosGuard via Reflector. Si se listan varios permisos, el usuario
 * debe tener TODOS para pasar el guard.
 *
 * Uso:
 *   @RequierePermisos('usuarios.administrar')
 *   @Controller('usuarios')
 *   export class UsuariosController { ... }
 */
export const RequierePermisos = (...nombresPermisos: string[]) =>
  SetMetadata(CLAVE_PERMISOS_REQUERIDOS, nombresPermisos);