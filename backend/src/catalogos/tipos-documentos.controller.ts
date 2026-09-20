// src/catalogos/tipos-documentos.controller.ts
//
// Como en UsuariosController, el permiso se declara a nivel de controlador:
// PermisosGuard (global, vía APP_GUARD) exige 'catalogos.administrar' en
// todos los endpoints de abajo, incluido el GET.
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

import { TiposDocumentosService } from './tipos-documentos.service';
import { CrearTipoDocumentoDto } from './dto/crear-tipo-documento.dto';
import { ActualizarTipoDocumentoDto } from './dto/actualizar-tipo-documento.dto';
import { CambiarEstadoCatalogoDto } from './dto/cambiar-estado-catalogo.dto';
import { FiltrosCatalogoDto } from './dto/filtros-catalogo.dto';

@Controller('tipos-documentos')
@RequierePermisos('catalogos.administrar')
export class TiposDocumentosController {
  constructor(private readonly tiposDocumentosService: TiposDocumentosService) {}

  @Get()
  listar(@Query() filtros: FiltrosCatalogoDto) {
    return this.tiposDocumentosService.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.tiposDocumentosService.obtener(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearTipoDocumentoDto, @UsuarioJwtActual() usuarioActual: PayloadJwt) {
    return this.tiposDocumentosService.crear(dto, usuarioActual);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarTipoDocumentoDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.tiposDocumentosService.actualizar(id, dto, usuarioActual);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoCatalogoDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.tiposDocumentosService.cambiarEstado(id, dto.estado, usuarioActual);
  }
}
