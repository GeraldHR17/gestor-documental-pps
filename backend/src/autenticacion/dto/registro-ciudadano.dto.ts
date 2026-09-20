// src/autenticacion/dto/registro-ciudadano.dto.ts
//
// Autoregistro ciudadano (RF-10). Reutiliza las MISMAS reglas que el alta
// administrativa de Usuario (identificación alfanumérica de 8 a 12 y
// política de contraseña), con una diferencia deliberada: el correo es
// personal, de cualquier dominio válido. La restricción al dominio
// institucional aplica sólo a las cuentas de funcionarios que crea el
// administrador, no a la ciudadanía.
//
// Antes la identificación aceptaba de 9 a 30 caracteres: una cédula de 8
// que el formulario ya daba por válida habría sido rechazada con un 400.

import { IsEmail, Length, Matches, IsString } from 'class-validator';

import {
  MENSAJE_IDENTIFICACION,
  MENSAJE_POLITICA_CONTRASENA,
  REGEX_IDENTIFICACION,
  REGEX_POLITICA_CONTRASENA,
} from '../../usuarios/dto/crear-usuario.dto';

export class RegistroCiudadanoDto {
  @IsString()
  @Length(3, 150, { message: 'El nombre completo debe tener entre 3 y 150 caracteres' })
  nombreCompleto: string;

  @IsString()
  @Matches(REGEX_IDENTIFICACION, { message: MENSAJE_IDENTIFICACION })
  identificacion: string;

  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo: string;

  @Matches(REGEX_POLITICA_CONTRASENA, { message: MENSAJE_POLITICA_CONTRASENA })
  contrasena: string;
}
