// src/usuarios/dto/lista-paginada-usuarios-respuesta.dto.ts
import { UsuarioResumenRespuestaDto } from './usuario-resumen-respuesta.dto';

export class ListaPaginadaUsuariosRespuestaDto {
  datos: UsuarioResumenRespuestaDto[];
  total: number;
  pagina: number;
  limite: number;

  constructor(datos: ListaPaginadaUsuariosRespuestaDto) {
    Object.assign(this, datos);
  }
}