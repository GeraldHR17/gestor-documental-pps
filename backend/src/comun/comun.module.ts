// src/comun/comun.module.ts
//
// Modulo global: expone la cache de permisos y UsuarioActualService a
// cualquier modulo (AutenticacionModule, UsuariosModule, RolesModule, y
// mas adelante Catalogos/Documentos) sin tener que reimportarlos.

import { Global, Module } from '@nestjs/common';
import { CachePermisosService } from './cache/cache-permisos.service';
import { UsuarioActualService } from './servicios/usuario-actual.service';

@Global()
@Module({
  providers: [CachePermisosService, UsuarioActualService],
  exports: [CachePermisosService, UsuarioActualService],
})
export class ComunModule {}