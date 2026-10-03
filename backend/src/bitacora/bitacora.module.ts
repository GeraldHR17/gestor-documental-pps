// src/bitacora/bitacora.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';
import { BitacoraService } from './bitacora.service';
import { BitacoraLimpiezaService } from './bitacora-limpieza.service';
import { BitacoraController } from './bitacora.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BitacoraLog])],
  controllers: [BitacoraController],
  // El @Cron de BitacoraLimpiezaService lo descubre el explorador de
  // @nestjs/schedule, que recorre todos los proveedores de la aplicación;
  // basta con el ScheduleModule.forRoot() declarado en AppModule.
  providers: [BitacoraService, BitacoraLimpiezaService],
  exports: [BitacoraService, BitacoraLimpiezaService],
})
export class BitacoraModule {}
