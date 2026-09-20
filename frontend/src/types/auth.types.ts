// src/types/auth.types.ts

export interface CredencialesLoginDto {
  correo: string;
  contrasena: string;
}

export interface RegistroCiudadanoDto {
  nombreCompleto: string;
  identificacion: string;
  correo: string;
  contrasena: string;
}

export interface ConfirmarVerificacionCorreoDto {
  token: string;
}

export interface ReenviarVerificacionCorreoDto {
  correo: string;
}

export interface SolicitarRecuperacionDto {
  correo: string;
}

export interface ConfirmarRecuperacionDto {
  token: string;
  nuevaContrasena: string;
}

export interface PerfilUsuario {
  idUsuario: number;
  nombreCompleto: string;
  correo: string;
  rol: string;
  permisos: string[];
  /** Para precargar la dependencia al registrar documentos. */
  idDependencia: number | null;
  nombreDependencia: string | null;
}

export interface RespuestaLogin {
  accessToken: string;
  usuario: PerfilUsuario;
}

export interface RespuestaRefresh {
  accessToken: string;
}

export interface RespuestaMensaje {
  mensaje: string;
}