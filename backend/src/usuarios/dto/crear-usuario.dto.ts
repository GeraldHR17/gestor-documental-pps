// src/usuarios/dto/crear-usuario.dto.ts
import { IsEmail, IsInt, IsOptional, Length, Matches, Min, IsString } from 'class-validator';

export const REGEX_POLITICA_CONTRASENA = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const MENSAJE_POLITICA_CONTRASENA =
  'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial';

// Misma regla que valida el formulario en `frontend/src/lib/validaciones.ts`:
// alfanumérico sin espacios ni símbolos, 8 a 12. Antes el mínimo aquí era 9,
// así que una identificación de 8 aceptada por el formulario habría sido
// rechazada por el servidor con un 400.
export const REGEX_IDENTIFICACION = /^[A-Za-z0-9]{8,12}$/;
export const MENSAJE_IDENTIFICACION =
  'La identificación debe tener entre 8 y 12 caracteres alfanuméricos';

export class CrearUsuarioDto {
  @IsString()
  @Length(3, 150)
  nombreCompleto: string;

  @IsString()
  @Matches(REGEX_IDENTIFICACION, { message: MENSAJE_IDENTIFICACION })
  identificacion: string;

  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo: string;

  @Matches(REGEX_POLITICA_CONTRASENA, { message: MENSAJE_POLITICA_CONTRASENA })
  contrasenaTemporal: string;

  @IsInt()
  @Min(1)
  idRol: number;

  /**
   * Dependencia de la persona (08-ajuste-dependencia-y-paginas.sql). Es
   * opcional: sirve para precargar la de los documentos que registre.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  idDependencia?: number;
}