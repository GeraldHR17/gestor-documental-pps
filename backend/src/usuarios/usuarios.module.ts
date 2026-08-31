// src/usuarios/usuarios.module.ts
//
// Nota: si de Sprint 1 ya tienes un UsuariosModule que solo registra la
// entidad Usuario en TypeOrmModule (sin controller/service todavia),
// fusiona ese registro con este archivo en vez de declarar la entidad
// dos veces en el arbol de modulos.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { Usuario } from '../entidades/usuario.entidad';
import { Rol } from '../entidades/rol.entidad';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, Rol])],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}