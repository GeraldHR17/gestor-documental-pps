// src/types/rol.types.ts

export interface RolDto {
  idRol: number;
  nombre: string;
  descripcion: string | null;
}

export interface PermisoDto {
  idPermiso: number;
  nombre: string; // ej. 'documentos.crear'
  descripcion: string | null;
}

export interface PermisoDeRolDto extends PermisoDto {
  asignado: boolean;
}

export interface PermisosPorRolDto {
  idRol: number;
  permisos: PermisoDeRolDto[];
}