// src/roles/dto/rol-respuesta.dto.ts
export class RolRespuestaDto {
  idRol: number;
  nombre: string;
  descripcion: string | null;

  constructor(datos: RolRespuestaDto) {
    Object.assign(this, datos);
  }
}