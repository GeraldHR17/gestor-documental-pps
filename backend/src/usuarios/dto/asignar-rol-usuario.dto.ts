// src/usuarios/dto/asignar-rol-usuario.dto.ts
import { IsInt, Min } from 'class-validator';

export class AsignarRolUsuarioDto {
  @IsInt()
  @Min(1)
  idRol: number;
}