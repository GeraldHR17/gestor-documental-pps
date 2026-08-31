// src/roles/dto/permiso-respuesta.dto.ts
export class PermisoRespuestaDto {
  idPermiso: number;
  nombre: string;
  descripcion: string | null;

  constructor(datos: PermisoRespuestaDto) {
    Object.assign(this, datos);
  }
}