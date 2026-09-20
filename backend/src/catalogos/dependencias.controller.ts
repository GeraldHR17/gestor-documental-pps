// src/catalogos/dependencias.controller.ts
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
import { UsuarioJwtActual } from '../comun/decoradores/usuario-jwt-actual.decorator';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import { DependenciasService } from './dependencias.service';
import { CrearDependenciaDto } from './dto/crear-dependencia.dto';
import { ActualizarDependenciaDto } from './dto/actualizar-dependencia.dto';
import { CambiarEstadoCatalogoDto } from './dto/cambiar-estado-catalogo.dto';
import { FiltrosCatalogoDto } from './dto/filtros-catalogo.dto';

@Controller('dependencias')
@RequierePermisos('catalogos.administrar')
export class DependenciasController {
  constructor(private readonly dependenciasService: DependenciasService) {}

  @Get()
  listar(@Query() filtros: FiltrosCatalogoDto) {
    return this.dependenciasService.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.dependenciasService.obtener(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearDependenciaDto, @UsuarioJwtActual() usuarioActual: PayloadJwt) {
    return this.dependenciasService.crear(dto, usuarioActual);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarDependenciaDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.dependenciasService.actualizar(id, dto, usuarioActual);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoCatalogoDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.dependenciasService.cambiarEstado(id, dto.estado, usuarioActual);
  }
}
