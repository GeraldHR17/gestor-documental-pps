// src/documentos/dto/crear-version.dto.ts
//
// Multipart, como el registro: el PDF va en el campo `archivo` y lo
// resuelve el interceptor. `numero_version` NO se recibe — lo asigna el
// servidor de forma secuencial (VP-05), porque dejar que lo elija el
// cliente permitiría saltos, repeticiones y sobrescrituras del historial.

import { IsOptional, IsString, MaxLength } from 'class-validator';

import { LONGITUD_MAXIMA_COMENTARIO_VERSION } from './reglas-documento';

export class CrearVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_COMENTARIO_VERSION, {
    message: `El comentario no puede superar los ${LONGITUD_MAXIMA_COMENTARIO_VERSION} caracteres`,
  })
  comentarioVersion?: string;
}
