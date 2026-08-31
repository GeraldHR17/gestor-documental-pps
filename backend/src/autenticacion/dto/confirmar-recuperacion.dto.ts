// src/autenticacion/dto/confirmar-recuperacion.dto.ts
import { IsNotEmpty, IsString, Matches } from 'class-validator';

const REGEX_POLITICA_CONTRASENA = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const MENSAJE_POLITICA_CONTRASENA =
  'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial';

export class ConfirmarRecuperacionDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @Matches(REGEX_POLITICA_CONTRASENA, { message: MENSAJE_POLITICA_CONTRASENA })
  nuevaContrasena: string;
}