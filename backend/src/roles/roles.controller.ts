// src/roles/roles.controller.ts
//
// GET /roles, GET /roles/:id/permisos y GET /permisos solo requieren JWT
// (cualquier usuario autenticado), segun el contrato de la Seccion 7.
// PATCH /roles/:id/permisos NO usa @RequierePermisos (no es un permiso
// granular): la restriccion a "solo Superadministrador" se valida DENTRO
// de RolesService.actualizarPermisosDeRol, comparando el nombre del rol
// del usuario autenticado (RF-15).

import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';

import { RolesService } from './roles.service';
import { UsuarioJwtActual } from '../comun/decoradores/usuario-jwt-actual.decorator';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import { ActualizarPermisosRolDto } from './dto/actualizar-permisos-rol.dto';

@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  listarRoles() {
    return this.rolesService.listarRoles();
  }

  @Get('roles/:id/permisos')
  obtenerPermisosPorRol(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.obtenerPermisosPorRol(id);
  }

  @Patch('roles/:id/permisos')
  actualizarPermisosDeRol(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarPermisosRolDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.rolesService.actualizarPermisosDeRol(id, dto.idsPermisos, usuarioActual);
  }

  @Get('permisos')
  listarPermisos() {
    return this.rolesService.listarPermisos();
  }
}