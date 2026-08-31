// src/roles/roles.module.ts
//
// Nota: si de Sprint 1 ya tienes Rol/Permiso registradas en otro
// TypeOrmModule.forFeature (sin controller/service de RBAC todavia),
// fusiona ese registro con este archivo.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Rol } from '../entidades/rol.entidad';
import { Permiso } from '../entidades/permiso.entidad';
import { BitacoraModule } from '../bitacora/bitacora.module';

@Module({
  imports: [TypeOrmModule.forFeature([Rol, Permiso]), BitacoraModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}