// src/documentos/dto/registrar-documento.dto.ts
//
// Llega como `multipart/form-data`: los metadatos van en campos de texto y
// el PDF en el campo `archivo`, que no aparece en este DTO porque lo
// resuelve el interceptor de carga (ver documentos.controller.ts). De ahí
// los `@Type(() => Number)` y el transform booleano: en multipart no hay
// números ni booleanos, sólo texto.

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  ANIO_MAXIMO,
  ANIO_MINIMO,
  LONGITUD_MAXIMA_DESCRIPCION,
  LONGITUD_MAXIMA_TITULO,
  MENSAJE_SIN_ESPACIOS_EXTREMOS,
  REGEX_SIN_ESPACIOS_EXTREMOS,
  aBooleano,
  aEnteroOpcional,
  aListaDeEnteros,
} from './reglas-documento';

export class RegistrarDocumentoDto {
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_TITULO, {
    message: `El título no puede superar los ${LONGITUD_MAXIMA_TITULO} caracteres`,
  })
  @Matches(REGEX_SIN_ESPACIOS_EXTREMOS, { message: MENSAJE_SIN_ESPACIOS_EXTREMOS })
  titulo: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_DESCRIPCION, {
    message: `La descripción no puede superar los ${LONGITUD_MAXIMA_DESCRIPCION} caracteres`,
  })
  descripcion?: string;

  @Type(() => Number)
  @IsInt({ message: 'El año debe ser un número entero' })
  @Min(ANIO_MINIMO, { message: `El año no puede ser anterior a ${ANIO_MINIMO}` })
  @Max(ANIO_MAXIMO, { message: `El año no puede ser posterior a ${ANIO_MAXIMO}` })
  anio: number;

  @Type(() => Number)
  @IsInt({ message: 'Debe seleccionar una categoría ITSP' })
  @Min(1, { message: 'Debe seleccionar una categoría ITSP' })
  idCategoriaItsp: number;

  @Type(() => Number)
  @IsInt({ message: 'Debe seleccionar un tipo documental' })
  @Min(1, { message: 'Debe seleccionar un tipo documental' })
  idTipoDocumento: number;

  /**
   * Una sola dependencia (decisión del PO). Si se omite, el servicio la
   * precarga con la del usuario autenticado; si se envía, se respeta, lo
   * que permite registrar en nombre de otra dependencia.
   */
  @IsOptional()
  @aEnteroOpcional
  @IsInt({ message: 'Dependencia no válida' })
  @Min(1, { message: 'Dependencia no válida' })
  idDependencia?: number;

  // Opcionales por decisión de la Sección 0 (VP-03): no bloquean el
  // registro ni la publicación.
  @IsOptional()
  @aListaDeEnteros
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true, message: 'Etiqueta no válida' })
  etiquetas?: number[];

  /**
   * "Confirmar y publicar" del asistente de registro: crea el documento y
   * lo publica en la misma operación (CU-011 seguido de CU-014). Exige,
   * además de `documentos.crear`, el permiso `documentos.publicar`.
   */
  @IsOptional()
  @aBooleano
  @IsBoolean()
  publicarInmediatamente?: boolean;
}
