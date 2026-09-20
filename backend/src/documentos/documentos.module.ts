// src/documentos/documentos.module.ts
//
// Fase 6 — Gestión Documental. Registra las cuatro tablas propias
// (documentos, versiones y las dos de relación N:M) más las cuatro de
// catálogo contra las que se valida la clasificación.
//
// Importante: aquí NO se registra ningún módulo de archivos estáticos. La
// carpeta `backend/storage/documentos` se lee únicamente desde
// AlmacenamientoDocumentosService, y el único camino público hacia ella son
// los endpoints de visualización y descarga del controlador (RNF-004).

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Documento } from '../entidades/documento.entidad';
import { VersionDocumento } from '../entidades/version-documento.entidad';
import { DocumentoEtiqueta } from '../entidades/documento-etiqueta.entidad';
import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { TipoDocumento } from '../entidades/tipo-documento.entidad';
import { Dependencia } from '../entidades/dependencia.entidad';
import { Etiqueta } from '../entidades/etiqueta.entidad';
import { Usuario } from '../entidades/usuario.entidad';

import { BitacoraModule } from '../bitacora/bitacora.module';

import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { VersionesDocumentosService } from './versiones-documentos.service';
import { AlmacenamientoDocumentosService } from './almacenamiento-documentos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Documento,
      VersionDocumento,
      DocumentoEtiqueta,
      CategoriaItsp,
      TipoDocumento,
      Dependencia,
      Etiqueta,
      // Para precargar la dependencia del usuario al registrar (sección A).
      Usuario,
    ]),
    BitacoraModule,
  ],
  controllers: [DocumentosController],
  providers: [DocumentosService, VersionesDocumentosService, AlmacenamientoDocumentosService],
  exports: [DocumentosService, VersionesDocumentosService],
})
export class DocumentosModule {}
