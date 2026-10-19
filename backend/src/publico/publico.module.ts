// src/publico/publico.module.ts
//
// Portal público de transparencia. Registra solo las tres tablas que lee y
// NINGÚN módulo de archivos estáticos: igual que DocumentosModule, el único
// camino hacia la carpeta de PDF es el controlador, que comprueba antes el
// estado del documento.
//
// Importa DocumentosModule para reutilizar AlmacenamientoDocumentosService,
// que es quien resuelve la ruta contra la raíz configurada y comprueba que
// no se salga de ella. Se reutiliza en vez de declarar aquí una segunda
// instancia para que esa defensa viva en un solo sitio.
//
// No importa BitacoraModule, y eso es deliberado: el portal no registra
// visitas (spec 11.5). No tener el servicio a mano es la forma más simple
// de que nadie lo llame por costumbre.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { Documento } from '../entidades/documento.entidad';
import { VersionDocumento } from '../entidades/version-documento.entidad';

import { DocumentosModule } from '../documentos/documentos.module';

import { PortalPublicoController } from './portal-publico.controller';
import { PortalPublicoService } from './portal-publico.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CategoriaItsp, Documento, VersionDocumento]),
    DocumentosModule,
  ],
  controllers: [PortalPublicoController],
  providers: [PortalPublicoService],
})
export class PublicoModule {}
