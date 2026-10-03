// src/bitacora/bitacora.controller.ts
//
// Consulta de la bitácora de auditoría (MF-07, RN-013). Sólo lectura: la
// bitácora la escriben los servicios, nunca el cliente, y sin exportación
// en este MVP (VP-09). La purga sí existe, pero no se expone por HTTP:
// corre sola cada mes en BitacoraLimpiezaService. Protegido por
// 'bitacora.consultar', que en la semilla sólo tiene el Superadministrador.

import { Controller, Get, Query } from '@nestjs/common';

import { RequierePermisos } from '../comun/decoradores/requiere-permisos.decorator';
import { BitacoraService } from './bitacora.service';
import { FiltrosBitacoraDto } from './dto/filtros-bitacora.dto';

@Controller('bitacora')
@RequierePermisos('bitacora.consultar')
export class BitacoraController {
  constructor(private readonly bitacoraService: BitacoraService) {}

  @Get()
  consultar(@Query() filtros: FiltrosBitacoraDto) {
    return this.bitacoraService.consultar(filtros);
  }
}
