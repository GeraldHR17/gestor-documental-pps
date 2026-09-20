// src/usuarios/dto/actualizar-usuario.dto.ts
//
// El rol NO se edita aquí a propósito: PATCH /usuarios/:id/rol (asignarRol)
// es el único camino para cambiar el rol, porque es el que aplica las
// reglas #9 (no auto-modificarse) y #10 (solo Superadministrador puede
// asignar el rol Superadministrador). Si `idRol` se aceptara también en
// este DTO, esas dos reglas quedarían evitables desde el mismo formulario.
import { IsEmail, IsInt, IsOptional, Length, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { REGEX_IDENTIFICACION, MENSAJE_IDENTIFICACION } from './crear-usuario.dto';

export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @Length(3, 150)
  nombreCompleto?: string;

  @IsOptional()
  @IsString()
  @Matches(REGEX_IDENTIFICACION, { message: MENSAJE_IDENTIFICACION })
  identificacion?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  correo?: string;

  // Omitido = no tocar; `null` explícito = quitar la dependencia.
  @ValidateIf((_, valor) => valor !== null && valor !== undefined)
  @IsInt()
  @Min(1)
  idDependencia?: number | null;
}