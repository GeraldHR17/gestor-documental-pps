// src/autenticacion/dto/perfil-usuario-respuesta.dto.ts
//
// DTO de salida (RF-09). Es la unica "forma" del usuario que el
// frontend recibe: nunca se expone contrasenaHash ni otras columnas
// internas (intentosFallidos, bloqueadoHasta, etc.).

export class PerfilUsuarioRespuestaDto {
  idUsuario: number;
  nombreCompleto: string;
  correo: string;
  rol: string;
  permisos: string[];
  /** Para precargar la dependencia al registrar documentos (sección A). */
  idDependencia: number | null;
  nombreDependencia: string | null;

  constructor(datos: PerfilUsuarioRespuestaDto) {
    Object.assign(this, datos);
  }
}