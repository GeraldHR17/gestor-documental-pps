// src/bitacora/dto/entrada-bitacora-respuesta.dto.ts

export class EntradaBitacoraRespuestaDto {
  /** BIGINT en la base: viaja como string para no perder precisión. */
  id: string;
  accion: string;
  entidad: string;
  idRegistro: string | null;
  fechaHora: Date;
  resultado: string | null;
  ipOrigen: string | null;
  detalles: Record<string, unknown> | null;
  /** Quien ejecutó la acción; `null` si la cuenta ya no existe o fue anónima. */
  idUsuario: number | null;
  nombreUsuario: string | null;

  constructor(datos: EntradaBitacoraRespuestaDto) {
    Object.assign(this, datos);
  }
}

export class ListaPaginadaBitacoraRespuestaDto {
  datos: EntradaBitacoraRespuestaDto[];
  total: number;
  pagina: number;
  limite: number;

  constructor(datos: ListaPaginadaBitacoraRespuestaDto) {
    Object.assign(this, datos);
  }
}
