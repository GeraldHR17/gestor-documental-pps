// src/catalogos/categorias-itsp.controller.ts
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

import { CategoriasItspService } from './categorias-itsp.service';
import { CrearCategoriaItspDto } from './dto/crear-categoria-itsp.dto';
import { ActualizarCategoriaItspDto } from './dto/actualizar-categoria-itsp.dto';
import { CambiarEstadoCatalogoDto } from './dto/cambiar-estado-catalogo.dto';
import { FiltrosCatalogoDto } from './dto/filtros-catalogo.dto';
import { ConsultaSiguienteCodigoDto } from './dto/consulta-siguiente-codigo.dto';

@Controller('categorias-itsp')
@RequierePermisos('catalogos.administrar')
export class CategoriasItspController {
  constructor(private readonly categoriasItspService: CategoriasItspService) {}

  @Get()
  listar(@Query() filtros: FiltrosCatalogoDto) {
    return this.categoriasItspService.listar(filtros);
  }

  // Declarado ANTES de `:id`: si fuera después, Nest intentaría resolver
  // 'arbol' como identificador numérico y el ParseIntPipe devolvería 400.
  @Get('arbol')
  obtenerArbol(@Query() filtros: FiltrosCatalogoDto) {
    return this.categoriasItspService.obtenerArbol(filtros);
  }

  // Solo lectura: el código que se asignaría ahora mismo. Lo usa el
  // formulario para avisar, antes de guardar, de cómo cambiará la URL de
  // una subsección que se mueve de raíz. También va antes de `:id`.
  @Get('siguiente-codigo')
  obtenerSiguienteCodigo(@Query() consulta: ConsultaSiguienteCodigoDto) {
    return this.categoriasItspService.obtenerSiguienteCodigo(consulta.idCategoriaPadre ?? null);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.categoriasItspService.obtener(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CrearCategoriaItspDto, @UsuarioJwtActual() usuarioActual: PayloadJwt) {
    return this.categoriasItspService.crear(dto, usuarioActual);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarCategoriaItspDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.categoriasItspService.actualizar(id, dto, usuarioActual);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoCatalogoDto,
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
  ) {
    return this.categoriasItspService.cambiarEstado(id, dto.estado, usuarioActual);
  }
}
