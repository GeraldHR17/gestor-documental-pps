// src/types/reporte.types.ts

export interface ResumenReportesDto {
  /** Total histórico: los documentos nunca se borran físicamente. */
  documentosRegistrados: number;
  documentosEsteMes: number;
  publicados: number;
  porcentajePublicados: number;
  pendientes: number;
  pendientesMasDe15Dias: number;
  operacionesBitacora90Dias: number;
}

/** Fila de los desgloses por categoría ITSP y por dependencia. */
export interface ConteoPorGrupoDto {
  /** `null` en el grupo "Sin dependencia asignada". */
  id: number | null;
  nombre: string;
  cantidad: number;
}
