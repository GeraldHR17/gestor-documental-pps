// src/autenticacion/dto/reenviar-verificacion-correo.dto.ts
import { IsEmail } from 'class-validator';

export class ReenviarVerificacionCorreoDto {
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo: string;
}