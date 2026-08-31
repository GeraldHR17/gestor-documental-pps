// src/autenticacion/estrategias/jwt.strategy.ts

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../entidades/usuario.entidad';

/**
 * Forma del payload firmado dentro del access token. Incluye el rol y
 * los permisos efectivos para evitar una consulta extra a roles_permisos
 * en cada request protegido (spec.md, Seccion 13 - rendimiento).
 */
export interface PayloadJwt {
  idUsuario: number;
  idRol: number;
  nombreRol: string;
  permisos: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configuracion: ConfigService,
    @InjectRepository(Usuario)
    private readonly repositorioUsuarios: Repository<Usuario>,
  ) {
    const secreto = configuracion.get<string>('JWT_ACCESS_SECRET');
    if (!secreto) {
      // Falla al arrancar la aplicación en vez de aceptar tokens firmados
      // con un secreto vacío, que sería una vulnerabilidad silenciosa.
      throw new Error(
        'Falta la variable de entorno JWT_ACCESS_SECRET; no es posible validar tokens.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secreto,
    });
  }

  async validate(payload: PayloadJwt): Promise<PayloadJwt | null> {
    // No basta con confiar en el contenido del token: se revalida que el
    // usuario siga existiendo y ACTIVO en cada request.
    const usuario = await this.repositorioUsuarios.findOne({
      where: { idUsuario: payload.idUsuario },
    });

    if (!usuario || usuario.estado !== 'ACTIVO') {
      return null;
    }

    return payload;
  }
}