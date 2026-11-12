import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BitacoraModule } from '../bitacora/bitacora.module';
import { DocumentosModule } from '../documentos/documentos.module';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';
import { EstadoSistemaController } from './estado-sistema.controller';
import { EstadoSistemaService } from './estado-sistema.service';
import { RolAdministradorGuard } from './rol-administrador.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([BitacoraLog]),
    BitacoraModule,
    DocumentosModule,
  ],
  controllers: [EstadoSistemaController],
  providers: [EstadoSistemaService, RolAdministradorGuard],
})
export class SistemaModule {}
