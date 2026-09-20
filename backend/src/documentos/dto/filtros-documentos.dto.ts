// src/documentos/dto/filtros-documentos.dto.ts
//
// A diferencia de los catálogos, el listado de documentos sí se pagina: es
// la tabla que crece sin techo. Todo llega por query string, así que cada
// campo numérico necesita su @Type(() => Number).

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { ANIO_MAXIMO, ANIO_MINIMO } from './reglas-documento';

export const ESTADOS_DOCUMENTO = ['BORRADOR', 'PUBLICADO', 'INACTIVO'] as const;
export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];

export class FiltrosDocumentosDto {
  /** Búsqueda libre sobre título y descripción. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  texto?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCategoriaItsp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idTipoDocumento?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idDependencia?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEtiqueta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(ANIO_MINIMO)
  @Max(ANIO_MAXIMO)
  anio?: number;

  @IsOptional()
  @IsIn(ESTADOS_DOCUMENTO, { message: 'Estado no válido' })
  estado?: EstadoDocumento;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}
