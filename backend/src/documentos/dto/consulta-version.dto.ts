// src/documentos/dto/consulta-version.dto.ts
//
// `?version=` de los endpoints de visualización y descarga. Omitirlo pide
// la versión vigente; indicarlo pide una del historial, que sigue siendo
// consultable (VP-05).

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ConsultaVersionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El número de versión debe ser un entero' })
  @Min(1, { message: 'El número de versión debe ser mayor que cero' })
  version?: number;
}
