// src/types/usuario.types.ts

export type EstadoUsuario = 'ACTIVO' | 'INACTIVO';

export interface UsuarioResumenDto {
  idUsuario: number;
  nombreCompleto: string;
  identificacion: string;
  correo: string;
  nombreRol: string;
  idRol: number;
  idDependencia: number | null;
  nombreDependencia: string | null;
  estado: EstadoUsuario;
  /** Sólo lo trae el detalle (`GET /usuarios/:id`), no el listado. */
  cantidadDocumentosRegistrados?: number;
}

export interface CrearUsuarioDto {
  nombreCompleto: string;
  identificacion: string;
  correo: string;
  contrasenaTemporal: string;
  idRol: number;
  idDependencia?: number;
}

// El rol se cambia aparte, vía `asignarRol` (PATCH /usuarios/:id/rol): ese
// endpoint aplica las reglas de no auto-modificarse y de que solo un
// Superadministrador pueda asignar el rol Superadministrador.
export interface ActualizarUsuarioDto {
  nombreCompleto?: string;
  identificacion?: string;
  correo?: string;
  /** Omitido = no tocar; `null` = quitar la dependencia. */
  idDependencia?: number | null;
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