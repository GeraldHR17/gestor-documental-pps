// src/catalogos/tipos-documentos.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TipoDocumento } from '../entidades/tipo-documento.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import { ServicioCatalogoSimple } from './servicio-catalogo-simple';

@Injectable()
export class TiposDocumentosService extends ServicioCatalogoSimple<TipoDocumento> {
  constructor(
    @InjectRepository(TipoDocumento) repositorio: Repository<TipoDocumento>,
    bitacoraService: BitacoraService,
  ) {
    super(repositorio, bitacoraService, {
      propiedadId: 'idTipoDocumento',
      entidadBitacora: 'tipos_documentos',
      sufijoAccion: 'TIPO_DOCUMENTO',
      etiquetaIndefinida: 'un tipo de documento',
      etiquetaSingular: 'Tipo de documento',
      admiteDescripcion: true,
    });
  }
}
