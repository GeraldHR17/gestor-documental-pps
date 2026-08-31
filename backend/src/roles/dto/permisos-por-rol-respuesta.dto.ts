// src/roles/dto/permisos-por-rol-respuesta.dto.ts

interface PermisoDeRol {
  idPermiso: number;
  nombre: string;
  descripcion: string | null;
  asignado: boolean;
}

export class PermisosPorRolRespuestaDto {
  idRol: number;
  permisos: PermisoDeRol[];

  constructor(datos: PermisosPorRolRespuestaDto) {
    Object.assign(this, datos);
  }
}