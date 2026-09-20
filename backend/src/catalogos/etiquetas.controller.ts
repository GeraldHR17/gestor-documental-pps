// src/catalogos/etiquetas.controller.ts
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

import { EtiquetasService } from './etiquetas.service';
import { CrearEtiquetaDto } from './dto/crear-etiqueta.dto';
import { ActualizarEtiquetaDto } from './dto/actualizar-etiqueta.dto';
import { CambiarEstadoCatalogoDto } from './dto/cambiar-estado-catalogo.dto';
import { FiltrosCatalogoDto } from './dto/filtros-catalogo.dto';

@Controller('etiquetas')
@RequierePermisos('catalogos.administrar')
export class EtiquetasController {
  constructor(private readonly etiquetasService: EtiquetasService) {}

  @Get()
  listar(@Query() filtros: FiltrosCatalogoDto) {
    return this.etiquetasService.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.etiquetasService.obtener(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearEtiquetaDto, @UsuarioJwtActual() usuarioActual: PayloadJwt) {
    return this.etiquetasService.crear(dto, usuarioActual);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarEtiquetaDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.etiquetasService.actualizar(id, dto, usuarioActual);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoCatalogoDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.etiquetasService.cambiarEstado(id, dto.estado, usuarioActual);
  }
}
