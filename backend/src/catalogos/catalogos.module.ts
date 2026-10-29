// src/catalogos/catalogos.module.ts
//
// Un solo módulo para los 4 catálogos (regla de negocio #4). Cada catálogo
// conserva su entidad, sus DTO, su servicio y su controlador; lo que se
// comparte es el wiring: el registro de repositorios, la bitácora y el
// permiso 'catalogos.administrar' que declara cada controlador y aplica el
// PermisosGuard global.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { TipoDocumento } from '../entidades/tipo-documento.entidad';
import { Dependencia } from '../entidades/dependencia.entidad';
import { Etiqueta } from '../entidades/etiqueta.entidad';
import { Documento } from '../entidades/documento.entidad';
import { BitacoraModule } from '../bitacora/bitacora.module';

import { CategoriasItspController } from './categorias-itsp.controller';
import { CategoriasItspService } from './categorias-itsp.service';
import { TiposDocumentosController } from './tipos-documentos.controller';
import { TiposDocumentosService } from './tipos-documentos.service';
import { DependenciasController } from './dependencias.controller';
import { DependenciasService } from './dependencias.service';
import { EtiquetasController } from './etiquetas.controller';
import { EtiquetasService } from './etiquetas.service';

@Module({
  imports: [
    // Documento solo para contar: no se mueve una categoría con documentos
    // al subárbol de Participación ciudadana (spec-ajustes-niveles-y-estados D-7).
    TypeOrmModule.forFeature([CategoriaItsp, TipoDocumento, Dependencia, Etiqueta, Documento]),
    BitacoraModule,
  ],
  controllers: [
    CategoriasItspController,
    TiposDocumentosController,
    DependenciasController,
    EtiquetasController,
  ],
  providers: [CategoriasItspService, TiposDocumentosService, DependenciasService, EtiquetasService],
  // Se exportan porque Fase 6 (Documentos) necesitará validar contra ellos
  // que la categoría, el tipo y las dependencias elegidas existan y estén
  // activas al registrar un documento.
  exports: [CategoriasItspService, TiposDocumentosService, DependenciasService, EtiquetasService],
})
export class CatalogosModule {}
