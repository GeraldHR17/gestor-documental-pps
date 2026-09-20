// src/catalogos/dto/filtros-catalogo.dto.ts
//
// Los catálogos son listas cortas (30 tipos de documento en el peor caso),
// así que se devuelven completos y sin paginar: el filtro es sólo para la
// caja de búsqueda y el selector de estado de la vista.
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class FiltrosCatalogoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'], { message: 'Estado no válido' })
  estado?: 'ACTIVO' | 'INACTIVO';
}
