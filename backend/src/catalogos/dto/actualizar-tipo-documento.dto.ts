// src/catalogos/dto/actualizar-tipo-documento.dto.ts
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  LONGITUD_MAXIMA_DESCRIPCION,
  MENSAJE_SIN_ESPACIOS_EXTREMOS,
  REGEX_SIN_ESPACIOS_EXTREMOS,
} from './reglas-catalogo';

export class ActualizarTipoDocumentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(REGEX_SIN_ESPACIOS_EXTREMOS, { message: MENSAJE_SIN_ESPACIOS_EXTREMOS })
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_DESCRIPCION, {
    message: 'La descripción no puede superar los 255 caracteres',
  })
  descripcion?: string;
}
