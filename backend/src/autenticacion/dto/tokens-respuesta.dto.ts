// src/autenticacion/dto/tokens-respuesta.dto.ts
import { PerfilUsuarioRespuestaDto } from './perfil-usuario-respuesta.dto';

export class TokensRespuestaDto {
  accessToken: string;
  usuario?: PerfilUsuarioRespuestaDto; // solo se incluye en /auth/login

  constructor(datos: TokensRespuestaDto) {
    Object.assign(this, datos);
  }
}