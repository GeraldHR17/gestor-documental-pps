// src/catalogos/dto/actualizar-categoria-itsp.dto.ts
//
// Sin `codigo`: es inmutable salvo al mover una subsección a otra raíz, y
// entonces lo recalcula el servicio (spec-ajustes-posdespliegue RN-1).
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
  @MaxLength(LONGITUD_MAXIMA_DESCRIPCION, {
    message: 'La descripción no puede superar los 255 caracteres',
  })
  descripcion?: string;

  /**
   * Sólo sirve para mover una subsección a otra raíz; omitirlo deja el
   * padre como estaba. Se admite el nulo para poder rechazarlo con un
   * mensaje claro: una subsección no puede pasar a raíz, ni una raíz a
   * subsección (C-2).
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
