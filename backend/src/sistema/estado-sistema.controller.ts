import { Controller, Get, UseGuards } from '@nestjs/common';

import { EstadoSistemaDto } from './dto/estado-sistema.dto';
import { EstadoSistemaService } from './estado-sistema.service';
import { RolAdministradorGuard } from './rol-administrador.guard';

@Controller('sistema')
@UseGuards(RolAdministradorGuard)
export class EstadoSistemaController {
  constructor(private readonly estadoSistemaService: EstadoSistemaService) {}

  @Get('estado')
  obtenerEstado(): Promise<EstadoSistemaDto> {
    return this.estadoSistemaService.obtenerEstado();
  }
}
