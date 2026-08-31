// src/autenticacion/autenticacion.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import { AutenticacionController } from './autenticacion.controller';
import { AutenticacionService } from './autenticacion.service';
import { JwtStrategy } from './estrategias/jwt.strategy';

import { Usuario } from '../entidades/usuario.entidad';
import { Rol } from '../entidades/rol.entidad';
import { Permiso } from '../entidades/permiso.entidad';
import { SesionRefreshToken } from '../entidades/sesion-refresh-token.entidad';
import { TokenRecuperacionContrasena } from '../entidades/token-recuperacion-contrasena.entidad';
import { TokenVerificacionCorreo } from '../entidades/token-verificacion-correo.entidad';

import { CorreoModule } from '../correo/correo.module';
import { BitacoraModule } from '../bitacora/bitacora.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      Rol,
      Permiso,
      SesionRefreshToken,
      TokenRecuperacionContrasena,
      TokenVerificacionCorreo,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Sin secret/expiresIn por defecto: se pasan explicitamente en cada
    // llamada a sign() dentro de AutenticacionService, ya que access y
    // refresh token usan secretos distintos (spec.md, Seccion 12).
    JwtModule.register({}),
    CorreoModule,
    BitacoraModule,
  ],
  controllers: [AutenticacionController],
  providers: [AutenticacionService, JwtStrategy],
  exports: [AutenticacionService],
})
export class AutenticacionModule {}