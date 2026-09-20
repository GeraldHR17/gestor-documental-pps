// src/catalogos/dto/actualizar-categoria-itsp.dto.ts
import { IsInt, IsOptional, IsString, Matches, Min, MaxLength } from 'class-validator';
import {
  LONGITUD_MAXIMA_DESCRIPCION,
  MENSAJE_SIN_ESPACIOS_EXTREMOS,
  REGEX_SIN_ESPACIOS_EXTREMOS,
} from './reglas-catalogo';

export class ActualizarCategoriaItspDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'El nombre no puede superar los 200 caracteres' })
  @Matches(REGEX_SIN_ESPACIOS_EXTREMOS, { message: MENSAJE_SIN_ESPACIOS_EXTREMOS })
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'El código no puede superar los 50 caracteres' })
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_DESCRIPCION, {
    message: 'La descripción no puede superar los 255 caracteres',
  })
  descripcion?: string;

  /**
   * `null` explícito convierte la subsección en categoría raíz; omitirlo
   * deja el padre como estaba. Por eso el campo admite el nulo en vez de
   * tratarse como "no enviado".
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCategoriaPadre?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}
