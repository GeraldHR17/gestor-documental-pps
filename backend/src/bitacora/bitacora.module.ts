// src/bitacora/bitacora.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';
import { BitacoraService } from './bitacora.service';

@Module({
  imports: [TypeOrmModule.forFeature([BitacoraLog])],
  providers: [BitacoraService],
  exports: [BitacoraService],
})
export class BitacoraModule {}