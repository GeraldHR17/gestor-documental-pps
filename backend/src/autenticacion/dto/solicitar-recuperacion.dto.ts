// src/autenticacion/dto/solicitar-recuperacion.dto.ts
import { IsEmail } from 'class-validator';

export class SolicitarRecuperacionDto {
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo: string;
}