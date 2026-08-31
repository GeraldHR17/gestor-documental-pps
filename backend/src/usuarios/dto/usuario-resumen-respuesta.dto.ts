// src/usuarios/dto/usuario-resumen-respuesta.dto.ts

export class UsuarioResumenRespuestaDto {
  idUsuario: number;
  nombreCompleto: string;
  correo: string;
  nombreRol: string;
  idRol: number;
  estado: 'ACTIVO' | 'INACTIVO';

  constructor(datos: UsuarioResumenRespuestaDto) {
    Object.assign(this, datos);
  }
}