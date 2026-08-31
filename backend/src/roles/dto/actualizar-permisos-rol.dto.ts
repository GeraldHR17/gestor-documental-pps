// src/roles/dto/actualizar-permisos-rol.dto.ts
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class ActualizarPermisosRolDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Debe indicar al menos un permiso' })
  @IsInt({ each: true })
  idsPermisos: number[];
}