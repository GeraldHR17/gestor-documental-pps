// src/catalogos/dto/cambiar-estado-catalogo.dto.ts
//
// Compartido por los 4 catálogos: nunca hay borrado físico, sólo este
// cambio de estado (regla de negocio #1 de la Fase 5).
import { IsIn } from 'class-validator';

export class CambiarEstadoCatalogoDto {
  @IsIn(['ACTIVO', 'INACTIVO'], { message: 'Estado no válido' })
  estado: 'ACTIVO' | 'INACTIVO';
}
