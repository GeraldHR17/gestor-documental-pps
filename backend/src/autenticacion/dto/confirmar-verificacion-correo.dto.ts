// src/autenticacion/dto/confirmar-verificacion-correo.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmarVerificacionCorreoDto {
  @IsString()
  @IsNotEmpty({ message: 'El token de verificación es obligatorio' })
  token: string;
}