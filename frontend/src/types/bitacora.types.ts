// src/types/bitacora.types.ts

export interface EntradaBitacoraDto {
  /** BIGINT en la base: viaja como texto. */
  id: string;
  accion: string;
  entidad: string;
  idRegistro: string | null;
  fechaHora: string;
  resultado: string | null;
  ipOrigen: string | null;
  detalles: Record<string, unknown> | null;
  idUsuario: number | null;
  /** Quien ejecutó la acción; `null` si la cuenta ya no existe. */
  nombreUsuario: string | null;
}

export interface FiltrosBitacoraDto {
  entidad?: string;
  idRegistro?: number;
  idUsuario?: number;
  accion?: string;
  pagina?: number;
  limite?: number;
}

export interface ListaPaginadaBitacora {
  datos: EntradaBitacoraDto[];
  total: number;
  pagina: number;
  limite: number;
}
