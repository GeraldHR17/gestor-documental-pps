// src/documentos/documentos.controller.ts
//
// A diferencia de los controladores de catálogos, aquí el permiso NO se
// declara a nivel de clase: cada operación tiene el suyo (crear, editar,
// publicar, inactivar, cargar versiones, consultar), y agruparlos bajo un
// permiso común daría a cualquier consultante el derecho a publicar.
//
// Los permisos son los que ya existen en el catálogo RBAC de
// `02-datos-iniciales.sql`; esta fase no crea ninguno nuevo.

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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequierePermisos } from '../comun/decoradores/requiere-permisos.decorator';
import { UsuarioJwtActual } from '../comun/decoradores/usuario-jwt-actual.decorator';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import { DocumentosService } from './documentos.service';
import { VersionesDocumentosService, type ArchivoParaTransmitir } from './versiones-documentos.service';
import { InterceptorPdf } from './interceptor-pdf';
import type { ArchivoCargado } from './almacenamiento-documentos.service';

import { RegistrarDocumentoDto } from './dto/registrar-documento.dto';
import { ActualizarDocumentoDto } from './dto/actualizar-documento.dto';
import { CambiarEstadoDocumentoDto } from './dto/cambiar-estado-documento.dto';
import { CrearVersionDto } from './dto/crear-version.dto';
import { FiltrosDocumentosDto } from './dto/filtros-documentos.dto';
import { ConsultaVersionDto } from './dto/consulta-version.dto';

@Controller('documentos')
export class DocumentosController {
  constructor(
    private readonly documentosService: DocumentosService,
    private readonly versionesService: VersionesDocumentosService,
  ) {}

  // ---------- Consulta ----------

  @Get()
  @RequierePermisos('documentos.consultar')
  listar(@Query() filtros: FiltrosDocumentosDto, @UsuarioJwtActual() usuario: PayloadJwt) {
    return this.documentosService.listar(filtros, usuario);
  }

  @Get(':id')
  @RequierePermisos('documentos.consultar')
  obtener(@Param('id', ParseIntPipe) id: number, @UsuarioJwtActual() usuario: PayloadJwt) {
    return this.documentosService.obtener(id, usuario);
  }

  @Get(':id/versiones')
  @RequierePermisos('documentos.consultar')
  listarVersiones(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioJwtActual() usuario: PayloadJwt,
  ) {
    return this.versionesService.listarHistorial(id, usuario);
  }

  // ---------- Alta y edición ----------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequierePermisos('documentos.crear')
  @UseInterceptors(InterceptorPdf('archivo'))
  registrar(
    @Body() dto: RegistrarDocumentoDto,
    @UploadedFile() archivo: ArchivoCargado | undefined,
    @UsuarioJwtActual() usuario: PayloadJwt,
  ) {
    return this.documentosService.registrar(dto, archivo, usuario);
  }

  @Patch(':id')
  @RequierePermisos('documentos.editar')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarDocumentoDto,
    @UsuarioJwtActual() usuario: PayloadJwt,
  ) {
    return this.documentosService.actualizar(id, dto, usuario);
  }

  // ---------- Transiciones de estado ----------

  @Patch(':id/publicar')
  @RequierePermisos('documentos.publicar')
  publicar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDocumentoDto,
    @UsuarioJwtActual() usuario: PayloadJwt,
  ) {
    return this.documentosService.publicar(id, usuario, dto.motivo);
  }

  // Despublicar comparte permiso con publicar: es la misma potestad sobre
  // la visibilidad del documento, ejercida en el sentido contrario.
  @Patch(':id/despublicar')
  @RequierePermisos('documentos.publicar')
  despublicar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDocumentoDto,
    @UsuarioJwtActual() usuario: PayloadJwt,
  ) {
    return this.documentosService.despublicar(id, usuario, dto.motivo);
  }

  @Patch(':id/inactivar')
  @RequierePermisos('documentos.inactivar')
  inactivar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDocumentoDto,
    @UsuarioJwtActual() usuario: PayloadJwt,
  ) {
    return this.documentosService.inactivar(id, usuario, dto.motivo);
  }

  // ---------- Versionamiento ----------

  @Post(':id/versiones')
  @HttpCode(HttpStatus.CREATED)
  @RequierePermisos('versiones.cargar')
  @UseInterceptors(InterceptorPdf('archivo'))
  crearVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearVersionDto,
    @UploadedFile() archivo: ArchivoCargado | undefined,
    @UsuarioJwtActual() usuario: PayloadJwt,
  ) {
    return this.versionesService.crear(id, dto, archivo, usuario);
  }

  // ---------- Entrega del archivo ----------
  //
  // Ambos endpoints transmiten por streaming desde el almacenamiento
  // privado. No hay ninguna ruta estática equivalente: sin este controlador
  // —y por tanto sin JWT, permiso y verificación de estado— el PDF no es
  // alcanzable (RNF-004).

  /** RF-027 — visor web: `inline`, para que el navegador lo muestre. */
  @Get(':id/visualizar')
  @RequierePermisos('documentos.consultar')
  async visualizar(
    @Param('id', ParseIntPipe) id: number,
    @Query() consulta: ConsultaVersionDto,
    @UsuarioJwtActual() usuario: PayloadJwt,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<StreamableFile> {
    const archivo = await this.versionesService.obtenerArchivo(
      id,
      consulta.version,
      usuario,
      false,
    );
    return this.transmitir(archivo, respuesta, 'inline');
  }

  /** RF-028 — descarga: `attachment`, y queda registrada en la bitácora. */
  @Get(':id/descargar')
  @RequierePermisos('documentos.consultar')
  async descargar(
    @Param('id', ParseIntPipe) id: number,
    @Query() consulta: ConsultaVersionDto,
    @UsuarioJwtActual() usuario: PayloadJwt,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<StreamableFile> {
    const archivo = await this.versionesService.obtenerArchivo(id, consulta.version, usuario, true);
    return this.transmitir(archivo, respuesta, 'attachment');
  }

  private transmitir(
    archivo: ArchivoParaTransmitir,
    respuesta: Response,
    disposicion: 'inline' | 'attachment',
  ): StreamableFile {
    respuesta.setHeader('Content-Type', archivo.mimeType);
    respuesta.setHeader('Content-Length', archivo.tamanoBytes);
    respuesta.setHeader(
      'Content-Disposition',
      `${disposicion}; filename="${this.nombreAscii(archivo.nombreArchivoOriginal)}"; filename*=UTF-8''${encodeURIComponent(archivo.nombreArchivoOriginal)}`,
    );
    // Contenido privado por usuario y estado: no debe quedar en caches
    // intermedias ni en la del navegador.
    respuesta.setHeader('Cache-Control', 'private, no-store');

    return new StreamableFile(archivo.contenido);
  }

  /**
   * `filename` sólo admite ASCII, así que las tildes se sustituyen. El
   * nombre real viaja aparte en `filename*`, que sí es UTF-8; los
   * navegadores actuales usan ese y sólo caen al primero si no lo entienden.
   * Se quitan además comillas y saltos de línea, que romperían la cabecera.
   */
  private nombreAscii(nombre: string): string {
    return nombre.replace(/[^\x20-\x7E]/g, '_').replace(/["\\r\n]/g, '_');
  }
}
