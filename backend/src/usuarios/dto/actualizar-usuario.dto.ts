// src/usuarios/dto/actualizar-usuario.dto.ts
import { IsEmail, IsInt, IsOptional, Length, Min, IsString } from 'class-validator';

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @Length(3, 150)
  nombreCompleto?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idRol?: number;
}