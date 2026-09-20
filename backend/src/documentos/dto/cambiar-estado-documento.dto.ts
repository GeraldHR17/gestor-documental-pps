// src/documentos/dto/cambiar-estado-documento.dto.ts
//
// El cambio de estado no se hace con un `estado` libre en el cuerpo sino
// con tres endpoints distintos (publicar / despublicar / inactivar), cada
// uno con su permiso. Este DTO sólo transporta el motivo opcional que se
// guarda en los detalles de la bitácora.

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CambiarEstadoDocumentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'El motivo no puede superar los 255 caracteres' })
  motivo?: string;
}
