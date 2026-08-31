// src/autenticacion/dto/registro-ciudadano.dto.ts
import { IsEmail, Length, Matches, IsString } from 'class-validator';

const REGEX_POLITICA_CONTRASENA = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const MENSAJE_POLITICA_CONTRASENA =
  'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial';

export class RegistroCiudadanoDto {
  @IsString()
  @Length(3, 150, { message: 'El nombre completo debe tener entre 3 y 150 caracteres' })
  nombreCompleto: string;

  @IsString()
  @Length(9, 30, { message: 'La identificación debe tener entre 9 y 30 caracteres' })
  identificacion: string;

  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo: string;

  @Matches(REGEX_POLITICA_CONTRASENA, { message: MENSAJE_POLITICA_CONTRASENA })
  contrasena: string;
}