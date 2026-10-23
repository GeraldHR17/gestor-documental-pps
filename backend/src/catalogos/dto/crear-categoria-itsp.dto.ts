// src/catalogos/dto/crear-categoria-itsp.dto.ts
//
// `nivel` NO se recibe: lo deriva el servicio de si viene o no un padre
// (sin padre = raíz nivel 1, con padre = subsección nivel 2). Dejarlo en
// manos del cliente permitiría guardar una subsección marcada como raíz.
//
// `codigo` tampoco: lo asigna el servicio (spec-ajustes-posdespliegue
// §7). Si un cliente viejo lo sigue enviando, el ValidationPipe global
// (whitelist: true) lo descarta antes de llegar aquí (D-5).
import { IsInt, IsOptional, IsString, Matches, Min, MaxLength } from 'class-validator';
import {
  LONGITUD_MAXIMA_DESCRIPCION,
  MENSAJE_SIN_ESPACIOS_EXTREMOS,
  REGEX_SIN_ESPACIOS_EXTREMOS,
} from './reglas-catalogo';

export class CrearCategoriaItspDto {
  @IsString()
  @MaxLength(200, { message: 'El nombre no puede superar los 200 caracteres' })
  @Matches(REGEX_SIN_ESPACIOS_EXTREMOS, { message: MENSAJE_SIN_ESPACIOS_EXTREMOS })
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_DESCRIPCION, {
    message: 'La descripción no puede superar los 255 caracteres',
  })
  descripcion?: string;

  /** Ausente o `null` = categoría raíz. */
  @IsOptional()
  @IsInt()
  @Min(1)
  idCategoriaPadre?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}
