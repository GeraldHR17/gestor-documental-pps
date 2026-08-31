// src/usuarios/dto/cambiar-estado-usuario.dto.ts
import { IsIn } from 'class-validator';

export class CambiarEstadoUsuarioDto {
  @IsIn(['ACTIVO', 'INACTIVO'], { message: 'Estado no válido' })
  estado: 'ACTIVO' | 'INACTIVO';
}