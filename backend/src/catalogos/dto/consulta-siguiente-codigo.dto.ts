// src/catalogos/dto/consulta-siguiente-codigo.dto.ts
//
// `?idCategoriaPadre=` de GET /categorias-itsp/siguiente-codigo. Omitirlo
// pide el código de la siguiente raíz; indicarlo, el de la siguiente
// subsección de esa raíz.

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ConsultaSiguienteCodigoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La categoría padre debe ser un número entero' })
  @Min(1, { message: 'La categoría padre debe ser mayor que cero' })
  idCategoriaPadre?: number;
}
