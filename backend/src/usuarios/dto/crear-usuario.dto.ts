// src/usuarios/dto/crear-usuario.dto.ts
import { IsEmail, IsInt, Length, Matches, Min, IsString } from 'class-validator';

const REGEX_POLITICA_CONTRASENA = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const MENSAJE_POLITICA_CONTRASENA =
  'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial';

export class CrearUsuarioDto {
  @IsString()
  @Length(3, 150)
  nombreCompleto: string;

  @IsString()
  @Length(9, 30)
  identificacion: string;

  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo: string;

  @Matches(REGEX_POLITICA_CONTRASENA, { message: MENSAJE_POLITICA_CONTRASENA })
  contrasenaTemporal: string;

  @IsInt()
  @Min(1)
  idRol: number;
}