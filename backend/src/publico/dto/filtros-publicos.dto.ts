// src/publico/dto/filtros-publicos.dto.ts
//
// Únicos parámetros que el portal acepta del cliente, aparte de los códigos
// de categoría de la ruta. El `ValidationPipe` global corre con
// `whitelist: true`, de modo que cualquier otra propiedad de la cadena de
// consulta se descarta antes de llegar al servicio.

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const PAGINA_POR_DEFECTO = 1;
export const LIMITE_POR_DEFECTO = 20;

/**
 * Tope duro, y deliberadamente más bajo que el de la API interna (100).
 *
 * Sin él, `limite=100000` convierte un endpoint abierto a Internet en la
 * forma más barata de volcar el catálogo entero y de hacer trabajar al
 * servidor (spec 8.3).
 */
export const LIMITE_MAXIMO = 50;

export class FiltrosListadoPublicoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El número de página debe ser un entero.' })
  @Min(1, { message: 'El número de página debe ser 1 o mayor.' })
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un entero.' })
  @Min(1, { message: 'El límite debe ser 1 o mayor.' })
  @Max(LIMITE_MAXIMO, { message: `El límite no puede ser mayor que ${LIMITE_MAXIMO}.` })
  limite?: number;
}
