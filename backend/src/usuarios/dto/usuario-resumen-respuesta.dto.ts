// src/usuarios/dto/usuario-resumen-respuesta.dto.ts

export class UsuarioResumenRespuestaDto {
  idUsuario: number;
  nombreCompleto: string;
  identificacion: string;
  correo: string;
  nombreRol: string;
  idRol: number;
  idDependencia: number | null;
  nombreDependencia: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
  /**
   * Documentos con `id_usuario_creador` = este usuario. Sólo lo llena el
   * detalle (`GET /usuarios/:id`): en el listado queda `undefined` para
   * no lanzar un COUNT por fila.
   */
  cantidadDocumentosRegistrados?: number;

  constructor(datos: UsuarioResumenRespuestaDto) {
    Object.assign(this, datos);
  }
}