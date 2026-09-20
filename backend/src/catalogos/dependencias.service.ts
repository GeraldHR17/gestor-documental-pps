// src/catalogos/dependencias.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Dependencia } from '../entidades/dependencia.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import { ServicioCatalogoSimple } from './servicio-catalogo-simple';

@Injectable()
export class DependenciasService extends ServicioCatalogoSimple<Dependencia> {
  constructor(
    @InjectRepository(Dependencia) repositorio: Repository<Dependencia>,
    bitacoraService: BitacoraService,
  ) {
    super(repositorio, bitacoraService, {
      propiedadId: 'idDependencia',
      entidadBitacora: 'dependencias',
      sufijoAccion: 'DEPENDENCIA',
      etiquetaIndefinida: 'una dependencia',
      etiquetaSingular: 'Dependencia',
      admiteDescripcion: true,
    });
  }
}
