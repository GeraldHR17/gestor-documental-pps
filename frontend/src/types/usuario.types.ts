// src/types/usuario.types.ts

export type EstadoUsuario = 'ACTIVO' | 'INACTIVO';

export interface UsuarioResumenDto {
  idUsuario: number;
  nombreCompleto: string;
  correo: string;
  nombreRol: string;
  idRol: number;
  estado: EstadoUsuario;
}

export interface CrearUsuarioDto {
  nombreCompleto: string;
  identificacion: string;
  correo: string;
  contrasenaTemporal: string;
  idRol: number;
}

export interface ActualizarUsuarioDto {
  nombreCompleto?: string;
  correo?: string;
  idRol?: number;
}

export interface FiltrosUsuariosDto {
  pagina: number;
  limite: number;
  nombre?: string;
  idRol?: number;
  estado?: EstadoUsuario;
}

export interface ListaPaginadaUsuariosDto {
  datos: UsuarioResumenDto[];
  total: number;
  pagina: number;
  limite: number;
}