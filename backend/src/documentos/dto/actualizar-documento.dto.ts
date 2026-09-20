// src/documentos/dto/actualizar-documento.dto.ts
//
// Edición de metadatos (RF-021). No incluye archivo: cambiar el PDF es
// crear una versión nueva (RF-022), nunca sobrescribir la existente, y por
// eso viaja como JSON y no como multipart.
//
// `etiquetas` se interpreta como reemplazo completo del conjunto: omitir
// el campo deja las asociaciones como estaban, enviarlo vacío las borra.
// `idDependencia` distingue igualmente omitir (no tocar) de `null` (quitar).

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  ANIO_MAXIMO,
  ANIO_MINIMO,
  LONGITUD_MAXIMA_DESCRIPCION,
  LONGITUD_MAXIMA_TITULO,
  MENSAJE_SIN_ESPACIOS_EXTREMOS,
  REGEX_SIN_ESPACIOS_EXTREMOS,
} from './reglas-documento';

export class ActualizarDocumentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_TITULO, {
    message: `El título no puede superar los ${LONGITUD_MAXIMA_TITULO} caracteres`,
  })
  @Matches(REGEX_SIN_ESPACIOS_EXTREMOS, { message: MENSAJE_SIN_ESPACIOS_EXTREMOS })
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_DESCRIPCION, {
    message: `La descripción no puede superar los ${LONGITUD_MAXIMA_DESCRIPCION} caracteres`,
  })
  descripcion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El año debe ser un número entero' })
  @Min(ANIO_MINIMO, { message: `El año no puede ser anterior a ${ANIO_MINIMO}` })
  @Max(ANIO_MAXIMO, { message: `El año no puede ser posterior a ${ANIO_MAXIMO}` })
  anio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe seleccionar una categoría ITSP' })
  @Min(1, { message: 'Debe seleccionar una categoría ITSP' })
  idCategoriaItsp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe seleccionar un tipo documental' })
  @Min(1, { message: 'Debe seleccionar un tipo documental' })
  idTipoDocumento?: number;

  // `null` explícito quita la dependencia; por eso no lleva @IsOptional
  // (que también aceptaría null pero sin distinguirlo de undefined en la
  // validación) sino @ValidateIf, que sólo valida cuando hay un número.
  @ValidateIf((_, valor) => valor !== null && valor !== undefined)
  @IsInt({ message: 'Dependencia no válida' })
  @Min(1, { message: 'Dependencia no válida' })
  idDependencia?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true, message: 'Etiqueta no válida' })
  etiquetas?: number[];
}
