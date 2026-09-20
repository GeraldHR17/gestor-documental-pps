// src/bitacora/dto/filtros-bitacora.dto.ts
//
// Consulta de la bitácora (MF-07). `entidad` + `idRegistro` es el par que
// usa el panel "Cambios recientes" del formulario de usuario para traer
// sólo las entradas que afectan a esa cuenta; `idUsuario` filtra por quien
// ejecutó la acción.

import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class FiltrosBitacoraDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entidad?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idRegistro?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUsuario?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accion?: string;

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
