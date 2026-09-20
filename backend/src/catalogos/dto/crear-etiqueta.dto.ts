// src/catalogos/dto/crear-etiqueta.dto.ts
//
// Sin `descripcion`: la tabla `etiquetas` sólo tiene nombre y estado
// (ver 01-esquema.sql). Con `whitelist: true` en el ValidationPipe global,
// un `descripcion` enviado por error se descarta en vez de llegar al ORM.
import { IsString, Matches, MaxLength } from 'class-validator';
import { MENSAJE_SIN_ESPACIOS_EXTREMOS, REGEX_SIN_ESPACIOS_EXTREMOS } from './reglas-catalogo';

export class CrearEtiquetaDto {
  @IsString()
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(REGEX_SIN_ESPACIOS_EXTREMOS, { message: MENSAJE_SIN_ESPACIOS_EXTREMOS })
  nombre: string;
}
