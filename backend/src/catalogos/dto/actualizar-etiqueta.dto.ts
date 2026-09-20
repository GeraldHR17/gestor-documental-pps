// src/catalogos/dto/actualizar-etiqueta.dto.ts
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MENSAJE_SIN_ESPACIOS_EXTREMOS, REGEX_SIN_ESPACIOS_EXTREMOS } from './reglas-catalogo';

export class ActualizarEtiquetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(REGEX_SIN_ESPACIOS_EXTREMOS, { message: MENSAJE_SIN_ESPACIOS_EXTREMOS })
  nombre?: string;
}
