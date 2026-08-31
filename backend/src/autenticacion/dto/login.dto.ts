// src/autenticacion/dto/login.dto.ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  contrasena: string;
}