// src/catalogos/etiquetas.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Etiqueta } from '../entidades/etiqueta.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import { ServicioCatalogoSimple } from './servicio-catalogo-simple';

@Injectable()
export class EtiquetasService extends ServicioCatalogoSimple<Etiqueta> {
  constructor(
    @InjectRepository(Etiqueta) repositorio: Repository<Etiqueta>,
    bitacoraService: BitacoraService,
  ) {
    super(repositorio, bitacoraService, {
      propiedadId: 'idEtiqueta',
      entidadBitacora: 'etiquetas',
      sufijoAccion: 'ETIQUETA',
      etiquetaIndefinida: 'una etiqueta',
      etiquetaSingular: 'Etiqueta',
      // La tabla `etiquetas` no tiene columna de descripción.
      admiteDescripcion: false,
    });
  }
}
