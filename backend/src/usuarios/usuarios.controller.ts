// src/usuarios/usuarios.controller.ts
//
// Protegido por PermisosGuard (global, via APP_GUARD) + @RequierePermisos()
// a nivel de controlador: solo usuarios con el permiso 'usuarios.administrar'
// pueden acceder a cualquiera de estos endpoints.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { RequierePermisos } from '../comun/decoradores/requiere-permisos.decorator';

import { UsuariosService } from './usuarios.service';
import { UsuarioJwtActual } from '../comun/decoradores/usuario-jwt-actual.decorator';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { CambiarEstadoUsuarioDto } from './dto/cambiar-estado-usuario.dto';
import { AsignarRolUsuarioDto } from './dto/asignar-rol-usuario.dto';
import { FiltrosUsuariosDto } from './dto/filtros-usuarios.dto';

@Controller('usuarios')
@RequierePermisos('usuarios.administrar')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  listar(@Query() filtros: FiltrosUsuariosDto) {
    return this.usuariosService.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.obtener(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearUsuarioDto, @UsuarioJwtActual() usuarioActual: PayloadJwt) {
    return this.usuariosService.crear(dto, usuarioActual);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarUsuarioDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.usuariosService.actualizar(id, dto, usuarioActual);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoUsuarioDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.usuariosService.cambiarEstado(id, dto.estado, usuarioActual);
  }

  @Patch(':id/rol')
  asignarRol(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarRolUsuarioDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.usuariosService.asignarRol(id, dto.idRol, usuarioActual);
  }
}