// src/usuarios/dto/filtros-usuarios.dto.ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class FiltrosUsuariosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limite?: number = 10;

  // Busca de forma combinada en nombre, correo y nombre de rol (ver
  // UsuariosService.listar), replicando el buscador unico del mockup.
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idRol?: number;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';
}